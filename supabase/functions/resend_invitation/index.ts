// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AuthMiddleware } from "../_shared/jwt/default.ts"
import { sendEmail } from "../_shared/mailgun.ts"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow any origin
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Allowed methods
  "Access-Control-Allow-Headers": "Content-Type, Authorization", // Allowed headers
  "Access-Control-Max-Age": "86400", // Cache preflight response for 1 day
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
      return new Response("Method Not Allowed", {
        status: 405,
        headers: corsHeaders,
      })
    }
    const { invitation_id } = await req.json()

    if (!invitation_id) {
      return new Response("Missing invitation_id", {
        status: 400,
        headers: corsHeaders,
      })
    }

    // Fetch the invitation
    const { data: invitations, error } = await supabase
      .from("invitation")
      .select("*, organisation(name)")
      .eq("id", invitation_id)
      .limit(1)

    if (error || !invitations || invitations.length === 0) {
      return new Response("Invitation not found", {
        status: 404,
        headers: corsHeaders,
      })
    }
    const invitation = invitations[0]

    const newToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const { error: updateError } = await supabase
      .from("invitation")
      .update({
        token: newToken,
        created_at: new Date(),
        expires_at: expiresAt,
      }) // Extend by 7 days
      .eq("id", invitation_id)

    if (updateError) {
      console.log({ updateError })
      return new Response(`Failed to resend invitation: ${updateError}`, {
        status: 500,
        headers: corsHeaders,
      })
    }

    // Send the invitation email via Mailgun
    const invitationLink = `${Deno.env.get("FRONTEND_URL")}/invitations/accept?token=${newToken}`

    const emailBody = `
    <html>
      <body>
        <p>Hi ${invitation.name},</p>
        <p>You have been invited to join ${invitation.organisation.name} on NASTI. Please click the link below to accept the invitation:</p>
        <p><a href="${invitationLink}">Accept Invitation</a></p>
        <p>This link will expire on ${expiresAt.toDateString()}.</p>
        <p>Regards,<br/>NASTI Team</p>
      </body>
    </html>
  `

    const emailSent = await sendEmail({
      to: invitation.email,
      subject: "You're Invited to Join NASTI",
      html: emailBody,
    })

    if (!emailSent) {
      return new Response("Failed to send invitation email", {
        status: 500,
      })
    }

    return new Response("Invitation resent successfully", {
      status: 200,
      headers: corsHeaders,
    })
  }),
)
