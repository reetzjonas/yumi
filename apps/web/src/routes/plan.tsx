import { createFileRoute, Link } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/plan")({ component: Plan });

function Plan() {
  return (
    <>
      <PageHeader title={m.nav_plan()} />
      <EmptyState
        icon={ListChecks}
        title={m.plan_empty_title()}
        description={m.plan_empty_description()}
      >
        <Button asChild>
          <Link to="/recipes">{m.plan_recipes_link()}</Link>
        </Button>
      </EmptyState>
    </>
  );
}
