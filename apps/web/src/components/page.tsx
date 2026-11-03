import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      {children}
      <h1>{title}</h1>
    </header>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <Icon
        aria-hidden="true"
        className="empty-illustration"
        size={64}
        strokeWidth={1.2}
      />
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </section>
  );
}
