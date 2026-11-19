// Edge Function: Respond to Transfer Link Request
// An Admin of the recipient organisation accepts or declines a request from an
// organisation that wants to transfer seed to it.
//
// This is a transport wrapper. Every rule — Admin role, the request still being
// open, recipient opt-in, re-validating reserved bags — lives in
// fn_respond_transfer_link_request, which applies them in one transaction. This
// function only sends the emails afterwards, once, when the response was
// applied by this call.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AuthMiddleware } from "../_shared/jwt/default.ts"
import {
  describeTransferredItems,
  getOrgAdminEmails,
  getUserEmail,
  sendEmail,
  type TransferredItem,
} from "../_shared/mailgun.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Max-Age": "86400",
}

interface RespondTransferLinkRequestResult {
  request_id: string
  accepted: boolean
  requesting_org_id: string
  requesting_org_name: string
  recipient_org_id: string
  recipient_org_name: string
  requested_by: string | null
  already_resolved: boolean
  completed_transfers: { transfer_id: string; items: TransferredItem[] }[]
  cancelled_transfer_ids: string[]
}

// The database raises these deliberately; anything else is a bug and must not
// be echoed back to the caller.
const STATUS_BY_PG_CODE: Record<string, number> = {
  "28000": 401, // authentication required
  "42501": 403, // not authorised
  P0002: 404, // referenced row not found
  "55000": 409, // state conflict
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

// Best effort: logged, never thrown.
const notifyAccepted = async (result: RespondTransferLinkRequestResult) => {
  try {
    // Service role: the responder is not a member of the requesting org, and
    // auth.admin is service-role only.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const items = result.completed_transfers.flatMap((t) => t.items)
    if (items.length > 0) {
      const description = describeTransferredItems(items)
      const subject = `${result.requesting_org_name} transferred ${description} to you`
      const text = `${result.requesting_org_name} transferred ${description} to ${result.recipient_org_name}.\n\nThe seed is now in your inventory in NASTI.\n\nRegards,\nNASTI Team`
      const adminEmails = await getOrgAdminEmails(
        serviceClient,
        result.recipient_org_id,
      )
      for (const to of adminEmails) {
        await sendEmail({ to, subject, text })
      }
    }

    if (result.requested_by) {
      const requesterEmail = await getUserEmail(
        serviceClient,
        result.requested_by,
      )
      if (requesterEmail) {
        await sendEmail({
          to: requesterEmail,
          subject: `${result.recipient_org_name} accepted your transfer request`,
          text: `${result.recipient_org_name} accepted your transfer request. Your pending seed has been transferred.\n\nRegards,\nNASTI Team`,
        })
      }
    }
  } catch (error) {
    console.error("respond_transfer_link_request notification failed", error)
  }
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

      let body: { request_id?: string; accept?: boolean }

      try {
        body = await req.json()
      } catch {
        return returnErrorResponse("Request body must be valid JSON", 400)
      }

      const { request_id, accept } = body

      if (!request_id || typeof request_id !== "string") {
        return returnErrorResponse("Missing required field: request_id", 400)
      }

      if (typeof accept !== "boolean") {
        return returnErrorResponse("accept must be a boolean", 400)
      }

      const { data, error } = await supabaseClient.rpc(
        "fn_respond_transfer_link_request",
        {
          p_request_id: request_id,
          p_accept: accept,
        },
      )

      if (error) {
        const status = STATUS_BY_PG_CODE[error.code ?? ""]
        if (!status) {
          console.error("fn_respond_transfer_link_request failed", error)
          return returnErrorResponse("Internal server error", 500)
        }
        return returnErrorResponse(error.message, status)
      }

      const result = data as RespondTransferLinkRequestResult

      if (result.accepted && !result.already_resolved) {
        await notifyAccepted(result)
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    } catch (error) {
      console.error("respond_transfer_link_request failed", error)
      return returnErrorResponse("Internal server error", 500)
    }
  }),
)
