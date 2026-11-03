import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { ChevronRight, LogOut, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { translateAuthError } from "@/lib/api-error";
import { authClient } from "@/lib/auth-client";
import { type Me, resetClientState } from "@/lib/session";
import { m } from "@/paraglide/messages";

export function useSwitchHousehold() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return async (organizationId: string) => {
    const { error } = await authClient.organization.setActive({
      organizationId,
    });
    if (error) {
      toast.error(translateAuthError(error.code));
      return;
    }
    await resetClientState(queryClient);
    await router.invalidate();
  };
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return async () => {
    await authClient.signOut();
    await resetClientState(queryClient);
    await router.navigate({ to: "/login" });
  };
}

/** Sidebar slot (tablet/desktop): active household switcher and account. */
export function AccountSlot({ me }: { me: Me }) {
  const switchHousehold = useSwitchHousehold();
  return (
    <div className="account-menu">
      {me.households.length > 1 ? (
        <>
          <label htmlFor="household-switch" className="account-label">
            {m["household.active"]()}
          </label>
          <select
            id="household-switch"
            value={me.activeHouseholdId ?? ""}
            onChange={(event) => void switchHousehold(event.target.value)}
          >
            {me.households.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <p className="account-household">{me.households[0]?.name}</p>
      )}
      <p className="account-user">{me.user.name}</p>
    </div>
  );
}

/** Entries on the More page. */
export function MoreAccountEntries({ me }: { me: Me }) {
  const signOut = useSignOut();
  const active = me.households.find((h) => h.id === me.activeHouseholdId);
  return (
    <div className="settings-list">
      <Link to="/more/household" className="settings-link">
        <Users aria-hidden="true" size={22} />
        <span>
          {m["household.title"]()}
          {active && (
            <small className="settings-link-detail">{active.name}</small>
          )}
        </span>
        <ChevronRight aria-hidden="true" size={20} />
      </Link>
      <p className="account-signed-in">
        {m["auth.signed_in_as"]({ email: me.user.email })}
      </p>
      <Button variant="secondary" onClick={() => void signOut()}>
        <LogOut aria-hidden="true" size={18} />
        {m["auth.sign_out"]()}
      </Button>
    </div>
  );
}
