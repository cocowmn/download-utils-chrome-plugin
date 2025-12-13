import { delay } from '$utils/promise';

export interface BatchDelayOptions {
  delayMS?: number;
  batchSize?: number;
}

/**
 * Mirrors {@link Array.prototype.forEach} but will only execute a specified number of items (defined by {@link batchSize})
 * and will wait {@link delayMS} milliseconds before executing the subsequent batch.
 */
export async function batchDelayForEach<T, R = any>(
  array: T[],
  callback: (item?: T, index?: number, array?: T[]) => Promise<R> | R,
  { delayMS = 500, batchSize = 5 }: BatchDelayOptions = {},
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    const slice = array.slice(i, i + batchSize);
    const sliceResults = await Promise.allSettled(
      slice.map((item, index, array) => callback(item, i + index, array)),
    );
    results.push(...sliceResults);

    if (i + batchSize < array.length) await delay(delayMS);
  }

  return results;
}
