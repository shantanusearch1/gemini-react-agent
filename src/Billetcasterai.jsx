import { useState, useRef, useCallback, useEffect } from 'react'

// ─── SOUND ENGINE ─────────────────────────────────────────────────────────────
class SoundEngine {
  constructor(){ this.ctx=null; this.active={}; this.enabled=true }
  _init(){
    if(!this.ctx){try{this.ctx=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}}
    if(this.ctx?.state==='suspended')this.ctx.resume()
    return this.ctx
  }
  startNoise(id,freq=200,vol=0.12,type='bandpass'){
    if(!this.enabled||this.active[id])return
    const ctx=this._init();if(!ctx)return
    const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate)
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*0.4
    const src=ctx.createBufferSource();src.buffer=buf;src.loop=true
    const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=1.2
    const g=ctx.createGain();g.gain.value=vol
    src.connect(f);f.connect(g);g.connect(ctx.destination);src.start()
    this.active[id]={src,g}
  }
  stopNoise(id){
    const n=this.active[id];if(!n)return
    try{n.g.gain.setTargetAtTime(0,this.ctx.currentTime,0.3);setTimeout(()=>{try{n.src.stop()}catch(e){}},500)}catch(e){}
    delete this.active[id]
  }
  // Mold oscillation clunk sound — periodic thud
  startMoldOsc(){
    if(!this.enabled||this.active['mold_osc'])return
    const ctx=this._init();if(!ctx)return
    let running=true
    const tick=()=>{
      if(!running||!this.enabled)return
      const o=ctx.createOscillator();o.type='sine';o.frequency.value=55
      const g=ctx.createGain();g.gain.setValueAtTime(0.14,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.12)
      o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+0.13)
      setTimeout(tick, 850)  // ~70 osc/min
    }
    tick()
    this.active['mold_osc']={src:{stop:()=>{running=false}},g:{gain:{setTargetAtTime:()=>{}}}}
  }
  // Spray water hiss — continuous per zone
  startSpray(id,intensity=1){
    if(!this.enabled||this.active[id])return
    const ctx=this._init();if(!ctx)return
    const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate)
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*0.3
    const src=ctx.createBufferSource();src.buffer=buf;src.loop=true
    const f=ctx.createBiquadFilter();f.type='highpass';f.frequency.value=3500+intensity*500
    const g=ctx.createGain();g.gain.value=cl(0.04+intensity*0.04,0,0.14)
    src.connect(f);f.connect(g);g.connect(ctx.destination);src.start()
    this.active[id]={src,g}
  }
  playBurst(type='click'){
    if(!this.enabled)return;const ctx=this._init();if(!ctx)return
    if(type==='ladle_open'){
      const o=ctx.createOscillator();o.type='sine';o.frequency.value=100;o.frequency.exponentialRampToValueAtTime(50,ctx.currentTime+0.5)
      const g=ctx.createGain();g.gain.setValueAtTime(0.40,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.6)
      o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+0.6)
    } else if(type==='dummy_bar'){
      ;[0,0.09,0.20].forEach((t,i)=>{
        const o=ctx.createOscillator();o.type='square';o.frequency.value=280-i*55
        const g=ctx.createGain();g.gain.setValueAtTime(0.20,ctx.currentTime+t);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.14)
        o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+0.16)
      })
    } else if(type==='torch'){
      const buf=ctx.createBuffer(1,ctx.sampleRate*1.0,ctx.sampleRate);const d=buf.getChannelData(0)
      for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)
      const src=ctx.createBufferSource();src.buffer=buf
      const f=ctx.createBiquadFilter();f.type='highpass';f.frequency.value=2800
      const g=ctx.createGain();g.gain.setValueAtTime(0.22,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+1.0)
      src.connect(f);f.connect(g);g.connect(ctx.destination);src.start()
    } else if(type==='complete'){
      ;[[523,0],[659,0.12],[784,0.24],[1047,0.38]].forEach(([f,t])=>{
        const o=ctx.createOscillator();o.type='sine';o.frequency.value=f
        const g=ctx.createGain();g.gain.setValueAtTime(0.18,ctx.currentTime+t);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.7)
        o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+0.75)
      })
    } else if(type==='alarm'){
      ;[0,0.3,0.6].forEach(t=>{
        const o=ctx.createOscillator();o.type='square';o.frequency.value=880
        const g=ctx.createGain();g.gain.setValueAtTime(0.22,ctx.currentTime+t);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.25)
        o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+0.28)
      })
    }
  }
  stopAll(){
    Object.keys(this.active).forEach(id=>{
      const n=this.active[id]
      try{n.g.gain.setTargetAtTime(0,this.ctx.currentTime,0.2);setTimeout(()=>{try{n.src.stop()}catch(e){}},400)}catch(e){}
    })
    this.active={}
  }
}
const SOUND=new SoundEngine()
const cl=(v,lo,hi)=>Math.max(lo,Math.min(hi,v))

// ─── GRADES ───────────────────────────────────────────────────────────────────
const GRADES={
  'SAE 1006':    {liqT:1536,solidT:1516,targetSH:22,maxSpeed:2.8,minSpeed:1.2,section:125,CR_Z1:320,CR_Z2:180,CR_Z3:80,moldFlux:'Low-C flux | Vis 2.5-3.5P | B2=1.1'},
  'SAE 1018':    {liqT:1540,solidT:1518,targetSH:28,maxSpeed:2.4,minSpeed:1.0,section:125,CR_Z1:300,CR_Z2:165,CR_Z3:72,moldFlux:'Medium-C flux | Vis 3.0-4.0P | B2=1.0'},
  'SAE 1045':    {liqT:1543,solidT:1520,targetSH:32,maxSpeed:2.0,minSpeed:0.8,section:150,CR_Z1:270,CR_Z2:148,CR_Z3:65,moldFlux:'Medium-C flux | Vis 3.5-4.5P | B2=0.9'},
  'IS 2062 E250':{liqT:1542,solidT:1519,targetSH:28,maxSpeed:2.2,minSpeed:0.9,section:125,CR_Z1:285,CR_Z2:155,CR_Z3:68,moldFlux:'Structural flux | Vis 2.8-3.8P | B2=1.05'},
  'API 5L X65':  {liqT:1542,solidT:1520,targetSH:30,maxSpeed:1.8,minSpeed:0.7,section:150,CR_Z1:250,CR_Z2:138,CR_Z3:60,moldFlux:'Micro-alloyed flux | Vis 2.2-3.2P | B2=1.2'},
  'HSLA 80':     {liqT:1542,solidT:1520,targetSH:30,maxSpeed:1.6,minSpeed:0.7,section:150,CR_Z1:235,CR_Z2:130,CR_Z3:56,moldFlux:'HSLA flux | Vis 2.0-3.0P | B2=1.25'},
}

function steelColor(temp,solid=1480,liquid=1530){
  const t=cl((temp-solid)/(liquid-solid),0,1)
  if(t>0.90)return`rgba(255,255,${Math.round((1-t)*4*255)},0.98)`
  if(t>0.70)return`rgba(255,${Math.round(160+t*95)},0,0.95)`
  if(t>0.45)return`rgba(255,${Math.round(70+t*90)},0,0.92)`
  if(t>0.15)return`rgba(${Math.round(180+t*75)},${Math.round(28+t*42)},0,0.88)`
  return`rgba(55,58,65,0.95)`
}

// ─── LOCAL CASTER ENGINE ──────────────────────────────────────────────────────
function computeCasterPlan(lf,grade,cfg){
  const g=GRADES[grade]||GRADES['IS 2062 E250']
  const {strands=6,ladleWt=130,tundishWt=15,cutLength=12,moldLen=0.70}=cfg
  const k=28  // solidification constant mm·min^0.5
  const transferLoss=8
  const SH=lf.T-transferLoss-g.liqT
  const SHok=SH>=10&&SH<=55
  const shPenalty=Math.max(0,(SH-g.targetSH)*0.018)
  const castSpeed=cl(g.maxSpeed-shPenalty,g.minSpeed,g.maxSpeed)
  const L_met=Math.round(((k*g.section/1000)/castSpeed)**2*60*10)/10
  const shellMold=Math.round(k*Math.sqrt(moldLen/castSpeed*60)*g.section/1000*10)/10
  const tundishTemp=lf.T-transferLoss
  const moldEntryTemp=tundishTemp-2
  const moldExitTemp=moldEntryTemp-38
  const density=7850
  const billetXsect=g.section*g.section
  const billetWt=Math.round(billetXsect/1e6*cutLength*density)
  const wtRate=Math.round(castSpeed*strands*60*billetXsect/1e6*density)
  const castableKg=(ladleWt-tundishWt)*1000
  const heatTimeMin=Math.round(castableKg/wtRate*60/strands)
  const billetsPerStrand=Math.floor(castableKg/(billetXsect/1e6*density*cutLength)/strands)
  const moldOscFreq=Math.round(60+castSpeed*18)  // opm
  const moldOscStroke=8  // mm
  const risks=[]
  if(SH<10)   risks.push({lvl:'HIGH',   msg:`SH ${SH.toFixed(1)}°C too low — freezing risk in tundish`})
  if(SH>55)   risks.push({lvl:'HIGH',   msg:`SH ${SH.toFixed(1)}°C too high — breakout risk, reduce speed`})
  if(lf.Al<0.015)risks.push({lvl:'HIGH',msg:`[Al]=${lf.Al}% low — SEN clogging risk`})
  if(lf.S>0.020) risks.push({lvl:'MEDIUM',msg:`[S]=${lf.S}% high — sulphide inclusions in billet`})
  if(castSpeed>g.maxSpeed*0.94)risks.push({lvl:'MEDIUM',msg:`Near max speed — monitor mold level closely`})
  if(L_met>20) risks.push({lvl:'LOW',   msg:`Long met. length ${L_met}m — verify spray coverage`})
  const timeline=[
    {type:'prep',   tMin:0,  label:'Tundish Preheat'},
    {type:'dummy',  tMin:5,  label:'Dummy Bar Insert'},
    {type:'open',   tMin:8,  label:'Ladle Open SEN'},
    {type:'fill',   tMin:10, label:'Tundish Filling'},
    {type:'cast',   tMin:14, label:'Casting Start'},
    {type:'steady', tMin:18, label:'Steady State'},
    {type:'cut',    tMin:18+Math.round(heatTimeMin*0.45), label:'Billet Cutting'},
    {type:'tail',   tMin:18+heatTimeMin, label:'Tail End Close'},
  ]
  return {
    SH:SH.toFixed(1),SHok,castSpeed:castSpeed.toFixed(2),L_met,shellMold,
    moldEntryTemp:Math.round(moldEntryTemp),moldExitTemp:Math.round(moldExitTemp),
    tundishTemp:Math.round(tundishTemp),
    W1:g.CR_Z1,W2:g.CR_Z2,W3:g.CR_Z3,
    section:g.section,billetWt,wtRate,heatTimeMin,billetsPerStrand,strands,
    cutLength,ladleWt,tundishWt,
    moldOscFreq,moldOscStroke,moldFlux:g.moldFlux,
    predC:lf.C,predMn:(lf.Mn-0.002).toFixed(3),predAl:(lf.Al-0.003).toFixed(3),predS:lf.S.toFixed(4),
    risks,timeline,g,grade
  }
}

