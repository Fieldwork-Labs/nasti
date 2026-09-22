export const TIMED_OUT = Symbol("TIMED_OUT")

/** Bounds the caller's wait; the underlying operation is not cancelled. */
export const withTimeout = async <T>(
  operation: PromiseLike<T>,
  milliseconds = 5_000,
): Promise<T | typeof TIMED_OUT> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
