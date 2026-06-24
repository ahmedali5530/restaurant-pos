// SurrealQL FETCH cannot express truly unbounded recursion, so nested modifier
// `dish` links are resolved down to a generous bounded depth that effectively
// covers any real menu. Deeper nodes still render with their fallback name.
export const MODIFIER_FETCH_DEPTH = 3

export const buildModifierFetches = (depth: number): string[] => {
  const fetches: string[] = []
  let path = 'items.modifiers'

  for (let level = 0; level <= depth; level += 1) {
    path += '.selectedModifiers'
    fetches.push(path)
    fetches.push(`${path}.dish`)
    path += '.selectedGroups'
  }

  return fetches
}
