// Edge Function: Create Link Request
// An organisation admin requests testing services from a provider.
// Provider organisations may also request another provider's services.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AuthMiddleware } from "../_shared/jwt/default.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
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
      // Create Supabase client with service role key for admin operations
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      )

      // Get and verify auth token
      const authHeader = req.headers.get("Authorization")
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Missing authorization" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      const token = authHeader.replace("Bearer ", "")
      const { data: userData, error: userError } =
        await supabaseClient.auth.getUser(token)

      if (userError || !userData.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      // Get request body
      const { provider_org_id } = await req.json()

      // Validate inputs
      if (!provider_org_id) {
        return new Response(
          JSON.stringify({ error: "Missing required field: provider_org_id" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Get user's organisation and verify admin role
      const { data: orgUser, error: orgUserError } = await supabaseClient
        .from("org_user")
        .select("organisation_id, role, organisation(name)")
        .eq("user_id", userData.user.id)
        .single()

      if (orgUserError || !orgUser) {
        return new Response(
          JSON.stringify({ error: "User is not a member of any organisation" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      if (orgUser.role !== "Admin") {
        return new Response(
          JSON.stringify({ error: "Only Admins can create link requests" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }
      const org = orgUser.organisation as unknown as { name: string }

      // Get testing organisation details
      const { data: testingOrg, error: testingOrgError } = await supabaseClient
        .from("organisation")
        .select("id, name, is_testing_provider")
        .eq("id", provider_org_id)
        .single()

      if (testingOrgError || !testingOrg) {
        return new Response(
          JSON.stringify({ error: "Testing provider not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      if (!testingOrg.is_testing_provider) {
        return new Response(
          JSON.stringify({
            error: "Target organisation is not a testing provider",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Check if there's already a link or pending request
      const { data: existingLink } = await supabaseClient
        .from("organisation_link")
        .select("id")
        .eq("requesting_org_id", orgUser.organisation_id)
        .eq("provider_org_id", provider_org_id)
        .maybeSingle()

      if (existingLink) {
        return new Response(
          JSON.stringify({
            error: "Link already exists with this organisation",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      const { data: existingRequest } = await supabaseClient
        .from("organisation_link_request")
        .select("id")
        .eq("requesting_org_id", orgUser.organisation_id)
        .eq("provider_org_id", provider_org_id)
        .is("accepted_at", null)
        .maybeSingle()

      if (existingRequest) {
        return new Response(
          JSON.stringify({
            error: "Link request already pending with this organisation",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Create the link request
      const { data: newRequest, error: insertError } = await supabaseClient
        .from("organisation_link_request")
        .insert({
          requesting_org_id: orgUser.organisation_id,
          provider_org_id,
          created_by: userData.user.id,
        })
        .select()
        .single()

      if (insertError) {
        return new Response(
          JSON.stringify({
            error: `Failed to create link request: ${insertError.message}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }

      // Get admin users from testing organisation for email notification
      const { data: testingOrgAdmins, error: adminsError } =
        await supabaseClient
          .from("org_user")
          .select("user_id, users:user_id(email)")
          .eq("organisation_id", provider_org_id)
          .eq("role", "Admin")

      if (!adminsError && testingOrgAdmins && testingOrgAdmins.length > 0) {
        // Send email notification to testing org admins
        const mailgunDomain = Deno.env.get("MAILGUN_DOMAIN")
        const mailgunApiKey = Deno.env.get("MAILGUN_API_KEY")

        if (mailgunDomain && mailgunApiKey) {
          const emailBody = `
          <html>
            <body>
              <h2>New Link Request</h2>
              <p><strong>${org.name}</strong> has requested to link with your testing organisation.</p>
              <p>Accepting lets them send you bags of seed for testing.</p>
              <p>Please log in to NASTI to accept or reject this request.</p>
              <p><a href="${Deno.env.get("FRONTEND_URL")}/settings/testing-orgs">View Link Request</a></p>
              <p>Regards,<br/>NASTI Team</p>
            </body>
          </html>
        `

          // Send to all admins
          for (const admin of testingOrgAdmins) {
            const adminEmail = (admin.users as unknown as { email: string })
              ?.email
            if (adminEmail) {
              await fetch(
                `https://api.eu.mailgun.net/v3/${mailgunDomain}/messages`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Basic ${btoa(`api:${mailgunApiKey}`)}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                  },
                  body: new URLSearchParams({
                    from: `NASTI <no-reply@${mailgunDomain}>`,
                    to: adminEmail,
                    subject: "New Link Request from Organisation",
                    html: emailBody,
                  }),
                },
              )
            }
          }
        }
      }

      return new Response(
        JSON.stringify({
          message: "Link request created successfully",
          request: newRequest,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: `Internal server error: ${(error as Error).message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }
  }),
)
