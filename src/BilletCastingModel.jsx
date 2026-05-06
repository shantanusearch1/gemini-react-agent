import { useState, useEffect, useRef, useCallback } from 'react'

const N = 6
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function heatColor(temp, min = 500, max = 1550) {
  const t = clamp((temp - min) / (max - min), 0, 1)
  if (t > 0.85) return `rgba(255,${Math.round(80 + (1-t)*120)},0,0.95)`
  if (t > 0.65) return `rgba(${Math.round(180+t*75)},${Math.round(40+t*30)},0,0.92)`
  if (t > 0.40) return `rgba(${Math.round(100+t*120)},${Math.round(30+t*40)},10,0.88)`
  if (t > 0.20) return `rgba(${Math.round(60+t*100)},${Math.round(70+t*30)},80,0.85)`
  return `rgba(${Math.round(55+t*60)},${Math.round(80+t*30)},90,0.82)`
}

// ─── CANVAS ───────────────────────────────────────────────────────────────────
function BilletCanvas({ running, strands, tundishTemp, billetSize, heatNo,
  ladleLevel, setLadleLevel, tundishLevel, setTundishLevel,
  setStrandMoldLevels, onBilletCut, doReset }) {

  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const S = useRef({
    t: 0, frame: 0,
    ladleKg: 250000, tundishKg: 22000, tundishMaxKg: 25000,
    ladleFlowRate: 0,
    rollAngle: 0, nozzlePulse: 0,
    totalBilletsCut: 0,
    strands: Array.from({ length: N }, () => ({
      segments: [],
      moldLevel: 85, moldOsc: 0, moldDir: 1,
      // TCM moves VERTICALLY down the strand
      torchY: 0, torchOn: false, torchCD: Math.round(80 + Math.random()*60),
      billetLen: 0,        // accumulated length below TCM cut point
      targetBilletLen: 0,
      billetsCut: 0,
      // cut billets sit below the strand and move on HORIZONTAL roller table
      cutBillets: [],      // [{y (top of billet on roller table), temp, len, vx}]
      drops: [], sparks: [], steamPuffs: [],
    })),
  })

  useEffect(() => {
    const el = canvasRef.current; if (!el) return
    const fit = () => { el.width = el.parentElement.clientWidth; el.height = el.parentElement.clientHeight }
    fit(); window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  useEffect(() => {
    if (!doReset) return
    const sim = S.current
    sim.t = 0; sim.frame = 0
    sim.ladleKg = 250000; sim.tundishKg = 22000
    sim.ladleFlowRate = 0; sim.rollAngle = 0; sim.nozzlePulse = 0
    sim.totalBilletsCut = 0
    sim.strands = Array.from({ length: N }, () => ({
      segments: [], moldLevel: 85, moldOsc: 0, moldDir: 1,
      torchY: 0, torchOn: false, torchCD: Math.round(80 + Math.random()*60),
      billetLen: 0, targetBilletLen: 0, billetsCut: 0, cutBillets: [],
      drops: [], sparks: [], steamPuffs: [],
    }))
  }, [doReset])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return }
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    const sim = S.current
    sim.t += 0.016; sim.frame++

    // ── LAYOUT ──────────────────────────────────────────────────────────
    // Each strand is a VERTICAL column
    // Process top→bottom: Ladle→Tundish→SEN→Mold→Strand→TCM→Roller Table exit
    const MARGIN   = W * 0.008
    const STR_COL  = (W - MARGIN*2) / N   // width per strand column
    const CXS      = Array.from({length:N}, (_,i) => MARGIN + STR_COL*i + STR_COL/2)
    const BSZ      = clamp(STR_COL * 0.18, 8, 18)  // billet half-width

    const LADLE_Y0 = H * 0.01
    const LADLE_H  = H * 0.07
    const LADLE_W  = W * 0.20
    const LADLE_Y1 = LADLE_Y0 + LADLE_H

    const TUN_Y0   = LADLE_Y1 + H * 0.015
    const TUN_H    = H * 0.038
    const TUN_Y1   = TUN_Y0 + TUN_H

    const SEN_H    = H * 0.024
    const MOLD_H   = H * 0.07
    const MWALL    = clamp(STR_COL * 0.10, 5, 11)

    const STR_H    = H * 0.31   // vertical strand length
    const PX_PER_M = STR_H / 6

    // TCM rail runs HORIZONTALLY across all strands, moves DOWN along each strand
    // It's a gantry-style machine

    // Roller table at the BOTTOM — billets exit HORIZONTALLY after cut
    const ROLLER_Y  = H * 0.80  // top of horizontal roller table
    const ROLLER_H  = clamp(H * 0.11, 32, 60)  // taller roller table
    const ROLLER_X0 = MARGIN
    const ROLLER_X1 = W - MARGIN

    // ── PHYSICS ─────────────────────────────────────────────────────────
    if (running) {
      const dt = 0.016
      const anyMoldSteel = sim.strands.some((ss,i) => strands[i].active && ss.moldLevel > 2)
      const anySegs      = sim.strands.some(ss => ss.segments.length > 0)
      const castingActive = anyMoldSteel || anySegs

      if (castingActive) {
        sim.rollAngle   += strands.reduce((a,s)=>a+(s.active?s.speed:0),0)/N * 0.07
        sim.nozzlePulse  = (sim.nozzlePulse + 0.11) % (Math.PI*2)
      } else {
        sim.strands.forEach(ss => { ss.moldOsc *= 0.92 })
      }

      // LADLE → TUNDISH
      const activeCount = strands.filter(s=>s.active).length
      const ladleFlow   = sim.ladleKg > 200 && activeCount > 0
        ? clamp(activeCount * 22 * (strands.filter(s=>s.active).reduce((a,s)=>a+s.speed,0)/Math.max(activeCount,1)), 35, 200)
        : 0
      sim.ladleFlowRate = ladleFlow
      const ladleOut = ladleFlow * dt
      sim.ladleKg = Math.max(0, sim.ladleKg - ladleOut)
      setLadleLevel(sim.ladleKg / 250000)

      const castKgS = strands.filter(s=>s.active).reduce((a,s)=>a + billetSize*billetSize*s.speed/60*7800/1e6, 0)
      sim.tundishKg = clamp(sim.tundishKg + ladleOut - castKgS*dt, 0, sim.tundishMaxKg)
      setTundishLevel(sim.tundishKg / sim.tundishMaxKg)
      const tFrac = sim.tundishKg / sim.tundishMaxKg

      const newMoldLevels = []

      sim.strands.forEach((ss, i) => {
        const strand = strands[i]
        const active = strand.active
        const sp     = strand.speed
        const mHS    = ss.moldLevel > 2
        const strandHasMetal = ss.segments.length > 0

        // Per-strand SEN Y positions
        const SEN_Y0 = TUN_Y1
        const SEN_Y1 = SEN_Y0 + SEN_H
        const MOLD_Y0 = SEN_Y1
        const MOLD_Y1 = MOLD_Y0 + MOLD_H
        const STR_Y0  = MOLD_Y1
        const STR_Y1  = STR_Y0 + STR_H

        // Mold oscillation
        if (active && mHS) {
          ss.moldOsc += ss.moldDir * 0.26; if (Math.abs(ss.moldOsc) > 2.8) ss.moldDir *= -1
        }

        // Mold level
        const mTgt = active && tFrac > 0.04 ? clamp(82+(tFrac-0.6)*18, 62, 95) : 0
        ss.moldLevel = clamp(
          ss.moldLevel + (active
            ? (mTgt - ss.moldLevel)*0.07 + (Math.random()-0.5)*0.32
            : ss.moldLevel > 0 ? -0.45 : 0),
          0, 99)
        newMoldLevels.push(ss.moldLevel)

        // Segments
        if (active && mHS) ss.segments.unshift({ temp: tundishTemp-4, solidFrac: 0 })
        ss.segments = ss.segments.map((seg,idx) => {
          const dM  = idx * sp * PX_PER_M * 0.016 / PX_PER_M
          const cool = 0.35 + (idx/Math.max(ss.segments.length,1))*2.0
          return { temp: Math.max(550, seg.temp - cool*sp*0.85), solidFrac: Math.min(1, seg.solidFrac + 0.004*sp*(0.5+dM*0.3)) }
        })
        const maxSegs = Math.ceil(STR_H / Math.max(sp*PX_PER_M*0.016, 0.3)) + 8
        if (ss.segments.length > maxSegs) ss.segments.splice(maxSegs)
        if (!mHS && ss.segments.every(s=>s.solidFrac>=0.99)) ss.segments = []

        // ── BILLET LENGTH TRACKING ───────────────────────────────────────
        // billetLen tracks how much of the strand has been cast since last cut
        // It grows as pixels exit the mold - exactly 1 px per PX_PER_M movement
        if (!ss.targetBilletLen)
          ss.targetBilletLen = clamp(STR_H * 0.55, 60, STR_H * 0.80)

        // Only grow billetLen when mold has steel (strand is actively casting)
        if (active && mHS) {
          ss.billetLen += sp * PX_PER_M * dt  // pixels grown this frame
        }

        // ── TCM LOGIC ─────────────────────────────────────────────────────
        // TCM torch travels DOWN the strand ALONGSIDE the moving billet.
        // It starts cutting ONLY when billetLen >= targetBilletLen.
        // The torch tracks the billet surface while cutting horizontally across.

        if (!ss.torchOn) {
          // Only trigger cut when full billet length has formed AND mold has steel
          if (active && mHS && ss.billetLen >= ss.targetBilletLen) {
            ss.torchOn = true
            // torch starts AT THE CUT POINT = STR_Y0 + billetLen from top
            ss.torchY = STR_Y0 + ss.billetLen
            ss.torchProgress = 0  // 0 = left side, 1 = right side
          }
        } else {
          // Torch tracks the strand: moves down at cast speed while cutting across
          ss.torchY += sp * PX_PER_M * dt
          // Torch cuts HORIZONTALLY across billet (progress 0→1 = left→right)
          ss.torchProgress = Math.min(1, (ss.torchProgress || 0) + 0.018 * sp)

          // Sparks shoot sideways (horizontal cut)
          if (sim.frame % 2 === 0) {
            const tx = CXS[i] - BSZ + ss.torchProgress * BSZ * 2
            for (let k = 0; k < 5; k++) ss.sparks.push({
              x: tx, y: ss.torchY,
              vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 4 - 0.5,
              life: 1, r: Math.random() * 2.5 + 0.5,
              col: Math.random() > 0.5 ? '#FF6D00' : '#FFD54F'
            })
          }
          if (sim.frame % 6 === 0) ss.steamPuffs.push({
            x: CXS[i] - BSZ + ss.torchProgress * BSZ * 2,
            y: ss.torchY - 2,
            vx: (Math.random()-0.5)*1.8, vy: -1.8-Math.random(), life:1, r:4
          })

          // Cut complete when torch crossed full width
          if (ss.torchProgress >= 1) {
            ss.torchOn = false
            ss.torchProgress = 0
            // Average exit temperature from bottom of strand segments
            const exitIdx = Math.min(ss.segments.length - 1, Math.floor(ss.segments.length * 0.85))
            const avgExitTemp = ss.segments.length > 0
              ? ss.segments.slice(exitIdx).reduce((a,s)=>a+s.temp,0) / Math.max(ss.segments.slice(exitIdx).length,1)
              : 900
            // Build heat map for this billet length
            const billetPxLen = clamp(ss.billetLen * 0.5, 20, 160)
            const billetTemps = Array.from({length: 40}, (_, k) => {
              // Billet temp: hot in middle (core), cooler at ends (surface)
              const posFromCenter = Math.abs(k/40 - 0.5) * 2
              return clamp(avgExitTemp - posFromCenter * 80, 600, 1400)
            })
            ss.cutBillets.push({
              x: CXS[i],   // start at strand centre
              // Strands 0-2 exit LEFT, strands 3-5 exit RIGHT
              vx: i < N/2 ? -(1.5 + sp * 0.6) : (1.5 + sp * 0.6),
              pxLen: billetPxLen,
              temps: billetTemps,
            })
            ss.billetLen = 0
            ss.billetsCut++
            sim.totalBilletsCut++
            onBilletCut()
          }
        }

        // Move cut billets on horizontal roller table — cool gradually
        ss.cutBillets = ss.cutBillets.map(b => ({
          ...b,
          x: b.x + b.vx,
          temps: b.temps.map(t => Math.max(350, t - sp * 0.08))
        })).filter(b => b.x > -400 && b.x < W + 400)

        // Spray drops — shoot horizontally from nozzles
        if (active && (mHS || strandHasMetal) && ss.drops.length < 22) {
          const pulse = Math.abs(Math.sin(sim.nozzlePulse + i*0.9))
          const zones = [STR_Y0+STR_H*0.10, STR_Y0+STR_H*0.38, STR_Y0+STR_H*0.65]
          zones.forEach(zy => {
            if (Math.random() < 0.35*sp*pulse) {
              ss.drops.push({x:CXS[i]-BSZ-2, y:zy+Math.random()*22, vx:-2.0-Math.random()*2, vy:0.5+Math.random()*0.5, life:1})
              ss.drops.push({x:CXS[i]+BSZ+2, y:zy+Math.random()*22, vx: 2.0+Math.random()*2, vy:0.5+Math.random()*0.5, life:1})
            }
          })
        }

        ss.sparks     = ss.sparks.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.18,life:p.life-0.04}))
        ss.drops      = ss.drops.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.032}))
        ss.steamPuffs = ss.steamPuffs.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,r:p.r+0.35,life:p.life-0.025}))
      })
      setStrandMoldLevels(newMoldLevels)
    }

    // ─────────────────────────────────────────────────────────────────────
    // DRAW
    // ─────────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#06090f'; ctx.fillRect(0,0,W,H)
    ctx.strokeStyle='rgba(255,255,255,0.015)'; ctx.lineWidth=0.5
    for(let gx=0;gx<W;gx+=34){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke()}
    for(let gy=0;gy<H;gy+=34){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke()}

    const lbl = (t,x,y,c='#78909C',sz=9,align='center') => {
      ctx.fillStyle=c; ctx.font=`${sz}px monospace`; ctx.textAlign=align; ctx.fillText(t,x,y)
    }

    // ── LADLE ────────────────────────────────────────────────────────────
    const LX = W/2 - LADLE_W/2
    ctx.fillStyle='#1a2535'
    ctx.fillRect(LX-7,LADLE_Y0,8,LADLE_H); ctx.fillRect(LX+LADLE_W-1,LADLE_Y0,8,LADLE_H)
    ctx.fillRect(LX-9,LADLE_Y0,LADLE_W+18,5)
    ctx.beginPath()
    ctx.moveTo(LX,LADLE_Y0+5); ctx.lineTo(LX+LADLE_W,LADLE_Y0+5)
    ctx.lineTo(LX+LADLE_W-10,LADLE_Y1); ctx.lineTo(LX+10,LADLE_Y1); ctx.closePath()
    ctx.fillStyle='#263340'; ctx.fill(); ctx.strokeStyle='#37474F'; ctx.lineWidth=1.5; ctx.stroke()
    const lstH = (LADLE_H-16)*ladleLevel
    if (lstH > 2) {
      const ty = LADLE_Y0+12+(LADLE_H-16-lstH)
      const lg = ctx.createLinearGradient(0,ty,0,ty+lstH)
      lg.addColorStop(0, running&&ladleLevel>0.01?`rgba(255,${110+40*Math.sin(sim.t*3)},0,0.95)`:'rgba(70,90,105,0.6)')
      lg.addColorStop(1, running&&ladleLevel>0.01?'rgba(175,30,0,0.75)':'rgba(45,62,78,0.4)')
      ctx.fillStyle=lg
      ctx.beginPath()
      ctx.moveTo(LX+12+(1-ladleLevel)*10,ty); ctx.lineTo(LX+LADLE_W-12-(1-ladleLevel)*10,ty)
      ctx.lineTo(LX+LADLE_W-12,ty+lstH); ctx.lineTo(LX+12,ty+lstH); ctx.closePath(); ctx.fill()
      if(running&&ladleLevel>0.01){
        ctx.fillStyle=`rgba(255,200,50,${0.3+0.2*Math.sin(sim.t*4)})`
        ctx.fillRect(LX+12+(1-ladleLevel)*10,ty,LADLE_W-24-(1-ladleLevel)*20,3)
      }
    }
    lbl('LADLE',W/2,LADLE_Y0-2,'#90A4AE',clamp(W*0.011,8,12))
    lbl(`${(ladleLevel*100).toFixed(0)}%  ${(ladleLevel*250).toFixed(0)}t`,W/2,LADLE_Y0+LADLE_H*0.55,running&&ladleLevel>0.01?'#FF8F00':'#546E7A',clamp(W*0.009,7,10))
    ctx.fillStyle=running&&ladleLevel>0.02?'#FF6D00':'#455A64'
    ctx.fillRect(W/2-3,LADLE_Y1-LADLE_H*0.28,6,LADLE_H*0.28)
    ctx.beginPath(); ctx.arc(W/2,LADLE_Y1,4,0,Math.PI*2)
    ctx.fillStyle=running&&ladleLevel>0.02?'#FF3D00':'#37474F'; ctx.fill()

    // ── SHROUD ───────────────────────────────────────────────────────────
    const shroudOpen = running&&ladleLevel>0.02&&sim.ladleKg>200
    ctx.fillStyle='#263238'; ctx.fillRect(W/2-5,LADLE_Y1,10,TUN_Y0-LADLE_Y1)
    if(shroudOpen){
      const fw=clamp(7*(sim.ladleFlowRate/160),2,8)
      const sf=ctx.createLinearGradient(0,LADLE_Y1,0,TUN_Y0)
      sf.addColorStop(0,'rgba(255,110,0,0.9)'); sf.addColorStop(1,'rgba(255,70,0,0.45)')
      ctx.fillStyle=sf; ctx.fillRect(W/2-fw/2,LADLE_Y1,fw,TUN_Y0-LADLE_Y1)
    }

    // ── TUNDISH (wide, spans all 6 strands) ──────────────────────────────
    const TW=W*0.90, TX=W*0.05
    ctx.beginPath()
    ctx.moveTo(TX,TUN_Y0); ctx.lineTo(TX+TW,TUN_Y0)
    ctx.lineTo(TX+TW-12,TUN_Y1); ctx.lineTo(TX+12,TUN_Y1); ctx.closePath()
    ctx.fillStyle='#1e2d3d'; ctx.fill(); ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.2; ctx.stroke()
    const tunSteelH=(TUN_H-7)*tundishLevel
    const tunSteelTop=TUN_Y1-5-tunSteelH
    if(tunSteelH>2){
      const tg=ctx.createLinearGradient(0,tunSteelTop,0,TUN_Y1-5)
      tg.addColorStop(0,running&&tundishLevel>0.01?`rgba(255,${120+25*Math.sin(sim.t*2.5)},0,0.9)`:'rgba(58,78,95,0.6)')
      tg.addColorStop(1,running&&tundishLevel>0.01?'rgba(188,48,0,0.74)':'rgba(40,60,78,0.45)')
      ctx.fillStyle=tg
      ctx.beginPath()
      ctx.moveTo(TX+14+(1-tundishLevel)*12,tunSteelTop); ctx.lineTo(TX+TW-14-(1-tundishLevel)*12,tunSteelTop)
      ctx.lineTo(TX+TW-14,TUN_Y1-5); ctx.lineTo(TX+14,TUN_Y1-5)
      ctx.closePath(); ctx.fill()
      if(running&&tundishLevel>0.01){
        ctx.fillStyle=`rgba(255,185,45,${0.24+0.14*Math.sin(sim.t*3.2)})`
        const tw2=TW-28-(1-tundishLevel)*24
        ctx.fillRect(W/2-tw2/2,tunSteelTop,tw2,3)
      }
    }
    lbl('6-STRAND TUNDISH',W/2,TUN_Y0-3,'#90A4AE',clamp(W*0.011,8,12))
    lbl(`${(tundishLevel*100).toFixed(0)}%  ${(tundishLevel*25).toFixed(1)}t  ${tundishTemp}°C  SH:${tundishTemp-1537}°C`,
      W/2,TUN_Y0+TUN_H*0.54,running&&tundishLevel>0.01?'#FFB300':'#546E7A',clamp(W*0.009,7,9))

    // ── HORIZONTAL ROLLER TABLE AT BOTTOM ────────────────────────────────
    // This is where cut billets exit horizontally
    // TCM GANTRY ZONE — area between strand bottom and roller table
    ctx.fillStyle='rgba(10,15,25,0.5)'
    ctx.fillRect(0, ROLLER_Y - H*0.08, W, H*0.08)  // TCM zone background
    // Roller table
    ctx.fillStyle='#0c1928'
    ctx.fillRect(ROLLER_X0, ROLLER_Y, ROLLER_X1-ROLLER_X0, ROLLER_H)
    ctx.strokeStyle='#2a4060'; ctx.lineWidth=1.5
    ctx.strokeRect(ROLLER_X0, ROLLER_Y, ROLLER_X1-ROLLER_X0, ROLLER_H)
    // Roller table top/bottom rails (thicker, more visible)
    ctx.fillStyle='#1a2d40'; ctx.fillRect(ROLLER_X0,ROLLER_Y,ROLLER_X1-ROLLER_X0,5)
    ctx.fillRect(ROLLER_X0,ROLLER_Y+ROLLER_H-5,ROLLER_X1-ROLLER_X0,5)
    // Table label on left
    lbl('ROLLER',ROLLER_X0+28,ROLLER_Y+ROLLER_H/2-4,'#2c4055',clamp(W*0.009,7,9))
    lbl('TABLE',ROLLER_X0+28,ROLLER_Y+ROLLER_H/2+8,'#2c4055',clamp(W*0.009,7,9))
    // Horizontal rollers
    const anyRunout = sim.strands.some(ss=>ss.cutBillets.length>0)
    for(let rx=ROLLER_X0+14; rx<ROLLER_X1-8; rx+=20){
      ctx.save(); ctx.translate(rx, ROLLER_Y+ROLLER_H/2)
      ctx.rotate(running&&anyRunout ? sim.rollAngle*0.65 : 0)
      ctx.fillStyle=anyRunout?'#1e3048':'#0a1525'; ctx.strokeStyle=anyRunout?'#3d5a73':'#111e2c'; ctx.lineWidth=0.8
      ctx.beginPath(); ctx.arc(0,0,ROLLER_H*0.36,0,Math.PI*2); ctx.fill()
      if(anyRunout){ctx.stroke(); ctx.strokeStyle='rgba(61,90,115,0.6)'; ctx.lineWidth=0.8
        ;[0,1,2].forEach(k=>{const a=k*Math.PI*2/3+sim.rollAngle*0.65; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*ROLLER_H*0.3,Math.sin(a)*ROLLER_H*0.3); ctx.stroke()})
      }
      ctx.restore()
    }
    lbl('HORIZONTAL BILLET ROLLER TABLE',W/2,ROLLER_Y+ROLLER_H+14,'#2c4055',clamp(W*0.010,8,11))
    lbl('← BILLETS EXIT LEFT          RIGHT →',W/2,ROLLER_Y+ROLLER_H+26,'#1e3348',clamp(W*0.009,7,10))

    // Draw cut billets moving on horizontal roller table — heat map
    sim.strands.forEach((ss) => {
      ss.cutBillets.forEach(b => {
        const billetW = clamp(b.pxLen || 50, 20, 160)
        // Position: billet centre is at b.x, extends in direction of travel
        const bx = b.vx < 0 ? b.x - billetW : b.x
        if (bx > W + 20 || bx + billetW < -20) return
        const bTop = ROLLER_Y + 4, bHt = ROLLER_H - 8
        // Full heat map — column per pixel
        for (let px = 0; px < billetW; px++) {
          const tidx = Math.round((px / billetW) * (b.temps.length - 1))
          const temp = b.temps[clamp(tidx, 0, b.temps.length - 1)] || 700
          ctx.fillStyle = heatColor(temp, 350, 1350)
          ctx.fillRect(bx + px, bTop, 1, bHt)
        }
        // Bold border
        ctx.strokeStyle = '#607D8B'; ctx.lineWidth = 1.5
        ctx.strokeRect(bx, bTop, billetW, bHt)
        // Labels
        const avgT = b.temps.reduce((a,t) => a + t, 0) / b.temps.length
        lbl(`B#${ss.billetsCut}`, bx + billetW/2, bTop + bHt*0.38, 'rgba(255,255,255,0.75)', clamp(W*0.009,7,10))
        lbl(`${avgT.toFixed(0)}°C`, bx + billetW/2, bTop + bHt*0.72, 'rgba(255,200,80,0.65)', clamp(W*0.009,7,9))
        // Hot glow on fresh billets
        if (avgT > 900) {
          const bg = ctx.createRadialGradient(bx+billetW/2,bTop+bHt/2,2,bx+billetW/2,bTop+bHt/2,billetW*0.7)
          bg.addColorStop(0,`rgba(255,80,0,${(avgT-900)/800*0.15})`); bg.addColorStop(1,'rgba(255,80,0,0)')
          ctx.fillStyle = bg; ctx.fillRect(bx-10, bTop-4, billetW+20, bHt+8)
        }
      })
    })

    // ── PER-STRAND VERTICAL CASTING ───────────────────────────────────────
    CXS.forEach((cx,i) => {
      const ss     = sim.strands[i]
      const strand = strands[i]
      const active = strand.active
      const sp     = strand.speed
      const mHS    = ss.moldLevel > 2
      const strandHasMetal = ss.segments.length > 0
      const castAct = active && (mHS || strandHasMetal)

      const SEN_Y0  = TUN_Y1
      const SEN_Y1  = SEN_Y0 + SEN_H
      const MOLD_Y0 = SEN_Y1 + ss.moldOsc*0.35
      const MOLD_Y1 = MOLD_Y0 + MOLD_H
      const STR_Y0  = MOLD_Y1
      const STR_Y1  = STR_Y0 + STR_H

      // ── SEN (per strand) ─────────────────────────────────────────────
      ctx.fillStyle='#263238'; ctx.fillRect(cx-5,SEN_Y0,10,SEN_H)
      if(running&&tundishLevel>0.04&&mHS&&active){
        const fw=clamp(6*tundishLevel,2,7)
        const sf2=ctx.createLinearGradient(0,SEN_Y0,0,SEN_Y1)
        sf2.addColorStop(0,'rgba(255,100,0,0.9)'); sf2.addColorStop(1,'rgba(255,60,0,0.45)')
        ctx.fillStyle=sf2; ctx.fillRect(cx-fw/2,SEN_Y0,fw,SEN_H)
      }
      ctx.strokeStyle='#37474F'; ctx.lineWidth=0.7; ctx.strokeRect(cx-5,SEN_Y0,10,SEN_H)

      // ── MOLD (water-cooled copper plates left+right of billet) ────────
      const copperCol = castAct?'#1a3a4a':'#101e28'
      ctx.fillStyle=copperCol
      ctx.fillRect(cx-BSZ-MWALL,MOLD_Y0,MWALL,MOLD_H)
      ctx.fillRect(cx+BSZ,MOLD_Y0,MWALL,MOLD_H)
      for(let ci=0;ci<4;ci++){
        ctx.fillStyle=`rgba(41,182,246,${castAct?0.08+ci*0.03:0.02})`
        ctx.fillRect(cx-BSZ-MWALL,MOLD_Y0+ci*MOLD_H/4,MWALL,MOLD_H/4-1)
        ctx.fillRect(cx+BSZ,MOLD_Y0+ci*MOLD_H/4,MWALL,MOLD_H/4-1)
      }
      ctx.strokeStyle=castAct?'#29B6F6':'#152030'; ctx.lineWidth=0.6
      ctx.strokeRect(cx-BSZ-MWALL,MOLD_Y0,MWALL,MOLD_H)
      ctx.strokeRect(cx+BSZ,MOLD_Y0,MWALL,MOLD_H)
      // steel in mold
      const mSteelH=MOLD_H*0.9*(ss.moldLevel/100)
      const mSteelTop=MOLD_Y0+4
      const msg=ctx.createLinearGradient(0,mSteelTop,0,mSteelTop+mSteelH)
      msg.addColorStop(0,`rgba(255,${castAct?95+35*Math.sin(sim.t*4+i):40},0,${castAct?0.97:0.3})`)
      msg.addColorStop(0.5,`rgba(210,50,0,${castAct?0.88:0.2})`)
      msg.addColorStop(1,`rgba(160,22,0,${castAct?0.72:0.15})`)
      ctx.fillStyle=msg; ctx.fillRect(cx-BSZ,mSteelTop,BSZ*2,mSteelH)
      if(castAct){
        ctx.fillStyle=`rgba(255,220,60,${0.38+0.22*Math.sin(sim.t*5+i*1.1)})`
        ctx.fillRect(cx-BSZ,mSteelTop,BSZ*2,2.5)
        const mgw=ctx.createRadialGradient(cx,mSteelTop,1,cx,mSteelTop,BSZ*2.8)
        mgw.addColorStop(0,'rgba(255,110,0,0.18)'); mgw.addColorStop(1,'rgba(255,80,0,0)')
        ctx.fillStyle=mgw; ctx.fillRect(cx-BSZ*3.5,MOLD_Y0-5,BSZ*7,MOLD_H*0.5)
      }
      // mold level dashed line
      ctx.strokeStyle=castAct?'#00E5FF':'#1a3040'; ctx.lineWidth=0.8; ctx.setLineDash([3,3])
      ctx.beginPath(); ctx.moveTo(cx-BSZ-MWALL,mSteelTop); ctx.lineTo(cx+BSZ+MWALL,mSteelTop); ctx.stroke()
      ctx.setLineDash([])
      // oscillation indicator
      if(castAct){
        ctx.strokeStyle=`rgba(0,188,212,${0.4+0.4*Math.abs(Math.sin(sim.t*8+i))})`; ctx.lineWidth=1.1
        ctx.beginPath(); ctx.moveTo(cx-BSZ-MWALL-5,MOLD_Y0); ctx.lineTo(cx-BSZ-MWALL-5,MOLD_Y1); ctx.stroke()
      }
      lbl(`S${i+1}`,cx,MOLD_Y0-5,castAct?'#FF8F00':'#37474F',clamp(W*0.012,8,12))
      lbl(`${ss.moldLevel.toFixed(0)}%`,cx,MOLD_Y1+9,castAct?'#00E5FF':'#2c4055',clamp(W*0.009,6,8))

      // ── VERTICAL STRAND (heat map, billet solidifying downward) ──────
      // Shell walls (left & right)
      ctx.fillStyle=castAct?'#2c3e50':'#141e2c'
      ctx.fillRect(cx-BSZ-11,STR_Y0,11,STR_H)
      ctx.fillRect(cx+BSZ,STR_Y0,11,STR_H)

      // Heat map of strand cross-section
      const segs=ss.segments
      const visH=clamp(STR_H/Math.max(segs.length,1),1,7)
      ctx.save(); ctx.beginPath(); ctx.rect(cx-BSZ-11,STR_Y0,BSZ*2+22,STR_H); ctx.clip()
      segs.forEach((seg,idx)=>{
        const sy=STR_Y0+idx*visH; if(sy>STR_Y0+STR_H) return
        const coreW=BSZ*2*(1-seg.solidFrac*0.90)
        ctx.fillStyle=heatColor(seg.temp*0.62,500,1100)
        ctx.fillRect(cx-BSZ,sy,BSZ*2,visH+1)
        if(coreW>1){ ctx.fillStyle=heatColor(seg.temp,500,1550); ctx.fillRect(cx-coreW/2,sy,coreW,visH+1) }
      })
      // Moving grain lines
      if(castAct){
        const off=(sim.t*sp*15)%18
        for(let ly=STR_Y0-off;ly<STR_Y0+STR_H;ly+=18){
          ctx.strokeStyle='rgba(55,85,115,0.07)'; ctx.lineWidth=0.5
          ctx.beginPath(); ctx.moveTo(cx-BSZ-11,ly); ctx.lineTo(cx+BSZ+11,ly); ctx.stroke()
        }
      }
      ctx.restore()
      ctx.strokeStyle='#111d2c'; ctx.lineWidth=0.8
      ctx.strokeRect(cx-BSZ-11,STR_Y0,11,STR_H)
      ctx.strokeRect(cx+BSZ,STR_Y0,11,STR_H)

      // Pool depth indicator
      if(castAct&&segs.length>4){
        const solidIdx=segs.findIndex(s=>s.solidFrac>=0.98)
        const poolPx=solidIdx>0?solidIdx*visH:STR_H*0.7
        ctx.strokeStyle='rgba(155,93,229,0.5)'; ctx.lineWidth=1.2; ctx.setLineDash([3,3])
        ctx.beginPath(); ctx.moveTo(cx+BSZ+14,STR_Y0); ctx.lineTo(cx+BSZ+14,STR_Y0+Math.min(poolPx,STR_H)); ctx.stroke()
        ctx.setLineDash([])
        lbl(`${(Math.min(poolPx,STR_H)/PX_PER_M).toFixed(1)}m`,cx+BSZ+18,STR_Y0+Math.min(poolPx,STR_H)/2,'#9b5de5',clamp(W*0.008,6,8),'left')
      }

      // ── SECONDARY COOLING SPRAY ZONES ────────────────────────────────
      const ZONES3=[
        {y:STR_Y0+STR_H*0.04, h:STR_H*0.27},
        {y:STR_Y0+STR_H*0.33, h:STR_H*0.27},
        {y:STR_Y0+STR_H*0.62, h:STR_H*0.27},
      ]
      ZONES3.forEach((z,zi)=>{
        ctx.strokeStyle=`rgba(41,182,246,${castAct?0.15+zi*0.02:0.04})`; ctx.lineWidth=0.7; ctx.setLineDash([2,4])
        ctx.strokeRect(cx-BSZ-18,z.y,BSZ*2+36,z.h); ctx.setLineDash([])
        // Nozzle pairs (left & right of billet)
        const nozzleYs=[z.y+z.h*0.28, z.y+z.h*0.68]
        nozzleYs.forEach(ny=>{
          ;[-1,1].forEach(side=>{
            const nx=side<0?cx-BSZ-11:cx+BSZ+11
            ctx.fillStyle=castAct?'#1565C0':'#0a1820'
            ctx.fillRect(nx-3,ny-3,6,6)
            ctx.strokeStyle=castAct?'#29B6F6':'#111e2c'; ctx.lineWidth=0.7; ctx.strokeRect(nx-3,ny-3,6,6)
            if(castAct){
              const pulse=0.45+0.45*Math.sin(sim.nozzlePulse+zi*1.0+i*0.7)
              const spLen=9+5*pulse
              for(let ai=-2;ai<=2;ai++){
                const angle=side*Math.PI/2+ai*0.22
                const ex=nx+Math.cos(angle)*spLen*side
                const ey=ny+Math.sin(angle)*spLen*0.4
                ctx.strokeStyle=`rgba(41,182,246,${(0.28+0.44*pulse)*(1-Math.abs(ai)/3)})`; ctx.lineWidth=0.9
                ctx.beginPath(); ctx.moveTo(nx,ny); ctx.lineTo(ex,ey); ctx.stroke()
              }
            }
          })
        })
      })

      // Spray drops
      ss.drops.forEach(d=>{
        ctx.globalAlpha=d.life*0.7; ctx.fillStyle='#4FC3F7'
        ctx.beginPath(); ctx.arc(d.x,d.y,1.4,0,Math.PI*2); ctx.fill()
      }); ctx.globalAlpha=1

      // ── FORMING BILLET HIGHLIGHT ──────────────────────────────────────
      // Show the current billet being formed — from BOTTOM of strand upward
      // billetLen pixels from STR_Y1 upward = the billet currently forming
      if (castAct && ss.billetLen > 0 && ss.targetBilletLen > 0) {
        const billetPxH = Math.min(ss.billetLen, STR_H * 0.9)
        const billetTop = STR_Y1 - billetPxH
        const pct = ss.billetLen / ss.targetBilletLen
        // Draw forming billet overlay as a bracket on both sides
        ctx.strokeStyle = `rgba(255,${Math.round(100 + 100*pct)},0,${0.35 + 0.3*pct})`
        ctx.lineWidth = 1.5
        // Left bracket
        ctx.beginPath()
        ctx.moveTo(cx - BSZ - 14, STR_Y1)
        ctx.lineTo(cx - BSZ - 18, STR_Y1)
        ctx.lineTo(cx - BSZ - 18, billetTop)
        ctx.lineTo(cx - BSZ - 14, billetTop)
        ctx.stroke()
        // Right bracket
        ctx.beginPath()
        ctx.moveTo(cx + BSZ + 14, STR_Y1)
        ctx.lineTo(cx + BSZ + 18, STR_Y1)
        ctx.lineTo(cx + BSZ + 18, billetTop)
        ctx.lineTo(cx + BSZ + 14, billetTop)
        ctx.stroke()
        // Top cut marker (where TCM will cut)
        ctx.strokeStyle = `rgba(255,200,0,${0.3 + 0.5*pct})`; ctx.lineWidth = 1; ctx.setLineDash([3,3])
        ctx.beginPath(); ctx.moveTo(cx - BSZ - 20, billetTop); ctx.lineTo(cx + BSZ + 20, billetTop); ctx.stroke()
        ctx.setLineDash([])
        // Length label
        lbl(`${(billetPxH/PX_PER_M).toFixed(1)}m`, cx - BSZ - 22, (billetTop + STR_Y1)/2,
          `rgba(255,${Math.round(100+100*pct)},0,0.7)`, clamp(W*0.008,6,7), 'right')
        // CUT SOON flash
        if (pct > 0.90) {
          ctx.fillStyle = `rgba(255,220,0,${0.6 + 0.4*Math.sin(sim.t*8)})`
          ctx.font = `bold ${clamp(W*0.009,6,9)}px monospace`; ctx.textAlign = 'center'
          ctx.fillText('CUT SOON', cx, billetTop - 6)
        }
      }

      // ── PINCH ROLLS (pairs left+right of billet, vertical strand) ────
      const rollYs=[STR_Y0+STR_H*0.15, STR_Y0+STR_H*0.40, STR_Y0+STR_H*0.66, STR_Y0+STR_H*0.88]
      rollYs.forEach(ry=>{
        ;[-1,1].forEach(side=>{
          const rx=side<0?cx-BSZ-7:cx+BSZ+7
          ctx.save(); ctx.translate(rx,ry)
          ctx.rotate(castAct?sim.rollAngle*side*-1:0)
          ctx.fillStyle=castAct?'#2c3e50':'#141e2c'; ctx.strokeStyle=castAct?'#546E7A':'#1e2d3d'; ctx.lineWidth=0.8
          ctx.beginPath(); ctx.arc(0,0,7,0,Math.PI*2); ctx.fill(); ctx.stroke()
          ctx.fillStyle=castAct?'#37474F':'#1a2535'; ctx.beginPath(); ctx.arc(0,0,2.5,0,Math.PI*2); ctx.fill()
          if(castAct){
            ctx.strokeStyle='rgba(84,110,122,0.5)'; ctx.lineWidth=0.8
            ;[0,1,2].forEach(k=>{const a=k*Math.PI*2/3; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*5.5,Math.sin(a)*5.5); ctx.stroke()})
          }
          ctx.restore()
        })
      })

      // ── TCM — VERTICAL TORCH CUTTING MACHINE ─────────────────────────
      // Torch tracks VERTICALLY along the strand
      // A horizontal gantry beam spans left+right of billet, torch head cuts across
      if(ss.torchOn){
        const ty = clamp(ss.torchY, STR_Y0, STR_Y1 - 2)
        const prog = ss.torchProgress || 0
        // Torch head X position — moves LEFT→RIGHT across billet
        const torchHeadX = cx - BSZ + prog * BSZ * 2

        // ── GANTRY BEAM (horizontal rail across full billet width) ────
        ctx.fillStyle='#1a3044'; ctx.strokeStyle='#2c4a65'; ctx.lineWidth=1
        ctx.fillRect(cx - BSZ - MWALL, ty - 6, (BSZ + MWALL) * 2, 12)
        ctx.strokeRect(cx - BSZ - MWALL, ty - 6, (BSZ + MWALL) * 2, 12)

        // ── TORCH HEAD (moves across billet as it cuts) ───────────────
        ctx.fillStyle = '#3d5a73'
        ctx.fillRect(torchHeadX - 5, ty - 10, 10, 14)
        ctx.strokeStyle = '#4FC3F7'; ctx.lineWidth = 0.8
        ctx.strokeRect(torchHeadX - 5, ty - 10, 10, 14)

        // Oxy hose (red) + Acet hose (blue) — from torch head up to supply box
        ctx.strokeStyle = '#C62828'; ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(torchHeadX - 3, ty - 10)
        ctx.bezierCurveTo(torchHeadX - 3, ty - 30, cx - BSZ - MWALL + 5, STR_Y0 + 5, cx - BSZ - MWALL + 8, STR_Y0 + 2)
        ctx.stroke()
        ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(torchHeadX + 3, ty - 10)
        ctx.bezierCurveTo(torchHeadX + 3, ty - 24, cx - BSZ - MWALL + 8, STR_Y0 + 8, cx - BSZ - MWALL + 12, STR_Y0 + 2)
        ctx.stroke()
        // Supply box at top of strand
        ctx.fillStyle = '#1a2d40'; ctx.fillRect(cx - BSZ - MWALL, STR_Y0 - 8, 22, 10)
        ctx.strokeStyle = '#2c4055'; ctx.lineWidth = 0.7; ctx.strokeRect(cx - BSZ - MWALL, STR_Y0 - 8, 22, 10)
        lbl('O₂', cx - BSZ - MWALL + 11, STR_Y0 - 1, '#E53935', clamp(W*0.008,6,7))

        // ── FLAME at torch tip (downward) ─────────────────────────────
        const FR = 5 + 2.5 * Math.sin(sim.t * 14 + i * 1.3)
        const fg = ctx.createRadialGradient(torchHeadX, ty + 4, 0, torchHeadX, ty + 4, FR * 2.2)
        fg.addColorStop(0, 'rgba(255,255,255,0.98)')
        fg.addColorStop(0.2, 'rgba(255,245,0,0.92)')
        fg.addColorStop(0.55, 'rgba(255,100,0,0.72)')
        fg.addColorStop(1, 'rgba(255,0,0,0)')
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(torchHeadX, ty + 4, FR * 2.2, 0, Math.PI * 2); ctx.fill()

        // ── CUT KERF (horizontal line cut so far across billet) ───────
        // Show already-cut portion: from left edge to current torch position
        if (prog > 0) {
          ctx.strokeStyle = `rgba(255,120,0,${0.7 + 0.3 * Math.sin(sim.t * 12 + i)})`
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.moveTo(cx - BSZ, ty)
          ctx.lineTo(torchHeadX, ty)
          ctx.stroke()
          // Kerf glow
          const kGrd = ctx.createLinearGradient(cx - BSZ, ty, torchHeadX, ty)
          kGrd.addColorStop(0, 'rgba(255,80,0,0.1)')
          kGrd.addColorStop(1, `rgba(255,200,0,${0.4 + 0.3 * Math.sin(sim.t * 12)})`)
          ctx.fillStyle = kGrd; ctx.fillRect(cx - BSZ, ty - 3, prog * BSZ * 2, 6)
        }

        // Uncut part (still billet)
        ctx.strokeStyle = 'rgba(100,150,160,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([2,2])
        ctx.beginPath(); ctx.moveTo(torchHeadX, ty); ctx.lineTo(cx + BSZ, ty); ctx.stroke()
        ctx.setLineDash([])

        // ── LABEL ─────────────────────────────────────────────────────
        ctx.fillStyle = '#FFD54F'; ctx.font = `bold ${clamp(W*0.01,7,10)}px monospace`; ctx.textAlign = 'center'
        ctx.fillText(`TCM ${(prog*100).toFixed(0)}%`, cx, ty - 14)
      } else {
        // TCM parked at top of strand when not cutting
        ctx.fillStyle='#0a1520'; ctx.strokeStyle='#1a2d3a'; ctx.lineWidth=0.7
        ctx.fillRect(cx-BSZ-MWALL-2,STR_Y0-8,(BSZ+MWALL+2)*2,8)
        ctx.strokeRect(cx-BSZ-MWALL-2,STR_Y0-8,(BSZ+MWALL+2)*2,8)
        lbl('TCM',cx,STR_Y0-2,'#1a3040',clamp(W*0.008,6,8))
        // Billet length progress bar (vertical)
        if(active&&(mHS||strandHasMetal)&&ss.targetBilletLen>0){
          const pct=Math.min(1,ss.billetLen/ss.targetBilletLen)
          // Vertical progress bar on right side of strand
          const pbx=cx+BSZ+MWALL+3, pby=STR_Y0, pbh=STR_H*0.85
          ctx.fillStyle='#0a1520'; ctx.fillRect(pbx,pby,5,pbh)
          ctx.fillStyle=`rgba(255,${100+100*pct},0,0.85)`; ctx.fillRect(pbx,pby+pbh*(1-pct),5,pbh*pct)
          ctx.strokeStyle='#1a3040'; ctx.lineWidth=0.5; ctx.strokeRect(pbx,pby,5,pbh)
          lbl(`${(pct*100).toFixed(0)}%`,pbx+8,pby+pbh*(1-pct/2),'#FF6D00',clamp(W*0.008,6,7),'left')
          // Next cut label
          if(pct>0.85) { ctx.fillStyle='rgba(255,200,0,0.9)'; ctx.font=`bold ${clamp(W*0.009,6,8)}px monospace`; ctx.textAlign='center'; ctx.fillText('CUT SOON',cx,STR_Y0+STR_H+8) }
        }
      }

      // Sparks (fly sideways from cut)
      ss.sparks.forEach(sp=>{
        ctx.globalAlpha=sp.life; ctx.fillStyle=sp.col
        ctx.beginPath(); ctx.arc(sp.x,sp.y,sp.r,0,Math.PI*2); ctx.fill()
        ctx.globalAlpha=sp.life*0.25; ctx.fillStyle='#FF8F00'
        ctx.beginPath(); ctx.arc(sp.x-sp.vx*0.5,sp.y-sp.vy*0.5,sp.r*0.4,0,Math.PI*2); ctx.fill()
      }); ctx.globalAlpha=1

      // Steam puffs
      ss.steamPuffs.forEach(sp=>{
        ctx.globalAlpha=sp.life*0.25; ctx.fillStyle='rgba(200,230,255,1)'
        ctx.beginPath(); ctx.arc(sp.x,sp.y,sp.r,0,Math.PI*2); ctx.fill()
      }); ctx.globalAlpha=1

      // Bottom of strand → connect to roller table
      // Arrow showing billet exit direction
      if(castAct){
        const exitX=i<N/2?cx+BSZ+MWALL+2:cx-BSZ-MWALL-2
        const exitDir=i<N/2?1:-1
        ctx.strokeStyle='rgba(255,100,0,0.3)'; ctx.lineWidth=1.2; ctx.setLineDash([3,4])
        ctx.beginPath(); ctx.moveTo(exitX,STR_Y1); ctx.lineTo(exitX+exitDir*20,ROLLER_Y+ROLLER_H/2); ctx.stroke()
        ctx.setLineDash([])
      }
    })

    // ── DROP ZONE ARROWS (strand bottom → roller table) ────────────────────
    CXS.forEach((cx,i)=>{
      const SEN_Y1b=TUN_Y1+SEN_H, STR_Y0b=SEN_Y1b+MOLD_H, STR_Y1b=STR_Y0b+STR_H
      const ss=sim.strands[i], strand=strands[i]
      const castAct2=strand.active&&(ss.moldLevel>2||ss.segments.length>0)
      // Vertical line from strand bottom to roller table
      ctx.strokeStyle=castAct2?`rgba(255,100,0,0.25)`:'rgba(30,50,70,0.15)'; ctx.lineWidth=2; ctx.setLineDash([4,4])
      ctx.beginPath(); ctx.moveTo(cx,STR_Y1b); ctx.lineTo(cx,ROLLER_Y); ctx.stroke(); ctx.setLineDash([])
      // Arrow direction
      if(castAct2){
        const arrowX=i<N/2?cx+BSZ+8:cx-BSZ-8, arrowDir=i<N/2?1:-1
        ctx.strokeStyle='rgba(255,100,0,0.35)'; ctx.lineWidth=1.5; ctx.setLineDash([3,4])
        ctx.beginPath(); ctx.moveTo(cx,ROLLER_Y-4); ctx.lineTo(arrowX,ROLLER_Y+ROLLER_H/2); ctx.stroke(); ctx.setLineDash([])
      }
    })

    // ── ZONE LABELS ───────────────────────────────────────────────────────
    ;['Z1','Z2','Z3'].forEach((zlbl,zi)=>{
      const SEN_Y1=TUN_Y1+SEN_H
      const STR_Y0=SEN_Y1+MOLD_H
      const zy=STR_Y0+STR_H*[0.04,0.33,0.62][zi]
      ctx.strokeStyle='rgba(41,182,246,0.08)'; ctx.lineWidth=0.5; ctx.setLineDash([4,6])
      ctx.beginPath(); ctx.moveTo(0,zy); ctx.lineTo(W,zy); ctx.stroke(); ctx.setLineDash([])
      lbl(zlbl,3,zy-2,'#0d3040',clamp(W*0.009,6,8),'left')
    })

    // ── STATUS TOP STRIP ──────────────────────────────────────────────────
    const anySteel=sim.strands.some((ss,i)=>strands[i].active&&(ss.moldLevel>2||ss.segments.length>0))
    const statusTxt=!running?'STANDBY ○':anySteel?'CASTING ●':'CAST COMPLETE ✓'
    const statusCol=!running?'#546E7A':anySteel?'#57ab5a':'#FFB300'
    const totalCut=sim.strands.reduce((a,ss)=>a+ss.billetsCut,0)
    const totalThru=strands.filter(s=>s.active).reduce((a,s)=>a+billetSize*billetSize*s.speed*7800/60/1e6,0)
    ctx.fillStyle='rgba(4,8,18,0.80)'; ctx.fillRect(0,0,W,H*0.026)
    ;[
      {l:'ACTIVE',v:`${strands.filter(s=>s.active).length}/${N}`,c:'#57ab5a'},
      {l:'OUTPUT',v:`${totalThru.toFixed(1)}t/h`,c:'#FF8F00'},
      {l:'BILLETS',v:`${totalCut}`,c:'#9b5de5'},
      {l:'LADLE',v:`${(ladleLevel*100).toFixed(0)}%`,c:ladleLevel<0.1?'#e5534b':'#FF7043'},
      {l:'TUNDISH',v:`${(tundishLevel*100).toFixed(0)}%`,c:tundishLevel<0.1?'#e5534b':'#FFB300'},
      {l:'STATUS',v:statusTxt,c:statusCol},
    ].forEach(({l,v,c},ki)=>{
      const px=W*0.01+ki*W*0.165
      ctx.fillStyle='#4d7a9a'; ctx.font=`${clamp(W*0.009,6,9)}px monospace`; ctx.textAlign='left'; ctx.fillText(l,px,H*0.011)
      ctx.fillStyle=c; ctx.font=`bold ${clamp(W*0.01,7,10)}px monospace`; ctx.fillText(v,px,H*0.022)
    })

    // ── HEAT MAP LEGEND ───────────────────────────────────────────────────
    const HMX=6,HMY=H-28,HMW=80,HMH=6
    for(let px=0;px<HMW;px++){ctx.fillStyle=heatColor(500+px*13.1,500,1550); ctx.fillRect(HMX+px,HMY,1,HMH)}
    lbl('500°C',HMX,HMY+HMH+9,'#546E7A',7,'left'); lbl('1550°C',HMX+HMW,HMY+HMH+9,'#FF6D00',7,'right'); lbl('HEAT',HMX+HMW/2,HMY+HMH+9,'#37474F',7)

    // ── FOOTER ────────────────────────────────────────────────────────────
    ctx.fillStyle='rgba(4,8,18,0.88)'; ctx.fillRect(0,H-18,W,18)
    ctx.fillStyle='#2c4055'; ctx.font=`${clamp(W*0.009,7,10)}px monospace`; ctx.textAlign='left'
    ctx.fillText(`6-STRAND BILLET CASTER  |  ${heatNo}  |  ${billetSize}x${billetSize}mm  |  VERTICAL TCM  |  ${new Date().toLocaleTimeString()}`,8,H-4)

    rafRef.current = requestAnimationFrame(draw)
  }, [running, strands, tundishTemp, billetSize, heatNo, ladleLevel, tundishLevel])

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
const HUES=['#FF6D00','#FF8F00','#FFA000','#FFB300','#FFC107','#FFD54F']

