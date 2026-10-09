import { useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import type { CollectionAudio, ScoutingNoteAudio } from "@nasti/common/types"

const AUDIO_BUCKET = "collection-audio"
const SIGNED_URL_EXPIRES_IN = 60 * 60

export type AudioWithSignedUrl<T> = T & { signedUrl: string }

const signAudio = async <T extends { url: string }>(
  rows: T[],
): Promise<AudioWithSignedUrl<T>[]> => {
  if (rows.length === 0) return []
  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrls(
      rows.map(({ url }) => url),
      SIGNED_URL_EXPIRES_IN,
    )
  if (error) throw error

  const signedByPath = new Map(
    data.map(({ path, signedUrl }) => [path, signedUrl]),
  )
  return rows.flatMap((row) => {
    const signedUrl = signedByPath.get(row.url)
    return signedUrl ? [{ ...row, signedUrl }] : []
  })
}

export type CollectionAudioSignedUrl = AudioWithSignedUrl<CollectionAudio>
export type ScoutingNoteAudioSignedUrl = AudioWithSignedUrl<ScoutingNoteAudio>

export const useCollectionAudio = (collectionId?: string) =>
  useQuery({
    queryKey: ["collectionAudio", "byCollection", collectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collection_audio")
        .select("*")
        // rows without uploaded_at are still waiting to upload from the device
        .not("uploaded_at", "is", null)
        .eq("collection_id", collectionId as string)
        .order("uploaded_at", { ascending: false })
      if (error) throw error
      return signAudio(data)
    },
    enabled: Boolean(collectionId),
    // goes stale 1 min before signed url expires
    staleTime: 60 * 59 * 1000,
  })

export const useScoutingNoteAudio = (scoutingNoteId?: string) =>
  useQuery({
    queryKey: ["scoutingNoteAudio", "byScoutingNote", scoutingNoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scouting_notes_audio")
        .select("*")
        .not("uploaded_at", "is", null)
        .eq("scouting_notes_id", scoutingNoteId as string)
        .order("uploaded_at", { ascending: false })
      if (error) throw error
      return signAudio(data)
    },
    enabled: Boolean(scoutingNoteId),
    staleTime: 60 * 59 * 1000,
  })
