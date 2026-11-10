/** The "Mix all" chip's id. It is never a real topic id. */
export const MIX_ALL = "*";

/**
 * Tap a topic chip: adds it (after the others, so the first pick stays the main one), removes it, or refuses to remove
 * the last one. `MIX_ALL` selects every id in `all`, in list order.
 */
export function togglePool(value: string[], id: string, all: string[]): string[] {
  if (id === MIX_ALL) return [...all];
  if (!all.includes(id)) return value;
  if (!value.includes(id)) return [...value, id];
  return value.length > 1 ? value.filter((v) => v !== id) : value;
}
