const DEFAULT_PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://piped-api.privacy.com.de",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.leptons.xyz",
];

const MAX_INSTANCES = 4;
const INSTANCE_COOLDOWN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5_000;

interface PipedHealthState {
  preferredInstance: string | null;
  failuresUntil: Map<string, number>;
}

const PIPED_HEALTH_KEY = "__aurasoundPipedHealth__";
const globalState = globalThis as typeof globalThis & {
  [PIPED_HEALTH_KEY]?: PipedHealthState;
};
const healthState = (globalState[PIPED_HEALTH_KEY] ??= {
  preferredInstance: null,
  failuresUntil: new Map<string, number>(),
});

function getPipedInstances(): string[] {
  const configured = process.env.PIPED_API_BASE_URL
    ?.split(",")
    .map((instance) => instance.trim().replace(/\/$/, ""))
    .filter((instance) => instance.startsWith("https://"));

  return [...new Set([...(configured ?? []), ...DEFAULT_PIPED_INSTANCES])].slice(
    0,
    MAX_INSTANCES
  );
}

interface PipedFetchResult {
  data: unknown;
  attempts: number;
  instance: string;
}

class PipedFailoverError extends Error {
  constructor(message: string, public readonly attempts: number) {
    super(message);
    this.name = "PipedFailoverError";
  }
}

async function fetchWithFallback(
  endpoint: string,
  options: RequestInit = {},
  requestSignal?: AbortSignal
): Promise<PipedFetchResult> {
  const now = Date.now();
  const instances = getPipedInstances();
  const activeInstances = instances.filter(
    (instance) => (healthState.failuresUntil.get(instance) ?? 0) <= now
  );
  const candidates = activeInstances.length > 0 ? activeInstances : instances;
  const ordered = healthState.preferredInstance
    ? [
        ...candidates.filter((instance) => instance === healthState.preferredInstance),
        ...candidates.filter((instance) => instance !== healthState.preferredInstance),
      ]
    : candidates;
  const errors: string[] = [];

  for (let index = 0; index < Math.min(ordered.length, MAX_INSTANCES); index += 1) {
    if (requestSignal?.aborted) throw new Error("Piped request was cancelled.");
    const instance = ordered[index];

    try {
      const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const signal = requestSignal
        ? AbortSignal.any([requestSignal, timeoutSignal])
        : timeoutSignal;
      const response = await fetch(`${instance}${endpoint}`, {
        ...options,
        cache: "no-store",
        headers: { Accept: "application/json", ...options.headers },
        signal,
      });

      if (!response.ok) {
        healthState.failuresUntil.set(instance, Date.now() + INSTANCE_COOLDOWN_MS);
        errors.push(`${instance} returned HTTP ${response.status}`);
        continue;
      }

      healthState.preferredInstance = instance;
      healthState.failuresUntil.delete(instance);
      return { data: await response.json(), attempts: index + 1, instance };
    } catch (error) {
      if (requestSignal?.aborted) throw new Error("Piped request was cancelled.");
      healthState.failuresUntil.set(instance, Date.now() + INSTANCE_COOLDOWN_MS);
      errors.push(
        `${instance}: ${error instanceof Error ? error.message : "network error"}`
      );
    }
  }

  throw new PipedFailoverError(
    `All ${errors.length} Piped instance attempts failed. ${errors.join("; ")}`,
    errors.length
  );
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
      const result = await fetchWithFallback(
        `/search?q=${encodeURIComponent(query)}&filter=music_songs`,
        {},
        request.signal
      );
      return Response.json(result.data, {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
          "X-Piped-Attempts": String(result.attempts),
          "X-Piped-Instance": result.instance,
        },
      });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "All configured Piped instances failed.",
          attempts:
            error instanceof PipedFailoverError ? error.attempts : 0,
        },
        { status: 502 }
      );
    }
  }

  return Response.json({ error: "Unsupported Piped operation." }, { status: 400 });
}
