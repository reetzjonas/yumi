import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { translateAuthError } from "@/lib/api-error";
import { authClient } from "@/lib/auth-client";
import { resetClientState } from "@/lib/session";

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
