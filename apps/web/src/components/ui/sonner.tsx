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
      position="top-center"
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
