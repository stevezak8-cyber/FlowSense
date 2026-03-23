const apiKey = process.env.GOOGLE_MAPS_API_KEY;

if (!apiKey) {
  console.log("[GoogleMaps] Skipped — no GOOGLE_MAPS_API_KEY set");
}

const geocodeCache = new Map<string, { lat: number; lng: number }>();

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  if (!apiKey) return null;

  const cached = geocodeCache.get(address);
  if (cached) return cached;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = (await res.json()) as any;

    if (data.status !== "OK" || !data.results?.length) {
      return null;
    }

    const { lat, lng } = data.results[0].geometry.location;
    const coords = { lat, lng };
    geocodeCache.set(address, coords);
    return coords;
  } catch (error) {
    console.error("[GoogleMaps] Geocode error:", error);
    return null;
  }
}

export async function getDriveTimesMatrix(
  origins: { lat: number; lng: number }[],
  destination: { lat: number; lng: number }
): Promise<(number | null)[]> {
  if (!apiKey || origins.length === 0) {
    return origins.map(() => null);
  }

  try {
    const originsParam = origins.map((o) => `${o.lat},${o.lng}`).join("|");
    const destParam = `${destination.lat},${destination.lng}`;
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originsParam}&destinations=${destParam}&mode=driving&departure_time=now&key=${apiKey}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = (await res.json()) as any;

    if (data.status !== "OK") {
      console.error("[GoogleMaps] Distance Matrix error:", data.status);
      return origins.map(() => null);
    }

    return data.rows.map(
      (row: { elements: Array<{ status: string; duration?: { value: number } }> }) => {
        const el = row.elements[0];
        if (el.status !== "OK" || !el.duration) return null;
        return Math.round(el.duration.value / 60);
      }
    );
  } catch (error) {
    console.error("[GoogleMaps] Distance Matrix error:", error);
    return origins.map(() => null);
  }
}
