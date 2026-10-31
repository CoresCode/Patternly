import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowDownToLine, ArrowUpRight, BarChart3, Check, CircleHelp, Database, FileSpreadsheet, FlaskConical, Info, Layers3, LoaderCircle, Maximize2, Moon, Play, Plus, RotateCcw, Sparkles, Sun, Trash2, UploadCloud, X, ZoomIn, ZoomOut } from 'lucide-react'
import { MAX_AGGLOMERATIVE_ROWS, MAX_DBSCAN_ROWS, MAX_FILE_BYTES, MAX_KMEANS_ROWS, MAX_KMEDOIDS_ROWS, parseCsv, readCsvFile, recommendedFeatures, type ClusterResult, type ClusteringAlgorithm, type ParsedDataset } from './data'
import { clusterInWorker } from './cluster-client'
import { deleteSavedDataset, deleteSavedExperiment, getSavedDataset, importSavedLibrary, listSavedDatasets, listSavedExperiments, makeSavedDataset, makeSavedExperiment, saveDataset, saveExperiment, type SavedDataset, type SavedExperiment } from './storage'
import { makeWorkspaceBackup, parseWorkspaceBackup, resultCsv } from './export'
import sampleCsv from './data/mini-flowers.csv?raw'
import './style.css'
import './release.css'

const colors = ['#f29d62', '#89a997', '#769bc0', '#d47e82', '#a891c3', '#d5bd67', '#68b9b1']

function algorithmName(algorithm: ClusteringAlgorithm): string {
  return { kmeans: 'K-Means', dbscan: 'DBSCAN', agglomerative: 'Agglomerative', kmedoids: 'K-Medoids' }[algorithm]
}

function algorithmLimit(algorithm: ClusteringAlgorithm): number {
  return { kmeans: MAX_KMEANS_ROWS, dbscan: MAX_DBSCAN_ROWS, agglomerative: MAX_AGGLOMERATIVE_ROWS, kmedoids: MAX_KMEDOIDS_ROWS }[algorithm]
}

function LibraryPage({ title, description, empty, actions, notice, children }: { title: string; description: string; empty: string; actions?: React.ReactNode; notice?: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children]
  return <div className="content library-page"><div className="page-heading"><div><div className="eyebrow"><Sparkles size={13}/> PATTERNLY LIBRARY</div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="library-actions">{actions}</div>}</div>{notice && <div className="storage-message" role="status">{notice}</div>}<div className="library-list">{items.length ? items : <div className="library-empty"><Database size={22}/><strong>Your library is ready</strong><span>{empty}</span></div>}</div><footer className="footer"><span>Patternly <i/> Saved on this device</span><span>Built for curious minds <Sparkles size={12}/></span></footer></div>
}

function ClusterLegend({ result }: { result: ClusterResult }) {
  return <div className="legend">{Object.entries(result.cluster_counts).map(([label, count]) => {
    const groupName = label === '-1' ? 'Noise' : `Cluster ${Number(label) + 1}`
    const details = result.cluster_summaries?.[label] ?? ['Rows grouped by similarity across the selected features.']
    const tooltip = `${groupName} · ${count.toLocaleString()} rows\n${details.join('\n')}`
    return <span className="legend-item" key={label} tabIndex={0} title={tooltip} aria-label={tooltip} data-tooltip={tooltip}><i style={{ background: label === '-1' ? '#a6aaa5' : colors[Number(label) % colors.length] }}/>{groupName} <small>{count.toLocaleString()}</small></span>
  })}</div>
}

function chartDomain(values: number[]): { low: number; high: number; below: number; above: number } {
  const sorted = [...values].sort((a, b) => a - b)
  const tail = sorted.length >= 100 ? 0.02 : 0
  const at = (percentile: number) => sorted[Math.floor((sorted.length - 1) * percentile)]
  let low = at(tail), high = at(1 - tail)
  const below = values.filter(value => value < low).length, above = values.filter(value => value > high).length
  if (low === high) { const padding = Math.max(Math.abs(low) * 0.05, 1); low -= padding; high += padding }
  return { low, high, below, above }
}

type ChartView = {
  xName: string
  yName: string
  axisChoices: string[]
  xDomain: ReturnType<typeof chartDomain>
  yDomain: ReturnType<typeof chartDomain>
  dots: { x: number; y: number; xValue: number; yValue: number; label: number; row: number; edge: boolean }[]
}

