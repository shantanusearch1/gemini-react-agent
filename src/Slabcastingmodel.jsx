import { useState, useEffect, useRef, useCallback } from 'react'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Heat map color: from liquid orange → hot red → warm → cool grey
function heatColor(temp, min = 600, max = 1550) {
  const t = clamp((temp - min) / (max - min), 0, 1)
  if (t > 0.85) return `rgba(255,${Math.round(80 + (1 - t) * 120)},0,0.95)`
  if (t > 0.65) return `rgba(${Math.round(180 + t * 75)},${Math.round(40 + t * 30)},0,0.92)`
  if (t > 0.40) return `rgba(${Math.round(100 + t * 120)},${Math.round(30 + t * 40)},${Math.round(10 + t * 20)},0.88)`
  if (t > 0.20) return `rgba(${Math.round(60 + t * 100)},${Math.round(70 + t * 30)},${Math.round(80 + t * 20)},0.85)`
  return `rgba(${Math.round(55 + t * 60)},${Math.round(80 + t * 30)},${Math.round(90 + t * 30)},0.82)`
}

function CastingCanvas({ running, speed, tundishTemp, moldLevel, setMoldLevel, slabWidth, slabThick, heatNo,
  ladleLevel, setLadleLevel, tundishLevel, setTundishLevel, onSlabCut, doReset }) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const S = useRef({
    t: 0, frame: 0,
    // Physics
    ladleKg: 250000,      // kg of steel in ladle (250 t)
    tundishKg: 25000,     // kg in tundish (25 t capacity)
    tundishMaxKg: 28000,
    ladleFlowRate: 0,     // kg/s out of ladle
    tundishFlowRate: 0,   // kg/s into mold
    // Mold
    moldOsc: 0, moldDir: 1,
    moldTemp: 1510,       // copper temp
    // Strand / slab
    strandPixels: 0,      // accumulated pixels of strand cast
    slabSegments: [],     // [{y, temp, solidFrac}] – vertical segments in strand
    // Runout
    runoutSlabs: [],      // [{x, len, temps:[], cutDone}]
    slabBeingCast: null,  // current slab on runout being formed
    // Torch
    torchX: 0, torchOn: false, torchCD: 240, torchProgress: 0,
    slabLen: 0,           // current slab length being built
    targetSlabLen: 0,     // px length of slab to cut
    // Particles
    drops: [], sparks: [], steamPuffs: [],
    // roll angle
    rollAngle: 0,
    // spray nozzle pulse
    nozzlePulse: 0,
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
    sim.ladleKg = 250000; sim.tundishKg = 25000
    sim.ladleFlowRate = 0; sim.tundishFlowRate = 0
    sim.moldOsc = 0; sim.moldDir = 1
    sim.strandPixels = 0; sim.slabSegments = []
    sim.runoutSlabs = []; sim.slabBeingCast = null
    sim.torchX = 0; sim.torchOn = false; sim.torchCD = 240
    sim.slabLen = 0; sim.targetSlabLen = 0; sim.slabsCut = 0
    sim.drops = []; sim.sparks = []; sim.steamPuffs = []
    sim.rollAngle = 0; sim.nozzlePulse = 0
  }, [doReset])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return }
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    const sim = S.current
    sim.t += 0.016; sim.frame++

    // ── LAYOUT ─────────────────────────────────────────────────────────
    const SCX      = W * 0.18   // strand centre X
    const SW       = clamp(W * 0.045, 18, 36)  // strand half-width

    const LADLE_Y0 = H * 0.01
    const LADLE_H  = H * 0.13
    const LADLE_W  = W * 0.15
    const LADLE_Y1 = LADLE_Y0 + LADLE_H

    const TUN_Y0   = LADLE_Y1 + H * 0.035
    const TUN_H    = H * 0.07
    const TUN_W    = W * 0.20
    const TUN_Y1   = TUN_Y0 + TUN_H

    const SEN_Y0   = TUN_Y1
    const SEN_H    = H * 0.038
    const SEN_Y1   = SEN_Y0 + SEN_H

    const MOLD_Y0  = SEN_Y1 + sim.moldOsc * 0.4
    const MOLD_H   = H * 0.10
    const MOLD_Y1  = MOLD_Y0 + MOLD_H
    const MWALL    = clamp(W * 0.025, 14, 24)

    const STR_Y0   = MOLD_Y1
    const STR_H    = H * 0.30
    const STR_Y1   = STR_Y0 + STR_H

    const BEND_R   = clamp(W * 0.10, 50, 110)
    const BEND_CX  = SCX + BEND_R
    const BEND_CY  = STR_Y1

    const RUN_Y    = BEND_CY - SW
    const RUN_X0   = BEND_CX
    const RUN_X1   = W * 0.97
    const RUN_H    = SW * 2

    const TORCH_RAIL_Y = RUN_Y - H * 0.07

    const PX_PER_M = STR_H / 8  // 1 m of strand = this many pixels

    // PHYSICS TICK
    if (running) {
      const dt = 0.016

      sim.moldOsc += sim.moldDir * 0.35; if (Math.abs(sim.moldOsc) > 4) sim.moldDir *= -1
      sim.rollAngle += speed * 0.08
      sim.nozzlePulse = (sim.nozzlePulse + 0.12) % (Math.PI * 2)

      // LADLE: 250t drains over ~25 min at speed 1.2
      const ladleFlowKgPerSec = sim.ladleKg > 200 ? clamp(speed * 140, 60, 260) : 0
      sim.ladleFlowRate = ladleFlowKgPerSec
      const ladleOut = ladleFlowKgPerSec * dt
      sim.ladleKg = Math.max(0, sim.ladleKg - ladleOut)
      setLadleLevel(sim.ladleKg / 250000)

      // TUNDISH: inflow from ladle, outflow at casting rate
      const castKgS = slabWidth * slabThick * speed / 60 * 7800 / 1e6
      sim.tundishKg = clamp(sim.tundishKg + ladleOut - castKgS * dt, 0, sim.tundishMaxKg)
      sim.tundishFlowRate = castKgS
      setTundishLevel(sim.tundishKg / sim.tundishMaxKg)

      // MOLD LEVEL: follows tundish, drains when tundish empty
      const tFrac = sim.tundishKg / sim.tundishMaxKg
      const mTarget = tFrac > 0.05 ? clamp(82 + (tFrac - 0.6) * 18, 62, 95) : 0
      setMoldLevel(v => {
        const d = tFrac > 0.05 ? (mTarget - v) * 0.07 + (Math.random() - 0.5) * 0.3 : -0.5
        return clamp(v + d, 0, 99)
      })

      // ── STRAND / SLAB SEGMENTS ────────────────────────────────────────
      // Each frame push a new hot segment at top of strand
      const pixelsThisFrame = speed * PX_PER_M * 0.016  // px this frame
      sim.strandPixels += pixelsThisFrame

      // Push new hot segment at mold exit
      sim.slabSegments.unshift({ temp: tundishTemp - 5, solidFrac: 0.0, px: pixelsThisFrame })

      // Advance / cool all segments
      sim.slabSegments = sim.slabSegments.map((seg, idx) => {
        const depth = idx * pixelsThisFrame  // approx distance below mold
        const depthM = depth / PX_PER_M
        // cooling profile: surface temp drops, solid fraction rises
        const coolRate  = 0.3 + depth / STR_H * 1.8   // faster near bottom
        const newTemp   = Math.max(800, seg.temp - coolRate * speed * 0.8)
        const solidFrac = Math.min(1.0, seg.solidFrac + 0.003 * speed * (0.5 + depthM * 0.3))
        return { ...seg, temp: newTemp, solidFrac }
      })

      // Remove segments that have moved past strand bottom
      const maxSegs = Math.ceil(STR_H / pixelsThisFrame) + 20
      if (sim.slabSegments.length > maxSegs) sim.slabSegments = sim.slabSegments.slice(0, maxSegs)

      // ── RUNOUT SLAB HEAT MAP ──────────────────────────────────────────
      // Build current slab being cast
      if (!sim.slabBeingCast) {
        sim.slabBeingCast = { x: RUN_X0 + 4, temps: [], len: 0 }
        sim.targetSlabLen = clamp(speed * 40 + 120, 100, RUN_X1 - RUN_X0 - 60)
      }
      // Add a new pixel-column of slab exiting bend
      const exitTemp = sim.slabSegments.length > 0 ? sim.slabSegments[sim.slabSegments.length - 1].temp : 900
      sim.slabBeingCast.len += pixelsThisFrame
      sim.slabBeingCast.temps.push(clamp(exitTemp, 700, 1300))

      // Move existing runout slabs
      sim.runoutSlabs = sim.runoutSlabs.map(sl => ({
        ...sl,
        x: sl.x + pixelsThisFrame * 2.5,
        temps: sl.temps.map(t => Math.max(500, t - speed * 0.15))
      })).filter(sl => sl.x < RUN_X1 + 400)

      // TORCH cutting — only when steel is flowing
      if (!sim.torchOn) {
        sim.torchCD -= 1
        if (sim.slabBeingCast && sim.slabBeingCast.len >= sim.targetSlabLen) {
          sim.torchOn = true
          sim.torchX  = RUN_X0 + 10
          // park current slab into runout list
          sim.runoutSlabs.push({ ...sim.slabBeingCast, cutting: false })
          sim.slabBeingCast = null
        }
      } else {
        sim.torchX += speed * 3.2
        // sparks
        for (let k = 0; k < 5; k++) sim.sparks.push({
          x: sim.torchX, y: RUN_Y + RUN_H * 0.5,
          vx: (Math.random() - 0.5) * 7, vy: -Math.random() * 6 - 1,
          life: 1, r: Math.random() * 2.5 + 0.5,
          col: Math.random() > 0.5 ? '#FF6D00' : '#FFD54F'
        })
        // steam puffs
        if (sim.frame % 4 === 0) sim.steamPuffs.push({ x: sim.torchX, y: RUN_Y - 4, vx: (Math.random() - 0.3) * 1.5, vy: -1.5 - Math.random(), life: 1, r: 4 })

        if (sim.torchX > RUN_X0 + sim.targetSlabLen) {
          sim.torchOn = false; sim.torchCD = Math.round(200 / speed)
          sim.slabsCut++
          onSlabCut()
        }
      }

      // ── SPRAY DROPS ───────────────────────────────────────────────────
      if (sim.drops.length < 140) {
        const zoneYs = [STR_Y0 + STR_H * 0.08, STR_Y0 + STR_H * 0.32, STR_Y0 + STR_H * 0.58]
        const pulse = Math.abs(Math.sin(sim.nozzlePulse))
        zoneYs.forEach(zy => {
          if (Math.random() < 0.4 * speed * pulse) {
            sim.drops.push({ x: SCX - SW - 2, y: zy + Math.random() * 30, vx: -2.5 - Math.random() * 2.5, vy: 1.2 + Math.random(), life: 1 })
            sim.drops.push({ x: SCX + SW + 2, y: zy + Math.random() * 30, vx: 2.5 + Math.random() * 2.5,  vy: 1.2 + Math.random(), life: 1 })
          }
        })
      }

      // Mold cooling water
      if (sim.frame % 3 === 0) {
        sim.drops.push({ x: SCX - SW - MWALL, y: MOLD_Y0 + Math.random() * MOLD_H, vx: -1.5 - Math.random(), vy: 0.5 + Math.random() * 0.5, life: 0.7 })
        sim.drops.push({ x: SCX + SW + MWALL, y: MOLD_Y0 + Math.random() * MOLD_H, vx:  1.5 + Math.random(), vy: 0.5 + Math.random() * 0.5, life: 0.7 })
      }
    }

    // Update particles
    sim.sparks     = sim.sparks.filter(p => p.life > 0).map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.2, life: p.life - 0.04 }))
    sim.drops      = sim.drops.filter(p => p.life > 0).map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.032 }))
    sim.steamPuffs = sim.steamPuffs.filter(p => p.life > 0).map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, r: p.r + 0.5, life: p.life - 0.025 }))

    // ─────────────────────────────────────────────────────────────────────
    // DRAW
    // ─────────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#06090f'; ctx.fillRect(0, 0, W, H)
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.015)'; ctx.lineWidth = 0.5
    for (let gx = 0; gx < W; gx += 36) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke() }
    for (let gy = 0; gy < H; gy += 36) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke() }

    const lbl = (txt, x, y, col = '#78909C', sz = 9, align = 'center') => {
      ctx.fillStyle = col; ctx.font = `${sz}px monospace`; ctx.textAlign = align; ctx.fillText(txt, x, y)
    }

    // ── LADLE ──────────────────────────────────────────────────────────
    // Stand
    ctx.fillStyle = '#1a2535'
    ctx.fillRect(SCX - LADLE_W / 2 - 8, LADLE_Y0 + 5, 8, LADLE_H)
    ctx.fillRect(SCX + LADLE_W / 2,     LADLE_Y0 + 5, 8, LADLE_H)
    ctx.fillRect(SCX - LADLE_W / 2 - 10, LADLE_Y0, LADLE_W + 20, 6)
    // Body (trapezoid)
    ctx.beginPath()
    ctx.moveTo(SCX - LADLE_W / 2, LADLE_Y0 + 6)
    ctx.lineTo(SCX + LADLE_W / 2, LADLE_Y0 + 6)
    ctx.lineTo(SCX + LADLE_W / 2 - 10, LADLE_Y1)
    ctx.lineTo(SCX - LADLE_W / 2 + 10, LADLE_Y1)
    ctx.closePath()
    ctx.fillStyle = '#263340'; ctx.fill()
    ctx.strokeStyle = '#37474F'; ctx.lineWidth = 1.5; ctx.stroke()
    // Lining (refractory)
    ctx.beginPath()
    ctx.moveTo(SCX - LADLE_W / 2 + 4, LADLE_Y0 + 10)
    ctx.lineTo(SCX + LADLE_W / 2 - 4, LADLE_Y0 + 10)
    ctx.lineTo(SCX + LADLE_W / 2 - 14, LADLE_Y1 - 2)
    ctx.lineTo(SCX - LADLE_W / 2 + 14, LADLE_Y1 - 2)
    ctx.closePath()
    ctx.fillStyle = '#1a2535'; ctx.fill()

    // Steel level in ladle
    const ladleInnerTop = LADLE_Y0 + 14
    const ladleInnerH   = LADLE_H - 20
    const ladleSteelH   = ladleInnerH * ladleLevel
    const ladleSteelTop = ladleInnerTop + (ladleInnerH - ladleSteelH)
    if (ladleSteelH > 2) {
      // gradient from bright orange top to dark red bottom
      const lg = ctx.createLinearGradient(0, ladleSteelTop, 0, ladleSteelTop + ladleSteelH)
      lg.addColorStop(0, running ? `rgba(255,${120 + 40 * Math.sin(sim.t * 3)},0,0.95)` : 'rgba(80,100,115,0.6)')
      lg.addColorStop(0.4, running ? 'rgba(230,60,0,0.88)' : 'rgba(60,80,95,0.5)')
      lg.addColorStop(1, running ? 'rgba(160,20,0,0.72)' : 'rgba(40,60,75,0.4)')
      ctx.fillStyle = lg
      ctx.beginPath()
      ctx.moveTo(SCX - LADLE_W / 2 + 14 + (ladleInnerH - ladleSteelH) * 0.1, ladleSteelTop)
      ctx.lineTo(SCX + LADLE_W / 2 - 14 - (ladleInnerH - ladleSteelH) * 0.1, ladleSteelTop)
      ctx.lineTo(SCX + LADLE_W / 2 - 14, ladleSteelTop + ladleSteelH)
      ctx.lineTo(SCX - LADLE_W / 2 + 14, ladleSteelTop + ladleSteelH)
      ctx.closePath(); ctx.fill()
      // meniscus glow
      if (running) {
        ctx.fillStyle = `rgba(255,200,50,${0.3 + 0.2 * Math.sin(sim.t * 4)})`
        ctx.fillRect(SCX - LADLE_W / 2 + 14, ladleSteelTop, LADLE_W - 28, 3)
        const gw = ctx.createRadialGradient(SCX, ladleSteelTop, 2, SCX, ladleSteelTop, LADLE_W * 0.55)
        gw.addColorStop(0, 'rgba(255,120,0,0.15)'); gw.addColorStop(1, 'rgba(255,80,0,0)')
        ctx.fillStyle = gw; ctx.fillRect(SCX - LADLE_W, LADLE_Y0, LADLE_W * 2, LADLE_H * 0.7)
      }
    }
    // level %
    const ladlePct = (ladleLevel * 100).toFixed(0)
    lbl('LADLE', SCX, LADLE_Y0 - 2, '#90A4AE', clamp(W * 0.011, 8, 12))
    lbl(`${ladlePct}% • ${(ladleLevel * 250).toFixed(0)}t`, SCX, ladleSteelTop + ladleSteelH / 2 + 4, running ? '#FF8F00' : '#546E7A', clamp(W * 0.01, 7, 10))
    // stopper rod
    ctx.fillStyle = running && ladleLevel > 0.02 ? '#FF6D00' : '#546E7A'
    ctx.fillRect(SCX - 3, LADLE_Y1 - LADLE_H * 0.35, 6, LADLE_H * 0.35)
    // stopper tip
    ctx.beginPath(); ctx.arc(SCX, LADLE_Y1, 5, 0, Math.PI * 2)
    ctx.fillStyle = running && ladleLevel > 0.02 ? '#FF3D00' : '#455A64'; ctx.fill()

    // ── LADLE → TUNDISH SHROUD ─────────────────────────────────────────
    const shroudOpen = running && ladleLevel > 0.02
    ctx.fillStyle = '#263238'; ctx.fillRect(SCX - 6, LADLE_Y1, 12, TUN_Y0 - LADLE_Y1)
    if (shroudOpen) {
      const flowWidth = clamp(6 * (sim.ladleFlowRate / 300), 2, 9)
      const sg = ctx.createLinearGradient(0, LADLE_Y1, 0, TUN_Y0)
      sg.addColorStop(0, 'rgba(255,120,0,0.95)'); sg.addColorStop(1, 'rgba(255,80,0,0.5)')
      ctx.fillStyle = sg
      ctx.fillRect(SCX - flowWidth / 2, LADLE_Y1, flowWidth, TUN_Y0 - LADLE_Y1)
      // flow ripple
      for (let fy = LADLE_Y1 + 4; fy < TUN_Y0; fy += 12) {
        ctx.strokeStyle = `rgba(255,${100 + 50 * Math.sin(fy * 0.3 + sim.t * 8)},0,0.5)`
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(SCX, fy, 3, 0, Math.PI); ctx.stroke()
      }
    }
    ctx.strokeStyle = '#37474F'; ctx.lineWidth = 0.8; ctx.strokeRect(SCX - 6, LADLE_Y1, 12, TUN_Y0 - LADLE_Y1)
    lbl('SHROUD', SCX + 12, (LADLE_Y1 + TUN_Y0) / 2 + 3, '#455A64', clamp(W * 0.009, 7, 9), 'left')

    // ── TUNDISH ────────────────────────────────────────────────────────
    const tunW = TUN_W
    ctx.beginPath()
    ctx.moveTo(SCX - tunW / 2, TUN_Y0)
    ctx.lineTo(SCX + tunW / 2, TUN_Y0)
    ctx.lineTo(SCX + tunW / 2 - 12, TUN_Y1)
    ctx.lineTo(SCX - tunW / 2 + 12, TUN_Y1)
    ctx.closePath()
    ctx.fillStyle = '#1e2d3d'; ctx.fill(); ctx.strokeStyle = '#2c4055'; ctx.lineWidth = 1.5; ctx.stroke()
    // refractory lining
    ctx.beginPath()
    ctx.moveTo(SCX - tunW / 2 + 6, TUN_Y0 + 4)
    ctx.lineTo(SCX + tunW / 2 - 6, TUN_Y0 + 4)
    ctx.lineTo(SCX + tunW / 2 - 16, TUN_Y1 - 3)
    ctx.lineTo(SCX - tunW / 2 + 16, TUN_Y1 - 3)
    ctx.closePath(); ctx.fillStyle = '#141e2c'; ctx.fill()
    // steel in tundish
    const tunSteelH = (TUN_H - 10) * tundishLevel
    const tunSteelTop = TUN_Y1 - 6 - tunSteelH
    if (tunSteelH > 2) {
      const tg = ctx.createLinearGradient(0, tunSteelTop, 0, TUN_Y1 - 6)
      tg.addColorStop(0, running ? `rgba(255,${110 + 30 * Math.sin(sim.t * 2.5)},0,0.93)` : 'rgba(60,80,95,0.6)')
      tg.addColorStop(1, running ? 'rgba(190,45,0,0.78)' : 'rgba(40,60,78,0.45)')
      ctx.fillStyle = tg
      ctx.beginPath()
      ctx.moveTo(SCX - tunW / 2 + 16 + (1 - tundishLevel) * 8, tunSteelTop)
      ctx.lineTo(SCX + tunW / 2 - 16 - (1 - tundishLevel) * 8, tunSteelTop)
      ctx.lineTo(SCX + tunW / 2 - 16, TUN_Y1 - 6)
      ctx.lineTo(SCX - tunW / 2 + 16, TUN_Y1 - 6)
      ctx.closePath(); ctx.fill()
      if (running) {
        ctx.fillStyle = `rgba(255,180,40,${0.25 + 0.15 * Math.sin(sim.t * 3.5)})`
        const tw = tunW - 32 - (1 - tundishLevel) * 16
        ctx.fillRect(SCX - tw / 2, tunSteelTop, tw, 3)
        const tgw = ctx.createRadialGradient(SCX, tunSteelTop, 2, SCX, tunSteelTop, tunW * 0.5)
        tgw.addColorStop(0, 'rgba(255,140,0,0.12)'); tgw.addColorStop(1, 'rgba(255,140,0,0)')
        ctx.fillStyle = tgw; ctx.fillRect(SCX - tunW, TUN_Y0, tunW * 2, TUN_H)
      }
    }
    lbl('TUNDISH', SCX, TUN_Y0 - 3, '#90A4AE', clamp(W * 0.011, 8, 12))
    lbl(`${(tundishLevel * 100).toFixed(0)}% • ${(tundishLevel * 28).toFixed(1)}t`, SCX, TUN_Y0 + TUN_H * 0.48, running ? '#FFB300' : '#546E7A', clamp(W * 0.01, 7, 10))
    lbl(`${tundishTemp}°C  SH:${tundishTemp - 1537}°C`, SCX, TUN_Y1 - 6, running ? '#FF7043' : '#455A64', clamp(W * 0.009, 7, 9))

    // ── SEN ───────────────────────────────────────────────────────────
    ctx.fillStyle = '#263238'; ctx.fillRect(SCX - 7, SEN_Y0, 14, SEN_H)
    if (running && tundishLevel > 0.08) {
      const fw = clamp(8 * (sim.tundishFlowRate / 200), 3, 10)
      const sfg = ctx.createLinearGradient(0, SEN_Y0, 0, SEN_Y1)
      sfg.addColorStop(0, 'rgba(255,110,0,0.92)'); sfg.addColorStop(1, 'rgba(255,70,0,0.5)')
      ctx.fillStyle = sfg; ctx.fillRect(SCX - fw / 2, SEN_Y0, fw, SEN_H)
    }
    ctx.strokeStyle = '#37474F'; ctx.lineWidth = 0.8; ctx.strokeRect(SCX - 7, SEN_Y0, 14, SEN_H)
    lbl('SEN', SCX + 12, SEN_Y0 + SEN_H * 0.6, '#455A64', clamp(W * 0.009, 7, 9), 'left')

    // ── MOLD ──────────────────────────────────────────────────────────
    const MY0 = MOLD_Y0, MY1 = MOLD_Y1
    // Water-cooled copper plates
    const copperG = ctx.createLinearGradient(0, MY0, 0, MY1)
    copperG.addColorStop(0, '#1a3a4a'); copperG.addColorStop(0.5, '#1d4560'); copperG.addColorStop(1, '#1a3a4a')
    ctx.fillStyle = copperG
    ctx.fillRect(SCX - SW - MWALL, MY0, MWALL, MOLD_H)
    ctx.fillRect(SCX + SW, MY0, MWALL, MOLD_H)
    // Water channel marks on copper
    for (let ci = 0; ci < 6; ci++) {
      const cy = MY0 + ci * MOLD_H / 6
      ctx.fillStyle = `rgba(41,182,246,${0.08 + ci * 0.025})`
      ctx.fillRect(SCX - SW - MWALL, cy, MWALL, MOLD_H / 6 - 1)
      ctx.fillRect(SCX + SW,         cy, MWALL, MOLD_H / 6 - 1)
    }
    ctx.strokeStyle = '#29B6F6'; ctx.lineWidth = 0.7
    ctx.strokeRect(SCX - SW - MWALL, MY0, MWALL, MOLD_H)
    ctx.strokeRect(SCX + SW, MY0, MWALL, MOLD_H)
    // Copper temp badge
    const moldCuTemp = clamp(1480 + speed * 15, 1485, 1530)
    lbl(`Cu: ${moldCuTemp.toFixed(0)}°C`, SCX - SW - MWALL - 2, MY0 + MOLD_H * 0.35, '#29B6F6', clamp(W * 0.009, 7, 9), 'right')
    lbl('WATER', SCX - SW - MWALL - 2, MY0 + MOLD_H * 0.55, '#0288D1', clamp(W * 0.009, 7, 9), 'right')
    lbl(`COOLING`, SCX - SW - MWALL - 2, MY0 + MOLD_H * 0.72, '#0288D1', clamp(W * 0.009, 7, 9), 'right')

    // Steel inside mold
    const moldSteelH = MOLD_H * 0.92 * (moldLevel / 100)
    const moldSteelTop = MY0 + 4
    const moldSteelBot = moldSteelTop + moldSteelH
    const msg = ctx.createLinearGradient(0, moldSteelTop, 0, moldSteelBot)
    msg.addColorStop(0, `rgba(255,${100 + 40 * Math.sin(sim.t * 4)},0,0.97)`)
    msg.addColorStop(0.4, 'rgba(220,55,0,0.9)')
    msg.addColorStop(1, 'rgba(165,25,0,0.75)')
    ctx.fillStyle = msg; ctx.fillRect(SCX - SW, moldSteelTop, SW * 2, moldSteelH)
    // Meniscus shimmer
    if (running) {
      ctx.fillStyle = `rgba(255,220,60,${0.4 + 0.25 * Math.sin(sim.t * 5)})`
      ctx.fillRect(SCX - SW, moldSteelTop, SW * 2, 3)
      const mgw = ctx.createRadialGradient(SCX, moldSteelTop, 1, SCX, moldSteelTop, SW * 3)
      mgw.addColorStop(0, 'rgba(255,120,0,0.2)'); mgw.addColorStop(1, 'rgba(255,80,0,0)')
      ctx.fillStyle = mgw; ctx.fillRect(SCX - SW * 4, MY0 - 8, SW * 8, MOLD_H * 0.5)
    }
    // Mold level indicator
    ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 3])
    ctx.beginPath(); ctx.moveTo(SCX - SW - MWALL, moldSteelTop); ctx.lineTo(SCX + SW + MWALL + 50, moldSteelTop); ctx.stroke()
    ctx.setLineDash([])
    lbl(`${moldLevel.toFixed(1)}%`, SCX + SW + MWALL + 52, moldSteelTop + 4, '#00E5FF', clamp(W * 0.009, 7, 10), 'left')
    // Oscillation arrows
    if (running) {
      const oscDir = sim.moldDir > 0 ? '↑' : '↓'
      ctx.strokeStyle = `rgba(0,188,212,${0.5 + 0.5 * Math.abs(Math.sin(sim.t * 8))})`; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(SCX - SW - MWALL - 6, MY0); ctx.lineTo(SCX - SW - MWALL - 6, MY1); ctx.stroke()
      lbl(`OSC ${oscDir}`, SCX - SW - MWALL - 8, MY0 - 4, '#00BCD4', clamp(W * 0.009, 7, 9), 'right')
      lbl(`${Math.abs(sim.moldOsc).toFixed(1)}mm`, SCX - SW - MWALL - 8, MY1 + 10, '#00BCD4', clamp(W * 0.009, 7, 9), 'right')
    }
    lbl('MOLD', SCX + SW + MWALL + 52, MY0 + MOLD_H * 0.5, '#78909C', clamp(W * 0.011, 8, 11), 'left')

    // ── SOLIDIFYING STRAND (VERTICAL) ─────────────────────────────────
    // Draw each segment with its heat color
    const STR_Y0_DRAW = STR_Y0
    const segH = STR_H / Math.max(sim.slabSegments.length, 1)
    const visSegH = clamp(segH, 1, 8)
    // Shell walls
    ctx.fillStyle = '#2c3e50'
    ctx.fillRect(SCX - SW - 14, STR_Y0, 14, STR_H)
    ctx.fillRect(SCX + SW, STR_Y0, 14, STR_H)
    // Shell highlight
    ctx.fillStyle = 'rgba(84,110,122,0.4)'
    ctx.fillRect(SCX - SW - 12, STR_Y0, 4, STR_H)
    ctx.fillRect(SCX + SW + 10, STR_Y0, 4, STR_H)

    // Heat map of strand cross-section
    ctx.save()
    ctx.beginPath(); ctx.rect(SCX - SW - 14, STR_Y0, SW * 2 + 28, STR_H); ctx.clip()
    sim.slabSegments.forEach((seg, idx) => {
      const sy = STR_Y0 + idx * visSegH
      if (sy > STR_Y0 + STR_H) return
      const col = heatColor(seg.temp)
      // Liquid core width narrows as solidification increases
      const coreW = SW * 2 * (1 - seg.solidFrac * 0.92)
      // outer shell (solidified)
      ctx.fillStyle = heatColor(seg.temp * 0.65)
      ctx.fillRect(SCX - SW, sy, SW * 2, visSegH + 1)
      // liquid/mushy core
      if (coreW > 1) {
        ctx.fillStyle = col
        ctx.fillRect(SCX - coreW / 2, sy, coreW, visSegH + 1)
      }
    })
    // Moving grain lines
    if (running) {
      const offset = (sim.t * speed * 18) % 22
      for (let ly = STR_Y0 - offset; ly < STR_Y0 + STR_H; ly += 22) {
        ctx.strokeStyle = 'rgba(60,90,120,0.07)'; ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(SCX - SW - 14, ly); ctx.lineTo(SCX + SW + 14, ly); ctx.stroke()
      }
    }
    ctx.restore()

    // Shell wall border
    ctx.strokeStyle = '#1e2d3d'; ctx.lineWidth = 1
    ctx.strokeRect(SCX - SW - 14, STR_Y0, 14, STR_H)
    ctx.strokeRect(SCX + SW, STR_Y0, 14, STR_H)

    // Pool depth arrow
    if (running && sim.slabSegments.length > 5) {
      const solidIdx = sim.slabSegments.findIndex(s => s.solidFrac > 0.98)
      const poolDepthPx = solidIdx > 0 ? solidIdx * visSegH : STR_H * 0.7
      const poolDepthM  = poolDepthPx / PX_PER_M
      ctx.strokeStyle = 'rgba(155,93,229,0.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.moveTo(SCX + SW + 18, STR_Y0); ctx.lineTo(SCX + SW + 18, STR_Y0 + Math.min(poolDepthPx, STR_H)); ctx.stroke()
      ctx.setLineDash([])
      lbl(`Pool: ${poolDepthM.toFixed(1)}m`, SCX + SW + 22, STR_Y0 + Math.min(poolDepthPx, STR_H) / 2, '#9b5de5', clamp(W * 0.009, 7, 9), 'left')
    }

    // ── SECONDARY COOLING ZONES ────────────────────────────────────────
    const ZONES = [
      { y0: STR_Y0 + STR_H * 0.03, h: STR_H * 0.27, n: 'ZONE 1', flow: speed * 78 },
      { y0: STR_Y0 + STR_H * 0.32, h: STR_H * 0.27, n: 'ZONE 2', flow: speed * 56 },
      { y0: STR_Y0 + STR_H * 0.61, h: STR_H * 0.27, n: 'ZONE 3', flow: speed * 40 },
    ]
    ZONES.forEach((z, zi) => {
      ctx.strokeStyle = `rgba(41,182,246,${0.18 + zi * 0.03})`; ctx.lineWidth = 0.8; ctx.setLineDash([3, 4])
      ctx.strokeRect(SCX - SW - 24, z.y0, SW * 2 + 48, z.h); ctx.setLineDash([])
      lbl(z.n, SCX - SW - 26, z.y0 + 10, '#0288D1', clamp(W * 0.009, 7, 9), 'right')
      if (running) {
        lbl(`${z.flow.toFixed(0)}L/m`, SCX - SW - 26, z.y0 + 22, '#4FC3F7', clamp(W * 0.009, 7, 9), 'right')
        // Nozzle boxes with pulsing spray
        const pulse = 0.5 + 0.5 * Math.sin(sim.nozzlePulse + zi * Math.PI * 0.6)
        const nozzleYs = [z.y0 + z.h * 0.25, z.y0 + z.h * 0.6]
        nozzleYs.forEach(ny => {
          ;[-1, 1].forEach(side => {
            const nx = side < 0 ? SCX - SW - 14 : SCX + SW + 14
            // nozzle body
            ctx.fillStyle = '#1565C0'
            ctx.fillRect(nx - 4, ny - 4, 8, 8)
            ctx.strokeStyle = '#29B6F6'; ctx.lineWidth = 0.8; ctx.strokeRect(nx - 4, ny - 4, 8, 8)
            // spray cone
            const sprayLen = 14 + 8 * pulse
            for (let ai = -3; ai <= 3; ai++) {
              const angle = side * Math.PI / 2 + ai * 0.2
              const ex = nx + Math.cos(angle) * sprayLen * side
              const ey = ny + Math.sin(angle) * sprayLen * 0.4
              const alpha = (0.3 + 0.5 * pulse) * (1 - Math.abs(ai) / 4)
              ctx.strokeStyle = `rgba(41,182,246,${alpha})`; ctx.lineWidth = 1
              ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(ex, ey); ctx.stroke()
            }
          })
        })
      }
    })

    // Spray drops
    sim.drops.forEach(d => {
      ctx.globalAlpha = d.life * 0.72
      ctx.fillStyle = d.life < 0.4 ? '#29B6F6' : '#4FC3F7'
      ctx.beginPath(); ctx.arc(d.x, d.y, 1.5, 0, Math.PI * 2); ctx.fill()
    })
    ctx.globalAlpha = 1

    // ── PINCH ROLLS ────────────────────────────────────────────────────
    const ROLL_YS = [STR_Y0 + STR_H * 0.14, STR_Y0 + STR_H * 0.38, STR_Y0 + STR_H * 0.62, STR_Y0 + STR_H * 0.87]
    ROLL_YS.forEach(ry => {
      ;[-1, 1].forEach(side => {
        const rx = side < 0 ? SCX - SW - 8 : SCX + SW + 8
        ctx.save(); ctx.translate(rx, ry)
        ctx.rotate(side < 0 ? sim.rollAngle : -sim.rollAngle)
        ctx.fillStyle = running ? '#2c3e50' : '#1a2535'
        ctx.strokeStyle = '#546E7A'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#37474F'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill()
        if (running) {
          ctx.strokeStyle = 'rgba(84,110,122,0.55)'; ctx.lineWidth = 1
          ;[0, 1, 2].forEach(k => {
            const a = k * Math.PI * 2 / 3
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 6, Math.sin(a) * 6); ctx.stroke()
          })
        }
        ctx.restore()
        // bearing housing
        ctx.fillStyle = '#1a2535'; ctx.fillRect(side < 0 ? SCX - SW - 18 : SCX + SW + 10, ry - 3, 10, 6)
      })
      lbl('ROLL', SCX + SW + 24, ry + 3, 'rgba(84,110,122,0.4)', clamp(W * 0.008, 6, 8), 'left')
    })

    // ── STRAND BEND ────────────────────────────────────────────────────
    ctx.save()
    ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = SW * 2 + 28; ctx.lineCap = 'butt'
    ctx.beginPath(); ctx.arc(BEND_CX, BEND_CY, BEND_R, -Math.PI, -Math.PI * 0.5, false); ctx.stroke()
    // heat inside bend
    if (running && sim.slabSegments.length > 0) {
      const bendTemp = sim.slabSegments[sim.slabSegments.length - 1]?.temp || 900
      ctx.strokeStyle = heatColor(bendTemp, 700, 1200)
      ctx.lineWidth = SW * 1.2; ctx.globalAlpha = 0.6
      ctx.beginPath(); ctx.arc(BEND_CX, BEND_CY, BEND_R, -Math.PI, -Math.PI * 0.5, false); ctx.stroke()
    }
    ctx.globalAlpha = 1
    // bend outline
    ctx.strokeStyle = '#1a2535'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.arc(BEND_CX, BEND_CY, BEND_R - SW - 14, -Math.PI, -Math.PI * 0.5, false); ctx.stroke()
    ctx.beginPath(); ctx.arc(BEND_CX, BEND_CY, BEND_R + SW + 14, -Math.PI, -Math.PI * 0.5, false); ctx.stroke()
    ctx.restore()
    // bend rolls (4 around curve)
    for (let bi = 0; bi < 5; bi++) {
      const angle = -Math.PI + bi * Math.PI / 8
      const brx = BEND_CX + BEND_R * Math.cos(angle)
      const bry = BEND_CY + BEND_R * Math.sin(angle)
      ctx.save(); ctx.translate(brx, bry); ctx.rotate(running ? sim.rollAngle * 0.7 : 0)
      ctx.fillStyle = running ? '#2c3e50' : '#1a2535'; ctx.strokeStyle = '#546E7A'; ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.restore()
    }
    lbl('STRAND BEND', BEND_CX - BEND_R * 0.6, BEND_CY - BEND_R * 0.5, '#37474F', clamp(W * 0.009, 7, 9))

    // ── HORIZONTAL RUNOUT TABLE ────────────────────────────────────────
    // Table frame
    ctx.fillStyle = '#0f1a28'; ctx.fillRect(RUN_X0, RUN_Y, RUN_X1 - RUN_X0, RUN_H)
    ctx.strokeStyle = '#1a2d40'; ctx.lineWidth = 1; ctx.strokeRect(RUN_X0, RUN_Y, RUN_X1 - RUN_X0, RUN_H)
    // Roller clips top & bottom
    ctx.fillStyle = '#141e2c'; ctx.fillRect(RUN_X0, RUN_Y, RUN_X1 - RUN_X0, 4)
    ctx.fillRect(RUN_X0, RUN_Y + RUN_H - 4, RUN_X1 - RUN_X0, 4)

    // Runout rollers
    const RSTEP = clamp(W * 0.032, 20, 38)
    for (let rx = RUN_X0 + RSTEP / 2; rx < RUN_X1; rx += RSTEP) {
      ctx.save(); ctx.translate(rx, RUN_Y + RUN_H / 2); ctx.rotate(running ? sim.rollAngle * 0.65 : 0)
      ctx.fillStyle = running ? '#1e2d3d' : '#111820'; ctx.strokeStyle = '#2a3d52'; ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.arc(0, 0, RUN_H * 0.38, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#253545'; ctx.beginPath(); ctx.arc(0, 0, RUN_H * 0.13, 0, Math.PI * 2); ctx.fill()
      if (running) {
        ctx.strokeStyle = 'rgba(42,61,82,0.6)'; ctx.lineWidth = 0.8
        ;[0, 1, 2].forEach(k => {
          const a = k * Math.PI * 2 / 3 + sim.rollAngle * 0.65
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * RUN_H * 0.33, Math.sin(a) * RUN_H * 0.33); ctx.stroke()
        })
      }
      ctx.restore()
    }

    // DRAW SLABS ON RUNOUT with HEAT MAP
    // Current slab being cast (growing from left)
    if (sim.slabBeingCast && sim.slabBeingCast.len > 2) {
      const sb = sim.slabBeingCast
      const slabW = Math.min(sb.len, RUN_X1 - RUN_X0 - 20)
      const colPerPx = sb.temps.length / slabW
      for (let px = 0; px < slabW; px++) {
        const tempIdx = Math.round(px * colPerPx)
        const temp = sb.temps[Math.min(tempIdx, sb.temps.length - 1)] || 900
        ctx.fillStyle = heatColor(temp, 600, 1350)
        ctx.fillRect(RUN_X0 + 4 + px, RUN_Y + 3, 1, RUN_H - 6)
      }
      ctx.strokeStyle = '#455A64'; ctx.lineWidth = 0.5
      ctx.strokeRect(RUN_X0 + 4, RUN_Y + 3, slabW, RUN_H - 6)
    }

    // Completed slabs moving right
    sim.runoutSlabs.forEach(sl => {
      const slabW = Math.min(sl.len, RUN_X1 - sl.x - 4)
      if (slabW < 2) return
      const colsPerPx = sl.temps.length / Math.max(slabW, 1)
      for (let px = 0; px < slabW; px++) {
        const tempIdx = Math.round(px * colsPerPx)
        const temp = sl.temps[Math.min(tempIdx, sl.temps.length - 1)] || 700
        ctx.fillStyle = heatColor(temp, 500, 1200)
        ctx.fillRect(sl.x + px, RUN_Y + 3, 1, RUN_H - 6)
      }
      ctx.strokeStyle = '#37474F'; ctx.lineWidth = 0.5
      ctx.strokeRect(sl.x, RUN_Y + 3, slabW, RUN_H - 6)
    })

    // Heat map scale bar
    const HM_X = RUN_X0 + 4, HM_Y = RUN_Y + RUN_H + 6, HM_W = 100, HM_H = 6
    for (let px = 0; px < HM_W; px++) {
      const t = px / HM_W
      ctx.fillStyle = heatColor(600 + t * 950, 600, 1550)
      ctx.fillRect(HM_X + px, HM_Y, 1, HM_H)
    }
    lbl('600°C', HM_X, HM_Y + HM_H + 9, '#546E7A', 7, 'left')
    lbl('1550°C', HM_X + HM_W, HM_Y + HM_H + 9, '#FF6D00', 7, 'right')
    lbl('SLAB HEAT MAP', HM_X + HM_W / 2, HM_Y + HM_H + 9, '#37474F', 7)

    lbl('HORIZONTAL RUNOUT TABLE', (RUN_X0 + RUN_X1) / 2, RUN_Y + RUN_H + 20, '#1e3040', clamp(W * 0.009, 7, 9))

    // ── TCM — TORCH CUTTING MACHINE ────────────────────────────────────
    const RAIL_Y = TORCH_RAIL_Y
    // Rails
    ctx.fillStyle = '#0a1520'; ctx.fillRect(RUN_X0, RAIL_Y, RUN_X1 - RUN_X0, 6)
    ctx.fillStyle = '#0d1c2c'; ctx.fillRect(RUN_X0, RAIL_Y + 2, RUN_X1 - RUN_X0, 2)
    ctx.fillRect(RUN_X0, RAIL_Y + 8, RUN_X1 - RUN_X0, 2)
    lbl('TCM TORCH CUTTING MACHINE', RUN_X0 + 8, RAIL_Y - 8, '#1e3348', clamp(W * 0.009, 7, 9), 'left')

    if (sim.torchOn) {
      const tx = sim.torchX
      // Carriage
      ctx.fillStyle = '#1a3044'
      ctx.beginPath(); ctx.roundRect(tx - 24, RAIL_Y - 10, 48, 20, 3); ctx.fill()
      ctx.strokeStyle = '#2c4a65'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(tx - 24, RAIL_Y - 10, 48, 20, 3); ctx.stroke()
      // Wheels on rail
      ;[-16, 16].forEach(wx => {
        ctx.save(); ctx.translate(tx + wx, RAIL_Y + 5); ctx.rotate(sim.t * speed * 3)
        ctx.fillStyle = '#253545'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#3d5a73'; ctx.lineWidth = 0.8; ctx.stroke()
        ctx.restore()
      })
      // Torch arm
      ctx.fillStyle = '#2c4a65'; ctx.fillRect(tx - 4, RAIL_Y + 10, 8, RUN_Y - RAIL_Y - 10)
      // Oxy hose (red)
      ctx.strokeStyle = '#C62828'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(tx + 10, RAIL_Y)
      ctx.bezierCurveTo(tx + 60, RAIL_Y - 20, RUN_X1 - 30, RAIL_Y - 20, RUN_X1 - 15, RAIL_Y)
      ctx.stroke()
      // Acet hose (blue)
      ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(tx - 10, RAIL_Y)
      ctx.bezierCurveTo(tx - 60, RAIL_Y - 14, RUN_X1 - 40, RAIL_Y - 14, RUN_X1 - 15, RAIL_Y)
      ctx.stroke()
      // Gas valve box at end of hoses
      ctx.fillStyle = '#1e2d3d'; ctx.fillRect(RUN_X1 - 20, RAIL_Y - 28, 20, 30); ctx.strokeStyle = '#2c4055'; ctx.lineWidth = 0.8; ctx.strokeRect(RUN_X1 - 20, RAIL_Y - 28, 20, 30)
      lbl('O₂/C₂H₂', RUN_X1 - 10, RAIL_Y - 14, '#546E7A', 7)

      // Torch tip & FLAME
      ctx.fillStyle = '#FFB300'; ctx.beginPath(); ctx.arc(tx, RUN_Y - 2, 4, 0, Math.PI * 2); ctx.fill()
      const FR = (8 + 4 * Math.sin(sim.t * 14)) 
      const fg = ctx.createRadialGradient(tx, RUN_Y, 0, tx, RUN_Y, FR * 2.5)
      fg.addColorStop(0, 'rgba(255,255,255,0.98)')
      fg.addColorStop(0.15, 'rgba(255,250,100,0.95)')
      fg.addColorStop(0.4, 'rgba(255,120,0,0.82)')
      fg.addColorStop(0.75, 'rgba(255,40,0,0.45)')
      fg.addColorStop(1, 'rgba(255,0,0,0)')
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(tx, RUN_Y, FR * 2.5, 0, Math.PI * 2); ctx.fill()
      // secondary flame plume downward
      const fg2 = ctx.createRadialGradient(tx, RUN_Y + FR, 0, tx, RUN_Y + FR * 2, FR * 1.5)
      fg2.addColorStop(0, 'rgba(255,200,0,0.6)'); fg2.addColorStop(1, 'rgba(255,50,0,0)')
      ctx.fillStyle = fg2; ctx.beginPath(); ctx.arc(tx, RUN_Y + FR, FR * 1.5, 0, Math.PI * 2); ctx.fill()
      // Cut slot
      ctx.strokeStyle = `rgba(255,120,0,${0.6 + 0.4 * Math.sin(sim.t * 15)})`; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(tx, RUN_Y - 2); ctx.lineTo(tx, RUN_Y + RUN_H + 2); ctx.stroke()
      // kerf glow
      const kg = ctx.createLinearGradient(tx - 4, 0, tx + 4, 0)
      kg.addColorStop(0, 'rgba(255,120,0,0)'); kg.addColorStop(0.5, `rgba(255,200,0,${0.5 + 0.3 * Math.sin(sim.t * 15)})`); kg.addColorStop(1, 'rgba(255,120,0,0)')
      ctx.fillStyle = kg; ctx.fillRect(tx - 4, RUN_Y, 8, RUN_H)

      ctx.fillStyle = '#FFD54F'; ctx.font = `bold ${clamp(W * 0.011, 8, 13)}px monospace`; ctx.textAlign = 'center'
      ctx.fillText('⚡ CUTTING', tx, RAIL_Y - 14)
    } else {
      // Parked carriage at left
      ctx.fillStyle = '#0d1a28'
      ctx.beginPath(); ctx.roundRect(RUN_X0 + 2, RAIL_Y - 10, 48, 20, 3); ctx.fill()
      ctx.strokeStyle = '#1e3040'; ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.roundRect(RUN_X0 + 2, RAIL_Y - 10, 48, 20, 3); ctx.stroke()
      lbl('TORCH PARK', RUN_X0 + 26, RAIL_Y + 4, '#1e3040', clamp(W * 0.009, 7, 9))
      // cooldown bar
      if (sim.torchCD > 0) {
        const cdPct = 1 - sim.torchCD / 240
        ctx.fillStyle = '#1a2535'; ctx.fillRect(RUN_X0 + 60, RAIL_Y - 4, 80, 8)
        ctx.fillStyle = '#FF6D00'; ctx.fillRect(RUN_X0 + 60, RAIL_Y - 4, 80 * cdPct, 8)
        lbl(`NEXT CUT: ${(100 * cdPct).toFixed(0)}%`, RUN_X0 + 100, RAIL_Y + 14, '#FF6D00', clamp(W * 0.009, 7, 9))
      }
    }

    // Sparks
    sim.sparks.forEach(sp => {
      ctx.globalAlpha = sp.life
      ctx.fillStyle = sp.col; ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = sp.life * 0.28; ctx.fillStyle = '#FF8F00'
      ctx.beginPath(); ctx.arc(sp.x - sp.vx * 0.5, sp.y - sp.vy * 0.5, sp.r * 0.4, 0, Math.PI * 2); ctx.fill()
    })
    // Steam puffs
    sim.steamPuffs.forEach(sp => {
      ctx.globalAlpha = sp.life * 0.28
      ctx.fillStyle = 'rgba(200,230,255,1)'
      ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2); ctx.fill()
    })
    ctx.globalAlpha = 1

    // ── HUD ───────────────────────────────────────────────────────────
    const HX = W - 198, HY2 = 6, HW = 190, RH2 = 27
    ctx.fillStyle = 'rgba(4,8,18,0.84)'; ctx.fillRect(HX - 4, HY2, HW + 8, RH2 * 13 + 12)
    ctx.strokeStyle = '#1a3050'; ctx.lineWidth = 0.8; ctx.strokeRect(HX - 4, HY2, HW + 8, RH2 * 13 + 12)
    ctx.fillStyle = '#3d6a8a'; ctx.font = `bold ${clamp(W * 0.011, 8, 11)}px monospace`; ctx.textAlign = 'center'
    ctx.fillText('PROCESS MONITOR', HX + HW / 2, HY2 + 14)
    const rows = [
      ['CAST SPEED', `${speed.toFixed(2)} m/min`, '#FF8F00'],
      ['LADLE LEVEL', `${(ladleLevel * 100).toFixed(0)}%  ${(ladleLevel * 250).toFixed(0)}t`, '#FF7043'],
      ['LADLE FLOW', running ? `${sim.ladleFlowRate.toFixed(0)} kg/s` : '--', '#FF5722'],
      ['TUNDISH LEVEL', `${(tundishLevel * 100).toFixed(0)}%  ${(tundishLevel * 28).toFixed(1)}t`, '#FFB300'],
      ['TUNDISH TEMP', `${tundishTemp} °C`, '#FFA000'],
      ['SUPERHEAT', `${tundishTemp - 1537} °C`, tundishTemp - 1537 > 38 ? '#f85149' : '#57ab5a'],
      ['MOLD LEVEL', `${moldLevel.toFixed(1)} %`, '#00E5FF'],
      ['MOLD OSC', running ? `±${Math.abs(sim.moldOsc).toFixed(1)}mm` : 'OFF', '#00BCD4'],
      ['Z1 WATER', running ? `${(speed * 78).toFixed(0)} L/m` : '--', '#29B6F6'],
      ['Z2 WATER', running ? `${(speed * 56).toFixed(0)} L/m` : '--', '#4FC3F7'],
      ['Z3 WATER', running ? `${(speed * 40).toFixed(0)} L/m` : '--', '#81D4FA'],
      ['SLABS CUT', `${sim.slabsCut}`, '#9b5de5'],
      ['STATUS', running ? 'CASTING ●' : 'STANDBY ○', running ? '#57ab5a' : '#546E7A'],
    ]
    rows.forEach(([l, v, c], i) => {
      const ry = HY2 + 20 + i * RH2
      ctx.fillStyle = '#0a1422'; ctx.fillRect(HX, ry, HW, RH2 - 2)
      ctx.strokeStyle = '#1a3050'; ctx.lineWidth = 0.3; ctx.strokeRect(HX, ry, HW, RH2 - 2)
      ctx.fillStyle = '#4d7a9a'; ctx.font = `${clamp(W * 0.009, 7, 10)}px monospace`; ctx.textAlign = 'left'
      ctx.fillText(l, HX + 5, ry + 11)
      ctx.fillStyle = c; ctx.font = `bold ${clamp(W * 0.01, 8, 11)}px monospace`; ctx.textAlign = 'right'
      ctx.fillText(v, HX + HW - 4, ry + RH2 - 5)
    })

    // ── FOOTER ────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(4,8,18,0.9)'; ctx.fillRect(0, H - 18, W, 18)
    ctx.fillStyle = '#2c4055'; ctx.font = `${clamp(W * 0.009, 7, 10)}px monospace`; ctx.textAlign = 'left'
    ctx.fillText(`SINGLE STRAND SLAB CASTER  |  ${heatNo}  |  ${slabWidth}×${slabThick}mm  |  SPEED: ${speed.toFixed(2)} m/min`, 8, H - 4)
    ctx.textAlign = 'right'; ctx.fillText(new Date().toLocaleTimeString(), W - 8, H - 4)

    rafRef.current = requestAnimationFrame(draw)
  }, [running, speed, tundishTemp, moldLevel, slabWidth, slabThick, heatNo, ladleLevel, tundishLevel])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
}

