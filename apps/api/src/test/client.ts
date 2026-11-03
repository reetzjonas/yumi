import { expect } from "bun:test";
import { app } from "../app";

const ORIGIN = "http://localhost:5173";

export type Client = {
  cookie: string;
  request: (path: string, init?: RequestInit) => Promise<Response>;
};

export function client(cookie = ""): Client {
  const c: Client = {
    cookie,
    request: async (path, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set("origin", ORIGIN);
      if (typeof init.body === "string")
        headers.set("content-type", "application/json");
      if (c.cookie) headers.set("cookie", c.cookie);
      const res = await app.request(path, { ...init, headers });
      const setCookies = res.headers.getSetCookie();
      if (setCookies.length > 0)
        c.cookie = setCookies.map((s) => s.split(";")[0]).join("; ");
      return res;
    },
  };
  return c;
}

export async function signUp(name: string) {
  const c = client();
  const res = await c.request("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({
      name,
      email: `${name}@example.com`,
      password: "correct-horse-battery",
    }),
  });
  expect(res.status).toBe(200);
  return c;
}

export async function createHousehold(c: Client, name: string) {
  const res = await c.request("/api/auth/organization/create", {
    method: "POST",
    body: JSON.stringify({
      name,
      slug: `${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`,
    }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: string }).id;
}

export async function householdMember(name: string) {
  const c = await signUp(name);
  await createHousehold(c, `${name} home`);
  return c;
}
