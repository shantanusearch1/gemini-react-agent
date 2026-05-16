import { useState, useEffect, useRef, useCallback } from 'react'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function heatColor(temp, min = 1500, max = 1700) {
  const t = clamp((temp - min) / (max - min), 0, 1)
  if (t > 0.85) return `rgba(255,255,${Math.round((1-t)*6*255)},0.97)`
  if (t > 0.70) return `rgba(255,${Math.round(100+t*155)},0,0.95)`
  if (t > 0.50) return `rgba(255,${Math.round(50+t*80)},0,0.92)`
  if (t > 0.25) return `rgba(${Math.round(210+t*45)},${Math.round(28+t*30)},0,0.88)`
  return `rgba(${Math.round(150+t*60)},${Math.round(20+t*10)},0,0.82)`
}

// ─── PER-LADLE STATE ──────────────────────────────────────────────────────────
function initLadle(idx) {
  return {
    id: idx,
    // Steel
    steelTemp: 1590 + idx*5, targetTemp: 1650,
    steelWeight: 130 + idx*5,
    C: 0.08, Mn: 0.85, Si: 0.25, S: 0.018, P: 0.015,
    // Slag
    slagThick: 80, slagFoam: 0.2,
    // Power
    arcOn: false, arcV: 0, arcA: 0, arcPhase: 0, heatRate: 0,
    // Electrodes — 3 graphite rods, each with individual Y position (raised=0, lowered=1)
    // During arcing: electrodes move up/down to regulate arc length (voltage control)
    electrodeY: [0.2, 0.2, 0.2],   // 0=fully raised, 1=fully lowered into bath
    electrodeVel: [0, 0, 0],         // velocity (positive=down, negative=up)
    arcLength: [0, 0, 0],            // current arc length in mm per electrode
    // Bottom porous plugs (2 per ladle)
    plug1On: false, plug1Flow: 0, plug1Bubbles: [],
    plug2On: false, plug2Flow: 0, plug2Bubbles: [],
    // Argon stirring (combined from plugs)
    arStirOn: false, arFlow: 0, arBubbles: [],
    // Alloy addition
    alloyFalling: false, alloyParticles: [], alloyTimer: 0,
    // Wire injection
    wireOn: false, wireY: 0, wireParticles: [],
    // Top lance (injection lance for powder / O2)
    topLanceOn: false, topLanceY: 0, topLanceParticles: [],
    // Temperature / Sampling probe
    probeOn: false, probeY: 0, probeDone: false,
    measuredTemp: null, sampleTaken: false,
    probeFrames: 0,
    // Desulph
    desulphPct: 0,
    // Treatment time
    treatTime: 0,
    // Ladle state
    status: 'WAITING',   // WAITING / HEATING / ALLOYING / ARGON_STIR / COMPLETE
    // Particles
    arcSparks: [], slagSplash: [], steamPuffs: [],
    // Slag analysis
    slagBasicity: 3.2 + Math.random()*0.4,
    // Power params
    powerKW: 0, energyKWh: 0,
  }
}

