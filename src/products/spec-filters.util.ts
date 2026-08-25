export function normalizeSpecName(name: string): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function canonicalizeSpecDisplayName(name: string): string {
  const trimmed = (name || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return '';
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function parseSpecsQuery(raw?: string): Record<string, string[]> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, string[]> = {};
    for (const [name, values] of Object.entries(parsed)) {
      const normalizedName = canonicalizeSpecDisplayName(name);
      if (!normalizedName || !Array.isArray(values)) {
        continue;
      }
      const cleaned = values
        .map((value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''))
        .filter((value) => value.length > 0);
      if (cleaned.length > 0) {
        const key = normalizedName;
        const existing = result[key] || [];
        result[key] = [...new Set([...existing, ...cleaned])];
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function buildSpecValueMap(
  specs: Array<{ name?: string; value?: string }>,
): Map<string, string[]> {
  const grouped = new Map<string, Set<string>>();

  for (const spec of specs) {
    const key = normalizeSpecName(spec.name || '');
    const value = (spec.value || '').trim().replace(/\s+/g, ' ');
    if (!key || !value) {
      continue;
    }
    if (!grouped.has(key)) {
      grouped.set(key, new Set());
    }
    grouped.get(key)!.add(value);
  }

  const result = new Map<string, string[]>();
  for (const [key, values] of grouped.entries()) {
    result.set(key, [...values].sort((a, b) => a.localeCompare(b, 'ru')));
  }
  return result;
}

export function mergeCategorySpecFilters<T extends {
  id: number;
  name: string;
  image: string | null;
  showInCategory: boolean;
  order: number;
  values: string[];
}>(specs: T[]): T[] {
  const merged = new Map<string, T>();

  for (const spec of specs) {
    const key = normalizeSpecName(spec.name);
    if (!key) {
      continue;
    }
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...spec,
        name: canonicalizeSpecDisplayName(spec.name) || spec.name,
        values: [...new Set(spec.values || [])],
      });
      continue;
    }

    const values = new Set([...(existing.values || []), ...(spec.values || [])]);
    merged.set(key, {
      ...existing,
      id: existing.id || spec.id,
      name: existing.name || canonicalizeSpecDisplayName(spec.name) || spec.name,
      image: existing.image || spec.image,
      showInCategory: existing.showInCategory || spec.showInCategory,
      order: Math.min(existing.order || 0, spec.order || 0),
      values: [...values].sort((a, b) => a.localeCompare(b, 'ru')),
    });
  }

  return [...merged.values()].sort(
    (a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'ru'),
  );
}
