import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { parseIngredientLine, unitSchema } from "@yumi/shared";
import { Clock, Flame, Link as LinkIcon, Pencil, Trash2 } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { BackLink, PageHeader } from "@/components/page";
import { AddRecipeToQueue } from "@/components/queue/add-recipe";
import { RecipeInsights } from "@/components/recipes/recipe-insights";
import { RecipeNutrition } from "@/components/recipes/recipe-nutrition";
import { ServingsStepper } from "@/components/recipes/servings-selector";
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
  totalMinutes,
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
  const currentServings = servings ?? recipe?.servings ?? 1;
  return (
    <article className="recipe-detail">
      <PageHeader
        title={m["recipes.detail_title"]()}
        heading={false}
        back={<BackLink to="/recipes" label={m.nav_recipes()} />}
      />
      {query.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : query.isError ? (
        <p className="form-error" role="alert">
          {errorMessage(query.error)}
        </p>
      ) : (
        recipe && (
          <>
            {recipe.imageKey ? (
              <img
                className="recipe-hero"
                src={recipeImageUrl(id, recipe.imageKey, "full")}
                alt={m["recipes.image_alt"]({ title: recipe.title })}
                width={1200}
                height={750}
              />
            ) : (
              <div className="recipe-hero is-empty" />
            )}
            <h1 className="recipe-title">{recipe.title}</h1>
            {recipe.description && (
              <p className="recipe-description">{recipe.description}</p>
            )}
            {(totalMinutes(recipe) > 0 || recipe.tags.length > 0) && (
              <div className="recipe-meta">
                {totalMinutes(recipe) > 0 && (
                  <span className="recipe-meta-time">
                    <Clock size={16} aria-hidden="true" />
                    {formatMinutes(totalMinutes(recipe))}
                  </span>
                )}
                {recipe.prepMinutes !== null && recipe.cookMinutes !== null && (
                  <span>
                    {m["recipes.prep_cook"]({
                      prep: recipe.prepMinutes,
                      cook: recipe.cookMinutes,
                    })}
                  </span>
                )}
                {recipe.tags.map((tag) => (
                  <span key={tag} className="badge">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <RecipeInsights key={`${householdId}-${id}`} recipe={recipe} />
            <div className="recipe-primary-actions">
              <Button asChild>
                <Link to="/cook/$id" params={{ id }} search={{ servings }}>
                  <Flame size={20} aria-hidden="true" />
                  {m["recipes.cook_action"]()}
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-haspopup="dialog"
                onClick={() => queueSheet.current?.showModal()}
              >
                {m["recipes.plan_action"]()}
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-haspopup="dialog"
                onClick={() => listSheet.current?.showModal()}
              >
                {m["recipes.list_action"]()}
              </Button>
            </div>
            <div className="recipe-secondary-actions">
              <Button asChild variant="ghost">
                <Link to="/recipes/$id/edit" params={{ id }}>
                  <Pencil size={18} aria-hidden="true" />
                  {m["recipes.edit"]()}
                </Link>
              </Button>
              <Button
                variant="ghost"
                className="button-danger-text"
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
              {recipe.sourceUrl && (
                <Button asChild variant="ghost">
                  <a
                    href={recipe.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <LinkIcon size={18} aria-hidden="true" />
                    {new URL(recipe.sourceUrl).hostname.replace(/^www\./, "")}
                  </a>
                </Button>
              )}
            </div>
            <Sheet
              ref={queueSheet}
              title={m["queue.add"]()}
              meta={recipe.title}
            >
              <AddRecipeToQueue
                key={`queue-${householdId}-${id}-${currentServings}`}
                recipeId={id}
                servings={currentServings}
              />
            </Sheet>
            <Sheet
              ref={listSheet}
              title={m["shopping.add_recipe"]()}
              meta={recipe.title}
            >
              <AddRecipeToList
                key={`${householdId}-${id}-${currentServings}`}
                recipeId={id}
                servings={currentServings}
              />
            </Sheet>
            <div className="recipe-columns">
              <section className="recipe-column">
                <div className="recipe-column-heading">
                  <h2>{m["recipes.ingredients"]()}</h2>
                  <ServingsStepper
                    value={currentServings}
                    onChange={(next) =>
                      void navigate({
                        to: "/recipes/$id",
                        params: { id },
                        search: { servings: next },
                        replace: true,
                      })
                    }
                  />
                </div>
                {currentServings !== recipe.servings && (
                  <p className="meta">
                    <span className="badge badge-warning">
                      {m["recipes.scaled_badge"]()}
                    </span>{" "}
                    {m["recipes.scaled_hint"]({
                      servings: currentServings,
                      base: recipe.servings,
                    })}
                  </p>
                )}
                {recipe.ingredients.length === 0 && (
                  <p>{m["recipes.no_ingredients"]()}</p>
                )}
                {groupBySection(recipe.ingredients).map((group) => (
                  <div key={group.section ?? ""}>
                    {group.section && (
                      <h3 className="section-label">{group.section}</h3>
                    )}
                    <ul className="ingredient-rows">
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
                          currentServings,
                        );
                        return (
                          <li key={line.id}>
                            <span className="ingredient-quantity">
                              {quantity ?? ""}
                              {parsed.unitText && ` ${parsed.unitText}`}
                            </span>
                            <span>
                              {name}
                              {line.note && (
                                <span className="meta">, {line.note}</span>
                              )}
                              {line.optional && (
                                <span className="meta">
                                  {" "}
                                  · {m["recipes.optional"]()}
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </section>
              <section className="recipe-column">
                <div className="recipe-column-heading">
                  <h2>{m["recipes.steps"]()}</h2>
                  {recipe.steps.length > 0 && (
                    <span className="meta">
                      {m["recipes.steps_count"]({ count: recipe.steps.length })}
                    </span>
                  )}
                </div>
                {recipe.steps.length === 0 ? (
                  <p>{m["recipes.no_steps"]()}</p>
                ) : (
                  <>
                    <ol className="step-rows">
                      {recipe.steps.map((step, index) => (
                        <li key={step.id}>
                          <span className="step-number">{index + 1}</span>
                          <span className="recipe-step-text">{step.text}</span>
                        </li>
                      ))}
                    </ol>
                    <Button asChild variant="outline" className="w-full">
                      <Link
                        to="/cook/$id"
                        params={{ id }}
                        search={{ servings }}
                      >
                        {m["recipes.cook_view_link"]({
                          count: recipe.steps.length,
                        })}
                      </Link>
                    </Button>
                  </>
                )}
                {recipe.nutrition && (
                  <RecipeNutrition
                    key={`${recipe.id}-nutrition`}
                    nutrition={recipe.nutrition}
                  />
                )}
              </section>
            </div>
          </>
        )
      )}
    </article>
  );
}
