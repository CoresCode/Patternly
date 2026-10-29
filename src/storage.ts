import type { ClusterResult, DatasetInfo } from './data'

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
  algorithm: 'kmeans' | 'dbscan'
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

export async function listSavedExperiments(): Promise<SavedExperiment[]> {
  const experiments = await transact<SavedExperiment[]>(EXPERIMENTS, 'readonly', store => store.getAll())
  return experiments.sort((left, right) => right.createdAt - left.createdAt)
}
