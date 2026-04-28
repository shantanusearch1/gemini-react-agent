import { useState, useRef } from 'react'

const JSX_PROMPTS = [
  { label: 'Login page', prompt: 'Login page with email and password fields, remember me checkbox, forgot password link, and sign in button' },
  { label: 'Profile page', prompt: 'User profile page with avatar, name, bio, stats cards for posts/followers/following, and edit profile button' },
  { label: 'Dashboard', prompt: 'Admin dashboard with collapsible sidebar, top nav, 4 stats cards, revenue chart area, and recent orders table' },
  { label: 'Product listing', prompt: 'Product listing page with search bar, category filter chips, sort dropdown, and responsive product card grid with ratings' },
  { label: 'Settings', prompt: 'Settings page with tabs for Account, Notifications, Security, and Billing sections' },
  { label: 'Pricing page', prompt: 'Pricing page with Free, Pro, and Enterprise plan cards, feature list, and CTA buttons' },
  { label: 'File upload', prompt: 'File upload component with drag-and-drop zone, file type icons, file list with size, and remove button' },
  { label: 'Kanban board', prompt: 'Kanban board with Todo, In Progress, Review, and Done columns with task cards showing priority badges' },
  { label: 'Chat UI', prompt: 'Chat interface with message list, sender avatars, timestamps, and message input with send button' },
  { label: 'Register form', prompt: 'Registration form with first name, last name, email, password, confirm password, role dropdown, and terms checkbox' },
  { label: 'Invoice page', prompt: 'Invoice page with company logo, client details, itemized table with qty/rate/total, subtotal, tax, grand total, and print button' },
  { label: 'Landing page', prompt: 'SaaS landing page with hero section, features grid, testimonials, and call-to-action footer' },
]

const SQL_PROMPTS = [
  { label: 'SELECT with JOIN', prompt: 'Get all orders with customer name, product name, quantity and total price by joining orders, customers and products tables' },
  { label: 'Aggregation', prompt: 'Monthly revenue report grouped by month and region with total sales, order count and average order value' },
  { label: 'CREATE TABLE', prompt: 'Create tables for an e-commerce system: customers, products, orders, order_items with proper constraints and indexes' },
  { label: 'Subquery', prompt: 'Find all customers who have placed more than 5 orders and spent more than 10000 total in the last 6 months' },
  { label: 'Window function', prompt: 'Calculate running total of sales, rank employees by sales within each department, and show previous month comparison' },
  { label: 'Stored Procedure', prompt: 'Create a stored procedure to process a new order: validate stock, insert order, update inventory, return order ID' },
  { label: 'Pagination', prompt: 'Paginated query for product listing with search filter, category filter, sort by price or name, with total count' },
  { label: 'Upsert', prompt: 'Upsert customer records — insert if not exists, update if email already exists, log changes to audit table' },
  { label: 'Date operations', prompt: 'Sales report for last 30 days, group by week, compare with same period last year, show percentage change' },
  { label: 'CTE', prompt: 'Use CTEs to find top 10 customers by lifetime value with their most recent order and product preferences' },
]

const CSHARP_PROMPTS = [
  { label: 'REST API Controller', prompt: 'ASP.NET Core Web API controller for products with GET, POST, PUT, DELETE endpoints, DTOs, and proper HTTP status codes' },
  { label: 'Repository pattern', prompt: 'Generic repository pattern with interface, implementation using Entity Framework Core, Unit of Work pattern' },
  { label: 'LINQ queries', prompt: 'Complex LINQ queries for sales data: filtering, grouping, joining, aggregating, ordering with method and query syntax' },
  { label: 'Async service', prompt: 'Async service class for sending emails with retry logic, cancellation token, dependency injection, and logging' },
  { label: 'Entity Framework', prompt: 'Entity Framework Core DbContext with models for e-commerce: Customer, Product, Order, fluent configuration and migrations' },
  { label: 'Middleware', prompt: 'Custom ASP.NET Core middleware for request logging, error handling, correlation ID, and response time tracking' },
  { label: 'Background service', prompt: 'IHostedService background worker that processes a queue, sends notifications, with cancellation and error handling' },
  { label: 'Auth with JWT', prompt: 'JWT authentication service: generate token, validate, refresh token, claims, roles, ASP.NET Core integration' },
  { label: 'Design pattern', prompt: 'Factory, Strategy and Observer design patterns implemented in C# with real-world e-commerce use case examples' },
  { label: 'Unit tests', prompt: 'xUnit unit tests for a order processing service with Moq mocks, arrange-act-assert pattern, edge cases' },
  { label: 'SignalR Hub', prompt: 'SignalR hub for real-time notifications: connection management, groups, send to specific users, reconnect logic' },
  { label: 'gRPC service', prompt: 'gRPC service definition and C# implementation for a product catalog with streaming and error handling' },
]

