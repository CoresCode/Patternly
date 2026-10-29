import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDownToLine, ArrowUpRight, BarChart3, Check, ChevronDown, CircleHelp, Database, FileSpreadsheet, FlaskConical, Info, Layers3, LoaderCircle, Maximize2, Play, Plus, RotateCcw, Sparkles, UploadCloud, X, ZoomIn, ZoomOut } from 'lucide-react'
import { clusterData, MAX_DBSCAN_ROWS, MAX_FILE_BYTES, MAX_KMEANS_ROWS, parseCsv, readCsvFile, recommendedFeatures, type ClusterResult, type ParsedDataset } from './data'
import { getSavedDataset, listSavedDatasets, listSavedExperiments, makeSavedDataset, makeSavedExperiment, saveDataset, saveExperiment, type SavedDataset, type SavedExperiment } from './storage'
import sampleCsv from './data/mini-flowers.csv?raw'
import './style.css'

const colors = ['#f29d62', '#89a997', '#769bc0', '#d47e82', '#a891c3', '#d5bd67', '#68b9b1']

function LibraryPage({ title, description, empty, children }: { title: string; description: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children]
  return <div className="content library-page"><div className="page-heading"><div><div className="eyebrow"><Sparkles size={13}/> PATTERNLY LIBRARY</div><h1>{title}</h1><p>{description}</p></div></div><div className="library-list">{items.length ? items : <div className="library-empty"><Database size={22}/><strong>Your library is ready</strong><span>{empty}</span></div>}</div><footer className="footer"><span>Patternly <i/> Saved on this device</span><span>Built for curious minds <Sparkles size={12}/></span></footer></div>
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

function ClusterPlot({ result, chart, expanded, zoom, setZoom, onAxesChange }: { result: ClusterResult; chart: ChartView; expanded: boolean; zoom: number; setZoom: React.Dispatch<React.SetStateAction<number>>; onAxesChange: (axis: 'x' | 'y', name: string) => void }) {
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
    <div className="chart-guide"><span className="guide-dot">i</span><span><strong>Each dot is one row</strong> · Colors show the groups found by {result.algorithm === 'kmeans' ? 'K-Means' : 'DBSCAN'}. {axisExplain}{clippedExplain}</span></div>
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
  const [algorithm, setAlgorithm] = useState<'kmeans' | 'dbscan'>('kmeans')
  const [features, setFeatures] = useState<string[]>([])
  const [clusterCount, setClusterCount] = useState(3)
  const [eps, setEps] = useState(0.5)
  const [minSamples, setMinSamples] = useState(5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [methodInfo, setMethodInfo] = useState<'kmeans' | 'dbscan' | null>(null)
  const [dragging, setDragging] = useState(false)
  const [chartExpanded, setChartExpanded] = useState(false)
  const [chartZoom, setChartZoom] = useState(1)
  const [axisOverride, setAxisOverride] = useState<[string, string] | null>(null)
  const [page, setPage] = useState<'studio' | 'datasets' | 'experiments'>('studio')
  const [datasetId, setDatasetId] = useState('')
  const [savedDatasets, setSavedDatasets] = useState<SavedDataset[]>([])
  const [savedExperiments, setSavedExperiments] = useState<SavedExperiment[]>([])
  const [storageMessage, setStorageMessage] = useState('')

  async function refreshLibrary() {
    try {
      const [datasets, experiments] = await Promise.all([listSavedDatasets(), listSavedExperiments()])
      setSavedDatasets(datasets); setSavedExperiments(experiments)
    } catch { setStorageMessage('This browser could not open the saved library. Your current dataset still works for this session.') }
  }

  useEffect(() => { void refreshLibrary() }, [])

  async function openDataset(id: string) {
    try {
      const saved = await getSavedDataset(id)
      if (!saved) throw new Error('This saved dataset is no longer available in this browser.')
      const parsed = parseCsv(saved.csvText, saved.name)
      setDataset(parsed); setDatasetId(saved.id); setFeatures(recommendedFeatures(parsed.info)); setResult(null); setAxisOverride(null); setChartZoom(1); setError(''); setPage('studio')
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
      await new Promise(resolve => setTimeout(resolve, 0))
      const next = clusterData(dataset, algorithm, features, clusterCount, eps, minSamples)
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
  const plot = (expanded = false) => chart ? <ClusterPlot result={result!} chart={chart} expanded={expanded} zoom={chartZoom} setZoom={setChartZoom} onAxesChange={changeAxis}/> : <div className="one-feature"><BarChart3 size={18}/> A map needs at least two usable dimensions. Try selecting more categorical features.</div>

  function toggleFeature(name: string) { setFeatures(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]) }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#"><span className="brand-mark"><Activity size={20} strokeWidth={2.3}/></span><span>patternly</span></a>
      <div className="workspace-label">WORKSPACE <ChevronDown size={13}/></div>
      <button className={`nav-item ${page === 'studio' ? 'active' : ''}`} onClick={() => setPage('studio')}><Layers3 size={17}/> Studio {page === 'studio' && <span className="nav-dot"/>}</button>
      <button className={`nav-item ${page === 'datasets' ? 'active' : ''}`} onClick={() => setPage('datasets')}><Database size={17}/> Datasets</button>
      <button className={`nav-item ${page === 'experiments' ? 'active' : ''}`} onClick={() => setPage('experiments')}><FlaskConical size={17}/> Experiments</button>
      <div className="side-divider"/><div className="side-caption">RECENT EXPERIMENTS</div>
      {savedExperiments.length ? savedExperiments.slice(0, 5).map((item, index) => <button className="recent" key={item.id} onClick={() => void openExperiment(item)}><span className="recent-dot" style={{background: colors[index % colors.length]}}/>{item.algorithm === 'kmeans' ? 'K-Means' : 'DBSCAN'} <span>{item.result.cluster_count} groups</span></button>) : <div className="empty-recent">Your saved experiments<br/>will appear here.</div>}
      <div className="sidebar-bottom"><button className="nav-item"><CircleHelp size={17}/> Help & guides</button><div className="profile"><div className="avatar">P</div><div><strong>Personal workspace</strong><small>Free plan</small></div><ChevronDown size={15}/></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="crumb">Workspace <span>/</span> <strong>{page === 'studio' ? (dataset?.info.filename ?? 'Untitled exploration') : page === 'datasets' ? 'Datasets' : 'Experiments'}</strong></div><div className="top-actions"><span className="autosave"><span/> Saved on this device</span><button className="icon-button" aria-label="Help"><CircleHelp size={17}/></button><div className="avatar small">P</div></div></header>
      {page === 'datasets' ? <LibraryPage title="Your datasets" description="Every CSV you add is saved in this browser, with its past clustering reports." empty="Upload a CSV in Studio to start your library.">{savedDatasets.map(item => { const reports = savedExperiments.filter(run => run.datasetId === item.id); const latest = reports[0]; return <article className="library-card" key={item.id}><div className="library-icon"><FileSpreadsheet size={18}/></div><div className="library-main"><strong>{item.name}</strong><span>{item.rows.toLocaleString()} rows · {item.columns} columns · {item.clusterableColumns} usable features</span><small>Added {new Date(item.uploadedAt).toLocaleString()} · {reports.length} saved {reports.length === 1 ? 'report' : 'reports'}{latest ? ` · Latest: ${latest.algorithm === 'kmeans' ? 'K-Means' : 'DBSCAN'}, ${latest.result.cluster_count} groups` : ''}</small></div><button className="quiet-button" onClick={() => void openDataset(item.id)}>Open in Studio <ArrowUpRight size={14}/></button></article>})}</LibraryPage> : page === 'experiments' ? <LibraryPage title="Saved experiments" description="Each run keeps its settings, cluster assignments, map, and summary for review." empty="Run clustering in Studio to create your first report.">{savedExperiments.map(item => <article className="library-card" key={item.id}><div className="library-icon experiment"><FlaskConical size={18}/></div><div className="library-main"><strong>{item.datasetName} <span className="report-method">{item.algorithm === 'kmeans' ? 'K-Means' : 'DBSCAN'}</span></strong><span>{new Date(item.createdAt).toLocaleString()} · {item.features.join(', ')}</span><small>{item.result.labels.length.toLocaleString()} rows · {item.result.cluster_count} groups · {item.result.noise_count} noise points</small></div><button className="quiet-button" onClick={() => void openExperiment(item)}>View report <ArrowUpRight size={14}/></button></article>)}</LibraryPage> : <div className="content">
        <div className="page-heading"><div><div className="eyebrow"><Sparkles size={13}/> DATA EXPLORATION</div><h1>Find the shape in your data.</h1><p>Bring a dataset, try a clustering method, and see what patterns emerge.</p></div><button className="quiet-button" onClick={() => { setDataset(null); setResult(null); setAxisOverride(null); setChartZoom(1); setRuns([]); setError(''); setChartExpanded(false) }}><Plus size={16}/> New exploration</button></div>
        <div className="layout-grid">
          <section className="left-column">
            <div className="section-title"><span className="step">01</span><div><h2>Your dataset</h2><p>Start with a CSV file to explore.</p></div></div>
            {!dataset ? <label className={`upload-zone ${dragging ? 'dragging' : ''}`} onDragOver={event => {event.preventDefault(); setDragging(true)}} onDragLeave={() => setDragging(false)} onDrop={event => {event.preventDefault(); setDragging(false); void selectFile(event.dataTransfer.files[0])}}>
              <input type="file" accept=".csv,text/csv" onChange={event => { void selectFile(event.target.files?.[0]); event.currentTarget.value = '' }}/><div className="upload-icon"><UploadCloud size={21}/></div><strong>{busy ? 'Reading your dataset...' : 'Drop your CSV here, or browse'}</strong><span>CSV only · up to {MAX_FILE_BYTES / 1024 / 1024} MB · processed in your browser</span><span className="browse-link">Choose a file <ArrowDownToLine size={13}/></span>
            </label> : <div className="dataset-card"><div className="file-icon"><FileSpreadsheet size={18}/></div><div className="dataset-name"><strong>{dataset.info.filename}</strong><span>{dataset.info.rows.toLocaleString()} rows <i/> {dataset.info.columns} columns</span></div><button className="remove-file" onClick={() => {setDataset(null); setResult(null)}} aria-label="Remove dataset"><X size={16}/></button><div className="dataset-stats"><div><span>ROWS</span><strong>{dataset.info.rows.toLocaleString()}</strong></div><div><span>FEATURES</span><strong>{dataset.info.columns}</strong></div><div><span>USABLE</span><strong>{clusterableColumns.length}</strong></div></div></div>}
            {dataset && <div className="preview-card"><div className="card-heading"><div><h3>Quick preview</h3><span>First 12 rows · {dataset.info.column_info.length} columns detected</span></div><span className="text-button">Processed locally <Check size={13}/></span></div><div className="table-wrap"><table><thead><tr>{previewColumns.map(col => <th key={col.name}>{col.name}<small>{col.type}</small></th>)}</tr></thead><tbody>{dataset.info.preview.map((row, index) => <tr key={index}>{previewColumns.map(col => <td key={col.name}>{row[col.name] === '' ? <em>empty</em> : String(row[col.name])}</td>)}</tr>)}</tbody></table></div></div>}
            {dataset && result && <div className="result-card"><div className="card-heading"><div><h3>Cluster map</h3><span>{chart ? `${chart.xName} × ${chart.yName}` : result.features.join(', ')} · {result.labels.length.toLocaleString()} records</span></div><div className="visual-actions">{chart && <button className="icon-button expand-button" aria-label="Expand visualization" title="Expand visualization" onClick={() => setChartExpanded(true)}><Maximize2 size={15}/></button>}<button className="export-button"><ArrowDownToLine size={14}/> Export</button></div></div>
              {plot()}
              <ClusterLegend result={result}/>
            </div>}
            {!dataset && <div className="sample-note"><Sparkles size={15}/><span>New to clustering? <button className="sample-link" onClick={() => void loadSample()}>Try our mini flower dataset</button> to explore.</span><button aria-label="Dismiss" onClick={event => event.currentTarget.parentElement?.remove()}><X size={14}/></button></div>}
          </section>

          <section className="right-column"><div className="section-title"><span className="step">02</span><div><h2>Experiment</h2><p>Choose how to group your data.</p></div></div>
            <div className="experiment-card"><label className="field-label">CLUSTERING METHOD</label><div className="method-tabs"><div className="method-option"><button className={algorithm === 'kmeans' ? 'selected' : ''} onClick={() => setAlgorithm('kmeans')}><span className="method-glyph">K</span><span><strong>K-Means</strong><small>Find a set number of groups</small></span>{algorithm === 'kmeans' && <Check size={16}/>}</button><button type="button" className="info-tip" aria-label="About K-Means" title="K-Means groups rows into the number you choose; it assigns every row to a group." aria-expanded={methodInfo === 'kmeans'} data-open={methodInfo === 'kmeans'} data-tooltip="K-Means splits rows into the number of groups you choose. It works best when you expect compact groups and want every row assigned." onClick={() => setMethodInfo(current => current === 'kmeans' ? null : 'kmeans')}><Info size={14}/></button></div><div className="method-option"><button className={algorithm === 'dbscan' ? 'selected' : ''} onClick={() => setAlgorithm('dbscan')}><span className="method-glyph db">D</span><span><strong>DBSCAN</strong><small>Find dense regions & outliers</small></span>{algorithm === 'dbscan' && <Check size={16}/>}</button><button type="button" className="info-tip" aria-label="About DBSCAN" title="DBSCAN finds dense groups and marks rows that do not fit as noise." aria-expanded={methodInfo === 'dbscan'} data-open={methodInfo === 'dbscan'} data-tooltip="DBSCAN finds groups of nearby rows using the radius and minimum-points settings. Rows that do not fit a dense group are marked as noise." onClick={() => setMethodInfo(current => current === 'dbscan' ? null : 'dbscan')}><Info size={14}/></button></div></div>
              {algorithm === 'kmeans' && <div className="control-block"><div className="control-row"><label htmlFor="count">Number of clusters</label><span className="value-pill">{clusterCount}</span></div><input id="count" className="range" type="range" min="2" max="10" value={clusterCount} onChange={event => setClusterCount(Number(event.target.value))}/><div className="range-hints"><span>2 groups</span><span>10 groups</span></div></div>}
              {algorithm === 'dbscan' && <div className="db-controls"><div className="control-row"><label htmlFor="eps">Neighborhood radius (eps)</label><span className="value-pill">{eps.toFixed(1)}</span></div><input id="eps" className="range" type="range" min="0.1" max="2" step="0.1" value={eps} onChange={event => setEps(Number(event.target.value))}/><div className="range-hints"><span>0.1</span><span>2.0</span></div><div className="control-row min-samples"><label htmlFor="min-samples">Minimum points</label><span className="value-pill">{minSamples}</span></div><input id="min-samples" className="range" type="range" min="2" max="15" value={minSamples} onChange={event => setMinSamples(Number(event.target.value))}/></div>}
              <div className="control-block feature-block"><div className="control-row"><label>Features to include</label><span className="feature-count">{features.length} selected</span></div>{clusterableColumns.length ? clusterableColumns.map(column=><label className="check-row" key={column.name}><input type="checkbox" checked={features.includes(column.name)} onChange={()=>toggleFeature(column.name)}/><span>{column.name}</span><small>{column.basket ? 'item' : column.type}</small></label>) : <div className="feature-empty">Upload a CSV to choose numeric or categorical features.</div>}</div>
              <button className="run-button" onClick={() => void run()} disabled={!dataset || features.length === 0 || busy}>{busy ? <LoaderCircle size={16} className="spin"/> : <Play size={15} fill="currentColor"/>}{busy ? 'Working...' : 'Run clustering'}<ArrowUpRight size={15}/></button><p className="run-footnote">Runs in your browser · K-Means up to {MAX_KMEANS_ROWS.toLocaleString()} rows · DBSCAN up to {MAX_DBSCAN_ROWS.toLocaleString()} rows.</p>
            </div>
            {error && <div className="error-banner">{error}</div>}
            <div className="insight-card"><div className="insight-icon"><Sparkles size={16}/></div><div><strong>A good place to start</strong><p>Patternly scales numeric features, caps extreme values so a few outliers do not dominate the groups, and encodes categories locally. Detected item columns are treated as shopping baskets.</p></div></div>
            {runs.length > 1 && <div className="compare-card"><div className="compare-heading"><div><h3>Compare runs</h3><span>Recent experiments in this session</span></div><button className="text-button">Clear</button></div>{runs.map((item,index)=><div className="compare-row" key={index}><span className="compare-color" style={{background:colors[index]}}/><strong>{item.algorithm === 'kmeans' ? 'K-Means' : 'DBSCAN'}</strong><span>{item.cluster_count} clusters</span><b>{item.labels.length} rows</b></div>)}</div>}
            <div className="coming-soon"><div><span className="coming-icon">P</span><span><strong>More ways to explore</strong><small>PCA & outlier detection are on the way</small></span></div><span className="soon-pill">COMING SOON</span></div>
          </section>
        </div>
        {storageMessage && <div className="storage-message">{storageMessage}</div>}
        <footer className="footer"><span>Patternly <i/> A little more clarity in every dataset.</span><span>Built for curious minds <Sparkles size={12}/></span></footer>
      </div>}
    </main>
    {chartExpanded && result && <div className="modal-backdrop" onMouseDown={() => setChartExpanded(false)}><section className="chart-modal" role="dialog" aria-modal="true" aria-labelledby="expanded-chart-title" onMouseDown={event => event.stopPropagation()}><div className="modal-heading"><div><h2 id="expanded-chart-title">Cluster map</h2><span>{chart ? `${chart.xName} vs ${chart.yName}` : result.features.join(', ')} · {result.labels.length.toLocaleString()} records</span></div><button className="icon-button" aria-label="Close expanded visualization" onClick={() => setChartExpanded(false)}><X size={18}/></button></div>{plot(true)}<ClusterLegend result={result}/></section></div>}
  </div>
}

export default App
