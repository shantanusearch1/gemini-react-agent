import { useState, useEffect, useRef, useCallback } from 'react'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const M = {
  primary: '#1565C0', primaryLight: '#1976D2', primaryDark: '#0D47A1',
  secondary: '#E65100', surface: '#FFFFFF', background: '#ECEFF1',
  surfaceVariant: '#F3F4F6', outline: '#E0E0E0',
  onSurface: '#212121', onSurfaceVariant: '#757575',
  success: '#2E7D32', successSurface: '#E8F5E9',
  warning: '#F57F17', warningSurface: '#FFFDE7',
  error: '#B00020', errorSurface: '#FDECEA',
  hot: '#BF360C', hotLight: '#FF7043', hotSurface: '#FBE9E7',
  steel: '#546E7A', steelLight: '#78909C', steelDark: '#263238',
  amber: '#FF8F00', amberLight: '#FFB300',
}

// Blow profile stages
const BLOW_STAGES = [
  { id: 'ignition', label: 'Ignition', pct: [0, 8], co2Color: '#E3F2FD', tempRate: 2.5, o2Rate: 0.6, desc: 'Initial slag formation, Si oxidation begins' },
  { id: 'slag_form', label: 'Slag Formation', pct: [8, 25], co2Color: '#BBDEFB', tempRate: 4.2, o2Rate: 0.85, desc: 'Lime dissolution, FeO peak, dephosphorization start' },
  { id: 'main_blow', label: 'Main Blow', pct: [25, 70], co2Color: '#90CAF9', tempRate: 5.8, o2Rate: 1.0, desc: 'Peak decarburization, CO evolution maximum' },
  { id: 'late_blow', label: 'Late Blow', pct: [70, 90], co2Color: '#64B5F6', tempRate: 3.1, o2Rate: 0.80, desc: 'C < 0.5%, temperature rise accelerates' },
  { id: 'end_blow', label: 'End Blow', pct: [90, 100], co2Color: '#42A5F5', tempRate: 1.8, o2Rate: 0.65, desc: 'Near endpoint, fine adjustment' },
]

function Icon({ name, size = 18, color, style = {} }) {
  return <span className="material-icons" style={{ fontSize: size, color: color || 'inherit', verticalAlign: 'middle', lineHeight: 1, ...style }}>{name}</span>
}

function Card({ children, style = {}, elevation = 1 }) {
  const shadows = ['none', '0 1px 3px rgba(0,0,0,0.12),0 1px 2px rgba(0,0,0,0.08)', '0 3px 6px rgba(0,0,0,0.12)', '0 6px 12px rgba(0,0,0,0.16)']
  return <div style={{ background: M.surface, borderRadius: 6, boxShadow: shadows[Math.min(elevation, 3)], ...style }}>{children}</div>
}

function Divider({ style = {} }) { return <div style={{ height: 1, background: M.outline, ...style }} /> }

function Badge({ label, color, bg }) {
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: bg || color + '18', color: color, fontWeight: 500, border: `1px solid ${color}40`, whiteSpace: 'nowrap' }}>{label}</span>
}

function GaugeBar({ value, max, min = 0, color, label, unit, warning, danger }) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
  const isWarning = warning && value >= warning
  const isDanger = danger && value >= danger
  const barColor = isDanger ? M.error : isWarning ? M.warning : color || M.primary
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: M.onSurfaceVariant, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: barColor }}>{typeof value === 'number' ? value.toFixed(1) : value}<span style={{ fontSize: 11, color: M.onSurfaceVariant }}> {unit}</span></span>
      </div>
      <div style={{ height: 8, background: M.surfaceVariant, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width 0.5s ease, background 0.3s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 10, color: M.onSurfaceVariant }}>{min}{unit}</span>
        <span style={{ fontSize: 10, color: M.onSurfaceVariant }}>{max}{unit}</span>
      </div>
    </div>
  )
}

function TempDisplay({ temp, target, label }) {
  const diff = temp - target
  const isOk = Math.abs(diff) <= 10
  const isHigh = diff > 10
  return (
    <div style={{ textAlign: 'center', padding: 16, background: isHigh ? M.hotSurface : isOk ? M.successSurface : M.warningSurface, borderRadius: 8, border: `2px solid ${isHigh ? M.hot : isOk ? M.success : M.warning}` }}>
      <div style={{ fontSize: 11, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'Roboto Mono, monospace', color: isHigh ? M.hot : isOk ? M.success : M.warning, letterSpacing: '-1px' }}>{Math.round(temp)}°</div>
      <div style={{ fontSize: 12, color: M.onSurfaceVariant, marginTop: 2 }}>Target: {target}°C</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: isHigh ? M.hot : isOk ? M.success : M.warning, marginTop: 4 }}>
        {isOk ? '✓ On target' : isHigh ? `▲ +${diff.toFixed(0)}°C high` : `▼ ${diff.toFixed(0)}°C low`}
      </div>
    </div>
  )
}

