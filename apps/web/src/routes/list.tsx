import { createFileRoute, Link } from "@tanstack/react-router";
import { ShoppingBasket } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/list")({ component: List });

function List() {
  return (
    <>
      <PageHeader title="List" />
      <EmptyState
        icon={ShoppingBasket}
        title="Nothing on the list yet"
        description="Ingredients for your planned meals will have a place here. Your meal plan is the starting point."
      >
        <Button asChild>
          <Link to="/plan">Open meal plan</Link>
        </Button>
      </EmptyState>
    </>
  );
}