// ─── CANVAS ───────────────────────────────────────────────────────────────────
function LFCanvas({
  running, ladles, setLadles,
  transformerMVA, voltageStep, arFlowSet,
  onHeatComplete, doReset,
}) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const mouseRef  = useRef({ x:-999, y:-999 })
  const S = useRef({
    t:0, frame:0,
    craneX: 0.5, craneMoving: false,
    busBars: { energized: false },
    transformerHum: 0,
    totalEnergy: 0,
  })

  useEffect(()=>{
    const el=canvasRef.current; if(!el) return
    const fit=()=>{
      const w=el.parentElement?el.parentElement.clientWidth:window.innerWidth
      const h=el.parentElement?el.parentElement.clientHeight:window.innerHeight
      if(w>0&&h>0){el.width=w;el.height=h}
    }
    fit();const t1=setTimeout(fit,100),t2=setTimeout(fit,400)
    window.addEventListener('resize',fit)
    const onMove=(e)=>{const r=el.getBoundingClientRect();mouseRef.current={x:(e.clientX-r.left)*(el.width/r.width),y:(e.clientY-r.top)*(el.height/r.height)}}
    const onLeave=()=>{mouseRef.current={x:-999,y:-999}}
    el.addEventListener('mousemove',onMove);el.addEventListener('mouseleave',onLeave)
    el.addEventListener('touchmove',(e)=>{e.preventDefault();const tb=e.touches[0],r=el.getBoundingClientRect();mouseRef.current={x:(tb.clientX-r.left)*(el.width/r.width),y:(tb.clientY-r.top)*(el.height/r.height)}},{passive:false})
    el.addEventListener('touchend',onLeave)
    return()=>{clearTimeout(t1);clearTimeout(t2);window.removeEventListener('resize',fit);el.removeEventListener('mousemove',onMove);el.removeEventListener('mouseleave',onLeave)}
  },[])

  useEffect(()=>{
    if(!doReset) return
    setLadles([initLadle(0),initLadle(1)])
    const sim=S.current
    Object.assign(sim,{t:0,frame:0,craneX:0.5,totalEnergy:0})
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
    // ── LAYOUT ───────────────────────────────────────────────────────────
    const LF_W    = W*0.28   // each ladle furnace width
    const LF_GAP  = W*0.10   // gap between the two
    const LF1_CX  = W*0.23   // LF1 centre
    const LF2_CX  = W*0.72   // LF2 centre

    // Ladle dimensions
    const LAD_W   = W*0.20   // ladle outer width
    const LAD_H   = H*0.38   // ladle height
    const LAD_Y0  = H*0.48   // ladle top
    const LAD_Y1  = LAD_Y0+LAD_H

    // Roof/electrode dimensions
    const ROOF_Y  = LAD_Y0-H*0.03
    const ELEC_TOP= H*0.06   // electrode top (raised)
    const ELEC_W  = W*0.010

    // Lining thickness (shared constant used in ladle draw + tooltips)
    const LIN = clamp(W*0.014, 10, 18)

    // Transformer room
    const TRANS_X = W*0.46
    const TRANS_Y = H*0.25
    const TRANS_W = W*0.08
    const TRANS_H = H*0.28

    // ── PHYSICS ──────────────────────────────────────────────────────────
    if(running){
      setLadles(prev=>prev.map((ld,idx)=>{
        if(ld.status==='COMPLETE') return ld
        const lc={...ld}
        lc.treatTime += 0.016

        const CX = idx===0 ? LF1_CX : LF2_CX

        // Arc heating
        if(lc.arcOn){
          const voltage=180+voltageStep*15
          const current=transformerMVA*1000/Math.sqrt(3)/voltage*1000
          lc.arcV=voltage; lc.arcA=Math.round(current)
          lc.powerKW=Math.round(transformerMVA*1000*0.92)
          lc.heatRate=clamp(lc.powerKW*0.92/lc.steelWeight/4.18, 3, 12)
          lc.steelTemp=clamp(lc.steelTemp+lc.heatRate*0.016, 1560, 1720)
          lc.energyKWh+=lc.powerKW*0.016/3600
          lc.arcPhase=(lc.arcPhase+0.35)%(Math.PI*2)

          // ── ELECTRODE REGULATION (0=raised, 0.72-0.82=operating) ─────────
          // Electrodes lower into vessel when arc starts, then regulate arc length
          const targetFrac = 0.72 + voltageStep*0.008  // target lowered fraction
          lc.electrodeY = lc.electrodeY.map((ey,ei)=>{
            // Move toward target position + small regulation oscillation
            const regulation = 0.015*Math.sin(sim.t*5+ei*2.1+(Math.random()-0.5)*0.3)
            const vel = (targetFrac+regulation - ey)*0.04
            lc.electrodeVel[ei] = vel
            // Arc length in mm: proportional to gap (display only)
            const gapFrac = 1 - ey/targetFrac
            lc.arcLength[ei] = Math.round(120 + voltageStep*8 + gapFrac*30 + Math.random()*15)
            return clamp(ey + vel, 0.05, 0.88)
          })

          // Arc sparks from all 3 electrode tips
          if(sim.frame%2===0){
            ;[-1,0,1].forEach(i=>{
              const ex=CX+i*LAD_W*0.22
              const slagSurfY = LAD_Y0+H*0.060
              const roofInner2= ROOF_Y+H*0.008
              const elecFrac2 = clamp(lc.electrodeY[i+1]||0.70, 0, 1)
              const elecTipY  = roofInner2+(slagSurfY-roofInner2)*elecFrac2*0.85
              const arcGapY   = elecTipY + (slagSurfY-elecTipY)*0.5
              for(let k=0;k<5;k++) lc.arcSparks.push({
                x:ex+(Math.random()-0.5)*20, y:arcGapY+(Math.random()-0.5)*12,
                vx:(Math.random()-0.5)*9, vy:-Math.random()*6-0.5,
                life:1, r:0.8+Math.random()*2.5,
                col:Math.random()>0.35?'rgba(255,255,130,0.92)':'rgba(80,160,255,0.88)'
              })
            })
          }
          // Slag foaming from arc stirring
          lc.slagFoam=clamp(lc.slagFoam+0.002, 0, 0.88)
          if(sim.frame%5===0&&lc.slagFoam>0.3){
            ;[-1,1].forEach(side=>{
              lc.slagSplash.push({x:CX+side*(LAD_W*0.32+Math.random()*LAD_W*0.14),y:LAD_Y0+H*0.025,vx:side*(1.5+Math.random()*3),vy:-2.5-Math.random()*3.5,life:1,r:2+Math.random()*3.5,col:heatColor(lc.steelTemp-30,1500,1700)})
            })
          }
        } else {
          lc.powerKW=0; lc.heatRate=0
          // Electrodes rise up toward 0.05 when power off
          lc.electrodeY=lc.electrodeY.map(ey=>Math.max(0.05, ey-0.018))
          lc.electrodeVel=[0,0,0]
          lc.arcLength=[0,0,0]
          lc.slagFoam=Math.max(0.05,lc.slagFoam-0.001)
          lc.arcPhase=0
        }

        // ── BOTTOM POROUS PLUG ARGON (2 plugs per ladle) ────────────────────
        // Plug 1 (left side) and Plug 2 (right side)
        lc.arFlow = (lc.plug1On?lc.plug1Flow:0) + (lc.plug2On?lc.plug2Flow:0)

        if(lc.plug1On){
          // Plug 1 at left — bubble plume rises on left side
          if(sim.frame%2===0){
            const plumeW = clamp(lc.plug1Flow/60, 0.5, 2.5)
            for(let k=0;k<4;k++) lc.plug1Bubbles.push({
              x: CX-LAD_W*0.28+(Math.random()-0.5)*LAD_W*0.06,
              y: LAD_Y1 - H*0.025,  // near bottom of ladle
              vx: (Math.random()-0.5)*plumeW,
              vy: -(1.4+Math.random()*3.8)*(lc.plug1Flow/160),
              life:1, r:3+Math.random()*5,
              col:`rgba(80,200,255,${0.65+Math.random()*0.30})`
            })
          }
          // Argon stirs steel — slight temperature homogenisation
          lc.steelTemp=clamp(lc.steelTemp+(1540+lc.steelTemp>1620?-0.001:0.001),1540,1720)
        }
        if(lc.plug2On){
          // Plug 2 at right
          if(sim.frame%2===0){
            const plumeW2=clamp(lc.plug2Flow/60,0.5,2.5)
            for(let k=0;k<4;k++) lc.plug2Bubbles.push({
              x: CX+LAD_W*0.28+(Math.random()-0.5)*LAD_W*0.06,
              y: LAD_Y1 - H*0.025,  // near bottom of ladle
              vx: (Math.random()-0.5)*plumeW2,
              vy: -(1.4+Math.random()*3.8)*(lc.plug2Flow/160),
              life:1, r:3+Math.random()*5,
              col:`rgba(100,215,255,${0.65+Math.random()*0.30})`
            })
          }
        }
        // Combined arBubbles for compat
        lc.arStirOn = lc.plug1On||lc.plug2On

        // Alloy addition
        if(lc.alloyFalling){
          lc.alloyTimer+=0.016
          if(sim.frame%3===0){
            lc.alloyParticles.push({x:CX+(Math.random()-0.5)*LAD_W*0.3,y:ROOF_Y+5,vy:4+Math.random()*5,life:1,r:2+Math.random()*3,col:Math.random()>0.5?'rgba(200,160,60,0.82)':'rgba(180,140,50,0.75)'})
          }
          if(lc.alloyTimer>4){
            lc.alloyFalling=false; lc.alloyTimer=0
            lc.Mn=clamp(lc.Mn+0.08,0,2.0)
            lc.Si=clamp(lc.Si+0.04,0,0.60)
          }
        }

        // Wire injection (Ca wire for desulph)
        if(lc.wireOn){
          lc.wireY=Math.min(H*0.38,lc.wireY+3.5)
          if(sim.frame%4===0){
            lc.wireParticles.push({x:CX-LAD_W*0.22,y:ROOF_Y+lc.wireY*0.4,vy:1.5+Math.random()*2,life:1,r:1.5+Math.random()*2,col:'rgba(220,200,80,0.72)'})
          }
          if(lc.wireY>=H*0.36){
            lc.wireOn=false; lc.wireY=0
            lc.S=clamp(lc.S-0.004,0.001,0.030)
            lc.desulphPct=clamp(lc.desulphPct+18,0,85)
          }
        }

        // ── TOP LANCE (powder injection / bottom stirring supplement) ──────
        if(lc.topLanceOn){
          // Lance descends from above roof into ladle, tip reaches ~mid-bath
          // lanceY: 0=at machine, 1=fully inside ladle (tip at LAD_Y0+H*0.30)
          lc.topLanceY=Math.min(1.0, lc.topLanceY+0.008)
          // Once fully in, emit powder particles at tip
          const lanceTipY = ROOF_Y + (LAD_Y0+H*0.28 - ROOF_Y)*lc.topLanceY
          const lanceBodyX = CX + LAD_W*0.30   // right side of ladle
          if(lc.topLanceY>0.7&&sim.frame%3===0){
            lc.topLanceParticles.push({
              x:lanceBodyX+(Math.random()-0.5)*LAD_W*0.12,
              y:lanceTipY,
              vx:(Math.random()-0.5)*2.5,
              vy:-1.5-Math.random()*2.5,  // powder rises from tip
              life:1, r:2+Math.random()*3,
              col:Math.random()>0.5?'rgba(200,180,80,0.82)':'rgba(180,160,60,0.72)'
            })
          }
          if(lc.topLanceY>=1.0){
            // Hold for a moment then retract
            lc.topLanceTimer=(lc.topLanceTimer||0)+1
            if(lc.topLanceTimer>80){
              // Retract
              lc.topLanceY=Math.max(0, lc.topLanceY-0.015)
              if(lc.topLanceY<=0){
                lc.topLanceOn=false; lc.topLanceY=0; lc.topLanceTimer=0
                lc.S=clamp(lc.S-0.002,0.001,0.030)
              }
            }
          }
        } else {
          lc.topLanceY=0; lc.topLanceTimer=0
        }

        // ── TEMPERATURE + SAMPLING PROBE ────────────────────────────────
        if(lc.probeOn){
          if(!lc.probeDone){
            // Probe descends: 0=above ladle, 1=tip at bath surface
            lc.probeY=Math.min(1.0, lc.probeY+0.012)
            // Tip reaches steel at ~80% travel
            if(lc.probeY>=0.80&&!lc.probeDone){
              lc.probeDone=true
              lc.measuredTemp=Math.round(lc.steelTemp-2+(Math.random()-0.5)*5)
              lc.sampleTaken=true
            }
          }
          lc.probeFrames=(lc.probeFrames||0)+1
          // Hold 3 seconds then retract
          if(lc.probeFrames>120){
            lc.probeY=Math.max(0, lc.probeY-0.020)
            if(lc.probeY<=0){
              lc.probeOn=false; lc.probeY=0; lc.probeFrames=0
            }
          }
        }

        // Temperature check for status
        if(lc.steelTemp>=lc.targetTemp-2&&lc.arcOn){
          lc.arcOn=false
          lc.status='ARGON_STIR'
        }

        // Advance particles
        lc.arcSparks       =lc.arcSparks.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.25,life:p.life-0.055}))
        lc.slagSplash      =lc.slagSplash.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.18,life:p.life-0.04}))
        lc.arBubbles       =lc.arBubbles.filter(p=>p.life>0&&p.y>LAD_Y0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.012}))
        lc.plug1Bubbles    =(lc.plug1Bubbles||[]).filter(p=>p.life>0&&p.y>LAD_Y0+H*0.03).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.008,r:p.r+0.06}))
        lc.plug2Bubbles    =(lc.plug2Bubbles||[]).filter(p=>p.life>0&&p.y>LAD_Y0+H*0.03).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.008,r:p.r+0.06}))
        lc.alloyParticles  =lc.alloyParticles.filter(p=>p.life>0&&p.y<LAD_Y0+H*0.3).map(p=>({...p,y:p.y+p.vy,life:p.life-0.018}))
        lc.wireParticles   =lc.wireParticles.filter(p=>p.life>0&&p.y<LAD_Y1).map(p=>({...p,y:p.y+p.vy,life:p.life-0.022}))
        lc.topLanceParticles=(lc.topLanceParticles||[]).filter(p=>p.life>0&&p.y<LAD_Y0+H*0.25).map(p=>({...p,y:p.y+p.vy,life:p.life-0.020}))

        return lc
      }))
    }

    // ── DRAW ─────────────────────────────────────────────────────────────
    ctx.fillStyle='#06090f'; ctx.fillRect(0,0,W,H)
    ctx.strokeStyle='rgba(255,255,255,0.015)'; ctx.lineWidth=0.5
    for(let gx=0;gx<W;gx+=36){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke()}
    for(let gy=0;gy<H;gy+=36){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke()}

    const lbl=(t,x,y,c='#78909C',sz=9,al='center')=>{ctx.fillStyle=c;ctx.font=`${sz}px monospace`;ctx.textAlign=al;ctx.fillText(t,x,y)}
    const lblB=(t,x,y,c='#78909C',sz=9,al='center')=>{ctx.fillStyle=c;ctx.font=`bold ${sz}px monospace`;ctx.textAlign=al;ctx.fillText(t,x,y)}

    // ── TRANSFORMER (centre) ──────────────────────────────────────────────
    const anyArc=ladles.some(l=>l.arcOn)
    ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
    ctx.fillRect(TRANS_X,TRANS_Y,TRANS_W,TRANS_H); ctx.strokeRect(TRANS_X,TRANS_Y,TRANS_W,TRANS_H)
    // Transformer windings
    for(let ty2=TRANS_Y+10;ty2<TRANS_Y+TRANS_H-10;ty2+=12){
      ctx.strokeStyle=anyArc?`rgba(255,${Math.round(140+80*Math.sin(sim.t*8+ty2*0.1))},0,0.35)`:'#1e3040'; ctx.lineWidth=2
      ctx.beginPath(); ctx.moveTo(TRANS_X+6,ty2); ctx.lineTo(TRANS_X+TRANS_W-6,ty2); ctx.stroke()
    }
    // Transformer label
    lblB('TRANSFORMER',TRANS_X+TRANS_W/2,TRANS_Y-10,'#3d6a8a',clamp(W*0.010,8,11))
    lbl(`${transformerMVA} MVA`,TRANS_X+TRANS_W/2,TRANS_Y+TRANS_H*0.35,anyArc?'#FF8F00':'#546E7A',clamp(W*0.009,7,9))
    lbl(`Step ${voltageStep}`,TRANS_X+TRANS_W/2,TRANS_Y+TRANS_H*0.55,'#78909C',clamp(W*0.009,7,9))
    lbl(anyArc?'ENERGISED':'STANDBY',TRANS_X+TRANS_W/2,TRANS_Y+TRANS_H*0.72,anyArc?'#57ab5a':'#546E7A',clamp(W*0.009,7,9))
    // Transformer hum glow
    if(anyArc){
      const tg=ctx.createRadialGradient(TRANS_X+TRANS_W/2,TRANS_Y+TRANS_H/2,4,TRANS_X+TRANS_W/2,TRANS_Y+TRANS_H/2,TRANS_W*0.8)
      tg.addColorStop(0,`rgba(255,120,0,${0.08+0.06*Math.sin(sim.t*10)})`); tg.addColorStop(1,'rgba(255,80,0,0)')
      ctx.fillStyle=tg; ctx.fillRect(TRANS_X-10,TRANS_Y-10,TRANS_W+20,TRANS_H+20)
    }

    // ── BUS BARS (from transformer to each LF) ────────────────────────────
    ;[[LF1_CX,0],[LF2_CX,1]].forEach(([cx,idx])=>{
      const ld=ladles[idx]
      const barCol=ld&&ld.arcOn?`rgba(255,${Math.round(120+60*Math.sin(sim.t*12))},0,0.62)`:'rgba(40,60,90,0.55)'
      ctx.strokeStyle=barCol; ctx.lineWidth=8
      ctx.beginPath(); ctx.moveTo(TRANS_X+(idx===0?0:TRANS_W),TRANS_Y+TRANS_H*0.35); ctx.lineTo(cx,ELEC_TOP+10); ctx.stroke()
      ctx.strokeStyle='#0d1520'; ctx.lineWidth=1.5; ctx.stroke()
      if(ld&&ld.arcOn) lbl(`${ld.arcV}V`,cx+(idx===0?-W*0.05:W*0.05),TRANS_Y+TRANS_H*0.20,ld.arcOn?'#FF8F00':'#37474F',clamp(W*0.009,7,9))
    })

    // ── OVERHEAD CRANE (spans both LFs) ──────────────────────────────────
    ctx.fillStyle='#1e2d3d'; ctx.fillRect(0,H*0.04,W,H*0.030); ctx.strokeStyle='#2c4055'; ctx.lineWidth=1; ctx.strokeRect(0,H*0.04,W,H*0.030)
    lbl('OVERHEAD CRANE RAIL',W/2,H*0.035,'#1e3040',clamp(W*0.009,7,9))
    // Crane trolley
    const crX=sim.craneX*W
    ctx.fillStyle='#253545'; ctx.strokeStyle='#37474F'; ctx.lineWidth=1
    ctx.fillRect(crX-W*0.07,H*0.04+2,W*0.14,H*0.025); ctx.strokeRect(crX-W*0.07,H*0.04+2,W*0.14,H*0.025)
    ctx.fillStyle='#1a2535'
    ;[crX-W*0.05,crX+W*0.05].forEach(wx=>{ctx.beginPath();ctx.arc(wx,H*0.04+H*0.025,5,0,Math.PI*2);ctx.fill()})
    lbl('CRANE',crX,H*0.04+H*0.010,'#37474F',clamp(W*0.009,7,8))

    // ── DRAW EACH LADLE FURNACE ───────────────────────────────────────────
    ladles.forEach((ld,idx)=>{
      const CX = idx===0 ? LF1_CX : LF2_CX
      const LW = LAD_W

      // ── ELECTRODES (3 graphite rods with realistic arc column) ────────
      const elecXs=[CX-LW*0.22, CX, CX+LW*0.22]
      elecXs.forEach((ex,ei)=>{
        const eyTop  = ELEC_TOP+12
        // Electrode tip: position based on regulated electrodeY
        // Electrode positions:
        // electrodeY[ei] = 0 (raised near roof) → 1 (lowered near bath)
        // eyBot = actual Y of electrode tip (inside ladle, above slag)
        const elecFrac   = ld.electrodeY ? clamp(ld.electrodeY[ei], 0, 1) : 0.70
        const slagSurfY  = LAD_Y0 + H*0.060   // slag/steel surface
        const roofInner  = ROOF_Y + H*0.008    // just below roof inside
        // Tip travels from roofInner (elecFrac=0) down toward slagSurfY (elecFrac=1)
        // Keep 20px gap above slag = *0.85 so tip never touches bath
        const eyBot = roofInner + (slagSurfY - roofInner) * elecFrac * 0.85
        const arcLen = ld.arcLength ? ld.arcLength[ei] : 0

        // Electrode holder arm (horizontal) on mast
        ctx.fillStyle='#263340'; ctx.strokeStyle='#37474F'; ctx.lineWidth=0.8
        ctx.fillRect(ex-LW*0.06,eyTop-6,LW*0.12,10); ctx.strokeRect(ex-LW*0.06,eyTop-6,LW*0.12,10)
        // Cable from arm down to roof level
        ctx.strokeStyle='#1a2535'; ctx.lineWidth=3
        ctx.beginPath(); ctx.moveTo(ex,eyTop+4); ctx.lineTo(ex,ROOF_Y-2); ctx.stroke()

        // Graphite rod — from roof down to electrode tip (inside ladle)
        const rodTop = ROOF_Y - 2
        const rodW   = Math.max(ELEC_W, clamp(W*0.012, 8, 14))
        const eGrd=ctx.createLinearGradient(ex-rodW/2,0,ex+rodW/2,0)
        eGrd.addColorStop(0,'#111'); eGrd.addColorStop(0.4,'#2a2a2a'); eGrd.addColorStop(0.7,'#3a3a3a'); eGrd.addColorStop(1,'#111')
        ctx.fillStyle=eGrd; ctx.fillRect(ex-rodW/2,rodTop,rodW,eyBot-rodTop)
        ctx.strokeStyle='rgba(60,60,60,0.8)'; ctx.lineWidth=0.5; ctx.strokeRect(ex-rodW/2,rodTop,rodW,eyBot-rodTop)
        // Graphite tip (rounded, glowing when arc on)
        if(ld.arcOn){
          ctx.fillStyle='rgba(20,20,20,0.9)'
          ctx.beginPath(); ctx.moveTo(ex-rodW/2,eyBot); ctx.lineTo(ex,eyBot+rodW*0.6); ctx.lineTo(ex+rodW/2,eyBot); ctx.closePath(); ctx.fill()
        }

        // Arc drawn LATER (after roof/bath so it's visible on top)
        // Electrode number
        lbl(`E${ei+1}`,ex,rodTop-4,'rgba(80,100,120,0.55)',clamp(W*0.008,5,7))
      })
      // Arc power label
      if(ld.arcOn){
        lblB(`${ld.powerKW}kW  ${ld.arcV}V  ${ld.arcA}A`,CX,ELEC_TOP-2,'#FF8F00',clamp(W*0.010,8,10))
      }

      // ── ELECTRODE MAST / DELTA FRAME ─────────────────────────────────
      ctx.fillStyle='#1a2d3d'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.2
      // Horizontal mast beam
      ctx.fillRect(CX-LW*0.30,ELEC_TOP+8,LW*0.60,H*0.030); ctx.strokeRect(CX-LW*0.30,ELEC_TOP+8,LW*0.60,H*0.030)
      // Vertical portal columns
      ;[-LW*0.28,LW*0.28].forEach(dx=>{
        ctx.fillRect(CX+dx-6,H*0.04,12,ELEC_TOP+8-H*0.04); ctx.strokeRect(CX+dx-6,H*0.04,12,ELEC_TOP+8-H*0.04)
      })

      // ── LF ROOF / COVER ───────────────────────────────────────────────
      ctx.fillStyle='#1e2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
      ctx.beginPath()
      ctx.moveTo(CX-LW/2,LAD_Y0)
      ctx.lineTo(CX-LW/2-8,ROOF_Y)
      ctx.lineTo(CX+LW/2+8,ROOF_Y)
      ctx.lineTo(CX+LW/2,LAD_Y0)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      // Roof insulation
      ctx.fillStyle='rgba(100,80,40,0.22)'; ctx.fillRect(CX-LW/2-4,ROOF_Y+2,LW+8,LAD_Y0-ROOF_Y-2)
      // Electrode holes in roof
      elecXs.forEach(ex=>{
        ctx.fillStyle='#06090f'
        ctx.beginPath(); ctx.arc(ex,ROOF_Y+(LAD_Y0-ROOF_Y)*0.55,ELEC_W+3,0,Math.PI*2); ctx.fill()
        ctx.strokeStyle='#37474F'; ctx.lineWidth=0.8; ctx.stroke()
      })

      // ── LADLE SHELL ───────────────────────────────────────────────────
      // Outer steel shell
      ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=2
      ctx.beginPath()
      ctx.moveTo(CX-LW/2,LAD_Y0)
      ctx.lineTo(CX-LW/2-6,LAD_Y1)
      ctx.lineTo(CX+LW/2+6,LAD_Y1)
      ctx.lineTo(CX+LW/2,LAD_Y0)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      // Refractory lining (inner) — LIN defined globally above
      ctx.fillStyle='#1e1408'
      ctx.beginPath()
      ctx.moveTo(CX-LW/2+LIN,LAD_Y0+4)
      ctx.lineTo(CX-LW/2+LIN-3,LAD_Y1-LIN)
      ctx.lineTo(CX+LW/2-LIN+3,LAD_Y1-LIN)
      ctx.lineTo(CX+LW/2-LIN,LAD_Y0+4)
      ctx.closePath(); ctx.fill()

      // ── LIQUID STEEL IN LADLE ─────────────────────────────────────────
      const steelTop=LAD_Y0+H*0.04
      const steelH=LAD_H*0.70
      const steelGrd=ctx.createLinearGradient(0,steelTop,0,steelTop+steelH)
      steelGrd.addColorStop(0,heatColor(ld.steelTemp,1500,1720))
      steelGrd.addColorStop(0.4,heatColor(ld.steelTemp-20,1500,1720))
      steelGrd.addColorStop(1,heatColor(ld.steelTemp-60,1500,1720))
      ctx.fillStyle=steelGrd
      ctx.beginPath()
      ctx.moveTo(CX-LW/2+LIN,steelTop)
      ctx.lineTo(CX+LW/2-LIN,steelTop)
      ctx.lineTo(CX+LW/2-LIN-3,steelTop+steelH)
      ctx.lineTo(CX-LW/2+LIN+3,steelTop+steelH)
      ctx.closePath(); ctx.fill()
      // Steel surface shimmer
      if(running){
        const shimmer=0.08+0.06*Math.sin(sim.t*(ld.arStirOn?8:3)+idx)
        ctx.fillStyle=`rgba(255,215,55,${shimmer})`
        ctx.fillRect(CX-LW/2+LIN,steelTop,LW-LIN*2,3)
      }

      // ── SLAG LAYER ────────────────────────────────────────────────────
      const slagH=H*0.04*(1+ld.slagFoam)
      const slagY=steelTop-slagH
      if(slagH>2){
        const slg=ctx.createLinearGradient(0,slagY,0,steelTop)
        slg.addColorStop(0,`rgba(${Math.round(80+ld.slagFoam*35)},${Math.round(88+ld.slagFoam*18)},35,0.85)`)
        slg.addColorStop(1,'rgba(60,74,25,0.72)')
        ctx.fillStyle=slg; ctx.fillRect(CX-LW/2+LIN,slagY,LW-LIN*2,slagH)
        // Slag foam lumps
        if(ld.slagFoam>0.25&&running){
          for(let fx=CX-LW/2+LIN+6;fx<CX+LW/2-LIN-6;fx+=14){
            const lump=3+ld.slagFoam*7+2*Math.sin(sim.t*5+fx*0.22)
            const fg=ctx.createRadialGradient(fx,slagY,0,fx,slagY,lump*1.5)
            fg.addColorStop(0,`rgba(115,110,45,${0.48+ld.slagFoam*0.28})`); fg.addColorStop(1,'rgba(70,84,25,0)')
            ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(fx,slagY,lump*1.5,0,Math.PI*2); ctx.fill()
          }
        }
      }

      // ── POROUS PLUG 1 (left) + PLUG 2 (right) bubbles + indicators ───
      const PLUG1_X = CX - LW*0.28
      const PLUG2_X = CX + LW*0.28
      const PLUG_Y  = LAD_Y1 - LIN + 4
      ;[[PLUG1_X,ld.plug1On,ld.plug1Flow,'1'],[PLUG2_X,ld.plug2On,ld.plug2Flow,'2']].forEach(([px,on,flow,num])=>{
        // Porous plug housing
        ctx.fillStyle=on?'rgba(30,60,100,0.85)':'rgba(20,30,45,0.8)'
        ctx.strokeStyle=on?'#29B6F6':'#1e3040'; ctx.lineWidth=1
        ctx.beginPath(); ctx.ellipse(px,PLUG_Y,LW*0.055,H*0.014,0,0,Math.PI*2); ctx.fill(); ctx.stroke()
        // Plug rings (porous structure)
        ;[LW*0.025,LW*0.040].forEach(r=>{
          ctx.strokeStyle=on?'rgba(41,182,246,0.35)':'rgba(30,50,70,0.4)'; ctx.lineWidth=1
          ctx.beginPath(); ctx.ellipse(px,PLUG_Y,r,H*0.007,0,0,Math.PI*2); ctx.stroke()
        })
        // Argon pipe below plug
        ctx.strokeStyle='#1a2535'; ctx.lineWidth=4
        ctx.beginPath(); ctx.moveTo(px,PLUG_Y+H*0.012); ctx.lineTo(px,H*0.95); ctx.stroke()
        // Flow indicator on pipe
        if(on){
          const fgrd=ctx.createLinearGradient(0,H*0.94,0,PLUG_Y)
          fgrd.addColorStop(0,'rgba(41,182,246,0.6)'); fgrd.addColorStop(1,'rgba(41,182,246,0.15)')
          ctx.strokeStyle=fgrd; ctx.lineWidth=3
          ctx.beginPath(); ctx.moveTo(px,H*0.94); ctx.lineTo(px,PLUG_Y+H*0.012); ctx.stroke()
          // Glow at plug face
          const pg=ctx.createRadialGradient(px,PLUG_Y,1,px,PLUG_Y,LW*0.065)
          pg.addColorStop(0,`rgba(41,182,246,${0.45+0.2*Math.sin(sim.t*6+px)})`); pg.addColorStop(1,'rgba(41,182,246,0)')
          ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(px,PLUG_Y,LW*0.065,0,Math.PI*2); ctx.fill()
        }
        lbl(`P${num} ${on?flow+'l/m':'OFF'}`,px,PLUG_Y+H*0.030,on?'#29B6F6':'#1e3040',clamp(W*0.009,6,8))
      })
      // Bubble plumes (plug 1 + plug 2)
      // Bubble plumes — bright white-blue, clearly visible in steel bath
      ;(ld.plug1Bubbles||[]).forEach(p=>{
        // Outer glow
        ctx.globalAlpha=p.life*0.30; ctx.fillStyle='rgba(150,220,255,0.7)'
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2.5,0,Math.PI*2); ctx.fill()
        // Core bubble
        ctx.globalAlpha=p.life*0.85; ctx.fillStyle=p.col
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
        ctx.globalAlpha=p.life*0.4; ctx.fillStyle='rgba(255,255,255,0.9)'
        ctx.beginPath(); ctx.arc(p.x-p.r*0.3,p.y-p.r*0.3,p.r*0.35,0,Math.PI*2); ctx.fill()
      }); ctx.globalAlpha=1
      ;(ld.plug2Bubbles||[]).forEach(p=>{
        ctx.globalAlpha=p.life*0.30; ctx.fillStyle='rgba(150,220,255,0.7)'
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2.5,0,Math.PI*2); ctx.fill()
        ctx.globalAlpha=p.life*0.85; ctx.fillStyle=p.col
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
        ctx.globalAlpha=p.life*0.4; ctx.fillStyle='rgba(255,255,255,0.9)'
        ctx.beginPath(); ctx.arc(p.x-p.r*0.3,p.y-p.r*0.3,p.r*0.35,0,Math.PI*2); ctx.fill()
      }); ctx.globalAlpha=1
      // Plug 1 surface eye (where bubbles break surface)
      if(ld.plug1On&&running){
        const eyY=LAD_Y0+H*0.06
        const eg1=ctx.createRadialGradient(PLUG1_X,eyY,1,PLUG1_X,eyY,18)
        eg1.addColorStop(0,'rgba(100,200,255,0.45)'); eg1.addColorStop(1,'rgba(100,200,255,0)')
        ctx.fillStyle=eg1; ctx.beginPath(); ctx.arc(PLUG1_X,eyY,18,0,Math.PI*2); ctx.fill()
        lbl('P1',PLUG1_X,eyY-22,'rgba(41,182,246,0.6)',clamp(W*0.009,7,9))
      }
      if(ld.plug2On&&running){
        const eyY=LAD_Y0+H*0.06
        const eg2=ctx.createRadialGradient(PLUG2_X,eyY,1,PLUG2_X,eyY,18)
        eg2.addColorStop(0,'rgba(80,190,255,0.45)'); eg2.addColorStop(1,'rgba(80,190,255,0)')
        ctx.fillStyle=eg2; ctx.beginPath(); ctx.arc(PLUG2_X,eyY,18,0,Math.PI*2); ctx.fill()
        lbl('P2',PLUG2_X,eyY-22,'rgba(79,195,247,0.6)',clamp(W*0.009,7,9))
      }


      // ── ARC COLUMNS — drawn on top of bath/slag, clearly visible ─────
      if(ld.arcOn){
        const elecXsA=[CX-LW*0.22, CX, CX+LW*0.22]
        const slagSurfYA = LAD_Y0 + H*0.060
        const roofInnerA = ROOF_Y + H*0.008
        elecXsA.forEach((exA,eiA)=>{
          const elecFracA = clamp(ld.electrodeY?ld.electrodeY[eiA]:0.70, 0, 1)
          const eyBotA    = roofInnerA + (slagSurfYA-roofInnerA)*elecFracA*0.85
          const arcGapA   = Math.max(slagSurfYA - eyBotA, 12)
          const flashA    = 0.78+0.22*Math.sin(sim.t*22+eiA*2.1+ld.arcPhase)
          const segsA     = Math.ceil(arcGapA/3)
          // OUTER soft blue glow
          ctx.beginPath()
          for(let s=0;s<=segsA;s++){const y=eyBotA+s*(arcGapA/segsA);const sw=(Math.sin(sim.t*18+s*0.5+eiA*1.8)*8+Math.cos(sim.t*14+s*0.7+eiA*2.3)*5)*flashA;s===0?ctx.moveTo(exA+sw,y):ctx.lineTo(exA+sw,y)}
          ctx.strokeStyle=`rgba(60,160,255,${0.40*flashA})`; ctx.lineWidth=20; ctx.stroke()
          // MIDDLE blue-white
          ctx.beginPath()
          for(let s=0;s<=segsA;s++){const y=eyBotA+s*(arcGapA/segsA);const sw=(Math.sin(sim.t*22+s*0.45+eiA*1.6)*5+Math.cos(sim.t*16+s*0.6+eiA*2.0)*3)*flashA;s===0?ctx.moveTo(exA+sw,y):ctx.lineTo(exA+sw,y)}
          ctx.strokeStyle=`rgba(140,215,255,${0.85*flashA})`; ctx.lineWidth=6; ctx.stroke()
          // WHITE CORE
          ctx.beginPath()
          for(let s=0;s<=segsA;s++){const y=eyBotA+s*(arcGapA/segsA);const sw=Math.sin(sim.t*30+s*0.35+eiA*1.4)*2.5*flashA;s===0?ctx.moveTo(exA+sw,y):ctx.lineTo(exA+sw,y)}
          ctx.strokeStyle=`rgba(255,255,255,${0.96*flashA})`; ctx.lineWidth=2.5; ctx.stroke()
          // TIP CORONA (bright white-blue)
          const tgA=ctx.createRadialGradient(exA,eyBotA,0,exA,eyBotA,26)
          tgA.addColorStop(0,`rgba(255,255,255,${0.98*flashA})`); tgA.addColorStop(0.3,`rgba(160,230,255,${0.88*flashA})`); tgA.addColorStop(0.7,`rgba(60,150,255,${0.45*flashA})`); tgA.addColorStop(1,'rgba(0,80,255,0)')
          ctx.fillStyle=tgA; ctx.beginPath(); ctx.arc(exA,eyBotA,26,0,Math.PI*2); ctx.fill()
          // IMPACT GLOW at slag (orange-yellow)
          const igA=ctx.createRadialGradient(exA,slagSurfYA,0,exA,slagSurfYA,42)
          igA.addColorStop(0,`rgba(255,248,130,${0.90*flashA})`); igA.addColorStop(0.35,`rgba(255,155,0,${0.62*flashA})`); igA.addColorStop(0.7,`rgba(255,60,0,${0.28*flashA})`); igA.addColorStop(1,'rgba(255,30,0,0)')
          ctx.fillStyle=igA; ctx.beginPath(); ctx.arc(exA,slagSurfYA,42,0,Math.PI*2); ctx.fill()
          // Arc length mm label
          const arcLenV=ld.arcLength?ld.arcLength[eiA]:150
          lbl(`${arcLenV}mm`,exA+16,eyBotA+(slagSurfYA-eyBotA)*0.5,'rgba(120,200,255,0.85)',clamp(W*0.010,8,10),'left')
        })
      }
      // ── ARC SPARKS ────────────────────────────────────────────────────
      ld.arcSparks.forEach(p=>{
        ctx.globalAlpha=p.life; ctx.fillStyle=p.col
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
        ctx.globalAlpha=p.life*0.22; ctx.fillStyle='rgba(255,200,50,1)'
        ctx.beginPath(); ctx.arc(p.x-p.vx*0.4,p.y-p.vy*0.4,p.r*0.4,0,Math.PI*2); ctx.fill()
      }); ctx.globalAlpha=1

      // ── SLAG SPLASH ───────────────────────────────────────────────────
      ld.slagSplash.forEach(p=>{ctx.globalAlpha=p.life*0.78;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1

      // ── ALLOY HOPPER (top) ────────────────────────────────────────────
      const hopX=CX+LW*0.42, hopY=H*0.08, hopW=W*0.055, hopH=H*0.10
      ctx.fillStyle='#1e2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1
      ctx.beginPath(); ctx.moveTo(hopX,hopY); ctx.lineTo(hopX+hopW,hopY)
      ctx.lineTo(hopX+hopW-5,hopY+hopH); ctx.lineTo(hopX+5,hopY+hopH); ctx.closePath()
      ctx.fill(); ctx.stroke()
      ctx.fillStyle='rgba(190,155,60,0.70)'; ctx.fillRect(hopX+5,hopY+8,hopW-10,hopH-16)
      ctx.fillStyle='#0d1520'; ctx.fillRect(hopX+hopW*0.35,hopY+hopH,hopW*0.3,H*0.03)
      lblB(`FA${idx+1}`,hopX+hopW/2,hopY-5,'#FFB300',clamp(W*0.009,7,9))
      lbl('ALLOY',hopX+hopW/2,hopY+hopH+H*0.04,'#37474F',clamp(W*0.009,6,8))
      // ── FERRO ALLOY FALLING — prominent golden shower into ladle ────
      if(ld.alloyFalling){
        // Draw chute from hopper to ladle mouth
        const chuteX=hopX+hopW/2, chuteY=hopY+hopH
        const chuteEndX=CX+LW*0.15, chuteEndY=ROOF_Y+4
        ctx.strokeStyle='rgba(190,155,60,0.55)'; ctx.lineWidth=5
        ctx.beginPath(); ctx.moveTo(chuteX,chuteY+H*0.03); ctx.lineTo(chuteEndX,chuteEndY); ctx.stroke()
        // Stream label
        lbl('FA →',chuteX+(chuteEndX-chuteX)*0.5,(chuteY+chuteEndY)/2-8,'#FFB300',clamp(W*0.009,7,9))
      }
      ld.alloyParticles.forEach(p=>{
        // Glow around each alloy particle
        ctx.globalAlpha=p.life*0.30; ctx.fillStyle='rgba(255,200,50,0.8)'
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2.2,0,Math.PI*2); ctx.fill()
        // Core particle
        ctx.globalAlpha=p.life*0.90; ctx.fillStyle=p.col
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
        // Highlight
        ctx.globalAlpha=p.life*0.5; ctx.fillStyle='rgba(255,240,150,0.8)'
        ctx.beginPath(); ctx.arc(p.x-p.r*0.3,p.y-p.r*0.3,p.r*0.4,0,Math.PI*2); ctx.fill()
      }); ctx.globalAlpha=1
      // Impact splash in steel when particles hit bath
      if(ld.alloyFalling&&running){
        const splashX=CX+LW*0.1+(Math.random()-0.5)*LW*0.2
        const splashY=LAD_Y0+H*0.06
        const sg=ctx.createRadialGradient(splashX,splashY,0,splashX,splashY,12)
        sg.addColorStop(0,'rgba(255,200,50,0.45)'); sg.addColorStop(1,'rgba(255,150,0,0)')
        ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(splashX,splashY,12,0,Math.PI*2); ctx.fill()
      }

      // ── WIRE INJECTION MACHINE ────────────────────────────────────────
      const wireMX=CX-LW*0.55, wireMY=H*0.14
      ctx.fillStyle='#1e2d3d'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1
      ctx.fillRect(wireMX-W*0.025,wireMY,W*0.05,H*0.06); ctx.strokeRect(wireMX-W*0.025,wireMY,W*0.05,H*0.06)
      // Wire spool
      ctx.fillStyle='#263340'; ctx.beginPath(); ctx.arc(wireMX,wireMY+H*0.022,W*0.014,0,Math.PI*2); ctx.fill()
      ctx.strokeStyle='#37474F'; ctx.lineWidth=0.8; ctx.stroke()
      ctx.fillStyle='rgba(220,200,80,0.55)'; ctx.beginPath(); ctx.arc(wireMX,wireMY+H*0.022,W*0.009,0,Math.PI*2); ctx.fill()
      lblB(`WI${idx+1}`,wireMX,wireMY-5,'#FFD54F',clamp(W*0.009,7,9))
      lbl('Ca WIRE',wireMX,wireMY+H*0.072,'#37474F',clamp(W*0.009,6,8))
      // Wire being injected
      if(ld.wireOn){
        ctx.strokeStyle='rgba(220,200,80,0.75)'; ctx.lineWidth=2.5
        ctx.beginPath(); ctx.moveTo(wireMX,wireMY+H*0.060); ctx.lineTo(wireMX,wireMY+H*0.060+ld.wireY*0.5); ctx.stroke()
      }
      ld.wireParticles.forEach(p=>{ctx.globalAlpha=p.life*0.75;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1

      // ── TOP LANCE — descends from machine through roof into ladle ────
      const LANCE_MX = CX + LW*0.45   // lance machine X (right side, inside ladle width)
      const LANCE_MY = H*0.06         // machine sits above the ladle
      // Lance machine housing
      ctx.fillStyle='#1e2d3d'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.2
      ctx.fillRect(LANCE_MX-W*0.03,LANCE_MY,W*0.06,H*0.05)
      ctx.strokeRect(LANCE_MX-W*0.03,LANCE_MY,W*0.06,H*0.05)
      // Drive wheels on machine
      ctx.fillStyle='#263340'; ctx.beginPath(); ctx.arc(LANCE_MX-W*0.012,LANCE_MY+H*0.025,W*0.009,0,Math.PI*2); ctx.fill()
      ctx.fillStyle='#263340'; ctx.beginPath(); ctx.arc(LANCE_MX+W*0.012,LANCE_MY+H*0.025,W*0.009,0,Math.PI*2); ctx.fill()
      if(running){
        ctx.strokeStyle='rgba(41,182,246,0.4)'; ctx.lineWidth=0.8
        ;[LANCE_MX-W*0.012,LANCE_MX+W*0.012].forEach(wx=>{
          ctx.beginPath(); ctx.arc(wx,LANCE_MY+H*0.025,W*0.009,0,Math.PI*2); ctx.stroke()
        })
      }
      lblB(`TL${idx+1}`,LANCE_MX,LANCE_MY-5,'#8BC34A',clamp(W*0.009,7,10))
      lbl(ld.topLanceOn?'INJECTING':'TOP LANCE',LANCE_MX,LANCE_MY+H*0.065,ld.topLanceOn?'#8BC34A':'#37474F',clamp(W*0.009,6,8))

      // Lance tube — travels from machine bottom down through roof into ladle
      if(ld.topLanceY>0){
        const lanceTopY  = LANCE_MY + H*0.05    // exits machine bottom
        const lanceBotY  = ROOF_Y + (LAD_Y0+H*0.28 - ROOF_Y)*ld.topLanceY  // tip position
        const lanceW     = clamp(W*0.014, 8, 14)
        // Hose/tube (water-cooled, metallic)
        const lGrd=ctx.createLinearGradient(LANCE_MX-lanceW/2,0,LANCE_MX+lanceW/2,0)
        lGrd.addColorStop(0,'#1a3a4a'); lGrd.addColorStop(0.45,'#2c5a70')
        lGrd.addColorStop(0.55,'#4FC3F7'); lGrd.addColorStop(1,'#1a3a4a')
        ctx.fillStyle=lGrd; ctx.fillRect(LANCE_MX-lanceW/2, lanceTopY, lanceW, lanceBotY-lanceTopY)
        ctx.strokeStyle='#0d2530'; ctx.lineWidth=0.6; ctx.strokeRect(LANCE_MX-lanceW/2, lanceTopY, lanceW, lanceBotY-lanceTopY)
        // Tip nozzle (orange — hot)
        const tipGrd=ctx.createLinearGradient(0,lanceBotY-8,0,lanceBotY+6)
        tipGrd.addColorStop(0,'#FF8F00'); tipGrd.addColorStop(1,'#FF5722')
        ctx.fillStyle=tipGrd; ctx.fillRect(LANCE_MX-lanceW/2-2, lanceBotY-6, lanceW+4, 10)
        ctx.strokeStyle='#FF7043'; ctx.lineWidth=0.8; ctx.strokeRect(LANCE_MX-lanceW/2-2, lanceBotY-6, lanceW+4, 10)
        // Powder injection glow at tip
        if(ld.topLanceY>0.7){
          const tipGlow=ctx.createRadialGradient(LANCE_MX,lanceBotY+4,1,LANCE_MX,lanceBotY+4,22)
          tipGlow.addColorStop(0,'rgba(255,200,80,0.80)'); tipGlow.addColorStop(0.5,'rgba(200,160,50,0.35)'); tipGlow.addColorStop(1,'rgba(200,140,40,0)')
          ctx.fillStyle=tipGlow; ctx.beginPath(); ctx.arc(LANCE_MX,lanceBotY+4,22,0,Math.PI*2); ctx.fill()
          // Status label on lance body
          lbl('CaSi →',LANCE_MX+lanceW/2+5, lanceTopY+(lanceBotY-lanceTopY)*0.6,'rgba(200,180,80,0.65)',clamp(W*0.009,7,9),'left')
        }
        // Depth label
        const depthPct=Math.round(ld.topLanceY*100)
        lbl(`${depthPct}%`,LANCE_MX-lanceW/2-5, lanceTopY+(lanceBotY-lanceTopY)*0.5,'rgba(41,182,246,0.55)',clamp(W*0.009,6,8),'right')
      }
      ;(ld.topLanceParticles||[]).forEach(p=>{ctx.globalAlpha=p.life*0.82;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=p.life*0.25;ctx.fillStyle='rgba(255,220,100,0.8)';ctx.beginPath();ctx.arc(p.x,p.y,p.r*1.8,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1

      // ── TEMPERATURE + SAMPLING PROBE — descends into ladle ──────────
      const PROBE_MX = CX - LW*0.42  // probe machine X (left side, inside ladle)
      const PROBE_MY = H*0.06        // machine above ladle
      // Probe machine housing
      ctx.fillStyle='#1e2d3d'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.2
      ctx.fillRect(PROBE_MX-W*0.025,PROBE_MY,W*0.05,H*0.048)
      ctx.strokeRect(PROBE_MX-W*0.025,PROBE_MY,W*0.05,H*0.048)
      // Wire spool visible on machine
      ctx.fillStyle='#263340'; ctx.beginPath(); ctx.arc(PROBE_MX,PROBE_MY+H*0.024,W*0.012,0,Math.PI*2); ctx.fill()
      ctx.fillStyle='rgba(200,200,80,0.55)'; ctx.beginPath(); ctx.arc(PROBE_MX,PROBE_MY+H*0.024,W*0.007,0,Math.PI*2); ctx.fill()
      lblB(`PR${idx+1}`,PROBE_MX,PROBE_MY-5,'#57ab5a',clamp(W*0.009,7,10))
      lbl(ld.probeOn?'MEASURING':ld.probeDone?'RETRACTING':'T+S PROBE',PROBE_MX,PROBE_MY+H*0.062,ld.probeOn||ld.probeDone?'#57ab5a':'#37474F',clamp(W*0.009,6,8))

      // Probe rod — descends from machine into ladle
      if(ld.probeY>0){
        const probeTopY = PROBE_MY + H*0.048   // exits machine bottom
        // Tip target: bath surface (LAD_Y0 + H*0.06) when probeY=0.80
        const probeTipY = probeTopY + (LAD_Y0+H*0.07 - probeTopY) * Math.min(ld.probeY/0.80, 1.0)
        const probeW    = clamp(W*0.008, 5, 8)
        // Probe rod (thin steel tube)
        ctx.fillStyle='#37474F'; ctx.fillRect(PROBE_MX-probeW/2, probeTopY, probeW, probeTipY-probeTopY)
        ctx.strokeStyle='#546E7A'; ctx.lineWidth=0.5; ctx.strokeRect(PROBE_MX-probeW/2, probeTopY, probeW, probeTipY-probeTopY)
        // Thermocouple tip (yellow-orange — hot)
        const tipFlash = ld.probeDone ? 0.9+0.1*Math.sin(sim.t*10) : 0.6
        ctx.fillStyle=`rgba(255,${ld.probeDone?200:170},0,${tipFlash})`
        ctx.beginPath(); ctx.arc(PROBE_MX, probeTipY, 6, 0, Math.PI*2); ctx.fill()
        ctx.strokeStyle='#FFD54F'; ctx.lineWidth=0.8; ctx.stroke()
        // Measurement flash glow
        if(ld.probeDone){
          const pg3=ctx.createRadialGradient(PROBE_MX,probeTipY,1,PROBE_MX,probeTipY,24)
          pg3.addColorStop(0,`rgba(87,171,90,${0.55+0.35*Math.sin(sim.t*8)})`); pg3.addColorStop(1,'rgba(87,171,90,0)')
          ctx.fillStyle=pg3; ctx.beginPath(); ctx.arc(PROBE_MX,probeTipY,24,0,Math.PI*2); ctx.fill()
        }
        // Depth label on rod
        const depthPctP=Math.round(Math.min(ld.probeY/0.80,1.0)*100)
        lbl(`${depthPctP}%`,PROBE_MX-probeW/2-5,probeTopY+(probeTipY-probeTopY)*0.5,'rgba(87,171,90,0.55)',clamp(W*0.009,6,8),'right')
      }
      // Last measurement display box
      if(ld.measuredTemp){
        const boxX=PROBE_MX-W*0.045, boxY=PROBE_MY+H*0.056, boxW=W*0.09, boxH=H*0.052
        ctx.fillStyle='rgba(4,12,28,0.90)'; ctx.fillRect(boxX,boxY,boxW,boxH)
        ctx.strokeStyle='#57ab5a'; ctx.lineWidth=1; ctx.strokeRect(boxX,boxY,boxW,boxH)
        lblB(`${ld.measuredTemp}°C`,PROBE_MX,boxY+boxH*0.40,'#57ab5a',clamp(W*0.012,10,13))
        lbl(ld.sampleTaken?'SAMPLE ✓':'TEMP ONLY',PROBE_MX,boxY+boxH*0.75,'#57ab5a',clamp(W*0.009,7,9))
      }

      // ── LADLE DATA BOX ────────────────────────────────────────────────
      const dbX=CX-LW*0.55, dbY=LAD_Y1+H*0.025, dbW=LW*1.10, dbH=H*0.17
      ctx.fillStyle='rgba(4,8,18,0.88)'; ctx.fillRect(dbX,dbY,dbW,dbH)
      ctx.strokeStyle=ld.arcOn?'#FF8F00':ld.arStirOn?'#29B6F6':'#1e3040'; ctx.lineWidth=0.8; ctx.strokeRect(dbX,dbY,dbW,dbH)
      lblB(`LF${idx+1} — ${ld.status}`,CX,dbY+14,ld.arcOn?'#FF8F00':ld.arStirOn?'#29B6F6':'#546E7A',clamp(W*0.010,8,11))
      const rows=[
        [`T: ${Math.round(ld.steelTemp)}°C`,`Tgt: ${ld.targetTemp}°C`],
        [`C: ${ld.C.toFixed(3)}%`,`S: ${ld.S.toFixed(4)}%`],
        [`Mn: ${ld.Mn.toFixed(3)}%`,`Si: ${ld.Si.toFixed(3)}%`],
        [`Pwr: ${ld.powerKW}kW`,`Ar: ${ld.arFlow}l/m`],
        [`Desulph: ${ld.desulphPct.toFixed(0)}%`,`Slag B: ${ld.slagBasicity.toFixed(1)}`],
      ]
      rows.forEach((r,ri)=>{
        const ry=dbY+26+ri*H*0.025
        ctx.fillStyle='rgba(180,200,215,0.85)'; ctx.font=`${clamp(W*0.010,8,11)}px monospace`; ctx.textAlign='left'; ctx.fillText(r[0],dbX+8,ry)
        ctx.fillStyle='rgba(120,155,180,0.70)'; ctx.textAlign='right'; ctx.fillText(r[1],dbX+dbW-8,ry)
      })

      // Temperature vs target bar
      const tFrac=clamp((ld.steelTemp-1540)/(ld.targetTemp-1540),0,1)
      ctx.fillStyle='#0a1520'; ctx.fillRect(dbX+6,dbY+dbH-16,dbW-12,10)
      ctx.fillStyle=tFrac>0.95?'#57ab5a':tFrac>0.7?'#FF8F00':'#1565C0'
      ctx.fillRect(dbX+6,dbY+dbH-16,(dbW-12)*tFrac,10)
      ctx.strokeStyle='#1e3040'; ctx.lineWidth=0.5; ctx.strokeRect(dbX+6,dbY+dbH-16,dbW-12,10)
      lbl(`${(tFrac*100).toFixed(0)}% to target`,CX,dbY+dbH-4,'#37474F',clamp(W*0.009,6,8))

      // Power indicator lights
      const lights=[{col:ld.arcOn?'#FF5722':'#1e2535',lbl:'ARC'},{col:ld.arStirOn?'#29B6F6':'#1e2535',lbl:'AR'},{col:ld.alloyFalling?'#FFB300':'#1e2535',lbl:'FA'},{col:ld.wireOn?'#FFD54F':'#1e2535',lbl:'WI'}]
      lights.forEach((lt,li)=>{
        const lx=CX-LW*0.34+li*LW*0.22, ly=LAD_Y0-H*0.075
        ctx.fillStyle=lt.col; ctx.beginPath(); ctx.arc(lx,ly,6,0,Math.PI*2); ctx.fill()
        if(lt.col!=='#1e2535'){ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1;ctx.stroke()}
        lbl(lt.lbl,lx,ly+14,'#37474F',clamp(W*0.008,6,8))
      })

      // LF label
      lblB(`LADLE FURNACE ${idx+1}`,CX,H*0.44,'#546E7A',clamp(W*0.012,9,13))
    })

    // ── TWIN LF LABEL ─────────────────────────────────────────────────────
    lblB('TWIN LADLE FURNACE TREATMENT STATION',W/2,H*0.026,'#3d6a8a',clamp(W*0.012,9,14))

    // ── STATUS STRIP ──────────────────────────────────────────────────────
    ctx.fillStyle='rgba(4,8,18,0.82)'; ctx.fillRect(0,0,W,H*0.030)
    ;[
      {l:'LF1 TEMP',  v:`${Math.round(ladles[0]?.steelTemp||0)}°C`,    c:ladles[0]?.arcOn?'#FF8F00':'#546E7A'},
      {l:'LF2 TEMP',  v:`${Math.round(ladles[1]?.steelTemp||0)}°C`,    c:ladles[1]?.arcOn?'#FF8F00':'#546E7A'},
      {l:'LF1 [S]',   v:`${ladles[0]?.S.toFixed(4)||'--'}%`,           c:'#9b5de5'},
      {l:'LF2 [S]',   v:`${ladles[1]?.S.toFixed(4)||'--'}%`,           c:'#9b5de5'},
      {l:'MVA',       v:`${transformerMVA} MVA`,                        c:ladles.some(l=>l.arcOn)?'#FF8F00':'#546E7A'},
      {l:'STATUS',    v:running?'OPERATING ●':'STANDBY ○',              c:running?'#57ab5a':'#546E7A'},
    ].forEach(({l,v,c},ki)=>{
      const px=W*0.01+ki*W*0.165
      ctx.fillStyle='#4d7a9a'; ctx.font=`${clamp(W*0.009,6,9)}px monospace`; ctx.textAlign='left'; ctx.fillText(l,px,H*0.013)
      ctx.fillStyle=c; ctx.font=`bold ${clamp(W*0.010,7,10)}px monospace`; ctx.fillText(v,px,H*0.024)
    })

    // ── TOOLTIP ───────────────────────────────────────────────────────────
    const mx=mouseRef.current.x, my=mouseRef.current.y
    let tooltip=null

    ladles.forEach((ld,idx)=>{
      const CX=idx===0?LF1_CX:LF2_CX

      // Hit: steel bath
      if(!tooltip&&mx>CX-LAD_W/2&&mx<CX+LAD_W/2&&my>LAD_Y0+H*0.04&&my<LAD_Y1){
        tooltip={title:`LF${idx+1} — LIQUID STEEL`,color:heatColor(ld.steelTemp,1500,1720),lines:[
          {label:'Temperature',value:`${Math.round(ld.steelTemp)} °C`,col:heatColor(ld.steelTemp,1500,1720)},
          {label:'Target temp',value:`${ld.targetTemp} °C`,col:'#57ab5a'},
          {label:'Carbon [C]',value:`${ld.C.toFixed(3)} %`,col:'#29B6F6'},
          {label:'Sulphur [S]',value:`${ld.S.toFixed(4)} %`,col:'#9b5de5'},
          {label:'Manganese [Mn]',value:`${ld.Mn.toFixed(3)} %`,col:'#FFB300'},
          {label:'Silicon [Si]',value:`${ld.Si.toFixed(3)} %`,col:'#FF8F00'},
          {label:'Weight',value:`${ld.steelWeight} t`,col:'#78909C'},
          {label:'Heat rate',value:`${ld.heatRate.toFixed(1)} °C/min`,col:'#FF8F00'},
        ]}
      }

      // Hit: slag
      const slagH2=H*0.04*(1+ld.slagFoam)
      const slagY2=LAD_Y0+H*0.04-slagH2
      if(!tooltip&&mx>CX-LAD_W/2&&mx<CX+LAD_W/2&&my>slagY2&&my<LAD_Y0+H*0.04){
        tooltip={title:`LF${idx+1} — SLAG LAYER`,color:'#8BC34A',lines:[
          {label:'Slag thickness',value:`${Math.round(ld.slagThick)} mm`,col:'#8BC34A'},
          {label:'Foaming',value:`${(ld.slagFoam*100).toFixed(0)} %`,col:'#7C9060'},
          {label:'Basicity B',value:`${ld.slagBasicity.toFixed(1)} CaO/SiO₂`,col:'#A5D6A7'},
          {label:'Role',value:'Covers arc — protects lining',col:'rgba(180,200,210,0.9)'},
          {label:'Also',value:'Desulphurisation medium',col:'rgba(180,200,210,0.9)'},
          {label:'Target B',value:'>3.0 for good desulph',col:'#57ab5a'},
        ]}
      }

      // Hit: electrodes
      const elecXs2=[CX-LAD_W*0.22,CX,CX+LAD_W*0.22]
      elecXs2.forEach((ex,ei)=>{
        if(!tooltip&&Math.abs(mx-ex)<18&&my>ELEC_TOP&&my<LAD_Y0){
          tooltip={title:`LF${idx+1} — ELECTRODE ${ei+1}`,color:'#29B6F6',lines:[
            {label:'Type',value:'Graphite electrode (UHP)',col:'rgba(180,200,210,0.9)'},
            {label:'Voltage',value:ld.arcOn?`${ld.arcV} V`:'OFF',col:'#FF8F00'},
            {label:'Current',value:ld.arcOn?`${ld.arcA} A`:'OFF',col:'#29B6F6'},
            {label:'Power',value:ld.arcOn?`${ld.powerKW} kW`:'OFF',col:ld.arcOn?'#FF8F00':'#546E7A'},
            {label:'Arc temp',value:ld.arcOn?'~3500°C at tip':'OFF',col:ld.arcOn?'#FF3D00':'#546E7A'},
            {label:'Diameter',value:'~400–600mm graphite',col:'#78909C'},
          ]}
        }
      })
    })

    // Hit: porous plugs
    ladles.forEach((ld,idx)=>{
      const CX=idx===0?LF1_CX:LF2_CX
      const PLUG_Y2=LAD_Y1-LIN+4
      ;[[CX-LAD_W*0.30,'1',ld.plug1On,ld.plug1Flow||0],[CX+LAD_W*0.30,'2',ld.plug2On,ld.plug2Flow||0]].forEach(([px,num,on,flow])=>{
        if(!tooltip&&Math.abs(mx-px)<LAD_W*0.07&&Math.abs(my-PLUG_Y2)<H*0.04){
          tooltip={title:`LF${idx+1} — POROUS PLUG ${num}`,color:'#29B6F6',lines:[
            {label:'Status',value:on?`OPEN — ${flow} l/min`:'CLOSED',col:on?'#29B6F6':'#546E7A'},
            {label:'Type',value:'Al₂O₃-MgO porous plug',col:'rgba(180,200,210,0.9)'},
            {label:'Function',value:'Bottom argon stirring',col:'rgba(180,200,210,0.9)'},
            {label:'Effect',value:'Homogenises temp + chemistry',col:'#A5D6A7'},
            {label:'Also',value:'Promotes inclusion flotation',col:'#A5D6A7'},
            {label:'Both plugs',value:ld.plug1On&&ld.plug2On?'OPEN — max stirring':ld.plug1On||ld.plug2On?'ONE OPEN':'BOTH CLOSED',col:'#29B6F6'},
          ]}
        }
      })
      // Hit: probe
      const PROBE_X2=CX-LAD_W*0.52
      if(!tooltip&&Math.abs(mx-PROBE_X2)<W*0.025&&my>H*0.06&&my<LAD_Y0){
        tooltip={title:`LF${idx+1} — TEMP/SAMPLE PROBE`,color:'#57ab5a',lines:[
          {label:'Status',value:ld.probeOn?'MEASURING':ld.measuredTemp?'DONE':'STANDBY',col:'#57ab5a'},
          {label:'Last temp',value:ld.measuredTemp?`${ld.measuredTemp} °C`:'No reading',col:ld.measuredTemp?'#57ab5a':'#546E7A'},
          {label:'Sample',value:ld.sampleTaken?'TAKEN ✓':'Not taken',col:ld.sampleTaken?'#57ab5a':'#546E7A'},
          {label:'Sensor',value:'Disposable thermocouple (S-type)',col:'rgba(180,200,210,0.9)'},
          {label:'Accuracy',value:'±3°C bath temperature',col:'rgba(180,200,210,0.9)'},
        ]}
      }
      // Hit: top lance
      const LANCE_X2=CX+LAD_W*0.52
      if(!tooltip&&Math.abs(mx-LANCE_X2)<W*0.025&&my>H*0.06&&my<LAD_Y0){
        tooltip={title:`LF${idx+1} — TOP LANCE`,color:'#8BC34A',lines:[
          {label:'Status',value:ld.topLanceOn?'INJECTING':'STANDBY',col:ld.topLanceOn?'#8BC34A':'#546E7A'},
          {label:'Purpose',value:'CaSi powder injection',col:'rgba(180,200,210,0.9)'},
          {label:'Effect',value:'Desulphurisation + inclusion mod',col:'#A5D6A7'},
          {label:'Also used for',value:'Reheating slag / deoxidation',col:'rgba(180,200,210,0.9)'},
        ]}
      }
    })

    // Hit: transformer
    if(!tooltip&&mx>TRANS_X&&mx<TRANS_X+TRANS_W&&my>TRANS_Y&&my<TRANS_Y+TRANS_H){
      tooltip={title:'FURNACE TRANSFORMER',color:'#FF7043',lines:[
        {label:'Rating',value:`${transformerMVA} MVA`,col:'#FF8F00'},
        {label:'Voltage step',value:`Step ${voltageStep} selected`,col:'#FFB300'},
        {label:'Secondary V',value:`${180+voltageStep*15} V (approx)`,col:'#FF7043'},
        {label:'Supplies',value:'Both LF1 and LF2 via bus bars',col:'rgba(180,200,210,0.9)'},
        {label:'Type',value:'On-load tap changer transformer',col:'#78909C'},
        {label:'Cooling',value:'ONAN / ONAF oil cooled',col:'#29B6F6'},
      ]}
    }

    if(tooltip){
      const TW=clamp(W*0.30,270,390); const lineH=25,pad=16
      const TH=pad*2+30+tooltip.lines.length*lineH+8
      let tx=mx+18, ty=my-TH/2
      if(tx+TW>W-10)tx=mx-TW-18; if(ty<32)ty=32; if(ty+TH>H-32)ty=H-TH-32
      ctx.shadowColor='rgba(0,0,0,0.65)'; ctx.shadowBlur=14
      ctx.fillStyle='rgba(5,12,25,0.95)'; ctx.strokeStyle=tooltip.color; ctx.lineWidth=1.5
      const r6=6
      ctx.beginPath(); ctx.moveTo(tx+r6,ty); ctx.lineTo(tx+TW-r6,ty); ctx.arcTo(tx+TW,ty,tx+TW,ty+r6,r6); ctx.lineTo(tx+TW,ty+TH-r6); ctx.arcTo(tx+TW,ty+TH,tx+TW-r6,ty+TH,r6); ctx.lineTo(tx+r6,ty+TH); ctx.arcTo(tx,ty+TH,tx,ty+TH-r6,r6); ctx.lineTo(tx,ty+r6); ctx.arcTo(tx,ty,tx+r6,ty,r6); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.shadowBlur=0
      ctx.fillStyle=tooltip.color+'28'; ctx.fillRect(tx+1,ty+1,TW-2,32)
      ctx.fillStyle=tooltip.color; ctx.font=`bold ${clamp(W*0.014,12,16)}px monospace`; ctx.textAlign='left'; ctx.fillText(tooltip.title,tx+pad,ty+21)
      ctx.strokeStyle=tooltip.color+'45'; ctx.lineWidth=0.8; ctx.beginPath(); ctx.moveTo(tx+pad,ty+36); ctx.lineTo(tx+TW-pad,ty+36); ctx.stroke()
      tooltip.lines.forEach((line,li)=>{
        const ly=ty+54+li*lineH
        ctx.fillStyle='rgba(170,195,215,0.90)'; ctx.font=`${clamp(W*0.012,10,13)}px monospace`; ctx.textAlign='left'; ctx.fillText(line.label+':',tx+pad,ly)
        ctx.fillStyle=line.col; ctx.font=`bold ${clamp(W*0.012,10,13)}px monospace`; ctx.textAlign='right'
        ctx.fillText(line.value.length>28?line.value.substring(0,26)+'…':line.value,tx+TW-pad,ly)
      })
      ctx.fillStyle=tooltip.color; ctx.beginPath(); ctx.arc(mx,my,4,0,Math.PI*2); ctx.fill()
      ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1; ctx.stroke()
    }

    // Footer
    ctx.fillStyle='rgba(4,8,18,0.92)'; ctx.fillRect(0,H-18,W,18)
    ctx.fillStyle='#2c4055'; ctx.font=`${clamp(W*0.009,7,10)}px monospace`; ctx.textAlign='left'
    ctx.fillText(`TWIN LADLE FURNACE  |  ${transformerMVA}MVA  Step${voltageStep}  |  LF1:${Math.round(ladles[0]?.steelTemp||0)}°C  LF2:${Math.round(ladles[1]?.steelTemp||0)}°C  |  ${new Date().toLocaleTimeString()}`,8,H-4)

    }catch(e){
      ctx.fillStyle='#06090f'; ctx.fillRect(0,0,W,H)
      ctx.fillStyle='#e5534b'; ctx.font='14px monospace'; ctx.textAlign='left'
      ctx.fillText('ERROR: '+e.message,20,40); console.error('LFCanvas:',e)
    }
    rafRef.current=requestAnimationFrame(draw)
  },[running,ladles,transformerMVA,voltageStep,arFlowSet])

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

function LadleControl({ladle,idx,onChange}){
  if(!ladle) return null
  const C2={border:'#1a2d45',muted:'#6e8098',accent:'#FF8F00',success:'#57ab5a'}
  const btn=(label,col,active,onClick)=>(
    <button onClick={onClick} style={{padding:'5px 8px',borderRadius:3,border:`1px solid ${active?col:C2.border}`,background:active?col+'22':'transparent',color:active?col:C2.muted,fontSize:10,cursor:'pointer',marginBottom:4,width:'100%',fontFamily:'monospace',fontWeight:700}}>
      {label}
    </button>
  )
  const arOn = ladle.plug1On||ladle.plug2On
  return(
    <div style={{background:'#0a1018',border:`1px solid ${ladle.arcOn?'#FF8F0055':arOn?'#29B6F655':'#1a2d45'}`,borderRadius:5,padding:'8px',marginBottom:10}}>
      <div style={{fontSize:10,color:'#FF8F00',fontWeight:700,marginBottom:6,display:'flex',justifyContent:'space-between'}}>
        <span>LF{idx+1}</span>
        <span style={{fontSize:9,color:'#546E7A'}}>{ladle.status}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginBottom:6}}>
        {[
          {l:'Temp',   v:`${Math.round(ladle.steelTemp)}°C`, c:'#FF8F00'},
          {l:'Target', v:`${ladle.targetTemp}°C`,            c:'#57ab5a'},
          {l:'[C]',    v:`${ladle.C.toFixed(3)}%`,           c:'#29B6F6'},
          {l:'[S]',    v:`${ladle.S.toFixed(4)}%`,           c:'#9b5de5'},
          {l:'Power',  v:`${ladle.powerKW}kW`,               c:'#FF7043'},
          {l:'Ar l/m', v:`${ladle.arFlow}`,                  c:'#29B6F6'},
        ].map(r=>(
          <div key={r.l} style={{background:'#06090f',borderRadius:3,padding:'3px 5px'}}>
            <div style={{fontSize:7,color:C2.muted}}>{r.l}</div>
            <div style={{fontSize:10,color:r.c,fontWeight:600}}>{r.v}</div>
          </div>
        ))}
      </div>

      {/* Arc */}
      {btn(`${ladle.arcOn?'⏹ ARC OFF':'⚡ ARC ON'}`, '#FF8F00', ladle.arcOn, ()=>onChange(idx,'arcOn',!ladle.arcOn))}
      {ladle.arcOn&&<div style={{fontSize:8,color:'#FF8F00',marginBottom:4,paddingLeft:4}}>
        E1:{ladle.arcLength?.[0]||0}mm  E2:{ladle.arcLength?.[1]||0}mm  E3:{ladle.arcLength?.[2]||0}mm
      </div>}

      {/* Porous plugs */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginBottom:4}}>
        {[['PLUG 1','#29B6F6',ladle.plug1On,'plug1On'],[' PLUG 2','#4FC3F7',ladle.plug2On,'plug2On']].map(([label,col,active,key])=>(
          <button key={key} onClick={()=>onChange(idx,key,!active)}
            style={{padding:'5px 4px',borderRadius:3,border:`1px solid ${active?col:'#1a2d45'}`,background:active?col+'22':'transparent',color:active?col:'#6e8098',fontSize:9,cursor:'pointer',fontFamily:'monospace',fontWeight:700}}>
            💨 {label}
          </button>
        ))}
      </div>
      {/* Plug flow sliders */}
      {ladle.plug1On&&<div style={{marginBottom:4}}>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:8,color:'#29B6F6',marginBottom:2}}><span>PLUG 1 FLOW</span><span>{ladle.plug1Flow} l/m</span></div>
        <input type="range" min={50} max={400} step={10} value={ladle.plug1Flow||150}
          onChange={e=>onChange(idx,'plug1Flow',+e.target.value)}
          style={{width:'100%',accentColor:'#29B6F6',height:16}}/>
      </div>}
      {ladle.plug2On&&<div style={{marginBottom:4}}>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:8,color:'#4FC3F7',marginBottom:2}}><span>PLUG 2 FLOW</span><span>{ladle.plug2Flow} l/m</span></div>
        <input type="range" min={50} max={400} step={10} value={ladle.plug2Flow||150}
          onChange={e=>onChange(idx,'plug2Flow',+e.target.value)}
          style={{width:'100%',accentColor:'#4FC3F7',height:16}}/>
      </div>}

      {/* Top lance + Ca wire */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginBottom:4}}>
        {btn(`${ladle.topLanceOn?'⏳ LANCE...':'🔧 TOP LANCE'}`, '#8BC34A', ladle.topLanceOn, ()=>{if(!ladle.topLanceOn)onChange(idx,'topLanceOn',true)})}
        {btn(`${ladle.wireOn?'⏳ WIRE...':'🔩 Ca WIRE'}`, '#FFD54F', ladle.wireOn, ()=>{if(!ladle.wireOn)onChange(idx,'wireOn',true)})}
      </div>

      {/* Alloy + probe */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginBottom:4}}>
        {btn(`${ladle.alloyFalling?'⏳ FA...':'🧪 ALLOY'}`, '#FFB300', ladle.alloyFalling, ()=>{if(!ladle.alloyFalling)onChange(idx,'alloyFalling',true)})}
        {btn(`${ladle.probeOn?'⏳ PROBE...':'🌡 T+SAMPLE'}`, '#57ab5a', ladle.probeOn||ladle.probeDone, ()=>{if(!ladle.probeOn){onChange(idx,'probeOn',true);onChange(idx,'probeDone',false);onChange(idx,'probeY',0);onChange(idx,'probeFrames',0);onChange(idx,'measuredTemp',null)}})}
      </div>

      {/* Last probe reading */}
      {ladle.measuredTemp&&<div style={{background:'rgba(87,171,90,0.12)',border:'1px solid #57ab5a55',borderRadius:3,padding:'4px 6px',marginBottom:4}}>
        <div style={{fontSize:9,color:'#57ab5a',fontWeight:700}}>LAST MEASUREMENT</div>
        <div style={{fontSize:11,color:'#57ab5a',fontWeight:700}}>{ladle.measuredTemp}°C  {ladle.sampleTaken?'+ SAMPLE ✓':''}</div>
      </div>}

      <div style={{marginTop:4}}>
        <div style={{fontSize:9,color:C2.muted,marginBottom:3}}>TARGET TEMP</div>
        <input type="range" min={1600} max={1720} step={5} value={ladle.targetTemp}
          onChange={e=>onChange(idx,'targetTemp',+e.target.value)}
          style={{width:'100%',accentColor:'#57ab5a',height:18}}/>
        <div style={{textAlign:'right',fontSize:9,color:'#57ab5a'}}>{ladle.targetTemp}°C</div>
      </div>
    </div>
  )
}

