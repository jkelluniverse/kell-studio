// KS-04 DECISION: in-memory fixed-window rate limiter. Studio runs as a
// single Railway instance, so a shared store would be premature; if the app
// ever scales out, swap the Map for Redis behind this same function.
const buckets = new Map<string, { windowStart: number; count: number }>();

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  if (buckets.size > 10_000) buckets.clear(); // crude memory backstop
  return bucket.count <= limit;
}
