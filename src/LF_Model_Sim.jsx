import { useState, useRef, useCallback, useEffect } from 'react'

// ─── SOUND ENGINE (Web Audio API — no external files) ─────────────────────────
class SoundEngine {
  constructor() {
    this.ctx = null
    this.active = {}
    this.enabled = true
  }
  _init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)() } catch(e) {}
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume()
    return this.ctx
  }

  // Continuous hissing noise (argon purge)
  startPurge(id, flow = 200) {
    if (!this.enabled || this.active[id]) return
    const ctx = this._init(); if (!ctx) return
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.4
    const src = ctx.createBufferSource()
    src.buffer = buf; src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 400 + flow * 0.8
    filter.Q.value = 0.8
    const gain = ctx.createGain()
    gain.gain.value = Math.min(0.28, 0.08 + flow / 1200)
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination)
    src.start()
    this.active[id] = { src, gain, filter }
  }
  stopPurge(id) {
    const n = this.active[id]; if (!n) return
    try { n.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); setTimeout(() => { try { n.src.stop() } catch(e) {} }, 500) } catch(e) {}
    delete this.active[id]
  }
  updatePurge(id, flow) {
    const n = this.active[id]; if (!n || !this.ctx) return
    n.filter.frequency.setTargetAtTime(400 + flow * 0.8, this.ctx.currentTime, 0.5)
    n.gain.gain.setTargetAtTime(Math.min(0.28, 0.08 + flow / 1200), this.ctx.currentTime, 0.5)
  }

  // Electric arc hum + crackle
  startArc(id, kw = 20000) {
    if (!this.enabled || this.active[id]) return
    const ctx = this._init(); if (!ctx) return
    const masterGain = ctx.createGain()
    masterGain.gain.value = 0.0
    masterGain.connect(ctx.destination)

    // Low frequency hum (transformer)
    const osc1 = ctx.createOscillator()
    osc1.type = 'sawtooth'; osc1.frequency.value = 50
    const humGain = ctx.createGain(); humGain.gain.value = 0.18
    osc1.connect(humGain); humGain.connect(masterGain)

    // Mid hum harmonic
    const osc2 = ctx.createOscillator()
    osc2.type = 'square'; osc2.frequency.value = 150
    const hum2Gain = ctx.createGain(); hum2Gain.gain.value = 0.10
    osc2.connect(hum2Gain); hum2Gain.connect(masterGain)

    // Crackling noise (arc discharge)
    const bufLen = ctx.sampleRate * 2
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
    const nd = noiseBuf.getChannelData(0)
    for (let i = 0; i < bufLen; i++) {
      nd[i] = Math.random() < 0.05 ? (Math.random() * 2 - 1) * 3 : (Math.random() * 2 - 1) * 0.1
    }
    const noiseSrc = ctx.createBufferSource()
    noiseSrc.buffer = noiseBuf; noiseSrc.loop = true
    const crackFilter = ctx.createBiquadFilter()
    crackFilter.type = 'highpass'; crackFilter.frequency.value = 1200
    const crackGain = ctx.createGain(); crackGain.gain.value = 0.15
    noiseSrc.connect(crackFilter); crackFilter.connect(crackGain); crackGain.connect(masterGain)

    osc1.start(); osc2.start(); noiseSrc.start()
    masterGain.gain.setTargetAtTime(1, ctx.currentTime, 0.5)
    this.active[id] = { osc1, osc2, noiseSrc, masterGain }
  }
  stopArc(id) {
    const n = this.active[id]; if (!n || !this.ctx) return
    try {
      n.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.8)
      setTimeout(() => { try { n.osc1.stop(); n.osc2.stop(); n.noiseSrc.stop() } catch(e) {} }, 1500)
    } catch(e) {}
    delete this.active[id]
  }

  // Short burst sound (alloy drop, wire, lance)
  playBurst(type = 'alloy') {
    if (!this.enabled) return
    const ctx = this._init(); if (!ctx) return
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    if (type === 'alloy') {
      // Metallic clanking thud
      ;[0, 0.08, 0.18, 0.30].forEach((delay, i) => {
        const osc = ctx.createOscillator()
        osc.type = 'triangle'
        osc.frequency.value = 180 - i * 35
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.35 - i * 0.06, ctx.currentTime + delay)
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18)
        osc.connect(g); g.connect(ctx.destination)
        osc.start(ctx.currentTime + delay)
        osc.stop(ctx.currentTime + delay + 0.20)
      })
      // Splash sound
      const nbuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate)
      const nd = nbuf.getChannelData(0)
      for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1)
      const ns = ctx.createBufferSource(); ns.buffer = nbuf
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 600; nf.Q.value = 1.5
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.22, ctx.currentTime + 0.05); ng.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65)
      ns.connect(nf); nf.connect(ng); ng.connect(ctx.destination); ns.start(ctx.currentTime + 0.05)

    } else if (type === 'wire') {
      // High-pitched whirring + small pops
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 1800
      osc.frequency.setTargetAtTime(1200, ctx.currentTime, 0.3)
      const g = ctx.createGain(); g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5)
      osc.connect(g); g.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 2.5)
      // Wire feed mechanical clicks
      ;[0.1, 0.3, 0.5, 0.7, 0.9, 1.1, 1.4, 1.7, 2.0, 2.3].forEach(t => {
        const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 800
        const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.08, ctx.currentTime + t); g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.04)
        o2.connect(g2); g2.connect(ctx.destination); o2.start(ctx.currentTime + t); o2.stop(ctx.currentTime + t + 0.05)
      })

    } else if (type === 'lance') {
      // Pneumatic hiss + thud of lance entering
      const nbuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate)
      const nd = nbuf.getChannelData(0)
      for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1)
      const ns = ctx.createBufferSource(); ns.buffer = nbuf
      const nf = ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2000
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.25, ctx.currentTime); ng.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5)
      ns.connect(nf); nf.connect(ng); ng.connect(ctx.destination); ns.start()
      // Thud on entry
      const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 80
      const g = ctx.createGain(); g.gain.setValueAtTime(0.5, ctx.currentTime + 0.3); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7)
      osc.connect(g); g.connect(ctx.destination); osc.start(ctx.currentTime + 0.3); osc.stop(ctx.currentTime + 0.7)

    } else if (type === 'probe') {
      // Mechanical insertion beep + thud
      ;[0, 0.15].forEach((t, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880 - i * 220
        const g = ctx.createGain(); g.gain.setValueAtTime(0.18, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.12)
        o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.14)
      })
      // Confirmation beep on measurement
      setTimeout(() => {
        if (!ctx) return
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1200
        const g = ctx.createGain(); g.gain.setValueAtTime(0.20, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
        o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.16)
      }, 3000)

    } else if (type === 'complete') {
      // Success chord
      ;[[523, 0], [659, 0.1], [784, 0.2], [1047, 0.35]].forEach(([freq, t]) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq
        const g = ctx.createGain(); g.gain.setValueAtTime(0.18, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.8)
        o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.85)
      })
    }
  }

  stopAll() {
    Object.keys(this.active).forEach(id => {
      const n = this.active[id]
      try {
        if (n.masterGain) n.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2)
        if (n.gain) n.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2)
        setTimeout(() => {
          try { if (n.src) n.src.stop() } catch(e) {}
          try { if (n.osc1) n.osc1.stop() } catch(e) {}
          try { if (n.osc2) n.osc2.stop() } catch(e) {}
          try { if (n.noiseSrc) n.noiseSrc.stop() } catch(e) {}
        }, 400)
      } catch(e) {}
    })
    this.active = {}
  }
}

// Singleton
const SOUND = new SoundEngine()

// ─── GRADE LIBRARY ────────────────────────────────────────────────────────────
const GRADES = {
  'SAE 1006':     { C:0.04, Mn:0.28, Si:0.02,  S:0.010, P:0.010, Al:0.035, targetT:1558, SH:22, liqT:1536 },
  'SAE 1018':     { C:0.16, Mn:0.75, Si:0.08,  S:0.012, P:0.012, Al:0.030, targetT:1568, SH:28, liqT:1540 },
  'SAE 1045':     { C:0.44, Mn:0.80, Si:0.15,  S:0.010, P:0.012, Al:0.025, targetT:1575, SH:32, liqT:1543 },
  'IS 2062 E250': { C:0.18, Mn:1.25, Si:0.30,  S:0.010, P:0.015, Al:0.030, targetT:1570, SH:28, liqT:1542 },
  'IS 2062 E350': { C:0.20, Mn:1.45, Si:0.35,  S:0.008, P:0.012, Al:0.035, targetT:1572, SH:30, liqT:1540 },
  'API 5L X52':   { C:0.10, Mn:1.40, Si:0.28,  S:0.006, P:0.012, Al:0.035, targetT:1570, SH:28, liqT:1541 },
  'API 5L X65':   { C:0.08, Mn:1.55, Si:0.30,  S:0.004, P:0.010, Al:0.040, targetT:1572, SH:30, liqT:1542 },
  'HSLA 80':      { C:0.08, Mn:1.50, Si:0.30,  S:0.003, P:0.010, Al:0.040, targetT:1575, SH:30, liqT:1542 },
  'Custom':       { C:0.12, Mn:0.90, Si:0.20,  S:0.008, P:0.015, Al:0.030, targetT:1568, SH:28, liqT:1540 },
}

// Ferro-alloy compositions and recoveries
const ALLOYS = {
  'FeMn (HC)': { elem:'Mn', grade:0.72, recovery:0.92, cost:1.2 },
  'FeSi 75%':  { elem:'Si', grade:0.75, recovery:0.88, cost:1.8 },
  'SiMn 65%':  { elem:'Mn', grade:0.65, siGrade:0.17, recovery:0.90, cost:1.1 },
  'Al ingot':  { elem:'Al', grade:0.995,recovery:0.90, cost:2.5 },
  'FeMo':      { elem:'Mo', grade:0.60, recovery:0.95, cost:18 },
  'FeNb':      { elem:'Nb', grade:0.65, recovery:0.95, cost:22 },
  'FeCr (HC)': { elem:'Cr', grade:0.65, recovery:0.92, cost:1.5 },
  'FeB':       { elem:'B',  grade:0.18, recovery:0.70, cost:8 },
}

const CV = {
  bg:'#07090f', panel:'#0b1220', border:'#1a2d45',
  text:'#cdd9e5', muted:'#6e8098',
  accent:'#FF8F00', success:'#57ab5a', danger:'#e5534b',
  cyan:'#39c5cf', purple:'#9b5de5', yellow:'#FFD54F', blue:'#29B6F6',
}
const cl = (v,lo,hi) => Math.max(lo, Math.min(hi, v))

function heatColor(temp,min=1500,max=1720){
  const t=cl((temp-min)/(max-min),0,1)
  if(t>0.85)return`rgba(255,255,${Math.round((1-t)*6*255)},0.97)`
  if(t>0.70)return`rgba(255,${Math.round(100+t*155)},0,0.95)`
  if(t>0.50)return`rgba(255,${Math.round(50+t*80)},0,0.92)`
  return`rgba(${Math.round(190+t*65)},${Math.round(25+t*30)},0,0.88)`
}

