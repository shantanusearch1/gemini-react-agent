import { useState, useRef } from 'react'

// ─── GRADE LIBRARY ────────────────────────────────────────────────────────────
const GRADES = {
  'SAE 1006': { C:0.04, Mn:0.28, Si:0.020, S:0.010, P:0.010, Al:0.035, targetT:1558, SH:22 },
  'SAE 1018': { C:0.16, Mn:0.75, Si:0.080, S:0.012, P:0.012, Al:0.030, targetT:1568, SH:28 },
  'SAE 1045': { C:0.44, Mn:0.80, Si:0.150, S:0.010, P:0.012, Al:0.025, targetT:1575, SH:32 },
  'IS 2062 E250': { C:0.18, Mn:1.25, Si:0.300, S:0.010, P:0.015, Al:0.030, targetT:1570, SH:28 },
  'IS 2062 E350': { C:0.20, Mn:1.45, Si:0.350, S:0.008, P:0.012, Al:0.035, targetT:1572, SH:30 },
  'API 5L X52':   { C:0.10, Mn:1.40, Si:0.280, S:0.006, P:0.012, Al:0.035, targetT:1570, SH:28 },
  'API 5L X65':   { C:0.08, Mn:1.55, Si:0.300, S:0.004, P:0.010, Al:0.040, targetT:1572, SH:30 },
  'HSLA 80':      { C:0.08, Mn:1.50, Si:0.300, S:0.003, P:0.010, Al:0.040, targetT:1575, SH:30 },
  'Custom Grade': { C:0.12, Mn:0.90, Si:0.200, S:0.008, P:0.015, Al:0.030, targetT:1568, SH:28 },
}

const C = {
  bg:'#07090f', panel:'#0b1220', border:'#1a2d45',
  text:'#cdd9e5', muted:'#6e8098',
  accent:'#FF8F00', success:'#57ab5a', danger:'#e5534b',
  cyan:'#39c5cf', purple:'#9b5de5', yellow:'#FFD54F', blue:'#29B6F6',
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function Row({ label, value, unit, color = C.muted }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:`1px solid ${C.border}` }}>
      <span style={{ fontSize:10, color:C.muted }}>{label}</span>
      <span style={{ fontSize:11, fontWeight:700, color, fontFamily:'monospace' }}>{value}{unit}</span>
    </div>
  )
}

function Inp({ label, value, onChange, unit, min, max, step=0.001, color=C.muted }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
      <span style={{ fontSize:10, color:C.muted }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
        <input type="number" value={value} min={min} max={max} step={step}
          onChange={e=>onChange(+e.target.value)}
          style={{ width:72, padding:'3px 6px', borderRadius:4, border:`1px solid ${C.border}`,
            background:'#0d1520', color, fontSize:11, fontFamily:'monospace', fontWeight:700, textAlign:'right' }}/>
        <span style={{ fontSize:9, color:C.muted, width:28 }}>{unit}</span>
      </div>
    </div>
  )
}

