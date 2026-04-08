// Edge Function: Return Batch from Testing
// Testing organisation returns a batch/sample to the original owner

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Max-Age": "86400",
}

const returnErrorResponse = (message: string, status: number) => {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
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
      return returnErrorResponse("Missing authorization", 401)
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
      return returnErrorResponse("Unauthorized", 401)
    }

    // Get request body
    const {
      assignment_id,
      subsample_weight_grams,
      subsample_storage_location_id,
    } = await req.json()

    // Validate inputs
    if (!assignment_id) {
      return returnErrorResponse("Missing required field: assignment_id", 400)
    }

    // If subsample weight provided, storage location is required
    if (subsample_weight_grams && !subsample_storage_location_id) {
      return returnErrorResponse(
        "subsample_storage_location_id is required when storing a subsample",
        400,
      )
    }

    // Get user's organisation and verify admin role
    const { data: orgMembership } = await supabaseClient
      .from("org_user")
      .select("organisation_id, role")
      .eq("user_id", user.id)
      .single()

    if (!orgMembership) {
      return returnErrorResponse(
        "User is not a member of any organisation",
        403,
      )
    }

    if (orgMembership.role !== "Admin") {
      return returnErrorResponse(
        "Only admins can return batches from testing",
        403,
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
      return returnErrorResponse("Assignment not found", 404)
    }

    // Verify user's org is the testing org for this assignment
    if (assignment.assigned_to_org_id !== userOrgId) {
      return returnErrorResponse(
        "This assignment does not belong to your organisation",
        403,
      )
    }

    // Check if already returned
    if (assignment.returned_at) {
      return returnErrorResponse("Assignment already returned", 400)
    }

    // Validate storage location belongs to testing org (if provided)
    if (subsample_storage_location_id) {
      const { data: location, error: locationError } = await supabaseClient
        .from("storage_locations")
        .select("organisation_id")
        .eq("id", subsample_storage_location_id)
        .single()

      if (locationError || !location) {
        return returnErrorResponse("Storage location not found", 404)
      }

      if (location.organisation_id !== userOrgId) {
        return returnErrorResponse(
          "Storage location does not belong to your organisation",
          403,
        )
      }
    }

    // Update assignment with return info
    const updateData: {
      returned_at: string
      completed_at?: string
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

    if (!assignment.completed_at) {
      updateData.completed_at = new Date().toISOString()
    }

    const { data: updatedAssignment, error: updateError } = await supabaseClient
      .from("batch_testing_assignment")
      .update(updateData)
      .eq("id", assignment_id)
      .select()
      .single()

    if (updateError) {
      return returnErrorResponse(
        `Failed to update assignment: ${updateError.message}`,
        500,
      )
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
    return returnErrorResponse(
      `Internal server error: ${(error as Error).message}`,
      500,
    )
  }
})
