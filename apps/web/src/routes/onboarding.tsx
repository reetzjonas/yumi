import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthLayout, Field, FormError } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { translateAuthError } from "@/lib/api-error";
import { authClient } from "@/lib/auth-client";
import { resetClientState, safeRedirect, useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/onboarding")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirect(search.redirect),
  }),
  component: Onboarding,
});

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "household"}-${crypto.randomUUID().slice(0, 8)}`;
}

function Onboarding() {
  const { redirect } = Route.useSearch();
  const me = useMe();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const hasHousehold = (me?.households.length ?? 0) > 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(
      new FormData(event.currentTarget).get("household"),
    ).trim();
    setPending(true);
    setError(null);
    const { error } = await authClient.organization.create({
      name,
      slug: slugify(name),
    });
    setPending(false);
    if (error) {
      setError(translateAuthError(error.code));
      return;
    }
    await resetClientState(queryClient);
    await router.navigate({ to: redirect ?? "/" });
  }

  return (
    <AuthLayout
      title={
        hasHousehold
          ? m["household.create_title"]()
          : m["onboarding.title"]({ name: me?.user.name ?? "" })
      }
      description={m["onboarding.description"]()}
    >
      <form className="auth-form" onSubmit={onSubmit}>
        <Field
          id="household"
          label={m["onboarding.household_name"]()}
          placeholder={m["onboarding.household_placeholder"]()}
          required
          maxLength={60}
        />
        <FormError message={error} />
        <Button type="submit" disabled={pending}>
          {m["onboarding.create"]()}
        </Button>
      </form>
      <p className="auth-switch">{m["onboarding.invite_hint"]()}</p>
    </AuthLayout>
  );
}
