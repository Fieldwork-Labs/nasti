import { renderHook } from "@testing-library/react"
import { describe, it, expect, vi, afterEach } from "vitest"
import { useDisplayDistance } from "../useDisplayDistance"

// Create a mock for getDistanceKm
const mockGetDistanceKm = vi.fn()

vi.mock("@/contexts/location", () => ({
  useGeoLocation: () => ({
    getDistanceKm: mockGetDistanceKm,
  }),
}))

describe("useDisplayDistance hook", () => {
  // Reset mock implementation and call history after each test
  afterEach(() => {
    mockGetDistanceKm.mockReset()
  })

  it("returns undefined when both latitude and longitude are missing", () => {
    const { result } = renderHook(() => useDisplayDistance({}))
    expect(result.current).toBeUndefined()
    expect(mockGetDistanceKm).not.toHaveBeenCalled()
  })

  it("returns undefined when only latitude is provided", () => {
    const { result } = renderHook(() =>
      useDisplayDistance({ latitude: 51.5, longitude: undefined }),
    )
    expect(result.current).toBeUndefined()
    expect(mockGetDistanceKm).not.toHaveBeenCalled()
  })

  it("returns undefined when only longitude is provided", () => {
    const { result } = renderHook(() =>
      useDisplayDistance({ latitude: undefined, longitude: -0.1 }),
    )
    expect(result.current).toBeUndefined()
    expect(mockGetDistanceKm).not.toHaveBeenCalled()
  })

  it("returns undefined when getDistanceKm returns a falsy value (e.g., 0)", () => {
    // Arrange: make getDistanceKm return 0
    mockGetDistanceKm.mockReturnValueOnce(0)

    const args = { latitude: 51.5, longitude: -0.1 }
    const { result } = renderHook(() => useDisplayDistance(args))

    expect(result.current).toBeUndefined()
    expect(mockGetDistanceKm).toHaveBeenCalledOnce()
    expect(mockGetDistanceKm).toHaveBeenCalledWith(args)
  })

  it("formats distance with two decimals when distance ≤ 10 km", () => {
    // Case A: getDistanceKm returns a value less than 10 (e.g., 5.678 km)
    mockGetDistanceKm.mockReturnValueOnce(5.678)

    const argsA = { latitude: 40.0, longitude: -74.0 }
    const { result: resultA } = renderHook(() => useDisplayDistance(argsA))
    expect(resultA.current).toBe("5.68")
    expect(mockGetDistanceKm).toHaveBeenCalledWith(argsA)

    // Case B: getDistanceKm returns exactly 10.0 (boundary case)
    mockGetDistanceKm.mockReturnValueOnce(10.0)

    const argsB = { latitude: 35.0, longitude: 139.0 }
    const { result: resultB } = renderHook(() => useDisplayDistance(argsB))
    expect(resultB.current).toBe("10.00")
    expect(mockGetDistanceKm).toHaveBeenCalledWith(argsB)
  })

  it("formats distance with no decimals when distance > 10 km", () => {
    mockGetDistanceKm.mockReturnValueOnce(12.345)

    const args = { latitude: 48.8566, longitude: 2.3522 }
    const { result } = renderHook(() => useDisplayDistance(args))
    // 12.345.toFixed(0) === "12"
    expect(result.current).toBe("12")
    expect(mockGetDistanceKm).toHaveBeenCalledWith(args)
  })
})
