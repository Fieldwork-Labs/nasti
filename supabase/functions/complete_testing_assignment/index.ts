// Edge Function: Complete Testing Assignment
// Mark a testing assignment as completed (moves from Todo to Inventory)

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import type { Database } from "@/common-types/database"

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

    const supabaseClient = createClient<Database>(
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
    const { assignment_id } = await req.json()

    // Validate inputs
    if (!assignment_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: assignment_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Get user's organisation
    const { data: orgMembership } = await supabaseClient
      .from("org_user")
      .select("organisation_id")
      .eq("user_id", user.id)
      .single()

    if (!orgMembership) {
      return new Response(
        JSON.stringify({ error: "User is not a member of any organisation" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const userOrgId = orgMembership.organisation_id

    // Get the assignment
    const { data: assignment, error: fetchError } = await supabaseClient
      .from("batch_testing_assignment")
      .select("*")
      .eq("id", assignment_id)
      .single()

    if (fetchError || !assignment) {
      return new Response(JSON.stringify({ error: "Assignment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Verify user's org is the testing org for this assignment
    if (assignment.assigned_to_org_id !== userOrgId) {
      return new Response(
        JSON.stringify({
          error: "This assignment does not belong to your organisation",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Check if already completed
    if (assignment.completed_at) {
      return new Response(
        JSON.stringify({ error: "Assignment already completed" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Check if already returned (can't mark as completed if already returned)
    if (assignment.returned_at) {
      return new Response(
        JSON.stringify({
          error: "Assignment already returned, cannot mark as completed",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Update assignment with completed timestamp
    const { data: updatedAssignment, error: updateError } = await supabaseClient
      .from("batch_testing_assignment")
      .update({
        completed_at: new Date().toISOString(),
      })
      .eq("id", assignment_id)
      .select()
      .single()

    if (updateError) {
      return new Response(
        JSON.stringify({
          error: `Failed to update assignment: ${updateError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    return new Response(
      JSON.stringify({
        message: "Assignment marked as completed successfully",
        assignment: updatedAssignment,
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
