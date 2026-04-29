// Edge Function: Assign Batches for Testing
// General organisation assigns one or more batches to a linked Testing organisation

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AuthMiddleware } from "../_shared/jwt/default.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Max-Age": "86400",
}

interface AssignmentRequest {
  batch_id: string
  sample_weight_grams?: number
  assignment_type: "sample" | "full_batch"
}

const returnErrorResponse = (message: string, status: number) => {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve((r) =>
  AuthMiddleware(r, async (req) => {
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
      const { batch_assignments: untypedBatchAssignments, testing_org_id } =
        await req.json()
      const batchAssignments: AssignmentRequest[] = untypedBatchAssignments

      // Validate inputs
      if (
        !batchAssignments ||
        !Array.isArray(batchAssignments) ||
        batchAssignments.length === 0
      ) {
        return returnErrorResponse(
          "batch_assignments must be a non-empty array",
          400,
        )
      }

      if (!testing_org_id) {
        return returnErrorResponse(
          "Missing required field: testing_org_id",
          400,
        )
      }

      for (const assignment of batchAssignments) {
        if (
          !assignment.assignment_type ||
          !["sample", "full_batch"].includes(assignment.assignment_type)
        ) {
          return returnErrorResponse(
            "assignment_type must be either 'sample' or 'full_batch'",
            400,
          )
        }

        // Validate sample weights for sample type
        if (assignment.assignment_type === "sample") {
          if (
            !assignment.sample_weight_grams ||
            assignment.sample_weight_grams <= 0
          ) {
            return returnErrorResponse(
              "sample_weight_grams is required and must be > 0 for sample type assignments",
              400,
            )
          }
        }
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
          "Only admins can assign batches for testing",
          403,
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
        return returnErrorResponse(
          "No link exists with the specified testing organisation",
          404,
        )
      }

      // Check permissions based on assignment type
      for (const assignment of batchAssignments) {
        if (assignment.assignment_type === "full_batch" && !link.can_process) {
          return returnErrorResponse(
            "Testing organisation does not have permission to process batches",
            403,
          )
        }

        if (assignment.assignment_type === "sample" && !link.can_test) {
          return returnErrorResponse(
            "Testing organisation does not have permission to test samples",
            403,
          )
        }
      }

      const batchIds = batchAssignments.map((a) => a.batch_id)

      // Verify all batches belong to user's org (current custodian)
      const { data: batches, error: batchError } = await supabaseClient
        .from("current_batch_custody")
        .select("batch_id, organisation_id")
        .in("batch_id", batchIds)

      if (batchError) {
        return returnErrorResponse(
          `Failed to fetch batches: ${batchError.message}`,
          500,
        )
      }

      if (!batches || batches.length !== batchIds.length) {
        return returnErrorResponse("One or more batches not found", 404)
      }

      // Check all batches belong to user's org
      const invalidBatches = batches.filter(
        (b) => b.organisation_id !== userOrgId,
      )
      if (invalidBatches.length > 0) {
        return returnErrorResponse(
          "One or more batches do not belong to your organisation",
          403,
        )
      }

      // Check if any batches already have active assignments
      const { data: existingAssignments } = await supabaseClient
        .from("batch_testing_assignment")
        .select("batch_id")
        .in("batch_id", batchIds)
        .is("returned_at", null)

      if (existingAssignments && existingAssignments.length > 0) {
        return returnErrorResponse(
          "One or more batches already have active testing assignments",
          400,
        )
      }

      // Create assignment records
      const assignmentRecords = batchAssignments.map(
        (assignment: AssignmentRequest) => ({
          batch_id: assignment.batch_id,
          assigned_to_org_id: testing_org_id,
          assigned_by_org_id: userOrgId,
          assignment_type: assignment.assignment_type,
          sample_weight_grams:
            assignment.assignment_type === "sample"
              ? assignment.sample_weight_grams
              : null,
        }),
      )

      const { data: newAssignments, error: assignError } = await supabaseClient
        .from("batch_testing_assignment")
        .insert(assignmentRecords)
        .select()

      if (assignError) {
        return returnErrorResponse(
          `Failed to create assignments: ${assignError.message}`,
          500,
        )
      }

      return new Response(
        JSON.stringify({
          message: `Successfully assigned ${batchIds.length} batch(es) for testing`,
          assignments: newAssignments,
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
  }),
)
