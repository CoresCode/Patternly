import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { clusterData, parseCsv, readCsvFile, recommendedFeatures } from '../src/data.ts'

const groupedCsv = `x,y,label\n0,0,a\n0.1,0.1,a\n-0.1,-0.1,a\n10,10,b\n10.1,9.9,b\n9.9,10.1,b\n`

test('parses the bundled sample and recognizes numeric columns', async () => {
  const csv = await readFile(new URL('../src/data/mini-flowers.csv', import.meta.url), 'utf8')
  const data = parseCsv(csv, 'mini-flowers.csv')
  assert.equal(data.info.rows, 20)
  assert.equal(data.info.columns, 4)
  assert.deepEqual(data.info.column_info.filter(column => column.numeric).map(column => column.name), ['sepal_length', 'sepal_width', 'petal_length'])
})

test('parses quoted commas, escaped quotes, line breaks, and a UTF-8 BOM', () => {
  const data = parseCsv('\uFEFFx,label\r\n1,"blue, ""special"""\r\n2,"second\nline"\r\n')
  assert.equal(data.records[0].label, 'blue, "special"')
  assert.equal(data.records[1].label, 'second\nline')
})

test('detects tab-separated columns and fills missing cells', () => {
  const data = parseCsv('x\ty\tgroup\n1\t2\ta\n3\t\tb\n')
  assert.equal(data.info.columns, 3)
  assert.equal(data.info.column_info.find(column => column.name === 'y').missing, 1)
  assert.equal(data.records[1].y, '')
})

test('reads a CSV File locally for the upload workflow', async () => {
  const file = new File(['x,y\n1,2\n3,4\n'], 'upload.csv', { type: 'text/csv' })
  const data = await readCsvFile(file)
  assert.equal(data.info.filename, 'upload.csv')
  assert.equal(data.info.rows, 2)
  assert.deepEqual(data.records[1], { x: '3', y: '4' })
})

test('rejects unsupported file extensions with a clear message', async () => {
  const file = new File(['x,y\n1,2'], 'workbook.xlsx')
  await assert.rejects(readCsvFile(file), /CSV files only/)
})

test('rejects unclosed quoted fields', () => {
  assert.throws(() => parseCsv('x,y\n1,"unfinished\n'), /unclosed quoted value/)
})

test('runs deterministic K-Means and returns assignments for every row', () => {
  const data = parseCsv(groupedCsv)
  const result = clusterData(data, 'kmeans', ['x', 'y'], 2, 0.5, 2)
  assert.equal(result.cluster_count, 2)
  assert.equal(result.labels.length, 6)
  assert.equal(Object.values(result.cluster_counts).reduce((sum, count) => sum + count, 0), 6)
  assert.ok(result.inertia >= 0)
  assert.deepEqual(result.labels, clusterData(data, 'kmeans', ['x', 'y'], 2, 0.5, 2).labels)
})

test('keeps every selected numeric column available for interactive chart axes', () => {
  const data = parseCsv('x,y,z,kind\n0,0,1,a\n0.1,0.1,2,a\n10,10,3,b\n10.1,9.9,4,b\n')
  const result = clusterData(data, 'kmeans', ['x', 'y', 'z', 'kind'], 2, 0.5, 2)
  assert.deepEqual(result.plot_features, ['x', 'y'])
  assert.deepEqual(Object.keys(result.points[0]), ['x', 'y', 'z'])
})

test('caps a few extreme numeric values so they do not dominate K-Means', () => {
  const rows = [...Array(49).fill('0,0'), ...Array(50).fill('1,1'), '1000000000,1000000000']
  const data = parseCsv(`x,y\n${rows.join('\n')}`)
  const result = clusterData(data, 'kmeans', ['x', 'y'], 2, 0.5, 2)
  const counts = Object.values(result.cluster_counts).sort((a, b) => a - b)
  assert.equal(result.cluster_count, 2)
  assert.ok(counts[1] - counts[0] <= 2)
})

test('runs DBSCAN and identifies noise points', () => {
  const data = parseCsv('x,y\n0,0\n0.1,0.1\n10,10\n10.1,9.9\n50,50\n')
  const result = clusterData(data, 'dbscan', ['x', 'y'], 2, 0.2, 2)
  assert.equal(result.cluster_count, 2)
  assert.equal(result.noise_count, 1)
  assert.equal(result.cluster_counts['-1'], 1)
})

test('runs agglomerative clustering and returns the requested groups', () => {
  const data = parseCsv(groupedCsv)
  const result = clusterData(data, 'agglomerative', ['x', 'y'], 2, 0.5, 2)
  assert.equal(result.cluster_count, 2)
  assert.equal(result.labels.length, data.info.rows)
  assert.ok(result.cluster_counts['0'] > 0)
  assert.ok(result.cluster_counts['1'] > 0)
})

test('runs deterministic K-Medoids and assigns each row to a representative', () => {
  const data = parseCsv(groupedCsv)
  const result = clusterData(data, 'kmedoids', ['x', 'y'], 2, 0.5, 2)
  assert.equal(result.cluster_count, 2)
  assert.equal(result.labels.length, data.info.rows)
  assert.deepEqual(result.labels, clusterData(data, 'kmedoids', ['x', 'y'], 2, 0.5, 2).labels)
})

test('recognizes categorical columns and clusters them with a projected map', () => {
  const data = parseCsv('color,shape\nred,round\nred,round\nblue,square\nblue,square\n')
  assert.deepEqual(recommendedFeatures(data.info), ['color', 'shape'])
  assert.equal(data.info.column_info[0].kind, 'categorical')
  const result = clusterData(data, 'kmeans', ['color', 'shape'], 2, 0.5, 2)
  assert.equal(result.cluster_count, 2)
  assert.deepEqual(result.plot_features, ['Pattern summary 1', 'Pattern summary 2'])
  assert.equal(result.points.length, 4)
  assert.ok(result.cluster_summaries['0'].length > 0)
})

test('recognizes grocery item columns as a basket and uses those instead of a count', () => {
  const data = parseCsv('Item(s),Item 1,Item 2,Item 3\n2,milk,bread,\n2,apples,milk,\n2,bread,apples,\n')
  assert.deepEqual(recommendedFeatures(data.info), ['Item 1', 'Item 2', 'Item 3'])
  assert.equal(data.info.column_info.find(column => column.name === 'Item 1').basket, true)
  const result = clusterData(data, 'kmeans', recommendedFeatures(data.info), 2, 0.5, 2)
  assert.equal(result.labels.length, 3)
  assert.ok(result.plot_features)
  assert.match(result.cluster_summaries['0'][0], /Common items:/)
})

test('rejects numeric features on datasets that exceed the browser limit', () => {
  const data = parseCsv(`x,y\n${Array.from({ length: 2501 }, (_, index) => `${index},${index}`).join('\n')}`)
  assert.throws(() => clusterData(data, 'dbscan', ['x', 'y'], 2, 0.5, 2), /up to 2,500 rows/)
})

test('enforces the local row limits for Agglomerative and K-Medoids', () => {
  const agglomerativeData = parseCsv(`x,y\n${Array.from({ length: 501 }, (_, index) => `${index},${index}`).join('\n')}`)
  assert.throws(() => clusterData(agglomerativeData, 'agglomerative', ['x', 'y'], 2, 0.5, 2), /up to 500 rows/)
  const medoidsData = parseCsv(`x,y\n${Array.from({ length: 301 }, (_, index) => `${index},${index}`).join('\n')}`)
  assert.throws(() => clusterData(medoidsData, 'kmedoids', ['x', 'y'], 2, 0.5, 2), /up to 300 rows/)
})
