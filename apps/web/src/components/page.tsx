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
    <a ref={ref} {...props} className="stage-chip">
      <ChevronLeft aria-hidden="true" size={16} strokeWidth={2.4} />
      <span>{label}</span>
    </a>
  );
}

export const BackLink = createLink(BackAnchor);

/**
 * The stage: a section's colored header with the page title. Inside the app
 * shell it renders above the content column. The line above the title holds
 * `back` (a `BackLink` naming the parent page) on a sub-page, else `eyebrow`,
 * a one-line status text; the line stays free when empty, so every stage has
 * the same height and the title sits at the same place. `actions` are the
 * page's own controls.
 * `heading={false}` keeps the title out of the outline when the content has
 * its own h1.
 */
export function PageHeader({
  title,
  back,
  heading = true,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  back?: ReactNode;
  heading?: boolean;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  const slot = useContext(StageSlotContext);
  const Title = heading ? "h1" : "p";
  const content = (
    <header className="stage" data-sub={back ? true : undefined}>
      <div className="stage-inner">
        <div className="stage-top">
          <div className="stage-titles">
            <div className="stage-eyebrow">{back ?? eyebrow}</div>
            <Title className="stage-title">{title}</Title>
          </div>
          {actions && <div className="stage-actions">{actions}</div>}
        </div>
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