export default function LadleFurnaceModel(){
  const [running,setRunning]           = useState(false)
  const [ladles,setLadles]             = useState([initLadle(0),initLadle(1)])
  const [transformerMVA,setTransMVA]   = useState(25)
  const [voltageStep,setVoltageStep]   = useState(5)
  const [arFlowSet,setArFlow]          = useState(150)
  const [panelOpen,setPanelOpen]       = useState(true)
  const [elapsed,setElapsed]           = useState(0)
  const [resetCount,setResetCount]     = useState(0)
  const timerRef = useRef(null)

  useEffect(()=>{
    if(running){timerRef.current=setInterval(()=>setElapsed(t=>t+1),1000)}
    else clearInterval(timerRef.current)
    return()=>clearInterval(timerRef.current)
  },[running])

  const handleStart=()=>{setLadles([initLadle(0),initLadle(1)]);setElapsed(0);setRunning(true);setResetCount(c=>c+1)}
  const fmt=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`

  const updateLadle=(idx,key,val)=>{
    setLadles(prev=>prev.map((l,i)=>i===idx?{...l,[key]:val}:l))
  }

  const lf1=ladles[0], lf2=ladles[1]

  return(
    <div style={{height:'100dvh',background:C.bg,color:C.text,fontFamily:'monospace',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{background:'#060a10',borderBottom:`1px solid ${C.border}`,padding:'0 12px',height:48,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:20}}>⚡</span>
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'0.04em'}}>TWIN LADLE FURNACE MODEL</div>
            <div style={{fontSize:8,color:C.muted,letterSpacing:'0.1em'}}>SECONDARY STEELMAKING — ARC HEATING + ARGON STIR + ALLOY + DESULPH</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {[
            {l:'TIME',   v:fmt(elapsed),                      c:running?C.success:C.muted},
            {l:'LF1 T',  v:`${Math.round(lf1?.steelTemp||0)}°C`, c:lf1?.arcOn?C.accent:'#546E7A'},
            {l:'LF2 T',  v:`${Math.round(lf2?.steelTemp||0)}°C`, c:lf2?.arcOn?C.accent:'#546E7A'},
            {l:'LF1 [S]',v:`${lf1?.S.toFixed(4)||'--'}%`,    c:'#9b5de5'},
            {l:'LF2 [S]',v:`${lf2?.S.toFixed(4)||'--'}%`,    c:'#9b5de5'},
            {l:'MVA',    v:`${transformerMVA}MVA`,            c:ladles.some(l=>l.arcOn)?C.accent:'#546E7A'},
          ].map(item=>(
            <div key={item.l} style={{textAlign:'center'}}>
              <div style={{fontSize:7,color:C.muted}}>{item.l}</div>
              <div style={{fontSize:12,fontWeight:700,color:item.c}}>{item.v}</div>
            </div>
          ))}
          <button onClick={()=>setPanelOpen(v=>!v)} style={{padding:'4px 8px',borderRadius:3,border:`1px solid ${C.border}`,background:'transparent',color:C.muted,fontSize:11,cursor:'pointer'}}>{panelOpen?'◀':'▶'}</button>
          <button onClick={()=>{if(running)setRunning(false);else handleStart()}} style={{padding:'6px 12px',borderRadius:4,border:`1px solid ${running?C.danger:C.success}`,background:running?'rgba(229,83,73,0.15)':'rgba(87,171,90,0.15)',color:running?C.danger:C.success,fontSize:11,fontWeight:700,cursor:'pointer'}}>
            {running?'⏹ STOP':'▶ START'}
          </button>
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {panelOpen&&(
          <div style={{width:235,background:C.panel,borderRight:`1px solid ${C.border}`,overflow:'auto',flexShrink:0,padding:'12px'}}>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:8}}>TRANSFORMER</div>
            <Slider label="Transformer MVA" value={transformerMVA} onChange={setTransMVA} min={10} max={45} step={1} unit=" MVA" color='#FF7043'/>
            <Slider label="Voltage Step"    value={voltageStep}    onChange={setVoltageStep} min={1} max={12} unit="" color='#FFB300'/>
            <Slider label="Ar Flow"         value={arFlowSet}      onChange={setArFlow} min={50} max={500} step={10} unit=" l/m" color='#29B6F6'/>
            <div style={{height:1,background:C.border,margin:'10px 0'}}/>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:8}}>LADLE CONTROL</div>
            <LadleControl ladle={lf1} idx={0} onChange={updateLadle}/>
            <LadleControl ladle={lf2} idx={1} onChange={updateLadle}/>
            <div style={{height:1,background:C.border,margin:'8px 0'}}/>
            <div style={{fontSize:9,color:'#4d7a9a',marginBottom:6}}>HOVER TOOLTIPS</div>
            {[['⚡','Steel bath — T, chemistry'],['🟢','Slag layer — basicity'],['🔵','Graphite electrodes'],['🔧','Transformer details']].map(([ic,l])=>(
              <div key={l} style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}><span style={{fontSize:11}}>{ic}</span><span style={{fontSize:8,color:C.muted}}>{l}</span></div>
            ))}
            <div style={{height:1,background:C.border,margin:'8px 0'}}/>
            <div style={{fontSize:9,color:'#4d7a9a',marginBottom:4}}>PROCESSES</div>
            {['Arc heating → raise to target T','Argon stir → homogenise T+comp','Alloy addition → Mn, Si, Al, Nb','Ca wire → desulph + inclusion mod','Slag basicity → desulph efficiency'].map(r=><div key={r} style={{fontSize:8,color:C.muted,marginBottom:3}}>{r}</div>)}
          </div>
        )}
        <div style={{flex:1,overflow:'hidden',background:'#06090f'}}>
          <LFCanvas
            running={running} ladles={ladles} setLadles={setLadles}
            transformerMVA={transformerMVA} voltageStep={voltageStep} arFlowSet={arFlowSet}
            onHeatComplete={()=>{}} doReset={resetCount}
          />
        </div>
      </div>
    </div>
  )
}
