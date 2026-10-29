import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { clusterData, parseCsv, readCsvFile } from '../src/data.ts'

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

test('runs DBSCAN and identifies noise points', () => {
  const data = parseCsv('x,y\n0,0\n0.1,0.1\n10,10\n10.1,9.9\n50,50\n')
  const result = clusterData(data, 'dbscan', ['x', 'y'], 2, 0.2, 2)
  assert.equal(result.cluster_count, 2)
  assert.equal(result.noise_count, 1)
  assert.equal(result.cluster_counts['-1'], 1)
})

test('rejects numeric features on datasets that exceed the browser limit', () => {
  const data = parseCsv(`x,y\n${Array.from({ length: 2501 }, (_, index) => `${index},${index}`).join('\n')}`)
  assert.throws(() => clusterData(data, 'dbscan', ['x', 'y'], 2, 0.5, 2), /up to 2,500 rows/)
})