function Sect({ title, color=C.accent, children }) {
  return (
    <div style={{ background:C.panel, border:`1px solid ${color}33`, borderRadius:8, padding:14, marginBottom:12 }}>
      <div style={{ fontSize:9, color, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>{title}</div>
      {children}
    </div>
  )
}

// ─── STREAMING MARKDOWN ───────────────────────────────────────────────────────
function MD({ text }) {
  if (!text) return null
  return (
    <div style={{ fontSize:12, lineHeight:1.75, color:C.text }}>
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <div key={i} style={{ fontSize:12, fontWeight:700, color:C.accent, marginTop:12, marginBottom:4, borderBottom:`1px solid ${C.border}`, paddingBottom:3 }}>{line.slice(4)}</div>
        if (line.startsWith('## '))  return <div key={i} style={{ fontSize:13, fontWeight:700, color:C.cyan,   marginTop:14, marginBottom:5 }}>{line.slice(3)}</div>
        if (line.startsWith('# '))   return <div key={i} style={{ fontSize:15, fontWeight:700, color:C.yellow, marginTop:16, marginBottom:6 }}>{line.slice(2)}</div>
        if (line.match(/^[-•]\s/)) {
          const txt = line.slice(2)
          const parts = txt.split(/\*\*([^*]+)\*\*/g)
          return <div key={i} style={{ display:'flex', gap:8, marginBottom:3, paddingLeft:8 }}>
            <span style={{ color:C.accent, flexShrink:0 }}>•</span>
            <span>{parts.map((p,pi)=>pi%2===1?<strong key={pi} style={{color:C.yellow}}>{p}</strong>:p)}</span>
          </div>
        }
        if (line.startsWith('| ')) {
          const cells = line.split('|').filter(c=>c.trim()).map(c=>c.trim())
          if (cells.every(c=>/^[-:]+$/.test(c))) return null
          return <div key={i} style={{ display:'flex', gap:2, marginBottom:2 }}>
            {cells.map((cell,ci)=><div key={ci} style={{ flex:1, background:'#0a1520', border:`1px solid ${C.border}`, borderRadius:3, padding:'3px 6px', fontSize:10, color:ci===0?C.muted:C.text, fontFamily:'monospace' }}>{cell.replace(/\*\*/g,'')}</div>)}
          </div>
        }
        if (!line.trim() || line.startsWith('---')) return <div key={i} style={{ height:6 }}/>
        const parts = line.split(/\*\*([^*]+)\*\*/g)
        return <div key={i} style={{ marginBottom:2 }}>{parts.map((p,pi)=>pi%2===1?<strong key={pi} style={{color:C.yellow}}>{p}</strong>:p)}</div>
      })}
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AILFModel() {
  // ── BOF tap data (can be typed or received from BOF model) ────────────────
  const [grade,    setGrade]    = useState('IS 2062 E250')
  const [heatWt,   setHeatWt]  = useState(130)
  const [bofTemp,  setBofTemp]  = useState(1622)
  const [bofC,     setBofC]    = useState(0.055)
  const [bofMn,    setBofMn]   = useState(0.12)
  const [bofSi,    setBofSi]   = useState(0.006)
  const [bofS,     setBofS]    = useState(0.028)
  const [bofP,     setBofP]    = useState(0.018)
  const [bofAl,    setBofAl]   = useState(0.002)
  // ── LF config ──────────────────────────────────────────────────────────────
  const [transMVA,    setTransMVA]    = useState(25)
  const [slagBasicity,setSlagBasicity]= useState(3.2)
  const [castRoute,   setCastRoute]   = useState('6-strand billet')
  // ── Target (auto-filled from grade) ───────────────────────────────────────
  const [tgtC,   setTgtC]   = useState(0.18)
  const [tgtMn,  setTgtMn]  = useState(1.25)
  const [tgtSi,  setTgtSi]  = useState(0.30)
  const [tgtS,   setTgtS]   = useState(0.010)
  const [tgtAl,  setTgtAl]  = useState(0.030)
  const [tgtTemp,setTgtTemp]= useState(1570)
  const [tgtSH,  setTgtSH]  = useState(28)
  // ── UI state ───────────────────────────────────────────────────────────────
  const [tab,       setTab]       = useState('input')
  const [loading,   setLoading]   = useState(false)
  const [stream,    setStream]    = useState('')
  const [error,     setError]     = useState('')
  const abortRef = useRef(null)

  const applyGrade = name => {
    setGrade(name)
    const g = GRADES[name]; if (!g) return
    setTgtC(g.C); setTgtMn(g.Mn); setTgtSi(g.Si)
    setTgtS(g.S); setTgtAl(g.Al); setTgtTemp(g.targetT); setTgtSH(g.SH)
  }

  // Gaps
  const dC   = (tgtC  - bofC).toFixed(3)
  const dMn  = (tgtMn - bofMn).toFixed(3)
  const dSi  = (tgtSi - bofSi).toFixed(3)
  const dS   = (bofS  - tgtS).toFixed(3)
  const dT   = tgtTemp - bofTemp
  const desulphRatio = (bofS / tgtS).toFixed(1)

  const prompt = `
You are a senior secondary steelmaking metallurgist with 30 years of Ladle Furnace (LF) experience.

A heat has been tapped from the BOF with the following data:

## BOF TAP DATA
- Grade: ${grade}
- Heat weight: ${heatWt} t
- BOF tap temperature: ${bofTemp}°C
- Chemistry at tap: C=${bofC}%, Mn=${bofMn}%, Si=${bofSi}%, S=${bofS}%, P=${bofP}%, Al=${bofAl}%

## LF TARGETS (for ${grade})
- C=${tgtC}%, Mn=${tgtMn}%, Si=${tgtSi}%, S=${tgtS}%, Al=${tgtAl}%
- LF out temperature: ${tgtTemp}°C, Superheat at tundish: ${tgtSH}°C
- Casting route: ${castRoute}

## LF EQUIPMENT
- Transformer: ${transMVA} MVA, 3-electrode graphite arc
- Slag basicity target B2: ${slagBasicity}

## CHEMISTRY GAPS TO FILL
- Δ[C]  = ${dC}% (${parseFloat(dC)>=0?'add carbon':'no addition needed'})
- Δ[Mn] = ${dMn}% (add FeMn)
- Δ[Si] = ${dSi}% (add FeSi)
- Δ[S]  = -${dS}% (desulphurisation ${desulphRatio}x needed)
- ΔTemp = ${dT}°C (${dT>0?'heat up by arc':'cool by scrap if needed'})

Now generate a complete, numbered LF treatment schedule covering:

### 1. HEAT ASSESSMENT
Analyse gaps. State what is critical (temperature, chemistry, desulph).

### 2. ARC HEATING SCHEDULE
Table with columns: Stage | Power kW | Voltage Step | Duration min | Energy kWh | Purpose
Show 3-4 arc stages. Base power on ${transMVA} MVA transformer (efficiency ~0.92).
Total heat input needed = ${heatWt} × 0.26 × ${Math.max(0,dT+20)} kWh (approx).

### 3. ARGON PURGING SCHEDULE
Table: Stage | Plug 1 l/min | Plug 2 l/min | Mode | Duration min | Purpose
Include: Hard purge (de-slag), Heating purge, Alloying purge, Desulph purge, Soft purge (before cast).

### 4. FERRO ALLOY ADDITIONS
For each alloy show: Alloy | Target Δ% | Weight (kg) | Recovery % | Addition timing
Alloys needed based on gaps above. Show calculation: kg = (Δ% × weight × 1000) / (recovery% × alloy grade%)
Include: FeMn (HC), FeSi 75%, Al ingot, any others needed for ${grade}.

### 5. WIRE INJECTION
Wire type | Length (m) | Feed rate m/min | Purpose
Include Ca wire or CaSi wire for desulphurisation and inclusion modification.
Ca wire meters = ${heatWt} × ${Math.max(0,(bofS-tgtS)/0.001*0.8).toFixed(0)} approx.

### 6. TEMPERATURE TRAJECTORY
Show temperature at each stage: Tap → After de-slag → After arc 1 → After alloy → After soft purge → LF out
Account for heat loss ~1.5-2°C/min when arc off, +heating rate kW-based when arc on.

### 7. DESULPHURISATION PLAN
Initial S=${bofS}%, Target S=${tgtS}%, Ratio=${desulphRatio}x.
Detail: slag composition for desulph, Ca wire quantity, expected final S%.

### 8. COMPLETE TREATMENT SEQUENCE (Timeline)
Numbered minute-by-minute steps from 0 to end, including who does what at each stage.

### 9. PREDICTED OUTPUTS
- Final [C]: _%, [Mn]: _%, [Si]: _%, [S]: _%, [Al]: _%
- LF out temperature: _°C
- Superheat at tundish: _°C  
- Total LF treatment time: _ minutes
- Total arc energy: _ kWh
- Readiness for casting: YES/NO with reason

Use precise metallurgical numbers. Be specific to the grade ${grade} and heat weight ${heatWt}t.
`

  const runAI = async () => {
    setLoading(true); setStream(''); setError(''); setTab('analysis')
    abortRef.current = new AbortController()
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: abortRef.current.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          stream: false,
          messages: [{ role:'user', content:prompt }],
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data?.error?.message || JSON.stringify(data)
        if (res.status === 429) throw new Error('Rate limit exceeded. Please wait a few minutes and try again.')
        throw new Error(`API ${res.status}: ${msg}`)
      }
      const text = data.content?.map(b=>b.text||'').join('') || ''
      setStream(text)
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally { setLoading(false) }
  }

  return (
    <div style={{ height:'100dvh', background:C.bg, color:C.text, fontFamily:'monospace', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* ── HEADER ── */}
      <div style={{ background:'#060a10', borderBottom:`1px solid ${C.border}`, padding:'0 14px', height:52, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:22 }}>🤖</span>
          <div>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.04em' }}>AI DYNAMIC LF MODEL</div>
            <div style={{ fontSize:8, color:C.muted }}>CLAUDE-POWERED · ARC · PURGE · ALLOY · WIRE · TEMP PREDICTION</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {[['input','⚙ Input'],['analysis','📊 AI Analysis']].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{ padding:'5px 14px', borderRadius:4, border:`1px solid ${tab===t?C.accent:C.border}`, background:tab===t?C.accent+'22':'transparent', color:tab===t?C.accent:C.muted, fontSize:10, fontWeight:700, cursor:'pointer' }}>
              {l}
            </button>
          ))}
          {loading
            ? <button onClick={()=>{abortRef.current?.abort();setLoading(false);setError('Cancelled.')}}
                style={{ padding:'6px 14px', borderRadius:4, border:`1px solid ${C.danger}`, background:'rgba(229,83,73,0.15)', color:C.danger, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                ⏹ STOP
              </button>
            : <button onClick={runAI}
                style={{ padding:'6px 16px', borderRadius:4, border:`2px solid ${C.success}`, background:'rgba(87,171,90,0.18)', color:C.success, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                🤖 GENERATE LF PLAN
              </button>
          }
        </div>
      </div>

      <div style={{ flex:1, overflow:'hidden', display:'flex' }}>
        {/* ── LEFT PANEL ── */}
        <div style={{ width:320, background:C.panel, borderRight:`1px solid ${C.border}`, overflow:'auto', flexShrink:0, padding:14 }}>

          {/* Grade */}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5 }}>Steel Grade</div>
            <select value={grade} onChange={e=>applyGrade(e.target.value)}
              style={{ width:'100%', padding:'7px 10px', borderRadius:5, border:`1px solid ${C.accent}66`, background:'#0d1520', color:C.accent, fontSize:11, fontWeight:700, fontFamily:'monospace' }}>
              {Object.keys(GRADES).map(g=><option key={g}>{g}</option>)}
            </select>
          </div>

          {/* BOF data notice */}
          <div style={{ background:'rgba(87,171,90,0.08)', border:`1px solid ${C.success}33`, borderRadius:6, padding:'8px 10px', marginBottom:12, fontSize:9, color:C.success }}>
            ℹ Enter BOF tap data below. When BOF tapping is complete the tap chemistry and temperature flow automatically into this model.
          </div>

          <Sect title="🔥 BOF Tap Data" color={C.accent}>
            <Inp label="Heat Weight"   value={heatWt}  onChange={setHeatWt}  unit="t"   min={50}   max={380} step={5}     color={C.accent}/>
            <Inp label="Tap Temp"      value={bofTemp} onChange={setBofTemp} unit="°C"  min={1550} max={1750} step={1}     color="#FF6D00"/>
          </Sect>

          <Sect title="⚗ BOF Tap Chemistry" color="#FF7043">
            <Inp label="Carbon [C]"    value={bofC}  onChange={setBofC}  unit="%" min={0.02} max={0.80} step={0.001} color={C.blue}/>
            <Inp label="Manganese[Mn]" value={bofMn} onChange={setBofMn} unit="%" min={0.05} max={1.80} step={0.01}  color={C.yellow}/>
            <Inp label="Silicon [Si]"  value={bofSi} onChange={setBofSi} unit="%" min={0}    max={0.50} step={0.001} color={C.accent}/>
            <Inp label="Sulphur [S]"   value={bofS}  onChange={setBofS}  unit="%" min={0.005} max={0.060} step={0.001} color={C.danger}/>
            <Inp label="Phosph. [P]"   value={bofP}  onChange={setBofP}  unit="%" min={0.005} max={0.040} step={0.001} color={C.purple}/>
            <Inp label="Alumin. [Al]"  value={bofAl} onChange={setBofAl} unit="%" min={0}    max={0.050} step={0.001} color="#90A4AE"/>
          </Sect>

          <Sect title="🎯 LF Targets (Auto from Grade)" color={C.success}>
            <Inp label="Target [C]"    value={tgtC}    onChange={setTgtC}    unit="%" min={0.02} max={0.80} step={0.001} color={C.blue}/>
            <Inp label="Target [Mn]"   value={tgtMn}   onChange={setTgtMn}   unit="%" min={0.10} max={2.50} step={0.01}  color={C.yellow}/>
            <Inp label="Target [Si]"   value={tgtSi}   onChange={setTgtSi}   unit="%" min={0.01} max={0.80} step={0.01}  color={C.accent}/>
            <Inp label="Target [S]"    value={tgtS}    onChange={setTgtS}    unit="%" min={0.001} max={0.030} step={0.001} color={C.danger}/>
            <Inp label="Target [Al]"   value={tgtAl}   onChange={setTgtAl}   unit="%" min={0.010} max={0.080} step={0.001} color="#90A4AE"/>
            <Inp label="LF Out Temp"   value={tgtTemp} onChange={setTgtTemp} unit="°C" min={1540} max={1720} step={1}   color={C.success}/>
            <Inp label="Superheat"     value={tgtSH}   onChange={setTgtSH}   unit="°C" min={10}   max={60}   step={1}   color={C.cyan}/>
          </Sect>

          <Sect title="⚙ LF Equipment" color={C.cyan}>
            <Inp label="Transformer"   value={transMVA}     onChange={setTransMVA}     unit="MVA" min={10} max={80} step={1}   color="#FF7043"/>
            <Inp label="Slag basicity" value={slagBasicity} onChange={setSlagBasicity} unit="B2"  min={1.5} max={6} step={0.1} color="#8BC34A"/>
            <div style={{ marginBottom:6 }}>
              <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>Casting Route</div>
              <select value={castRoute} onChange={e=>setCastRoute(e.target.value)}
                style={{ width:'100%', padding:'5px 8px', borderRadius:4, border:`1px solid ${C.border}`, background:'#0d1520', color:C.cyan, fontSize:10 }}>
                {['6-strand billet','4-strand billet','2-strand bloom','Slab caster','Round bloom'].map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
          </Sect>

          {/* Chemistry gap summary */}
          <Sect title="📊 Chemistry Gaps" color={C.purple}>
            <Row label="Δ[C]"       value={dC}              unit="%" color={Math.abs(parseFloat(dC))<0.01?C.success:C.accent}/>
            <Row label="Δ[Mn]"      value={dMn}             unit="%" color={parseFloat(dMn)>0?C.yellow:C.danger}/>
            <Row label="Δ[Si]"      value={dSi}             unit="%" color={parseFloat(dSi)>0?C.yellow:C.danger}/>
            <Row label="Δ[S] desulph" value={`-${dS}`}     unit="%" color={parseFloat(dS)>0.015?C.danger:C.success}/>
            <Row label="ΔTemp"      value={`${dT>0?'+':''}${dT}`} unit="°C" color={dT<-30?C.danger:dT>30?C.success:C.accent}/>
            <Row label="Desulph ratio" value={`${desulphRatio}x`} unit="" color={parseFloat(desulphRatio)>4?C.danger:C.accent}/>
          </Sect>

        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ flex:1, overflow:'auto', padding:20 }}>
          {tab === 'input' && !stream && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'80%', gap:20 }}>
              <div style={{ fontSize:56 }}>🤖</div>
              <div style={{ fontSize:16, fontWeight:700, color:C.text }}>AI-Powered LF Treatment Prediction</div>
              <div style={{ fontSize:11, color:C.muted, maxWidth:460, textAlign:'center', lineHeight:1.9 }}>
                Enter the BOF tap data and steel grade on the left, then click
                <strong style={{color:C.success}}> GENERATE LF PLAN</strong>.
                Claude will produce a complete treatment schedule including:
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, maxWidth:480 }}>
                {[
                  {ic:'⚡',label:'Arc Schedule',     desc:'kW steps, voltage, energy kWh'},
                  {ic:'💨',label:'Purge Plan',        desc:'Plug flows, hard/soft modes'},
                  {ic:'🧪',label:'Alloy Additions',   desc:'FeMn, FeSi, Al — kg with calc'},
                  {ic:'🔩',label:'Wire Injection',    desc:'CaSi / Ca wire meters'},
                  {ic:'🌡',label:'Temperature Path',  desc:'Step-by-step °C trajectory'},
                  {ic:'⚗',label:'Final Chemistry',   desc:'Predicted C, Mn, Si, S, Al out'},
                ].map(f=>(
                  <div key={f.label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:7, padding:12, display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:22 }}>{f.ic}</span>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:C.text }}>{f.label}</div>
                      <div style={{ fontSize:9, color:C.muted }}>{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={runAI}
                style={{ marginTop:8, padding:'12px 36px', borderRadius:8, border:`2px solid ${C.success}`, background:'rgba(87,171,90,0.15)', color:C.success, fontSize:14, fontWeight:700, cursor:'pointer', letterSpacing:'0.06em' }}>
                🤖 GENERATE LF TREATMENT PLAN
              </button>
            </div>
          )}

          {tab === 'analysis' || stream ? (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.cyan }}>📊 AI Treatment Plan — {grade}</div>
                {loading && (
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:C.success,
                      boxShadow:`0 0 6px ${C.success}`, animation:'none', opacity:0.5+0.5*Math.sin(Date.now()/300) }}/>
                    <span style={{ fontSize:10, color:C.success }}>CLAUDE IS ANALYSING...</span>
                  </div>
                )}
              </div>
              {error && (
                <div style={{ background:'rgba(229,83,73,0.10)', border:`1px solid ${C.danger}`, borderRadius:6, padding:'10px 14px', marginBottom:14, color:C.danger, fontSize:11 }}>
                  ❌ {error}
                  {error.includes('429') && (
                    <div style={{ marginTop:6, fontSize:10, color:C.muted }}>
                      Rate limit hit. Wait 30 seconds and try again. This is a temporary limit on API usage.
                    </div>
                  )}
                </div>
              )}
              {stream ? (
                <div style={{ background:'#0a1218', border:`1px solid ${C.border}`, borderRadius:8, padding:20 }}>
                  <MD text={stream}/>
                  {loading && <span style={{ color:C.success, fontSize:14 }}>▋</span>}
                </div>
              ) : !loading && tab==='analysis' && (
                <div style={{ color:C.muted, fontSize:12 }}>Click "GENERATE LF PLAN" to start.</div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
