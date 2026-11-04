import { detectStepTimers } from "@yumi/shared";
import { Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";
import { useCookingTimers } from "./timer-provider";

export function StepTimers({
  text,
  recipeTitle,
  stepLabel,
}: {
  text: string;
  recipeTitle: string;
  stepLabel: string;
}) {
  const { start, enabled } = useCookingTimers();
  const detected = [
    ...new Map(
      detectStepTimers(text).map((timer) => [timer.label, timer]),
    ).values(),
  ];
  if (!detected.length || !enabled) return null;
  return (
    <div className="step-timers">
      {detected.map((timer) => (
        <Button
          key={timer.label}
          type="button"
          variant="outline"
          onClick={() =>
            start(
              `${recipeTitle} / ${stepLabel} / ${timer.label}`,
              timer.seconds,
            )
          }
        >
          <Timer aria-hidden="true" size={20} />
          {m["timers.start"]({ label: timer.label })}
        </Button>
      ))}
    </div>
  );
}
