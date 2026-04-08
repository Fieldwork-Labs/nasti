// Edge Function: Accept Link Request
// Testing organisation accepts a link request from a General organisation

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  try {
    // Create Supabase client with user's auth
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    )

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Get request body
    const { request_id } = await req.json()

    if (!request_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: request_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Get the link request
    const { data: linkRequest, error: fetchError } = await supabaseClient
      .from("organisation_link_request")
      .select("*")
      .eq("id", request_id)
      .single()

    if (fetchError || !linkRequest) {
      return new Response(JSON.stringify({ error: "Link request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Check if already accepted
    if (linkRequest.accepted_at) {
      return new Response(
        JSON.stringify({ error: "Link request already accepted" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Verify user is an admin of the testing org
    const { data: orgMembership } = await supabaseClient
      .from("org_user")
      .select("organisation_id, role")
      .eq("user_id", user.id)
      .eq("organisation_id", linkRequest.testing_org_id)
      .single()

    if (!orgMembership) {
      return new Response(
        JSON.stringify({
          error: "User is not a member of the testing organisation",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    if (orgMembership.role !== "Admin") {
      return new Response(
        JSON.stringify({
          error: "Only admins can accept link requests",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Create the organisation link
    const { data: newLink, error: linkError } = await supabaseClient
      .from("organisation_link")
      .insert({
        general_org_id: linkRequest.general_org_id,
        testing_org_id: linkRequest.testing_org_id,
        can_process: linkRequest.can_process,
        can_test: linkRequest.can_test,
        created_by: user.id,
      })
      .select()
      .single()

    if (linkError) {
      return new Response(
        JSON.stringify({
          error: `Failed to create organisation link: ${linkError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Mark request as accepted
    const { error: updateError } = await supabaseClient
      .from("organisation_link_request")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by: user.id,
      })
      .eq("id", request_id)

    if (updateError) {
      // If we fail to update the request, we should delete the link we just created
      await supabaseClient
        .from("organisation_link")
        .delete()
        .eq("id", newLink.id)

      return new Response(
        JSON.stringify({
          error: `Failed to update request: ${updateError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    return new Response(
      JSON.stringify({
        message: "Link request accepted successfully",
        link: newLink,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: `Internal server error: ${(error as Error).message}`,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }
})
