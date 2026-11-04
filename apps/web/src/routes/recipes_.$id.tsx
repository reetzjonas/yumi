import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { parseIngredientLine, unitSchema } from "@yumi/shared";
import {
  ArrowLeft,
  CalendarPlus,
  CookingPot,
  ListPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page";
import { AddRecipeToQueue } from "@/components/queue/add-recipe";
import { RecipeInsights } from "@/components/recipes/recipe-insights";
import { RecipeLibrary } from "@/components/recipes/recipe-library";
import { ServingsSelector } from "@/components/recipes/servings-selector";
import { AddRecipeToList } from "@/components/shopping/add-recipe";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import {
  formatMinutes,
  formatScaledQuantity,
  groupBySection,
  ingredientName,
  recipeImageUrl,
  servingsSearch,
} from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/recipes_/$id")({
  validateSearch: servingsSearch,
  component: Recipe,
});

function Recipe() {
  const { id } = Route.useParams();
  const { servings } = Route.useSearch();
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const queueSheet = useRef<HTMLDialogElement>(null);
  const listSheet = useRef<HTMLDialogElement>(null);
  const query = useQuery({
    queryKey: ["recipes", householdId, "detail", id],
    queryFn: async () =>
      (await ensureOk(await api.recipes[":id"].$get({ param: { id } }))).json(),
  });
  const remove = useMutation({
    mutationFn: async () =>
      ensureOk(await api.recipes[":id"].$delete({ param: { id } })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast.success(m["recipes.deleted"]());
      await navigate({ to: "/recipes" });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const recipe = query.data;
  return (
    <div className="split recipe-split">
      <aside
        className="split-pane split-pane-wide"
        aria-label={m.nav_recipes()}
      >
        <RecipeLibrary />
      </aside>
      <article className="recipe-detail">
        <Link to="/recipes" className="back-link">
          <ArrowLeft size={18} aria-hidden="true" />
          {m.nav_recipes()}
        </Link>
        {query.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : query.isError ? (
          <p className="form-error" role="alert">
            {errorMessage(query.error)}
          </p>
        ) : (
          recipe && (
            <>
              <PageHeader title={recipe.title} />
              {recipe.imageKey && (
                <img
                  className="recipe-image"
                  src={recipeImageUrl(id, recipe.imageKey, "full")}
                  alt={m["recipes.image_alt"]({ title: recipe.title })}
                  width={1200}
                  height={750}
                />
              )}
              {recipe.description && (
                <p className="recipe-description">{recipe.description}</p>
              )}
              <ServingsSelector
                value={servings ?? recipe.servings}
                onChange={(next) =>
                  void navigate({
                    to: "/recipes/$id",
                    params: { id },
                    search: { servings: next },
                    replace: true,
                  })
                }
              />
              <dl className="recipe-meta">
                {recipe.prepMinutes !== null && (
                  <div>
                    <dt>{m["recipes.prep_time"]()}</dt>
                    <dd>{formatMinutes(recipe.prepMinutes)}</dd>
                  </div>
                )}
                {recipe.cookMinutes !== null && (
                  <div>
                    <dt>{m["recipes.cook_time"]()}</dt>
                    <dd>{formatMinutes(recipe.cookMinutes)}</dd>
                  </div>
                )}
              </dl>
              <RecipeInsights key={`${householdId}-${id}`} recipe={recipe} />
              {recipe.tags.length > 0 && (
                <p className="row-detail">{recipe.tags.join(" · ")}</p>
              )}
              {recipe.sourceUrl && (
                <a
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {m["recipes.source"]()}
                </a>
              )}
              <div className="recipe-actions">
                <Button asChild>
                  <Link to="/cook/$id" params={{ id }} search={{ servings }}>
                    <CookingPot size={18} aria-hidden="true" />
                    {m["cooking.start"]()}
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-haspopup="dialog"
                  onClick={() => queueSheet.current?.showModal()}
                >
                  <CalendarPlus size={18} aria-hidden="true" />
                  {m["recipes.plan_action"]()}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-haspopup="dialog"
                  onClick={() => listSheet.current?.showModal()}
                >
                  <ListPlus size={18} aria-hidden="true" />
                  {m["recipes.list_action"]()}
                </Button>
                <Button asChild variant="outline">
                  <Link to="/recipes/$id/edit" params={{ id }}>
                    <Pencil size={18} aria-hidden="true" />
                    {m["recipes.edit"]()}
                  </Link>
                </Button>
                <Button
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        m["recipes.delete_confirm"]({ title: recipe.title }),
                      )
                    )
                      remove.mutate();
                  }}
                >
                  <Trash2 size={18} aria-hidden="true" />
                  {m["recipes.delete"]()}
                </Button>
              </div>
              <Sheet
                ref={queueSheet}
                title={m["queue.add"]()}
                meta={recipe.title}
              >
                <AddRecipeToQueue
                  key={`queue-${householdId}-${id}-${servings ?? recipe.servings}`}
                  recipeId={id}
                  servings={servings ?? recipe.servings}
                />
              </Sheet>
              <Sheet
                ref={listSheet}
                title={m["shopping.add_recipe"]()}
                meta={recipe.title}
              >
                <AddRecipeToList
                  key={`${householdId}-${id}-${servings ?? recipe.servings}`}
                  recipeId={id}
                  servings={servings ?? recipe.servings}
                />
              </Sheet>
              <section className="recipe-section">
                <h2>{m["recipes.ingredients"]()}</h2>
                {recipe.ingredients.length === 0 && (
                  <p>{m["recipes.no_ingredients"]()}</p>
                )}
                {groupBySection(recipe.ingredients).map((group) => (
                  <div key={group.section ?? ""}>
                    {group.section && <h3>{group.section}</h3>}
                    <ul className="recipe-ingredient-list">
                      {group.lines.map((line) => {
                        const parsed = parseIngredientLine(line.rawText);
                        const name = line.ingredient
                          ? ingredientName(line.ingredient)
                          : parsed.name || line.rawText;
                        const unit =
                          unitSchema.safeParse(line.unit).data ?? null;
                        const quantity = formatScaledQuantity(
                          line.quantity,
                          unit,
                          recipe.servings,
                          servings ?? recipe.servings,
                        );
                        return (
                          <li key={line.id}>
                            {quantity !== null && <strong>{quantity} </strong>}
                            {parsed.unitText && `${parsed.unitText} `}
                            {name}
                            {line.note && (
                              <span className="row-detail">, {line.note}</span>
                            )}
                            {line.optional && (
                              <span className="row-detail">
                                {" "}
                                ({m["recipes.optional"]()})
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </section>
              <section className="recipe-section">
                <h2>{m["recipes.steps"]()}</h2>
                {recipe.steps.length === 0 ? (
                  <p>{m["recipes.no_steps"]()}</p>
                ) : (
                  <ol className="recipe-step-list">
                    {recipe.steps.map((step) => (
                      <li key={step.id}>{step.text}</li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )
        )}
      </article>
    </div>
  );
}