function ClusteringMethodPicker({ algorithm, onChange }: { algorithm: ClusteringAlgorithm; onChange: (algorithm: ClusteringAlgorithm) => void }) {
  const [openInfo, setOpenInfo] = useState<ClusteringAlgorithm | null>(null)
  const methods = [
    { id: 'kmeans' as const, glyph: 'K', title: 'K-Means', short: 'Choose how many groups', info: 'K-Means splits rows into the number of groups you choose. It assigns every row to a group and works best for compact groups.' },
    { id: 'dbscan' as const, glyph: 'D', title: 'DBSCAN', short: 'Find dense groups & outliers', info: 'DBSCAN finds dense groups using the radius and minimum-points settings. Rows that do not fit a dense group are marked as noise.' },
    { id: 'agglomerative' as const, glyph: 'A', title: 'Agglomerative', short: 'Build a hierarchy of groups', info: 'Ward Agglomerative starts with individual rows and joins groups to keep within-group spread small. Choose how many groups to keep.' },
  ]
  return <div className="method-picker"><div className="method-tabs">{methods.map(method => <div className="method-option" key={method.id}><button className={algorithm === method.id ? 'selected' : ''} onClick={() => onChange(method.id)}><span className={`method-glyph ${method.id}`}>{method.glyph}</span><span><strong>{method.title}</strong><small>{method.short}</small></span>{algorithm === method.id && <Check size={16}/>}</button><button type="button" className="info-tip" aria-label={`About ${method.title}`} title={method.info} aria-expanded={openInfo === method.id} data-open={openInfo === method.id} data-tooltip={method.info} onClick={() => setOpenInfo(current => current === method.id ? null : method.id)}><Info size={14}/></button></div>)}</div><label className="more-methods"><span>MORE METHODS</span><select aria-label="More clustering methods" title="K-Medoids chooses actual rows as group representatives and supports up to 300 rows." value={algorithm === 'kmedoids' ? 'kmedoids' : ''} onChange={event => { if (event.target.value) onChange(event.target.value as ClusteringAlgorithm) }}><option value="">Choose another method…</option><option value="kmedoids">K-Medoids · representative rows</option></select></label>{algorithm === 'kmedoids' && <small className="method-limit-hint">K-Medoids uses actual rows as group centers · up to 300 rows</small>}</div>
}

