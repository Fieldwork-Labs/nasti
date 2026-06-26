/**
 * Audio MIME-type <-> file-extension helpers.
 *
 * The three platforms produce different containers/codecs (iOS/Android capgo →
 * m4a/aac, Web MediaRecorder → webm/opus on Chrome, mp4 on Safari). The
 * recording's `mime_type` is the source of truth for the storage path
 * extension, the TUS upload contentType, and the streaming Content-Type.
 */

/** Strip parameters (e.g. `;codecs=opus`) and lowercase a MIME type. */
export const normalizeMimeType = (mime: string): string =>
  mime.split(";")[0].trim().toLowerCase()

const MIME_TO_EXT: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
}

const EXT_TO_MIME: Record<string, string> = {
  m4a: "audio/mp4",
  aac: "audio/aac",
  webm: "audio/webm",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp4: "audio/mp4",
}

export const mimeToExtension = (mime: string): string =>
  MIME_TO_EXT[normalizeMimeType(mime)] ?? "m4a"

export const extensionToMime = (ext: string): string => {
  const normalized = ext.toLowerCase().replace(/^\./, "")
  return EXT_TO_MIME[normalized] ?? "audio/mp4"
}

/** Extract the file extension (no dot, lowercased) from a path/URI. */
export const extensionFromPath = (path: string): string => {
  const clean = path.split("?")[0].split("#")[0]
  const ext = clean.split(".").pop() ?? ""
  return ext.toLowerCase()
}
