import { useState, useRef, useEffect } from 'react'
import BOFStaticChargeModel from './BOFStaticChargeModel.jsx'
import BOFRealTimeTDModel from './BOFRealTimeTDModel.jsx'
import SlabCastingModel from './SlabCastingModel.jsx'
import BilletCastingModel from './BilletCastingModel.jsx'

// ─── DATA ────────────────────────────────────────────────────────────────────

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
  { label: 'Invoice page', prompt: 'Invoice page with company logo, client details, itemized table with qty/rate/total, subtotal, tax, grand total, and print button' },
]

const SQL_PROMPTS = [
  { label: 'SELECT with JOIN', prompt: 'Get all orders with customer name, product name, quantity and total price by joining orders, customers and products tables' },
  { label: 'Aggregation', prompt: 'Monthly revenue report grouped by month and region with total sales, order count and average order value' },
  { label: 'CREATE TABLE', prompt: 'Create tables for an e-commerce system: customers, products, orders, order_items with proper constraints and indexes' },
  { label: 'Window function', prompt: 'Calculate running total of sales, rank employees by sales within each department, and show previous month comparison' },
  { label: 'Stored Procedure', prompt: 'Create a stored procedure to process a new order: validate stock, insert order, update inventory, return order ID' },
  { label: 'CTE', prompt: 'Use CTEs to find top 10 customers by lifetime value with their most recent order and product preferences' },
  { label: 'Date operations', prompt: 'Sales report for last 30 days, group by week, compare with same period last year, show percentage change' },
  { label: 'Upsert', prompt: 'Upsert customer records — insert if not exists, update if email already exists, log changes to audit table' },
]

const CSHARP_PROMPTS = [
  { label: 'REST API Controller', prompt: 'ASP.NET Core Web API controller for products with GET, POST, PUT, DELETE endpoints, DTOs, and proper HTTP status codes' },
  { label: 'Repository pattern', prompt: 'Generic repository pattern with interface, implementation using Entity Framework Core, Unit of Work pattern' },
  { label: 'Async service', prompt: 'Async service class for sending emails with retry logic, cancellation token, dependency injection, and logging' },
  { label: 'Entity Framework', prompt: 'Entity Framework Core DbContext with models for e-commerce: Customer, Product, Order, fluent configuration and migrations' },
  { label: 'Middleware', prompt: 'Custom ASP.NET Core middleware for request logging, error handling, correlation ID, and response time tracking' },
  { label: 'Auth with JWT', prompt: 'JWT authentication service: generate token, validate, refresh token, claims, roles, ASP.NET Core integration' },
  { label: 'Unit tests', prompt: 'xUnit unit tests for order processing service with Moq mocks, arrange-act-assert pattern, edge cases' },
  { label: 'Background service', prompt: 'IHostedService background worker that processes a queue, sends notifications, with cancellation and error handling' },
]

const PAGE_TYPES = ['Full page', 'Component', 'Dashboard', 'Form', 'Landing page', 'Modal', 'Data table', 'Card list']
const STYLES = ['Modern clean Tailwind CSS', 'Minimal with lots of whitespace', 'shadcn/ui components', 'Dark theme', 'Material design', 'Colorful and bold']

const SQL_DIALECTS = [
  { id: 'oracle', label: '🔶 Oracle SQL', desc: 'ROWNUM · NVL · DECODE · SYSDATE · DUAL', color: '#F57C00' },
  { id: 'oracle_plsql', label: '🔶 Oracle PL/SQL', desc: 'Cursors · Exceptions · Packages · Triggers', color: '#F57C00' },
  { id: 'bigquery', label: '🔵 GCP BigQuery', desc: 'ARRAY · STRUCT · PARTITION BY · UDF', color: '#1976D2' },
  { id: 'bigquery_scripting', label: '🔵 BigQuery Scripting', desc: 'DECLARE · BEGIN/END · LOOP · CALL', color: '#1976D2' },
]

