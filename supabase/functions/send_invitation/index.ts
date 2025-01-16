// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:57321/functions/v1/send_invitation' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow any origin
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Allowed methods
  "Access-Control-Allow-Headers": "Content-Type, Authorization", // Allowed headers
  "Access-Control-Max-Age": "86400", // Cache preflight response for 1 day
}

// Define the request handler
Deno.serve(async (req) => {
  try {
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
    // Parse the JSON body
    const { email, name } = await req.json()

    if (!email || !name) {
      return new Response("Missing email or name", {
        status: 400,
        headers: corsHeaders,
      })
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    // Check if the requester is an admin of the organisation
    const authHeader = req.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders })
    }

    const token = authHeader.split("Bearer ")[1]

    // Verify the JWT token
    const { data: userData, error: userError } =
      await supabase.auth.getUser(token)

    if (userError || !userData.user) {
      return new Response("Invalid or expired token", {
        status: 401,
        headers: corsHeaders,
      })
    }

    const userId = userData.user.id

    // Check if the user is an admin in the organisation
    const { data: orgUser, error: orgUserError } = await supabase
      .from("org_user")
      .select("*, organisation(name)")
      .eq("user_id", userId)
      .single()

    if (orgUserError || !orgUser || orgUser.role !== "Admin") {
      return new Response("Forbidden: Requires admin role", {
        status: 403,
        headers: corsHeaders,
      })
    }

    // Generate a unique invitation token
    const invitationToken = crypto.randomUUID()

    // Set invitation expiration (e.g., 7 days from now)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days

    // Check if the email address has already been invited
    const { data: existingInvitation } = await supabase
      .from("invitation")
      .select()
      .eq("email", email)
      .gt("expires_at", new Date().toISOString())
      .limit(1)

    if (existingInvitation && existingInvitation.length > 0) {
      return new Response("Email address already invited", {
        status: 400,
        headers: corsHeaders,
      })
    }

    // check if the person is already a user
    const { data: users, error } = await supabase.rpc("get_organisation_users")

    console.log("something....")
    if (error) {
      console.log("error")
      console.log({ error })
      return new Response("Failed to get users", {
        status: 500,
        headers: corsHeaders,
      })
    }

    if (users.find((user) => user.email === email)) {
      return new Response("Email address already a user", {
        status: 400,
        headers: corsHeaders,
      })
    }

    const invitationId = crypto.randomUUID()
    // Insert the invitation into the database
    const { error: insertError } = await supabase.from("invitation").insert([
      {
        id: invitationId,
        email,
        name,
        organisation_id: orgUser.organisation_id,
        invited_by: userId,
        token: invitationToken,
        created_at: new Date(),
        expires_at: expiresAt,
      },
    ])

    if (insertError) {
      console.error("Database insert error:", insertError)
      return new Response("Failed to create invitation", {
        status: 500,
        headers: corsHeaders,
      })
    }

    // Send the invitation email via Mailgun
    const mailgunDomain = Deno.env.get("MAILGUN_DOMAIN")
    const mailgunApiKey = Deno.env.get("MAILGUN_API_KEY")

    const invitationLink = `${Deno.env.get("FRONTEND_URL")}/invitations/accept?token=${invitationToken}`

    const emailBody = `
      <html>
        <body>
          <p>Hi ${name},</p>
          <p>You have been invited to join ${orgUser.organisation.name} on NASTI. Please click the link below to accept the invitation:</p>
          <p><a href="${invitationLink}">Accept Invitation</a></p>
          <p>This link will expire on ${expiresAt.toDateString()}.</p>
          <p>Regards,<br/>NASTI Team</p>
        </body>
      </html>
    `

    const mailgunResponse = await fetch(
      `https://api.mailgun.net/v3/${mailgunDomain}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`api:${mailgunApiKey}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          from: `NASTI <no-reply@${mailgunDomain}>`,
          to: email,
          subject: "You're Invited to Join NASTI",
          html: emailBody,
        }),
      },
    )

    if (!mailgunResponse.ok) {
      // delete the invitation if the email fails to send
      await supabase.from("invitation").delete().eq("id", invitationId)

      console.error("Mailgun error:", await mailgunResponse.text())
      return new Response("Failed to send invitation email", {
        status: 500,
        headers: corsHeaders,
      })
    }

    return new Response("Invitation sent successfully", {
      status: 200,
      headers: corsHeaders,
    })
  } catch (error) {
    console.error("Unexpected error:", error)
    return new Response("Internal Server Error", {
      status: 500,
      headers: corsHeaders,
    })
  }
})
