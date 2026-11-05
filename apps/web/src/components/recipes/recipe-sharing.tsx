import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Share2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { ConnectionStatus } from "@/components/pwa-provider";
import { CreateShareLink } from "@/components/recipes/create-share-link";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { formatShareDate, shareUrl } from "@/lib/recipe-sharing";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export function RecipeSharing({
  recipeId,
  title,
}: {
  readonly recipeId: string;
  readonly title: string;
}) {
  const sheet = useRef<HTMLDialogElement>(null);
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const queryKey = ["recipe-shares", householdId, recipeId];
  const endpoint = api.recipes[":id"].shares;
  const query = useQuery({
    queryKey,
    networkMode: "always",
    queryFn: async () =>
      (await ensureOk(await endpoint.$get({ param: { id: recipeId } }))).json(),
    enabled: open,
  });
  const revoke = useMutation({
    networkMode: "always",
    mutationFn: async (shareId: string) =>
      ensureOk(
        await endpoint[":shareId"].$delete({
          param: { id: recipeId, shareId },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const copy = useMutation({
    networkMode: "always",
    mutationFn: async (link: {
      readonly id: string;
      readonly token: string;
    }) => {
      await navigator.clipboard.writeText(shareUrl(link.token));
      return link.id;
    },
    onSuccess: setCopiedId,
  });
  return (
    <>
      <Button
        variant="ghost"
        aria-haspopup="dialog"
        onClick={() => {
          revoke.reset();
          copy.reset();
          setCopiedId(null);
          setOpen(true);
          sheet.current?.showModal();
        }}
      >
        <Share2 size={18} aria-hidden="true" />
        {m["sharing.share"]()}
      </Button>
      <Sheet
        ref={sheet}
        title={m["sharing.title"]()}
        meta={title}
        onClose={() => setOpen(false)}
      >
        <div className="recipe-sharing">
          <p>{m["sharing.access_hint"]()}</p>
          <ConnectionStatus />
          {open && (
            <CreateShareLink
              recipeId={recipeId}
              onCreated={() => queryClient.invalidateQueries({ queryKey })}
            />
          )}
          <section className="sharing-links">
            <h3>{m["sharing.links"]()}</h3>
            {query.isPending ? (
              <p className="meta" role="status">
                {m["sharing.loading"]()}
              </p>
            ) : query.isError ? (
              <div>
                <p className="form-error" role="alert">
                  {errorMessage(query.error)}
                </p>
                <Button
                  variant="outline"
                  disabled={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  {m["sharing.retry"]()}
                </Button>
              </div>
            ) : query.data.length === 0 ? (
              <p className="meta">{m["sharing.empty"]()}</p>
            ) : (
              <ul className="sharing-link-list">
                {query.data.map((link) => {
                  const url = shareUrl(link.token);
                  const expired =
                    link.expiresAt !== null &&
                    new Date(link.expiresAt).getTime() <= Date.now();
                  return (
                    <li key={link.id} className="sharing-link">
                      <p className="sharing-link-date">
                        {m["sharing.created"]({
                          date: formatShareDate(link.createdAt),
                        })}
                      </p>
                      <p className="meta">
                        {expired
                          ? m["sharing.expired"]()
                          : link.expiresAt
                            ? m["sharing.expires"]({
                                date: formatShareDate(link.expiresAt),
                              })
                            : m["sharing.never_expires"]()}
                      </p>
                      <input
                        className="sharing-url"
                        aria-label={m["sharing.url"]()}
                        readOnly
                        value={url}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                      <div className="sharing-link-actions">
                        <Button
                          variant="outline"
                          disabled={expired || copy.isPending}
                          onClick={() => {
                            copy.reset();
                            setCopiedId(null);
                            copy.mutate(link);
                          }}
                        >
                          {copiedId === link.id ? (
                            <Check size={18} aria-hidden="true" />
                          ) : (
                            <Copy size={18} aria-hidden="true" />
                          )}
                          {m["sharing.copy_link"]()}
                        </Button>
                        <Button
                          variant="destructive"
                          disabled={revoke.isPending}
                          aria-busy={
                            revoke.isPending && revoke.variables === link.id
                          }
                          onClick={() => revoke.mutate(link.id)}
                        >
                          <Trash2 size={18} aria-hidden="true" />
                          {m["sharing.revoke"]()}
                        </Button>
                      </div>
                      {copiedId === link.id && (
                        <p className="meta" role="status">
                          {m["sharing.copied"]()}
                        </p>
                      )}
                      {copy.isError && copy.variables?.id === link.id && (
                        <p className="form-error" role="alert">
                          {m["sharing.copy_failed"]()}
                        </p>
                      )}
                      {revoke.isError && revoke.variables === link.id && (
                        <p className="form-error" role="alert">
                          {errorMessage(revoke.error)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </Sheet>
    </>
  );
}
