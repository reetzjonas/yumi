import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthLayout, Field, FormError } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { translateAuthError } from "@/lib/api-error";
import { authClient } from "@/lib/auth-client";
import { resetClientState, safeRedirect } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirect(search.redirect),
  }),
  component: Signup,
});

function Signup() {
  const { redirect } = Route.useSearch();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")).trim(),
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) {
      setError(translateAuthError(error.code));
      return;
    }
    await resetClientState(queryClient);
    await router.navigate({ to: redirect ?? "/onboarding" });
  }

  return (
    <AuthLayout
      title={m["auth.sign_up_title"]()}
      description={m["auth.sign_up_description"]()}
    >
      <form className="auth-form" onSubmit={onSubmit}>
        <Field
          id="name"
          label={m["auth.name"]()}
          autoComplete="name"
          required
        />
        <Field
          id="email"
          label={m["auth.email"]()}
          type="email"
          autoComplete="email"
          required
        />
        <Field
          id="password"
          label={m["auth.password"]()}
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="field-hint">
          {m["auth.password_hint"]()}
        </p>
        <FormError message={error} />
        <Button type="submit" disabled={pending}>
          {m["auth.sign_up"]()}
        </Button>
      </form>
      <p className="auth-switch">
        {m["auth.have_account"]()}{" "}
        <Link to="/login" search={{ redirect }}>
          {m["auth.sign_in"]()}
        </Link>
      </p>
    </AuthLayout>
  );
}
