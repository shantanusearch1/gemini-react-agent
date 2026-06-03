import { useState, useRef, useCallback, useEffect } from 'react'

// ─── SOUND ENGINE ─────────────────────────────────────────────────────────────
class SoundEngine {
  constructor(){ this.ctx=null; this.active={}; this.enabled=true }
  _init(){ if(!this.ctx){try{this.ctx=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}} if(this.ctx?.state==='suspended')this.ctx.resume(); return this.ctx }
  startNoise(id,freq=400,vol=0.18){
    if(!this.enabled||this.active[id])return
    const ctx=this._init();if(!ctx)return
    const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*0.4
    const src=ctx.createBufferSource();src.buffer=buf;src.loop=true
    const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=freq;f.Q.value=0.8
    const g=ctx.createGain();g.gain.value=vol
    src.connect(f);f.connect(g);g.connect(ctx.destination);src.start()
    this.active[id]={src,g}
  }
  stopNoise(id){ const n=this.active[id];if(!n)return;try{n.g.gain.setTargetAtTime(0,this.ctx.currentTime,0.3);setTimeout(()=>{try{n.src.stop()}catch(e){}},500)}catch(e){};delete this.active[id] }
  playBurst(type='inject'){
    if(!this.enabled)return;const ctx=this._init();if(!ctx)return
    if(type==='rake'){
      ;[0,0.1,0.22,0.36,0.50].forEach((t,i)=>{const o=ctx.createOscillator();o.type='triangle';o.frequency.value=180-i*28;const g=ctx.createGain();g.gain.setValueAtTime(0.30-i*0.04,ctx.currentTime+t);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.22);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+0.24)})
    } else if(type==='inject'){
      const buf=ctx.createBuffer(1,ctx.sampleRate*1.5,ctx.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)
      const src=ctx.createBufferSource();src.buffer=buf;const f=ctx.createBiquadFilter();f.type='highpass';f.frequency.value=1600
      const g=ctx.createGain();g.gain.setValueAtTime(0.20,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+1.5)
      src.connect(f);f.connect(g);g.connect(ctx.destination);src.start()
    } else if(type==='probe'){
      ;[0,0.15].forEach((t,i)=>{const o=ctx.createOscillator();o.type='sine';o.frequency.value=880-i*220;const g=ctx.createGain();g.gain.setValueAtTime(0.18,ctx.currentTime+t);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.12);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+0.14)})
    } else if(type==='complete'){
      ;[[523,0],[659,0.12],[784,0.24],[1047,0.38]].forEach(([f,t])=>{const o=ctx.createOscillator();o.type='sine';o.frequency.value=f;const g=ctx.createGain();g.gain.setValueAtTime(0.18,ctx.currentTime+t);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.7);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+0.75)})
    }
  }
  stopAll(){ Object.keys(this.active).forEach(id=>{const n=this.active[id];try{n.g.gain.setTargetAtTime(0,this.ctx.currentTime,0.2);setTimeout(()=>{try{n.src.stop()}catch(e){}},400)}catch(e){}});this.active={} }
}
const SOUND=new SoundEngine()

const CV={bg:'#07090f',panel:'#0b1220',border:'#1a2d45',text:'#cdd9e5',muted:'#6e8098',accent:'#FF8F00',success:'#57ab5a',danger:'#e5534b',cyan:'#39c5cf',purple:'#9b5de5',yellow:'#FFD54F',blue:'#29B6F6'}
const cl=(v,lo,hi)=>Math.max(lo,Math.min(hi,v))

function heatColor(temp,min=1250,max=1420){
  const t=cl((temp-min)/(max-min),0,1)
  if(t>0.85)return`rgba(255,255,${Math.round((1-t)*5*255)},0.97)`
  if(t>0.65)return`rgba(255,${Math.round(100+t*155)},0,0.95)`
  if(t>0.40)return`rgba(${Math.round(200+t*55)},${Math.round(40+t*60)},0,0.90)`
  return`rgba(${Math.round(120+t*80)},${Math.round(20+t*25)},0,0.85)`
}

// ─── LOCAL METALLURGICAL ENGINE ───────────────────────────────────────────────
function computeDSPlan(hm, target, cfg) {
  const { weight, cac2Grade=0.80, caoGrade=0.92 } = cfg
  const dS = hm.S - target.S
  const desulphRatio = hm.S / target.S

  // CaC2 requirement: CaC2 + [S] → CaS + C
  // Theoretical: 1 kg CaC2 removes ~0.32% S per tonne
  // With efficiency factor ~75%
  const cac2Eff = 0.75 * cac2Grade
  const cac2PerTonne = dS / 0.0032 / cac2Eff   // kg/t
  const cac2Total = Math.round(cac2PerTonne * weight)

  // CaO requirement: CaO + [S] + [C] → CaS + CO
  // CaO:CaC2 ratio typically 1.5:1 by weight for good slag fluidity
  const caoTotal = Math.round(cac2Total * 1.4 * (caoGrade/0.92))

  // Injection rate & time
  const injRateKgMin = cfg.injRate || 20   // kg/min combined
  const injTime = Math.round((cac2Total + caoTotal) / injRateKgMin)

  // Temperature losses
  const rakeTime1 = 4, rakeTime2 = 5
  const probeTime = 2
  const injHoldTime = 3  // hold after injection
  const totalMin = rakeTime1 + probeTime + injTime + injHoldTime + rakeTime2 + probeTime
  const tempLossPerMin = 1.6   // °C/min (HM ladle loss)
  const reagentCoolK  = (cac2Total + caoTotal) * 0.018   // °C cooling from cold reagent
  const totalTempLoss = Math.round(totalMin * tempLossPerMin + reagentCoolK)
  const dsOutTemp = Math.round(hm.T - totalTempLoss)

  // Expected chemistry
  const expectedS  = cl(hm.S - dS*0.88, 0.001, hm.S).toFixed(4)
  const expectedC  = cl(hm.C + cac2Total*cac2Grade*0.06/weight/10, hm.C, hm.C+0.15).toFixed(3)  // slight C pickup from CaC2
  const expectedMn = cl(hm.Mn - dS*0.04, 0.001, hm.Mn).toFixed(3)
  const casKg      = Math.round((hm.S - parseFloat(expectedS)) * weight * 10 * 1.7)  // CaS formed

  // Risks
  const risks = []
  if(hm.T < 1300) risks.push({lvl:'HIGH',   msg:`HM temp ${hm.T}°C too low — risk of solidification`})
  if(desulphRatio>5) risks.push({lvl:'HIGH', msg:`Desulph ratio ${desulphRatio.toFixed(1)}× very high — may need 2 passes`})
  if(hm.S > 0.060)  risks.push({lvl:'HIGH', msg:`[S] > 0.060% — extend injection by 20%`})
  if(hm.Si > 0.80)  risks.push({lvl:'MEDIUM',msg:`High [Si]=${hm.Si}% — CaO consumption increases`})
  if(cac2Total > weight*1.8) risks.push({lvl:'MEDIUM',msg:`High CaC2 dose ${cac2Total}kg — risk of C pickup`})
  if(dsOutTemp < 1290) risks.push({lvl:'HIGH',msg:`DS out temp ${dsOutTemp}°C too low for BOF`})

  // Timeline
  const timeline = [
    {type:'rake',  tMin:0,                       label:'Initial Rake'},
    {type:'probe', tMin:rakeTime1,                label:'Temp + Sample'},
    {type:'inject',tMin:rakeTime1+probeTime,      label:'CaC₂+CaO Injection'},
    {type:'hold',  tMin:rakeTime1+probeTime+injTime, label:'Hold / React'},
    {type:'rake',  tMin:rakeTime1+probeTime+injTime+injHoldTime, label:'Final Rake'},
    {type:'probe', tMin:rakeTime1+probeTime+injTime+injHoldTime+rakeTime2, label:'Final T+Sample'},
  ]

  return {
    cac2Total, caoTotal, injTime, totalMin, totalTempLoss, dsOutTemp,
    expectedS, expectedC, expectedMn, casKg, desulphRatio:desulphRatio.toFixed(1),
    risks, timeline, rakeTime1, rakeTime2, probeTime, injHoldTime,
    cac2PerTonne: cac2PerTonne.toFixed(2), tempLossPerMin
  }
}

