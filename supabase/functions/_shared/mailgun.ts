// Shared Mailgun helpers for edge functions.
//
// sendEmail never throws: callers that treat email as best-effort can ignore
// the result, callers that need it (invitations) branch on the boolean.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

interface SendEmailOptions {
  to: string
  subject: string
  text?: string
  html?: string
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

export const sendEmail = async ({
  to,
  subject,
  text,
  html,
}: SendEmailOptions): Promise<boolean> => {
  const mailgunDomain = Deno.env.get("MAILGUN_DOMAIN")
  const mailgunApiKey = Deno.env.get("MAILGUN_API_KEY")

  if (!mailgunDomain || !mailgunApiKey) {
    console.error("Mailgun is not configured; email not sent", { subject })
    return false
  }

  const body = new URLSearchParams({
    from: `NASTI <no-reply@${mailgunDomain}>`,
    to,
    subject,
  })
  if (text) body.set("text", text)
  const htmlBody =
    html ??
    (text
      ? `<html><body>${text
          .split("\n\n")
          .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
          .join("")}</body></html>`
      : undefined)
  if (htmlBody) body.set("html", htmlBody)

  try {
    const response = await fetch(
      `https://api.eu.mailgun.net/v3/${mailgunDomain}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`api:${mailgunApiKey}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    )

    if (!response.ok) {
      console.error("Mailgun error:", await response.text())
      return false
    }
    return true
  } catch (error) {
    console.error("Mailgun request failed:", error)
    return false
  }
}

// Emails of an organisation's Admins. Needs a service-role client, since the
// caller is generally not a member of the organisation being notified.
// Returns [] on any failure.
export const getOrgAdminEmails = async (
  supabase: SupabaseClient,
  organisationId: string,
): Promise<string[]> => {
  const { data, error } = await supabase
    .from("org_user")
    .select("user_id, users:user_id(email)")
    .eq("organisation_id", organisationId)
    .eq("role", "Admin")

  if (error || !data) {
    console.error("Failed to look up organisation admins", error)
    return []
  }

  return data
    .map((admin) => (admin.users as unknown as { email: string } | null)?.email)
    .filter((email): email is string => Boolean(email))
}

// Email of a single user, via the auth admin API (service-role client).
export const getUserEmail = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> => {
  const { data, error } = await supabase.auth.admin.getUserById(userId)
  if (error || !data.user?.email) {
    console.error("Failed to look up user email", error)
    return null
  }
  return data.user.email
}

export const frontendUrl = (path: string) =>
  `${Deno.env.get("FRONTEND_URL")}${path}`

interface TransferredItem {
  weight_grams: number
  species_name: string | null
  collection_code: string | null
}

// "N bags (Species A, code X; Species B, code Y)" for the arrival email.
export const describeTransferredItems = (items: TransferredItem[]) => {
  const count = items.length
  const details = items
    .map((item) =>
      [item.species_name, item.collection_code].filter(Boolean).join(", "),
    )
    .filter(Boolean)
  const noun = count === 1 ? "bag" : "bags"
  return details.length > 0
    ? `${count} ${noun} (${details.join("; ")})`
    : `${count} ${noun}`
}

export type { TransferredItem }
