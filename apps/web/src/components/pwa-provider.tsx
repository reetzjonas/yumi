import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallContext = createContext<{
  prompt: InstallPromptEvent | null;
  installed: boolean;
  clearPrompt: () => void;
} | null>(null);

export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () =>
      matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && navigator.standalone === true),
  );

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const value = useMemo(
    () => ({ prompt, installed, clearPrompt: () => setPrompt(null) }),
    [prompt, installed],
  );
  return <InstallContext value={value}>{children}</InstallContext>;
}

export function InstallHint() {
  const context = useContext(InstallContext);
  const [installing, setInstalling] = useState(false);
  if (!context) throw new Error("InstallHint requires PwaProvider");
  const { prompt, installed, clearPrompt } = context;

  async function install() {
    if (!prompt) return;
    setInstalling(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      toast.error(m.pwa_install_error());
    } finally {
      clearPrompt();
      setInstalling(false);
    }
  }

  return (
    <section className="install-hint">
      <h2>{m.pwa_install_title()}</h2>
      <p>{installed ? m.pwa_installed() : m.pwa_install_description()}</p>
      {!installed && prompt ? (
        <Button
          onClick={() => {
            void install();
          }}
          disabled={installing}
        >
          {m.pwa_install_action()}
        </Button>
      ) : !installed ? (
        <p className="install-instructions">{m.pwa_install_manual()}</p>
      ) : null}
    </section>
  );
}

function subscribeOnline(update: () => void) {
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
}

export function ConnectionStatus() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine);
  return online ? null : (
    <p className="connection-notice" role="status">
      {m.pwa_offline()}
    </p>
  );
}
