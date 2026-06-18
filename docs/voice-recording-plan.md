# Voice Recording Feature — Implementation Plan

## Library: `@capgo/capacitor-audio-recorder` v8

- Compatible with Capacitor 8 (matches the project's `@capacitor/core` 8.4.0)
- Provides `startRecording`, `stopRecording`, `pauseRecording`, `resumeRecording`, `cancelRecording`
- `stopRecording()` returns `{ uri, duration }` on native (iOS/Android) and `{ blob, duration }` on Web
- Has `requestPermissions()` / `checkPermissions()` for microphone access
- `getCurrentAmplitude()` for live waveform visualization
- Events: `recordingError`, `recordingPaused`, `recordingStopped`

## Storage & sync strategy — on-demand streaming (diverges from photos)

The photo feature eagerly downloads every photo for a trip into IndexedDB (`usePhotosForTrip.ts:107-150`) and plays back from a base64 data URL. **Audio deliberately does NOT follow this pattern.** Audio files are far larger (minutes of m4a = MBs to tens of MBs each), so eagerly caching every recording for every trip onto every device would blow up device storage. Instead:

- **PowerSync syncs only the metadata row** (`url` storage path + `mime_type` + `duration_ms`), never the binary blob — same as photos. The `url` column is a Supabase Storage path, not a display URL.
- **The originating device** plays from its local recording (native `uri` / Blob URL) so playback works immediately, offline, and before the upload completes. It does **not** persist the blob in IndexedDB as base64.
- **Every other device** streams on demand: `<audio src={signedUrl}>` pointed at a Supabase Storage signed URL, fetched lazily when the user actually plays a recording. No background pre-fetch, no trip-wide eager cache.
- **Consequence, stated explicitly:** recordings made on another device are **not playable offline**. This is the accepted tradeoff. If offline playback of others' recordings is later needed, add an optional per-recording "save for offline" action rather than eager caching.

This means the IndexedDB blob store that photos use (`persistFiles.ts` / `imageDB`) is **not replicated** for audio. Playback resolves a URL: local blob URL if present, otherwise a freshly-signed Storage URL.

---

## Phase 1: Database & Storage Layer

### 1.1 Supabase migration — new tables

Create a new migration file (e.g., `20260618000000_create_audio_tables.sql`):

```sql
-- collection_audio table (mirrors collection_photo)
CREATE TABLE collection_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
  url text NOT NULL,
  mime_type text NOT NULL,        -- e.g. 'audio/m4a', 'audio/webm', 'audio/mp4'
  caption text,
  duration_ms integer,
  uploaded_at timestamptz DEFAULT now()
);

-- scouting_notes_audio table (mirrors scouting_notes_photos)
CREATE TABLE scouting_notes_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scouting_notes_id uuid NOT NULL REFERENCES scouting_notes(id) ON DELETE CASCADE,
  url text NOT NULL,
  mime_type text NOT NULL,        -- e.g. 'audio/m4a', 'audio/webm', 'audio/mp4'
  caption text,
  duration_ms integer,
  uploaded_at timestamptz DEFAULT now()
);
```

Key differences from photos:
- `duration_ms integer` — recording duration (returned by the plugin's `stopRecording`).
- `mime_type text NOT NULL` — **required because the three platforms produce different containers/codecs.** iOS capgo → m4a/aac, Android → m4a (aac/amr depending on config), Web `MediaRecorder` → webm/opus on Chrome but mp4 on Safari. The `url` extension, upload `contentType`, and streaming `Content-Type` must all be derived from this per-recording value, never hardcoded. Without it, cross-platform streaming mis-serves content-type and playback breaks.

### 1.2 RLS policies

Replicate the same org-scoped pattern used for `collection_photo` and `scouting_notes_photos` (see `20250508012445_collection_and_photos_rls_upgrade.sql` and `20251222035436_scouting_notes.sql`).

### 1.3 Supabase Storage bucket

Create a `collection-audio` bucket with the same org-scoped access policy as `collection-photos`. Both collection and scouting_notes audio can share this bucket (as photos currently do), using path-based separation: `{org_id}/collections/{id}/...` and `{org_id}/scouting-notes/{id}/...`.

### 1.4 PowerSync local schema

Add to `apps/mobile/src/lib/powersync/schema.ts`:

```ts
const collection_audio = new Table(
  {
    caption: column.text,
    collection_id: column.text,
    duration_ms: column.integer,
    mime_type: column.text,
    uploaded_at: column.text,
    url: column.text,
  },
  { indexes: { collection: ["collection_id"] } },
)

const scouting_notes_audio = new Table(
  {
    caption: column.text,
    scouting_notes_id: column.text,
    duration_ms: column.integer,
    mime_type: column.text,
    uploaded_at: column.text,
    url: column.text,
  },
  { indexes: { scouting_notes: ["scouting_notes_id"] } },
)
```

Register in `AppSchema`, export types.

### 1.5 Upload priority

Add to `TABLE_UPLOAD_PRIORITY` in `connector.ts`:

```ts
collection_audio: 2,
scouting_notes_audio: 2,
```

### 1.6 TypeScript types

Add to `packages/common/types/index.ts`:

```ts
export type CollectionAudio = {
  id: string
  collection_id: string
  url: string
  mime_type: string
  caption: string | null
  duration_ms: number | null
  uploaded_at: string
}
export type ScoutingNoteAudio = {
  id: string
  scouting_notes_id: string
  url: string
  mime_type: string
  caption: string | null
  duration_ms: number | null
  uploaded_at: string
}
```

### 1.7 PowerSync sync rules

Update the PowerSync sync configuration to include the new audio tables, matching the pattern used for photo tables.

---

## Phase 2: Platform Service Layer

### 2.1 `AudioService` interface

Add to `apps/mobile/src/platform/types.ts`. Unlike a one-shot `recordAudio()` promise, the interface models a **recording session** so the UI can drive live pause/resume/cancel and amplitude polling (see Phase 4.1):

```ts
export type AudioRecording = {
  file: File            // the captured audio, ready for TUS upload
  duration_ms: number
  mime_type: string     // e.g. 'audio/m4a' | 'audio/webm' | 'audio/mp4'
}

export interface AudioSession {
  /** Poll while recording for live waveform amplitude (0.0–1.0). */
  getAmplitude(): Promise<number>
  pause(): Promise<void>
  resume(): Promise<void>
  /** Finalize and keep. Resolves with the recording, or null if nothing was captured. */
  stop(): Promise<AudioRecording | null>
  /** Discard the recording entirely. */
  cancel(): Promise<void>
}

export interface AudioService {
  checkPermissions(): Promise<boolean>
  requestPermissions(): Promise<boolean>
  /** Begin a new recording session. Rejects if permission denied or hardware busy. */
  startRecording(): Promise<AudioSession>
}
```

`mime_type` is determined by the platform at capture time and flows from here into the PowerSync row, the TUS upload `contentType`, and the streaming `Content-Type` (see Phase 1.1).

### 2.2 Native implementation

Create `apps/mobile/src/platform/native/audio.ts` implementing `AudioService` / `AudioSession` via `@capgo/capacitor-audio-recorder`:

- `startRecording()` → `requestPermissions()` then `startRecording()`; returns an `AudioSession` that wraps the plugin.
- `AudioSession.getAmplitude()` → `getCurrentAmplitude()`
- `AudioSession.pause()/resume()` → `pauseRecording()/resumeRecording()`
- `AudioSession.stop()` → `stopRecording()` which returns `{ uri, duration }` on native; convert the `uri` to a `File` by reading the native file (same approach as `pickedPhotoToFile` in `photos.ts`). Resolve `mime_type` from the native output format (m4a/aac) — confirm the actual container the plugin writes on iOS vs Android and set the value accordingly.
- `AudioSession.cancel()` → `cancelRecording()`
- Listen for `recordingError` and surface it as a rejected `stop()`/session error.

### 2.3 Web implementation

Create `apps/mobile/src/platform/web/audio.ts`:

- Use the plugin's Web support (MediaRecorder internally) or fall back to raw `MediaRecorder`.
- The plugin returns `{ blob, duration }` on Web; wrap the blob into a `File`.
- **Set `mime_type` from `MediaRecorder.mimeType`** rather than assuming webm — Chrome produces `audio/webm;codecs=opus`, Safari produces `audio/mp4`. This value flows into the row + upload + streaming content-type.

### 2.4 Platform index

Export `audio` from `platform/native/index.ts` / `platform/web/index.ts`

### 2.5 iOS/Android permissions config

- **iOS**: Add `NSMicrophoneUsageDescription` to `Info.plist`
- **Android**: Add `RECORD_AUDIO` permission to `AndroidManifest.xml`
- No plan for background recording so no background permission required

---

## Phase 3: Upload, Playback URL & Hooks

> **No IndexedDB blob store for audio.** Unlike photos (`persistFiles.ts` / `imageDB`), audio does **not** eagerly cache blobs as base64. The originating device plays from its local recording; all other devices stream on demand. This is the core storage tradeoff described at the top of this plan.

### 3.1 Local recording cache (originating device only)

Create `apps/mobile/src/lib/persistAudio.ts` — a **small, opt-in** local cache, not an eager mirror of remote audio:

- IndexedDB database `"audio-store"`, object store `"audios"`, key `id`, value `{ id, blob: Blob, mime_type: string, timestamp }`. Store **Blob, not base64** — base64 is ~33% larger and wasteful for multi-MB files; `<audio>` plays a Blob URL directly.
- Functions: `putAudio(id, blob, mimeType)`, `getAudio(id)`, `deleteAudio(id)`.
- **Written only when a recording is captured on this device** (so it plays immediately, offline, and before upload completes). Never written for audio synced down from elsewhere.
- An optional future "save for offline" action (see top of plan) could also write here for remote audio; out of scope for v1.

### 3.2 `useAudiosMutate` hook

Create `apps/mobile/src/hooks/useAudiosMutate.ts`, mirroring `usePhotosMutate.ts` structure:

- `createAudioMutation` — writes the PowerSync local row first (`url` storage path, `mime_type`, `duration_ms`), caches the captured blob via `putAudio` (so the originating device can play locally), then uploads to Supabase Storage via TUS using the same `uploadFile` function with `contentType` set from the recording's `mime_type` (not hardcoded).
- `deleteAudioMutation` — deletes from Storage + PowerSync local DB + the local `audio-store` entry if present.
- `updateCaptionMutation` — updates caption via `psUpdate`.
- Upload path pattern: `{org_id}/{entityType}s/{entityId}/{audioId}.{ext}`, where `ext` is derived from `mime_type`.
- Upload progress tracking (same `queryClient.setQueryData` pattern as photos).

### 3.3 Audio query hooks

- `useCollectionAudio(collectionId)` — query `collection_audio` from PowerSync.
- `useScoutingNoteAudio(scoutingNoteId)` — query `scouting_notes_audio` from PowerSync.
- `useAudiosForTrip(tripId)` — query audio rows for a trip from PowerSync. **Crucially: does NOT pre-fetch or cache any blobs.** It returns row metadata only (id, url, mime_type, duration_ms). This is the deliberate departure from `usePhotosForTrip`, which eagerly downloads every missing photo. Audio streaming happens lazily per-recording in `useAudioUrl`.
- `useAudioUrl({ audioId, url, mimeType })` — resolves a playable URL on demand:
  1. If a local blob exists in `audio-store` (originating device), return a Blob URL (`URL.createObjectURL(blob)`), revoked on unmount.
  2. Otherwise, fetch a **signed Storage URL on demand** (`supabase.storage.from('collection-audio').createSignedUrl(url, expiresIn)`) and return it for `<audio src={signedUrl}>`.
  3. On a 403/expired-URL error from the `<audio>` element during playback, regenerate the signed URL (see signed-URL expiry note below).

### 3.4 Signed-URL expiry for streaming

Photos use a 10-minute signed window because each photo is a one-shot download into IndexedDB. Audio streams over a longer playback session and the user may seek later, so a 10-minute window can expire mid-session. Strategy:

- Use a longer `expiresIn` for playback signed URLs (e.g. 1 hour) than the photo download window.
- Regenerate on demand: if the `<audio>` element errors after the URL expires, `useAudioUrl` re-fetches a fresh signed URL and updates `src`. Do not assume a single signed URL lasts indefinitely.

---

## Phase 4: UI Components

### 4.1 `AudioRecorder` widget

Create `apps/mobile/src/components/common/AudioRecorder.tsx`:

This is the core recording UI. States: idle → recording → paused → stopped.

- **Idle state**: "Record Audio" button (microphone icon)
- **Recording state**: pulsing red indicator, timer showing elapsed time, live amplitude waveform (polling `AudioSession.getAmplitude()` at ~100ms), pause/stop/cancel buttons
- **Paused state**: resume/stop/cancel buttons
- **Stopped state**: shows recorded audio with playback, "Re-record" / "Keep" buttons
- Uses the `AudioService` platform abstraction internally: holds the current `AudioSession` from `startRecording()`, drives it via `pause/resume/getAmplitude`, and on "Keep" calls `stop()` to obtain the `{ file, duration_ms, mime_type }` recording (or `cancel()` to discard).
- Returns the `AudioRecording` (`{ file, duration_ms, mime_type }`) to the parent via callback.

### 4.2 `AudioPlayer` component

Create `apps/mobile/src/components/common/AudioPlayer.tsx`:

- Renders an `<audio>` element with playback controls (play/pause, seek, time display, duration), sourcing `src` from `useAudioUrl({ audioId, url, mimeType })` — local Blob URL on the originating device, streamed signed URL elsewhere.
- Shows upload progress bar (reusing the same progress pattern as `Photo`) — only meaningful on the originating device while the TUS upload is in flight.
- Optional caption display.
- Compact row layout (not a grid like photos — audio items are list items).
- Surface a non-blocking state when streaming fails (expired/offline): "This recording isn't available offline / couldn't be loaded" rather than a silent broken player.

### 4.3 `AudiosForm` component

Create `apps/mobile/src/components/common/AudiosForm.tsx`:

- Composes `AudiosEditField` + `AudioRecorder`
- Tracks `AudioChanges`: `{ add: UploadAudioVariables[], keep: ExistingAudio[] }`, where `UploadAudioVariables` carries `{ file, duration_ms, mime_type }` from the recorder.
- Same pattern as `PhotosForm`

### 4.4 `AudiosEditField` component

Create `apps/mobile/src/components/common/AudiosEditField.tsx`:

- Lists existing audio recordings with `AudioPlayer` for each
- Remove button + optional caption editing
- Same pattern as `PhotosEditField`

---

## Phase 5: Route Integration

### 5.1 Collection new/edit forms

- `apps/mobile/src/routes/_private/trips/$id/collections/new.tsx` — add `<AudiosForm>` alongside `<PhotosForm>`, track audio changes in state, fire `createAudioMutation` after entity creation
- `apps/mobile/src/routes/_private/trips/$id/collections/$collectionId/edit.tsx` — add `<AudiosForm initialAudios={...} />`, handle add/keep/remove audio changes on submit

### 5.2 Scouting Notes new/edit forms

- `apps/mobile/src/routes/_private/trips/$id/scouting-notes/new.tsx` — same pattern
- `apps/mobile/src/routes/_private/trips/$id/scouting-notes/$scoutingNoteId/edit.tsx` — same pattern

### 5.3 Collection detail page

`apps/mobile/src/routes/_private/trips/$id/collections/$collectionId/index.tsx`:

- Add an "Audio" tab alongside "Photos" and "Map" (or show audio inline above photos)
- Each audio recording rendered with `AudioPlayer`

### 5.4 Scouting Notes detail page

`apps/mobile/src/routes/_private/trips/$id/scouting-notes/$scoutingNoteId/index.tsx`:

- Same integration as collection detail

---

## Phase 0: Install & Configure Plugin

> **Run this before Phase 2** — the platform service layer (Phase 2) imports `@capgo/capacitor-audio-recorder`, so the dependency and native projects must be set up first.

```
pnpm add @capgo/capacitor-audio-recorder --filter @nasti/mobile
npx cap sync
```

- iOS: Add `NSMicrophoneUsageDescription` to `ios/App/App/Info.plist`
- Android: Add `<uses-permission android:name="android.permission.RECORD_AUDIO" />` to `android/app/src/main/AndroidManifest.xml`

---

## Wishlist: On-Device Voice Transcription

This would be a future enhancement after the recording feature is stable:

- **iOS**: Use Apple's `Speech` framework via a Capacitor plugin (e.g., `@capacitor-community/speech-recognition` or a custom native wrapper) for on-device transcription with `SFSpeechRecognizer`
- **Android**: Use `android.speech.SpeechRecognizer` (available offline on most devices with language packs downloaded)
- **Web**: Use the Web Speech API (`SpeechRecognition`) where supported, or skip transcription
- Would add a `transcription text` column to the `collection_audio` / `scouting_notes_audio` tables
- UI: show transcription text below each audio player, with a "Transcribe" button to trigger on-demand transcription
- Implementation approach: trigger transcription immediately after `stopRecording()`, store the result alongside the audio record
- **Known constraints to design around:**
  - **iOS `SFSpeechRecognizer`** caps a single recognition request at ~1 minute; longer recordings must be chunked (with small overlap gaps) and the results stitched. On-device availability also varies by device/OS — fall back to server-side or disable the button where unavailable.
  - **Android `SpeechRecognizer`** offline recognition requires the user to have downloaded the relevant language pack; otherwise it needs network access. Check availability before offering on-device transcription.
  - **Web Speech API** is inconsistent (Chrome-only, networked, short clips) — treat as best-effort or skip.

---

## Summary of New Files

| File                                                         | Purpose                                  |
| ------------------------------------------------------------ | ---------------------------------------- |
| `supabase/migrations/20260618000000_create_audio_tables.sql` | DB tables, RLS, storage bucket           |
| `apps/mobile/src/platform/audio.ts`                          | Cross-platform audio recording via Cap-go plugin (shared — the plugin abstracts native/web) |
| `apps/mobile/src/lib/audio.ts`                               | MIME-type ↔ file-extension helpers      |
| `apps/mobile/src/lib/persistAudio.ts`                        | Opt-in local Blob cache (originating device only) |
| `apps/mobile/src/hooks/useAudiosMutate.ts`                   | CRUD mutations for audio records (TUS upload from `mime_type`) |
| `apps/mobile/src/hooks/useAudioUrl.ts`                       | Resolves local Blob URL or on-demand signed URL for streaming |
| `apps/mobile/src/hooks/useCollectionAudio.ts`                | Query collection audio (metadata only)   |
| `apps/mobile/src/hooks/useScoutingNoteAudio.ts`              | Query scouting note audio (metadata only) |
| `apps/mobile/src/components/common/AudioRecorder.tsx`        | Recording widget UI                      |
| `apps/mobile/src/components/common/AudioPlayer.tsx`          | Playback UI component                    |
| `apps/mobile/src/components/common/AudiosForm.tsx`           | Form wrapper (add + edit)                |
| `apps/mobile/src/components/common/AudiosEditField.tsx`      | Existing audio list in forms             |

## Modified Files

| File                                                                  | Change                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------- |
| `apps/mobile/src/platform/types.ts`                                   | Add `AudioService` / `AudioSession` interfaces        |
| `apps/mobile/src/lib/powersync/schema.ts`                             | Add `collection_audio`, `scouting_notes_audio` tables (incl. `mime_type`) |
| `apps/mobile/src/lib/powersync/connector.ts`                          | Add upload priority for audio tables                  |
| `packages/common/types/index.ts`                                      | Add `CollectionAudio`, `ScoutingNoteAudio` types (incl. `mime_type`) |
| `apps/mobile/src/routes/.../collections/new.tsx`                      | Add `<AudiosForm>`                                    |
| `apps/mobile/src/routes/.../collections/$collectionId/edit.tsx`       | Add `<AudiosForm>`                                    |
| `apps/mobile/src/routes/.../scouting-notes/new.tsx`                   | Add `<AudiosForm>`                                    |
| `apps/mobile/src/routes/.../scouting-notes/$scoutingNoteId/edit.tsx`  | Add `<AudiosForm>`                                    |
| `apps/mobile/src/routes/.../collections/$collectionId/index.tsx`      | Add audio playback section                            |
| `apps/mobile/src/routes/.../scouting-notes/$scoutingNoteId/index.tsx` | Add audio playback section                            |
| `apps/mobile/package.json`                                            | Add `@capgo/capacitor-audio-recorder`                 |
