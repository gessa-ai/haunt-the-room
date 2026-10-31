/** Every failure the API returns. The JSON body is `{ error, code }`; `headers` carries e.g. Retry-After. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message)
  }
}

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Run an upstream call (actors, relay) and turn any failure into a visible 502 that names the call. */
export async function upstream<T>(service: "actors" | "relay", label: string, call: Promise<T>): Promise<T> {
  try {
    return await call
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(502, `${service}_failed`, `${label} failed: ${errorMessage(error)}`)
  }
}
