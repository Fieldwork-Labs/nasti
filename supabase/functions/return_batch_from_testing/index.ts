// Edge Function: Return Batch from Testing
// Testing organisation returns a batch/sample to the original owner.
//
// A transport wrapper only. fn_return_batch_from_testing owns the rules —
// Admin role, ownership of the assignment, not-already-returned, retained
// subsample validation, and custody handback for a full batch — and performs
// the custody write and the assignment update in one transaction. Previously
// this function updated the assignment without ever writing custody, so a
// returned full batch stayed, on paper, with the Testing organisation.

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

// The database raises these deliberately; anything else is a bug and must not
// be echoed back to the caller.
const STATUS_BY_PG_CODE: Record<string, number> = {
  "28000": 401, // authentication required
  "42501": 403, // not authorised
  P0002: 404, // referenced row not found
  "55000": 409, // state conflict, e.g. already returned
  "23505": 409, // unique violation
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
        assignment_id?: string
        subsample_weight_grams?: number | null
        subsample_storage_location_id?: string | null
      }

      try {
        body = await req.json()
      } catch {
        return returnErrorResponse("Request body must be valid JSON", 400)
      }

      const {
        assignment_id,
        subsample_weight_grams,
        subsample_storage_location_id,
      } = body

      if (!assignment_id || typeof assignment_id !== "string") {
        return returnErrorResponse("Missing required field: assignment_id", 400)
      }

      const weight =
        subsample_weight_grams === undefined ? null : subsample_weight_grams
      const locationId =
        subsample_storage_location_id === undefined
          ? null
          : subsample_storage_location_id

      if (weight !== null) {
        if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
          return returnErrorResponse(
            "subsample_weight_grams must be a number greater than 0",
            400,
          )
        }
      }

      if (locationId !== null && typeof locationId !== "string") {
        return returnErrorResponse(
          "subsample_storage_location_id must be a string",
          400,
        )
      }

      // Retained subsample metadata is meaningless without both halves.
      if ((weight === null) !== (locationId === null)) {
        return returnErrorResponse(
          "subsample_weight_grams and subsample_storage_location_id must be provided together",
          400,
        )
      }

      const { data, error } = await supabaseClient.rpc(
        "fn_return_batch_from_testing",
        {
          p_assignment_id: assignment_id,
          p_subsample_weight_grams: weight,
          p_subsample_storage_location_id: locationId,
        },
      )

      if (error) {
        const status = STATUS_BY_PG_CODE[error.code ?? ""]
        if (!status) {
          console.error("fn_return_batch_from_testing failed", error)
          return returnErrorResponse("Internal server error", 500)
        }
        return returnErrorResponse(error.message, status)
      }

      return new Response(
        JSON.stringify({
          message: "Batch returned successfully",
          assignment: data,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    } catch (error) {
      console.error("return_batch_from_testing failed", error)
      return returnErrorResponse("Internal server error", 500)
    }
  }),
)
