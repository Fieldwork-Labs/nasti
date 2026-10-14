# Handoff: collection / scouting note detail modals (web)

Branch: `feat/testing-work-custody-migrations-cleanup` (3 local commits ahead of origin, not pushed).

## Goal

Improve the collection and scouting note detail modals in `apps/web`: make them scrollable on small screens, move the map to its own tab, rearrange the action buttons, fix the edit flow, and show audio recordings (made in the mobile app) on the web.

## Status

Committed (not pushed):
- `bc63b09` collection modal: scrollable (`max-h-[90vh] overflow-y-auto` via a new optional `className` prop on `Modal`), map moved to its own "Map" tab, stray `0` from `photos?.length &&` fixed.
- `ac3e08f` same for the scouting note modal.
- `982bd51` button rework on both detail modals (X icon top right, edit/delete at the bottom, admin only); scouting note edit modal fixed (it rendered nothing because no `tripId` reached the form provider); **Save** in both edit modals now saves and closes instead of going to the photos stage.

Uncommitted (finished, typechecks and lints clean, not browser-tested):
- New Audio tab on both detail modals:
  - `apps/web/src/hooks/useEntityAudio.ts`: `useCollectionAudio`, `useScoutingNoteAudio`. They query `collection_audio` / `scouting_notes_audio` where `uploaded_at IS NOT NULL` and sign URLs against the `collection-audio` bucket (1 hour).
  - `apps/web/src/components/common/AudioTab.tsx`: list with caption, m:ss duration, upload time and a native `<audio controls preload="none">`.
  - Tab appears only when recordings exist. Edits in `CollectionDetailModal.tsx` and `ScoutingNoteDetailModal.tsx`.

## Decisions

- Audio investigation: the web app had no audio code at all (only generated types), so "not displayed" is the cause. The mobile upload pipeline (`apps/mobile/src/hooks/useAudiosMutate.ts`, `lib/powersync/attachments.ts`) looks correct, and its mime types match the bucket allow-list in `supabase/migrations/20260618000000_create_audio_tables.sql`. Real data was not checked.
- Web audio is read-only (no upload, delete or caption edit), as agreed.
- Rows with null `uploaded_at` are hidden because their file does not exist in storage yet.
- Edit-mode forms: the provider's `onSuccess` only moves to the photos stage when there is no `instance`. The footer buttons decide what happens next (`handleSave` calls `e.preventDefault()`, awaits `onSubmit()`, then `close()`; this stops Radix closing the dialog before the save finishes).
- The scouting note wizard takes `tripId` from `instance.trip_id`.
- Only the scouting note wizard was fixed this way. The collection wizard (`UpdateCollectionWizardModal`) still gets `tripId` from route params (`/_private/trips/$id/`), which probably breaks when a collection modal is opened outside the trip page (e.g. a species page). Untested, offered to the user, not done.

## Dead ends

- Scouting note edit button was not missing. It existed but was invisible (white icon on a transparent background). The real bug was the missing `tripId`.

## Files

- `packages/ui/components/modal.tsx`: shared `Modal`, now takes `className`. It memoises `title` on first render, so anything in the title must use stable callbacks (`useOpenClose` callbacks are stable).
- `apps/web/src/components/collections/CollectionDetailModal.tsx`, `CollectionFormModal.tsx`, `CollectionFormContext.tsx`
- `apps/web/src/components/scoutingNotes/ScoutingNoteDetailModal.tsx`, `ScoutingNoteFormModal.tsx`, `ScoutingNoteFormContext.tsx`
- `apps/web/src/hooks/useEntityAudio.ts`, `apps/web/src/components/common/AudioTab.tsx` (new, uncommitted)

## Verification

- `cd apps/web && npx tsc --noEmit -p .`: clean as of the last run.
- `npx eslint` on the four audio-related files: clean. Prettier clean.
- Commits run lint-staged (prettier and eslint) via a hook.
- Nothing has been checked in a browser. Needed: scrolling on a short viewport, the Map and Audio tabs, edit then Save closing the modal, "Save and Update Photos" going to the photos stage, the scouting note edit modal opening.

## Next steps

1. Commit the audio tab work (the user usually asks for a single "general" commit message style: `feat(web): ...`).
2. Browser-test the modals above with `pnpm dev --filter=@nasti/web`. Be careful: formatting TanStack route files while `pnpm dev` runs can clobber them (see memory).
3. Check that web users can read `collection_audio`, `scouting_notes_audio` and the `collection-audio` bucket under current RLS. The squashed migration `20260911000005_permissions_rls_and_integrations.sql` was not read for SELECT policies. If the Audio tab is empty for known recordings, start there, then confirm `uploaded_at` is set on the rows.
4. Optionally change the collection update wizard to use `instance.trip_id` instead of route params.
5. Push when the user asks.

## Open questions

- Whether to fix the collection wizard's `tripId` source (see above).
- Whether the user wants web audio upload, delete or caption editing later.

## Standing instructions

- Use `Boolean(x)`, not `!!x`. No semicolons. Avoid `any`.
- Do not apply database changes or regenerate types. The user reviews and applies migrations themselves.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Commit only when asked.
