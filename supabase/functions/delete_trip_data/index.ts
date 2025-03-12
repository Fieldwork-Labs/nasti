// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow any origin
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Allowed methods
  "Access-Control-Allow-Headers": "Content-Type, Authorization", // Allowed headers
  "Access-Control-Max-Age": "86400", // Cache preflight response for 1 day
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
    })
  }

  try {
    // Check if the requester is an admin of the organisation
    const authHeader = req.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders })
    }

    const token = authHeader.split("Bearer ")[1]

    // Verify the JWT token
    const { data: userData, error: userError } =
      await supabase.auth.getUser(token)

    if (userError || !userData.user) {
      return new Response("Invalid or expired token", {
        status: 401,
        headers: corsHeaders,
      })
    }

    const currentUserId = userData.user.id

    // Check if the user is an admin in the organisation
    const { data: orgUser, error: orgUserError } = await supabase
      .from("org_user")
      .select("*, organisation(name)")
      .eq("user_id", currentUserId)
      .single()

    if (orgUserError || !orgUser || orgUser.role !== "Admin") {
      console.error("User is not admin or error thrown in checking", {
        error: orgUserError,
      })
      return new Response("Forbidden: Requires admin role", {
        status: 403,
        headers: corsHeaders,
      })
    }

    const { tripId } = await req.json()

    if (!tripId) {
      return new Response("Missing tripId", {
        status: 400,
        headers: corsHeaders,
      })
    }

    // first delete the trip collection photos
    // get all collection photos
    const { data: collectionPhotos, error: collectionPhotosError } =
      await supabase
        .from("collection_photo")
        .select("id, url, collection(trip_id)")
        .eq("collection.trip_id", tripId)

    if (collectionPhotosError) {
      return new Response("Failed to get photos", {
        status: 500,
        headers: corsHeaders,
      })
    }

    if (collectionPhotos && collectionPhotos.length > 0) {
      const filePaths = collectionPhotos.map(({ url }) => url)
      const { error: storageError } = await supabase.storage
        .from("collection-photos")
        .remove(filePaths)

      if (storageError) {
        console.error("Storage delete error:", storageError)
        return new Response(
          `Failed to delete photos: ${storageError.message}`,
          {
            status: 500,
            headers: corsHeaders,
          },
        )
      }

      // then delete the photo database entries
      const { error: deletePhotosError } = await supabase
        .from("collection_photo")
        .delete()
        .in(
          "id",
          collectionPhotos.map(({ id }) => id),
        )

      if (deletePhotosError) {
        console.error("Database delete error:", deletePhotosError)
        return new Response(
          `Failed to delete photos: ${deletePhotosError.message}`,
          {
            status: 500,
            headers: corsHeaders,
          },
        )
      }
    }
    // delete the trip collections
    const { error: deleteCollectionsError } = await supabase
      .from("collection")
      .delete()
      .eq("trip_id", tripId)

    if (deleteCollectionsError) {
      console.error("Database delete error:", deleteCollectionsError)
      return new Response("Failed to delete collections", {
        status: 500,
        headers: corsHeaders,
      })
    }

    // delete the trip species
    const { error: deleteSpeciesError } = await supabase
      .from("trip_species")
      .delete()
      .eq("trip_id", tripId)

    if (deleteSpeciesError) {
      console.error("Database delete error:", deleteSpeciesError)
      return new Response("Failed to delete species", {
        status: 500,
        headers: corsHeaders,
      })
    }

    // delete the trip members
    const { error: deleteMembersError } = await supabase
      .from("trip_member")
      .delete()
      .eq("trip_id", tripId)

    if (deleteMembersError) {
      console.error("Database delete error:", deleteMembersError)
      return new Response("Failed to delete members", {
        status: 500,
        headers: corsHeaders,
      })
    }
    // delete the trip
    const { error: deleteTripError } = await supabase
      .from("trip")
      .delete()
      .eq("id", tripId)

    if (deleteTripError) {
      console.error("Database delete error:", deleteTripError)
      return new Response("Failed to delete trip", {
        status: 500,
        headers: corsHeaders,
      })
    }

    return new Response("Trip deleted successfully", {
      status: 200,
      headers: corsHeaders,
    })
  } catch (error) {
    console.error("Unexpected error:", error)
    return new Response("Internal Server Error", {
      status: 500,
      headers: corsHeaders,
    })
  }
})
