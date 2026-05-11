import { useState, useEffect, useRef, useCallback } from 'react'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function heatColor(temp, min = 1400, max = 1700) {
  const t = clamp((temp - min) / (max - min), 0, 1)
  if (t > 0.85) return `rgba(255,255,${Math.round((1-t)*6*255)},0.97)`
  if (t > 0.70) return `rgba(255,${Math.round(120+(t-0.70)*5*135)},0,0.95)`
  if (t > 0.50) return `rgba(255,${Math.round(60+(t-0.50)*5*60)},0,0.92)`
  if (t > 0.25) return `rgba(${Math.round(200+(t-0.25)*5*55)},${Math.round(30+(t-0.25)*5*30)},0,0.88)`
  return `rgba(${Math.round(140+t*4*60)},${Math.round(20+t*4*10)},0,0.82)`
}

// ─── CANVAS ───────────────────────────────────────────────────────────────────
function BOFCanvas({
  running, blowPct, speed,
  hmWeight, hmTemp, hmC, hmSi, hmMn, hmP,
  scrapWeight, targetTemp, targetC,
  lanceHeight, o2Flow, heatNo,
  setCurrentTemp, setCurrentC, setMoldLevel,
  onDataUpdate, doReset,
}) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const mouseRef  = useRef({ x: -999, y: -999 })
  const S = useRef({
    t: 0, frame: 0,
    // Bath state
    bathTemp: 0, bathC: 0, bathSi: 0, bathMn: 0,
    bathLevel: 0.72,    // 0–1 fill fraction of vessel
    // Blow state
    blowPct: 0, blowTime: 0,
    // Lance
    lanceY: 0,          // lance tip Y in canvas coords
    lanceFlame: 0,      // flame intensity
    // Particles
    o2Jets: [],         // O2 jet from lance
    coGas: [],          // CO gas rising from bath
    co2Gas: [],         // CO2 from post-combustion
    slagParticles: [],  // slag droplets splashing
    sparks: [],         // metal sparks ejected
    steamPuffs: [],     // steam from scrap moisture early blow
    // Slag
    slagThickness: 0,   // px
    slagFoaming: 0,     // 0–1 foaming intensity
    slagColor: 0,       // temp-based
    // Vessel oscillation
    vesselVib: 0,
    // Sub-lance
    subLanceDeploy: false, subLanceY: 0,
    // Hood / off-gas
    offGasFlow: 0,
    offGasParticles: [],
    // Reaction zones inside bath (3 zones)
    reactionZones: [],
    // Scrap pieces melting
    scrapPieces: [],
    // Measurements
    measuredTemp: null, measuredC: null,
  })

  useEffect(() => {
    const el = canvasRef.current; if (!el) return
    const fit = () => {
      const w = el.parentElement ? el.parentElement.clientWidth : window.innerWidth
      const h = el.parentElement ? el.parentElement.clientHeight : window.innerHeight
      if (w > 0 && h > 0) { el.width = w; el.height = h }
    }
    fit()
    const t1 = setTimeout(fit, 100), t2 = setTimeout(fit, 400)
    window.addEventListener('resize', fit)
    const onMove = (e) => {
      const rect = el.getBoundingClientRect()
      mouseRef.current = { x:(e.clientX-rect.left)*(el.width/rect.width), y:(e.clientY-rect.top)*(el.height/rect.height) }
    }
    const onLeave = () => { mouseRef.current = { x:-999, y:-999 } }
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    el.addEventListener('touchmove',(e)=>{e.preventDefault();const t2b=e.touches[0],rect=el.getBoundingClientRect();mouseRef.current={x:(t2b.clientX-rect.left)*(el.width/rect.width),y:(t2b.clientY-rect.top)*(el.height/rect.height)}},{passive:false})
    el.addEventListener('touchend', onLeave)
    return () => { clearTimeout(t1);clearTimeout(t2);window.removeEventListener('resize',fit);el.removeEventListener('mousemove',onMove);el.removeEventListener('mouseleave',onLeave) }
  }, [])

  useEffect(() => {
    if (!doReset) return
    const sim = S.current
    Object.assign(sim, {
      t:0,frame:0,bathTemp:hmTemp-80,bathC:hmC,bathSi:hmSi,bathMn:hmMn,
      blowPct:0,blowTime:0,lanceY:0,lanceFlame:0,
      o2Jets:[],coGas:[],co2Gas:[],slagParticles:[],sparks:[],steamPuffs:[],offGasParticles:[],reactionZones:[],
      slagThickness:8,slagFoaming:0,slagColor:0,vesselVib:0,
      subLanceDeploy:false,subLanceY:0,offGasFlow:0,
      scrapPieces: Array.from({length:6},(_,i)=>({x:(Math.random()-0.5)*0.6,y:0.6+Math.random()*0.25,w:0.06+Math.random()*0.08,h:0.04+Math.random()*0.06,meltFrac:0,temp:25})),
      measuredTemp:null, measuredC:null,
    })
  }, [doReset])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return }
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    if (!W || !H || W < 10 || H < 10) {
      if (canvas.parentElement?.clientWidth > 0) { canvas.width=canvas.parentElement.clientWidth; canvas.height=canvas.parentElement.clientHeight }
      rafRef.current = requestAnimationFrame(draw); return
    }
    const sim = S.current
    sim.t += 0.016; sim.frame++

    try {
    // ── LAYOUT ──────────────────────────────────────────────────────────
    const VCX  = W * 0.40   // vessel centre X
    const VW   = W * 0.28   // vessel inner width at widest
    const VT   = H * 0.12   // vessel top Y
    const VB   = H * 0.88   // vessel bottom Y
    const VH   = VB - VT    // vessel height

    // BOF vessel profile (wider at top, narrower at bottom — trunnion ring shape)
    const vesselHW = (yFrac) => {
      if (yFrac < 0.08) return VW * 0.55                                          // cone top
      if (yFrac < 0.20) return VW * 0.55 + (yFrac-0.08)/0.12 * VW * 0.45         // widens to barrel
      if (yFrac < 0.65) return VW * 1.0                                           // barrel
      if (yFrac < 0.82) return VW * 1.0 - (yFrac-0.65)/0.17 * VW * 0.28          // narrows to bottom
      return VW * 0.72                                                             // bottom dome
    }
    const vHW = (yFrac) => vesselHW(yFrac)

    const BATH_SURFACE_Y = VT + VH * (1 - sim.bathLevel * 0.52)
    const LANCE_TIP_Y    = VT + VH * 0.28 - (lanceHeight - 1400) / 800 * VH * 0.18
    const SLAG_Y         = BATH_SURFACE_Y - sim.slagThickness * (1 + sim.slagFoaming * 3)

    // ── PHYSICS ──────────────────────────────────────────────────────────
    if (running && blowPct > 0 && blowPct < 100) {
      const bp    = blowPct / 100
      const inten = clamp((o2Flow / 650) * speed, 0.3, 1.2)

      // Bath temperature model
      const tgtTemp = hmTemp - 80 + bp * (targetTemp - hmTemp + 120) + (Math.random()-0.5)*6
      sim.bathTemp  = clamp(sim.bathTemp + (tgtTemp - sim.bathTemp) * 0.025, 1380, 1750)
      setCurrentTemp(Math.round(sim.bathTemp))

      // Carbon removal (exponential decay)
      const tgtC = hmC * Math.exp(-0.038 * blowPct) + 0.018
      sim.bathC  = clamp(sim.bathC + (tgtC - sim.bathC) * 0.04, 0.015, hmC)
      setCurrentC(sim.bathC.toFixed(3))

      // Si, Mn oxidation
      sim.bathSi = Math.max(0.002, hmSi * Math.exp(-0.055 * blowPct))
      sim.bathMn = Math.max(0.05,  hmMn * Math.exp(-0.028 * blowPct))

      // Slag thickness & foaming
      sim.slagThickness = clamp(8 + bp * 60 + inten * 20, 8, 120)
      sim.slagFoaming   = clamp(inten * 0.4 + (bp > 0.3 && bp < 0.7 ? 0.5 : 0.1), 0, 1.0)
      sim.slagColor     = clamp(sim.bathTemp / 1700, 0.6, 1.0)

      // Lance flame intensity
      sim.lanceFlame = clamp(inten * (0.7 + 0.3 * Math.sin(sim.t * 8)), 0.3, 1.0)

      // Vessel vibration from O2 impact
      sim.vesselVib = Math.sin(sim.t * 14) * inten * 2.5

      // Off-gas flow
      sim.offGasFlow = clamp(inten * (0.5 + bp * 0.5), 0.2, 1.0)

      // Sub-lance at 85%
      if (blowPct >= 85 && !sim.subLanceDeploy) {
        sim.subLanceDeploy = true
        sim.measuredTemp = Math.round(sim.bathTemp - 5 + (Math.random()-0.5)*8)
        sim.measuredC    = (sim.bathC + 0.002).toFixed(3)
      }
      if (sim.subLanceDeploy) sim.subLanceY = clamp(sim.subLanceY + 2, 0, BATH_SURFACE_Y - VT - 20)

      // ── PARTICLES ─────────────────────────────────────────────────────
      // O2 jets from lance (4 jets downward at angles)
      if (sim.frame % 2 === 0) {
        ;[-0.35,-0.12,0.12,0.35].forEach(angle => {
          sim.o2Jets.push({
            x: VCX + Math.sin(angle)*8, y: LANCE_TIP_Y,
            vx: Math.sin(angle)*(2.5+inten*3), vy: 3+inten*4+Math.random()*2,
            life: 1, r: 2+Math.random()*2, col: 'rgba(100,180,255,0.75)'
          })
        })
      }

      // CO gas rising from impact zone (O2 + C → CO)
      if (sim.frame % 3 === 0) {
        const impX = VCX + (Math.random()-0.5)*vHW(0.5)*0.8
        sim.coGas.push({
          x: impX, y: BATH_SURFACE_Y - 5,
          vx: (Math.random()-0.5)*1.8,
          vy: -(1.5+Math.random()*3)*inten,
          life: 1, r: 2+Math.random()*4,
          col: `rgba(${180+Math.round(Math.random()*40)},${155+Math.round(Math.random()*35)},50,0.52)`
        })
      }

      // Post-combustion CO→CO2 in upper vessel
      if (sim.frame % 5 === 0) {
        sim.co2Gas.push({
          x: VCX + (Math.random()-0.5)*vHW(0.2)*0.6,
          y: SLAG_Y - 20 - Math.random()*30,
          vx: (Math.random()-0.5)*1.2, vy: -(0.8+Math.random()*1.5),
          life: 1, r: 3+Math.random()*4,
          col: 'rgba(120,155,70,0.48)'
        })
      }

      // Slag splash particles
      if (sim.slagFoaming > 0.3 && sim.frame % 4 === 0) {
        ;[-1,1].forEach(side => {
          sim.slagParticles.push({
            x: VCX + side*(vHW(0.45)*0.6+Math.random()*vHW(0.45)*0.3),
            y: SLAG_Y + 5,
            vx: side*(1.5+Math.random()*3)*inten,
            vy: -(2+Math.random()*4)*inten,
            life: 1, r: 1.5+Math.random()*3,
            col: heatColor(sim.bathTemp-80, 1350, 1700)
          })
        })
      }

      // Metal sparks (ejected through mouth)
      if (inten > 0.7 && sim.frame % 6 === 0) {
        sim.sparks.push({
          x: VCX + (Math.random()-0.5)*vHW(0.05)*0.5,
          y: VT + VH * 0.05,
          vx: (Math.random()-0.5)*5, vy: -3-Math.random()*5,
          life: 1, r: 1+Math.random()*2,
          col: Math.random()>0.5?'#FFD54F':'#FF6D00'
        })
      }

      // Early blow steam (scrap moisture)
      if (blowPct < 15 && sim.frame % 6 === 0) {
        sim.steamPuffs.push({
          x: VCX+(Math.random()-0.5)*vHW(0.5)*0.5, y: SLAG_Y-10,
          vx:(Math.random()-0.5)*1.5, vy:-1.5-Math.random(),
          life:1, r:4+Math.random()*6
        })
      }

      // Off-gas hood particles
      if (sim.frame % 3 === 0) {
        sim.offGasParticles.push({
          x: VCX+(Math.random()-0.5)*vHW(0.02)*0.4, y: VT-8,
          vx:(Math.random()-0.5)*2, vy:-1.8-Math.random()*2.5,
          life:1, r:3+Math.random()*4,
          col:`rgba(${130+Math.round(Math.random()*40)},${120+Math.round(Math.random()*30)},70,0.45)`
        })
      }

      // Reaction zones (3 distinct zones in bath)
      if (sim.frame % 8 === 0) {
        sim.reactionZones.push({
          x: VCX+(Math.random()-0.5)*vHW(0.5)*0.7,
          y: BATH_SURFACE_Y-5-Math.random()*VH*0.15,
          r: 8+Math.random()*20, life:1,
          type: Math.random()<0.5?'co':'oxidation'
        })
      }

      // Scrap melting
      sim.scrapPieces = sim.scrapPieces.map(sc => {
        const newTemp = sc.temp + (sim.bathTemp - sc.temp) * 0.006
        const newMelt = Math.min(1, sc.meltFrac + 0.002 * (sim.bathTemp/1500))
        return {...sc, temp: newTemp, meltFrac: newMelt}
      }).filter(sc => sc.meltFrac < 1.0)

      onDataUpdate({
        bathTemp: sim.bathTemp, bathC: sim.bathC,
        bathSi: sim.bathSi, bathMn: sim.bathMn,
        slagFoaming: sim.slagFoaming, offGasFlow: sim.offGasFlow,
        o2Consumed: blowPct * hmWeight * hmC / 100 * 1.333 / 100,
      })
    }

    // Advance particles
    sim.o2Jets        = sim.o2Jets.filter(p=>p.life>0&&p.y<BATH_SURFACE_Y+10).map(p=>({...p,x:p.x+p.vx*0.5,y:p.y+p.vy,life:p.life-0.06}))
    sim.coGas         = sim.coGas.filter(p=>p.life>0&&p.y>VT-20).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.01}))
    sim.co2Gas        = sim.co2Gas.filter(p=>p.life>0&&p.y>VT-30).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.015}))
    sim.slagParticles = sim.slagParticles.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.2,life:p.life-0.04}))
    sim.sparks        = sim.sparks.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.28,life:p.life-0.05}))
    sim.steamPuffs    = sim.steamPuffs.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,r:p.r+0.5,life:p.life-0.025}))
    sim.offGasParticles=sim.offGasParticles.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.018}))
    sim.reactionZones = sim.reactionZones.filter(p=>p.life>0).map(p=>({...p,life:p.life-0.04}))

    // ── DRAW ─────────────────────────────────────────────────────────────
    ctx.fillStyle = '#06090f'; ctx.fillRect(0,0,W,H)
    ctx.strokeStyle='rgba(255,255,255,0.015)'; ctx.lineWidth=0.5
    for(let gx=0;gx<W;gx+=36){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke()}
    for(let gy=0;gy<H;gy+=36){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke()}

    const lbl=(t,x,y,c='#78909C',sz=9,align='center')=>{ctx.fillStyle=c;ctx.font=`${sz}px monospace`;ctx.textAlign=align;ctx.fillText(t,x,y)}
    const lblB=(t,x,y,c='#78909C',sz=9,align='center')=>{ctx.fillStyle=c;ctx.font=`bold ${sz}px monospace`;ctx.textAlign=align;ctx.fillText(t,x,y)}

    // ── TRUNNION RING & SUPPORT ───────────────────────────────────────────
    const TRUNNION_Y = VT + VH * 0.42
    ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=2
    ctx.fillRect(VCX-vHW(0.42)-W*0.055,TRUNNION_Y-8,W*0.05,16); ctx.strokeRect(VCX-vHW(0.42)-W*0.055,TRUNNION_Y-8,W*0.05,16)
    ctx.fillRect(VCX+vHW(0.42)+W*0.005,TRUNNION_Y-8,W*0.05,16); ctx.strokeRect(VCX+vHW(0.42)+W*0.005,TRUNNION_Y-8,W*0.05,16)
    // Support columns
    ;[-1,1].forEach(side=>{
      const tx=VCX+side*(vHW(0.42)+W*0.03)
      ctx.fillStyle='#141e2c'; ctx.fillRect(tx-6,TRUNNION_Y,12,H*0.20)
    })
    lbl('TRUNNION RING',VCX+vHW(0.42)+W*0.065,TRUNNION_Y+4,'#1e3040',clamp(W*0.009,7,9),'left')

    // ── BOF VESSEL SHELL ─────────────────────────────────────────────────
    // Draw the vessel profile
    const steps=60
    const leftPts=[], rightPts=[]
    for(let s=0;s<=steps;s++){
      const yf=s/steps, y=VT+yf*VH, hw=vHW(yf)
      leftPts.push([VCX-hw, y+sim.vesselVib*0.3])
      rightPts.push([VCX+hw, y+sim.vesselVib*0.3])
    }
    // Shell fill
    ctx.beginPath(); ctx.moveTo(...leftPts[0])
    leftPts.forEach(p=>ctx.lineTo(...p))
    rightPts.slice().reverse().forEach(p=>ctx.lineTo(...p))
    ctx.closePath(); ctx.fillStyle='#1a2535'; ctx.fill()
    ctx.strokeStyle='#2c4055'; ctx.lineWidth=2.5; ctx.stroke()

    // Refractory lining
    ctx.save()
    ctx.beginPath(); ctx.moveTo(...leftPts[0])
    leftPts.forEach(p=>ctx.lineTo(...p))
    rightPts.slice().reverse().forEach(p=>ctx.lineTo(...p))
    ctx.closePath(); ctx.clip()
    ctx.fillStyle='#1e1208'; ctx.fillRect(VCX-VW*1.2,VT,VW*2.4,VH)
    // Lining thickness
    const LINING=clamp(W*0.022,14,28)
    ctx.fillStyle='#2c1a08'; ctx.fillRect(VCX-vHW(0.5)+LINING,VT,vHW(0.5)*2-LINING*2,VH)
    ctx.restore()

    // ── LIQUID STEEL BATH ─────────────────────────────────────────────────
    ctx.save()
    ctx.beginPath(); ctx.moveTo(...leftPts[0])
    leftPts.forEach(p=>ctx.lineTo(...p))
    rightPts.slice().reverse().forEach(p=>ctx.lineTo(...p))
    ctx.closePath(); ctx.clip()

    // Steel bath gradient (hotter at top from lance, cooler bottom)
    const bathGrd = ctx.createLinearGradient(0, BATH_SURFACE_Y-30, 0, VB)
    const bc = sim.bathTemp
    bathGrd.addColorStop(0, heatColor(bc, 1380, 1750))
    bathGrd.addColorStop(0.3, heatColor(bc-30, 1380, 1750))
    bathGrd.addColorStop(1, heatColor(bc-80, 1380, 1750))
    ctx.fillStyle = bathGrd
    ctx.fillRect(VCX-VW*1.2, BATH_SURFACE_Y, VW*2.4, VB-BATH_SURFACE_Y)

    // Bath surface shimmer
    if (running && blowPct > 0) {
      ctx.fillStyle = `rgba(255,220,60,${0.15+0.12*Math.sin(sim.t*6)})`
      const shHW = vHW(0.5)*0.9
      const surf_yf = clamp((BATH_SURFACE_Y-VT)/VH,0,1)
      ctx.fillRect(VCX-vHW(surf_yf)*0.9, BATH_SURFACE_Y, vHW(surf_yf)*1.8, 4)
    }

    // ── SCRAP PIECES melting in bath ──────────────────────────────────────
    sim.scrapPieces.forEach(sc => {
      const sx = VCX + sc.x * vHW(0.6)
      const sy = BATH_SURFACE_Y + (VB - BATH_SURFACE_Y) * sc.y
      const sw = sc.w * VW, sh = sc.h * VH * 0.4
      const mf = sc.meltFrac
      // Solid part (dark metal)
      ctx.fillStyle = `rgba(${Math.round(40+mf*80)},${Math.round(40+mf*60)},${Math.round(50+mf*40)},${0.85-mf*0.5})`
      ctx.fillRect(sx-sw/2, sy-sh/2, sw*(1-mf*0.6), sh*(1-mf*0.4))
      // Melting glow
      if (mf > 0.2) {
        const sg=ctx.createRadialGradient(sx,sy,1,sx,sy,sw*0.8)
        sg.addColorStop(0,`rgba(255,${Math.round(80+mf*80)},0,${0.35*mf})`)
        sg.addColorStop(1,'rgba(255,60,0,0)')
        ctx.fillStyle=sg; ctx.fillRect(sx-sw,sy-sh,sw*2,sh*2)
      }
    })

    // ── SLAG LAYER ────────────────────────────────────────────────────────
    const slagHW_yf = clamp((SLAG_Y-VT)/VH, 0, 1)
    const slagHW2   = vHW(slagHW_yf) * 0.92
    if (sim.slagThickness > 2) {
      const foam = sim.slagFoaming
      // Slag body
      const slg = ctx.createLinearGradient(0, SLAG_Y, 0, BATH_SURFACE_Y)
      slg.addColorStop(0, `rgba(${Math.round(80+foam*40)},${Math.round(90+foam*20)},${Math.round(40+foam*15)},0.88)`)
      slg.addColorStop(0.5, `rgba(${Math.round(110+foam*30)},${Math.round(95+foam*15)},45,0.82)`)
      slg.addColorStop(1, `rgba(${Math.round(70+foam*20)},${Math.round(80+foam*10)},35,0.72)`)
      ctx.fillStyle = slg
      ctx.fillRect(VCX-slagHW2, SLAG_Y, slagHW2*2, BATH_SURFACE_Y-SLAG_Y)
      // Foam surface lumps
      if (foam > 0.2 && running) {
        for(let lx=VCX-slagHW2+6; lx<VCX+slagHW2-6; lx+=14) {
          const lump = 4+foam*8+3*Math.sin(sim.t*4+lx*0.3)
          const lumpG=ctx.createRadialGradient(lx,SLAG_Y,0,lx,SLAG_Y,lump*1.5)
          lumpG.addColorStop(0,`rgba(130,120,55,${0.5+foam*0.3})`); lumpG.addColorStop(1,'rgba(80,90,35,0)')
          ctx.fillStyle=lumpG; ctx.beginPath(); ctx.arc(lx,SLAG_Y,lump*1.5,0,Math.PI*2); ctx.fill()
        }
      }
      // Slag glow
      const slg2=ctx.createRadialGradient(VCX,SLAG_Y+10,2,VCX,SLAG_Y+10,slagHW2*0.8)
      slg2.addColorStop(0,`rgba(255,${Math.round(120+foam*60)},0,${0.08+foam*0.08})`); slg2.addColorStop(1,'rgba(255,80,0,0)')
      ctx.fillStyle=slg2; ctx.fillRect(VCX-slagHW2-20,SLAG_Y-20,slagHW2*2+40,60)
    }

    // ── REACTION ZONES in bath ────────────────────────────────────────────
    sim.reactionZones.forEach(rz => {
      const col = rz.type==='co' ? `rgba(180,155,55,${rz.life*0.45})` : `rgba(255,${Math.round(80+rz.life*80)},0,${rz.life*0.35})`
      const rg=ctx.createRadialGradient(rz.x,rz.y,0,rz.x,rz.y,rz.r*2)
      rg.addColorStop(0,col); rg.addColorStop(1,'rgba(255,80,0,0)')
      ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(rz.x,rz.y,rz.r*2,0,Math.PI*2); ctx.fill()
    })

    // ── CO GAS RISING through bath ────────────────────────────────────────
    sim.coGas.forEach(p=>{
      ctx.globalAlpha=p.life*0.55; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
      ctx.globalAlpha=p.life*0.18; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x-p.vx*0.6,p.y-p.vy*0.5,p.r*0.5,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    ctx.restore()

    // ── CO2 GAS upper vessel (post-combustion) ────────────────────────────
    sim.co2Gas.forEach(p=>{
      ctx.globalAlpha=p.life*0.48; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // ── SLAG SPLASH particles ─────────────────────────────────────────────
    sim.slagParticles.forEach(p=>{
      ctx.globalAlpha=p.life*0.75; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // ── STEAM (early blow) ────────────────────────────────────────────────
    sim.steamPuffs.forEach(p=>{
      ctx.globalAlpha=p.life*0.22; ctx.fillStyle='rgba(200,215,230,1)'
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // ── SPARKS through mouth ──────────────────────────────────────────────
    sim.sparks.forEach(p=>{
      ctx.globalAlpha=p.life; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
      ctx.globalAlpha=p.life*0.25; ctx.fillStyle='#FF8F00'
      ctx.beginPath(); ctx.arc(p.x-p.vx*0.5,p.y-p.vy*0.5,p.r*0.4,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // ── VESSEL SHELL BORDER (on top) ──────────────────────────────────────
    ctx.beginPath(); ctx.moveTo(leftPts[0][0],leftPts[0][1])
    leftPts.forEach(p=>ctx.lineTo(p[0],p[1]))
    ctx.strokeStyle='#2c4055'; ctx.lineWidth=2; ctx.stroke()
    ctx.beginPath(); ctx.moveTo(rightPts[0][0],rightPts[0][1])
    rightPts.forEach(p=>ctx.lineTo(p[0],p[1]))
    ctx.stroke()

    // ── OXYGEN LANCE ─────────────────────────────────────────────────────
    const LANCE_X    = VCX + W*0.008
    const LANCE_TOP  = VT - H*0.08
    const LANCE_BOT  = LANCE_TIP_Y
    const LANCE_W    = clamp(W*0.018,10,18)

    // Lance body (water-cooled tube)
    const lanceGrd=ctx.createLinearGradient(LANCE_X-LANCE_W/2,0,LANCE_X+LANCE_W/2,0)
    lanceGrd.addColorStop(0,'#1a3a4a'); lanceGrd.addColorStop(0.5,'#29B6F6'); lanceGrd.addColorStop(1,'#1a3a4a')
    ctx.fillStyle=lanceGrd; ctx.fillRect(LANCE_X-LANCE_W/2,LANCE_TOP,LANCE_W,LANCE_BOT-LANCE_TOP)
    ctx.strokeStyle='#0288D1'; ctx.lineWidth=0.8; ctx.strokeRect(LANCE_X-LANCE_W/2,LANCE_TOP,LANCE_W,LANCE_BOT-LANCE_TOP)
    // Cooling water channels
    for(let ly=LANCE_TOP+8;ly<LANCE_BOT-4;ly+=16){
      ctx.fillStyle='rgba(41,182,246,0.12)'; ctx.fillRect(LANCE_X-LANCE_W/2,ly,LANCE_W,6)
    }
    // Lance tip (copper nozzle)
    ctx.fillStyle='#FF8F00'; ctx.fillRect(LANCE_X-LANCE_W/2-2,LANCE_BOT-8,LANCE_W+4,10)
    ctx.strokeStyle='#FFB300'; ctx.lineWidth=0.8; ctx.strokeRect(LANCE_X-LANCE_W/2-2,LANCE_BOT-8,LANCE_W+4,10)

    // O2 JET from lance tip (4 convergent jets)
    if (running && blowPct > 0) {
      ;[-0.35,-0.12,0.12,0.35].forEach((angle,ki) => {
        const jvx=Math.sin(angle)*14, jvy=18
        const jx2=LANCE_X+Math.sin(angle)*6, jy=LANCE_BOT
        const jetG=ctx.createLinearGradient(jx2,jy,jx2+jvx*1.5,jy+jvy*1.5)
        jetG.addColorStop(0,`rgba(100,180,255,${0.8*sim.lanceFlame})`)
        jetG.addColorStop(0.5,`rgba(150,210,255,${0.5*sim.lanceFlame})`)
        jetG.addColorStop(1,'rgba(100,180,255,0)')
        ctx.strokeStyle=jetG; ctx.lineWidth=2.5
        ctx.beginPath(); ctx.moveTo(jx2,jy); ctx.lineTo(jx2+jvx*1.5,jy+jvy*1.5); ctx.stroke()
        // Impact glow
        const ig=ctx.createRadialGradient(LANCE_X,LANCE_TIP_Y+30,2,LANCE_X,LANCE_TIP_Y+30,28*sim.lanceFlame)
        ig.addColorStop(0,`rgba(255,230,100,${0.55*sim.lanceFlame})`)
        ig.addColorStop(0.5,`rgba(255,120,0,${0.3*sim.lanceFlame})`)
        ig.addColorStop(1,'rgba(255,60,0,0)')
        ctx.fillStyle=ig; ctx.fillRect(LANCE_X-40,LANCE_TIP_Y,80,60)
      })
    }

    // O2 jet particles
    sim.o2Jets.forEach(p=>{
      ctx.globalAlpha=p.life*0.7; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // Lance label
    lblB('O₂ LANCE',LANCE_X+LANCE_W/2+8,LANCE_TOP+20,'#0288D1',clamp(W*0.010,8,10),'left')
    lbl(`H:${lanceHeight}mm`,LANCE_X+LANCE_W/2+8,LANCE_TOP+32,running?'#29B6F6':'#37474F',clamp(W*0.009,7,9),'left')
    lbl(`${o2Flow} Nm³/m`,LANCE_X+LANCE_W/2+8,LANCE_TOP+42,running?'#81D4FA':'#37474F',clamp(W*0.009,7,9),'left')

    // ── OFF-GAS HOOD & COLLECTION ────────────────────────────────────────
    const HOOD_Y = VT - H*0.05
    ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
    // Hood funnel shape
    ctx.beginPath()
    ctx.moveTo(VCX-vHW(0)*0.8,HOOD_Y+H*0.04)
    ctx.lineTo(VCX-W*0.055,HOOD_Y)
    ctx.lineTo(VCX-W*0.045,HOOD_Y-H*0.05)
    ctx.lineTo(VCX+W*0.045,HOOD_Y-H*0.05)
    ctx.lineTo(VCX+W*0.055,HOOD_Y)
    ctx.lineTo(VCX+vHW(0)*0.8,HOOD_Y+H*0.04)
    ctx.closePath(); ctx.fill(); ctx.stroke()
    // Off-gas duct
    ctx.strokeStyle=running?`rgba(${130+Math.round(30*Math.sin(sim.t*2))},120,60,0.7)`:'#1a2535'; ctx.lineWidth=12
    ctx.beginPath(); ctx.moveTo(VCX+W*0.045,HOOD_Y-H*0.05); ctx.bezierCurveTo(VCX+W*0.10,HOOD_Y-H*0.07,W*0.80,HOOD_Y-H*0.06,W*0.85,H*0.08); ctx.stroke()
    lbl('OFF-GAS',W*0.83,H*0.06,running?'#9B8040':'#2c4055',clamp(W*0.009,7,9),'left')
    lbl('→ GCP/OG SYSTEM',W*0.83,H*0.075,'#37474F',clamp(W*0.008,6,8),'left')
    lbl(`CO:${sim.frame%60<30?Math.round(65+sim.offGasFlow*15):'--'}% CO₂:${sim.frame%60<30?Math.round(14+sim.offGasFlow*5):'--'}%`,W*0.83,H*0.088,running?'#8BC34A':'#2c4055',clamp(W*0.008,6,8),'left')

    // Off-gas particles
    sim.offGasParticles.forEach(p=>{
      ctx.globalAlpha=p.life*0.42; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // ── HOT METAL LADLE (left side) ──────────────────────────────────────
    const HL_X=W*0.08, HL_Y=H*0.25, HL_W=W*0.10, HL_H=H*0.22
    ctx.fillStyle='#263340'; ctx.strokeStyle='#37474F'; ctx.lineWidth=1.5
    ctx.beginPath(); ctx.moveTo(HL_X,HL_Y); ctx.lineTo(HL_X+HL_W,HL_Y); ctx.lineTo(HL_X+HL_W-6,HL_Y+HL_H); ctx.lineTo(HL_X+6,HL_Y+HL_H); ctx.closePath(); ctx.fill(); ctx.stroke()
    // Steel in ladle
    const lg2=ctx.createLinearGradient(0,HL_Y+HL_H*0.1,0,HL_Y+HL_H)
    lg2.addColorStop(0,'rgba(255,110,0,0.9)'); lg2.addColorStop(1,'rgba(190,45,0,0.75)')
    ctx.fillStyle=lg2
    ctx.beginPath(); ctx.moveTo(HL_X+8,HL_Y+HL_H*0.1); ctx.lineTo(HL_X+HL_W-8,HL_Y+HL_H*0.1); ctx.lineTo(HL_X+HL_W-12,HL_Y+HL_H-2); ctx.lineTo(HL_X+12,HL_Y+HL_H-2); ctx.closePath(); ctx.fill()
    // Ladle crane hook
    ctx.fillStyle='#1a2535'; ctx.fillRect(HL_X+HL_W/2-3,HL_Y-H*0.06,6,H*0.06)
    lblB('HOT METAL',HL_X+HL_W/2,HL_Y-H*0.07,'#FF8F00',clamp(W*0.010,8,10))
    lbl(`${hmWeight}t  ${hmTemp}°C`,HL_X+HL_W/2,HL_Y+HL_H*0.38,'#FF7043',clamp(W*0.009,7,9))
    lbl(`C:${hmC}% Si:${hmSi}%`,HL_X+HL_W/2,HL_Y+HL_H*0.55,'rgba(200,180,160,0.7)',clamp(W*0.009,7,8))
    lbl(`Mn:${hmMn}% P:${hmP}%`,HL_X+HL_W/2,HL_Y+HL_H*0.70,'rgba(200,180,160,0.7)',clamp(W*0.009,7,8))

    // Pour stream from ladle to vessel
    if (blowPct === 0 && !running) {
      ctx.strokeStyle='rgba(255,100,0,0.4)'; ctx.lineWidth=6; ctx.setLineDash([6,4])
      ctx.beginPath(); ctx.moveTo(HL_X+HL_W,HL_Y+HL_H*0.5); ctx.bezierCurveTo(HL_X+HL_W+30,HL_Y+HL_H*0.5,VCX-vHW(0.05)-10,VT+VH*0.05,VCX-vHW(0.1),VT+VH*0.10); ctx.stroke()
      ctx.setLineDash([])
    }

    // ── SUB-LANCE ────────────────────────────────────────────────────────
    if (sim.subLanceDeploy) {
      const SLX=VCX-LANCE_W*1.8, SLY0=VT-H*0.04, SLY1=SLY0+sim.subLanceY
      ctx.fillStyle='#2c3e50'; ctx.strokeStyle='#546E7A'; ctx.lineWidth=0.8
      ctx.fillRect(SLX-3,SLY0,6,SLY1-SLY0); ctx.strokeRect(SLX-3,SLY0,6,SLY1-SLY0)
      // Thermocouple tip
      ctx.fillStyle='#FFB300'; ctx.beginPath(); ctx.arc(SLX,SLY1,5,0,Math.PI*2); ctx.fill()
      lblB('SUB-LANCE',SLX-8,SLY0-6,'#57ab5a',clamp(W*0.009,7,9),'right')
      if (sim.measuredTemp) {
        lbl(`T=${sim.measuredTemp}°C`,SLX-8,SLY0+4,'#57ab5a',clamp(W*0.009,7,9),'right')
        lbl(`[C]=${sim.measuredC}%`,SLX-8,SLY0+14,'#57ab5a',clamp(W*0.009,7,9),'right')
      }
    }

    // ── ZONE ANNOTATIONS inside vessel ───────────────────────────────────
    if (blowPct > 0) {
      // Impact zone annotation
      const impY = LANCE_TIP_Y + 20
      ctx.strokeStyle='rgba(100,180,255,0.22)'; ctx.lineWidth=1; ctx.setLineDash([2,4])
      ctx.beginPath(); ctx.ellipse(VCX,impY,vHW(0.28)*0.35,20,0,0,Math.PI*2); ctx.stroke()
      ctx.setLineDash([])
      lbl('IMPACT ZONE',VCX+vHW(0.28)*0.38,impY+4,'rgba(100,180,255,0.40)',clamp(W*0.009,7,9),'left')

      // Decarburization zone
      if (sim.bathC < hmC * 0.7) {
        ctx.strokeStyle='rgba(165,210,80,0.20)'; ctx.lineWidth=1; ctx.setLineDash([3,4])
        ctx.beginPath(); ctx.ellipse(VCX,BATH_SURFACE_Y-VH*0.08,vHW(0.45)*0.7,VH*0.10,0,0,Math.PI*2); ctx.stroke()
        ctx.setLineDash([])
        lbl('DECARB ZONE',VCX-vHW(0.45)*0.75,BATH_SURFACE_Y-VH*0.08,'rgba(165,210,80,0.30)',clamp(W*0.009,7,8),'right')
      }

      // Slag-metal interface
      ctx.strokeStyle='rgba(200,180,60,0.25)'; ctx.lineWidth=1; ctx.setLineDash([4,4])
      ctx.beginPath(); ctx.moveTo(VCX-slagHW2*0.9,BATH_SURFACE_Y); ctx.lineTo(VCX+slagHW2*0.9,BATH_SURFACE_Y); ctx.stroke()
      ctx.setLineDash([])
      lbl('SLAG-METAL INTERFACE',VCX+slagHW2*0.95,BATH_SURFACE_Y+4,'rgba(200,180,60,0.30)',clamp(W*0.009,7,8),'left')
    }

    // ── GAS LABELS ────────────────────────────────────────────────────────
    if (running && blowPct > 0) {
      lbl('CO↑',VCX+vHW(0.5)*0.5,BATH_SURFACE_Y-VH*0.25,'rgba(180,155,50,0.55)',clamp(W*0.010,8,10))
      lbl('CO→CO₂',VCX+vHW(0.3)*0.4,VT+VH*0.18,'rgba(120,155,70,0.48)',clamp(W*0.009,7,9))
      if (blowPct < 15) lbl('H₂O↑',VCX-vHW(0.5)*0.4,BATH_SURFACE_Y-VH*0.18,'rgba(180,210,230,0.42)',clamp(W*0.009,7,9))
    }

    // ── BLOW PROGRESS BAR ────────────────────────────────────────────────
    const BP_X=W*0.68,BP_Y=H*0.06,BP_W=W*0.27,BP_H=12
    ctx.fillStyle='#0d1520'; ctx.fillRect(BP_X,BP_Y,BP_W,BP_H)
    const bpCol = blowPct>90?'#f85149':blowPct>70?'#FF8F00':blowPct>40?'#FFB300':'#1565C0'
    ctx.fillStyle=bpCol; ctx.fillRect(BP_X,BP_Y,BP_W*(blowPct/100),BP_H)
    ctx.strokeStyle='#1e3040'; ctx.lineWidth=0.8; ctx.strokeRect(BP_X,BP_Y,BP_W,BP_H)
    lblB(`BLOW ${blowPct.toFixed(1)}%`,BP_X+BP_W/2,BP_Y-4,bpCol,clamp(W*0.010,8,11))

    // ── HUD ──────────────────────────────────────────────────────────────
    const HX=W*0.68,HY=H*0.10,HW=W*0.27,RH=26
    ctx.fillStyle='rgba(4,8,18,0.86)'; ctx.fillRect(HX-4,HY,HW+8,RH*14+12)
    ctx.strokeStyle='#1a3050'; ctx.lineWidth=0.8; ctx.strokeRect(HX-4,HY,HW+8,RH*14+12)
    lblB('BOF PROCESS MONITOR',HX+HW/2,HY+14,'#3d6a8a',clamp(W*0.010,8,11))
    const hudRows=[
      ['BATH TEMP',     `${Math.round(sim.bathTemp)} °C`,   heatColor(sim.bathTemp,1400,1700)],
      ['TARGET TEMP',   `${targetTemp} °C`,                 '#546E7A'],
      ['BATH [C]%',     `${sim.bathC.toFixed(3)} %`,        '#29B6F6'],
      ['TARGET [C]%',   `${targetC} %`,                     '#546E7A'],
      ['BATH [Si]%',    `${sim.bathSi.toFixed(3)} %`,       '#FFB300'],
      ['BATH [Mn]%',    `${sim.bathMn.toFixed(3)} %`,       '#9b5de5'],
      ['O₂ FLOW',       `${o2Flow} Nm³/m`,                  '#29B6F6'],
      ['LANCE HEIGHT',  `${lanceHeight} mm`,                '#78909C'],
      ['SLAG THICK',    `${Math.round(sim.slagThickness)} mm`, '#8BC34A'],
      ['SLAG FOAM',     `${(sim.slagFoaming*100).toFixed(0)} %`, '#7C9060'],
      ['OFF-GAS CO',    running?`${Math.round(65+sim.offGasFlow*15)} %`:'--', '#8BC34A'],
      ['O₂ CONSUMED',   `${Math.round(blowPct*hmWeight*hmC/100*1.333/100)} Nm³`, '#4FC3F7'],
      ['SUB-LANCE',     sim.subLanceDeploy?`${sim.measuredTemp}°C`:'STANDBY', sim.subLanceDeploy?'#57ab5a':'#37474F'],
      ['STATUS',        running?`BLOWING ${blowPct.toFixed(0)}%`:'STANDBY', running?'#57ab5a':'#546E7A'],
    ]
    hudRows.forEach(([l,v,c],i)=>{
      const ry=HY+18+i*RH
      ctx.fillStyle='#0a1422'; ctx.fillRect(HX,ry,HW,RH-2)
      ctx.strokeStyle='#1a3050'; ctx.lineWidth=0.3; ctx.strokeRect(HX,ry,HW,RH-2)
      ctx.fillStyle='#4d7a9a'; ctx.font=`${clamp(W*0.009,7,10)}px monospace`; ctx.textAlign='left'; ctx.fillText(l,HX+5,ry+11)
      ctx.fillStyle=c; ctx.font=`bold ${clamp(W*0.010,8,11)}px monospace`; ctx.textAlign='right'; ctx.fillText(v,HX+HW-4,ry+RH-5)
    })

    // ── STATUS STRIP ──────────────────────────────────────────────────────
    ctx.fillStyle='rgba(4,8,18,0.82)'; ctx.fillRect(0,0,W,H*0.027)
    ;[
      {l:'BATH TEMP',  v:`${Math.round(sim.bathTemp)}°C`,  c:heatColor(sim.bathTemp,1400,1700)},
      {l:'BATH [C]',   v:`${sim.bathC.toFixed(3)}%`,       c:'#29B6F6'},
      {l:'BLOW',       v:`${blowPct.toFixed(1)}%`,         c:blowPct>90?'#f85149':'#FF8F00'},
      {l:'SLAG FOAM',  v:`${(sim.slagFoaming*100).toFixed(0)}%`, c:'#8BC34A'},
      {l:'OFF-GAS CO', v:running?`${Math.round(65+sim.offGasFlow*15)}%`:'--', c:'#9B8040'},
      {l:'STATUS',     v:running?'BLOWING ●':'STANDBY ○',  c:running?'#57ab5a':'#546E7A'},
    ].forEach(({l,v,c},ki)=>{
      const px=W*0.01+ki*W*0.165
      ctx.fillStyle='#4d7a9a'; ctx.font=`${clamp(W*0.009,6,9)}px monospace`; ctx.textAlign='left'; ctx.fillText(l,px,H*0.012)
      ctx.fillStyle=c; ctx.font=`bold ${clamp(W*0.010,7,10)}px monospace`; ctx.fillText(v,px,H*0.023)
    })

    // ── HOVER TOOLTIPS ────────────────────────────────────────────────────
    const mx=mouseRef.current.x, my=mouseRef.current.y
    let tooltip=null

    // Hit: bath (steel melt)
    if (!tooltip && my>BATH_SURFACE_Y && my<VB) {
      const yFrac=clamp((my-VT)/VH,0,1)
      const hw2=vHW(yFrac)*0.88
      if (mx>VCX-hw2 && mx<VCX+hw2) {
        tooltip={title:'LIQUID STEEL BATH',color:heatColor(sim.bathTemp,1380,1700),lines:[
          {label:'Temperature',value:`${Math.round(sim.bathTemp)} °C`,col:heatColor(sim.bathTemp,1380,1700)},
          {label:'Carbon [C]',value:`${sim.bathC.toFixed(4)} %`,col:'#29B6F6'},
          {label:'Silicon [Si]',value:`${sim.bathSi.toFixed(4)} %`,col:'#FFB300'},
          {label:'Manganese [Mn]',value:`${sim.bathMn.toFixed(4)} %`,col:'#9b5de5'},
          {label:'Reactions',value:'C+O₂→CO  Si+O₂→SiO₂',col:'#8BC34A'},
          {label:'Gas evolved',value:'CO bubbles rising → CO₂',col:'rgba(180,155,50,0.9)'},
          {label:'Weight',value:`~${Math.round(hmWeight+scrapWeight)} t (HM+Scrap)`,col:'#78909C'},
        ]}
      }
    }

    // Hit: slag layer
    if (!tooltip && my>SLAG_Y && my<BATH_SURFACE_Y) {
      const sf=clamp((SLAG_Y-VT)/VH,0,1)
      if (mx>VCX-vHW(sf)*0.92 && mx<VCX+vHW(sf)*0.92) {
        tooltip={title:'SLAG LAYER',color:'#8BC34A',lines:[
          {label:'Thickness',value:`${Math.round(sim.slagThickness)} mm`,col:'#8BC34A'},
          {label:'Foaming',value:`${(sim.slagFoaming*100).toFixed(0)} % intensity`,col:'#7C9060'},
          {label:'Composition',value:'CaO-SiO₂-FeO-MnO-Al₂O₃',col:'rgba(180,200,160,0.9)'},
          {label:'Basicity V',value:`~${(2.5+sim.slagFoaming*0.8).toFixed(1)} CaO/SiO₂`,col:'#A5D6A7'},
          {label:'Role',value:'Dephosphorisation, desulphurisation',col:'rgba(180,200,160,0.9)'},
          {label:'Foaming by',value:'CO gas bubbles through slag',col:'rgba(180,155,50,0.9)'},
        ]}
      }
    }

    // Hit: lance
    if (!tooltip && mx>LANCE_X-20 && mx<LANCE_X+20 && my>VT-H*0.08 && my<LANCE_TIP_Y) {
      tooltip={title:'OXYGEN LANCE',color:'#29B6F6',lines:[
          {label:'Height',value:`${lanceHeight} mm from bath`,col:'#29B6F6'},
          {label:'O₂ flow',value:`${o2Flow} Nm³/min`,col:'#81D4FA'},
          {label:'O₂ pressure',value:'~10–12 bar at tip',col:'#4FC3F7'},
          {label:'Cooling',value:'Water-cooled copper tip',col:'#0288D1'},
          {label:'Jet type',value:'Laval nozzle — supersonic jets',col:'rgba(180,200,210,0.9)'},
          {label:'Impact',value:'Creates cavity in bath surface',col:'rgba(180,200,210,0.9)'},
          {label:'Reaction',value:'O₂+C→CO  O₂+Si→SiO₂  O₂+Fe→FeO',col:'#8BC34A'},
      ]}
    }

    // Hit: impact zone
    if (!tooltip && blowPct>0) {
      const impY2=LANCE_TIP_Y+20
      if (Math.abs(mx-VCX)<vHW(0.28)*0.35 && Math.abs(my-impY2)<22) {
        tooltip={title:'IMPACT / COMBUSTION ZONE',color:'#FF8F00',lines:[
          {label:'Temperature',value:`~2000–2500°C at jet tip`,col:'#FF3D00'},
          {label:'O₂ jet',value:'Supersonic — 300–500 m/s',col:'#29B6F6'},
          {label:'Reaction 1',value:'C + O₂ → CO₂ (primary)',col:'#8BC34A'},
          {label:'Reaction 2',value:'Si + O₂ → SiO₂ → slag',col:'#FFB300'},
          {label:'Reaction 3',value:'Mn + O₂ → MnO → slag',col:'#9b5de5'},
          {label:'Reaction 4',value:'Fe + O₂ → FeO → slag',col:'#FF5722'},
          {label:'CO produced',value:'Rises through bath as bubbles',col:'rgba(180,155,50,0.9)'},
        ]}
      }
    }

    // Hit: CO gas bubble
    if (!tooltip) {
      sim.coGas.forEach(p=>{
        if (Math.sqrt((mx-p.x)**2+(my-p.y)**2)<Math.max(p.r*2.5,10)) {
          tooltip={title:'CO Gas (Rising)',color:'#B8A040',lines:[
            {label:'Type',value:'Carbon Monoxide CO',col:'#FFD54F'},
            {label:'Origin',value:'C + ½O₂ → CO  in bath',col:'rgba(180,200,210,0.9)'},
            {label:'Role',value:'Stirs bath — promotes homogeneity',col:'#A5D6A7'},
            {label:'Post-combustion',value:'CO + ½O₂ → CO₂ (above bath)',col:'#8BC34A'},
            {label:'Off-gas',value:`~${Math.round(65+sim.offGasFlow*15)}% CO in off-gas`,col:'rgba(180,155,50,0.9)'},
            {label:'Heat',value:'CO post-combustion adds ~15% heat',col:'#FF8F00'},
          ]}
        }
      })
    }

    // Hit: CO2 gas
    if (!tooltip) {
      sim.co2Gas.forEach(p=>{
        if (Math.sqrt((mx-p.x)**2+(my-p.y)**2)<Math.max(p.r*2.5,10)) {
          tooltip={title:'CO₂ Gas (Post-combustion)',color:'#6B9E45',lines:[
            {label:'Type',value:'Carbon Dioxide CO₂',col:'#8BC34A'},
            {label:'Origin',value:'CO + ½O₂ → CO₂ (hood zone)',col:'rgba(180,200,160,0.9)'},
            {label:'Zone',value:'Upper vessel / gas space',col:'#78909C'},
            {label:'Off-gas',value:`~${Math.round(14+sim.offGasFlow*5)}% CO₂ in off-gas`,col:'rgba(140,180,80,0.9)'},
            {label:'Goes to',value:'OG system → gas cleaning plant',col:'#A5D6A7'},
          ]}
        }
      })
    }

    // Hit: hot metal ladle
    if (!tooltip && mx>HL_X && mx<HL_X+HL_W && my>HL_Y && my<HL_Y+HL_H) {
      tooltip={title:'HOT METAL (BF Iron)',color:'#FF7043',lines:[
        {label:'Weight',value:`${hmWeight} t`,col:'#FF8F00'},
        {label:'Temperature',value:`${hmTemp} °C`,col:'#FF6D00'},
        {label:'Carbon [C]',value:`${hmC} %`,col:'#29B6F6'},
        {label:'Silicon [Si]',value:`${hmSi} %`,col:'#FFB300'},
        {label:'Manganese [Mn]',value:`${hmMn} %`,col:'#9b5de5'},
        {label:'Phosphorus [P]',value:`${hmP} %`,col:'#f85149'},
        {label:'Source',value:'Torpedo ladle from Blast Furnace',col:'#78909C'},
      ]}
    }

    // Hit: sub-lance
    if (!tooltip && sim.subLanceDeploy) {
      const SLX2=VCX-LANCE_W*1.8
      if (Math.abs(mx-SLX2)<15 && my>VT-H*0.04 && my<VT+sim.subLanceY) {
        tooltip={title:'SUB-LANCE MEASUREMENT',color:'#57ab5a',lines:[
          {label:'Measured temp',value:sim.measuredTemp?`${sim.measuredTemp} °C`:'---',col:'#57ab5a'},
          {label:'Measured [C]',value:sim.measuredC?`${sim.measuredC} %`:'---',col:'#29B6F6'},
          {label:'Blow point',value:`${blowPct.toFixed(0)}% of blow`,col:'#FF8F00'},
          {label:'Purpose',value:'Actual T+C at 85% blow',col:'rgba(180,200,210,0.9)'},
          {label:'Sensor',value:'Disposable thermocouple + C sensor',col:'#78909C'},
          {label:'Action',value:'Model corrected from measurement',col:'#A5D6A7'},
        ]}
      }
    }

    // Draw tooltip
    if (tooltip) {
      const TW=clamp(W*0.32,280,400)
      const lineH=25,pad=16
      const TH=pad*2+30+tooltip.lines.length*lineH+8
      let tx=mx+18, ty=my-TH/2
      if(tx+TW>W-10) tx=mx-TW-18
      if(ty<32) ty=32
      if(ty+TH>H-32) ty=H-TH-32
      ctx.shadowColor='rgba(0,0,0,0.65)'; ctx.shadowBlur=14
      ctx.fillStyle='rgba(5,12,25,0.95)'; ctx.strokeStyle=tooltip.color; ctx.lineWidth=1.5
      // Manual rounded rect (polyfill)
      const r6=6
      ctx.beginPath()
      ctx.moveTo(tx+r6,ty); ctx.lineTo(tx+TW-r6,ty); ctx.arcTo(tx+TW,ty,tx+TW,ty+r6,r6)
      ctx.lineTo(tx+TW,ty+TH-r6); ctx.arcTo(tx+TW,ty+TH,tx+TW-r6,ty+TH,r6)
      ctx.lineTo(tx+r6,ty+TH); ctx.arcTo(tx,ty+TH,tx,ty+TH-r6,r6)
      ctx.lineTo(tx,ty+r6); ctx.arcTo(tx,ty,tx+r6,ty,r6)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.shadowBlur=0
      ctx.fillStyle=tooltip.color+'28'; ctx.fillRect(tx+1,ty+1,TW-2,32)
      ctx.fillStyle=tooltip.color; ctx.font=`bold ${clamp(W*0.015,13,17)}px monospace`; ctx.textAlign='left'
      ctx.fillText(tooltip.title,tx+pad,ty+21)
      ctx.strokeStyle=tooltip.color+'45'; ctx.lineWidth=0.8
      ctx.beginPath(); ctx.moveTo(tx+pad,ty+36); ctx.lineTo(tx+TW-pad,ty+36); ctx.stroke()
      tooltip.lines.forEach((line,li)=>{
        const ly=ty+54+li*lineH
        ctx.fillStyle='rgba(170,195,215,0.90)'; ctx.font=`${clamp(W*0.012,11,14)}px monospace`; ctx.textAlign='left'
        ctx.fillText(line.label+':',tx+pad,ly)
        ctx.fillStyle=line.col; ctx.font=`bold ${clamp(W*0.012,11,14)}px monospace`; ctx.textAlign='right'
        const val=line.value.length>32?line.value.substring(0,30)+'…':line.value
        ctx.fillText(val,tx+TW-pad,ly)
      })
      ctx.fillStyle=tooltip.color; ctx.beginPath(); ctx.arc(mx,my,4,0,Math.PI*2); ctx.fill()
      ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1; ctx.stroke()
    }

    // Footer
    ctx.fillStyle='rgba(4,8,18,0.92)'; ctx.fillRect(0,H-18,W,18)
    ctx.fillStyle='#2c4055'; ctx.font=`${clamp(W*0.009,7,10)}px monospace`; ctx.textAlign='left'
    ctx.fillText(`BOF STEELMAKING  |  ${heatNo}  |  HM:${hmWeight}t  |  SCRAP:${scrapWeight}t  |  BLOW:${blowPct.toFixed(1)}%  |  ${new Date().toLocaleTimeString()}`,8,H-4)

    } catch(e) {
      ctx.fillStyle='#06090f'; ctx.fillRect(0,0,W,H)
      ctx.fillStyle='#e5534b'; ctx.font='14px monospace'; ctx.textAlign='left'
      ctx.fillText('RENDER ERROR: '+e.message,20,40)
      console.error('BOFCanvas error:',e)
    }

    rafRef.current = requestAnimationFrame(draw)
  }, [running, blowPct, speed, hmWeight, hmTemp, hmC, hmSi, hmMn, hmP, scrapWeight, targetTemp, targetC, lanceHeight, o2Flow, heatNo])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  return <canvas ref={canvasRef} style={{width:'100%',height:'100%',display:'block'}} />
}

// ─── UI ───────────────────────────────────────────────────────────────────────
const C = {
  bg:'#07090f', panel:'#0b1220', border:'#1a2d45',
  text:'#cdd9e5', muted:'#6e8098', accent:'#FF8F00',
  success:'#57ab5a', danger:'#e5534b', cyan:'#39c5cf',
}

function Slider({label,value,onChange,min,max,step=1,unit,disabled,color}){
  return(
    <div style={{marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
        <span style={{fontSize:10,color:C.muted,textTransform:'uppercase',letterSpacing:'0.07em'}}>{label}</span>
        <span style={{fontSize:11,color:color||C.accent,fontFamily:'monospace',fontWeight:700}}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)} disabled={disabled}
        style={{width:'100%',accentColor:color||C.accent,opacity:disabled?0.4:1,cursor:disabled?'not-allowed':'pointer',height:20}}/>
    </div>
  )
}

export default function BOFRealTimeTDModel(){
  const [running,setRunning]         = useState(false)
  const [blowPct,setBlowPct]         = useState(0)
  const [speed,setSpeed]             = useState(1)
  const [hmWeight,setHmWeight]       = useState(280)
  const [hmTemp,setHmTemp]           = useState(1345)
  const [hmC,setHmC]                 = useState(4.5)
  const [hmSi,setHmSi]               = useState(0.55)
  const [hmMn,setHmMn]               = useState(0.35)
  const [hmP,setHmP]                 = useState(0.12)
  const [scrapWeight,setScrapWeight] = useState(45)
  const [targetTemp,setTargetTemp]   = useState(1680)
  const [targetC,setTargetC]         = useState(0.06)
  const [lanceHeight,setLanceHeight] = useState(2200)
  const [o2Flow,setO2Flow]           = useState(520)
  const [panelOpen,setPanelOpen]     = useState(true)
  const [currentTemp,setCurrentTemp] = useState(1265)
  const [currentC,setCurrentC]       = useState('4.500')
  const [elapsed,setElapsed]         = useState(0)
  const [resetCount,setResetCount]   = useState(0)
  const [heatNo]                     = useState(`BF-${Math.floor(Math.random()*9000+1000)}`)
  const [extraData,setExtraData]     = useState({})
  const blowRef = useRef(null), timerRef = useRef(null)

  useEffect(()=>{
    if(running){
      blowRef.current=setInterval(()=>setBlowPct(v=>{if(v>=100){setRunning(false);return 100}return Math.min(100,v+speed*0.15)}),100)
      timerRef.current=setInterval(()=>setElapsed(t=>t+1),1000)
    } else {
      clearInterval(blowRef.current); clearInterval(timerRef.current)
    }
    return()=>{clearInterval(blowRef.current);clearInterval(timerRef.current)}
  },[running,speed])

  const startBlow=()=>{setRunning(true);setBlowPct(0);setElapsed(0);setResetCount(c=>c+1)}
  const stopBlow=()=>setRunning(false)
  const fmt=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`

  const tempDiff = currentTemp - targetTemp
  const cDiff    = parseFloat(currentC) - targetC

  return(
    <div style={{height:'100dvh',background:C.bg,color:C.text,fontFamily:'monospace',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{background:'#060a10',borderBottom:`1px solid ${C.border}`,padding:'0 12px',height:48,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:20}}>🔥</span>
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'0.04em'}}>BOF REAL-TIME TD MODEL</div>
            <div style={{fontSize:8,color:C.muted,letterSpacing:'0.1em'}}>TEMPERATURE & DECARBURISATION PREDICTION · VIRTUAL PLANT</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {[
            {l:'TIME',  v:fmt(elapsed),              c:running?C.success:C.muted},
            {l:'TEMP',  v:`${currentTemp}°C`,        c:tempDiff>20?C.danger:tempDiff<-20?'#29B6F6':C.success},
            {l:'[C]%',  v:`${currentC}%`,            c:parseFloat(currentC)>targetC+0.05?'#FF8F00':C.success},
            {l:'BLOW',  v:`${blowPct.toFixed(1)}%`,  c:blowPct>90?C.danger:'#FF8F00'},
            {l:'HEAT',  v:heatNo,                    c:C.muted},
          ].map(item=>(
            <div key={item.l} style={{textAlign:'center'}}>
              <div style={{fontSize:7,color:C.muted}}>{item.l}</div>
              <div style={{fontSize:12,fontWeight:700,color:item.c}}>{item.v}</div>
            </div>
          ))}
          <button onClick={()=>setPanelOpen(v=>!v)}
            style={{padding:'4px 8px',borderRadius:3,border:`1px solid ${C.border}`,background:'transparent',color:C.muted,fontSize:11,cursor:'pointer'}}>
            {panelOpen?'◀':'▶'}
          </button>
          {!running && blowPct<100 && <button onClick={startBlow} style={{padding:'6px 14px',borderRadius:4,border:`1px solid ${C.success}`,background:'rgba(87,171,90,0.15)',color:C.success,fontSize:11,fontWeight:700,cursor:'pointer'}}>▶ START BLOW</button>}
          {running && <button onClick={stopBlow} style={{padding:'6px 14px',borderRadius:4,border:`1px solid ${C.danger}`,background:'rgba(229,83,73,0.15)',color:C.danger,fontSize:11,fontWeight:700,cursor:'pointer'}}>⏹ STOP</button>}
          {blowPct>=100 && <button onClick={()=>{setBlowPct(0);setElapsed(0);setRunning(false);setResetCount(c=>c+1)}} style={{padding:'6px 14px',borderRadius:4,border:`1px solid ${C.cyan}`,background:'rgba(57,197,207,0.15)',color:C.cyan,fontSize:11,fontWeight:700,cursor:'pointer'}}>↺ NEW HEAT</button>}
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {panelOpen&&(
          <div style={{width:220,background:C.panel,borderRight:`1px solid ${C.border}`,overflow:'auto',flexShrink:0,padding:'12px'}}>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:10}}>HOT METAL</div>
            <Slider label="HM Weight"  value={hmWeight}  onChange={setHmWeight}  min={150} max={380} unit="t"   disabled={running} color='#FF7043'/>
            <Slider label="HM Temp"    value={hmTemp}    onChange={setHmTemp}    min={1280} max={1420} unit="°C" disabled={running} color='#FF6D00'/>
            <Slider label="HM [C]%"    value={hmC}       onChange={setHmC}       min={3.5} max={5.0} step={0.05} unit="%" disabled={running} color='#29B6F6'/>
            <Slider label="HM [Si]%"   value={hmSi}      onChange={setHmSi}      min={0.10} max={1.50} step={0.05} unit="%" disabled={running} color='#FFB300'/>
            <Slider label="HM [Mn]%"   value={hmMn}      onChange={setHmMn}      min={0.10} max={1.0} step={0.05} unit="%" disabled={running} color='#9b5de5'/>
            <Slider label="HM [P]%"    value={hmP}       onChange={setHmP}       min={0.05} max={0.35} step={0.01} unit="%" disabled={running} color='#f85149'/>
            <Slider label="Scrap Wt"   value={scrapWeight} onChange={setScrapWeight} min={10} max={120} unit="t" disabled={running} color='#546E7A'/>
            <div style={{height:1,background:C.border,margin:'10px 0'}}/>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:10}}>TARGETS</div>
            <Slider label="Target Temp"  value={targetTemp} onChange={setTargetTemp} min={1600} max={1750} unit="°C" disabled={running} color='#57ab5a'/>
            <Slider label="Target [C]%"  value={targetC}    onChange={setTargetC}    min={0.02} max={0.50} step={0.01} unit="%" disabled={running} color='#57ab5a'/>
            <div style={{height:1,background:C.border,margin:'10px 0'}}/>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:10}}>BLOW CONTROL</div>
            <Slider label="Lance Height" value={lanceHeight} onChange={setLanceHeight} min={1400} max={3000} step={50} unit="mm" color='#29B6F6'/>
            <Slider label="O₂ Flow"      value={o2Flow}      onChange={setO2Flow}      min={300} max={650} unit=" Nm³/m" color='#81D4FA'/>
            <Slider label="Blow Speed"   value={speed}       onChange={setSpeed}       min={0.5} max={3.0} step={0.1} unit="x" color='#FF8F00'/>
            <div style={{height:1,background:C.border,margin:'10px 0'}}/>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:8}}>PREDICTIONS</div>
            {[
              {l:'Bath Temp',  v:`${currentTemp}°C`,      c:tempDiff>20?C.danger:tempDiff<-20?'#29B6F6':C.success},
              {l:'Bath [C]',   v:`${currentC}%`,           c:cDiff>0.05?'#FF8F00':C.success},
              {l:'Temp diff',  v:`${tempDiff>0?'+':''}${tempDiff}°C`, c:Math.abs(tempDiff)<15?C.success:C.danger},
              {l:'C diff',     v:`${cDiff>0?'+':''}${cDiff.toFixed(3)}%`, c:Math.abs(cDiff)<0.02?C.success:C.danger},
            ].map(r=>(
              <div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:9,color:C.muted}}>{r.l}</span>
                <span style={{fontSize:10,fontWeight:600,color:r.c}}>{r.v}</span>
              </div>
            ))}
            <div style={{height:1,background:C.border,margin:'10px 0'}}/>
            <div style={{fontSize:9,color:'#4d7a9a',marginBottom:4}}>HOVER TOOLTIPS</div>
            {[['🔵','Liquid steel bath'],['🟢','Slag layer'],['⚡','Impact/combustion zone'],['🟡','CO gas bubbles'],['🟩','CO₂ post-combustion'],['🔧','O₂ lance'],['🏺','Hot metal ladle'],['📡','Sub-lance']].map(([ic,l])=>(
              <div key={l} style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                <span style={{fontSize:11}}>{ic}</span><span style={{fontSize:8,color:C.muted}}>{l}</span>
              </div>
            ))}
            <div style={{height:1,background:C.border,margin:'8px 0'}}/>
            <div style={{fontSize:9,color:'#4d7a9a',marginBottom:4}}>KEY REACTIONS</div>
            {['C+O₂→CO (decarb)','Si+O₂→SiO₂ (slag)','Mn+O₂→MnO (slag)','CO+½O₂→CO₂ (hood)','CaO+SiO₂→slag (dephosphor)'].map(r=><div key={r} style={{fontSize:8,color:C.muted,marginBottom:3}}>{r}</div>)}
          </div>
        )}
        <div style={{flex:1,overflow:'hidden',background:'#06090f'}}>
          <BOFCanvas
            running={running} blowPct={blowPct} speed={speed}
            hmWeight={hmWeight} hmTemp={hmTemp} hmC={hmC}
            hmSi={hmSi} hmMn={hmMn} hmP={hmP}
            scrapWeight={scrapWeight} targetTemp={targetTemp} targetC={targetC}
            lanceHeight={lanceHeight} o2Flow={o2Flow} heatNo={heatNo}
            setCurrentTemp={setCurrentTemp} setCurrentC={setCurrentC}
            setMoldLevel={()=>{}}
            onDataUpdate={setExtraData}
            doReset={resetCount}
          />
        </div>
      </div>
    </div>
  )
}
