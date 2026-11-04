import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PHOTO_IMPORT_MIME_TYPES, photoImportUploadError } from "@yumi/shared";
import { Download } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Field, FormError } from "@/components/auth-layout";
import { BackLink, PageHeader } from "@/components/page";
import { RecipeEditor } from "@/components/recipes/recipe-editor";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ApiError, ensureOk, errorMessage } from "@/lib/api-error";
import { useMe } from "@/lib/session";
import { shareTargetSearch } from "@/lib/share-target";
import { m } from "@/paraglide/messages";
import "@/photo-import.css";

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
  const [mode, setMode] = useState<"url" | "photos">("url");
  const [photos, setPhotos] = useState<{ id: string; file: File }[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const capabilities = useQuery({
    queryKey: ["recipe-import-capabilities", householdId],
    enabled: Boolean(householdId),
    queryFn: async () =>
      (await ensureOk(await api.recipes.import.capabilities.$get())).json(),
  });
  const load = useMutation({
    mutationFn: async (
      input: { kind: "url"; url: string } | { kind: "photos"; files: File[] },
    ) => {
      const response =
        input.kind === "url"
          ? await api.recipes.import.$post({ json: { url: input.url } })
          : await api.recipes.import.photos.$post({
              form: { "photos[]": input.files },
            });
      const result = await (await ensureOk(response)).json();
      return {
        ...result,
        file: result.image ? imageFile(result.image) : undefined,
        key: crypto.randomUUID(),
      };
    },
  });

  useEffect(() => {
    if (load.data) reviewRef.current?.scrollIntoView({ block: "start" });
  }, [load.data]);

  function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const additions = Array.from(files);
    const error = photoImportUploadError([
      ...photos.map((photo) => photo.file),
      ...additions,
    ]);
    setUploadError(error ? errorMessage(new ApiError(error)) : null);
    load.reset();
    if (!error)
      setPhotos((current) => [
        ...current,
        ...additions.map((file) => ({ id: crypto.randomUUID(), file })),
      ]);
  }

  return (
    <>
      <PageHeader
        title={m["recipes.import_title"]()}
        back={<BackLink to="/recipes" label={m.nav_recipes()} />}
      />
      {load.data && householdId ? (
        <>
          <section ref={reviewRef} className="section import-review">
            <p role="status">{m["recipes.import_review"]()}</p>
            {load.data.warnings.length > 0 && (
              <p className="muted">{m["recipes.import_image_missing"]()}</p>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                load.reset();
                setPhotos([]);
                setUploadError(null);
              }}
            >
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
        <section className="section import-form">
          <fieldset
            className="recipe-actions"
            aria-label={m["recipes.import_source"]()}
          >
            <Button
              type="button"
              variant="outline"
              aria-pressed={mode === "url"}
              disabled={load.isPending}
              onClick={() => {
                setMode("url");
                load.reset();
              }}
            >
              {m["recipes.import_from_url"]()}
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-pressed={mode === "photos"}
              disabled={load.isPending}
              onClick={() => {
                setMode("photos");
                load.reset();
              }}
            >
              {m["recipes.import_from_photos"]()}
            </Button>
          </fieldset>
          {mode === "url" ? (
            <form
              aria-busy={load.isPending}
              onSubmit={(event) => {
                event.preventDefault();
                const url = String(
                  new FormData(event.currentTarget).get("url") ?? "",
                ).trim();
                if (url) load.mutate({ kind: "url", url });
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
              <div className="recipe-actions">
                <Button type="submit" disabled={load.isPending || !householdId}>
                  <Download aria-hidden="true" size={20} />
                  {load.isPending
                    ? m["recipes.importing"]()
                    : m["recipes.import_submit"]()}
                </Button>
              </div>
            </form>
          ) : (
            <form
              aria-busy={load.isPending}
              onSubmit={(event) => {
                event.preventDefault();
                const files = photos.map((photo) => photo.file);
                const error = photoImportUploadError(files);
                setUploadError(
                  error ? errorMessage(new ApiError(error)) : null,
                );
                if (!error) load.mutate({ kind: "photos", files });
              }}
            >
              <p id={`${id}-photos-hint`} className="section-description">
                {m["recipes.import_photos_hint"]()}
              </p>
              {capabilities.data?.photos === false && (
                <p role="status">{m["errors.photo_import_unavailable"]()}</p>
              )}
              <Field
                id={`${id}-photos`}
                label={m["recipes.import_choose_photos"]()}
                type="file"
                accept={PHOTO_IMPORT_MIME_TYPES.join(",")}
                multiple
                aria-describedby={`${id}-photos-hint`}
                disabled={load.isPending || !capabilities.data?.photos}
                onChange={(event) => {
                  addPhotos(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
              <Field
                id={`${id}-camera`}
                label={m["recipes.import_take_photo"]()}
                type="file"
                accept={PHOTO_IMPORT_MIME_TYPES.join(",")}
                capture="environment"
                aria-describedby={`${id}-photos-hint`}
                disabled={load.isPending || !capabilities.data?.photos}
                onChange={(event) => {
                  addPhotos(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
              {photos.length > 0 && (
                <ol
                  className="photo-import-pages"
                  aria-label={m["recipes.import_pages"]()}
                >
                  {photos.map((photo) => (
                    <li key={photo.id}>
                      <span>{photo.file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={load.isPending}
                        aria-label={m["recipes.import_remove_photo"]({
                          name: photo.file.name,
                        })}
                        onClick={() => {
                          setPhotos((current) =>
                            current.filter((item) => item.id !== photo.id),
                          );
                          setUploadError(null);
                          load.reset();
                        }}
                      >
                        {m["recipes.import_remove"]()}
                      </Button>
                    </li>
                  ))}
                </ol>
              )}
              <FormError message={uploadError} />
              <div className="recipe-actions">
                <Button
                  type="submit"
                  variant={
                    capabilities.data?.photos === false ? "outline" : "default"
                  }
                  disabled={
                    load.isPending ||
                    !householdId ||
                    !capabilities.data?.photos ||
                    photos.length === 0
                  }
                >
                  <Download aria-hidden="true" size={20} />
                  {load.isPending
                    ? m["recipes.importing_photos"]()
                    : m["recipes.import_photos_submit"]()}
                </Button>
              </div>
            </form>
          )}
          <FormError message={load.isError ? errorMessage(load.error) : null} />
          {mode === "photos" && (
            <FormError
              message={
                capabilities.isError ? errorMessage(capabilities.error) : null
              }
            />
          )}
          <div className="recipe-actions">
            <Button
              asChild
              variant={
                mode === "photos" && capabilities.data?.photos === false
                  ? "default"
                  : "outline"
              }
            >
              <Link to="/recipes/new">{m["recipes.import_manual"]()}</Link>
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
