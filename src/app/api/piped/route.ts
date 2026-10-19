const DEFAULT_PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.leptons.xyz",
];

function getPipedInstances(): string[] {
  const configured = process.env.PIPED_API_BASE_URL
    ?.split(",")
    .map((instance) => instance.trim().replace(/\/$/, ""))
    .filter((instance) => instance.startsWith("https://"));

  return [...new Set([...(configured ?? []), ...DEFAULT_PIPED_INSTANCES])];
}

async function fetchPiped(path: string): Promise<unknown> {
  const attempts = getPipedInstances().map(async (instance) => {
    const response = await fetch(`${instance}${path}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error(`Piped API returned ${response.status}`);
    return response.json() as Promise<unknown>;
  });

  return Promise.any(attempts);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (type === "search") {
    const query = searchParams.get("q")?.trim();
    if (!query || query.length > 180) {
      return Response.json({ error: "A query between 1 and 180 characters is required." }, { status: 400 });
    }

    try {
      const result = await fetchPiped(
        `/search?q=${encodeURIComponent(query)}&filter=music_songs`
      );
      return Response.json(result, {
        headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" },
      });
    } catch {
      return Response.json({ error: "All configured Piped instances failed." }, { status: 502 });
    }
  }

  return Response.json({ error: "Unsupported Piped operation." }, { status: 400 });
}
