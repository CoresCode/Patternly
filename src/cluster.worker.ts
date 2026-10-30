import { clusterData, type ClusterResult, type ClusteringAlgorithm, type ParsedDataset } from './data'

type Request = {
  dataset: Pick<ParsedDataset, 'info' | 'records'>
  algorithm: ClusteringAlgorithm
  features: string[]
  clusterCount: number
  eps: number
  minSamples: number
}

type Response = { result: ClusterResult } | { error: string }

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null
  postMessage: (message: Response) => void
}

workerScope.onmessage = event => {
  const { dataset, algorithm, features, clusterCount, eps, minSamples } = event.data
  try {
    workerScope.postMessage({ result: clusterData(dataset, algorithm, features, clusterCount, eps, minSamples) })
  } catch (error) {
    workerScope.postMessage({ error: error instanceof Error ? error.message : 'Clustering failed.' })
  }
}
