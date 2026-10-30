import type { ClusterResult } from './data'
import type { SavedDataset, SavedExperiment } from './storage'

export type WorkspaceBackup = {
  format: 'patternly-workspace'
  version: 1
  exportedAt: number
  datasets: SavedDataset[]
  experiments: SavedExperiment[]
}

const algorithms = new Set(['kmeans', 'dbscan', 'agglomerative', 'kmedoids'])

export function resultCsv(records: Record<string, string>[], headers: string[], result: ClusterResult): string {
  if (records.length !== result.labels.length) throw new Error('This report does not match the dataset. Reopen the saved experiment and try again.')
  const quote = (value: unknown) => {
    const text = String(value ?? '')
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  return [
    [...headers, 'Patternly group'].map(quote).join(','),
    ...records.map((row, index) => [...headers.map(header => row[header] ?? ''), result.labels[index] < 0 ? 'Noise' : `Cluster ${result.labels[index] + 1}`].map(quote).join(',')),
  ].join('\r\n')
}

export function makeWorkspaceBackup(datasets: SavedDataset[], experiments: SavedExperiment[]): WorkspaceBackup {
  return { format: 'patternly-workspace', version: 1, exportedAt: Date.now(), datasets, experiments }
}

export function parseWorkspaceBackup(text: string): WorkspaceBackup {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('This file is not a valid Patternly backup.') }
  if (!value || typeof value !== 'object') throw new Error('This file is not a valid Patternly backup.')
  const backup = value as Partial<WorkspaceBackup>
  if (backup.format !== 'patternly-workspace' || backup.version !== 1 || !Array.isArray(backup.datasets) || !Array.isArray(backup.experiments) || backup.datasets.length > 1000 || backup.experiments.length > 50_000) {
    throw new Error('This backup version is not supported by this Patternly build.')
  }
  const datasetIds = new Set<string>()
  for (const item of backup.datasets) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || datasetIds.has(item.id) || typeof item.name !== 'string' || typeof item.csvText !== 'string' || item.csvText.length > 25 * 1024 * 1024 || typeof item.uploadedAt !== 'number' || !Number.isFinite(item.uploadedAt) || !Number.isInteger(item.rows) || item.rows < 1 || !Number.isInteger(item.columns) || item.columns < 2 || !Number.isInteger(item.clusterableColumns) || item.clusterableColumns < 0) {
      throw new Error('The backup contains a dataset entry Patternly cannot read.')
    }
    datasetIds.add(item.id)
  }
  for (const item of backup.experiments) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.datasetId !== 'string' || !datasetIds.has(item.datasetId) || !algorithms.has(item.algorithm) || typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt) || !Array.isArray(item.features) || !item.features.every(feature => typeof feature === 'string') || !item.result || !Array.isArray(item.result.labels) || !item.result.labels.every(label => Number.isInteger(label) && label >= -1) || !Array.isArray(item.result.points) || item.result.labels.length !== item.result.points.length || !item.result.points.every(point => point && typeof point === 'object' && Object.values(point).every(value => typeof value === 'number' && Number.isFinite(value)))) {
      throw new Error('The backup contains an experiment entry Patternly cannot read.')
    }
  }
  return backup as WorkspaceBackup
}

