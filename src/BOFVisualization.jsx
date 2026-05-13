import { useState, useEffect, useRef, useCallback } from 'react'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function heatColor(temp, min = 1380, max = 1720) {
  const t = clamp((temp - min) / (max - min), 0, 1)
  if (t > 0.85) return `rgba(255,255,${Math.round((1-t)*6*255)},0.97)`
  if (t > 0.70) return `rgba(255,${Math.round(100+t*155)},0,0.95)`
  if (t > 0.50) return `rgba(255,${Math.round(50+t*80)},0,0.92)`
  if (t > 0.25) return `rgba(${Math.round(200+t*55)},${Math.round(25+t*30)},0,0.88)`
  return `rgba(${Math.round(130+t*70)},${Math.round(15+t*15)},0,0.80)`
}

// ─── PROCESS STAGES ──────────────────────────────────────────────────────────
const STAGES = ['SCRAP_CHARGE','FLUX_CHARGE','HM_CHARGE','BLOWING','SUBLANCE','FERRO_ALLOY','SLAG_OUT','TAPPING','COMPLETE']

function BOFCanvas({
  stage, blowPct, running,
  hmWeight, hmTemp, hmC, hmSi, hmMn, hmP,
  scrapWeight, fluxWeight, faWeight,
  targetTemp, targetC, lanceHeight, o2Flow, heatNo,
  ladleWeightKg, setLadleWeightKg,
  setCurrentTemp, setCurrentC,
  onStageComplete, doReset,
}) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const mouseRef  = useRef({ x:-999, y:-999 })
  const S = useRef({
    t:0, frame:0,
    // Vessel internals
    bathTemp: 1265, bathC: 4.5, bathSi: 0.55, bathMn: 0.35,
    bathLevel: 0.05,   // fills as charged
    slagThick: 0, slagFoam: 0,
    vesselVib: 0,
    // Crane
    craneX: 0, craneY: 0,   // crane hook position
    craneLoad: 'none',       // 'scrap_bucket','hm_ladle','scrap_basket','empty'
    craneMoving: false, craneTx: 0, craneTy: 0,
    ladleLevel: 1.0,         // ladle fill 0–1
    ladlePoured: false,
    hmLadleWeight: 0,
    // Scrap bucket
    scrapBucketX: 0, scrapBucketY: 0,
    scrapBucketTilted: false,
    scrapBucketEmpty: false,
    // Flux hoppers
    fluxFalling: false, fluxParticles: [],
    // Lance
    lanceY: 0,
    // Gas particles
    coGas:[], co2Gas:[], sparks:[], slagSplash:[], steamPuffs:[],
    o2Jets:[], offGasParticles:[], reactionZones:[],
    // Ferro alloy addition
    faFalling: false, faParticles: [],
    // Slag pot
    slagPotX:0, slagPotFill:0, slagRunning:false,
    // Steel ladle
    steelLadleX:0, steelLadleY:0, steelLadleFill:0, tapRunning:false,
    tapTemp: 0,
    // Scrap pieces inside vessel
    scrapPieces: [],
    // Load cell reading
    loadCell: 0,
    // Stage animation timer
    stageTimer: 0,
    // Sub-lance
    subLanceY: 0, subLanceDone: false, measuredT: null, measuredC: null,
    // Roll angle for crane drum
    drumAngle: 0,
  })

  useEffect(() => {
    const el = canvasRef.current; if (!el) return
    const fit = () => {
      const w = el.parentElement ? el.parentElement.clientWidth : window.innerWidth
      const h = el.parentElement ? el.parentElement.clientHeight : window.innerHeight
      if (w > 0 && h > 0) { el.width = w; el.height = h }
    }
    fit(); const t1=setTimeout(fit,100),t2=setTimeout(fit,400)
    window.addEventListener('resize', fit)
    const onMove=(e)=>{const rect=el.getBoundingClientRect();mouseRef.current={x:(e.clientX-rect.left)*(el.width/rect.width),y:(e.clientY-rect.top)*(el.height/rect.height)}}
    const onLeave=()=>{mouseRef.current={x:-999,y:-999}}
    el.addEventListener('mousemove',onMove); el.addEventListener('mouseleave',onLeave)
    el.addEventListener('touchmove',(e)=>{e.preventDefault();const tb=e.touches[0],rect=el.getBoundingClientRect();mouseRef.current={x:(tb.clientX-rect.left)*(el.width/rect.width),y:(tb.clientY-rect.top)*(el.height/rect.height)}},{passive:false})
    el.addEventListener('touchend',onLeave)
    return ()=>{clearTimeout(t1);clearTimeout(t2);window.removeEventListener('resize',fit);el.removeEventListener('mousemove',onMove);el.removeEventListener('mouseleave',onLeave)}
  },[])

  useEffect(()=>{
    if(!doReset) return
    const sim=S.current
    Object.assign(sim,{
      t:0,frame:0,bathTemp:1265,bathC:hmC,bathSi:hmSi,bathMn:hmMn,
      bathLevel:0.05,slagThick:0,slagFoam:0,vesselVib:0,
      craneX:0.12,craneY:0.06,craneLoad:'none',craneMoving:false,
      ladleLevel:1.0,ladlePoured:false,hmLadleWeight:hmWeight*1000,
      scrapBucketX:0.85,scrapBucketY:0.10,scrapBucketTilted:false,scrapBucketEmpty:false,
      fluxFalling:false,fluxParticles:[],
      lanceY:0,coGas:[],co2Gas:[],sparks:[],slagSplash:[],steamPuffs:[],
      o2Jets:[],offGasParticles:[],reactionZones:[],
      faFalling:false,faParticles:[],
      slagPotX:0.78,slagPotFill:0,slagRunning:false,
      steelLadleX:0.22,steelLadleY:0.78,steelLadleFill:0,tapRunning:false,tapTemp:0,
      scrapPieces:[],loadCell:hmWeight*1000,stageTimer:0,
      subLanceY:0,subLanceDone:false,measuredT:null,measuredC:null,drumAngle:0,
    })
  },[doReset])

  const draw = useCallback(()=>{
    const canvas=canvasRef.current
    if(!canvas){rafRef.current=requestAnimationFrame(draw);return}
    const ctx=canvas.getContext('2d')
    const W=canvas.width,H=canvas.height
    if(!W||!H||W<10||H<10){
      if(canvas.parentElement?.clientWidth>0){canvas.width=canvas.parentElement.clientWidth;canvas.height=canvas.parentElement.clientHeight}
      rafRef.current=requestAnimationFrame(draw);return
    }
    const sim=S.current
    sim.t+=0.016; sim.frame++

    try{
    // ── LAYOUT ────────────────────────────────────────────────────────────
    // ── ALL LAYOUT CONSTANTS (correct order, no hoisting issues) ──────────
    const VCX = W*0.54      // vessel centre
    const VW  = W*0.08      // vessel half-width at belly
    const VT  = H*0.35      // vessel top
    const VB  = H*0.92      // vessel bottom  ← MUST be before VPIVOT_Y
    const VH  = VB - VT
    const VCXT = VCX        // alias (rotation handles tilt)
    // Vessel pivot = bottom centre
    const VPIVOT_X = VCX
    const VPIVOT_Y = VB
    // No tilt — vessel always upright
    const tiltDeg = 0
    const tiltRad = 0

    // BOF profile: mouth narrows, belly wide, bottom dome
    const vHW=(yf)=>{
      if(yf<0.08) return VW*0.52+(yf/0.08)*VW*0.18        // mouth → shoulder
      if(yf<0.22) return VW*0.70+(yf-0.08)/0.14*VW*0.30   // shoulder → belly
      if(yf<0.65) return VW                                 // belly
      if(yf<0.82) return VW-(yf-0.65)/0.17*VW*0.22         // belly → bosh
      return VW*0.78                                         // bottom
    }

    const BATH_Y    = VT+VH*(1-sim.bathLevel*0.56)
    // Use VCXT for vessel-interior elements
    const VCXI = VCXT   // alias for clarity
    const SLAG_Y    = BATH_Y - sim.slagThick*(1+sim.slagFoam*2.5)
    const LANCE_TIP = VT+VH*0.22 - (lanceHeight-1400)/700*VH*0.14
    // Taphole & slaghole screen positions (accounting for vessel rotation)
    const localTapX=VCX+vHW(0.80)-4, localTapY=VT+VH*0.80
    const dtx=localTapX-VPIVOT_X, dty=localTapY-VPIVOT_Y
    const TAPHOLE_X=VPIVOT_X+dtx*Math.cos(tiltRad)-dty*Math.sin(tiltRad)
    const TAPHOLE_Y=VPIVOT_Y+dtx*Math.sin(tiltRad)+dty*Math.cos(tiltRad)
    const localSlgX=VCX-vHW(0.62)+4, localSlgY=VT+VH*0.62
    const dsx=localSlgX-VPIVOT_X, dsy=localSlgY-VPIVOT_Y
    const SLAGHOLE_X=VPIVOT_X+dsx*Math.cos(tiltRad)-dsy*Math.sin(tiltRad)
    const SLAGHOLE_Y=VPIVOT_Y+dsx*Math.sin(tiltRad)+dsy*Math.cos(tiltRad)
    // Crane rail Y
    const CRANE_RAIL_Y = H*0.03   // rail at very top

    // ── PHYSICS ──────────────────────────────────────────────────────────
    sim.stageTimer += 0.016
    const bp  = blowPct/100
    const inten = clamp((o2Flow/650)*1.1, 0.3, 1.2)

    if(stage==='HM_CHARGE'){
      // Crane moves from left to over vessel, ladle tilts, HM pours, then crane moves back left
      if(!sim.ladlePoured){
        sim.craneLoad = 'hm_ladle'
        // Move crane to vessel mouth (from left)
        const tgX=(VCXT)/W, tgY=(VT-H*0.18)/H  // hook hangs above vessel mouth (tilted)
        sim.craneX+=(tgX-sim.craneX)*0.018; sim.craneY+=(tgY-sim.craneY)*0.018
        sim.drumAngle+=0.05
        if(Math.abs(sim.craneX-tgX)<0.02){
          // Pour
          sim.ladleLevel=Math.max(0, sim.ladleLevel-0.004)
          sim.hmLadleWeight=Math.round(sim.ladleLevel*hmWeight*1000)
          setLadleWeightKg(sim.hmLadleWeight)
          sim.bathLevel=clamp(sim.bathLevel+(1-sim.ladleLevel)*0.003, 0.05, 0.72)
          sim.bathTemp=clamp(sim.bathTemp+(hmTemp-sim.bathTemp)*0.01, 1200, 1400)
          // Pour stream particles
          if(sim.frame%3===0) sim.steamPuffs.push({x:VCX+(Math.random()-0.5)*12,y:BATH_Y-10,vx:(Math.random()-0.5)*1.5,vy:-1.5-Math.random()*2,life:1,r:5+Math.random()*8})
          if(sim.ladleLevel<=0) {
            sim.ladlePoured=true
            // Crane moves back far left after pouring
            sim.craneX=0.08; sim.craneY=0.06
          }
          // Continue to next stage only when crane is back at park
          if(sim.ladlePoured && Math.abs(sim.craneX-0.12)<0.02) onStageComplete()
        }
      }
    }

    if(stage==='SCRAP_CHARGE'){
      // Scrap bucket tilts over vessel mouth
      sim.craneLoad='scrap_bucket'
      const tgX=VCXT/W, tgY=(VT-H*0.18)/H
      sim.craneX+=(tgX-sim.craneX)*0.018
      sim.craneY+=(tgY-sim.craneY)*0.018
      sim.drumAngle+=0.04
      if(Math.abs(sim.craneX-tgX)<0.02&&!sim.scrapBucketEmpty){
        sim.scrapBucketTilted=true
        // Drop scrap pieces
        if(sim.frame%8===0){
          sim.scrapPieces.push({
            x:VCX+(Math.random()-0.5)*vHW(0.5)*0.6,
            y:BATH_Y+Math.random()*(VB-BATH_Y)*0.7,
            w:clamp(W*0.025,12,24), h:clamp(H*0.014,6,12),
            temp:25, meltFrac:0, angle:(Math.random()-0.5)*0.8
          })
        }
        if(sim.stageTimer>6){sim.scrapBucketEmpty=true; onStageComplete()}
      }
    }

    if(stage==='FLUX_CHARGE'){
      sim.fluxFalling=true
      const LIME_X=VCX-W*0.30, DOLO_X=VCX-W*0.22
      // Lime particles (white-grey)
      if(sim.frame%3===0){
        sim.fluxParticles.push({x:LIME_X+(Math.random()-0.5)*W*0.02, y:H*0.18, vy:4+Math.random()*5, life:1, r:2+Math.random()*3, col:'rgba(200,205,190,0.82)'})
      }
      // Dolomite particles (beige)
      if(sim.frame%3===1){
        sim.fluxParticles.push({x:DOLO_X+(Math.random()-0.5)*W*0.02, y:H*0.18, vy:4+Math.random()*5, life:1, r:2+Math.random()*3, col:'rgba(195,165,105,0.80)'})
      }
      // Also general particles into vessel
      if(sim.frame%4===0){
        sim.fluxParticles.push({x:VCX+(Math.random()-0.5)*vHW(0.1)*0.5, y:VT+15, vy:3+Math.random()*3, life:1, r:1.5+Math.random()*2.5, col:'rgba(185,195,155,0.72)'})
      }
      if(sim.stageTimer>5){sim.fluxFalling=false; onStageComplete()}
    }

    if(stage==='BLOWING'&&running){
      // Lance descends to set height
      const lanceTgt=LANCE_TIP
      sim.lanceY+=(lanceTgt-sim.lanceY)*0.03
      sim.vesselVib=Math.sin(sim.t*14)*inten*1.8

      // Temperatures
      const tgtT=hmTemp-80+bp*(targetTemp-hmTemp+130)+(Math.random()-0.5)*5
      sim.bathTemp=clamp(sim.bathTemp+(tgtT-sim.bathTemp)*0.022, 1380,1750)
      setCurrentTemp(Math.round(sim.bathTemp))
      const tgtC=hmC*Math.exp(-0.038*blowPct)+0.018
      sim.bathC=clamp(sim.bathC+(tgtC-sim.bathC)*0.03, 0.015, hmC)
      setCurrentC(sim.bathC.toFixed(3))
      sim.bathSi=Math.max(0.002,hmSi*Math.exp(-0.055*blowPct))
      sim.bathMn=Math.max(0.05,hmMn*Math.exp(-0.028*blowPct))
      sim.slagThick=clamp(6+bp*55+inten*18, 6,110)
      sim.slagFoam=clamp(inten*0.4+(bp>0.3&&bp<0.7?0.45:0.1), 0,1)

      // Particles
      if(sim.frame%2===0){
        ;[-0.32,-0.10,0.10,0.32].forEach(a=>{
          sim.o2Jets.push({x:VCX+Math.sin(a)*8,y:sim.lanceY,vx:Math.sin(a)*(2.5+inten*3),vy:3.5+inten*4,life:1,r:1.5+Math.random()*2})
        })
      }
      if(sim.frame%3===0){
        sim.coGas.push({x:VCX+(Math.random()-0.5)*vHW(0.5)*0.8,y:BATH_Y-5,vx:(Math.random()-0.5)*1.6,vy:-(1.5+Math.random()*3)*inten,life:1,r:2+Math.random()*4,col:`rgba(${175+Math.round(Math.random()*40)},${148+Math.round(Math.random()*30)},48,0.52)`})
      }
      if(sim.frame%5===0) sim.co2Gas.push({x:VCX+(Math.random()-0.5)*vHW(0.2)*0.5,y:SLAG_Y-25-Math.random()*25,vx:(Math.random()-0.5)*1.1,vy:-(0.8+Math.random()*1.4),life:1,r:3+Math.random()*4,col:'rgba(115,148,62,0.46)'})
      if(sim.slagFoam>0.25&&sim.frame%4===0){
        ;[-1,1].forEach(side=>{sim.slagSplash.push({x:VCX+side*(vHW(0.45)*0.55+Math.random()*vHW(0.45)*0.3),y:SLAG_Y+5,vx:side*(1.5+Math.random()*3)*inten,vy:-(2+Math.random()*4)*inten,life:1,r:1.5+Math.random()*3,col:heatColor(sim.bathTemp-60,1350,1700)})})
      }
      if(inten>0.65&&sim.frame%5===0) sim.sparks.push({x:VCX+(Math.random()-0.5)*vHW(0.05)*0.4,y:VT+VH*0.04,vx:(Math.random()-0.5)*5,vy:-3-Math.random()*5,life:1,r:1+Math.random()*2,col:Math.random()>0.5?'#FFD54F':'#FF6D00'})
      if(bp<0.12&&sim.frame%5===0) sim.steamPuffs.push({x:VCX+(Math.random()-0.5)*vHW(0.5)*0.45,y:SLAG_Y-8,vx:(Math.random()-0.5)*1.4,vy:-1.4-Math.random(),life:1,r:4+Math.random()*6})
      if(sim.frame%3===0) sim.offGasParticles.push({x:VCX+(Math.random()-0.5)*vHW(0.02)*0.35,y:VT-10,vx:(Math.random()-0.5)*1.8,vy:-1.8-Math.random()*2.2,life:1,r:3+Math.random()*4,col:`rgba(${128+Math.round(Math.random()*38)},${115+Math.round(Math.random()*28)},62,0.42)`})
      if(sim.frame%8===0) sim.reactionZones.push({x:VCX+(Math.random()-0.5)*vHW(0.5)*0.65,y:BATH_Y-5-Math.random()*VH*0.14,r:8+Math.random()*18,life:1})
      // Scrap melting
      sim.scrapPieces=sim.scrapPieces.map(sc=>({...sc,temp:sc.temp+(sim.bathTemp-sc.temp)*0.005,meltFrac:Math.min(1,sc.meltFrac+0.0015)})).filter(sc=>sc.meltFrac<1)
    }

    if(stage==='SUBLANCE'){
      sim.subLanceY=Math.min(BATH_Y-VT-30, sim.subLanceY+1.5)
      if(sim.subLanceY>BATH_Y-VT-40&&!sim.subLanceDone){
        sim.subLanceDone=true
        sim.measuredT=Math.round(sim.bathTemp-3+(Math.random()-0.5)*8)
        sim.measuredC=(sim.bathC+0.002).toFixed(3)
        sim.subLanceCompleteFrames=0  // use frame counter instead of setTimeout
      }
      if(sim.subLanceDone&&!sim.subLanceSentComplete){
        sim.subLanceCompleteFrames=(sim.subLanceCompleteFrames||0)+1
        if(sim.subLanceCompleteFrames>120){  // ~2 seconds at 60fps
          sim.subLanceSentComplete=true
          onStageComplete()
        }
      }
    }

    if(stage==='FERRO_ALLOY'){
      sim.faFalling=true
      if(sim.frame%3===0){
        sim.faParticles.push({x:VCX+(Math.random()-0.5)*vHW(0.1)*0.3,y:VT+8,vy:3.5+Math.random()*4,life:1,r:1.5+Math.random()*2.5,col:Math.random()>0.5?'rgba(180,140,80,0.78)':'rgba(200,160,60,0.72)'})
      }
      if(sim.stageTimer>5){sim.faFalling=false; onStageComplete()}
    }

    if(stage==='SLAG_OUT'){
      sim.slagRunning=true
      sim.slagPotFill=Math.min(1, sim.slagPotFill+0.006)
      sim.slagThick=Math.max(0,sim.slagThick-0.5)
      if(sim.slagPotFill>=1){sim.slagRunning=false; onStageComplete()}
    }

    if(stage==='TAPPING'){
      sim.tapRunning=true
      sim.steelLadleFill=Math.min(1, sim.steelLadleFill+0.005)
      sim.bathLevel=Math.max(0.03, sim.bathLevel-0.004)
      sim.bathTemp=Math.max(1580, sim.bathTemp-0.05)
      sim.tapTemp=Math.round(sim.bathTemp-15+(Math.random()-0.5)*5)
      setCurrentTemp(sim.tapTemp)
      if(sim.frame%4===0) sim.sparks.push({x:TAPHOLE_X+10+(Math.random()-0.5)*15,y:TAPHOLE_Y+(Math.random()-0.5)*6,vx:2+Math.random()*4,vy:(Math.random()-0.5)*3,life:1,r:1+Math.random()*2,col:Math.random()>0.5?'#FFD54F':'#FF6D00'})
      if(sim.steelLadleFill>=1){sim.tapRunning=false; onStageComplete()}
    }

    // Advance particles
    sim.o2Jets        = sim.o2Jets.filter(p=>p.life>0&&p.y<BATH_Y+8).map(p=>({...p,x:p.x+p.vx*0.4,y:p.y+p.vy,life:p.life-0.06}))
    sim.coGas         = sim.coGas.filter(p=>p.life>0&&p.y>VT-20).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.010}))
    sim.co2Gas        = sim.co2Gas.filter(p=>p.life>0&&p.y>VT-28).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.014}))
    sim.slagSplash    = sim.slagSplash.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.2,life:p.life-0.04}))
    sim.sparks        = sim.sparks.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.25,life:p.life-0.05}))
    sim.steamPuffs    = sim.steamPuffs.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,r:p.r+0.45,life:p.life-0.022}))
    sim.offGasParticles=sim.offGasParticles.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.017}))
    sim.reactionZones  =sim.reactionZones.filter(p=>p.life>0).map(p=>({...p,life:p.life-0.038}))
    sim.fluxParticles  =sim.fluxParticles.filter(p=>p.life>0&&p.y<BATH_Y).map(p=>({...p,y:p.y+p.vy,life:p.life-0.016}))
    sim.faParticles    =sim.faParticles.filter(p=>p.life>0&&p.y<BATH_Y).map(p=>({...p,y:p.y+p.vy,life:p.life-0.018}))

    // ── DRAW ─────────────────────────────────────────────────────────────
    ctx.fillStyle='#06090f'; ctx.fillRect(0,0,W,H)
    ctx.strokeStyle='rgba(255,255,255,0.015)'; ctx.lineWidth=0.5
    for(let gx=0;gx<W;gx+=36){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke()}
    for(let gy=0;gy<H;gy+=36){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke()}

    const lbl=(t,x,y,c='#78909C',sz=9,al='center')=>{ctx.fillStyle=c;ctx.font=`${sz}px monospace`;ctx.textAlign=al;ctx.fillText(t,x,y)}
    const lblB=(t,x,y,c='#78909C',sz=9,al='center')=>{ctx.fillStyle=c;ctx.font=`bold ${sz}px monospace`;ctx.textAlign=al;ctx.fillText(t,x,y)}

    // ── CRANE GANTRY ──────────────────────────────────────────────────────
    // Runway rails (horizontal beams at top)
    ctx.fillStyle='#1a2535'; ctx.fillRect(0,CRANE_RAIL_Y,W,8)
    ctx.fillStyle='#263340'; ctx.fillRect(0,CRANE_RAIL_Y+2,W,4)
    // Cross beams
    ;[W*0.15,W*0.40,W*0.65,W*0.85].forEach(bx=>{
      ctx.fillStyle='#1a2535'; ctx.fillRect(bx-3,0,6,CRANE_RAIL_Y+8)
    })
    lbl('CRANE GANTRY RUNWAY',W*0.5,CRANE_RAIL_Y-4,'#1e3040',clamp(W*0.009,7,9))

    // Crane bridge (moves along runway)
    const CRANE_BX = sim.craneX*W
    ctx.fillStyle='#1e2d3d'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
    ctx.fillRect(CRANE_BX-W*0.14,CRANE_RAIL_Y+8,W*0.28,H*0.035)
    ctx.strokeRect(CRANE_BX-W*0.14,CRANE_RAIL_Y+8,W*0.28,H*0.035)
    // Crane drum
    ctx.save(); ctx.translate(CRANE_BX,CRANE_RAIL_Y+14)
    ctx.rotate(sim.drumAngle)
    ctx.fillStyle='#263340'; ctx.strokeStyle='#37474F'; ctx.lineWidth=0.8
    ctx.beginPath(); ctx.arc(0,0,7,0,Math.PI*2); ctx.fill(); ctx.stroke()
    ctx.strokeStyle='rgba(100,140,180,0.5)'; ctx.lineWidth=0.8; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(5,0); ctx.stroke()
    ctx.restore()
    // Hoist rope
    const HOOK_Y = sim.craneY*H
    ctx.strokeStyle='#37474F'; ctx.lineWidth=2
    ctx.beginPath(); ctx.moveTo(CRANE_BX,CRANE_RAIL_Y+22); ctx.lineTo(CRANE_BX,HOOK_Y); ctx.stroke()
    // Hook
    ctx.fillStyle='#455A64'; ctx.strokeStyle='#607D8B'; ctx.lineWidth=1
    ctx.beginPath(); ctx.arc(CRANE_BX,HOOK_Y,6,0,Math.PI*2); ctx.fill(); ctx.stroke()

    // Load cell display on crane bridge
    const lcVal = stage==='HM_CHARGE' ? sim.hmLadleWeight :
                  stage==='SCRAP_CHARGE' ? Math.round(scrapWeight*1000*(sim.scrapBucketEmpty?0:1)) :
                  stage==='FLUX_CHARGE' ? Math.round(fluxWeight*1000*(sim.fluxFalling?0.5:1)) : 0
    if(lcVal>0||stage==='HM_CHARGE'){
      ctx.fillStyle='rgba(4,12,28,0.85)'; ctx.fillRect(CRANE_BX+W*0.09,CRANE_RAIL_Y+6,W*0.10,H*0.025)
      ctx.strokeStyle='#1e3040'; ctx.lineWidth=0.6; ctx.strokeRect(CRANE_BX+W*0.09,CRANE_RAIL_Y+6,W*0.10,H*0.025)
      lblB('LOAD CELL',CRANE_BX+W*0.14,CRANE_RAIL_Y+13,'#29B6F6',clamp(W*0.008,6,8))
      lblB(`${Math.round(lcVal/1000*10)/10} t`,CRANE_BX+W*0.14,CRANE_RAIL_Y+23,stage==='HM_CHARGE'?'#FF8F00':'#78909C',clamp(W*0.010,8,11))
    }

    // ── SCRAP BUCKET (when stage=SCRAP_CHARGE, hangs from crane) ─────────
    if(stage==='SCRAP_CHARGE'||sim.scrapBucketTilted){
      const BKX=CRANE_BX, BKY=HOOK_Y+8
      const tilt = sim.scrapBucketTilted ? Math.PI*0.60 : 0
      // Rope from hook
      ctx.strokeStyle='#546E7A'; ctx.lineWidth=2.5
      ctx.beginPath(); ctx.moveTo(BKX-W*0.025,HOOK_Y+10); ctx.lineTo(BKX-W*0.055,BKY+H*0.06); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(BKX+W*0.025,HOOK_Y+10); ctx.lineTo(BKX+W*0.055,BKY+H*0.06); ctx.stroke()
      ctx.save(); ctx.translate(BKX,BKY+H*0.09); ctx.rotate(tilt)
      // Large visible bucket
      ctx.fillStyle='#1e2d3d'; ctx.strokeStyle='#546E7A'; ctx.lineWidth=2
      ctx.beginPath()
      ctx.moveTo(-W*0.065,0); ctx.lineTo(W*0.065,0)
      ctx.lineTo(W*0.055,H*0.13); ctx.lineTo(-W*0.055,H*0.13); ctx.closePath()
      ctx.fill(); ctx.stroke()
      // Hinge bolts
      ctx.fillStyle='#607D8B'
      ;[-W*0.06,W*0.06].forEach(bx=>{ctx.beginPath();ctx.arc(bx,0,4,0,Math.PI*2);ctx.fill()})
      if(!sim.scrapBucketEmpty){
        // Scrap metal pieces
        ctx.fillStyle='rgba(38,35,28,0.92)'; ctx.fillRect(-W*0.058,4,W*0.116,H*0.115)
        for(let si=0;si<7;si++){
          const rx=(si-3)*W*0.016, ry=8+si%3*12
          ctx.fillStyle=`rgba(${45+si*5},${42+si*4},${35+si*3},0.8)`
          ctx.fillRect(rx,ry,W*0.014+si*0.002,H*0.025)
        }
        // Scrap label
        ctx.fillStyle='#90A4AE'; ctx.font=`bold ${clamp(W*0.010,8,11)}px monospace`; ctx.textAlign='center'
        ctx.fillText(`${scrapWeight}t`,0,H*0.075)
      }
      ctx.restore()
      if(!sim.scrapBucketEmpty) lbl('SCRAP BUCKET',BKX,BKY+H*0.24,'#78909C',clamp(W*0.009,7,9))
    }

    // ── HM LADLE (hangs from crane when stage=HM_CHARGE) ─────────────────
    if(stage==='HM_CHARGE'||stage==='BLOWING'||stage==='SUBLANCE'||stage==='SLAG_OUT'||stage==='TAPPING'){
      // After pouring, crane moves back LEFT with empty ladle
      const ladleParked = (sim.ladlePoured||stage!=='HM_CHARGE')
      // Empty ladle parks at far left after pouring
      const LDX = ladleParked ? W*0.12 : CRANE_BX
      const LDY = ladleParked ? H*0.28 : HOOK_Y+6
      const LW=W*0.13, LH=H*0.20   // BIG ladle
      // tiltAng kept for code compatibility (always 0 — no tilt)
      const tiltAng = 0

      ctx.save(); ctx.translate(LDX, LDY+LH*0.5); ctx.rotate(tiltAng)
      // Ladle shell
      ctx.fillStyle='#263340'; ctx.strokeStyle='#37474F'; ctx.lineWidth=1.5
      ctx.beginPath()
      ctx.moveTo(-LW/2,0); ctx.lineTo(LW/2,0)
      ctx.lineTo(LW/2-LW*0.08,LH/2); ctx.lineTo(-LW/2+LW*0.08,LH/2); ctx.closePath()
      ctx.fill(); ctx.stroke()
      // Steel in ladle
      if(sim.ladleLevel>0.02){
        const lf=sim.ladleLevel
        const ly=-LH/2*0.8+LH*(0.8-lf*0.7)
        const lg=ctx.createLinearGradient(0,ly,0,LH/2)
        lg.addColorStop(0,`rgba(255,${Math.round(100+40*Math.sin(sim.t*3))},0,0.95)`)
        lg.addColorStop(1,'rgba(190,40,0,0.80)')
        ctx.fillStyle=lg
        ctx.beginPath()
        ctx.moveTo(-LW/2+LW*0.08*(1-lf),ly); ctx.lineTo(LW/2-LW*0.08*(1-lf),ly)
        ctx.lineTo(LW/2-LW*0.08,LH/2); ctx.lineTo(-LW/2+LW*0.08,LH/2); ctx.closePath()
        ctx.fill()
        // Meniscus shimmer
        ctx.fillStyle=`rgba(255,200,50,${0.25+0.18*Math.sin(sim.t*4)})`
        ctx.fillRect(-LW/2+LW*0.08*(1-lf),ly,LW-LW*0.16*(1-lf),3)
      }
      // Trunnion pins
      ctx.fillStyle='#37474F'; ctx.beginPath(); ctx.arc(-LW/2-6,0,5,0,Math.PI*2); ctx.fill()
      ctx.beginPath(); ctx.arc(LW/2+6,0,5,0,Math.PI*2); ctx.fill()
      ctx.restore()

      // Ropes from hook to ladle (always shown when crane active)
      if(!ladleParked){
        ctx.strokeStyle='#546E7A'; ctx.lineWidth=2
        ctx.beginPath(); ctx.moveTo(CRANE_BX-W*0.03,HOOK_Y+10); ctx.lineTo(LDX-LW/2+6,LDY+8); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(CRANE_BX+W*0.03,HOOK_Y+10); ctx.lineTo(LDX+LW/2-6,LDY+8); ctx.stroke()
      }
      // Direct pour — ladle is over vessel mouth, stream falls straight down into BOF
      const pouringNow = stage==='HM_CHARGE' && !sim.ladlePoured && Math.abs(sim.craneX - VCX/W) < 0.03 && sim.ladleLevel > 0
      if(pouringNow){
        const streamX = VCX   // pour centre = vessel mouth centre
        const streamTop = LDY + LH*0.9  // bottom of ladle
        const streamBot = BATH_Y        // into bath
        const streamW = clamp(sim.ladleLevel * 20, 5, 22)
        // Falling stream gradient
        const sg = ctx.createLinearGradient(0, streamTop, 0, streamBot)
        sg.addColorStop(0, `rgba(255,${100+Math.round(40*Math.sin(sim.t*5))},0,0.96)`)
        sg.addColorStop(0.4, 'rgba(255,75,0,0.85)')
        sg.addColorStop(0.85, 'rgba(230,50,0,0.65)')
        sg.addColorStop(1, 'rgba(200,35,0,0.40)')
        ctx.strokeStyle = sg
        ctx.lineWidth = streamW
        ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(streamX, streamTop); ctx.lineTo(streamX, streamBot)
        ctx.stroke(); ctx.lineCap = 'butt'
        // Slight sway (natural turbulence)
        const sway = Math.sin(sim.t * 7) * 4
        ctx.lineWidth = streamW * 0.4
        ctx.strokeStyle = `rgba(255,180,50,${0.35 + 0.2*Math.sin(sim.t*6)})`
        ctx.beginPath(); ctx.moveTo(streamX+sway, streamTop+8); ctx.lineTo(streamX+sway*0.3, streamBot-10); ctx.stroke()
        // Splash glow at bath surface
        const spGrd = ctx.createRadialGradient(streamX, streamBot, 2, streamX, streamBot, 55)
        spGrd.addColorStop(0, `rgba(255,130,0,${0.65+0.25*Math.sin(sim.t*8)})`)
        spGrd.addColorStop(0.5, 'rgba(255,80,0,0.30)')
        spGrd.addColorStop(1, 'rgba(255,60,0,0)')
        ctx.fillStyle = spGrd; ctx.beginPath(); ctx.arc(streamX, streamBot, 55, 0, Math.PI*2); ctx.fill()
        // Glow at vessel mouth
        const mgGrd = ctx.createRadialGradient(streamX, VT+8, 2, streamX, VT+8, 38)
        mgGrd.addColorStop(0, 'rgba(255,140,0,0.40)'); mgGrd.addColorStop(1, 'rgba(255,80,0,0)')
        ctx.fillStyle = mgGrd; ctx.beginPath(); ctx.arc(streamX, VT+8, 38, 0, Math.PI*2); ctx.fill()
        // Load cell display — alongside crane bridge
        const lcX = CRANE_BX + W*0.10
        ctx.fillStyle='rgba(4,12,28,0.90)'; ctx.fillRect(lcX, CRANE_RAIL_Y+6, W*0.11, H*0.040)
        ctx.strokeStyle='#1e3040'; ctx.lineWidth=0.8; ctx.strokeRect(lcX, CRANE_RAIL_Y+6, W*0.11, H*0.040)
        lblB('LOAD CELL', lcX+W*0.055, CRANE_RAIL_Y+16, '#29B6F6', clamp(W*0.009,7,10))
        lblB(`${(sim.ladleLevel*hmWeight).toFixed(1)} t`, lcX+W*0.055, CRANE_RAIL_Y+28, '#FF8F00', clamp(W*0.013,11,14))
      }
      // Ladle label
      lblB('HOT METAL LADLE',LDX,LDY-12,'#FF7043',clamp(W*0.011,9,12))
      lbl(`${(sim.ladleLevel*hmWeight).toFixed(1)}t  ${hmTemp}°C`,LDX,LDY+LH+16,sim.ladleLevel>0.05?'#FF8F00':'#546E7A',clamp(W*0.010,8,10))
      lbl(`C:${hmC}%  Si:${hmSi}%  Mn:${hmMn}%`,LDX,LDY+LH+28,'rgba(200,180,150,0.72)',clamp(W*0.009,7,9))
    }

    // ── FLUX HOPPERS (above vessel, left side with conveyor chute) ──────
    const FLUX_HX=[VCX-W*0.30, VCX-W*0.22]
    const fluxOpen=stage==='FLUX_CHARGE'&&sim.fluxFalling
    FLUX_HX.forEach((hx,hi)=>{
      const HY2=H*0.08, HW2=W*0.055, HH2=H*0.11
      // Hopper structure
      ctx.fillStyle='#1e2d3d'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.2
      ctx.beginPath()
      ctx.moveTo(hx-HW2/2,HY2); ctx.lineTo(hx+HW2/2,HY2)
      ctx.lineTo(hx+HW2/2-5,HY2+HH2); ctx.lineTo(hx-HW2/2+5,HY2+HH2); ctx.closePath()
      ctx.fill(); ctx.stroke()
      // Hopper top frame
      ctx.fillStyle='#263340'; ctx.fillRect(hx-HW2/2-3,HY2-4,HW2+6,6); ctx.strokeRect(hx-HW2/2-3,HY2-4,HW2+6,6)
      // Material fill inside hopper
      const matCol=hi===0?'rgba(210,215,195,0.82)':'rgba(195,165,105,0.82)'
      const fillH=HH2*0.78
      ctx.fillStyle=matCol
      ctx.beginPath()
      ctx.moveTo(hx-HW2/2+5,HY2+8); ctx.lineTo(hx+HW2/2-5,HY2+8)
      ctx.lineTo(hx+HW2/2-5,HY2+fillH); ctx.lineTo(hx-HW2/2+5,HY2+fillH); ctx.closePath(); ctx.fill()
      // Gate indicator
      ctx.fillStyle=fluxOpen?'#FF8F00':'#263340'; ctx.fillRect(hx-5,HY2+HH2-4,10,8)
      ctx.strokeStyle=fluxOpen?'#FFB300':'#37474F'; ctx.lineWidth=0.8; ctx.strokeRect(hx-5,HY2+HH2-4,10,8)
      // Chute pipe to vessel
      ctx.strokeStyle='#1a2535'; ctx.lineWidth=6
      ctx.beginPath(); ctx.moveTo(hx,HY2+HH2+4); ctx.bezierCurveTo(hx,HY2+HH2+H*0.04,VCX-VW*0.8,VT-H*0.02,VCX-VW*0.5,VT+4); ctx.stroke()
      if(fluxOpen){
        // Flowing material stream
        const mStream=hi===0?'rgba(210,215,195,0.75)':'rgba(195,165,105,0.75)'
        const fg2=ctx.createLinearGradient(hx,HY2+HH2,VCX-VW*0.5,VT)
        fg2.addColorStop(0,mStream); fg2.addColorStop(1,mStream.replace('0.75','0.25'))
        ctx.strokeStyle=fg2; ctx.lineWidth=7
        ctx.beginPath(); ctx.moveTo(hx,HY2+HH2+4); ctx.bezierCurveTo(hx,HY2+HH2+H*0.04,VCX-VW*0.8,VT-H*0.02,VCX-VW*0.5,VT+4); ctx.stroke()
      }
      lblB(hi===0?'LIME HOPPER':'DOLO HOPPER',hx,HY2-8,fluxOpen?'#A5D6A7':'#37474F',clamp(W*0.009,7,9))
      lbl(hi===0?'CaO':'CaO·MgO',hx,HY2+HH2+16,fluxOpen?'#8BC34A':'#37474F',clamp(W*0.008,6,8))
    })

    // Flux particles
    sim.fluxParticles.forEach(p=>{
      ctx.globalAlpha=p.life*0.75; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // ── BOF VESSEL SHELL ──────────────────────────────────────────────────
    // ── VESSEL DRAWING (rotated around bottom pivot) ────────────────────
    // Save state, rotate entire vessel around its bottom pivot
    ctx.save()
    ctx.translate(VPIVOT_X, VPIVOT_Y)
    ctx.rotate(tiltRad)
    ctx.translate(-VPIVOT_X, -VPIVOT_Y)

    // Vessel vibration offset (small, horizontal only)
    const vibX = sim.vesselVib * Math.cos(tiltRad)
    const vibY = sim.vesselVib * Math.sin(tiltRad)

    const steps=60
    const leftPts=[], rightPts=[]
    for(let s=0;s<=steps;s++){
      const yf=s/steps, y=VT+yf*VH, hw=vHW(yf)
      leftPts.push([VCX-hw+vibX, y+vibY])
      rightPts.push([VCX+hw+vibX, y+vibY])
    }
    // Shell
    ctx.beginPath(); ctx.moveTo(...leftPts[0])
    leftPts.forEach(p=>ctx.lineTo(...p))
    rightPts.slice().reverse().forEach(p=>ctx.lineTo(...p))
    ctx.closePath(); ctx.fillStyle='#1a2535'; ctx.fill()
    ctx.strokeStyle='#2c4055'; ctx.lineWidth=2.5; ctx.stroke()

    // Clip interior (refractory + bath + slag + scrap all inside this rotate)
    ctx.save()
    ctx.beginPath(); ctx.moveTo(...leftPts[0])
    leftPts.forEach(p=>ctx.lineTo(...p))
    rightPts.slice().reverse().forEach(p=>ctx.lineTo(...p))
    ctx.closePath(); ctx.clip()

    // Refractory
    ctx.fillStyle='#1e1408'; ctx.fillRect(VCX-VW*1.2,VT,VW*2.4,VH)
    const LINING=clamp(W*0.018,12,22)
    ctx.fillStyle='#2c1a08'; ctx.fillRect(VCX-VW*1.1+LINING,VT,VW*2.2-LINING*2,VH)

    // Liquid steel bath
    if(sim.bathLevel>0.04){
      const bathGrd=ctx.createLinearGradient(0,BATH_Y-20,0,VB)
      bathGrd.addColorStop(0, heatColor(sim.bathTemp,1380,1750))
      bathGrd.addColorStop(0.3, heatColor(sim.bathTemp-25,1380,1750))
      bathGrd.addColorStop(1, heatColor(sim.bathTemp-70,1380,1750))
      ctx.fillStyle=bathGrd; ctx.fillRect(VCX-VW*1.2,BATH_Y,VW*2.4,VB-BATH_Y)
      // Surface shimmer
      if(stage==='BLOWING'&&running){
        ctx.fillStyle=`rgba(255,215,55,${0.14+0.10*Math.sin(sim.t*6)})`
        const shyf=clamp((BATH_Y-VT)/VH,0,1)
        ctx.fillRect(VCX-vHW(shyf)*0.92,BATH_Y,vHW(shyf)*1.84,4)
      }
    }

    // Scrap pieces inside vessel
    sim.scrapPieces.forEach(sc=>{
      const sx=VCX+sc.x*vHW(0.6), sy=BATH_Y+(VB-BATH_Y)*sc.y
      const mf=sc.meltFrac
      ctx.save(); ctx.translate(sx,sy); ctx.rotate(sc.angle||0)
      ctx.fillStyle=`rgba(${Math.round(40+mf*100)},${Math.round(38+mf*80)},${Math.round(42+mf*60)},${0.9-mf*0.55})`
      ctx.fillRect(-sc.w/2,-sc.h/2,sc.w*(1-mf*0.7),sc.h*(1-mf*0.5))
      if(mf>0.15){
        const sg2=ctx.createRadialGradient(0,0,1,0,0,sc.w*0.9)
        sg2.addColorStop(0,`rgba(255,${Math.round(70+mf*80)},0,${0.32*mf})`); sg2.addColorStop(1,'rgba(255,60,0,0)')
        ctx.fillStyle=sg2; ctx.fillRect(-sc.w,-sc.h,sc.w*2,sc.h*2)
      }
      ctx.restore()
    })

    // Slag layer
    if(sim.slagThick>2){
      const slagHWyf=clamp((SLAG_Y-VT)/VH,0,1), slagHW2=vHW(slagHWyf)*0.9
      const slg=ctx.createLinearGradient(0,SLAG_Y,0,BATH_Y)
      slg.addColorStop(0,`rgba(${Math.round(75+sim.slagFoam*35)},${Math.round(88+sim.slagFoam*18)},38,0.88)`)
      slg.addColorStop(1,'rgba(65,78,30,0.72)')
      ctx.fillStyle=slg; ctx.fillRect(VCX-slagHW2,SLAG_Y,slagHW2*2,BATH_Y-SLAG_Y)
      // Foam lumps
      if(sim.slagFoam>0.18&&running){
        for(let fx=VCX-slagHW2+6;fx<VCX+slagHW2-6;fx+=13){
          const lump=3+sim.slagFoam*7+2.5*Math.sin(sim.t*4+fx*0.25)
          const fg=ctx.createRadialGradient(fx,SLAG_Y,0,fx,SLAG_Y,lump*1.4)
          fg.addColorStop(0,`rgba(120,115,48,${0.48+sim.slagFoam*0.28})`); fg.addColorStop(1,'rgba(75,88,28,0)')
          ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(fx,SLAG_Y,lump*1.4,0,Math.PI*2); ctx.fill()
        }
      }
    }

    // Reaction zones
    sim.reactionZones.forEach(rz=>{
      const rg=ctx.createRadialGradient(rz.x,rz.y,0,rz.x,rz.y,rz.r*2)
      rg.addColorStop(0,`rgba(255,${Math.round(80+rz.life*80)},0,${rz.life*0.38})`); rg.addColorStop(1,'rgba(255,80,0,0)')
      ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(rz.x,rz.y,rz.r*2,0,Math.PI*2); ctx.fill()
    })

    // CO gas
    sim.coGas.forEach(p=>{ctx.globalAlpha=p.life*0.54;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=p.life*0.16;ctx.beginPath();ctx.arc(p.x-p.vx*0.55,p.y-p.vy*0.45,p.r*0.45,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1

    // Steam puffs
    sim.steamPuffs.forEach(p=>{ctx.globalAlpha=p.life*0.20;ctx.fillStyle='rgba(200,215,230,1)';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1

    // Slag splash
    sim.slagSplash.forEach(p=>{ctx.globalAlpha=p.life*0.78;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1

    // Ferro alloy particles
    sim.faParticles.forEach(p=>{ctx.globalAlpha=p.life*0.80;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1

    ctx.restore()  // restore interior clip
    ctx.restore()  // restore vessel rotation

    // CO2 upper vessel
    sim.co2Gas.forEach(p=>{ctx.globalAlpha=p.life*0.46;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1

    // Sparks
    sim.sparks.forEach(p=>{ctx.globalAlpha=p.life;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=p.life*0.22;ctx.fillStyle='#FF8F00';ctx.beginPath();ctx.arc(p.x-p.vx*0.45,p.y-p.vy*0.45,p.r*0.35,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1

    // Vessel border overlay — drawn AFTER rotation is restored, so keep leftPts/rightPts coords

    // ── O2 LANCE ──────────────────────────────────────────────────────────
    // Lance enters straight down into vessel mouth (mouth position rotated)
    const lanceLocalX=VCX+W*0.005, lanceLocalY=VT-H*0.02
    const dlx=lanceLocalX-VPIVOT_X, dly=lanceLocalY-VPIVOT_Y
    const LANCE_X=tiltRad!==0?VPIVOT_X+dlx*Math.cos(tiltRad)-dly*Math.sin(tiltRad):lanceLocalX
    const LANCE_TOP=VT-H*0.12
    const LANCE_DRAWN_BOT=stage==='BLOWING'?sim.lanceY:
                          stage==='SUBLANCE'||stage==='FERRO_ALLOY'?VT-H*0.04:
                          stage==='SLAG_OUT'||stage==='TAPPING'||stage==='COMPLETE'?LANCE_TOP:
                          LANCE_TOP
    const LW2=clamp(W*0.016,9,16)

    if(stage==='BLOWING'||stage==='SUBLANCE'){
      // Lance body
      const lGrd=ctx.createLinearGradient(LANCE_X-LW2/2,0,LANCE_X+LW2/2,0)
      lGrd.addColorStop(0,'#1a3a4a'); lGrd.addColorStop(0.5,'#29B6F6'); lGrd.addColorStop(1,'#1a3a4a')
      ctx.fillStyle=lGrd; ctx.fillRect(LANCE_X-LW2/2,LANCE_TOP,LW2,LANCE_DRAWN_BOT-LANCE_TOP)
      ctx.strokeStyle='#0288D1'; ctx.lineWidth=0.8; ctx.strokeRect(LANCE_X-LW2/2,LANCE_TOP,LW2,LANCE_DRAWN_BOT-LANCE_TOP)
      for(let ly=LANCE_TOP+8;ly<LANCE_DRAWN_BOT-4;ly+=16){ctx.fillStyle='rgba(41,182,246,0.10)';ctx.fillRect(LANCE_X-LW2/2,ly,LW2,5)}
      // Copper tip
      ctx.fillStyle='#FF8F00'; ctx.fillRect(LANCE_X-LW2/2-2,LANCE_DRAWN_BOT-8,LW2+4,10)
      // O2 jets
      if(stage==='BLOWING'&&running){
        ;[-0.32,-0.10,0.10,0.32].forEach(a=>{
          const jx=LANCE_X+Math.sin(a)*6, jy=LANCE_DRAWN_BOT
          const jg=ctx.createLinearGradient(jx,jy,jx+Math.sin(a)*18,jy+22)
          jg.addColorStop(0,`rgba(100,180,255,${0.82*sim.lanceFlame||0.7})`); jg.addColorStop(1,'rgba(100,180,255,0)')
          ctx.strokeStyle=jg; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(jx,jy); ctx.lineTo(jx+Math.sin(a)*18,jy+22); ctx.stroke()
        })
        // Impact glow
        const ig=ctx.createRadialGradient(LANCE_X,LANCE_DRAWN_BOT+22,2,LANCE_X,LANCE_DRAWN_BOT+22,30)
        ig.addColorStop(0,'rgba(255,230,80,0.55)'); ig.addColorStop(1,'rgba(255,80,0,0)')
        ctx.fillStyle=ig; ctx.fillRect(LANCE_X-40,LANCE_DRAWN_BOT,80,55)
      }
      // Lance labels
      lblB('O₂ LANCE',LANCE_X+LW2/2+8,LANCE_TOP+18,'#0288D1',clamp(W*0.009,7,9),'left')
      lbl(`H: ${lanceHeight}mm`,LANCE_X+LW2/2+8,LANCE_TOP+29,'#29B6F6',clamp(W*0.009,7,9),'left')
      lbl(`${o2Flow} Nm³/m`,LANCE_X+LW2/2+8,LANCE_TOP+39,'#81D4FA',clamp(W*0.009,7,9),'left')
      // Lance height arrow
      ctx.strokeStyle='rgba(0,188,212,0.28)'; ctx.lineWidth=1; ctx.setLineDash([3,4])
      ctx.beginPath(); ctx.moveTo(LANCE_X-LW2/2-14,LANCE_DRAWN_BOT); ctx.lineTo(LANCE_X-LW2/2-14,BATH_Y); ctx.stroke()
      ctx.setLineDash([])
      lbl(`${lanceHeight}mm`,LANCE_X-LW2/2-18,LANCE_DRAWN_BOT+(BATH_Y-LANCE_DRAWN_BOT)/2,'rgba(0,188,212,0.45)',clamp(W*0.009,7,9),'right')
    }

    // O2 jet particles
    sim.o2Jets.forEach(p=>{ctx.globalAlpha=p.life*0.7;ctx.fillStyle='rgba(100,180,255,0.75)';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1

    // ── SUB-LANCE ──────────────────────────────────────────────────────────
    if(stage==='SUBLANCE'){
      const SLX=VCX-LW2*2, SLY0=VT-H*0.04, SLY1=SLY0+sim.subLanceY
      ctx.fillStyle='#2c3e50'; ctx.strokeStyle='#546E7A'; ctx.lineWidth=0.8
      ctx.fillRect(SLX-3,SLY0,6,SLY1-SLY0); ctx.strokeRect(SLX-3,SLY0,6,SLY1-SLY0)
      ctx.fillStyle='#57ab5a'; ctx.beginPath(); ctx.arc(SLX,SLY1,5,0,Math.PI*2); ctx.fill()
      lblB('SUB-LANCE',SLX,SLY0-6,'#57ab5a',clamp(W*0.009,7,9))
      if(sim.measuredT){
        lbl(`T:${sim.measuredT}°C`,SLX,SLY0+4,'#57ab5a',clamp(W*0.009,7,9))
        lbl(`[C]:${sim.measuredC}%`,SLX,SLY0+14,'#57ab5a',clamp(W*0.009,7,9))
      }
    }

    // ── OFF-GAS HOOD ──────────────────────────────────────────────────────
    if(stage==='BLOWING'){
      const HOOD_Y=VT-H*0.05
      ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
      ctx.beginPath()
      ctx.moveTo(VCXT-vHW(0)*0.78,HOOD_Y+H*0.04)
      ctx.lineTo(VCXT-W*0.05,HOOD_Y); ctx.lineTo(VCXT-W*0.04,HOOD_Y-H*0.04)
      ctx.lineTo(VCXT+W*0.04,HOOD_Y-H*0.04); ctx.lineTo(VCXT+W*0.05,HOOD_Y)
      ctx.lineTo(VCXT+vHW(0)*0.78,HOOD_Y+H*0.04); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.strokeStyle=running?`rgba(${130+Math.round(28*Math.sin(sim.t*2))},120,55,0.68)`:'#1a2535'; ctx.lineWidth=10
      ctx.beginPath(); ctx.moveTo(VCXT+W*0.04,HOOD_Y-H*0.04); ctx.bezierCurveTo(VCXT+W*0.09,HOOD_Y-H*0.06,W*0.78,HOOD_Y-H*0.05,W*0.82,H*0.06); ctx.stroke()
      lbl('OFF-GAS',W*0.80,H*0.04,'#9B8040',clamp(W*0.009,7,9))
      // Off-gas particles
      sim.offGasParticles.forEach(p=>{ctx.globalAlpha=p.life*0.40;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1
    }

    // ── TAPHOLE & STEEL TAPPING ────────────────────────────────────────────
    if(stage==='TAPPING'){
      // Steel runner
      ctx.strokeStyle='#37474F'; ctx.lineWidth=8
      ctx.beginPath(); ctx.moveTo(TAPHOLE_X,TAPHOLE_Y); ctx.lineTo(TAPHOLE_X+W*0.12,TAPHOLE_Y+H*0.06); ctx.stroke()
      const tsg=ctx.createLinearGradient(TAPHOLE_X,TAPHOLE_Y,TAPHOLE_X+W*0.12,TAPHOLE_Y+H*0.06)
      tsg.addColorStop(0,`rgba(255,${80+Math.round(35*Math.sin(sim.t*6))},0,0.92)`)
      tsg.addColorStop(1,'rgba(210,40,0,0.68)')
      ctx.strokeStyle=tsg; ctx.lineWidth=5
      ctx.beginPath(); ctx.moveTo(TAPHOLE_X,TAPHOLE_Y); ctx.lineTo(TAPHOLE_X+W*0.12,TAPHOLE_Y+H*0.06); ctx.stroke()
      const tgw=ctx.createRadialGradient(TAPHOLE_X,TAPHOLE_Y,2,TAPHOLE_X,TAPHOLE_Y,20)
      tgw.addColorStop(0,'rgba(255,120,0,0.6)'); tgw.addColorStop(1,'rgba(255,80,0,0)')
      ctx.fillStyle=tgw; ctx.fillRect(TAPHOLE_X-22,TAPHOLE_Y-22,44,44)
      lblB('TAPPING',TAPHOLE_X-6,TAPHOLE_Y-12,'#FFD54F',clamp(W*0.009,7,9),'right')

      // Steel ladle below taphole
      const SLX2=TAPHOLE_X+W*0.10, SLY2=TAPHOLE_Y+H*0.08
      const SLW=W*0.12, SLH=H*0.14
      ctx.fillStyle='#1e2d3d'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
      ctx.beginPath(); ctx.moveTo(SLX2-SLW/2,SLY2); ctx.lineTo(SLX2+SLW/2,SLY2); ctx.lineTo(SLX2+SLW/2-8,SLY2+SLH); ctx.lineTo(SLX2-SLW/2+8,SLY2+SLH); ctx.closePath(); ctx.fill(); ctx.stroke()
      if(sim.steelLadleFill>0.02){
        const sf=sim.steelLadleFill
        const sly2=SLY2+SLH*(1-sf*0.88)
        const slg2=ctx.createLinearGradient(0,sly2,0,SLY2+SLH)
        slg2.addColorStop(0,heatColor(sim.tapTemp||1650,1400,1720)); slg2.addColorStop(1,'rgba(190,40,0,0.78)')
        ctx.fillStyle=slg2
        ctx.beginPath(); ctx.moveTo(SLX2-SLW/2+sf*4,sly2); ctx.lineTo(SLX2+SLW/2-sf*4,sly2); ctx.lineTo(SLX2+SLW/2-8,SLY2+SLH); ctx.lineTo(SLX2-SLW/2+8,SLY2+SLH); ctx.closePath(); ctx.fill()
        ctx.fillStyle=`rgba(255,200,50,${0.22+0.14*Math.sin(sim.t*4)})`; ctx.fillRect(SLX2-SLW/2+sf*4,sly2,SLW-sf*8,3)
      }
      // Ladle walls
      ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
      ctx.beginPath(); ctx.moveTo(SLX2-SLW/2,SLY2); ctx.lineTo(SLX2-SLW/2+8,SLY2+SLH); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(SLX2+SLW/2,SLY2); ctx.lineTo(SLX2+SLW/2-8,SLY2+SLH); ctx.stroke()
      lblB('STEEL LADLE',SLX2,SLY2-6,'#FF8F00',clamp(W*0.010,8,10))
      lbl(`${(sim.steelLadleFill*hmWeight).toFixed(1)}t`,SLX2,SLY2+SLH+14,sim.steelLadleFill>0?'#FF7043':'#546E7A',clamp(W*0.009,7,9))
      if(sim.tapTemp) lbl(`${sim.tapTemp}°C`,SLX2,SLY2+SLH+24,heatColor(sim.tapTemp,1400,1720),clamp(W*0.009,7,9))
    }

    // ── SLAGHOLE & SLAG POT ────────────────────────────────────────────────
    if(stage==='SLAG_OUT'){
      ctx.strokeStyle='#37474F'; ctx.lineWidth=6
      ctx.beginPath(); ctx.moveTo(SLAGHOLE_X,SLAGHOLE_Y); ctx.lineTo(SLAGHOLE_X-W*0.10,SLAGHOLE_Y+H*0.05); ctx.stroke()
      const slStream=ctx.createLinearGradient(SLAGHOLE_X,SLAGHOLE_Y,SLAGHOLE_X-W*0.10,SLAGHOLE_Y+H*0.05)
      slStream.addColorStop(0,'rgba(110,128,45,0.92)'); slStream.addColorStop(1,'rgba(85,100,32,0.62)')
      ctx.strokeStyle=slStream; ctx.lineWidth=5
      ctx.beginPath(); ctx.moveTo(SLAGHOLE_X,SLAGHOLE_Y); ctx.lineTo(SLAGHOLE_X-W*0.10,SLAGHOLE_Y+H*0.05); ctx.stroke()
      lblB('SLAG RUNNING',SLAGHOLE_X+8,SLAGHOLE_Y-8,'#A5D6A7',clamp(W*0.009,7,9),'left')
      // Slag pot
      const SPX=SLAGHOLE_X-W*0.12, SPY=SLAGHOLE_Y+H*0.06
      const SPW=W*0.10, SPH=H*0.12
      ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
      ctx.beginPath(); ctx.moveTo(SPX-SPW/2,SPY); ctx.lineTo(SPX+SPW/2,SPY); ctx.lineTo(SPX+SPW/2-6,SPY+SPH); ctx.lineTo(SPX-SPW/2+6,SPY+SPH); ctx.closePath(); ctx.fill(); ctx.stroke()
      if(sim.slagPotFill>0.02){
        const spf=sim.slagPotFill
        const spy2=SPY+SPH*(1-spf*0.88)
        const spg=ctx.createLinearGradient(0,spy2,0,SPY+SPH)
        spg.addColorStop(0,'rgba(110,125,42,0.92)'); spg.addColorStop(1,'rgba(80,95,28,0.75)')
        ctx.fillStyle=spg
        ctx.beginPath(); ctx.moveTo(SPX-SPW/2+spf*4,spy2); ctx.lineTo(SPX+SPW/2-spf*4,spy2); ctx.lineTo(SPX+SPW/2-6,SPY+SPH); ctx.lineTo(SPX-SPW/2+6,SPY+SPH); ctx.closePath(); ctx.fill()
      }
      ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
      ctx.beginPath(); ctx.moveTo(SPX-SPW/2,SPY); ctx.lineTo(SPX-SPW/2+6,SPY+SPH); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(SPX+SPW/2,SPY); ctx.lineTo(SPX+SPW/2-6,SPY+SPH); ctx.stroke()
      lblB('SLAG POT',SPX,SPY-6,'#A5D6A7',clamp(W*0.010,8,10))
      lbl(`${(sim.slagPotFill*12).toFixed(1)}t`,SPX,SPY+SPH+14,'#8BC34A',clamp(W*0.009,7,9))
    }

    // ── FERRO ALLOY HOPPERS ────────────────────────────────────────────────
    if(stage==='FERRO_ALLOY'){
      const FA_HX=[VCX+W*0.18,VCX+W*0.25,VCX+W*0.32]
      FA_HX.forEach((hx2,hi)=>{
        const names=['FeSi','FeMn','FeNb']
        const HY3=H*0.08, HW3=W*0.045, HH3=H*0.09
        ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1
        ctx.beginPath(); ctx.moveTo(hx2-HW3/2,HY3); ctx.lineTo(hx2+HW3/2,HY3); ctx.lineTo(hx2+HW3/2-4,HY3+HH3); ctx.lineTo(hx2-HW3/2+4,HY3+HH3); ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.fillStyle='rgba(190,150,60,0.65)'; ctx.fillRect(hx2-HW3/2+4,HY3+8,HW3-8,HH3-16)
        lblB(names[hi],hx2,HY3-4,'#FFB300',clamp(W*0.009,7,9))
        ctx.fillStyle='#0d1520'; ctx.fillRect(hx2-3,HY3+HH3,6,H*0.03)
        if(sim.faFalling){
          const fgrd=ctx.createLinearGradient(hx2,HY3+HH3,VCX,VT)
          fgrd.addColorStop(0,'rgba(190,150,60,0.65)'); fgrd.addColorStop(1,'rgba(190,150,60,0.15)')
          ctx.strokeStyle=fgrd; ctx.lineWidth=3.5
          ctx.beginPath(); ctx.moveTo(hx2,HY3+HH3); ctx.lineTo(VCX+(hx2-VCX)*0.2,VT); ctx.stroke()
        }
      })
      lbl('FERRO ALLOY ADDITION',VCX+W*0.25,H*0.05,'#FFB300',clamp(W*0.010,8,10))
      sim.faParticles.forEach(p=>{ctx.globalAlpha=p.life*0.82;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1
    }

    // ── PROCESS STAGE DISPLAY ─────────────────────────────────────────────
    const stageNames={
      SCRAP_CHARGE:'SCRAP CHARGING',FLUX_CHARGE:'FLUX ADDITION',HM_CHARGE:'HOT METAL CHARGING',
      BLOWING:'O₂ BLOWING',SUBLANCE:'SUB-LANCE MEASUREMENT',FERRO_ALLOY:'FERRO ALLOY ADDITION',
      SLAG_OUT:'SLAG TAPPING',TAPPING:'STEEL TAPPING',COMPLETE:'HEAT COMPLETE ✓'
    }
    const stageColors={
      SCRAP_CHARGE:'#78909C',FLUX_CHARGE:'#A5D6A7',HM_CHARGE:'#FF7043',
      BLOWING:'#FF8F00',SUBLANCE:'#57ab5a',FERRO_ALLOY:'#FFB300',
      SLAG_OUT:'#8BC34A',TAPPING:'#FF6D00',COMPLETE:'#39c5cf'
    }
    ctx.fillStyle='rgba(4,8,18,0.82)'; ctx.fillRect(0,0,W,H*0.028)
    const stageCol=stageColors[stage]||'#546E7A'
    ctx.fillStyle=stageCol; ctx.font=`bold ${clamp(W*0.013,10,14)}px monospace`; ctx.textAlign='center'
    ctx.fillText(stageNames[stage]||stage, W*0.44, H*0.020)
    // Stage indicator dots
    STAGES.forEach((s,si)=>{
      const stX=W*0.01+si*W*0.095
      ctx.fillStyle=s===stage?stageColors[s]||'#FF8F00':STAGES.indexOf(stage)>si?'#263340':'#1a2535'
      ctx.beginPath(); ctx.arc(stX,H*0.014,5,0,Math.PI*2); ctx.fill()
      if(s===stage){ctx.strokeStyle=stageColors[s];ctx.lineWidth=1.5;ctx.stroke()}
    })

    // ── GAS LABELS ──────────────────────────────────────────────────────────
    if(stage==='BLOWING'&&running&&blowPct>5){
      lbl('CO↑',VCXT+vHW(0.5)*0.55,BATH_Y-VH*0.22,'rgba(175,148,45,0.55)',clamp(W*0.010,8,10))
      lbl('CO→CO₂',VCXT+vHW(0.3)*0.45,VT+VH*0.17,'rgba(115,148,58,0.48)',clamp(W*0.009,7,9))
    }

    // ── BLOW PROGRESS (only during BLOWING) ───────────────────────────────
    if(stage==='BLOWING'){
      const BP_X=W*0.795,BP_Y=H*0.04,BP_W=W*0.195,BP_H=14
      ctx.fillStyle='#0d1520'; ctx.fillRect(BP_X,BP_Y,BP_W,BP_H)
      const bpC=blowPct>90?'#f85149':blowPct>70?'#FF8F00':'#1565C0'
      ctx.fillStyle=bpC; ctx.fillRect(BP_X,BP_Y,BP_W*(blowPct/100),BP_H)
      ctx.strokeStyle='#1e3040'; ctx.lineWidth=0.8; ctx.strokeRect(BP_X,BP_Y,BP_W,BP_H)
      lblB(`BLOW ${blowPct.toFixed(1)}%`,BP_X+BP_W/2,BP_Y-4,bpC,clamp(W*0.010,8,11))
    }

    // ── HUD ───────────────────────────────────────────────────────────────
    const HX=W*0.790,HY=H*0.07,HW=W*0.200,RH=33
    ctx.fillStyle='rgba(4,8,18,0.86)'; ctx.fillRect(HX-4,HY,HW+8,RH*14+12)
    ctx.strokeStyle='#1a3050'; ctx.lineWidth=0.8; ctx.strokeRect(HX-4,HY,HW+8,RH*14+12)
    lblB('HEAT MONITOR',HX+HW/2,HY+16,'#3d6a8a',clamp(W*0.015,13,17))
    const hudRows=[
      ['STAGE',         stageNames[stage]||stage,                    stageCol],
      ['BATH TEMP',     `${Math.round(sim.bathTemp)} °C`,            heatColor(sim.bathTemp,1380,1720)],
      ['TARGET TEMP',   `${targetTemp} °C`,                          '#546E7A'],
      ['BATH [C]%',     `${sim.bathC.toFixed(3)} %`,                 '#29B6F6'],
      ['TARGET [C]%',   `${targetC} %`,                              '#546E7A'],
      ['BATH [Si]%',    `${sim.bathSi.toFixed(4)} %`,                '#FFB300'],
      ['BATH [Mn]%',    `${sim.bathMn.toFixed(4)} %`,                '#9b5de5'],
      ['O₂ FLOW',       stage==='BLOWING'?`${o2Flow} Nm³/m`:'--',   '#29B6F6'],
      ['LANCE HT',      stage==='BLOWING'?`${lanceHeight} mm`:'--', '#78909C'],
      ['SLAG THICK',    `${Math.round(sim.slagThick)} mm`,           '#8BC34A'],
      ['BATH LEVEL',    `${(sim.bathLevel*100).toFixed(0)} %`,       '#FF8F00'],
      ['BLOW%',         stage==='BLOWING'?`${blowPct.toFixed(1)} %`:'--','#FF8F00'],
      ['SUBLANCE',      sim.measuredT?`${sim.measuredT}°C / ${sim.measuredC}%`:'STANDBY',sim.measuredT?'#57ab5a':'#37474F'],
      ['HEAT NO',       heatNo,                                       '#546E7A'],
    ]
    hudRows.forEach(([l,v,c],i)=>{
      const ry=HY+18+i*RH
      ctx.fillStyle='#0a1422'; ctx.fillRect(HX,ry,HW,RH-2)
      ctx.strokeStyle='#1a3050'; ctx.lineWidth=0.3; ctx.strokeRect(HX,ry,HW,RH-2)
      ctx.fillStyle='#4d7a9a'; ctx.font=`${clamp(W*0.012,10,13)}px monospace`; ctx.textAlign='left'; ctx.fillText(l,HX+5,ry+12)
      ctx.fillStyle=c; ctx.font=`bold ${clamp(W*0.013,11,15)}px monospace`; ctx.textAlign='right'; ctx.fillText(v.length>16?v.substring(0,14)+'…':v,HX+HW-4,ry+RH-4)
    })

    // ── TOOLTIP ────────────────────────────────────────────────────────────
    const mx=mouseRef.current.x, my=mouseRef.current.y
    let tooltip=null
    // Bath
    if(!tooltip&&my>BATH_Y&&my<VB){
      const yf=clamp((my-VT)/VH,0,1)
      if(mx>VCX-vHW(yf)*0.9&&mx<VCX+vHW(yf)*0.9){
        tooltip={title:'LIQUID STEEL BATH',color:heatColor(sim.bathTemp,1380,1720),lines:[
          {label:'Temperature',value:`${Math.round(sim.bathTemp)} °C`,col:heatColor(sim.bathTemp,1380,1720)},
          {label:'Carbon [C]',value:`${sim.bathC.toFixed(4)} %`,col:'#29B6F6'},
          {label:'Silicon [Si]',value:`${sim.bathSi.toFixed(4)} %`,col:'#FFB300'},
          {label:'Manganese [Mn]',value:`${sim.bathMn.toFixed(4)} %`,col:'#9b5de5'},
          {label:'Main reaction',value:'C + ½O₂ → CO (decarb)',col:'#8BC34A'},
          {label:'CO gas',value:'Stirs bath → post-comb → CO₂',col:'rgba(175,148,45,0.9)'},
          {label:'Weight',value:`~${Math.round(hmWeight+scrapWeight)} t total`,col:'#78909C'},
        ]}
      }
    }
    // Slag
    if(!tooltip&&my>SLAG_Y&&my<BATH_Y){
      const sf2=clamp((SLAG_Y-VT)/VH,0,1)
      if(mx>VCX-vHW(sf2)*0.9&&mx<VCX+vHW(sf2)*0.9){
        tooltip={title:'SLAG LAYER',color:'#8BC34A',lines:[
          {label:'Thickness',value:`${Math.round(sim.slagThick)} mm`,col:'#8BC34A'},
          {label:'Foaming',value:`${(sim.slagFoam*100).toFixed(0)} %`,col:'#7C9060'},
          {label:'Composition',value:'CaO-SiO₂-FeO-MnO-Al₂O₃',col:'rgba(180,200,160,0.9)'},
          {label:'Basicity V',value:`~${(2.5+sim.slagFoam*0.8).toFixed(1)} CaO/SiO₂`,col:'#A5D6A7'},
          {label:'Purpose',value:'Dephosphorisation + desulphurisation',col:'rgba(180,200,160,0.9)'},
        ]}
      }
    }
    // CO gas
    sim.coGas.forEach(p=>{
      if(Math.sqrt((mx-p.x)**2+(my-p.y)**2)<Math.max(p.r*2.5,10)){
        tooltip={title:'CO Gas (Rising)',color:'#B8A040',lines:[
          {label:'Type',value:'Carbon Monoxide CO',col:'#FFD54F'},
          {label:'Origin',value:'C + ½O₂ → CO in impact zone',col:'rgba(180,200,210,0.9)'},
          {label:'Effect',value:'Stirs bath, promotes mixing',col:'#A5D6A7'},
          {label:'Post-combustion',value:'CO + ½O₂ → CO₂ in hood',col:'#8BC34A'},
          {label:'% in off-gas',value:`~${Math.round(62+sim.offGasParticles.length*0.5)} %`,col:'rgba(175,148,45,0.9)'},
        ]}
      }
    })
    // Lance
    if(!tooltip&&stage==='BLOWING'&&mx>LANCE_X-20&&mx<LANCE_X+20&&my>LANCE_TOP&&my<LANCE_DRAWN_BOT){
      tooltip={title:'OXYGEN LANCE',color:'#29B6F6',lines:[
        {label:'Height',value:`${lanceHeight} mm from bath`,col:'#29B6F6'},
        {label:'O₂ flow',value:`${o2Flow} Nm³/min`,col:'#81D4FA'},
        {label:'Tip',value:'Water-cooled copper 4-nozzle',col:'#0288D1'},
        {label:'Jet speed',value:'Supersonic ~Mach 2',col:'rgba(180,200,210,0.9)'},
        {label:'Impact',value:'C+O₂→CO  Si+O₂→SiO₂  Fe+O₂→FeO',col:'#8BC34A'},
      ]}
    }
    // HM ladle
    const hmLDX=sim.ladlePoured?W*0.88:sim.craneX*W
    const hmLDY=sim.ladlePoured?H*0.30:sim.craneY*H
    if(!tooltip&&mx>hmLDX-W*0.05&&mx<hmLDX+W*0.05&&my>hmLDY-H*0.02&&my<hmLDY+H*0.16){
      tooltip={title:'HOT METAL LADLE',color:'#FF7043',lines:[
        {label:'Weight',value:`${(sim.ladleLevel*hmWeight).toFixed(1)} / ${hmWeight} t`,col:'#FF8F00'},
        {label:'Temperature',value:`${hmTemp} °C`,col:'#FF6D00'},
        {label:'Carbon [C]',value:`${hmC} %`,col:'#29B6F6'},
        {label:'Silicon [Si]',value:`${hmSi} %`,col:'#FFB300'},
        {label:'Phosphorus [P]',value:`${hmP} %`,col:'#f85149'},
        {label:'Load cell',value:`${sim.hmLadleWeight.toFixed(0)} kg`,col:'#39c5cf'},
      ]}
    }

    // Draw tooltip
    if(tooltip){
      const TW=clamp(W*0.30,270,390); const lineH=25,pad=16
      const TH=pad*2+30+tooltip.lines.length*lineH+8
      let tx=mx+18, ty=my-TH/2
      if(tx+TW>W-10)tx=mx-TW-18; if(ty<32)ty=32; if(ty+TH>H-32)ty=H-TH-32
      ctx.shadowColor='rgba(0,0,0,0.65)'; ctx.shadowBlur=14
      ctx.fillStyle='rgba(5,12,25,0.95)'; ctx.strokeStyle=tooltip.color; ctx.lineWidth=1.5
      const r6=6
      ctx.beginPath(); ctx.moveTo(tx+r6,ty); ctx.lineTo(tx+TW-r6,ty); ctx.arcTo(tx+TW,ty,tx+TW,ty+r6,r6)
      ctx.lineTo(tx+TW,ty+TH-r6); ctx.arcTo(tx+TW,ty+TH,tx+TW-r6,ty+TH,r6)
      ctx.lineTo(tx+r6,ty+TH); ctx.arcTo(tx,ty+TH,tx,ty+TH-r6,r6)
      ctx.lineTo(tx,ty+r6); ctx.arcTo(tx,ty,tx+r6,ty,r6)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.shadowBlur=0
      ctx.fillStyle=tooltip.color+'28'; ctx.fillRect(tx+1,ty+1,TW-2,32)
      ctx.fillStyle=tooltip.color; ctx.font=`bold ${clamp(W*0.014,12,16)}px monospace`; ctx.textAlign='left'
      ctx.fillText(tooltip.title,tx+pad,ty+21)
      ctx.strokeStyle=tooltip.color+'45'; ctx.lineWidth=0.8
      ctx.beginPath(); ctx.moveTo(tx+pad,ty+36); ctx.lineTo(tx+TW-pad,ty+36); ctx.stroke()
      tooltip.lines.forEach((line,li)=>{
        const ly2=ty+54+li*lineH
        ctx.fillStyle='rgba(170,195,215,0.90)'; ctx.font=`${clamp(W*0.012,10,13)}px monospace`; ctx.textAlign='left'; ctx.fillText(line.label+':',tx+pad,ly2)
        ctx.fillStyle=line.col; ctx.font=`bold ${clamp(W*0.012,10,13)}px monospace`; ctx.textAlign='right'
        ctx.fillText(line.value.length>30?line.value.substring(0,28)+'…':line.value,tx+TW-pad,ly2)
      })
      ctx.fillStyle=tooltip.color; ctx.beginPath(); ctx.arc(mx,my,4,0,Math.PI*2); ctx.fill()
      ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1; ctx.stroke()
    }

    // Footer
    ctx.fillStyle='rgba(4,8,18,0.92)'; ctx.fillRect(0,H-18,W,18)
    ctx.fillStyle='#2c4055'; ctx.font=`${clamp(W*0.009,7,10)}px monospace`; ctx.textAlign='left'
    ctx.fillText(`BOF STEELMAKING  |  ${heatNo}  |  HM:${hmWeight}t  SCRAP:${scrapWeight}t  |  STAGE:${stage}  |  ${new Date().toLocaleTimeString()}`,8,H-4)

    }catch(e){
      ctx.fillStyle='#06090f'; ctx.fillRect(0,0,W,H)
      ctx.fillStyle='#e5534b'; ctx.font='14px monospace'; ctx.textAlign='left'
      ctx.fillText('ERROR: '+e.message,20,40); console.error('BOFCanvas:',e)
    }
    rafRef.current=requestAnimationFrame(draw)
  },[stage,blowPct,running,hmWeight,hmTemp,hmC,hmSi,hmMn,hmP,scrapWeight,fluxWeight,faWeight,targetTemp,targetC,lanceHeight,o2Flow,heatNo])

  useEffect(()=>{rafRef.current=requestAnimationFrame(draw);return()=>cancelAnimationFrame(rafRef.current)},[draw])
  return <canvas ref={canvasRef} style={{width:'100%',height:'100%',display:'block'}}/>
}

// ─── UI ──────────────────────────────────────────────────────────────────────
const C={bg:'#07090f',panel:'#0b1220',border:'#1a2d45',text:'#cdd9e5',muted:'#6e8098',accent:'#FF8F00',success:'#57ab5a',danger:'#e5534b',cyan:'#39c5cf'}
function Slider({label,value,onChange,min,max,step=1,unit,disabled,color}){
  return(<div style={{marginBottom:10}}>
    <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span style={{fontSize:10,color:C.muted,textTransform:'uppercase',letterSpacing:'0.07em'}}>{label}</span><span style={{fontSize:11,color:color||C.accent,fontFamily:'monospace',fontWeight:700}}>{value}{unit}</span></div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)} disabled={disabled} style={{width:'100%',accentColor:color||C.accent,opacity:disabled?0.4:1,cursor:disabled?'not-allowed':'pointer',height:20}}/>
  </div>)
}

export default function BOFRealTimeTDModel(){
  const [stage,setStage]             = useState('SCRAP_CHARGE')
  const [blowPct,setBlowPct]         = useState(0)
  const [running,setRunning]         = useState(false)
  const [hmWeight,setHmWeight]       = useState(280)
  const [hmTemp,setHmTemp]           = useState(1345)
  const [hmC,setHmC]                 = useState(4.5)
  const [hmSi,setHmSi]               = useState(0.55)
  const [hmMn,setHmMn]               = useState(0.35)
  const [hmP,setHmP]                 = useState(0.12)
  const [scrapWeight,setScrapWeight] = useState(45)
  const [fluxWeight,setFluxWeight]   = useState(4.5)
  const [faWeight,setFaWeight]       = useState(1.2)
  const [targetTemp,setTargetTemp]   = useState(1680)
  const [targetC,setTargetC]         = useState(0.06)
  const [lanceHeight,setLanceHeight] = useState(2200)
  const [o2Flow,setO2Flow]           = useState(520)
  const [blowSpeed,setBlowSpeed]     = useState(1)
  const [panelOpen,setPanelOpen]     = useState(true)
  const [currentTemp,setCurrentTemp] = useState(1265)
  const [currentC,setCurrentC]       = useState('4.500')
  const [ladleWt,setLadleWt]         = useState(hmWeight*1000)
  const [elapsed,setElapsed]         = useState(0)
  const [resetCount,setResetCount]   = useState(0)
  const [heatNo]                     = useState(`BOF-${Math.floor(Math.random()*9000+1000)}`)
  const blowRef=useRef(null), timerRef=useRef(null)

  const nextStage=useCallback(()=>{
    setStage(s=>{
      const idx=STAGES.indexOf(s)
      if(idx<STAGES.length-1) return STAGES[idx+1]
      return s
    })
  },[])

  useEffect(()=>{
    if(stage==='BLOWING'&&running){
      blowRef.current=setInterval(()=>setBlowPct(v=>{if(v>=100){setRunning(false);nextStage();return 100}return Math.min(100,v+blowSpeed*0.00926)}),100)
      // 0.00926 %/100ms = 0.0926%/s = 18 min at blowSpeed=1
      timerRef.current=setInterval(()=>setElapsed(t=>t+1),1000)
    } else {clearInterval(blowRef.current);clearInterval(timerRef.current)}
    return()=>{clearInterval(blowRef.current);clearInterval(timerRef.current)}
  },[stage,running,blowSpeed,nextStage])

  const startHeat=()=>{setStage('SCRAP_CHARGE');setBlowPct(0);setElapsed(0);setResetCount(c=>c+1);setRunning(true)}
  const startBlow=()=>{setRunning(true)}
  const stopBlow=()=>setRunning(false)
  const fmt=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`
  const stageIdx=STAGES.indexOf(stage)

  return(
    <div style={{height:'100dvh',background:C.bg,color:C.text,fontFamily:'monospace',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{background:'#060a10',borderBottom:`1px solid ${C.border}`,padding:'0 12px',height:48,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:20}}>🔥</span>
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'0.04em'}}>BOF STEELMAKING — REAL-TIME TD MODEL</div>
            <div style={{fontSize:8,color:C.muted,letterSpacing:'0.1em'}}>FULL HEAT SEQUENCE: CHARGE → BLOW → SUBLANCE → TAP</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {[{l:'TIME',v:fmt(elapsed),c:running?C.success:C.muted},{l:'TEMP',v:`${currentTemp}°C`,c:C.accent},{l:'[C]%',v:`${currentC}%`,c:'#29B6F6'},{l:'BLOW',v:`${blowPct.toFixed(0)}%`,c:'#FF8F00'},{l:'HEAT',v:heatNo,c:C.muted}].map(item=>(
            <div key={item.l} style={{textAlign:'center'}}>
              <div style={{fontSize:7,color:C.muted}}>{item.l}</div>
              <div style={{fontSize:12,fontWeight:700,color:item.c}}>{item.v}</div>
            </div>
          ))}
          <button onClick={()=>setPanelOpen(v=>!v)} style={{padding:'4px 8px',borderRadius:3,border:`1px solid ${C.border}`,background:'transparent',color:C.muted,fontSize:11,cursor:'pointer'}}>{panelOpen?'◀':'▶'}</button>
          <button onClick={startHeat} style={{padding:'6px 12px',borderRadius:4,border:`1px solid ${C.success}`,background:'rgba(87,171,90,0.15)',color:C.success,fontSize:11,fontWeight:700,cursor:'pointer'}}>↺ NEW HEAT</button>
          {stage==='BLOWING'&&!running&&blowPct<100&&<button onClick={startBlow} style={{padding:'6px 12px',borderRadius:4,border:`1px solid ${C.accent}`,background:'rgba(255,143,0,0.15)',color:C.accent,fontSize:11,fontWeight:700,cursor:'pointer'}}>▶ BLOW</button>}
          {stage==='BLOWING'&&running&&<button onClick={stopBlow} style={{padding:'6px 12px',borderRadius:4,border:`1px solid ${C.danger}`,background:'rgba(229,83,73,0.15)',color:C.danger,fontSize:11,fontWeight:700,cursor:'pointer'}}>⏹ HOLD</button>}
          {stage!=='BLOWING'&&stage!=='COMPLETE'&&<button onClick={nextStage} style={{padding:'6px 12px',borderRadius:4,border:`1px solid ${C.cyan}`,background:'rgba(57,197,207,0.15)',color:C.cyan,fontSize:11,fontWeight:700,cursor:'pointer'}}>NEXT ▶</button>}
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {panelOpen&&(
          <div style={{width:220,background:C.panel,borderRight:`1px solid ${C.border}`,overflow:'auto',flexShrink:0,padding:'12px'}}>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:8}}>HOT METAL</div>
            <Slider label="HM Weight" value={hmWeight} onChange={setHmWeight} min={150} max={380} unit="t" disabled={stageIdx>1} color='#FF7043'/>
            <Slider label="HM Temp"   value={hmTemp}   onChange={setHmTemp}   min={1280} max={1420} unit="°C" disabled={stageIdx>1} color='#FF6D00'/>
            <Slider label="[C]%"      value={hmC}      onChange={setHmC}      min={3.5} max={5.0} step={0.05} unit="%" disabled={stageIdx>1} color='#29B6F6'/>
            <Slider label="[Si]%"     value={hmSi}     onChange={setHmSi}     min={0.10} max={1.50} step={0.05} unit="%" disabled={stageIdx>1} color='#FFB300'/>
            <Slider label="[Mn]%"     value={hmMn}     onChange={setHmMn}     min={0.10} max={1.0} step={0.05} unit="%" disabled={stageIdx>1} color='#9b5de5'/>
            <Slider label="[P]%"      value={hmP}      onChange={setHmP}      min={0.05} max={0.35} step={0.01} unit="%" disabled={stageIdx>1} color='#f85149'/>
            <div style={{height:1,background:C.border,margin:'8px 0'}}/>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:8}}>CHARGE</div>
            <Slider label="Scrap Wt"  value={scrapWeight}  onChange={setScrapWeight}  min={10} max={120} unit="t" disabled={stageIdx>0} color='#546E7A'/>
            <Slider label="Flux Wt"   value={fluxWeight}   onChange={setFluxWeight}   min={1} max={12} step={0.5} unit="t" disabled={stageIdx>1} color='#A5D6A7'/>
            <Slider label="FA Wt"     value={faWeight}     onChange={setFaWeight}     min={0.2} max={4} step={0.1} unit="t" disabled={stageIdx>5} color='#FFB300'/>
            <div style={{height:1,background:C.border,margin:'8px 0'}}/>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:8}}>TARGETS</div>
            <Slider label="Target Temp" value={targetTemp} onChange={setTargetTemp} min={1600} max={1750} unit="°C" disabled={stageIdx>4} color='#57ab5a'/>
            <Slider label="Target [C]%" value={targetC}    onChange={setTargetC}    min={0.02} max={0.50} step={0.01} unit="%" disabled={stageIdx>4} color='#57ab5a'/>
            <div style={{height:1,background:C.border,margin:'8px 0'}}/>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:8}}>BLOW CONTROL</div>
            <Slider label="Lance Height" value={lanceHeight} onChange={setLanceHeight} min={1400} max={3000} step={50} unit="mm" color='#29B6F6'/>
            <Slider label="O₂ Flow"      value={o2Flow}      onChange={setO2Flow}      min={300} max={650} unit=" Nm³/m" color='#81D4FA'/>
            <Slider label="Blow Speed"   value={blowSpeed}   onChange={setBlowSpeed}   min={0.5} max={4.0} step={0.1} unit="x" color='#FF8F00'/>
            <div style={{height:1,background:C.border,margin:'8px 0'}}/>
            <div style={{fontSize:9,color:C.muted,marginBottom:6}}>SEQUENCE</div>
            {STAGES.map((s,i)=>(
              <div key={s} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:s===stage?'#FF8F00':i<stageIdx?C.success:'#1a2535',flexShrink:0,boxShadow:s===stage?'0 0 5px #FF8F00':'none'}}/>
                <span style={{fontSize:8,color:s===stage?'#FF8F00':i<stageIdx?C.success:C.muted}}>{s.replace(/_/g,' ')}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{flex:1,overflow:'hidden',background:'#06090f'}}>
          <BOFCanvas
            stage={stage} blowPct={blowPct} running={running}
            hmWeight={hmWeight} hmTemp={hmTemp} hmC={hmC} hmSi={hmSi} hmMn={hmMn} hmP={hmP}
            scrapWeight={scrapWeight} fluxWeight={fluxWeight} faWeight={faWeight}
            targetTemp={targetTemp} targetC={targetC} lanceHeight={lanceHeight} o2Flow={o2Flow} heatNo={heatNo}
            ladleWeightKg={ladleWt} setLadleWeightKg={setLadleWt}
            setCurrentTemp={setCurrentTemp} setCurrentC={setCurrentC} setMoldLevel={()=>{}}
            onStageComplete={nextStage} doReset={resetCount}
          />
        </div>
      </div>
    </div>
  )
}
