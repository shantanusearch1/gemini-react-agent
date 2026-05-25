import { useState, useEffect } from 'react'

// ─── DEFAULT PARAMETERS ───────────────────────────────────────────────────────
const DEFAULT_PARAMS = {
  // Arc heating model
  arc: {
    label: 'Arc Heating Model',
    icon: '⚡',
    color: '#FF8F00',
    params: {
      powerFactor:      { label: 'Power Factor (PF)',         value: 0.92,  min: 0.80, max: 0.99, step: 0.01, unit: '',      desc: 'Electrical efficiency of arc — kW = MVA × 1000 × PF' },
      heatEfficiency:   { label: 'Arc Heat Efficiency',       value: 0.88,  min: 0.70, max: 0.98, step: 0.01, unit: '',      desc: 'Fraction of arc power transferred to steel bath' },
      steelSHC:         { label: 'Steel Specific Heat',       value: 0.190, min: 0.170,max: 0.220,step: 0.005,unit: 'kWh/t·°C', desc: 'Specific heat capacity of liquid steel' },
      ladleLoss:        { label: 'Ladle Heat Loss',           value: 1.80,  min: 0.80, max: 3.50, step: 0.05, unit: '°C/min', desc: 'Temperature loss rate when arc is off (ladle + radiation)' },
      arcOnLoss:        { label: 'Heat Loss During Arc',      value: 0.45,  min: 0.10, max: 1.00, step: 0.05, unit: '°C/min', desc: 'Residual heat loss even when arc is on' },
      safetyMargin:     { label: 'Temperature Safety Margin', value: 8,     min: 0,    max: 25,   step: 1,    unit: '°C',     desc: 'Extra temperature buffer above target' },
      transferLoss:     { label: 'Transfer Loss (BOF→LF)',    value: 12,    min: 5,    max: 25,   step: 1,    unit: '°C',     desc: 'Temperature drop from BOF tap to LF arrival' },
    }
  },
  // Desulphurisation model
  desulph: {
    label: 'Desulphurisation Model',
    icon: '⚗',
    color: '#9b5de5',
    params: {
      casiYield:        { label: 'CaSi Wire Ca Yield',        value: 0.26,  min: 0.15, max: 0.40, step: 0.01, unit: 'kg/m',   desc: 'Ca content per metre of CaSi wire (typical 260g/m)' },
      caRecovery:       { label: 'Ca Recovery in Steel',      value: 0.28,  min: 0.15, max: 0.45, step: 0.01, unit: '',       desc: 'Fraction of Ca that reacts in steel (rest vaporises)' },
      caPerDesulph:     { label: 'Ca needed per Δ[S]',        value: 14,    min: 8,    max: 22,   step: 0.5,  unit: 'm/t·0.001S', desc: 'Wire meters per tonne per 0.001% S reduction' },
      slagDesulphK:     { label: 'Slag Desulph Rate',         value: 0.000070, min: 0.00003, max: 0.00015, step: 0.000005, unit: '%S/min', desc: 'S removal per minute from slag (hard purge)' },
      arcDesulphK:      { label: 'Arc Desulph Rate',          value: 0.000022, min: 0.00001, max: 0.00005, step: 0.000001, unit: '%S/min', desc: 'S removal rate during arcing' },
      desulphThreshold: { label: 'Desulph Target Margin',     value: 0.0015, min: 0.0005, max: 0.003, step: 0.0001, unit: '%S', desc: 'Acceptable over-shoot above target S' },
      minSlagBasicity:  { label: 'Min Basicity for Desulph',  value: 3.0,   min: 2.0,  max: 5.0,  step: 0.1,  unit: 'CaO/SiO₂', desc: 'Minimum slag B2 needed for effective desulphurisation' },
    }
  },
  // Alloy recovery model
  alloys: {
    label: 'Alloy Recovery Model',
    icon: '🧪',
    color: '#FFD54F',
    params: {
      femnRecovery:     { label: 'FeMn (HC) Recovery',        value: 0.92,  min: 0.75, max: 0.99, step: 0.01, unit: '',       desc: 'Mn recovery from FeMn (HC) addition' },
      fesiRecovery:     { label: 'FeSi 75% Recovery',         value: 0.88,  min: 0.75, max: 0.98, step: 0.01, unit: '',       desc: 'Si recovery from FeSi addition' },
      alRecovery:       { label: 'Al Ingot Recovery',         value: 0.90,  min: 0.75, max: 0.98, step: 0.01, unit: '',       desc: 'Al recovery for deoxidation and alloying' },
      mnPickup:         { label: 'Mn Pickup Rate (arc)',       value: 0.0007, min: 0.0002, max: 0.002, step: 0.0001, unit: '%/min', desc: 'Mn dissolution rate when alloy is added' },
      siPickup:         { label: 'Si Pickup Rate (arc)',       value: 0.0003, min: 0.0001, max: 0.001, step: 0.0001, unit: '%/min', desc: 'Si dissolution rate when alloy is added' },
      alPickup:         { label: 'Al Passive Pickup',         value: 0.000012, min: 0.000005, max: 0.00003, step: 0.000001, unit: '%/frame', desc: 'Background Al increase from deox equilibrium' },
      alloyDissolvTime: { label: 'Alloy Dissolve Time',       value: 1.5,   min: 0.5,  max: 4.0,  step: 0.1,  unit: 'min',   desc: 'Minutes after addition before alloy is fully dissolved' },
    }
  },
  // Argon purging model
  purge: {
    label: 'Argon Purging Model',
    icon: '💨',
    color: '#29B6F6',
    params: {
      hardPurgeP1:      { label: 'Hard Purge Plug 1 Flow',    value: 320,   min: 100,  max: 500,  step: 10,   unit: 'l/min',  desc: 'Plug 1 argon flow for hard purge (de-slag)' },
      hardPurgeP2:      { label: 'Hard Purge Plug 2 Flow',    value: 280,   min: 100,  max: 500,  step: 10,   unit: 'l/min',  desc: 'Plug 2 argon flow for hard purge (de-slag)' },
      softPurgeFlow:    { label: 'Soft Purge Flow (pre-cast)',value: 35,    min: 10,   max: 80,   step: 5,    unit: 'l/min',  desc: 'Very soft purge flow before casting (both plugs)' },
      arcPurgeFlow:     { label: 'Arc Heating Purge Flow',    value: 80,    min: 20,   max: 200,  step: 10,   unit: 'l/min',  desc: 'Purge flow during arc heating (both plugs)' },
      desulphPurgeP1:   { label: 'Desulph Purge Plug 1',      value: 350,   min: 150,  max: 500,  step: 10,   unit: 'l/min',  desc: 'Max flow for desulphurisation purge (plug 1)' },
      desulphPurgeP2:   { label: 'Desulph Purge Plug 2',      value: 320,   min: 150,  max: 500,  step: 10,   unit: 'l/min',  desc: 'Max flow for desulphurisation purge (plug 2)' },
      softPurgeDuration:{ label: 'Soft Purge Duration',       value: 6,     min: 3,    max: 15,   step: 0.5,  unit: 'min',   desc: 'Duration of final soft purge before casting' },
    }
  },
  // Temperature model
  temperature: {
    label: 'Temperature Model',
    icon: '🌡',
    color: '#57ab5a',
    params: {
      arcHeatStage1Pct: { label: 'Arc Stage 1 Power %',       value: 100,   min: 80,   max: 100,  step: 1,    unit: '%',      desc: 'Full power for initial heat-up stage' },
      arcHeatStage2Pct: { label: 'Arc Stage 2 Power %',       value: 80,    min: 60,   max: 95,   step: 1,    unit: '%',      desc: 'Reduced power during alloying stage' },
      arcHeatStage3Pct: { label: 'Arc Stage 3 Power %',       value: 60,    min: 40,   max: 80,   step: 1,    unit: '%',      desc: 'Fine trim power (lowest arc stage)' },
      trimArcThreshold: { label: 'Trim Arc Trigger (ΔT)',      value: 6,     min: 2,    max: 20,   step: 1,    unit: '°C',     desc: 'Temperature deficit below target that triggers auto trim arc' },
      trimArcDuration:  { label: 'Auto Trim Arc Duration',     value: 3,     min: 1,    max: 8,    step: 0.5,  unit: 'min',   desc: 'Duration of automatic trim arc pass' },
      castTempBuffer:   { label: 'Casting Temp Buffer',        value: 2,     min: 0,    max: 10,   step: 0.5,  unit: '°C',     desc: 'Temperature within target that counts as "at target"' },
    }
  },
  // Simulation speed
  simulation: {
    label: 'Simulation Parameters',
    icon: '⚙',
    color: '#39c5cf',
    params: {
      simSpeedMultiplier:{ label: 'Simulation Speed (×real)',  value: 30,    min: 1,    max: 120,  step: 1,    unit: '×',      desc: 'How many times faster than real time (30 = 30 min heat in 1 min)' },
      physicsTickMs:    { label: 'Physics Tick Interval',      value: 33,    min: 16,   max: 100,  step: 1,    unit: 'ms',     desc: 'Physics update interval in ms (16=60fps, 33=30fps)' },
      bubbleSpawnRate:  { label: 'Bubble Spawn Rate',          value: 4,     min: 1,    max: 10,   step: 1,    unit: '/tick',  desc: 'Argon bubbles spawned per physics tick per plug' },
      sparkSpawnRate:   { label: 'Spark Spawn Rate',           value: 3,     min: 1,    max: 10,   step: 1,    unit: '/tick',  desc: 'Arc sparks spawned per physics tick' },
    }
  },
}

