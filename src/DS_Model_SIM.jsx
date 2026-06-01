import { useState, useRef, useCallback, useEffect } from 'react'

// ─── SOUND ENGINE ─────────────────────────────────────────────────────────────
class SoundEngine {
  constructor() { this.ctx = null; this.active = {}; this.enabled = true }
  _init() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)() } catch(e) {} }
    if (this.ctx?.state === 'suspended') this.ctx.resume()
    return this.ctx
  }
  startNoise(id, freq=400, vol=0.18) {
    if (!this.enabled || this.active[id]) return
    const ctx = this._init(); if (!ctx) return
    const buf = ctx.createBuffer(1, ctx.sampleRate*2, ctx.sampleRate)
    const d = buf.getChannelData(0); for (let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*0.4
    const src = ctx.createBufferSource(); src.buffer=buf; src.loop=true
    const filt = ctx.createBiquadFilter(); filt.type='bandpass'; filt.frequency.value=freq; filt.Q.value=0.8
    const gain = ctx.createGain(); gain.gain.value=vol
    src.connect(filt); filt.connect(gain); gain.connect(ctx.destination); src.start()
    this.active[id] = {src, gain}
  }
  stopNoise(id) {
    const n=this.active[id]; if(!n) return
    try { n.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); setTimeout(()=>{try{n.src.stop()}catch(e){}},500) } catch(e) {}
    delete this.active[id]
  }
  playBurst(type='inject') {
    if (!this.enabled) return
    const ctx = this._init(); if (!ctx) return
    if (type==='inject') {
      // Pneumatic injection hiss
      const buf=ctx.createBuffer(1,ctx.sampleRate*1.2,ctx.sampleRate); const d=buf.getChannelData(0)
      for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)
      const src=ctx.createBufferSource(); src.buffer=buf
      const f=ctx.createBiquadFilter(); f.type='highpass'; f.frequency.value=1800
      const g=ctx.createGain(); g.gain.setValueAtTime(0.22,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+1.2)
      src.connect(f); f.connect(g); g.connect(ctx.destination); src.start()
    } else if (type==='stir') {
      const osc=ctx.createOscillator(); osc.type='sawtooth'; osc.frequency.value=60
      const g=ctx.createGain(); g.gain.setValueAtTime(0.25,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.8)
      osc.connect(g); g.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+0.8)
    } else if (type==='complete') {
      ;[[523,0],[659,0.12],[784,0.24],[1047,0.38]].forEach(([f,t])=>{
        const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=f
        const g=ctx.createGain(); g.gain.setValueAtTime(0.18,ctx.currentTime+t); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.7)
        o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+0.75)
      })
    } else if (type==='skim') {
      ;[0,0.1,0.22,0.36].forEach((t,i)=>{
        const o=ctx.createOscillator(); o.type='triangle'; o.frequency.value=200-i*35
        const g=ctx.createGain(); g.gain.setValueAtTime(0.28-i*0.05,ctx.currentTime+t); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.2)
        o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+0.22)
      })
    }
  }
  stopAll() {
    Object.keys(this.active).forEach(id=>{
      const n=this.active[id]; try{n.gain.gain.setTargetAtTime(0,this.ctx.currentTime,0.2);setTimeout(()=>{try{n.src.stop()}catch(e){}},400)}catch(e){}
    }); this.active={}
  }
}
const SOUND = new SoundEngine()

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CV = {
  bg:'#07090f', panel:'#0b1220', border:'#1a2d45',
  text:'#cdd9e5', muted:'#6e8098',
  accent:'#FF8F00', success:'#57ab5a', danger:'#e5534b',
  cyan:'#39c5cf', purple:'#9b5de5', yellow:'#FFD54F', blue:'#29B6F6',
}
const cl = (v,lo,hi) => Math.max(lo, Math.min(hi, v))

function heatColor(temp,min=1280,max=1420){
  const t=cl((temp-min)/(max-min),0,1)
  if(t>0.85) return `rgba(255,255,${Math.round((1-t)*5*255)},0.95)`
  if(t>0.65) return `rgba(255,${Math.round(120+t*135)},0,0.93)`
  if(t>0.40) return `rgba(${Math.round(200+t*55)},${Math.round(40+t*60)},0,0.90)`
  return `rgba(${Math.round(120+t*80)},${Math.round(20+t*25)},0,0.85)`
}

// ─── DS SCHEDULE ENGINE ───────────────────────────────────────────────────────
function computeDSSchedule(torpedo, targets, cfg) {
  const { weight, reagentType, stirMethod } = cfg
  const dS = torpedo.S - targets.S
  const desulphRatio = torpedo.S / targets.S
  const needsHeavy = desulphRatio > 3.0

  // 1. Pre-skim assessment
  const preSkimNeeded = torpedo.slagPct > 0.8   // >0.8% slag index → must skim

  // 2. Reagent quantities
  const reagents = []
  if (reagentType === 'CaC2+CaO' || reagentType === 'CaC2') {
    // CaC2 (calcium carbide) — most effective, 80% desulph efficiency
    const cac2kg = Math.round(weight * dS / 0.001 * 0.55)
    reagents.push({ name:'CaC₂ (Calcium Carbide)', kg:cac2kg, rate:'15 kg/min', efficiency:'80%', timing:'After pre-skim' })
  }
  if (reagentType === 'CaC2+CaO' || reagentType === 'CaO+Mg') {
    // CaO + Mg co-injection
    const caoKg = Math.round(weight * dS / 0.001 * 0.35)
    const mgKg  = Math.round(weight * dS / 0.001 * 0.08)
    reagents.push({ name:'CaO (lime)', kg:caoKg, rate:'20 kg/min', efficiency:'65%', timing:'With CaC₂' })
    if (reagentType === 'CaO+Mg') reagents.push({ name:'Mg (magnesium)', kg:mgKg, rate:'5 kg/min', efficiency:'75%', timing:'Co-injection' })
  }
  if (reagentType === 'Lime+Mg') {
    const limeKg = Math.round(weight * dS / 0.001 * 0.40)
    const mgKg   = Math.round(weight * dS / 0.001 * 0.10)
    reagents.push({ name:'Lime powder', kg:limeKg, rate:'18 kg/min', efficiency:'65%', timing:'Injection' })
    reagents.push({ name:'Mg granules', kg:mgKg,   rate:'4 kg/min',  efficiency:'78%', timing:'Co-injection' })
  }
  const totalReagentKg = reagents.reduce((a,r)=>a+r.kg,0)

  // 3. Stirring / injection schedule
  const stages = []
  if (preSkimNeeded) stages.push({ name:'Pre-skim slag',  min:4,  type:'skim',   desc:'Remove top slag to expose clean iron' })
  stages.push({ name:'Injection phase 1', min:Math.round(totalReagentKg*0.6/15), type:'inject', desc:'Main reagent injection with '+stirMethod })
  stages.push({ name:'Reaction period',   min:3,  type:'react',  desc:'Allow reagent to react, plume mixing' })
  stages.push({ name:'Injection phase 2', min:Math.round(totalReagentKg*0.4/15), type:'inject', desc:'Fine addition to meet target [S]' })
  stages.push({ name:'Post-stir',         min:4,  type:'stir',   desc:'Homogenise, float CaS inclusions' })
  stages.push({ name:'Post-skim slag',    min:5,  type:'skim',   desc:'Remove CaS-rich desulph slag' })
  stages.push({ name:'Sample + temp',     min:2,  type:'probe',  desc:'Final temperature and chemistry check' })
  const totalMin = stages.reduce((a,s)=>a+s.min,0)

  // 4. Temperature budget (DS causes significant heat loss)
  const tempLoss = preSkimNeeded ? 18 : 12  // °C from skimming
  const reagentLoss = totalReagentKg * 0.025  // °C per kg reagent
  const stirLoss    = stirMethod==='N2 lance' ? 8 : 5  // stirring loss
  const totalTempLoss = tempLoss + reagentLoss + stirLoss + totalMin * 1.5
  const dsOutTemp = Math.round(torpedo.T - totalTempLoss)
  const bofRequiredTemp = Math.round(dsOutTemp + totalTempLoss + 10)

  // 5. Expected chemistry out
  const expectedS   = cl(torpedo.S - dS * 0.88, 0.001, torpedo.S)
  const expectedMn  = cl(torpedo.Mn - dS * 0.05, 0.001, torpedo.Mn)  // slight Mn loss
  const expectedC   = torpedo.C  // carbon unchanged
  const expectedSi  = cl(torpedo.Si - dS * 0.12, 0.001, torpedo.Si)  // Si slightly oxidised

  // 6. CaS slag generated
  const casKg = Math.round(totalReagentKg * 0.45)

  // 7. Build timeline
  let cursor = 0
  const timeline = []
  if (preSkimNeeded) { timeline.push({ type:'skim',   tMin:cursor, label:'Pre-skim slag' }); cursor+=4 }
  timeline.push({ type:'inject', tMin:cursor, label:'Injection Ph.1' }); cursor+=stages.find(s=>s.name.includes('phase 1'))?.min||5
  timeline.push({ type:'react',  tMin:cursor, label:'Reaction' });       cursor+=3
  timeline.push({ type:'inject', tMin:cursor, label:'Injection Ph.2' }); cursor+=stages.find(s=>s.name.includes('phase 2'))?.min||3
  timeline.push({ type:'stir',   tMin:cursor, label:'Post-stir' });      cursor+=4
  timeline.push({ type:'skim',   tMin:cursor, label:'Post-skim' });      cursor+=5
  timeline.push({ type:'probe',  tMin:cursor, label:'T + Sample' })

  // 8. Risks
  const risks = []
  if (torpedo.T < 1310) risks.push({ lvl:'HIGH',   msg:`Torpedo temp ${torpedo.T}°C too low — risk of freezing during DS` })
  if (desulphRatio > 5)  risks.push({ lvl:'HIGH',   msg:`Desulph ratio ${desulphRatio.toFixed(1)}x very high — consider 2-stage DS` })
  if (torpedo.S > 0.050) risks.push({ lvl:'HIGH',   msg:`Initial [S]=${torpedo.S}% very high — may need extended injection` })
  if (preSkimNeeded)     risks.push({ lvl:'MEDIUM', msg:`Slag index ${torpedo.slagPct}% high — pre-skimming mandatory` })
  if (torpedo.Mn < 0.20) risks.push({ lvl:'LOW',    msg:`Low [Mn] — monitor Mn loss during DS` })

  return { stages, reagents, timeline, totalMin, totalTempLoss: Math.round(totalTempLoss), dsOutTemp, bofRequiredTemp, expectedS: expectedS.toFixed(4), expectedMn: expectedMn.toFixed(3), expectedC: expectedC.toFixed(3), expectedSi: expectedSi.toFixed(3), casKg, totalReagentKg, desulphRatio: desulphRatio.toFixed(1), preSkimNeeded, risks }
}

