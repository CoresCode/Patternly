import { useMemo, useState } from 'react'
import { Activity, ArrowDownToLine, BarChart3, Check, ChevronDown, CircleHelp, Database, FileSpreadsheet, FlaskConical, Layers3, LoaderCircle, Play, Plus, Sparkles, UploadCloud, X } from 'lucide-react'
import { cluster, inspect, type ClusterResult, type DatasetInfo } from './api'
import './style.css'

const colors = ['#f29d62', '#89a997', '#769bc0', '#d47e82', '#a891c3', '#d5bd67', '#68b9b1']

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [dataset, setDataset] = useState<DatasetInfo | null>(null)
  const [result, setResult] = useState<ClusterResult | null>(null)
  const [runs, setRuns] = useState<ClusterResult[]>([])
  const [algorithm, setAlgorithm] = useState('kmeans')
  const [features, setFeatures] = useState<string[]>([])
  const [clusterCount, setClusterCount] = useState(3)
  const [eps, setEps] = useState(0.5)
  const [minSamples, setMinSamples] = useState(5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  async function selectFile(next: File | undefined) {
    if (!next) return
    setError(''); setBusy(true); setFile(next); setResult(null); setRuns([])
    try {
      const info = await inspect(next)
      setDataset(info)
      setFeatures(info.column_info.filter(column => column.numeric).slice(0, 2).map(column => column.name))
    } catch (err) { setDataset(null); setError(err instanceof Error ? err.message : 'Upload failed.') }
    finally { setBusy(false) }
  }

  async function run() {
    if (!file || features.length === 0) return
    setError(''); setBusy(true)
    try {
      const next = await cluster(file, algorithm, features, clusterCount, eps, minSamples)
      setResult(next); setRuns(previous => [next, ...previous].slice(0, 3))
    } catch (err) { setError(err instanceof Error ? err.message : 'Clustering failed.') }
    finally { setBusy(false) }
  }

  async function loadSample() {
    try {
      const response = await fetch('/mini-flowers.csv')
      if (!response.ok) throw new Error('Could not load the bundled CSV. Start Patternly with npm.cmd run dev:all from its project folder.')
      const sample = new File([await response.blob()], 'mini-flowers.csv', { type: 'text/csv' })
      await selectFile(sample)
    } catch (err) { setError(err instanceof TypeError ? 'The Patternly web server is unavailable. Start both services with npm.cmd run dev:all from the project folder.' : err instanceof Error ? err.message : 'Sample dataset could not be loaded.') }
  }

  const numericColumns = dataset?.column_info.filter(column => column.numeric) ?? []
  const previewColumns = dataset?.column_info.slice(0, 5) ?? []
  const chart = useMemo(() => {
    if (!result || result.features.length < 2) return null
    const [xName, yName] = result.features
    const xs = result.points.map(point => Number(point[xName]))
    const ys = result.points.map(point => Number(point[yName]))
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const sx = (value: number) => 24 + ((value - minX) / (maxX - minX || 1)) * 512
    const sy = (value: number) => 260 - ((value - minY) / (maxY - minY || 1)) * 232
    return { xName, yName, dots: result.points.map((point, index) => ({ x: sx(xs[index]), y: sy(ys[index]), label: result.labels[index] })) }
  }, [result])

  function toggleFeature(name: string) { setFeatures(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]) }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#"><span className="brand-mark"><Activity size={20} strokeWidth={2.3}/></span><span>patternly</span></a>
      <div className="workspace-label">WORKSPACE <ChevronDown size={13}/></div>
      <button className="nav-item active"><Layers3 size={17}/> Studio <span className="nav-dot"/></button>
      <button className="nav-item"><Database size={17}/> Datasets</button>
      <button className="nav-item"><FlaskConical size={17}/> Experiments</button>
      <div className="side-divider"/><div className="side-caption">RECENT EXPERIMENTS</div>
      {runs.length ? runs.map((item, index) => <button className="recent" key={`${item.algorithm}-${index}`}><span className="recent-dot" style={{background: colors[index]}}/>{item.algorithm === 'kmeans' ? 'K-Means' : 'DBSCAN'} run <span>{item.cluster_count} groups</span></button>) : <div className="empty-recent">Your experiment history<br/>will appear here.</div>}
      <div className="sidebar-bottom"><button className="nav-item"><CircleHelp size={17}/> Help & guides</button><div className="profile"><div className="avatar">P</div><div><strong>Personal workspace</strong><small>Free plan</small></div><ChevronDown size={15}/></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="crumb">Studio <span>/</span> <strong>Untitled exploration</strong></div><div className="top-actions"><span className="autosave"><span/> All changes saved</span><button className="icon-button" aria-label="Help"><CircleHelp size={17}/></button><div className="avatar small">P</div></div></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow"><Sparkles size={13}/> DATA EXPLORATION</div><h1>Find the shape in your data.</h1><p>Bring a dataset, try a clustering method, and see what patterns emerge.</p></div><button className="quiet-button" onClick={() => { setFile(null); setDataset(null); setResult(null); setRuns([]); setError('') }}><Plus size={16}/> New exploration</button></div>
        <div className="layout-grid">
          <section className="left-column">
            <div className="section-title"><span className="step">01</span><div><h2>Your dataset</h2><p>Start with a CSV file to explore.</p></div></div>
            {!dataset ? <label className={`upload-zone ${dragging ? 'dragging' : ''}`} onDragOver={event => {event.preventDefault(); setDragging(true)}} onDragLeave={() => setDragging(false)} onDrop={event => {event.preventDefault(); setDragging(false); void selectFile(event.dataTransfer.files[0])}}>
              <input type="file" accept=".csv,text/csv" onChange={event => void selectFile(event.target.files?.[0])}/><div className="upload-icon"><UploadCloud size={21}/></div><strong>{busy ? 'Reading your dataset…' : 'Drop your CSV here, or browse'}</strong><span>CSV files · up to 25 MB</span><span className="browse-link">Choose a file <ArrowDownToLine size={13}/></span>
            </label> : <div className="dataset-card"><div className="file-icon"><FileSpreadsheet size={18}/></div><div className="dataset-name"><strong>{dataset.filename}</strong><span>{dataset.rows.toLocaleString()} rows <i/> {dataset.columns} columns</span></div><button className="remove-file" onClick={() => {setDataset(null); setFile(null); setResult(null)}} aria-label="Remove dataset"><X size={16}/></button><div className="dataset-stats"><div><span>ROWS</span><strong>{dataset.rows.toLocaleString()}</strong></div><div><span>FEATURES</span><strong>{dataset.columns}</strong></div><div><span>NUMERIC</span><strong>{numericColumns.length}</strong></div></div></div>}
            {dataset && <div className="preview-card"><div className="card-heading"><div><h3>Quick preview</h3><span>First 12 rows · {dataset.column_info.length} columns detected</span></div><button className="text-button">View profile <ChevronDown size={13}/></button></div><div className="table-wrap"><table><thead><tr>{previewColumns.map(col => <th key={col.name}>{col.name}<small>{col.type}</small></th>)}</tr></thead><tbody>{dataset.preview.map((row, index) => <tr key={index}>{previewColumns.map(col => <td key={col.name}>{row[col.name] == null ? <em>empty</em> : String(row[col.name])}</td>)}</tr>)}</tbody></table></div></div>}
            {dataset && result && <div className="result-card"><div className="card-heading"><div><h3>Cluster map</h3><span>{result.features.join(' × ')} · {result.labels.length.toLocaleString()} records</span></div><button className="export-button"><ArrowDownToLine size={14}/> Export</button></div>
              {chart ? <div className="chart-area"><svg viewBox="0 0 560 300" role="img" aria-label="Scatter plot of clustered data"><line x1="24" y1="260" x2="536" y2="260" className="axis"/><line x1="24" y1="28" x2="24" y2="260" className="axis"/>{[0,1,2,3].map(i => <line key={i} x1="24" x2="536" y1={202-i*58} y2={202-i*58} className="gridline"/>)}{chart.dots.slice(0,1500).map((dot,index)=><circle key={index} cx={dot.x} cy={dot.y} r="4" fill={dot.label === -1 ? '#a6aaa5' : colors[dot.label % colors.length]} opacity=".82"/> )}</svg><div className="axis-label x">{chart.xName}</div><div className="axis-label y">{chart.yName}</div></div> : <div className="one-feature"><BarChart3 size={18}/> Choose two numeric features to view the cluster map.</div>}
              <div className="legend">{Object.entries(result.cluster_counts).map(([label,count])=><span key={label}><i style={{background:label === '-1' ? '#a6aaa5' : colors[Number(label) % colors.length]}}/>{label === '-1' ? 'Noise' : `Cluster ${Number(label)+1}`} <small>{count}</small></span>)}</div>
            </div>}
            {!dataset && <div className="sample-note"><Sparkles size={15}/><span>New to clustering? <button className="sample-link" onClick={() => void loadSample()}>Try our mini flower dataset</button> to explore.</span><button aria-label="Dismiss" onClick={event => event.currentTarget.parentElement?.remove()}><X size={14}/></button></div>}
          </section>

          <section className="right-column"><div className="section-title"><span className="step">02</span><div><h2>Experiment</h2><p>Choose how to group your data.</p></div></div>
            <div className="experiment-card"><label className="field-label">CLUSTERING METHOD</label><div className="method-tabs"><button className={algorithm === 'kmeans' ? 'selected' : ''} onClick={() => setAlgorithm('kmeans')}><span className="method-glyph">K</span><span><strong>K-Means</strong><small>Find a set number of groups</small></span>{algorithm === 'kmeans' && <Check size={16}/>}</button><button className={algorithm === 'dbscan' ? 'selected' : ''} onClick={() => setAlgorithm('dbscan')}><span className="method-glyph db">D</span><span><strong>DBSCAN</strong><small>Find dense regions & outliers</small></span>{algorithm === 'dbscan' && <Check size={16}/>}</button></div>
              {algorithm === 'kmeans' && <div className="control-block"><div className="control-row"><label htmlFor="count">Number of clusters</label><span className="value-pill">{clusterCount}</span></div><input id="count" className="range" type="range" min="2" max="10" value={clusterCount} onChange={event => setClusterCount(Number(event.target.value))}/><div className="range-hints"><span>2 groups</span><span>10 groups</span></div></div>}
              {algorithm === 'dbscan' && <div className="db-controls"><div className="control-row"><label htmlFor="eps">Neighborhood radius (eps)</label><span className="value-pill">{eps.toFixed(1)}</span></div><input id="eps" className="range" type="range" min="0.1" max="2" step="0.1" value={eps} onChange={event => setEps(Number(event.target.value))}/><div className="range-hints"><span>0.1</span><span>2.0</span></div><div className="control-row min-samples"><label htmlFor="min-samples">Minimum points</label><span className="value-pill">{minSamples}</span></div><input id="min-samples" className="range" type="range" min="2" max="15" value={minSamples} onChange={event => setMinSamples(Number(event.target.value))}/></div>}
              <div className="control-block feature-block"><div className="control-row"><label>Features to include</label><span className="feature-count">{features.length} selected</span></div>{numericColumns.length ? numericColumns.map(column=><label className="check-row" key={column.name}><input type="checkbox" checked={features.includes(column.name)} onChange={()=>toggleFeature(column.name)}/><span>{column.name}</span><small>{column.type}</small></label>) : <div className="feature-empty">Upload a dataset to choose numeric features.</div>}</div>
              <button className="run-button" onClick={() => void run()} disabled={!dataset || features.length === 0 || busy}>{busy ? <LoaderCircle size={16} className="spin"/> : <Play size={15} fill="currentColor"/>}{busy ? 'Working…' : 'Run clustering'}<span>?</span></button><p className="run-footnote">Your data stays on this machine.</p>
            </div>
            {error && <div className="error-banner">{error}</div>}
            <div className="insight-card"><div className="insight-icon"><Sparkles size={16}/></div><div><strong>A good place to start</strong><p>Scale your features before comparing distances. Patternly standardizes numeric features automatically.</p></div></div>
            {runs.length > 1 && <div className="compare-card"><div className="compare-heading"><div><h3>Compare runs</h3><span>Recent experiments in this session</span></div><button className="text-button">Clear</button></div>{runs.map((item,index)=><div className="compare-row" key={index}><span className="compare-color" style={{background:colors[index]}}/><strong>{item.algorithm === 'kmeans' ? 'K-Means' : 'DBSCAN'}</strong><span>{item.cluster_count} clusters</span><b>{item.labels.length} rows</b></div>)}</div>}
            <div className="coming-soon"><div><span className="coming-icon">P</span><span><strong>More ways to explore</strong><small>PCA & outlier detection are on the way</small></span></div><span className="soon-pill">COMING SOON</span></div>
          </section>
        </div>
        <footer className="footer"><span>Patternly <i/> A little more clarity in every dataset.</span><span>Built for curious minds <Sparkles size={12}/></span></footer>
      </div>
    </main>
  </div>
}

export default App
