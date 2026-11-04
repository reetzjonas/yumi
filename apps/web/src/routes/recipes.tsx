import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page";
import { RecipeLibrary } from "@/components/recipes/recipe-library";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/recipes")({ component: Recipes });

function Recipes() {
  return (
    <>
      <PageHeader title={m.nav_recipes()} />
      <RecipeLibrary
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/recipes/import">{m["recipes.import"]()}</Link>
            </Button>
            <Button asChild>
              <Link to="/recipes/new">
                <Plus aria-hidden="true" size={20} />
                {m["recipes.new"]()}
              </Link>
            </Button>
          </>
        }
      />
    </>
  );
}
