import { afterEach, expect, test } from "bun:test";
import { z } from "zod";
import { type PushMessage, pushDelivery } from "./push";
import { type Client, createHousehold, signUp } from "./test/client";

const realSend = pushDelivery.send;
afterEach(() => {
  pushDelivery.send = realSend;
});

const subscribe = (c: Client, device: string, locale = "de") =>
  c.request("/api/push/subscription", {
    method: "PUT",
    body: JSON.stringify({
      endpoint: `https://push.example/${device}`,
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
      locale,
    }),
  });

async function sharedHousehold(tag: string) {
  const owner = await signUp(`owner-${tag}`);
  await createHousehold(owner, "Push home");
  const invite = z.object({ token: z.string() }).parse(
    await (
      await owner.request("/api/household/invites", {
        method: "POST",
        body: "{}",
      })
    ).json(),
  );
  const guest = await signUp(`guest-${tag}`);
  expect(
    (
      await guest.request(`/api/invites/${invite.token}/accept`, {
        method: "POST",
      })
    ).status,
  ).toBe(200);
  const listId = z.object({ id: z.uuid() }).parse(
    await (
      await owner.request("/api/shopping/lists", {
        method: "POST",
        body: JSON.stringify({ name: "Weekly" }),
      })
    ).json(),
  ).id;
  return { owner, guest, listId };
}

const announce = (c: Client, listId: string) =>
  c.request("/api/push/shopping-trip", {
    method: "POST",
    body: JSON.stringify({ listId }),
  });

test("push is reported as off without VAPID keys", async () => {
  const c = await signUp("push-config");
  expect(await (await c.request("/api/push/config")).json()).toEqual({
    publicKey: null,
  });
});

test("a shopping trip notifies the other members' devices in their language", async () => {
  const { owner, guest, listId } = await sharedHousehold("trip");
  const device = crypto.randomUUID();
  expect((await subscribe(guest, `${device}-phone`, "en")).status).toBe(204);
  expect((await subscribe(guest, `${device}-tablet`)).status).toBe(204);
  expect((await subscribe(owner, `${device}-own`)).status).toBe(204);
  const sent: { endpoint: string; message: PushMessage }[] = [];
  pushDelivery.send = async (target, message) => {
    sent.push({ endpoint: target.endpoint, message });
    return "sent";
  };

  const response = await announce(owner, listId);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ sent: 2 });
  expect(sent.map((entry) => entry.endpoint).sort()).toEqual([
    `https://push.example/${device}-phone`,
    `https://push.example/${device}-tablet`,
  ]);
  expect(
    sent.find((entry) => entry.endpoint.endsWith("-phone"))?.message,
  ).toEqual({
    title: "owner-trip is going shopping",
    body: 'Anything missing on "Weekly"?',
    url: "/list?add=1",
  });
});

test("dead subscriptions are dropped and foreign lists stay hidden", async () => {
  const { owner, guest, listId } = await sharedHousehold("gone");
  const device = crypto.randomUUID();
  await subscribe(guest, device);
  let calls = 0;
  pushDelivery.send = async () => {
    calls += 1;
    return "gone";
  };
  expect(await (await announce(owner, listId)).json()).toEqual({ sent: 0 });
  expect(await (await announce(owner, listId)).json()).toEqual({ sent: 0 });
  expect(calls).toBe(1);

  const outsider = await signUp("push-outsider");
  await createHousehold(outsider, "Elsewhere");
  expect((await announce(outsider, listId)).status).toBe(404);
});

test("a device can unsubscribe", async () => {
  const { owner, guest, listId } = await sharedHousehold("unsub");
  const device = crypto.randomUUID();
  await subscribe(guest, device);
  expect(
    (
      await guest.request("/api/push/subscription", {
        method: "DELETE",
        body: JSON.stringify({ endpoint: `https://push.example/${device}` }),
      })
    ).status,
  ).toBe(204);
  let calls = 0;
  pushDelivery.send = async () => {
    calls += 1;
    return "sent";
  };
  await announce(owner, listId);
  expect(calls).toBe(0);
});
