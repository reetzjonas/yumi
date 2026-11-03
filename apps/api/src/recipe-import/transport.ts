import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { RecipeImportError } from "./errors";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const BLOCKED_V4: [number, number][] = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0586300, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 3],
];

/** Accept global unicast only; transition addresses can hide private IPv4. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const number = address
      .split(".")
      .reduce((value, octet) => (value * 256 + Number(octet)) >>> 0, 0);
    return !BLOCKED_V4.some(
      ([network, bits]) => number >>> (32 - bits) === network >>> (32 - bits),
    );
  }
  if (family !== 6 || address.includes("%") || address.includes("."))
    return false;
  const halves = address.toLowerCase().split("::");
  const left = halves[0]?.split(":").filter(Boolean) ?? [];
  const right = halves[1]?.split(":").filter(Boolean) ?? [];
  const groups =
    halves.length === 2
      ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
      : left;
  const first = Number.parseInt(groups[0] ?? "0", 16);
  const second = Number.parseInt(groups[1] ?? "0", 16);
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    !(first === 0x2001 && second <= 0x01ff) &&
    !(first === 0x2001 && second === 0x0db8) &&
    first !== 0x2002 &&
    !(first === 0x3fff && second <= 0x0fff)
  );
}

export function validateImportUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new RecipeImportError("invalid_url");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.href.length > 2000 ||
    (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))
  ) {
    throw new RecipeImportError("invalid_url");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) {
    throw new RecipeImportError("blocked_url");
  }
  url.hash = "";
  return url;
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

export interface TransportResponse {
  status: number;
  headers: Headers;
  body: Readable;
}

/** The transport boundary also permits offline tests without bypassing policy. */
export interface RecipeHttpTransport {
  resolve(hostname: string): Promise<ResolvedAddress[]>;
  request(
    url: URL,
    address: ResolvedAddress,
    signal: AbortSignal,
    accept: string,
  ): Promise<TransportResponse>;
}

function responseHeaders(response: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (value !== undefined) {
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }
  return headers;
}

export const nodeTransport: RecipeHttpTransport = {
  resolve: (hostname) => lookup(hostname, { all: true, verbatim: true }),
  request: (url, address, signal, accept) =>
    new Promise((resolve, reject) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        url,
        {
          agent: false,
          signal,
          maxHeaderSize: 16_384,
          headers: {
            "user-agent": "YumiRecipeImport/1.0",
            accept,
            "accept-encoding": "gzip, deflate, br",
          },
          // Keep the original URL for Host/SNI/certificate checks, but never
          // resolve again when connecting. No pooled or proxy connection.
          lookup: (_hostname, options, callback) => {
            if (options.all) callback(null, [address]);
            else callback(null, address.address, address.family);
          },
        },
        (response) =>
          resolve({
            status: response.statusCode ?? 0,
            headers: responseHeaders(response),
            body: response,
          }),
      );
      request.on("error", reject);
      request.end();
    }),
};

async function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(new RecipeImportError("timeout"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

async function readBody(
  response: TransportResponse,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const length = response.headers.get("content-length");
  if (length && Number(length) > maxBytes) {
    response.body.destroy();
    throw new RecipeImportError("response_too_large");
  }
  const encoding = response.headers.get("content-encoding")?.toLowerCase();
  const decoder =
    encoding === "gzip"
      ? createGunzip()
      : encoding === "br"
        ? createBrotliDecompress()
        : encoding === "deflate"
          ? createInflate()
          : null;
  if (encoding && encoding !== "identity" && !decoder) {
    response.body.destroy();
    throw new RecipeImportError("unsupported_content");
  }
  const stream = decoder ? response.body.pipe(decoder) : response.body;
  const abort = () => {
    response.body.destroy(new RecipeImportError("timeout"));
    if (decoder) decoder.destroy(new RecipeImportError("timeout"));
  };
  let wireBytes = 0;
  const countWire = (chunk: Buffer) => {
    wireBytes += chunk.length;
    if (wireBytes > maxBytes) {
      const error = new RecipeImportError("response_too_large");
      response.body.destroy(error);
      if (decoder) decoder.destroy(error);
    }
  };
  const forwardError = (error: Error) => decoder?.destroy(error);
  response.body.on("data", countWire);
  response.body.on("error", forwardError);
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > maxBytes) throw new RecipeImportError("response_too_large");
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, size);
  } finally {
    signal.removeEventListener("abort", abort);
    response.body.destroy();
    if (decoder) decoder.destroy();
  }
}

export interface ResourceOptions {
  maxBytes: number;
  accept: string;
  timeoutMs?: number;
}

/** One deadline covers DNS, all redirects and the bounded decoded body. */
export async function fetchResource(
  input: string | URL,
  options: ResourceOptions,
  transport: RecipeHttpTransport = nodeTransport,
): Promise<{ bytes: Uint8Array; sourceUrl: string; headers: Headers }> {
  let url = validateImportUrl(input);
  const signal = AbortSignal.timeout(options.timeoutMs ?? 10_000);
  try {
    for (let redirects = 0; ; redirects++) {
      signal.throwIfAborted();
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(host)
        ? [{ address: host, family: isIP(host) }]
        : await abortable(transport.resolve(host), signal);
      const address = addresses[0];
      if (
        !address ||
        addresses.some(
          (candidate) =>
            !isPublicAddress(candidate.address) ||
            candidate.family !== isIP(candidate.address),
        )
      ) {
        throw new RecipeImportError("blocked_url");
      }
      const response = await abortable(
        transport.request(url, address, signal, options.accept),
        signal,
      );
      if (REDIRECTS.has(response.status)) {
        response.body.destroy();
        if (redirects >= 4) throw new RecipeImportError("redirect_limit");
        const location = response.headers.get("location");
        if (!location) throw new RecipeImportError("fetch_failed");
        url = validateImportUrl(new URL(location, url));
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        response.body.destroy();
        throw new RecipeImportError("fetch_failed");
      }
      return {
        bytes: await readBody(response, options.maxBytes, signal),
        sourceUrl: url.href,
        headers: response.headers,
      };
    }
  } catch (error) {
    if (error instanceof RecipeImportError) throw error;
    throw new RecipeImportError(signal.aborted ? "timeout" : "fetch_failed");
  }
}
