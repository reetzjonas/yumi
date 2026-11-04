import { BellRing, ChevronDown, ChevronUp, Pause, Timer } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  type CookingTimer,
  formatTimerTime,
  parseStoredTimers,
  remainingTime,
  serializeTimers,
  type TimerAction,
  timerStorageKey,
  transitionTimers,
} from "@/lib/cooking-timers";
import { m } from "@/paraglide/messages";
import "../../timers.css";

type TimerContextValue = {
  timers: CookingTimer[];
  now: number;
  enabled: boolean;
  start: (label: string, seconds: number) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
  cancel: (id: string) => void;
  dismiss: (id: string) => void;
};

const TimerContext = createContext<TimerContextValue | null>(null);

export function TimerProvider({
  householdId,
  children,
}: {
  householdId: string | null | undefined;
  children: ReactNode;
}) {
  return (
    <HouseholdTimers key={householdId ?? ""} householdId={householdId ?? null}>
      {children}
    </HouseholdTimers>
  );
}

function HouseholdTimers({
  householdId,
  children,
}: {
  householdId: string | null;
  children: ReactNode;
}) {
  const [initial] = useState(() => {
    try {
      return {
        timers: householdId
          ? parseStoredTimers(
              localStorage.getItem(timerStorageKey(householdId)),
              householdId,
            )
          : [],
        storageFailed: false,
      };
    } catch {
      return { timers: [], storageFailed: true };
    }
  });
  const [timers, setTimers] = useState(initial.timers);
  const timersRef = useRef(timers);
  const [now, setNow] = useState(Date.now);
  const [collapsed, setCollapsed] = useState(true);
  const dockRef = useRef<HTMLElement>(null);
  const collapseHeight = useRef<number | null>(null);
  const [cookingFooterHeight, setCookingFooterHeight] = useState<number | null>(
    null,
  );
  const [cookingHeaderHeight, setCookingHeaderHeight] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [storageFailed, setStorageFailed] = useState(initial.storageFailed);
  const [audioFailed, setAudioFailed] = useState(false);
  const [vibrationFailed, setVibrationFailed] = useState(false);
  const [notificationFailed, setNotificationFailed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    () => ("Notification" in window ? Notification.permission : null),
  );
  const audio = useRef<AudioContext | null>(null);

  const unlockAudio = useCallback(() => {
    try {
      audio.current ??= new AudioContext();
      void audio.current
        .resume()
        .then(() => setAudioFailed(audio.current?.state !== "running"))
        .catch(() => setAudioFailed(true));
    } catch {
      setAudioFailed(true);
    }
  }, []);

  const alarm = useCallback((completed: CookingTimer[]) => {
    setAnnouncement(
      completed
        .map((timer) => m["timers.finished"]({ label: timer.label }))
        .join(" "),
    );
    try {
      const context = audio.current;
      if (context?.state !== "running") {
        setAudioFailed(true);
      } else {
        for (let index = 0; index < 3; index += 1) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const start = context.currentTime + index * 0.4;
          oscillator.frequency.value = 880;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
          gain.gain.linearRampToValueAtTime(0, start + 0.3);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
          oscillator.start(start);
          oscillator.stop(start + 0.3);
        }
      }
    } catch {
      setAudioFailed(true);
    }
    try {
      setVibrationFailed(
        !("vibrate" in navigator) || !navigator.vibrate([200, 100, 200]),
      );
    } catch {
      setVibrationFailed(true);
    }
    if ("Notification" in window && Notification.permission === "granted") {
      void (async () => {
        try {
          const registration = navigator.serviceWorker?.controller
            ? await navigator.serviceWorker.getRegistration()
            : undefined;
          for (const timer of completed) {
            const options = {
              body: m["timers.finished"]({ label: timer.label }),
              tag: `yumi-timer-${timer.id}`,
            };
            if (registration)
              await registration.showNotification(m["timers.title"](), options);
            else new Notification(m["timers.title"](), options);
          }
        } catch {
          setNotificationFailed(true);
        }
      })();
    }
  }, []);

  const dispatch = useCallback(
    (action: TimerAction) => {
      if (!householdId) return;
      const previous = timersRef.current;
      const currentNow = Date.now();
      const next = transitionTimers(previous, action, currentNow);
      setNow(currentNow);
      if (next === previous) return;
      timersRef.current = next;
      setTimers(next);
      // Save completion before alerting: a reload must not replay the alarm.
      try {
        localStorage.setItem(
          timerStorageKey(householdId),
          serializeTimers(householdId, next),
        );
        setStorageFailed(false);
      } catch {
        setStorageFailed(true);
      }
      const completed = next.filter(
        (timer) =>
          timer.status === "completed" &&
          previous.some(
            (before) => before.id === timer.id && before.status === "running",
          ),
      );
      if (completed.length) alarm(completed);
    },
    [householdId, alarm],
  );

  useEffect(() => {
    if (!householdId) return;
    dispatch({ type: "tick" });
    const interval = window.setInterval(() => dispatch({ type: "tick" }), 500);
    const onVisible = () => {
      if (document.visibilityState === "visible") dispatch({ type: "tick" });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== timerStorageKey(householdId) && event.key !== null)
        return;
      const next = parseStoredTimers(event.newValue, householdId);
      timersRef.current = next;
      setTimers(next);
      dispatch({ type: "tick" });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, [householdId, dispatch]);

  useEffect(
    () => () => {
      if (audio.current && audio.current.state !== "closed")
        void audio.current.close();
    },
    [],
  );

  useEffect(() => {
    let footer: Element | null = null;
    let header: Element | null = null;
    let dock: Element | null = null;
    const measure = () => {
      setCookingFooterHeight(footer?.getBoundingClientRect().height ?? null);
      setCookingHeaderHeight(header?.getBoundingClientRect().height ?? 0);
      document.documentElement.style.setProperty(
        "--timer-dock-height",
        `${dock?.getBoundingClientRect().height ?? 0}px`,
      );
    };
    const resizeObserver = new ResizeObserver(measure);
    const findFooter = () => {
      const next = document.querySelector(".cooking-footer");
      const nextHeader = document.querySelector(".cooking-header");
      const nextDock = document.querySelector(".timer-dock");
      if (next === footer && nextHeader === header && nextDock === dock) return;
      resizeObserver.disconnect();
      footer = next;
      header = nextHeader;
      dock = nextDock;
      measure();
      if (footer) resizeObserver.observe(footer);
      if (header) resizeObserver.observe(header);
      if (dock) resizeObserver.observe(dock);
    };
    // The global provider survives route changes; the footer does not.
    const mutationObserver = new MutationObserver(findFooter);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    findFooter();
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      document.documentElement.style.removeProperty("--timer-dock-height");
    };
  }, []);

  useLayoutEffect(() => {
    const dock = dockRef.current;
    const from = collapseHeight.current;
    collapseHeight.current = null;
    if (!dock || from === null) return;
    const to = dock.getBoundingClientRect().height;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const animation = dock.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ height: `${from}px` }, { height: `${to}px` }],
      { duration: reduced || collapsed ? 150 : 200, easing: "ease-out" },
    );
    return () => animation.cancel();
  }, [collapsed]);

  const enableNotifications = async () => {
    if (!("Notification" in window)) return;
    try {
      const next = await Notification.requestPermission();
      setPermission(next);
      setNotificationFailed(false);
    } catch {
      setNotificationFailed(true);
    }
  };

  const value = useMemo<TimerContextValue>(
    () => ({
      timers,
      now,
      enabled: Boolean(householdId),
      start(label, seconds) {
        if (!householdId) return;
        unlockAudio();
        setAnnouncement("");
        dispatch({ type: "start", id: crypto.randomUUID(), label, seconds });
      },
      pause: (id) => dispatch({ type: "pause", id }),
      resume(id) {
        unlockAudio();
        dispatch({ type: "resume", id });
      },
      cancel: (id) => dispatch({ type: "cancel", id }),
      dismiss: (id) => dispatch({ type: "dismiss", id }),
    }),
    [timers, now, householdId, unlockAudio, dispatch],
  );
  const completedTimer = timers.find((timer) => timer.status === "completed");

  return (
    <TimerContext value={value}>
      {children}
      <div
        className="sr-only top-0"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
      {householdId && timers.length > 0 && (
        <aside
          ref={dockRef}
          className="timer-dock"
          aria-label={m["timers.title"]()}
          data-completed={Boolean(completedTimer)}
          style={
            cookingFooterHeight === null
              ? undefined
              : {
                  bottom: cookingFooterHeight + 12,
                  maxHeight: `calc(100dvh - ${cookingFooterHeight + cookingHeaderHeight + 24}px)`,
                }
          }
        >
          <div className="timer-dock-header">
            {completedTimer ? (
              <BellRing
                role="img"
                aria-label={m["timers.finished"]({
                  label: completedTimer.label,
                })}
                size={20}
              />
            ) : (
              <Timer aria-hidden="true" size={20} />
            )}
            <h2>{m["timers.title"]()}</h2>
            <Button
              type="button"
              variant="ghost"
              aria-expanded={!collapsed}
              aria-controls="timer-dock-content"
              onClick={() => {
                collapseHeight.current =
                  dockRef.current?.getBoundingClientRect().height ?? null;
                setCollapsed((previous) => !previous);
              }}
            >
              {collapsed ? (
                <>
                  {m["timers.show"]({ count: timers.length })}
                  <ChevronUp aria-hidden="true" size={18} />
                </>
              ) : (
                <>
                  {m["timers.hide"]()}
                  <ChevronDown aria-hidden="true" size={18} />
                </>
              )}
            </Button>
          </div>
          {storageFailed && (
            <p className="timer-storage-error" role="alert">
              {m["timers.storage_unavailable"]()}
            </p>
          )}
          <section
            id="timer-dock-content"
            className="timer-dock-content"
            aria-label={m["timers.title"]()}
            hidden={collapsed}
          >
            <ul className="timer-list">
              {timers.map((timer) => (
                <li key={timer.id} className="timer-item">
                  <span className="timer-label">{timer.label}</span>
                  {timer.status === "completed" ? (
                    <p className="timer-finished">
                      <BellRing aria-hidden="true" size={18} />
                      {m["timers.done"]()}
                    </p>
                  ) : (
                    <div className="timer-countdown">
                      {timer.status === "paused" && (
                        <Pause aria-hidden="true" size={18} />
                      )}
                      <span
                        role="timer"
                        aria-live="off"
                        aria-label={m["timers.remaining"]({
                          label: timer.label,
                          time: formatTimerTime(remainingTime(timer, now)),
                        })}
                      >
                        {formatTimerTime(remainingTime(timer, now))}
                      </span>
                    </div>
                  )}
                  <div className="timer-actions">
                    {timer.status === "completed" ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => value.dismiss(timer.id)}
                      >
                        {m["timers.dismiss"]()}
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            timer.status === "paused"
                              ? value.resume(timer.id)
                              : value.pause(timer.id)
                          }
                        >
                          {timer.status === "paused"
                            ? m["timers.resume"]()
                            : m["timers.pause"]()}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => value.cancel(timer.id)}
                        >
                          {m["timers.cancel"]()}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="timer-settings">
              {permission === "default" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void enableNotifications()}
                >
                  {m["timers.enable_notifications"]()}
                </Button>
              )}
              {permission === "denied" && (
                <p>{m["timers.notifications_denied"]()}</p>
              )}
              {(permission === null || notificationFailed) && (
                <p>{m["timers.notifications_unavailable"]()}</p>
              )}
              {audioFailed && <p>{m["timers.audio_unavailable"]()}</p>}
              {vibrationFailed && <p>{m["timers.vibration_unavailable"]()}</p>}
            </div>
          </section>
        </aside>
      )}
    </TimerContext>
  );
}

export function useCookingTimers() {
  const value = useContext(TimerContext);
  if (!value) throw new Error("useCookingTimers requires TimerProvider");
  return value;
}
