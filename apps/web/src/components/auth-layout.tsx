import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

/** Centered single-column layout for sign-in, sign-up, onboarding and invites. */
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-layout">
      <main className="auth-card">
        <p className="auth-brand">yumi</p>
        <h1>{title}</h1>
        {description && <p className="auth-description">{description}</p>}
        {children}
      </main>
      <Toaster />
    </div>
  );
}

export function Field({
  id,
  label,
  ...props
}: {
  id: string;
  label: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} {...props} />
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  return message ? (
    <p className="form-error" role="alert">
      {message}
    </p>
  ) : null;
}
