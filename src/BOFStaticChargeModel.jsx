import { useState, useCallback } from 'react'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const FERRO_ALLOYS = [
  { id: 'fesi', name: 'FeSi (75%)', si: 75, mn: 0, cr: 0, density: 3.1, cost: 1200, unit: 'kg' },
  { id: 'femn', name: 'FeMn (75%)', si: 0, mn: 75, cr: 0, density: 7.0, cost: 900, unit: 'kg' },
  { id: 'fecr', name: 'FeCr (60%)', si: 0, mn: 0, cr: 60, density: 6.8, cost: 1400, unit: 'kg' },
  { id: 'simn', name: 'SiMn (65%)', si: 17, mn: 65, cr: 0, density: 6.1, cost: 950, unit: 'kg' },
  { id: 'febn', name: 'FeNb (65%)', si: 0, mn: 0, cr: 0, density: 7.2, cost: 18000, unit: 'kg' },
  { id: 'feti', name: 'FeTi (70%)', si: 0, mn: 0, cr: 0, density: 5.5, cost: 3200, unit: 'kg' },
  { id: 'femo', name: 'FeMo (60%)', si: 0, mn: 0, cr: 0, density: 9.4, cost: 22000, unit: 'kg' },
  { id: 'fev', name: 'FeV (80%)', si: 0, mn: 0, cr: 0, density: 6.0, cost: 28000, unit: 'kg' },
]

const SCRAP_GRADES = [
  { id: 'hms1', name: 'HMS-1', c: 0.15, si: 0.3, mn: 0.8, p: 0.04, s: 0.05, density: 1.2 },
  { id: 'hms2', name: 'HMS-2', c: 0.20, si: 0.4, mn: 0.9, p: 0.05, s: 0.06, density: 1.0 },
  { id: 'shred', name: 'Shredded', c: 0.10, si: 0.2, mn: 0.5, p: 0.03, s: 0.04, density: 1.4 },
  { id: 'pig', name: 'Pig Iron', c: 4.20, si: 0.8, mn: 0.3, p: 0.10, s: 0.04, density: 7.2 },
  { id: 'dri', name: 'DRI/HBI', c: 1.50, si: 0.5, mn: 0.2, p: 0.02, s: 0.02, density: 1.8 },
]

const M = {
  primary: '#1565C0', primaryLight: '#1976D2', primaryDark: '#0D47A1',
  secondary: '#E65100', surface: '#FFFFFF', background: '#F5F5F5',
  surfaceVariant: '#F3F4F6', outline: '#E0E0E0',
  onSurface: '#212121', onSurfaceVariant: '#757575',
  success: '#2E7D32', successSurface: '#E8F5E9',
  warning: '#F57F17', warningSurface: '#FFFDE7',
  error: '#B00020', errorSurface: '#FDECEA',
  steel: '#546E7A', steelLight: '#78909C', steelDark: '#37474F',
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function Icon({ name, size = 18, color, style = {} }) {
  return <span className="material-icons" style={{ fontSize: size, color: color || 'inherit', verticalAlign: 'middle', lineHeight: 1, ...style }}>{name}</span>
}

function Card({ children, style = {}, elevation = 1 }) {
  const shadows = ['none', '0 1px 3px rgba(0,0,0,0.12),0 1px 2px rgba(0,0,0,0.08)', '0 3px 6px rgba(0,0,0,0.12)', '0 6px 12px rgba(0,0,0,0.12)']
  return <div style={{ background: M.surface, borderRadius: 6, boxShadow: shadows[Math.min(elevation, 3)], ...style }}>{children}</div>
}

function Divider({ style = {} }) { return <div style={{ height: 1, background: M.outline, ...style }} /> }

function SectionHeader({ icon, title, subtitle, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: (color || M.primary) + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={color || M.primary} />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: M.onSurface }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: M.onSurfaceVariant }}>{subtitle}</div>}
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, unit, min, max, step = 0.1, type = 'number', readOnly }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: focused ? M.primary : M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.06em', transition: 'color 0.2s' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', background: readOnly ? M.surfaceVariant : M.surface, border: `1px solid ${focused ? M.primary : M.outline}`, borderRadius: 4, overflow: 'hidden', transition: 'border-color 0.2s' }}>
        <input type={type} value={value} onChange={onChange} min={min} max={max} step={step} readOnly={readOnly}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{ flex: 1, padding: '8px 10px', border: 'none', outline: 'none', fontSize: 14, fontFamily: 'Roboto Mono, monospace', color: M.onSurface, background: 'transparent', width: '100%' }} />
        {unit && <span style={{ padding: '0 10px', fontSize: 12, color: M.onSurfaceVariant, borderLeft: `1px solid ${M.outline}`, height: '100%', display: 'flex', alignItems: 'center', background: M.surfaceVariant, whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
    </div>
  )
}

function StatCard({ label, value, unit, icon, color, change }) {
  return (
    <Card elevation={1} style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 12, color: M.onSurfaceVariant, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: (color || M.primary) + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={18} color={color || M.primary} />
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 700, color: M.onSurface, fontFamily: 'Roboto Mono, monospace' }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: M.onSurfaceVariant, marginLeft: 4 }}>{unit}</span>}
      </div>
      {change !== undefined && (
        <div style={{ marginTop: 6, fontSize: 12, color: change >= 0 ? M.success : M.error, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Icon name={change >= 0 ? 'arrow_upward' : 'arrow_downward'} size={12} color={change >= 0 ? M.success : M.error} />
          {Math.abs(change).toFixed(1)}% from target
        </div>
      )}
    </Card>
  )
}

