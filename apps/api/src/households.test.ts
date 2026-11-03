import { describe, expect, test } from "bun:test";
import { type Client, client, createHousehold, signUp } from "./test/client";

async function createInvite(c: Client, body: object = {}) {
  const res = await c.request("/api/household/invites", {
    method: "POST",
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; token: string };
}

describe("households and invites", () => {
  test("anonymous requests are rejected", async () => {
    const res = await client().request("/api/household/invites");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("a new user has no active household until one is created", async () => {
    const alice = await signUp("alice");
    expect((await alice.request("/api/household/invites")).status).toBe(409);
    await createHousehold(alice, "Alice Home");
    const res = await alice.request("/api/household/invites");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("invite link adds a member who then shares the household", async () => {
    const owner = await signUp("owner1");
    const householdId = await createHousehold(owner, "Shared");
    const invite = await createInvite(owner);

    const guest = await signUp("guest1");
    const preview = await guest.request(`/api/invites/${invite.token}`);
    expect(await preview.json()).toMatchObject({ householdName: "Shared" });

    const accept = await guest.request(`/api/invites/${invite.token}/accept`, {
      method: "POST",
    });
    expect(accept.status).toBe(200);
    expect(await accept.json()).toMatchObject({ householdId });

    const list = await guest.request("/api/household/invites");
    expect(list.status).toBe(200);
    expect(((await list.json()) as { id: string }[]).map((i) => i.id)).toEqual([
      invite.id,
    ]);

    // members cannot create invites
    const forbidden = await guest.request("/api/household/invites", {
      method: "POST",
      body: "{}",
    });
    expect(forbidden.status).toBe(403);
  });

  test("/api/me lists households and the active one", async () => {
    const u = await signUp("me-user");
    const before = (await (await u.request("/api/me")).json()) as {
      households: unknown[];
      activeHouseholdId: null;
    };
    expect(before.households).toEqual([]);
    expect(before.activeHouseholdId).toBeNull();
    const id = await createHousehold(u, "Mine");
    const after = await (await u.request("/api/me")).json();
    expect(after).toMatchObject({
      user: { name: "me-user", email: "me-user@example.com" },
      households: [{ id, name: "Mine", role: "owner" }],
      activeHouseholdId: id,
    });
  });

  test("a fresh session starts in the user's household", async () => {
    const owner = await signUp("owner2");
    await createHousehold(owner, "Remembered");
    const again = client();
    const res = await again.request("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({
        email: "owner2@example.com",
        password: "correct-horse-battery",
      }),
    });
    expect(res.status).toBe(200);
    expect((await again.request("/api/household/invites")).status).toBe(200);
  });

  test("households cannot see or revoke each other's invites", async () => {
    const a = await signUp("tenant-a");
    await createHousehold(a, "A");
    const inviteA = await createInvite(a);
    const b = await signUp("tenant-b");
    await createHousehold(b, "B");
    const inviteB = await createInvite(b);

    const listB = (await (
      await b.request("/api/household/invites")
    ).json()) as { id: string }[];
    expect(listB.map((i) => i.id)).toEqual([inviteB.id]);
    expect(
      (
        await b.request(`/api/household/invites/${inviteA.id}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await a.request(`/api/household/invites/${inviteA.id}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(204);
  });

  test("exhausted and revoked invites are rejected", async () => {
    const owner = await signUp("owner3");
    await createHousehold(owner, "Limited");
    const invite = await createInvite(owner, { maxUses: 1 });
    const first = await signUp("first3");
    expect(
      (
        await first.request(`/api/invites/${invite.token}/accept`, {
          method: "POST",
        })
      ).status,
    ).toBe(200);
    const second = await signUp("second3");
    const res = await second.request(`/api/invites/${invite.token}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "invite_invalid" });

    const revoked = await createInvite(owner);
    await owner.request(`/api/household/invites/${revoked.id}`, {
      method: "DELETE",
    });
    expect((await second.request(`/api/invites/${revoked.token}`)).status).toBe(
      404,
    );
  });
});
