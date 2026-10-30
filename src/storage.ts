import type { ClusterResult, ClusteringAlgorithm, DatasetInfo } from './data'

export type SavedDataset = {
  id: string
  name: string
  csvText: string
  rows: number
  columns: number
  clusterableColumns: number
  uploadedAt: number
}

export type SavedExperiment = {
  id: string
  datasetId: string
  datasetName: string
  createdAt: number
  algorithm: ClusteringAlgorithm
  features: string[]
  clusterCountRequested: number
  eps: number
  minSamples: number
  result: ClusterResult
}

const DATABASE = 'patternly-local-library'
const VERSION = 1
const DATASETS = 'datasets'
const EXPERIMENTS = 'experiments'
let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('This browser does not support local dataset storage.'))
  if (databasePromise) return databasePromise
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DATASETS)) db.createObjectStore(DATASETS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(EXPERIMENTS)) {
        const store = db.createObjectStore(EXPERIMENTS, { keyPath: 'id' })
        store.createIndex('datasetId', 'datasetId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open Patternly local storage.'))
    request.onblocked = () => reject(new Error('Patternly storage is busy in another tab. Close older Patternly tabs and try again.'))
  }).catch(error => {
    databasePromise = null
    throw error
  })
  return databasePromise!
}

function transact<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const request = action(transaction.objectStore(storeName))
    let result: T
    request.onsuccess = () => { result = request.result }
    request.onerror = () => reject(request.error ?? new Error('Could not read Patternly local storage.'))
    transaction.oncomplete = () => resolve(result!)
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save to Patternly local storage.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Patternly local storage operation was cancelled.'))
  }))
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function makeSavedDataset(info: DatasetInfo, csvText: string): SavedDataset {
  return {
    id: makeId(),
    name: info.filename,
    csvText,
    rows: info.rows,
    columns: info.columns,
    clusterableColumns: info.column_info.filter(column => column.kind !== 'text').length,
    uploadedAt: Date.now(),
  }
}

export function makeSavedExperiment(input: Omit<SavedExperiment, 'id' | 'createdAt'>): SavedExperiment {
  return { ...input, id: makeId(), createdAt: Date.now() }
}

export async function saveDataset(dataset: SavedDataset): Promise<void> {
  await transact(DATASETS, 'readwrite', store => store.put(dataset))
}

export async function getSavedDataset(id: string): Promise<SavedDataset | undefined> {
  return transact<SavedDataset | undefined>(DATASETS, 'readonly', store => store.get(id))
}

export async function listSavedDatasets(): Promise<SavedDataset[]> {
  const datasets = await transact<SavedDataset[]>(DATASETS, 'readonly', store => store.getAll())
  return datasets.sort((left, right) => right.uploadedAt - left.uploadedAt)
}

export async function saveExperiment(experiment: SavedExperiment): Promise<void> {
  await transact(EXPERIMENTS, 'readwrite', store => store.put(experiment))
}

export async function deleteSavedExperiment(id: string): Promise<void> {
  await transact(EXPERIMENTS, 'readwrite', store => store.delete(id))
}

export async function deleteSavedDataset(id: string): Promise<void> {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([DATASETS, EXPERIMENTS], 'readwrite')
    transaction.objectStore(DATASETS).delete(id)
    const index = transaction.objectStore(EXPERIMENTS).index('datasetId')
    const request = index.openCursor(IDBKeyRange.only(id))
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) { cursor.delete(); cursor.continue() }
    }
    request.onerror = () => reject(request.error ?? new Error('Could not remove the dataset reports.'))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not remove this dataset.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Removing this dataset was cancelled.'))
  })
}

export async function importSavedLibrary(datasets: SavedDataset[], experiments: SavedExperiment[]): Promise<void> {
  const db = await openDatabase()
  const idMap = new Map(datasets.map(dataset => [dataset.id, makeId()]))
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([DATASETS, EXPERIMENTS], 'readwrite')
    const datasetStore = transaction.objectStore(DATASETS)
    const experimentStore = transaction.objectStore(EXPERIMENTS)
    for (const dataset of datasets) datasetStore.put({ ...dataset, id: idMap.get(dataset.id)! })
    for (const experiment of experiments) {
      const datasetId = idMap.get(experiment.datasetId)
      if (datasetId) experimentStore.put({ ...experiment, id: makeId(), datasetId })
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not restore the Patternly backup.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Restoring the Patternly backup was cancelled.'))
  })
}

export async function listSavedExperiments(): Promise<SavedExperiment[]> {
  const experiments = await transact<SavedExperiment[]>(EXPERIMENTS, 'readonly', store => store.getAll())
  return experiments.sort((left, right) => right.createdAt - left.createdAt)
}
