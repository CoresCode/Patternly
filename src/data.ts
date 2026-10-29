export type ColumnInfo = {
  name: string
  type: string
  missing: number
  unique: number
  numeric: boolean
  kind: 'numeric' | 'categorical' | 'text'
  basket: boolean
}

export type DatasetInfo = {
  filename: string
  rows: number
  columns: number
  column_info: ColumnInfo[]
  preview: Record<string, string>[]
}

export type ParsedDataset = {
  info: DatasetInfo
  records: Record<string, string>[]
  sourceText: string
}

export type ClusteringAlgorithm = 'kmeans' | 'dbscan' | 'agglomerative' | 'kmedoids'

export type ClusterResult = {
  algorithm: ClusteringAlgorithm
  features: string[]
  labels: number[]
  cluster_counts: Record<string, number>
  cluster_count: number
  noise_count: number
  inertia: number | null
  points: Record<string, number>[]
  plot_features: [string, string] | null
  cluster_summaries?: Record<string, string[]>
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const MAX_KMEANS_ROWS = 10_000
export const MAX_DBSCAN_ROWS = 2_500
export const MAX_AGGLOMERATIVE_ROWS = 500
export const MAX_KMEDOIDS_ROWS = 300
export const MAX_ENCODED_FEATURES = 1_500

export function parseCsv(text: string, filename = 'dataset.csv'): ParsedDataset {
  const normalized = text.replace(/^\uFEFF/, '')
  const firstLine = normalized.split(/\r?\n/, 1)[0] ?? ''
  const delimiters = [',', '\t', ';']
  const delimiter = delimiters.reduce((best, candidate) => countDelimiter(firstLine, candidate) > countDelimiter(firstLine, best) ? candidate : best, ',')
  const rows = readRows(normalized, delimiter).filter(row => row.some(value => value.trim() !== ''))
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one data row.')
  if (rows[0].length < 2) throw new Error('Upload a CSV with at least two columns.')

  const headers = uniqueHeaders(rows[0])
  const records = rows.slice(1).map((row, rowIndex) => {
    if (row.length > headers.length && row.slice(headers.length).some(value => value.trim() !== '')) {
      throw new Error(`Row ${rowIndex + 2} has more values than the header. Check the CSV delimiter or quoting.`)
    }
    return Object.fromEntries(headers.map((header, index) => [header, (row[index] ?? '').trim()]))
  })
  if (records.length === 0) throw new Error('The CSV has no data rows.')

  const basketHeaders = new Set(headers.filter(name => /^item[\s_-]*\d+$/i.test(name)))
  const basketMode = basketHeaders.size >= 3
  const columnInfo = headers.map(name => {
    const values = records.map(record => record[name])
    const present = values.filter(value => value !== '')
    const numeric = present.length > 0 && present.every(value => Number.isFinite(Number(value)))
    const unique = new Set(present).size
    const basket = basketMode && basketHeaders.has(name)
    const categoryLimit = Math.min(500, Math.max(20, Math.ceil(records.length * 0.15)))
    const categorical = !numeric && (basket || (present.length > 0 && unique <= categoryLimit && unique > 1))
    const kind: ColumnInfo['kind'] = numeric ? 'numeric' : categorical ? 'categorical' : 'text'
    return {
      name,
      type: numeric ? 'number' : categorical ? 'category' : 'text',
      missing: values.length - present.length,
      unique,
      numeric,
      kind,
      basket,
    }
  })

  return {
    info: {
      filename,
      rows: records.length,
      columns: headers.length,
      column_info: columnInfo,
      preview: records.slice(0, 12),
    },
    records,
    sourceText: normalized,
  }
}

export async function readCsvFile(file: File): Promise<ParsedDataset> {
  if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Patternly currently accepts CSV files only (.csv).')
  if (file.size > MAX_FILE_BYTES) throw new Error('CSV files must be 25 MB or smaller.')
  return parseCsv(await file.text(), file.name)
}

function countDelimiter(line: string, delimiter: string): number {
  let quoted = false
  let count = 0
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1
      else quoted = !quoted
    } else if (!quoted && line[index] === delimiter) count += 1
  }
  return count
}

function readRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') quoted = false
      else cell += character
    } else if (character === '"' && cell.trim() === '') quoted = true
    else if (character === delimiter) {
      row.push(cell)
      cell = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += character
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted value.')
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function uniqueHeaders(rawHeaders: string[]): string[] {
  const seen = new Map<string, number>()
  return rawHeaders.map((raw, index) => {
    const base = raw.trim() || `Column ${index + 1}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base} (${count})`
  })
}

export function recommendedFeatures(info: DatasetInfo): string[] {
  const basket = info.column_info.filter(column => column.basket)
  if (basket.length >= 3) return basket.map(column => column.name)
  const numeric = info.column_info.filter(column => column.kind === 'numeric').map(column => column.name)
  if (numeric.length) return numeric.slice(0, 2)
  return info.column_info.filter(column => column.kind === 'categorical').slice(0, 3).map(column => column.name)
}

type EncodedMatrix = { values: number[][]; featureNames: string[]; numericValues: number[][]; numericNames: string[] }

function numericMatrix(dataset: ParsedDataset, features: string[]): EncodedMatrix {
  if (features.length === 0) throw new Error('Select at least one numeric or categorical feature.')
  const columnsByName = new Map(dataset.info.column_info.map(column => [column.name, column]))
  if (features.some(feature => !columnsByName.has(feature) || columnsByName.get(feature)?.kind === 'text')) {
    throw new Error('Choose numeric columns, categorical columns, or detected item columns.')
  }

  const numericFeatures = features.filter(feature => columnsByName.get(feature)?.kind === 'numeric')
  const categoryFeatures = features.filter(feature => columnsByName.get(feature)?.kind === 'categorical' && !columnsByName.get(feature)?.basket)
  const basketFeatures = features.filter(feature => columnsByName.get(feature)?.basket)
  const values = dataset.records.map(() => [] as number[])
  const featureNames: string[] = []
  const numericValues = dataset.records.map(() => [] as number[])

  for (const feature of numericFeatures) {
    const columnValues = dataset.records.map(record => record[feature] === '' ? Number.NaN : Number(record[feature]))
    const sorted = columnValues.filter(Number.isFinite).sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    const median = sorted.length === 0 ? 0 : sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    const filled = columnValues.map(value => Number.isFinite(value) ? value : median)
    numericValues.forEach((row, index) => row.push(filled[index]))
    featureNames.push(feature)
    clipNumericTails(filled).forEach((value, index) => values[index].push(value))
  }

  for (const feature of categoryFeatures) {
    const vocabulary = [...new Set(dataset.records.map(record => record[feature]).filter(value => value !== ''))].sort()
    for (const category of vocabulary) {
      featureNames.push(`${feature}=${category}`)
      dataset.records.forEach((record, index) => values[index].push(record[feature] === category ? 1 : 0))
    }
  }

  if (basketFeatures.length) {
    const vocabulary = [...new Set(dataset.records.flatMap(record => basketFeatures.map(feature => record[feature]).filter(value => value !== '')))].sort()
    for (const item of vocabulary) {
      featureNames.push(`item=${item}`)
      dataset.records.forEach((record, index) => {
        const present = basketFeatures.some(feature => record[feature] === item)
        values[index].push(present ? 1 : 0)
      })
    }
  }

  if (featureNames.length > MAX_ENCODED_FEATURES) {
    throw new Error(`These selections create ${featureNames.length.toLocaleString()} encoded features. Select fewer columns or reduce their category count (maximum ${MAX_ENCODED_FEATURES.toLocaleString()}).`)
  }
  if (featureNames.length === 0) throw new Error('The selected columns do not contain usable numeric or categorical values.')

  const means = featureNames.map((_, column) => values.reduce((sum, row) => sum + row[column], 0) / values.length)
  const scales = featureNames.map((_, column) => {
    const variance = values.reduce((sum, row) => sum + (row[column] - means[column]) ** 2, 0) / values.length
    return Math.sqrt(variance) || 1
  })
  const scaled = values.map(row => row.map((value, column) => (value - means[column]) / scales[column]))
  return { values: scaled, featureNames, numericValues, numericNames: numericFeatures }
}

function clipNumericTails(values: number[]): number[] {
  if (values.length < 100) return values
  const sorted = [...values].sort((left, right) => left - right)
  const at = (percentile: number) => sorted[Math.floor((sorted.length - 1) * percentile)]
  const low = at(0.02), high = at(0.98)
  return values.map(value => Math.max(low, Math.min(high, value)))
}

export function clusterData(
  dataset: ParsedDataset,
  algorithm: ClusteringAlgorithm,
  features: string[],
  clusterCount: number,
  eps: number,
  minSamples: number,
): ClusterResult {
  const limits: Record<ClusteringAlgorithm, number> = { kmeans: MAX_KMEANS_ROWS, dbscan: MAX_DBSCAN_ROWS, agglomerative: MAX_AGGLOMERATIVE_ROWS, kmedoids: MAX_KMEDOIDS_ROWS }
  const limit = limits[algorithm]
  if (dataset.records.length > limit) {
    const names: Record<ClusteringAlgorithm, string> = { kmeans: 'K-Means', dbscan: 'DBSCAN', agglomerative: 'Agglomerative clustering', kmedoids: 'K-Medoids' }
    throw new Error(`${names[algorithm]} supports up to ${limit.toLocaleString()} rows in this browser. Narrow the CSV or choose another method.`)
  }
  const matrix = numericMatrix(dataset, features)
  const scaled = matrix.values
  let labels: number[]
  let inertia: number | null = null
  if (algorithm !== 'dbscan') {
    if (!Number.isInteger(clusterCount) || clusterCount < 2 || clusterCount > scaled.length) {
      throw new Error(`Choose between 2 and ${scaled.length} clusters for this dataset.`)
    }
    if (algorithm === 'kmeans') {
      const result = runKMeans(scaled, clusterCount)
      labels = result.labels
      inertia = result.inertia
    } else if (algorithm === 'agglomerative') labels = runAgglomerative(scaled, clusterCount)
    else labels = runKMedoids(scaled, clusterCount)
  } else {
    if (!Number.isFinite(eps) || eps <= 0) throw new Error('DBSCAN radius must be greater than zero.')
    if (!Number.isInteger(minSamples) || minSamples < 2) throw new Error('DBSCAN minimum points must be at least 2.')
    labels = runDbscan(scaled, eps, minSamples)
  }

  const counts: Record<string, number> = {}
  for (const label of labels) counts[String(label)] = (counts[String(label)] ?? 0) + 1
  const clusterCountFound = new Set(labels.filter(label => label !== -1)).size
  const cluster_summaries = summarizeClusters(dataset, features, labels)
  let plot_features: [string, string] | null = null
  let plotPoints: Record<string, number>[] = []
  if (matrix.numericNames.length >= 2) {
    plot_features = [matrix.numericNames[0], matrix.numericNames[1]]
    plotPoints = matrix.numericValues.map(row => Object.fromEntries(matrix.numericNames.map((name, index) => [name, row[index]])))
  } else if (matrix.featureNames.length >= 2) {
    const projection = pcaProjection(scaled)
    if (projection) {
      plot_features = ['Pattern summary 1', 'Pattern summary 2']
      plotPoints = projection.map(([x, y]) => ({ 'Pattern summary 1': x, 'Pattern summary 2': y }))
    }
  }
  return {
    algorithm,
    features,
    labels,
    cluster_counts: counts,
    cluster_count: clusterCountFound,
    noise_count: labels.filter(label => label === -1).length,
    inertia,
    points: plotPoints,
    plot_features,
    cluster_summaries,
  }
}

function summarizeClusters(dataset: ParsedDataset, features: string[], labels: number[]): Record<string, string[]> {
  const summaries: Record<string, string[]> = {}
  const groups = new Map<number, number[]>()
  const columns = new Map(dataset.info.column_info.map(column => [column.name, column]))
  labels.forEach((label, index) => {
    const indices = groups.get(label)
    if (indices) indices.push(index)
    else groups.set(label, [index])
  })
  for (const [group, indices] of groups) {
    const details: string[] = []
    const basketFeatures = features.filter(feature => columns.get(feature)?.basket)
    if (basketFeatures.length) {
      const counts = new Map<string, number>()
      for (const index of indices) {
        const itemsInRow = new Set(basketFeatures.map(feature => dataset.records[index][feature]).filter(Boolean))
        for (const item of itemsInRow) counts.set(item, (counts.get(item) ?? 0) + 1)
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
      if (top.length) details.push(`Common items: ${top.map(([item, count]) => `${item} (${Math.round(count / indices.length * 100)}%)`).join(', ')}`)
    }
    for (const feature of features.filter(name => !basketFeatures.includes(name))) {
      const column = columns.get(feature)
      if (column?.kind === 'numeric') {
        const values = indices.map(index => Number(dataset.records[index][feature])).filter(Number.isFinite)
        if (values.length) details.push(`${feature}: average ${formatValue(values.reduce((sum, value) => sum + value, 0) / values.length)}`)
      } else {
        const counts = new Map<string, number>()
        for (const index of indices) {
          const value = dataset.records[index][feature]
          if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
        }
        const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
        if (common) details.push(`${feature}: most common ${common[0]} (${Math.round(common[1] / indices.length * 100)}%)`)
      }
      if (details.length >= 3) break
    }
    if (group === -1) details.unshift('Rows that did not fit a dense group (DBSCAN noise).')
    summaries[String(group)] = details.length ? details.slice(0, 3) : ['Rows grouped by similarity across the selected features.']
  }
  return summaries
}

function formatValue(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

function squaredDistance(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0)
}

function pcaProjection(points: number[][]): [number, number][] | null {
  const dimensions = points[0]?.length ?? 0
  if (dimensions < 2) return null
  const components: number[][] = []
  for (let component = 0; component < 2; component += 1) {
    let vector = Array.from({ length: dimensions }, (_, index) => Math.sin((index + 1) * (component + 2) * 1.618))
    const normalize = (values: number[]) => {
      const length = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1
      return values.map(value => value / length)
    }
    vector = normalize(vector)
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const scores = points.map(row => row.reduce((sum, value, index) => sum + value * vector[index], 0))
      const next = Array.from({ length: dimensions }, (_, column) => points.reduce((sum, row, rowIndex) => sum + row[column] * scores[rowIndex], 0) / points.length)
      for (const previous of components) {
        const overlap = next.reduce((sum, value, index) => sum + value * previous[index], 0)
        next.forEach((_, index) => { next[index] -= overlap * previous[index] })
      }
      vector = normalize(next)
    }
    components.push(vector)
  }
  return points.map(row => [
    row.reduce((sum, value, index) => sum + value * components[0][index], 0),
    row.reduce((sum, value, index) => sum + value * components[1][index], 0),
  ])
}

function runKMeans(points: number[][], k: number): { labels: number[]; inertia: number } {
  let seed = 42
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  const centroids = [points[Math.floor(random() * points.length)].slice()]
  while (centroids.length < k) {
    const distances = points.map(point => Math.min(...centroids.map(center => squaredDistance(point, center))))
    const total = distances.reduce((sum, distance) => sum + distance, 0)
    if (total === 0) {
      const unused = points.find(point => !centroids.some(center => squaredDistance(point, center) === 0))
      centroids.push((unused ?? points[centroids.length % points.length]).slice())
      continue
    }
    let threshold = random() * total
    let selected = points.length - 1
    for (let index = 0; index < distances.length; index += 1) {
      threshold -= distances[index]
      if (threshold <= 0) { selected = index; break }
    }
    centroids.push(points[selected].slice())
  }

  let labels = new Array<number>(points.length).fill(-1)
  for (let iteration = 0; iteration < 100; iteration += 1) {
    let changed = false
    for (let index = 0; index < points.length; index += 1) {
      let nearest = 0
      let best = squaredDistance(points[index], centroids[0])
      for (let candidate = 1; candidate < k; candidate += 1) {
        const distance = squaredDistance(points[index], centroids[candidate])
        if (distance < best) { best = distance; nearest = candidate }
      }
      if (labels[index] !== nearest) { labels[index] = nearest; changed = true }
    }
    const sums = Array.from({ length: k }, () => new Array<number>(points[0].length).fill(0))
    const counts = new Array<number>(k).fill(0)
    labels.forEach((label, index) => {
      counts[label] += 1
      points[index].forEach((value, column) => { sums[label][column] += value })
    })
    let maxShift = 0
    for (let cluster = 0; cluster < k; cluster += 1) {
      if (counts[cluster] === 0) {
        const farthest = points.reduce((bestIndex, point, index) => squaredDistance(point, centroids[labels[index]]) > squaredDistance(points[bestIndex], centroids[labels[bestIndex]]) ? index : bestIndex, 0)
        centroids[cluster] = points[farthest].slice()
        labels[farthest] = cluster
        changed = true
      } else {
        const next = sums[cluster].map(value => value / counts[cluster])
        maxShift = Math.max(maxShift, squaredDistance(centroids[cluster], next))
        centroids[cluster] = next
      }
    }
    if (!changed || maxShift < 1e-10) break
  }
  const inertia = points.reduce((sum, point, index) => sum + squaredDistance(point, centroids[labels[index]]), 0)
  return { labels, inertia }
}

function runAgglomerative(points: number[][], targetClusters: number): number[] {
  const rowCount = points.length
  const capacity = rowCount * 2
  const distances = new Float64Array(capacity * capacity)
  const sizes = new Int32Array(capacity)
  const left = new Int32Array(capacity).fill(-1)
  const right = new Int32Array(capacity).fill(-1)
  let active = Array.from({ length: rowCount }, (_, index) => index)
  for (let row = 0; row < rowCount; row += 1) {
    sizes[row] = 1
    for (let column = row + 1; column < rowCount; column += 1) {
      const distance = squaredDistance(points[row], points[column])
      distances[row * capacity + column] = distance
      distances[column * capacity + row] = distance
    }
  }

  let nextCluster = rowCount
  while (active.length > targetClusters) {
    let bestDistance = Number.POSITIVE_INFINITY
    let mergeA = -1, mergeB = -1
    for (let first = 0; first < active.length; first += 1) {
      const a = active[first]
      for (let second = first + 1; second < active.length; second += 1) {
        const b = active[second]
        const distance = distances[a * capacity + b]
        if (distance < bestDistance) { bestDistance = distance; mergeA = a; mergeB = b }
      }
    }
    if (mergeA < 0 || mergeB < 0) break
    const merged = nextCluster++
    left[merged] = mergeA; right[merged] = mergeB
    sizes[merged] = sizes[mergeA] + sizes[mergeB]
    for (const other of active) {
      if (other === mergeA || other === mergeB) continue
      const sizeA = sizes[mergeA], sizeB = sizes[mergeB], sizeOther = sizes[other]
      const distanceAC = distances[mergeA * capacity + other]
      const distanceBC = distances[mergeB * capacity + other]
      const mergedDistance = Math.max(0, ((sizeA + sizeOther) * distanceAC + (sizeB + sizeOther) * distanceBC - sizeOther * bestDistance) / (sizeA + sizeB + sizeOther))
      distances[merged * capacity + other] = mergedDistance
      distances[other * capacity + merged] = mergedDistance
    }
    active = active.filter(cluster => cluster !== mergeA && cluster !== mergeB)
    active.push(merged)
  }

  const labels = new Array<number>(rowCount).fill(-1)
  active.forEach((root, label) => {
    const pending = [root]
    while (pending.length) {
      const current = pending.pop()!
      if (left[current] < 0) labels[current] = label
      else { pending.push(left[current], right[current]) }
    }
  })
  return labels
}

function runKMedoids(points: number[][], k: number): number[] {
  const count = points.length
  const distances = new Float64Array(count * count)
  for (let row = 0; row < count; row += 1) {
    for (let column = row + 1; column < count; column += 1) {
      const distance = Math.sqrt(squaredDistance(points[row], points[column]))
      distances[row * count + column] = distance
      distances[column * count + row] = distance
    }
  }

  const medoids = [0]
  while (medoids.length < k) {
    let farthest = -1, farthestDistance = -1
    for (let row = 0; row < count; row += 1) {
      if (medoids.includes(row)) continue
      const nearest = Math.min(...medoids.map(medoid => distances[row * count + medoid]))
      if (nearest > farthestDistance) { farthest = row; farthestDistance = nearest }
    }
    if (farthest < 0) break
    medoids.push(farthest)
  }

  let labels = new Array<number>(count).fill(-1)
  for (let iteration = 0; iteration < 30; iteration += 1) {
    let changed = false
    for (let row = 0; row < count; row += 1) {
      let nearest = 0
      for (let cluster = 1; cluster < medoids.length; cluster += 1) {
        if (distances[row * count + medoids[cluster]] < distances[row * count + medoids[nearest]]) nearest = cluster
      }
      labels[row] = nearest
    }
    const groups = Array.from({ length: medoids.length }, () => [] as number[])
    labels.forEach((label, row) => groups[label].push(row))
    for (let cluster = 0; cluster < groups.length; cluster += 1) {
      const members = groups[cluster]
      if (members.length === 0) {
        let farthest = 0, farthestDistance = -1
        for (let row = 0; row < count; row += 1) {
          const nearest = Math.min(...medoids.map(medoid => distances[row * count + medoid]))
          if (nearest > farthestDistance && !medoids.includes(row)) { farthest = row; farthestDistance = nearest }
        }
        if (medoids[cluster] !== farthest) { medoids[cluster] = farthest; changed = true }
        continue
      }
      let best = medoids[cluster], bestCost = Number.POSITIVE_INFINITY
      for (const candidate of members) {
        let cost = 0
        for (const member of members) cost += distances[candidate * count + member]
        if (cost < bestCost) { best = candidate; bestCost = cost }
      }
      if (medoids[cluster] !== best) { medoids[cluster] = best; changed = true }
    }
    if (!changed) break
  }
  for (let row = 0; row < count; row += 1) {
    let nearest = 0
    for (let cluster = 1; cluster < medoids.length; cluster += 1) {
      if (distances[row * count + medoids[cluster]] < distances[row * count + medoids[nearest]]) nearest = cluster
    }
    labels[row] = nearest
  }
  return labels
}

function runDbscan(points: number[][], eps: number, minSamples: number): number[] {
  const radiusSquared = eps * eps
  const neighborhoods = points.map((point, index) => points.flatMap((other, otherIndex) => squaredDistance(point, other) <= radiusSquared ? [otherIndex] : []))
  const labels = new Array<number>(points.length).fill(-2)
  const visited = new Array<boolean>(points.length).fill(false)
  let cluster = 0
  for (let index = 0; index < points.length; index += 1) {
    if (visited[index]) continue
    visited[index] = true
    const neighbors = neighborhoods[index]
    if (neighbors.length < minSamples) { labels[index] = -1; continue }
    labels[index] = cluster
    const queue = neighbors.filter(neighbor => neighbor !== index)
    const queued = new Set(queue)
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const candidate = queue[cursor]
      if (!visited[candidate]) {
        visited[candidate] = true
        const nearby = neighborhoods[candidate]
        if (nearby.length >= minSamples) {
          for (const neighbor of nearby) if (!queued.has(neighbor)) { queued.add(neighbor); queue.push(neighbor) }
        }
      }
      if (labels[candidate] === -2 || labels[candidate] === -1) labels[candidate] = cluster
    }
    cluster += 1
  }
  return labels.map(label => label === -2 ? -1 : label)
}