// ─── STORAGE KEY ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'shan_lf_model_params_v1'

function loadParams() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return DEFAULT_PARAMS
    const parsed = JSON.parse(saved)
    // Merge with defaults (in case new params added)
    const merged = JSON.parse(JSON.stringify(DEFAULT_PARAMS))
    Object.keys(parsed).forEach(cat => {
      if (merged[cat]) {
        Object.keys(parsed[cat].params || {}).forEach(key => {
          if (merged[cat].params[key]) merged[cat].params[key].value = parsed[cat].params[key].value
        })
      }
    })
    return merged
  } catch { return DEFAULT_PARAMS }
}

function saveParams(params) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)) } catch {}
}

// ─── EXPORT params as JS constants ───────────────────────────────────────────
function exportCode(params) {
  const lines = ['// LF Model Parameters — exported from Tuning Page', 'export const LF_PARAMS = {']
  Object.entries(params).forEach(([cat, section]) => {
    lines.push(`  // ${section.label}`)
    Object.entries(section.params).forEach(([key, p]) => {
      lines.push(`  ${key}: ${p.value},  // ${p.unit} — ${p.desc}`)
    })
  })
  lines.push('}')
  return lines.join('\n')
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const CV = {
  bg:'#07090f', panel:'#0b1220', border:'#1a2d45',
  text:'#cdd9e5', muted:'#6e8098',
  accent:'#FF8F00', success:'#57ab5a', danger:'#e5534b',
  cyan:'#39c5cf', purple:'#9b5de5',
}

function ParamRow({ paramKey, param, onChange, onReset, defaultVal, modified }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto auto',
      alignItems: 'center', gap: 8,
      padding: '8px 10px',
      background: modified ? 'rgba(255,143,0,0.06)' : '#0a1018',
      borderRadius: 5, marginBottom: 4,
      border: `1px solid ${modified ? CV.accent + '44' : CV.border}`,
    }}>
      <div>
        <div style={{ fontSize: 11, color: CV.text, fontWeight: modified ? 700 : 400 }}>
          {param.label}
          {modified && <span style={{ marginLeft: 6, fontSize: 9, color: CV.accent, fontWeight: 700 }}>MODIFIED</span>}
        </div>
        <div style={{ fontSize: 9, color: CV.muted, marginTop: 2 }}>{param.desc}</div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="range"
            min={param.min} max={param.max} step={param.step} value={param.value}
            onChange={e => onChange(+e.target.value)}
            style={{ width: 180, accentColor: modified ? CV.accent : CV.muted, height: 18 }}
          />
          <span style={{ fontSize: 9, color: CV.muted, fontFamily: 'monospace' }}>
            {param.min} — {param.max}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="number"
          value={param.value} min={param.min} max={param.max} step={param.step}
          onChange={e => onChange(+e.target.value)}
          style={{
            width: 90, padding: '4px 8px', borderRadius: 4,
            border: `1px solid ${modified ? CV.accent : CV.border}`,
            background: '#0d1520', color: modified ? CV.accent : CV.text,
            fontSize: 13, fontFamily: 'monospace', fontWeight: 700, textAlign: 'right'
          }}
        />
        <span style={{ fontSize: 10, color: CV.muted, minWidth: 60 }}>{param.unit}</span>
      </div>
      <button onClick={onReset} title="Reset to default"
        style={{
          padding: '4px 8px', borderRadius: 4,
          border: `1px solid ${modified ? CV.accent : CV.border}`,
          background: 'transparent', color: modified ? CV.accent : CV.muted,
          fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}>
        {modified ? '↺' : '✓'}
      </button>
    </div>
  )
}

