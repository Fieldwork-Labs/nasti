// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow any origin
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Allowed methods
  "Access-Control-Allow-Headers": "Content-Type, Authorization", // Allowed headers
  "Access-Control-Max-Age": "86400", // Cache preflight response for 1 day
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
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    // Get the request body
    const { token, email, password } = await req.json()

    // Validate inputs
    if (!token || !email || !password) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Get the invitation
    const { data: invitation, error: invitationError } = await supabaseClient
      .from("invitation")
      .select("*")
      .eq("token", token)
      .single()

    if (invitationError || !invitation) {
      return new Response(JSON.stringify({ error: "Invalid invitation" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Check if invitation is expired
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Invitation has expired" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Check if invitation is already accepted
    if (invitation.accepted_at) {
      return new Response(
        JSON.stringify({ error: "Invitation already accepted" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Check if email matches invitation
    if (invitation.email !== email) {
      return new Response(
        JSON.stringify({ error: "Email does not match invitation" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Create user if they don't exist
    const { data: authData, error: authError } =
      await supabaseClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: invitation.name },
      })

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Link user to organisation
    const { error: linkError } = await supabaseClient.from("org_user").insert({
      user_id: authData.user.id,
      organisation_id: invitation.organisation_id,
      role: "Member",
    })

    if (linkError) {
      return new Response(
        JSON.stringify({ error: "Failed to link user to organisation" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // // create user profile for new user
    // const { error: profileError } = await supabaseClient
    //   .from("profile")
    //   .insert({
    //     user_id: authData.user.id,
    //     name: invitation.name,
    //   })
    // if (profileError) {
    //   return new Response(
    //     JSON.stringify({ error: "Failed to create profile" }),
    //     {
    //       status: 500,
    //       headers: { ...corsHeaders, "Content-Type": "application/json" },
    //     }
    //   )
    // }

    // Mark invitation as accepted
    const { error: updateError } = await supabaseClient
      .from("invitation")
      .update({
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invitation.id)

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to update invitation" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Return success response
    return new Response(
      JSON.stringify({
        message: "Invitation accepted successfully",
        user: authData.user,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (_) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
