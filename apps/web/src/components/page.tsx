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

export const StageSlotContext = createContext<HTMLElement | null>(null);

function BackAnchor({
  ref,
  label,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  ref?: Ref<HTMLAnchorElement>;
  label: string;
}) {
  return (
    <a ref={ref} {...props} className="stage-round">
      <ChevronLeft aria-hidden="true" size={24} strokeWidth={2} />
      <span className="sr-only">{label}</span>
    </a>
  );
}

export const BackLink = createLink(BackAnchor);

/**
 * The stage: a section's colored header with the page title. Inside the app
 * shell it renders above the content column. `back` is a `BackLink` and makes
 * the stage compact; `eyebrow` and `sub` are one-line status texts around the
 * title; `actions` are the page's own controls; children sit inside the stage
 * (search, progress). `lift` lets the first content card overlap the stage.
 * `heading={false}` keeps the title out of the outline when the content has
 * its own h1.
 */
export function PageHeader({
  title,
  back,
  heading = true,
  eyebrow,
  sub,
  actions,
  lift = false,
  children,
}: {
  title: ReactNode;
  back?: ReactNode;
  heading?: boolean;
  eyebrow?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  lift?: boolean;
  children?: ReactNode;
}) {
  const slot = useContext(StageSlotContext);
  const Title = heading ? "h1" : "p";
  const content = (
    <header
      className="stage"
      data-compact={back ? true : undefined}
      data-lift={lift || undefined}
    >
      <div className="stage-inner">
        <div className="stage-top">
          {back}
          <div className="stage-titles">
            {eyebrow && <div className="stage-eyebrow">{eyebrow}</div>}
            <Title className="stage-title">{title}</Title>
          </div>
          {actions && <div className="stage-actions">{actions}</div>}
        </div>
        {sub && <div className="stage-sub">{sub}</div>}
        {children}
      </div>
    </header>
  );
  return slot ? createPortal(content, slot) : content;
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
