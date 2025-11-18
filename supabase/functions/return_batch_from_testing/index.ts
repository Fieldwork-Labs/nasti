// Edge Function: Return Batch from Testing
// Testing organisation returns a batch/sample to the original owner

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
    const {
      assignment_id,
      subsample_weight_grams,
      subsample_storage_location_id,
    } = await req.json()

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

    // If subsample weight provided, storage location is required
    if (subsample_weight_grams && !subsample_storage_location_id) {
      return new Response(
        JSON.stringify({
          error:
            "subsample_storage_location_id is required when storing a subsample",
        }),
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
      return new Response(
        JSON.stringify({ error: "Assignment not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
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

    // Check if already returned
    if (assignment.returned_at) {
      return new Response(
        JSON.stringify({ error: "Assignment already returned" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Validate storage location belongs to testing org (if provided)
    if (subsample_storage_location_id) {
      const { data: location, error: locationError } = await supabaseClient
        .from("storage_locations")
        .select("organisation_id")
        .eq("id", subsample_storage_location_id)
        .single()

      if (locationError || !location) {
        return new Response(
          JSON.stringify({ error: "Storage location not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      if (location.organisation_id !== userOrgId) {
        return new Response(
          JSON.stringify({
            error: "Storage location does not belong to your organisation",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }
    }

    // Update assignment with return info
    const updateData: {
      returned_at: string
      subsample_weight_grams?: number
      subsample_storage_location_id?: string
    } = {
      returned_at: new Date().toISOString(),
    }

    if (subsample_weight_grams) {
      updateData.subsample_weight_grams = subsample_weight_grams
    }

    if (subsample_storage_location_id) {
      updateData.subsample_storage_location_id = subsample_storage_location_id
    }

    const { data: updatedAssignment, error: updateError } =
      await supabaseClient
        .from("batch_testing_assignment")
        .update(updateData)
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

    // If full batch assignment, create custody transfer back to original org
    if (assignment.assignment_type === "full_batch") {
      const { error: custodyError } = await supabaseClient
        .from("batch_custody")
        .insert({
          batch_id: assignment.batch_id,
          organisation_id: assignment.assigned_by_org_id,
          transferred_by: user.id,
          previous_organisation_id: userOrgId,
          notes: "Returned from testing/processing",
        })

      if (custodyError) {
        // Rollback: remove returned_at from assignment
        await supabaseClient
          .from("batch_testing_assignment")
          .update({ returned_at: null })
          .eq("id", assignment_id)

        return new Response(
          JSON.stringify({
            error: `Failed to transfer custody: ${custodyError.message}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }
    }

    return new Response(
      JSON.stringify({
        message: "Batch returned successfully",
        assignment: updatedAssignment,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: `Internal server error: ${error.message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }
})