function initSim(hm, tgt) {
  return {
    t:0, frame:0,
    hmTemp:hm.T, hmS:hm.S, hmC:hm.C, hmMn:hm.Mn, hmSi:hm.Si,
    slagThick:hm.slagPct*15,  // mm
    slagFoam:0.10,
    // Rake arm
    rakeOn:false, rakeAngle:0, rakePhase:'out',
    // Probe
    probeY:0, probeDone:false, probeFrames:0,
    // Injection lance
    lanceY:0, lanceOn:false, lanceTimer:0,
    // Particles
    slagParticles:[], injParticles:[], reactionZones:[],
    sparks:[], probeSparks:[],
    // Progress
    reagentInjected:0, casFormed:0,
    status:'HM LADLE IN POSITION',
    complete:false,
    _schedule:null, _stepIdx:0,
  }
}

// ─── CANVAS ───────────────────────────────────────────────────────────────────
function DSCanvas({simRef,W,H,running}){
  const canvasRef=useRef(null)
  const rafRef=useRef(null)
  useEffect(()=>{const c=canvasRef.current;if(c){c.width=W;c.height=H}},[W,H])

  const draw=useCallback(()=>{
    const canvas=canvasRef.current;if(!canvas){rafRef.current=requestAnimationFrame(draw);return}
    const ctx=canvas.getContext('2d');const CW=canvas.width,CH=canvas.height
    if(!CW||!CH){rafRef.current=requestAnimationFrame(draw);return}
    const sim=simRef.current
    if(!sim){ctx.fillStyle=CV.bg;ctx.fillRect(0,0,CW,CH);rafRef.current=requestAnimationFrame(draw);return}
    try{

    // ── LAYOUT ──────────────────────────────────────────────────────────────
    const LCX=CW*0.50          // ladle centre X
    const LW=CW*0.22           // ladle half-width
    const LH=CH*0.36           // ladle height
    const LY0=CH*0.22          // ladle top
    const LY1=LY0+LH           // ladle bottom
    const LIN=cl(CW*0.014,10,18)
    const t=sim.t

    ctx.fillStyle=CV.bg;ctx.fillRect(0,0,CW,CH)
    ctx.strokeStyle='rgba(255,255,255,0.012)';ctx.lineWidth=0.5
    for(let x=0;x<CW;x+=36){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CH);ctx.stroke()}
    for(let y=0;y<CH;y+=36){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CW,y);ctx.stroke()}
    const lb=(tx,x,y,c,sz=9,al='center')=>{ctx.fillStyle=c;ctx.font=`${sz}px monospace`;ctx.textAlign=al;ctx.fillText(tx,x,y)}
    const lbB=(tx,x,y,c,sz=9,al='center')=>{ctx.fillStyle=c;ctx.font=`bold ${sz}px monospace`;ctx.textAlign=al;ctx.fillText(tx,x,y)}

    // ── OVERHEAD GANTRY / CRANE ──────────────────────────────────────────────
    ctx.fillStyle='#1a2535';ctx.fillRect(0,CH*0.025,CW,8)
    ctx.fillStyle='#263340';ctx.fillRect(0,CH*0.025+2,CW,4)
    lbB('DS STATION OVERHEAD GANTRY',CW/2,CH*0.020,CV.border,cl(CW*0.009,7,9))

    // ── RAKE MACHINE (left of ladle) ─────────────────────────────────────────
    const RAKE_BASE_X=LCX-LW*1.55, RAKE_BASE_Y=LY0+LH*0.10
    ctx.fillStyle='#1e2d3d';ctx.strokeStyle='#2c4055';ctx.lineWidth=1.2
    ctx.fillRect(RAKE_BASE_X-CW*0.04,CH*0.028,CW*0.05,RAKE_BASE_Y-CH*0.028)
    ctx.strokeRect(RAKE_BASE_X-CW*0.04,CH*0.028,CW*0.05,RAKE_BASE_Y-CH*0.028)
    lbB('SLAG RAKE',RAKE_BASE_X-CW*0.015,CH*0.023,sim.rakeOn?'#FF7043':CV.muted,cl(CW*0.009,7,10),'center')
    // Rake arm when active
    if(sim.rakeOn||sim.rakeAngle>0){
      const armLen=LW*1.80
      const armX=RAKE_BASE_X+Math.cos(sim.rakeAngle)*armLen
      const armY=RAKE_BASE_Y+Math.sin(sim.rakeAngle*0.3)*armLen*0.08
      ctx.strokeStyle=sim.rakeOn?'#FF7043':'#546E7A';ctx.lineWidth=cl(CW*0.013,8,14);ctx.lineCap='round'
      ctx.beginPath();ctx.moveTo(RAKE_BASE_X,RAKE_BASE_Y);ctx.lineTo(armX,armY);ctx.stroke()
      ctx.lineCap='butt'
      // Rake teeth at tip
      if(sim.rakeOn){
        for(let ti=0;ti<5;ti++){
          const tx=armX+(ti-2)*8,ty=armY
          ctx.strokeStyle='#FF7043';ctx.lineWidth=3
          ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx-4,ty+16);ctx.stroke()
        }
      }
    }

    // ── INJECTION LANCE (top centre-left) ─────────────────────────────────────
    const LANCE_X=LCX-LW*0.20, LANCE_MACH_Y=CH*0.028
    ctx.fillStyle='#1e2d3d';ctx.strokeStyle='#2c4055';ctx.lineWidth=1.2
    ctx.fillRect(LANCE_X-CW*0.04,LANCE_MACH_Y,CW*0.08,CH*0.055)
    ctx.strokeRect(LANCE_X-CW*0.04,LANCE_MACH_Y,CW*0.08,CH*0.055)
    ctx.fillStyle='#263340';
    ;[LANCE_X-CW*0.016,LANCE_X+CW*0.016].forEach(wx=>{ctx.beginPath();ctx.arc(wx,LANCE_MACH_Y+CH*0.028,CW*0.012,0,Math.PI*2);ctx.fill()})
    lbB('INJ LANCE',LANCE_X,LANCE_MACH_Y-5,sim.lanceOn?CV.accent:CV.muted,cl(CW*0.009,7,10))
    if(sim.lanceY>0){
      const ironSurfY=LY0+CH*0.05+(LY1-LY0-CH*0.05)*0.38
      const lanceTip=LANCE_MACH_Y+CH*0.055+(ironSurfY-LANCE_MACH_Y-CH*0.055)*sim.lanceY
      const lW=cl(CW*0.013,8,13)
      const lGrd=ctx.createLinearGradient(LANCE_X-lW/2,0,LANCE_X+lW/2,0)
      lGrd.addColorStop(0,'#1a3a4a');lGrd.addColorStop(0.5,'#4FC3F7');lGrd.addColorStop(1,'#1a3a4a')
      ctx.fillStyle=lGrd;ctx.fillRect(LANCE_X-lW/2,LANCE_MACH_Y+CH*0.055,lW,lanceTip-LANCE_MACH_Y-CH*0.055)
      ctx.fillStyle='#FF8F00';ctx.fillRect(LANCE_X-lW/2-2,lanceTip-6,lW+4,9)
      if(sim.lanceOn&&sim.lanceY>0.5){
        const pg=ctx.createRadialGradient(LANCE_X,lanceTip,1,LANCE_X,lanceTip,24)
        pg.addColorStop(0,'rgba(255,200,80,0.85)');pg.addColorStop(1,'rgba(200,140,40,0)')
        ctx.fillStyle=pg;ctx.beginPath();ctx.arc(LANCE_X,lanceTip,24,0,Math.PI*2);ctx.fill()
        lb('CaC₂+CaO',LANCE_X+lW/2+6,lanceTip,'rgba(255,200,80,0.75)',cl(CW*0.009,7,9),'left')
      }
      lb(`${Math.round(sim.lanceY*100)}%`,LANCE_X-lW/2-6,(LANCE_MACH_Y+CH*0.055+lanceTip)/2,'rgba(41,182,246,0.55)',cl(CW*0.008,6,8),'right')
    }

    // ── PROBE MACHINE (top centre-right) ──────────────────────────────────────
    const PROBE_X=LCX+LW*0.20, PROBE_MACH_Y=CH*0.028
    ctx.fillStyle='#1e2d3d';ctx.strokeStyle='#2c4055';ctx.lineWidth=1.2
    ctx.fillRect(PROBE_X-CW*0.032,PROBE_MACH_Y,CW*0.064,CH*0.050)
    ctx.strokeRect(PROBE_X-CW*0.032,PROBE_MACH_Y,CW*0.064,CH*0.050)
    ctx.fillStyle='#263340';ctx.beginPath();ctx.arc(PROBE_X,PROBE_MACH_Y+CH*0.025,CW*0.014,0,Math.PI*2);ctx.fill()
    ctx.fillStyle='rgba(200,200,80,0.55)';ctx.beginPath();ctx.arc(PROBE_X,PROBE_MACH_Y+CH*0.025,CW*0.008,0,Math.PI*2);ctx.fill()
    lbB('T+S PROBE',PROBE_X,PROBE_MACH_Y-5,sim.probeY>0?CV.success:CV.muted,cl(CW*0.009,7,10))
    if(sim.probeY>0){
      const ironSurfY2=LY0+CH*0.05+(LY1-LY0-CH*0.05)*0.38
      const pTip=PROBE_MACH_Y+CH*0.050+(ironSurfY2+10-PROBE_MACH_Y-CH*0.050)*Math.min(sim.probeY/0.80,1)
      const pW=cl(CW*0.007,4,7)
      ctx.fillStyle='#37474F';ctx.fillRect(PROBE_X-pW/2,PROBE_MACH_Y+CH*0.050,pW,pTip-PROBE_MACH_Y-CH*0.050)
      ctx.fillStyle=sim.probeDone?`rgba(87,171,90,${0.88+0.12*Math.sin(t*10)})`:'rgba(255,180,0,0.80)'
      ctx.beginPath();ctx.arc(PROBE_X,pTip,6,0,Math.PI*2);ctx.fill()
      if(sim.probeDone){
        const pg2=ctx.createRadialGradient(PROBE_X,pTip,1,PROBE_X,pTip,24)
        pg2.addColorStop(0,`rgba(87,171,90,${0.55+0.35*Math.sin(t*8)})`);pg2.addColorStop(1,'rgba(87,171,90,0)')
        ctx.fillStyle=pg2;ctx.beginPath();ctx.arc(PROBE_X,pTip,24,0,Math.PI*2);ctx.fill()
        lbB(`${Math.round(sim.hmTemp)}°C`,PROBE_X,pTip-30,CV.success,cl(CW*0.012,10,13))
        lb(`[S]:${sim.hmS.toFixed(4)}%`,PROBE_X,pTip-16,CV.success,cl(CW*0.009,7,9))
      }
    }

    // ── HM LADLE SHELL ─────────────────────────────────────────────────────────
    ctx.fillStyle='#1a2535';ctx.strokeStyle='#2c4055';ctx.lineWidth=2.5
    ctx.beginPath()
    ctx.moveTo(LCX-LW,LY0)
    ctx.lineTo(LCX+LW,LY0)
    ctx.lineTo(LCX+LW-LW*0.10,LY1)
    ctx.lineTo(LCX-LW+LW*0.10,LY1)
    ctx.closePath();ctx.fill();ctx.stroke()
    // Trunnion pins
    ;[-1,1].forEach(side=>{
      ctx.fillStyle='#253545';ctx.strokeStyle='#37474F';ctx.lineWidth=1.5
      ctx.fillRect(LCX+side*LW-8,LY0+LH*0.30,16,14);ctx.strokeRect(LCX+side*LW-8,LY0+LH*0.30,16,14)
      // Trunnion axle
      ctx.fillStyle='#1e3040';ctx.fillRect(LCX+side*(LW+CW*0.02),LY0+LH*0.30,CW*0.025,14);ctx.strokeRect(LCX+side*(LW+CW*0.02),LY0+LH*0.30,CW*0.025,14)
    })
    // Ladle support stand
    ;[-LW*0.55,LW*0.55].forEach(ox=>{
      ctx.fillStyle='#141e2c';ctx.strokeStyle='#1e2d3d';ctx.lineWidth=1
      ctx.fillRect(LCX+ox-CW*0.018,LY1,CW*0.036,CH*0.055)
      ctx.strokeRect(LCX+ox-CW*0.018,LY1,CW*0.036,CH*0.055)
    })
    ctx.fillStyle='#0d1520';ctx.fillRect(LCX-LW*0.70,LY1+CH*0.055,LW*1.40,CH*0.018)

    // ── INTERIOR CLIP ──────────────────────────────────────────────────────────
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(LCX-LW+LIN,LY0+LIN)
    ctx.lineTo(LCX+LW-LIN,LY0+LIN)
    ctx.lineTo(LCX+LW-LIN-LIN*0.18,LY1-LIN)
    ctx.lineTo(LCX-LW+LIN+LIN*0.18,LY1-LIN)
    ctx.closePath();ctx.clip()

    // Refractory
    ctx.fillStyle='#1e1408';ctx.fillRect(LCX-LW,LY0,LW*2,LH)
    ctx.fillStyle='#2c1a08';ctx.fillRect(LCX-LW+LIN,LY0+LIN,LW*2-LIN*2,LH-LIN*2)
    // Brick joints
    ctx.strokeStyle='rgba(20,10,4,0.4)';ctx.lineWidth=0.8
    for(let by=LY0+LIN+18;by<LY1-LIN;by+=18){ctx.beginPath();ctx.moveTo(LCX-LW+LIN,by);ctx.lineTo(LCX+LW-LIN,by);ctx.stroke()}

    // Hot metal bath (fills ~70%)
    const bathTop=LY0+LH*(1-0.70)
    const bathGrd=ctx.createLinearGradient(0,bathTop,0,LY1)
    bathGrd.addColorStop(0,heatColor(sim.hmTemp+15,1250,1420))
    bathGrd.addColorStop(0.4,heatColor(sim.hmTemp,1250,1420))
    bathGrd.addColorStop(1,heatColor(sim.hmTemp-35,1250,1420))
    ctx.fillStyle=bathGrd
    ctx.fillRect(LCX-LW+LIN,bathTop,LW*2-LIN*2,LY1-LIN-bathTop)
    // Surface shimmer
    ctx.fillStyle=`rgba(255,210,50,${0.06+0.04*Math.sin(t*3)})`
    ctx.fillRect(LCX-LW+LIN,bathTop,LW*2-LIN*2,3)

    // Slag layer
    const slagH=cl(sim.slagThick*1.6,3,45)
    const slagY=bathTop-slagH
    if(slagH>2){
      const slg=ctx.createLinearGradient(0,slagY,0,bathTop)
      slg.addColorStop(0,`rgba(${Math.round(72+sim.slagFoam*28)},83,28,0.90)`)
      slg.addColorStop(1,'rgba(52,68,18,0.72)')
      ctx.fillStyle=slg;ctx.fillRect(LCX-LW+LIN,slagY,LW*2-LIN*2,slagH)
      if(sim.slagFoam>0.18&&running){
        for(let fx=LCX-LW+LIN+8;fx<LCX+LW-LIN-8;fx+=14){
          const lp=2+sim.slagFoam*7+1.8*Math.sin(t*5+fx*0.2)
          const fg=ctx.createRadialGradient(fx,slagY,0,fx,slagY,lp*1.4)
          fg.addColorStop(0,`rgba(108,104,40,${0.46+sim.slagFoam*0.22})`);fg.addColorStop(1,'rgba(65,80,20,0)')
          ctx.fillStyle=fg;ctx.beginPath();ctx.arc(fx,slagY,lp*1.4,0,Math.PI*2);ctx.fill()
        }
      }
    }

    // Reaction zones
    sim.reactionZones?.forEach(rz=>{
      const rg=ctx.createRadialGradient(rz.x,rz.y,0,rz.x,rz.y,rz.r*2.5)
      rg.addColorStop(0,`rgba(255,${Math.round(100+rz.life*80)},0,${rz.life*0.42})`);rg.addColorStop(1,'rgba(255,60,0,0)')
      ctx.fillStyle=rg;ctx.beginPath();ctx.arc(rz.x,rz.y,rz.r*2.5,0,Math.PI*2);ctx.fill()
    })

    // Injection particles
    sim.injParticles?.forEach(p=>{
      ctx.globalAlpha=p.life*0.82;ctx.fillStyle=p.col
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()
      ctx.globalAlpha=p.life*0.24;ctx.fillStyle='rgba(220,200,80,0.8)'
      ctx.beginPath();ctx.arc(p.x,p.y,p.r*2.2,0,Math.PI*2);ctx.fill()
    });ctx.globalAlpha=1

    ctx.restore() // end clip

    // Slag splash (outside clip, above ladle)
    sim.slagParticles?.forEach(p=>{ctx.globalAlpha=p.life*0.78;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1
    // Sparks
    sim.sparks?.forEach(p=>{ctx.globalAlpha=p.life;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1

    // Ladle border overlay
    ctx.strokeStyle='#2c4055';ctx.lineWidth=2.5
    ctx.beginPath();ctx.moveTo(LCX-LW,LY0);ctx.lineTo(LCX+LW,LY0);ctx.lineTo(LCX+LW-LW*0.10,LY1);ctx.lineTo(LCX-LW+LW*0.10,LY1);ctx.closePath();ctx.stroke()

    lbB(`HOT METAL LADLE`,LCX,LY0-CH*0.028,heatColor(sim.hmTemp,1250,1420),cl(CW*0.013,11,15))
    lb(`${Math.round(sim.hmTemp)}°C  [S]:${sim.hmS.toFixed(4)}%  [C]:${sim.hmC.toFixed(3)}%`,LCX,LY0-CH*0.012,CV.muted,cl(CW*0.010,8,11))

    // ── DATA BOX ───────────────────────────────────────────────────────────────
    const dbX=CW*0.03,dbY=LY1+CH*0.08,dbW=CW*0.94,dbH=CH*0.100
    ctx.fillStyle='rgba(4,8,18,0.92)';ctx.fillRect(dbX,dbY,dbW,dbH)
    ctx.strokeStyle=sim.lanceOn?CV.accent:sim.rakeOn?'#FF7043':sim.complete?CV.success:'#1e3040';ctx.lineWidth=0.8;ctx.strokeRect(dbX,dbY,dbW,dbH)
    lbB('DS STATION',dbX+12,dbY+14,CV.accent,cl(CW*0.013,11,15),'left')
    lbB(sim.status||'',dbX+dbW-10,dbY+14,sim.complete?CV.success:sim.lanceOn?CV.accent:sim.rakeOn?'#FF7043':CV.muted,cl(CW*0.011,9,12),'right')
    const rows=[
      [`T: ${Math.round(sim.hmTemp)}°C`, `[S]:${sim.hmS.toFixed(4)}%`, `[C]:${sim.hmC.toFixed(3)}%`, `[Mn]:${sim.hmMn.toFixed(3)}%`],
      [`Slag: ${Math.round(sim.slagThick)}mm`, `CaS: ${Math.round(sim.casFormed)}kg`, `Reagent: ${Math.round(sim.reagentInjected)}kg`, sim.complete?'DS COMPLETE ✓ → BOF READY':'Treating...']
    ]
    rows.forEach((r,ri)=>{
      const ry=dbY+27+ri*CH*0.026
      r.forEach((cell,ci)=>{
        ctx.fillStyle='rgba(200,218,230,0.94)';ctx.font=`bold ${cl(CW*0.011,9,12)}px monospace`;ctx.textAlign='left'
        ctx.fillText(cell,dbX+14+ci*(dbW-28)/4,ry)
      })
    })
    // Progress bar
    const tf=cl((sim.hmS-targetSRef.current)/(hmSRef.current-targetSRef.current),0,1)
    const prog=1-tf
    ctx.fillStyle='#0a1520';ctx.fillRect(dbX+5,dbY+dbH-14,dbW-10,8)
    ctx.fillStyle=prog>0.9?CV.success:prog>0.5?CV.accent:CV.blue;ctx.fillRect(dbX+5,dbY+dbH-14,(dbW-10)*prog,8)
    ctx.strokeStyle='#1a3050';ctx.lineWidth=0.3;ctx.strokeRect(dbX+5,dbY+dbH-14,dbW-10,8)

    // ── TIMELINE ───────────────────────────────────────────────────────────────
    if(sim._schedule){
      const TLY=dbY+dbH+CH*0.012,TLH=CH*0.19
      ctx.fillStyle='rgba(4,8,18,0.92)';ctx.fillRect(0,TLY,CW,TLH)
      ctx.strokeStyle='#1a2d45';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,TLY);ctx.lineTo(CW,TLY);ctx.stroke()
      const steps=sim._schedule.timeline||[]
      if(steps.length>0){
        const stepW=CW/steps.length,dotY=TLY+TLH*0.28,namY=TLY+TLH*0.56,timY=TLY+TLH*0.78
        const namSz=cl(CW*0.012,10,14),timSz=cl(CW*0.010,8,11)
        const typeCol={rake:'#FF7043',probe:CV.success,inject:CV.accent,hold:CV.yellow,react:'#FF5722'}
        steps.forEach((s,i)=>{
          const sx=stepW*i+stepW/2
          const done=i<(sim._stepIdx||0),active=i===(sim._stepIdx||0)
          const col=typeCol[s.type]||CV.muted
          const dotCol=done?CV.success:active?col:'#263340',dotR=active?11:done?8:6
          if(i>0){ctx.strokeStyle=done?'rgba(87,171,90,0.45)':'rgba(30,50,70,0.7)';ctx.lineWidth=done?2:1.5;ctx.beginPath();ctx.moveTo(stepW*(i-1)+stepW/2,dotY);ctx.lineTo(sx,dotY);ctx.stroke()}
          ctx.fillStyle=dotCol;ctx.beginPath();ctx.arc(sx,dotY,dotR,0,Math.PI*2);ctx.fill()
          if(active){ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(sx,dotY,dotR+3,0,Math.PI*2);ctx.stroke();const pulse=0.5+0.5*Math.sin(t*6);ctx.strokeStyle=`rgba(255,143,0,${pulse*0.4})`;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(sx,dotY,dotR+7,0,Math.PI*2);ctx.stroke()}
          if(done){ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font=`bold ${cl(CW*0.009,7,10)}px monospace`;ctx.textAlign='center';ctx.fillText('✓',sx,dotY+3.5)}
          const raw=(s.label||'').trim();const words=raw.split(' ');const half=Math.ceil(words.length/2);const l1=words.slice(0,half).join(' ');const l2=words.slice(half).join(' ')
          const txtCol=active?col:done?CV.success:'#78909C'
          ctx.fillStyle=txtCol;ctx.font=`${active?'bold ':''}${namSz}px monospace`;ctx.textAlign='center'
          ctx.fillText(l1,sx,namY-(l2?namSz*0.5:0))
          if(l2)ctx.fillText(l2,sx,namY+namSz*0.55)
          ctx.fillStyle=active?`rgba(255,143,0,0.65)`:done?'rgba(87,171,90,0.55)':'#37474F';ctx.font=`${timSz}px monospace`
          ctx.fillText(`${s.tMin}m`,sx,timY)
        })
        const pct=Math.min(1,(sim._stepIdx||0)/steps.length)
        const pbY=TLY+TLH*0.91,pbH=7
        ctx.fillStyle='#0d1828';ctx.fillRect(12,pbY,CW-24,pbH)
        const pbG=ctx.createLinearGradient(12,0,CW-24,0);pbG.addColorStop(0,'#FF7043');pbG.addColorStop(0.5,'#FF8F00');pbG.addColorStop(1,'#57ab5a')
        ctx.fillStyle=pbG;ctx.fillRect(12,pbY,(CW-24)*pct,pbH)
        ctx.strokeStyle='#1a3050';ctx.lineWidth=0.5;ctx.strokeRect(12,pbY,CW-24,pbH)
        lbB(`${Math.round(pct*100)}% complete  ·  step ${sim._stepIdx||0}/${steps.length}`,CW/2,pbY+pbH+12,'#37474F',cl(CW*0.009,7,10))
      }
    }

    // Top strip
    ctx.fillStyle='rgba(4,8,18,0.80)';ctx.fillRect(0,0,CW,CH*0.023)
    lbB('HOT METAL DESULPHURISATION STATION',CW/2,CH*0.016,CV.cyan,cl(CW*0.010,8,12))
    // Footer
    ctx.fillStyle='rgba(4,8,18,0.92)';ctx.fillRect(0,CH-16,CW,16)
    ctx.fillStyle='#2c4055';ctx.font=`${cl(CW*0.009,7,9)}px monospace`;ctx.textAlign='left'
    ctx.fillText(`DS  |  T:${Math.round(sim.hmTemp)}°C  [S]:${sim.hmS.toFixed(4)}%  Slag:${Math.round(sim.slagThick)}mm  |  ${new Date().toLocaleTimeString()}`,8,CH-4)

    }catch(e){console.error('DSCanvas:',e)}
    rafRef.current=requestAnimationFrame(draw)
  },[W,H,running])

  useEffect(()=>{rafRef.current=requestAnimationFrame(draw);return()=>cancelAnimationFrame(rafRef.current)},[draw])
  return <canvas ref={canvasRef} style={{width:'100%',height:'100%',display:'block'}}/>
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function DSModel(){
  const [hmT,  setHmT]   = useState(1355)
  const [hmS,  setHmS]   = useState(0.042)
  const [hmC,  setHmC]   = useState(4.50)
  const [hmMn, setHmMn]  = useState(0.35)
  const [hmSi, setHmSi]  = useState(0.45)
  const [hmP,  setHmP]   = useState(0.110)
  const [hmWt, setHmWt]  = useState(220)
  const [slagPct,setSlagPct]=useState(1.2)
  const [targetS,setTargetS]=useState(0.010)
  const [injRate,setInjRate]=useState(20)
  const [cac2Grade,setCac2Grade]=useState(0.80)
  const [caoGrade, setCaoGrade] =useState(0.92)

  const [tab,setTab]=useState('input')
  const [schedule,setSchedule]=useState(null)
  const [simState,setSimState]=useState(null)
  const [simRun,setSimRun]=useState(false)
  const [soundOn,setSoundOn]=useState(true)
  const [elapsed,setElapsed]=useState(0)
  const [stepIdx,setStepIdx]=useState(0)
  const [CW,setCW]=useState(800)
  const [CH,setCH]=useState(600)

  const simRef=useRef(null)
  const schedRef=useRef(null)
  const stepRef=useRef(0)
  const rafPhys=useRef(null)
  const timerRef=useRef(null)
  const containerRef=useRef(null)
  const targetSRef=useRef(targetS)
  const hmSRef=useRef(hmS)
  useEffect(()=>{targetSRef.current=targetS;hmSRef.current=hmS},[targetS,hmS])

  useEffect(()=>{
    if(!containerRef.current)return
    const ro=new ResizeObserver(entries=>{const e=entries[0];if(e){setCW(Math.round(e.contentRect.width));setCH(Math.round(e.contentRect.height))}})
    ro.observe(containerRef.current)
    const r=containerRef.current.getBoundingClientRect();if(r.width>0){setCW(Math.round(r.width));setCH(Math.round(r.height))}
    return()=>ro.disconnect()
  },[])

  const computePlan=()=>{
    SOUND.stopAll()
    const hm={T:hmT,S:hmS,C:hmC,Mn:hmMn,Si:hmSi,P:hmP,slagPct}
    const sched=computeDSPlan(hm,{S:targetS},{weight:hmWt,injRate,cac2Grade,caoGrade})
    schedRef.current=sched; setSchedule(sched)
    const s=initSim(hm,{S:targetS}); simRef.current=s; setSimState({...s})
    stepRef.current=0; setStepIdx(0); setElapsed(0); setTab('plan')
  }

  const doTick=useCallback(()=>{
    const sim=simRef.current; if(!sim)return
    const sched=schedRef.current; if(!sched)return
    sim.t+=0.016; sim.frame++
    const minNow=sim.t/60
    const LCX_=CW*0.50,LW_=CW*0.22,LY0_=CH*0.22,LY1_=LY0_+CH*0.36
    const bathTop_=LY0_+CH*0.36*(1-0.70)

    // Advance timeline
    while(stepRef.current<sched.timeline.length){
      const step=sched.timeline[stepRef.current]
      if(minNow<step.tMin)break
      const s=step.type
      if(s==='rake'){sim.rakeOn=true;sim.rakeAngle=0;sim.rakePhase='push';sim.status='SLAG RAKING';SOUND.playBurst('rake');sim._rakeEndMin=minNow+(stepRef.current===0?sched.rakeTime1:sched.rakeTime2)}
      if(s==='probe'){sim.probeY=0.01;sim.probeDone=false;sim.probeFrames=0;sim.status='TEMPERATURE + SAMPLING';SOUND.playBurst('probe')}
      if(s==='inject'){sim.lanceOn=true;sim.lanceY=0.01;sim.status='CaC₂+CaO INJECTION';SOUND.startNoise('inj',500,0.18);SOUND.playBurst('inject');sim._injEndMin=minNow+sched.injTime}
      if(s==='hold'){sim.lanceOn=false;sim.lanceY=0;sim.status='REACTION HOLD';SOUND.stopNoise('inj');sim._holdEndMin=minNow+sched.injHoldTime}
      stepRef.current++; setStepIdx(stepRef.current)
    }
    // Auto-stop
    if(sim.rakeOn&&sim._rakeEndMin&&minNow>=sim._rakeEndMin){
      sim.rakeOn=false;sim.rakeAngle=0;sim.slagThick=Math.max(2,sim.slagThick*0.35);sim.status='RAKE DONE'
    }
    if(sim.lanceOn&&sim._injEndMin&&minNow>=sim._injEndMin){
      sim.lanceOn=false;SOUND.stopNoise('inj')
    }
    const allDone=stepRef.current>=sched.timeline.length
    if(allDone&&!sim.complete&&sim.hmS<=targetS+0.001){
      sim.complete=true;sim.status='DS COMPLETE ✓ → BOF READY'
      SOUND.playBurst('complete');SOUND.stopAll()
    }
    if(allDone&&!sim.complete){sim.status='FINAL HOLD — SOFT STIR'}

    // Physics
    const baseLoss=0.022,injLoss=sim.lanceOn?0.018:0,rakeLoss=sim.rakeOn?0.008:0
    sim.hmTemp=Math.max(1260,sim.hmTemp-baseLoss-injLoss-rakeLoss)
    if(sim.lanceOn&&sim.lanceY>0.4){
      const dsRate=0.00010*(injRate/20)
      sim.hmS=Math.max(targetS*0.90,sim.hmS-dsRate)
      sim.reagentInjected=Math.min(sched.cac2Total+sched.caoTotal,sim.reagentInjected+0.12)
      sim.casFormed=Math.round(sim.reagentInjected*0.42)
      sim.slagFoam=cl(sim.slagFoam+0.0015,0,0.88)
    } else {sim.slagFoam=Math.max(0.06,sim.slagFoam-0.001)}
    if(sim.rakeOn){sim.rakeAngle=Math.min(Math.PI*0.70,sim.rakeAngle+0.015)}
    if(!sim.rakeOn&&sim.rakeAngle>0)sim.rakeAngle=Math.max(0,sim.rakeAngle-0.020)
    if(sim.lanceOn&&sim.lanceY<1)sim.lanceY=Math.min(1,sim.lanceY+0.006)
    if(!sim.lanceOn&&sim.lanceY>0)sim.lanceY=Math.max(0,sim.lanceY-0.012)
    if(sim.probeY>0&&!sim.probeDone){sim.probeY=Math.min(0.85,sim.probeY+0.010);if(sim.probeY>=0.80)sim.probeDone=true}
    if(sim.probeDone){sim.probeFrames=(sim.probeFrames||0)+1;if(sim.probeFrames>110){sim.probeY=Math.max(0,sim.probeY-0.018);if(sim.probeY<=0){sim.probeY=0;sim.probeFrames=0;sim.probeDone=false}}}

    // Particles
    if(sim.lanceOn&&sim.lanceY>0.4&&sim.frame%2===0){
      const lx=LCX_-LW_*0.20
      const lanceTip=CH*0.028+CH*0.055+(bathTop_+10-CH*0.083)*sim.lanceY
      for(let k=0;k<3;k++)sim.injParticles.push({x:lx+(Math.random()-0.5)*22,y:lanceTip,vx:(Math.random()-0.5)*2.5,vy:1.5+Math.random()*3,life:1,r:2+Math.random()*3.5,col:Math.random()>0.5?'rgba(220,200,80,0.85)':'rgba(200,170,60,0.75)'})
      if(sim.frame%5===0)sim.reactionZones.push({x:LCX_+(Math.random()-0.5)*LW_*0.7,y:bathTop_+8+Math.random()*CH*0.36*0.55,r:10+Math.random()*18,life:1})
      if(sim.frame%4===0)sim.sparks.push({x:lx+(Math.random()-0.5)*30,y:bathTop_-10,vx:(Math.random()-0.5)*6,vy:-2-Math.random()*4,life:1,r:1+Math.random()*2.5,col:Math.random()>0.4?'rgba(255,220,80,0.90)':'rgba(255,80,0,0.80)'})
    }
    if(sim.rakeOn&&sim.frame%3===0){
      sim.slagParticles.push({x:LCX_-LW_*0.60+(Math.random())*LW_*0.40,y:LY0_+3,vx:-(1.5+Math.random()*3.5),vy:-(0.5+Math.random()*2),life:1,r:2+Math.random()*5,col:`rgba(78,88,25,${0.72+Math.random()*0.25})`})
    }
    sim.injParticles=(sim.injParticles||[]).filter(p=>p.life>0&&p.y<bathTop_+CH*0.36*0.75).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.018}))
    sim.slagParticles=(sim.slagParticles||[]).filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.14,life:p.life-0.032}))
    sim.sparks=(sim.sparks||[]).filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.22,life:p.life-0.055}))
    sim.reactionZones=(sim.reactionZones||[]).filter(p=>p.life>0).map(p=>({...p,life:p.life-0.038}))
    sim._schedule=schedRef.current; sim._stepIdx=stepRef.current
    setSimState({...sim,injParticles:[...sim.injParticles],slagParticles:[...sim.slagParticles],sparks:[...sim.sparks],reactionZones:[...sim.reactionZones]})
  },[CW,CH,injRate,targetS])

  useEffect(()=>{
    if(!simRun){cancelAnimationFrame(rafPhys.current);return}
    let last=0;const loop=ts=>{if(ts-last>33){doTick();last=ts};rafPhys.current=requestAnimationFrame(loop)}
    rafPhys.current=requestAnimationFrame(loop);return()=>cancelAnimationFrame(rafPhys.current)
  },[simRun,doTick])
  useEffect(()=>{if(simRun)timerRef.current=setInterval(()=>setElapsed(t=>t+1),1000);else clearInterval(timerRef.current);return()=>clearInterval(timerRef.current)},[simRun])

  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const ld=simState

  const Col=({c,v,cc})=>(<div style={{background:'#0a1520',border:`1px solid ${cc||CV.border}44`,borderRadius:5,padding:'8px 12px',textAlign:'center'}}><div style={{fontSize:10,color:CV.muted,marginBottom:4}}>{c}</div><div style={{fontSize:16,fontWeight:700,color:cc||CV.cyan,fontFamily:'monospace'}}>{v}</div></div>)
  const Inp=({label,value,onChange,unit,min,max,step=0.001,color=CV.muted})=>(
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
      <span style={{fontSize:11,color:CV.muted}}>{label}</span>
      <div style={{display:'flex',alignItems:'center',gap:3}}>
        <input type="number" value={value} min={min} max={max} step={step} onChange={e=>onChange(+e.target.value)} style={{width:72,padding:'3px 6px',borderRadius:3,border:`1px solid ${CV.border}`,background:'#0d1520',color,fontSize:12,fontFamily:'monospace',fontWeight:700,textAlign:'right'}}/>
        <span style={{fontSize:9,color:CV.muted,width:32}}>{unit}</span>
      </div>
    </div>
  )
  const Sec=({title,col,children})=>(<div style={{background:CV.bg,border:`1px solid ${col}33`,borderRadius:6,padding:10,marginBottom:10}}><div style={{fontSize:10,color:col,fontWeight:700,letterSpacing:'0.08em',marginBottom:8}}>{title}</div>{children}</div>)

  return(
    <div style={{height:'100dvh',background:CV.bg,color:CV.text,fontFamily:'monospace',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{background:'#060a10',borderBottom:`1px solid ${CV.border}`,padding:'0 12px',height:50,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:20}}>⚗</span>
          <div>
            <div style={{fontSize:11,fontWeight:700}}>HOT METAL DESULPHURISATION MODEL</div>
            <div style={{fontSize:8,color:CV.muted}}>RAKE → T+SAMPLE → CaC₂+CaO INJECTION → RAKE → FINAL SAMPLE · LOCAL ENGINE</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {ld&&[{l:'TEMP',v:`${Math.round(ld.hmTemp)}°C`,c:CV.accent},{l:'[S]',v:`${ld.hmS.toFixed(4)}%`,c:CV.danger},{l:'SLAG',v:`${Math.round(ld.slagThick)}mm`,c:'#8BC34A'},{l:'TIME',v:fmt(elapsed),c:simRun?CV.success:CV.muted}].map(({l,v,c})=>(
            <div key={l} style={{textAlign:'center'}}><div style={{fontSize:7,color:CV.muted}}>{l}</div><div style={{fontSize:11,fontWeight:700,color:c}}>{v}</div></div>
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
        <div style={{width:265,background:CV.panel,borderRight:`1px solid ${CV.border}`,overflow:'auto',flexShrink:0,padding:12}}>
          <Sec title="🏺 HM LADLE DATA" col={CV.accent}>
            <Inp label="Weight"  value={hmWt}    onChange={setHmWt}    unit="t"  min={50}  max={400} step={5}   color={CV.accent}/>
            <Inp label="Temp"    value={hmT}     onChange={setHmT}     unit="°C" min={1250} max={1420} step={1} color="#FF6D00"/>
            <Inp label="Slag %"  value={slagPct} onChange={setSlagPct} unit="%"  min={0}   max={5}   step={0.1} color='#8BC34A'/>
          </Sec>
          <Sec title="⚗ HM CHEMISTRY" col="#FF7043">
            <Inp label="[S]%"  value={hmS}  onChange={setHmS}  unit="%" min={0.010} max={0.100} step={0.001} color={CV.danger}/>
            <Inp label="[C]%"  value={hmC}  onChange={setHmC}  unit="%" min={3.5}  max={5.0}  step={0.01}  color={CV.blue}/>
            <Inp label="[Mn]%" value={hmMn} onChange={setHmMn} unit="%" min={0.10} max={1.00} step={0.01}  color={CV.yellow}/>
            <Inp label="[Si]%" value={hmSi} onChange={setHmSi} unit="%" min={0.10} max={1.50} step={0.01}  color={CV.accent}/>
            <Inp label="[P]%"  value={hmP}  onChange={setHmP}  unit="%" min={0.05} max={0.20} step={0.001} color={CV.purple}/>
          </Sec>
          <Sec title="🎯 TARGET" col={CV.success}>
            <Inp label="Target [S]%" value={targetS} onChange={setTargetS} unit="%" min={0.001} max={0.030} step={0.001} color={CV.success}/>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
              <span style={{fontSize:10,color:CV.muted}}>Desulph ratio</span>
              <span style={{fontSize:12,color:CV.accent,fontWeight:700}}>{(hmS/targetS).toFixed(1)}×</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:2}}>
              <span style={{fontSize:10,color:CV.muted}}>Δ[S] to remove</span>
              <span style={{fontSize:12,color:CV.danger,fontWeight:700}}>{(hmS-targetS).toFixed(4)}%</span>
            </div>
          </Sec>
          <Sec title="⚙ REAGENT CONFIG" col={CV.cyan}>
            <Inp label="Inj. Rate"   value={injRate}   onChange={setInjRate}   unit="kg/min" min={5}   max={40}  step={1}   color={CV.yellow}/>
            <Inp label="CaC₂ Grade"  value={cac2Grade} onChange={setCac2Grade} unit=""       min={0.60} max={0.95} step={0.01} color={CV.accent}/>
            <Inp label="CaO Grade"   value={caoGrade}  onChange={setCaoGrade}  unit=""       min={0.80} max={0.99} step={0.01} color='#8BC34A'/>
          </Sec>
          {simState&&(
            <Sec title="⚗ LIVE CHEMISTRY" col={CV.cyan}>
              {[['[S]',simState.hmS.toFixed(4),targetS,CV.danger],['[C]',simState.hmC.toFixed(3),hmC,CV.blue],['[Mn]',simState.hmMn.toFixed(3),hmMn,CV.yellow]].map(([el,val,tgt,c])=>(
                <div key={el} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:`1px solid ${CV.border}`}}>
                  <span style={{fontSize:11,color:CV.muted}}>{el}</span>
                  <div><span style={{fontSize:12,color:c,fontWeight:700}}>{val}%</span><span style={{fontSize:10,color:'#37474F',marginLeft:4}}>→{tgt}%</span></div>
                </div>
              ))}
            </Sec>
          )}
        </div>

        <div ref={containerRef} style={{flex:1,overflow:'hidden',position:'relative',background:CV.bg}}>
          {tab==='plan'&&schedule&&(
            <div style={{padding:16,overflow:'auto',height:'100%'}}>
              <div style={{fontSize:16,fontWeight:700,color:CV.cyan,marginBottom:16}}>📋 DS Treatment Plan — Target [S] ≤ {targetS}%</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:16}}>
                <Col c="CaC₂ TOTAL"   v={`${schedule.cac2Total} kg`}   cc={CV.accent}/>
                <Col c="CaO TOTAL"    v={`${schedule.caoTotal} kg`}    cc='#8BC34A'/>
                <Col c="INJ TIME"     v={`${schedule.injTime} min`}    cc={CV.cyan}/>
                <Col c="TEMP LOSS"    v={`${schedule.totalTempLoss}°C`} cc={CV.danger}/>
                <Col c="DS OUT TEMP"  v={`${schedule.dsOutTemp}°C`}    cc='#FF6D00'/>
              </div>
              {/* Calculation breakdown */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div style={{background:'#0a1218',border:`1px solid ${CV.accent}33`,borderRadius:8,padding:12}}>
                  <div style={{fontSize:13,fontWeight:700,color:CV.accent,marginBottom:10}}>🧪 REAGENT CALCULATION</div>
                  {[
                    {l:'Initial [S]',           v:`${hmS}%`,                    c:CV.danger},
                    {l:'Target [S]',            v:`${targetS}%`,                c:CV.success},
                    {l:'Δ[S] to remove',        v:`${(hmS-targetS).toFixed(4)}%`, c:CV.accent},
                    {l:'Desulph ratio',         v:`${schedule.desulphRatio}×`,  c:CV.accent},
                    {l:'CaC₂ dose rate',        v:`${schedule.cac2PerTonne} kg/t`, c:CV.yellow},
                    {l:'CaC₂ total ('+hmWt+'t)',v:`${schedule.cac2Total} kg`,   c:CV.yellow},
                    {l:'CaO : CaC₂ ratio',      v:`1.4 : 1`,                    c:'#8BC34A'},
                    {l:'CaO total',             v:`${schedule.caoTotal} kg`,    c:'#8BC34A'},
                    {l:'CaS slag formed',        v:`~${schedule.casKg} kg`,     c:'#78909C'},
                  ].map(({l,v,c})=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:`1px solid ${CV.border}`}}>
                      <span style={{fontSize:11,color:CV.muted}}>{l}</span>
                      <span style={{fontSize:13,color:c,fontWeight:700,fontFamily:'monospace'}}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  {/* DS sequence */}
                  <div style={{background:'#0a1218',border:`1px solid ${CV.cyan}33`,borderRadius:8,padding:12}}>
                    <div style={{fontSize:13,fontWeight:700,color:CV.cyan,marginBottom:10}}>⚙ DS SEQUENCE</div>
                    {schedule.timeline.map((s,i)=>{
                      const col={rake:'#FF7043',probe:CV.success,inject:CV.accent,hold:CV.yellow}[s.type]||CV.muted
                      return(
                        <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'5px 0',borderBottom:`1px solid ${CV.border}`}}>
                          <div style={{width:8,height:8,borderRadius:'50%',background:col,flexShrink:0}}/>
                          <span style={{fontSize:12,color:CV.text,flex:1}}>{s.label}</span>
                          <span style={{fontSize:11,color:col,fontFamily:'monospace'}}>{s.tMin}min</span>
                        </div>
                      )
                    })}
                    <div style={{marginTop:8,display:'flex',justifyContent:'space-between'}}>
                      <span style={{fontSize:11,color:CV.muted}}>Total DS time</span>
                      <span style={{fontSize:13,color:CV.cyan,fontWeight:700}}>{schedule.totalMin} min</span>
                    </div>
                  </div>
                  {/* Predicted output */}
                  <div style={{background:'#0a1218',border:`1px solid ${CV.success}33`,borderRadius:8,padding:12}}>
                    <div style={{fontSize:13,fontWeight:700,color:CV.success,marginBottom:10}}>📊 PREDICTED OUTPUT</div>
                    {[
                      {l:'[S] predicted',  v:schedule.expectedS+'%',   c:CV.danger},
                      {l:'[C] predicted',  v:schedule.expectedC+'%',   c:CV.blue},
                      {l:'DS out temp',    v:schedule.dsOutTemp+'°C',  c:CV.accent},
                      {l:'BOF req. temp',  v:schedule.bofRequiredTemp+'°C', c:'#FF5722'},
                    ].map(({l,v,c})=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:`1px solid ${CV.border}`}}>
                        <span style={{fontSize:11,color:CV.muted}}>{l}</span>
                        <span style={{fontSize:13,fontWeight:700,color:c,fontFamily:'monospace'}}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Risks */}
              {schedule.risks.length>0&&(
                <div style={{background:'#0a1218',border:`1px solid ${CV.danger}33`,borderRadius:8,padding:12,marginBottom:12}}>
                  <div style={{fontSize:13,fontWeight:700,color:CV.danger,marginBottom:10}}>⚠ RISKS</div>
                  {schedule.risks.map((r,i)=>(
                    <div key={i} style={{display:'flex',gap:8,padding:'4px 0',borderBottom:`1px solid ${CV.border}`}}>
                      <span style={{fontSize:11,fontWeight:700,color:r.lvl==='HIGH'?CV.danger:r.lvl==='MEDIUM'?CV.accent:CV.yellow,minWidth:60}}>{r.lvl}</span>
                      <span style={{fontSize:11,color:CV.text}}>{r.msg}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{marginTop:14,display:'flex',justifyContent:'center'}}>
                <button onClick={()=>{if(simRef.current){simRef.current.t=0;setElapsed(0);stepRef.current=0;setStepIdx(0)};setSimRun(true);setTab('simulation')}}
                  style={{padding:'12px 36px',borderRadius:7,border:`2px solid ${CV.success}`,background:'rgba(87,171,90,0.15)',color:CV.success,fontSize:15,fontWeight:700,cursor:'pointer'}}>
                  ▶ RUN DS SIMULATION
                </button>
              </div>
            </div>
          )}
          {tab==='simulation'&&simState&&<DSCanvas simRef={simRef} W={CW} H={CH} running={simRun}/>}
          {tab==='input'&&!simState&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:18}}>
              <div style={{fontSize:52}}>⚗</div>
              <div style={{fontSize:15,fontWeight:700,color:CV.text}}>Hot Metal Desulphurisation Station</div>
              <div style={{fontSize:11,color:CV.muted,maxWidth:460,textAlign:'center',lineHeight:1.9}}>
                Hot metal arrives from Blast Furnace in the HM Ladle.<br/>
                The model calculates <strong style={{color:CV.accent}}>CaC₂ and CaO quantities</strong> needed,<br/>
                then simulates the complete DS sequence:<br/><br/>
                <strong style={{color:'#FF7043'}}>Initial Rake</strong> → <strong style={{color:CV.success}}>T+Sample</strong> → <strong style={{color:CV.accent}}>CaC₂+CaO Injection</strong><br/>
                → <strong style={{color:'#FF7043'}}>Final Rake</strong> → <strong style={{color:CV.success}}>Final T+Sample</strong>
              </div>
              <button onClick={computePlan} style={{padding:'12px 32px',borderRadius:8,border:`2px solid ${CV.cyan}`,background:'rgba(57,197,207,0.15)',color:CV.cyan,fontSize:13,fontWeight:700,cursor:'pointer'}}>⚙ COMPUTE DS PLAN</button>
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
