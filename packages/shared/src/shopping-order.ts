export type ShoppingOrderEvent = {
  readonly id: string;
  readonly listId: string;
  readonly storeId: string;
  readonly itemId: string;
  readonly ingredientId: string | null;
  readonly categoryId: string | null;
  readonly clientTs: number;
};

export type ShoppingOrderScore = {
  readonly id: string;
  readonly score: number;
  readonly sampleCount: number;
};

export type LearnedShoppingOrder = {
  readonly ingredients: readonly ShoppingOrderScore[];
  readonly categories: readonly ShoppingOrderScore[];
};

export type ShoppingOrderItem = {
  readonly ingredientId: string | null;
  readonly categoryId: string | null;
  readonly checked: boolean;
};

export type ShoppingOrderCategory = {
  readonly id: string;
  readonly defaultPosition: number;
};

const SESSION_GAP_MS = 30 * 60 * 1_000;

function recordSample(
  scores: Map<string, ShoppingOrderScore>,
  id: string,
  position: number,
): void {
  const previous = scores.get(id);
  scores.set(id, {
    id,
    score: previous === undefined ? position : (previous.score + position) / 2,
    sampleCount: (previous?.sampleCount ?? 0) + 1,
  });
}

/** Learns from one store's events after its reset cutoff, supplied by the caller. */
export function learnShoppingOrder(
  events: readonly ShoppingOrderEvent[],
): LearnedShoppingOrder {
  const sessions: ShoppingOrderEvent[][] = [];
  const active = new Map<string, ShoppingOrderEvent[]>();
  const sorted = [...events].sort(
    (a, b) =>
      a.clientTs - b.clientTs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  for (const event of sorted) {
    const key = JSON.stringify([event.listId, event.storeId]);
    const session = active.get(key);
    const previous = session?.at(-1);
    if (
      session === undefined ||
      previous === undefined ||
      event.clientTs - previous.clientTs >= SESSION_GAP_MS
    ) {
      const next = [event];
      sessions.push(next);
      active.set(key, next);
    } else {
      session.push(event);
    }
  }

  const ingredients = new Map<string, ShoppingOrderScore>();
  const categories = new Map<string, ShoppingOrderScore>();
  for (const session of sessions) {
    const unique = new Map<string, ShoppingOrderEvent>();
    for (const event of session) {
      const identity = event.ingredientId ?? event.itemId;
      if (!unique.has(identity)) unique.set(identity, event);
    }
    if (unique.size < 2) continue;

    const categoryPositions = new Map<string, number[]>();
    let rank = 0;
    for (const [id, event] of unique) {
      const position = rank / (unique.size - 1);
      recordSample(ingredients, id, position);
      if (event.categoryId !== null) {
        const positions = categoryPositions.get(event.categoryId) ?? [];
        positions.push(position);
        categoryPositions.set(event.categoryId, positions);
      }
      rank += 1;
    }
    for (const [id, positions] of categoryPositions) {
      const mean =
        positions.reduce((sum, position) => sum + position, 0) /
        positions.length;
      recordSample(categories, id, mean);
    }
  }
  return {
    ingredients: [...ingredients.values()],
    categories: [...categories.values()],
  };
}

/** Returns a new stable order, with checked items after all unchecked items. */
export function sortShoppingItems<T extends ShoppingOrderItem>(
  items: readonly T[],
  categories: readonly ShoppingOrderCategory[],
  manualOrder: readonly string[] | null | undefined,
  learned: ReturnType<typeof learnShoppingOrder>,
): T[] {
  const defaults = new Map(
    [...categories]
      .sort((a, b) => a.defaultPosition - b.defaultPosition)
      .map((category, index) => [
        category.id,
        index / Math.max(categories.length - 1, 1),
      ]),
  );
  const manual = new Map((manualOrder ?? []).map((id, index) => [id, index]));
  const ingredients = new Map(
    learned.ingredients.map((sample) => [sample.id, sample]),
  );
  const categoryScores = new Map(
    learned.categories.map((sample) => [sample.id, sample.score]),
  );
  const scoreOf = (item: T): number => {
    const defaultScore = defaults.get(item.categoryId ?? "") ?? 1;
    if (manual.size > 0) {
      return manual.get(item.categoryId ?? "") ?? manual.size + defaultScore;
    }
    const ingredient = ingredients.get(item.ingredientId ?? "");
    return (
      (ingredient !== undefined && ingredient.sampleCount >= 2
        ? ingredient.score
        : undefined) ??
      categoryScores.get(item.categoryId ?? "") ??
      defaultScore
    );
  };
  return [...items].sort(
    (a, b) => Number(a.checked) - Number(b.checked) || scoreOf(a) - scoreOf(b),
  );
}