function initSim(plan,lf){
  return {
    t:0,frame:0,
    ladleLevel:1.0,ladleOpen:false,
    tundishLevel:0,tundishTemp:lf.T-8,
    steelFlowing:false,
    moldLevel:[0,0,0,0,0,0],  // 6 strands
    moldOscPhase:0,moldOscY:0,
    castStarted:false,
    castSpeed:0,targetSpeed:parseFloat(plan.castSpeed),
    shell:[[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],  // 6 strands × 3 zones
    poolDepth:[0,0,0,0,0,0],
    billetLen:[0,0,0,0,0,0],
    billetsCount:0,
    torchActive:[false,false,false,false,false,false],
    torchPos:[0,0,0,0,0,0],
    strandClosed:[false,false,false,false,false,false],  // manual strand on/off
    steelDrops:[],sparks:[],splashes:[],
    sprayActive:[false,false,false],  // Z1, Z2, Z3
    sprayDrops:[],
    status:'TUNDISH PREHEATING',
    complete:false,
    alarms:[],
    _schedule:null,_stepIdx:0,
    moldEntryT:plan.moldEntryTemp,
  }
}

// ─── CANVAS ───────────────────────────────────────────────────────────────────
function CasterCanvas({simRef,planRef,W,H,running,onStrandClick}){
  const canvasRef=useRef(null)
  const rafRef=useRef(null)
  useEffect(()=>{const c=canvasRef.current;if(c){c.width=W;c.height=H}},[W,H])

  const handleClick=useCallback((e)=>{
    const canvas=canvasRef.current;if(!canvas)return
    const rect=canvas.getBoundingClientRect()
    const scaleX=canvas.width/rect.width,scaleY=canvas.height/rect.height
    const cx=(e.clientX-rect.left)*scaleX,cy=(e.clientY-rect.top)*scaleY
    const plan=planRef.current;if(!plan)return
    const NSTR=6,TUN_X=canvas.width*0.06,TUN_W=canvas.width*0.60
    const strPad=TUN_X+TUN_W*0.08,strSpacing=(TUN_W*0.84)/(NSTR-1)
    const MOL_W=canvas.width*0.038
    const MOL_Y=canvas.height*0.04+canvas.height*0.16+canvas.height*0.03+canvas.height*0.065+canvas.height*0.02
    const STR_Y=MOL_Y+canvas.height*0.075,STR_H=canvas.height*0.32
    for(let si=0;si<NSTR;si++){
      const sx=strPad+si*strSpacing-MOL_W/2
      if(cx>=sx-8&&cx<=sx+MOL_W+8&&cy>=STR_Y&&cy<=STR_Y+STR_H){
        if(onStrandClick)onStrandClick(si)
        return
      }
    }
  },[planRef,onStrandClick])

  const draw=useCallback(()=>{
    const canvas=canvasRef.current;if(!canvas){rafRef.current=requestAnimationFrame(draw);return}
    const ctx=canvas.getContext('2d');const CW=canvas.width,CH=canvas.height
    if(!CW||!CH){rafRef.current=requestAnimationFrame(draw);return}
    const sim=simRef.current,plan=planRef.current
    if(!sim||!plan){ctx.fillStyle='#07090f';ctx.fillRect(0,0,CW,CH);rafRef.current=requestAnimationFrame(draw);return}
    try{
    const t=sim.t
    ctx.fillStyle='#07090f';ctx.fillRect(0,0,CW,CH)
    ctx.strokeStyle='rgba(255,255,255,0.010)';ctx.lineWidth=0.5
    for(let x=0;x<CW;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,CH);ctx.stroke()}
    for(let y=0;y<CH;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(CW,y);ctx.stroke()}
    const lb =(tx,x,y,c,sz=9,al='center')=>{ctx.fillStyle=c;ctx.font=`${sz}px monospace`;ctx.textAlign=al;ctx.fillText(tx,x,y)}
    const lbB=(tx,x,y,c,sz=9,al='center')=>{ctx.fillStyle=c;ctx.font=`bold ${sz}px monospace`;ctx.textAlign=al;ctx.fillText(tx,x,y)}

    // ── LAYOUT ────────────────────────────────────────────────────────────
    const LADLE_CX=CW*0.15, LADLE_Y=CH*0.04, LADLE_W=CW*0.10, LADLE_H=CH*0.16
    const TUN_X=CW*0.06, TUN_Y=LADLE_Y+LADLE_H+CH*0.03, TUN_W=CW*0.60, TUN_H=CH*0.065
    const MOL_Y=TUN_Y+TUN_H+CH*0.02
    const MOL_H=CH*0.075, MOL_W=CW*0.038
    const STR_Y=MOL_Y+MOL_H
    const STR_H=CH*0.32
    const NSTR=6
    // 6 strand positions evenly spaced under tundish
    const strPad=TUN_X+TUN_W*0.08
    const strSpacing=(TUN_W*0.84)/(NSTR-1)
    const strX=(i)=>strPad+i*strSpacing-MOL_W/2

    // ── OVERHEAD CRANE RAIL ───────────────────────────────────────────────
    ctx.fillStyle='#1a2535';ctx.fillRect(0,CH*0.022,CW*0.85,7)
    ctx.fillStyle='#263340';ctx.fillRect(0,CH*0.022+2,CW*0.85,3)
    lbB('OVERHEAD CRANE RAIL',CW*0.35,CH*0.018,'#1e3040',cl(CW*0.009,7,9))

    // ── LADLE ─────────────────────────────────────────────────────────────
    const LLIN=cl(CW*0.006,4,8)
    ctx.fillStyle='#1a2535';ctx.strokeStyle='#2c4055';ctx.lineWidth=2
    ctx.beginPath();ctx.moveTo(LADLE_CX-LADLE_W/2,LADLE_Y);ctx.lineTo(LADLE_CX+LADLE_W/2,LADLE_Y);ctx.lineTo(LADLE_CX+LADLE_W/2-5,LADLE_Y+LADLE_H);ctx.lineTo(LADLE_CX-LADLE_W/2+5,LADLE_Y+LADLE_H);ctx.closePath();ctx.fill();ctx.stroke()
    ctx.fillStyle='#1e1408';ctx.fillRect(LADLE_CX-LADLE_W/2+LLIN,LADLE_Y+LLIN,LADLE_W-LLIN*2,LADLE_H-LLIN*2)
    const ladleH=(LADLE_H-LLIN*2)*sim.ladleLevel*0.92
    const ladY=LADLE_Y+LADLE_H-LLIN-ladleH
    if(ladleH>3){
      const lg=ctx.createLinearGradient(0,ladY,0,LADLE_Y+LADLE_H-LLIN)
      lg.addColorStop(0,steelColor(sim.tundishTemp+8,1480,1540));lg.addColorStop(1,steelColor(sim.tundishTemp-15,1480,1540))
      ctx.fillStyle=lg;ctx.fillRect(LADLE_CX-LADLE_W/2+LLIN,ladY,LADLE_W-LLIN*2,ladleH)
      ctx.fillStyle=`rgba(255,215,55,${0.06+0.04*Math.sin(t*3)})`;ctx.fillRect(LADLE_CX-LADLE_W/2+LLIN,ladY,LADLE_W-LLIN*2,3)
    }
    // SEN nozzle
    ctx.fillStyle='#263340';ctx.strokeStyle='#37474F';ctx.lineWidth=1
    ctx.fillRect(LADLE_CX-CW*0.007,LADLE_Y+LADLE_H,CW*0.014,CH*0.018);ctx.strokeRect(LADLE_CX-CW*0.007,LADLE_Y+LADLE_H,CW*0.014,CH*0.018)
    // Trunnions
    ;[-1,1].forEach(s=>{ctx.fillStyle='#253545';ctx.fillRect(LADLE_CX+s*LADLE_W/2-4,LADLE_Y+LADLE_H*0.35,8,10)})
    lbB('LADLE',LADLE_CX,LADLE_Y-6,'#FF8F00',cl(CW*0.011,9,13))
    lb(`${Math.round(sim.ladleLevel*100)}%`,LADLE_CX,LADLE_Y+LADLE_H*0.55,sim.ladleLevel>0.2?'#FFD54F':'#e5534b',cl(CW*0.012,10,14))

    // Steel stream ladle → tundish
    if(sim.ladleOpen&&sim.ladleLevel>0.01){
      const streamH=TUN_Y-(LADLE_Y+LADLE_H+CH*0.018)
      const sg=ctx.createLinearGradient(0,LADLE_Y+LADLE_H+CH*0.018,0,TUN_Y)
      sg.addColorStop(0,steelColor(sim.tundishTemp+12,1480,1540));sg.addColorStop(1,steelColor(sim.tundishTemp,1480,1540))
      ctx.fillStyle=sg;ctx.fillRect(LADLE_CX-CW*0.005,LADLE_Y+LADLE_H+CH*0.018,CW*0.010,streamH)
      if(sim.frame%4<2){ctx.fillStyle='rgba(255,220,80,0.22)';ctx.fillRect(LADLE_CX-CW*0.005,LADLE_Y+LADLE_H+CH*0.018,CW*0.010,streamH)}
    }

    // ── TUNDISH ───────────────────────────────────────────────────────────
    ctx.fillStyle='#1a2535';ctx.strokeStyle='#2c4055';ctx.lineWidth=2
    ctx.beginPath();ctx.moveTo(TUN_X,TUN_Y);ctx.lineTo(TUN_X+TUN_W,TUN_Y);ctx.lineTo(TUN_X+TUN_W-10,TUN_Y+TUN_H);ctx.lineTo(TUN_X+10,TUN_Y+TUN_H);ctx.closePath();ctx.fill();ctx.stroke()
    const TLIN=cl(CW*0.006,3,7)
    ctx.fillStyle='#1e1408';ctx.fillRect(TUN_X+TLIN,TUN_Y+TLIN,TUN_W-TLIN*2,TUN_H-TLIN*2)
    const tunH2=(TUN_H-TLIN*2)*sim.tundishLevel*0.88
    if(tunH2>2){
      const tunY2=TUN_Y+TUN_H-TLIN-tunH2
      const tg=ctx.createLinearGradient(0,tunY2,0,TUN_Y+TUN_H-TLIN)
      tg.addColorStop(0,steelColor(sim.tundishTemp,1480,1540));tg.addColorStop(1,steelColor(sim.tundishTemp-12,1480,1540))
      ctx.fillStyle=tg;ctx.fillRect(TUN_X+TLIN,tunY2,TUN_W-TLIN*2,tunH2)
      ctx.fillStyle=`rgba(255,210,50,${0.05+0.04*Math.sin(t*3.5)})`;ctx.fillRect(TUN_X+TLIN,tunY2,TUN_W-TLIN*2,3)
    }
    lbB('TUNDISH',TUN_X+TUN_W/2,TUN_Y-6,'#39c5cf',cl(CW*0.011,9,13))
    lb(`${Math.round(sim.tundishTemp)}°C  SH:${Math.round(sim.tundishTemp-(plan.g?.liqT||1542))}°C`,TUN_X+TUN_W/2,TUN_Y+TUN_H+12,'#6e8098',cl(CW*0.009,7,10))

    // ── 6 MOLDS + STRANDS ─────────────────────────────────────────────────
    for(let si=0;si<NSTR;si++){
      const sx=strX(si)
      const moldOff=sim.castStarted?(sim.moldOscY||0):0  // mold oscillation vertical offset

      // SEN from tundish to mold
      const senX=sx+MOL_W/2, senTop=TUN_Y+TUN_H, senBot=MOL_Y+MOL_H*0.45
      ctx.fillStyle='#1e2d3d';ctx.strokeStyle='#37474F';ctx.lineWidth=0.7
      ctx.fillRect(senX-CW*0.005,senTop,CW*0.010,senBot-senTop);ctx.strokeRect(senX-CW*0.005,senTop,CW*0.010,senBot-senTop)
      if(sim.steelFlowing&&sim.tundishLevel>0.05){
        const sg2=ctx.createLinearGradient(0,senTop,0,senBot)
        sg2.addColorStop(0,steelColor(sim.tundishTemp-3,1480,1540));sg2.addColorStop(1,steelColor(sim.tundishTemp-10,1480,1540))
        ctx.fillStyle=sg2;ctx.fillRect(senX-CW*0.004,senTop,CW*0.008,senBot-senTop)
      }

      // ── MOLD (with oscillation) ──────────────────────────────────────
      const mY=MOL_Y+moldOff
      // Mold body (copper mold box)
      ctx.fillStyle='#8D6E63';ctx.strokeStyle='#5D4037';ctx.lineWidth=2
      ctx.fillRect(sx-MOL_W*0.12,mY,MOL_W*1.24,MOL_H);ctx.strokeRect(sx-MOL_W*0.12,mY,MOL_W*1.24,MOL_H)
      // Copper inner walls visible
      ctx.fillStyle='#A1887F';ctx.fillRect(sx,mY+3,MOL_W,MOL_H-6)
      // Water cooling channels in mold wall
      ctx.strokeStyle='rgba(41,182,246,0.35)';ctx.lineWidth=1.2
      for(let my=mY+4;my<mY+MOL_H-4;my+=5){ctx.beginPath();ctx.moveTo(sx,my);ctx.lineTo(sx+MOL_W,my);ctx.stroke()}
      // Steel meniscus in mold
      const moldSH=(MOL_H-6)*cl(sim.moldLevel[si],0,0.95)
      if(moldSH>3){
        const mg=ctx.createLinearGradient(0,mY+3,0,mY+MOL_H-3)
        mg.addColorStop(0,steelColor(plan.moldEntryTemp||1540,1480,1560));mg.addColorStop(1,steelColor(1495,1480,1560))
        ctx.fillStyle=mg;ctx.fillRect(sx,mY+3,MOL_W,moldSH)
        // Meniscus shimmer
        ctx.fillStyle=`rgba(255,220,60,${0.09+0.07*Math.sin(t*4+si*0.8+moldOff*0.1)})`
        ctx.fillRect(sx,mY+3,MOL_W,3)
      }
      // Mold oscillation indicator arrow
      if(sim.castStarted){
        const arrX=sx-MOL_W*0.12-12
        const arrowDir=moldOff>0?1:-1
        ctx.strokeStyle=`rgba(255,143,0,${0.55+0.35*Math.abs(Math.sin(t*5))})`;ctx.lineWidth=1.5
        ctx.beginPath();ctx.moveTo(arrX,mY+MOL_H*0.35);ctx.lineTo(arrX,mY+MOL_H*0.65);ctx.stroke()
        ctx.beginPath();ctx.moveTo(arrX-3,mY+MOL_H*(arrowDir>0?0.55:0.45));ctx.lineTo(arrX,mY+MOL_H*(arrowDir>0?0.65:0.35));ctx.lineTo(arrX+3,mY+MOL_H*(arrowDir>0?0.55:0.45));ctx.stroke()
      }
      // Mold level % label
      const mlvPct=Math.round(cl(sim.moldLevel[si],0,1)*100)
      lb(`${mlvPct}%`,sx+MOL_W/2,mY+MOL_H+10,mlvPct>88?'#e5534b':mlvPct>40?'#57ab5a':'#29B6F6',cl(CW*0.009,6,9))
      lb(`S${si+1}`,sx+MOL_W/2,mY-5,'#37474F',cl(CW*0.009,7,9))

      // ── STRAND (vertical billet below mold) ───────────────────────────
      const stY=STR_Y, stH=STR_H
      if(sim.castStarted||sim.moldLevel[si]>0.05){
        // Outer solidified shell
        ctx.fillStyle='#2a2a30';ctx.fillRect(sx,stY,MOL_W,stH)
        // Liquid core
        const sh0=cl(sim.shell[si][0]||0,0,MOL_W/2-1)
        const coreW=Math.max(1,MOL_W-sh0*2)
        const coreX=sx+sh0
        const poolBot=stY+stH*cl(sim.poolDepth[si]||0.7,0,1)
        if(coreW>1){
          const cg=ctx.createLinearGradient(0,stY,0,poolBot)
          cg.addColorStop(0,steelColor(1510,1480,1560));cg.addColorStop(0.4,steelColor(1490,1480,1560));cg.addColorStop(0.8,steelColor(1475,1480,1560));cg.addColorStop(1,steelColor(1460,1480,1560))
          ctx.fillStyle=cg;ctx.fillRect(coreX,stY,coreW,poolBot-stY)
        }
        // Shell thickness marks at 3 depths
        ;[0,0.35,0.70].forEach((frac,zi)=>{
          const zy=stY+stH*frac
          const sh=cl(sim.shell[si][zi]||0,0,MOL_W/2-1)
          ctx.fillStyle='rgba(70,80,95,0.75)';ctx.fillRect(sx,zy,sh,2);ctx.fillRect(sx+MOL_W-sh,zy,sh,2)
        })
        // Casting speed arrows
        if(sim.castSpeed>0.1){
          ctx.strokeStyle=`rgba(87,171,90,0.35)`;ctx.lineWidth=1
          for(let ay=stY+8;ay<stY+stH-15;ay+=24){
            ctx.beginPath();ctx.moveTo(sx+MOL_W/2,ay);ctx.lineTo(sx+MOL_W/2,ay+14);ctx.stroke()
            ctx.beginPath();ctx.moveTo(sx+MOL_W/2-3,ay+8);ctx.lineTo(sx+MOL_W/2,ay+14);ctx.lineTo(sx+MOL_W/2+3,ay+8);ctx.stroke()
          }
        }
      }

      // ── SPRAY ZONES ─────────────────────────────────────────────────
      const Z1Y=stY,      Z1H=stH*0.22
      const Z2Y=stY+Z1H,  Z2H=stH*0.32
      const Z3Y=stY+Z1H+Z2H,Z3H=stH*0.32
      const zones=[
        {y:Z1Y,h:Z1H,flow:plan.W1,col:'rgba(41,182,246,',label:'Z1',active:sim.sprayActive[0]},
        {y:Z2Y,h:Z2H,flow:plan.W2,col:'rgba(100,200,255,',label:'Z2',active:sim.sprayActive[1]},
        {y:Z3Y,h:Z3H,flow:plan.W3,col:'rgba(150,215,255,',label:'Z3',active:sim.sprayActive[2]},
      ]
      zones.forEach((z,zi)=>{
        if(!sim.castStarted)return
        // Zone boundary line
        ctx.strokeStyle=`${z.col}0.18)`;ctx.lineWidth=0.6;ctx.setLineDash([3,3])
        ctx.beginPath();ctx.moveTo(sx-14,z.y);ctx.lineTo(sx+MOL_W+6,z.y);ctx.stroke()
        ctx.setLineDash([])
        // Spray nozzle boxes
        ;[[sx-14,1],[sx+MOL_W+2,-1]].forEach(([nx,dir])=>{
          ctx.fillStyle='#1a2d40';ctx.strokeStyle='#2c4055';ctx.lineWidth=0.8
          ctx.fillRect(nx,z.y+4,8,z.h-8);ctx.strokeRect(nx,z.y+4,8,z.h-8)
          // Spray jets (animated droplets)
          if(z.active&&running){
            const nozzleCount=Math.ceil(z.h/18)
            for(let ni=0;ni<nozzleCount;ni++){
              const ny=z.y+8+ni*18
              if(ny>z.y+z.h-8)break
              const phase=t*6+ni*0.7+si*0.4
              for(let di=0;di<5;di++){
                const da=(di/5)*0.7
                const ddx=dir*(8+da*18+Math.sin(phase+di)*3)
                const ddy=(Math.random()-0.5)*4+di*3
                ctx.fillStyle=`${z.col}${0.55-da*0.08})`
                ctx.beginPath();ctx.arc(nx+(dir>0?8:0)+ddx,ny+ddy,1.2,0,Math.PI*2);ctx.fill()
              }
            }
          }
        })
        // Zone label (only on strand 0)
        if(si===0) lb(`${z.label} ${z.flow}l/m`,sx-CW*0.022,z.y+z.h*0.5,`${z.col}0.60)`,cl(CW*0.008,6,8),'right')
      })

      // ── TORCH CUT ─────────────────────────────────────────────────────
      const CUT_Y=stY+stH*0.86
      ctx.strokeStyle='rgba(229,83,73,0.18)';ctx.lineWidth=0.6;ctx.setLineDash([3,3])
      ctx.beginPath();ctx.moveTo(sx-12,CUT_Y);ctx.lineTo(sx+MOL_W+6,CUT_Y);ctx.stroke()
      ctx.setLineDash([])
      if(sim.torchActive[si]){
        const tx=sx+MOL_W/2+sim.torchPos[si]
        ctx.fillStyle='#263340';ctx.fillRect(tx-3,CUT_Y-9,6,18)
        const tg=ctx.createRadialGradient(tx,CUT_Y,0,tx,CUT_Y,18)
        tg.addColorStop(0,'rgba(255,255,200,0.98)');tg.addColorStop(0.3,'rgba(255,160,0,0.82)');tg.addColorStop(1,'rgba(255,60,0,0)')
        ctx.fillStyle=tg;ctx.beginPath();ctx.arc(tx,CUT_Y,18,0,Math.PI*2);ctx.fill()
      }
      // Billet length indicator bar
      const billetPct=cl(sim.billetLen[si]/plan.cutLength,0,1)
      ctx.fillStyle='#0a1520';ctx.fillRect(sx,stY+stH+3,MOL_W,5)
      ctx.fillStyle=billetPct>0.85?'#FF7043':'#57ab5a';ctx.fillRect(sx,stY+stH+3,MOL_W*billetPct,5)
      lb(`${sim.billetLen[si].toFixed(1)}m`,sx+MOL_W/2,stY+stH+16,'#6e8098',cl(CW*0.008,5,8))
    }

    // Draw closed strand overlays
    for(let si=0;si<NSTR;si++){
      if(!sim.strandClosed||!sim.strandClosed[si])continue
      const sx=strX(si)
      const stY=STR_Y,stH=STR_H,mY=MOL_Y
      // Dim the entire strand column
      ctx.fillStyle='rgba(4,8,18,0.72)';ctx.fillRect(sx-MOL_W*0.15,mY,MOL_W*1.30,stH+MOL_H+24)
      // Red X marker
      ctx.strokeStyle='rgba(229,83,73,0.90)';ctx.lineWidth=3
      const mx=sx+MOL_W/2,my2=stY+stH*0.45,ms=16
      ctx.beginPath();ctx.moveTo(mx-ms,my2-ms);ctx.lineTo(mx+ms,my2+ms);ctx.stroke()
      ctx.beginPath();ctx.moveTo(mx+ms,my2-ms);ctx.lineTo(mx-ms,my2+ms);ctx.stroke()
      // CLOSED label
      ctx.save();ctx.translate(mx,my2+ms+18);
      lbB('CLOSED',0,0,'#e5534b',cl(CW*0.010,8,11))
      ctx.restore()
      // Click to open hint
      lbB('click to open',mx,my2+ms+32,'rgba(229,83,73,0.45)',cl(CW*0.008,6,8))
    }
    // Click hint on open strands when casting
    if(sim.castStarted){
      for(let si=0;si<NSTR;si++){
        if(sim.strandClosed&&sim.strandClosed[si])continue
        const sx=strX(si);const stY=STR_Y
        lb('tap to close',sx+MOL_W/2,stY-14,'rgba(87,171,90,0.28)',cl(CW*0.007,5,7))
      }
    }

    // Sparks
    sim.sparks?.forEach(p=>{ctx.globalAlpha=p.life;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1
    // Splashes at tundish
    sim.splashes?.forEach(p=>{ctx.globalAlpha=p.life*0.75;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1

    // ── MOLD OSCILLATION DISPLAY ──────────────────────────────────────────
    // Right-side scope showing osc waveform
    const OC_X=CW*0.72,OC_Y=CH*0.30,OC_W=CW*0.12,OC_H=CH*0.10
    ctx.fillStyle='rgba(4,8,18,0.90)';ctx.fillRect(OC_X,OC_Y,OC_W,OC_H)
    ctx.strokeStyle='#1a2d45';ctx.lineWidth=0.8;ctx.strokeRect(OC_X,OC_Y,OC_W,OC_H)
    lbB('MOLD OSCILLATION',OC_X+OC_W/2,OC_Y-5,'#FF8F00',cl(CW*0.009,7,9))
    lb(`${plan.moldOscFreq} opm  ${plan.moldOscStroke}mm`,OC_X+OC_W/2,OC_Y+OC_H+10,'#6e8098',cl(CW*0.008,6,8))
    // Draw sine wave of oscillation
    ctx.strokeStyle=sim.castStarted?'rgba(255,143,0,0.80)':'rgba(41,69,100,0.50)';ctx.lineWidth=1.5
    ctx.beginPath()
    for(let px=0;px<OC_W;px++){
      const phase=(px/OC_W)*Math.PI*4+(sim.castStarted?t*3:0)
      const wy=OC_Y+OC_H/2-Math.sin(phase)*(OC_H*0.38)
      px===0?ctx.moveTo(OC_X+px,wy):ctx.lineTo(OC_X+px,wy)
    }
    ctx.stroke()
    // Current position marker
    if(sim.castStarted){
      const curPhase=((t*3)%(Math.PI*4))/(Math.PI*4)*OC_W
      const curWy=OC_Y+OC_H/2+sim.moldOscY/5*OC_H*0.38
      ctx.fillStyle='#FF8F00';ctx.beginPath();ctx.arc(OC_X+curPhase%OC_W,curWy,4,0,Math.PI*2);ctx.fill()
    }

    // ── SPRAY ZONE LEGEND ─────────────────────────────────────────────────
    const LG_X=CW*0.72,LG_Y=CH*0.44,LG_W=CW*0.12
    ctx.fillStyle='rgba(4,8,18,0.90)';ctx.fillRect(LG_X,LG_Y,LG_W,CH*0.18)
    ctx.strokeStyle='#1a2d45';ctx.lineWidth=0.8;ctx.strokeRect(LG_X,LG_Y,LG_W,CH*0.18)
    lbB('SPRAY COOLING',LG_X+LG_W/2,LG_Y-5,'#29B6F6',cl(CW*0.009,7,9))
    ;[['Z1 Mold',plan.W1,'rgba(41,182,246,0.85)',sim.sprayActive[0]],
      ['Z2 Foot',plan.W2,'rgba(100,200,255,0.85)',sim.sprayActive[1]],
      ['Z3 Bow',plan.W3,'rgba(150,215,255,0.85)',sim.sprayActive[2]]
    ].forEach(([lbl,flow,col,on],i)=>{
      const ry=LG_Y+18+i*CH*0.048
      const barW=(LG_W-16)*cl(flow/plan.W1,0,1)
      ctx.fillStyle='#0a1520';ctx.fillRect(LG_X+8,ry+2,LG_W-16,8)
      ctx.fillStyle=on?col:'rgba(50,70,90,0.5)';ctx.fillRect(LG_X+8,ry+2,barW,8)
      lb(lbl,LG_X+8,ry-1,'#6e8098',cl(CW*0.008,6,8),'left')
      lb(`${flow}l/m`,LG_X+LG_W-8,ry-1,on?col:'#37474F',cl(CW*0.008,6,8),'right')
    })

    // ── MAIN DATA PANEL ───────────────────────────────────────────────────
    const DP_X=CW*0.72,DP_Y=CH*0.04,DP_W=CW*0.26,DP_H=CH*0.24
    ctx.fillStyle='rgba(4,8,18,0.92)';ctx.fillRect(DP_X,DP_Y,DP_W,DP_H)
    ctx.strokeStyle=sim.castStarted?'#57ab5a':'#1e3040';ctx.lineWidth=0.8;ctx.strokeRect(DP_X,DP_Y,DP_W,DP_H)
    lbB('CASTER STATUS',DP_X+DP_W/2,DP_Y+12,'#39c5cf',cl(CW*0.011,9,13))
    ;[
      ['Cast Speed',`${sim.castSpeed.toFixed(2)} m/min`,'#57ab5a'],
      ['Tundish T',`${Math.round(sim.tundishTemp)}°C`,'#FF8F00'],
      ['Superheat',`${Math.round(sim.tundishTemp-(plan.g?.liqT||1542))}°C`,parseFloat(plan.SH)>10&&parseFloat(plan.SH)<55?'#57ab5a':'#e5534b'],
      ['Mold Osc',sim.castStarted?`${plan.moldOscFreq}opm`:'STOPPED','#FF8F00'],
      ['Billets Cut',`${sim.billetsCount} × ${plan.strands}`,'#FFD54F'],
      ['Ladle Level',`${Math.round(sim.ladleLevel*100)}%`,sim.ladleLevel>0.15?'#29B6F6':'#e5534b'],
    ].forEach((r,ri)=>{
      const ry=DP_Y+24+ri*CH*0.032
      ctx.fillStyle='rgba(110,128,152,0.80)';ctx.font=`${cl(CW*0.010,8,11)}px monospace`;ctx.textAlign='left';ctx.fillText(r[0],DP_X+10,ry)
      ctx.fillStyle=r[2];ctx.font=`bold ${cl(CW*0.010,8,11)}px monospace`;ctx.textAlign='right';ctx.fillText(r[1],DP_X+DP_W-10,ry)
    })
    lbB(sim.status,DP_X+DP_W/2,DP_Y+DP_H-8,'#39c5cf',cl(CW*0.009,7,10))

    // Alarm banner
    if(sim.alarms?.length>0){
      const aY=DP_Y+DP_H+5
      ctx.fillStyle='rgba(229,83,73,0.14)';ctx.fillRect(DP_X,aY,DP_W,CH*0.038)
      ctx.strokeStyle='#e5534b';ctx.lineWidth=0.7;ctx.strokeRect(DP_X,aY,DP_W,CH*0.038)
      lbB(`⚠ ${sim.alarms[0]}`,DP_X+DP_W/2,aY+13,'#e5534b',cl(CW*0.009,7,10))
    }

    // ── TIMELINE ───────────────────────────────────────────────────────────
    if(sim._schedule){
      const TLY=CH*0.64,TLH=CH*0.20
      ctx.fillStyle='rgba(4,8,18,0.92)';ctx.fillRect(0,TLY,CW,TLH)
      ctx.strokeStyle='#1a2d45';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,TLY);ctx.lineTo(CW,TLY);ctx.stroke()
      const steps=sim._schedule.timeline||[]
      if(steps.length>0){
        const stepW=CW/steps.length,dotY=TLY+TLH*0.28,namY=TLY+TLH*0.56,timY=TLY+TLH*0.78
        const namSz=cl(CW*0.012,10,14),timSz=cl(CW*0.010,8,11)
        const tCol={prep:'#29B6F6',dummy:'#FFD54F',open:'#FF8F00',fill:'#39c5cf',cast:'#57ab5a',steady:'#57ab5a',cut:'#FF7043',tail:'#6e8098'}
        steps.forEach((s,i)=>{
          const sx2=stepW*i+stepW/2
          const done=i<(sim._stepIdx||0),active=i===(sim._stepIdx||0)
          const col=tCol[s.type]||'#6e8098'
          const dotCol=done?'#57ab5a':active?col:'#263340',dotR=active?11:done?8:6
          if(i>0){ctx.strokeStyle=done?'rgba(87,171,90,0.45)':'rgba(30,50,70,0.7)';ctx.lineWidth=done?2:1.5;ctx.beginPath();ctx.moveTo(stepW*(i-1)+stepW/2,dotY);ctx.lineTo(sx2,dotY);ctx.stroke()}
          ctx.fillStyle=dotCol;ctx.beginPath();ctx.arc(sx2,dotY,dotR,0,Math.PI*2);ctx.fill()
          if(active){ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(sx2,dotY,dotR+3,0,Math.PI*2);ctx.stroke();const pulse=0.5+0.5*Math.sin(t*6);ctx.strokeStyle=`rgba(255,143,0,${pulse*0.4})`;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(sx2,dotY,dotR+7,0,Math.PI*2);ctx.stroke()}
          if(done){ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font=`bold ${cl(CW*0.009,7,10)}px monospace`;ctx.textAlign='center';ctx.fillText('✓',sx2,dotY+3.5)}
          const raw=(s.label||'').trim();const words=raw.split(' ');const half=Math.ceil(words.length/2);const l1=words.slice(0,half).join(' ');const l2=words.slice(half).join(' ')
          const txtCol=active?col:done?'#57ab5a':'#78909C'
          ctx.fillStyle=txtCol;ctx.font=`${active?'bold ':''}${namSz}px monospace`;ctx.textAlign='center'
          ctx.fillText(l1,sx2,namY-(l2?namSz*0.5:0));if(l2)ctx.fillText(l2,sx2,namY+namSz*0.55)
          ctx.fillStyle=active?`rgba(255,143,0,0.65)`:done?'rgba(87,171,90,0.55)':'#37474F';ctx.font=`${timSz}px monospace`
          ctx.fillText(`${s.tMin}m`,sx2,timY)
        })
        const pct=Math.min(1,(sim._stepIdx||0)/steps.length)
        const pbY=TLY+TLH*0.91,pbH=7
        ctx.fillStyle='#0d1828';ctx.fillRect(12,pbY,CW-24,pbH)
        const pbG=ctx.createLinearGradient(12,0,CW-24,0);pbG.addColorStop(0,'#29B6F6');pbG.addColorStop(0.5,'#57ab5a');pbG.addColorStop(1,'#FF8F00')
        ctx.fillStyle=pbG;ctx.fillRect(12,pbY,(CW-24)*pct,pbH)
        ctx.strokeStyle='#1a3050';ctx.lineWidth=0.5;ctx.strokeRect(12,pbY,CW-24,pbH)
        lbB(`${Math.round(pct*100)}% complete  ·  step ${sim._stepIdx||0}/${steps.length}  ·  ${sim.billetsCount} billets (${sim.billetsCount*plan.strands} total)  ·  ${sim.status}`,CW/2,pbY+pbH+12,'#37474F',cl(CW*0.009,7,10))
      }
    }

    // Top strip
    ctx.fillStyle='rgba(4,8,18,0.80)';ctx.fillRect(0,0,CW,CH*0.021)
    lbB(`6-STRAND BILLET CASTER — AI CONTROLLED  |  ${plan.section}×${plan.section}mm  |  ${plan.castSpeed}m/min`,CW/2,CH*0.015,'#39c5cf',cl(CW*0.010,8,12))
    // Footer
    ctx.fillStyle='rgba(4,8,18,0.92)';ctx.fillRect(0,CH-15,CW,15)
    ctx.fillStyle='#2c4055';ctx.font=`${cl(CW*0.009,7,9)}px monospace`;ctx.textAlign='left'
    ctx.fillText(`BILLET CASTER  |  Speed:${sim.castSpeed.toFixed(2)}m/min  SH:${Math.round(sim.tundishTemp-(plan.g?.liqT||1542))}°C  Billets:${sim.billetsCount}×${plan.strands}  |  ${new Date().toLocaleTimeString()}`,8,CH-4)

    }catch(e){console.error('CasterCanvas:',e)}
    rafRef.current=requestAnimationFrame(draw)
  },[W,H,running])

  useEffect(()=>{rafRef.current=requestAnimationFrame(draw);return()=>cancelAnimationFrame(rafRef.current)},[draw])
  return <canvas ref={canvasRef} onClick={handleClick} style={{width:'100%',height:'100%',display:'block',cursor:'pointer'}}/>
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function BilletCasterAI(){
  const [grade,    setGrade]    = useState('IS 2062 E250')
  const [lfTemp,   setLfTemp]   = useState(1598)
  const [lfC,      setLfC]      = useState(0.18)
  const [lfMn,     setLfMn]     = useState(1.25)
  const [lfSi,     setLfSi]     = useState(0.30)
  const [lfS,      setLfS]      = useState(0.010)
  const [lfAl,     setLfAl]     = useState(0.030)
  const [lfP,      setLfP]      = useState(0.015)
  const [strands]               = useState(6)  // fixed 6 strands
  const [ladleWt,  setLadleWt]  = useState(130)
  const [tundishWt,setTundishWt]= useState(15)
  const [cutLength,setCutLength]= useState(12)

  const [tab,      setTab]      = useState('input')
  const [plan,     setPlan]     = useState(null)
  const [simState, setSimState] = useState(null)
  const [simRun,   setSimRun]   = useState(false)
  const [soundOn,  setSoundOn]  = useState(true)
  const [elapsed,  setElapsed]  = useState(0)
  const [stepIdx,  setStepIdx]  = useState(0)
  const [CW,setCW]=useState(900)
  const [CH,setCH]=useState(600)

  const simRef    = useRef(null)
  const planRef   = useRef(null)
  const schedRef  = useRef(null)
  const stepRef   = useRef(0)
  const rafPhys   = useRef(null)
  const containerRef = useRef(null)

  useEffect(()=>{
    if(!containerRef.current)return
    const ro=new ResizeObserver(entries=>{const e=entries[0];if(e){setCW(Math.round(e.contentRect.width));setCH(Math.round(e.contentRect.height))}})
    ro.observe(containerRef.current)
    const r=containerRef.current.getBoundingClientRect();if(r.width>0){setCW(Math.round(r.width));setCH(Math.round(r.height))}
    return()=>ro.disconnect()
  },[])

  const computePlan=()=>{
    SOUND.stopAll()
    const lf={T:lfTemp,C:lfC,Mn:lfMn,Si:lfSi,S:lfS,Al:lfAl,P:lfP}
    const p=computeCasterPlan(lf,grade,{strands:6,ladleWt,tundishWt,cutLength})
    planRef.current=p; setPlan(p)
    const s=initSim(p,lf); simRef.current=s; setSimState({...s})
    schedRef.current=p; stepRef.current=0; setStepIdx(0); setElapsed(0)
    setTab('plan')
  }

  const doTick=useCallback(()=>{
    const sim=simRef.current;if(!sim)return
    const pl=planRef.current;if(!pl)return
    sim.t+=0.016; sim.frame++
    const minNow=sim.t/60
    const liqT=pl.g?.liqT||1542
    const NSTR=6

    // Timeline
    while(stepRef.current<pl.timeline.length){
      const step=pl.timeline[stepRef.current]
      if(minNow<step.tMin)break
      sim.status=step.label
      if(step.type==='prep')  { sim.status='TUNDISH PREHEATING — 1100°C' }
      if(step.type==='dummy') { sim.status='INSERTING DUMMY BARS'; SOUND.playBurst('dummy_bar') }
      if(step.type==='open')  { sim.ladleOpen=true; sim.status='LADLE OPEN — TUNDISH FILLING'; SOUND.playBurst('ladle_open'); SOUND.startNoise('flow',250,0.14) }
      if(step.type==='fill')  { sim.steelFlowing=true; sim.status='TUNDISH FILLING' }
      if(step.type==='cast')  { sim.castStarted=true; sim.sprayActive=[true,true,true]; sim.status='CASTING STARTED — ALL 6 STRANDS'; SOUND.startNoise('cast_rumble',120,0.08); SOUND.startMoldOsc(); SOUND.startSpray('z1',1.0); SOUND.startSpray('z2',0.7); SOUND.startSpray('z3',0.4) }
      if(step.type==='steady'){ sim.status='STEADY STATE — 6 STRANDS CASTING' }
      if(step.type==='cut')   { sim.status='BILLET TORCH CUTTING'; SOUND.playBurst('torch') }
      if(step.type==='tail')  { sim.ladleOpen=false; sim.steelFlowing=false; sim.status='TAIL END — LADLE CLOSING'; SOUND.stopNoise('flow') }
      stepRef.current++; setStepIdx(stepRef.current)
    }

    // Mold oscillation (sinusoidal, ~70 opm)
    const oscFreqRad=2*Math.PI*(pl.moldOscFreq/60)
    sim.moldOscY=sim.castStarted?(pl.moldOscStroke/2)*Math.sin(oscFreqRad*sim.t):0
    sim.moldOscPhase+=oscFreqRad*0.016

    // Ladle drain
    if(sim.ladleOpen&&sim.ladleLevel>0.01){
      sim.ladleLevel=Math.max(0,sim.ladleLevel-0.00007)
      if(sim.ladleLevel<0.01){sim.ladleOpen=false;SOUND.stopNoise('flow')}
    }
    // Tundish
    if(sim.ladleOpen) sim.tundishLevel=Math.min(1,sim.tundishLevel+0.00022)
    else if(sim.steelFlowing) sim.tundishLevel=Math.max(0.15,sim.tundishLevel-0.00008)
    sim.tundishTemp=Math.max(liqT+4,sim.tundishTemp-(sim.ladleOpen?0.010:0.018))

    // Cast speed ramp
    if(sim.castStarted){
      const tgt=parseFloat(pl.castSpeed)
      if(sim.castSpeed<tgt)sim.castSpeed=Math.min(tgt,sim.castSpeed+0.006)
    }

    // Per-strand physics
    for(let si=0;si<NSTR;si++){
      // Skip closed strands
      if(sim.strandClosed[si]){
        sim.moldLevel[si]=Math.max(0,sim.moldLevel[si]-0.002)
        sim.castSpeed_strand=sim.castSpeed  // overall speed unchanged
        continue
      }
      // Mold fill
      if(sim.steelFlowing&&sim.tundishLevel>0.10){
        sim.moldLevel[si]=Math.min(1,sim.moldLevel[si]+0.0014)
        sim.moldEntryT=sim.tundishTemp-2
      } else if(sim.castStarted){
        sim.moldLevel[si]=Math.max(0.45,sim.moldLevel[si]-0.0003)
      }
      // Shell growth k×√(time)
      const v=Math.max(0.1,sim.castSpeed)
      sim.shell[si][0]=cl(28*Math.sqrt(0.7/v*60)*pl.section/1000,0,pl.section/2-2)
      sim.shell[si][1]=cl(28*Math.sqrt(3.0/v*60)*pl.section/1000,0,pl.section/2-2)
      sim.shell[si][2]=cl(28*Math.sqrt(8.0/v*60)*pl.section/1000,0,pl.section/2-2)
      sim.poolDepth[si]=cl(pl.L_met/(CH*0.32/CH)*0.08,0,0.95)
      // Billet length
      if(sim.castStarted&&sim.moldLevel[si]>0.4){
        sim.billetLen[si]+=sim.castSpeed/60*0.016
        if(sim.billetLen[si]>=pl.cutLength){
          sim.billetLen[si]=0; sim.billetsCount++
          sim.torchActive[si]=true; sim.torchPos[si]=-(pl.section/1000)
          SOUND.playBurst('torch')
          setTimeout(()=>{if(simRef.current){simRef.current.torchActive[si]=false;simRef.current.torchPos[si]=0}},2200)
        }
      }
      // Torch movement
      if(sim.torchActive[si])sim.torchPos[si]=Math.min(pl.section/1000+5,sim.torchPos[si]+0.8)
    }

    // Torch sparks
    if(sim.castStarted&&sim.frame%2===0){
      const NSTR_=6,TUN_X_=CW*0.06,TUN_W_=CW*0.60
      const strPad_=TUN_X_+TUN_W_*0.08,strSpacing_=(TUN_W_*0.84)/(NSTR_-1)
      const MOL_W_=CW*0.038,STR_Y_=CH*0.22+CH*0.065+CH*0.075+CH*0.02,STR_H_=CH*0.32
      for(let si=0;si<NSTR_;si++){
        if(!sim.torchActive[si])continue
        const sx_=strPad_+si*strSpacing_
        const CUT_Y_=STR_Y_+STR_H_*0.86
        for(let k=0;k<3;k++){
          sim.sparks.push({x:sx_+MOL_W_/2+sim.torchPos[si]+(Math.random()-0.5)*10,y:CUT_Y_+(Math.random()-0.5)*8,vx:(Math.random()-0.5)*9,vy:-Math.random()*5-1,life:1,r:0.8+Math.random()*2.5,col:Math.random()>0.4?'rgba(255,220,80,0.92)':'rgba(255,80,0,0.80)'})
        }
      }
    }

    // Ladle splashes into tundish
    if(sim.ladleOpen&&sim.frame%4===0){
      const LADLE_CX_=CW*0.15,TUN_Y_=CW*0.06+CW*0.16+CW*0.03  // approx
      sim.splashes.push({x:LADLE_CX_+(Math.random()-0.5)*18,y:CH*0.37+(Math.random())*10,vx:(Math.random()-0.5)*4,vy:-Math.random()*3,life:1,r:1.5+Math.random()*3,col:steelColor(sim.tundishTemp,1480,1540)})
    }

    // Alarms
    sim.alarms=[]
    const curSH=sim.tundishTemp-liqT
    if(curSH<8)  sim.alarms.push(`LOW SH ${curSH.toFixed(0)}°C — SLOW DOWN`)
    if(curSH>58) sim.alarms.push(`HIGH SH ${curSH.toFixed(0)}°C — INCREASE SPEED`)
    const maxMold=Math.max(...sim.moldLevel)
    if(maxMold>0.90)sim.alarms.push(`HIGH MOLD LEVEL ${Math.round(maxMold*100)}%`)
    if(sim.ladleLevel<0.06&&sim.ladleOpen)sim.alarms.push('LADLE NEARLY EMPTY — PREPARE TAIL')

    // Completion
    if(stepRef.current>=pl.timeline.length&&sim.billetsCount>0&&!sim.complete){
      sim.complete=true; sim.status=`HEAT COMPLETE — ${sim.billetsCount*6} BILLETS CAST`
      SOUND.playBurst('complete'); SOUND.stopAll()
    }

    // Cleanup
    sim.sparks=(sim.sparks||[]).filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.22,life:p.life-0.055}))
    sim.splashes=(sim.splashes||[]).filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.14,life:p.life-0.038}))
    sim._schedule=schedRef.current; sim._stepIdx=stepRef.current
    setSimState({...sim,moldLevel:[...sim.moldLevel],billetLen:[...sim.billetLen],torchActive:[...sim.torchActive],torchPos:[...sim.torchPos],sprayActive:[...sim.sprayActive],sparks:[...sim.sparks],splashes:[...sim.splashes]})
  },[CW,CH])

  useEffect(()=>{
    if(!simRun){cancelAnimationFrame(rafPhys.current);return}
    let last=0;const loop=ts=>{if(ts-last>33){doTick();last=ts};rafPhys.current=requestAnimationFrame(loop)}
    rafPhys.current=requestAnimationFrame(loop);return()=>cancelAnimationFrame(rafPhys.current)
  },[simRun,doTick])

  const handleStrandClick=(si)=>{
    const sim=simRef.current; if(!sim)return
    const wasClosed=sim.strandClosed[si]
    sim.strandClosed[si]=!wasClosed
    if(wasClosed){
      // Re-opening strand — reset its state
      sim.moldLevel[si]=sim.tundishLevel>0.3?0.5:0
      sim.billetLen[si]=0
      sim.torchActive[si]=false
      sim.torchPos[si]=0
      SOUND.playBurst('dummy_bar')
    } else {
      // Closing strand
      sim.torchActive[si]=false
      SOUND.playBurst('torch')
    }
    // Update state to trigger re-render
    setSimState(prev=>prev?({...prev,strandClosed:[...sim.strandClosed]}):prev)
  }

  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const ld=simState
  const g=GRADES[grade]||GRADES['IS 2062 E250']
  const SH_display=Math.round(lfTemp-8-g.liqT)

  const Col=({c,v,cc})=>(<div style={{background:'#0a1520',border:`1px solid ${cc||'#1a2d45'}44`,borderRadius:5,padding:'8px 12px',textAlign:'center'}}><div style={{fontSize:10,color:'#6e8098',marginBottom:4}}>{c}</div><div style={{fontSize:16,fontWeight:700,color:cc||'#39c5cf',fontFamily:'monospace'}}>{v}</div></div>)
  const Inp=({label,value,onChange,unit,min,max,step=0.001,color='#6e8098'})=>(
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
      <span style={{fontSize:11,color:'#6e8098'}}>{label}</span>
      <div style={{display:'flex',alignItems:'center',gap:3}}>
        <input type="number" value={value} min={min} max={max} step={step} onChange={e=>onChange(+e.target.value)} style={{width:72,padding:'3px 6px',borderRadius:3,border:`1px solid #1a2d45`,background:'#0d1520',color,fontSize:12,fontFamily:'monospace',fontWeight:700,textAlign:'right'}}/>
        <span style={{fontSize:9,color:'#6e8098',width:32}}>{unit}</span>
      </div>
    </div>
  )
  const Sec=({title,col,children})=>(<div style={{background:'#07090f',border:`1px solid ${col}33`,borderRadius:6,padding:10,marginBottom:10}}><div style={{fontSize:10,color:col,fontWeight:700,letterSpacing:'0.08em',marginBottom:8}}>{title}</div>{children}</div>)

  return(
    <div style={{height:'100dvh',background:'#07090f',color:'#cdd9e5',fontFamily:'monospace',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{background:'#060a10',borderBottom:`1px solid #1a2d45`,padding:'0 12px',height:50,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:20}}>🏗</span>
          <div>
            <div style={{fontSize:11,fontWeight:700}}>6-STRAND BILLET CASTER AI MODEL</div>
            <div style={{fontSize:8,color:'#6e8098'}}>LF OUT → TUNDISH → 6×MOLD OSC → SOLIDIFICATION → SPRAY COOLING → TORCH CUT</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {ld&&[
            {l:'SPEED',  v:`${ld.castSpeed.toFixed(2)}m/min`, c:'#57ab5a'},
            {l:'SH',     v:`${Math.round(ld.tundishTemp-(g.liqT||1542))}°C`, c:'#39c5cf'},
            {l:'BILLETS',v:`${ld.billetsCount}×6`,  c:'#FFD54F'},
            {l:'TIME',   v:fmt(elapsed),              c:simRun?'#57ab5a':'#6e8098'},
          ].map(({l,v,c})=>(
            <div key={l} style={{textAlign:'center'}}><div style={{fontSize:7,color:'#6e8098'}}>{l}</div><div style={{fontSize:11,fontWeight:700,color:c}}>{v}</div></div>
          ))}
          {['input','plan','simulation'].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:'4px 10px',borderRadius:4,border:`1px solid ${tab===t?'#FF8F00':'#1a2d45'}`,background:tab===t?'rgba(255,143,0,0.15)':'transparent',color:tab===t?'#FF8F00':'#6e8098',fontSize:9,fontWeight:700,cursor:'pointer',textTransform:'uppercase'}}>
              {t==='input'?'⚙ Input':t==='plan'?'📋 Plan':'🔬 Sim'}
            </button>
          ))}
          <button onClick={computePlan} style={{padding:'5px 14px',borderRadius:4,border:`2px solid #39c5cf`,background:'rgba(57,197,207,0.15)',color:'#39c5cf',fontSize:10,fontWeight:700,cursor:'pointer'}}>⚙ COMPUTE</button>
          {plan&&!simRun&&<button onClick={()=>{if(simRef.current){simRef.current.t=0;setElapsed(0);stepRef.current=0;setStepIdx(0)};setSimRun(true);setTab('simulation')}} style={{padding:'5px 14px',borderRadius:4,border:`1px solid #57ab5a`,background:'rgba(87,171,90,0.15)',color:'#57ab5a',fontSize:10,fontWeight:700,cursor:'pointer'}}>▶ RUN SIM</button>}
          <button onClick={()=>{SOUND.enabled=!SOUND.enabled;if(!SOUND.enabled)SOUND.stopAll();setSoundOn(v=>!v)}} style={{padding:'5px 10px',borderRadius:4,border:`1px solid ${soundOn?'#39c5cf':'#1a2d45'}`,background:soundOn?'rgba(57,197,207,0.15)':'transparent',color:soundOn?'#39c5cf':'#6e8098',fontSize:10,fontWeight:700,cursor:'pointer'}}>{soundOn?'🔊':'🔇'}</button>
          {simRun&&<button onClick={()=>{setSimRun(false);SOUND.stopAll()}} style={{padding:'5px 12px',borderRadius:4,border:`1px solid #e5534b`,background:'rgba(229,83,73,0.15)',color:'#e5534b',fontSize:10,fontWeight:700,cursor:'pointer'}}>⏸ PAUSE</button>}
        </div>
      </div>

      <div style={{flex:1,overflow:'hidden',display:'flex'}}>
        {/* Left panel */}
        <div style={{width:265,background:'#0b1220',borderRight:`1px solid #1a2d45`,overflow:'auto',flexShrink:0,padding:12}}>
          <div style={{fontSize:9,color:'#6e8098',marginBottom:5,letterSpacing:'0.1em'}}>STEEL GRADE</div>
          <select value={grade} onChange={e=>setGrade(e.target.value)} style={{width:'100%',padding:'6px 8px',borderRadius:5,border:`1px solid rgba(255,143,0,0.4)`,background:'#0d1520',color:'#FF8F00',fontSize:12,fontWeight:700,fontFamily:'monospace',marginBottom:10}}>
            {Object.keys(GRADES).map(g=><option key={g}>{g}</option>)}
          </select>
          <Sec title="🌡 LF OUT DATA" col="#FF8F00">
            <Inp label="LF Out Temp" value={lfTemp} onChange={setLfTemp} unit="°C" min={1540} max={1720} step={1} color="#FF8F00"/>
            <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #1a2d45'}}>
              <span style={{fontSize:10,color:'#6e8098'}}>Liquidus temp</span>
              <span style={{fontSize:11,fontWeight:700,color:'#39c5cf'}}>{g.liqT}°C</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0'}}>
              <span style={{fontSize:10,color:'#6e8098'}}>Superheat at tundish</span>
              <span style={{fontSize:12,fontWeight:700,color:SH_display>10&&SH_display<55?'#57ab5a':'#e5534b'}}>{SH_display}°C</span>
            </div>
          </Sec>
          <Sec title="⚗ LF OUT CHEMISTRY" col="#FF7043">
            <Inp label="[C]%"  value={lfC}  onChange={setLfC}  unit="%" min={0.02} max={0.80} step={0.001} color="#29B6F6"/>
            <Inp label="[Mn]%" value={lfMn} onChange={setLfMn} unit="%" min={0.10} max={2.50} step={0.01}  color="#FFD54F"/>
            <Inp label="[Si]%" value={lfSi} onChange={setLfSi} unit="%" min={0.01} max={0.80} step={0.01}  color="#FF8F00"/>
            <Inp label="[S]%"  value={lfS}  onChange={setLfS}  unit="%" min={0.001} max={0.030} step={0.001} color="#e5534b"/>
            <Inp label="[Al]%" value={lfAl} onChange={setLfAl} unit="%" min={0.010} max={0.080} step={0.001} color="#90A4AE"/>
            <Inp label="[P]%"  value={lfP}  onChange={setLfP}  unit="%" min={0.005} max={0.040} step={0.001} color="#9b5de5"/>
          </Sec>
          <Sec title="⚙ CASTER CONFIG" col="#39c5cf">
            <div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',marginBottom:6}}>
              <span style={{fontSize:11,color:'#6e8098'}}>No. of Strands</span>
              <span style={{fontSize:13,fontWeight:700,color:'#39c5cf'}}>6 (fixed)</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',marginBottom:6}}>
              <span style={{fontSize:11,color:'#6e8098'}}>Section</span>
              <span style={{fontSize:13,fontWeight:700,color:'#39c5cf'}}>{g.section}×{g.section}mm</span>
            </div>
            <Inp label="Ladle Weight"   value={ladleWt}   onChange={setLadleWt}   unit="t" min={50} max={400} step={5}   color="#FF8F00"/>
            <Inp label="Tundish Weight" value={tundishWt} onChange={setTundishWt} unit="t" min={5}  max={40}  step={1}   color="#FFD54F"/>
            <Inp label="Cut Length"     value={cutLength} onChange={setCutLength} unit="m" min={3}  max={24}  step={0.5} color="#8BC34A"/>
          </Sec>
          {plan&&(
            <Sec title="📊 PLAN SUMMARY" col="#57ab5a">
              {[['Cast speed',`${plan.castSpeed}m/min`,'#57ab5a'],['Mold osc',`${plan.moldOscFreq}opm`,'#FF8F00'],['Met length',`${plan.L_met}m`,'#39c5cf'],['Billet wt',`${plan.billetWt}kg`,'#FFD54F'],['Prod rate',`${plan.wtRate}kg/hr`,'#57ab5a'],['Heat time',`${plan.heatTimeMin}min`,'#6e8098']].map(([l,v,c])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid #1a2d45'}}>
                  <span style={{fontSize:10,color:'#6e8098'}}>{l}</span>
                  <span style={{fontSize:11,fontWeight:700,color:c}}>{v}</span>
                </div>
              ))}
            </Sec>
          )}
          {simState&&(
            <Sec title="🔬 LIVE" col="#57ab5a">
              {[['Speed',`${simState.castSpeed.toFixed(2)}m/min`,'#57ab5a'],['SH',`${Math.round(simState.tundishTemp-g.liqT)}°C`,'#39c5cf'],['Billets',`${simState.billetsCount}×${(simState.strandClosed||[]).filter(v=>!v).length}`,'#FFD54F'],['Mold osc',simState.castStarted?`${(simState.moldOscY||0).toFixed(1)}mm`:'OFF','#FF8F00']].map(([l,v,c])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid #1a2d45'}}>
                  <span style={{fontSize:10,color:'#6e8098'}}>{l}</span>
                  <span style={{fontSize:11,fontWeight:700,color:c}}>{v}</span>
                </div>
              ))}
              <div style={{marginTop:8}}>
                <div style={{fontSize:9,color:'#6e8098',marginBottom:4}}>STRAND STATUS</div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                  {[0,1,2,3,4,5].map(si=>{
                    const closed=simState.strandClosed&&simState.strandClosed[si]
                    return(
                      <button key={si} onClick={()=>handleStrandClick(si)}
                        style={{flex:'1 0 28%',padding:'4px 2px',borderRadius:4,border:`1px solid ${closed?'#e5534b44':'#57ab5a44'}`,background:closed?'rgba(229,83,73,0.12)':'rgba(87,171,90,0.10)',color:closed?'#e5534b':'#57ab5a',fontSize:10,fontWeight:700,cursor:'pointer'}}>
                        S{si+1} {closed?'✗':'✓'}
                      </button>
                    )
                  })}
                </div>
                <div style={{fontSize:8,color:'rgba(110,128,152,0.5)',marginTop:4}}>Click strand or button to toggle</div>
              </div>
            </Sec>
          )}
        </div>

        {/* Right content */}
        <div ref={containerRef} style={{flex:1,overflow:'hidden',position:'relative',background:'#07090f'}}>
          {/* Plan tab */}
          {tab==='plan'&&plan&&(
            <div style={{padding:16,overflow:'auto',height:'100%'}}>
              <div style={{fontSize:16,fontWeight:700,color:'#39c5cf',marginBottom:16}}>📋 6-Strand Billet Caster Plan — {grade}</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:16}}>
                <Col c="SUPERHEAT"   v={`${plan.SH}°C`}            cc={parseFloat(plan.SH)>10&&parseFloat(plan.SH)<55?'#57ab5a':'#e5534b'}/>
                <Col c="CAST SPEED"  v={`${plan.castSpeed}m/min`}  cc="#FF8F00"/>
                <Col c="MET LENGTH"  v={`${plan.L_met}m`}          cc="#39c5cf"/>
                <Col c="BILLETS/STR" v={`~${plan.billetsPerStrand}`}cc="#FFD54F"/>
                <Col c="TOTAL BILLET"v={`~${plan.billetsPerStrand*6}`}cc="#57ab5a"/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div style={{background:'#0a1218',border:`1px solid rgba(255,143,0,0.2)`,borderRadius:8,padding:12}}>
                  <div style={{fontSize:13,fontWeight:700,color:'#FF8F00',marginBottom:10}}>🔥 SOLIDIFICATION & MOLD</div>
                  {[
                    {l:'Section',          v:`${plan.section}×${plan.section}mm`},
                    {l:'Mold oscillation', v:`${plan.moldOscFreq}opm  ±${plan.moldOscStroke/2}mm`},
                    {l:'Mold entry temp',  v:`${plan.moldEntryTemp}°C`},
                    {l:'Mold exit temp',   v:`${plan.moldExitTemp}°C`},
                    {l:'Shell @ mold exit',v:`${plan.shellMold}mm`},
                    {l:'Met. length',      v:`${plan.L_met}m`},
                    {l:'Z1 spray (mold)',  v:`${plan.W1} l/min`},
                    {l:'Z2 spray (foot)',  v:`${plan.W2} l/min`},
                    {l:'Z3 spray (bow)',   v:`${plan.W3} l/min`},
                    {l:'Mold flux',        v:plan.moldFlux},
                  ].map(({l,v})=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #1a2d45'}}>
                      <span style={{fontSize:11,color:'#6e8098'}}>{l}</span>
                      <span style={{fontSize:11,color:'#cdd9e5',fontWeight:700,fontFamily:'monospace'}}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  <div style={{background:'#0a1218',border:`1px solid rgba(87,171,90,0.2)`,borderRadius:8,padding:12}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#57ab5a',marginBottom:10}}>📊 PRODUCTION (6 STRANDS)</div>
                    {[
                      {l:'Billets per strand',  v:`~${plan.billetsPerStrand}`,          c:'#FFD54F'},
                      {l:'Total billets/heat',  v:`~${plan.billetsPerStrand*6}`,         c:'#FFD54F'},
                      {l:'Billet weight',       v:`${plan.billetWt}kg`,                 c:'#39c5cf'},
                      {l:'Production rate',     v:`${plan.wtRate}kg/hr`,               c:'#57ab5a'},
                      {l:'Heat cast time',      v:`${plan.heatTimeMin}min`,             c:'#FF8F00'},
                      {l:'Predicted [C]',       v:`${plan.predC}%`,                    c:'#29B6F6'},
                      {l:'Predicted [Mn]',      v:`${plan.predMn}%`,                   c:'#FFD54F'},
                      {l:'Predicted [Al]',      v:`${plan.predAl}%`,                   c:'#90A4AE'},
                    ].map(({l,v,c})=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #1a2d45'}}>
                        <span style={{fontSize:11,color:'#6e8098'}}>{l}</span>
                        <span style={{fontSize:12,fontWeight:700,color:c,fontFamily:'monospace'}}>{v}</span>
                      </div>
                    ))}
                  </div>
                  {plan.risks.length>0&&(
                    <div style={{background:'#0a1218',border:`1px solid rgba(229,83,73,0.2)`,borderRadius:8,padding:12}}>
                      <div style={{fontSize:13,fontWeight:700,color:'#e5534b',marginBottom:8}}>⚠ RISKS</div>
                      {plan.risks.map((r,i)=>(
                        <div key={i} style={{display:'flex',gap:8,padding:'4px 0',borderBottom:'1px solid #1a2d45'}}>
                          <span style={{fontSize:11,fontWeight:700,color:r.lvl==='HIGH'?'#e5534b':r.lvl==='MEDIUM'?'#FF8F00':'#FFD54F',minWidth:60}}>{r.lvl}</span>
                          <span style={{fontSize:11,color:'#cdd9e5'}}>{r.msg}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{marginTop:14,display:'flex',justifyContent:'center'}}>
                <button onClick={()=>{if(simRef.current){simRef.current.t=0;setElapsed(0);stepRef.current=0;setStepIdx(0)};setSimRun(true);setTab('simulation')}}
                  style={{padding:'12px 36px',borderRadius:7,border:`2px solid #57ab5a`,background:'rgba(87,171,90,0.15)',color:'#57ab5a',fontSize:15,fontWeight:700,cursor:'pointer'}}>
                  ▶ RUN 6-STRAND SIMULATION
                </button>
              </div>
            </div>
          )}
          {/* Simulation */}
          {tab==='simulation'&&simState&&<CasterCanvas simRef={simRef} planRef={planRef} W={CW} H={CH} running={simRun} onStrandClick={handleStrandClick}/>}
          {/* Input splash */}
          {tab==='input'&&!simState&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:18}}>
              <div style={{fontSize:52}}>🏗</div>
              <div style={{fontSize:15,fontWeight:700,color:'#cdd9e5'}}>6-Strand Billet Caster AI Model</div>
              <div style={{fontSize:11,color:'#6e8098',maxWidth:500,textAlign:'center',lineHeight:1.9}}>
                Enter LF out temperature and chemistry. The model computes:<br/>
                <strong style={{color:'#FF8F00'}}>Cast speed · Mold oscillation · Spray cooling (Z1/Z2/Z3)</strong><br/>
                <strong style={{color:'#39c5cf'}}>Shell thickness · Metallurgical length · Billet weight</strong><br/>
                then simulates all 6 strands with real-time physics.<br/><br/>
                Sounds: <strong style={{color:'#FFD54F'}}>Ladle open · Mold osc clunk · Spray hiss · Torch cut · Complete</strong>
              </div>
              <button onClick={computePlan} style={{padding:'12px 32px',borderRadius:8,border:`2px solid #39c5cf`,background:'rgba(57,197,207,0.15)',color:'#39c5cf',fontSize:13,fontWeight:700,cursor:'pointer'}}>⚙ COMPUTE CASTER PLAN</button>
            </div>
          )}
          {tab==='input'&&simState&&<CasterCanvas simRef={simRef} planRef={planRef} W={CW} H={CH} running={simRun} onStrandClick={handleStrandClick}/>}
          {tab==='plan'&&!plan&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'#6e8098',fontSize:12}}>
              Click <strong style={{color:'#39c5cf',margin:'0 6px'}}>⚙ COMPUTE</strong> to generate the casting plan.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