function CategoryCard({ catKey, section, onUpdate, onResetAll, defaults }) {
  const [open, setOpen] = useState(true)
  const modifiedCount = Object.keys(section.params).filter(k =>
    Math.abs(section.params[k].value - defaults[catKey].params[k].value) > 1e-9
  ).length

  return (
    <div style={{
      background: CV.panel,
      border: `1px solid ${modifiedCount > 0 ? section.color + '44' : CV.border}`,
      borderRadius: 10, marginBottom: 16,
      boxShadow: modifiedCount > 0 ? `0 0 12px ${section.color}18` : 'none',
    }}>
      {/* Card header */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', cursor: 'pointer',
          borderBottom: open ? `1px solid ${CV.border}` : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>{section.icon}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: section.color }}>{section.label}</div>
            <div style={{ fontSize: 9, color: CV.muted }}>
              {Object.keys(section.params).length} parameters
              {modifiedCount > 0 && <span style={{ color: CV.accent, marginLeft: 8 }}>· {modifiedCount} modified</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {modifiedCount > 0 && (
            <button onClick={e => { e.stopPropagation(); onResetAll(catKey) }}
              style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${CV.accent}`, background: 'transparent', color: CV.accent, fontSize: 9, cursor: 'pointer' }}>
              Reset all
            </button>
          )}
          <span style={{ color: CV.muted, fontSize: 14 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {/* Params */}
      {open && (
        <div style={{ padding: '12px 16px' }}>
          {Object.entries(section.params).map(([key, param]) => {
            const defaultVal = defaults[catKey].params[key].value
            const modified = Math.abs(param.value - defaultVal) > 1e-9
            return (
              <ParamRow
                key={key} paramKey={key} param={param}
                modified={modified} defaultVal={defaultVal}
                onChange={val => onUpdate(catKey, key, val)}
                onReset={() => onUpdate(catKey, key, defaultVal)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── IMPACT PREVIEW ───────────────────────────────────────────────────────────
function ImpactPreview({ params }) {
  const arc = params.arc?.params
  const desulph = params.desulph?.params
  const purge = params.purge?.params
  const temp = params.temperature?.params

  // Example: 130t heat, 25 MVA, tap 1622°C, target 1570°C
  const heatWt = 130, mva = 25, tapT = 1622, tgtT = 1570
  const pwr = mva * 1000 * (arc?.powerFactor?.value || 0.92)
  const netRate = (pwr * (arc?.heatEfficiency?.value || 0.88)) / (heatWt * (arc?.steelSHC?.value || 0.190) * 1000 / 60) - (arc?.arcOnLoss?.value || 0.45)
  const tempDeficit = tgtT - tapT + (arc?.transferLoss?.value || 12) + (arc?.safetyMargin?.value || 8)
  const arcMinNeeded = Math.max(3, tempDeficit / netRate)
  const totalKWh = Math.round(pwr * arcMinNeeded / 60)

  const desulphRatio = 0.028 / 0.010  // example S reduction
  const wireMeters = Math.round(heatWt * (desulph?.caPerDesulph?.value || 14) * (0.028 - 0.010) / 0.001)

  return (
    <div style={{ background: CV.panel, border: `1px solid ${CV.cyan}44`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: CV.cyan, fontWeight: 700, marginBottom: 12 }}>
        📊 LIVE IMPACT PREVIEW — 130t Heat, 25 MVA, Tap 1622°C → Target 1570°C
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {[
          { l: 'Net Heat Rate', v: `${netRate.toFixed(2)} °C/min`, c: CV.accent },
          { l: 'Arc Time Needed', v: `${arcMinNeeded.toFixed(1)} min`, c: CV.accent },
          { l: 'Arc Energy', v: `${totalKWh} kWh`, c: '#9b5de5' },
          { l: 'CaSi Wire (Δ0.018%S)', v: `${wireMeters} m`, c: CV.purple },
          { l: 'Hard Purge P1+P2', v: `${(purge?.hardPurgeP1?.value||320) + (purge?.hardPurgeP2?.value||280)} l/min`, c: CV.blue },
          { l: 'Soft Purge Flow', v: `${purge?.softPurgeDuration?.value||6}min @ ${purge?.softPurgeFlow?.value||35}l/m`, c: CV.cyan },
          { l: 'Sim Speed', v: `${params.simulation?.params?.simSpeedMultiplier?.value||30}× real time`, c: CV.success },
          { l: 'Physics FPS', v: `${Math.round(1000/(params.simulation?.params?.physicsTickMs?.value||33))} fps`, c: CV.success },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ background: '#0a1018', border: `1px solid ${CV.border}`, borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, color: CV.muted, marginBottom: 3 }}>{l}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: c, fontFamily: 'monospace' }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function ModelTuningPage() {
  const [params, setParams] = useState(() => loadParams())
  const [saved, setSaved] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [activePreset, setActivePreset] = useState('default')

  const defaults = DEFAULT_PARAMS

  const totalModified = Object.values(params).reduce((acc, section) => {
    return acc + Object.keys(section.params).filter(k => {
      const sec = defaults[Object.keys(defaults).find(cat => defaults[cat].params[k])]
      if (!sec) return false
      return Math.abs(section.params[k].value - sec.params[k].value) > 1e-9
    }).length
  }, 0)

  const updateParam = (cat, key, val) => {
    setParams(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      next[cat].params[key].value = val
      return next
    })
    setSaved(false)
  }

  const resetCategory = (cat) => {
    setParams(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      Object.keys(next[cat].params).forEach(key => {
        next[cat].params[key].value = defaults[cat].params[key].value
      })
      return next
    })
    setSaved(false)
  }

  const resetAll = () => {
    setParams(JSON.parse(JSON.stringify(DEFAULT_PARAMS)))
    setSaved(false)
    setActivePreset('default')
  }

  const handleSave = () => {
    saveParams(params)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const applyPreset = (name) => {
    setActivePreset(name)
    const next = JSON.parse(JSON.stringify(DEFAULT_PARAMS))
    if (name === 'aggressive') {
      next.arc.params.powerFactor.value = 0.95
      next.arc.params.heatEfficiency.value = 0.92
      next.arc.params.ladleLoss.value = 1.50
      next.desulph.params.slagDesulphK.value = 0.000090
      next.purge.params.hardPurgeP1.value = 380
      next.purge.params.hardPurgeP2.value = 340
    } else if (name === 'conservative') {
      next.arc.params.powerFactor.value = 0.88
      next.arc.params.heatEfficiency.value = 0.82
      next.arc.params.ladleLoss.value = 2.20
      next.arc.params.safetyMargin.value = 15
      next.desulph.params.caRecovery.value = 0.22
      next.purge.params.softPurgeDuration.value = 10
    } else if (name === 'highS_grades') {
      next.desulph.params.slagDesulphK.value = 0.000100
      next.desulph.params.caPerDesulph.value = 10
      next.desulph.params.desulphThreshold.value = 0.001
      next.purge.params.desulphPurgeP1.value = 420
      next.purge.params.desulphPurgeP2.value = 380
    }
    setParams(next)
    setSaved(false)
  }

  // Filter params by search
  const filteredParams = searchTerm
    ? Object.fromEntries(
        Object.entries(params).map(([cat, section]) => [cat, {
          ...section,
          params: Object.fromEntries(
            Object.entries(section.params).filter(([k, p]) =>
              p.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
              p.desc.toLowerCase().includes(searchTerm.toLowerCase())
            )
          )
        }]).filter(([, s]) => Object.keys(s.params).length > 0)
      )
    : params

  return (
    <div style={{ minHeight: '100vh', background: CV.bg, color: CV.text, fontFamily: 'monospace', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#060a10', borderBottom: `1px solid ${CV.border}`, padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🔧</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>LF MODEL TUNING</div>
            <div style={{ fontSize: 9, color: CV.muted }}>CONFIGURE METALLURGICAL PARAMETERS · ARC · DESULPH · ALLOYS · PURGE · SIM</div>
          </div>
          {totalModified > 0 && (
            <div style={{ background: 'rgba(255,143,0,0.15)', border: `1px solid ${CV.accent}66`, borderRadius: 20, padding: '2px 10px', fontSize: 9, color: CV.accent, fontWeight: 700 }}>
              {totalModified} PARAMETER{totalModified !== 1 ? 'S' : ''} MODIFIED
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Presets */}
          {['default', 'aggressive', 'conservative', 'highS_grades'].map(p => (
            <button key={p} onClick={() => applyPreset(p)}
              style={{
                padding: '4px 10px', borderRadius: 4, fontSize: 9, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${activePreset === p ? CV.cyan : CV.border}`,
                background: activePreset === p ? 'rgba(57,197,207,0.15)' : 'transparent',
                color: activePreset === p ? CV.cyan : CV.muted,
              }}>
              {p === 'default' ? '⚙ Default' : p === 'aggressive' ? '🔥 Aggressive' : p === 'conservative' ? '🛡 Conservative' : '⚗ High-[S]'}
            </button>
          ))}
          <div style={{ width: 1, height: 20, background: CV.border }} />
          {/* Search */}
          <input
            placeholder="🔍 Search params..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${CV.border}`, background: '#0d1520', color: CV.text, fontSize: 10, width: 180 }}
          />
          <button onClick={() => setExportOpen(v => !v)}
            style={{ padding: '5px 12px', borderRadius: 4, border: `1px solid ${CV.border}`, background: 'transparent', color: CV.muted, fontSize: 10, cursor: 'pointer' }}>
            📋 Export
          </button>
          <button onClick={resetAll}
            style={{ padding: '5px 12px', borderRadius: 4, border: `1px solid ${CV.border}`, background: 'transparent', color: CV.muted, fontSize: 10, cursor: 'pointer' }}>
            ↺ Reset All
          </button>
          <button onClick={handleSave}
            style={{
              padding: '5px 16px', borderRadius: 4,
              border: `2px solid ${saved ? CV.success : CV.accent}`,
              background: saved ? 'rgba(87,171,90,0.18)' : 'rgba(255,143,0,0.18)',
              color: saved ? CV.success : CV.accent,
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>
            {saved ? '✅ SAVED' : '💾 SAVE'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {/* Export panel */}
        {exportOpen && (
          <div style={{ background: CV.panel, border: `1px solid ${CV.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: CV.cyan, fontWeight: 700 }}>📋 Export as JS Constants</div>
              <button onClick={() => { navigator.clipboard?.writeText(exportCode(params)); }}
                style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${CV.cyan}`, background: 'rgba(57,197,207,0.15)', color: CV.cyan, fontSize: 10, cursor: 'pointer' }}>
                Copy
              </button>
            </div>
            <pre style={{ fontSize: 10, color: CV.text, background: '#0a1018', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 300, lineHeight: 1.7 }}>
              {exportCode(params)}
            </pre>
          </div>
        )}

        {/* Impact preview */}
        <ImpactPreview params={params} />

        {/* Parameter cards */}
        {Object.entries(filteredParams).map(([catKey, section]) =>
          Object.keys(section.params).length > 0 && (
            <CategoryCard
              key={catKey} catKey={catKey} section={section}
              onUpdate={updateParam} onResetAll={resetCategory}
              defaults={defaults}
            />
          )
        )}

        {searchTerm && Object.keys(filteredParams).length === 0 && (
          <div style={{ textAlign: 'center', color: CV.muted, padding: 60, fontSize: 13 }}>
            No parameters match "{searchTerm}"
          </div>
        )}

        {/* Parameter count summary */}
        <div style={{ background: CV.panel, border: `1px solid ${CV.border}`, borderRadius: 8, padding: 14, marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 10, color: CV.muted }}>
              {Object.values(params).reduce((a, s) => a + Object.keys(s.params).length, 0)} total parameters across {Object.keys(params).length} categories
              {totalModified > 0 && ` · ${totalModified} modified`}
            </div>
            <div style={{ fontSize: 9, color: CV.muted }}>
              Parameters are saved to localStorage and applied to the LF simulation automatically
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