function ClusterPlot({ result, chart, expanded, zoom, setZoom, onAxesChange, chartType }: { result: ClusterResult; chart: ChartView | null; expanded: boolean; zoom: number; setZoom: React.Dispatch<React.SetStateAction<number>>; onAxesChange: (axis: 'x' | 'y', name: string) => void; chartType: 'map' | 'sizes' }) {
  if (chartType === 'sizes') {
    const entries = Object.entries(result.cluster_counts).sort((a, b) => Number(a[0]) - Number(b[0]))
    const largest = Math.max(1, ...entries.map(([, count]) => count))
    return <><div className="chart-guide"><span className="guide-dot">i</span><span><strong>Each bar is one group</strong> · Longer bars contain more rows. {result.noise_count ? 'Noise rows did not meet DBSCAN’s density settings.' : 'Cluster sizes show how evenly the rows were divided.'}</span></div><div className={`cluster-size-chart ${expanded ? 'expanded' : ''}`}>{entries.map(([label, count]) => { const title = label === '-1' ? 'Noise' : `Cluster ${Number(label) + 1}`; const details = result.cluster_summaries?.[label] ?? []; const tooltip = `${title}: ${count.toLocaleString()} rows${details.length ? `\n${details.join('\n')}` : ''}`; return <div className="cluster-size-row" key={label} title={tooltip}><div className="size-label"><i style={{ background: label === '-1' ? '#a6aaa5' : colors[Number(label) % colors.length] }}/><strong>{title}</strong><span>{count.toLocaleString()} rows · {Math.round(count / result.labels.length * 100)}%</span></div><div className="size-track"><span style={{ width: `${count / largest * 100}%`, background: label === '-1' ? '#a6aaa5' : colors[Number(label) % colors.length] }}/></div></div>})}</div></>
  }
  if (!chart) return <div className="one-feature"><BarChart3 size={18}/> This dataset has fewer than two map dimensions. Switch the chart view to “Cluster sizes”.</div>
  const projected = chart.xName.startsWith('Pattern summary')
  const adjustZoom = (factor: number) => setZoom(current => Math.max(1, Math.min(8, Number((current * factor).toFixed(2)))))
  const clippedX = chart.xDomain.below + chart.xDomain.above
  const clippedY = chart.yDomain.below + chart.yDomain.above
  const axisExplain = projected
    ? 'These axes combine your selected columns into two pattern summaries. They have no original units; dots closer together have more similar patterns.'
    : `The axes show actual values: ${chart.xName} (${chart.xDomain.low.toPrecision(3)} to ${chart.xDomain.high.toPrecision(3)}) and ${chart.yName} (${chart.yDomain.low.toPrecision(3)} to ${chart.yDomain.high.toPrecision(3)}). Clustering considers every selected feature.`
  const clippedExplain = clippedX || clippedY
    ? ` To keep extreme values from flattening the main pattern, the chart focuses on the middle 96% per axis; ${clippedX} rows are pinned to the x-axis edges and ${clippedY} to the y-axis edges. Hover edge dots for exact values.`
    : ''
  return <>
    <div className="chart-guide"><span className="guide-dot">i</span><span><strong>Each dot is one row</strong> · Colors show the groups found by {algorithmName(result.algorithm)}. {axisExplain}{clippedExplain}</span></div>
    {chart.axisChoices.length > 2 && <div className="axis-selectors"><span className="axis-select-title">SHOW ON MAP</span><label>X <select aria-label="Horizontal chart axis" value={chart.xName} onChange={event => onAxesChange('x', event.target.value)}>{chart.axisChoices.map(name => <option key={name} value={name} disabled={name === chart.yName}>{name}</option>)}</select></label><label>Y <select aria-label="Vertical chart axis" value={chart.yName} onChange={event => onAxesChange('y', event.target.value)}>{chart.axisChoices.map(name => <option key={name} value={name} disabled={name === chart.xName}>{name}</option>)}</select></label></div>}
    <div className={`chart-area ${expanded ? 'expanded' : ''}`}>
      <svg viewBox="0 0 560 300" role="img" aria-label="Interactive scatter plot of clustered rows" onWheel={event => { event.preventDefault(); adjustZoom(event.deltaY < 0 ? 1.2 : 1 / 1.2) }}>
        <g transform={`translate(${280 * (1 - zoom)} ${150 * (1 - zoom)}) scale(${zoom})`}>
          <line x1="24" y1="260" x2="536" y2="260" className="axis"/><line x1="24" y1="28" x2="24" y2="260" className="axis"/>
          {[0, 1, 2, 3].map(i => <line key={i} x1="24" x2="536" y1={202 - i * 58} y2={202 - i * 58} className="gridline"/>)}
          {chart.dots.map(dot => <circle key={dot.row} cx={dot.x} cy={dot.y} r={dot.edge ? (expanded ? 4.8 : 3.5) : (expanded ? 4 : 2.7)} fill={dot.label === -1 ? '#a6aaa5' : colors[dot.label % colors.length]} stroke={dot.edge ? '#344239' : 'none'} strokeWidth=".8" opacity=".68"><title>{`Row ${dot.row} · ${dot.label === -1 ? 'Noise / not assigned to a dense group' : `Cluster ${dot.label + 1}`} · ${chart.xName}: ${dot.xValue.toPrecision(5)} · ${chart.yName}: ${dot.yValue.toPrecision(5)}`}</title></circle>)}
        </g>
      </svg>
      <div className="axis-label x">{chart.xName}</div><div className="axis-label y">{chart.yName}</div>
    </div>
    <div className="chart-zoom-bar" aria-label="Chart zoom controls"><span className="zoom-caption">ZOOM</span><button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 1} onClick={() => adjustZoom(1 / 1.25)}><ZoomOut size={15}/></button><input type="range" min="1" max="8" step="0.25" value={zoom} aria-label="Chart zoom level" onChange={event => setZoom(Number(event.target.value))}/><span className="zoom-percent">{Math.round(zoom * 100)}%</span><button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 8} onClick={() => adjustZoom(1.25)}><ZoomIn size={15}/></button><button className="zoom-reset" type="button" aria-label="Reset zoom" title="Reset zoom" disabled={zoom === 1} onClick={() => setZoom(1)}><RotateCcw size={13}/><span>Reset</span></button><span className="wheel-hint">Scroll over chart to zoom</span></div>
  </>
}

