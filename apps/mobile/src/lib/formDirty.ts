/*
 * Whether a react-hook-form `dirtyFields` object holds any dirty field.
 * Nested objects and arrays (eg. multi selects) are searched for a dirty leaf,
 * so an empty array doesn't read as a change.
 */
export const hasDirtyValues = (dirtyFields: unknown): boolean => {
  if (Array.isArray(dirtyFields)) return dirtyFields.some(hasDirtyValues)
  if (typeof dirtyFields === "object" && dirtyFields !== null)
    return Object.values(dirtyFields).some(hasDirtyValues)
  return Boolean(dirtyFields)
}
