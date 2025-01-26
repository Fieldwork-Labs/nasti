// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

Deno.serve(async (req) => {
  // Get image URL from query parameter
  const url = new URL(req.url)
  const imageUrl = url.searchParams.get("url")

  if (!imageUrl) {
    return new Response("Missing image URL", { status: 400 })
  }

  try {
    // Fetch the image
    const response = await fetch(imageUrl)
    const imageBlob = await response.blob()

    // Return image with CORS headers
    return new Response(imageBlob, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": response.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=31536000",
      },
    })
  } catch (error) {
    return new Response(`Error fetching image: ${error.message}`, {
      status: 500,
    })
  }
})
