import { useState, useEffect, useRef, useCallback } from 'react'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function heatColor(temp, min = 100, max = 1400) {
  const t = clamp((temp - min) / (max - min), 0, 1)
  if (t > 0.88) return `rgba(255,255,${Math.round((1-t)*8*255)},0.97)`
  if (t > 0.72) return `rgba(255,${Math.round(80+(t-0.72)*5*155)},0,0.95)`
  if (t > 0.52) return `rgba(${Math.round(200+(t-0.52)*5*55)},${Math.round(50+(t-0.52)*5*30)},0,0.92)`
  if (t > 0.30) return `rgba(${Math.round(120+(t-0.30)*5*80)},${Math.round(20+(t-0.30)*5*30)},0,0.88)`
  if (t > 0.10) return `rgba(${Math.round(40+(t-0.10)*5*80)},${Math.round(40+(t-0.10)*5*20)},${Math.round(60+(t-0.10)*5*20)},0.82)`
  return `rgba(30,45,80,0.75)`
}

// ─── CANVAS ───────────────────────────────────────────────────────────────────
function CokePlantCanvas({
  running, pushingSpeed, coalMoisture, cokeOvenTemp, quenchType,
  setCOGTemp, setCokeYield, setCokeTonnage,
  onCokePush, doReset
}) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const mouseRef  = useRef({ x: -999, y: -999 })
  const S = useRef({
    t: 0, frame: 0,
    // Coal charging
    coalBins: [{ x: 0, level: 0.85, temp: 28 }, { x: 0, level: 0.72, temp: 31 }, { x: 0, level: 0.90, temp: 26 }],
    // Oven cells - 8 ovens
    ovens: Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      phase: i < 2 ? 'coking' : i < 5 ? 'coking' : i < 7 ? 'ready' : 'charging',
      progress: i < 2 ? 0.85 + i*0.06 : i < 5 ? 0.3 + i*0.12 : i < 7 ? 1.0 : 0.05,
      temp: 1100 + i * 40 + Math.random()*80,
      gasFlow: 0,
      wallGlow: 0,
      draftFan: 0,
    })),
    // Pushing machine
    pusherX: 0, pusherDir: 1, pusherActive: false, pusherTarget: 0,
    // Coke guide + quench car
    quenchCarX: 0, quenchActive: false, quenchTimer: 0,
    // Coke on wharf
    cokeWharfPiles: [],
    // Gas collection
    gasMain: { temp: 750, pressure: 1.02 },
    cogParticles: [],   // coke oven gas rising
    // Riser pipes (ascension pipes) particles
    riserParticles: [],
    // Quench water/steam particles
    quenchDrops: [], steamPuffs: [],
    // Flue gas
    flueGas: [],
    // Combustion in flue
    flueFlames: [],
    // Underfiring
    underFireTemp: 1320,
    // Counters
    cokesPushed: 0,
    // Charging larry car
    larryCarX: 0, larryCarDir: 1, larryCharging: false, larryTimer: 0,
    // Coke yield
    cokeYieldPct: 72,
    cogTemp: 750,
    // Coke on conveyor
    cokeConveyor: [],
    conveyorOffset: 0,
  })

  useEffect(() => {
    const el = canvasRef.current; if (!el) return
    const fit = () => {
      const w = el.parentElement ? el.parentElement.clientWidth : window.innerWidth
      const h = el.parentElement ? el.parentElement.clientHeight : window.innerHeight
      if (w > 0 && h > 0) { el.width = w; el.height = h }
    }
    fit()
    // Retry a few times in case parent is not sized yet (GitHub Pages / Capacitor)
    const t1 = setTimeout(fit, 100)
    const t2 = setTimeout(fit, 400)
    window.addEventListener('resize', fit)
    const onMove = (e) => {
      const rect = el.getBoundingClientRect()
      mouseRef.current = {
        x: (e.clientX - rect.left) * (el.width / rect.width),
        y: (e.clientY - rect.top)  * (el.height / rect.height)
      }
    }
    const onLeave = () => { mouseRef.current = { x: -999, y: -999 } }
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    el.addEventListener('touchmove', (e) => {
      e.preventDefault()
      const t2 = e.touches[0], rect = el.getBoundingClientRect()
      mouseRef.current = { x: (t2.clientX-rect.left)*(el.width/rect.width), y: (t2.clientY-rect.top)*(el.height/rect.height) }
    }, { passive: false })
    el.addEventListener('touchend', onLeave)
    return () => {
      clearTimeout(t1); clearTimeout(t2)
      window.removeEventListener('resize', fit)
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  useEffect(() => {
    if (!doReset) return
    const sim = S.current
    sim.t=0; sim.frame=0
    sim.ovens = Array.from({length:8},(_,i)=>({id:i+1,phase:i<5?'coking':'ready',progress:i<5?0.3+i*0.13:1.0,temp:1100+i*40,gasFlow:0,wallGlow:0,draftFan:0}))
    sim.pusherX=0; sim.pusherActive=false
    sim.quenchCarX=0; sim.quenchActive=false; sim.quenchTimer=0
    sim.cokeWharfPiles=[]; sim.cogParticles=[]; sim.riserParticles=[]
    sim.quenchDrops=[]; sim.steamPuffs=[]; sim.flueGas=[]; sim.flueFlames=[]
    sim.cokesPushed=0; sim.larryCarX=0; sim.larryCharging=false
    sim.cokeConveyor=[]; sim.conveyorOffset=0
  }, [doReset])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return }
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    if (!W || !H || W < 10 || H < 10) {
      // Canvas not sized yet — trigger resize and retry
      if (canvasRef.current && canvasRef.current.parentElement) {
        const p = canvasRef.current.parentElement
        if (p.clientWidth > 0) { canvasRef.current.width = p.clientWidth; canvasRef.current.height = p.clientHeight }
      }
      rafRef.current = requestAnimationFrame(draw); return
    }
    const sim = S.current
    sim.t += 0.016; sim.frame++
    const dt = 0.016
    try {

    // ── LAYOUT ────────────────────────────────────────────────────────────
    const OVEN_COUNT  = 8
    const OVEN_W      = clamp(W * 0.072, 52, 82)
    const OVEN_H      = H * 0.32
    const OVEN_Y0     = H * 0.20
    const OVEN_Y1     = OVEN_Y0 + OVEN_H
    const OVEN_X0     = W * 0.12
    const BATTERY_W   = OVEN_W * OVEN_COUNT
    const BATTERY_MID = OVEN_X0 + BATTERY_W / 2
    const COKE_SIDE_X = OVEN_X0 + BATTERY_W  // right = coke side (pusher pushes right→)
    const COAL_SIDE_X = OVEN_X0              // left  = coal side

    const COAL_Y      = H * 0.04
    const FLUE_Y0     = OVEN_Y1
    const FLUE_H      = H * 0.08
    const GAS_MAIN_Y  = OVEN_Y0 - H * 0.055
    // Pusher travels on COAL side (left), coke exits COKE side (right)
    const PUSHER_RAIL_Y = OVEN_Y0 + OVEN_H * 0.5  // pusher ram at mid-oven height
    // Quench car runs on COKE side track (right of battery)
    const QUENCH_RAIL_Y = OVEN_Y1 + FLUE_H + H * 0.01
    const QUENCH_CAR_BASE_X = COKE_SIDE_X + W * 0.01
    // Coke drops DOWN from oven exit to quench car below
    const COKE_DROP_X = COKE_SIDE_X + W * 0.025
    // Wharf is BELOW the quench car track (coke dumped down from car)
    const WHARF_Y     = QUENCH_RAIL_Y + H * 0.09
    const WHARF_H     = H * 0.10
    const WHARF_X0    = COKE_SIDE_X - W * 0.02
    const WHARF_X1    = W * 0.98
    const CONVEYOR_Y  = WHARF_Y + WHARF_H + H * 0.015
    // Keep QUENCH_Y for compat
    const QUENCH_Y    = QUENCH_RAIL_Y

    const ovenX = (i) => OVEN_X0 + i * OVEN_W

    // ── PHYSICS ─────────────────────────────────────────────────────────────
    if (running) {
      const intensity = clamp(cokeOvenTemp / 1250, 0.7, 1.2)

      // Update each oven
      sim.ovens = sim.ovens.map((ov, i) => {
        let { phase, progress, temp, gasFlow, wallGlow } = ov
        // Heat each oven toward target
        const tgtTemp = cokeOvenTemp + i * 12
        temp = clamp(temp + (tgtTemp - temp) * 0.008, 900, 1450)

        if (phase === 'coking') {
          progress = Math.min(1.0, progress + (pushingSpeed / 100) * 0.0008 * intensity)
          gasFlow  = clamp((1 - progress) * 0.9 + 0.1, 0.1, 1.0) // gas reduces as coke matures
          wallGlow = clamp(temp / 1400, 0.5, 1.0)
          if (progress >= 1.0) phase = 'ready'
        } else if (phase === 'ready') {
          gasFlow  = 0.08
          wallGlow = clamp(temp / 1400, 0.4, 0.9)
          // Auto-push oldest ready oven
          if (!sim.pusherActive && sim.frame % 380 === i * 47) {
            sim.pusherActive = true
            sim.pusherTarget = i
            // Pusher travels on coal side (left) — aligns with oven
            sim.pusherX = COAL_SIDE_X - OVEN_W * 1.2
          }
        } else if (phase === 'pushing') {
          gasFlow  = 0.0
          wallGlow = 0.3
        } else if (phase === 'charging') {
          progress = Math.min(0.08, progress + 0.002)
          gasFlow  = 0.65
          wallGlow = 0.2
          if (progress >= 0.08) phase = 'coking'
        }
        return { ...ov, phase, progress, temp, gasFlow, wallGlow }
      })

      // Pusher machine
      if (sim.pusherActive) {
        const ti    = sim.pusherTarget
        const targX = ovenX(ti) - OVEN_W * 0.1  // align with oven left (coal side)
        if (Math.abs(sim.pusherX - targX) > 3) {
          sim.pusherX += (targX - sim.pusherX) * 0.04
        } else {
          // Push action — frame counter (NO setTimeout - breaks GitHub Pages build)
          if (sim.ovens[ti].phase === 'ready') {
            sim.ovens[ti] = { ...sim.ovens[ti], phase: 'pushing', pushFrames: 0 }
          } else if (sim.ovens[ti].phase === 'pushing') {
            const pf = (sim.ovens[ti].pushFrames || 0) + 1
            if (pf > 75) {
              sim.ovens[ti] = { ...sim.ovens[ti], phase: 'charging', progress: 0, pushFrames: 0 }
              sim.pusherActive = false
              sim.cokesPushed++
              onCokePush()
              sim.cokeWharfPiles.push({
                x: QUENCH_CAR_BASE_X + OVEN_W * 1.5 + Math.random() * OVEN_W * 3,
                y: WHARF_Y + 10 + Math.random() * 12,
                w: 38 + Math.random() * 28,
                h: 20 + Math.random() * 16,
                temp: 980 + Math.random() * 100,
                cooling: true,
              })
              sim.cokeConveyor.push({ x: WHARF_X0 + 10, temp: 420, w: 28 })
            } else {
              sim.ovens[ti] = { ...sim.ovens[ti], pushFrames: pf }
            }
          }
        }
      }

      // Larry car (coal charging)
      sim.larryCarX += sim.larryCarDir * 0.6
      if (sim.larryCarX > BATTERY_W) sim.larryCarDir = -1
      if (sim.larryCarX < 0)         sim.larryCarDir =  1

      // Quench car
      if (sim.quenchActive) {
        sim.quenchTimer -= 1
        if (sim.frame % 2 === 0) {
          sim.quenchDrops.push({ x: sim.quenchCarX + (Math.random()-0.5)*40, y: QUENCH_Y, vx:(Math.random()-0.5)*2.5, vy:-2.5-Math.random()*3, life:1, r:2+Math.random()*2.5 })
          sim.steamPuffs.push({ x: sim.quenchCarX+(Math.random()-0.5)*30, y:QUENCH_Y-10, vx:(Math.random()-0.5)*1.5, vy:-1.8-Math.random()*2, life:1, r:5+Math.random()*8 })
        }
        if (sim.quenchTimer <= 0) sim.quenchActive = false
      } else if (sim.cokesPushed > 0 && sim.frame % 420 === 0) {
        sim.quenchActive = true; sim.quenchTimer = 180
        // Quench car waits at coke side, moves under oven exit
        sim.quenchCarX = QUENCH_CAR_BASE_X + Math.random() * OVEN_W * 2
      }

      // COG particles from ascension pipes
      sim.ovens.forEach((ov, i) => {
        if (ov.gasFlow > 0.15 && sim.frame % 3 === i % 3) {
          sim.cogParticles.push({
            x: ovenX(i) + OVEN_W * 0.5,
            y: OVEN_Y0 - 4,
            vx: (Math.random()-0.5)*0.9,
            vy: -(0.8 + Math.random()*1.8) * ov.gasFlow,
            life: 1, r: 2 + Math.random()*3,
            col: `rgba(${160+Math.round(Math.random()*40)},${145+Math.round(Math.random()*35)},60,0.52)`
          })
        }
        // Riser pipe particles
        if (ov.gasFlow > 0.2 && sim.frame % 4 === i % 4) {
          sim.riserParticles.push({
            x: ovenX(i) + OVEN_W * 0.5 + (Math.random()-0.5)*6,
            y: OVEN_Y0 + 5,
            vx: (Math.random()-0.5)*0.5,
            vy: -(1.2+Math.random()*2) * ov.gasFlow,
            life: 1, r: 1.5+Math.random()*2,
            col: ov.temp > 1100 ? 'rgba(255,180,50,0.62)' : 'rgba(180,160,70,0.50)'
          })
        }
      })

      // Flue gas particles
      if (sim.frame % 5 === 0) {
        sim.flueGas.push({
          x: OVEN_X0 + Math.random()*BATTERY_W,
          y: FLUE_Y0 + FLUE_H * 0.5,
          vx: (Math.random()-0.5)*0.6,
          vy: 0.8 + Math.random()*1.2,
          life: 1, r: 2+Math.random()*3,
          col: 'rgba(120,100,70,0.35)'
        })
        sim.flueFlames.push({
          x: OVEN_X0 + Math.random()*BATTERY_W,
          y: FLUE_Y0 + FLUE_H * 0.8,
          life: 1, r: 3+Math.random()*5
        })
      }

      // Conveyor movement
      sim.conveyorOffset = (sim.conveyorOffset + 0.8) % 30
      sim.cokeConveyor = sim.cokeConveyor.map(c => ({ ...c, x: c.x + 0.5, temp: Math.max(200, c.temp - 0.3) })).filter(c => c.x < W * 0.99)

      // Cool wharf piles
      sim.cokeWharfPiles = sim.cokeWharfPiles.map(p => ({ ...p, temp: Math.max(80, p.temp - 0.10 * intensity) })).filter(p => p.x < W + 150)

      // Update COG temp and yield
      const avgOvenTemp = sim.ovens.reduce((a, o) => a + o.temp, 0) / OVEN_COUNT
      sim.cogTemp = clamp(avgOvenTemp * 0.55 + 150, 550, 850)
      setCOGTemp(Math.round(sim.cogTemp))
      sim.cokeYieldPct = clamp(72 - coalMoisture * 0.8 + (cokeOvenTemp - 1100) * 0.01, 65, 78)
      setCokeYield(sim.cokeYieldPct.toFixed(1))
      setCokeTonnage(Math.round(sim.cokesPushed * sim.cokeYieldPct * 0.22))

      // Gas main pressure pulse
      sim.gasMain.temp = clamp(sim.cogTemp + (Math.random()-0.5)*15, 600, 900)
    }

    // Update particles
    sim.cogParticles   = sim.cogParticles.filter(p=>p.life>0&&p.y>GAS_MAIN_Y-20).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.012}))
    sim.riserParticles = sim.riserParticles.filter(p=>p.life>0&&p.y>GAS_MAIN_Y).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.022}))
    sim.quenchDrops    = sim.quenchDrops.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,vy:p.vy+0.18,life:p.life-0.038}))
    sim.steamPuffs     = sim.steamPuffs.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,r:p.r+0.5,life:p.life-0.020}))
    sim.flueGas        = sim.flueGas.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.018}))
    sim.flueFlames     = sim.flueFlames.filter(p=>p.life>0).map(p=>({...p,life:p.life-0.045}))

    // ── DRAW ──────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#06090f'; ctx.fillRect(0,0,W,H)
    ctx.strokeStyle='rgba(255,255,255,0.015)'; ctx.lineWidth=0.5
    for(let gx=0;gx<W;gx+=36){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke()}
    for(let gy=0;gy<H;gy+=36){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke()}

    const lbl=(t,x,y,c='#78909C',sz=9,align='center')=>{ctx.fillStyle=c;ctx.font=`${sz}px monospace`;ctx.textAlign=align;ctx.fillText(t,x,y)}
    const lblB=(t,x,y,c='#78909C',sz=9,align='center')=>{ctx.fillStyle=c;ctx.font=`bold ${sz}px monospace`;ctx.textAlign=align;ctx.fillText(t,x,y)}

    // ── COAL BINS (top left) ───────────────────────────────────────────────
    const BIN_W=W*0.065, BIN_H=H*0.11, BIN_X0=W*0.01
    ;[0,1,2].forEach(i => {
      const bx=BIN_X0+i*(BIN_W+6), by=COAL_Y
      // Bin structure
      ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.2
      ctx.fillRect(bx,by,BIN_W,BIN_H); ctx.strokeRect(bx,by,BIN_W,BIN_H)
      // Coal fill
      const fillH = BIN_H*sim.coalBins[i].level
      const cg=ctx.createLinearGradient(0,by+BIN_H-fillH,0,by+BIN_H)
      cg.addColorStop(0,'rgba(35,32,28,0.92)'); cg.addColorStop(1,'rgba(22,20,18,0.98)')
      ctx.fillStyle=cg; ctx.fillRect(bx+2,by+BIN_H-fillH,BIN_W-4,fillH)
      // Surface texture
      for(let tx2=bx+4;tx2<bx+BIN_W-4;tx2+=8){
        ctx.fillStyle='rgba(55,50,45,0.6)'; ctx.beginPath(); ctx.arc(tx2,by+BIN_H-fillH+4,2.5,0,Math.PI*2); ctx.fill()
      }
      // Coal outlet pipe
      ctx.fillStyle='#263238'; ctx.fillRect(bx+BIN_W*0.35,by+BIN_H,BIN_W*0.3,H*0.025)
      lbl(`BIN ${i+1}`,bx+BIN_W/2,by-4,'#546E7A',clamp(W*0.009,7,9))
      lbl(`${(sim.coalBins[i].level*100).toFixed(0)}%`,bx+BIN_W/2,by+BIN_H*0.55,running?'#90A4AE':'#455A64',clamp(W*0.009,7,8))
    })
    lbl('COAL BINS',BIN_X0+(BIN_W*3+12)/2,COAL_Y-14,'#37474F',clamp(W*0.010,8,10))

    // Coal pipe to larry car
    ctx.strokeStyle='#1a2535'; ctx.lineWidth=5
    ctx.beginPath()
    ctx.moveTo(BIN_X0+BIN_W*1.5+6,COAL_Y+BIN_H+H*0.025)
    ctx.bezierCurveTo(BIN_X0+BIN_W*1.5+6,COAL_Y+BIN_H+H*0.06,OVEN_X0-10,COAL_Y+BIN_H+H*0.06,OVEN_X0-10,OVEN_Y0-H*0.07)
    ctx.stroke()

    // ── GAS MAIN (collecting main) ─────────────────────────────────────────
    const GM_Y=GAS_MAIN_Y+5
    const gasMainCol = running ? `rgba(${180+Math.round(30*Math.sin(sim.t*2))},160,55,0.75)` : '#1a2535'
    ctx.strokeStyle=gasMainCol; ctx.lineWidth=14
    ctx.beginPath(); ctx.moveTo(OVEN_X0,GM_Y); ctx.lineTo(OVEN_X0+BATTERY_W,GM_Y); ctx.stroke()
    ctx.strokeStyle='#0d1a28'; ctx.lineWidth=2; ctx.stroke()
    // COG label
    lblB('COLLECTING GAS MAIN',BATTERY_MID,GM_Y-10,'#9B8040',clamp(W*0.010,8,11))
    lbl(`COG Temp: ${Math.round(sim.gasMain.temp)}°C`,BATTERY_MID,GM_Y+18,running?'#FFB300':'#37474F',clamp(W*0.009,7,9))

    // Gas main → byproduct plant pipe
    ctx.strokeStyle=gasMainCol; ctx.lineWidth=8
    ctx.beginPath()
    ctx.moveTo(OVEN_X0+BATTERY_W,GM_Y)
    ctx.bezierCurveTo(OVEN_X0+BATTERY_W+40,GM_Y,W*0.92,GM_Y,W*0.95,H*0.15)
    ctx.stroke()
    lbl('→ BYPRODUCT PLANT',W*0.94,H*0.12,'#9B8040',clamp(W*0.009,7,9),'right')

    // ── ASCENSION PIPES / RISER PIPES ─────────────────────────────────────
    sim.ovens.forEach((ov,i)=>{
      const rx=ovenX(i)+OVEN_W*0.5
      const active=ov.gasFlow>0.1
      // Riser pipe
      ctx.fillStyle=active?'#1a3040':'#111820'; ctx.strokeStyle=active?'#29B6F6':'#1a2535'; ctx.lineWidth=0.8
      ctx.fillRect(rx-4,GAS_MAIN_Y,8,OVEN_Y0-GAS_MAIN_Y); ctx.strokeRect(rx-4,GAS_MAIN_Y,8,OVEN_Y0-GAS_MAIN_Y)
      if(active&&running){
        const rg=ctx.createLinearGradient(rx-4,GAS_MAIN_Y,rx+4,GAS_MAIN_Y)
        rg.addColorStop(0,'rgba(255,180,50,0.62)'); rg.addColorStop(0.5,'rgba(255,200,60,0.8)'); rg.addColorStop(1,'rgba(255,180,50,0.62)')
        ctx.fillStyle=rg; ctx.fillRect(rx-3,GAS_MAIN_Y+2,6,OVEN_Y0-GAS_MAIN_Y-4)
      }
    })

    // Riser particles
    sim.riserParticles.forEach(p=>{
      ctx.globalAlpha=p.life*0.65; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // COG particles
    sim.cogParticles.forEach(p=>{
      ctx.globalAlpha=p.life*0.52; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
      ctx.globalAlpha=p.life*0.18; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x-p.vx,p.y-p.vy,p.r*0.5,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // ── OVEN BATTERY ───────────────────────────────────────────────────────
    // Foundation
    ctx.fillStyle='#111820'; ctx.fillRect(OVEN_X0-4,OVEN_Y1,BATTERY_W+8,H*0.025)
    ctx.strokeStyle='#1e2d3d'; ctx.lineWidth=1; ctx.strokeRect(OVEN_X0-4,OVEN_Y1,BATTERY_W+8,H*0.025)

    sim.ovens.forEach((ov,i)=>{
      const ox=ovenX(i), ow=OVEN_W-2, oh=OVEN_H

      // Phase colors
      const phaseCol = {
        coking:   `rgba(${Math.round(60+ov.progress*60)},${Math.round(20+ov.progress*10)},0,${0.7+ov.wallGlow*0.25})`,
        ready:    'rgba(80,25,0,0.88)',
        pushing:  'rgba(20,20,20,0.7)',
        charging: 'rgba(15,22,32,0.8)',
      }

      // Oven walls (refractory brick)
      ctx.fillStyle='#1e2535'; ctx.fillRect(ox,OVEN_Y0,ow,oh)
      // Left wall
      ctx.fillStyle=`rgba(${Math.round(30+ov.wallGlow*50)},${Math.round(15+ov.wallGlow*20)},0,0.85)`
      ctx.fillRect(ox,OVEN_Y0,ow*0.08,oh)
      // Right wall
      ctx.fillRect(ox+ow*0.92,OVEN_Y0,ow*0.08,oh)
      // Top arch
      ctx.fillStyle=`rgba(${Math.round(25+ov.wallGlow*40)},${Math.round(12+ov.wallGlow*18)},0,0.80)`
      ctx.fillRect(ox,OVEN_Y0,ow,oh*0.06)
      // Bottom hearth
      ctx.fillStyle='#0d1520'; ctx.fillRect(ox,OVEN_Y0+oh*0.92,ow,oh*0.08)

      // Coal / coke charge inside oven
      if (ov.phase !== 'pushing') {
        const chargeH = oh * 0.84
        const chargeY = OVEN_Y0 + oh * 0.07
        const chargeW = ow * 0.84
        const chargeX = ox + ow * 0.08

        // Heat map based on progress and temp
        for (let px=0; px<chargeW; px++) {
          // Temperature gradient: hotter walls, cooler centre early, uniform at end
          const wallDist = Math.min(px, chargeW-px) / chargeW
          const coreTemp = ov.temp * (ov.progress*0.7 + 0.3)
          const wallTemp = ov.temp
          const localTemp = coreTemp + (wallTemp-coreTemp)*(1-wallDist*2)*(1-ov.progress*0.8)
          ctx.fillStyle = heatColor(localTemp, 100, 1400)
          ctx.fillRect(chargeX+px, chargeY, 1, chargeH)
        }

        // Coke structure lines (vertical cracking as coke forms)
        if (ov.progress > 0.3) {
          ctx.strokeStyle=`rgba(20,15,10,${ov.progress*0.6})`; ctx.lineWidth=0.7
          for(let cx2=chargeX+chargeW*0.2;cx2<chargeX+chargeW*0.8;cx2+=chargeW*0.12){
            ctx.beginPath(); ctx.moveTo(cx2,chargeY+chargeH*0.05); ctx.lineTo(cx2+(Math.random()-0.5)*4,chargeY+chargeH*0.95); ctx.stroke()
          }
        }

        // Plastic layer (softening zone) - visible during early coking
        if (ov.progress>0.1&&ov.progress<0.7) {
          const plastZ=chargeW*(0.15+ov.progress*0.25)
          ctx.strokeStyle=`rgba(255,${Math.round(80+ov.progress*80)},0,${0.3+ov.progress*0.3})`; ctx.lineWidth=2; ctx.setLineDash([3,4])
          ctx.beginPath(); ctx.moveTo(chargeX+plastZ,chargeY); ctx.lineTo(chargeX+plastZ,chargeY+chargeH); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(chargeX+chargeW-plastZ,chargeY); ctx.lineTo(chargeX+chargeW-plastZ,chargeY+chargeH); ctx.stroke()
          ctx.setLineDash([])
        }
      } else {
        // Pushing — dark empty oven with sparks
        ctx.fillStyle='rgba(8,12,18,0.9)'; ctx.fillRect(ox+ow*0.08,OVEN_Y0+oh*0.07,ow*0.84,oh*0.84)
        for(let k=0;k<3;k++) if(running){
          ctx.fillStyle=`rgba(255,${100+Math.round(Math.random()*100)},0,${Math.random()*0.8})`
          ctx.beginPath(); ctx.arc(ox+ow*0.3+Math.random()*ow*0.4,OVEN_Y0+oh*0.3+Math.random()*oh*0.5,1.5,0,Math.PI*2); ctx.fill()
        }
      }

      // Oven door indicator
      const doorCol = ov.phase==='pushing'?'#f85149':ov.phase==='charging'?'#FFB300':ov.phase==='ready'?'#57ab5a':'#2c4055'
      ctx.fillStyle=doorCol; ctx.fillRect(ox+ow*0.02,OVEN_Y0+oh*0.15,ow*0.05,oh*0.7)
      ctx.fillRect(ox+ow*0.93,OVEN_Y0+oh*0.15,ow*0.05,oh*0.7)

      // Oven border
      ctx.strokeStyle='#2c3e50'; ctx.lineWidth=1.5; ctx.strokeRect(ox,OVEN_Y0,ow,oh)

      // Progress bar
      const pbY=OVEN_Y0-H*0.022
      ctx.fillStyle='#0a1520'; ctx.fillRect(ox,pbY,ow,H*0.015)
      const pbCol = ov.progress>0.95?'#f85149':ov.progress>0.7?'#FF8F00':ov.progress>0.4?'#FFB300':'#1565C0'
      ctx.fillStyle=pbCol; ctx.fillRect(ox,pbY,ow*ov.progress,H*0.015)
      ctx.strokeStyle='#1e2d3d'; ctx.lineWidth=0.5; ctx.strokeRect(ox,pbY,ow,H*0.015)

      // Oven number + phase
      lblB(`#${ov.id}`,ox+ow*0.5,OVEN_Y0-H*0.030,doorCol,clamp(W*0.010,7,10))
      lbl(ov.phase.toUpperCase(),ox+ow*0.5,OVEN_Y0-H*0.012,'rgba(255,255,255,0.12)',clamp(W*0.007,5,7))
      lbl(`${Math.round(ov.temp)}°C`,ox+ow*0.5,OVEN_Y1+H*0.016,running?heatColor(ov.temp,900,1400):'#37474F',clamp(W*0.009,7,9))
      // Progress %
      lbl(`${(ov.progress*100).toFixed(0)}%`,ox+ow*0.5,OVEN_Y0+OVEN_H*0.5,`rgba(255,255,255,${ov.phase==='pushing'?0.1:0.18})`,clamp(W*0.011,8,11))
    })
    lblB('COKE OVEN BATTERY',BATTERY_MID,OVEN_Y0-H*0.062,'#546E7A',clamp(W*0.012,9,13))

    // ── FLUE / UNDERFIRING SYSTEM ──────────────────────────────────────────
    ctx.fillStyle='#0d1520'; ctx.fillRect(OVEN_X0-4,FLUE_Y0+H*0.025,BATTERY_W+8,FLUE_H-H*0.025)
    ctx.strokeStyle='#1a2535'; ctx.lineWidth=1; ctx.strokeRect(OVEN_X0-4,FLUE_Y0+H*0.025,BATTERY_W+8,FLUE_H-H*0.025)
    // Flue channels
    sim.ovens.forEach((_,i)=>{
      const fx=ovenX(i)+OVEN_W*0.5
      if(running){
        const fg=ctx.createLinearGradient(0,FLUE_Y0+FLUE_H*0.3,0,FLUE_Y0+FLUE_H)
        fg.addColorStop(0,`rgba(255,${80+Math.round(40*Math.sin(sim.t*2+i))},0,0.62)`)
        fg.addColorStop(1,'rgba(180,50,0,0.35)')
        ctx.fillStyle=fg; ctx.fillRect(fx-6,FLUE_Y0+H*0.026,12,FLUE_H-H*0.028)
      }
    })
    sim.flueFlames.forEach(f=>{
      const fg2=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,f.r*2)
      fg2.addColorStop(0,`rgba(255,200,50,${f.life*0.75})`); fg2.addColorStop(1,'rgba(255,80,0,0)')
      ctx.fillStyle=fg2; ctx.beginPath(); ctx.arc(f.x,f.y,f.r*2,0,Math.PI*2); ctx.fill()
    })
    sim.flueGas.forEach(p=>{
      ctx.globalAlpha=p.life*0.35; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1
    lbl('UNDERFIRING SYSTEM',BATTERY_MID,FLUE_Y0+FLUE_H*0.58,'#1e3040',clamp(W*0.009,7,9))
    lbl(`Flue temp: ${Math.round(sim.underFireTemp)}°C`,BATTERY_MID,FLUE_Y0+FLUE_H*0.78,running?'#FF7043':'#37474F',clamp(W*0.009,7,9))

    // ── PUSHER MACHINE ─────────────────────────────────────────────────────
    // PUSHER MACHINE — travels on COAL SIDE (left), ram pushes RIGHT through oven
    const PUSHER_Y = OVEN_Y0 + OVEN_H * 0.35   // mid-height on left side
    const px2 = sim.pusherX
    // Vertical rail on coal side
    ctx.strokeStyle='#1a2535'; ctx.lineWidth=3
    ctx.beginPath(); ctx.moveTo(COAL_SIDE_X-38,OVEN_Y0); ctx.lineTo(COAL_SIDE_X-38,OVEN_Y1+FLUE_H); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(COAL_SIDE_X-22,OVEN_Y0); ctx.lineTo(COAL_SIDE_X-22,OVEN_Y1+FLUE_H); ctx.stroke()
    // Pusher machine body (moves vertically to align with oven)
    const pusherBodyY = PUSHER_Y - H*0.04
    ctx.fillStyle='#1a2d3d'; ctx.strokeStyle='#2c4a65'; ctx.lineWidth=1.2
    ctx.fillRect(COAL_SIDE_X-56,pusherBodyY,46,H*0.08); ctx.strokeRect(COAL_SIDE_X-56,pusherBodyY,46,H*0.08)
    // Pusher ram (horizontal, extends RIGHT into oven)
    if(sim.pusherActive){
      const ti2=sim.pusherTarget
      const ramTargY=ovenX(ti2)>0 ? OVEN_Y0+OVEN_H*0.35 : PUSHER_Y
      // Hydraulic ram extending right
      ctx.fillStyle='#1565C0'
      ctx.fillRect(COAL_SIDE_X-10,ramTargY-6,OVEN_W*5.5,12)  // long ram through oven
      ctx.fillStyle='#2c4a65'
      ctx.fillRect(COAL_SIDE_X-10,ramTargY-8,18,16)           // ram head
      ctx.strokeStyle='#29B6F6'; ctx.lineWidth=0.8; ctx.strokeRect(COAL_SIDE_X-10,ramTargY-8,18,16)
      // Ram guide housing
      ctx.strokeStyle='#1565C0'; ctx.lineWidth=1; ctx.setLineDash([4,3])
      ctx.beginPath(); ctx.moveTo(COAL_SIDE_X-10,ramTargY-6); ctx.lineTo(COKE_SIDE_X+12,ramTargY-6); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(COAL_SIDE_X-10,ramTargY+6); ctx.lineTo(COKE_SIDE_X+12,ramTargY+6); ctx.stroke()
      ctx.setLineDash([])
      // Coke being pushed — glowing mass exiting right side of oven
      const pushGrd=ctx.createLinearGradient(COKE_SIDE_X-OVEN_W,ramTargY-OVEN_H*0.35,COKE_SIDE_X+20,ramTargY-OVEN_H*0.35)
      pushGrd.addColorStop(0,'rgba(180,100,20,0.55)'); pushGrd.addColorStop(0.7,heatColor(920,100,1400)); pushGrd.addColorStop(1,'rgba(255,120,0,0.85)')
      ctx.fillStyle=pushGrd; ctx.fillRect(COKE_SIDE_X-OVEN_W*0.5,ramTargY-OVEN_H*0.38,OVEN_W*0.6,OVEN_H*0.76)
      lbl('PUSHING →',COAL_SIDE_X-30,pusherBodyY-6,'#FFD54F',clamp(W*0.009,7,9),'right')
    }
    // Wheels on rail
    ctx.fillStyle='#253545'; ctx.strokeStyle='#37474F'; ctx.lineWidth=0.8
    ;[-5,H*0.06-5].forEach(wy=>{
      ctx.beginPath(); ctx.arc(COAL_SIDE_X-38,pusherBodyY+wy+5,5,0,Math.PI*2); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.arc(COAL_SIDE_X-22,pusherBodyY+wy+5,5,0,Math.PI*2); ctx.fill(); ctx.stroke()
    })
    lbl('PUSHER',COAL_SIDE_X-35,OVEN_Y0-8,'#29B6F6',clamp(W*0.009,7,9),'right')
    lbl('MACHINE',COAL_SIDE_X-35,OVEN_Y0+2,'#29B6F6',clamp(W*0.008,6,8),'right')
    lbl('← COAL SIDE',COAL_SIDE_X-56,OVEN_Y1+FLUE_H+10,'#1e3040',clamp(W*0.009,7,9),'right')

    // ── COKE GUIDE + QUENCH CAR (COKE SIDE = RIGHT of battery) ──────────
    const QY=QUENCH_RAIL_Y
    const qx=sim.quenchCarX>0?sim.quenchCarX:QUENCH_CAR_BASE_X+OVEN_W*1.5
    // Coke side label
    lbl('COKE SIDE →',COKE_SIDE_X+8,OVEN_Y0-8,'#FF8F00',clamp(W*0.009,7,9),'left')
    // Coke exit chute (from oven coke side down to quench car)
    ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1
    // Vertical drop zone from battery to quench car
    ctx.fillStyle='rgba(10,18,30,0.7)'
    ctx.fillRect(COKE_SIDE_X,OVEN_Y0,W*0.10,OVEN_H+FLUE_H+H*0.01)
    ctx.strokeStyle='#1e3040'; ctx.lineWidth=0.8
    ctx.strokeRect(COKE_SIDE_X,OVEN_Y0,W*0.10,OVEN_H+FLUE_H+H*0.01)
    lbl('COKE GUIDE',COKE_SIDE_X+W*0.05,OVEN_Y0+OVEN_H*0.5,'#263238',clamp(W*0.009,7,9))
    lbl('CHUTE',COKE_SIDE_X+W*0.05,OVEN_Y0+OVEN_H*0.5+12,'#263238',clamp(W*0.009,7,9))

    // Quench car track (horizontal, on coke side, below battery)
    ctx.strokeStyle='#1a2535'; ctx.lineWidth=3
    ctx.beginPath(); ctx.moveTo(COKE_SIDE_X,QY+H*0.045); ctx.lineTo(W*0.97,QY+H*0.045); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(COKE_SIDE_X,QY+H*0.060); ctx.lineTo(W*0.97,QY+H*0.060); ctx.stroke()
    // Quench car body
    ctx.fillStyle='#1a2d3d'; ctx.strokeStyle='#2c4a65'; ctx.lineWidth=1.2
    ctx.fillRect(qx-40,QY,80,H*0.055); ctx.strokeRect(qx-40,QY,80,H*0.055)
    // Car interior — hot coke inside
    if(sim.cokesPushed>0){
      const cokeInCar = sim.quenchActive ? sim.cokesPushed : Math.max(0,sim.cokesPushed-1)
      if(cokeInCar>0){
        const cg3=ctx.createLinearGradient(0,QY+4,0,QY+H*0.05)
        cg3.addColorStop(0,heatColor(sim.quenchActive?650:920,100,1200)); cg3.addColorStop(1,'rgba(30,22,14,0.92)')
        ctx.fillStyle=cg3; ctx.fillRect(qx-36,QY+4,72,H*0.044)
      }
    }
    // Wheels
    ;[-28,0,28].forEach(wx=>{ ctx.fillStyle='#253545'; ctx.strokeStyle='#37474F'; ctx.lineWidth=0.8; ctx.beginPath(); ctx.arc(qx+wx,QY+H*0.060,6,0,Math.PI*2); ctx.fill(); ctx.stroke() })
    // Quench water spray tower above car
    if(sim.quenchActive&&running){
      // Tower structure
      ctx.fillStyle='#1a2535'; ctx.fillRect(qx-8,QY-H*0.08,16,H*0.08); ctx.strokeStyle='#2c4055'; ctx.lineWidth=0.8; ctx.strokeRect(qx-8,QY-H*0.08,16,H*0.08)
      ;[-20,-10,0,10,20].forEach(nx=>{
        ctx.fillStyle='#1565C0'; ctx.fillRect(qx+nx-2,QY-4,4,5)
        for(let a=-0.5;a<=0.5;a+=0.2){
          ctx.strokeStyle=`rgba(41,182,246,${0.65+0.3*Math.sin(sim.t*8+a*3)})`; ctx.lineWidth=1.2
          ctx.beginPath(); ctx.moveTo(qx+nx,QY-1); ctx.lineTo(qx+nx+Math.sin(a)*18,QY-1+20); ctx.stroke()
        }
      })
      lbl('⚡ QUENCHING',qx,QY-H*0.085,'#29B6F6',clamp(W*0.010,8,11))
      lbl(`${quenchType}`,qx,QY-H*0.07,'#4FC3F7',clamp(W*0.009,7,9))
    } else {
      lbl('QUENCH CAR',qx,QY-8,'#546E7A',clamp(W*0.009,7,9))
    }

    // Quench drops + steam
    sim.quenchDrops.forEach(d=>{
      ctx.globalAlpha=d.life*0.7; ctx.fillStyle='#4FC3F7'
      ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1
    sim.steamPuffs.forEach(p=>{
      ctx.globalAlpha=p.life*0.22; ctx.fillStyle='rgba(200,220,240,1)'
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // ── LARRY CAR (coal charging car on top of battery) ────────────────────
    const LARRY_Y=OVEN_Y0-H*0.08
    const lx2=OVEN_X0+sim.larryCarX%(BATTERY_W)
    ctx.fillStyle='#1a2d3d'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1
    ctx.fillRect(lx2-20,LARRY_Y,40,H*0.05); ctx.strokeRect(lx2-20,LARRY_Y,40,H*0.05)
    // Coal in larry
    ctx.fillStyle='rgba(30,28,24,0.88)'; ctx.fillRect(lx2-16,LARRY_Y+4,32,H*0.035)
    ;[-12,12].forEach(wx=>{
      ctx.fillStyle='#1a2535'; ctx.beginPath(); ctx.arc(lx2+wx,LARRY_Y+H*0.048,4,0,Math.PI*2); ctx.fill()
    })
    lbl('LARRY CAR',lx2,LARRY_Y-5,'#37474F',clamp(W*0.009,7,9))

    // ── WHARF & CONVEYOR ───────────────────────────────────────────────────
    ctx.fillStyle='#0f1a28'; ctx.fillRect(WHARF_X0,WHARF_Y,WHARF_X1-WHARF_X0,WHARF_H)
    ctx.strokeStyle='#1a2d40'; ctx.lineWidth=1; ctx.strokeRect(WHARF_X0,WHARF_Y,WHARF_X1-WHARF_X0,WHARF_H)
    lbl('COKE WHARF (cooling after quench)',WHARF_X0+(WHARF_X1-WHARF_X0)/2,WHARF_Y-8,'#2c4055',clamp(W*0.010,8,10))
    // Arrow showing coke dumps from quench car down to wharf
    ctx.strokeStyle='rgba(255,140,0,0.2)'; ctx.lineWidth=2; ctx.setLineDash([3,4])
    ctx.beginPath(); ctx.moveTo(qx,QY+H*0.058); ctx.lineTo(qx,WHARF_Y+4); ctx.stroke(); ctx.setLineDash([])
    lbl('↓ dump',qx,QY+H*0.065+(WHARF_Y-QY-H*0.065)*0.5,'rgba(100,80,30,0.45)',clamp(W*0.008,6,7))

    sim.cokeWharfPiles.forEach(p=>{
      if(p.x<WHARF_X0-20||p.x>WHARF_X1+20) return
      const pg=ctx.createLinearGradient(p.x-p.w/2,p.y,p.x+p.w/2,p.y+p.h)
      pg.addColorStop(0,heatColor(p.temp,80,1000)); pg.addColorStop(1,'rgba(25,22,18,0.92)')
      ctx.fillStyle=pg
      ctx.beginPath(); ctx.ellipse(p.x,p.y+p.h*0.5,p.w/2,p.h/2,0,0,Math.PI*2); ctx.fill()
      // Texture
      ctx.strokeStyle='rgba(15,12,8,0.55)'; ctx.lineWidth=0.6; ctx.stroke()
      if(p.temp>200){ const hg2=ctx.createRadialGradient(p.x,p.y,2,p.x,p.y,p.w*0.7); hg2.addColorStop(0,`rgba(255,80,0,${(p.temp-200)/1000*0.18})`); hg2.addColorStop(1,'rgba(255,60,0,0)'); ctx.fillStyle=hg2; ctx.fillRect(p.x-p.w,p.y-p.h,p.w*2,p.h*2) }
      lbl(`${Math.round(p.temp)}°C`,p.x,p.y+p.h+8,heatColor(p.temp,80,1000),clamp(W*0.007,5,7))
    })

    // Conveyor belt
    ctx.fillStyle='#0c1520'; ctx.fillRect(W*0.01,CONVEYOR_Y,W*0.94,H*0.045)
    ctx.strokeStyle='#1a2535'; ctx.lineWidth=1; ctx.strokeRect(W*0.01,CONVEYOR_Y,W*0.94,H*0.045)
    // Belt lines
    for(let bx2=W*0.01+sim.conveyorOffset;bx2<W*0.71;bx2+=30){
      ctx.strokeStyle='rgba(30,50,70,0.5)'; ctx.lineWidth=1.5
      ctx.beginPath(); ctx.moveTo(bx2,CONVEYOR_Y); ctx.lineTo(bx2,CONVEYOR_Y+H*0.045); ctx.stroke()
    }
    // Coke on conveyor
    sim.cokeConveyor.forEach(c=>{
      const cg2=ctx.createLinearGradient(c.x,CONVEYOR_Y,c.x+c.w,CONVEYOR_Y+H*0.035)
      cg2.addColorStop(0,heatColor(c.temp,100,900)); cg2.addColorStop(1,'rgba(22,18,14,0.9)')
      ctx.fillStyle=cg2; ctx.fillRect(c.x,CONVEYOR_Y+4,c.w,H*0.035-8)
    })
    lbl('COKE CONVEYOR → BLAST FURNACE',W*0.35,CONVEYOR_Y-6,'#1e3040',clamp(W*0.009,7,9))

    // ── TOP STATUS STRIP ───────────────────────────────────────────────────
    ctx.fillStyle='rgba(4,8,18,0.82)'; ctx.fillRect(0,0,W,H*0.028)
    const readyCount=sim.ovens.filter(o=>o.phase==='ready').length
    const cokingCount=sim.ovens.filter(o=>o.phase==='coking').length
    ;[
      {l:'OVENS COKING',v:`${cokingCount}/${OVEN_COUNT}`,c:'#FF8F00'},
      {l:'READY TO PUSH',v:`${readyCount}`,c:readyCount>0?'#f85149':'#57ab5a'},
      {l:'COKES PUSHED',v:`${sim.cokesPushed}`,c:'#9b5de5'},
      {l:'COG TEMP',v:`${Math.round(sim.cogTemp)}°C`,c:'#FFB300'},
      {l:'COKE YIELD',v:`${sim.cokeYieldPct.toFixed(1)}%`,c:'#57ab5a'},
      {l:'STATUS',v:running?'OPERATING ●':'SHUTDOWN ○',c:running?'#57ab5a':'#546E7A'},
    ].forEach(({l,v,c},ki)=>{
      const px3=W*0.01+ki*W*0.165
      ctx.fillStyle='#4d7a9a'; ctx.font=`${clamp(W*0.009,6,9)}px monospace`; ctx.textAlign='left'; ctx.fillText(l,px3,H*0.012)
      ctx.fillStyle=c; ctx.font=`bold ${clamp(W*0.010,7,10)}px monospace`; ctx.fillText(v,px3,H*0.023)
    })

    // ── HUD ────────────────────────────────────────────────────────────────
    const HX=W-210,HY=H*0.03,HW=202,RH=25
    ctx.fillStyle='rgba(4,8,18,0.86)'; ctx.fillRect(HX-4,HY,HW+8,RH*12+12)
    ctx.strokeStyle='#1a3050'; ctx.lineWidth=0.8; ctx.strokeRect(HX-4,HY,HW+8,RH*12+12)
    ctx.fillStyle='#3d6a8a'; ctx.font=`bold ${clamp(W*0.010,8,10)}px monospace`; ctx.textAlign='center'
    ctx.fillText('COKE PLANT MONITOR',HX+HW/2,HY+13)
    const avgT=sim.ovens.reduce((a,o)=>a+o.temp,0)/OVEN_COUNT
    const hudRows=[
      ['OVEN AVG TEMP',   `${Math.round(avgT)} °C`,                                '#FF8F00'],
      ['COG TEMPERATURE', `${Math.round(sim.cogTemp)} °C`,                          '#FFB300'],
      ['COAL MOISTURE',   `${coalMoisture} %`,                                      '#29B6F6'],
      ['COKE YIELD',      `${sim.cokeYieldPct.toFixed(1)} %`,                       '#57ab5a'],
      ['COKE PRODUCTION', `${Math.round(sim.cokesPushed * sim.cokeYieldPct*0.22)}t`,'#39c5cf'],
      ['UNDERFIRING',     `${Math.round(sim.underFireTemp)} °C`,                    '#FF7043'],
      ['COKING RATE',     `${pushingSpeed} %`,                                      '#9b5de5'],
      ['QUENCH TYPE',     quenchType,                                                '#4FC3F7'],
      ['OVENS COKING',    `${cokingCount}/${OVEN_COUNT}`,                           '#FF8F00'],
      ['READY TO PUSH',   `${readyCount}`,                                          readyCount>0?'#f85149':'#37474F'],
      ['COKES PUSHED',    `${sim.cokesPushed}`,                                     '#9b5de5'],
      ['STATUS',          running?'OPERATING ●':'SHUTDOWN ○',                       running?'#57ab5a':'#546E7A'],
    ]
    hudRows.forEach(([l,v,c],i)=>{
      const ry=HY+18+i*RH
      ctx.fillStyle='#0a1422'; ctx.fillRect(HX,ry,HW,RH-2)
      ctx.strokeStyle='#1a3050'; ctx.lineWidth=0.3; ctx.strokeRect(HX,ry,HW,RH-2)
      ctx.fillStyle='#4d7a9a'; ctx.font=`${clamp(W*0.009,7,9)}px monospace`; ctx.textAlign='left'; ctx.fillText(l,HX+5,ry+10)
      ctx.fillStyle=c; ctx.font=`bold ${clamp(W*0.010,8,10)}px monospace`; ctx.textAlign='right'; ctx.fillText(v,HX+HW-4,ry+RH-5)
    })

    // ── HOVER TOOLTIPS ────────────────────────────────────────────────────
    const mx=mouseRef.current.x, my2=mouseRef.current.y
    let tooltip=null

    // Hit: individual ovens
    sim.ovens.forEach((ov,i)=>{
      const ox=ovenX(i)
      if(mx>=ox&&mx<=ox+OVEN_W&&my2>=OVEN_Y0&&my2<=OVEN_Y1){
        const phaseInfo={
          coking:  {desc:'Coal actively converting to coke',  col:'#FF8F00'},
          ready:   {desc:'Coking complete — ready to push',   col:'#f85149'},
          pushing: {desc:'Coke being pushed out by ram',      col:'#FF5722'},
          charging:{desc:'Fresh coal being loaded',           col:'#29B6F6'},
        }
        const pi=phaseInfo[ov.phase]||phaseInfo.coking
        tooltip={title:`OVEN #${ov.id} — ${ov.phase.toUpperCase()}`,color:pi.col,lines:[
          {label:'Temperature',value:`${Math.round(ov.temp)} °C`,col:heatColor(ov.temp,900,1400)},
          {label:'Coking progress',value:`${(ov.progress*100).toFixed(0)} %`,col:ov.progress>0.9?'#f85149':'#FF8F00'},
          {label:'Gas flow',value:`${(ov.gasFlow*100).toFixed(0)} % max`,col:'#FFB300'},
          {label:'Phase',value:pi.desc,col:'rgba(180,200,210,0.9)'},
          {label:'Wall temp',value:`~${Math.round(ov.temp*0.95)} °C`,col:'#FF7043'},
          {label:'Coking time',value:`~16–18 hrs total`,col:'#78909C'},
        ]}
      }
    })

    // Hit: gas main
    if(!tooltip&&my2>=GAS_MAIN_Y-10&&my2<=GAS_MAIN_Y+20&&mx>=OVEN_X0&&mx<=OVEN_X0+BATTERY_W){
      tooltip={title:'COLLECTING GAS MAIN (COG)',color:'#FFB300',lines:[
        {label:'Gas temp',value:`${Math.round(sim.cogTemp)} °C`,col:'#FFB300'},
        {label:'Contents',value:'H₂ 55%  CH₄ 25%  CO 8%  others',col:'#A5D6A7'},
        {label:'Calorific',value:'~4,500 kcal/Nm³',col:'#57ab5a'},
        {label:'Pressure',value:`${sim.gasMain.pressure.toFixed(2)} bar`,col:'#29B6F6'},
        {label:'Goes to',value:'Byproduct plant, underfiring, power',col:'#78909C'},
        {label:'By-products',value:'Tar, benzol, NH₃, naphthalene, H₂S',col:'rgba(180,200,210,0.85)'},
      ]}
    }

    // Hit: underfiring flue
    if(!tooltip&&my2>=FLUE_Y0&&my2<=FLUE_Y0+FLUE_H&&mx>=OVEN_X0&&mx<=OVEN_X0+BATTERY_W){
      tooltip={title:'UNDERFIRING SYSTEM',color:'#FF7043',lines:[
        {label:'Flue temp',value:`${Math.round(sim.underFireTemp)} °C`,col:'#FF7043'},
        {label:'Fuel',value:'Coke Oven Gas (COG) or BF gas',col:'#FFB300'},
        {label:'Purpose',value:'Heats oven walls to 1250–1350°C',col:'rgba(180,200,210,0.85)'},
        {label:'Air',value:'Pre-heated via regenerators',col:'#29B6F6'},
        {label:'Control',value:'Individual flue pressure control',col:'#78909C'},
      ]}
    }

    // Hit: larry car
    if(!tooltip&&my2>=LARRY_Y-5&&my2<=LARRY_Y+H*0.05&&Math.abs(mx-lx2)<30){
      tooltip={title:'LARRY CAR (CHARGING CAR)',color:'#90A4AE',lines:[
        {label:'Function',value:'Charges coal into oven from top',col:'rgba(180,200,210,0.85)'},
        {label:'Coal type',value:'Blended coking coal mix',col:'#8D6E63'},
        {label:'Moisture',value:`${coalMoisture} % in coal blend`,col:'#29B6F6'},
        {label:'Charge wt',value:'~15–18 t per oven',col:'#78909C'},
        {label:'Process',value:'Opens lid, drops coal, closes lid',col:'rgba(180,200,210,0.85)'},
      ]}
    }

    // Hit: pusher machine
    if(!tooltip&&my2>=PUSHER_Y&&my2<=PUSHER_Y+H*0.06&&Math.abs(mx-px2)<40){
      tooltip={title:'PUSHER MACHINE',color:'#29B6F6',lines:[
        {label:'Function',value:'Pushes hot coke out of oven',col:'rgba(180,200,210,0.85)'},
        {label:'Ram force',value:'~500–800 kN hydraulic ram',col:'#FF8F00'},
        {label:'Temp at push',value:`Coke ~900–1050°C when pushed`,col:'#FF7043'},
        {label:'Speed',value:`${pushingSpeed}% coking rate`,col:'#29B6F6'},
        {label:'After push',value:'Coke falls into quench car',col:'#78909C'},
      ]}
    }

    // Hit: quench car
    if(!tooltip&&qx>0&&my2>=QY-10&&my2<=QY+H*0.05&&Math.abs(mx-qx)<50){
      tooltip={title:sim.quenchActive?'WET QUENCHING IN PROGRESS':'QUENCH CAR',color:'#4FC3F7',lines:[
        {label:'Type',value:quenchType,col:'#4FC3F7'},
        {label:'Water',value:'~130–150 L per tonne coke',col:'#29B6F6'},
        {label:'Coke temp',value:sim.quenchActive?'Dropping 1000°C → <250°C':'Standby',col:'#FF7043'},
        {label:'Steam',value:'Rises from quench tower above',col:'rgba(180,200,210,0.85)'},
        {label:'After',value:'Coke dumped onto wharf for screening',col:'#78909C'},
      ]}
    }

    // Hit: wharf piles
    if(!tooltip&&my2>=WHARF_Y&&my2<=WHARF_Y+WHARF_H&&mx>=W*0.68&&mx<=W*0.98){
      const pile=sim.cokeWharfPiles.find(p=>Math.abs(mx-p.x)<p.w/2&&Math.abs(my2-(p.y+p.h/2))<p.h/2)
      if(pile){
        tooltip={title:'HOT COKE ON WHARF',color:'#FF8F00',lines:[
          {label:'Surface temp',value:`${Math.round(pile.temp)} °C`,col:heatColor(pile.temp,80,900)},
          {label:'Composition',value:'C>90%  Ash~8%  S<1%  moisture',col:'rgba(180,200,210,0.85)'},
          {label:'Size',value:'25–80mm (after screening)',col:'#78909C'},
          {label:'Cooling',value:'Air cooling on wharf',col:'#29B6F6'},
          {label:'Destiny',value:'Blast furnace feed via conveyor',col:'#57ab5a'},
        ]}
      }
    }

    // Hit: coal bins
    ;[0,1,2].forEach(i=>{
      const bx3=BIN_X0+i*(BIN_W+6)
      if(mx>=bx3&&mx<=bx3+BIN_W&&my2>=COAL_Y&&my2<=COAL_Y+BIN_H){
        tooltip={title:`COAL BIN ${i+1}`,color:'#8D6E63',lines:[
          {label:'Level',value:`${(sim.coalBins[i].level*100).toFixed(0)} %`,col:'#90A4AE'},
          {label:'Type',value:'Blended coking coal (3–5 grades)',col:'rgba(180,200,210,0.85)'},
          {label:'Moisture',value:`${coalMoisture} % (target <10%)`,col:'#29B6F6'},
          {label:'Volatile',value:'~25–32% VM in blend',col:'#FFB300'},
          {label:'Crushing',value:'<3mm 70–80% (before charging)',col:'#78909C'},
        ]}
      }
    })

    // Draw tooltip
    if(tooltip){
      const TW=clamp(W*0.33,290,400)
      const lineH=25,pad=16
      const TH=pad*2+30+tooltip.lines.length*lineH+8
      let tx4=mx+18,ty4=my2-TH/2
      if(tx4+TW>W-10) tx4=mx-TW-18
      if(ty4<32) ty4=32
      if(ty4+TH>H-32) ty4=H-TH-32
      ctx.shadowColor='rgba(0,0,0,0.65)'; ctx.shadowBlur=14
      ctx.fillStyle='rgba(5,12,25,0.95)'; ctx.strokeStyle=tooltip.color; ctx.lineWidth=1.5
      // roundRect polyfill (not supported in all WebViews)
      const r6=6
      ctx.beginPath()
      ctx.moveTo(tx4+r6,ty4)
      ctx.lineTo(tx4+TW-r6,ty4); ctx.arcTo(tx4+TW,ty4,tx4+TW,ty4+r6,r6)
      ctx.lineTo(tx4+TW,ty4+TH-r6); ctx.arcTo(tx4+TW,ty4+TH,tx4+TW-r6,ty4+TH,r6)
      ctx.lineTo(tx4+r6,ty4+TH); ctx.arcTo(tx4,ty4+TH,tx4,ty4+TH-r6,r6)
      ctx.lineTo(tx4,ty4+r6); ctx.arcTo(tx4,ty4,tx4+r6,ty4,r6)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.shadowBlur=0
      ctx.fillStyle=tooltip.color+'28'; ctx.fillRect(tx4+1,ty4+1,TW-2,32)
      ctx.fillStyle=tooltip.color; ctx.font=`bold ${clamp(W*0.015,13,17)}px monospace`; ctx.textAlign='left'
      ctx.fillText(tooltip.title,tx4+pad,ty4+19)
      ctx.strokeStyle=tooltip.color+'45'; ctx.lineWidth=0.8
      ctx.beginPath(); ctx.moveTo(tx4+pad,ty4+36); ctx.lineTo(tx4+TW-pad,ty4+36); ctx.stroke()
      tooltip.lines.forEach((line,li)=>{
        const ly2=ty4+54+li*lineH
        ctx.fillStyle='rgba(170,195,215,0.90)'; ctx.font=`${clamp(W*0.012,11,14)}px monospace`; ctx.textAlign='left'
        ctx.fillText(line.label+':',tx4+pad,ly2)
        ctx.fillStyle=line.col; ctx.font=`bold ${clamp(W*0.012,11,14)}px monospace`; ctx.textAlign='right'
        const val=line.value.length>32?line.value.substring(0,30)+'…':line.value
        ctx.fillText(val,tx4+TW-pad,ly2)
      })
      ctx.fillStyle=tooltip.color; ctx.beginPath(); ctx.arc(mx,my2,4,0,Math.PI*2); ctx.fill()
      ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1; ctx.stroke()
    }

    // Footer
    ctx.fillStyle='rgba(4,8,18,0.92)'; ctx.fillRect(0,H-18,W,18)
    ctx.fillStyle='#2c4055'; ctx.font=`${clamp(W*0.009,7,10)}px monospace`; ctx.textAlign='left'
    ctx.fillText(`COKE PLANT  |  OVEN TEMP:${cokeOvenTemp}°C  |  MOISTURE:${coalMoisture}%  |  QUENCH:${quenchType}  |  PUSHED:${sim.cokesPushed}  |  ${new Date().toLocaleTimeString()}`,8,H-4)

    } catch(e) {
      // Show error on canvas so we can debug in Chrome
      ctx.fillStyle='#06090f'; ctx.fillRect(0,0,W,H)
      ctx.fillStyle='#e5534b'; ctx.font='14px monospace'; ctx.textAlign='left'
      ctx.fillText('RENDER ERROR: ' + e.message, 20, 40)
      ctx.fillText(e.stack ? e.stack.split('\n')[1] : '', 20, 60)
      console.error('CokePlant draw error:', e)
    }
    rafRef.current = requestAnimationFrame(draw)
  }, [running, pushingSpeed, coalMoisture, cokeOvenTemp, quenchType])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  return <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block' }} />
}

// ─── UI ───────────────────────────────────────────────────────────────────────
const C = {
  bg:'#07090f', panel:'#0b1220', border:'#1a2d45',
  text:'#cdd9e5', muted:'#6e8098', accent:'#FF8F00',
  success:'#57ab5a', danger:'#e5534b', cyan:'#39c5cf',
}

function Slider({ label, value, onChange, min, max, step=1, unit, disabled, color }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
        <span style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:'0.07em' }}>{label}</span>
        <span style={{ fontSize:11, color:color||C.accent, fontFamily:'monospace', fontWeight:700 }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)} disabled={disabled}
        style={{ width:'100%', accentColor:color||C.accent, opacity:disabled?0.4:1, cursor:disabled?'not-allowed':'pointer', height:20 }} />
    </div>
  )
}

export default function CokePlantModel() {
  const [running, setRunning]             = useState(false)
  const [pushingSpeed, setPushingSpeed]   = useState(70)
  const [coalMoisture, setCoalMoisture]   = useState(8)
  const [cokeOvenTemp, setCokeOvenTemp]   = useState(1250)
  const [quenchType, setQuenchType]       = useState('Wet Quench')
  const [panelOpen, setPanelOpen]         = useState(true)
  const [elapsed, setElapsed]             = useState(0)
  const [cokesPushed, setCokesPushed]     = useState(0)
  const [cogTemp, setCOGTemp]             = useState(750)
  const [cokeYield, setCokeYield]         = useState('72.0')
  const [cokeTonnage, setCokeTonnage]     = useState(0)
  const [resetCount, setResetCount]       = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (running) { timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000) }
    else clearInterval(timerRef.current)
    return () => clearInterval(timerRef.current)
  }, [running])

  const fmt = t => `${String(Math.floor(t/3600)).padStart(2,'0')}:${String(Math.floor((t%3600)/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`

  return (
    <div style={{ height:'100dvh', background:C.bg, color:C.text, fontFamily:'monospace', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ background:'#060a10', borderBottom:`1px solid ${C.border}`, padding:'0 12px', height:48, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:20 }}>🏭</span>
          <div>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.04em' }}>COKE PLANT MODEL</div>
            <div style={{ fontSize:8, color:C.muted, letterSpacing:'0.1em' }}>COKE OVEN BATTERY — REAL-TIME SIMULATION</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {[
            { l:'TIME',    v:fmt(elapsed),      c:running?C.success:C.muted },
            { l:'COG',     v:`${cogTemp}°C`,    c:'#FFB300' },
            { l:'YIELD',   v:`${cokeYield}%`,   c:C.success },
            { l:'TONNAGE', v:`${cokeTonnage}t`, c:C.cyan },
            { l:'PUSHED',  v:`${cokesPushed}`,  c:'#9b5de5' },
          ].map(item => (
            <div key={item.l} style={{ textAlign:'center' }}>
              <div style={{ fontSize:7, color:C.muted }}>{item.l}</div>
              <div style={{ fontSize:12, fontWeight:700, color:item.c }}>{item.v}</div>
            </div>
          ))}
          <button onClick={() => setPanelOpen(v => !v)}
            style={{ padding:'4px 8px', borderRadius:3, border:`1px solid ${C.border}`, background:'transparent', color:C.muted, fontSize:11, cursor:'pointer' }}>
            {panelOpen ? '◀' : '▶'}
          </button>
          <button onClick={() => {
            setRunning(v => !v)
            if (!running) { setElapsed(0); setCokesPushed(0); setCokeTonnage(0); setResetCount(c => c+1) }
          }} style={{ padding:'6px 14px', borderRadius:4, border:`1px solid ${running?C.danger:C.success}`, background:running?'rgba(229,83,73,0.15)':'rgba(87,171,90,0.15)', color:running?C.danger:C.success, fontSize:11, fontWeight:700, cursor:'pointer', letterSpacing:'0.05em' }}>
            {running ? '⏹ STOP' : '▶ START'}
          </button>
        </div>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {panelOpen && (
          <div style={{ width:220, background:C.panel, borderRight:`1px solid ${C.border}`, padding:'12px', overflow:'auto', flexShrink:0 }}>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:'0.12em', marginBottom:12 }}>PARAMETERS</div>
            <Slider label="Coking Rate" value={pushingSpeed} onChange={setPushingSpeed} min={30} max={100} unit="%" color='#FF8F00' />
            <Slider label="Oven Temperature" value={cokeOvenTemp} onChange={setCokeOvenTemp} min={1100} max={1380} unit="°C" color='#FF7043' disabled={running} />
            <Slider label="Coal Moisture" value={coalMoisture} onChange={setCoalMoisture} min={2} max={15} unit="%" color='#29B6F6' disabled={running} />
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Quench Type</div>
              {['Wet Quench','Dry Quench (CDQ)'].map(q => (
                <label key={q} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, cursor:'pointer' }}>
                  <input type="radio" name="quench" value={q} checked={quenchType===q} onChange={() => setQuenchType(q)}
                    style={{ accentColor:C.accent }} />
                  <span style={{ fontSize:10, color:quenchType===q?C.accent:C.muted }}>{q}</span>
                </label>
              ))}
            </div>
            <div style={{ height:1, background:C.border, margin:'10px 0' }} />
            <div style={{ fontSize:9, color:C.muted, letterSpacing:'0.12em', marginBottom:8 }}>LIVE VALUES</div>
            {[
              { l:'COG Temp',    v:`${cogTemp}°C`,     c:'#FFB300' },
              { l:'Coke Yield',  v:`${cokeYield}%`,    c:C.success },
              { l:'Production',  v:`${cokeTonnage}t`,  c:C.cyan },
              { l:'Pushed',      v:`${cokesPushed}`,   c:'#9b5de5' },
            ].map(r => (
              <div key={r.l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:`1px solid ${C.border}` }}>
                <span style={{ fontSize:9, color:C.muted }}>{r.l}</span>
                <span style={{ fontSize:10, fontWeight:600, color:r.c }}>{r.v}</span>
              </div>
            ))}
            <div style={{ height:1, background:C.border, margin:'10px 0' }} />
            <div style={{ fontSize:9, color:'#4d7a9a', marginBottom:6 }}>HOVER TOOLTIPS</div>
            {[
              ['🟧','Oven cells — phase & temp'],
              ['🟡','Gas main — COG composition'],
              ['🔥','Underfiring — flue system'],
              ['🚂','Larry car — coal charging'],
              ['🔵','Pusher — ram details'],
              ['💧','Quench car — cooling'],
              ['⚫','Coal bins — grade info'],
              ['🟤','Wharf piles — coke temp'],
            ].map(([ic, l]) => (
              <div key={l} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                <span style={{ fontSize:11 }}>{ic}</span>
                <span style={{ fontSize:8, color:C.muted }}>{l}</span>
              </div>
            ))}
            <div style={{ height:1, background:C.border, margin:'10px 0' }} />
            <div style={{ fontSize:9, color:'#4d7a9a', marginBottom:4 }}>OVEN PHASES</div>
            {[
              ['#1565C0','CHARGING','Fresh coal loaded'],
              ['#FF8F00','COKING','Converting to coke'],
              ['#f85149','READY','Push immediately'],
              ['#FF5722','PUSHING','Ram ejecting coke'],
            ].map(([c, ph, desc]) => (
              <div key={ph} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                <div style={{ width:10, height:10, borderRadius:2, background:c, flexShrink:0 }} />
                <div>
                  <div style={{ fontSize:9, color:c, fontWeight:600 }}>{ph}</div>
                  <div style={{ fontSize:8, color:C.muted }}>{desc}</div>
                </div>
              </div>
            ))}
            <div style={{ height:1, background:C.border, margin:'10px 0' }} />
            <div style={{ fontSize:9, color:'#4d7a9a', marginBottom:4 }}>KEY REACTIONS</div>
            {[
              'Coal → Coke + COG (1100-1350°C)',
              'Volatile matter → gas + tar',
              'CaCO₃ → CaO + CO₂',
              'H₂O evap → steam (top gas)',
              'S + CaO → CaS (desulph)',
            ].map(r => <div key={r} style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{r}</div>)}
          </div>
        )}
        <div style={{ flex:1, overflow:'hidden', background:'#06090f' }}>
          <CokePlantCanvas
            running={running}
            pushingSpeed={pushingSpeed}
            coalMoisture={coalMoisture}
            cokeOvenTemp={cokeOvenTemp}
            quenchType={quenchType}
            setCOGTemp={setCOGTemp}
            setCokeYield={setCokeYield}
            setCokeTonnage={setCokeTonnage}
            onCokePush={() => setCokesPushed(v => v+1)}
            doReset={resetCount}
          />
        </div>
      </div>
    </div>
  )
}
