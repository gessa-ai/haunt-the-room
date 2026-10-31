// Bounded concurrency for actor RPCs: the server shares ONE h2 connection to the control plane, and hundreds of
// simultaneous streams earned a GoAway ("too_many_data_frames"). Calls queue here instead.
export function concurrency(max: number) {
  let active = 0
  const waiting: (() => void)[] = []
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>(resolve => waiting.push(resolve))
    active++
    try {
      return await task()
    } finally {
      active--
      waiting.shift()?.()
    }
  }
}

/** One shared in-flight call, reused for `ms` (O(1) RPCs however many pollers). */
export function cached<T>(ms: number, load: () => Promise<T>): () => Promise<T> {
  let value: { at: number; promise: Promise<T> } | null = null
  return () => {
    const now = Date.now()
    if (!value || now - value.at > ms) {
      const promise = load()
      value = { at: now, promise }
      promise.catch(() => (value?.promise === promise ? (value = null) : undefined))
    }
    return value.promise
  }
}
