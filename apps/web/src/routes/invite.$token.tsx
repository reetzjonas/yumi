import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout, FormError } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { resetClientState } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/invite/$token")({ component: Invite });

function Invite() {
  const { token } = Route.useParams();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const preview = useQuery({
    queryKey: ["invite", token],
    queryFn: async () =>
      (
        await ensureOk(await api.invites[":token"].$get({ param: { token } }))
      ).json(),
    retry: false,
  });

  async function accept() {
    setPending(true);
    setError(null);
    try {
      await ensureOk(
        await api.invites[":token"].accept.$post({ param: { token } }),
      );
      await resetClientState(queryClient);
      await router.navigate({ to: "/" });
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  if (preview.isPending) {
    return (
      <AuthLayout title={m["invite.title"]()}>
        <Skeleton className="h-12 w-full" />
      </AuthLayout>
    );
  }
  if (preview.isError) {
    return (
      <AuthLayout
        title={m["invite.title"]()}
        description={errorMessage(preview.error)}
      >
        <Button asChild variant="secondary">
          <Link to="/">{m["invite.back"]()}</Link>
        </Button>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      title={m["invite.title"]()}
      description={m["invite.description"]({
        household: preview.data.householdName,
      })}
    >
      <FormError message={error} />
      <div className="auth-form">
        <Button onClick={() => void accept()} disabled={pending}>
          {m["invite.accept"]()}
        </Button>
        <Button asChild variant="ghost">
          <Link to="/">{m["invite.decline"]()}</Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
