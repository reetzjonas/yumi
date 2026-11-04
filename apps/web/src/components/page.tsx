import { createLink } from "@tanstack/react-router";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import {
  type AnchorHTMLAttributes,
  createContext,
  type ReactNode,
  type Ref,
  useContext,
} from "react";
import { createPortal } from "react-dom";

export const TitleSlotContext = createContext<HTMLElement | null>(null);

function BackAnchor({
  ref,
  label,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  ref?: Ref<HTMLAnchorElement>;
  label: string;
}) {
  return (
    <a ref={ref} {...props} className="top-back">
      <ChevronLeft aria-hidden="true" size={24} strokeWidth={1.8} />
      <span className="sr-only">{label}</span>
    </a>
  );
}

export const BackLink = createLink(BackAnchor);

/**
 * Page title. Inside the app shell it renders into the top bar; `back` is a
 * `BackLink` shown before the title. `heading={false}` keeps the
 * top bar label out of the outline when the content has its own h1.
 */
export function PageHeader({
  title,
  back,
  heading = true,
}: {
  title: string;
  back?: ReactNode;
  heading?: boolean;
}) {
  const slot = useContext(TitleSlotContext);
  const Title = heading ? "h1" : "p";
  const content = (
    <>
      {back}
      <Title className="top-title">{title}</Title>
    </>
  );
  return slot ? (
    createPortal(content, slot)
  ) : (
    <header className="page-header">{content}</header>
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