// Simple SVG chart for blow profile
function BlowProfileChart({ data, blowPct, width = '100%' }) {
  if (!data || data.length < 2) return null
  const h = 180
  const pad = { t: 10, r: 20, b: 30, l: 50 }
  const maxTemp = Math.max(...data.map(d => d.temp)) + 20
  const minTemp = Math.min(...data.map(d => d.temp)) - 20

  const xScale = (i) => pad.l + (i / (data.length - 1)) * (700 - pad.l - pad.r)
  const yScale = (v) => pad.t + h - pad.b - ((v - minTemp) / (maxTemp - minTemp)) * (h - pad.t - pad.b)

  const tempPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.temp)}`).join(' ')
  const cPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(minTemp + (d.c / 5) * (maxTemp - minTemp))}`).join(' ')

  const currentX = pad.l + (blowPct / 100) * (700 - pad.l - pad.r)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width="700" height={h} viewBox={`0 0 700 ${h}`} style={{ display: 'block' }}>
        {/* Stage backgrounds */}
        {BLOW_STAGES.map(stage => {
          const x1 = pad.l + (stage.pct[0] / 100) * (700 - pad.l - pad.r)
          const x2 = pad.l + (stage.pct[1] / 100) * (700 - pad.l - pad.r)
          return (
            <rect key={stage.id} x={x1} y={pad.t} width={x2 - x1} height={h - pad.t - pad.b}
              fill={stage.co2Color} opacity="0.3" />
          )
        })}
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(pct => {
          const x = pad.l + (pct / 100) * (700 - pad.l - pad.r)
          return <line key={pct} x1={x} y1={pad.t} x2={x} y2={h - pad.b} stroke={M.outline} strokeDasharray="4,4" />
        })}
        {/* Temp curve */}
        <path d={tempPath} fill="none" stroke={M.hot} strokeWidth={2.5} />
        {/* C curve */}
        <path d={cPath} fill="none" stroke={M.primary} strokeWidth={1.5} strokeDasharray="6,3" />
        {/* Current position */}
        <line x1={currentX} y1={pad.t} x2={currentX} y2={h - pad.b} stroke={M.success} strokeWidth={2} />
        <circle cx={currentX} cy={yScale(data[Math.min(Math.floor(blowPct / 100 * (data.length - 1)), data.length - 1)]?.temp || minTemp)} r={5} fill={M.success} />
        {/* Y axis labels */}
        {[minTemp, (minTemp + maxTemp) / 2, maxTemp].map(v => (
          <text key={v} x={pad.l - 4} y={yScale(v) + 4} fontSize={10} fill={M.onSurfaceVariant} textAnchor="end">{Math.round(v)}°</text>
        ))}
        {/* X axis labels */}
        {[0, 25, 50, 75, 100].map(pct => (
          <text key={pct} x={pad.l + (pct / 100) * (700 - pad.l - pad.r)} y={h - 5} fontSize={10} fill={M.onSurfaceVariant} textAnchor="middle">{pct}%</text>
        ))}
        {/* Legend */}
        <line x1={560} y1={15} x2={580} y2={15} stroke={M.hot} strokeWidth={2.5} />
        <text x={584} y={19} fontSize={10} fill={M.hot}>Temperature</text>
        <line x1={560} y1={30} x2={580} y2={30} stroke={M.primary} strokeWidth={1.5} strokeDasharray="6,3" />
        <text x={584} y={34} fontSize={10} fill={M.primary}>[C]% trend</text>
      </svg>
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function BOFRealTimeTDModel() {
  // Initial charge params
  const [hmWeight, setHmWeight] = useState(280)
  const [hmTemp, setHmTemp] = useState(1345)
  const [hmC, setHmC] = useState(4.5)
  const [hmSi, setHmSi] = useState(0.55)
  const [scrapWeight, setScrapWeight] = useState(45)
  const [targetTemp, setTargetTemp] = useState(1680)
  const [targetC, setTargetC] = useState(0.06)
  const [heatNo, setHeatNo] = useState('BOF-2024-0847')

  // Real-time blow state
  const [isBlowing, setIsBlowing] = useState(false)
  const [blowPct, setBlowPct] = useState(0)
  const [blowTime, setBlowTime] = useState(0)
  const [totalBlowTime] = useState(18) // minutes

  // Live measurements
  const [currentTemp, setCurrentTemp] = useState(hmTemp - 80)
  const [currentC, setCurrentC] = useState(hmC)
  const [currentO2, setCurrentO2] = useState(0)
  const [o2Flow, setO2Flow] = useState(500)
  const [lanceHeight, setLanceHeight] = useState(2200)
  const [offGasCO, setOffGasCO] = useState(0)
  const [offGasCO2, setOffGasCO2] = useState(0)
  const [slagBasicity, setSlagBasicity] = useState(1.0)

  // Sub-lance measurement
  const [subLanceTemp, setSubLanceTemp] = useState(null)
  const [subLanceC, setSubLanceC] = useState(null)
  const [subLanceMeasured, setSubLanceMeasured] = useState(false)

  // Predictions
  const [predTemp, setPredTemp] = useState(null)
  const [predC, setPredC] = useState(null)
  const [blowHistory, setBlowHistory] = useState([])
  const [activeTab, setActiveTab] = useState('realtime')
  const [alerts, setAlerts] = useState([])

  const intervalRef = useRef(null)

  const getCurrentStage = useCallback(() => {
    return BLOW_STAGES.find(s => blowPct >= s.pct[0] && blowPct < s.pct[1]) || BLOW_STAGES[BLOW_STAGES.length - 1]
  }, [blowPct])

  // Simulation tick
  const tick = useCallback(() => {
    setBlowPct(prev => {
      const next = Math.min(prev + 100 / (totalBlowTime * 60 / 0.5), 100) // 0.5s tick
      const stage = BLOW_STAGES.find(s => next >= s.pct[0] && next < s.pct[1]) || BLOW_STAGES[BLOW_STAGES.length - 1]

      // Temperature model
      const baseTemp = hmTemp - 80 + (next / 100) * (targetTemp - hmTemp + 80)
      const noise = (Math.random() - 0.5) * 6
      const newTemp = baseTemp + noise

      // Carbon model - exponential decay
      const newC = hmC * Math.exp(-0.035 * next) + 0.02

      // Gas model
      const newCO = next < 70 ? (20 + next * 0.8 + (Math.random() - 0.5) * 5) : Math.max(5, 90 - next * 1.2)
      const newCO2 = Math.min(30, next * 0.25 + (Math.random() - 0.5) * 2)

      // O2 consumed
      const newO2 = (next / 100) * (hmWeight * hmC / 100 * 1.333 + hmWeight * hmSi / 100 * 1.143)

      // Slag basicity rises during blow
      const newBasicity = 1.0 + (next / 100) * 2.8

      setCurrentTemp(newTemp)
      setCurrentC(Math.max(0.02, newC))
      setCurrentO2(newO2)
      setOffGasCO(newCO)
      setOffGasCO2(newCO2)
      setSlagBasicity(newBasicity)
      setBlowTime(t => t + 0.5 / 60)

      // Predictions (TD model)
      const remainPct = 100 - next
      const predFinalTemp = newTemp + remainPct * stage.tempRate + (targetTemp - (newTemp + remainPct * stage.tempRate)) * 0.3
      const predFinalC = newC * Math.exp(-0.035 * remainPct * 0.8)
      setPredTemp(predFinalTemp)
      setPredC(Math.max(0.02, predFinalC))

      // History
      setBlowHistory(h => [...h, { pct: next, temp: newTemp, c: newC, o2: newO2, co: newCO, time: next * totalBlowTime / 100 }].slice(-200))

      // Alerts
      if (newTemp > targetTemp + 20 && next > 70) {
        setAlerts(a => [...a.slice(-4), { type: 'danger', msg: `High temp: ${Math.round(newTemp)}°C — consider N₂ injection`, time: new Date().toLocaleTimeString() }])
      }
      if (newCO < 15 && next > 30 && next < 70) {
        setAlerts(a => [...a.slice(-4), { type: 'warning', msg: 'CO% low — check slag condition / re-slag', time: new Date().toLocaleTimeString() }])
      }

      // Sub-lance auto-measure at 85%
      if (next >= 85 && !subLanceMeasured) {
        setSubLanceTemp(newTemp - 5)
        setSubLanceC(newC + 0.002)
        setSubLanceMeasured(true)
        setAlerts(a => [...a.slice(-4), { type: 'info', msg: `Sub-lance: T=${Math.round(newTemp - 5)}°C, [C]=${(newC + 0.002).toFixed(3)}%`, time: new Date().toLocaleTimeString() }])
      }

      if (next >= 100) {
        setIsBlowing(false)
        clearInterval(intervalRef.current)
      }
      return next
    })
  }, [hmTemp, targetTemp, hmC, hmSi, hmWeight, totalBlowTime, subLanceMeasured])

  const startBlow = () => {
    setIsBlowing(true)
    setBlowPct(0)
    setBlowTime(0)
    setBlowHistory([])
    setAlerts([])
    setSubLanceMeasured(false)
    setSubLanceTemp(null)
    setSubLanceC(null)
    setCurrentTemp(hmTemp - 80)
    setCurrentC(hmC)
  }

  const stopBlow = () => {
    setIsBlowing(false)
    clearInterval(intervalRef.current)
  }

  useEffect(() => {
    if (isBlowing) {
      intervalRef.current = setInterval(tick, 500)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [isBlowing, tick])

  const stage = getCurrentStage()
  const elapsedMin = blowTime.toFixed(1)
  const remainMin = (totalBlowTime - blowTime).toFixed(1)

  const tabs = [
    { id: 'realtime', label: 'Real-Time Monitor', icon: 'monitor_heart' },
    { id: 'profile', label: 'Blow Profile', icon: 'show_chart' },
    { id: 'prediction', label: 'TD Prediction', icon: 'psychology' },
    { id: 'setup', label: 'Heat Setup', icon: 'settings' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: M.background, fontFamily: 'Roboto, sans-serif' }}>
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <header style={{ background: M.steelDark, color: '#fff', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: isBlowing ? 'rgba(255,111,0,0.25)' : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.5s' }}>
            <Icon name="local_fire_department" size={24} color={isBlowing ? M.amberLight : '#90CAF9'} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.02em' }}>BOF Real-Time TD Temperature Prediction Model</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em' }}>WITH DYNAMIC BLOW PROFILE ANALYSIS</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Badge label={heatNo} color="#90CAF9" bg="rgba(144,202,249,0.12)" />
          <Badge label={isBlowing ? '● BLOWING' : blowPct >= 100 ? '✓ COMPLETE' : '○ READY'} color={isBlowing ? M.amberLight : blowPct >= 100 ? '#A5D6A7' : '#B0BEC5'} bg={isBlowing ? 'rgba(255,179,0,0.15)' : blowPct >= 100 ? 'rgba(165,214,167,0.15)' : 'rgba(176,190,197,0.1)'} />
          {isBlowing && <div style={{ fontSize: 12, color: '#FFB300', fontFamily: 'Roboto Mono, monospace', animation: 'blink 1s step-end infinite' }}>{elapsedMin}min</div>}
        </div>
      </header>

      {/* Blow Progress Bar */}
      <div style={{ background: M.steelDark, padding: '0 24px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            {BLOW_STAGES.map(s => (
              <div key={s.id} style={{ fontSize: 10, color: blowPct >= s.pct[0] ? (blowPct >= s.pct[0] && blowPct < s.pct[1] ? '#FFB300' : '#90CAF9') : 'rgba(255,255,255,0.3)', fontWeight: blowPct >= s.pct[0] && blowPct < s.pct[1] ? 700 : 400, transition: 'color 0.3s' }}>
                {s.label}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 14, fontFamily: 'Roboto Mono, monospace', color: '#FFB300', fontWeight: 700 }}>{blowPct.toFixed(1)}%</div>
        </div>
        {/* Segmented progress bar */}
        <div style={{ height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden', display: 'flex' }}>
          {BLOW_STAGES.map((s, i) => {
            const stageWidth = (s.pct[1] - s.pct[0])
            const stageFill = Math.max(0, Math.min(stageWidth, blowPct - s.pct[0]))
            const fillPct = (stageFill / stageWidth) * 100
            return (
              <div key={s.id} style={{ flex: stageWidth, borderRight: i < BLOW_STAGES.length - 1 ? '2px solid rgba(255,255,255,0.1)' : 'none', background: 'transparent', position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fillPct}%`, background: blowPct >= s.pct[0] && blowPct < s.pct[1] ? 'linear-gradient(90deg,#FFB300,#FF8F00)' : '#64B5F6', transition: 'width 0.5s', borderRadius: 0 }} />
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
          <span>0 min</span><span>{totalBlowTime / 2} min</span><span>{totalBlowTime} min</span>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ background: M.surface, borderBottom: `1px solid ${M.outline}`, padding: '0 24px', display: 'flex', gap: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 18px', border: 'none', borderBottom: `3px solid ${activeTab === t.id ? M.primary : 'transparent'}`, background: 'none', color: activeTab === t.id ? M.primary : M.onSurfaceVariant, fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400, cursor: 'pointer', fontFamily: 'Roboto, sans-serif', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
            <Icon name={t.icon} size={16} color={activeTab === t.id ? M.primary : M.onSurfaceVariant} />
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 0 16px' }}>
          {!isBlowing && blowPct < 100 && (
            <button onClick={startBlow} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 4, border: 'none', background: M.secondary, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Roboto, sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em', boxShadow: '0 2px 6px rgba(230,81,0,0.3)' }}>
              <Icon name="play_arrow" size={18} color="#fff" /> Start Blow
            </button>
          )}
          {isBlowing && (
            <button onClick={stopBlow} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 4, border: 'none', background: M.error, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Roboto, sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <Icon name="stop" size={18} color="#fff" /> Stop
            </button>
          )}
          {blowPct >= 100 && (
            <button onClick={() => { setBlowPct(0); setBlowTime(0); setBlowHistory([]); setAlerts([]); setSubLanceMeasured(false); setSubLanceTemp(null); setSubLanceC(null); setCurrentTemp(hmTemp - 80); setCurrentC(hmC) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 4, border: 'none', background: M.primary, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Roboto, sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <Icon name="refresh" size={18} color="#fff" /> New Heat
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: 20, maxWidth: 1300, margin: '0 auto' }}>

        {/* REAL-TIME MONITOR */}
        {activeTab === 'realtime' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Alert bar */}
            {alerts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {alerts.slice(-2).map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 6, background: a.type === 'danger' ? M.errorSurface : a.type === 'warning' ? M.warningSurface : '#E3F2FD', border: `1px solid ${a.type === 'danger' ? '#FFCDD2' : a.type === 'warning' ? '#FFF9C4' : '#BBDEFB'}` }}>
                    <Icon name={a.type === 'danger' ? 'error' : a.type === 'warning' ? 'warning' : 'info'} size={16} color={a.type === 'danger' ? M.error : a.type === 'warning' ? M.warning : M.primary} />
                    <span style={{ fontSize: 13, color: M.onSurface, flex: 1 }}>{a.msg}</span>
                    <span style={{ fontSize: 11, color: M.onSurfaceVariant }}>{a.time}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              {/* Temperature Display */}
              <Card elevation={2} style={{ padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="thermostat" size={16} color={M.hot} /> Temperature Tracking
                </div>
                <TempDisplay temp={currentTemp} target={targetTemp} label="Current Temperature" />
                {predTemp && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: M.surfaceVariant, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: M.onSurfaceVariant, marginBottom: 4 }}>PREDICTED FINAL TEMP</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: predTemp > targetTemp + 15 ? M.error : predTemp > targetTemp - 10 ? M.success : M.warning }}>
                      {Math.round(predTemp)}°C
                    </div>
                    <div style={{ fontSize: 12, color: M.onSurfaceVariant, marginTop: 2 }}>
                      {predTemp > targetTemp + 15 ? '▲ Overshoot risk — reduce O₂' : predTemp < targetTemp - 10 ? '▼ Undershoot — increase lance' : '✓ On trajectory'}
                    </div>
                  </div>
                )}
              </Card>

              {/* Carbon Tracking */}
              <Card elevation={2} style={{ padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="co2" size={16} color={M.primary} /> Carbon Tracking
                </div>
                <div style={{ textAlign: 'center', padding: 16, background: '#E3F2FD', borderRadius: 8, border: `2px solid ${M.primary}`, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current [C]%</div>
                  <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'Roboto Mono, monospace', color: M.primary }}>{currentC.toFixed(3)}%</div>
                  <div style={{ fontSize: 12, color: M.onSurfaceVariant }}>Target: {targetC}%</div>
                </div>
                {predC && (
                  <div style={{ padding: '10px 14px', background: M.surfaceVariant, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: M.onSurfaceVariant, marginBottom: 4 }}>PREDICTED FINAL [C]</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: predC > targetC + 0.02 ? M.error : predC < targetC ? M.warning : M.success }}>
                      {predC.toFixed(4)}%
                    </div>
                    <div style={{ fontSize: 12, color: M.onSurfaceVariant }}>
                      {predC > targetC + 0.02 ? '▲ High — continue blowing' : predC < targetC ? '▼ Risk of over-blowing' : '✓ OK'}
                    </div>
                  </div>
                )}
                {subLanceMeasured && (
                  <div style={{ marginTop: 10, padding: '8px 12px', background: M.successSurface, borderRadius: 6, border: `1px solid #C8E6C9` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: M.success }}>Sub-Lance @ 85%</div>
                    <div style={{ fontSize: 12, color: M.success, fontFamily: 'Roboto Mono, monospace' }}>T={Math.round(subLanceTemp)}°C | [C]={subLanceC?.toFixed(3)}%</div>
                  </div>
                )}
              </Card>

              {/* Process Variables */}
              <Card elevation={2} style={{ padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="air" size={16} color={M.steel} /> Process Variables
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <GaugeBar label="O₂ Flow Rate" value={isBlowing ? o2Flow : 0} max={650} unit=" Nm³/min" color={M.primary} warning={580} danger={620} />
                  <GaugeBar label="Lance Height" value={lanceHeight} min={1400} max={3000} unit=" mm" color={M.steel} />
                  <GaugeBar label="Off-gas CO%" value={offGasCO} max={100} unit="%" color={M.secondary} warning={75} danger={88} />
                  <GaugeBar label="Off-gas CO₂%" value={offGasCO2} max={40} unit="%" color={M.primary} />
                  <GaugeBar label="Slag Basicity (V)" value={slagBasicity} min={1} max={4} unit="" color={M.success} />
                  <GaugeBar label="O₂ Consumed" value={currentO2.toFixed(0)} max={hmWeight * hmC / 100 * 1.5} unit=" Nm³" color={M.amber} />
                </div>
              </Card>
            </div>

            {/* Stage info + timing */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
              <Card elevation={1} style={{ padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Blow Stage Status</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
                  {BLOW_STAGES.map(s => {
                    const done = blowPct > s.pct[1]
                    const active = blowPct >= s.pct[0] && blowPct < s.pct[1]
                    return (
                      <div key={s.id} style={{ padding: 12, borderRadius: 6, border: `2px solid ${active ? M.amber : done ? M.success : M.outline}`, background: active ? '#FFF8E1' : done ? M.successSurface : M.surface, transition: 'all 0.3s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Icon name={done ? 'check_circle' : active ? 'fiber_manual_record' : 'radio_button_unchecked'} size={14} color={done ? M.success : active ? M.amber : M.outline} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: active ? M.amber : done ? M.success : M.onSurfaceVariant }}>{s.label}</span>
                        </div>
                        <div style={{ fontSize: 10, color: M.onSurfaceVariant, lineHeight: 1.4 }}>{s.desc}</div>
                        <div style={{ fontSize: 10, color: M.onSurfaceVariant, marginTop: 4 }}>{s.pct[0]}-{s.pct[1]}%</div>
                      </div>
                    )
                  })}
                </div>
              </Card>

              <Card elevation={1} style={{ padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Timing</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Elapsed Time', val: `${elapsedMin} min`, icon: 'timer', color: M.primary },
                    { label: 'Remaining', val: `${remainMin} min`, icon: 'hourglass_empty', color: M.secondary },
                    { label: 'Total Blow Time', val: `${totalBlowTime} min`, icon: 'schedule', color: M.steel },
                    { label: 'Blow %', val: `${blowPct.toFixed(1)}%`, icon: 'percent', color: M.amber },
                    { label: 'Lance Drops', val: blowPct > 50 ? '3' : blowPct > 25 ? '2' : blowPct > 8 ? '1' : '0', icon: 'vertical_align_bottom', color: M.steelLight },
                  ].map((row, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: M.surfaceVariant, borderRadius: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon name={row.icon} size={15} color={row.color} />
                        <span style={{ fontSize: 12, color: M.onSurface }}>{row.label}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: row.color }}>{row.val}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* BLOW PROFILE TAB */}
        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card elevation={2} style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: M.onSurface, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="show_chart" size={18} color={M.primary} /> Temperature & Carbon Blow Profile
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Badge label={`Data points: ${blowHistory.length}`} color={M.primary} />
                  <Badge label={`Blow: ${blowPct.toFixed(1)}%`} color={M.amber} />
                </div>
              </div>
              {blowHistory.length > 1
                ? <BlowProfileChart data={blowHistory} blowPct={blowPct} />
                : <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', background: M.surfaceVariant, borderRadius: 8, color: M.onSurfaceVariant, fontSize: 14 }}>Start blow to see live profile</div>
              }
            </Card>

            {/* Blow parameters table */}
            <Card elevation={2} style={{ padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: M.onSurface, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="table_chart" size={18} color={M.steel} /> Lance & O₂ Blow Pattern
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: M.surfaceVariant }}>
                      {['Stage', 'Blow %', 'O₂ Flow (Nm³/min)', 'Lance Ht (mm)', 'Temp Rate (°C/%)', 'Key Action'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${M.outline}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {BLOW_STAGES.map((s, i) => {
                      const done = blowPct > s.pct[1]
                      const active = blowPct >= s.pct[0] && blowPct < s.pct[1]
                      return (
                        <tr key={s.id} style={{ borderBottom: `1px solid ${M.outline}`, background: active ? '#FFF8E1' : done ? M.successSurface : M.surface, transition: 'background 0.3s' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Icon name={done ? 'check_circle' : active ? 'fiber_manual_record' : 'circle'} size={14} color={done ? M.success : active ? M.amber : M.outline} />
                              <span style={{ fontWeight: active ? 600 : 400, color: active ? M.amber : M.onSurface }}>{s.label}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'Roboto Mono, monospace' }}>{s.pct[0]}–{s.pct[1]}%</td>
                          <td style={{ padding: '10px 12px', fontFamily: 'Roboto Mono, monospace', color: M.primary }}>{Math.round(650 * s.o2Rate)}</td>
                          <td style={{ padding: '10px 12px', fontFamily: 'Roboto Mono, monospace', color: M.steel }}>{i === 0 ? '2800' : i === 1 ? '2400' : i === 2 ? '2000' : i === 3 ? '1800' : '2200'}</td>
                          <td style={{ padding: '10px 12px', fontFamily: 'Roboto Mono, monospace', color: M.hot }}>{s.tempRate}</td>
                          <td style={{ padding: '10px 12px', fontSize: 12, color: M.onSurfaceVariant }}>{s.desc}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* O2 flow live adjust */}
            <Card elevation={1} style={{ padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: M.onSurface, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="tune" size={18} color={M.primary} /> Blow Parameter Adjustment
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: M.onSurfaceVariant, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>O₂ Flow Rate: {o2Flow} Nm³/min</div>
                  <input type="range" min={300} max={650} value={o2Flow} onChange={e => setO2Flow(+e.target.value)} style={{ width: '100%', accentColor: M.primary }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: M.onSurfaceVariant }}><span>300</span><span>650 Nm³/min</span></div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: M.onSurfaceVariant, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Lance Height: {lanceHeight} mm</div>
                  <input type="range" min={1400} max={3000} step={50} value={lanceHeight} onChange={e => setLanceHeight(+e.target.value)} style={{ width: '100%', accentColor: M.steel }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: M.onSurfaceVariant }}><span>1400</span><span>3000 mm</span></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, color: M.onSurfaceVariant, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quick Actions</div>
                  {['Raise lance +200mm', 'Lower lance −200mm', 'Increase O₂ +50'].map(a => (
                    <button key={a} onClick={() => {
                      if (a.includes('Raise')) setLanceHeight(v => Math.min(3000, v + 200))
                      else if (a.includes('Lower')) setLanceHeight(v => Math.max(1400, v - 200))
                      else setO2Flow(v => Math.min(650, v + 50))
                    }} style={{ padding: '6px 12px', borderRadius: 4, border: `1px solid ${M.outline}`, background: M.surface, color: M.onSurface, fontSize: 12, cursor: 'pointer', fontFamily: 'Roboto, sans-serif', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="chevron_right" size={14} color={M.primary} />{a}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* TD PREDICTION TAB */}
        {activeTab === 'prediction' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Card elevation={2} style={{ padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: M.onSurface, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="psychology" size={18} color={M.primary} /> TD Model Predictions
                </div>
                {predTemp ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { label: 'Predicted Final Temperature', val: `${Math.round(predTemp)}°C`, target: `${targetTemp}°C`, status: Math.abs(predTemp - targetTemp) <= 15 ? 'ok' : predTemp > targetTemp ? 'high' : 'low', icon: 'thermostat' },
                      { label: 'Predicted Final [C]%', val: `${predC?.toFixed(4)}%`, target: `${targetC}%`, status: predC <= targetC + 0.02 && predC >= targetC - 0.01 ? 'ok' : predC > targetC + 0.02 ? 'high' : 'low', icon: 'co2' },
                      { label: 'Estimated Tap Time', val: `${remainMin} min`, target: 'On schedule', status: 'ok', icon: 'schedule' },
                      { label: 'Model Confidence', val: `${Math.min(95, 60 + blowPct * 0.35).toFixed(0)}%`, target: '>80%', status: blowPct > 60 ? 'ok' : 'low', icon: 'verified' },
                    ].map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: item.status === 'ok' ? M.successSurface : item.status === 'high' ? M.errorSurface : M.warningSurface, borderRadius: 6, border: `1px solid ${item.status === 'ok' ? '#C8E6C9' : item.status === 'high' ? '#FFCDD2' : '#FFF9C4'}` }}>
                        <Icon name={item.icon} size={20} color={item.status === 'ok' ? M.success : item.status === 'high' ? M.error : M.warning} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, color: M.onSurfaceVariant, marginBottom: 2 }}>{item.label}</div>
                          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: item.status === 'ok' ? M.success : item.status === 'high' ? M.error : M.warning }}>{item.val}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: M.onSurfaceVariant }}>Target</div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: M.onSurface }}>{item.target}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: 32, textAlign: 'center', color: M.onSurfaceVariant }}>
                    <Icon name="psychology" size={40} color={M.outline} />
                    <div style={{ marginTop: 12, fontSize: 14 }}>Start blow to activate TD predictions</div>
                  </div>
                )}
              </Card>

              <Card elevation={2} style={{ padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: M.onSurface, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="recommend" size={18} color={M.success} /> Corrective Recommendations
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {predTemp && predC ? [
                    predTemp > targetTemp + 15 && { severity: 'danger', icon: 'thermostat', msg: 'Temperature overshoot predicted', action: 'Reduce O₂ flow by 50 Nm³/min or add coolant' },
                    predTemp < targetTemp - 15 && { severity: 'warning', icon: 'thermostat', msg: 'Temperature undershoot predicted', action: 'Increase lance pressure, check lime addition' },
                    predC > targetC + 0.02 && { severity: 'warning', icon: 'co2', msg: '[C] above target — continue blowing', action: 'Extend blow by ~1 min, reduce lance height' },
                    predC < targetC - 0.01 && { severity: 'danger', icon: 'co2', msg: 'Risk of over-blowing', action: 'Reduce blow time, prepare to tap' },
                    !subLanceMeasured && blowPct > 75 && { severity: 'info', icon: 'sensors', msg: 'Sub-lance measurement recommended', action: 'Deploy sub-lance for accurate T and [C] measurement' },
                    subLanceMeasured && { severity: 'ok', icon: 'check_circle', msg: 'Sub-lance data incorporated', action: 'Model updated with actual measurement' },
                  ].filter(Boolean).map((rec, i) => rec && (
                    <div key={i} style={{ padding: '12px 14px', borderRadius: 6, background: rec.severity === 'danger' ? M.errorSurface : rec.severity === 'warning' ? M.warningSurface : rec.severity === 'ok' ? M.successSurface : '#E3F2FD', border: `1px solid ${rec.severity === 'danger' ? '#FFCDD2' : rec.severity === 'warning' ? '#FFF9C4' : rec.severity === 'ok' ? '#C8E6C9' : '#BBDEFB'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Icon name={rec.icon} size={16} color={rec.severity === 'danger' ? M.error : rec.severity === 'warning' ? M.warning : rec.severity === 'ok' ? M.success : M.primary} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: M.onSurface }}>{rec.msg}</span>
                      </div>
                      <div style={{ fontSize: 12, color: M.onSurfaceVariant, paddingLeft: 24 }}>{rec.action}</div>
                    </div>
                  )) : (
                    <div style={{ color: M.onSurfaceVariant, fontSize: 13, textAlign: 'center', padding: 20 }}>Recommendations appear during blow</div>
                  )}

                  {(!predTemp || !predC) && (
                    <div style={{ padding: 20, textAlign: 'center', color: M.onSurfaceVariant, fontSize: 13 }}>Start blow to see corrective recommendations</div>
                  )}
                </div>
              </Card>
            </div>

            {/* Sub-lance data */}
            {subLanceMeasured && (
              <Card elevation={2} style={{ padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: M.onSurface, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="sensors" size={18} color={M.success} /> Sub-Lance Measurement (Auto @ 85%)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
                  {[
                    { label: 'Measured Temperature', val: `${Math.round(subLanceTemp)}°C`, color: M.hot },
                    { label: 'Measured [C]%', val: `${subLanceC?.toFixed(3)}%`, color: M.primary },
                    { label: 'Δ from Model Pred.', val: `${(subLanceTemp - (predTemp || subLanceTemp)).toFixed(0)}°C`, color: M.warning },
                    { label: 'Model Correction', val: subLanceMeasured ? 'Applied ✓' : 'Pending', color: M.success },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: 14, background: item.color + '08', border: `1px solid ${item.color}25`, borderRadius: 6 }}>
                      <div style={{ fontSize: 11, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{item.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: item.color }}>{item.val}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* SETUP TAB */}
        {activeTab === 'setup' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <Card elevation={2} style={{ padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: M.onSurface, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="settings" size={18} color={M.primary} /> Heat Setup Parameters
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  { label: 'Heat Number', val: heatNo, set: setHeatNo, type: 'text', unit: '' },
                  { label: 'HM Weight', val: hmWeight, set: setHmWeight, unit: 't', min: 100, max: 400 },
                  { label: 'HM Temperature', val: hmTemp, set: setHmTemp, unit: '°C', min: 1250, max: 1450 },
                  { label: 'HM [C]%', val: hmC, set: setHmC, unit: '%', min: 3.5, max: 5.0, step: 0.01 },
                  { label: 'HM [Si]%', val: hmSi, set: setHmSi, unit: '%', min: 0.1, max: 2.0, step: 0.01 },
                  { label: 'Scrap Weight', val: scrapWeight, set: setScrapWeight, unit: 't', min: 10, max: 120 },
                  { label: 'Target Temp', val: targetTemp, set: setTargetTemp, unit: '°C', min: 1600, max: 1750 },
                  { label: 'Target [C]%', val: targetC, set: setTargetC, unit: '%', min: 0.02, max: 0.50, step: 0.01 },
                ].map(({ label, val, set, unit, type, min, max, step = 0.1 }) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 500, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${M.outline}`, borderRadius: 4, overflow: 'hidden', background: M.surface }}>
                      <input type={type || 'number'} value={val} onChange={e => set(type === 'text' ? e.target.value : +e.target.value)} min={min} max={max} step={step} disabled={isBlowing}
                        style={{ flex: 1, padding: '8px 10px', border: 'none', outline: 'none', fontSize: 14, fontFamily: 'Roboto Mono, monospace', color: M.onSurface, background: 'transparent' }} />
                      {unit && <span style={{ padding: '0 10px', fontSize: 12, color: M.onSurfaceVariant, borderLeft: `1px solid ${M.outline}`, background: M.surfaceVariant, height: '100%', display: 'flex', alignItems: 'center' }}>{unit}</span>}
                    </div>
                  </div>
                ))}
              </div>
              {isBlowing && <div style={{ marginTop: 14, padding: '8px 12px', background: M.warningSurface, borderRadius: 4, fontSize: 12, color: M.warning, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="lock" size={14} color={M.warning} />Parameters locked during blow</div>}
            </Card>

            <Card elevation={2} style={{ padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: M.onSurface, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="info" size={18} color={M.steel} /> Model Information
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Model Type', val: 'Dynamic Statistical TD Model', icon: 'psychology' },
                  { label: 'Inputs', val: 'HM analysis, Scrap, O₂ flow, Off-gas, Lance', icon: 'input' },
                  { label: 'Prediction Method', val: 'Mass & heat balance + regression', icon: 'functions' },
                  { label: 'Update Frequency', val: 'Every 0.5s during blow', icon: 'update' },
                  { label: 'Sub-lance Integration', val: 'Auto at 85% blow', icon: 'sensors' },
                  { label: 'Model Accuracy (±)', val: '±8°C temperature, ±0.008% [C]', icon: 'verified' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', background: M.surfaceVariant, borderRadius: 6 }}>
                    <Icon name={item.icon} size={16} color={M.primary} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 11, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                      <div style={{ fontSize: 13, color: M.onSurface, fontWeight: 500, marginTop: 2 }}>{item.val}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      <style>{`
        @keyframes blink { 50% { opacity: 0.4; } }
      `}</style>
    </div>
  )
}
