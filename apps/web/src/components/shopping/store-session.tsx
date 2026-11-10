import { Link } from "@tanstack/react-router";
import { Check, Store } from "lucide-react";
import { useRef } from "react";
import { Sheet } from "@/components/ui/sheet";
import type { Store as StoreRow } from "@/lib/stores";
import { m } from "@/paraglide/messages";

export function StoreSessionChip({
  storeId,
  stores,
  onChoose,
}: {
  storeId: string | null;
  stores: StoreRow[];
  onChoose: (storeId: string | null) => void;
}) {
  const sheet = useRef<HTMLDialogElement>(null);
  const store = stores.find((item) => item.id === storeId);
  const choose = (next: string | null) => {
    onChoose(next);
    sheet.current?.close();
  };
  return (
    <>
      <button
        type="button"
        className="stage-chip"
        data-active={!!store}
        aria-haspopup="dialog"
        aria-label={
          store ? m["shopping.at_store"]({ name: store.name }) : undefined
        }
        onClick={() => sheet.current?.showModal()}
      >
        <Store size={16} aria-hidden="true" />
        <span>
          {store
            ? m["shopping.at_store"]({ name: store.name })
            : m["shopping.pick_store"]()}
        </span>
      </button>
      <Sheet ref={sheet} title={m["shopping.trip_store"]()}>
        <p className="meta">{m["shopping.store_session_hint"]()}</p>
        {stores.length > 0 ? (
          <ul className="list-rows">
            {stores.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="list-row"
                  aria-pressed={item.id === storeId}
                  onClick={() => choose(item.id)}
                >
                  <span className="picker-row-title">{item.name}</span>
                  {item.id === storeId && (
                    <Check size={20} aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="list-row"
                aria-pressed={!store}
                onClick={() => choose(null)}
              >
                <span>{m["shopping.not_in_store"]()}</span>
                {!store && <Check size={20} aria-hidden="true" />}
              </button>
            </li>
          </ul>
        ) : (
          <p>{m["stores.empty_hint"]()}</p>
        )}
        <Link to="/more/stores" className="text-link">
          {m["stores.manage"]()}
        </Link>
      </Sheet>
    </>
  );
}