const CSHARP_TYPES = [
  { id: 'aspnet', label: 'ASP.NET Core', icon: '🌐', desc: 'Web API · Controllers · Middleware' },
  { id: 'ef', label: 'Entity Framework', icon: '🗃', desc: 'DbContext · Migrations · LINQ' },
  { id: 'console', label: 'Console / CLI', icon: '⌨', desc: 'Console app · Background worker' },
  { id: 'library', label: 'Class Library', icon: '📦', desc: 'Services · Interfaces · Patterns' },
  { id: 'blazor', label: 'Blazor', icon: '⚡', desc: 'Components · Pages · JS interop' },
  { id: 'test', label: 'Unit Tests', icon: '🧪', desc: 'xUnit · Moq · FluentAssertions' },
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

const NAV_ITEMS = [
  { id: 'chat', icon: 'chat', label: 'Chat', protected: false },
  { id: 'jsx', icon: 'code', label: 'JSX Generator', protected: true },
  { id: 'sql', icon: 'storage', label: 'SQL Generator', protected: true },
  { id: 'cs', icon: 'terminal', label: 'C# Generator', protected: true },
  { id: 'history', icon: 'history', label: 'History', protected: true },
  { id: 'divider', isDivider: true },
  { id: 'bof_static', icon: 'science', label: 'BOF Static Charge', protected: false },
  { id: 'bof_td', icon: 'monitor_heart', label: 'BOF TD Prediction', protected: false },
  { id: 'divider2', isDivider: true, label: 'Casting Models' },
  { id: 'slab_casting', icon: 'view_stream', label: 'Slab Casting', protected: false },
  { id: 'billet_casting', icon: 'grid_on', label: 'Billet Casting', protected: false },
]

// Material Design colors
const M = {
  primary: '#1565C0',
  primaryLight: '#1976D2',
  primaryDark: '#0D47A1',
  secondary: '#6200EA',
  surface: '#FFFFFF',
  background: '#F5F5F5',
  surfaceVariant: '#F3F4F6',
  outline: '#E0E0E0',
  onSurface: '#212121',
  onSurfaceVariant: '#757575',
  onPrimary: '#FFFFFF',
  error: '#B00020',
  errorSurface: '#FDECEA',
  success: '#2E7D32',
  successSurface: '#E8F5E9',
  codeBackground: '#263238',
  codeSurface: '#1E272C',
  sidebarBg: '#1A237E',
  sidebarActive: 'rgba(255,255,255,0.15)',
  sidebarText: 'rgba(255,255,255,0.7)',
  sidebarActiveText: '#FFFFFF',
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function modelDisplayName(modelId) {
  if (!modelId) return ''
  if (modelId === 'openrouter/free') return 'openrouter/free'
  const parts = modelId.split('/')
  return parts.length < 2 ? modelId : `${parts[0]}/${parts[1].split(':')[0]}`
}

function Icon({ name, size = 20, color, style = {} }) {
  return <span className="material-icons" style={{ fontSize: size, color: color || 'inherit', verticalAlign: 'middle', lineHeight: 1, ...style }}>{name}</span>
}

function Chip({ label, onClick, active }) {
  return (
    <button onClick={onClick} style={{ padding: '4px 12px', borderRadius: 16, border: `1px solid ${active ? M.primary : M.outline}`, background: active ? '#E3F2FD' : M.surface, color: active ? M.primary : M.onSurfaceVariant, fontSize: 12, cursor: 'pointer', fontFamily: 'Roboto, sans-serif', fontWeight: active ? 500 : 400, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  )
}

function MButton({ children, onClick, disabled, color = 'primary', variant = 'contained', fullWidth, size = 'medium', icon, style = {} }) {
  const base = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: 'none', borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'Roboto, sans-serif', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'all 0.2s', opacity: disabled ? 0.5 : 1, width: fullWidth ? '100%' : 'auto', ...style }
  const sz = size === 'small' ? { padding: '6px 14px', fontSize: 12 } : size === 'large' ? { padding: '12px 24px', fontSize: 15 } : { padding: '8px 20px', fontSize: 13 }
  const variants = {
    contained: { background: color === 'error' ? M.error : color === 'success' ? M.success : M.primary, color: M.onPrimary, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' },
    outlined: { background: 'transparent', color: M.primary, border: `1px solid ${M.primary}` },
    text: { background: 'transparent', color: M.primary, boxShadow: 'none' },
  }
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...sz, ...variants[variant] }}>{icon && <Icon name={icon} size={16} />}{children}</button>
}

function MTextField({ label, value, onChange, onKeyDown, placeholder, multiline, rows = 4, type = 'text', autoFocus, disabled }) {
  const [focused, setFocused] = useState(false)
  const style = { width: '100%', padding: multiline ? '12px 14px' : '10px 14px', borderRadius: '4px 4px 0 0', border: 'none', borderBottom: `${focused ? 2 : 1}px solid ${focused ? M.primary : M.outline}`, background: M.surfaceVariant, color: M.onSurface, fontFamily: 'Roboto, sans-serif', fontSize: 14, outline: 'none', resize: multiline ? 'vertical' : 'none', lineHeight: 1.6, boxSizing: 'border-box', transition: 'border-color 0.2s' }
  return (
    <div style={{ width: '100%' }}>
      {label && <div style={{ fontSize: 12, color: focused ? M.primary : M.onSurfaceVariant, marginBottom: 4, fontWeight: 500, fontFamily: 'Roboto, sans-serif', transition: 'color 0.2s' }}>{label}</div>}
      {multiline
        ? <textarea value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} rows={rows} style={style} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} disabled={disabled} />
        : <input type={type} value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder} style={style} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} autoFocus={autoFocus} disabled={disabled} />
      }
    </div>
  )
}

function MSelect({ label, value, onChange, options }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ width: '100%' }}>
      {label && <div style={{ fontSize: 12, color: focused ? M.primary : M.onSurfaceVariant, marginBottom: 4, fontWeight: 500, fontFamily: 'Roboto, sans-serif' }}>{label}</div>}
      <select value={value} onChange={onChange} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ width: '100%', padding: '10px 14px', borderRadius: '4px 4px 0 0', border: 'none', borderBottom: `${focused ? 2 : 1}px solid ${focused ? M.primary : M.outline}`, background: M.surfaceVariant, color: M.onSurface, fontFamily: 'Roboto, sans-serif', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  )
}

