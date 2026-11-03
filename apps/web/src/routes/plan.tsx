import { createFileRoute, Link } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/plan")({ component: Plan });

function Plan() {
  return (
    <>
      <PageHeader title="Plan" />
      <EmptyState
        icon={ListChecks}
        title="What's cooking next?"
        description="Your next meals will appear here, in the order you want to cook them. Start with your recipe collection."
      >
        <Button asChild>
          <Link to="/recipes">Go to recipes</Link>
        </Button>
      </EmptyState>
    </>
  );
}
