import { useState } from "react";
import { m } from "@/paraglide/messages";

export interface ChecklistRow {
  key: string;
  label: string;
  amount: string;
  detail?: string;
  staple: boolean;
}

/** Rows start checked, pantry staples unchecked; only the user's changes are stored. */
export function useChecklist(rows: ChecklistRow[]) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const isChecked = (row: ChecklistRow) => overrides[row.key] ?? !row.staple;
  return {
    isChecked,
    selected: rows.filter(isChecked).map((row) => row.key),
    toggle: (key: string, checked: boolean) =>
      setOverrides((current) => ({ ...current, [key]: checked })),
    reset: () => setOverrides({}),
  };
}

export function IngredientChecklist({
  rows,
  checklist,
  disabled,
}: {
  rows: ChecklistRow[];
  checklist: ReturnType<typeof useChecklist>;
  disabled: boolean;
}) {
  const groups = [
    {
      legend: m["shopping.pick_ingredients"](),
      hint: null,
      rows: rows.filter((row) => !row.staple),
    },
    {
      legend: m["pantry.check_title"](),
      hint: m["pantry.pick_hint"](),
      rows: rows.filter((row) => row.staple),
    },
  ];
  return (
    <>
      {groups
        .filter((group) => group.rows.length)
        .map((group) => (
          <fieldset
            key={group.legend}
            className="picker-list"
            disabled={disabled}
          >
            <legend className="field-label">{group.legend}</legend>
            {group.hint && <p className="meta">{group.hint}</p>}
            {group.rows.map((row) => (
              <label key={row.key} className="picker-row">
                <input
                  className="picker-input"
                  type="checkbox"
                  checked={checklist.isChecked(row)}
                  onChange={(event) =>
                    checklist.toggle(row.key, event.target.checked)
                  }
                />
                <span className="picker-row-main">
                  <span className="picker-row-title">{row.label}</span>
                  {row.detail && <span className="meta">{row.detail}</span>}
                </span>
                {row.amount && (
                  <span className="picker-row-amount">{row.amount}</span>
                )}
              </label>
            ))}
          </fieldset>
        ))}
    </>
  );
}
