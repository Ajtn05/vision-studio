export interface BackendHealth {
  status: string
  service: string
  hostname: string
  system: string
}

export async function getBackendHealth(): Promise<BackendHealth> {
  const response = await fetch('/api/health', {
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`Backend request failed (${response.status})`)
  }

  return response.json() as Promise<BackendHealth>
}
