import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/recipes")({ component: Recipes });

function Recipes() {
  return (
    <>
      <PageHeader title="Recipes" />
      <EmptyState
        icon={BookOpen}
        title="A home for your recipes"
        description="Your saved recipes will live here. Recipe capture is coming next."
      >
        <Button asChild variant="secondary">
          <Link to="/plan">See meal plan</Link>
        </Button>
      </EmptyState>
    </>
  );
}
