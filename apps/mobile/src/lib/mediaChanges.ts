type MediaItem = { id: string; caption?: string | null }

type MediaChanges<T extends MediaItem> = {
  add: Array<unknown>
  keep: Array<T>
}

/*
 * Whether photos or audio have been added, removed, or had their captions
 * edited since the form was opened.
 */
export const hasMediaChanges = <T extends MediaItem>(
  initial: Array<T>,
  changes: MediaChanges<T>,
) =>
  changes.add.length > 0 ||
  initial.some((item) => !changes.keep.find((kept) => kept.id === item.id)) ||
  changes.keep.some(
    (kept) =>
      initial.find((item) => item.id === kept.id)?.caption !== kept.caption,
  )