// ─────────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg: '#07090f', panel: '#0b1220', border: '#1a2d45',
  text: '#cdd9e5', muted: '#6e8098', accent: '#FF8F00',
  success: '#57ab5a', danger: '#e5534b', cyan: '#39c5cf',
}
const clampUI = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function Slider({ label, value, onChange, min, max, step = 0.1, unit, disabled }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
        <span style={{ fontSize: 11, color: C.accent, fontFamily: 'monospace', fontWeight: 700 }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)} disabled={disabled}
        style={{ width: '100%', accentColor: C.accent, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer', height: 20 }} />
    </div>
  )
}

export default function SlabCastingModel() {
  const [running, setRunning]             = useState(false)
  const [speed, setSpeed]                 = useState(1.20)
  const [tundishTemp, setTundishTemp]     = useState(1555)
  const [slabWidth, setSlabWidth]         = useState(1200)
  const [slabThick, setSlabThick]         = useState(220)
  const [moldLevel, setMoldLevel]         = useState(85)
  const [ladleLevel, setLadleLevel]       = useState(1.0)
  const [tundishLevel, setTundishLevel]   = useState(0.7)
  const [elapsed, setElapsed]             = useState(0)
  const [slabsCut, setSlabsCut]           = useState(0)
  const [resetCount, setResetCount]       = useState(0)
  const [panelOpen, setPanelOpen]         = useState(true)
  const [heatNo]                          = useState(`SC-${Math.floor(Math.random() * 9000 + 1000)}`)
  const timerRef = useRef(null)

  useEffect(() => {
    if (running) { timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000) }
    else clearInterval(timerRef.current)
    return () => clearInterval(timerRef.current)
  }, [running])

  const fmt = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`

  return (
    <div style={{ height: '100dvh', background: C.bg, color: C.text, fontFamily: 'monospace', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: '#060a10', borderBottom: `1px solid ${C.border}`, padding: '0 12px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🏭</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>SINGLE STRAND SLAB CASTER</div>
            <div style={{ fontSize: 8, color: C.muted, letterSpacing: '0.1em' }}>PHYSICS-BASED REAL-TIME PLANT SIMULATION</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {[
            { l: 'TIME',   v: fmt(elapsed),             c: running ? C.success : C.muted },
            { l: 'LADLE',  v: `${(ladleLevel * 100).toFixed(0)}%`, c: ladleLevel < 0.2 ? C.danger : '#FF7043' },
            { l: 'TUNDISH',v: `${(tundishLevel*100).toFixed(0)}%`, c: '#FFB300' },
            { l: 'MOLD',   v: `${moldLevel.toFixed(0)}%`, c: moldLevel < 72 ? C.danger : C.success },
            { l: 'SLABS',  v: `${slabsCut}`,             c: C.cyan },
          ].map(item => (
            <div key={item.l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 7, color: C.muted }}>{item.l}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: item.c }}>{item.v}</div>
            </div>
          ))}
          <button onClick={() => setPanelOpen(v => !v)}
            style={{ padding: '4px 8px', borderRadius: 3, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11, cursor: 'pointer' }}>
            {panelOpen ? '◀' : '▶'}
          </button>
          <button onClick={() => { setRunning(v => !v); if (!running) { setElapsed(0); setLadleLevel(1.0); setTundishLevel(0.88); setMoldLevel(85); setSlabsCut(0); setResetCount(c => c + 1) } }}
            style={{ padding: '6px 14px', borderRadius: 4, border: `1px solid ${running ? C.danger : C.success}`, background: running ? 'rgba(229,83,73,0.15)' : 'rgba(87,171,90,0.15)', color: running ? C.danger : C.success, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em' }}>
            {running ? '⏹ STOP' : '▶ START'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {panelOpen && (
          <div style={{ width: 210, background: C.panel, borderRight: `1px solid ${C.border}`, padding: '12px', overflow: 'auto', flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.12em', marginBottom: 12 }}>PARAMETERS</div>
            <Slider label="Cast Speed" value={speed} onChange={setSpeed} min={0.5} max={2.5} step={0.05} unit=" m/min" disabled={running} />
            <Slider label="Tundish Temp" value={tundishTemp} onChange={setTundishTemp} min={1530} max={1580} step={1} unit="°C" disabled={running} />
            <Slider label="Slab Width" value={slabWidth} onChange={setSlabWidth} min={900} max={1680} step={10} unit="mm" disabled={running} />
            <Slider label="Slab Thick" value={slabThick} onChange={setSlabThick} min={150} max={300} step={10} unit="mm" disabled={running} />
            <div style={{ height: 1, background: C.border, margin: '10px 0' }} />
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.12em', marginBottom: 8 }}>LIVE VALUES</div>
            {[
              { l: 'Ladle', v: `${(ladleLevel * 100).toFixed(0)}%`, c: ladleLevel < 0.2 ? C.danger : '#FF7043' },
              { l: 'Tundish', v: `${(tundishLevel * 100).toFixed(0)}%`, c: '#FFB300' },
              { l: 'Superheat', v: `${tundishTemp - 1537}°C`, c: tundishTemp - 1537 > 40 ? C.danger : C.success },
              { l: 'Mold Level', v: `${moldLevel.toFixed(0)}%`, c: moldLevel < 72 ? C.danger : C.success },
              { l: 'Output', v: `${(slabWidth * slabThick * speed * 7.8 / 1e6).toFixed(2)}t/h`, c: C.accent },
              { l: 'Slabs Cut', v: `${slabsCut}`, c: C.cyan },
            ].map(r => (
              <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 9, color: C.muted }}>{r.l}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: r.c }}>{r.v}</span>
              </div>
            ))}
            <div style={{ height: 1, background: C.border, margin: '10px 0' }} />
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 6 }}>HEAT MAP</div>
            <div style={{ display: 'flex', height: 12, borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
              {Array.from({ length: 60 }, (_, i) => (
                <div key={i} style={{ flex: 1, background: heatColor(600 + i * 15.8, 600, 1550) }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: C.muted }}>
              <span>600°C</span><span>COOL → HOT</span><span>1550°C</span>
            </div>
            <div style={{ height: 1, background: C.border, margin: '10px 0' }} />
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 6 }}>LEGEND</div>
            {[['#FF6D00', 'Liquid steel'], ['#607D8B', 'Solid shell'], ['#29B6F6', 'Cooling water'], ['#FFD54F', 'TCM sparks'], ['#00E5FF', 'Mold level'], ['#9b5de5', 'Pool depth']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c, flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: C.muted }}>{l}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ flex: 1, overflow: 'hidden', background: '#06090f' }}>
          <CastingCanvas
            running={running} speed={speed} tundishTemp={tundishTemp}
            moldLevel={moldLevel} setMoldLevel={setMoldLevel}
            slabWidth={slabWidth} slabThick={slabThick} heatNo={heatNo}
            ladleLevel={ladleLevel} setLadleLevel={setLadleLevel}
            tundishLevel={tundishLevel} setTundishLevel={setTundishLevel}
            onSlabCut={() => setSlabsCut(v => v + 1)}
            doReset={resetCount}
          />
        </div>
      </div>
    </div>
  )
}
