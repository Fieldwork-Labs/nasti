// Edge Function: Assign Bags for Testing
// General organisation sends one or more bags to a linked Testing organisation.
//
// The unit is a bag, not a batch: several bags of one parent batch can be out at
// different laboratories at once. Sending a sample is the same operation with a
// weight — the database splits that weight off the named bag and assigns the
// child, because a sample is not a distinct kind of thing, just a smaller bag.
//
// This is a transport wrapper, not a place where authorisation happens. Every
// rule — Admin role, the organisation link, bag custody, sample weights,
// one-active-assignment-per-bag — lives in fn_assign_bags_for_testing, which
// applies them and writes in a single transaction. An earlier version made those
// checks here across several separate queries, so a bag could be assigned twice
// by two requests that both passed their checks before either wrote.
//
// The deployed path keeps its old name so existing clients keep resolving; the
// payload it accepts does not.

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

interface BagAssignmentRequest {
  sub_batch_id: string
  // Omitted to send the whole bag; present to split that weight off it first.
  sample_weight_grams?: number
  // The container the seed is physically mailed in.
  container_id?: string
}

// The database raises these deliberately; anything else is a bug and must not
// be echoed back to the caller.
const STATUS_BY_PG_CODE: Record<string, number> = {
  "28000": 401, // authentication required
  "42501": 403, // not authorised
  P0002: 404, // referenced row not found
  "55000": 409, // state conflict
  "23505": 409, // unique violation (one active assignment per bag)
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
        provider_org_id?: string
        sub_batch_assignments?: BagAssignmentRequest[]
      }

      try {
        body = await req.json()
      } catch {
        return returnErrorResponse("Request body must be valid JSON", 400)
      }

      const { provider_org_id, sub_batch_assignments: bagAssignments } = body

      if (!provider_org_id || typeof provider_org_id !== "string") {
        return returnErrorResponse("Missing required field: provider_org_id", 400)
      }

      if (
        !bagAssignments ||
        !Array.isArray(bagAssignments) ||
        bagAssignments.length === 0
      ) {
        return returnErrorResponse(
          "sub_batch_assignments must be a non-empty array",
          400,
        )
      }

      // Shape only. Whether the bag exists, is held by the caller, and has
      // enough seed left is the database's to answer, and answering it here
      // would just be a second opinion that can go stale between the two.
      for (const assignment of bagAssignments) {
        if (
          !assignment?.sub_batch_id ||
          typeof assignment.sub_batch_id !== "string"
        ) {
          return returnErrorResponse(
            "Each assignment requires a sub_batch_id",
            400,
          )
        }

        if (assignment.sample_weight_grams !== undefined) {
          const weight = assignment.sample_weight_grams
          if (
            typeof weight !== "number" ||
            !Number.isFinite(weight) ||
            weight <= 0
          ) {
            return returnErrorResponse(
              "sample_weight_grams must be a number greater than 0 when present",
              400,
            )
          }
        }

        if (
          assignment.container_id !== undefined &&
          typeof assignment.container_id !== "string"
        ) {
          return returnErrorResponse("container_id must be a string", 400)
        }
      }

      const { data, error } = await supabaseClient.rpc(
        "fn_assign_bags_for_testing",
        {
          p_provider_org_id: provider_org_id,
          p_bags: bagAssignments,
        },
      )

      if (error) {
        const status = STATUS_BY_PG_CODE[error.code ?? ""]
        if (!status) {
          console.error("fn_assign_bags_for_testing failed", error)
          return returnErrorResponse("Internal server error", 500)
        }
        return returnErrorResponse(error.message, status)
      }

      const assignments = data ?? []

      return new Response(
        JSON.stringify({
          message: `Successfully sent ${assignments.length} bag(s) for testing`,
          assignments,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    } catch (error) {
      console.error("assign_bags_for_testing failed", error)
      return returnErrorResponse("Internal server error", 500)
    }
  }),
)
