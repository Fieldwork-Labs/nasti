// Edge Function: Return Bag from Testing
// Testing organisation hands a bag back to the organisation that sent it.
//
// A transport wrapper only. fn_return_held_bag_from_testing owns the rules —
// Admin role, the bag is held by the caller and carries seed from one of its
// open assignments — and takes the bag off the laboratory's shelf, moves
// custody back and closes every assignment the laboratory no longer holds seed
// for, in one transaction.
//
// Return is by bag because a laboratory may split and merge what it was sent:
// one assignment's seed can sit in several bags, and one merged bag can carry
// several assignments. A laboratory that wants to keep part of the seed splits
// the bag first and returns the rest.
//
// `assignment_id` is still accepted, through fn_return_bag_from_testing, so a
// client deployed before this change keeps working. It returns only the bag
// the assignment named. The deployed path keeps its old name so existing
// clients keep resolving.

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
        sub_batch_id?: string
        assignment_id?: string
      }

      try {
        body = await req.json()
      } catch {
        return returnErrorResponse("Request body must be valid JSON", 400)
      }

      const { sub_batch_id, assignment_id } = body

      const bySubBatch = typeof sub_batch_id === "string" && sub_batch_id !== ""

      if (
        !bySubBatch &&
        (typeof assignment_id !== "string" || assignment_id === "")
      ) {
        return returnErrorResponse("Missing required field: sub_batch_id", 400)
      }

      const rpcName = bySubBatch
        ? "fn_return_held_bag_from_testing"
        : "fn_return_bag_from_testing"

      const { data, error } = bySubBatch
        ? await supabaseClient.rpc("fn_return_held_bag_from_testing", {
            p_sub_batch_id: sub_batch_id,
          })
        : await supabaseClient.rpc("fn_return_bag_from_testing", {
            p_assignment_id: assignment_id,
          })

      if (error) {
        const status = STATUS_BY_PG_CODE[error.code ?? ""]
        if (!status) {
          console.error(`${rpcName} failed`, error)
          return returnErrorResponse("Internal server error", 500)
        }
        return returnErrorResponse(error.message, status)
      }

      return new Response(
        JSON.stringify(
          bySubBatch
            ? { message: "Bag returned successfully", assignments: data }
            : { message: "Bag returned successfully", assignment: data },
        ),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    } catch (error) {
      console.error("return_bag_from_testing failed", error)
      return returnErrorResponse("Internal server error", 500)
    }
  }),
)
