import { describe, it, expect, vi, beforeEach } from "vitest";

// We'll dynamically import the module after mocking env vars
describe("google-maps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    // Clear the geocode cache between tests by re-importing
    global.fetch = vi.fn();
  });

  describe("geocodeAddress", () => {
    it("returns lat/lng on success", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "OK",
          results: [{ geometry: { location: { lat: 39.7392, lng: -104.9903 } } }],
        }),
      });

      const { geocodeAddress } = await import("../services/google-maps.js");
      const result = await geocodeAddress("123 Main St, Denver, CO 80202");

      expect(result).toEqual({ lat: 39.7392, lng: -104.9903 });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(
        "maps.googleapis.com/maps/api/geocode"
      );
    });

    it("returns null on bad address (zero results)", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "ZERO_RESULTS", results: [] }),
      });

      const { geocodeAddress } = await import("../services/google-maps.js");
      const result = await geocodeAddress("not a real address");

      expect(result).toBeNull();
    });

    it("returns null when API key is missing", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "");

      const { geocodeAddress } = await import("../services/google-maps.js");
      const result = await geocodeAddress("123 Main St");

      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("caches geocode results", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "OK",
          results: [{ geometry: { location: { lat: 39.7392, lng: -104.9903 } } }],
        }),
      });

      const { geocodeAddress } = await import("../services/google-maps.js");
      await geocodeAddress("123 Main St, Denver, CO");
      await geocodeAddress("123 Main St, Denver, CO");

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("getDriveTimesMatrix", () => {
    it("returns minutes array for multiple origins", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "OK",
          rows: [
            { elements: [{ status: "OK", duration: { value: 720 } }] },
            { elements: [{ status: "OK", duration: { value: 1500 } }] },
          ],
        }),
      });

      const { getDriveTimesMatrix } = await import("../services/google-maps.js");
      const result = await getDriveTimesMatrix(
        [{ lat: 39.7, lng: -104.9 }, { lat: 40.0, lng: -105.2 }],
        { lat: 39.8, lng: -105.0 }
      );

      expect(result).toEqual([12, 25]); // 720s=12min, 1500s=25min
    });

    it("returns null for failed pairs", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "OK",
          rows: [
            { elements: [{ status: "OK", duration: { value: 720 } }] },
            { elements: [{ status: "ZERO_RESULTS" }] },
          ],
        }),
      });

      const { getDriveTimesMatrix } = await import("../services/google-maps.js");
      const result = await getDriveTimesMatrix(
        [{ lat: 39.7, lng: -104.9 }, { lat: 0, lng: 0 }],
        { lat: 39.8, lng: -105.0 }
      );

      expect(result).toEqual([12, null]);
    });

    it("returns nulls when API key is missing", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "");

      const { getDriveTimesMatrix } = await import("../services/google-maps.js");
      const result = await getDriveTimesMatrix(
        [{ lat: 39.7, lng: -104.9 }, { lat: 40.0, lng: -105.2 }],
        { lat: 39.8, lng: -105.0 }
      );

      expect(result).toEqual([null, null]);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
