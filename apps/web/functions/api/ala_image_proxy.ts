const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, If-None-Match, If-Modified-Since",
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      "Access-Control-Max-Age": "86400",
    },
  })
}

export async function onRequestGet(context: { request: Request }) {
  const url = new URL(context.request.url)
  const imageUrl = url.searchParams.get("url")

  if (!imageUrl) {
    return new Response("Missing image URL", {
      status: 400,
      headers: corsHeaders,
    })
  }

  try {
    // Create a cache key based on the image URL
    const cacheKey = new Request(
      `https://cache-internal/v1/ala_image_proxy/${imageUrl}`,
      { method: "GET" },
    )

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    const cache = caches.default
    let response = await cache.match(cacheKey)

    // If not in cache, fetch from ALA
    if (!response) {
      // Get client's cache headers
      const ifNoneMatch = context.request.headers.get("If-None-Match")
      const ifModifiedSince = context.request.headers.get("If-Modified-Since")

      // Fetch the image with cache headers
      const alaResponse = await fetch(imageUrl, {
        headers: {
          ...(ifNoneMatch && { "If-None-Match": ifNoneMatch }),
          ...(ifModifiedSince && { "If-Modified-Since": ifModifiedSince }),
        },
      })

      // If the origin returns 304 Not Modified, relay that to the client
      if (alaResponse.status === 304) {
        return new Response(null, {
          status: 304,
          headers: {
            ...corsHeaders,
            "Cache-Control": "public, max-age=31536000, immutable",
            ...(alaResponse.headers.get("ETag") && {
              ETag: alaResponse.headers.get("ETag")!,
            }),
            ...(alaResponse.headers.get("Last-Modified") && {
              "Last-Modified": alaResponse.headers.get("Last-Modified")!,
            }),
          },
        })
      }

      const imageBlob = await alaResponse.blob()

      // Get original cache headers
      const etag = alaResponse.headers.get("ETag")
      const lastModified = alaResponse.headers.get("Last-Modified")

      // Create response with caching headers
      response = new Response(imageBlob, {
        headers: {
          ...corsHeaders,
          "Content-Type":
            alaResponse.headers.get("Content-Type") || "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
          // Only add ETag and Last-Modified if they exist
          ...(etag && { ETag: etag }),
          ...(lastModified && { "Last-Modified": lastModified }),
          // Add Vary header to handle different origins
          Vary: "Origin",
        },
      })

      // Store in Cloudflare cache
      await cache.put(cacheKey, response.clone())
    }

    return response
  } catch (error) {
    return new Response(`Error fetching image: ${(error as Error).message}`, {
      status: 500,
      headers: {
        ...corsHeaders,
        // Don't cache errors
        "Cache-Control": "no-store",
      },
    })
  }
}
