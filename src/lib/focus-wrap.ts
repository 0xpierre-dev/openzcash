/**
 * Where a Tab press should land so focus stays inside a group of `count`
 * tabbable elements. `index` is the focused element's position in the group
 * (-1 when focus sits outside it). Returns the position to focus, or null
 * when the browser's own step already stays inside.
 */
export function wrapFocus(
  count: number,
  index: number,
  backwards: boolean,
): number | null {
  if (count <= 0) return null;
  const first = 0;
  const last = count - 1;
  if (index < first || index > last) return backwards ? last : first;
  if (backwards && index === first) return last;
  if (!backwards && index === last) return first;
  return null;
}
