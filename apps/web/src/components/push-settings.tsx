import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-error";
import { disablePush, enablePush, pushEnabled, usePushKey } from "@/lib/push";
import { m } from "@/paraglide/messages";

/** Per-device switch for household notifications; hidden when push is unavailable. */
export function PushSettings() {
  const key = usePushKey();
  const queryClient = useQueryClient();
  const enabled = useQuery({
    queryKey: ["push", "enabled"],
    queryFn: pushEnabled,
  });
  const toggle = useMutation({
    mutationFn: async () => {
      if (enabled.data) await disablePush();
      else if (key.data && !(await enablePush(key.data)))
        throw new Error(m["push.denied"]());
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["push", "enabled"] }),
  });
  if (!key.data) return null;
  return (
    <section className="settings-group">
      <h2 className="section-label">{m["push.title"]()}</h2>
      <div className="import-card">
        <h3 className="import-card-title">
          {enabled.data ? m["push.on"]() : m["push.off"]()}
        </h3>
        <p className="import-card-text">{m["push.text"]()}</p>
        <Button
          type="button"
          variant="outline"
          disabled={toggle.isPending || enabled.isPending}
          onClick={() => toggle.mutate()}
        >
          {enabled.data ? m["push.disable"]() : m["push.enable"]()}
        </Button>
        {toggle.isError && (
          <p className="form-error" role="alert">
            {errorMessage(toggle.error)}
          </p>
        )}
      </div>
    </section>
  );
}
