import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Copy, Link2, Plus, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSwitchHousehold } from "@/components/account-menu";
import { BackLink, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureOk, errorMessage, translateAuthError } from "@/lib/api-error";
import { authClient } from "@/lib/auth-client";
import { formatDate } from "@/lib/i18n";
import { resetClientState, useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/more/household")({
  component: Household,
});

const inviteUrl = (token: string) =>
  `${window.location.origin}/invite/${token}`;

function Household() {
  const me = useMe();
  const queryClient = useQueryClient();
  const router = useRouter();
  const switchHousehold = useSwitchHousehold();
  const householdId = me?.activeHouseholdId ?? "";
  const role = me?.households.find((h) => h.id === householdId)?.role;
  const canManage = role === "owner" || role === "admin";

  const org = useQuery({
    queryKey: ["household", householdId],
    queryFn: async () => {
      const { data, error } = await authClient.organization.getFullOrganization(
        {
          query: { organizationId: householdId },
        },
      );
      if (error || !data) throw new Error(error?.code ?? "generic");
      return data;
    },
    enabled: Boolean(householdId),
  });

  const invites = useQuery({
    queryKey: ["household-invites", householdId],
    queryFn: async () =>
      (await ensureOk(await api.household.invites.$get())).json(),
    enabled: canManage,
  });

  const createInvite = useMutation({
    mutationFn: async () =>
      (await ensureOk(await api.household.invites.$post())).json(),
    onSuccess: async (invite) => {
      await queryClient.invalidateQueries({ queryKey: ["household-invites"] });
      await share(invite.token);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) =>
      ensureOk(await api.household.invites[":id"].$delete({ param: { id } })),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["household-invites"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function share(token: string) {
    const url = inviteUrl(token);
    if (navigator.share) {
      try {
        await navigator.share({
          title: "yumi",
          text: m["household.invite_share_text"](),
          url,
        });
        return;
      } catch {
        // dismissed share sheet: fall back to copying
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(m["household.invite_copied"]());
    } catch {
      // clipboard unavailable (no permission or insecure context): show the link to copy by hand
      toast(m["household.invite_link"](), {
        description: url,
        duration: 30_000,
      });
    }
  }

  async function removeMember(memberId: string) {
    const { error } = await authClient.organization.removeMember({
      memberIdOrEmail: memberId,
      organizationId: householdId,
    });
    if (error) toast.error(translateAuthError(error.code));
    await queryClient.invalidateQueries({
      queryKey: ["household", householdId],
    });
  }

  async function leave() {
    if (!window.confirm(m["household.leave_confirm"]())) return;
    const { error } = await authClient.organization.leave({
      organizationId: householdId,
    });
    if (error) {
      toast.error(translateAuthError(error.code));
      return;
    }
    const next = me?.households.find((h) => h.id !== householdId);
    if (next) {
      await switchHousehold(next.id);
      await router.navigate({ to: "/" });
    } else {
      await resetClientState(queryClient);
      await router.navigate({ to: "/onboarding" });
    }
  }

  return (
    <div className="settings-page">
      <PageHeader
        title={m["household.title"]()}
        back={<BackLink to="/more" label={m.nav_more()} />}
      />

      <section className="section">
        <h2>{m["household.members"]()}</h2>
        {org.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <ul className="row-list">
            {org.data?.members.map((member) => (
              <li key={member.id} className="row">
                <div className="row-main">
                  <span className="row-title">{member.user.name}</span>
                  <span className="row-detail">
                    {member.user.email} ·{" "}
                    {member.role === "owner"
                      ? m["household.role_owner"]()
                      : m["household.role_member"]()}
                  </span>
                </div>
                {canManage && member.userId !== me?.user.id && (
                  <Button
                    variant="ghost"
                    aria-label={m["household.remove_member"]({
                      name: member.user.name,
                    })}
                    onClick={() => void removeMember(member.id)}
                  >
                    <Trash2 aria-hidden="true" size={18} />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage && (
        <section className="section">
          <h2>{m["household.invites"]()}</h2>
          <p className="section-description">
            {m["household.invites_description"]()}
          </p>
          <ul className="row-list">
            {invites.data?.map((invite) => (
              <li key={invite.id} className="row">
                <Link2 aria-hidden="true" size={20} />
                <div className="row-main">
                  <span className="row-title">
                    {m["household.invite_link"]()}
                  </span>
                  <span className="row-detail">
                    {m["household.invite_expires"]({
                      date: formatDate(new Date(invite.expiresAt), {
                        dateStyle: "medium",
                      }),
                    })}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  aria-label={m["household.invite_copy"]()}
                  onClick={() => void share(invite.token)}
                >
                  {"share" in navigator ? (
                    <Share2 aria-hidden="true" size={18} />
                  ) : (
                    <Copy aria-hidden="true" size={18} />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  aria-label={m["household.invite_revoke"]()}
                  onClick={() => revokeInvite.mutate(invite.id)}
                >
                  <Trash2 aria-hidden="true" size={18} />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            onClick={() => createInvite.mutate()}
            disabled={createInvite.isPending}
          >
            <Plus aria-hidden="true" size={18} />
            {m["household.invite_create"]()}
          </Button>
        </section>
      )}

      {me && me.households.length > 1 && (
        <section className="section">
          <h2>{m["household.switch"]()}</h2>
          <ul className="row-list">
            {me.households
              .filter((h) => h.id !== householdId)
              .map((h) => (
                <li key={h.id} className="row">
                  <span className="row-main row-title">{h.name}</span>
                  <Button
                    variant="secondary"
                    onClick={() => void switchHousehold(h.id)}
                  >
                    {m["household.switch_to"]()}
                  </Button>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="section section-actions">
        <Button asChild variant="secondary">
          <Link to="/onboarding">{m["household.create_title"]()}</Link>
        </Button>
        <Button variant="ghost" onClick={() => void leave()}>
          {m["household.leave"]()}
        </Button>
      </section>
    </div>
  );
}
