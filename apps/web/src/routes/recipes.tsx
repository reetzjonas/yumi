import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Plus } from "lucide-react";
import { PageHeader } from "@/components/page";
import { RecipeLibrary } from "@/components/recipes/recipe-library";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/recipes")({ component: Recipes });

function Recipes() {
  return (
    <>
      <PageHeader
        title={m.nav_recipes()}
        actions={
          <>
            <Button asChild variant="ghost" className="icon-action">
              <Link to="/recipes/import" aria-label={m["recipes.import"]()}>
                <Download aria-hidden="true" size={22} />
              </Link>
            </Button>
            <Button asChild className="icon-action">
              <Link to="/recipes/new" aria-label={m["recipes.new"]()}>
                <Plus aria-hidden="true" size={22} />
              </Link>
            </Button>
          </>
        }
      />
      <RecipeLibrary />
    </>
  );
}
