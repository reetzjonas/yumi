import { registerSW } from "virtual:pwa-register";
import { toast } from "sonner";
import { m } from "@/paraglide/messages";

export function registerPwa() {
  const updateSW = registerSW({
    onNeedRefresh() {
      toast(m.pwa_update_available(), {
        id: "pwa-update",
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: m.pwa_reload(),
          onClick: () => {
            void updateSW(true);
          },
        },
        cancel: {
          label: m.pwa_later(),
          onClick: () => {
            toast.dismiss("pwa-update");
          },
        },
      });
    },
  });
}