function Card({ children, style = {}, elevation = 1 }) {
  const shadows = ['none', '0 1px 3px rgba(0,0,0,0.12),0 1px 2px rgba(0,0,0,0.08)', '0 3px 6px rgba(0,0,0,0.12),0 3px 6px rgba(0,0,0,0.08)', '0 6px 12px rgba(0,0,0,0.12)']
  return <div style={{ background: M.surface, borderRadius: 4, boxShadow: shadows[elevation] || shadows[1], ...style }}>{children}</div>
}

function Divider() { return <div style={{ height: 1, background: M.outline, margin: '0' }} /> }

function CopyButton({ text, small }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }) }
  return (
    <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: small ? '3px 8px' : '4px 12px', borderRadius: 4, border: `1px solid ${copied ? M.success : M.outline}`, background: copied ? M.successSurface : M.surface, color: copied ? M.success : M.onSurfaceVariant, fontSize: 12, cursor: 'pointer', fontFamily: 'Roboto, sans-serif', fontWeight: 500, transition: 'all 0.2s' }}>
      <Icon name={copied ? 'check' : 'content_copy'} size={14} />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ background: M.codeBackground, borderRadius: 4, overflow: 'hidden', margin: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: M.codeSurface }}>
        <span style={{ fontSize: 11, color: '#90A4AE', fontFamily: 'JetBrains Mono, monospace' }}>{lang}</span>
        <button onClick={() => { navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
          style={{ fontSize: 11, background: 'none', border: 'none', color: copied ? '#81C784' : '#90A4AE', cursor: 'pointer', fontFamily: 'Roboto, sans-serif', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name={copied ? 'check' : 'content_copy'} size={13} />{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '12px 16px', fontSize: 12, lineHeight: 1.6, color: '#CFD8DC', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'JetBrains Mono, monospace' }}>{code}</pre>
    </div>
  )
}

function ModelBadge({ modelId, color }) {
  if (!modelId) return null
  return (
    <span style={{ fontSize: 11, background: color ? color + '18' : '#E3F2FD', color: color || M.primary, padding: '2px 8px', borderRadius: 12, fontFamily: 'JetBrains Mono, monospace', border: `1px solid ${color ? color + '40' : '#BBDEFB'}`, whiteSpace: 'nowrap' }}>
      ✓ {modelDisplayName(modelId)}
    </span>
  )
}

function renderMessage(text) {
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts.map((part, i) => {
    if (part.startsWith('```')) {
      const lines = part.slice(3, -3).split('\n')
      const lang = lines[0].trim() || 'code'
      return <CodeBlock key={i} code={lines.slice(1).join('\n')} lang={lang} />
    }
    const segs = part.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
    return <span key={i}>{segs.map((seg, j) => {
      if (seg.startsWith('**') && seg.endsWith('**')) return <strong key={j}>{seg.slice(2, -2)}</strong>
      if (seg.startsWith('`') && seg.endsWith('`')) return <code key={j} style={{ background: '#E8EAF6', color: M.secondary, padding: '1px 5px', borderRadius: 3, fontSize: '0.9em', fontFamily: 'JetBrains Mono, monospace' }}>{seg.slice(1, -1)}</code>
      return seg.split('\n').map((line, k, arr) => <span key={k}>{line}{k < arr.length - 1 ? <br /> : null}</span>)
    })}</span>
  })
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function tryModel(apiKey, modelId, messages) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': window.location.href, 'X-Title': 'Shan Agent' },
    body: JSON.stringify({ model: modelId, messages, max_tokens: 8000, temperature: 0.3 }),
  })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`) }
  const data = await res.json()
  const raw = data?.choices?.[0]?.message?.content || ''
  if (!raw) throw new Error('Empty response')
  return { raw: raw.trim(), actualModel: data?.model || modelId }
}

async function runWithRetry(apiKey, messages, setMsg) {
  let last = ''
  for (let i = 0; i < FREE_MODELS.length; i++) {
    const m = FREE_MODELS[i]
    setMsg(`Trying ${m === 'openrouter/free' ? 'Auto Router' : m.split('/')[1].split(':')[0]} (${i + 1}/${FREE_MODELS.length})...`)
    try { return await tryModel(apiKey, m, messages) } catch (e) { last = e.message }
  }
  throw new Error(`All models failed. Last: ${last}`)
}

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function App({ user, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeTab, setActiveTab] = useState('chat')
  const [apiKey, setApiKey] = useState(localStorage.getItem('openrouter_key') || '')
  const [keySet, setKeySet] = useState(!!localStorage.getItem('openrouter_key'))
  const [showKeyDialog, setShowKeyDialog] = useState(false)

  const [messages, setMessages] = useState([{ role: 'assistant', content: "Hello! I'm **Shan Agent**, Ready", model: '' }])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatMsg, setChatMsg] = useState('')
  const chatEndRef = useRef()

  const [jsxPrompt, setJsxPrompt] = useState('')
  const [pageType, setPageType] = useState('Full page')
  const [jsxStyle, setJsxStyle] = useState('Modern clean Tailwind CSS')
  const [filename, setFilename] = useState('MyPage.jsx')
  const [jsxCode, setJsxCode] = useState('')
  const [jsxModel, setJsxModel] = useState('')
  const [jsxLoading, setJsxLoading] = useState(false)
  const [jsxMsg, setJsxMsg] = useState('')
  const [jsxError, setJsxError] = useState('')

  const [sqlPrompt, setSqlPrompt] = useState('')
  const [dialect, setDialect] = useState('oracle')
  const [sqlCode, setSqlCode] = useState('')
  const [sqlModel, setSqlModel] = useState('')
  const [sqlLoading, setSqlLoading] = useState(false)
  const [sqlMsg, setSqlMsg] = useState('')
  const [sqlError, setSqlError] = useState('')

  const [csPrompt, setCsPrompt] = useState('')
  const [csType, setCsType] = useState('aspnet')
  const [csFilename, setCsFilename] = useState('MyService.cs')
  const [csCode, setCsCode] = useState('')
  const [csModel, setCsModel] = useState('')
  const [csLoading, setCsLoading] = useState(false)
  const [csMsg, setCsMsg] = useState('')
  const [csError, setCsError] = useState('')

  const [history, setHistory] = useState([])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, chatLoading])

  const saveKey = () => { if (!apiKey.trim()) return; localStorage.setItem('openrouter_key', apiKey.trim()); setKeySet(true); setShowKeyDialog(false) }
  const clearKey = () => { localStorage.removeItem('openrouter_key'); setApiKey(''); setKeySet(false) }

  const sendChat = async (text) => {
    const t = (text || chatInput).trim()
    if (!t || !apiKey) return
    setChatInput('')
    const newMsgs = [...messages, { role: 'user', content: t }]
    setMessages(newMsgs)
    setChatLoading(true)
    try {
      const { raw, actualModel } = await runWithRetry(apiKey, [
        { role: 'system', content: 'You are Shan Agent, an expert software developer. Help with coding, debugging, architecture. Use **bold**, `inline code`, and ```language\ncode``` blocks.' },
        ...newMsgs.map(m => ({ role: m.role, content: m.content }))
      ], setChatMsg)
      setMessages(p => [...p, { role: 'assistant', content: raw, model: actualModel }])
    } catch (e) {
      setMessages(p => [...p, { role: 'assistant', content: `⚠ Error: ${e.message}`, model: '' }])
    }
    setChatLoading(false); setChatMsg('')
  }

  const addHistory = (type, prompt, output, model, label) =>
    setHistory(h => [{ type, prompt, output, model, label, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...h].slice(0, 30))

  const generateJsx = async () => {
    if (!jsxPrompt.trim() || !apiKey) return
    setJsxLoading(true); setJsxError(''); setJsxCode(''); setJsxModel('')
    try {
      const { raw, actualModel } = await runWithRetry(apiKey, [
        { role: 'system', content: `Expert React developer. Generate production-ready .jsx. Style: ${jsxStyle}. Functional components, hooks, accessibility, default export. ONLY raw JSX, no fences.` },
        { role: 'user', content: `Create a ${pageType} React JSX: ${jsxPrompt}` }
      ], setJsxMsg)
      const c = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
      setJsxCode(c); setJsxModel(actualModel); addHistory('jsx', jsxPrompt, c, actualModel, filename)
    } catch (e) { setJsxError(e.message) }
    setJsxLoading(false)
  }

  const generateSql = async () => {
    if (!sqlPrompt.trim() || !apiKey) return
    setSqlLoading(true); setSqlError(''); setSqlCode(''); setSqlModel('')
    const d = SQL_DIALECTS.find(x => x.id === dialect)
    try {
      const { raw, actualModel } = await runWithRetry(apiKey, [
        { role: 'system', content: `Expert DB engineer for ${d.label}. ${dialect === 'oracle' ? 'Use ROWNUM,NVL,DECODE,TO_DATE,SYSDATE,DUAL.' : ''} ${dialect === 'oracle_plsql' ? 'Use DECLARE,BEGIN,END,cursors,exceptions.' : ''} ${dialect === 'bigquery' ? 'Backtick table names, ARRAY,STRUCT,UNNEST.' : ''} ${dialect === 'bigquery_scripting' ? 'DECLARE,SET,BEGIN/END,IF/ELSE,LOOP,CALL.' : ''} Add comments. ONLY SQL, no fences.` },
        { role: 'user', content: sqlPrompt }
      ], setSqlMsg)
      const c = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
      setSqlCode(c); setSqlModel(actualModel); addHistory('sql', sqlPrompt, c, actualModel, d.label)
    } catch (e) { setSqlError(e.message) }
    setSqlLoading(false)
  }

  const generateCs = async () => {
    if (!csPrompt.trim() || !apiKey) return
    setCsLoading(true); setCsError(''); setCsCode(''); setCsModel('')
    const t = CSHARP_TYPES.find(x => x.id === csType)
    try {
      const { raw, actualModel } = await runWithRetry(apiKey, [
        { role: 'system', content: `Expert C# .NET 8 developer for ${t.label}. Modern C#, async/await, nullable types. ${csType === 'aspnet' ? 'DI, middleware, status codes, validation.' : ''} ${csType === 'ef' ? 'DbContext, Fluent API, async queries.' : ''} ${csType === 'test' ? 'xUnit, Moq, FluentAssertions, AAA pattern.' : ''} XML docs. ONLY raw C#, no fences.` },
        { role: 'user', content: csPrompt }
      ], setCsMsg)
      const c = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
      setCsCode(c); setCsModel(actualModel); addHistory('cs', csPrompt, c, actualModel, csFilename)
    } catch (e) { setCsError(e.message) }
    setCsLoading(false)
  }

  const SW = sidebarOpen ? 240 : 60

  return (
    <div style={{ display: 'flex', height: '100vh', background: M.background, fontFamily: 'Roboto, sans-serif', overflow: 'hidden' }}>

      {/* ── SIDEBAR ── */}
      <aside style={{ width: SW, minWidth: SW, background: M.sidebarBg, display: 'flex', flexDirection: 'column', transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden', boxShadow: '2px 0 8px rgba(0,0,0,0.2)', zIndex: 10 }}>
        {/* Brand */}
        <div style={{ padding: '16px 12px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 64, flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontWeight: 700, fontSize: 16 }}>S</div>
          {sidebarOpen && <div><div style={{ color: '#fff', fontWeight: 500, fontSize: 16, whiteSpace: 'nowrap' }}>Shan Agent</div><div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, whiteSpace: 'nowrap' }}>AI Dev Assistant</div></div>}
        </div>

        <Divider />

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => {
            if (item.isDivider) return (
              <div key={item.id} style={{ margin: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                {sidebarOpen && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 0 2px' }}>{item.label || 'BOF Models'}</div>}
              </div>            )
            )
            const active = activeTab === item.id
            return (
              <button key={item.id} onClick={() => setActiveTab(item.id)} title={!sidebarOpen ? item.label : ''}
                
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', width: '100%', border: 'none', background: active ? M.sidebarActive : 'transparent', color: active ? M.sidebarActiveText : M.sidebarText, cursor: 'pointer', fontFamily: 'Roboto, sans-serif', fontSize: 14, fontWeight: active ? 500 : 400, textAlign: 'left', borderLeft: `3px solid ${active ? '#fff' : 'transparent'}`, transition: 'all 0.2s', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <Icon name={item.icon} size={22} color={active ? '#fff' : 'rgba(255,255,255,0.6)'} style={{ flexShrink: 0 }} />
                {sidebarOpen && <span style={{ flex: 1 }}>{item.label}</span>}
                {sidebarOpen && item.id === 'history' && history.length > 0 && (
                  <span style={{ background: '#E53935', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{history.length}</span>
                )}
              </button>
            )
          })}
        </nav>

        <Divider />
      {/* User + logout */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {user?.name?.[0] || 'U'}
          </div>
          {sidebarOpen && <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'capitalize' }}>{user?.role}</div>
          </div>}
          {sidebarOpen && <button onClick={onLogout} title="Sign out" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
            <span className="material-icons" style={{ fontSize: 18, color: 'rgba(255,255,255,0.4)' }}>logout</span>
          </button>}
        </div>
        
        {/* Key status */}
        <div style={{ padding: '12px', flexShrink: 0 }}>
          {keySet ? (
            <button onClick={clearKey} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.3)', borderRadius: 4, padding: '8px 10px', cursor: 'pointer', color: '#81C784' }} title="Click to change key">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#81C784', flexShrink: 0 }} />
              {sidebarOpen && <span style={{ fontSize: 12, fontFamily: 'Roboto, sans-serif', whiteSpace: 'nowrap' }}>Router connected</span>}
            </button>
          ) : (
            <button onClick={() => setShowKeyDialog(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'rgba(255,152,0,0.15)', border: '1px solid rgba(255,152,0,0.3)', borderRadius: 4, padding: '8px 10px', cursor: 'pointer', color: '#FFB74D' }}>
              <Icon name="key" size={16} color="#FFB74D" />
              {sidebarOpen && <span style={{ fontSize: 12, fontFamily: 'Roboto, sans-serif', whiteSpace: 'nowrap' }}>Add API Key</span>}
            </button>
          )}
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* App Bar */}
        <header style={{ background: M.primaryLight, color: M.onPrimary, padding: '0 16px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', flexShrink: 0, zIndex: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setSidebarOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: M.onPrimary, display: 'flex', padding: 8, borderRadius: '50%' }} aria-label="Toggle sidebar">
              <Icon name="menu" size={22} color={M.onPrimary} />
            </button>
            <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: '0.01em' }}>
              {NAV_ITEMS.find(n => n.id === activeTab)?.label}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {keySet
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#A5D6A7' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#A5D6A7' }} />Router connected</div>
              : <button onClick={() => setShowKeyDialog(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontFamily: 'Roboto, sans-serif', fontWeight: 500 }}><Icon name="key" size={16} color="#fff" />Add Key</button>
            }
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>S</div>
          </div>
        </header>

        {/* Key Dialog */}
        {showKeyDialog && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowKeyDialog(false)}>
            <Card elevation={3} style={{ width: 480, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
              <div style={{ background: M.primaryLight, padding: '16px 24px', color: M.onPrimary }}>
                <div style={{ fontSize: 18, fontWeight: 500 }}> API Key</div>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>Connect to access</div>
              </div>
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: '#E8F5E9', border: '1px solid #C8E6C9', borderRadius: 4, padding: '10px 14px', fontSize: 13, color: M.success, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="check_circle" size={16} color={M.success} />
                  Auto-retries {FREE_MODELS.length} free models — no billing needed
                </div>
                <div style={{ fontSize: 13, color: M.onSurfaceVariant }}>
                  Key is Stored only in your browser.
                </div>
                <MTextField label="API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveKey()} placeholder="sk-or-v1-..." type="password" autoFocus />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <MButton variant="text" onClick={() => setShowKeyDialog(false)}>Cancel</MButton>
                  <MButton onClick={saveKey} disabled={!apiKey.trim()} icon="save">Save Key</MButton>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>

          {/* ── CHAT ── */}
          {activeTab === 'chat' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
              <Card elevation={1} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {messages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
                      {msg.role === 'assistant' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: M.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>S</div>
                          <span style={{ fontSize: 12, color: M.onSurfaceVariant, fontWeight: 500 }}>Shan Agent</span>
                          {msg.model && <ModelBadge modelId={msg.model} />}
                        </div>
                      )}
                      <div style={msg.role === 'user'
                        ? { background: M.primaryLight, color: M.onPrimary, borderRadius: '18px 18px 4px 18px', padding: '10px 16px', maxWidth: '75%', fontSize: 14, lineHeight: 1.6, boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }
                        : { background: M.surfaceVariant, color: M.onSurface, borderRadius: '4px 18px 18px 18px', padding: '12px 16px', maxWidth: '85%', fontSize: 14, lineHeight: 1.7 }}>
                        {msg.role === 'user' ? msg.content : renderMessage(msg.content)}
                      </div>
                      {msg.role === 'assistant' && i > 0 && msg.content && (
                        <div style={{ marginTop: 6 }}><CopyButton text={msg.content} small /></div>
                      )}
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: M.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>S</div>
                        <span style={{ fontSize: 12, color: M.onSurfaceVariant }}>{chatMsg || 'Thinking...'}</span>
                      </div>
                      <div style={{ background: M.surfaceVariant, borderRadius: '4px 18px 18px 18px', padding: '14px 18px', display: 'flex', gap: 6 }}>
                        {[0, 0.2, 0.4].map((d, k) => <span key={k} style={{ width: 8, height: 8, borderRadius: '50%', background: M.primaryLight, display: 'inline-block', animation: `dotPulse 1.2s ${d}s ease-in-out infinite` }} />)}
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <Divider />
                <div style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                    placeholder={keySet ? 'Ask anything — code help, debugging, architecture... (Enter to send, Shift+Enter for new line)' : 'Start Chatting'}
                    disabled={!keySet}
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 4, border: `1px solid ${M.outline}`, background: M.surfaceVariant, color: M.onSurface, fontFamily: 'Roboto, sans-serif', fontSize: 14, resize: 'none', outline: 'none', lineHeight: 1.5, maxHeight: 120, overflowY: 'auto' }} rows={2} />
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setMessages([{ role: 'assistant', content: "Hello! I'm **Shan Agent**. Ask me anything!", model: '' }])} title="Clear chat"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, borderRadius: '50%', color: M.onSurfaceVariant, display: 'flex' }}>
                      <Icon name="delete_outline" size={20} color={M.onSurfaceVariant} />
                    </button>
                    <button onClick={() => sendChat()} disabled={!chatInput.trim() || chatLoading || !keySet}
                      style={{ width: 40, height: 40, borderRadius: '50%', background: chatInput.trim() && keySet ? M.primaryLight : M.outline, border: 'none', color: chatInput.trim() && keySet ? '#fff' : M.onSurfaceVariant, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: chatInput.trim() && keySet ? '0 2px 4px rgba(0,0,0,0.2)' : 'none', transition: 'all 0.2s' }}>
                      {chatLoading ? <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> : <Icon name="send" size={18} color={chatInput.trim() && keySet ? '#fff' : M.onSurfaceVariant} />}
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ── JSX ── */}
          {activeTab === 'jsx' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
              <Card elevation={1} style={{ padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: M.onSurface, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="tune" size={18} color={M.primary} /> Configuration
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                  <div style={{ flex: 1, minWidth: 140 }}><MSelect label="Page Type" value={pageType} onChange={e => setPageType(e.target.value)} options={PAGE_TYPES} /></div>
                  <div style={{ flex: 1, minWidth: 140 }}><MSelect label="Style" value={jsxStyle} onChange={e => setJsxStyle(e.target.value)} options={STYLES} /></div>
                  <div style={{ flex: 1, minWidth: 140 }}><MTextField label="File Name" value={filename} onChange={e => setFilename(e.target.value)} /></div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: M.onSurfaceVariant, fontWeight: 500, marginBottom: 8 }}>QUICK PROMPTS</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {JSX_PROMPTS.map(q => <Chip key={q.label} label={q.label} onClick={() => setJsxPrompt(q.prompt)} active={jsxPrompt === q.prompt} />)}
                  </div>
                </div>
              </Card>
              <Card elevation={1} style={{ padding: 20 }}>
                <MTextField label="Describe your page" value={jsxPrompt} onChange={e => setJsxPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && e.ctrlKey && generateJsx()} placeholder="e.g. Admin dashboard with sidebar, stats cards, revenue chart and orders table..." multiline rows={4} />
                <div style={{ fontSize: 11, color: M.onSurfaceVariant, marginTop: 6, marginBottom: 16 }}>Ctrl + Enter to generate</div>
                <MButton onClick={generateJsx} disabled={jsxLoading || !keySet} fullWidth size="large" icon={jsxLoading ? undefined : 'auto_awesome'}>
                  {jsxLoading ? <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />{jsxMsg}</span> : 'Generate JSX'}
                </MButton>
              </Card>
              {jsxError && <Card elevation={0} style={{ padding: '12px 16px', background: M.errorSurface, border: `1px solid #FFCDD2` }}><div style={{ color: M.error, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="error_outline" size={16} color={M.error} />{jsxError}</div></Card>}
              {jsxCode && !jsxLoading && (
                <Card elevation={2} style={{ overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: M.surfaceVariant, borderBottom: `1px solid ${M.outline}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name="description" size={16} color={M.primary} />
                      <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', color: M.onSurface }}>{filename}</span>
                      <ModelBadge modelId={jsxModel} />
                    </div>
                    <CopyButton text={jsxCode} />
                  </div>
                  <pre style={{ margin: 0, padding: 16, fontSize: 12, lineHeight: 1.65, color: '#CFD8DC', background: M.codeBackground, overflow: 'auto', maxHeight: 500, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'JetBrains Mono, monospace' }}>{jsxCode}</pre>
                </Card>
              )}
            </div>
          )}

          {/* ── SQL ── */}
          {activeTab === 'sql' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
              <Card elevation={1} style={{ padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: M.onSurface, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="storage" size={18} color={M.primary} /> Select Dialect
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 16 }}>
                  {SQL_DIALECTS.map(d => (
                    <button key={d.id} onClick={() => setDialect(d.id)}
                      style={{ padding: '14px 16px', borderRadius: 4, border: `2px solid ${dialect === d.id ? d.color : M.outline}`, background: dialect === d.id ? d.color + '12' : M.surface, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', boxShadow: dialect === d.id ? `0 2px 8px ${d.color}30` : 'none' }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: dialect === d.id ? d.color : M.onSurface, marginBottom: 4 }}>{d.label}</div>
                      <div style={{ fontSize: 12, color: M.onSurfaceVariant, lineHeight: 1.5 }}>{d.desc}</div>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: M.onSurfaceVariant, fontWeight: 500, marginBottom: 8 }}>QUICK PROMPTS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {SQL_PROMPTS.map(q => <Chip key={q.label} label={q.label} onClick={() => setSqlPrompt(q.prompt)} active={sqlPrompt === q.prompt} />)}
                </div>
              </Card>
              <Card elevation={1} style={{ padding: 20 }}>
                <MTextField label="Describe your query" value={sqlPrompt} onChange={e => setSqlPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && e.ctrlKey && generateSql()} placeholder={dialect.includes('oracle') ? 'e.g. Top 10 customers by orders in last 90 days with Oracle date functions...' : 'e.g. BigQuery sales analysis with ARRAY aggregation and date partitioning...'} multiline rows={4} />
                <div style={{ fontSize: 11, color: M.onSurfaceVariant, marginTop: 6, marginBottom: 16 }}>Ctrl + Enter to generate</div>
                <MButton onClick={generateSql} disabled={sqlLoading || !keySet} fullWidth size="large"
                  style={{ background: SQL_DIALECTS.find(d => d.id === dialect)?.color }}
                  icon={sqlLoading ? undefined : 'auto_awesome'}>
                  {sqlLoading ? <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />{sqlMsg}</span> : `Generate ${SQL_DIALECTS.find(d => d.id === dialect)?.label}`}
                </MButton>
              </Card>
              {sqlError && <Card elevation={0} style={{ padding: '12px 16px', background: M.errorSurface }}><div style={{ color: M.error, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="error_outline" size={16} color={M.error} />{sqlError}</div></Card>}
              {sqlCode && !sqlLoading && (
                <Card elevation={2} style={{ overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: M.surfaceVariant, borderBottom: `1px solid ${M.outline}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name="storage" size={16} color={SQL_DIALECTS.find(d => d.id === dialect)?.color} />
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{SQL_DIALECTS.find(d => d.id === dialect)?.label}</span>
                      <ModelBadge modelId={sqlModel} color={SQL_DIALECTS.find(d => d.id === dialect)?.color} />
                    </div>
                    <CopyButton text={sqlCode} />
                  </div>
                  <pre style={{ margin: 0, padding: 16, fontSize: 12, lineHeight: 1.65, color: '#A5D6A7', background: M.codeBackground, overflow: 'auto', maxHeight: 500, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'JetBrains Mono, monospace' }}>{sqlCode}</pre>
                </Card>
              )}
            </div>
          )}

          {/* ── C# ── */}
          {activeTab === 'cs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
              <Card elevation={1} style={{ padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: M.onSurface, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="terminal" size={18} color="#43A047" /> Project Type
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                  {CSHARP_TYPES.map(t => (
                    <button key={t.id} onClick={() => setCsType(t.id)}
                      style={{ padding: '12px 14px', borderRadius: 4, border: `2px solid ${csType === t.id ? '#43A047' : M.outline}`, background: csType === t.id ? '#E8F5E9' : M.surface, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}>
                      <div style={{ fontSize: 18, marginBottom: 4 }}>{t.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: csType === t.id ? '#2E7D32' : M.onSurface, marginBottom: 3 }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: M.onSurfaceVariant, lineHeight: 1.5 }}>{t.desc}</div>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: M.onSurfaceVariant, fontWeight: 500, marginBottom: 8 }}>QUICK PROMPTS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {CSHARP_PROMPTS.map(q => <Chip key={q.label} label={q.label} onClick={() => setCsPrompt(q.prompt)} active={csPrompt === q.prompt} />)}
                </div>
              </Card>
              <Card elevation={1} style={{ padding: 20 }}>
                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                  <div style={{ flex: 3 }}><MTextField label="Describe your C# code" value={csPrompt} onChange={e => setCsPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && e.ctrlKey && generateCs()} placeholder="e.g. ASP.NET Core Web API controller for products with CRUD, validation, pagination..." multiline rows={4} /></div>
                  <div style={{ flex: 1, minWidth: 150 }}><MTextField label="File Name" value={csFilename} onChange={e => setCsFilename(e.target.value)} placeholder="MyService.cs" /></div>
                </div>
                <div style={{ fontSize: 11, color: M.onSurfaceVariant, marginBottom: 16 }}>Ctrl + Enter to generate</div>
                <MButton onClick={generateCs} disabled={csLoading || !keySet} fullWidth size="large" style={{ background: '#43A047' }} icon={csLoading ? undefined : 'auto_awesome'}>
                  {csLoading ? <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />{csMsg}</span> : `Generate ${CSHARP_TYPES.find(t => t.id === csType)?.label}`}
                </MButton>
              </Card>
              {csError && <Card elevation={0} style={{ padding: '12px 16px', background: M.errorSurface }}><div style={{ color: M.error, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="error_outline" size={16} color={M.error} />{csError}</div></Card>}
              {csCode && !csLoading && (
                <Card elevation={2} style={{ overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: M.surfaceVariant, borderBottom: `1px solid ${M.outline}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name="terminal" size={16} color="#43A047" />
                      <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'JetBrains Mono, monospace' }}>{csFilename}</span>
                      <ModelBadge modelId={csModel} color="#43A047" />
                    </div>
                    <CopyButton text={csCode} />
                  </div>
                  <pre style={{ margin: 0, padding: 16, fontSize: 12, lineHeight: 1.65, color: '#BBDEFB', background: M.codeBackground, overflow: 'auto', maxHeight: 500, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'JetBrains Mono, monospace' }}>{csCode}</pre>
                </Card>
              )}
            </div>
          )}

          {/* BOF Static Charge Model */}
          {activeTab === 'bof_static' && (
            <div style={{ margin: -24 }}>
              <BOFStaticChargeModel />
            </div>
          )}

          {/* BOF Real Time TD Model */}
          {activeTab === 'bof_td' && (
            <div style={{ margin: -24 }}>
              <BOFRealTimeTDModel />
            </div>
          )}

          {/* Slab Casting Model */}
          {activeTab === 'slab_casting' && (
            <div style={{ margin: -24 }}>
              <SlabCastingModel />
            </div>
          )}

          {/* Billet Casting Model */}
          {activeTab === 'billet_casting' && (
            <div style={{ margin: -24 }}>
              <BilletCastingModel />
            </div>
          )}

          {/* ── HISTORY ── */}
          {activeTab === 'history' && (
            <div style={{ maxWidth: 860 }}>
              {history.length === 0
                ? <Card elevation={1} style={{ padding: 40, textAlign: 'center', color: M.onSurfaceVariant }}><Icon name="history" size={48} color={M.outline} /><div style={{ marginTop: 12, fontSize: 15 }}>No generations yet</div><div style={{ fontSize: 13, marginTop: 4 }}>Generate some code to see your history here</div></Card>
                : history.map((h, i) => (
                  <Card key={i} elevation={1} style={{ marginBottom: 12, overflow: 'hidden', cursor: 'pointer' }}
                    onClick={() => {
                      if (h.type === 'jsx') { setJsxPrompt(h.prompt); setJsxCode(h.output); setJsxModel(h.model); setActiveTab('jsx') }
                      else if (h.type === 'sql') { setSqlPrompt(h.prompt); setSqlCode(h.output); setSqlModel(h.model); setActiveTab('sql') }
                      else { setCsPrompt(h.prompt); setCsCode(h.output); setCsModel(h.model); setActiveTab('cs') }
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: M.surfaceVariant, borderBottom: `1px solid ${M.outline}` }}>
                      <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, fontWeight: 500, background: h.type === 'jsx' ? '#E8EAF6' : h.type === 'sql' ? '#E3F2FD' : '#E8F5E9', color: h.type === 'jsx' ? M.secondary : h.type === 'sql' ? M.primary : M.success }}>
                        {h.type === 'jsx' ? '⚛ JSX' : h.type === 'sql' ? '🗄 SQL' : '🟢 C#'}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', color: M.onSurface }}>{h.label}</span>
                      <ModelBadge modelId={h.model} />
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: M.onSurfaceVariant }}>{h.time}</span>
                    </div>
                    <div style={{ padding: '10px 16px', fontSize: 13, color: M.onSurfaceVariant, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.prompt}</div>
                  </Card>
                ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes dotPulse { 0%,80%,100%{opacity:.25;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        * { box-sizing: border-box; }
        body { margin: 0; }
        button { font-family: Roboto, sans-serif; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #BDBDBD; border-radius: 3px; }
        textarea::placeholder, input::placeholder { color: #BDBDBD; }
      `}</style>
    </div>
  )
}
