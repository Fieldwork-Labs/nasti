// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, If-None-Match, If-Modified-Since",
        "Access-Control-Max-Age": "86400",
      },
    })
  }

  const url = new URL(req.url)
  const imageUrl = url.searchParams.get("url")

  if (!imageUrl) {
    return new Response("Missing image URL", { status: 400 })
  }

  try {
    // Get client's cache headers
    const ifNoneMatch = req.headers.get("If-None-Match")
    const ifModifiedSince = req.headers.get("If-Modified-Since")

    // Fetch the image with cache headers
    const response = await fetch(imageUrl, {
      headers: {
        "If-None-Match": ifNoneMatch || "",
        "If-Modified-Since": ifModifiedSince || "",
      },
    })

    // If the origin returns 304 Not Modified, relay that to the client
    if (response.status === 304) {
      return new Response(null, {
        status: 304,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=31536000, immutable",
          ETag: response.headers.get("ETag") || "",
          "Last-Modified": response.headers.get("Last-Modified") || "",
        },
      })
    }

    const imageBlob = await response.blob()

    // Get original cache headers
    const etag = response.headers.get("ETag")
    const lastModified = response.headers.get("Last-Modified")

    // Return image with caching headers
    return new Response(imageBlob, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": response.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        // Only add ETag and Last-Modified if they exist
        ...(etag && { ETag: etag }),
        ...(lastModified && { "Last-Modified": lastModified }),
        // Add Vary header to handle different origins
        Vary: "Origin",
      },
    })
  } catch (error) {
    return new Response(`Error fetching image: ${(error as Error).message}`, {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        // Don't cache errors
        "Cache-Control": "no-store",
      },
    })
  }
})
