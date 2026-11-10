import { createFileRoute } from "@tanstack/react-router";
import { BackLink, PageHeader } from "@/components/page";
import { LeftoversPanel } from "@/components/queue/leftovers-panel";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/plan_/suggestions")({
  component: Suggestions,
});

function Suggestions() {
  return (
    <>
      <PageHeader
        title={m["queue.leftovers"]()}
        back={<BackLink to="/plan" label={m["queue.title"]()} />}
      />
      <LeftoversPanel />
    </>
  );
}
