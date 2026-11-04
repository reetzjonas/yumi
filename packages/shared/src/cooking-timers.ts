import { z } from "zod";

const duration = z
  .number()
  .int()
  .positive()
  .max(7 * 24 * 60 * 60 * 1000);
const timerFields = {
  id: z.string().min(1),
  label: z.string().min(1),
  durationMs: duration,
};

const timerSchema = z.discriminatedUnion("status", [
  z.object({
    ...timerFields,
    status: z.literal("running"),
    endsAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
  z
    .object({
      ...timerFields,
      status: z.literal("paused"),
      remainingMs: duration,
    })
    .refine((timer) => timer.remainingMs <= timer.durationMs),
  z.object({ ...timerFields, status: z.literal("completed") }),
]);

const storedTimersSchema = z.object({
  version: z.literal(1),
  householdId: z.string().min(1),
  timers: z
    .array(timerSchema)
    .refine(
      (timers) =>
        new Set(timers.map((timer) => timer.id)).size === timers.length,
    ),
});

export type CookingTimer = z.infer<typeof timerSchema>;

export type TimerAction =
  | { type: "start"; id: string; label: string; seconds: number }
  | { type: "pause" | "resume" | "cancel" | "dismiss"; id: string }
  | { type: "tick" };

export function timerStorageKey(householdId: string) {
  return `yumi:cooking-timers:${householdId}`;
}

export function parseStoredTimers(
  value: string | null,
  householdId: string,
): CookingTimer[] {
  if (!value) return [];
  try {
    const parsed = storedTimersSchema.safeParse(JSON.parse(value));
    return parsed.success && parsed.data.householdId === householdId
      ? parsed.data.timers
      : [];
  } catch {
    return [];
  }
}

export function serializeTimers(householdId: string, timers: CookingTimer[]) {
  return JSON.stringify({ version: 1, householdId, timers });
}

export function remainingTime(timer: CookingTimer, now: number) {
  return timer.status === "running"
    ? Math.max(0, timer.endsAt - now)
    : timer.status === "paused"
      ? timer.remainingMs
      : 0;
}

export function transitionTimers(
  timers: CookingTimer[],
  action: TimerAction,
  now: number,
): CookingTimer[] {
  if (action.type === "start") {
    const durationMs = action.seconds * 1000;
    const timer = timerSchema.parse({
      id: action.id,
      label: action.label,
      durationMs,
      status: "running",
      endsAt: now + durationMs,
    });
    return [...timers, timer];
  }
  if (action.type === "cancel" || action.type === "dismiss") {
    return timers.filter(
      (timer) =>
        timer.id !== action.id ||
        (action.type === "dismiss"
          ? timer.status !== "completed"
          : timer.status === "completed"),
    );
  }
  let changed = false;
  const next = timers.map((timer): CookingTimer => {
    if (action.type !== "tick" && timer.id !== action.id) return timer;
    const { id, label, durationMs } = timer;
    if (
      timer.status === "running" &&
      (action.type === "tick" || action.type === "pause")
    ) {
      if (timer.endsAt <= now) {
        changed = true;
        return { id, label, durationMs, status: "completed" };
      }
      if (action.type === "pause") {
        changed = true;
        return {
          id,
          label,
          durationMs,
          status: "paused",
          remainingMs: timer.endsAt - now,
        };
      }
    }
    if (timer.status === "paused" && action.type === "resume") {
      changed = true;
      return {
        id,
        label,
        durationMs,
        status: "running",
        endsAt: now + timer.remainingMs,
      };
    }
    return timer;
  });
  return changed ? next : timers;
}

export function formatTimerTime(milliseconds: number) {
  const seconds = Math.ceil(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`
    : `${minutes}:${remainder}`;
}
