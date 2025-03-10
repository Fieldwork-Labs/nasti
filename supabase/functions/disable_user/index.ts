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

    const { userId } = await req.json()

    if (!userId) {
      return new Response("Missing userId", {
        status: 400,
        headers: corsHeaders,
      })
    }
    // check if the requested org_user exists and is part of the organisation
    const { data: orgUserData, error: orgUserDataError } = await supabase
      .from("org_user")
      .select("*, organisation(name)")
      .eq("user_id", userId)
      .eq("organisation_id", orgUser.organisation_id)
      .single()

    if (orgUserDataError || !orgUserData) {
      return new Response("Invalid org_user_id", {
        status: 400,
        headers: corsHeaders,
      })
    }

    if (orgUserData.is_active === false) {
      return new Response("User is already inactive", {
        status: 400,
        headers: corsHeaders,
      })
    }

    //update user to set inactive
    const { error: updateError } = await supabase
      .from("org_user")
      .update({ is_active: false })
      .eq("id", orgUserData.id)

    if (updateError) {
      console.error("Database update error:", updateError)
      return new Response("Failed to disable organisation user", {
        status: 500,
        headers: corsHeaders,
      })
    }

    // update auth user object to ban for 100 years
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
      orgUserData.user_id,
      { ban_duration: "876000h" }, // 100 years
    )
    if (authUpdateError) {
      console.error("Auth update error:", authUpdateError)
      // in that case we should un-disable the user
      await supabase
        .from("org_user")
        .update({ is_active: true })
        .eq("id", orgUserData.id)

      return new Response("Failed to update user", {
        status: 500,
        headers: corsHeaders,
      })
    }

    return new Response("User disabled", {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    })
  } catch (error) {
    console.error("Unexpected error:", error)
    return new Response("Internal Server Error", {
      status: 500,
      headers: corsHeaders,
    })
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:57321/functions/v1/disable_user' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