function initSimState(torpedo) {
  return {
    t:0, frame:0, _mva:0,
    // Torpedo ladle
    ironTemp: torpedo.T,
    ironS: torpedo.S, ironC: torpedo.C, ironMn: torpedo.Mn, ironSi: torpedo.Si,
    slagThick: torpedo.slagPct * 20,   // mm slag layer
    slagFoam: 0.08,
    // Injection lance
    lanceY: 0, lanceOn: false, lanceTimer: 0,
    // N2 stir lance
    stirLanceY: 0, stirOn: false,
    // Particles
    injParticles: [],   // reagent powder particles
    stirBubbles: [],    // N2 bubbles
    slagParticles: [],  // slag splashes
    sparks: [],
    reactionZones: [],
    // Skim arm
    skimOn: false, skimAngle: 0, skimDone: false,
    // Probe
    probeY: 0, probeDone: false, probeFrames: 0,
    // Status
    status: 'TORPEDO IN POSITION',
    complete: false,
    casFormed: 0,      // kg CaS formed
    reagentUsed: 0,    // kg reagent injected
  }
}

// ─── CANVAS ───────────────────────────────────────────────────────────────────
function DSCanvas({ simRef, W, H, running }) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)

  useEffect(()=>{ const c=canvasRef.current; if(c){c.width=W;c.height=H} },[W,H])

  const draw = useCallback(()=>{
    const canvas=canvasRef.current; if(!canvas){rafRef.current=requestAnimationFrame(draw);return}
    const ctx=canvas.getContext('2d'); const CW=canvas.width,CH=canvas.height
    if(!CW||!CH){rafRef.current=requestAnimationFrame(draw);return}
    const sim=simRef.current
    if(!sim){ctx.fillStyle=CV.bg;ctx.fillRect(0,0,CW,CH);rafRef.current=requestAnimationFrame(draw);return}

    try {
    // ── LAYOUT ──────────────────────────────────────────────────────────────
    // Torpedo ladle is the centrepiece — large horizontal vessel
    const TCX  = CW*0.50   // torpedo centre X
    const TCY  = CH*0.46   // torpedo centre Y
    const TW   = CW*0.45   // torpedo half-length
    const TH   = CH*0.20   // torpedo half-height
    const t    = sim.t

    ctx.fillStyle=CV.bg; ctx.fillRect(0,0,CW,CH)
    ctx.strokeStyle='rgba(255,255,255,0.012)'; ctx.lineWidth=0.5
    for(let x=0;x<CW;x+=36){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CH);ctx.stroke()}
    for(let y=0;y<CH;y+=36){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CW,y);ctx.stroke()}

    const lb =(tx,x,y,c,sz=9,al='center')=>{ctx.fillStyle=c;ctx.font=`${sz}px monospace`;ctx.textAlign=al;ctx.fillText(tx,x,y)}
    const lbB=(tx,x,y,c,sz=9,al='center')=>{ctx.fillStyle=c;ctx.font=`bold ${sz}px monospace`;ctx.textAlign=al;ctx.fillText(tx,x,y)}

    // ── TORPEDO CAR RAIL ────────────────────────────────────────────────────
    ctx.fillStyle='#1a2535'; ctx.fillRect(0, TCY+TH+CH*0.04, CW, CH*0.022)
    ctx.fillStyle='#2c4055'; ctx.fillRect(0, TCY+TH+CH*0.04+2, CW, CH*0.008)
    // Rail sleepers
    for(let rx=20;rx<CW;rx+=40){
      ctx.fillStyle='#1e2d3d'; ctx.fillRect(rx-5, TCY+TH+CH*0.04, 10, CH*0.022)
    }
    // Torpedo car wheels
    ;[TCX-TW*0.6, TCX-TW*0.2, TCX+TW*0.2, TCX+TW*0.6].forEach(wx=>{
      ctx.fillStyle='#1e2d3d'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1
      ctx.beginPath(); ctx.ellipse(wx, TCY+TH+CH*0.055, CW*0.022, CH*0.028, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke()
      ctx.fillStyle='#263340'; ctx.beginPath(); ctx.ellipse(wx, TCY+TH+CH*0.055, CW*0.010, CH*0.012, 0, 0, Math.PI*2); ctx.fill()
    })
    // Car frame
    ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
    ctx.fillRect(TCX-TW*0.78, TCY+TH, TW*1.56, CH*0.04); ctx.strokeRect(TCX-TW*0.78, TCY+TH, TW*1.56, CH*0.04)
    lbB('TORPEDO CAR', TCX, TCY+TH+CH*0.095, '#1e3040', cl(CW*0.009,7,10))

    // ── TORPEDO SHELL (horizontal cylindrical vessel) ─────────────────────
    // End caps (ellipses)
    ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=2
    ;[-1,1].forEach(side=>{
      ctx.beginPath(); ctx.ellipse(TCX+side*TW, TCY, TW*0.09, TH, 0, 0, Math.PI*2)
      ctx.fill(); ctx.stroke()
    })
    // Main body (rectangle with rounded ends)
    ctx.fillRect(TCX-TW, TCY-TH, TW*2, TH*2); ctx.strokeRect(TCX-TW, TCY-TH, TW*2, TH*2)

    // Trunnion ring (support ring visible on outside)
    ;[-TW*0.3, TW*0.3].forEach(ox=>{
      ctx.fillStyle='#1e3040'; ctx.strokeStyle='#37474F'; ctx.lineWidth=2
      ctx.fillRect(TCX+ox-CW*0.012, TCY-TH-CH*0.025, CW*0.024, TH*2+CH*0.025)
      ctx.strokeRect(TCX+ox-CW*0.012, TCY-TH-CH*0.025, CW*0.024, TH*2+CH*0.025)
    })
    // Trunnion axle labels
    lbB('TRUNNION', TCX, TCY-TH-CH*0.032, '#1e3040', cl(CW*0.009,7,9))

    // ── INTERIOR CLIP ─────────────────────────────────────────────────────
    ctx.save()
    ctx.beginPath()
    ctx.rect(TCX-TW+4, TCY-TH+4, TW*2-8, TH*2-8)
    ctx.clip()

    // Refractory lining
    const LIN = cl(CW*0.018, 12, 22)
    ctx.fillStyle='#1e1408'
    ctx.fillRect(TCX-TW+4, TCY-TH+4, TW*2-8, TH*2-8)
    // Inner refractory (thinner on left/right, thicker on top/bottom)
    ctx.fillStyle='#2c1a08'
    ctx.fillRect(TCX-TW+LIN, TCY-TH+LIN, TW*2-LIN*2, TH*2-LIN*2)

    // Hot metal bath (fills bottom ~60%)
    const ironLevel = 0.62
    const ironY = TCY - TH + (TH*2)*(1-ironLevel)
    const ironGrd = ctx.createLinearGradient(0, ironY, 0, TCY+TH)
    ironGrd.addColorStop(0, heatColor(sim.ironTemp+20,1280,1450))
    ironGrd.addColorStop(0.4, heatColor(sim.ironTemp,1280,1450))
    ironGrd.addColorStop(1, heatColor(sim.ironTemp-30,1280,1450))
    ctx.fillStyle=ironGrd
    ctx.fillRect(TCX-TW+LIN, ironY, TW*2-LIN*2, TCY+TH-LIN-ironY)
    // Iron surface shimmer
    ctx.fillStyle=`rgba(255,200,50,${0.06+0.04*Math.sin(t*3)})`
    ctx.fillRect(TCX-TW+LIN, ironY, TW*2-LIN*2, 3)

    // Slag layer on top of iron
    const slagH = cl(sim.slagThick*1.8, 4, 38)
    const slagY = ironY - slagH
    if (slagH>3) {
      const slg = ctx.createLinearGradient(0,slagY,0,ironY)
      slg.addColorStop(0,`rgba(${Math.round(75+sim.slagFoam*30)},${Math.round(85+sim.slagFoam*15)},30,0.88)`)
      slg.addColorStop(1,'rgba(55,70,22,0.72)')
      ctx.fillStyle=slg; ctx.fillRect(TCX-TW+LIN, slagY, TW*2-LIN*2, slagH)
      // Slag foam lumps
      if(sim.slagFoam>0.15){
        for(let fx=TCX-TW+LIN+8;fx<TCX+TW-LIN-8;fx+=16){
          const lp=2+sim.slagFoam*8+1.5*Math.sin(t*5+fx*0.18)
          const fg=ctx.createRadialGradient(fx,slagY,0,fx,slagY,lp*1.5)
          fg.addColorStop(0,`rgba(110,106,40,${0.45+sim.slagFoam*0.25})`); fg.addColorStop(1,'rgba(65,80,20,0)')
          ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(fx,slagY,lp*1.5,0,Math.PI*2); ctx.fill()
        }
      }
    }

    // Reaction zones (where reagent reacts with S)
    sim.reactionZones?.forEach(rz=>{
      const rg=ctx.createRadialGradient(rz.x,rz.y,0,rz.x,rz.y,rz.r*2.5)
      rg.addColorStop(0,`rgba(255,${Math.round(100+rz.life*80)},0,${rz.life*0.45})`)
      rg.addColorStop(1,'rgba(255,60,0,0)')
      ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(rz.x,rz.y,rz.r*2.5,0,Math.PI*2); ctx.fill()
    })

    // N2 stir bubbles (large, rising)
    sim.stirBubbles?.forEach(p=>{
      ctx.globalAlpha=p.life*0.25; ctx.fillStyle='rgba(150,215,255,0.7)'
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2.2,0,Math.PI*2); ctx.fill()
      ctx.globalAlpha=p.life*0.72; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
      ctx.globalAlpha=p.life*0.35; ctx.fillStyle='rgba(255,255,255,0.9)'
      ctx.beginPath(); ctx.arc(p.x-p.r*0.3,p.y-p.r*0.3,p.r*0.3,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // Injection particles (reagent powder)
    sim.injParticles?.forEach(p=>{
      ctx.globalAlpha=p.life*0.80; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
      ctx.globalAlpha=p.life*0.22; ctx.fillStyle='rgba(220,200,80,0.8)'
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // Sparks from reaction
    sim.sparks?.forEach(p=>{
      ctx.globalAlpha=p.life; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    ctx.restore()  // end interior clip

    // ── INJECTION LANCE (drops from above into torpedo mouth) ─────────────
    const MOUTH_X = TCX - TW*0.05  // torpedo mouth/opening (top)
    const MOUTH_Y = TCY - TH
    const LANCE_MACHINE_X = TCX - TW*0.08
    const LANCE_MACHINE_Y = CH*0.06
    // Machine housing
    ctx.fillStyle='#1e2d3d'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.2
    ctx.fillRect(LANCE_MACHINE_X-CW*0.04, LANCE_MACHINE_Y, CW*0.08, CH*0.06)
    ctx.strokeRect(LANCE_MACHINE_X-CW*0.04, LANCE_MACHINE_Y, CW*0.08, CH*0.06)
    lbB('INJ.LANCE', LANCE_MACHINE_X, LANCE_MACHINE_Y-6, CV.accent, cl(CW*0.009,7,10))
    // Drive wheels
    ctx.fillStyle='#263340'
    ;[LANCE_MACHINE_X-CW*0.015, LANCE_MACHINE_X+CW*0.015].forEach(wx=>{
      ctx.beginPath(); ctx.arc(wx, LANCE_MACHINE_Y+CH*0.03, CW*0.012, 0, Math.PI*2); ctx.fill()
      if(sim.lanceOn){ctx.strokeStyle='rgba(255,143,0,0.4)';ctx.lineWidth=0.8;ctx.stroke()}
    })
    if(sim.lanceY>0){
      const lanceTip = LANCE_MACHINE_Y+CH*0.06 + (ironY+slagH/2 - LANCE_MACHINE_Y-CH*0.06)*sim.lanceY
      const lW = cl(CW*0.012,7,12)
      // Lance tube
      const lGrd=ctx.createLinearGradient(LANCE_MACHINE_X-lW/2,0,LANCE_MACHINE_X+lW/2,0)
      lGrd.addColorStop(0,'#1a3a4a'); lGrd.addColorStop(0.5,'#4FC3F7'); lGrd.addColorStop(1,'#1a3a4a')
      ctx.fillStyle=lGrd; ctx.fillRect(LANCE_MACHINE_X-lW/2, LANCE_MACHINE_Y+CH*0.06, lW, lanceTip-LANCE_MACHINE_Y-CH*0.06)
      // Tip nozzle (powder exits here)
      ctx.fillStyle='#FF8F00'; ctx.fillRect(LANCE_MACHINE_X-lW/2-2, lanceTip-6, lW+4, 9)
      // Powder glow at tip
      if(sim.lanceOn && sim.lanceY>0.5){
        const pg=ctx.createRadialGradient(LANCE_MACHINE_X,lanceTip,1,LANCE_MACHINE_X,lanceTip,22)
        pg.addColorStop(0,'rgba(255,200,80,0.80)'); pg.addColorStop(1,'rgba(200,140,40,0)')
        ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(LANCE_MACHINE_X,lanceTip,22,0,Math.PI*2); ctx.fill()
        lb('CaC₂→', LANCE_MACHINE_X+lW/2+6, lanceTip, 'rgba(200,180,80,0.70)', cl(CW*0.009,7,9), 'left')
      }
      lb(`${Math.round(sim.lanceY*100)}%`, LANCE_MACHINE_X-lW/2-6, LANCE_MACHINE_Y+CH*0.06+(lanceTip-LANCE_MACHINE_Y-CH*0.06)*0.5, 'rgba(41,182,246,0.55)', cl(CW*0.008,6,8), 'right')
    }

    // ── N2 STIRRING LANCE (right side of torpedo) ─────────────────────────
    const STIR_MACHINE_X = TCX + TW*0.35
    const STIR_MACHINE_Y = CH*0.06
    ctx.fillStyle='#1e2d3d'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.2
    ctx.fillRect(STIR_MACHINE_X-CW*0.035, STIR_MACHINE_Y, CW*0.07, CH*0.055)
    ctx.strokeRect(STIR_MACHINE_X-CW*0.035, STIR_MACHINE_Y, CW*0.07, CH*0.055)
    lbB('N₂ STIR', STIR_MACHINE_X, STIR_MACHINE_Y-6, CV.blue, cl(CW*0.009,7,10))
    if(sim.stirLanceY>0){
      const stirTip = STIR_MACHINE_Y+CH*0.055 + (ironY - STIR_MACHINE_Y-CH*0.055)*sim.stirLanceY
      const sW = cl(CW*0.008,5,9)
      ctx.fillStyle='#263340'; ctx.fillRect(STIR_MACHINE_X-sW/2, STIR_MACHINE_Y+CH*0.055, sW, stirTip-STIR_MACHINE_Y-CH*0.055)
      ctx.strokeStyle='#37474F'; ctx.lineWidth=0.5; ctx.strokeRect(STIR_MACHINE_X-sW/2, STIR_MACHINE_Y+CH*0.055, sW, stirTip-STIR_MACHINE_Y-CH*0.055)
      // N2 flow glow
      if(sim.stirOn){
        const ng=ctx.createRadialGradient(STIR_MACHINE_X,stirTip,1,STIR_MACHINE_X,stirTip,18)
        ng.addColorStop(0,'rgba(41,182,246,0.55)'); ng.addColorStop(1,'rgba(41,182,246,0)')
        ctx.fillStyle=ng; ctx.beginPath(); ctx.arc(STIR_MACHINE_X,stirTip,18,0,Math.PI*2); ctx.fill()
        // Surface eye
        const eyY=ironY-3
        const eg=ctx.createRadialGradient(STIR_MACHINE_X,eyY,1,STIR_MACHINE_X,eyY,20)
        eg.addColorStop(0,'rgba(41,182,246,0.40)'); eg.addColorStop(1,'rgba(41,182,246,0)')
        ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(STIR_MACHINE_X,eyY,20,0,Math.PI*2); ctx.fill()
      }
    }

    // ── SKIM ARM (horizontal arm that sweeps slag off top) ────────────────
    if(sim.skimOn || sim.skimDone){
      const armBase = TCX - TW*1.05
      const armLen  = TW * 0.85
      const armAngle = -Math.PI*0.05 + sim.skimAngle
      const armEndX = armBase + Math.cos(armAngle)*armLen
      const armEndY = TCY-TH + Math.sin(armAngle)*armLen*0.15
      ctx.strokeStyle=sim.skimOn?'#FF7043':'#546E7A'; ctx.lineWidth=cl(CW*0.012,8,14)
      ctx.lineCap='round'
      ctx.beginPath(); ctx.moveTo(armBase, TCY-TH-CH*0.02); ctx.lineTo(armEndX, armEndY); ctx.stroke()
      ctx.lineCap='butt'
      lbB('SKIM ARM', armBase-8, TCY-TH-CH*0.035, sim.skimOn?'#FF7043':'#546E7A', cl(CW*0.009,7,9), 'right')
    }

    // ── SAMPLE PROBE ──────────────────────────────────────────────────────
    const PROBE_X = TCX + TW*0.1
    const PROBE_MACHINE_Y = CH*0.06
    ctx.fillStyle='#1e2d3d'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1
    ctx.fillRect(PROBE_X-CW*0.025, PROBE_MACHINE_Y, CW*0.05, CH*0.05)
    ctx.strokeRect(PROBE_X-CW*0.025, PROBE_MACHINE_Y, CW*0.05, CH*0.05)
    lbB('T+S PROBE', PROBE_X, PROBE_MACHINE_Y-6, CV.success, cl(CW*0.009,7,9))
    if(sim.probeY>0){
      const pTip = PROBE_MACHINE_Y+CH*0.05 + (ironY+10 - PROBE_MACHINE_Y-CH*0.05)*Math.min(sim.probeY/0.8,1)
      const pW = cl(CW*0.007,4,7)
      ctx.fillStyle='#37474F'; ctx.fillRect(PROBE_X-pW/2, PROBE_MACHINE_Y+CH*0.05, pW, pTip-PROBE_MACHINE_Y-CH*0.05)
      ctx.fillStyle=sim.probeDone?`rgba(87,171,90,${0.88+0.12*Math.sin(t*10)})`:'rgba(255,180,0,0.80)'
      ctx.beginPath(); ctx.arc(PROBE_X,pTip,6,0,Math.PI*2); ctx.fill()
      if(sim.probeDone){
        const pg2=ctx.createRadialGradient(PROBE_X,pTip,1,PROBE_X,pTip,24)
        pg2.addColorStop(0,`rgba(87,171,90,${0.55+0.35*Math.sin(t*8)})`); pg2.addColorStop(1,'rgba(87,171,90,0)')
        ctx.fillStyle=pg2; ctx.beginPath(); ctx.arc(PROBE_X,pTip,24,0,Math.PI*2); ctx.fill()
        lbB(`${Math.round(sim.ironTemp)}°C`, PROBE_X, pTip-30, CV.success, cl(CW*0.012,10,13))
        lb('[S]:'+sim.ironS.toFixed(4)+'%', PROBE_X, pTip-16, CV.success, cl(CW*0.009,7,9))
      }
    }

    // ── SLAG SPLASHES ─────────────────────────────────────────────────────
    sim.slagParticles?.forEach(p=>{
      ctx.globalAlpha=p.life*0.75; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // ── TORPEDO BORDER ────────────────────────────────────────────────────
    ctx.strokeStyle='#2c4055'; ctx.lineWidth=2.5
    ;[-1,1].forEach(side=>{
      ctx.beginPath(); ctx.ellipse(TCX+side*TW, TCY, TW*0.09, TH, 0, 0, Math.PI*2); ctx.stroke()
    })
    ctx.strokeRect(TCX-TW, TCY-TH, TW*2, TH*2)

    // ── DATA BOX ──────────────────────────────────────────────────────────
    const dbX=CW*0.04, dbY=TCY+TH+CH*0.10, dbW=CW*0.92, dbH=CH*0.10
    ctx.fillStyle='rgba(4,8,18,0.92)'; ctx.fillRect(dbX,dbY,dbW,dbH)
    ctx.strokeStyle=sim.lanceOn?CV.accent:sim.stirOn?CV.blue:sim.complete?CV.success:'#1e3040'
    ctx.lineWidth=0.8; ctx.strokeRect(dbX,dbY,dbW,dbH)
    lbB('TORPEDO DS', dbX+12, dbY+14, CV.accent, cl(CW*0.013,11,15), 'left')
    lbB(sim.status||'', dbX+dbW-10, dbY+14, sim.complete?CV.success:sim.lanceOn?CV.accent:sim.stirOn?CV.blue:CV.muted, cl(CW*0.011,9,12), 'right')
    // Chemistry row
    const rows=[
      [`T: ${Math.round(sim.ironTemp)}°C`, `[S]:${sim.ironS.toFixed(4)}%`, `[C]:${sim.ironC.toFixed(3)}%`, `[Mn]:${sim.ironMn.toFixed(3)}%`],
      [`Slag: ${Math.round(sim.slagThick)}mm`, `CaS formed: ${Math.round(sim.casFormed)}kg`, `Reagent: ${Math.round(sim.reagentUsed)}kg`, sim.complete?'DESULPH COMPLETE ✓':'Processing...']
    ]
    rows.forEach((r,ri)=>{
      const ry=dbY+28+ri*CH*0.028
      r.forEach((cell,ci)=>{
        const cx2=dbX+14+ci*(dbW-28)/4
        ctx.fillStyle='rgba(200,218,230,0.92)'; ctx.font=`bold ${cl(CW*0.012,10,13)}px monospace`; ctx.textAlign='left'
        ctx.fillText(cell, cx2, ry)
      })
    })
    // Temp progress bar
    const tf=cl((sim.ironTemp-1280)/(sim.ironTemp+50-1280),0,1)
    ctx.fillStyle='#0a1520'; ctx.fillRect(dbX+5, dbY+dbH-14, dbW-10, 8)
    ctx.fillStyle=tf>0.6?CV.success:tf>0.3?CV.accent:CV.danger
    ctx.fillRect(dbX+5, dbY+dbH-14, (dbW-10)*tf, 8)
    ctx.strokeStyle='#1a3050'; ctx.lineWidth=0.3; ctx.strokeRect(dbX+5, dbY+dbH-14, dbW-10, 8)

    // ── TIMELINE ──────────────────────────────────────────────────────────
    if(sim._schedule){
      const TLY=dbY+dbH+CH*0.015, TLH=CH*0.19
      ctx.fillStyle='rgba(4,8,18,0.90)'; ctx.fillRect(0,TLY,CW,TLH)
      ctx.strokeStyle='#1a2d45'; ctx.lineWidth=1.5
      ctx.beginPath(); ctx.moveTo(0,TLY); ctx.lineTo(CW,TLY); ctx.stroke()
      const steps=sim._schedule.timeline||[]
      if(steps.length>0){
        const stepW=CW/steps.length
        const dotY=TLY+TLH*0.28, namY=TLY+TLH*0.56, timY=TLY+TLH*0.78
        const namSz=cl(CW*0.012,10,14), timSz=cl(CW*0.010,8,11)
        const typeCol={inject:CV.accent, react:'#FF5722', stir:CV.blue, skim:'#FF7043', probe:CV.success}
        steps.forEach((s,i)=>{
          const sx=stepW*i+stepW/2
          const done=i<(sim._stepIdx||0), active=i===(sim._stepIdx||0)
          const col=typeCol[s.type]||CV.muted
          const dotCol=done?CV.success:active?col:'#263340'
          const dotR=active?11:done?8:6
          if(i>0){
            ctx.strokeStyle=done?'rgba(87,171,90,0.45)':'rgba(30,50,70,0.7)'; ctx.lineWidth=done?2:1.5
            ctx.beginPath(); ctx.moveTo(stepW*(i-1)+stepW/2,dotY); ctx.lineTo(sx,dotY); ctx.stroke()
          }
          ctx.fillStyle=dotCol; ctx.beginPath(); ctx.arc(sx,dotY,dotR,0,Math.PI*2); ctx.fill()
          if(active){
            ctx.strokeStyle=col; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(sx,dotY,dotR+3,0,Math.PI*2); ctx.stroke()
            const pulse=0.5+0.5*Math.sin(t*6)
            ctx.strokeStyle=`rgba(${col==='#FF8F00'?'255,143,0':col===CV.blue?'41,182,246':'87,171,90'},${pulse*0.4})`; ctx.lineWidth=1.5
            ctx.beginPath(); ctx.arc(sx,dotY,dotR+7,0,Math.PI*2); ctx.stroke()
          }
          if(done){
            ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.font=`bold ${cl(CW*0.009,7,10)}px monospace`
            ctx.textAlign='center'; ctx.fillText('✓',sx,dotY+3.5)
          }
          const raw=(s.label||'').trim(); const words=raw.split(' ')
          const half=Math.ceil(words.length/2); const l1=words.slice(0,half).join(' '); const l2=words.slice(half).join(' ')
          const txtCol=active?col:done?CV.success:'#78909C'
          ctx.fillStyle=txtCol; ctx.font=`${active?'bold ':''}${namSz}px monospace`; ctx.textAlign='center'
          ctx.fillText(l1, sx, namY-(l2?namSz*0.5:0))
          if(l2) ctx.fillText(l2, sx, namY+namSz*0.55)
          ctx.fillStyle=active?`rgba(255,143,0,0.65)`:done?'rgba(87,171,90,0.55)':'#37474F'
          ctx.font=`${timSz}px monospace`; ctx.fillText(`${s.tMin}m`, sx, timY)
        })
        const pct=Math.min(1,(sim._stepIdx||0)/steps.length)
        const pbY=TLY+TLH*0.90, pbH=7
        ctx.fillStyle='#0d1828'; ctx.fillRect(12,pbY,CW-24,pbH)
        const pbG=ctx.createLinearGradient(12,0,CW-24,0)
        pbG.addColorStop(0,'#FF7043'); pbG.addColorStop(0.5,'#FF8F00'); pbG.addColorStop(1,'#57ab5a')
        ctx.fillStyle=pbG; ctx.fillRect(12,pbY,(CW-24)*pct,pbH)
        ctx.strokeStyle='#1a3050'; ctx.lineWidth=0.5; ctx.strokeRect(12,pbY,CW-24,pbH)
        lbB(`${Math.round(pct*100)}% complete  ·  step ${sim._stepIdx||0}/${steps.length}`, CW/2, pbY+pbH+12, '#37474F', cl(CW*0.009,7,10))
      }
    }

    // ── TOP STRIP ─────────────────────────────────────────────────────────
    ctx.fillStyle='rgba(4,8,18,0.80)'; ctx.fillRect(0,0,CW,CH*0.025)
    lbB('TORPEDO DS STATION — DESULPHURISATION', CW/2, CH*0.017, CV.cyan, cl(CW*0.010,8,12))

    // ── LABELS ────────────────────────────────────────────────────────────
    lbB(`TORPEDO LADLE — ${Math.round(sim.ironTemp)}°C`, TCX, TCY-TH-CH*0.055, heatColor(sim.ironTemp,1280,1420), cl(CW*0.012,10,14))
    lb(`[S]:${sim.ironS.toFixed(4)}%  [C]:${sim.ironC.toFixed(3)}%  [Mn]:${sim.ironMn.toFixed(3)}%`, TCX, TCY-TH-CH*0.035, CV.muted, cl(CW*0.010,8,11))

    // Footer
    ctx.fillStyle='rgba(4,8,18,0.92)'; ctx.fillRect(0,CH-16,CW,16)
    ctx.fillStyle='#2c4055'; ctx.font=`${cl(CW*0.009,7,9)}px monospace`; ctx.textAlign='left'
    ctx.fillText(`DS STATION  |  T:${Math.round(sim.ironTemp)}°C  [S]:${sim.ironS.toFixed(4)}%  Slag:${Math.round(sim.slagThick)}mm  |  ${new Date().toLocaleTimeString()}`,8,CH-4)

    } catch(e){console.error('DSCanvas:',e)}
    rafRef.current=requestAnimationFrame(draw)
  },[W,H,running])

  useEffect(()=>{rafRef.current=requestAnimationFrame(draw);return()=>cancelAnimationFrame(rafRef.current)},[draw])
  return <canvas ref={canvasRef} style={{width:'100%',height:'100%',display:'block'}}/>
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function DSModel() {
  // Torpedo inputs
  const [torpedoT,  setTorpedoT]  = useState(1360)
  const [torpedoS,  setTorpedoS]  = useState(0.042)
  const [torpedoC,  setTorpedoC]  = useState(4.50)
  const [torpedoMn, setTorpedoMn] = useState(0.35)
  const [torpedoSi, setTorpedoSi] = useState(0.45)
  const [torpedoP,  setTorpedoP]  = useState(0.110)
  const [torpedoWt, setTorpedoWt] = useState(220)
  const [slagPct,   setSlagPct]   = useState(1.2)
  // Targets
  const [targetS, setTargetS]  = useState(0.010)
  // DS Config
  const [reagentType, setReagentType] = useState('CaC2+CaO')
  const [stirMethod,  setStirMethod]  = useState('N2 lance')
  const [injRate,     setInjRate]     = useState(15)

  const [tab,      setTab]      = useState('input')
  const [schedule, setSchedule] = useState(null)
  const [simState, setSimState] = useState(null)
  const [simRun,   setSimRun]   = useState(false)
  const [soundOn,  setSoundOn]  = useState(true)
  const [elapsed,  setElapsed]  = useState(0)
  const [stepIdx,  setStepIdx]  = useState(0)
  const [CW,setCW] = useState(800)
  const [CH,setCH] = useState(600)

  const simRef   = useRef(null)
  const schedRef = useRef(null)
  const stepRef  = useRef(0)
  const rafPhys  = useRef(null)
  const timerRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(()=>{
    if(!containerRef.current) return
    const ro=new ResizeObserver(entries=>{const e=entries[0];if(e){setCW(Math.round(e.contentRect.width));setCH(Math.round(e.contentRect.height))}})
    ro.observe(containerRef.current)
    const r=containerRef.current.getBoundingClientRect(); if(r.width>0){setCW(Math.round(r.width));setCH(Math.round(r.height))}
    return()=>ro.disconnect()
  },[])

  const computePlan = () => {
    SOUND.stopAll()
    const torpedo={T:torpedoT,S:torpedoS,C:torpedoC,Mn:torpedoMn,Si:torpedoSi,P:torpedoP,slagPct}
    const targets={S:targetS}
    const cfg={weight:torpedoWt,reagentType,stirMethod,injRate}
    const sched=computeDSSchedule(torpedo,targets,cfg)
    schedRef.current=sched; setSchedule(sched)
    const s=initSimState(torpedo); simRef.current=s; setSimState({...s})
    stepRef.current=0; setStepIdx(0); setElapsed(0); setTab('plan')
  }

  // Physics tick
  const doTick = useCallback(()=>{
    const sim=simRef.current; if(!sim) return
    const sched=schedRef.current; if(!sched) return
    sim.t+=0.016; sim.frame++
    const minNow=sim.t/60
    const TCX_=CW*0.50, TCY_=CH*0.46, TW_=CW*0.45, TH_=CH*0.20
    const ironLevel=0.62, ironY_=TCY_-TH_+(TH_*2)*(1-ironLevel)

    // Advance timeline
    while(stepRef.current<sched.timeline.length){
      const step=sched.timeline[stepRef.current]
      if(minNow<step.tMin) break
      if(step.type==='inject'){
        sim.lanceOn=true; sim.lanceY=0.01
        sim.status='INJECTING: '+reagentType; SOUND.startNoise('inj',600,0.18)
        sim.stirLanceY=0.01; sim.stirOn=true
        const inj_dur=sched.stages.find(s=>s.type==='inject')?.min||5
        sim._injEndMin=minNow+inj_dur
      }
      if(step.type==='stir'){
        sim.stirOn=true; sim.stirLanceY=0.01; sim.status='POST-STIRRING'
        SOUND.startNoise('stir',300,0.15); SOUND.playBurst('stir')
        sim._stirEndMin=minNow+4
      }
      if(step.type==='skim'){
        sim.skimOn=true; sim.skimAngle=0; sim.status='SKIMMING SLAG'
        SOUND.playBurst('skim')
        sim._skimEndMin=minNow+(sched.stages.find(s=>s.type==='skim')?.min||4)
      }
      if(step.type==='react'){
        sim.status='REACTION PERIOD'; sim._reactEndMin=minNow+3
      }
      if(step.type==='probe'){
        sim.probeY=0.01; sim.probeDone=false; sim.probeFrames=0; sim.status='SAMPLING + TEMP'
      }
      stepRef.current++; setStepIdx(stepRef.current)
    }

    // Auto-stop
    if(sim.lanceOn && sim._injEndMin && minNow>=sim._injEndMin){
      sim.lanceOn=false; sim.lanceY=Math.max(0,sim.lanceY-0.02)
      SOUND.stopNoise('inj')
    }
    if(sim.stirOn && sim._stirEndMin && minNow>=sim._stirEndMin){
      sim.stirOn=false; sim.stirLanceY=Math.max(0,sim.stirLanceY-0.02)
      SOUND.stopNoise('stir')
    }
    if(sim.skimOn && sim._skimEndMin && minNow>=sim._skimEndMin){
      sim.skimOn=false; sim.skimDone=true
      sim.slagThick=Math.max(2,sim.slagThick*0.25)
    }

    // After all steps done — hold + check complete
    const allDone=stepRef.current>=sched.timeline.length
    if(allDone && !sim.complete && sim.ironS<=targetS+0.001){
      sim.complete=true; sim.status='DS COMPLETE ✓ → READY FOR BOF'
      SOUND.playBurst('complete'); SOUND.stopAll()
    }

    // Physics
    // Lance movement
    if(sim.lanceOn && sim.lanceY<1) sim.lanceY=Math.min(1,sim.lanceY+0.006)
    if(!sim.lanceOn && sim.lanceY>0) sim.lanceY=Math.max(0,sim.lanceY-0.012)
    if(sim.stirOn && sim.stirLanceY<0.85) sim.stirLanceY=Math.min(0.85,sim.stirLanceY+0.008)
    if(!sim.stirOn && sim.stirLanceY>0) sim.stirLanceY=Math.max(0,sim.stirLanceY-0.015)

    // Skim arm rotation
    if(sim.skimOn) sim.skimAngle=Math.min(Math.PI*0.65, sim.skimAngle+0.018)
    // Probe
    if(sim.probeY>0&&!sim.probeDone){sim.probeY=Math.min(0.85,sim.probeY+0.010);if(sim.probeY>=0.80)sim.probeDone=true}
    if(sim.probeDone){sim.probeFrames=(sim.probeFrames||0)+1;if(sim.probeFrames>110){sim.probeY=Math.max(0,sim.probeY-0.018);if(sim.probeY<=0){sim.probeY=0;sim.probeFrames=0;sim.probeDone=false}}}

    // Temperature loss
    const baseLoss=0.020  // °C per tick
    const injLoss=sim.lanceOn?0.025:0
    const stirLoss=sim.stirOn?0.010:0
    sim.ironTemp=Math.max(1280, sim.ironTemp-baseLoss-injLoss-stirLoss)

    // S removal (main physics)
    if(sim.lanceOn && sim.lanceY>0.4){
      const dsRate=0.00008*(injRate/15)*1.2  // %S per tick
      sim.ironS=Math.max(targetS*0.92, sim.ironS-dsRate)
      sim.reagentUsed=Math.min(sched.totalReagentKg, sim.reagentUsed+0.08)
      sim.casFormed=sim.reagentUsed*0.45
    }
    if(sim.stirOn){
      sim.ironS=Math.max(targetS*0.88, sim.ironS-0.000015)
    }
    // Slag thickness
    if(sim.lanceOn) sim.slagThick=Math.min(sim.slagThick*1.002+0.015,60)
    if(sim.skimOn)  sim.slagThick=Math.max(2,sim.slagThick-0.12)
    sim.slagFoam=cl(sim.slagFoam+(sim.lanceOn?0.002:-0.001),0.05,0.90)

    // Particles
    if(sim.lanceOn && sim.lanceY>0.4 && sim.frame%2===0){
      const lx=CW*0.50-TW_*0.08
      const lanceTip=CH*0.06+CH*0.06+(ironY_+20-CH*0.12)*sim.lanceY
      for(let k=0;k<3;k++) sim.injParticles.push({
        x:lx+(Math.random()-0.5)*24, y:lanceTip,
        vx:(Math.random()-0.5)*3, vy:1.5+Math.random()*3,
        life:1, r:2+Math.random()*3.5,
        col:Math.random()>0.5?'rgba(220,200,80,0.85)':'rgba(200,170,60,0.75)'
      })
      // Reaction zones
      if(sim.frame%6===0) sim.reactionZones.push({
        x:TCX_+(Math.random()-0.5)*TW_*0.7, y:ironY_+8+Math.random()*(TH_*0.8),
        r:10+Math.random()*18, life:1
      })
      // Sparks
      if(sim.frame%4===0) sim.sparks.push({
        x:lx+(Math.random()-0.5)*30, y:ironY_-10,
        vx:(Math.random()-0.5)*6, vy:-2-Math.random()*4,
        life:1, r:1+Math.random()*2.5, col:Math.random()>0.4?'rgba(255,220,80,0.90)':'rgba(255,80,0,0.80)'
      })
    }
    if(sim.stirOn && sim.stirLanceY>0.4 && sim.frame%2===0){
      const sx=CW*0.50+TW_*0.35
      sim.stirBubbles.push({
        x:sx+(Math.random()-0.5)*TW_*0.08, y:TCY_+TH_-14,
        vx:(Math.random()-0.5)*1.5, vy:-(1.8+Math.random()*3.5),
        life:1, r:3+Math.random()*6,
        col:`rgba(80,200,255,${0.60+Math.random()*0.28})`
      })
    }
    if(sim.skimOn && sim.frame%3===0){
      sim.slagParticles.push({
        x:TCX_-TW_*0.5+(Math.random())*TW_*0.3, y:TCY_-TH_+4,
        vx:-(1.5+Math.random()*3), vy:-(0.5+Math.random()*2),
        life:1, r:2+Math.random()*5,
        col:`rgba(80,90,28,${0.70+Math.random()*0.25})`
      })
    }

    // Cleanup
    sim.injParticles=(sim.injParticles||[]).filter(p=>p.life>0&&p.y<ironY_+TH_*0.8).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.018}))
    sim.stirBubbles=(sim.stirBubbles||[]).filter(p=>p.life>0&&p.y>ironY_-10).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.010,r:Math.min(p.r+0.04,10)}))
    sim.slagParticles=(sim.slagParticles||[]).filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.15,life:p.life-0.035}))
    sim.sparks=(sim.sparks||[]).filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.22,life:p.life-0.055}))
    sim.reactionZones=(sim.reactionZones||[]).filter(p=>p.life>0).map(p=>({...p,life:p.life-0.040}))

    sim._schedule=schedRef.current
    sim._stepIdx=stepRef.current
    setSimState({...sim,
      injParticles:[...sim.injParticles], stirBubbles:[...sim.stirBubbles],
      slagParticles:[...sim.slagParticles], sparks:[...sim.sparks],
      reactionZones:[...sim.reactionZones]
    })
  },[CW,CH,injRate,targetS,reagentType])

  useEffect(()=>{
    if(!simRun){cancelAnimationFrame(rafPhys.current);return}
    let last=0
    const loop=ts=>{if(ts-last>33){doTick();last=ts};rafPhys.current=requestAnimationFrame(loop)}
    rafPhys.current=requestAnimationFrame(loop)
    return()=>cancelAnimationFrame(rafPhys.current)
  },[simRun,doTick])

  useEffect(()=>{
    if(simRun) timerRef.current=setInterval(()=>setElapsed(t=>t+1),1000)
    else clearInterval(timerRef.current)
    return()=>clearInterval(timerRef.current)
  },[simRun])

  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const ld=simState

  const Col=({c,v,cc})=>(
    <div style={{background:'#0a1520',border:`1px solid ${cc||CV.border}44`,borderRadius:5,padding:'8px 12px',textAlign:'center'}}>
      <div style={{fontSize:10,color:CV.muted,marginBottom:4}}>{c}</div>
      <div style={{fontSize:16,fontWeight:700,color:cc||CV.cyan,fontFamily:'monospace'}}>{v}</div>
    </div>
  )
  const Inp=({label,value,onChange,unit,min,max,step=0.001,color=CV.muted})=>(
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
      <span style={{fontSize:11,color:CV.muted}}>{label}</span>
      <div style={{display:'flex',alignItems:'center',gap:3}}>
        <input type="number" value={value} min={min} max={max} step={step} onChange={e=>onChange(+e.target.value)}
          style={{width:72,padding:'3px 6px',borderRadius:3,border:`1px solid ${CV.border}`,background:'#0d1520',color,fontSize:12,fontFamily:'monospace',fontWeight:700,textAlign:'right'}}/>
        <span style={{fontSize:9,color:CV.muted,width:30}}>{unit}</span>
      </div>
    </div>
  )
  const Sec=({title,col,children})=>(
    <div style={{background:CV.bg,border:`1px solid ${col}33`,borderRadius:6,padding:10,marginBottom:10}}>
      <div style={{fontSize:10,color:col,fontWeight:700,letterSpacing:'0.08em',marginBottom:8}}>{title}</div>
      {children}
    </div>
  )

  return(
    <div style={{height:'100dvh',background:CV.bg,color:CV.text,fontFamily:'monospace',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{background:'#060a10',borderBottom:`1px solid ${CV.border}`,padding:'0 12px',height:50,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:20}}>🏭</span>
          <div>
            <div style={{fontSize:11,fontWeight:700}}>DESULPHURISATION STATION MODEL</div>
            <div style={{fontSize:8,color:CV.muted}}>TORPEDO LADLE INPUT · LOCAL METALLURGICAL ENGINE · REAL-TIME SIMULATION</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {ld&&[
            {l:'TEMP',  v:`${Math.round(ld.ironTemp)}°C`,    c:CV.accent},
            {l:'[S]',   v:`${ld.ironS.toFixed(4)}%`,         c:CV.purple},
            {l:'SLAG',  v:`${Math.round(ld.slagThick)}mm`,   c:'#8BC34A'},
            {l:'TIME',  v:fmt(elapsed),                       c:simRun?CV.success:CV.muted},
          ].map(({l,v,c})=>(
            <div key={l} style={{textAlign:'center'}}>
              <div style={{fontSize:7,color:CV.muted}}>{l}</div>
              <div style={{fontSize:11,fontWeight:700,color:c}}>{v}</div>
            </div>
          ))}
          {['input','plan','simulation'].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:'4px 10px',borderRadius:4,border:`1px solid ${tab===t?CV.accent:CV.border}`,background:tab===t?CV.accent+'22':'transparent',color:tab===t?CV.accent:CV.muted,fontSize:9,fontWeight:700,cursor:'pointer',textTransform:'uppercase'}}>
              {t==='input'?'⚙ Input':t==='plan'?'📋 Plan':'🔬 Sim'}
            </button>
          ))}
          <button onClick={computePlan} style={{padding:'5px 14px',borderRadius:4,border:`2px solid ${CV.cyan}`,background:'rgba(57,197,207,0.15)',color:CV.cyan,fontSize:10,fontWeight:700,cursor:'pointer'}}>⚙ COMPUTE PLAN</button>
          {schedule&&!simRun&&<button onClick={()=>{if(simRef.current){simRef.current.t=0;setElapsed(0);stepRef.current=0;setStepIdx(0)};setSimRun(true);setTab('simulation')}} style={{padding:'5px 14px',borderRadius:4,border:`1px solid ${CV.success}`,background:'rgba(87,171,90,0.15)',color:CV.success,fontSize:10,fontWeight:700,cursor:'pointer'}}>▶ RUN SIM</button>}
          <button onClick={()=>{SOUND.enabled=!SOUND.enabled;if(!SOUND.enabled)SOUND.stopAll();setSoundOn(v=>!v)}} style={{padding:'5px 10px',borderRadius:4,border:`1px solid ${soundOn?CV.cyan:CV.border}`,background:soundOn?'rgba(57,197,207,0.15)':'transparent',color:soundOn?CV.cyan:CV.muted,fontSize:10,fontWeight:700,cursor:'pointer'}}>{soundOn?'🔊':'🔇'}</button>
          {simRun&&<button onClick={()=>{setSimRun(false);SOUND.stopAll()}} style={{padding:'5px 12px',borderRadius:4,border:`1px solid ${CV.danger}`,background:'rgba(229,83,73,0.15)',color:CV.danger,fontSize:10,fontWeight:700,cursor:'pointer'}}>⏸ PAUSE</button>}
        </div>
      </div>

      <div style={{flex:1,overflow:'hidden',display:'flex'}}>
        {/* Left panel */}
        <div style={{width:265,background:CV.panel,borderRight:`1px solid ${CV.border}`,overflow:'auto',flexShrink:0,padding:12}}>
          <Sec title="🚂 TORPEDO DATA" col={CV.accent}>
            <Inp label="Weight"   value={torpedoWt}  onChange={setTorpedoWt}  unit="t"   min={50}  max={400} step={5}   color={CV.accent}/>
            <Inp label="Temp"     value={torpedoT}   onChange={setTorpedoT}   unit="°C"  min={1280} max={1420} step={1} color="#FF6D00"/>
            <Inp label="Slag %"   value={slagPct}    onChange={setSlagPct}    unit="%"   min={0}   max={5}   step={0.1} color="#8BC34A"/>
          </Sec>
          <Sec title="⚗ TORPEDO CHEMISTRY" col="#FF7043">
            <Inp label="[S]%"  value={torpedoS}  onChange={setTorpedoS}  unit="%" min={0.010} max={0.100} step={0.001} color={CV.danger}/>
            <Inp label="[C]%"  value={torpedoC}  onChange={setTorpedoC}  unit="%" min={3.50} max={5.00} step={0.01}  color={CV.blue}/>
            <Inp label="[Mn]%" value={torpedoMn} onChange={setTorpedoMn} unit="%" min={0.10} max={1.00} step={0.01}  color={CV.yellow}/>
            <Inp label="[Si]%" value={torpedoSi} onChange={setTorpedoSi} unit="%" min={0.10} max={1.50} step={0.01}  color={CV.accent}/>
            <Inp label="[P]%"  value={torpedoP}  onChange={setTorpedoP}  unit="%" min={0.05} max={0.20} step={0.001} color={CV.purple}/>
          </Sec>
          <Sec title="🎯 TARGETS" col={CV.success}>
            <Inp label="Target [S]%" value={targetS} onChange={setTargetS} unit="%" min={0.002} max={0.030} step={0.001} color={CV.success}/>
            <div style={{fontSize:9,color:CV.muted,marginTop:4}}>Desulph ratio: <strong style={{color:CV.accent}}>{(torpedoS/targetS).toFixed(1)}×</strong></div>
          </Sec>
          <Sec title="⚙ DS CONFIGURATION" col={CV.cyan}>
            <div style={{marginBottom:8}}>
              <div style={{fontSize:10,color:CV.muted,marginBottom:4}}>Reagent Type</div>
              <select value={reagentType} onChange={e=>setReagentType(e.target.value)}
                style={{width:'100%',padding:'5px 8px',borderRadius:4,border:`1px solid ${CV.border}`,background:'#0d1520',color:CV.accent,fontSize:11,fontFamily:'monospace',fontWeight:700}}>
                {['CaC2+CaO','CaC2','CaO+Mg','Lime+Mg'].map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
            <div style={{marginBottom:8}}>
              <div style={{fontSize:10,color:CV.muted,marginBottom:4}}>Stirring Method</div>
              <select value={stirMethod} onChange={e=>setStirMethod(e.target.value)}
                style={{width:'100%',padding:'5px 8px',borderRadius:4,border:`1px solid ${CV.border}`,background:'#0d1520',color:CV.blue,fontSize:11,fontFamily:'monospace',fontWeight:700}}>
                {['N2 lance','Mechanical stir','Porous plug'].map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
            <Inp label="Injection Rate" value={injRate} onChange={setInjRate} unit="kg/min" min={5} max={30} step={1} color={CV.yellow}/>
          </Sec>
          {/* Live chemistry */}
          {simState&&(
            <Sec title="⚗ LIVE CHEMISTRY" col={CV.cyan}>
              {[['[S]',simState.ironS.toFixed(4),targetS,CV.danger],['[C]',simState.ironC.toFixed(3),torpedoC,CV.blue],['[Mn]',simState.ironMn.toFixed(3),torpedoMn,CV.yellow]].map(([el,val,tgt,c])=>(
                <div key={el} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:`1px solid ${CV.border}`}}>
                  <span style={{fontSize:11,color:CV.muted}}>{el}</span>
                  <div><span style={{fontSize:12,color:c,fontWeight:700}}>{val}%</span><span style={{fontSize:10,color:'#37474F',marginLeft:4}}>→{tgt}%</span></div>
                </div>
              ))}
            </Sec>
          )}
        </div>

        {/* Right content */}
        <div ref={containerRef} style={{flex:1,overflow:'hidden',position:'relative',background:CV.bg}}>
          {/* PLAN tab */}
          {tab==='plan'&&schedule&&(
            <div style={{padding:16,overflow:'auto',height:'100%'}}>
              <div style={{fontSize:16,fontWeight:700,color:CV.cyan,marginBottom:16}}>📋 DS Treatment Plan — Target [S] ≤{targetS}%</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:16}}>
                <Col c="DS OUT TEMP"    v={`${schedule.dsOutTemp}°C`}       cc={CV.accent}/>
                <Col c="HEAT TIME"      v={`${schedule.totalMin}min`}        cc={CV.cyan}/>
                <Col c="REAGENT TOTAL"  v={`${schedule.totalReagentKg}kg`}   cc={CV.yellow}/>
                <Col c="CaS FORMED"     v={`${schedule.casKg}kg`}            cc='#8BC34A'/>
                <Col c="DESULPH RATIO"  v={`${schedule.desulphRatio}×`}      cc={CV.danger}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                {/* Stages */}
                <div style={{background:'#0a1218',border:`1px solid ${CV.accent}33`,borderRadius:8,padding:12}}>
                  <div style={{fontSize:13,fontWeight:700,color:CV.accent,marginBottom:10}}>⚙ DS STAGES</div>
                  <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 3fr',gap:4,marginBottom:4}}>
                    {['Stage','min','Purpose'].map(h=><div key={h} style={{fontSize:11,color:CV.muted,fontWeight:700}}>{h}</div>)}
                  </div>
                  {schedule.stages.map((s,i)=>(
                    <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 3fr',gap:4,padding:'4px 0',borderBottom:`1px solid ${CV.border}`}}>
                      <div style={{fontSize:12,color:CV.text,fontWeight:700}}>{s.name}</div>
                      <div style={{fontSize:12,color:CV.yellow,fontFamily:'monospace'}}>{s.min}</div>
                      <div style={{fontSize:10,color:CV.muted}}>{s.desc}</div>
                    </div>
                  ))}
                </div>
                {/* Reagents */}
                <div style={{background:'#0a1218',border:`1px solid ${CV.yellow}33`,borderRadius:8,padding:12}}>
                  <div style={{fontSize:13,fontWeight:700,color:CV.yellow,marginBottom:10}}>🧪 REAGENTS</div>
                  <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 2fr',gap:4,marginBottom:4}}>
                    {['Reagent','kg','Rate','Eff.'].map(h=><div key={h} style={{fontSize:11,color:CV.muted,fontWeight:700}}>{h}</div>)}
                  </div>
                  {schedule.reagents.map((r,i)=>(
                    <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 2fr',gap:4,padding:'4px 0',borderBottom:`1px solid ${CV.border}`}}>
                      <div style={{fontSize:12,color:CV.text}}>{r.name}</div>
                      <div style={{fontSize:12,color:CV.yellow,fontFamily:'monospace'}}>{r.kg}</div>
                      <div style={{fontSize:11,color:CV.muted}}>{r.rate.split(' ')[0]}</div>
                      <div style={{fontSize:11,color:CV.success}}>{r.efficiency}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                {/* Predicted output */}
                <div style={{background:'#0a1218',border:`1px solid ${CV.success}33`,borderRadius:8,padding:12}}>
                  <div style={{fontSize:13,fontWeight:700,color:CV.success,marginBottom:10}}>📊 PREDICTED OUTPUT</div>
                  {[
                    {l:'[S] out',     v:schedule.expectedS+'%',   c:CV.danger},
                    {l:'[C] out',     v:schedule.expectedC+'%',   c:CV.blue},
                    {l:'[Mn] out',    v:schedule.expectedMn+'%',  c:CV.yellow},
                    {l:'Temp out',    v:schedule.dsOutTemp+'°C',  c:CV.accent},
                    {l:'BOF req. T',  v:schedule.bofRequiredTemp+'°C', c:'#FF5722'},
                    {l:'Temp loss',   v:schedule.totalTempLoss+'°C',   c:CV.muted},
                    {l:'Pre-skim',    v:schedule.preSkimNeeded?'REQUIRED':'Not needed', c:schedule.preSkimNeeded?CV.danger:CV.success},
                  ].map(({l,v,c})=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:`1px solid ${CV.border}`}}>
                      <span style={{fontSize:11,color:CV.muted}}>{l}</span>
                      <span style={{fontSize:13,fontWeight:700,color:c,fontFamily:'monospace'}}>{v}</span>
                    </div>
                  ))}
                </div>
                {/* Risks */}
                <div style={{background:'#0a1218',border:`1px solid ${CV.danger}33`,borderRadius:8,padding:12}}>
                  <div style={{fontSize:13,fontWeight:700,color:CV.danger,marginBottom:10}}>⚠ RISKS</div>
                  {schedule.risks.length>0?schedule.risks.map((r,i)=>(
                    <div key={i} style={{display:'flex',gap:8,padding:'4px 0',borderBottom:`1px solid ${CV.border}`}}>
                      <span style={{fontSize:11,fontWeight:700,color:r.lvl==='HIGH'?CV.danger:r.lvl==='MEDIUM'?CV.accent:CV.yellow,minWidth:60}}>{r.lvl}</span>
                      <span style={{fontSize:11,color:CV.text}}>{r.msg}</span>
                    </div>
                  )):<div style={{fontSize:12,color:CV.success}}>✓ No significant risks identified</div>}
                </div>
              </div>
              <div style={{marginTop:14,display:'flex',justifyContent:'center'}}>
                <button onClick={()=>{if(simRef.current){simRef.current.t=0;setElapsed(0);stepRef.current=0;setStepIdx(0)};setSimRun(true);setTab('simulation')}}
                  style={{padding:'12px 36px',borderRadius:7,border:`2px solid ${CV.success}`,background:'rgba(87,171,90,0.15)',color:CV.success,fontSize:15,fontWeight:700,cursor:'pointer'}}>
                  ▶ RUN DS SIMULATION
                </button>
              </div>
            </div>
          )}
          {/* Simulation */}
          {tab==='simulation'&&simState&&<DSCanvas simRef={simRef} W={CW} H={CH} running={simRun}/>}
          {/* Input splash */}
          {tab==='input'&&!simState&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:18}}>
              <div style={{fontSize:52}}>⚗</div>
              <div style={{fontSize:15,fontWeight:700,color:CV.text}}>Desulphurisation Station Model</div>
              <div style={{fontSize:11,color:CV.muted,maxWidth:440,textAlign:'center',lineHeight:1.9}}>
                Enter torpedo ladle data from the blast furnace cast house.<br/>
                The model computes reagent quantities, injection schedule,<br/>
                temperature budget, and runs a real-time simulation.<br/><br/>
                1. Set torpedo data on the left<br/>
                2. Click <strong style={{color:CV.cyan}}>⚙ COMPUTE PLAN</strong><br/>
                3. Review plan → click <strong style={{color:CV.success}}>▶ RUN SIM</strong>
              </div>
              <button onClick={computePlan} style={{padding:'12px 32px',borderRadius:8,border:`2px solid ${CV.cyan}`,background:'rgba(57,197,207,0.15)',color:CV.cyan,fontSize:13,fontWeight:700,cursor:'pointer'}}>
                ⚙ COMPUTE DS PLAN
              </button>
            </div>
          )}
          {tab==='input'&&simState&&<DSCanvas simRef={simRef} W={CW} H={CH} running={simRun}/>}
          {tab==='plan'&&!schedule&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:CV.muted,fontSize:12}}>
              Click <strong style={{color:CV.cyan,margin:'0 6px'}}>⚙ COMPUTE PLAN</strong> to generate the DS schedule.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