function Badge({ label, color, bg }) {
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: bg || color + '18', color: color, fontWeight: 500, border: `1px solid ${color}40` }}>{label}</span>
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function BOFStaticChargeModel() {
  // Hot Metal Inputs
  const [hmWeight, setHmWeight] = useState(280)
  const [hmC, setHmC] = useState(4.5)
  const [hmSi, setHmSi] = useState(0.55)
  const [hmMn, setHmMn] = useState(0.35)
  const [hmP, setHmP] = useState(0.12)
  const [hmS, setHmS] = useState(0.035)
  const [hmTemp, setHmTemp] = useState(1340)

  // Scrap Inputs
  const [scrapGrade, setScrapGrade] = useState('hms1')
  const [scrapWeight, setScrapWeight] = useState(45)

  // Target Steel
  const [targetC, setTargetC] = useState(0.06)
  const [targetMn, setTargetMn] = useState(0.25)
  const [targetSi, setTargetSi] = useState(0.02)
  const [targetTemp, setTargetTemp] = useState(1680)
  const [heatSize, setHeatSize] = useState(320)

  // Ferro Alloy Additions
  const [alloyAdditions, setAlloyAdditions] = useState([
    { alloyId: 'fesi', weight: 180 },
    { alloyId: 'femn', weight: 280 },
    { alloyId: 'simn', weight: 0 },
  ])

  const [activeTab, setActiveTab] = useState('charge')
  const [calculated, setCalculated] = useState(false)
  const [results, setResults] = useState(null)

  const selectedScrap = SCRAP_GRADES.find(s => s.id === scrapGrade)

  const updateAlloy = (idx, field, val) => {
    setAlloyAdditions(prev => prev.map((a, i) => i === idx ? { ...a, [field]: val } : a))
  }

  const addAlloy = () => {
    if (alloyAdditions.length < FERRO_ALLOYS.length) {
      const used = alloyAdditions.map(a => a.alloyId)
      const next = FERRO_ALLOYS.find(f => !used.includes(f.id))
      if (next) setAlloyAdditions(prev => [...prev, { alloyId: next.id, weight: 0 }])
    }
  }

  const removeAlloy = (idx) => setAlloyAdditions(prev => prev.filter((_, i) => i !== idx))

  const calculate = useCallback(() => {
    const scrap = selectedScrap
    const totalCharge = hmWeight + scrapWeight
    const scrapRatio = (scrapWeight / totalCharge) * 100

    // Mass balance - C, Si, Mn, P, S input
    const cIn = (hmWeight * hmC / 100) + (scrapWeight * scrap.c / 100)
    const siIn = (hmWeight * hmSi / 100) + (scrapWeight * scrap.si / 100)
    const mnIn = (hmWeight * hmMn / 100) + (scrapWeight * scrap.mn / 100)
    const pIn = (hmWeight * hmP / 100) + (scrapWeight * scrap.p / 100)
    const sIn = (hmWeight * hmS / 100) + (scrapWeight * scrap.s / 100)

    // Oxygen required for oxidation (simplified)
    const o2ForC = (cIn - (heatSize * targetC / 100)) * 1.333
    const o2ForSi = siIn * 1.143
    const o2ForMn = mnIn * 0.291
    const o2ForFe = heatSize * 0.005
    const totalO2 = o2ForC + o2ForSi + o2ForMn + o2ForFe

    // Lime requirement
    const sio2Formed = siIn * 2.14
    const p2o5Formed = pIn * 2.29
    const basicity = 3.5 // target basicity
    const limeRequired = (sio2Formed * basicity + p2o5Formed * 1.8) * 1.05

    // Dolomite
    const dolomiteRequired = limeRequired * 0.15

    // Slag weight
    const slagWeight = limeRequired + dolomiteRequired + sio2Formed + p2o5Formed + (mnIn * 1.29 * 0.3)

    // Ferro Alloy Analysis
    let siFromAlloy = 0, mnFromAlloy = 0
    const alloyResults = alloyAdditions.map(a => {
      const alloy = FERRO_ALLOYS.find(f => f.id === a.alloyId)
      if (!alloy) return { ...a, siContrib: 0, mnContrib: 0 }
      const siContrib = (a.weight * (alloy.si / 100)) * 0.85 // 85% recovery
      const mnContrib = (a.weight * (alloy.mn / 100)) * 0.90 // 90% recovery
      siFromAlloy += siContrib
      mnFromAlloy += mnContrib
      return { ...a, alloy, siContrib, mnContrib, cost: a.weight * alloy.cost / 1000 }
    })

    // Final chemistry estimate
    const finalSi = (siFromAlloy / heatSize) * 100
    const finalMn = (mnFromAlloy / heatSize) * 100
    const finalP = (pIn * 0.05 / heatSize) * 100 // 95% dephosphorization
    const finalS = (sIn * 0.70 / heatSize) * 100 // 30% desulfurization

    // Heat balance (simplified)
    const heatFromHM = hmWeight * 0.21 * (hmTemp - 25) // kJ approx
    const heatFromOxid = (cIn * 11500 + siIn * 31000 + mnIn * 7400) // kJ
    const totalHeat = heatFromHM + heatFromOxid
    const estimatedTemp = 1580 + (totalHeat - heatSize * 200 * 1655) / (heatSize * 850) * 100

    // Yield
    const steelYield = (heatSize / totalCharge) * 100
    const totalAlloyCost = alloyResults.reduce((s, a) => s + (a.cost || 0), 0)

    setResults({
      totalCharge, scrapRatio, cIn, siIn, mnIn, pIn, sIn,
      o2Required: totalO2, limeRequired, dolomiteRequired, slagWeight,
      finalSi, finalMn, finalC: targetC, finalP, finalS,
      estimatedTemp: Math.round(estimatedTemp),
      steelYield, alloyResults, totalAlloyCost,
      basicity, sio2Formed,
    })
    setCalculated(true)
  }, [hmWeight, hmC, hmSi, hmMn, hmP, hmS, hmTemp, scrapWeight, scrapGrade, targetC, targetMn, targetSi, targetTemp, heatSize, alloyAdditions, selectedScrap])

  const tabs = [
    { id: 'charge', label: 'Charge Mix', icon: 'science' },
    { id: 'target', label: 'Target Steel', icon: 'track_changes' },
    { id: 'alloy', label: 'Ferro Alloy', icon: 'add_circle' },
    { id: 'results', label: 'Results', icon: 'assessment' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: M.background, fontFamily: 'Roboto, sans-serif' }}>
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <header style={{ background: M.steelDark, color: '#fff', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="whatshot" size={24} color="#FF8F00" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.02em' }}>BOF Static Charge Calculation Model</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.05em' }}>WITH FERRO ALLOY ADDITION ANALYSIS</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Badge label={`Heat Size: ${heatSize}t`} color="#90CAF9" bg="rgba(144,202,249,0.15)" />
          <Badge label="Static Model" color="#A5D6A7" bg="rgba(165,214,167,0.15)" />
        </div>
      </header>

      {/* Summary Bar */}
      <div style={{ background: M.steelDark, borderTop: '1px solid rgba(255,255,255,0.08)', padding: '0 24px', display: 'flex', gap: 32, overflowX: 'auto' }}>
        {[
          { label: 'Hot Metal', val: `${hmWeight}t`, sub: `C:${hmC}% Si:${hmSi}%` },
          { label: 'Scrap', val: `${scrapWeight}t`, sub: selectedScrap?.name },
          { label: 'Total Charge', val: `${hmWeight + scrapWeight}t`, sub: 'HM + Scrap' },
          { label: 'Target Temp', val: `${targetTemp}°C`, sub: 'Tap temperature' },
          { label: 'Target [C]', val: `${targetC}%`, sub: 'End point carbon' },
          { label: 'Ferro Alloys', val: `${alloyAdditions.filter(a => a.weight > 0).length} types`, sub: 'Addition plan' },
        ].map((item, i) => (
          <div key={i} style={{ padding: '10px 0', minWidth: 100, flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', fontFamily: 'Roboto Mono, monospace' }}>{item.val}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Tab Bar */}
      <div style={{ background: M.surface, borderBottom: `1px solid ${M.outline}`, padding: '0 24px', display: 'flex', gap: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 20px', border: 'none', borderBottom: `3px solid ${activeTab === t.id ? M.primary : 'transparent'}`, background: 'none', color: activeTab === t.id ? M.primary : M.onSurfaceVariant, fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400, cursor: 'pointer', fontFamily: 'Roboto, sans-serif', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
            <Icon name={t.icon} size={16} color={activeTab === t.id ? M.primary : M.onSurfaceVariant} />
            {t.label}
            {t.id === 'results' && calculated && <span style={{ width: 8, height: 8, borderRadius: '50%', background: M.success, marginLeft: 4 }} />}
          </button>
        ))}
      </div>

      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

        {/* CHARGE MIX TAB */}
        {activeTab === 'charge' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Hot Metal */}
            <Card elevation={2} style={{ padding: 20 }}>
              <SectionHeader icon="opacity" title="Hot Metal Composition" subtitle="BF Hot Metal Analysis" color="#E65100" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <InputField label="Weight" value={hmWeight} onChange={e => setHmWeight(+e.target.value)} unit="tonnes" min={100} max={400} step={1} />
                <InputField label="Temperature" value={hmTemp} onChange={e => setHmTemp(+e.target.value)} unit="°C" min={1250} max={1450} step={1} />
                <InputField label="Carbon [C]" value={hmC} onChange={e => setHmC(+e.target.value)} unit="%" min={3.5} max={5.0} step={0.01} />
                <InputField label="Silicon [Si]" value={hmSi} onChange={e => setHmSi(+e.target.value)} unit="%" min={0.1} max={2.0} step={0.01} />
                <InputField label="Manganese [Mn]" value={hmMn} onChange={e => setHmMn(+e.target.value)} unit="%" min={0.1} max={1.5} step={0.01} />
                <InputField label="Phosphorus [P]" value={hmP} onChange={e => setHmP(+e.target.value)} unit="%" min={0.05} max={0.35} step={0.01} />
                <InputField label="Sulphur [S]" value={hmS} onChange={e => setHmS(+e.target.value)} unit="%" min={0.01} max={0.10} step={0.001} />
              </div>
              {/* Heat indicator */}
              <div style={{ marginTop: 16, padding: '10px 14px', background: hmTemp >= 1320 ? M.successSurface : M.warningSurface, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name={hmTemp >= 1320 ? 'check_circle' : 'warning'} size={16} color={hmTemp >= 1320 ? M.success : M.warning} />
                <span style={{ fontSize: 12, color: hmTemp >= 1320 ? M.success : M.warning, fontWeight: 500 }}>
                  {hmTemp >= 1320 ? 'HM Temperature: Optimal' : 'HM Temperature: Below optimal (min 1320°C)'}
                </span>
              </div>
            </Card>

            {/* Scrap */}
            <Card elevation={2} style={{ padding: 20 }}>
              <SectionHeader icon="recycling" title="Scrap Addition" subtitle="Coolant charge for heat balance" color="#1565C0" />
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Scrap Grade</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {SCRAP_GRADES.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 6, border: `1px solid ${scrapGrade === s.id ? M.primary : M.outline}`, background: scrapGrade === s.id ? '#E3F2FD' : M.surface, cursor: 'pointer', transition: 'all 0.15s' }}>
                      <input type="radio" name="scrap" value={s.id} checked={scrapGrade === s.id} onChange={() => setScrapGrade(s.id)} style={{ accentColor: M.primary }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: scrapGrade === s.id ? M.primary : M.onSurface }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: M.onSurfaceVariant }}>C:{s.c}% Si:{s.si}% Mn:{s.mn}% P:{s.p}% S:{s.s}%</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <InputField label="Scrap Weight" value={scrapWeight} onChange={e => setScrapWeight(+e.target.value)} unit="tonnes" min={10} max={120} step={1} />
              <div style={{ marginTop: 12, padding: '10px 14px', background: M.surfaceVariant, borderRadius: 6 }}>
                <div style={{ fontSize: 12, color: M.onSurfaceVariant, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Scrap ratio:</span>
                  <span style={{ fontWeight: 600, color: M.onSurface, fontFamily: 'Roboto Mono, monospace' }}>{((scrapWeight / (hmWeight + scrapWeight)) * 100).toFixed(1)}%</span>
                </div>
                <div style={{ fontSize: 12, color: M.onSurfaceVariant, display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span>Total charge:</span>
                  <span style={{ fontWeight: 600, color: M.onSurface, fontFamily: 'Roboto Mono, monospace' }}>{hmWeight + scrapWeight} t</span>
                </div>
              </div>
            </Card>

            {/* Flux / Additions */}
            <Card elevation={2} style={{ padding: 20, gridColumn: '1 / -1' }}>
              <SectionHeader icon="layers" title="Flux & Addition Requirements" subtitle="Calculated based on charge composition" color={M.steel} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                <InputField label="Heat Size (Target)" value={heatSize} onChange={e => setHeatSize(+e.target.value)} unit="tonnes" min={100} max={400} step={1} />
                <div style={{ padding: '8px 12px', background: M.surfaceVariant, borderRadius: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: 11, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Est. Lime (CaO)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: M.onSurface }}>
                    {calculated ? results.limeRequired.toFixed(0) : '--'} <span style={{ fontSize: 12, fontWeight: 400 }}>kg</span>
                  </div>
                </div>
                <div style={{ padding: '8px 12px', background: M.surfaceVariant, borderRadius: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: 11, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Est. Dolomite</div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: M.onSurface }}>
                    {calculated ? results.dolomiteRequired.toFixed(0) : '--'} <span style={{ fontSize: 12, fontWeight: 400 }}>kg</span>
                  </div>
                </div>
                <div style={{ padding: '8px 12px', background: M.surfaceVariant, borderRadius: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: 11, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Est. Slag Weight</div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: M.onSurface }}>
                    {calculated ? (results.slagWeight / 1000).toFixed(2) : '--'} <span style={{ fontSize: 12, fontWeight: 400 }}>t</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* TARGET STEEL TAB */}
        {activeTab === 'target' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <Card elevation={2} style={{ padding: 20 }}>
              <SectionHeader icon="track_changes" title="Target Steel Chemistry" subtitle="Aim analysis at tap" color={M.primary} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <InputField label="Target [C]" value={targetC} onChange={e => setTargetC(+e.target.value)} unit="%" min={0.02} max={0.50} step={0.01} />
                <InputField label="Target [Si]" value={targetSi} onChange={e => setTargetSi(+e.target.value)} unit="%" min={0.01} max={0.50} step={0.01} />
                <InputField label="Target [Mn]" value={targetMn} onChange={e => setTargetMn(+e.target.value)} unit="%" min={0.10} max={1.50} step={0.01} />
                <InputField label="Target Temp" value={targetTemp} onChange={e => setTargetTemp(+e.target.value)} unit="°C" min={1600} max={1750} step={1} />
              </div>
              <div style={{ marginTop: 16, padding: 14, background: '#E3F2FD', borderRadius: 6, border: '1px solid #BBDEFB' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: M.primary, marginBottom: 8 }}>Grade Specification Window</div>
                {[
                  { el: '[C]', val: targetC, lo: targetC - 0.02, hi: targetC + 0.02 },
                  { el: '[Si]', val: targetSi, lo: targetSi - 0.01, hi: targetSi + 0.05 },
                  { el: '[Mn]', val: targetMn, lo: targetMn - 0.05, hi: targetMn + 0.05 },
                ].map(s => (
                  <div key={s.el} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontFamily: 'Roboto Mono, monospace', width: 32, color: M.primary }}>{s.el}</span>
                    <span style={{ fontSize: 12, color: M.onSurfaceVariant }}>{s.lo.toFixed(2)} –</span>
                    <div style={{ flex: 1, height: 6, background: '#BBDEFB', borderRadius: 3, position: 'relative' }}>
                      <div style={{ position: 'absolute', left: '50%', top: -2, width: 10, height: 10, borderRadius: '50%', background: M.primary, transform: 'translateX(-50%)' }} />
                    </div>
                    <span style={{ fontSize: 12, color: M.onSurfaceVariant }}>– {s.hi.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card elevation={2} style={{ padding: 20 }}>
              <SectionHeader icon="thermostat" title="Heat Balance Summary" subtitle="Thermal analysis" color={M.secondary} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Si-oxidation heat input', val: `${(hmWeight * hmSi / 100 * 31000 / 1000).toFixed(0)} MJ`, icon: 'local_fire_department', color: M.secondary },
                  { label: 'C-oxidation heat input', val: `${(hmWeight * hmC / 100 * 11500 / 1000).toFixed(0)} MJ`, icon: 'co2', color: M.primary },
                  { label: 'Scrap cooling effect', val: `−${(scrapWeight * 350).toFixed(0)} MJ`, icon: 'ac_unit', color: '#0288D1' },
                  { label: 'O2 lance requirement', val: `${((hmWeight * hmC / 100 - heatSize * targetC / 100) * 1.333 * 1.05).toFixed(0)} Nm³`, icon: 'air', color: M.steel },
                  { label: 'Blowing time (est.)', val: `${Math.round((hmWeight * hmC / 100 - heatSize * targetC / 100) * 1.333 / 50)} min`, icon: 'timer', color: M.steelLight },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: M.surfaceVariant, borderRadius: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon name={row.icon} size={16} color={row.color} />
                      <span style={{ fontSize: 13, color: M.onSurface }}>{row.label}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Roboto Mono, monospace', color: row.color }}>{row.val}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* FERRO ALLOY TAB */}
        {activeTab === 'alloy' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card elevation={2} style={{ padding: 20 }}>
              <SectionHeader icon="add_circle" title="Ferro Alloy Addition Plan" subtitle="Post-tap ladle addition for chemistry adjustment" color="#7B1FA2" />

              {/* Alloy table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: M.surfaceVariant }}>
                      {['Ferro Alloy', 'Grade', '%Si', '%Mn', 'Addition (kg)', 'Si Recovery (kg)', 'Mn Recovery (kg)', 'Cost (₹)', ''].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${M.outline}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alloyAdditions.map((a, idx) => {
                      const alloy = FERRO_ALLOYS.find(f => f.id === a.alloyId)
                      const siRec = alloy ? (a.weight * alloy.si / 100 * 0.85).toFixed(1) : 0
                      const mnRec = alloy ? (a.weight * alloy.mn / 100 * 0.90).toFixed(1) : 0
                      const cost = alloy ? (a.weight * alloy.cost / 1000).toFixed(0) : 0
                      return (
                        <tr key={idx} style={{ borderBottom: `1px solid ${M.outline}` }}>
                          <td style={{ padding: '10px 12px' }}>
                            <select value={a.alloyId} onChange={e => updateAlloy(idx, 'alloyId', e.target.value)}
                              style={{ padding: '6px 8px', borderRadius: 4, border: `1px solid ${M.outline}`, fontSize: 13, color: M.onSurface, background: M.surface, fontFamily: 'Roboto, sans-serif', cursor: 'pointer' }}>
                              {FERRO_ALLOYS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '10px 12px' }}><Badge label={alloy?.name || ''} color="#7B1FA2" /></td>
                          <td style={{ padding: '10px 12px', fontFamily: 'Roboto Mono, monospace', color: M.primary }}>{alloy?.si || 0}%</td>
                          <td style={{ padding: '10px 12px', fontFamily: 'Roboto Mono, monospace', color: M.secondary }}>{alloy?.mn || 0}%</td>
                          <td style={{ padding: '10px 12px' }}>
                            <input type="number" value={a.weight} onChange={e => updateAlloy(idx, 'weight', +e.target.value)} min={0} max={2000} step={10}
                              style={{ width: 90, padding: '6px 8px', borderRadius: 4, border: `1px solid ${M.outline}`, fontSize: 13, fontFamily: 'Roboto Mono, monospace', color: M.onSurface, outline: 'none' }} />
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'Roboto Mono, monospace', color: M.primary, fontWeight: 500 }}>{siRec}</td>
                          <td style={{ padding: '10px 12px', fontFamily: 'Roboto Mono, monospace', color: '#7B1FA2', fontWeight: 500 }}>{mnRec}</td>
                          <td style={{ padding: '10px 12px', fontFamily: 'Roboto Mono, monospace', color: M.success, fontWeight: 500 }}>₹{cost}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <button onClick={() => removeAlloy(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: M.error, padding: 4, borderRadius: 4 }}>
                              <Icon name="delete" size={16} color={M.error} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#F3E5F5' }}>
                      <td colSpan={5} style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#7B1FA2' }}>Total</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'Roboto Mono, monospace', fontWeight: 700, color: M.primary }}>
                        {alloyAdditions.reduce((s, a) => { const al = FERRO_ALLOYS.find(f => f.id === a.alloyId); return s + (al ? a.weight * al.si / 100 * 0.85 : 0) }, 0).toFixed(1)} kg
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'Roboto Mono, monospace', fontWeight: 700, color: '#7B1FA2' }}>
                        {alloyAdditions.reduce((s, a) => { const al = FERRO_ALLOYS.find(f => f.id === a.alloyId); return s + (al ? a.weight * al.mn / 100 * 0.90 : 0) }, 0).toFixed(1)} kg
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'Roboto Mono, monospace', fontWeight: 700, color: M.success }}>
                        ₹{alloyAdditions.reduce((s, a) => { const al = FERRO_ALLOYS.find(f => f.id === a.alloyId); return s + (al ? a.weight * al.cost / 1000 : 0) }, 0).toFixed(0)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                <button onClick={addAlloy} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 4, border: `1px dashed ${M.primary}`, background: '#E3F2FD', color: M.primary, cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'Roboto, sans-serif' }}>
                  <Icon name="add" size={16} color={M.primary} /> Add Ferro Alloy
                </button>
              </div>
            </Card>

            {/* Expected delta */}
            <Card elevation={2} style={{ padding: 20 }}>
              <SectionHeader icon="trending_up" title="Expected Chemistry Change" subtitle="Based on alloy additions and recovery factors" color={M.success} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                {[
                  { label: 'ΔSi from alloys', val: (alloyAdditions.reduce((s, a) => { const al = FERRO_ALLOYS.find(f => f.id === a.alloyId); return s + (al ? a.weight * al.si / 100 * 0.85 : 0) }, 0) / heatSize / 10).toFixed(4), unit: '%', color: M.primary },
                  { label: 'ΔMn from alloys', val: (alloyAdditions.reduce((s, a) => { const al = FERRO_ALLOYS.find(f => f.id === a.alloyId); return s + (al ? a.weight * al.mn / 100 * 0.90 : 0) }, 0) / heatSize / 10).toFixed(4), unit: '%', color: '#7B1FA2' },
                  { label: 'Total alloy weight', val: alloyAdditions.reduce((s, a) => s + a.weight, 0).toFixed(0), unit: 'kg', color: M.success },
                  { label: 'Estimated [Si] final', val: (targetSi + alloyAdditions.reduce((s, a) => { const al = FERRO_ALLOYS.find(f => f.id === a.alloyId); return s + (al ? a.weight * al.si / 100 * 0.85 : 0) }, 0) / heatSize / 10).toFixed(3), unit: '%', color: M.primary },
                  { label: 'Estimated [Mn] final', val: (targetMn + alloyAdditions.reduce((s, a) => { const al = FERRO_ALLOYS.find(f => f.id === a.alloyId); return s + (al ? a.weight * al.mn / 100 * 0.90 : 0) }, 0) / heatSize / 10).toFixed(3), unit: '%', color: '#7B1FA2' },
                  { label: 'Total alloy cost', val: `₹${alloyAdditions.reduce((s, a) => { const al = FERRO_ALLOYS.find(f => f.id === a.alloyId); return s + (al ? a.weight * al.cost / 1000 : 0) }, 0).toFixed(0)}`, unit: 'K', color: M.success },
                ].map((item, i) => (
                  <div key={i} style={{ padding: 14, background: item.color + '08', border: `1px solid ${item.color}30`, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{item.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: item.color }}>{item.val}<span style={{ fontSize: 13, fontWeight: 400, color: M.onSurfaceVariant }}> {item.unit}</span></div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* RESULTS TAB */}
        {activeTab === 'results' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {!calculated ? (
              <Card elevation={1} style={{ padding: 40, textAlign: 'center' }}>
                <Icon name="calculate" size={48} color={M.outline} />
                <div style={{ fontSize: 18, fontWeight: 500, color: M.onSurfaceVariant, marginTop: 16 }}>Run Calculation to See Results</div>
                <div style={{ fontSize: 13, color: M.onSurfaceVariant, marginTop: 8, marginBottom: 24 }}>Fill in charge mix and target parameters, then click Calculate</div>
                <button onClick={() => { calculate(); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 4, border: 'none', background: M.primary, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'Roboto, sans-serif', boxShadow: '0 2px 6px rgba(0,0,0,0.2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  <Icon name="calculate" size={18} color="#fff" /> Calculate Now
                </button>
              </Card>
            ) : (
              <>
                {/* KPI Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
                  <StatCard label="Steel Yield" value={results.steelYield.toFixed(1)} unit="%" icon="trending_up" color={M.success} />
                  <StatCard label="Lime Required" value={results.limeRequired.toFixed(0)} unit="kg" icon="layers" color={M.primary} />
                  <StatCard label="O₂ Required" value={results.o2Required.toFixed(0)} unit="Nm³" icon="air" color={M.secondary} />
                  <StatCard label="Slag Weight" value={(results.slagWeight / 1000).toFixed(2)} unit="t" icon="delete" color={M.steel} />
                </div>

                {/* Mass balance */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <Card elevation={2} style={{ padding: 20 }}>
                    <SectionHeader icon="balance" title="Mass Balance" subtitle="Input element distribution" color={M.primary} />
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: M.surfaceVariant }}>
                          {['Element', 'Total Input (kg)', 'To Steel (kg)', 'To Slag (kg)', 'To Gas (kg)'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: M.onSurfaceVariant, textTransform: 'uppercase', borderBottom: `1px solid ${M.outline}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { el: 'C', input: results.cIn, steel: heatSize * targetC / 100, slag: 0, gas: results.cIn - heatSize * targetC / 100 },
                          { el: 'Si', input: results.siIn, steel: heatSize * 0.005, slag: results.sio2Formed / 2.14, gas: 0 },
                          { el: 'Mn', input: results.mnIn, steel: heatSize * targetMn / 100 / 10, slag: results.mnIn * 0.3, gas: 0 },
                          { el: 'P', input: results.pIn, steel: results.pIn * 0.05, slag: results.pIn * 0.95, gas: 0 },
                          { el: 'S', input: results.sIn, steel: results.sIn * 0.7, slag: results.sIn * 0.3, gas: 0 },
                        ].map(row => (
                          <tr key={row.el} style={{ borderBottom: `1px solid ${M.outline}` }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, fontFamily: 'Roboto Mono, monospace', color: M.primary }}>[{row.el}]</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Roboto Mono, monospace' }}>{row.input.toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Roboto Mono, monospace', color: M.success }}>{row.steel.toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Roboto Mono, monospace', color: M.warning }}>{row.slag.toFixed(2)}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Roboto Mono, monospace', color: M.steel }}>{row.gas.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>

                  <Card elevation={2} style={{ padding: 20 }}>
                    <SectionHeader icon="biotech" title="Predicted Final Chemistry" subtitle="After ferro alloy addition" color={M.success} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        { el: '[C]', pred: results.finalC, target: targetC, unit: '%', ok: Math.abs(results.finalC - targetC) < 0.02 },
                        { el: '[Si]', pred: results.finalSi, target: targetSi, unit: '%', ok: results.finalSi >= targetSi && results.finalSi <= targetSi + 0.05 },
                        { el: '[Mn]', pred: results.finalMn, target: targetMn, unit: '%', ok: Math.abs(results.finalMn - targetMn) < 0.05 },
                        { el: '[P]', pred: results.finalP, target: 0.025, unit: '%', ok: results.finalP <= 0.025 },
                        { el: '[S]', pred: results.finalS, target: 0.030, unit: '%', ok: results.finalS <= 0.030 },
                      ].map(row => (
                        <div key={row.el} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: row.ok ? M.successSurface : M.errorSurface, borderRadius: 6, border: `1px solid ${row.ok ? '#C8E6C9' : '#FFCDD2'}` }}>
                          <span style={{ width: 36, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: row.ok ? M.success : M.error, fontSize: 14 }}>{row.el}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: row.ok ? M.success : M.error }}>{row.pred.toFixed(4)}<span style={{ fontSize: 12, fontWeight: 400, color: M.onSurfaceVariant }}> %</span></div>
                            <div style={{ fontSize: 11, color: M.onSurfaceVariant }}>Target: {row.target.toFixed(4)}%</div>
                          </div>
                          <Icon name={row.ok ? 'check_circle' : 'cancel'} size={20} color={row.ok ? M.success : M.error} />
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                {/* Alloy cost summary */}
                <Card elevation={2} style={{ padding: 20 }}>
                  <SectionHeader icon="paid" title="Ferro Alloy Cost Summary" subtitle="Addition cost analysis per heat" color={M.success} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
                    <div style={{ padding: 16, background: M.successSurface, border: `1px solid #C8E6C9`, borderRadius: 6 }}>
                      <div style={{ fontSize: 11, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Alloy Cost</div>
                      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: M.success, marginTop: 6 }}>₹{results.totalAlloyCost.toFixed(0)}K</div>
                    </div>
                    <div style={{ padding: 16, background: M.surfaceVariant, borderRadius: 6 }}>
                      <div style={{ fontSize: 11, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cost per Tonne Steel</div>
                      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: M.primary, marginTop: 6 }}>₹{(results.totalAlloyCost / heatSize * 1000).toFixed(0)}</div>
                    </div>
                    <div style={{ padding: 16, background: M.surfaceVariant, borderRadius: 6 }}>
                      <div style={{ fontSize: 11, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Alloy Weight</div>
                      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: M.steel, marginTop: 6 }}>{alloyAdditions.reduce((s, a) => s + a.weight, 0)} kg</div>
                    </div>
                    <div style={{ padding: 16, background: M.surfaceVariant, borderRadius: 6 }}>
                      <div style={{ fontSize: 11, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alloy/Heat Ratio</div>
                      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: M.secondary, marginTop: 6 }}>{(alloyAdditions.reduce((s, a) => s + a.weight, 0) / heatSize / 10).toFixed(2)} kg/t</div>
                    </div>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {/* Calculate Button */}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={() => { setCalculated(false); setResults(null) }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 4, border: `1px solid ${M.outline}`, background: M.surface, color: M.onSurfaceVariant, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'Roboto, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <Icon name="refresh" size={16} color={M.onSurfaceVariant} /> Reset
          </button>
          <button onClick={() => { calculate(); setActiveTab('results') }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 4, border: 'none', background: M.steelDark, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'Roboto, sans-serif', boxShadow: '0 2px 6px rgba(0,0,0,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <Icon name="calculate" size={18} color="#fff" /> Calculate & View Results
          </button>
        </div>
      </div>
    </div>
  )
}
