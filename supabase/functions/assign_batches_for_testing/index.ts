// Edge Function: Assign Batches for Testing
// General organisation assigns one or more batches to a linked Testing organisation.
//
// This is a transport wrapper, not a place where authorisation happens. Every
// rule — Admin role, link capabilities, ownership, custody, sample weights,
// one-active-assignment — lives in fn_assign_batches_for_testing, which applies
// them and writes the assignment and custody rows in a single transaction. The
// previous version made those checks here across several separate queries, so a
// batch could be assigned twice by two requests that both passed their checks
// before either wrote.

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

// The database raises these deliberately; anything else is a bug and must not
// be echoed back to the caller.
const STATUS_BY_PG_CODE: Record<string, number> = {
  "28000": 401, // authentication required
  "42501": 403, // not authorised
  P0002: 404, // referenced row not found
  "55000": 409, // state conflict
  "23505": 409, // unique violation (one active assignment per batch)
  "22023": 400, // invalid parameter
  "22P02": 400, // malformed input syntax, e.g. a bad uuid
}

const returnErrorResponse = (message: string, status: number) => {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve((r) =>
  AuthMiddleware(r, async (req) => {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      })
    }

    if (req.method !== "POST") {
      return returnErrorResponse("Method not allowed", 405)
    }

    try {
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

      let body: {
        testing_org_id?: string
        batch_assignments?: AssignmentRequest[]
      }

      try {
        body = await req.json()
      } catch {
        return returnErrorResponse("Request body must be valid JSON", 400)
      }

      const { testing_org_id, batch_assignments: batchAssignments } = body

      if (!testing_org_id || typeof testing_org_id !== "string") {
        return returnErrorResponse("Missing required field: testing_org_id", 400)
      }

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

      for (const assignment of batchAssignments) {
        if (!assignment?.batch_id || typeof assignment.batch_id !== "string") {
          return returnErrorResponse(
            "Each assignment requires a batch_id",
            400,
          )
        }

        if (!["sample", "full_batch"].includes(assignment.assignment_type)) {
          return returnErrorResponse(
            "assignment_type must be either 'sample' or 'full_batch'",
            400,
          )
        }

        if (assignment.assignment_type === "sample") {
          const weight = assignment.sample_weight_grams
          if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
            return returnErrorResponse(
              "sample_weight_grams is required and must be > 0 for sample type assignments",
              400,
            )
          }
        }
      }

      const { data, error } = await supabaseClient.rpc(
        "fn_assign_batches_for_testing",
        {
          p_testing_org_id: testing_org_id,
          p_assignments: batchAssignments,
        },
      )

      if (error) {
        const status = STATUS_BY_PG_CODE[error.code ?? ""]
        if (!status) {
          console.error("fn_assign_batches_for_testing failed", error)
          return returnErrorResponse("Internal server error", 500)
        }
        return returnErrorResponse(error.message, status)
      }

      const assignments = data ?? []

      return new Response(
        JSON.stringify({
          message: `Successfully assigned ${assignments.length} batch(es) for testing`,
          assignments,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    } catch (error) {
      console.error("assign_batches_for_testing failed", error)
      return returnErrorResponse("Internal server error", 500)
    }
  }),
)
