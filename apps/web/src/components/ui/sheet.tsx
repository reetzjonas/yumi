import { X } from "lucide-react";
import { type ReactNode, type Ref, useId } from "react";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export function Sheet({
  ref,
  title,
  meta,
  onClose,
  children,
}: {
  ref: Ref<HTMLDialogElement>;
  title: string;
  meta?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={`${id}-title`}
      onClose={onClose}
    >
      <div className="sheet-content">
        <div className="sheet-header">
          <div className="row-main">
            <h2 id={`${id}-title`} className="sheet-title">
              {title}
            </h2>
            {meta && <p className="row-detail">{meta}</p>}
          </div>
          <form method="dialog">
            <Button
              type="submit"
              variant="ghost"
              className="sheet-close"
              aria-label={m["sheet.close"]()}
            >
              <X size={20} aria-hidden="true" />
            </Button>
          </form>
        </div>
        {children}
      </div>
    </dialog>
  );
}