function App() {
  const [dataset, setDataset] = useState<ParsedDataset | null>(null)
  const [result, setResult] = useState<ClusterResult | null>(null)
  const [runs, setRuns] = useState<ClusterResult[]>([])
  const [algorithm, setAlgorithm] = useState<ClusteringAlgorithm>('kmeans')
  const [features, setFeatures] = useState<string[]>([])
  const [clusterCount, setClusterCount] = useState(3)
  const [eps, setEps] = useState(0.5)
  const [minSamples, setMinSamples] = useState(5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [chartExpanded, setChartExpanded] = useState(false)
  const [chartZoom, setChartZoom] = useState(1)
  const [chartType, setChartType] = useState<'map' | 'sizes'>('map')
  const [axisOverride, setAxisOverride] = useState<[string, string] | null>(null)
  const [page, setPage] = useState<'studio' | 'datasets' | 'experiments'>('studio')
  const [datasetId, setDatasetId] = useState('')
  const [savedDatasets, setSavedDatasets] = useState<SavedDataset[]>([])
  const [savedExperiments, setSavedExperiments] = useState<SavedExperiment[]>([])
  const [storageMessage, setStorageMessage] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('patternly-theme') === 'dark' } catch { return false }
  })
  const backupInput = useRef<HTMLInputElement>(null)

  async function refreshLibrary() {
    try {
      const [datasets, experiments] = await Promise.all([listSavedDatasets(), listSavedExperiments()])
      setSavedDatasets(datasets); setSavedExperiments(experiments)
    } catch { setStorageMessage('This browser could not open the saved library. Your current dataset still works for this session.') }
  }

  useEffect(() => { void refreshLibrary() }, [])

  useEffect(() => {
    try { localStorage.setItem('patternly-theme', darkMode ? 'dark' : 'light') } catch { /* Theme still applies for this session. */ }
  }, [darkMode])

  useEffect(() => {
    if (!helpOpen && !chartExpanded) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setHelpOpen(false); setChartExpanded(false) }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [helpOpen, chartExpanded])

  async function openDataset(id: string) {
    try {
      const saved = await getSavedDataset(id)
      if (!saved) throw new Error('This saved dataset is no longer available in this browser.')
      const parsed = parseCsv(saved.csvText, saved.name)
      setDataset(parsed); setDatasetId(saved.id); setFeatures(recommendedFeatures(parsed.info)); setResult(null); setAxisOverride(null); setChartZoom(1); setChartType('map'); setError(''); setPage('studio')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not open dataset.'); setPage('studio') }
  }

  async function openExperiment(experiment: SavedExperiment) {
    await openDataset(experiment.datasetId)
    setAlgorithm(experiment.algorithm); setFeatures(experiment.features); setClusterCount(experiment.clusterCountRequested); setEps(experiment.eps); setMinSamples(experiment.minSamples); setResult(experiment.result)
  }

  async function selectFile(next: File | undefined) {
    if (!next) return
    setError(''); setBusy(true); setResult(null); setAxisOverride(null); setChartZoom(1); setRuns([]); setChartExpanded(false)
    try {
      const parsed = await readCsvFile(next)
      setDataset(parsed); setDatasetId('')
      setChartType('map')
      setFeatures(recommendedFeatures(parsed.info))
      try {
        const saved = makeSavedDataset(parsed.info, parsed.sourceText)
        await saveDataset(saved); setDatasetId(saved.id); await refreshLibrary(); setStorageMessage('')
      } catch { setStorageMessage('Dataset is ready for this session, but this browser could not save it to your library.') }
    } catch (err) { setDataset(null); setError(err instanceof Error ? err.message : 'Upload failed.') }
    finally { setBusy(false) }
  }

  async function run() {
    if (!dataset || features.length === 0) return
    setError(''); setBusy(true)
    try {
      const next = await clusterInWorker({ dataset: { info: dataset.info, records: dataset.records }, algorithm, features, clusterCount, eps, minSamples })
      setResult(next); setChartZoom(1); setRuns(previous => [next, ...previous].slice(0, 3))
      if (datasetId) {
        try {
          const saved = makeSavedExperiment({ datasetId, datasetName: dataset.info.filename, algorithm, features: [...features], clusterCountRequested: clusterCount, eps, minSamples, result: next })
          await saveExperiment(saved); await refreshLibrary(); setStorageMessage('')
        } catch { setStorageMessage('The clustering result is ready, but this browser could not save its report.') }
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Clustering failed.') }
    finally { setBusy(false) }
  }

  async function loadSample() {
    await selectFile(new File([sampleCsv], 'mini-flowers.csv', { type: 'text/csv' }))
  }

  function downloadFile(filename: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const link = document.createElement('a')
    link.href = url; link.download = filename; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function exportCurrentReport() {
    if (!dataset || !result) return
    try {
      const report = resultCsv(dataset.records, dataset.info.column_info.map(column => column.name), result)
      const stem = dataset.info.filename.replace(/\.csv$/i, '').replace(/[^a-z0-9_-]+/gi, '-') || 'patternly-data'
      downloadFile(`${stem}-${result.algorithm}-groups.csv`, report, 'text/csv;charset=utf-8')
    } catch (err) { setStorageMessage(err instanceof Error ? err.message : 'Could not export this report.') }
  }

  function exportWorkspace() {
    try {
      downloadFile('patternly-workspace-backup.json', JSON.stringify(makeWorkspaceBackup(savedDatasets, savedExperiments)), 'application/json;charset=utf-8')
      setStorageMessage('Backup downloaded. Keep the JSON file somewhere safe; you can restore it in Patternly on another device.')
    } catch (err) { setStorageMessage(err instanceof Error ? err.message : 'Could not create the backup.') }
  }

  async function restoreWorkspace(file: File | undefined) {
    if (!file) return
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('Patternly backups must be 100 MB or smaller.')
      const backup = parseWorkspaceBackup(await file.text())
      for (const item of backup.datasets) {
        const parsed = parseCsv(item.csvText, item.name)
        if (parsed.info.rows !== item.rows || parsed.info.columns !== item.columns) throw new Error(`The saved dataset “${item.name}” does not match its backup details.`)
      }
      if (!window.confirm(`Restore ${backup.datasets.length} datasets and ${backup.experiments.length} reports into this browser? Existing library items will stay in place.`)) return
      await importSavedLibrary(backup.datasets, backup.experiments)
      await refreshLibrary()
      setStorageMessage(`Restored ${backup.datasets.length} datasets and ${backup.experiments.length} reports. They are now saved on this device.`)
    } catch (err) { setStorageMessage(err instanceof Error ? err.message : 'Could not restore this backup.') }
    finally { if (backupInput.current) backupInput.current.value = '' }
  }

  async function removeDataset(item: SavedDataset) {
    if (!window.confirm(`Delete “${item.name}” and its ${savedExperiments.filter(run => run.datasetId === item.id).length} saved reports from this browser?`)) return
    try {
      await deleteSavedDataset(item.id)
      if (datasetId === item.id) { setDataset(null); setDatasetId(''); setResult(null) }
      await refreshLibrary()
      setStorageMessage(`Deleted “${item.name}” and its saved reports from this browser.`)
    } catch (err) { setStorageMessage(err instanceof Error ? err.message : 'Could not delete this dataset.') }
  }

  async function removeExperiment(item: SavedExperiment) {
    if (!window.confirm(`Delete the ${algorithmName(item.algorithm)} report for “${item.datasetName}”?`)) return
    try {
      await deleteSavedExperiment(item.id)
      await refreshLibrary()
      setStorageMessage('Experiment report deleted from this browser.')
    } catch (err) { setStorageMessage(err instanceof Error ? err.message : 'Could not delete this report.') }
  }

  const clusterableColumns = dataset?.info.column_info.filter(column => column.kind !== 'text') ?? []
  const previewColumns = dataset?.info.column_info.slice(0, 5) ?? []
  const chart = useMemo(() => {
    if (!result || !result.plot_features) return null
    const axisChoices = Object.keys(result.points[0] ?? {})
    const defaultAxes = result.plot_features
    const xName = axisOverride && axisChoices.includes(axisOverride[0]) && axisOverride[0] !== axisOverride[1] ? axisOverride[0] : defaultAxes[0]
    const yName = axisOverride && axisChoices.includes(axisOverride[1]) && axisOverride[0] !== axisOverride[1] ? axisOverride[1] : defaultAxes[1]
    const xs = result.points.map(point => Number(point[xName]))
    const ys = result.points.map(point => Number(point[yName]))
    const xDomain = chartDomain(xs), yDomain = chartDomain(ys)
    const sx = (value: number) => 24 + ((Math.max(xDomain.low, Math.min(xDomain.high, value)) - xDomain.low) / (xDomain.high - xDomain.low || 1)) * 512
    const sy = (value: number) => 260 - ((Math.max(yDomain.low, Math.min(yDomain.high, value)) - yDomain.low) / (yDomain.high - yDomain.low || 1)) * 232
    return { xName, yName, axisChoices, xDomain, yDomain, dots: result.points.map((point, index) => ({ x: sx(xs[index]), y: sy(ys[index]), xValue: xs[index], yValue: ys[index], label: result.labels[index], row: index + 1, edge: xs[index] < xDomain.low || xs[index] > xDomain.high || ys[index] < yDomain.low || ys[index] > yDomain.high })) }
  }, [result, axisOverride])

  const changeAxis = (axis: 'x' | 'y', name: string) => {
    const currentX = chart?.xName ?? result?.plot_features?.[0] ?? name
    const currentY = chart?.yName ?? result?.plot_features?.[1] ?? name
    setAxisOverride(axis === 'x' ? [name, currentY] : [currentX, name]); setChartZoom(1)
  }
  const plot = (expanded = false) => <ClusterPlot result={result!} chart={chart} expanded={expanded} zoom={chartZoom} setZoom={setChartZoom} onAxesChange={changeAxis} chartType={chartType}/>

  function toggleFeature(name: string) { setFeatures(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]) }

  return <div className="app-shell" data-theme={darkMode ? 'dark' : 'light'}>
    <aside className="sidebar">
      <a className="brand" href="#"><span className="brand-mark"><Activity size={20} strokeWidth={2.3}/></span><span>patternly</span></a>
      <div className="workspace-label">WORKSPACE</div>
      <button className={`nav-item ${page === 'studio' ? 'active' : ''}`} onClick={() => setPage('studio')}><Layers3 size={17}/> Studio {page === 'studio' && <span className="nav-dot"/>}</button>
      <button className={`nav-item ${page === 'datasets' ? 'active' : ''}`} onClick={() => setPage('datasets')}><Database size={17}/> Datasets</button>
      <button className={`nav-item ${page === 'experiments' ? 'active' : ''}`} onClick={() => setPage('experiments')}><FlaskConical size={17}/> Experiments</button>
      <div className="side-divider"/><div className="side-caption">RECENT EXPERIMENTS</div>
      {savedExperiments.length ? savedExperiments.slice(0, 5).map((item, index) => <button className="recent" key={item.id} onClick={() => void openExperiment(item)}><span className="recent-dot" style={{background: colors[index % colors.length]}}/>{algorithmName(item.algorithm)} <span>{item.result.cluster_count} groups</span></button>) : <div className="empty-recent">Your saved experiments<br/>will appear here.</div>}
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setHelpOpen(true)}><CircleHelp size={17}/> Help & guides</button></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="crumb">Patternly <span>/</span> <strong>{page === 'studio' ? (dataset?.info.filename ?? 'Untitled exploration') : page === 'datasets' ? 'Datasets' : 'Experiments'}</strong></div><div className="top-actions"><span className="autosave"><span/> Saved on this device</span><button className="icon-button theme-toggle" aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={darkMode} onClick={() => setDarkMode(current => !current)}>{darkMode ? <Sun size={17}/> : <Moon size={17}/>}</button><button className="icon-button" aria-label="Help and guides" title="Help and guides" onClick={() => setHelpOpen(true)}><CircleHelp size={17}/></button></div></header>
      {page === 'datasets' ? <LibraryPage title="Your datasets" description="Your CSVs and reports are saved in this browser. Use a backup to move them to another device." empty="Upload a CSV in Studio to start your library." notice={storageMessage} actions={<><button className="quiet-button" onClick={exportWorkspace}><ArrowDownToLine size={15}/> Backup library</button><button className="quiet-button" onClick={() => backupInput.current?.click()}><ArrowUpRight size={15}/> Restore backup</button><input ref={backupInput} type="file" accept="application/json,.json" className="visually-hidden" onChange={event => void restoreWorkspace(event.currentTarget.files?.[0])}/></>}>{savedDatasets.map(item => { const reports = savedExperiments.filter(run => run.datasetId === item.id); const latest = reports[0]; return <article className="library-card" key={item.id}><div className="library-icon"><FileSpreadsheet size={18}/></div><div className="library-main"><strong>{item.name}</strong><span>{item.rows.toLocaleString()} rows · {item.columns} columns · {item.clusterableColumns} usable features</span><small>Added {new Date(item.uploadedAt).toLocaleString()} · {reports.length} saved {reports.length === 1 ? 'report' : 'reports'}{latest ? ` · Latest: ${algorithmName(latest.algorithm)}, ${latest.result.cluster_count} groups` : ''}</small></div><button className="quiet-button" onClick={() => void openDataset(item.id)}>Open in Studio <ArrowUpRight size={14}/></button><button className="remove-library-item" aria-label={`Delete ${item.name} and its reports`} title="Delete dataset and reports" onClick={() => void removeDataset(item)}><Trash2 size={15}/></button></article>})}</LibraryPage> : page === 'experiments' ? <LibraryPage title="Saved experiments" description="Reports stay in this browser until you delete them or clear the browser’s site data." empty="Run clustering in Studio to create your first report." notice={storageMessage}>{savedExperiments.map(item => <article className="library-card" key={item.id}><div className="library-icon experiment"><FlaskConical size={18}/></div><div className="library-main"><strong>{item.datasetName} <span className="report-method">{algorithmName(item.algorithm)}</span></strong><span>{new Date(item.createdAt).toLocaleString()} · {item.features.join(', ')}</span><small>{item.result.labels.length.toLocaleString()} rows · {item.result.cluster_count} groups · {item.result.noise_count} noise points</small></div><button className="quiet-button" onClick={() => void openExperiment(item)}>View report <ArrowUpRight size={14}/></button><button className="remove-library-item" aria-label={`Delete ${item.datasetName} report`} title="Delete report" onClick={() => void removeExperiment(item)}><Trash2 size={15}/></button></article>)}</LibraryPage> : <div className="content">
        <div className="page-heading"><div><div className="eyebrow"><Sparkles size={13}/> DATA EXPLORATION</div><h1>Find the shape in your data.</h1><p>Bring a dataset, try a clustering method, and see what patterns emerge.</p></div><button className="quiet-button" onClick={() => { setDataset(null); setResult(null); setAxisOverride(null); setChartZoom(1); setRuns([]); setError(''); setChartExpanded(false) }}><Plus size={16}/> New exploration</button></div>
        <div className="layout-grid">
          <section className="left-column">
            <div className="section-title"><span className="step">01</span><div><h2>Your dataset</h2><p>Start with a CSV file to explore.</p></div></div>
            {!dataset ? <label className={`upload-zone ${dragging ? 'dragging' : ''}`} onDragOver={event => {event.preventDefault(); setDragging(true)}} onDragLeave={() => setDragging(false)} onDrop={event => {event.preventDefault(); setDragging(false); void selectFile(event.dataTransfer.files[0])}}>
              <input type="file" accept=".csv,text/csv" onChange={event => { void selectFile(event.target.files?.[0]); event.currentTarget.value = '' }}/><div className="upload-icon"><UploadCloud size={21}/></div><strong>{busy ? 'Reading your dataset...' : 'Drop your CSV here, or browse'}</strong><span>CSV only · up to {MAX_FILE_BYTES / 1024 / 1024} MB · processed in your browser</span><span className="browse-link">Choose a file <ArrowDownToLine size={13}/></span>
            </label> : <div className="dataset-card"><div className="file-icon"><FileSpreadsheet size={18}/></div><div className="dataset-name"><strong>{dataset.info.filename}</strong><span>{dataset.info.rows.toLocaleString()} rows <i/> {dataset.info.columns} columns</span></div><button className="remove-file" onClick={() => {setDataset(null); setResult(null)}} aria-label="Remove dataset"><X size={16}/></button><div className="dataset-stats"><div><span>ROWS</span><strong>{dataset.info.rows.toLocaleString()}</strong></div><div><span>FEATURES</span><strong>{dataset.info.columns}</strong></div><div><span>USABLE</span><strong>{clusterableColumns.length}</strong></div></div></div>}
            {dataset && <div className="preview-card"><div className="card-heading"><div><h3>Quick preview</h3><span>First 12 rows · {dataset.info.column_info.length} columns detected</span></div><span className="text-button">Processed locally <Check size={13}/></span></div><div className="table-wrap"><table><thead><tr>{previewColumns.map(col => <th key={col.name}>{col.name}<small>{col.type}</small></th>)}</tr></thead><tbody>{dataset.info.preview.map((row, index) => <tr key={index}>{previewColumns.map(col => <td key={col.name}>{row[col.name] === '' ? <em>empty</em> : String(row[col.name])}</td>)}</tr>)}</tbody></table></div></div>}
            {dataset && result && <div className="result-card"><div className="card-heading"><div><h3>{chartType === 'map' ? 'Cluster map' : 'Cluster sizes'}</h3><span>{chartType === 'map' && chart ? `${chart.xName} × ${chart.yName} · ` : ''}{result.labels.length.toLocaleString()} rows · {algorithmName(result.algorithm)}</span></div><div className="visual-actions"><label className="chart-type-select"><span>VIEW</span><select aria-label="Chart visualization" value={chartType} onChange={event => setChartType(event.target.value as 'map' | 'sizes')}><option value="map">Cluster map</option><option value="sizes">Cluster sizes</option></select></label><button className="icon-button expand-button" aria-label="Expand visualization" title="Expand visualization" onClick={() => setChartExpanded(true)}><Maximize2 size={15}/></button><button className="export-button" onClick={exportCurrentReport}><ArrowDownToLine size={14}/> Export CSV</button></div></div>
              {plot()}
              <ClusterLegend result={result}/>
            </div>}
            {!dataset && <div className="sample-note"><Sparkles size={15}/><span>New to clustering? <button className="sample-link" onClick={() => void loadSample()}>Try our mini flower dataset</button> to explore.</span><button aria-label="Dismiss" onClick={event => event.currentTarget.parentElement?.remove()}><X size={14}/></button></div>}
          </section>

          <section className="right-column"><div className="section-title"><span className="step">02</span><div><h2>Experiment</h2><p>Choose how to group your data.</p></div></div>
            <div className="experiment-card"><label className="field-label">CLUSTERING METHOD</label><ClusteringMethodPicker algorithm={algorithm} onChange={setAlgorithm}/>
              {algorithm !== 'dbscan' && <div className="control-block"><div className="control-row"><label htmlFor="count">Number of clusters</label><span className="value-pill">{clusterCount}</span></div><input id="count" className="range" type="range" min="2" max="10" value={clusterCount} onChange={event => setClusterCount(Number(event.target.value))}/><div className="range-hints"><span>2 groups</span><span>10 groups</span></div></div>}
              {algorithm === 'dbscan' && <div className="db-controls"><div className="control-row"><label htmlFor="eps">Neighborhood radius (eps)</label><span className="value-pill">{eps.toFixed(1)}</span></div><input id="eps" className="range" type="range" min="0.1" max="2" step="0.1" value={eps} onChange={event => setEps(Number(event.target.value))}/><div className="range-hints"><span>0.1</span><span>2.0</span></div><div className="control-row min-samples"><label htmlFor="min-samples">Minimum points</label><span className="value-pill">{minSamples}</span></div><input id="min-samples" className="range" type="range" min="2" max="15" value={minSamples} onChange={event => setMinSamples(Number(event.target.value))}/></div>}
              <div className="control-block feature-block"><div className="control-row"><label>Features to include</label><span className="feature-count">{features.length} selected</span></div>{clusterableColumns.length ? clusterableColumns.map(column=><label className="check-row" key={column.name}><input type="checkbox" checked={features.includes(column.name)} onChange={()=>toggleFeature(column.name)}/><span>{column.name}</span><small>{column.basket ? 'item' : column.type}</small></label>) : <div className="feature-empty">Upload a CSV to choose numeric or categorical features.</div>}</div>
              <button className="run-button" onClick={() => void run()} disabled={!dataset || features.length === 0 || busy}>{busy ? <LoaderCircle size={16} className="spin"/> : <Play size={15} fill="currentColor"/>}{busy ? 'Working...' : 'Run clustering'}<ArrowUpRight size={15}/></button><p className="run-footnote">{algorithmName(algorithm)} · Runs locally · up to {algorithmLimit(algorithm).toLocaleString()} rows</p>
            </div>
            {error && <div className="error-banner">{error}</div>}
            <div className="insight-card"><div className="insight-icon"><Sparkles size={16}/></div><div><strong>A good place to start</strong><p>Patternly scales numeric features, caps extreme values so a few outliers do not dominate the groups, and encodes categories locally. Detected item columns are treated as shopping baskets.</p></div></div>
            {runs.length > 1 && <div className="compare-card"><div className="compare-heading"><div><h3>Recent runs</h3><span>Select a run to view its chart</span></div><button className="text-button" onClick={() => setRuns([])}>Clear</button></div>{runs.map((item,index)=><button className={`compare-row ${result === item ? 'selected' : ''}`} key={index} onClick={() => { setResult(item); setAlgorithm(item.algorithm); setFeatures(item.features); setChartZoom(1); setAxisOverride(null) }} title="Show this run's chart"><span className="compare-color" style={{background:colors[index]}}/><strong>{algorithmName(item.algorithm)}</strong><span>{item.cluster_count} clusters</span><b>{item.labels.length.toLocaleString()} rows</b></button>)}</div>}
            <div className="coming-soon"><div><span className="coming-icon">P</span><span><strong>More ways to explore</strong><small>PCA & outlier detection are on the way</small></span></div><span className="soon-pill">COMING SOON</span></div>
          </section>
        </div>
        {storageMessage && <div className="storage-message">{storageMessage}</div>}
        <footer className="footer"><span>Patternly <i/> A little more clarity in every dataset.</span><span>Built for curious minds <Sparkles size={12}/></span></footer>
      </div>}
    </main>
    {chartExpanded && result && <div className="modal-backdrop" onMouseDown={() => setChartExpanded(false)}><section className="chart-modal" role="dialog" aria-modal="true" aria-labelledby="expanded-chart-title" onMouseDown={event => event.stopPropagation()}><div className="modal-heading"><div><h2 id="expanded-chart-title">{chartType === 'map' ? 'Cluster map' : 'Cluster sizes'}</h2><span>{chartType === 'map' && chart ? `${chart.xName} vs ${chart.yName} · ` : ''}{result.labels.length.toLocaleString()} rows · {algorithmName(result.algorithm)}</span></div><button className="icon-button" aria-label="Close expanded visualization" onClick={() => setChartExpanded(false)}><X size={18}/></button></div>{plot(true)}<ClusterLegend result={result}/></section></div>}
    {helpOpen && <div className="modal-backdrop" onMouseDown={() => setHelpOpen(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={event => event.stopPropagation()}><div className="modal-heading"><div><h2 id="help-title">A quick guide to Patternly</h2><span>Your data stays in this browser.</span></div><button className="icon-button" aria-label="Close help" onClick={() => setHelpOpen(false)}><X size={18}/></button></div><div className="help-content"><section><span className="help-step">01</span><div><strong>Choose a CSV</strong><p>Drop a CSV into Studio or use “Try our mini flower dataset.” Patternly reads it on your device and saves it to your local Datasets library.</p></div></section><section><span className="help-step">02</span><div><strong>Choose columns and a method</strong><p>Select numeric or categorical features. K-Means and Agglomerative ask for a group count. DBSCAN uses neighborhood radius and minimum points to find dense groups and noise.</p></div></section><section><span className="help-step">03</span><div><strong>Read and save the result</strong><p>Each dot represents a row; colors mark the groups. Hover over dots or legend labels for details. Switch between the cluster map and group sizes, adjust axes, or zoom in. Completed runs appear in Experiments when the dataset is saved.</p></div></section><section><span className="help-step"><Database size={15}/></span><div><strong>Keep or move your work</strong><p>Datasets and reports stay on this device. Use Datasets → Backup library to download them, then Restore backup on another device. Clearing browser data removes the local library.</p></div></section></div><div className="help-footer"><button className="quiet-button" onClick={() => { setHelpOpen(false); setPage('datasets') }}>Open Datasets</button><button className="run-button help-done" onClick={() => setHelpOpen(false)}>Got it</button></div></section></div>}
  </div>
}

export default App
