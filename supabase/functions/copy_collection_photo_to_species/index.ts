// Edge function to copy collection photos to species profile photos
// This avoids the client having to download and re-upload the photo

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AuthMiddleware } from "../_shared/jwt/default.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
}

Deno.serve((r) =>
  AuthMiddleware(r, async (req) => {
    try {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        })
      }

      if (req.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: corsHeaders,
        })
      }

      // Parse request body
      const { collectionPhotoId, speciesId } = await req.json()

      if (!collectionPhotoId || !speciesId) {
        return new Response("Missing collectionPhotoId or speciesId", {
          status: 400,
          headers: corsHeaders,
        })
      }

      // Initialize Supabase client with service role key for admin access
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      )

      // Verify authentication
      const authHeader = req.headers.get("Authorization")
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response("Unauthorized", {
          status: 401,
          headers: corsHeaders,
        })
      }

      const token = authHeader.split("Bearer ")[1]
      const { data: userData, error: userError } =
        await supabase.auth.getUser(token)

      if (userError || !userData.user) {
        return new Response("Invalid or expired token", {
          status: 401,
          headers: corsHeaders,
        })
      }

      const userId = userData.user.id

      // Get user's organisation
      const { data: orgUser, error: orgUserError } = await supabase
        .from("org_user")
        .select("organisation_id")
        .eq("user_id", userId)
        .single()

      if (orgUserError || !orgUser) {
        return new Response("User not found in organisation", {
          status: 403,
          headers: corsHeaders,
        })
      }

      const organisationId = orgUser.organisation_id

      // Get the collection photo details
      const { data: collectionPhoto, error: photoError } = await supabase
        .from("collection_photo")
        .select("*, collection!inner(trip_id, trip!inner(organisation_id))")
        .eq("id", collectionPhotoId)
        .single()

      if (photoError || !collectionPhoto) {
        return new Response("Collection photo not found", {
          status: 404,
          headers: corsHeaders,
        })
      }

      // Verify the collection photo belongs to user's organisation
      if (collectionPhoto.collection.trip.organisation_id !== organisationId) {
        return new Response("Forbidden: Photo not in your organisation", {
          status: 403,
          headers: corsHeaders,
        })
      }

      // Verify the species belongs to user's organisation
      const { data: species, error: speciesError } = await supabase
        .from("species")
        .select("organisation_id")
        .eq("id", speciesId)
        .single()

      if (speciesError || !species) {
        return new Response("Species not found", {
          status: 404,
          headers: corsHeaders,
        })
      }

      if (species.organisation_id !== organisationId) {
        return new Response("Forbidden: Species not in your organisation", {
          status: 403,
          headers: corsHeaders,
        })
      }

      // Check if species already has 10 photos
      const { count: photoCount } = await supabase
        .from("species_photo")
        .select("*", { count: "exact", head: true })
        .eq("species_id", speciesId)

      if (photoCount && photoCount >= 10) {
        return new Response("Species already has maximum of 10 photos", {
          status: 400,
          headers: corsHeaders,
        })
      }

      // Download the file from collection-photos bucket
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("collection-photos")
        .download(collectionPhoto.url)

      if (downloadError || !fileData) {
        return new Response("Failed to download collection photo", {
          status: 500,
          headers: corsHeaders,
        })
      }

      // Generate new file path for species photo
      const photoId = crypto.randomUUID()
      const fileExt = collectionPhoto.url.split(".").pop()
      const newFilePath = `${organisationId}/species/${speciesId}/${photoId}.${fileExt}`

      // Upload to species-profile-photos bucket
      const { error: uploadError } = await supabase.storage
        .from("species-profile-photos")
        .upload(newFilePath, fileData, {
          contentType: fileData.type,
          cacheControl: "3600",
          upsert: false,
        })

      if (uploadError) {
        return new Response(
          `Failed to upload species photo: ${uploadError.message}`,
          {
            status: 500,
            headers: corsHeaders,
          },
        )
      }

      // Get the next display order
      const { data: existingPhotos } = await supabase
        .from("species_photo")
        .select("display_order")
        .eq("species_id", speciesId)
        .order("display_order", { ascending: false })
        .limit(1)

      const nextDisplayOrder =
        existingPhotos && existingPhotos.length > 0
          ? existingPhotos[0].display_order + 1
          : 0

      // Create database record
      const { data: newPhoto, error: insertError } = await supabase
        .from("species_photo")
        .insert({
          id: photoId,
          species_id: speciesId,
          organisation_id: organisationId,
          url: newFilePath,
          caption: collectionPhoto.caption,
          source_type: "collection_photo",
          source_reference: collectionPhotoId,
          display_order: nextDisplayOrder,
        })
        .select()
        .single()

      if (insertError) {
        // Clean up uploaded file if database insert fails
        await supabase.storage
          .from("species-profile-photos")
          .remove([newFilePath])

        return new Response(
          `Failed to create species photo record: ${insertError.message}`,
          {
            status: 500,
            headers: corsHeaders,
          },
        )
      }

      return new Response(JSON.stringify(newPhoto), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      })
    } catch (error) {
      console.error("Unexpected error:", error)
      return new Response(
        `Internal Server Error: ${(error as Error).message}`,
        {
          status: 500,
          headers: corsHeaders,
        },
      )
    }
  }),
)
