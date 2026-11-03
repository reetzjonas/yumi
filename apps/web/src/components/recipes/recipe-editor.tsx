import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { recipeInputSchema } from "@yumi/shared";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/auth-layout";
import {
  ImageEditor,
  type ImageSelection,
} from "@/components/recipes/image-editor";
import { IngredientEditor } from "@/components/recipes/ingredient-editor";
import { RecipeFields } from "@/components/recipes/recipe-fields";
import { StepEditor } from "@/components/recipes/step-editor";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import {
  type IngredientRow,
  ingredientInput,
  type StepRow,
  storedIngredient,
} from "@/lib/recipe-editor";
import {
  deleteRecipeImage,
  type RecipeDetail,
  uploadRecipeImage,
} from "@/lib/recipes";
import { m } from "@/paraglide/messages";

export function RecipeEditor({
  recipe,
  draft,
  initialImage,
  householdId,
}: {
  recipe?: RecipeDetail;
  draft?: ReturnType<typeof recipeInputSchema.parse>;
  initialImage?: File;
  householdId: string;
}) {
  const source = recipe ?? draft;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const savedId = useRef(recipe?.id);
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    () => source?.ingredients.map(storedIngredient) ?? [],
  );
  const [steps, setSteps] = useState<StepRow[]>(
    () =>
      source?.steps.map((step) => ({
        key: crypto.randomUUID(),
        text: step.text,
      })) ?? [],
  );
  const [image, setImage] = useState<ImageSelection>({
    file: initialImage ?? null,
    remove: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const save = useMutation({
    mutationKey: ["recipes", householdId, "save"],
    mutationFn: async (json: ReturnType<typeof recipeInputSchema.parse>) => {
      const response = savedId.current
        ? await api.recipes[":id"].$put({
            param: { id: savedId.current },
            json,
          })
        : await api.recipes.$post({ json });
      const saved = await (await ensureOk(response)).json();
      savedId.current = saved.id;
      if (image.file) {
        setUploading(true);
        try {
          await uploadRecipeImage(saved.id, image.file);
        } finally {
          setUploading(false);
        }
      } else if (image.remove && recipe?.imageKey) {
        await deleteRecipeImage(saved.id);
      }
      return saved.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({
        queryKey: ["recipes", householdId],
      });
      toast.success(m["recipes.saved"]());
      await navigate({ to: "/recipes/$id", params: { id } });
    },
    onError: async (cause) => {
      setError(errorMessage(cause));
      await queryClient.invalidateQueries({
        queryKey: ["recipes", householdId],
      });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending || parsing) return;
    setError(null);
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    const minutes = (key: string) => (text(key) ? Number(text(key)) : null);
    let lines: ReturnType<typeof ingredientInput>[];
    try {
      lines = ingredients.map(ingredientInput);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : errorMessage(cause));
      return;
    }
    const input = recipeInputSchema.safeParse({
      title: text("title"),
      description: text("description") || null,
      servings: Number(text("servings")),
      prepMinutes: minutes("prepMinutes"),
      cookMinutes: minutes("cookMinutes"),
      sourceUrl: text("sourceUrl") || null,
      tags: text("tags")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      ingredients: lines,
      steps: steps.map((step) => ({ text: step.text })),
    });
    if (!input.success) {
      setError(m["errors.invalid_input"]());
      return;
    }
    save.mutate(input.data);
  }

  return (
    <form onSubmit={onSubmit}>
      <fieldset className="recipe-form" disabled={save.isPending}>
        <RecipeFields recipe={source} />
        <IngredientEditor
          rows={ingredients}
          setRows={setIngredients}
          onParsingChange={setParsing}
        />
        <StepEditor rows={steps} setRows={setSteps} />
        <ImageEditor
          recipe={recipe}
          value={image}
          onChange={setImage}
          onError={setError}
        />
        <FormError message={error} />
        {uploading && <p role="status">{m["recipes.image_uploading"]()}</p>}
        <div className="recipe-actions">
          <Button type="submit" disabled={save.isPending || parsing}>
            {m["recipes.save"]()}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              savedId.current
                ? navigate({
                    to: "/recipes/$id",
                    params: { id: savedId.current },
                  })
                : navigate({ to: "/recipes" })
            }
          >
            {m["recipes.cancel"]()}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
