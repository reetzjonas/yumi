import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/components/theme-provider";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme}
      closeButton
      position="top-center"
      className="app-toaster"
      toastOptions={{
        style: {
          background: "var(--popover)",
          color: "var(--foreground)",
          borderColor: "var(--border)",
        },
      }}
    />
  );
}
