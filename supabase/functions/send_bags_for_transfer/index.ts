// Edge Function: Send Bags for Transfer
// An organisation permanently gives bags of seed (or a weighed part of a bag)
// to another organisation.
//
// This is a transport wrapper, not a place where authorisation happens. Every
// rule — the inventory permission, recipient opt-in, bag eligibility, the link
// state, idempotency on request_id — lives in fn_send_bags_for_transfer, which
// applies them and writes in a single transaction. All this function adds is
// the email to the recipient's Admins, sent once, on the first successful send.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AuthMiddleware } from "../_shared/jwt/default.ts"
import {
  describeTransferredItems,
  frontendUrl,
  getOrgAdminEmails,
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

interface BagTransferRequest {
  sub_batch_id: string
  // Omitted to send the whole bag; present to split that weight off it first.
  sample_weight_grams?: number
}

interface SendBagsForTransferResult {
  transfer: {
    id: string
    status: "pending_link" | "completed"
    sender_org_id: string
    sender_org_name: string
    recipient_org_id: string
    recipient_org_name: string
    link_request_id: string | null
    created_at: string
  }
  link_request_created: boolean
  replayed: boolean
  items: (TransferredItem & { sub_batch_id: string })[]
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
const notifyRecipientAdmins = async (result: SendBagsForTransferResult) => {
  try {
    const { transfer, items, link_request_created } = result

    let subject: string
    let text: string
    if (transfer.status === "completed") {
      const description = describeTransferredItems(items)
      subject = `${transfer.sender_org_name} transferred ${description} to you`
      text = `${transfer.sender_org_name} transferred ${description} to ${transfer.recipient_org_name}.\n\nThe seed is now in your inventory in NASTI.\n\nRegards,\nNASTI Team`
    } else if (link_request_created) {
      subject = `${transfer.sender_org_name} wants to transfer seed to you`
      text = `${transfer.sender_org_name} wants to transfer seed to ${transfer.recipient_org_name}. Review the request: ${frontendUrl("/settings/transfer-partners")}\n\nRegards,\nNASTI Team`
    } else {
      // Pending on a request the recipient has already been told about.
      return
    }

    // Service role: the sender is not a member of the recipient organisation.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )
    const adminEmails = await getOrgAdminEmails(
      serviceClient,
      transfer.recipient_org_id,
    )
    for (const to of adminEmails) {
      await sendEmail({ to, subject, text })
    }
  } catch (error) {
    console.error("send_bags_for_transfer notification failed", error)
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

      let body: {
        recipient_org_id?: string
        bags?: BagTransferRequest[]
        notes?: string
        request_id?: string
      }

      try {
        body = await req.json()
      } catch {
        return returnErrorResponse("Request body must be valid JSON", 400)
      }

      const { recipient_org_id, bags, notes, request_id } = body

      if (!recipient_org_id || typeof recipient_org_id !== "string") {
        return returnErrorResponse(
          "Missing required field: recipient_org_id",
          400,
        )
      }

      if (!request_id || typeof request_id !== "string") {
        return returnErrorResponse("Missing required field: request_id", 400)
      }

      if (!bags || !Array.isArray(bags) || bags.length === 0) {
        return returnErrorResponse("bags must be a non-empty array", 400)
      }

      if (notes !== undefined && notes !== null && typeof notes !== "string") {
        return returnErrorResponse("notes must be a string", 400)
      }

      // Shape only. Whether the bag exists, is held by the caller, and has
      // enough seed left is the database's to answer.
      for (const bag of bags) {
        if (!bag?.sub_batch_id || typeof bag.sub_batch_id !== "string") {
          return returnErrorResponse("Each bag requires a sub_batch_id", 400)
        }

        if (bag.sample_weight_grams !== undefined) {
          const weight = bag.sample_weight_grams
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
      }

      const { data, error } = await supabaseClient.rpc(
        "fn_send_bags_for_transfer",
        {
          p_recipient_org_id: recipient_org_id,
          p_bags: bags,
          p_notes: notes ?? null,
          p_request_id: request_id,
        },
      )

      if (error) {
        const status = STATUS_BY_PG_CODE[error.code ?? ""]
        if (!status) {
          console.error("fn_send_bags_for_transfer failed", error)
          return returnErrorResponse("Internal server error", 500)
        }
        return returnErrorResponse(error.message, status)
      }

      const result = data as SendBagsForTransferResult

      // Only the first successful send emails; a replay is the same intent.
      if (!result.replayed) {
        await notifyRecipientAdmins(result)
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    } catch (error) {
      console.error("send_bags_for_transfer failed", error)
      return returnErrorResponse("Internal server error", 500)
    }
  }),
)
