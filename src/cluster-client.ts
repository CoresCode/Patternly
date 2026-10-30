import type { ClusterResult, ClusteringAlgorithm, ParsedDataset } from './data'

type ClusterRequest = {
  dataset: Pick<ParsedDataset, 'info' | 'records'>
  algorithm: ClusteringAlgorithm
  features: string[]
  clusterCount: number
  eps: number
  minSamples: number
}

type ClusterResponse = { result: ClusterResult } | { error: string }

export function clusterInWorker(request: ClusterRequest): Promise<ClusterResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./cluster.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => worker.terminate()
    worker.onmessage = (event: MessageEvent<ClusterResponse>) => {
      finish()
      if ('result' in event.data) resolve(event.data.result)
      else reject(new Error(event.data.error))
    }
    worker.onerror = event => {
      finish()
      reject(new Error(event.message || 'Clustering worker stopped unexpectedly.'))
    }
    worker.onmessageerror = () => {
      finish()
      reject(new Error('Patternly could not read the clustering result from the worker.'))
    }
    try { worker.postMessage(request) } catch (error) {
      finish()
      reject(error instanceof Error ? error : new Error('Could not start clustering in the browser.'))
    }
  })
}
