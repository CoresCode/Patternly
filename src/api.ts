export type ColumnInfo = { name: string; type: string; missing: number; unique: number; numeric: boolean }
export type DatasetInfo = { filename: string; rows: number; columns: number; column_info: ColumnInfo[]; preview: Record<string, unknown>[] }
export type ClusterResult = { algorithm: string; features: string[]; labels: number[]; cluster_counts: Record<string, number>; cluster_count: number; noise_count: number; inertia: number | null; points: Record<string, number>[] }

const API = ''

async function send<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new Error('Patternly’s API is not running. Start both services with npm.cmd run dev:all from the Patternly folder.')
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.detail ?? `Patternly API request failed (${response.status}).`)
  return payload as T
}

export async function inspect(file: File): Promise<DatasetInfo> {
  const body = new FormData(); body.append('file', file)
  return send<DatasetInfo>(`${API}/api/dataset/inspect`, { method: 'POST', body })
}

export async function cluster(file: File, algorithm: string, features: string[], clusters: number, eps: number, minSamples: number): Promise<ClusterResult> {
  const params = new URLSearchParams({ algorithm, features: features.join(','), clusters: String(clusters), eps: String(eps), min_samples: String(minSamples) })
  const body = new FormData(); body.append('file', file)
  return send<ClusterResult>(`${API}/api/cluster?${params}`, { method: 'POST', body })
}
