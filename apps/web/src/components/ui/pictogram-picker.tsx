import { PICTOGRAMS, pictogramFile } from "@yumi/shared";
import { useId, useState } from "react";
import { Field } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Pictogram } from "@/components/ui/pictogram";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

export function PictogramPicker({
  defaultValue,
  fallback,
}: {
  readonly defaultValue?: string | null;
  readonly fallback?: string | null;
}) {
  const id = useId();
  const [selected, setSelected] = useState(
    PICTOGRAMS.find(
      ({ emoji }) => pictogramFile(emoji) === pictogramFile(defaultValue),
    )?.emoji ?? null,
  );
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const matches = PICTOGRAMS.filter(({ emoji, de, en }) =>
    `${emoji} ${de} ${en}`.toLocaleLowerCase().includes(query),
  );
  return (
    <fieldset className="pictogram-picker">
      <legend>{m["pictogram.choose"]()}</legend>
      <input type="hidden" name="icon" value={selected ?? ""} />
      <div className="pictogram-picker-current">
        <Pictogram icon={selected} fallback={fallback} size={36} />
        <Button
          type="button"
          variant="outline"
          aria-pressed={selected === null}
          onClick={() => setSelected(null)}
        >
          {m["pictogram.category"]()}
        </Button>
      </div>
      <Field
        id={id}
        label={m["pictogram.search"]()}
        value={search}
        type="search"
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="pictogram-picker-grid">
        {matches.map(({ emoji, de, en }) => {
          const name = getLocale() === "de" ? de : en;
          return (
            <button
              key={emoji}
              type="button"
              className="pictogram-picker-option"
              aria-label={name}
              title={name}
              aria-pressed={selected === emoji}
              onClick={() => setSelected(emoji)}
            >
              <Pictogram icon={emoji} />
            </button>
          );
        })}
      </div>
      {matches.length === 0 && (
        <p role="status" className="muted">
          {m["pictogram.no_results"]()}
        </p>
      )}
    </fieldset>
  );
}
