import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/components/theme-provider";
import { m } from "@/paraglide/messages";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme}
      closeButton
      containerAriaLabel={m.toast_label()}
      position="bottom-right"
      offset={{ bottom: 24, right: 24 }}
      mobileOffset={{
        bottom: "calc(88px + env(safe-area-inset-bottom))",
        left: 16,
        right: 16,
      }}
      className="app-toaster"
      toastOptions={{
        closeButtonAriaLabel: m.toast_close(),
        style: {
          background: "var(--popover)",
          color: "var(--foreground)",
          borderColor: "var(--border)",
        },
      }}
    />
  );
}