const PAGE_TYPES = ['Full page', 'Component', 'Dashboard', 'Form', 'Landing page', 'Modal', 'Data table', 'Card list']
const STYLES = ['Modern clean Tailwind CSS', 'Minimal with lots of whitespace', 'shadcn/ui components', 'Dark theme', 'Material design', 'Colorful and bold']

const SQL_DIALECTS = [
  { id: 'oracle', label: '🔶 Oracle SQL', desc: 'Oracle DB · ROWNUM · NVL · DECODE · SYSDATE · DUAL' },
  { id: 'oracle_plsql', label: '🔶 Oracle PL/SQL', desc: 'Stored procs · Cursors · Exceptions · Packages · Triggers' },
  { id: 'bigquery', label: '🔵 GCP BigQuery', desc: 'BigQuery SQL · ARRAY · STRUCT · PARTITION BY · UDF' },
  { id: 'bigquery_scripting', label: '🔵 BigQuery Scripting', desc: 'Procedures · Variables · Loops · DECLARE · BEGIN/END' },
]

const CSHARP_TYPES = [
  { id: 'aspnet', label: '🌐 ASP.NET Core', desc: 'Web API · Controllers · Middleware · Filters · Routing' },
  { id: 'ef', label: '🗃 Entity Framework', desc: 'DbContext · Migrations · LINQ · Relationships · Fluent API' },
  { id: 'console', label: '⌨ Console / CLI', desc: 'Console app · CLI tool · Background worker · Hosted service' },
  { id: 'library', label: '📦 Class Library', desc: 'Services · Interfaces · Patterns · Extensions · Utilities' },
  { id: 'blazor', label: '⚡ Blazor', desc: 'Blazor components · Pages · State · JS interop · Forms' },
  { id: 'test', label: '🧪 Unit Tests', desc: 'xUnit · NUnit · Moq · FluentAssertions · Test patterns' },
]

const FREE_MODELS = [
  'openrouter/free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-r1:free',
  'qwen/qwen3-235b-a22b:free',
  'google/gemma-3-27b-it:free',
  'mistralai/devstral-small:free',
  'nvidia/llama-3.1-nemotron-70b-instruct:free',
]

function modelDisplayName(modelId) {
  if (!modelId) return ''
  if (modelId === 'openrouter/free') return 'openrouter/free'
  const parts = modelId.split('/')
  if (parts.length < 2) return modelId
  const provider = parts[0]
  const name = parts[1].split(':')[0]
  return `${provider}/${name}`
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }) }
  return <button onClick={copy} style={styles.copyBtn}>{copied ? '✓ Copied!' : 'Copy'}</button>
}

async function tryModel(apiKey, modelId, systemPrompt, userPrompt) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.href,
      'X-Title': 'Dev Agent',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 8000,
      temperature: 0.3,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  const data = await res.json()
  const raw = data?.choices?.[0]?.message?.content || ''
  if (!raw) throw new Error('Empty response')
  // get actual model used (openrouter/free resolves to a real model)
  const actualModel = data?.model || modelId
  return { raw: raw.trim(), actualModel }
}

