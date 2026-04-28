import { useState, useRef } from 'react'

const QUICK_PROMPTS = [
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

const PAGE_TYPES = ['Full page', 'Component', 'Dashboard', 'Form', 'Landing page', 'Modal', 'Data table', 'Card list']
const STYLES = ['Modern clean Tailwind CSS', 'Minimal with lots of whitespace', 'shadcn/ui components', 'Dark theme', 'Material design', 'Colorful and bold']
const MODELS = [
  { id: 'google/gemini-2.0-flash-exp:free', label: '🟢 Gemini 2.0 Flash (Free)' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: '🟢 Llama 3.3 70B (Free)' },
  { id: 'deepseek/deepseek-chat-v3-0324:free', label: '🟢 DeepSeek V3 (Free)' },
  { id: 'mistralai/mistral-7b-instruct:free', label: '🟢 Mistral 7B (Free)' },
  { id: 'google/gemini-2.5-pro-preview', label: '⭐ Gemini 2.5 Pro (Paid)' },
  { id: 'anthropic/claude-sonnet-4-5', label: '⭐ Claude Sonnet (Paid)' },
]

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }) }
  return <button onClick={copy} style={styles.copyBtn}>{copied ? '✓ Copied!' : 'Copy'}</button>
}

export default function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('openrouter_key') || '')
  const [keySet, setKeySet] = useState(!!localStorage.getItem('openrouter_key'))
  const [prompt, setPrompt] = useState('')
  const [pageType, setPageType] = useState('Full page')
  const [style, setStyle] = useState('Modern clean Tailwind CSS')
  const [model, setModel] = useState('google/gemini-2.0-flash-exp:free')
  const [filename, setFilename] = useState('MyPage.jsx')
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [tab, setTab] = useState('generate')
  const promptRef = useRef()

  const saveKey = () => {
    if (!apiKey.trim()) return
    localStorage.setItem('openrouter_key', apiKey.trim())
    setKeySet(true)
    setError('')
  }

  const clearKey = () => {
    localStorage.removeItem('openrouter_key')
    setApiKey('')
    setKeySet(false)
  }

  const generate = async () => {
    if (!prompt.trim()) { promptRef.current?.focus(); return }
    if (!apiKey) { setError('Please enter your OpenRouter API key first.'); return }
    setLoading(true)
    setError('')
    setCode('')

    const systemPrompt = `You are an expert React developer. Generate complete production-ready .jsx files.
Style: ${style}
Page type: ${pageType}
Rules:
- Use functional components with React hooks
- Include realistic placeholder/mock data
- Add accessibility attributes (aria-label, role, tabIndex)
- Default export the main component
- ONLY output raw JSX code. No markdown fences, no explanation. Start with import statements.`

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.href,
          'X-Title': 'React Frontend Agent',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Create a ${pageType} React JSX file: ${prompt}` },
          ],
          max_tokens: 8000,
          temperature: 0.7,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || `HTTP ${res.status}`)
      }
      const data = await res.json()
      const raw = data?.choices?.[0]?.message?.content || ''
      const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
      if (!cleaned) throw new Error('Empty response — try a different model')
      setCode(cleaned)
      setHistory(h => [{ prompt, filename, code: cleaned, model, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...h].slice(0, 20))
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const selectedModel = MODELS.find(m => m.id === model)

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>⚛</div>
            <div>
              <div style={styles.logoTitle}>React Frontend Agent</div>
              <div style={styles.logoSub}>Powered by OpenRouter · Free models available</div>
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
            <div style={styles.keySub}>
              OpenRouter is <strong style={{ color: '#4ade80' }}>free</strong> — no credit card needed for free models. Get your key at{' '}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={styles.link}>openrouter.ai/keys</a>.
              Stored only in your browser.
            </div>
            <div style={styles.steps}>
              <div style={styles.step}><span style={styles.stepNum}>1</span> Go to <a href="https://openrouter.ai" target="_blank" rel="noreferrer" style={styles.link}>openrouter.ai</a> → Sign up free</div>
              <div style={styles.step}><span style={styles.stepNum}>2</span> Click your profile → <strong>Keys</strong> → <strong>Create Key</strong></div>
              <div style={styles.step}><span style={styles.stepNum}>3</span> Paste below and click Save</div>
            </div>
            <div style={styles.keyRow}>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveKey()} placeholder="sk-or-v1-..." style={styles.keyInput} />
              <button onClick={saveKey} disabled={!apiKey.trim()} style={styles.saveKeyBtn}>Save Key</button>
            </div>
            <div style={styles.freeNote}>✅ Free models: Gemini 2.0 Flash, Llama 3.3 70B, DeepSeek V3, Mistral 7B — no billing required</div>
          </div>
        )}

        <div style={styles.tabs}>
          <button onClick={() => setTab('generate')} style={{ ...styles.tab, ...(tab === 'generate' ? styles.tabActive : {}) }}>⚡ Generate</button>
          <button onClick={() => setTab('history')} style={{ ...styles.tab, ...(tab === 'history' ? styles.tabActive : {}) }}>
            🕒 History {history.length > 0 && <span style={styles.badge}>{history.length}</span>}
          </button>
        </div>

        {tab === 'generate' && (
          <div style={styles.generatePane}>
            <div>
              <div style={styles.label}>AI Model</div>
              <div style={styles.modelGrid}>
                {MODELS.map(m => (
                  <button key={m.id} onClick={() => setModel(m.id)} style={{ ...styles.modelBtn, ...(model === m.id ? styles.modelBtnActive : {}) }}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.row}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Page type</label>
                <select value={pageType} onChange={e => setPageType(e.target.value)} style={styles.select}>
                  {PAGE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Style</label>
                <select value={style} onChange={e => setStyle(e.target.value)} style={styles.select}>
                  {STYLES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>File name</label>
                <input type="text" value={filename} onChange={e => setFilename(e.target.value)} style={styles.input} />
              </div>
            </div>

            <div>
              <div style={styles.label}>Quick prompts</div>
              <div style={styles.chips}>
                {QUICK_PROMPTS.map(q => <button key={q.label} onClick={() => setPrompt(q.prompt)} style={styles.chip}>{q.label}</button>)}
              </div>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Describe your page</label>
              <textarea ref={promptRef} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && e.ctrlKey && generate()} placeholder="e.g. A checkout page with cart summary, shipping form, payment details..." style={styles.textarea} rows={4} />
              <div style={styles.hint}>Ctrl + Enter to generate</div>
            </div>

            <button onClick={generate} disabled={loading || !keySet} style={styles.genBtn}>
              {loading ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}><span style={styles.spinner} /> Generating...</span> : 'Generate JSX ↗'}
            </button>

            {error && (
              <div style={styles.errorBox}>
                <strong>⚠ Error:</strong> {error}
                <div style={{ marginTop: 8, fontSize: 12, color: '#ffaa80' }}>
                  💡 Try a different free model, or check your key at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={styles.link}>openrouter.ai/keys</a>
                </div>
              </div>
            )}

            {loading && (
              <div style={styles.loadingBox}>
                <div style={styles.dots}>
                  <span style={{ ...styles.dot, animationDelay: '0s' }} />
                  <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
                  <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
                </div>
                Writing your JSX with {selectedModel?.label?.replace(/[🟢⭐] /, '')}...
              </div>
            )}

            {code && !loading && (
              <div style={styles.outputBox}>
                <div style={styles.outputHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={styles.fname}>{filename}</span>
                    <span style={styles.modelTag}>{model.split('/')[1]?.split(':')[0]}</span>
                  </div>
                  <CopyButton text={code} />
                </div>
                <pre style={styles.codeBlock}>{code}</pre>
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div>
            {history.length === 0 ? (
              <div style={styles.empty}>No generations yet — go generate something!</div>
            ) : history.map((h, i) => (
              <div key={i} style={styles.histItem} onClick={() => { setPrompt(h.prompt); setFilename(h.filename); setCode(h.code); setModel(h.model); setTab('generate') }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={styles.histFile}>{h.filename}</div>
                  <div style={styles.histPrompt}>{h.prompt.slice(0, 90)}{h.prompt.length > 90 ? '...' : ''}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, marginLeft: 12 }}>
                  <span style={styles.histTime}>{h.time}</span>
                  <span style={styles.modelTag}>{h.model?.split('/')[1]?.split(':')[0]}</span>
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
  logoIcon: { width: 36, height: 36, background: 'linear-gradient(135deg, #7c3aed, #2563eb)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 },
  logoTitle: { fontSize: 15, fontWeight: 700, color: '#fff' },
  logoSub: { fontSize: 11, color: '#555' },
  keyBadge: { fontSize: 12, color: '#888', background: '#1a2a1a', border: '1px solid #2a3a2a', padding: '4px 10px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6 },
  clearKeyBtn: { fontSize: 12, background: '#1e1e2e', border: '1px solid #2a2a3a', color: '#888', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'Inter, sans-serif' },
  main: { maxWidth: 920, margin: '0 auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20 },
  keyBox: { background: '#16161e', border: '1px solid #7c3aed', borderRadius: 12, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
  keyTitle: { fontSize: 15, fontWeight: 700, color: '#fff' },
  keySub: { fontSize: 13, color: '#888', lineHeight: 1.7 },
  steps: { display: 'flex', flexDirection: 'column', gap: 8 },
  step: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#aaa' },
  stepNum: { width: 22, height: 22, background: '#7c3aed', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 },
  freeNote: { fontSize: 12, color: '#4ade80', background: '#0a1a0a', border: '1px solid #1a3a1a', padding: '10px 14px', borderRadius: 8 },
  link: { color: '#818cf8', textDecoration: 'none' },
  keyRow: { display: 'flex', gap: 10 },
  keyInput: { flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid #2a2a3a', background: '#0f0f13', color: '#e8e8f0', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, outline: 'none' },
  saveKeyBtn: { background: 'linear-gradient(135deg, #7c3aed, #2563eb)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  tabs: { display: 'flex', borderBottom: '1px solid #2a2a3a' },
  tab: { background: 'none', border: 'none', borderBottom: '2px solid transparent', color: '#555', fontSize: 13, padding: '8px 18px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 6 },
  tabActive: { color: '#818cf8', borderBottomColor: '#818cf8' },
  badge: { background: '#2a2a3a', color: '#888', fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 600 },
  generatePane: { display: 'flex', flexDirection: 'column', gap: 18 },
  modelGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginTop: 6 },
  modelBtn: { padding: '8px 12px', borderRadius: 8, border: '1px solid #2a2a3a', background: '#16161e', color: '#888', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, textAlign: 'left' },
  modelBtnActive: { border: '1px solid #7c3aed', background: '#1a1030', color: '#c4b5fd' },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 140 },
  label: { fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 },
  select: { padding: '8px 12px', borderRadius: 8, border: '1px solid #2a2a3a', background: '#16161e', color: '#e8e8f0', fontFamily: 'Inter, sans-serif', fontSize: 13, height: 38, outline: 'none' },
  input: { padding: '8px 12px', borderRadius: 8, border: '1px solid #2a2a3a', background: '#16161e', color: '#e8e8f0', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, height: 38, outline: 'none' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid #2a2a3a', color: '#aaa', cursor: 'pointer', background: '#16161e', fontFamily: 'Inter, sans-serif' },
  textarea: { padding: '10px 14px', borderRadius: 8, border: '1px solid #2a2a3a', background: '#16161e', color: '#e8e8f0', fontFamily: 'Inter, sans-serif', fontSize: 13, resize: 'vertical', outline: 'none', lineHeight: 1.6, width: '100%' },
  hint: { fontSize: 10, color: '#444', marginTop: 2 },
  genBtn: { background: 'linear-gradient(135deg, #7c3aed, #2563eb)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' },
  spinner: { width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' },
  errorBox: { background: '#2d1a1a', border: '1px solid #5c2a2a', color: '#ff8080', padding: '14px 16px', borderRadius: 8, fontSize: 13, lineHeight: 1.6 },
  loadingBox: { display: 'flex', alignItems: 'center', gap: 12, color: '#555', fontSize: 13 },
  dots: { display: 'flex', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: '50%', background: '#7c3aed', display: 'inline-block', animation: 'dotPulse 1.2s ease-in-out infinite' },
  outputBox: { border: '1px solid #2a2a3a', borderRadius: 10, overflow: 'hidden' },
  outputHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#16161e', borderBottom: '1px solid #2a2a3a' },
  fname: { fontSize: 12, color: '#888', fontFamily: 'JetBrains Mono, monospace' },
  modelTag: { fontSize: 10, background: '#1a1030', color: '#a78bfa', padding: '2px 8px', borderRadius: 10 },
  copyBtn: { fontSize: 11, background: '#1e1e2e', border: '1px solid #2a2a3a', color: '#888', padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'Inter, sans-serif' },
  codeBlock: { background: '#0f0f13', padding: '16px', overflow: 'auto', maxHeight: 500, fontSize: 12, lineHeight: 1.65, color: '#c8d3f5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  empty: { textAlign: 'center', color: '#444', fontSize: 13, padding: '40px 0' },
  histItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#16161e', borderRadius: 8, cursor: 'pointer', marginBottom: 8, border: '1px solid #2a2a3a' },
  histFile: { fontSize: 13, color: '#818cf8', fontFamily: 'JetBrains Mono, monospace', marginBottom: 3 },
  histPrompt: { fontSize: 11, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  histTime: { fontSize: 11, color: '#444' },
}
