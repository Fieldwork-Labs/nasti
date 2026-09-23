import { describe, expect, it } from "vitest"
import type { HttpRequest, HttpResponse, HttpStack } from "tus-js-client"
import { uploadToStorage } from "../storageUpload"

class RejectingHttpStack implements HttpStack {
  readonly requests: Array<{ method: string; url: string; authorization?: string }> = []

  constructor(private readonly onSend: () => void) {}

  getName() {
    return "RejectingHttpStack"
  }

  createRequest(method: string, url: string): HttpRequest {
    const headers = new Map<string, string>()
    const record = { method, url } as {
      method: string
      url: string
      authorization?: string
    }
    this.requests.push(record)

    return {
      getMethod: () => method,
      getURL: () => url,
      setHeader: (header, value) => {
        headers.set(header.toLowerCase(), value)
        if (header.toLowerCase() === "authorization") record.authorization = value
      },
      getHeader: (header) => headers.get(header.toLowerCase()),
      setProgressHandler: () => undefined,
      send: async () => {
        this.onSend()
        const response: HttpResponse = {
          getStatus: () => 403,
          getHeader: (header) => header.toLowerCase() === "content-type" ? "application/json" : undefined,
          getBody: () => JSON.stringify({ message: "private server detail" }),
          getUnderlyingObject: () => undefined,
        }
        return response
      },
      abort: async () => undefined,
      getUnderlyingObject: () => undefined,
    }
  }
}

describe("tus upload authorization adapter", () => {
  it("constructs and sends the failing request with its exact credential token", async () => {
    let currentAuthToken = "captured-tus-token"
    const stack = new RejectingHttpStack(() => {
      currentAuthToken = "later-tus-token"
    })

    const error = await uploadToStorage({
      bucket: "collection-photos",
      path: "org/collections/c/photo.jpg",
      file: Buffer.from("bytes") as never,
      mimeType: "image/jpeg",
      credentials: { accessToken: "captured-tus-token" },
    }, {
      httpStack: stack,
      urlStorage: {
        findUploadsByFingerprint: async () => [],
        addUpload: async () => "unused",
        removeUpload: async () => undefined,
      },
    }).then(() => null, (caught: unknown) => caught)

    expect(stack.requests.length).toBeGreaterThan(0)
    expect(stack.requests[0]).toMatchObject({
      method: "POST",
      authorization: "Bearer captured-tus-token",
    })
    expect(error).toMatchObject({
      statusCode: 403,
      retryable: true,
      safeMessage: "Storage rejected the upload (HTTP 403)",
    })

    expect(currentAuthToken).toBe("later-tus-token")
    expect(JSON.stringify(stack.requests)).not.toContain("private server detail")
  })
})
