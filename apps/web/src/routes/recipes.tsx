import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Download, Plus } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { RecipeLibrary } from "@/components/recipes/recipe-library";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/recipes")({ component: Recipes });

function Recipes() {
  return (
    <>
      <div className="recipe-list-heading">
        <PageHeader title={m.nav_recipes()} />
        <div className="recipe-actions">
          <Button asChild variant="secondary">
            <Link to="/recipes/import">
              <Download aria-hidden="true" size={20} />
              {m["recipes.import"]()}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/recipes/new">
              <Plus aria-hidden="true" size={20} />
              {m["recipes.new"]()}
            </Link>
          </Button>
        </div>
      </div>
      <div className="split recipe-split">
        <div className="split-pane">
          <RecipeLibrary />
        </div>
        <div className="split-placeholder">
          <EmptyState
            icon={BookOpen}
            title={m["recipes.choose_title"]()}
            description={m["recipes.choose_description"]()}
          />
        </div>
      </div>
    </>
  );
}
