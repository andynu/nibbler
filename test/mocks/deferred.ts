/**
 * A promise plus its captured settlement handles, so a test can hold a request
 * in flight and choose the order responses land in.
 *
 * Hand-rolled because tsconfig targets ES2020, which predates
 * Promise.withResolvers.
 */
export function deferred<T = unknown>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
