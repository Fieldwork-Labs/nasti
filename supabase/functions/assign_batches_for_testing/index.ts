// Edge Function: Assign Batches for Testing
// General organisation assigns one or more batches to a linked Testing organisation

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
}

interface AssignmentRequest {
  batch_id: string
  sample_weight_grams?: number
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
    const { batch_assignments, testing_org_id, assignment_type } =
      await req.json()

    // Validate inputs
    if (
      !batch_assignments ||
      !Array.isArray(batch_assignments) ||
      batch_assignments.length === 0
    ) {
      return new Response(
        JSON.stringify({
          error: "batch_assignments must be a non-empty array",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    if (!testing_org_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: testing_org_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    if (
      !assignment_type ||
      !["sample", "full_batch"].includes(assignment_type)
    ) {
      return new Response(
        JSON.stringify({
          error: "assignment_type must be either 'sample' or 'full_batch'",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Validate sample weights for sample type
    if (assignment_type === "sample") {
      for (const assignment of batch_assignments) {
        if (
          !assignment.sample_weight_grams ||
          assignment.sample_weight_grams <= 0
        ) {
          return new Response(
            JSON.stringify({
              error:
                "sample_weight_grams is required and must be > 0 for sample type assignments",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          )
        }
      }
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

    // Verify link exists with appropriate permissions
    const { data: link, error: linkError } = await supabaseClient
      .from("organisation_link")
      .select("*")
      .eq("general_org_id", userOrgId)
      .eq("testing_org_id", testing_org_id)
      .single()

    if (linkError || !link) {
      return new Response(
        JSON.stringify({
          error: "No link exists with the specified testing organisation",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Check permissions based on assignment type
    if (assignment_type === "full_batch" && !link.can_process) {
      return new Response(
        JSON.stringify({
          error:
            "Testing organisation does not have permission to process batches",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    if (assignment_type === "sample" && !link.can_test) {
      return new Response(
        JSON.stringify({
          error:
            "Testing organisation does not have permission to test samples",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const batch_ids = batch_assignments.map(
      (a: AssignmentRequest) => a.batch_id,
    )

    // Verify all batches belong to user's org (current custodian)
    const { data: batches, error: batchError } = await supabaseClient
      .from("current_batch_custody")
      .select("batch_id, organisation_id")
      .in("batch_id", batch_ids)

    if (batchError) {
      return new Response(
        JSON.stringify({
          error: `Failed to fetch batches: ${batchError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    if (!batches || batches.length !== batch_ids.length) {
      return new Response(
        JSON.stringify({ error: "One or more batches not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Check all batches belong to user's org
    const invalidBatches = batches.filter(
      (b) => b.organisation_id !== userOrgId,
    )
    if (invalidBatches.length > 0) {
      return new Response(
        JSON.stringify({
          error: "One or more batches do not belong to your organisation",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Check if any batches already have active assignments
    const { data: existingAssignments } = await supabaseClient
      .from("batch_testing_assignment")
      .select("batch_id")
      .in("batch_id", batch_ids)
      .is("returned_at", null)

    if (existingAssignments && existingAssignments.length > 0) {
      return new Response(
        JSON.stringify({
          error: "One or more batches already have active testing assignments",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // Create assignment records
    const assignmentRecords = batch_assignments.map(
      (assignment: AssignmentRequest) => ({
        batch_id: assignment.batch_id,
        assigned_to_org_id: testing_org_id,
        assigned_by_org_id: userOrgId,
        assignment_type: assignment_type,
        sample_weight_grams:
          assignment_type === "sample" ? assignment.sample_weight_grams : null,
      }),
    )

    const { data: newAssignments, error: assignError } = await supabaseClient
      .from("batch_testing_assignment")
      .insert(assignmentRecords)
      .select()

    if (assignError) {
      return new Response(
        JSON.stringify({
          error: `Failed to create assignments: ${assignError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    // If full_batch, create custody transfers
    if (assignment_type === "full_batch") {
      const custodyRecords = batch_ids.map((batch_id) => ({
        batch_id: batch_id,
        organisation_id: testing_org_id,
        transferred_by: user.id,
        previous_organisation_id: userOrgId,
        notes: "Transferred for testing/processing",
      }))

      const { error: custodyError } = await supabaseClient
        .from("batch_custody")
        .insert(custodyRecords)

      if (custodyError) {
        // Rollback: delete the assignments we just created
        await supabaseClient
          .from("batch_testing_assignment")
          .delete()
          .in(
            "id",
            newAssignments.map((a) => a.id),
          )

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
        message: `Successfully assigned ${batch_ids.length} batch(es) for testing`,
        assignments: newAssignments,
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
