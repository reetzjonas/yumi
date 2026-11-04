import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BackLink, PageHeader } from "@/components/page";
import { RecurringItems } from "@/components/shopping/recurring-items";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-error";
import { useShoppingLists } from "@/lib/shopping";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/more/recurring")({
  component: Recurring,
});

function Recurring() {
  const lists = useShoppingLists();
  const [selectedId, setSelectedId] = useState("");
  const listId = lists.data?.some((list) => list.id === selectedId)
    ? selectedId
    : (lists.data?.[0]?.id ?? "");
  return (
    <>
      <PageHeader
        title={m["recurring.title"]()}
        back={<BackLink to="/more" label={m.nav_more()} />}
      />
      <p className="meta">{m["recurring.description"]()}</p>
      {lists.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : lists.isError ? (
        <p className="form-error" role="alert">
          {errorMessage(lists.error)}
        </p>
      ) : !listId ? (
        <p>{m["shopping.no_lists_hint"]()}</p>
      ) : (
        <>
          {(lists.data?.length ?? 0) > 1 && (
            <div className="chip-row">
              {lists.data?.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  className="chip"
                  aria-pressed={list.id === listId}
                  onClick={() => setSelectedId(list.id)}
                >
                  {list.name}
                </button>
              ))}
            </div>
          )}
          <RecurringItems key={listId} listId={listId} />
        </>
      )}
    </>
  );
}
