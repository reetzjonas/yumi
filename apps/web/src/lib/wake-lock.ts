import { useEffect, useState } from "react";

export function useWakeLock() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let disposed = false;
    let lock: WakeLockSentinel | undefined;
    async function acquire() {
      if (
        !("wakeLock" in navigator) ||
        document.visibilityState !== "visible" ||
        (lock && !lock.released)
      )
        return;
      try {
        const acquired = await navigator.wakeLock.request("screen");
        if (disposed) {
          await acquired.release();
          return;
        }
        lock = acquired;
        setActive(true);
        acquired.addEventListener("release", () => setActive(false));
      } catch (error) {
        if (!(error instanceof DOMException)) throw error;
        setActive(false);
      }
    }
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", acquire);
      if (lock && !lock.released) void lock.release();
    };
  }, []);
  return active;
}
