import { expect, test } from "bun:test";
import { type Client, householdMember } from "./test/client";

/** Reads SSE frames until one with the wanted event name arrives. */
async function nextEvent(
  reader: { read(): Promise<{ value?: Uint8Array; done: boolean }> },
  name: string,
  buffer: { text: string },
) {
  const decoder = new TextDecoder();
  for (;;) {
    const frames = buffer.text.split("\n\n");
    buffer.text = frames.pop() ?? "";
    for (const [i, frame] of frames.entries()) {
      if (frame.includes(`event: ${name}`)) {
        buffer.text = [...frames.slice(i + 1), buffer.text].join("\n\n");
        return frame;
      }
    }
    const { value, done } = await reader.read();
    if (done) throw new Error("stream ended");
    buffer.text += decoder.decode(value, { stream: true });
  }
}

async function newList(c: Client) {
  return (
    (await (
      await c.request("/api/shopping/lists", {
        method: "POST",
        body: JSON.stringify({ name: "Shared" }),
      })
    ).json()) as { id: string }
  ).id;
}

test("household members get a list event when another member changes a list", async () => {
  const c = await householdMember("stream-member");
  const outsider = await householdMember("stream-outsider");
  const listId = await newList(c);
  const controller = new AbortController();
  const outsiderController = new AbortController();
  const res = await c.request("/api/shopping/stream", {
    signal: controller.signal,
  });
  const outsiderRes = await outsider.request("/api/shopping/stream", {
    signal: outsiderController.signal,
  });
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const reader = res.body?.getReader();
  const outsiderReader = outsiderRes.body?.getReader();
  if (!reader || !outsiderReader) throw new Error("no stream body");
  const buffer = { text: "" };
  const outsiderBuffer = { text: "" };
  await nextEvent(reader, "ready", buffer);
  await nextEvent(outsiderReader, "ready", outsiderBuffer);

  const outsiderList = await newList(outsider);
  await outsider.request(`/api/shopping/lists/${outsiderList}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Theirs" }),
  });
  await c.request(`/api/shopping/lists/${listId}/events`, {
    method: "POST",
    body: JSON.stringify({
      events: [
        {
          id: crypto.randomUUID(),
          itemId: crypto.randomUUID(),
          clientTs: new Date().toISOString(),
          type: "item_added",
          payload: { label: "Milk" },
        },
      ],
    }),
  });
  // the outsider's own rename arrives first on their stream; ours must not leak there
  expect(await nextEvent(outsiderReader, "list", outsiderBuffer)).toContain(
    outsiderList,
  );
  expect(await nextEvent(reader, "list", buffer)).toContain(listId);
  expect(buffer.text).not.toContain(outsiderList);
  controller.abort();
  outsiderController.abort();
});
