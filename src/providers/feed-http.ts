// Bounded retries only for transient transport/server failures. Error messages
// deliberately exclude request URLs (which may contain an FDA API key).
export async function fetchFeed<T>(url: string, parse: (response: Response) => Promise<T>, options: {
  fetchImpl?: typeof fetch; accept?: string; timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
} = {}): Promise<T> {
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await (options.fetchImpl ?? fetch)(url, {
        cache: "no-store", signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        headers: { Accept: options.accept ?? "application/json", "User-Agent": "SafeKeep/0.5 (+https://github.com/soapytofu/post-purchase-safety)" },
      });
    } catch {
      if (attempt === 2) throw new Error("Source request failed after 3 attempts (network or timeout)");
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (response.ok) {
      try { return await parse(response); } catch {
        if (attempt === 2) throw new Error("Source returned an unreadable response after 3 attempts");
        await sleep(500 * 2 ** attempt);
        continue;
      }
    }
    await response.body?.cancel();
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 2) throw new Error(`Source returned HTTP ${response.status}`);
    const header = response.headers.get("retry-after");
    const retryAfter = header ? (/^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
    // Don't retry earlier than requested, or stall an entire scheduled job.
    if (retryAfter > 30_000) throw new Error(`Source returned HTTP ${response.status}; retry deferred to the next refresh`);
    await sleep(Math.max(500 * 2 ** attempt, Number.isFinite(retryAfter) ? retryAfter : 0));
  }
  throw new Error("Source request exhausted retries");
}
