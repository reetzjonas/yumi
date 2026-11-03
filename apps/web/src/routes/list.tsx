import { createFileRoute, Link } from "@tanstack/react-router";
import { ShoppingBasket } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/list")({ component: List });

function List() {
  return (
    <>
      <PageHeader title={m.nav_list()} />
      <EmptyState
        icon={ShoppingBasket}
        title={m.list_empty_title()}
        description={m.list_empty_description()}
      >
        <Button asChild>
          <Link to="/plan">{m.list_plan_link()}</Link>
        </Button>
      </EmptyState>
    </>
  );
}