export default function BilletCastingModel() {
  const [running,setRunning]               = useState(false)
  const [tundishTemp,setTundishTemp]       = useState(1555)
  const [billetSize,setBilletSize]         = useState(130)
  const [panelOpen,setPanelOpen]           = useState(true)
  const [elapsed,setElapsed]               = useState(0)
  const [billetsCut,setBilletsCut]         = useState(0)
  const [ladleLevel,setLadleLevel]         = useState(1.0)
  const [tundishLevel,setTundishLevel]     = useState(0.82)
  const [resetCount,setResetCount]         = useState(0)
  const [strandMoldLevels,setStrandMoldLevels] = useState(Array(N).fill(85))
  const [heatNo]                           = useState(`BC-${Math.floor(Math.random()*9000+1000)}`)
  const [strands,setStrands]               = useState(
    Array.from({length:N},(_,i)=>({active:true,speed:1.8+i*0.02,moldLevel:85}))
  )
  const timerRef = useRef(null)

  useEffect(()=>{
    if(running){timerRef.current=setInterval(()=>setElapsed(t=>t+1),1000)}
    else clearInterval(timerRef.current)
    return ()=>clearInterval(timerRef.current)
  },[running])

  const toggleStrand=i=>setStrands(prev=>prev.map((s,j)=>j===i?{...s,active:!s.active}:s))
  const setSpeed=(i,v)=>setStrands(prev=>prev.map((s,j)=>j===i?{...s,speed:v}:s))
  const fmt=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`
  const activeCount=strands.filter(s=>s.active).length
  const totalThrough=strands.filter(s=>s.active).reduce((a,s)=>a+billetSize*billetSize*s.speed*7800/60/1e6,0)

  return (
    <div style={{height:'100dvh',background:C.bg,color:C.text,fontFamily:'monospace',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{background:'#060a10',borderBottom:`1px solid ${C.border}`,padding:'0 12px',height:48,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:18}}>⚙</span>
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'0.04em'}}>6-STRAND BILLET CASTER</div>
            <div style={{fontSize:8,color:C.muted,letterSpacing:'0.1em'}}>VERTICAL TCM · PHYSICS-BASED REAL-TIME</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {[
            {l:'TIME',v:fmt(elapsed),c:running?C.success:C.muted},
            {l:'STRANDS',v:`${activeCount}/${N}`,c:C.success},
            {l:'OUTPUT',v:`${totalThrough.toFixed(1)}t/h`,c:C.accent},
            {l:'LADLE',v:`${(ladleLevel*100).toFixed(0)}%`,c:ladleLevel<0.1?C.danger:'#FF7043'},
            {l:'TUNDISH',v:`${(tundishLevel*100).toFixed(0)}%`,c:tundishLevel<0.1?C.danger:'#FFB300'},
            {l:'BILLETS',v:`${billetsCut}`,c:C.cyan},
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
          <button onClick={()=>{
            setRunning(v=>!v)
            if(!running){setElapsed(0);setBilletsCut(0);setLadleLevel(1.0);setTundishLevel(0.82);setStrandMoldLevels(Array(N).fill(85));setResetCount(c=>c+1)}
          }} style={{padding:'6px 12px',borderRadius:4,border:`1px solid ${running?C.danger:C.success}`,background:running?'rgba(229,83,73,0.15)':'rgba(87,171,90,0.15)',color:running?C.danger:C.success,fontSize:11,fontWeight:700,cursor:'pointer'}}>
            {running?'⏹ STOP':'▶ START'}
          </button>
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {panelOpen&&(
          <div style={{width:195,background:C.panel,borderRight:`1px solid ${C.border}`,overflow:'auto',flexShrink:0}}>
            <div style={{padding:'10px 12px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:9,color:C.muted,letterSpacing:'0.1em',marginBottom:10}}>GLOBAL</div>
              <div style={{marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                  <span style={{fontSize:9,color:C.muted}}>TUNDISH TEMP</span>
                  <span style={{fontSize:10,color:C.accent}}>{tundishTemp}°C</span>
                </div>
                <input type="range" min={1530} max={1575} step={1} value={tundishTemp}
                  onChange={e=>setTundishTemp(+e.target.value)} disabled={running}
                  style={{width:'100%',accentColor:C.accent,opacity:running?0.4:1}}/>
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:9,color:C.muted,marginBottom:4}}>BILLET SIZE</div>
                <select value={billetSize} onChange={e=>setBilletSize(+e.target.value)} disabled={running}
                  style={{width:'100%',padding:'4px 6px',borderRadius:3,border:`1px solid ${C.border}`,background:C.bg,color:C.text,fontSize:11}}>
                  {[100,120,130,150,160].map(s=><option key={s} value={s}>{s}×{s}mm</option>)}
                </select>
              </div>
              {[
                {l:'Ladle',v:`${(ladleLevel*100).toFixed(0)}%  ${(ladleLevel*250).toFixed(0)}t`,c:ladleLevel<0.1?C.danger:'#FF7043'},
                {l:'Tundish',v:`${(tundishLevel*100).toFixed(0)}%  ${(tundishLevel*25).toFixed(1)}t`,c:tundishLevel<0.1?C.danger:'#FFB300'},
                {l:'Superheat',v:`${tundishTemp-1537}°C`,c:tundishTemp-1537>40?C.danger:C.success},
                {l:'Billets Cut',v:`${billetsCut}`,c:C.cyan},
              ].map(r=>(
                <div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:9,color:C.muted}}>{r.l}</span>
                  <span style={{fontSize:10,fontWeight:600,color:r.c}}>{r.v}</span>
                </div>
              ))}
              <div style={{marginTop:8}}>
                <div style={{fontSize:9,color:C.muted,marginBottom:4}}>HEAT MAP</div>
                <div style={{display:'flex',height:10,borderRadius:2,overflow:'hidden',marginBottom:2}}>
                  {Array.from({length:50},(_,i)=>(
                    <div key={i} style={{flex:1,background:heatColor(500+i*21,500,1550)}}/>
                  ))}
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:7,color:C.muted}}>
                  <span>500°C</span><span>1550°C</span>
                </div>
              </div>
            </div>
            <div style={{padding:'10px 12px'}}>
              <div style={{fontSize:9,color:C.muted,letterSpacing:'0.1em',marginBottom:8}}>STRAND CONTROL</div>
              {strands.map((s,i)=>{
                const active=s.active&&running
                const mLvl=strandMoldLevels[i]||0
                return(
                  <div key={i} style={{background:active?`${HUES[i]}10`:'#0a1018',border:`1px solid ${active?HUES[i]+'50':C.border}`,borderRadius:5,padding:'7px 8px',marginBottom:6,transition:'all 0.3s'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:5}}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div style={{width:7,height:7,borderRadius:'50%',background:active?HUES[i]:C.muted,boxShadow:active?`0 0 5px ${HUES[i]}`:'none'}}/>
                        <span style={{fontSize:11,fontWeight:600,color:active?HUES[i]:C.muted}}>S{i+1}</span>
                      </div>
                      <button onClick={()=>toggleStrand(i)}
                        style={{padding:'2px 6px',borderRadius:3,border:`1px solid ${active?HUES[i]:C.border}`,background:'transparent',color:active?HUES[i]:C.muted,fontSize:9,cursor:'pointer'}}>
                        {s.active?'ON':'OFF'}
                      </button>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,marginBottom:5}}>
                      {[{l:'Speed',v:`${s.speed.toFixed(2)}m/m`},{l:'Mold',v:`${mLvl.toFixed(0)}%`}].map(item=>(
                        <div key={item.l} style={{background:C.bg,borderRadius:3,padding:'3px 5px'}}>
                          <div style={{fontSize:7,color:C.muted}}>{item.l}</div>
                          <div style={{fontSize:10,color:active?C.text:C.muted}}>{item.v}</div>
                        </div>
                      ))}
                    </div>
                    <input type="range" min={0.5} max={3.5} step={0.05} value={s.speed}
                      onChange={e=>setSpeed(i,+e.target.value)}
                      disabled={!running||!s.active}
                      style={{width:'100%',accentColor:HUES[i],opacity:(!running||!s.active)?0.35:1}}/>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <div style={{flex:1,overflow:'hidden',background:'#06090f'}}>
          <BilletCanvas
            running={running} strands={strands} tundishTemp={tundishTemp}
            billetSize={billetSize} heatNo={heatNo}
            ladleLevel={ladleLevel} setLadleLevel={setLadleLevel}
            tundishLevel={tundishLevel} setTundishLevel={setTundishLevel}
            setStrandMoldLevels={setStrandMoldLevels}
            onBilletCut={()=>setBilletsCut(v=>v+1)}
            doReset={resetCount}
          />
        </div>
      </div>
    </div>
  )
}
