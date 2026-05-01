import { useState, useEffect, useRef, useCallback } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATED CANVAS — draws the entire plant in real time
// ─────────────────────────────────────────────────────────────────────────────
function CastingCanvas({ running, speed, tundishTemp, moldLevel, slabWidth, slabThickness, heatNo }) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const st        = useRef({
    frame: 0,
    slabMove: 0,
    rollAngle: 0,
    moldOsc: 0, moldDir: 1,
    torchX: 260, torchActive: false, torchCooldown: 0,
    sparks: [], drops: [], slabChunks: [],
    slabsCut: 0,
  })

  // resize canvas to fill container
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const resize = () => {
      el.width  = el.parentElement.clientWidth
      el.height = el.parentElement.clientHeight
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return }
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    const s = st.current
    s.frame++

    // ── ADVANCE SIMULATION ─────────────────────────────────────────────────
    if (running) {
      s.slabMove  = (s.slabMove + speed * 0.15) % 55
      s.rollAngle += speed * 0.09

      // mold oscillation ±3 mm
      s.moldOsc += s.moldDir * 0.3
      if (Math.abs(s.moldOsc) > 3) s.moldDir *= -1

      // torch logic
      if (!s.torchActive) {
        s.torchCooldown -= 1
        if (s.torchCooldown <= 0) {
          s.torchActive  = true
          s.torchX       = W * 0.43
          s.torchCooldown = 0
        }
      } else {
        s.torchX += speed * 2.2
        // sparks
        for (let i = 0; i < 5; i++) s.sparks.push({
          x: s.torchX, y: H * 0.80,
          vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 4 - 1,
          life: 1, r: Math.random() * 2.5 + 0.5,
          col: Math.random() > 0.5 ? '#FF6D00' : '#FFD54F'
        })
        if (s.torchX > W * 0.62) {
          s.torchActive = false
          s.torchCooldown = Math.round(180 / speed)
          s.slabsCut++
          s.slabChunks.push({ x: W * 0.65, y: H * 0.79, vx: 1.8 + speed * 0.5, life: 1 })
        }
      }

      // spray drops — refill
      if (s.drops.length < 80) {
        const cx = W * 0.5        // strand centre X
        const zones = [{ y: H * 0.52, n: 4 }, { y: H * 0.60, n: 4 }, { y: H * 0.68, n: 3 }]
        zones.forEach(z => {
          for (let i = 0; i < z.n; i++) {
            s.drops.push({ x: cx - 28 + Math.random() * 4, y: z.y + Math.random() * 20,
              vx: -1.8 - Math.random() * 1.5, vy: 0.8 + Math.random(), life: 1, r: 1.3 })
            s.drops.push({ x: cx + 28 - Math.random() * 4, y: z.y + Math.random() * 20,
              vx:  1.8 + Math.random() * 1.5, vy: 0.8 + Math.random(), life: 1, r: 1.3 })
          }
        })
      }
    }

    // advance particles
    s.sparks = s.sparks.filter(p => p.life > 0).map(p => ({
      ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.2, life: p.life - 0.04 }))
    s.drops = s.drops.filter(p => p.life > 0).map(p => ({
      ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.035 }))
    s.slabChunks = s.slabChunks.filter(c => c.x < W + 200 && c.life > 0).map(c => ({
      ...c, x: c.x + c.vx }))

    // ── BACKGROUND ─────────────────────────────────────────────────────────
    ctx.fillStyle = '#07090f'
    ctx.fillRect(0, 0, W, H)
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.025)'
    ctx.lineWidth = 0.5
    for (let x = 0; x < W; x += 35) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    for (let y = 0; y < H; y += 35) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

    // ── LAYOUT REFERENCES (all % of W/H so it scales) ──
    const CX = W * 0.50        // strand centre X
    const SL = CX - 14         // strand left wall
    const SR = CX + 14         // strand right wall
    const SW = SR - SL         // strand inner width

    const LADLE_Y    = H * 0.01
    const LADLE_H    = H * 0.14
    const TUNDISH_Y  = LADLE_Y + LADLE_H + H * 0.04
    const TUNDISH_H  = H * 0.07
    const SEN_Y      = TUNDISH_Y + TUNDISH_H
    const SEN_H      = H * 0.04
    const MOLD_Y     = SEN_Y + SEN_H + s.moldOsc * 0.3
    const MOLD_H     = H * 0.11
    const STRAND_Y   = MOLD_Y + MOLD_H
    const STRAND_H   = H * 0.30
    const BEND_Y     = STRAND_Y + STRAND_H
    const RUNOUT_Y   = H * 0.79
    const RUNOUT_H   = H * 0.07

    // ── LADLE ──────────────────────────────────────────────────────────────
    const LW = W * 0.22
    const LX = CX - LW / 2
    // stand legs
    ctx.fillStyle = '#263238'
    ctx.fillRect(LX - 6, LADLE_Y + LADLE_H * 0.1, 8, LADLE_H * 0.9)
    ctx.fillRect(LX + LW - 2, LADLE_Y + LADLE_H * 0.1, 8, LADLE_H * 0.9)
    // body
    ctx.beginPath()
    ctx.moveTo(LX, LADLE_Y + LADLE_H * 0.12)
    ctx.lineTo(LX + LW, LADLE_Y + LADLE_H * 0.12)
    ctx.lineTo(LX + LW - 6, LADLE_Y + LADLE_H)
    ctx.lineTo(LX + 6, LADLE_Y + LADLE_H)
    ctx.closePath()
    ctx.fillStyle = '#37474F'; ctx.fill()
    ctx.strokeStyle = '#546E7A'; ctx.lineWidth = 1.2; ctx.stroke()
    // steel inside ladle
    const ladleInnerY = LADLE_Y + LADLE_H * 0.22
    const ladleInnerH = LADLE_H * 0.68
    const ladleGrd = ctx.createLinearGradient(0, ladleInnerY, 0, ladleInnerY + ladleInnerH)
    ladleGrd.addColorStop(0, running ? 'rgba(255,120,0,0.92)' : 'rgba(80,100,110,0.5)')
    ladleGrd.addColorStop(1, running ? 'rgba(180,30,0,0.7)'  : 'rgba(50,70,80,0.4)')
    ctx.fillStyle = ladleGrd
    ctx.beginPath()
    ctx.moveTo(LX + 6, ladleInnerY)
    ctx.lineTo(LX + LW - 6, ladleInnerY)
    ctx.lineTo(LX + LW - 10, ladleInnerY + ladleInnerH)
    ctx.lineTo(LX + 10, ladleInnerY + ladleInnerH)
    ctx.closePath(); ctx.fill()
    if (running) {
      const gw = ctx.createRadialGradient(CX, ladleInnerY, 5, CX, ladleInnerY, LW * 0.6)
      gw.addColorStop(0, 'rgba(255,120,0,0.22)'); gw.addColorStop(1, 'rgba(255,80,0,0)')
      ctx.fillStyle = gw; ctx.fillRect(LX - 10, LADLE_Y, LW + 20, LADLE_H + 10)
    }
    ctx.fillStyle = '#78909C'; ctx.font = `${Math.max(9, W * 0.012)}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText('LADLE', CX, LADLE_Y + H * 0.008)
    ctx.fillStyle = running ? '#FF8F00' : '#546E7A'; ctx.font = `${Math.max(8, W * 0.01)}px monospace`
    ctx.fillText(`${tundishTemp + 18}°C`, CX, LADLE_Y + LADLE_H * 0.55)
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = `${Math.max(7, W * 0.009)}px monospace`
    ctx.fillText(heatNo, CX, LADLE_Y + LADLE_H * 0.75)

    // ── LADLE SHROUD ───────────────────────────────────────────────────────
    ctx.fillStyle = '#37474F'
    ctx.fillRect(CX - 5, LADLE_Y + LADLE_H, 10, H * 0.03)
    if (running) {
      const sg = ctx.createLinearGradient(0, LADLE_Y + LADLE_H, 0, TUNDISH_Y)
      sg.addColorStop(0, 'rgba(255,100,0,0.9)'); sg.addColorStop(1, 'rgba(255,80,0,0.4)')
      ctx.fillStyle = sg; ctx.fillRect(CX - 4, LADLE_Y + LADLE_H, 8, H * 0.03)
    }

    // ── TUNDISH ────────────────────────────────────────────────────────────
    const TW = W * 0.28
    const TX = CX - TW / 2
    ctx.beginPath()
    ctx.moveTo(TX, TUNDISH_Y); ctx.lineTo(TX + TW, TUNDISH_Y)
    ctx.lineTo(TX + TW - 8, TUNDISH_Y + TUNDISH_H)
    ctx.lineTo(TX + 8, TUNDISH_Y + TUNDISH_H); ctx.closePath()
    ctx.fillStyle = '#2c3e50'; ctx.fill()
    ctx.strokeStyle = '#455A64'; ctx.lineWidth = 1.2; ctx.stroke()
    // tundish steel
    const tundishInnerY = TUNDISH_Y + H * 0.008
    const tg = ctx.createLinearGradient(0, tundishInnerY, 0, TUNDISH_Y + TUNDISH_H - H * 0.005)
    tg.addColorStop(0, running ? 'rgba(255,140,0,0.9)' : 'rgba(69,90,100,0.7)')
    tg.addColorStop(1, running ? 'rgba(200,60,0,0.75)' : 'rgba(55,71,79,0.5)')
    ctx.fillStyle = tg
    ctx.beginPath()
    ctx.moveTo(TX + 8, tundishInnerY); ctx.lineTo(TX + TW - 8, tundishInnerY)
    ctx.lineTo(TX + TW - 14, TUNDISH_Y + TUNDISH_H - H * 0.005)
    ctx.lineTo(TX + 14, TUNDISH_Y + TUNDISH_H - H * 0.005); ctx.closePath(); ctx.fill()
    if (running) {
      const tgw = ctx.createRadialGradient(CX, tundishInnerY, 3, CX, tundishInnerY, TW * 0.5)
      tgw.addColorStop(0, 'rgba(255,140,0,0.2)'); tgw.addColorStop(1, 'rgba(255,140,0,0)')
      ctx.fillStyle = tgw; ctx.fillRect(TX, TUNDISH_Y, TW, TUNDISH_H + 10)
    }
    ctx.fillStyle = '#90A4AE'; ctx.font = `${Math.max(8, W * 0.011)}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText('TUNDISH', CX, TUNDISH_Y - H * 0.004)
    ctx.fillStyle = running ? '#FFB300' : '#546E7A'; ctx.font = `${Math.max(8, W * 0.01)}px monospace`
    ctx.fillText(`${tundishTemp}°C`, CX, TUNDISH_Y + TUNDISH_H * 0.55)

    // ── SEN ────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#37474F'
    ctx.fillRect(CX - 5, SEN_Y, 10, SEN_H)
    if (running) {
      const sfg = ctx.createLinearGradient(0, SEN_Y, 0, SEN_Y + SEN_H)
      sfg.addColorStop(0, 'rgba(255,100,0,0.85)'); sfg.addColorStop(1, 'rgba(255,60,0,0.5)')
      ctx.fillStyle = sfg; ctx.fillRect(CX - 4, SEN_Y, 8, SEN_H)
    }
    ctx.strokeStyle = '#546E7A'; ctx.lineWidth = 0.8
    ctx.strokeRect(CX - 5, SEN_Y, 10, SEN_H)
    ctx.fillStyle = '#546E7A'; ctx.font = `${Math.max(7, W * 0.009)}px monospace`
    ctx.textAlign = 'center'; ctx.fillText('SEN', CX, SEN_Y + SEN_H * 0.55)

    // ── MOLD ───────────────────────────────────────────────────────────────
    const MoldW = 22
    // copper plates
    const copperGrd = ctx.createLinearGradient(SL - MoldW, 0, SL, 0)
    copperGrd.addColorStop(0, '#1a3a4a'); copperGrd.addColorStop(0.5, '#2a5060'); copperGrd.addColorStop(1, '#1a3a4a')
    // Left plate
    ctx.fillStyle = copperGrd; ctx.fillRect(SL - MoldW, MOLD_Y, MoldW, MOLD_H)
    ctx.strokeStyle = '#29B6F6'; ctx.lineWidth = 0.5; ctx.strokeRect(SL - MoldW, MOLD_Y, MoldW, MOLD_H)
    // Right plate
    const copperGrd2 = ctx.createLinearGradient(SR, 0, SR + MoldW, 0)
    copperGrd2.addColorStop(0, '#1a3a4a'); copperGrd2.addColorStop(0.5, '#2a5060'); copperGrd2.addColorStop(1, '#1a3a4a')
    ctx.fillStyle = copperGrd2; ctx.fillRect(SR, MOLD_Y, MoldW, MOLD_H)
    ctx.strokeStyle = '#29B6F6'; ctx.lineWidth = 0.5; ctx.strokeRect(SR, MOLD_Y, MoldW, MOLD_H)
    // water channel lines
    for (let i = 1; i < 5; i++) {
      ctx.strokeStyle = `rgba(41,182,246,${0.15 + i * 0.05})`; ctx.lineWidth = 1.5
      const cy2 = MOLD_Y + MOLD_H * i / 5
      ctx.beginPath(); ctx.moveTo(SL - MoldW, cy2); ctx.lineTo(SL, cy2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(SR, cy2); ctx.lineTo(SR + MoldW, cy2); ctx.stroke()
    }
    // liquid steel in mold
    const moldSteelTop = MOLD_Y + H * 0.008
    const moldSteelH   = MOLD_H * (moldLevel / 100) * 0.88
    const msg = ctx.createLinearGradient(0, moldSteelTop, 0, moldSteelTop + moldSteelH)
    msg.addColorStop(0, 'rgba(255,100,0,0.97)')
    msg.addColorStop(0.5, 'rgba(210,55,0,0.88)')
    msg.addColorStop(1, 'rgba(160,25,0,0.7)')
    ctx.fillStyle = msg; ctx.fillRect(SL, moldSteelTop, SW, moldSteelH)
    // meniscus shimmer
    if (running) {
      ctx.fillStyle = `rgba(255,200,60,${0.35 + 0.2 * Math.sin(s.frame * 0.18)})`
      ctx.fillRect(SL, moldSteelTop, SW, 3)
      const mgw = ctx.createRadialGradient(CX, moldSteelTop, 2, CX, moldSteelTop, 36)
      mgw.addColorStop(0, 'rgba(255,120,0,0.2)'); mgw.addColorStop(1, 'rgba(255,80,0,0)')
      ctx.fillStyle = mgw; ctx.fillRect(SL - 20, moldSteelTop - 10, SW + 40, 30)
    }
    // mold level line
    ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(SL - MoldW - 2, moldSteelTop); ctx.lineTo(SR + MoldW + 2, moldSteelTop); ctx.stroke()
    ctx.setLineDash([])
    // oscillation label
    ctx.fillStyle = '#78909C'; ctx.font = `${Math.max(8, W * 0.01)}px monospace`; ctx.textAlign = 'center'
    ctx.fillText('MOLD', CX, MOLD_Y - H * 0.005)
    ctx.fillStyle = '#00BCD4'; ctx.font = `${Math.max(7, W * 0.009)}px monospace`
    ctx.fillText(`OSC ${s.moldOsc > 0 ? '↑' : '↓'} ${Math.abs(s.moldOsc).toFixed(1)}mm`, CX, MOLD_Y + MOLD_H + H * 0.012)

    // ── SOLIDIFYING STRAND ─────────────────────────────────────────────────
    // shell walls
    const shellGrd = ctx.createLinearGradient(SL - 14, 0, SR + 14, 0)
    shellGrd.addColorStop(0, '#37474F'); shellGrd.addColorStop(0.4, '#546E7A')
    shellGrd.addColorStop(0.6, '#607D8B'); shellGrd.addColorStop(1, '#37474F')
    ctx.fillStyle = shellGrd
    ctx.fillRect(SL - 14, STRAND_Y, 14, STRAND_H)  // left shell
    ctx.fillRect(SR, STRAND_Y, 14, STRAND_H)         // right shell

    // liquid core (shrinks with solidification)
    if (running) {
      const liquidH  = Math.min(STRAND_H * 0.68, speed * speed * 52)
      const liquidGrd = ctx.createLinearGradient(0, STRAND_Y, 0, STRAND_Y + liquidH)
      liquidGrd.addColorStop(0, 'rgba(255,80,0,0.92)')
      liquidGrd.addColorStop(0.5, 'rgba(200,40,0,0.75)')
      liquidGrd.addColorStop(1, 'rgba(140,15,0,0.2)')
      ctx.fillStyle = liquidGrd; ctx.fillRect(SL, STRAND_Y, SW, liquidH)
    }

    // moving solidified slab texture
    ctx.save()
    ctx.beginPath(); ctx.rect(SL - 14, STRAND_Y, SW + 28, STRAND_H); ctx.clip()
    for (let yy = -55 + s.slabMove; yy < STRAND_H + 55; yy += 22) {
      ctx.strokeStyle = `rgba(80,120,140,${0.12 + 0.06 * Math.sin(yy)})`
      ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(SL - 14, STRAND_Y + yy); ctx.lineTo(SR + 14, STRAND_Y + yy); ctx.stroke()
    }
    ctx.restore()

    // ── PINCH ROLLS ────────────────────────────────────────────────────────
    const rollYs = [STRAND_Y + STRAND_H * 0.18, STRAND_Y + STRAND_H * 0.45,
                    STRAND_Y + STRAND_H * 0.70, STRAND_Y + STRAND_H * 0.92]
    rollYs.forEach(ry => {
      [-1, 1].forEach(side => {
        const rx = side < 0 ? SL - 10 : SR + 10
        ctx.save(); ctx.translate(rx, ry)
        ctx.rotate(side < 0 ? s.rollAngle : -s.rollAngle)
        ctx.fillStyle = '#37474F'; ctx.strokeStyle = '#607D8B'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#546E7A'
        ctx.beginPath(); ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      })
    })

    // ── SECONDARY COOLING SPRAYS ───────────────────────────────────────────
    const zoneYs = [STRAND_Y + STRAND_H * 0.05, STRAND_Y + STRAND_H * 0.35, STRAND_Y + STRAND_H * 0.62]
    zoneYs.forEach((zy, zi) => {
      ctx.strokeStyle = 'rgba(41,182,246,0.2)'; ctx.lineWidth = 0.8; ctx.setLineDash([3, 3])
      ctx.strokeRect(SL - 28, zy, SW + 56, STRAND_H * 0.28); ctx.setLineDash([])
      ctx.fillStyle = '#0288D1'; ctx.font = `${Math.max(7, W * 0.009)}px monospace`
      ctx.textAlign = 'left'; ctx.fillText(`Z${zi + 1}`, SL - 44, zy + 10)
      // nozzle circles
      if (running) {
        ctx.fillStyle = '#29B6F6'
        ctx.beginPath(); ctx.arc(SL - 20, zy + 12, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(SR + 20, zy + 12, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(SL - 20, zy + 32, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(SR + 20, zy + 32, 2.5, 0, Math.PI * 2); ctx.fill()
      }
    })
    // water droplets
    if (running) {
      s.drops.forEach(d => {
        ctx.globalAlpha = d.life * 0.75
        ctx.fillStyle = '#4FC3F7'
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill()
      })
      ctx.globalAlpha = 1
    }

    // ── STRAND BEND ────────────────────────────────────────────────────────
    const BEND_R = W * 0.065
    ctx.save()
    ctx.strokeStyle = '#3d5a6a'; ctx.lineWidth = SW + 28; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.arc(CX + BEND_R, BEND_Y, BEND_R, -Math.PI, -Math.PI * 0.5, false)
    ctx.stroke()
    if (running) {
      ctx.strokeStyle = 'rgba(180,50,0,0.4)'; ctx.lineWidth = SW
      ctx.beginPath(); ctx.arc(CX + BEND_R, BEND_Y, BEND_R, -Math.PI, -Math.PI * 0.5, false)
      ctx.stroke()
    }
    ctx.restore()

    // ── HORIZONTAL RUNOUT TABLE ────────────────────────────────────────────
    const ROX  = CX + BEND_R - 2     // runout start X
    const ROW  = W - ROX - 10         // runout width
    ctx.fillStyle = '#111d2c'
    ctx.fillRect(ROX, RUNOUT_Y, ROW, RUNOUT_H)
    ctx.strokeStyle = '#1e3348'; ctx.lineWidth = 1; ctx.strokeRect(ROX, RUNOUT_Y, ROW, RUNOUT_H)
    // horizontal rollers
    for (let rx = ROX + 18; rx < ROX + ROW - 10; rx += 24) {
      ctx.save(); ctx.translate(rx, RUNOUT_Y + RUNOUT_H * 0.45)
      ctx.rotate(running ? s.rollAngle * 0.7 : 0)
      ctx.fillStyle = '#2c4055'; ctx.strokeStyle = '#3d5a73'; ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#37506a'
      ctx.beginPath(); ctx.ellipse(0, 0, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
    // slab on runout (moving)
    if (running) {
      const sROX = ROX + 10 + s.slabMove * 2.5
      const sRW  = Math.min(ROW * 0.45, 120)
      if (sROX + sRW < ROX + ROW) {
        const srg = ctx.createLinearGradient(sROX, RUNOUT_Y, sROX, RUNOUT_Y + RUNOUT_H)
        srg.addColorStop(0, '#E64A19'); srg.addColorStop(0.35, '#BF360C'); srg.addColorStop(1, '#607D8B')
        ctx.fillStyle = srg; ctx.fillRect(sROX, RUNOUT_Y + 2, sRW, RUNOUT_H - 4)
        ctx.strokeStyle = '#455A64'; ctx.lineWidth = 0.5; ctx.strokeRect(sROX, RUNOUT_Y + 2, sRW, RUNOUT_H - 4)
        // heat glow on slab
        ctx.fillStyle = `rgba(255,80,0,${0.12 + 0.08 * Math.sin(s.frame * 0.1)})`
        ctx.fillRect(sROX, RUNOUT_Y + 2, sRW * 0.3, RUNOUT_H - 4)
      }
    }

    // ── TORCH CUTTING MACHINE ──────────────────────────────────────────────
    const TORCH_TRACK_Y = RUNOUT_Y - H * 0.04
    // torch rail
    ctx.fillStyle = '#111d2c'; ctx.fillRect(ROX, TORCH_TRACK_Y, ROW * 0.55, H * 0.025)
    ctx.fillStyle = '#1a2d40'; ctx.fillRect(ROX, TORCH_TRACK_Y + H * 0.007, ROW * 0.55, H * 0.003)
    ctx.fillRect(ROX, TORCH_TRACK_Y + H * 0.015, ROW * 0.55, H * 0.003)
    ctx.fillStyle = '#2c4055'; ctx.font = `${Math.max(7, W * 0.009)}px monospace`
    ctx.textAlign = 'left'; ctx.fillText('TORCH CUTTING', ROX + 2, TORCH_TRACK_Y - H * 0.005)

    if (s.torchActive) {
      const tx = s.torchX
      // carriage body
      ctx.fillStyle = '#1e3348'; ctx.strokeStyle = '#2c4a65'; ctx.lineWidth = 1
      ctx.fillRect(tx - 18, TORCH_TRACK_Y - H * 0.01, 36, H * 0.045)
      ctx.strokeRect(tx - 18, TORCH_TRACK_Y - H * 0.01, 36, H * 0.045)
      // torch arm
      ctx.fillStyle = '#2c4a65'; ctx.fillRect(tx - 3, TORCH_TRACK_Y + H * 0.03, 6, H * 0.03)
      // oxy-acetylene hoses
      ctx.strokeStyle = '#E53935'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(tx + 5, TORCH_TRACK_Y); ctx.bezierCurveTo(tx + 30, TORCH_TRACK_Y - 10, ROX + ROW * 0.55, TORCH_TRACK_Y - 12, ROX + ROW * 0.55, TORCH_TRACK_Y); ctx.stroke()
      ctx.strokeStyle = '#1565C0'
      ctx.beginPath(); ctx.moveTo(tx - 5, TORCH_TRACK_Y); ctx.bezierCurveTo(tx - 30, TORCH_TRACK_Y - 8, ROX + ROW * 0.55, TORCH_TRACK_Y - 8, ROX + ROW * 0.55, TORCH_TRACK_Y); ctx.stroke()
      // torch tip
      ctx.fillStyle = '#FFB300'
      ctx.beginPath(); ctx.arc(tx, RUNOUT_Y - 2, 4, 0, Math.PI * 2); ctx.fill()
      // FLAME
      const flameR = 10 + 3 * Math.sin(s.frame * 0.4)
      const fg = ctx.createRadialGradient(tx, RUNOUT_Y + 2, 0, tx, RUNOUT_Y + 2, flameR)
      fg.addColorStop(0, 'rgba(255,255,255,0.95)'); fg.addColorStop(0.25, 'rgba(255,240,0,0.9)')
      fg.addColorStop(0.6, 'rgba(255,100,0,0.7)'); fg.addColorStop(1, 'rgba(255,0,0,0)')
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(tx, RUNOUT_Y + 2, flameR, 0, Math.PI * 2); ctx.fill()
      // cut line on slab
      ctx.strokeStyle = `rgba(255,120,0,${0.6 + 0.4 * Math.sin(s.frame * 0.5)})`
      ctx.lineWidth = 2; ctx.setLineDash([])
      ctx.beginPath(); ctx.moveTo(tx, RUNOUT_Y); ctx.lineTo(tx, RUNOUT_Y + RUNOUT_H - 4); ctx.stroke()
      // label
      ctx.fillStyle = '#FFD54F'; ctx.font = `bold ${Math.max(8, W * 0.01)}px monospace`
      ctx.textAlign = 'center'; ctx.fillText('● CUTTING', tx, TORCH_TRACK_Y - H * 0.015)
    } else {
      // parked torch
      const px = ROX + 12
      ctx.fillStyle = '#0d1822'; ctx.strokeStyle = '#1e3348'; ctx.lineWidth = 1
      ctx.fillRect(px, TORCH_TRACK_Y - H * 0.01, 36, H * 0.045)
      ctx.strokeRect(px, TORCH_TRACK_Y - H * 0.01, 36, H * 0.045)
      ctx.fillStyle = '#2c4a65'; ctx.font = `${Math.max(7, W * 0.009)}px monospace`
      ctx.textAlign = 'center'; ctx.fillText('STANDBY', px + 18, TORCH_TRACK_Y + H * 0.025)
    }

    // ── SPARKS ─────────────────────────────────────────────────────────────
    s.sparks.forEach(sp => {
      ctx.globalAlpha = sp.life
      ctx.fillStyle = sp.col
      ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = sp.life * 0.3
      ctx.fillStyle = '#FF8F00'
      ctx.beginPath(); ctx.arc(sp.x - sp.vx * 0.5, sp.y - sp.vy * 0.5, sp.r * 0.4, 0, Math.PI * 2); ctx.fill()
    })
    ctx.globalAlpha = 1

    // ── CUT SLABS MOVING AWAY ──────────────────────────────────────────────
    s.slabChunks.forEach(c => {
      const cg = ctx.createLinearGradient(c.x, 0, c.x + 80, 0)
      cg.addColorStop(0, '#546E7A'); cg.addColorStop(0.5, '#607D8B'); cg.addColorStop(1, '#455A64')
      ctx.fillStyle = cg; ctx.fillRect(c.x, RUNOUT_Y + 2, 80, RUNOUT_H - 4)
      ctx.strokeStyle = '#37474F'; ctx.lineWidth = 0.5; ctx.strokeRect(c.x, RUNOUT_Y + 2, 80, RUNOUT_H - 4)
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.font = `${Math.max(7, W * 0.009)}px monospace`
      ctx.textAlign = 'center'; ctx.fillText(`#${s.slabsCut}`, c.x + 40, RUNOUT_Y + RUNOUT_H * 0.6)
    })

    // ── STATUS OVERLAY (top right mini panel) ─────────────────────────────
    const OX = W - W * 0.19, OY = H * 0.02, OW = W * 0.18, ROWH = H * 0.044
    ctx.fillStyle = 'rgba(4,8,16,0.78)'; ctx.fillRect(OX - 4, OY, OW + 8, ROWH * 10 + 6)
    ctx.strokeStyle = '#1e3348'; ctx.lineWidth = 0.8; ctx.strokeRect(OX - 4, OY, OW + 8, ROWH * 10 + 6)
    const rows = [
      ['SPEED', `${speed.toFixed(2)} m/m`, '#FF8F00'],
      ['MOLD LVL', `${moldLevel.toFixed(0)} %`, '#00E5FF'],
      ['TUN TEMP', `${tundishTemp} °C`, '#FFB300'],
      ['SUPERHEAT', `${tundishTemp - 1537} °C`, tundishTemp - 1537 > 38 ? '#f85149' : '#57ab5a'],
      ['SLABS CUT', `${s.slabsCut}`, '#9b5de5'],
      ['Z1 WATER', running ? `${(speed * 80).toFixed(0)} L/m` : '0', '#29B6F6'],
      ['Z2 WATER', running ? `${(speed * 55).toFixed(0)} L/m` : '0', '#4FC3F7'],
      ['Z3 WATER', running ? `${(speed * 35).toFixed(0)} L/m` : '0', '#81D4FA'],
      ['OUTPUT', `${(slabWidth * slabThickness * speed * 7.8 / 1e6).toFixed(2)} t/h`, '#39c5cf'],
      ['STATUS', running ? 'CASTING ●' : 'STANDBY ○', running ? '#57ab5a' : '#546E7A'],
    ]
    ctx.font = `${Math.max(7, W * 0.009)}px monospace`
    rows.forEach(([l, v, c], i) => {
      const ry = OY + 4 + i * ROWH
      ctx.fillStyle = '#4d7a9a'; ctx.textAlign = 'left'; ctx.fillText(l, OX, ry + ROWH * 0.65)
      ctx.fillStyle = c; ctx.textAlign = 'right'; ctx.fillText(v, OX + OW, ry + ROWH * 0.65)
      ctx.strokeStyle = 'rgba(30,45,69,0.6)'; ctx.lineWidth = 0.4
      ctx.beginPath(); ctx.moveTo(OX - 2, ry + ROWH); ctx.lineTo(OX + OW, ry + ROWH); ctx.stroke()
    })

    // ── FOOTER ─────────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(4,8,16,0.8)'; ctx.fillRect(0, H - 18, W, 18)
    ctx.fillStyle = '#2c4055'; ctx.font = `${Math.max(8, W * 0.01)}px monospace`
    ctx.textAlign = 'left'; ctx.fillText(`SINGLE STRAND SLAB CASTER | ${heatNo} | ${slabWidth}×${slabThickness}mm`, 8, H - 5)
    ctx.textAlign = 'right'; ctx.fillText(new Date().toLocaleTimeString(), W - 8, H - 5)

    rafRef.current = requestAnimationFrame(draw)
  }, [running, speed, tundishTemp, moldLevel, slabWidth, slabThickness, heatNo])

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
  bg: '#07090f', panel: '#0c1220', border: '#1e2d45',
  text: '#cdd9e5', muted: '#6e8098', accent: '#FF8F00',
  success: '#57ab5a', danger: '#e5534b', cyan: '#39c5cf', warning: '#c69026',
}

function Slider({ label, value, onChange, min, max, step = 0.1, unit, disabled }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
        <span style={{ fontSize: 11, color: C.accent, fontFamily: 'monospace', fontWeight: 700 }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} disabled={disabled}
        style={{ width: '100%', accentColor: C.accent, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer', height: 20 }} />
    </div>
  )
}

export default function SlabCastingModel() {
  const [running, setRunning]         = useState(false)
  const [speed, setSpeed]             = useState(1.20)
  const [tundishTemp, setTundishTemp] = useState(1555)
  const [slabWidth, setSlabWidth]     = useState(1200)
  const [slabThick, setSlabThick]     = useState(220)
  const [moldLevel, setMoldLevel]     = useState(85)
  const [elapsed, setElapsed]         = useState(0)
  const [castLen, setCastLen]         = useState(0)
  const [panelOpen, setPanelOpen]     = useState(true)
  const [heatNo]                      = useState(`SC-${Math.floor(Math.random() * 9000 + 1000)}`)
  const timerRef = useRef(null)

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => {
        setElapsed(t => t + 1)
        setCastLen(l => l + speed / 60)
        setMoldLevel(v => Math.max(55, Math.min(100, v + (Math.random() - 0.48) * 1.5 + (85 - v) * 0.05)))
      }, 1000)
    } else clearInterval(timerRef.current)
    return () => clearInterval(timerRef.current)
  }, [running, speed])

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div style={{ height: '100dvh', background: C.bg, color: C.text, fontFamily: 'monospace', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: '#060a10', borderBottom: `1px solid ${C.border}`, padding: '0 12px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔩</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1.2 }}>SLAB CASTING MODEL</div>
            <div style={{ fontSize: 8, color: C.muted, letterSpacing: '0.1em' }}>SINGLE STRAND · REAL-TIME</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: running ? C.success : C.muted, fontFamily: 'monospace' }}>{fmt(elapsed)}</span>
          <span style={{ fontSize: 10, color: C.cyan }}>{castLen.toFixed(1)}m</span>
          <button onClick={() => setPanelOpen(v => !v)}
            style={{ padding: '4px 8px', borderRadius: 3, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11, cursor: 'pointer' }}>
            {panelOpen ? '◀' : '▶'}
          </button>
          <button onClick={() => { setRunning(v => !v); if (!running) { setElapsed(0); setCastLen(0) } }}
            style={{ padding: '6px 14px', borderRadius: 4, border: `1px solid ${running ? C.danger : C.success}`, background: running ? 'rgba(229,83,73,0.15)' : 'rgba(87,171,90,0.15)', color: running ? C.danger : C.success, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em' }}>
            {running ? '⏹ STOP' : '▶ START'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Control Panel */}
        {panelOpen && (
          <div style={{ width: 200, background: C.panel, borderRight: `1px solid ${C.border}`, padding: '12px', overflow: 'auto', flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.12em', marginBottom: 12 }}>PARAMETERS</div>
            <Slider label="Cast Speed" value={speed} onChange={setSpeed} min={0.5} max={2.5} step={0.05} unit=" m/min" disabled={running} />
            <Slider label="Tundish Temp" value={tundishTemp} onChange={setTundishTemp} min={1530} max={1580} step={1} unit="°C" disabled={running} />
            <Slider label="Slab Width" value={slabWidth} onChange={setSlabWidth} min={900} max={1680} step={10} unit="mm" disabled={running} />
            <Slider label="Slab Thick" value={slabThick} onChange={setSlabThick} min={150} max={300} step={10} unit="mm" disabled={running} />
            <div style={{ height: 1, background: C.border, margin: '10px 0' }} />
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.12em', marginBottom: 8 }}>COMPUTED</div>
            {[
              { l: 'Superheat', v: `${tundishTemp - 1537}°C`, c: tundishTemp - 1537 > 40 ? C.danger : C.success },
              { l: 'Pool Depth', v: `${(speed * speed * 6.5).toFixed(1)}m`, c: C.cyan },
              { l: 'Output', v: `${(slabWidth * slabThick * speed * 7.8 / 1e6).toFixed(2)}t/h`, c: C.accent },
              { l: 'Mold Level', v: `${moldLevel.toFixed(0)}%`, c: moldLevel < 72 ? C.danger : C.success },
            ].map(r => (
              <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 9, color: C.muted }}>{r.l}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: r.c }}>{r.v}</span>
              </div>
            ))}
            <div style={{ height: 1, background: C.border, margin: '10px 0' }} />
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 6 }}>LEGEND</div>
            {[['#FF6D00','Liquid steel'],['#607D8B','Solid shell'],['#29B6F6','Cooling water'],['#FFD54F','Torch sparks'],['#00E5FF','Mold level']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c, flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: C.muted }}>{l}</span>
              </div>
            ))}
          </div>
        )}
        {/* Canvas fills remaining space */}
        <div style={{ flex: 1, overflow: 'hidden', background: '#07090f' }}>
          <CastingCanvas running={running} speed={speed} tundishTemp={tundishTemp}
            moldLevel={moldLevel} slabWidth={slabWidth} slabThickness={slabThick} heatNo={heatNo} />
        </div>
      </div>
    </div>
  )
}
