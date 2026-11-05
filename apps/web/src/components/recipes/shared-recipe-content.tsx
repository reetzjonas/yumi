import { parseIngredientLine, unitSchema } from "@yumi/shared";
import type { InferResponseType } from "hono/client";
import { Clock, Link as LinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ServingsStepper } from "@/components/recipes/servings-selector";
import { api } from "@/lib/api";
import {
  formatMinutes,
  formatScaledQuantity,
  groupBySection,
  ingredientName,
  totalMinutes,
} from "@/lib/recipes";
import { m } from "@/paraglide/messages";

type SharedRecipe = InferResponseType<
  (typeof api)["recipe-shares"][":token"]["$get"],
  200
>;

export function SharedRecipeContent({
  recipe,
  token,
  servings,
  onServingsChange,
  children,
}: {
  readonly recipe: SharedRecipe;
  readonly token: string;
  readonly servings: number;
  readonly onServingsChange: (servings: number) => void;
  readonly children: ReactNode;
}) {
  const sourceUrl =
    recipe.sourceUrl && /^https?:\/\//i.test(recipe.sourceUrl)
      ? recipe.sourceUrl
      : null;
  const ingredients = recipe.ingredients.map((line, position) => ({
    ...line,
    position,
  }));
  const steps = recipe.steps.map((step, position) => ({ ...step, position }));
  return (
    <article className="recipe-detail shared-recipe">
      {recipe.imageKey && (
        <img
          className="recipe-hero"
          src={api["recipe-shares"][":token"].image[":variant"].$path({
            param: { token, variant: "full" },
          })}
          referrerPolicy="no-referrer"
          alt={m["recipes.image_alt"]({ title: recipe.title })}
          width={1200}
          height={750}
        />
      )}
      <h1 className="recipe-title">{recipe.title}</h1>
      {recipe.description && (
        <p className="recipe-description">{recipe.description}</p>
      )}
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
          <span className="badge" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      {children}
      <div className="recipe-columns">
        <section className="recipe-column">
          <div className="recipe-column-heading">
            <h2>{m["recipes.ingredients"]()}</h2>
            <ServingsStepper value={servings} onChange={onServingsChange} />
          </div>
          {servings !== recipe.servings && (
            <p className="meta">
              {m["recipes.scaled_hint"]({ servings, base: recipe.servings })}
            </p>
          )}
          {ingredients.length === 0 && <p>{m["recipes.no_ingredients"]()}</p>}
          {groupBySection(ingredients).map((group) => (
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
                  const unit = unitSchema.safeParse(line.unit).data ?? null;
                  const quantity = formatScaledQuantity(
                    line.quantity,
                    unit,
                    recipe.servings,
                    servings,
                  );
                  return (
                    <li key={line.position}>
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
            {steps.length > 0 && (
              <span className="meta">
                {m["recipes.steps_count"]({ count: steps.length })}
              </span>
            )}
          </div>
          {steps.length === 0 ? (
            <p>{m["recipes.no_steps"]()}</p>
          ) : (
            <ol className="step-rows">
              {steps.map((step) => (
                <li key={step.position}>
                  <span className="step-number">{step.position + 1}</span>
                  <span className="recipe-step-text">{step.text}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      {sourceUrl && (
        <a
          className="shared-source"
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          <LinkIcon size={18} aria-hidden="true" />
          {new URL(sourceUrl).hostname.replace(/^www\./, "")}
        </a>
      )}
    </article>
  );
}
