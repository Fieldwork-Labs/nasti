import { Database } from "@nasti/common/types/database"

interface Env {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  if (context.request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    })
  }

  const { params } = (await context.request.json()) as {
    params:
      | Database["public"]["Functions"]["get_ibra_regions"]["Args"]
      | { ids: string[] }
  }

  // Get the user's auth token from the Authorization header
  const authHeader = context.request.headers.get("Authorization")
  if (!authHeader) {
    return new Response("Unauthorized", {
      status: 401,
      headers: corsHeaders,
    })
  }

  const cacheKey = new Request(
    `https://cache-internal/v1/get_ibra_regions/${JSON.stringify(params)}`,
    { method: "GET" },
  )

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const cache = caches.default
  let response = await cache.match(cacheKey)

  if (!response) {
    let supabaseResponse: Response
    const headers = {
      "Content-Type": "application/json",
      apikey: context.env.SUPABASE_ANON_KEY,
      Authorization: authHeader, // Use user's token,
    }

    if ("ids" in params) {
      const urlParms = new URLSearchParams({
        id: `in.(${params.ids.join(",")})`,
        select: "id,name,code,properties,geometry:geom_high",
      })
      supabaseResponse = await fetch(
        `${context.env.SUPABASE_URL}/rest/v1/ibra_regions?${urlParms.toString()}`,
        {
          method: "GET",
          headers,
        },
      )
    } else {
      supabaseResponse = await fetch(
        `${context.env.SUPABASE_URL}/rest/v1/rpc/get_ibra_regions`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(params),
        },
      )
    }

    const data = await supabaseResponse.json()
    response = new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
        ...corsHeaders,
      },
    })

    await cache.put(cacheKey, response.clone())
  }

  return response
}
