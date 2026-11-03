import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/recipes")({ component: Recipes });

function Recipes() {
  return (
    <>
      <PageHeader title={m.nav_recipes()} />
      <EmptyState
        icon={BookOpen}
        title={m.recipes_empty_title()}
        description={m.recipes_empty_description()}
      >
        <Button asChild variant="secondary">
          <Link to="/plan">{m.recipes_plan_link()}</Link>
        </Button>
      </EmptyState>
    </>
  );
}
