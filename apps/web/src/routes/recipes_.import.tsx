import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useId } from "react";
import { Field, FormError } from "@/components/auth-layout";
import { PageHeader } from "@/components/page";
import { RecipeEditor } from "@/components/recipes/recipe-editor";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { useMe } from "@/lib/session";
import { shareTargetSearch } from "@/lib/share-target";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/recipes_/import")({
  validateSearch: shareTargetSearch,
  component: ImportRecipePage,
});

function ImportRecipePage() {
  const { url } = Route.useSearch();
  return <ImportRecipe key={url} sharedUrl={url} />;
}

function imageFile(image: { mimeType: string; dataBase64: string }) {
  const bytes = Uint8Array.from(atob(image.dataBase64), (char) =>
    char.charCodeAt(0),
  );
  const extension = image.mimeType.split("/")[1] ?? "img";
  return new File([bytes], `import.${extension}`, { type: image.mimeType });
}

function ImportRecipe({ sharedUrl }: { sharedUrl?: string }) {
  const id = useId();
  const householdId = useMe()?.activeHouseholdId;
  const load = useMutation({
    mutationFn: async (url: string) => {
      const result = await (
        await ensureOk(await api.recipes.import.$post({ json: { url } }))
      ).json();
      return {
        ...result,
        file: result.image ? imageFile(result.image) : undefined,
        key: crypto.randomUUID(),
      };
    },
  });

  return (
    <>
      <PageHeader title={m["recipes.import_title"]()} />
      {load.data && householdId ? (
        <>
          <section className="section import-review">
            <p role="status">{m["recipes.import_review"]()}</p>
            {load.data.warnings.length > 0 && (
              <p className="muted">{m["recipes.import_image_missing"]()}</p>
            )}
            <Button type="button" variant="ghost" onClick={() => load.reset()}>
              {m["recipes.import_other"]()}
            </Button>
          </section>
          <RecipeEditor
            key={load.data.key}
            householdId={householdId}
            draft={load.data.draft}
            initialImage={load.data.file}
          />
        </>
      ) : (
        <form
          className="section import-form"
          onSubmit={(event) => {
            event.preventDefault();
            const url = String(
              new FormData(event.currentTarget).get("url") ?? "",
            ).trim();
            if (url) load.mutate(url);
          }}
        >
          <p id={`${id}-hint`} className="section-description">
            {m["recipes.import_hint"]()}
          </p>
          <Field
            id="url"
            label={m["recipes.import_url"]()}
            type="url"
            inputMode="url"
            placeholder="https://"
            defaultValue={sharedUrl ?? ""}
            required
            maxLength={2000}
            aria-describedby={`${id}-hint`}
            disabled={load.isPending}
          />
          <FormError message={load.isError ? errorMessage(load.error) : null} />
          <div className="recipe-actions">
            <Button type="submit" disabled={load.isPending || !householdId}>
              <Download aria-hidden="true" size={20} />
              {load.isPending
                ? m["recipes.importing"]()
                : m["recipes.import_submit"]()}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
