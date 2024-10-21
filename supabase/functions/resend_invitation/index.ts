// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { serve } from "https://deno.land/x/sift@0.6.0/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  const { invitation_id } = await req.json()

  if (!invitation_id) {
    return new Response("Missing invitation_id", { status: 400 })
  }

  // Fetch the invitation
  const { data: invitation, error } = await supabase
    .from("invitation")
    .select("*")
    .eq("id", invitation_id)
    .single()

  if (error || !invitation) {
    return new Response("Invitation not found", { status: 404 })
  }

  // Implement your resend logic here, e.g., send an email
  // For demonstration, we'll just update the `created_at` to extend expiration
  const { error: updateError } = await supabase
    .from("invitation")
    .update({
      created_at: new Date(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }) // Extend by 7 days
    .eq("id", invitation_id)

  if (updateError) {
    return new Response("Failed to resend invitation", { status: 500 })
  }

  return new Response("Invitation resent successfully", { status: 200 })
})