async function runWithRetry(apiKey, systemPrompt, userPrompt, setLoadingMsg) {
  let lastError = ''
  for (let i = 0; i < FREE_MODELS.length; i++) {
    const modelId = FREE_MODELS[i]
    const shortName = modelId === 'openrouter/free' ? 'Auto Router' : modelId.split('/')[1].split(':')[0]
    setLoadingMsg(`Trying ${shortName} (${i + 1}/${FREE_MODELS.length})...`)
    try {
      const { raw, actualModel } = await tryModel(apiKey, modelId, systemPrompt, userPrompt)
      return { raw, modelId: actualModel }
    } catch (e) {
      lastError = e.message
      console.warn(`Model ${modelId} failed:`, e.message)
    }
  }
  throw new Error(`All models failed. Last error: ${lastError}`)
}

export default function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('openrouter_key') || '')
  const [keySet, setKeySet] = useState(!!localStorage.getItem('openrouter_key'))
  const [tab, setTab] = useState('jsx')

  // JSX
  const [jsxPrompt, setJsxPrompt] = useState('')
  const [pageType, setPageType] = useState('Full page')
  const [style, setStyle] = useState('Modern clean Tailwind CSS')
  const [filename, setFilename] = useState('MyPage.jsx')
  const [jsxCode, setJsxCode] = useState('')
  const [jsxModel, setJsxModel] = useState('')
  const [jsxLoading, setJsxLoading] = useState(false)
  const [jsxMsg, setJsxMsg] = useState('')
  const [jsxError, setJsxError] = useState('')
  const jsxRef = useRef()

  // SQL
  const [sqlPrompt, setSqlPrompt] = useState('')
  const [dialect, setDialect] = useState('oracle')
  const [sqlCode, setSqlCode] = useState('')
  const [sqlModel, setSqlModel] = useState('')
  const [sqlLoading, setSqlLoading] = useState(false)
  const [sqlMsg, setSqlMsg] = useState('')
  const [sqlError, setSqlError] = useState('')
  const sqlRef = useRef()

  // C#
  const [csPrompt, setCsPrompt] = useState('')
  const [csType, setCsType] = useState('aspnet')
  const [csFilename, setCsFilename] = useState('MyService.cs')
  const [csCode, setCsCode] = useState('')
  const [csModel, setCsModel] = useState('')
  const [csLoading, setCsLoading] = useState(false)
  const [csMsg, setCsMsg] = useState('')
  const [csError, setCsError] = useState('')
  const csRef = useRef()

  // History
  const [history, setHistory] = useState([])

  const saveKey = () => {
    if (!apiKey.trim()) return
    localStorage.setItem('openrouter_key', apiKey.trim())
    setKeySet(true)
  }
  const clearKey = () => {
    localStorage.removeItem('openrouter_key')
    setApiKey('')
    setKeySet(false)
  }

  const generateJsx = async () => {
    if (!jsxPrompt.trim()) { jsxRef.current?.focus(); return }
    if (!apiKey) { setJsxError('Enter your OpenRouter API key first.'); return }
    setJsxLoading(true); setJsxError(''); setJsxCode(''); setJsxModel('')
    const sys = `You are an expert React developer. Generate complete production-ready .jsx files.
Style: ${style}, Page type: ${pageType}
- Functional components with React hooks
- Realistic placeholder/mock data
- Accessibility attributes (aria-label, role, tabIndex)
- Default export
- ONLY output raw JSX. No markdown fences, no explanation. Start with import statements.`
    try {
      const { raw, modelId } = await runWithRetry(apiKey, sys, `Create a ${pageType} React JSX: ${jsxPrompt}`, setJsxMsg)
      const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
      setJsxCode(cleaned); setJsxModel(modelId)
      setHistory(h => [{ type: 'jsx', prompt: jsxPrompt, output: cleaned, model: modelId, label: filename, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...h].slice(0, 30))
    } catch (e) { setJsxError(e.message) }
    setJsxLoading(false)
  }

  const generateSql = async () => {
    if (!sqlPrompt.trim()) { sqlRef.current?.focus(); return }
    if (!apiKey) { setSqlError('Enter your OpenRouter API key first.'); return }
    setSqlLoading(true); setSqlError(''); setSqlCode(''); setSqlModel('')
    const d = SQL_DIALECTS.find(x => x.id === dialect)
    const sys = `You are an expert database engineer specializing in ${d.label}.
- Write clean optimized production-ready SQL for ${d.label}
- ${dialect === 'oracle' ? 'Use Oracle syntax: ROWNUM, NVL, DECODE, TO_DATE, SYSDATE, DUAL, sequences' : ''}
- ${dialect === 'oracle_plsql' ? 'Use full PL/SQL: DECLARE, BEGIN, END, cursors, exceptions, packages, triggers' : ''}
- ${dialect === 'bigquery' ? 'Use BigQuery syntax: backtick table names, ARRAY, STRUCT, UNNEST, QUALIFY, dataset.table format' : ''}
- ${dialect === 'bigquery_scripting' ? 'Use BigQuery scripting: DECLARE, SET, BEGIN/END, IF/ELSE, LOOP, CALL, CREATE TEMP TABLE' : ''}
- Add comments for complex logic
- ONLY output SQL code. No markdown fences.`
    try {
      const { raw, modelId } = await runWithRetry(apiKey, sys, sqlPrompt, setSqlMsg)
      const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
      setSqlCode(cleaned); setSqlModel(modelId)
      setHistory(h => [{ type: 'sql', prompt: sqlPrompt, output: cleaned, model: modelId, label: d.label, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...h].slice(0, 30))
    } catch (e) { setSqlError(e.message) }
    setSqlLoading(false)
  }

  const generateCs = async () => {
    if (!csPrompt.trim()) { csRef.current?.focus(); return }
    if (!apiKey) { setCsError('Enter your OpenRouter API key first.'); return }
    setCsLoading(true); setCsError(''); setCsCode(''); setCsModel('')
    const t = CSHARP_TYPES.find(x => x.id === csType)
    const sys = `You are an expert C# and .NET developer specializing in ${t.label}.
- Write clean, production-ready, modern C# code (.NET 8+)
- Use latest C# features: records, pattern matching, nullable reference types, async/await
- ${csType === 'aspnet' ? 'Use ASP.NET Core best practices: minimal APIs or controllers, dependency injection, middleware, proper HTTP status codes, model validation' : ''}
- ${csType === 'ef' ? 'Use EF Core best practices: DbContext, migrations, relationships, Fluent API configuration, async queries, no-tracking for reads' : ''}
- ${csType === 'console' ? 'Use .NET generic host, IHostedService, dependency injection, configuration, logging with Microsoft.Extensions.Logging' : ''}
- ${csType === 'library' ? 'Use SOLID principles, interfaces, dependency injection friendly, XML documentation comments, proper exception handling' : ''}
- ${csType === 'blazor' ? 'Use Blazor best practices: component lifecycle, EventCallback, cascading parameters, JS interop when needed, proper state management' : ''}
- ${csType === 'test' ? 'Use xUnit with Moq and FluentAssertions, arrange-act-assert pattern, meaningful test names, cover edge cases and error scenarios' : ''}
- Add XML doc comments on public members
- Include using statements at top
- ONLY output raw C# code. No markdown fences, no explanation.`
    try {
      const { raw, modelId } = await runWithRetry(apiKey, sys, csPrompt, setCsMsg)
      const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
      setCsCode(cleaned); setCsModel(modelId)
      setHistory(h => [{ type: 'cs', prompt: csPrompt, output: cleaned, model: modelId, label: csFilename, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...h].slice(0, 30))
    } catch (e) { setCsError(e.message) }
    setCsLoading(false)
  }

  const selectedDialect = SQL_DIALECTS.find(d => d.id === dialect)
  const selectedCsType = CSHARP_TYPES.find(t => t.id === csType)

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>{'</>'}</div>
            <div>
              <div style={styles.logoTitle}>Dev Agent</div>
              <div style={styles.logoSub}>JSX · SQL · C# · Powered by OpenRouter</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {keySet && <div style={styles.keyBadge}><span style={{ color: '#4ade80' }}>●</span> OpenRouter connected</div>}
            {keySet && <button onClick={clearKey} style={styles.clearKeyBtn}>Change Key</button>}
          </div>
        </div>
      </header>

      <main style={styles.main}>
        {!keySet && (
          <div style={styles.keyBox}>
            <div style={styles.keyTitle}>🔑 Enter your OpenRouter API Key</div>
            <div style={styles.keySub}>Free to sign up — no credit card needed. Get your key at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={styles.link}>openrouter.ai/keys</a>. Stored only in your browser.</div>
            <div style={styles.keyRow}>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveKey()} placeholder="sk-or-v1-..." style={styles.keyInput} />
              <button onClick={saveKey} disabled={!apiKey.trim()} style={styles.saveKeyBtn}>Save Key</button>
            </div>
            <div style={styles.freeNote}>✅ Auto-retries {FREE_MODELS.length} free models until one works — no billing needed</div>
          </div>
        )}

        <div style={styles.tabs}>
          <button onClick={() => setTab('jsx')} style={{ ...styles.tab, ...(tab === 'jsx' ? styles.tabActive : {}) }}>⚛ JSX</button>
          <button onClick={() => setTab('sql')} style={{ ...styles.tab, ...(tab === 'sql' ? { ...styles.tabActive, color: dialect.includes('oracle') ? '#fb923c' : '#38bdf8', borderBottomColor: dialect.includes('oracle') ? '#fb923c' : '#38bdf8' } : {}) }}>🗄 SQL</button>
          <button onClick={() => setTab('cs')} style={{ ...styles.tab, ...(tab === 'cs' ? { ...styles.tabActive, color: '#a3e635', borderBottomColor: '#a3e635' } : {}) }}>🟢 C#</button>
          <button onClick={() => setTab('history')} style={{ ...styles.tab, ...(tab === 'history' ? styles.tabActive : {}) }}>
            🕒 History {history.length > 0 && <span style={styles.badge}>{history.length}</span>}
          </button>
        </div>

        {/* JSX TAB */}
        {tab === 'jsx' && (
          <div style={styles.pane}>
            <div style={styles.row}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Page type</label>
                <select value={pageType} onChange={e => setPageType(e.target.value)} style={styles.select}>{PAGE_TYPES.map(t => <option key={t}>{t}</option>)}</select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Style</label>
                <select value={style} onChange={e => setStyle(e.target.value)} style={styles.select}>{STYLES.map(s => <option key={s}>{s}</option>)}</select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>File name</label>
                <input type="text" value={filename} onChange={e => setFilename(e.target.value)} style={styles.input} />
              </div>
            </div>
            <div><div style={styles.label}>Quick prompts</div><div style={styles.chips}>{JSX_PROMPTS.map(q => <button key={q.label} onClick={() => setJsxPrompt(q.prompt)} style={styles.chip}>{q.label}</button>)}</div></div>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Describe your page</label>
              <textarea ref={jsxRef} value={jsxPrompt} onChange={e => setJsxPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && e.ctrlKey && generateJsx()} placeholder="e.g. Admin dashboard with sidebar, stats cards, revenue chart and orders table..." style={styles.textarea} rows={4} />
              <div style={styles.hint}>Ctrl + Enter to generate</div>
            </div>
            <button onClick={generateJsx} disabled={jsxLoading || !keySet} style={styles.genBtn}>
              {jsxLoading ? <span style={styles.btnInner}><span style={styles.spinner} />{jsxMsg}</span> : 'Generate JSX ↗'}
            </button>
            {jsxError && <div style={styles.errorBox}><strong>⚠</strong> {jsxError}</div>}
            {jsxCode && !jsxLoading && (
              <div style={styles.outputBox}>
                <div style={styles.outputHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={styles.fname}>{filename}</span>
                    <span style={styles.modelTag}>✓ {modelDisplayName(jsxModel)}</span>
                  </div>
                  <CopyButton text={jsxCode} />
                </div>
                <pre style={styles.codeBlock}>{jsxCode}</pre>
              </div>
            )}
          </div>
        )}

        {/* SQL TAB */}
        {tab === 'sql' && (
          <div style={styles.pane}>
            <div>
              <div style={styles.label}>SQL Dialect</div>
              <div style={styles.dialectGrid}>
                {SQL_DIALECTS.map(d => (
                  <button key={d.id} onClick={() => setDialect(d.id)} style={{ ...styles.dialectBtn, ...(dialect === d.id ? { ...styles.dialectBtnActive, borderColor: d.id.includes('oracle') ? '#c2410c' : '#1d4ed8', background: d.id.includes('oracle') ? '#1a0800' : '#00102a' } : {}) }}>
                    <div style={styles.dialectLabel}>{d.label}</div>
                    <div style={styles.dialectDesc}>{d.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div><div style={styles.label}>Quick prompts</div><div style={styles.chips}>{SQL_PROMPTS.map(q => <button key={q.label} onClick={() => setSqlPrompt(q.prompt)} style={styles.chip}>{q.label}</button>)}</div></div>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Describe your query</label>
              <textarea ref={sqlRef} value={sqlPrompt} onChange={e => setSqlPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && e.ctrlKey && generateSql()} placeholder={dialect.includes('oracle') ? 'e.g. Get top 10 customers by orders in last 90 days using Oracle syntax with proper date functions...' : 'e.g. BigQuery query to analyze sales from dataset.orders partitioned by date with ARRAY aggregation...'} style={styles.textarea} rows={4} />
              <div style={styles.hint}>Ctrl + Enter to generate</div>
            </div>
            <button onClick={generateSql} disabled={sqlLoading || !keySet} style={{ ...styles.genBtn, background: dialect.includes('oracle') ? 'linear-gradient(135deg, #c2410c, #ea580c)' : 'linear-gradient(135deg, #1d4ed8, #0284c7)' }}>
              {sqlLoading ? <span style={styles.btnInner}><span style={styles.spinner} />{sqlMsg}</span> : `Generate ${selectedDialect?.label} ↗`}
            </button>
            {sqlError && <div style={styles.errorBox}><strong>⚠</strong> {sqlError}<div style={{ marginTop: 8, fontSize: 12, color: '#ffaa80' }}>💡 Add $1 at <a href="https://openrouter.ai/credits" target="_blank" rel="noreferrer" style={styles.link}>openrouter.ai/credits</a></div></div>}
            {sqlCode && !sqlLoading && (
              <div style={styles.outputBox}>
                <div style={styles.outputHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={styles.fname}>{selectedDialect?.label}</span>
                    <span style={{ ...styles.modelTag, background: dialect.includes('oracle') ? '#1a0800' : '#00102a', color: dialect.includes('oracle') ? '#fb923c' : '#38bdf8' }}>✓ {modelDisplayName(sqlModel)}</span>
                  </div>
                  <CopyButton text={sqlCode} />
                </div>
                <pre style={{ ...styles.codeBlock, color: '#86efac' }}>{sqlCode}</pre>
              </div>
            )}
          </div>
        )}

        {/* C# TAB */}
        {tab === 'cs' && (
          <div style={styles.pane}>
            <div>
              <div style={styles.label}>C# Project Type</div>
              <div style={styles.dialectGrid}>
                {CSHARP_TYPES.map(t => (
                  <button key={t.id} onClick={() => setCsType(t.id)} style={{ ...styles.dialectBtn, ...(csType === t.id ? { ...styles.dialectBtnActive, borderColor: '#4d7c0f', background: '#0a1a00' } : {}) }}>
                    <div style={styles.dialectLabel}>{t.label}</div>
                    <div style={styles.dialectDesc}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div><div style={styles.label}>Quick prompts</div><div style={styles.chips}>{CSHARP_PROMPTS.map(q => <button key={q.label} onClick={() => setCsPrompt(q.prompt)} style={styles.chip}>{q.label}</button>)}</div></div>
            <div style={styles.row}>
              <div style={{ ...styles.inputGroup, flex: 3 }}>
                <label style={styles.label}>Describe your C# code</label>
                <textarea ref={csRef} value={csPrompt} onChange={e => setCsPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && e.ctrlKey && generateCs()} placeholder="e.g. ASP.NET Core Web API controller for managing products with CRUD operations, validation, pagination and proper error handling..." style={styles.textarea} rows={4} />
                <div style={styles.hint}>Ctrl + Enter to generate</div>
              </div>
              <div style={{ ...styles.inputGroup, flex: 1 }}>
                <label style={styles.label}>File name</label>
                <input type="text" value={csFilename} onChange={e => setCsFilename(e.target.value)} style={styles.input} placeholder="MyService.cs" />
              </div>
            </div>
            <button onClick={generateCs} disabled={csLoading || !keySet} style={{ ...styles.genBtn, background: 'linear-gradient(135deg, #4d7c0f, #65a30d)' }}>
              {csLoading ? <span style={styles.btnInner}><span style={styles.spinner} />{csMsg}</span> : `Generate ${selectedCsType?.label} ↗`}
            </button>
            {csError && <div style={styles.errorBox}><strong>⚠</strong> {csError}<div style={{ marginTop: 8, fontSize: 12, color: '#ffaa80' }}>💡 Add $1 at <a href="https://openrouter.ai/credits" target="_blank" rel="noreferrer" style={styles.link}>openrouter.ai/credits</a></div></div>}
            {csCode && !csLoading && (
              <div style={styles.outputBox}>
                <div style={styles.outputHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={styles.fname}>{csFilename}</span>
                    <span style={{ ...styles.modelTag, background: '#0a1a00', color: '#a3e635' }}>✓ {modelDisplayName(csModel)}</span>
                  </div>
                  <CopyButton text={csCode} />
                </div>
                <pre style={{ ...styles.codeBlock, color: '#bfdbfe' }}>{csCode}</pre>
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div>
            {history.length === 0 ? <div style={styles.empty}>No generations yet!</div> : history.map((h, i) => (
              <div key={i} style={styles.histItem} onClick={() => {
                if (h.type === 'jsx') { setJsxPrompt(h.prompt); setJsxCode(h.output); setJsxModel(h.model); setTab('jsx') }
                else if (h.type === 'sql') { setSqlPrompt(h.prompt); setSqlCode(h.output); setSqlModel(h.model); setTab('sql') }
                else { setCsPrompt(h.prompt); setCsCode(h.output); setCsModel(h.model); setTab('cs') }
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: h.type === 'jsx' ? '#1a1030' : h.type === 'sql' ? '#001a10' : '#0a1a00', color: h.type === 'jsx' ? '#a78bfa' : h.type === 'sql' ? '#4ade80' : '#a3e635', border: `1px solid ${h.type === 'jsx' ? '#3a2060' : h.type === 'sql' ? '#0a3020' : '#1a3a00'}` }}>
                    {h.type === 'jsx' ? '⚛ JSX' : h.type === 'sql' ? '🗄 SQL' : '🟢 C#'}
                  </span>
                  <span style={styles.histFile}>{h.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#444' }}>{h.time}</span>
                </div>
                <div style={styles.histPrompt}>{h.prompt.slice(0, 100)}{h.prompt.length > 100 ? '...' : ''}</div>
                <div style={{ marginTop: 6 }}>
                  <span style={{ ...styles.modelTag, fontSize: 10 }}>✓ {modelDisplayName(h.model)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <style>{`
        @keyframes dotPulse { 0%,80%,100%{opacity:.2;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

const styles = {
  root: { minHeight: '100vh', background: '#0f0f13', color: '#e8e8f0' },
  header: { background: '#16161e', borderBottom: '1px solid #2a2a3a', padding: '0 24px', position: 'sticky', top: 0, zIndex: 10 },
  headerInner: { maxWidth: 920, margin: '0 auto', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  logoIcon: { width: 36, height: 36, background: 'linear-gradient(135deg, #7c3aed, #2563eb)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0 },
  logoTitle: { fontSize: 15, fontWeight: 700, color: '#fff' },
  logoSub: { fontSize: 11, color: '#555' },
  keyBadge: { fontSize: 12, color: '#888', background: '#1a2a1a', border: '1px solid #2a3a2a', padding: '4px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6 },
  clearKeyBtn: { fontSize: 12, background: '#1e1e2e', border: '1px solid #2a2a3a', color: '#888', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'Inter, sans-serif' },
  main: { maxWidth: 920, margin: '0 auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20 },
  keyBox: { background: '#16161e', border: '1px solid #7c3aed', borderRadius: 12, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
  keyTitle: { fontSize: 15, fontWeight: 700, color: '#fff' },
  keySub: { fontSize: 13, color: '#888', lineHeight: 1.7 },
  freeNote: { fontSize: 12, color: '#4ade80', background: '#0a1a0a', border: '1px solid #1a3a1a', padding: '10px 14px', borderRadius: 8 },
  link: { color: '#818cf8', textDecoration: 'none' },
  keyRow: { display: 'flex', gap: 10 },
  keyInput: { flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid #2a2a3a', background: '#0f0f13', color: '#e8e8f0', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, outline: 'none' },
  saveKeyBtn: { background: 'linear-gradient(135deg, #7c3aed, #2563eb)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  tabs: { display: 'flex', borderBottom: '1px solid #2a2a3a', gap: 0 },
  tab: { background: 'none', border: 'none', borderBottom: '2px solid transparent', color: '#555', fontSize: 13, padding: '8px 18px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 6 },
  tabActive: { color: '#818cf8', borderBottomColor: '#818cf8' },
  badge: { background: '#2a2a3a', color: '#888', fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 600 },
  pane: { display: 'flex', flexDirection: 'column', gap: 18 },
  dialectGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 6 },
  dialectBtn: { padding: '12px 16px', borderRadius: 10, border: '1px solid #2a2a3a', background: '#16161e', color: '#888', cursor: 'pointer', fontFamily: 'Inter, sans-serif', textAlign: 'left' },
  dialectBtnActive: { border: '1px solid #7c3aed', background: '#1a1030', color: '#e8e8f0' },
  dialectLabel: { fontSize: 13, fontWeight: 600, marginBottom: 4 },
  dialectDesc: { fontSize: 11, color: '#666', lineHeight: 1.5 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 140 },
  label: { fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 },
  select: { padding: '8px 12px', borderRadius: 8, border: '1px solid #2a2a3a', background: '#16161e', color: '#e8e8f0', fontFamily: 'Inter, sans-serif', fontSize: 13, height: 38, outline: 'none' },
  input: { padding: '8px 12px', borderRadius: 8, border: '1px solid #2a2a3a', background: '#16161e', color: '#e8e8f0', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, height: 38, outline: 'none' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid #2a2a3a', color: '#aaa', cursor: 'pointer', background: '#16161e', fontFamily: 'Inter, sans-serif' },
  textarea: { padding: '10px 14px', borderRadius: 8, border: '1px solid #2a2a3a', background: '#16161e', color: '#e8e8f0', fontFamily: 'Inter, sans-serif', fontSize: 13, resize: 'vertical', outline: 'none', lineHeight: 1.6, width: '100%' },
  hint: { fontSize: 10, color: '#444', marginTop: 2 },
  genBtn: { background: 'linear-gradient(135deg, #7c3aed, #2563eb)', color: '#fff', border: 'none', borderRadius: 8, padding: '13px 24px', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' },
  btnInner: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 },
  spinner: { width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' },
  errorBox: { background: '#2d1a1a', border: '1px solid #5c2a2a', color: '#ff8080', padding: '14px 16px', borderRadius: 8, fontSize: 13, lineHeight: 1.6 },
  outputBox: { border: '1px solid #2a2a3a', borderRadius: 10, overflow: 'hidden' },
  outputHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#16161e', borderBottom: '1px solid #2a2a3a' },
  fname: { fontSize: 12, color: '#888', fontFamily: 'JetBrains Mono, monospace' },
  modelTag: { fontSize: 11, background: '#1a1030', color: '#a78bfa', padding: '2px 10px', borderRadius: 10, fontFamily: 'JetBrains Mono, monospace' },
  copyBtn: { fontSize: 11, background: '#1e1e2e', border: '1px solid #2a2a3a', color: '#888', padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'Inter, sans-serif' },
  codeBlock: { background: '#0f0f13', padding: '16px', overflow: 'auto', maxHeight: 500, fontSize: 12, lineHeight: 1.65, color: '#c8d3f5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  empty: { textAlign: 'center', color: '#444', fontSize: 13, padding: '40px 0' },
  histItem: { padding: '12px 16px', background: '#16161e', borderRadius: 8, cursor: 'pointer', marginBottom: 8, border: '1px solid #2a2a3a' },
  histFile: { fontSize: 12, color: '#818cf8', fontFamily: 'JetBrains Mono, monospace' },
  histPrompt: { fontSize: 11, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  histTime: { fontSize: 11, color: '#444' },
}
