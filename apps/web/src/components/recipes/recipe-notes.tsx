import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NotebookPen } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import type { RecipeDetail } from "@/lib/recipes";
import { m } from "@/paraglide/messages";

/**
 * Household notes for the next time a recipe is cooked. Shows the note with an
 * edit action; `startEditing` opens the field right away (cooking finish screen).
 */
export function RecipeNotes({
  recipe,
  startEditing = false,
}: {
  recipe: Pick<RecipeDetail, "id" | "cookingNotes">;
  startEditing?: boolean;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(startEditing);
  const [text, setText] = useState(recipe.cookingNotes ?? "");
  const save = useMutation({
    mutationFn: async (notes: string | null) =>
      ensureOk(
        await api.recipes[":id"].notes.$put({
          param: { id: recipe.id },
          json: { notes },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setEditing(false);
    },
  });
  if (!editing)
    return recipe.cookingNotes ? (
      <section className="recipe-notes" aria-labelledby={`${id}-title`}>
        <div className="recipe-notes-main">
          <h2 id={`${id}-title`} className="recipe-notes-title">
            <NotebookPen size={16} aria-hidden="true" />
            {m["recipes.notes_title"]()}
          </h2>
          <p className="recipe-notes-text">{recipe.cookingNotes}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setText(recipe.cookingNotes ?? "");
            setEditing(true);
          }}
        >
          {m["recipes.notes_edit"]()}
        </Button>
      </section>
    ) : (
      <Button
        type="button"
        variant="ghost"
        className="recipe-notes-add"
        onClick={() => setEditing(true)}
      >
        <NotebookPen size={18} aria-hidden="true" />
        {m["recipes.notes_add"]()}
      </Button>
    );
  return (
    <form
      className="recipe-notes-form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(text.trim() || null);
      }}
    >
      <label htmlFor={`${id}-notes`} className="field-label">
        {m["recipes.notes_title"]()}
      </label>
      <textarea
        id={`${id}-notes`}
        rows={3}
        maxLength={4000}
        value={text}
        placeholder={m["recipes.notes_placeholder"]()}
        disabled={save.isPending}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="recipe-actions">
        <Button
          type="submit"
          variant="outline"
          disabled={
            save.isPending || text.trim() === (recipe.cookingNotes ?? "")
          }
        >
          {m["recipes.notes_save"]()}
        </Button>
        {!startEditing && (
          <Button
            type="button"
            variant="ghost"
            disabled={save.isPending}
            onClick={() => setEditing(false)}
          >
            {m["queue.cancel"]()}
          </Button>
        )}
        {save.isSuccess && startEditing && (
          <span className="meta" role="status">
            {m["recipes.notes_saved"]()}
          </span>
        )}
      </div>
      {save.isError && (
        <p className="form-error" role="alert">
          {errorMessage(save.error)}
        </p>
      )}
    </form>
  );
}
