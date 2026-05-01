import { useState, useEffect, useRef, useCallback } from 'react'

const N = 6 // strands

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS — draws the entire 6-strand billet caster in real-time
// ─────────────────────────────────────────────────────────────────────────────
function BilletCanvas({ running, strands, tundishTemp, billetSize, heatNo }) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const st        = useRef({
    frame: 0,
    strandMove: Array(N).fill(0),
    rollAngle:  Array(N).fill(0),
    moldOsc:    Array(N).fill(0),
    moldDir:    Array(N).fill(1),
    drops:      Array.from({ length: N }, () => []),
    sparks:     Array.from({ length: N }, () => []),
    torchX:     Array(N).fill(0),
    torchActive: Array(N).fill(false),
    torchCD:    Array(N).fill(0),
    billetsCut: Array(N).fill(0),
    cutBillets: Array.from({ length: N }, () => []),
  })

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const resize = () => { el.width = el.parentElement.clientWidth; el.height = el.parentElement.clientHeight }
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

    // layout
    const MARGIN    = W * 0.01
    const STRAND_W  = (W - MARGIN * 2) / N
    const CXS       = Array.from({ length: N }, (_, i) => MARGIN + STRAND_W * i + STRAND_W / 2)
    const LADLE_Y   = H * 0.01
    const LADLE_H   = H * 0.11
    const TUN_Y     = LADLE_Y + LADLE_H + H * 0.025
    const TUN_H     = H * 0.06
    const SEN_Y     = TUN_Y + TUN_H
    const SEN_H     = H * 0.035
    const MOLD_Y    = SEN_Y + SEN_H
    const MOLD_H    = H * 0.10
    const STR_Y     = MOLD_Y + MOLD_H
    const STR_H     = H * 0.28
    const BEND_Y    = STR_Y + STR_H
    const ROT_Y     = H * 0.85
    const ROT_H     = H * 0.06
    const SW        = Math.max(8, Math.min(18, STRAND_W * 0.22))

    // ── BACKGROUND ──
    ctx.fillStyle = '#070a10'; ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(255,255,255,0.02)'; ctx.lineWidth = 0.5
    for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

    // advance simulation
    strands.forEach((st2, i) => {
      if (!st2.active || !running) return
      const sp = st2.speed
      s.strandMove[i] = (s.strandMove[i] + sp * 0.14) % 50
      s.rollAngle[i]  += sp * 0.09
      s.moldOsc[i]    += s.moldDir[i] * 0.28
      if (Math.abs(s.moldOsc[i]) > 2.5) s.moldDir[i] *= -1

      // torch
      if (!s.torchActive[i]) {
        s.torchCD[i]--
        if (s.torchCD[i] <= 0) {
          s.torchActive[i] = true
          s.torchX[i] = CXS[i] - SW
        }
      } else {
        s.torchX[i] += sp * 1.6
        for (let k = 0; k < 4; k++) s.sparks[i].push({
          x: s.torchX[i], y: ROT_Y,
          vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 3.5 - 0.5,
          life: 1, r: Math.random() * 2.5 + 0.5,
          col: Math.random() > 0.5 ? '#FF6D00' : '#FFD54F'
        })
        if (s.torchX[i] > CXS[i] + SW + 4) {
          s.torchActive[i] = false
          s.torchCD[i] = Math.round(160 / sp)
          s.billetsCut[i]++
          s.cutBillets[i].push({ x: CXS[i] + SW + 12, y: ROT_Y + 3, vx: 1.4 + sp * 0.4, life: 1 })
        }
      }

      // spray drops
      if (s.drops[i].length < 20) {
        const cx = CXS[i]
        ;[STR_Y + STR_H * 0.1, STR_Y + STR_H * 0.4, STR_Y + STR_H * 0.68].forEach(zy => {
          s.drops[i].push({ x: cx - SW - 2, y: zy + Math.random() * 20, vx: -1.5 - Math.random(), vy: 0.7 + Math.random() * 0.8, life: 1 })
          s.drops[i].push({ x: cx + SW + 2, y: zy + Math.random() * 20, vx:  1.5 + Math.random(), vy: 0.7 + Math.random() * 0.8, life: 1 })
        })
      }
    })

    // update particles
    for (let i = 0; i < N; i++) {
      s.sparks[i] = s.sparks[i].filter(p => p.life > 0).map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.18, life: p.life - 0.04 }))
      s.drops[i]  = s.drops[i].filter(p => p.life > 0).map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.038 }))
      s.cutBillets[i] = s.cutBillets[i].filter(c => c.x < W + 120).map(c => ({ ...c, x: c.x + c.vx }))
    }

    // ── LADLE ──────────────────────────────────────────────────────────────
    const LW = W * 0.24, LX = W / 2 - LW / 2
    ctx.beginPath(); ctx.moveTo(LX, LADLE_Y + LADLE_H * 0.1); ctx.lineTo(LX + LW, LADLE_Y + LADLE_H * 0.1)
    ctx.lineTo(LX + LW - 8, LADLE_Y + LADLE_H); ctx.lineTo(LX + 8, LADLE_Y + LADLE_H); ctx.closePath()
    ctx.fillStyle = '#2c3e50'; ctx.fill(); ctx.strokeStyle = '#546E7A'; ctx.lineWidth = 1.2; ctx.stroke()
    // steel in ladle
    const lg = ctx.createLinearGradient(0, LADLE_Y + LADLE_H * 0.2, 0, LADLE_Y + LADLE_H)
    lg.addColorStop(0, running ? 'rgba(255,130,0,0.9)' : 'rgba(70,90,100,0.5)')
    lg.addColorStop(1, running ? 'rgba(180,30,0,0.7)' : 'rgba(45,60,70,0.4)')
    ctx.fillStyle = lg
    ctx.beginPath(); ctx.moveTo(LX + 10, LADLE_Y + LADLE_H * 0.2); ctx.lineTo(LX + LW - 10, LADLE_Y + LADLE_H * 0.2)
    ctx.lineTo(LX + LW - 14, LADLE_Y + LADLE_H - 2); ctx.lineTo(LX + 14, LADLE_Y + LADLE_H - 2); ctx.closePath(); ctx.fill()
    if (running) {
      const gw = ctx.createRadialGradient(W / 2, LADLE_Y + LADLE_H * 0.2, 5, W / 2, LADLE_Y + LADLE_H * 0.2, LW * 0.55)
      gw.addColorStop(0, 'rgba(255,120,0,0.2)'); gw.addColorStop(1, 'rgba(255,80,0,0)')
      ctx.fillStyle = gw; ctx.fillRect(LX - 10, LADLE_Y, LW + 20, LADLE_H + 8)
    }
    // stand legs
    ctx.fillStyle = '#263238'; ctx.fillRect(LX - 6, LADLE_Y, 7, LADLE_H)
    ctx.fillRect(LX + LW - 1, LADLE_Y, 7, LADLE_H)
    ctx.fillStyle = '#78909C'; ctx.font = `${Math.max(8, W * 0.011)}px monospace`
    ctx.textAlign = 'center'; ctx.fillText('LADLE', W / 2, LADLE_Y + H * 0.007)
    ctx.fillStyle = running ? '#FF8F00' : '#546E7A'; ctx.font = `${Math.max(7, W * 0.009)}px monospace`
    ctx.fillText(`${tundishTemp + 18}°C`, W / 2, LADLE_Y + LADLE_H * 0.55)
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillText(heatNo, W / 2, LADLE_Y + LADLE_H * 0.78)
    // ladle shroud
    ctx.fillStyle = '#37474F'; ctx.fillRect(W / 2 - 4, LADLE_Y + LADLE_H, 8, TUN_Y - LADLE_Y - LADLE_H)
    if (running) {
      const sf = ctx.createLinearGradient(0, LADLE_Y + LADLE_H, 0, TUN_Y)
      sf.addColorStop(0, 'rgba(255,100,0,0.85)'); sf.addColorStop(1, 'rgba(255,70,0,0.4)')
      ctx.fillStyle = sf; ctx.fillRect(W / 2 - 3, LADLE_Y + LADLE_H, 6, TUN_Y - LADLE_Y - LADLE_H)
    }

    // ── TUNDISH ────────────────────────────────────────────────────────────
    const TW = W * 0.92, TX = W * 0.04
    ctx.beginPath(); ctx.moveTo(TX, TUN_Y); ctx.lineTo(TX + TW, TUN_Y)
    ctx.lineTo(TX + TW - 10, TUN_Y + TUN_H); ctx.lineTo(TX + 10, TUN_Y + TUN_H); ctx.closePath()
    ctx.fillStyle = '#263340'; ctx.fill(); ctx.strokeStyle = '#3d5566'; ctx.lineWidth = 1.2; ctx.stroke()
    // tundish steel
    const tg = ctx.createLinearGradient(0, TUN_Y + TUN_H * 0.15, 0, TUN_Y + TUN_H)
    tg.addColorStop(0, running ? 'rgba(255,140,0,0.88)' : 'rgba(60,80,95,0.65)')
    tg.addColorStop(1, running ? 'rgba(200,55,0,0.72)' : 'rgba(45,62,75,0.5)')
    ctx.fillStyle = tg
    ctx.beginPath(); ctx.moveTo(TX + 10, TUN_Y + TUN_H * 0.15); ctx.lineTo(TX + TW - 10, TUN_Y + TUN_H * 0.15)
    ctx.lineTo(TX + TW - 16, TUN_Y + TUN_H - 2); ctx.lineTo(TX + 16, TUN_Y + TUN_H - 2); ctx.closePath(); ctx.fill()
    if (running) {
      const tgw = ctx.createRadialGradient(W / 2, TUN_Y + TUN_H * 0.15, 5, W / 2, TUN_Y + TUN_H * 0.15, TW * 0.45)
      tgw.addColorStop(0, 'rgba(255,140,0,0.15)'); tgw.addColorStop(1, 'rgba(255,140,0,0)')
      ctx.fillStyle = tgw; ctx.fillRect(TX, TUN_Y, TW, TUN_H + 8)
    }
    ctx.fillStyle = '#78909C'; ctx.font = `${Math.max(8, W * 0.01)}px monospace`
    ctx.textAlign = 'center'; ctx.fillText('6-STRAND TUNDISH', W / 2, TUN_Y - H * 0.005)
    ctx.fillStyle = running ? '#FFB300' : '#546E7A'; ctx.font = `${Math.max(7, W * 0.009)}px monospace`
    ctx.fillText(`${tundishTemp}°C`, W / 2, TUN_Y + TUN_H * 0.62)

    // ── PER-STRAND ─────────────────────────────────────────────────────────
    CXS.forEach((cx, i) => {
      const si      = strands[i]
      const active  = si.active && running
      const sp      = si.speed
      const HUES    = ['#FF6D00','#FF8F00','#FFA000','#FFB300','#FFC107','#FFD54F']
      const SC      = HUES[i]

      // SEN
      ctx.fillStyle = '#37474F'; ctx.fillRect(cx - 4, SEN_Y, 8, SEN_H)
      if (active) {
        const sfg = ctx.createLinearGradient(0, SEN_Y, 0, SEN_Y + SEN_H)
        sfg.addColorStop(0, `rgba(255,100,0,0.88)`); sfg.addColorStop(1, `rgba(255,60,0,0.45)`)
        ctx.fillStyle = sfg; ctx.fillRect(cx - 3, SEN_Y, 6, SEN_H)
      }
      ctx.strokeStyle = '#546E7A'; ctx.lineWidth = 0.7; ctx.strokeRect(cx - 4, SEN_Y, 8, SEN_H)

      // MOLD — copper plates
      const MY = MOLD_Y + s.moldOsc[i] * 0.3
      const MoldW = Math.max(5, SW * 0.6)
      const copperColor = active ? '#1d4a5a' : '#162030'
      ctx.fillStyle = copperColor
      ctx.fillRect(cx - SW - MoldW, MY, MoldW, MOLD_H)
      ctx.fillRect(cx + SW, MY, MoldW, MOLD_H)
      // water channel lines on mold
      if (active) {
        for (let j = 1; j < 4; j++) {
          ctx.strokeStyle = `rgba(41,182,246,${0.1 + j * 0.06})`; ctx.lineWidth = 1
          const my2 = MY + MOLD_H * j / 4
          ctx.beginPath(); ctx.moveTo(cx - SW - MoldW, my2); ctx.lineTo(cx - SW, my2); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(cx + SW, my2); ctx.lineTo(cx + SW + MoldW, my2); ctx.stroke()
        }
      }
      // mold frame top
      ctx.fillStyle = '#37474F'; ctx.fillRect(cx - SW - MoldW, MY - 3, SW * 2 + MoldW * 2, 3)
      // liquid steel in mold
      const moldTop = MY + MOLD_H * 0.08
      const moldSteelH = MOLD_H * (si.moldLevel / 100) * 0.85
      if (active || si.moldLevel > 0) {
        const msg = ctx.createLinearGradient(0, moldTop, 0, moldTop + moldSteelH)
        msg.addColorStop(0, active ? 'rgba(255,100,0,0.95)' : 'rgba(80,100,110,0.4)')
        msg.addColorStop(0.6, active ? 'rgba(200,50,0,0.85)' : 'rgba(60,80,90,0.3)')
        msg.addColorStop(1, active ? 'rgba(150,25,0,0.65)' : 'rgba(45,60,70,0.2)')
        ctx.fillStyle = msg; ctx.fillRect(cx - SW, moldTop, SW * 2, moldSteelH)
        if (active) {
          ctx.fillStyle = `rgba(255,200,60,${0.3 + 0.2 * Math.sin(s.frame * 0.2 + i)})`
          ctx.fillRect(cx - SW, moldTop, SW * 2, 2.5)
          const mgw = ctx.createRadialGradient(cx, moldTop, 1, cx, moldTop, SW * 2.5)
          mgw.addColorStop(0, 'rgba(255,120,0,0.18)'); mgw.addColorStop(1, 'rgba(255,80,0,0)')
          ctx.fillStyle = mgw; ctx.fillRect(cx - SW * 2.5, moldTop - 8, SW * 5, 22)
        }
      }
      // mold level dashed
      ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 0.8; ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(cx - SW - MoldW, moldTop); ctx.lineTo(cx + SW + MoldW, moldTop); ctx.stroke()
      ctx.setLineDash([])
      // strand label
      ctx.fillStyle = active ? SC : '#37474F'; ctx.font = `${Math.max(7, W * 0.009)}px monospace`
      ctx.textAlign = 'center'; ctx.fillText(`S${i + 1}`, cx, MY - H * 0.006)
      // mold level %
      ctx.fillStyle = '#00BCD4'; ctx.font = `${Math.max(6, W * 0.008)}px monospace`
      ctx.fillText(`${si.moldLevel.toFixed(0)}%`, cx, MY + MOLD_H + H * 0.012)

      // SOLIDIFYING STRAND
      const shellW = Math.max(4, SW * 0.7)
      const shellGrd = ctx.createLinearGradient(cx - SW - shellW, 0, cx + SW + shellW, 0)
      shellGrd.addColorStop(0, active ? '#37474F' : '#1a2535')
      shellGrd.addColorStop(0.45, active ? '#546E7A' : '#263040')
      shellGrd.addColorStop(0.55, active ? '#607D8B' : '#2c3a4a')
      shellGrd.addColorStop(1, active ? '#37474F' : '#1a2535')
      ctx.fillStyle = shellGrd
      ctx.fillRect(cx - SW - shellW, STR_Y, shellW, STR_H)   // left shell
      ctx.fillRect(cx + SW, STR_Y, shellW, STR_H)             // right shell

      // liquid core
      if (active) {
        const liquidH = Math.min(STR_H * 0.70, sp * sp * 42)
        const liqGrd = ctx.createLinearGradient(0, STR_Y, 0, STR_Y + liquidH)
        liqGrd.addColorStop(0, 'rgba(255,80,0,0.92)')
        liqGrd.addColorStop(0.55, 'rgba(195,40,0,0.72)')
        liqGrd.addColorStop(1, 'rgba(140,15,0,0.18)')
        ctx.fillStyle = liqGrd; ctx.fillRect(cx - SW, STR_Y, SW * 2, liquidH)
      }

      // moving strand texture
      ctx.save()
      ctx.beginPath(); ctx.rect(cx - SW - shellW, STR_Y, (SW + shellW) * 2, STR_H); ctx.clip()
      for (let yy = -50 + s.strandMove[i]; yy < STR_H + 50; yy += 18) {
        ctx.strokeStyle = `rgba(60,100,130,${0.1 + 0.06 * Math.sin(yy * 0.3)})`
        ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(cx - SW - shellW, STR_Y + yy); ctx.lineTo(cx + SW + shellW, STR_Y + yy); ctx.stroke()
      }
      ctx.restore()

      // PINCH ROLLS
      const rollYs = [STR_Y + STR_H * 0.2, STR_Y + STR_H * 0.5, STR_Y + STR_H * 0.78]
      rollYs.forEach(ry => {
        [-1, 1].forEach(side => {
          const rx = side < 0 ? cx - SW - shellW - 6 : cx + SW + shellW + 6
          ctx.save(); ctx.translate(rx, ry)
          ctx.rotate(side < 0 ? s.rollAngle[i] : -s.rollAngle[i])
          ctx.fillStyle = active ? '#37474F' : '#1e2d3d'
          ctx.strokeStyle = active ? '#546E7A' : '#263040'; ctx.lineWidth = 0.8
          const rx2 = Math.max(5, STRAND_W * 0.1), ry2 = Math.max(2.5, STRAND_W * 0.045)
          ctx.beginPath(); ctx.ellipse(0, 0, rx2, ry2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
          if (active) {
            ctx.fillStyle = '#546E7A'
            ctx.beginPath(); ctx.ellipse(0, 0, rx2 * 0.38, ry2 * 0.38, 0, 0, Math.PI * 2); ctx.fill()
          }
          ctx.restore()
        })
      })

      // SECONDARY COOLING ZONES
      if (active) {
        const zs = [STR_Y + STR_H * 0.05, STR_Y + STR_H * 0.36, STR_Y + STR_H * 0.64]
        zs.forEach((zy, zi) => {
          ctx.strokeStyle = 'rgba(2,136,209,0.18)'; ctx.lineWidth = 0.7; ctx.setLineDash([2, 3])
          ctx.strokeRect(cx - SW - shellW - 8, zy, (SW + shellW + 8) * 2, STR_H * 0.27); ctx.setLineDash([])
          ctx.fillStyle = '#29B6F6'
          ctx.beginPath(); ctx.arc(cx - SW - shellW - 5, zy + 8, 2, 0, Math.PI * 2); ctx.fill()
          ctx.beginPath(); ctx.arc(cx + SW + shellW + 5, zy + 8, 2, 0, Math.PI * 2); ctx.fill()
          ctx.beginPath(); ctx.arc(cx - SW - shellW - 5, zy + 22, 2, 0, Math.PI * 2); ctx.fill()
          ctx.beginPath(); ctx.arc(cx + SW + shellW + 5, zy + 22, 2, 0, Math.PI * 2); ctx.fill()
        })
      }

      // spray drops
      s.drops[i].forEach(d => {
        ctx.globalAlpha = d.life * 0.7
        ctx.fillStyle = '#4FC3F7'
        ctx.beginPath(); ctx.arc(d.x, d.y, 1.2, 0, Math.PI * 2); ctx.fill()
      })
      ctx.globalAlpha = 1

      // STRAND BEND (curve to horizontal)
      const BEND_R = H * 0.045
      ctx.save()
      ctx.strokeStyle = active ? '#3d5a6a' : '#1e2d3d'; ctx.lineWidth = SW * 2 + shellW * 2
      ctx.lineCap = 'round'
      ctx.beginPath(); ctx.arc(cx + BEND_R, BEND_Y, BEND_R, -Math.PI, -Math.PI * 0.5, false); ctx.stroke()
      if (active) {
        ctx.strokeStyle = 'rgba(180,50,0,0.38)'; ctx.lineWidth = SW * 1.6
        ctx.beginPath(); ctx.arc(cx + BEND_R, BEND_Y, BEND_R, -Math.PI, -Math.PI * 0.5, false); ctx.stroke()
      }
      ctx.restore()

      // HORIZONTAL RUNOUT TABLE (per strand)
      const ROX  = cx + BEND_R - 2
      const ROW  = Math.min(STRAND_W * 0.9, W - ROX - 4)
      const bilH = Math.max(10, SW * 1.4)
      ctx.fillStyle = active ? '#111d2c' : '#0a1018'
      ctx.fillRect(ROX, ROT_Y, ROW, ROT_H)
      ctx.strokeStyle = active ? '#1e3348' : '#111820'; ctx.lineWidth = 0.8; ctx.strokeRect(ROX, ROT_Y, ROW, ROT_H)
      // runout rollers
      for (let rx = ROX + 10; rx < ROX + ROW - 6; rx += 18) {
        ctx.save(); ctx.translate(rx, ROT_Y + ROT_H * 0.5)
        ctx.rotate(active ? s.rollAngle[i] * 0.7 : 0)
        ctx.fillStyle = active ? '#2c4055' : '#141e2a'; ctx.strokeStyle = '#3d5a73'; ctx.lineWidth = 0.6
        ctx.beginPath(); ctx.ellipse(0, 0, 8, 3, 0, 0, Math.PI * 2); ctx.fill()
        if (active) ctx.stroke()
        ctx.restore()
      }
      // moving billet on runout
      if (active) {
        const bx = ROX + 8 + s.strandMove[i] * 2
        if (bx + bilH < ROX + ROW) {
          const brg = ctx.createLinearGradient(bx, ROT_Y, bx, ROT_Y + ROT_H)
          brg.addColorStop(0, '#E64A19'); brg.addColorStop(0.35, '#BF360C'); brg.addColorStop(1, '#607D8B')
          ctx.fillStyle = brg
          ctx.fillRect(bx, ROT_Y + 3, bilH, ROT_H - 6)
          ctx.strokeStyle = '#455A64'; ctx.lineWidth = 0.4; ctx.strokeRect(bx, ROT_Y + 3, bilH, ROT_H - 6)
          ctx.fillStyle = `rgba(255,80,0,${0.12 + 0.08 * Math.sin(s.frame * 0.12 + i)})`
          ctx.fillRect(bx, ROT_Y + 3, bilH * 0.3, ROT_H - 6)
        }
      }

      // TORCH CUTTING (per strand)
      const TORCH_Y = ROT_Y - H * 0.045
      if (s.torchActive[i]) {
        const tx = s.torchX[i]
        ctx.fillStyle = '#1a2d40'; ctx.strokeStyle = '#2a4a62'; ctx.lineWidth = 0.8
        ctx.fillRect(tx - 10, TORCH_Y, 20, H * 0.04); ctx.strokeRect(tx - 10, TORCH_Y, 20, H * 0.04)
        ctx.fillStyle = '#2c4a65'; ctx.fillRect(tx - 2, TORCH_Y + H * 0.04, 4, H * 0.028)
        // flame
        const fr = 7 + 2.5 * Math.sin(s.frame * 0.45 + i)
        const fg = ctx.createRadialGradient(tx, ROT_Y + 2, 0, tx, ROT_Y + 2, fr)
        fg.addColorStop(0, 'rgba(255,255,255,0.95)'); fg.addColorStop(0.25, 'rgba(255,240,0,0.88)')
        fg.addColorStop(0.6, 'rgba(255,100,0,0.65)'); fg.addColorStop(1, 'rgba(255,0,0,0)')
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(tx, ROT_Y + 2, fr, 0, Math.PI * 2); ctx.fill()
        // cut line
        ctx.strokeStyle = `rgba(255,120,0,${0.55 + 0.4 * Math.sin(s.frame * 0.5 + i)})`
        ctx.lineWidth = 1.5; ctx.setLineDash([])
        ctx.beginPath(); ctx.moveTo(tx, ROT_Y - 2); ctx.lineTo(tx, ROT_Y + ROT_H + 2); ctx.stroke()
        ctx.fillStyle = '#FFD54F'; ctx.font = `${Math.max(6, W * 0.009)}px monospace`
        ctx.textAlign = 'center'; ctx.fillText('CUT', tx, TORCH_Y - H * 0.008)
      } else {
        // parked
        ctx.fillStyle = '#0a1520'; ctx.fillRect(ROX, TORCH_Y, 22, H * 0.035)
        ctx.fillStyle = '#2c4055'; ctx.font = `${Math.max(6, W * 0.008)}px monospace`
        ctx.textAlign = 'center'; ctx.fillText('T', ROX + 11, TORCH_Y + H * 0.024)
      }

      // sparks
      s.sparks[i].forEach(sp => {
        ctx.globalAlpha = sp.life
        ctx.fillStyle = sp.col
        ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = sp.life * 0.28; ctx.fillStyle = '#FF8F00'
        ctx.beginPath(); ctx.arc(sp.x - sp.vx * 0.5, sp.y - sp.vy * 0.5, sp.r * 0.4, 0, Math.PI * 2); ctx.fill()
      })
      ctx.globalAlpha = 1

      // cut billets moving away
      s.cutBillets[i].forEach(c => {
        const cg = ctx.createLinearGradient(c.x, 0, c.x + bilH, 0)
        cg.addColorStop(0, '#546E7A'); cg.addColorStop(0.5, '#607D8B'); cg.addColorStop(1, '#455A64')
        ctx.fillStyle = cg; ctx.fillRect(c.x, ROT_Y + 3, bilH, ROT_H - 6)
        ctx.strokeStyle = '#37474F'; ctx.lineWidth = 0.4; ctx.strokeRect(c.x, ROT_Y + 3, bilH, ROT_H - 6)
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.font = `${Math.max(6, W * 0.008)}px monospace`
        ctx.textAlign = 'center'; ctx.fillText(`#${s.billetsCut[i]}`, c.x + bilH / 2, ROT_Y + ROT_H * 0.62)
      })

      // strand speed label at bottom
      ctx.fillStyle = active ? '#57ab5a' : '#37474F'; ctx.font = `${Math.max(7, W * 0.009)}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText(active ? `${si.speed.toFixed(2)}m/m` : 'OFF', cx, H - H * 0.01)
    })

    // ── ZONE DIVIDERS ──────────────────────────────────────────────────────
    ;['Z1', 'Z2', 'Z3'].forEach((label, zi) => {
      const zy = STR_Y + STR_H * [0.05, 0.36, 0.64][zi]
      ctx.strokeStyle = 'rgba(2,136,209,0.12)'; ctx.lineWidth = 0.5; ctx.setLineDash([5, 5])
      ctx.beginPath(); ctx.moveTo(0, zy); ctx.lineTo(W, zy); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#0d3045'; ctx.font = `${Math.max(7, W * 0.009)}px monospace`
      ctx.textAlign = 'left'; ctx.fillText(label, 2, zy - 3)
    })

    // ── STATUS STRIP TOP RIGHT ─────────────────────────────────────────────
    const activeCount  = strands.filter(s2 => s2.active && running).length
    const totalThrough = strands.filter(s2 => s2.active && running)
      .reduce((a, s2) => a + billetSize * billetSize * s2.speed * 7.8 / 1e6, 0)
    const totalCut     = st.current.billetsCut.reduce((a, v) => a + v, 0)

    ctx.fillStyle = 'rgba(4,8,16,0.75)'
    ctx.fillRect(0, 0, W, H * 0.025)
    ;[
      { l: 'STRANDS', v: `${activeCount}/${N}`, c: activeCount > 0 ? '#57ab5a' : '#546E7A' },
      { l: 'OUTPUT', v: `${totalThrough.toFixed(1)}t/h`, c: '#FF8F00' },
      { l: 'BILLETS CUT', v: `${totalCut}`, c: '#9b5de5' },
      { l: 'SUPERHEAT', v: `${tundishTemp - 1537}°C`, c: tundishTemp - 1537 > 38 ? '#e5534b' : '#57ab5a' },
      { l: 'STATUS', v: running ? 'CASTING' : 'STANDBY', c: running ? '#57ab5a' : '#546E7A' },
    ].forEach(({ l, v, c }, ki) => {
      const px = W * 0.02 + ki * W * 0.19
      ctx.fillStyle = '#4d7a9a'; ctx.font = `${Math.max(6, W * 0.008)}px monospace`
      ctx.textAlign = 'left'; ctx.fillText(l, px, H * 0.011)
      ctx.fillStyle = c; ctx.font = `bold ${Math.max(7, W * 0.01)}px monospace`
      ctx.fillText(v, px, H * 0.021)
    })

    // ── FOOTER ─────────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(4,8,16,0.82)'; ctx.fillRect(0, H - 16, W, 16)
    ctx.fillStyle = '#2c4055'; ctx.font = `${Math.max(7, W * 0.009)}px monospace`
    ctx.textAlign = 'left'; ctx.fillText(`6-STRAND BILLET CASTER | ${heatNo} | ${billetSize}×${billetSize}mm`, 6, H - 4)
    ctx.textAlign = 'right'; ctx.fillText(new Date().toLocaleTimeString(), W - 6, H - 4)

    rafRef.current = requestAnimationFrame(draw)
  }, [running, strands, tundishTemp, billetSize, heatNo])

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
  success: '#57ab5a', danger: '#e5534b', cyan: '#39c5cf',
}
const HUES = ['#FF6D00','#FF8F00','#FFA000','#FFB300','#FFC107','#FFD54F']

export default function BilletCastingModel() {
  const [running, setRunning]         = useState(false)
  const [tundishTemp, setTundishTemp] = useState(1555)
  const [billetSize, setBilletSize]   = useState(130)
  const [panelOpen, setPanelOpen]     = useState(true)
  const [elapsed, setElapsed]         = useState(0)
  const [heatNo]                      = useState(`BC-${Math.floor(Math.random() * 9000 + 1000)}`)
  const [strands, setStrands]         = useState(
    Array.from({ length: N }, (_, i) => ({
      active: true, speed: 1.8 + i * 0.015, moldLevel: 85 + (i % 3 - 1) * 3, surfTemp: 950,
    }))
  )
  const timerRef = useRef(null)

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => {
        setElapsed(t => t + 1)
        setStrands(prev => prev.map(s => !s.active ? s : ({
          ...s,
          moldLevel: Math.max(55, Math.min(100, s.moldLevel + (Math.random() - 0.48) * 1.3 + (85 - s.moldLevel) * 0.05)),
          surfTemp: 900 + s.speed * 48 + (tundishTemp - 1540) * 1.5 + (Math.random() - 0.5) * 14,
        })))
      }, 1000)
    } else clearInterval(timerRef.current)
    return () => clearInterval(timerRef.current)
  }, [running, tundishTemp])

  const toggleStrand  = i => setStrands(prev => prev.map((s, j) => j === i ? { ...s, active: !s.active } : s))
  const setSpeed      = (i, v) => setStrands(prev => prev.map((s, j) => j === i ? { ...s, speed: v } : s))
  const fmt = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`

  const activeCount  = strands.filter(s => s.active && running).length
  const totalThrough = strands.filter(s => s.active && running)
    .reduce((a, s) => a + billetSize * billetSize * s.speed * 7.8 / 1e6, 0)

  return (
    <div style={{ height: '100dvh', background: C.bg, color: C.text, fontFamily: 'monospace', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: '#060a10', borderBottom: `1px solid ${C.border}`, padding: '0 12px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚙</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1.2 }}>6-STRAND BILLET CASTER</div>
            <div style={{ fontSize: 8, color: C.muted, letterSpacing: '0.1em' }}>REAL-TIME PLANT SIMULATION</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 7, color: C.muted }}>STRANDS</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.success }}>{activeCount}/{N}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 7, color: C.muted }}>t/h</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>{totalThrough.toFixed(1)}</div>
          </div>
          <span style={{ fontSize: 10, color: running ? C.success : C.muted }}>{fmt(elapsed)}</span>
          <button onClick={() => setPanelOpen(v => !v)}
            style={{ padding: '4px 8px', borderRadius: 3, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11, cursor: 'pointer' }}>
            {panelOpen ? '◀' : '▶'}
          </button>
          <button onClick={() => { setRunning(v => !v); if (!running) setElapsed(0) }}
            style={{ padding: '6px 12px', borderRadius: 4, border: `1px solid ${running ? C.danger : C.success}`, background: running ? 'rgba(229,83,73,0.15)' : 'rgba(87,171,90,0.15)', color: running ? C.danger : C.success, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            {running ? '⏹ STOP' : '▶ START'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Side panel */}
        {panelOpen && (
          <div style={{ width: 190, background: C.panel, borderRight: `1px solid ${C.border}`, overflow: 'auto', flexShrink: 0 }}>
            <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em', marginBottom: 10 }}>GLOBAL</div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: C.muted }}>TUNDISH TEMP</span>
                  <span style={{ fontSize: 10, color: C.accent }}>{tundishTemp}°C</span>
                </div>
                <input type="range" min={1530} max={1575} step={1} value={tundishTemp} onChange={e => setTundishTemp(+e.target.value)} disabled={running}
                  style={{ width: '100%', accentColor: C.accent, opacity: running ? 0.4 : 1 }} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>BILLET SIZE</div>
                <select value={billetSize} onChange={e => setBilletSize(+e.target.value)} disabled={running}
                  style={{ width: '100%', padding: '4px 6px', borderRadius: 3, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 11 }}>
                  {[100, 120, 130, 150, 160].map(s => <option key={s} value={s}>{s}×{s}mm</option>)}
                </select>
              </div>
              <div style={{ padding: '6px 8px', background: '#0a1018', borderRadius: 4, border: `1px solid ${tundishTemp - 1537 > 35 ? C.danger : C.border}` }}>
                <div style={{ fontSize: 8, color: C.muted }}>SUPERHEAT</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: tundishTemp - 1537 > 35 ? C.danger : tundishTemp - 1537 < 15 ? '#c69026' : C.success }}>
                  {tundishTemp - 1537}°C
                </div>
              </div>
            </div>

            {/* Per-strand controls */}
            <div style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em', marginBottom: 8 }}>STRAND CONTROL</div>
              {strands.map((s, i) => {
                const active = s.active && running
                return (
                  <div key={i} style={{ background: active ? `${HUES[i]}10` : '#0a1018', border: `1px solid ${active ? HUES[i] + '50' : C.border}`, borderRadius: 5, padding: '8px', marginBottom: 6, transition: 'all 0.3s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: active ? HUES[i] : C.muted, boxShadow: active ? `0 0 5px ${HUES[i]}` : 'none' }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: active ? HUES[i] : C.muted }}>S{i + 1}</span>
                      </div>
                      <button onClick={() => toggleStrand(i)}
                        style={{ padding: '2px 6px', borderRadius: 3, border: `1px solid ${active ? HUES[i] : C.border}`, background: 'transparent', color: active ? HUES[i] : C.muted, fontSize: 9, cursor: 'pointer' }}>
                        {s.active ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
                      {[
                        { l: 'Speed', v: `${s.speed.toFixed(2)}` },
                        { l: 'Mold', v: `${s.moldLevel.toFixed(0)}%` },
                      ].map(item => (
                        <div key={item.l} style={{ background: C.bg, borderRadius: 3, padding: '3px 5px' }}>
                          <div style={{ fontSize: 7, color: C.muted }}>{item.l}</div>
                          <div style={{ fontSize: 10, color: active ? C.text : C.muted }}>{item.v}</div>
                        </div>
                      ))}
                    </div>
                    <input type="range" min={0.5} max={3.5} step={0.05} value={s.speed}
                      onChange={e => setSpeed(i, +e.target.value)}
                      disabled={!running || !s.active}
                      style={{ width: '100%', accentColor: HUES[i], opacity: (!running || !s.active) ? 0.35 : 1 }} />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Canvas */}
        <div style={{ flex: 1, overflow: 'hidden', background: '#07090f' }}>
          <BilletCanvas running={running} strands={strands} tundishTemp={tundishTemp} billetSize={billetSize} heatNo={heatNo} />
        </div>
      </div>
    </div>
  )
}