// ─── LOCAL METALLURGICAL SCHEDULE ENGINE ──────────────────────────────────────
function computeSchedule(bof, tgt, config) {
  const { weight, transMVA } = config
  const pwr = Math.round(transMVA * 920)   // kW at ~0.92 PF

  // 1. Temperature budget
  const heatLoss      = 1.8   // °C/min (ladle + radiation loss)
  const arcHeatRate   = (pwr * 0.92) / (weight * 4.18 * 1.2) * 60  // °C/min from arc
  const tempRequired  = tgt.T - bof.T + 8    // +8 safety margin
  const netHeatRate   = arcHeatRate - heatLoss
  const arcMinNeeded  = Math.max(4, tempRequired > 0 ? tempRequired / netHeatRate : 0)

  // 2. Desulphurisation assessment
  const desulphRatio  = bof.S / tgt.S
  const needsDesulph  = desulphRatio > 1.4
  const desulphHard   = desulphRatio > 2.5

  // 3. Chemistry gaps
  const dMn = tgt.Mn - bof.Mn
  const dSi = tgt.Si - bof.Si
  const dAl = tgt.Al - bof.Al
  const dC  = tgt.C  - bof.C

  // 4. Alloy additions
  const alloys = []
  if(dMn > 0.04){
    const kg = Math.round(dMn * weight * 1000 / (ALLOYS['FeMn (HC)'].grade * ALLOYS['FeMn (HC)'].recovery))
    alloys.push({ name:'FeMn (HC)', kg, elem:'Mn', delta:dMn.toFixed(3), rec:'92%', timing:'After 1st arc' })
  }
  if(dSi > 0.015){
    const kg = Math.round(dSi * weight * 1000 / (ALLOYS['FeSi 75%'].grade * ALLOYS['FeSi 75%'].recovery))
    alloys.push({ name:'FeSi 75%', kg, elem:'Si', delta:dSi.toFixed(3), rec:'88%', timing:'With FeMn' })
  }
  if(dAl > 0.005){
    const kg = Math.round(dAl * weight * 1000 / 0.90)
    alloys.push({ name:'Al ingot', kg, elem:'Al', delta:dAl.toFixed(3), rec:'90%', timing:'After de-ox' })
  }
  // Deox Al (always needed)
  const deoxAl = Math.round(weight * 0.45)
  if(!alloys.find(a=>a.name==='Al ingot')) alloys.push({ name:'Al ingot', kg:deoxAl, elem:'Al', delta:'0.030', rec:'90%', timing:'At tap / LF start' })
  // Lime/slag builders
  const lime = Math.round(weight * 3.5)
  alloys.push({ name:'Lime (CaO)', kg:lime, elem:'slag', delta:'B2→'+config.slagBasicity.toFixed(1), rec:'--', timing:'LF arrival' })

  // 5. Wire injection
  const wires = []
  if(needsDesulph){
    const casiMeters = Math.round(weight * (desulphHard ? 18 : 12))
    wires.push({ type:'CaSi wire', meters:casiMeters, rate:'2.5 m/min', purpose:`Desulph [S] ${bof.S.toFixed(3)}→${tgt.S.toFixed(3)}%` })
  }
  if(bof.S > 0.005){
    const caMeters = Math.round(weight * 5)
    wires.push({ type:'Ca wire', meters:caMeters, rate:'2.0 m/min', purpose:'Inclusion modification, CaO-Al₂O₃ forming' })
  }

  // 6. Arc schedule (3–4 stages)
  const arcTot   = Math.ceil(arcMinNeeded)
  const arc1min  = Math.round(arcTot * 0.45)
  const arc2min  = Math.round(arcTot * 0.35)
  const arc3min  = Math.max(2, arcTot - arc1min - arc2min)
  const arcSteps = [
    { name:'Initial heat-up',   kw:pwr,               min:arc1min, step:Math.min(12,config.voltageStep+2), purpose:'Rapid heat to trim temp', kwh:Math.round(pwr*arc1min/60) },
    { name:'Alloying heat',     kw:Math.round(pwr*0.80),min:arc2min,step:config.voltageStep,             purpose:'Maintain temp during alloy additions', kwh:Math.round(pwr*0.80*arc2min/60) },
    { name:'Fine trim',         kw:Math.round(pwr*0.60),min:arc3min,step:Math.max(1,config.voltageStep-2),purpose:'Fine temperature adjustment', kwh:Math.round(pwr*0.60*arc3min/60) },
  ]
  if(alloys.some(a=>a.elem==='Mn')&&arcTot>14){
    arcSteps.push({ name:'Pre-cast verify', kw:Math.round(pwr*0.45), min:3, step:Math.max(1,config.voltageStep-3), purpose:'Verify temp before cast', kwh:Math.round(pwr*0.45*3/60) })
  }

  // 7. Purge schedule
  const purgeSteps = [
    { name:'Hard purge (de-slag)', p1:320, p2:280, min:3,  mode:'HARD',     purpose:'Remove BOF slag carry-over, homogenise' },
    { name:'Arc heating purge',    p1:80,  p2:80,  min:arc1min+2, mode:'SOFT', purpose:'Gentle stir during arc — avoid open eye' },
    { name:'Alloy mixing purge',   p1:250, p2:220, min:5,  mode:'MEDIUM',   purpose:'Dissolve alloys, homogenise chemistry' },
    { name:'Desulph purge',        p1:350, p2:320, min:desulphHard?10:7, mode:'HARD', purpose:'Max Ar stirring for CaS flotation' },
    { name:'Soft purge (pre-cast)',p1:35,  p2:35,  min:6,  mode:'VERY SOFT',purpose:'Float inclusions, freeze chemistry' },
  ]

  // 8. Temperature trajectory
  let tempNow = bof.T
  const tempPath = [{ stage:'BOF Tap', t:tempNow, min:0 }]
  tempNow -= 12  // ladle transfer loss
  tempPath.push({ stage:'LF Arrival', t:Math.round(tempNow), min:2 })
  tempNow -= heatLoss*3   // hard purge
  tempPath.push({ stage:'After de-slag', t:Math.round(tempNow), min:5 })
  tempNow += arcSteps[0].min * netHeatRate
  tempPath.push({ stage:'After arc 1', t:Math.round(tempNow), min:5+arcSteps[0].min })
  tempNow -= heatLoss*2
  tempPath.push({ stage:'Alloy addition', t:Math.round(tempNow), min:5+arcSteps[0].min+3 })
  tempNow += arcSteps[1].min * netHeatRate
  tempPath.push({ stage:'After arc 2', t:Math.round(tempNow), min:5+arcSteps[0].min+arcSteps[1].min+3 })
  tempNow -= heatLoss*(wires.length>0?8:4)  // desulph purge
  tempPath.push({ stage:'After desulph', t:Math.round(tempNow), min:5+arcSteps[0].min+arcSteps[1].min+12 })
  if(arcSteps[2]) tempNow += arcSteps[2].min * netHeatRate
  tempNow -= heatLoss*6   // soft purge
  tempPath.push({ stage:'LF Out', t:Math.round(tempNow), min:5+arcSteps.reduce((a,s)=>a+s.min,0)+15 })

  // 9. Total time and energy
  const heatTime = 8 + arcSteps.reduce((a,s)=>a+s.min,0) + 14 + (needsDesulph?8:0)
  const totalKWh = arcSteps.reduce((a,s)=>a+s.kwh,0)
  const lfOutTemp = Math.round(tempNow)
  const superheat = lfOutTemp - (config.liqT || 1540)

  // 10. Timeline (for simulation)
  let cursor = 0
  const timeline = []
  timeline.push({ type:'purge', idx:0, tMin:cursor, label:'Hard purge (de-slag)' }); cursor+=3
  timeline.push({ type:'arc',   idx:0, tMin:cursor, label:'Arc: Initial heat-up' }); cursor+=arcSteps[0].min
  alloys.filter(a=>a.elem!=='slag').slice(0,2).forEach((a,i)=>{ timeline.push({ type:'alloy', idx:i, tMin:cursor+i*1.5, label:'Alloy: '+a.name }) })
  cursor += 3
  timeline.push({ type:'purge', idx:2, tMin:cursor, label:'Alloy mixing purge' }); cursor+=5
  timeline.push({ type:'arc',   idx:1, tMin:cursor, label:'Arc: Alloying heat' }); cursor+=arcSteps[1].min
  if(wires.length>0){ timeline.push({ type:'wire', idx:0, tMin:cursor, label:'Wire: '+wires[0]?.type }); cursor+=3 }
  timeline.push({ type:'purge', idx:3, tMin:cursor, label:'Desulph purge' }); cursor+=(desulphHard?10:7)
  timeline.push({ type:'probe', idx:0, tMin:cursor, label:'Temp + sample' }); cursor+=2
  timeline.push({ type:'arc',   idx:2, tMin:cursor, label:'Arc: Fine trim' }); cursor+=arcSteps[2].min
  if(wires.length>1){ timeline.push({ type:'wire', idx:1, tMin:cursor, label:'Wire: '+wires[1]?.type }); cursor+=2 }
  timeline.push({ type:'purge', idx:4, tMin:cursor, label:'Soft purge (pre-cast)' })

  // 11. Risk flags
  const risks = []
  if(bof.P > 0.025)  risks.push({ lvl:'HIGH',   msg:`[P]=${bof.P}% high — risk of re-phosphorisation if slag reduced` })
  if(desulphHard)    risks.push({ lvl:'HIGH',   msg:`Desulph ratio ${(bof.S/tgt.S).toFixed(1)}x — needs very high slag basicity B2>3.5` })
  if(tempRequired>35)risks.push({ lvl:'MEDIUM', msg:`Temp deficit ${Math.round(tempRequired)}°C — ensure ladle preheated` })
  if(dMn>1.0)        risks.push({ lvl:'MEDIUM', msg:`Large Mn addition ${alloys.find(a=>a.elem==='Mn')?.kg}kg — risk of local carbon pickup` })
  if(bof.C>0.12)     risks.push({ lvl:'LOW',    msg:`[C]=${bof.C}% above target — no carbon addition; monitor pickup` })

  return { arcSteps, purgeSteps, alloys, wires, timeline, tempPath, heatTime, totalKWh, lfOutTemp, superheat: Math.round(superheat), risks, desulphRatio: desulphRatio.toFixed(1) }
}

function initSimState(bof, tgt) {
  const mk = (i) => ({
    arcOn:false, electrodeY:[0.12,0.12,0.12], electrodeVel:[0,0,0], arcLen:[0,0,0],
    p1On:false, p1Flow:0, p2On:false, p2Flow:0,
    lanceY:0, lanceTimer:0, probeY:0, probeDone:false, probeFrames:0,
    alloyParticles:[], plug1Bubbles:[], plug2Bubbles:[], sparks:[],
    temp:bof.T - 10 - i*2, targetT:tgt.T,
    C:bof.C, Mn:bof.Mn, Si:bof.Si, S:bof.S, P:bof.P, Al:bof.Al,
    slagFoam:0.12, complete:false,
    status: i===0?'READY':'IDLE',
    arcEndMin:null, purgeEndMin:null, alloyAddMin:null,
  })
  return { t:0, frame:0, _mva:0, ladles:[mk(0),mk(1)] }
}

