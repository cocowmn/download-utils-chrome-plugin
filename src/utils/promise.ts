export const DelaySignal = Symbol('delay');

/**
 * Promise wrapper for setTimeout. Resolves {@link DelaySignal} when complete
 */
export function delay(ms: number): Promise<typeof DelaySignal> {
  return new Promise((resolve) => setTimeout(() => resolve(DelaySignal), ms));
}
