import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PHOTO_IMPORT_MIME_TYPES, photoImportUploadError } from "@yumi/shared";
import { Camera, Link2, Share2 } from "lucide-react";
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

  const pending = load.variables?.kind;
  const photoInputsDisabled = load.isPending || !capabilities.data?.photos;

  return (
    <>
      <PageHeader
        title={m["recipes.import_title"]()}
        back={<BackLink to="/recipes" label={m.nav_recipes()} />}
      />
      {load.data && householdId ? (
        <>
          <section ref={reviewRef} className="import-card import-review">
            <h2 className="import-card-title">
              {load.variables?.kind === "url"
                ? new URL(load.variables.url).hostname.replace(/^www\./, "")
                : m["recipes.import_pages_count"]({
                    count:
                      load.variables?.kind === "photos"
                        ? load.variables.files.length
                        : 0,
                  })}
            </h2>
            <p role="status" className="import-card-text">
              {m["recipes.import_review"]()}
            </p>
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
        <div className="import-cards">
          <section className="import-card" aria-labelledby={`${id}-link`}>
            <div className="import-card-head">
              <span className="import-card-icon">
                <Link2 aria-hidden="true" size={20} />
              </span>
              <div>
                <h2 id={`${id}-link`} className="import-card-title">
                  {m["recipes.import_link_title"]()}
                </h2>
                <p id={`${id}-hint`} className="import-card-text">
                  {m["recipes.import_link_text"]()}
                </p>
              </div>
            </div>
            <form
              className="import-card-form"
              aria-busy={load.isPending}
              onSubmit={(event) => {
                event.preventDefault();
                const url = String(
                  new FormData(event.currentTarget).get("url") ?? "",
                ).trim();
                if (url) load.mutate({ kind: "url", url });
              }}
            >
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
              <Button
                type="submit"
                className="w-full"
                disabled={load.isPending || !householdId}
              >
                {load.isPending && pending === "url"
                  ? m["recipes.importing"]()
                  : m["recipes.import_submit"]()}
              </Button>
              <FormError
                message={
                  load.isError && pending === "url"
                    ? errorMessage(load.error)
                    : null
                }
              />
            </form>
          </section>
          <section className="import-card" aria-labelledby={`${id}-share`}>
            <div className="import-card-head">
              <span className="import-card-icon">
                <Share2 aria-hidden="true" size={20} />
              </span>
              <div>
                <h2 id={`${id}-share`} className="import-card-title">
                  {m["recipes.import_share_title"]()}
                </h2>
                <p className="import-card-text">
                  {m["recipes.import_share_text"]()}
                </p>
              </div>
            </div>
          </section>
          <section className="import-card" aria-labelledby={`${id}-photos`}>
            <div className="import-card-head">
              <span className="import-card-icon">
                <Camera aria-hidden="true" size={20} />
              </span>
              <div>
                <h2 id={`${id}-photos`} className="import-card-title">
                  {m["recipes.import_photo_title"]()}
                </h2>
                <p id={`${id}-photos-hint`} className="import-card-text">
                  {capabilities.data?.photos === false
                    ? m["errors.photo_import_unavailable"]()
                    : m["recipes.import_photos_hint"]()}
                </p>
              </div>
            </div>
            <form
              className="import-card-form"
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
              <div className="recipe-image-actions">
                <label
                  className="button button-outline file-button"
                  aria-disabled={photoInputsDisabled}
                >
                  <input
                    className="sr-only"
                    type="file"
                    accept={PHOTO_IMPORT_MIME_TYPES.join(",")}
                    capture="environment"
                    aria-describedby={`${id}-photos-hint`}
                    disabled={photoInputsDisabled}
                    onChange={(event) => {
                      addPhotos(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <Camera aria-hidden="true" size={18} />
                  {photos.length > 0
                    ? m["recipes.import_take_photo"]()
                    : m["recipes.import_photo_capture"]()}
                </label>
                <label
                  className="button button-ghost file-button"
                  aria-disabled={photoInputsDisabled}
                >
                  <input
                    className="sr-only"
                    type="file"
                    accept={PHOTO_IMPORT_MIME_TYPES.join(",")}
                    multiple
                    aria-describedby={`${id}-photos-hint`}
                    disabled={photoInputsDisabled}
                    onChange={(event) => {
                      addPhotos(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  {m["recipes.import_gallery"]()}
                </label>
              </div>
              {photos.length > 0 && (
                <>
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
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full"
                    disabled={load.isPending || !householdId}
                  >
                    {load.isPending && pending === "photos"
                      ? m["recipes.importing_photos"]()
                      : m["recipes.import_photos_submit"]()}
                  </Button>
                </>
              )}
              <FormError message={uploadError} />
              <FormError
                message={
                  load.isError && pending === "photos"
                    ? errorMessage(load.error)
                    : null
                }
              />
              <FormError
                message={
                  capabilities.isError ? errorMessage(capabilities.error) : null
                }
              />
            </form>
          </section>
          <Button asChild variant="outline" className="w-full">
            <Link to="/recipes/new">{m["recipes.import_manual"]()}</Link>
          </Button>
        </div>
      )}
    </>
  );
}