// ─── CANVAS ──────────────────────────────────────────────────────────────────
function LFCanvas({ simRef, W, H, running }) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)

  useEffect(()=>{ const c=canvasRef.current; if(c){c.width=W;c.height=H} },[W,H])

  const draw = useCallback(()=>{
    const canvas=canvasRef.current; if(!canvas){rafRef.current=requestAnimationFrame(draw);return}
    const ctx=canvas.getContext('2d'); const CW=canvas.width,CH=canvas.height
    if(!CW||!CH){rafRef.current=requestAnimationFrame(draw);return}
    const sim=simRef.current
    if(!sim){ctx.fillStyle=CV.bg;ctx.fillRect(0,0,CW,CH);rafRef.current=requestAnimationFrame(draw);return}
    try{
    const LFC=[CW*0.22,CW*0.74], LW=CW*0.18, LH=CH*0.23
    const LY0=CH*0.27, LY1=LY0+LH, RY=LY0-CH*0.022
    const LIN=cl(CW*0.011,7,13), EW=cl(CW*0.009,6,10), ET=CH*0.042
    const TX=CW*0.465,TY=CH*0.15,TW=CW*0.065,TH=CH*0.18
    const slgSY=LY0+CH*0.038, rfIn=RY+CH*0.005
    const t=sim.t
    ctx.fillStyle=CV.bg;ctx.fillRect(0,0,CW,CH)
    ctx.strokeStyle='rgba(255,255,255,0.012)';ctx.lineWidth=0.5
    for(let x=0;x<CW;x+=36){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CH);ctx.stroke()}
    for(let y=0;y<CH;y+=36){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CW,y);ctx.stroke()}
    const lb=(tx,x,y,c,sz=9,al='center')=>{ctx.fillStyle=c;ctx.font=`${sz}px monospace`;ctx.textAlign=al;ctx.fillText(tx,x,y)}
    const lbB=(tx,x,y,c,sz=9,al='center')=>{ctx.fillStyle=c;ctx.font=`bold ${sz}px monospace`;ctx.textAlign=al;ctx.fillText(tx,x,y)}
    // Rail
    ctx.fillStyle='#1a2535';ctx.fillRect(0,CH*0.028,CW,8);ctx.fillStyle='#263340';ctx.fillRect(0,CH*0.028+2,CW,4)
    // Transformer
    const aA=sim.ladles.some(l=>l.arcOn)
    ctx.fillStyle='#1a2535';ctx.strokeStyle='#2c4055';ctx.lineWidth=1.5
    ctx.fillRect(TX,TY,TW,TH);ctx.strokeRect(TX,TY,TW,TH)
    for(let ty=TY+8;ty<TY+TH-8;ty+=11){ctx.strokeStyle=aA?`rgba(255,${Math.round(110+60*Math.sin(t*8+ty*0.1))},0,0.32)`:'#1e3040';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(TX+4,ty);ctx.lineTo(TX+TW-4,ty);ctx.stroke()}
    if(aA){const tg=ctx.createRadialGradient(TX+TW/2,TY+TH/2,2,TX+TW/2,TY+TH/2,TW);tg.addColorStop(0,`rgba(255,100,0,${0.07+0.05*Math.sin(t*9)})`);tg.addColorStop(1,'rgba(255,80,0,0)');ctx.fillStyle=tg;ctx.fillRect(TX-10,TY-10,TW+20,TH+20)}
    lbB('XFMR',TX+TW/2,TY+TH*0.38,aA?CV.accent:CV.muted,cl(CW*0.010,8,10))
    lb(`${sim._mva}MVA`,TX+TW/2,TY+TH*0.56,aA?CV.yellow:CV.muted,cl(CW*0.009,7,9))
    lb(aA?'● ON':'○ STBY',TX+TW/2,TY+TH*0.72,aA?CV.success:CV.muted,cl(CW*0.009,7,8))
    // Bus bars
    LFC.forEach((cx,i)=>{const ld=sim.ladles[i];const bc=ld?.arcOn?`rgba(255,${Math.round(100+60*Math.sin(t*12))},0,0.55)`:'rgba(30,50,70,0.40)';ctx.strokeStyle=bc;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(TX+(i===0?0:TW),TY+TH*0.35);ctx.lineTo(cx,ET+14);ctx.stroke();ctx.strokeStyle='#0d1520';ctx.lineWidth=1.2;ctx.stroke()})
    // Each LF
    sim.ladles.forEach((ld,idx)=>{
      const cx=LFC[idx]
      // Mast
      ctx.fillStyle='#1a2d3d';ctx.strokeStyle='#2c4055';ctx.lineWidth=1
      ctx.fillRect(cx-LW*0.30,ET+3,LW*0.60,CH*0.020);ctx.strokeRect(cx-LW*0.30,ET+3,LW*0.60,CH*0.020)
      ;[-LW*0.27,LW*0.27].forEach(dx=>{ctx.fillRect(cx+dx-3,CH*0.022,7,ET-CH*0.022+3);ctx.strokeRect(cx+dx-3,CH*0.022,7,ET-CH*0.022+3)})
      // Electrodes
      const eXs=[cx-LW*0.22,cx,cx+LW*0.22]
      eXs.forEach((ex,ei)=>{
        const ef=cl(ld.electrodeY?ld.electrodeY[ei]:0.12,0,1)
        const eyB=rfIn+(slgSY-rfIn)*ef*0.85
        ctx.fillStyle='#263340';ctx.strokeStyle='#37474F';ctx.lineWidth=0.8
        ctx.fillRect(ex-LW*0.055,ET+3,LW*0.11,9);ctx.strokeRect(ex-LW*0.055,ET+3,LW*0.11,9)
        const eGrd=ctx.createLinearGradient(ex-EW/2,0,ex+EW/2,0)
        eGrd.addColorStop(0,'#0f0f0f');eGrd.addColorStop(0.45,'#252525');eGrd.addColorStop(1,'#0f0f0f')
        ctx.fillStyle=eGrd;ctx.fillRect(ex-EW/2,RY-2,EW,eyB-RY+2)
        ctx.strokeStyle='#1e1e1e';ctx.lineWidth=0.5;ctx.strokeRect(ex-EW/2,RY-2,EW,eyB-RY+2)
        if(ld.arcOn){ctx.fillStyle='#151515';ctx.beginPath();ctx.moveTo(ex-EW/2,eyB);ctx.lineTo(ex,eyB+EW*0.55);ctx.lineTo(ex+EW/2,eyB);ctx.closePath();ctx.fill()}
      })
      // Roof
      ctx.fillStyle='#1e2535';ctx.strokeStyle='#2c4055';ctx.lineWidth=1.5
      ctx.beginPath();ctx.moveTo(cx-LW/2,LY0);ctx.lineTo(cx-LW/2-7,RY);ctx.lineTo(cx+LW/2+7,RY);ctx.lineTo(cx+LW/2,LY0);ctx.closePath();ctx.fill();ctx.stroke()
      eXs.forEach(ex=>{ctx.fillStyle='#06090f';ctx.beginPath();ctx.arc(ex,RY+(LY0-RY)*0.55,EW*0.7,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#2a2a2a';ctx.lineWidth=0.5;ctx.stroke()})
      // Shell
      ctx.fillStyle='#1a2535';ctx.strokeStyle='#2c4055';ctx.lineWidth=2
      ctx.beginPath();ctx.moveTo(cx-LW/2,LY0);ctx.lineTo(cx-LW/2-5,LY1);ctx.lineTo(cx+LW/2+5,LY1);ctx.lineTo(cx+LW/2,LY0);ctx.closePath();ctx.fill();ctx.stroke()
      ctx.fillStyle='#1e1408'
      ctx.beginPath();ctx.moveTo(cx-LW/2+LIN,LY0+3);ctx.lineTo(cx-LW/2+LIN-2,LY1-LIN);ctx.lineTo(cx+LW/2-LIN+2,LY1-LIN);ctx.lineTo(cx+LW/2-LIN,LY0+3);ctx.closePath();ctx.fill()
      // Bath
      const sT=LY0+CH*0.038,sH=LH*0.71
      const bg=ctx.createLinearGradient(0,sT,0,sT+sH)
      bg.addColorStop(0,heatColor(ld.temp,1500,1720));bg.addColorStop(0.4,heatColor(ld.temp-20,1500,1720));bg.addColorStop(1,heatColor(ld.temp-70,1500,1720))
      ctx.fillStyle=bg;ctx.beginPath();ctx.moveTo(cx-LW/2+LIN,sT);ctx.lineTo(cx+LW/2-LIN,sT);ctx.lineTo(cx+LW/2-LIN-2,sT+sH);ctx.lineTo(cx-LW/2+LIN+2,sT+sH);ctx.closePath();ctx.fill()
      ctx.fillStyle=`rgba(255,215,55,${0.06+0.05*Math.sin(t*3+idx)})`;ctx.fillRect(cx-LW/2+LIN,sT,LW-LIN*2,3)
      // Slag
      const slH=CH*0.033*(1+ld.slagFoam),slY=sT-slH
      const slg=ctx.createLinearGradient(0,slY,0,sT);slg.addColorStop(0,`rgba(${Math.round(78+ld.slagFoam*32)},85,30,0.88)`);slg.addColorStop(1,'rgba(55,70,22,0.72)')
      ctx.fillStyle=slg;ctx.fillRect(cx-LW/2+LIN,slY,LW-LIN*2,slH)
      if(ld.slagFoam>0.2){for(let fx=cx-LW/2+LIN+6;fx<cx+LW/2-LIN-6;fx+=13){const lp=2.5+ld.slagFoam*6+2*Math.sin(t*5+fx*0.22);const fg=ctx.createRadialGradient(fx,slY,0,fx,slY,lp*1.4);fg.addColorStop(0,`rgba(112,108,42,${0.48+ld.slagFoam*0.25})`);fg.addColorStop(1,'rgba(68,82,22,0)');ctx.fillStyle=fg;ctx.beginPath();ctx.arc(fx,slY,lp*1.4,0,Math.PI*2);ctx.fill()}}
      // Arc columns (drawn after bath)
      if(ld.arcOn){
        eXs.forEach((ex,ei)=>{
          const ef=cl(ld.electrodeY?ld.electrodeY[ei]:0.70,0,1)
          const eyB=rfIn+(slgSY-rfIn)*ef*0.85
          const gap=Math.max(slgSY-eyB,10),fl=0.78+0.22*Math.sin(t*22+ei*2.1),segs=Math.ceil(gap/3)
          ctx.beginPath();for(let s=0;s<=segs;s++){const y=eyB+s*(gap/segs);const sw=(Math.sin(t*18+s*0.5+ei*1.8)*8+Math.cos(t*14+s*0.7+ei*2.3)*5)*fl;s===0?ctx.moveTo(ex+sw,y):ctx.lineTo(ex+sw,y)}
          ctx.strokeStyle=`rgba(60,160,255,${0.40*fl})`;ctx.lineWidth=20;ctx.stroke()
          ctx.beginPath();for(let s=0;s<=segs;s++){const y=eyB+s*(gap/segs);const sw=(Math.sin(t*22+s*0.45+ei*1.6)*4)*fl;s===0?ctx.moveTo(ex+sw,y):ctx.lineTo(ex+sw,y)}
          ctx.strokeStyle=`rgba(140,215,255,${0.85*fl})`;ctx.lineWidth=6;ctx.stroke()
          ctx.beginPath();for(let s=0;s<=segs;s++){const y=eyB+s*(gap/segs);const sw=Math.sin(t*30+s*0.35+ei*1.4)*2.5*fl;s===0?ctx.moveTo(ex+sw,y):ctx.lineTo(ex+sw,y)}
          ctx.strokeStyle=`rgba(255,255,255,${0.96*fl})`;ctx.lineWidth=2.5;ctx.stroke()
          const tg=ctx.createRadialGradient(ex,eyB,0,ex,eyB,26);tg.addColorStop(0,`rgba(255,255,255,${0.98*fl})`);tg.addColorStop(0.3,`rgba(160,230,255,${0.88*fl})`);tg.addColorStop(1,'rgba(0,80,255,0)');ctx.fillStyle=tg;ctx.beginPath();ctx.arc(ex,eyB,26,0,Math.PI*2);ctx.fill()
          const ig=ctx.createRadialGradient(ex,slgSY,0,ex,slgSY,42);ig.addColorStop(0,`rgba(255,248,130,${0.90*fl})`);ig.addColorStop(0.35,`rgba(255,155,0,${0.62*fl})`);ig.addColorStop(1,'rgba(255,30,0,0)');ctx.fillStyle=ig;ctx.beginPath();ctx.arc(ex,slgSY,42,0,Math.PI*2);ctx.fill()
          lb(`${ld.arcLen?.[ei]||145}mm`,ex+16,eyB+(slgSY-eyB)*0.5,'rgba(120,200,255,0.80)',cl(CW*0.009,7,9),'left')
        })
        lbB(`${Math.round(sim._mva*920/1000)}MW`,cx,ET-3,CV.accent,cl(CW*0.010,8,10))
      }
      // Sparks
      ;(ld.sparks||[]).forEach(p=>{ctx.globalAlpha=p.life;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1
      // Plugs
      const P1=cx-LW*0.28,P2=cx+LW*0.28,PY=LY1-LIN+4
      ;[[P1,ld.p1On,ld.p1Flow,'P1'],[P2,ld.p2On,ld.p2Flow,'P2']].forEach(([px,on,flow,nm])=>{
        ctx.fillStyle=on?'rgba(28,58,100,0.88)':'rgba(15,25,40,0.80)';ctx.strokeStyle=on?CV.blue:'#1e3040';ctx.lineWidth=0.8
        ctx.beginPath();ctx.ellipse(px,PY,LW*0.052,CH*0.012,0,0,Math.PI*2);ctx.fill();ctx.stroke()
        // Pipe goes DOWN from plug to bottom of ladle exterior
        const pipeBot=LY1+CH*0.014
        ctx.strokeStyle='#1a2535';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(px,PY+4);ctx.lineTo(px,pipeBot);ctx.stroke()
        if(on){
          const fg=ctx.createLinearGradient(0,pipeBot,0,PY);fg.addColorStop(0,'rgba(41,182,246,0.65)');fg.addColorStop(1,'rgba(41,182,246,0.15)');
          ctx.strokeStyle=fg;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(px,pipeBot);ctx.lineTo(px,PY+4);ctx.stroke()
          lbB(`${flow}`,px+7,PY+(pipeBot-PY)*0.5,`rgba(41,182,246,0.55)`,cl(CW*0.009,6,7),'left')
        }
        lb(`${nm}${on?' '+flow:''}`,px,PY+CH*0.027,on?CV.blue:'#1e3040',cl(CW*0.009,6,8))
      })
      // Draw bubbles clipped to ladle interior so they never appear outside
      ctx.save()
      ctx.beginPath()
      ctx.rect(cx-LW/2+LIN, LY0+3, LW-LIN*2, LH-LIN-3)
      ctx.clip()
      ;(ld.plug1Bubbles||[]).forEach(p=>{
        // Outer glow
        ctx.globalAlpha=p.life*0.22; ctx.fillStyle='rgba(150,220,255,0.7)'
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2.2,0,Math.PI*2); ctx.fill()
        // Core bubble
        ctx.globalAlpha=p.life*0.80; ctx.fillStyle=p.col
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
        // Highlight
        ctx.globalAlpha=p.life*0.35; ctx.fillStyle='rgba(255,255,255,0.9)'
        ctx.beginPath(); ctx.arc(p.x-p.r*0.3,p.y-p.r*0.3,p.r*0.32,0,Math.PI*2); ctx.fill()
      }); ctx.globalAlpha=1
      ;(ld.plug2Bubbles||[]).forEach(p=>{
        ctx.globalAlpha=p.life*0.22; ctx.fillStyle='rgba(150,220,255,0.7)'
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2.2,0,Math.PI*2); ctx.fill()
        ctx.globalAlpha=p.life*0.80; ctx.fillStyle=p.col
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
        ctx.globalAlpha=p.life*0.35; ctx.fillStyle='rgba(255,255,255,0.9)'
        ctx.beginPath(); ctx.arc(p.x-p.r*0.3,p.y-p.r*0.3,p.r*0.32,0,Math.PI*2); ctx.fill()
      }); ctx.globalAlpha=1
      ctx.restore()
      // Surface eye glow where bubbles break (outside clip is fine)
      const slagTopY = LY0+CH*0.024-CH*0.020*(1+(ld.slagFoam||0.12))
      if(ld.p1On){ const eg=ctx.createRadialGradient(cx-LW*0.28,slagTopY,1,cx-LW*0.28,slagTopY,18);eg.addColorStop(0,'rgba(41,182,246,0.45)');eg.addColorStop(1,'rgba(41,182,246,0)');ctx.fillStyle=eg;ctx.beginPath();ctx.arc(cx-LW*0.28,slagTopY,18,0,Math.PI*2);ctx.fill()}
      if(ld.p2On){ const eg=ctx.createRadialGradient(cx+LW*0.28,slagTopY,1,cx+LW*0.28,slagTopY,18);eg.addColorStop(0,'rgba(100,215,255,0.45)');eg.addColorStop(1,'rgba(100,215,255,0)');ctx.fillStyle=eg;ctx.beginPath();ctx.arc(cx+LW*0.28,slagTopY,18,0,Math.PI*2);ctx.fill()}
      // Lance
      const LMX=cx+LW*0.44,LMYT=CH*0.050
      ctx.fillStyle='#1e2d3d';ctx.strokeStyle='#2c4055';ctx.lineWidth=1;ctx.fillRect(LMX-CW*0.026,LMYT-CH*0.04,CW*0.052,CH*0.04);ctx.strokeRect(LMX-CW*0.026,LMYT-CH*0.04,CW*0.052,CH*0.04)
      lbB('TL',LMX,LMYT-CH*0.048,CV.success,cl(CW*0.009,7,9))
      if(ld.lanceY>0){
        const lTip=RY+(LY0+CH*0.28-RY)*ld.lanceY*0.85,lW2=cl(CW*0.011,6,11)
        const lGrd=ctx.createLinearGradient(LMX-lW2/2,0,LMX+lW2/2,0);lGrd.addColorStop(0,'#1a3a4a');lGrd.addColorStop(0.5,'#4FC3F7');lGrd.addColorStop(1,'#1a3a4a')
        ctx.fillStyle=lGrd;ctx.fillRect(LMX-lW2/2,LMYT,lW2,lTip-LMYT);ctx.fillStyle='#FF8F00';ctx.fillRect(LMX-lW2/2-2,lTip-5,lW2+4,8)
        if(ld.lanceY>0.65){const pg=ctx.createRadialGradient(LMX,lTip+4,1,LMX,lTip+4,18);pg.addColorStop(0,'rgba(255,200,80,0.82)');pg.addColorStop(1,'rgba(200,140,40,0)');ctx.fillStyle=pg;ctx.beginPath();ctx.arc(LMX,lTip+4,18,0,Math.PI*2);ctx.fill();lb('CaSi',LMX+lW2/2+5,lTip,'rgba(200,180,80,0.70)',cl(CW*0.009,7,8),'left')}
      }
      // Probe
      const PMX=cx-LW*0.41,PMYT=CH*0.050
      ctx.fillStyle='#1e2d3d';ctx.strokeStyle='#2c4055';ctx.lineWidth=1;ctx.fillRect(PMX-CW*0.022,PMYT-CH*0.04,CW*0.044,CH*0.04);ctx.strokeRect(PMX-CW*0.022,PMYT-CH*0.04,CW*0.044,CH*0.04)
      lbB('PR',PMX,PMYT-CH*0.048,CV.success,cl(CW*0.009,7,9))
      if(ld.probeY>0){
        const pTip=PMYT+(LY0+CH*0.07-PMYT)*Math.min(ld.probeY/0.80,1),pW=cl(CW*0.007,4,7)
        ctx.fillStyle='#37474F';ctx.fillRect(PMX-pW/2,PMYT,pW,pTip-PMYT)
        ctx.fillStyle=ld.probeDone?`rgba(87,171,90,${0.88+0.12*Math.sin(t*10)})`:'rgba(255,180,0,0.80)';ctx.beginPath();ctx.arc(PMX,pTip,6,0,Math.PI*2);ctx.fill()
        if(ld.probeDone){const pg2=ctx.createRadialGradient(PMX,pTip,1,PMX,pTip,24);pg2.addColorStop(0,`rgba(87,171,90,${0.55+0.35*Math.sin(t*8)})`);pg2.addColorStop(1,'rgba(87,171,90,0)');ctx.fillStyle=pg2;ctx.beginPath();ctx.arc(PMX,pTip,24,0,Math.PI*2);ctx.fill();lbB(`${Math.round(ld.temp)}°C`,PMX,pTip-30,CV.success,cl(CW*0.012,10,13));lb('SAMPLE ✓',PMX,pTip-16,CV.success,cl(CW*0.009,7,9))}
      }
      // Alloy hopper
      const AHX=cx+LW*0.44,AHY=CH*0.042
      ctx.fillStyle='#1e2535';ctx.strokeStyle='#2c4055';ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(AHX-CW*0.03,AHY);ctx.lineTo(AHX+CW*0.03,AHY);ctx.lineTo(AHX+CW*0.025,AHY+CH*0.065);ctx.lineTo(AHX-CW*0.025,AHY+CH*0.065);ctx.closePath();ctx.fill();ctx.stroke()
      ctx.fillStyle='rgba(190,155,60,0.65)';ctx.fillRect(AHX-CW*0.025+4,AHY+6,CW*0.05-8,CH*0.05)
      lbB('FA',AHX,AHY-4,CV.yellow,cl(CW*0.009,7,9))
      ;(ld.alloyParticles||[]).forEach(p=>{ctx.globalAlpha=p.life*0.85;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=p.life*0.25;ctx.fillStyle='rgba(255,225,100,0.8)';ctx.beginPath();ctx.arc(p.x,p.y,p.r*2.2,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1
      // Data box
      const dbX=cx-LW*0.70,dbY=LY1+CH*0.007,dbW=LW*1.40,dbH=CH*0.100
      ctx.fillStyle='rgba(4,8,18,0.92)';ctx.fillRect(dbX,dbY,dbW,dbH);ctx.strokeStyle=ld.arcOn?CV.accent:ld.p1On||ld.p2On?CV.blue:'#1e3040';ctx.lineWidth=0.8;ctx.strokeRect(dbX,dbY,dbW,dbH)
      lbB(`LF${idx+1}`,dbX+10,dbY+14,CV.accent,cl(CW*0.013,11,15),'left');lbB(ld.status||'',dbX+dbW-8,dbY+12,ld.complete?CV.success:ld.arcOn?CV.accent:ld.p1On||ld.p2On?CV.blue:CV.muted,cl(CW*0.009,7,9),'right')
      const tf=cl((ld.temp-1540)/(ld.targetT-1540),0,1);ctx.fillStyle='#0a1520';ctx.fillRect(dbX+5,dbY+dbH-16,dbW-10,10);ctx.fillStyle=tf>0.95?CV.success:tf>0.65?CV.accent:CV.blue;ctx.fillRect(dbX+5,dbY+dbH-16,(dbW-10)*tf,10);ctx.strokeStyle='#1a3050';ctx.lineWidth=0.3;ctx.strokeRect(dbX+5,dbY+dbH-16,dbW-10,10)
      ;[[`T: ${Math.round(ld.temp)}°C`,`→ ${ld.targetT}°C`],[`[C]:${ld.C.toFixed(3)}%  [S]:${ld.S.toFixed(4)}%`,''],[`[Mn]:${ld.Mn.toFixed(3)}%  [Al]:${ld.Al.toFixed(3)}%`,'']].forEach((r,ri)=>{
        const ry=dbY+22+ri*CH*0.026;ctx.fillStyle='rgba(200,218,230,0.95)';ctx.font=`bold ${cl(CW*0.012,10,13)}px monospace`;ctx.textAlign='left';ctx.fillText(r[0],dbX+10,ry)
        if(r[1]){ctx.fillStyle='rgba(120,160,185,0.80)';ctx.font=`${cl(CW*0.011,9,12)}px monospace`;ctx.textAlign='right';ctx.fillText(r[1],dbX+dbW-10,ry)}
      })
      lbB(`LADLE FURNACE ${idx+1}`,cx,LY0-CH*0.028,CV.muted,cl(CW*0.009,6,10))
    })
    ctx.fillStyle='rgba(4,8,18,0.80)';ctx.fillRect(0,0,CW,CH*0.024)
    lbB('TWIN LF — AI SCHEDULE CONTROLLED',CW/2,CH*0.016,CV.cyan,cl(CW*0.009,7,11))
    // ── TIMELINE BAR inside canvas ─────────────────────────────────────
    if(sim._schedule){
      const TLY=CH*0.63, TLH=CH*0.22
      // Background
      ctx.fillStyle='rgba(4,8,18,0.92)'; ctx.fillRect(0,TLY,CW,TLH)
      ctx.strokeStyle='#1a2d45'; ctx.lineWidth=1.5
      ctx.beginPath(); ctx.moveTo(0,TLY); ctx.lineTo(CW,TLY); ctx.stroke()

      const steps=sim._schedule.timeline||[]
      if(steps.length>0){
        const stepW=CW/steps.length
        const dotY=TLY+TLH*0.30   // dot row
        const namY=TLY+TLH*0.58   // step name row
        const timY=TLY+TLH*0.80   // time row
        const namSz=cl(CW*0.012,10,14)
        const timSz=cl(CW*0.010,8,11)

        steps.forEach((s,i)=>{
          const sx=stepW*i+stepW/2
          const done=i<(sim._stepIdx||0)
          const active=i===(sim._stepIdx||0)
          const dotCol=done?'#57ab5a':active?'#FF8F00':'#263340'
          const dotR=active?11:done?8:6

          // Connector line between dots
          if(i>0){
            ctx.strokeStyle=done?'rgba(87,171,90,0.45)':'rgba(30,50,70,0.7)'
            ctx.lineWidth=done?2:1.5
            ctx.beginPath()
            ctx.moveTo(stepW*(i-1)+stepW/2, dotY)
            ctx.lineTo(sx, dotY)
            ctx.stroke()
          }

          // Dot
          ctx.fillStyle=dotCol
          ctx.beginPath(); ctx.arc(sx,dotY,dotR,0,Math.PI*2); ctx.fill()
          if(active){
            ctx.strokeStyle='#FF8F00'; ctx.lineWidth=2.5
            ctx.beginPath(); ctx.arc(sx,dotY,dotR+3,0,Math.PI*2); ctx.stroke()
            // Pulse ring
            const pulse=0.5+0.5*Math.sin(sim.t*6)
            ctx.strokeStyle=`rgba(255,143,0,${pulse*0.4})`; ctx.lineWidth=1.5
            ctx.beginPath(); ctx.arc(sx,dotY,dotR+7,0,Math.PI*2); ctx.stroke()
          }
          if(done){
            // Checkmark dot
            ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.font=`bold ${cl(CW*0.009,7,10)}px monospace`
            ctx.textAlign='center'; ctx.fillText('✓',sx,dotY+3.5)
          }

          // Step name — LINE 1 (bold, colored)
          const raw=(s.label||'').split(':').pop().trim()
          // Split into 2 words max per line
          const words=raw.split(' ')
          const half=Math.ceil(words.length/2)
          const line1=words.slice(0,half).join(' ')
          const line2=words.slice(half).join(' ')
          const txtCol=active?'#FF8F00':done?'#57ab5a':'#78909C'
          ctx.fillStyle=txtCol
          ctx.font=`${active?'bold ':''}${namSz}px monospace`
          ctx.textAlign='center'
          ctx.fillText(line1, sx, namY-(line2?namSz*0.5:0))
          if(line2) ctx.fillText(line2, sx, namY+(namSz*0.55))

          // Time — LINE 2 (subtle)
          ctx.fillStyle=active?'rgba(255,143,0,0.65)':done?'rgba(87,171,90,0.55)':'#37474F'
          ctx.font=`${timSz}px monospace`
          ctx.fillText(`${s.tMin}m`, sx, timY)
        })

        // Progress bar
        const pct=Math.min(1,(sim._stepIdx||0)/steps.length)
        const pbY=TLY+TLH*0.91, pbH=7
        ctx.fillStyle='#0d1828'; ctx.fillRect(12,pbY,CW-24,pbH)
        const pbGrd=ctx.createLinearGradient(12,0,CW-24,0)
        pbGrd.addColorStop(0,'#29B6F6'); pbGrd.addColorStop(0.5,'#57ab5a'); pbGrd.addColorStop(1,'#FF8F00')
        ctx.fillStyle=pbGrd; ctx.fillRect(12,pbY,(CW-24)*pct,pbH)
        ctx.strokeStyle='#1a3050'; ctx.lineWidth=0.5; ctx.strokeRect(12,pbY,CW-24,pbH)
        // Progress label
        lbB(`${Math.round(pct*100)}% complete  ·  step ${sim._stepIdx||0}/${steps.length}`,CW/2,pbY+pbH+12,'#37474F',cl(CW*0.009,7,10))
      }
    }
    // Footer
    ctx.fillStyle='rgba(4,8,18,0.92)'; ctx.fillRect(0,CH-16,CW,16)
    ctx.fillStyle='#2c4055';ctx.font=`${cl(CW*0.009,7,9)}px monospace`;ctx.textAlign='left'
    ctx.fillText(`TWIN LF  |  LF1: ${Math.round(sim.ladles[0]?.temp||0)}°C  [S]:${sim.ladles[0]?.S.toFixed(4)||'--'}%  |  ${new Date().toLocaleTimeString()}`,8,CH-4)
    }catch(e){console.error('LFCanvas:',e)}
    rafRef.current=requestAnimationFrame(draw)
  },[W,H,running])

  useEffect(()=>{rafRef.current=requestAnimationFrame(draw);return()=>cancelAnimationFrame(rafRef.current)},[draw])
  return <canvas ref={canvasRef} style={{width:'100%',height:'100%',display:'block'}}/>
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function AILFModel() {
  const [grade,   setGrade]   = useState('IS 2062 E250')
  const [heatWt,  setHeatWt]  = useState(130)
  const [bofT,    setBofT]    = useState(1622)
  const [bofC,    setBofC]    = useState(0.055)
  const [bofMn,   setBofMn]   = useState(0.12)
  const [bofSi,   setBofSi]   = useState(0.006)
  const [bofS,    setBofS]    = useState(0.028)
  const [bofP,    setBofP]    = useState(0.018)
  const [bofAl,   setBofAl]   = useState(0.002)
  const [transMVA,setMVA]     = useState(25)
  const [slagB,   setSlagB]   = useState(3.2)
  const [voltStp, setVoltStp] = useState(7)
  const [castR,   setCastR]   = useState('6-strand billet')

  const [tab,      setTab]      = useState('input')
  const [schedule, setSchedule] = useState(null)
  const [simState, setSimState] = useState(null)
  const [simRun,   setSimRun]   = useState(false)
  const [soundOn,  setSoundOn]  = useState(true)
  const [elapsed,  setElapsed]  = useState(0)
  const [stepIdx,  setStepIdx]  = useState(0)
  const [CW,setCW] = useState(800)
  const [CH,setCH] = useState(600)

  const simRef    = useRef(null)
  const schedRef  = useRef(null)
  const stepRef   = useRef(0)
  const rafPhys   = useRef(null)
  const containerRef = useRef(null)
  const timerRef  = useRef(null)

  useEffect(()=>{
    if(!containerRef.current)return
    const ro=new ResizeObserver(entries=>{const e=entries[0];if(e){setCW(Math.round(e.contentRect.width));setCH(Math.round(e.contentRect.height))}})
    ro.observe(containerRef.current)
    const r=containerRef.current.getBoundingClientRect();if(r.width>0){setCW(Math.round(r.width));setCH(Math.round(r.height))}
    return()=>ro.disconnect()
  },[])

  const g = GRADES[grade] || GRADES['Custom']

  const applyGrade = name => { setGrade(name) }

  const generateSchedule = () => {
    SOUND.stopAll()
    const tgt = { T:g.targetT, SH:g.SH, C:g.C, Mn:g.Mn, Si:g.Si, S:g.S, P:g.P||0.015, Al:g.Al }
    const bof = { T:bofT, C:bofC, Mn:bofMn, Si:bofSi, S:bofS, P:bofP, Al:bofAl }
    const cfg = { weight:heatWt, transMVA, slagBasicity:slagB, voltageStep:voltStp, liqT:g.liqT||1540, castRoute:castR }
    const sched = computeSchedule(bof, tgt, cfg)
    schedRef.current = sched
    setSchedule(sched)
    const s = initSimState(bof, tgt)
    s._mva = transMVA
    simRef.current = s
    setSimState({...s,ladles:[...s.ladles]})
    stepRef.current = 0; setStepIdx(0); setElapsed(0)
    setTab('plan')
  }

  // Physics tick
  const doTick = useCallback(()=>{
    const sim=simRef.current; if(!sim)return
    const sched=schedRef.current; if(!sched)return
    sim.t+=0.016; sim.frame++
    const minNow=sim.t/60
    // Advance steps
    while(stepRef.current<sched.timeline.length){
      const step=sched.timeline[stepRef.current]
      if(minNow<step.tMin)break
      const ld=sim.ladles[0]
      if(step.type==='arc'){const a=sched.arcSteps[step.idx];ld.arcOn=true;ld.status=a?.name||'ARCING';ld.arcEndMin=minNow+(a?.min||6);SOUND.startArc('lf1_arc',transMVA*920)}
      if(step.type==='purge'){const p=sched.purgeSteps[step.idx];ld.p1On=true;ld.p1Flow=p?.p1||200;ld.p2On=true;ld.p2Flow=p?.p2||180;ld.status=p?.name||'PURGING';ld.purgeEndMin=minNow+(p?.min||5);SOUND.startPurge('lf1_p1',p?.p1||200);SOUND.startPurge('lf1_p2',p?.p2||180)}
      if(step.type==='alloy'){ld.status='ALLOY: '+(sched.alloys[step.idx]?.name||'');ld.alloyAddMin=minNow;SOUND.playBurst('alloy')}
      if(step.type==='wire'){ld.lanceY=0.01;ld.lanceTimer=0;ld.status='WIRE: '+(sched.wires[step.idx]?.type||'CaSi');SOUND.playBurst('lance');setTimeout(()=>SOUND.playBurst('wire'),800)}
      if(step.type==='probe'){ld.probeY=0.01;ld.probeDone=false;ld.probeFrames=0;ld.status='TEMP MEAS.';SOUND.playBurst('probe')}
      stepRef.current++; setStepIdx(stepRef.current)
    }

    // After all scheduled steps done — keep soft purge running until complete
    const ld0=sim.ladles[0]
    const allStepsDone = stepRef.current >= sched.timeline.length
    if(allStepsDone && !ld0.complete){
      // Ensure soft purge is on
      if(!ld0.p1On&&!ld0.p2On){ld0.p1On=true;ld0.p1Flow=35;ld0.p2On=true;ld0.p2Flow=35}
      // If temp still short, add one more arc pass
      if(ld0.temp<ld0.targetT-6&&!ld0.arcOn&&!ld0.extraArcDone){
        ld0.arcOn=true; ld0.status='TRIM ARC (auto)'; ld0.arcEndMin=minNow+3; ld0.extraArcDone=true; SOUND.startArc('lf1_arc',transMVA*920)
      }
      // If S still high, add probe + wire again
      if(ld0.S>sched.purgeSteps[3]?.minS+0.002&&!ld0.extraWireDone&&!ld0.lanceY){
        ld0.lanceY=0.01; ld0.status='EXTRA WIRE (desulph)'; ld0.extraWireDone=true
      }
      ld0.status=ld0.status||'FINAL HOLD — PURGING'
    }

    // Auto-stop arc/purge at scheduled end times
    sim.ladles.forEach(ld=>{
      if(ld.arcOn&&ld.arcEndMin&&minNow>=ld.arcEndMin){ld.arcOn=false;ld.arcEndMin=null;if(!ld.status?.includes('ALLOY')&&!ld.complete)ld.status='ARC DONE';SOUND.stopArc('lf1_arc')}
      if((ld.p1On||ld.p2On)&&ld.purgeEndMin&&minNow>=ld.purgeEndMin){
        // After purge ends, keep very soft purge (don't turn off completely)
        ld.p1Flow=Math.max(35,Math.round((ld.p1Flow||0)*0.15))
        ld.p2Flow=Math.max(35,Math.round((ld.p2Flow||0)*0.15))
        ld.purgeEndMin=null
        if(!ld.complete)ld.status='HOLDING — SOFT PURGE'
        SOUND.stopPurge('lf1_p1');SOUND.stopPurge('lf1_p2')
        SOUND.startPurge('lf1_soft',35)
      }
      if(ld.alloyAddMin&&minNow>ld.alloyAddMin+1.5){ld.alloyAddMin=null;if(ld.status?.startsWith('ALLOY'))ld.status='ALLOY DISSOLVED'}
    })
    // Physics
    const tgt=g
    sim.ladles.forEach(ld=>{
      const pwr=ld.arcOn?transMVA*920:0
      ld.temp=cl(ld.temp+(pwr*0.92/(heatWt*4.18*1.2))*0.016-(!ld.arcOn?0.026:0),1500,1740)
      if(ld.arcOn){ld.S=Math.max(tgt.S*0.65,ld.S-0.000022);ld.C=Math.max(tgt.C*0.92,ld.C-0.000005);ld.slagFoam=cl(ld.slagFoam+0.0012,0,0.88)}
      if(ld.p1On||ld.p2On){ld.S=Math.max(tgt.S*0.50,ld.S-0.00007);ld.slagFoam=cl(ld.slagFoam-0.0007,0.05,0.9)}
      if(ld.lanceY>0.6)ld.S=Math.max(tgt.S*0.38,ld.S-0.00010)
      if(ld.status?.startsWith('ALLOY')){ld.Mn=cl(ld.Mn+0.0007,0,tgt.Mn+0.06);ld.Si=cl(ld.Si+0.0003,0,tgt.Si+0.06)}
      ld.Al=cl(ld.Al+0.000012,0,tgt.Al+0.012)
      // Electrode regulation
      if(ld.arcOn){
        const tF=0.72+0.010*Math.sin(sim.t*3)
        ld.electrodeY=ld.electrodeY.map((ey,ei)=>{const v=(tF+0.014*Math.sin(sim.t*5+ei*2.1)-ey)*0.04;ld.electrodeVel[ei]=v;ld.arcLen[ei]=Math.round(128+transMVA*5.5+Math.random()*14);return cl(ey+v,0.05,0.88)})
        if(sim.frame%3===0){
          const cx_spark=CW*0.22,lw_spark=CW*0.19
          ;[0,1,2].forEach(ei=>{if(Math.random()<0.55){const ex=cx_spark+(ei-1)*lw_spark*0.22;const rfI=CH*0.27-CH*0.022+CH*0.005;const sS=CH*0.27+CH*0.038;const ef=cl(ld.electrodeY[ei],0,1);const eyB=rfI+(sS-rfI)*ef*0.85;ld.sparks.push({x:ex+(Math.random()-0.5)*22,y:eyB+(sS-eyB)*0.4+(Math.random()-0.5)*12,vx:(Math.random()-0.5)*8,vy:-Math.random()*5-0.5,life:1,r:0.8+Math.random()*2.5,col:Math.random()>0.35?'rgba(255,255,128,0.92)':'rgba(80,160,255,0.88)'})
          }})
        }
      } else {
        ld.electrodeY=ld.electrodeY.map(ey=>Math.max(0.10,ey-0.016))
        ld.slagFoam=Math.max(0.05,ld.slagFoam-0.001)
      }
      // Bubbles
      // Bubble spawn at BOTTOM of ladle interior, rise UPWARD (negative vy)
      const cx_=ld===sim.ladles[0]?CW*0.22:CW*0.74
      const lw_=CW*0.19
      const LY0_=CH*0.27       // top of ladle
      const LY1_=LY0_+CH*0.23  // bottom of ladle
      const LIN_=cl(CW*0.014,10,18)
      const BATH_H_=CH*0.38*0.71  // steel bath height
      const spawnY = LY1_ - LIN_ - 4  // bottom of refractory = plug position
      if(ld.p1On&&sim.frame%2===0){
        const speed=cl(ld.p1Flow/180,0.3,2.2)
        ld.plug1Bubbles.push({
          x:cx_-lw_*0.28+(Math.random()-0.5)*lw_*0.05,
          y:spawnY,
          vx:(Math.random()-0.5)*1.2,
          vy:-(1.6+Math.random()*3.0)*speed,  // NEGATIVE = rising
          life:1, r:2.5+Math.random()*4,
          col:`rgba(80,200,255,${0.60+Math.random()*0.30})`
        })
      }
      if(ld.p2On&&sim.frame%2===0){
        const speed=cl(ld.p2Flow/180,0.3,2.2)
        ld.plug2Bubbles.push({
          x:cx_+lw_*0.28+(Math.random()-0.5)*lw_*0.05,
          y:spawnY,
          vx:(Math.random()-0.5)*1.2,
          vy:-(1.6+Math.random()*3.0)*speed,  // NEGATIVE = rising
          life:1, r:2.5+Math.random()*4,
          col:`rgba(100,215,255,${0.60+Math.random()*0.30})`
        })
      }
      // LY0_, LY1_, lw_, cx_ already declared above
      if(ld.status?.startsWith('ALLOY')&&sim.frame%3===0){const hx=cx_+lw_*0.44;ld.alloyParticles.push({x:hx+(Math.random()-0.5)*lw_*0.15,y:LY0_+CH*0.005,vy:4+Math.random()*5,life:1,r:2.5+Math.random()*3,col:Math.random()>0.5?'rgba(200,165,60,0.88)':'rgba(180,145,50,0.78)'})}
      // Lance/probe
      if(ld.lanceY>0){if(ld.lanceY<1){ld.lanceY=Math.min(1,ld.lanceY+0.006)}else{ld.lanceTimer=(ld.lanceTimer||0)+1;if(ld.lanceTimer>90){ld.lanceY=Math.max(0,ld.lanceY-0.012);if(ld.lanceY<=0){ld.lanceY=0;ld.lanceTimer=0;if(ld.status?.startsWith('WIRE'))ld.status='WIRE DONE'}}}}
      if(ld.probeY>0&&!ld.probeDone){ld.probeY=Math.min(0.85,ld.probeY+0.010);if(ld.probeY>=0.80)ld.probeDone=true}
      if(ld.probeDone){ld.probeFrames=(ld.probeFrames||0)+1;if(ld.probeFrames>110){ld.probeY=Math.max(0,ld.probeY-0.018);if(ld.probeY<=0){ld.probeY=0;ld.probeFrames=0;ld.probeDone=false}}}
      // Mark complete but keep sim running — user clicks PAUSE when done
      // Intermediate status messages
      const tNear = ld.temp >= ld.targetT-15 && ld.temp < ld.targetT-2
      const sNear = ld.S <= tgt.S*1.5 && ld.S > tgt.S+0.0015
      if(tNear && !ld.complete && !ld.arcOn && !ld.status?.includes('ALLOY') && !ld.status?.includes('WIRE') && !ld.status?.includes('MEAS'))
        ld.status = `NEARING TARGET — ${Math.round(ld.temp)}°C`
      // Completion: temp reached, S in spec, Mn in range
      if(ld.temp>=ld.targetT-2 && ld.S<=tgt.S+0.0015 && !ld.complete){
        ld.complete=true; ld.status='COMPLETE ✓ — READY FOR CAST'
        ld.arcOn=false  // ensure arc off
        ld.p1On=true; ld.p1Flow=35; ld.p2On=true; ld.p2Flow=35  // soft purge hold
        SOUND.stopArc('lf1_arc')
        SOUND.stopPurge('lf1_p1');SOUND.stopPurge('lf1_p2')
        SOUND.startPurge('lf1_soft',35)
        SOUND.playBurst('complete')
      }
      // Cleanup
      const maxY=LY1_*0.85+LY0_*0.15, LY0v=LY0_
      ld.sparks=(ld.sparks||[]).filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.24,life:p.life-0.052}))
      // Bubbles rise upward (vy negative) — remove when they reach slag surface (LY0v + small offset)
      ld.plug1Bubbles=(ld.plug1Bubbles||[]).filter(p=>p.life>0&&p.y>LY0v+CH*0.028).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.010,r:Math.min(p.r+0.04,8)}))
      ld.plug2Bubbles=(ld.plug2Bubbles||[]).filter(p=>p.life>0&&p.y>LY0v+CH*0.028).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.010,r:Math.min(p.r+0.04,8)}))
      ld.alloyParticles=(ld.alloyParticles||[]).filter(p=>p.life>0&&p.y<LY1_+20).map(p=>({...p,y:p.y+p.vy,life:p.life-0.016}))
    })
    sim._mva=transMVA
    sim._schedule=schedRef.current
    sim._stepIdx=stepRef.current
    setSimState({...sim,ladles:sim.ladles.map(l=>({...l,sparks:[...l.sparks],plug1Bubbles:[...l.plug1Bubbles],plug2Bubbles:[...l.plug2Bubbles],alloyParticles:[...l.alloyParticles],electrodeY:[...l.electrodeY],arcLen:[...l.arcLen]}))})
  },[transMVA,heatWt,g,CW,CH])

  useEffect(()=>{
    if(!simRun){cancelAnimationFrame(rafPhys.current);return}
    let last=0
    const loop=ts=>{if(ts-last>33){doTick();last=ts}; rafPhys.current=requestAnimationFrame(loop)}
    rafPhys.current=requestAnimationFrame(loop)
    return()=>cancelAnimationFrame(rafPhys.current)
  },[simRun,doTick])

  useEffect(()=>{
    if(simRun)timerRef.current=setInterval(()=>setElapsed(t=>t+1),1000)
    else clearInterval(timerRef.current)
    return()=>clearInterval(timerRef.current)
  },[simRun])

  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const ld0=simState?.ladles?.[0]

  const Col=({c,v,cc})=>(<div style={{background:'#0a1520',border:`1px solid ${cc||CV.border}33`,borderRadius:4,padding:'4px 8px',textAlign:'center'}}>
    <div style={{fontSize:8,color:CV.muted}}>{c}</div>
    <div style={{fontSize:12,fontWeight:700,color:cc||CV.cyan,fontFamily:'monospace'}}>{v}</div>
  </div>)

  return(
    <div style={{height:'100dvh',background:CV.bg,color:CV.text,fontFamily:'monospace',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{background:'#060a10',borderBottom:`1px solid ${CV.border}`,padding:'0 12px',height:50,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:20}}>🏭</span>
          <div>
            <div style={{fontSize:11,fontWeight:700}}>AI DYNAMIC LF MODEL</div>
            <div style={{fontSize:8,color:CV.muted}}>LOCAL METALLURGICAL ENGINE · NO API TOKENS · REAL-TIME SIMULATION</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {ld0&&[{l:'TEMP',v:`${Math.round(ld0.temp)}°C`,c:CV.accent},{l:'[S]',v:`${ld0.S.toFixed(4)}%`,c:CV.purple},{l:'[Mn]',v:`${ld0.Mn.toFixed(3)}%`,c:CV.yellow},{l:'TIME',v:fmt(elapsed),c:simRun?CV.success:CV.muted}].map(({l,v,c})=>(
            <div key={l} style={{textAlign:'center'}}><div style={{fontSize:7,color:CV.muted}}>{l}</div><div style={{fontSize:11,fontWeight:700,color:c}}>{v}</div></div>
          ))}
          {['input','plan','simulation'].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:'4px 10px',borderRadius:4,border:`1px solid ${tab===t?CV.accent:CV.border}`,background:tab===t?CV.accent+'22':'transparent',color:tab===t?CV.accent:CV.muted,fontSize:9,fontWeight:700,cursor:'pointer',textTransform:'uppercase'}}>
              {t==='input'?'⚙ Input':t==='plan'?'📋 Plan':'🔬 Sim'}
            </button>
          ))}
          <button onClick={generateSchedule} style={{padding:'5px 14px',borderRadius:4,border:`2px solid ${CV.cyan}`,background:'rgba(57,197,207,0.15)',color:CV.cyan,fontSize:10,fontWeight:700,cursor:'pointer'}}>⚙ COMPUTE PLAN</button>
          {schedule&&!simRun&&<button onClick={()=>{if(simRef.current){simRef.current.t=0;setElapsed(0);stepRef.current=0;setStepIdx(0)};setSimRun(true);setTab('simulation')}} style={{padding:'5px 14px',borderRadius:4,border:`1px solid ${CV.success}`,background:'rgba(87,171,90,0.15)',color:CV.success,fontSize:10,fontWeight:700,cursor:'pointer'}}>▶ RUN SIM</button>}
          <button onClick={()=>{SOUND.enabled=!SOUND.enabled;if(!SOUND.enabled)SOUND.stopAll();setSoundOn(v=>!v)}} style={{padding:'5px 10px',borderRadius:4,border:`1px solid ${soundOn?CV.cyan:CV.border}`,background:soundOn?'rgba(57,197,207,0.15)':'transparent',color:soundOn?CV.cyan:CV.muted,fontSize:10,fontWeight:700,cursor:'pointer'}} title="Toggle sound">{soundOn?'🔊':'🔇'}</button>
          {simRun&&<button onClick={()=>{setSimRun(false);SOUND.stopAll()}} style={{padding:'5px 12px',borderRadius:4,border:`1px solid ${CV.danger}`,background:'rgba(229,83,73,0.15)',color:CV.danger,fontSize:10,fontWeight:700,cursor:'pointer'}}>⏸ PAUSE</button>}
        </div>
      </div>

      <div style={{flex:1,overflow:'hidden',display:'flex'}}>
        {/* Left input panel */}
        <div style={{width:260,background:CV.panel,borderRight:`1px solid ${CV.border}`,overflow:'auto',flexShrink:0,padding:12}}>
          <div style={{fontSize:11,color:CV.muted,marginBottom:5,letterSpacing:'0.08em'}}>STEEL GRADE</div>
          <select value={grade} onChange={e=>applyGrade(e.target.value)} style={{width:'100%',padding:'7px 10px',borderRadius:5,border:`1px solid ${CV.accent}66`,background:'#0d1520',color:CV.accent,fontSize:13,fontWeight:700,fontFamily:'monospace',marginBottom:12}}>
            {Object.keys(GRADES).map(g=><option key={g}>{g}</option>)}
          </select>

          {[
            ['🔥 BOF TAP',CV.accent,[[heatWt,setHeatWt,'Weight','t',50,380,5],[bofT,setBofT,'Tap Temp','°C',1550,1750,1]]],
            ['⚗ BOF CHEMISTRY','#FF7043',[[bofC,setBofC,'[C]%','%',0.02,0.80,0.001],[bofMn,setBofMn,'[Mn]%','%',0.05,1.80,0.01],[bofSi,setBofSi,'[Si]%','%',0,0.50,0.001],[bofS,setBofS,'[S]%','%',0.005,0.060,0.001],[bofP,setBofP,'[P]%','%',0.005,0.040,0.001],[bofAl,setBofAl,'[Al]%','%',0,0.050,0.001]]],
            ['⚙ LF CONFIG',CV.cyan,[[transMVA,setMVA,'MVA','MVA',10,80,1],[slagB,setSlagB,'Slag B2','B2',1.5,6,0.1],[voltStp,setVoltStp,'V Step','',1,15,1]]],
          ].map(([title,col,rows])=>(
            <div key={title} style={{background:CV.bg,border:`1px solid ${col}33`,borderRadius:6,padding:10,marginBottom:10}}>
              <div style={{fontSize:10,color:col,fontWeight:700,letterSpacing:'0.08em',marginBottom:8}}>{title}</div>
              {rows.map(([val,set,label,unit,min,max,step])=>(
                <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                  <span style={{fontSize:11,color:CV.muted}}>{label}</span>
                  <div style={{display:'flex',alignItems:'center',gap:3}}>
                    <input type="number" value={val} min={min} max={max} step={step} onChange={e=>set(+e.target.value)} style={{width:68,padding:'3px 6px',borderRadius:3,border:`1px solid ${CV.border}`,background:'#0d1520',color:col,fontSize:12,fontFamily:'monospace',fontWeight:700,textAlign:'right'}}/>
                    <span style={{fontSize:8,color:CV.muted,width:24}}>{unit}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}

          <div style={{marginBottom:10}}>
            <div style={{fontSize:9,color:CV.muted,marginBottom:4}}>CASTING ROUTE</div>
            <select value={castR} onChange={e=>setCastR(e.target.value)} style={{width:'100%',padding:'6px 8px',borderRadius:4,border:`1px solid ${CV.border}`,background:'#0d1520',color:CV.cyan,fontSize:11}}>
              {['6-strand billet','4-strand billet','2-strand bloom','Slab caster'].map(r=><option key={r}>{r}</option>)}
            </select>
          </div>

          {/* Grade targets */}
          <div style={{background:CV.bg,border:`1px solid ${CV.success}33`,borderRadius:6,padding:10,marginBottom:10}}>
            <div style={{fontSize:8,color:CV.success,fontWeight:700,letterSpacing:'0.1em',marginBottom:8}}>🎯 TARGETS (from grade)</div>
            {[['T',g.targetT+'°C'],['SH',g.SH+'°C'],['[C]',g.C+'%'],['[Mn]',g.Mn+'%'],['[Si]',g.Si+'%'],['[S]',g.S+'%'],['[Al]',g.Al+'%']].map(([k,v])=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',borderBottom:`1px solid ${CV.border}`}}>
                <span style={{fontSize:11,color:CV.muted}}>{k}</span>
                <span style={{fontSize:11,fontWeight:700,color:CV.success,fontFamily:'monospace'}}>{v}</span>
              </div>
            ))}
          </div>

          {/* Live chemistry */}
          {simState&&(
            <div style={{background:CV.bg,border:`1px solid ${CV.cyan}33`,borderRadius:6,padding:10}}>
              <div style={{fontSize:8,color:CV.cyan,fontWeight:700,marginBottom:8}}>⚗ LIVE CHEMISTRY</div>
              {[['[C]',simState.ladles[0].C.toFixed(3),g.C,CV.blue],['[Mn]',simState.ladles[0].Mn.toFixed(3),g.Mn,CV.yellow],['[S]',simState.ladles[0].S.toFixed(4),g.S,CV.danger],['[Al]',simState.ladles[0].Al.toFixed(3),g.Al,'#90A4AE']].map(([el,val,tgt,c])=>(
                <div key={el} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:`1px solid ${CV.border}`}}>
                  <span style={{fontSize:11,color:CV.muted}}>{el}</span>
                  <div><span style={{fontSize:12,color:c,fontWeight:700}}>{val}%</span><span style={{fontSize:10,color:'#37474F',marginLeft:4}}>/{tgt}%</span></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right content */}
        <div ref={containerRef} style={{flex:1,overflow:'hidden',position:'relative',background:CV.bg}}>

          {/* PLAN tab */}
          {tab==='plan'&&schedule&&(
            <div style={{padding:16,overflow:'auto',height:'100%'}}>
              <div style={{fontSize:13,fontWeight:700,color:CV.cyan,marginBottom:14}}>📋 LF Treatment Plan — {grade}</div>
              {/* Summary row */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:16}}>
                <Col c="LF OUT TEMP" v={`${schedule.lfOutTemp}°C`} cc={CV.accent}/>
                <Col c="SUPERHEAT" v={`${schedule.superheat}°C`} cc={CV.success}/>
                <Col c="HEAT TIME" v={`${schedule.heatTime}min`} cc={CV.cyan}/>
                <Col c="ARC ENERGY" v={`${schedule.totalKWh}kWh`} cc={CV.purple}/>
                <Col c="DESULPH" v={`${schedule.desulphRatio}x`} cc={CV.danger}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                {/* Arc */}
                <div style={{background:'#0a1218',border:`1px solid ${CV.accent}33`,borderRadius:8,padding:12}}>
                  <div style={{fontSize:10,fontWeight:700,color:CV.accent,marginBottom:8}}>⚡ ARC SCHEDULE</div>
                  <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:4,marginBottom:4}}>
                    {['Stage','kW','min','kWh'].map(h=><div key={h} style={{fontSize:8,color:CV.muted,fontWeight:700}}>{h}</div>)}
                  </div>
                  {schedule.arcSteps.map((s,i)=>(
                    <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:4,padding:'4px 0',borderBottom:`1px solid ${CV.border}`}}>
                      <div style={{fontSize:10,color:CV.text}}>{s.name}</div>
                      <div style={{fontSize:10,color:CV.accent,fontFamily:'monospace'}}>{s.kw}</div>
                      <div style={{fontSize:10,color:CV.yellow,fontFamily:'monospace'}}>{s.min}</div>
                      <div style={{fontSize:10,color:CV.purple,fontFamily:'monospace'}}>{s.kwh}</div>
                    </div>
                  ))}
                  <div style={{marginTop:6,display:'flex',justifyContent:'space-between'}}>
                    <span style={{fontSize:9,color:CV.muted}}>Total arc time</span>
                    <span style={{fontSize:10,color:CV.accent,fontWeight:700}}>{schedule.arcSteps.reduce((a,s)=>a+s.min,0)} min</span>
                  </div>
                </div>
                {/* Purge */}
                <div style={{background:'#0a1218',border:`1px solid ${CV.blue}33`,borderRadius:8,padding:12}}>
                  <div style={{fontSize:10,fontWeight:700,color:CV.blue,marginBottom:8}}>💨 PURGE SCHEDULE</div>
                  <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:4,marginBottom:4}}>
                    {['Stage','P1','P2','min'].map(h=><div key={h} style={{fontSize:8,color:CV.muted,fontWeight:700}}>{h}</div>)}
                  </div>
                  {schedule.purgeSteps.map((s,i)=>(
                    <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:4,padding:'4px 0',borderBottom:`1px solid ${CV.border}`}}>
                      <div style={{fontSize:10,color:CV.text}}>{s.name}</div>
                      <div style={{fontSize:10,color:CV.blue,fontFamily:'monospace'}}>{s.p1}</div>
                      <div style={{fontSize:10,color:CV.cyan,fontFamily:'monospace'}}>{s.p2}</div>
                      <div style={{fontSize:10,color:CV.yellow,fontFamily:'monospace'}}>{s.min}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                {/* Alloys */}
                <div style={{background:'#0a1218',border:`1px solid ${CV.yellow}33`,borderRadius:8,padding:12}}>
                  <div style={{fontSize:10,fontWeight:700,color:CV.yellow,marginBottom:8}}>🧪 ALLOY ADDITIONS</div>
                  <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 2fr',gap:4,marginBottom:4}}>
                    {['Alloy','kg','Rec','Timing'].map(h=><div key={h} style={{fontSize:8,color:CV.muted,fontWeight:700}}>{h}</div>)}
                  </div>
                  {schedule.alloys.map((a,i)=>(
                    <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 2fr',gap:4,padding:'4px 0',borderBottom:`1px solid ${CV.border}`}}>
                      <div style={{fontSize:10,color:CV.text}}>{a.name}</div>
                      <div style={{fontSize:10,color:CV.yellow,fontFamily:'monospace'}}>{a.kg}</div>
                      <div style={{fontSize:10,color:CV.muted,fontFamily:'monospace'}}>{a.rec}</div>
                      <div style={{fontSize:9,color:CV.muted}}>{a.timing}</div>
                    </div>
                  ))}
                </div>
                {/* Wire + Temp */}
                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  <div style={{background:'#0a1218',border:`1px solid ${CV.purple}33`,borderRadius:8,padding:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:CV.purple,marginBottom:8}}>🔩 WIRE INJECTION</div>
                    {schedule.wires.length>0?schedule.wires.map((w,i)=>(
                      <div key={i} style={{padding:'5px 0',borderBottom:`1px solid ${CV.border}`}}>
                        <div style={{display:'flex',justifyContent:'space-between'}}>
                          <span style={{fontSize:10,color:CV.text}}>{w.type}</span>
                          <span style={{fontSize:11,color:CV.purple,fontWeight:700,fontFamily:'monospace'}}>{w.meters}m</span>
                        </div>
                        <div style={{fontSize:9,color:CV.muted}}>{w.purpose}</div>
                      </div>
                    )):<div style={{fontSize:10,color:CV.muted}}>No wire injection needed</div>}
                  </div>
                  <div style={{background:'#0a1218',border:`1px solid ${CV.success}33`,borderRadius:8,padding:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:CV.success,marginBottom:8}}>🌡 TEMP TRAJECTORY</div>
                    {schedule.tempPath.map((p,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:`1px solid ${CV.border}`}}>
                        <span style={{fontSize:9,color:CV.muted}}>{p.stage}</span>
                        <span style={{fontSize:10,color:heatColor(p.t,1500,1720),fontFamily:'monospace',fontWeight:700}}>{p.t}°C</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Risks */}
              {schedule.risks.length>0&&(
                <div style={{background:'#0a1218',border:`1px solid ${CV.danger}33`,borderRadius:8,padding:12,marginBottom:12}}>
                  <div style={{fontSize:10,fontWeight:700,color:CV.danger,marginBottom:8}}>⚠ RISK FLAGS</div>
                  {schedule.risks.map((r,i)=>(
                    <div key={i} style={{display:'flex',gap:8,padding:'4px 0',borderBottom:`1px solid ${CV.border}`}}>
                      <span style={{fontSize:9,fontWeight:700,color:r.lvl==='HIGH'?CV.danger:r.lvl==='MEDIUM'?CV.accent:CV.yellow,minWidth:50}}>{r.lvl}</span>
                      <span style={{fontSize:9,color:CV.text}}>{r.msg}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Timeline */}
              <div style={{background:'#0a1218',border:`1px solid ${CV.cyan}33`,borderRadius:8,padding:12}}>
                <div style={{fontSize:10,fontWeight:700,color:CV.cyan,marginBottom:8}}>⏱ OPERATION TIMELINE</div>
                <div style={{display:'flex',alignItems:'center',gap:0,flexWrap:'nowrap',overflowX:'auto',padding:'4px 0'}}>
                  {schedule.timeline.map((s,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',flexShrink:0}}>
                      <div style={{textAlign:'center',minWidth:80}}>
                        <div style={{fontSize:8,fontWeight:700,color:s.type==='arc'?CV.accent:s.type==='purge'?CV.blue:s.type==='alloy'?CV.yellow:s.type==='wire'?CV.purple:CV.success}}>{s.label.split(':')[0]}</div>
                        <div style={{fontSize:9,fontWeight:700,color:CV.cyan,fontFamily:'monospace'}}>{s.tMin}min</div>
                        <div style={{width:8,height:8,borderRadius:'50%',background:s.type==='arc'?CV.accent:s.type==='purge'?CV.blue:s.type==='alloy'?CV.yellow:s.type==='wire'?CV.purple:CV.success,margin:'4px auto'}}/>
                      </div>
                      {i<schedule.timeline.length-1&&<div style={{width:20,height:2,background:`${CV.border}`,flexShrink:0}}/>}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{marginTop:14,display:'flex',justifyContent:'center'}}>
                <button onClick={()=>{if(simRef.current){simRef.current.t=0;setElapsed(0);stepRef.current=0;setStepIdx(0)};setSimRun(true);setTab('simulation')}} style={{padding:'10px 28px',borderRadius:7,border:`2px solid ${CV.success}`,background:'rgba(87,171,90,0.15)',color:CV.success,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                  ▶ RUN LF SIMULATION FROM THIS PLAN
                </button>
              </div>
            </div>
          )}

          {/* SIMULATION tab */}
          {tab==='simulation'&&simState&&<LFCanvas simRef={simRef} W={CW} H={CH} running={simRun}/>}

{/* Timeline drawn inside canvas — no JSX overlay needed */}

          {/* Input splash */}
          {tab==='input'&&!simState&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:18}}>
              <div style={{fontSize:52}}>🏭</div>
              <div style={{fontSize:15,fontWeight:700,color:CV.text}}>Local LF Metallurgical Engine</div>
              <div style={{fontSize:11,color:CV.muted,maxWidth:440,textAlign:'center',lineHeight:1.9}}>
                No API tokens consumed. All calculations done locally using<br/>
                metallurgical formulas for alloy additions, arc energy,<br/>
                desulphurisation, and temperature balance.<br/><br/>
                1. Set BOF tap data on the left<br/>
                2. Click <strong style={{color:CV.cyan}}>⚙ COMPUTE PLAN</strong><br/>
                3. Review plan, then click <strong style={{color:CV.success}}>▶ RUN SIM</strong>
              </div>
              <button onClick={generateSchedule} style={{padding:'12px 32px',borderRadius:8,border:`2px solid ${CV.cyan}`,background:'rgba(57,197,207,0.15)',color:CV.cyan,fontSize:13,fontWeight:700,cursor:'pointer'}}>
                ⚙ COMPUTE LF TREATMENT PLAN
              </button>
            </div>
          )}
          {tab==='input'&&simState&&<LFCanvas simRef={simRef} W={CW} H={CH} running={simRun}/>}
          {tab==='plan'&&!schedule&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:14,color:CV.muted}}>
              <div style={{fontSize:36}}>📋</div>
              <div style={{fontSize:12}}>Click <strong style={{color:CV.cyan}}>⚙ COMPUTE PLAN</strong> to generate the schedule.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
