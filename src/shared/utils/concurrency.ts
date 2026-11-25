/**
 * Execute an async mapper over an array with a bounded concurrency limit,
 * preserving the original order of results.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const safeConcurrency = Number.isFinite(concurrency)
    ? Math.floor(concurrency)
    : 1;
  const limit = Math.max(1, Math.min(safeConcurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
