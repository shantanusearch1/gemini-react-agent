import { useState, useEffect, useRef, useCallback } from 'react'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function heatColor(temp, min = 200, max = 1550) {
  const t = clamp((temp - min) / (max - min), 0, 1)
  if (t > 0.90) return `rgba(255,255,${Math.round((1-t)*5*255)},0.98)`
  if (t > 0.75) return `rgba(255,${Math.round(100+(t-0.75)*4*155)},0,0.96)`
  if (t > 0.55) return `rgba(${Math.round(180+(t-0.55)*5*75)},${Math.round(40+(t-0.55)*5*60)},0,0.93)`
  if (t > 0.35) return `rgba(${Math.round(100+(t-0.35)*5*80)},${Math.round(20+(t-0.35)*5*20)},0,0.88)`
  if (t > 0.15) return `rgba(${Math.round(60+(t-0.15)*5*40)},${Math.round(10+(t-0.15)*5*10)},${Math.round(20-(t-0.15)*5*20)},0.82)`
  return `rgba(${Math.round(30+t*200)},${Math.round(40+t*100)},${Math.round(80+t*80)},0.75)`
}

function BlastFurnaceCanvas({
  running, windRate, cokePct, orePct, fluxPct,
  hotBlastTemp, setIronTemp, setSlagTemp, setBfTemp,
  setGasUtilization, setProductionRate,
  onIronCast, onSlagCast, doReset,
}) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const S = useRef({
    t: 0, frame: 0,
    bfTemp: 1520, ironTemp: 1490, slagTemp: 1480,
    topGasTemp: 220, gasUtil: 48, productionRate: 0,
    burdenOffset: 0, burdenLayers: [],
    tuyerePulse: 0, tuyereFlames: [], raceways: [],
    gasParticles: [], ironLevel: 0.35, slagLevel: 0.15,
    tapping: false, tapIron: false, tapSlag: false,
    tapTimer: 0, nextTapIn: 60, ironCast: 0, slagCast: 0,
    torpedoLadles: [], slagPots: [],
    stovePhase: [0, 1, 2], stoveTemp: [1200, 1350, 900],
    topGasParticles: [],
    skipY: 0, skipDir: -1, skipLoad: 'empty',
    bellOpen: false, bellTimer: 0, dustParticles: [],
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
    Object.assign(sim, {
      t:0, frame:0, bfTemp:1520, ironTemp:1490, slagTemp:1480,
      topGasTemp:220, gasUtil:48, productionRate:0,
      burdenOffset:0, burdenLayers:[], tuyerePulse:0,
      tuyereFlames:[], raceways:[], gasParticles:[],
      ironLevel:0.35, slagLevel:0.15,
      tapping:false, tapIron:false, tapSlag:false,
      tapTimer:0, nextTapIn:60, ironCast:0, slagCast:0,
      torpedoLadles:[], slagPots:[],
      stovePhase:[0,1,2], stoveTemp:[1200,1350,900],
      topGasParticles:[], skipY:0, skipDir:-1, skipLoad:'empty',
      bellOpen:false, bellTimer:0, dustParticles:[],
    })
  }, [doReset])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return }
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    const sim = S.current
    sim.t += 0.016; sim.frame++
    const dt = 0.016

    // ── LAYOUT ──────────────────────────────────────────────────────────
    const BF_CX  = W * 0.44
    const BF_TOP = H * 0.05
    const BF_BOT = H * 0.87
    const BF_H   = BF_BOT - BF_TOP

    // BF classic profile: throat→shaft→belly→bosh→hearth
    const bfHW = (yFrac) => {
      if (yFrac < 0.07) return W * 0.060                                    // throat
      if (yFrac < 0.32) return W * 0.060 + (yFrac-0.07)/0.25 * W * 0.065   // shaft widens
      if (yFrac < 0.44) return W * 0.125                                    // belly
      if (yFrac < 0.65) return W * 0.125 - (yFrac-0.44)/0.21 * W * 0.045   // bosh narrows
      return W * 0.080                                                       // hearth
    }

    const HEARTH_TOP  = BF_TOP + BF_H * 0.65
    const HEARTH_BOT  = BF_BOT
    const HEARTH_H    = HEARTH_BOT - HEARTH_TOP
    const TUYERE_Y    = HEARTH_TOP + HEARTH_H * 0.20
    const TAPHOLE_Y   = HEARTH_TOP + HEARTH_H * 0.75
    const SLAGHOLE_Y  = HEARTH_TOP + HEARTH_H * 0.42
    const STOVE_X     = W * 0.10
    const CAST_X      = BF_CX + bfHW(0.80) + W * 0.01
    const PX_PER_M_BF = BF_H / 30   // 30m furnace height

    // ── PHYSICS ─────────────────────────────────────────────────────────
    if (running) {
      const intensity = clamp((windRate/100) * 0.7 + (cokePct/20) * 0.3, 0.1, 1.0)

      // Temperatures
      const tgtBF = 1350 + intensity*280 + (hotBlastTemp/1200)*80
      sim.bfTemp = clamp(sim.bfTemp + (tgtBF-sim.bfTemp)*0.004, 900, 1700)
      setBfTemp(Math.round(sim.bfTemp))
      sim.ironTemp = clamp(sim.bfTemp - 25 + (Math.random()-0.5)*8, 1380, 1560)
      setIronTemp(Math.round(sim.ironTemp))
      sim.slagTemp = clamp(sim.ironTemp - 18 + (Math.random()-0.5)*6, 1360, 1530)
      setSlagTemp(Math.round(sim.slagTemp))
      sim.topGasTemp = clamp(150+(1-intensity)*200+(Math.random()-0.5)*15, 120, 380)

      // Gas utilization
      const tgtGas = 40 + intensity*16 + (fluxPct/20)*4
      sim.gasUtil = clamp(sim.gasUtil+(tgtGas-sim.gasUtil)*0.006, 32, 58)
      setGasUtilization(sim.gasUtil.toFixed(1))

      // Production
      const tgtProd = intensity*4500 + (orePct/80)*2000
      sim.productionRate = clamp(sim.productionRate+(tgtProd-sim.productionRate)*0.004, 0, 8000)
      setProductionRate(Math.round(sim.productionRate))

      // Burden descent
      sim.burdenOffset = (sim.burdenOffset + intensity*0.5) % 50
      if (sim.burdenLayers.length < 14) {
        const types = ['ore','ore','coke','flux','ore','coke']
        sim.burdenLayers.push({
          type: types[sim.frame % types.length],
          y: BF_TOP + 25,
          thickness: 16 + Math.random()*10
        })
      }
      sim.burdenLayers = sim.burdenLayers.map(l=>({...l, y: l.y+intensity*0.45})).filter(l=>l.y<TUYERE_Y)

      // Tuyere blast
      sim.tuyerePulse = (sim.tuyerePulse + 0.20*(windRate/100)) % (Math.PI*2)
      if (sim.frame%2===0) {
        ;[-1,1].forEach(side=>{
          const tx = BF_CX + side*(bfHW(0.72)-3)
          for(let k=0;k<3;k++) sim.tuyereFlames.push({
            x:tx, y:TUYERE_Y+(Math.random()-0.5)*12,
            vx:side*(2+Math.random()*3)*(windRate/100),
            vy:(Math.random()-0.5)*1.8,
            life:1, r:3+Math.random()*5,
            col:Math.random()>0.5?'#FF6D00':'#FFD54F'
          })
        })
      }

      // Raceway combustion
      if (sim.frame%7===0) sim.raceways.push({
        x:BF_CX+(Math.random()-0.5)*bfHW(0.72)*0.7,
        y:TUYERE_Y+(Math.random()-0.5)*18,
        r:8+Math.random()*14, life:1
      })

      // Gas particles rising inside BF
      if (sim.gasParticles.length < 90) {
        sim.gasParticles.push({
          x:BF_CX+(Math.random()-0.5)*bfHW(0.75)*1.1,
          y:TUYERE_Y-8,
          vx:(Math.random()-0.5)*0.9,
          vy:-(1.4+Math.random()*2.2)*(windRate/100)*0.85,
          life:1, r:1.5+Math.random()*2.5,
          col:`rgba(${180+Math.round(Math.random()*55)},${155+Math.round(Math.random()*55)},75,0.5)`
        })
      }

      // Hearth accumulation
      const ironAccum = intensity * 0.00035
      sim.ironLevel  = clamp(sim.ironLevel  + ironAccum,          0, 0.88)
      sim.slagLevel  = clamp(sim.slagLevel  + ironAccum * 0.32,   0, 0.42)

      // Auto tapping
      if (!sim.tapping) {
        sim.nextTapIn -= intensity * 0.6
        if (sim.nextTapIn <= 0 || sim.ironLevel > 0.84) {
          sim.tapping = true; sim.tapIron = true; sim.tapSlag = true; sim.tapTimer = 0
          sim.torpedoLadles.push({ x: CAST_X+W*0.06, y: H*0.855, vx:0, temp:0, filling:true })
          sim.slagPots.push({ x:BF_CX-bfHW(0.65)-W*0.06, y:SLAGHOLE_Y+16, filling:true })
        }
      } else {
        sim.tapTimer += dt
        if (sim.tapIron) sim.ironLevel = Math.max(0.04, sim.ironLevel - intensity*0.0028)
        if (sim.tapSlag) sim.slagLevel = Math.max(0.01, sim.slagLevel - intensity*0.0014)
        sim.torpedoLadles = sim.torpedoLadles.map(t=>({...t, temp:Math.min(sim.ironTemp,t.temp+14)}))
        if (sim.tapTimer > 200) {
          sim.tapping=false; sim.tapIron=false; sim.tapSlag=false
          sim.nextTapIn = 160 + Math.random()*120
          sim.ironCast++; onIronCast()
          sim.slagCast++; onSlagCast()
          sim.torpedoLadles = sim.torpedoLadles.map(t=>({...t,filling:false,vx:2.0}))
          sim.slagPots = sim.slagPots.map(p=>({...p,filling:false}))
        }
      }
      sim.torpedoLadles = sim.torpedoLadles.map(t=>({...t,x:t.vx?t.x+t.vx:t.x})).filter(t=>t.x<W+250)

      // Top gas
      if (sim.topGasParticles.length<35) sim.topGasParticles.push({
        x:BF_CX+(Math.random()-0.5)*bfHW(0.05)*0.6, y:BF_TOP+18,
        vx:(Math.random()-0.5)*1.8, vy:-(0.9+Math.random()*2.2),
        life:1, r:2+Math.random()*3.5,
        col:`rgba(${130+Math.round(Math.random()*50)},${140+Math.round(Math.random()*50)},90,0.45)`
      })

      // Skip hoist
      if (intensity>0.1) {
        sim.skipY += sim.skipDir * intensity * 2.8
        if (sim.skipY<=0){ sim.skipDir=1; sim.skipLoad='ore'; sim.bellOpen=true; sim.bellTimer=55 }
        if (sim.skipY>=H*0.70){ sim.skipDir=-1; sim.skipLoad='empty' }
      }
      if (sim.bellTimer>0){ sim.bellTimer-- } else { sim.bellOpen=false }

      // Stoves
      sim.stoveTemp = sim.stoveTemp.map((t,i)=>{
        if(sim.stovePhase[i]===0) return Math.min(1400, t+intensity*0.9)
        if(sim.stovePhase[i]===1) return Math.max(900,  t-intensity*0.55)
        return t
      })
      if(sim.frame%580===0) sim.stovePhase=sim.stovePhase.map(p=>(p+1)%3)

      // Dust catcher
      if(sim.frame%6===0) sim.dustParticles.push({
        x:BF_CX-bfHW(0.03)*0.6, y:BF_TOP+12,
        vx:-(1.2+Math.random()), vy:-0.4-Math.random(),
        life:1, r:2+Math.random()*2.5
      })
    }

    // Update particles
    sim.tuyereFlames   = sim.tuyereFlames.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.055}))
    sim.raceways       = sim.raceways.filter(p=>p.life>0).map(p=>({...p,life:p.life-0.038}))
    sim.gasParticles   = sim.gasParticles.filter(p=>p.life>0&&p.y>BF_TOP).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.011}))
    sim.topGasParticles= sim.topGasParticles.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.022}))
    sim.dustParticles  = sim.dustParticles.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.016}))

    // ── DRAW ────────────────────────────────────────────────────────────
    ctx.fillStyle='#06090f'; ctx.fillRect(0,0,W,H)
    ctx.strokeStyle='rgba(255,255,255,0.015)'; ctx.lineWidth=0.5
    for(let gx=0;gx<W;gx+=36){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke()}
    for(let gy=0;gy<H;gy+=36){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke()}

    const lbl=(t,x,y,c='#78909C',sz=9,align='center')=>{ctx.fillStyle=c;ctx.font=`${sz}px monospace`;ctx.textAlign=align;ctx.fillText(t,x,y)}

    // ── COWPER STOVES ─────────────────────────────────────────────────────
    const stoveLabels=['ON BLAST','HEATING','STAND-BY']
    const stoveCols  =['#E53935','#FF6D00','#37474F']
    ;[0,1,2].forEach(i=>{
      const sx = STOVE_X + i*W*0.07
      const stoveH = H*0.42, stoveY = H*0.30
      const phase = sim.stovePhase[i], sTemp = sim.stoveTemp[i]
      // Cylinder body
      ctx.fillStyle=phase===1?'#2d1500':phase===0?'#1a2535':'#141e2c'
      ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
      ctx.fillRect(sx-W*0.024,stoveY,W*0.048,stoveH); ctx.strokeRect(sx-W*0.024,stoveY,W*0.048,stoveH)
      // Heat fill
      const heatH = stoveH*(sTemp/1400)
      const hGrd=ctx.createLinearGradient(0,stoveY+stoveH-heatH,0,stoveY+stoveH)
      hGrd.addColorStop(0,`rgba(255,${phase===1?70:130},0,${phase===0?0.65:0.35})`)
      hGrd.addColorStop(1,'rgba(190,45,0,0.55)')
      ctx.fillStyle=hGrd; ctx.fillRect(sx-W*0.021,stoveY+stoveH-heatH,W*0.042,heatH)
      // Dome
      ctx.fillStyle='#253545'; ctx.strokeStyle='#3a5570'; ctx.lineWidth=1
      ctx.beginPath(); ctx.ellipse(sx,stoveY,W*0.024,H*0.032,0,0,Math.PI*2); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(sx,stoveY+stoveH,W*0.024,H*0.016,0,0,Math.PI*2); ctx.fill(); ctx.stroke()
      if(phase===1&&running){
        const fg=ctx.createRadialGradient(sx,stoveY-H*0.025,2,sx,stoveY-H*0.025,24)
        fg.addColorStop(0,'rgba(255,200,0,0.88)'); fg.addColorStop(1,'rgba(255,80,0,0)')
        ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(sx,stoveY-H*0.025,24,0,Math.PI*2); ctx.fill()
      }
      lbl(`S${i+1}`,sx,stoveY-H*0.036,stoveCols[phase],clamp(W*0.010,7,11))
      lbl(stoveLabels[phase],sx,stoveY-H*0.020,stoveCols[phase],clamp(W*0.008,6,8))
      lbl(`${Math.round(sTemp)}°C`,sx,stoveY+stoveH+14,running?'#FF8F00':'#546E7A',clamp(W*0.009,7,9))
    })
    lbl('COWPER STOVES',STOVE_X+W*0.07,H*0.25,'#2c4055',clamp(W*0.010,8,11))

    // Hot blast main pipe
    const blastPipeY = TUYERE_Y
    const blastCol = running?`rgba(255,${70+Math.round(70*Math.sin(sim.tuyerePulse))},0,0.65)`:'#1a2535'
    ctx.strokeStyle=blastCol; ctx.lineWidth=10
    ctx.beginPath(); ctx.moveTo(STOVE_X+W*0.115,blastPipeY)
    ctx.bezierCurveTo(STOVE_X+W*0.22,blastPipeY,BF_CX-bfHW(0.72)-22,blastPipeY+8,BF_CX-bfHW(0.72),blastPipeY)
    ctx.stroke()
    ctx.strokeStyle='#0d1a28'; ctx.lineWidth=2; ctx.stroke()
    lbl('HOT BLAST MAIN',STOVE_X+W*0.20,blastPipeY-12,'#FF7043',clamp(W*0.009,7,9))
    lbl(`${hotBlastTemp}°C  ${windRate}%`,STOVE_X+W*0.20,blastPipeY+2,running?'#FF5722':'#546E7A',clamp(W*0.009,7,9))

    // Bustle pipe (ring around BF at tuyere level)
    ctx.strokeStyle=running?`rgba(255,${60+Math.round(60*Math.sin(sim.tuyerePulse*1.3))},0,0.5)`:'#1a2535'
    ctx.lineWidth=6
    ctx.beginPath(); ctx.ellipse(BF_CX,TUYERE_Y,bfHW(0.72)+8,H*0.018,0,0,Math.PI*2); ctx.stroke()
    lbl('BUSTLE PIPE',BF_CX,TUYERE_Y-H*0.025,'#455A64',clamp(W*0.009,7,9))

    // ── BLAST FURNACE OUTER SHELL ─────────────────────────────────────────
    const steps=50
    const leftPts=[], rightPts=[]
    for(let s=0;s<=steps;s++){
      const yf=s/steps, y=BF_TOP+yf*BF_H, hw=bfHW(yf)
      leftPts.push([BF_CX-hw,y]); rightPts.push([BF_CX+hw,y])
    }
    // Shell fill
    ctx.beginPath(); ctx.moveTo(...leftPts[0])
    leftPts.forEach(p=>ctx.lineTo(...p))
    rightPts.slice().reverse().forEach(p=>ctx.lineTo(...p))
    ctx.closePath(); ctx.fillStyle='#1a2535'; ctx.fill()
    ctx.strokeStyle='#2c4055'; ctx.lineWidth=2.5; ctx.stroke()

    // Interior temperature gradient
    ctx.save()
    ctx.beginPath(); ctx.moveTo(...leftPts[0])
    leftPts.forEach(p=>ctx.lineTo(...p))
    rightPts.slice().reverse().forEach(p=>ctx.lineTo(...p))
    ctx.closePath(); ctx.clip()

    const zGrd=ctx.createLinearGradient(0,BF_TOP,0,BF_BOT)
    zGrd.addColorStop(0.00,'rgba(28,42,55,0.96)')
    zGrd.addColorStop(0.18,'rgba(70,35,8,0.86)')
    zGrd.addColorStop(0.36,'rgba(130,48,0,0.89)')
    zGrd.addColorStop(0.50,'rgba(170,58,0,0.91)')
    zGrd.addColorStop(0.63,'rgba(200,75,0,0.93)')
    zGrd.addColorStop(0.73,`rgba(${215+Math.round(25*Math.sin(sim.t*1.8))},88,0,0.95)`)
    zGrd.addColorStop(0.83,`rgba(255,${75+Math.round(30*Math.sin(sim.t*1.4))},0,0.97)`)
    zGrd.addColorStop(1.00,`rgba(255,${95+Math.round(35*Math.sin(sim.t*1.1))},0,0.98)`)
    ctx.fillStyle=zGrd; ctx.fillRect(0,BF_TOP,W,BF_H)

    // Burden layers
    sim.burdenLayers.forEach(layer=>{
      const yf=clamp((layer.y-BF_TOP)/BF_H,0,0.95)
      const hw=bfHW(yf)-5
      const layerCols={ore:'rgba(140,55,15,0.52)',coke:'rgba(22,22,22,0.58)',flux:'rgba(88,112,72,0.48)'}
      ctx.fillStyle=layerCols[layer.type]||'rgba(70,70,70,0.4)'
      ctx.fillRect(BF_CX-hw,layer.y,hw*2,layer.thickness)
    })
    ctx.restore()

    // Gas particles
    sim.gasParticles.forEach(p=>{
      ctx.globalAlpha=p.life*0.52; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // Raceway glows
    sim.raceways.forEach(r=>{
      const rg=ctx.createRadialGradient(r.x,r.y,0,r.x,r.y,r.r*2.2)
      rg.addColorStop(0,`rgba(255,195,0,${r.life*0.72})`); rg.addColorStop(1,'rgba(255,75,0,0)')
      ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(r.x,r.y,r.r*2.2,0,Math.PI*2); ctx.fill()
    })

    // ── HEARTH LIQUID LEVELS ──────────────────────────────────────────────
    const hearthL = BF_CX-bfHW(0.90)+3, hearthR = BF_CX+bfHW(0.90)-3
    const ironH2   = HEARTH_H * sim.ironLevel
    const slagH2   = HEARTH_H * sim.slagLevel * 0.48
    const ironTop2 = HEARTH_BOT - ironH2
    const slagTop2 = ironTop2 - slagH2

    if(sim.ironLevel>0.02){
      const ig=ctx.createLinearGradient(0,ironTop2,0,HEARTH_BOT)
      ig.addColorStop(0,`rgba(255,${75+Math.round(28*Math.sin(sim.t*2))},0,0.95)`)
      ig.addColorStop(1,'rgba(195,38,0,0.86)')
      ctx.fillStyle=ig; ctx.fillRect(hearthL,ironTop2,hearthR-hearthL,ironH2)
      if(running){
        ctx.fillStyle=`rgba(255,155,0,${0.18+0.14*Math.sin(sim.t*3)})`
        ctx.fillRect(hearthL,ironTop2,hearthR-hearthL,4)
      }
    }
    if(sim.slagLevel>0.01){
      const sg=ctx.createLinearGradient(0,slagTop2,0,ironTop2)
      sg.addColorStop(0,'rgba(115,135,75,0.72)'); sg.addColorStop(1,'rgba(95,115,55,0.86)')
      ctx.fillStyle=sg; ctx.fillRect(hearthL,slagTop2,hearthR-hearthL,slagH2)
    }
    lbl(`Iron ${(sim.ironLevel*100).toFixed(0)}%`,BF_CX+bfHW(0.90)+6,ironTop2+ironH2*0.5,'#FF8F00',clamp(W*0.009,7,9),'left')
    lbl(`Slag ${(sim.slagLevel*100).toFixed(0)}%`,BF_CX+bfHW(0.90)+6,slagTop2+slagH2*0.5,'#A5D6A7',clamp(W*0.009,7,9),'left')

    // ── TUYERES ───────────────────────────────────────────────────────────
    ;[-1,1].forEach(side=>{
      for(let ti=0;ti<5;ti++){
        const tx=BF_CX+side*(bfHW(0.72)-2)
        const ty=TUYERE_Y+(ti-2)*10
        ctx.fillStyle='#1565C0'; ctx.strokeStyle='#29B6F6'; ctx.lineWidth=0.8
        ctx.fillRect(tx-side*16,ty-3.5,16,7); ctx.strokeRect(tx-side*16,ty-3.5,16,7)
        if(running){
          const pulse=0.5+0.5*Math.sin(sim.tuyerePulse+ti*0.7+(side>0?Math.PI:0))
          const fg=ctx.createRadialGradient(tx,ty,0,tx,ty,14*pulse)
          fg.addColorStop(0,`rgba(255,195,0,${0.75*pulse})`); fg.addColorStop(1,'rgba(255,80,0,0)')
          ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(tx,ty,14*pulse,0,Math.PI*2); ctx.fill()
        }
      }
    })
    lbl('TUYERES',BF_CX-bfHW(0.72)-22,TUYERE_Y,'#1565C0',clamp(W*0.009,7,9),'right')
    lbl(`${windRate}% blast`,BF_CX-bfHW(0.72)-22,TUYERE_Y+11,running?'#29B6F6':'#37474F',clamp(W*0.008,6,8),'right')

    sim.tuyereFlames.forEach(f=>{
      ctx.globalAlpha=f.life*0.82; ctx.fillStyle=f.col
      ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // ── TAPHOLE & IRON RUNNER ─────────────────────────────────────────────
    const tapX   = BF_CX + bfHW(0.82) - 2
    const runEndX = CAST_X + W*0.05
    const runEndY = TAPHOLE_Y + H*0.055
    ctx.strokeStyle='#37474F'; ctx.lineWidth=7
    ctx.beginPath(); ctx.moveTo(tapX,TAPHOLE_Y); ctx.lineTo(runEndX,runEndY); ctx.stroke()
    ctx.strokeStyle='#1a2535'; ctx.lineWidth=2
    ctx.beginPath(); ctx.moveTo(tapX,TAPHOLE_Y); ctx.lineTo(runEndX,runEndY); ctx.stroke()
    if(sim.tapIron&&running){
      const ig2=ctx.createLinearGradient(tapX,TAPHOLE_Y,runEndX,runEndY)
      ig2.addColorStop(0,`rgba(255,${75+Math.round(35*Math.sin(sim.t*5))},0,0.92)`)
      ig2.addColorStop(1,'rgba(215,48,0,0.72)')
      ctx.strokeStyle=ig2; ctx.lineWidth=5
      ctx.beginPath(); ctx.moveTo(tapX,TAPHOLE_Y); ctx.lineTo(runEndX,runEndY); ctx.stroke()
      const tg=ctx.createRadialGradient(tapX,TAPHOLE_Y,2,tapX,TAPHOLE_Y,22)
      tg.addColorStop(0,'rgba(255,140,0,0.65)'); tg.addColorStop(1,'rgba(255,80,0,0)')
      ctx.fillStyle=tg; ctx.fillRect(tapX-22,TAPHOLE_Y-22,44,44)
      lbl('TAPPING',tapX-4,TAPHOLE_Y-14,'#FFD54F',clamp(W*0.009,7,9),'right')
    } else {
      ctx.fillStyle='#263238'; ctx.fillRect(tapX-8,TAPHOLE_Y-5,16,10)
      lbl('TAPHOLE',tapX,TAPHOLE_Y+14,'#37474F',clamp(W*0.009,7,9))
    }

    // Slag notch & runner
    const slagX  = BF_CX - bfHW(0.65)
    const slagEndX = slagX - W*0.055
    const slagEndY = SLAGHOLE_Y + H*0.038
    ctx.strokeStyle='#37474F'; ctx.lineWidth=5
    ctx.beginPath(); ctx.moveTo(slagX,SLAGHOLE_Y); ctx.lineTo(slagEndX,slagEndY); ctx.stroke()
    if(sim.tapSlag&&running){
      const slg=ctx.createLinearGradient(slagX,SLAGHOLE_Y,slagEndX,slagEndY)
      slg.addColorStop(0,'rgba(110,132,55,0.90)'); slg.addColorStop(1,'rgba(90,112,38,0.72)')
      ctx.strokeStyle=slg; ctx.lineWidth=4
      ctx.beginPath(); ctx.moveTo(slagX,SLAGHOLE_Y); ctx.lineTo(slagEndX,slagEndY); ctx.stroke()
      lbl('SLAG',slagX+8,SLAGHOLE_Y-8,'#A5D6A7',clamp(W*0.009,7,9))
    } else {
      lbl('SLAG NOTCH',slagX-4,SLAGHOLE_Y-8,'#37474F',clamp(W*0.009,7,9),'right')
    }

    // ── TORPEDO LADLE CAR ─────────────────────────────────────────────────
    // Track
    ctx.strokeStyle='#1a2535'; ctx.lineWidth=3
    ctx.beginPath(); ctx.moveTo(CAST_X,H*0.885); ctx.lineTo(W*0.98,H*0.885); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(CAST_X,H*0.905); ctx.lineTo(W*0.98,H*0.905); ctx.stroke()
    lbl('TORPEDO LADLE CAR TRACK',CAST_X+W*0.10,H*0.925,'#1e3040',clamp(W*0.009,7,9))

    sim.torpedoLadles.forEach(t=>{
      const tx2=t.x, ty2=t.y
      // Wheel bogies
      ctx.fillStyle='#1a2535'; ctx.fillRect(tx2-38,ty2+10,76,14)
      ;[-26,-10,10,26].forEach(wx=>{
        ctx.fillStyle='#2c3e50'; ctx.strokeStyle='#37474F'; ctx.lineWidth=0.8
        ctx.beginPath(); ctx.arc(tx2+wx,ty2+23,5,0,Math.PI*2); ctx.fill(); ctx.stroke()
      })
      // Torpedo body
      ctx.fillStyle='#263340'; ctx.strokeStyle='#37474F'; ctx.lineWidth=1.5
      ctx.beginPath(); ctx.ellipse(tx2,ty2,38,14,0,0,Math.PI*2); ctx.fill(); ctx.stroke()
      // Fill
      const fillF=t.filling?Math.min(1,sim.tapTimer/180):t.temp>200?1:0
      if(fillF>0.05){
        const fg3=ctx.createLinearGradient(0,ty2-14*fillF,0,ty2+14)
        fg3.addColorStop(0,`rgba(255,${t.temp>1200?75:115},0,0.92)`)
        fg3.addColorStop(1,'rgba(195,38,0,0.78)')
        ctx.fillStyle=fg3; ctx.save()
        ctx.beginPath(); ctx.ellipse(tx2,ty2,36,12,0,0,Math.PI*2); ctx.clip()
        ctx.fillRect(tx2-36,ty2-14*fillF,72,14*(fillF+1)); ctx.restore()
      }
      lbl('TORPEDO',tx2,ty2+34,t.filling?'#FF8F00':'#546E7A',clamp(W*0.009,7,9))
      if(t.temp>150) lbl(`${Math.round(t.temp)}°C`,tx2,ty2-20,running?'#FF6D00':'#546E7A',clamp(W*0.009,7,9))
    })

    // ── SLAG POTS ─────────────────────────────────────────────────────────
    sim.slagPots.forEach(p=>{
      ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c3e50'; ctx.lineWidth=1
      ctx.beginPath()
      ctx.moveTo(p.x-18,p.y); ctx.lineTo(p.x+18,p.y)
      ctx.lineTo(p.x+14,p.y+28); ctx.lineTo(p.x-14,p.y+28); ctx.closePath()
      ctx.fill(); ctx.stroke()
      if(p.filling){
        ctx.fillStyle='rgba(100,128,48,0.82)'
        ctx.fillRect(p.x-12,p.y+8,24,18)
        lbl('SLAG POT',p.x,p.y-6,'#A5D6A7',clamp(W*0.009,7,9))
      }
    })

    // ── SKIP HOIST ────────────────────────────────────────────────────────
    const skipRailTopX=BF_CX+bfHW(0.08)+8, skipRailTopY=BF_TOP+H*0.015
    const skipRailBotX=skipRailTopX+W*0.06, skipRailBotY=H*0.87
    ctx.strokeStyle='#1e2d3d'; ctx.lineWidth=2
    ctx.beginPath(); ctx.moveTo(skipRailTopX,skipRailTopY); ctx.lineTo(skipRailBotX,skipRailBotY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(skipRailTopX+8,skipRailTopY); ctx.lineTo(skipRailBotX+8,skipRailBotY); ctx.stroke()
    const skipFrac=sim.skipY/(H*0.70)
    const skipBX=skipRailBotX-(skipRailBotX-skipRailTopX)*skipFrac+4
    const skipBY=skipRailBotY-(skipRailBotY-skipRailTopY)*skipFrac
    ctx.fillStyle=sim.skipLoad==='empty'?'#1a2535':'#3d2808'
    ctx.strokeStyle='#2c4055'; ctx.lineWidth=1
    ctx.fillRect(skipBX-9,skipBY-9,18,13); ctx.strokeRect(skipBX-9,skipBY-9,18,13)
    if(sim.skipLoad!=='empty'){ctx.fillStyle='rgba(115,75,25,0.82)'; ctx.fillRect(skipBX-7,skipBY-7,14,9)}
    lbl('SKIP HOIST',skipRailBotX+14,H*0.60,'#1e3040',clamp(W*0.009,7,9),'left')

    // ── BELL / THROAT ────────────────────────────────────────────────────
    const bellHW=bfHW(0.025)
    ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
    ctx.fillRect(BF_CX-bellHW-5,BF_TOP-10,(bellHW+5)*2,12)
    ctx.strokeRect(BF_CX-bellHW-5,BF_TOP-10,(bellHW+5)*2,12)
    if(sim.bellOpen){
      ctx.fillStyle='rgba(255,115,0,0.38)'; ctx.fillRect(BF_CX-bellHW,BF_TOP,bellHW*2,16)
      lbl('BELL OPEN',BF_CX,BF_TOP-14,'#FFB300',clamp(W*0.009,7,9))
    } else {
      lbl('BELL CLOSED',BF_CX,BF_TOP-14,'#2c4055',clamp(W*0.009,7,9))
    }
    lbl('THROAT',BF_CX,BF_TOP-25,'#37474F',clamp(W*0.009,7,9))

    // ── TOP GAS OFFTAKE ───────────────────────────────────────────────────
    ctx.strokeStyle=running?`rgba(${115+Math.round(28*Math.sin(sim.t*2))},145,75,0.62)`:'#1a2535'
    ctx.lineWidth=9
    ctx.beginPath()
    ctx.moveTo(BF_CX-bfHW(0.04),BF_TOP+22)
    ctx.bezierCurveTo(BF_CX-bfHW(0.04)-45,BF_TOP+22,W*0.22,H*0.11,W*0.20,H*0.135)
    ctx.stroke()
    ctx.strokeStyle='#0d1a28'; ctx.lineWidth=1.5; ctx.stroke()
    lbl('TOP GAS',W*0.165,H*0.105,'#57ab5a',clamp(W*0.009,7,9))
    lbl(`${Math.round(sim.topGasTemp)}°C`,W*0.165,H*0.118,running?'#4CAF50':'#37474F',clamp(W*0.009,7,9))
    lbl(`CO: ${sim.gasUtil.toFixed(1)}%`,W*0.165,H*0.131,'#4CAF50',clamp(W*0.009,7,9))

    // Dust catcher
    ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
    ctx.beginPath(); ctx.arc(W*0.20,H*0.16,W*0.026,0,Math.PI*2); ctx.fill(); ctx.stroke()
    lbl('DUST',W*0.20,H*0.158,'#37474F',clamp(W*0.009,7,9))
    lbl('CTCHR',W*0.20,H*0.168,'#37474F',clamp(W*0.009,7,9))

    sim.topGasParticles.forEach(p=>{
      ctx.globalAlpha=p.life*0.42; ctx.fillStyle=p.col
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1
    sim.dustParticles.forEach(p=>{
      ctx.globalAlpha=p.life*0.38; ctx.fillStyle='rgba(145,115,75,0.6)'
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
    }); ctx.globalAlpha=1

    // ── BF ZONE LABELS ────────────────────────────────────────────────────
    const zones=[
      {yf:0.08, lab:'THROAT  / STACK',   tempC:350},
      {yf:0.24, lab:'UPPER SHAFT',       tempC:650},
      {yf:0.44, lab:'LOWER SHAFT',       tempC:1050},
      {yf:0.54, lab:'THERMAL RESERVE',   tempC:1150},
      {yf:0.63, lab:'COHESIVE ZONE',     tempC:1280},
      {yf:0.72, lab:'BOSH / RACEWAY',    tempC:1950},
      {yf:0.86, lab:'HEARTH',            tempC:1490},
    ]
    zones.forEach(z=>{
      const y=BF_TOP+BF_H*z.yf, hw=bfHW(z.yf)
      ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=0.5; ctx.setLineDash([3,5])
      ctx.beginPath(); ctx.moveTo(BF_CX-hw,y); ctx.lineTo(BF_CX+hw,y); ctx.stroke()
      ctx.setLineDash([])
      lbl(z.lab,BF_CX-hw-5,y+3,'rgba(255,255,255,0.11)',clamp(W*0.008,6,8),'right')
    })
    lbl('BLAST FURNACE',BF_CX,BF_TOP-38,'#90A4AE',clamp(W*0.013,10,16))
    lbl(`${Math.round(sim.bfTemp)}°C`,BF_CX,BF_TOP-22,running?'#FF8F00':'#546E7A',clamp(W*0.010,8,11))

    // ── CAST HOUSE LABEL ─────────────────────────────────────────────────
    ctx.strokeStyle='#1a2535'; ctx.lineWidth=1; ctx.setLineDash([3,5])
    ctx.strokeRect(CAST_X-4,TAPHOLE_Y-20,W*0.15,H*0.22); ctx.setLineDash([])
    lbl('CAST HOUSE',CAST_X+W*0.075,TAPHOLE_Y-26,'#1e3040',clamp(W*0.009,7,9))

    // ── HUD ───────────────────────────────────────────────────────────────
    const HX=W-212,HY=8,HW=204,RH=27
    ctx.fillStyle='rgba(4,8,18,0.86)'; ctx.fillRect(HX-4,HY,HW+8,RH*13+12)
    ctx.strokeStyle='#1a3050'; ctx.lineWidth=0.8; ctx.strokeRect(HX-4,HY,HW+8,RH*13+12)
    ctx.fillStyle='#3d6a8a'; ctx.font=`bold ${clamp(W*0.010,8,11)}px monospace`; ctx.textAlign='center'
    ctx.fillText('IRON MAKING MONITOR',HX+HW/2,HY+14)
    const rows=[
      ['BF TEMP (avg)', `${Math.round(sim.bfTemp)} °C`,      '#FF8F00'],
      ['IRON (HM) TEMP',`${Math.round(sim.ironTemp)} °C`,    '#FF6D00'],
      ['SLAG TEMP',     `${Math.round(sim.slagTemp)} °C`,    '#A5D6A7'],
      ['HOT BLAST TEMP',`${hotBlastTemp} °C`,                '#FF7043'],
      ['WIND RATE',     `${windRate} %`,                     '#29B6F6'],
      ['TOP GAS TEMP',  `${Math.round(sim.topGasTemp)} °C`,  '#57ab5a'],
      ['CO UTILIZATION',`${sim.gasUtil.toFixed(1)} %`,       '#4CAF50'],
      ['IRON LEVEL',    `${(sim.ironLevel*100).toFixed(0)} %`,sim.ironLevel>0.80?'#e5534b':'#FF8F00'],
      ['SLAG LEVEL',    `${(sim.slagLevel*100).toFixed(0)} %`,'#A5D6A7'],
      ['PRODUCTION',    `${Math.round(sim.productionRate)} t/d`,'#39c5cf'],
      ['IRON CASTS',    `${sim.ironCast}`,                   '#9b5de5'],
      ['TAPPING',       sim.tapping?'IN PROGRESS ●':'STANDBY ○',sim.tapping?'#FF6D00':'#546E7A'],
      ['STATUS',        running?'OPERATING ●':'SHUTDOWN ○',  running?'#57ab5a':'#546E7A'],
    ]
    rows.forEach(([l,v,c],i)=>{
      const ry=HY+20+i*RH
      ctx.fillStyle='#0a1422'; ctx.fillRect(HX,ry,HW,RH-2)
      ctx.strokeStyle='#1a3050'; ctx.lineWidth=0.3; ctx.strokeRect(HX,ry,HW,RH-2)
      ctx.fillStyle='#4d7a9a'; ctx.font=`${clamp(W*0.009,7,10)}px monospace`; ctx.textAlign='left'; ctx.fillText(l,HX+5,ry+11)
      ctx.fillStyle=c; ctx.font=`bold ${clamp(W*0.010,8,11)}px monospace`; ctx.textAlign='right'; ctx.fillText(v,HX+HW-4,ry+RH-5)
    })

    // Status strip
    ctx.fillStyle='rgba(4,8,18,0.82)'; ctx.fillRect(0,0,W,H*0.027)
    ;[
      {l:'BF TEMP',  v:`${Math.round(sim.bfTemp)}°C`,      c:'#FF8F00'},
      {l:'HOT METAL',v:`${Math.round(sim.ironTemp)}°C`,    c:'#FF6D00'},
      {l:'CO UTIL',  v:`${sim.gasUtil.toFixed(1)}%`,       c:'#57ab5a'},
      {l:'PROD RATE',v:`${Math.round(sim.productionRate)}t/d`,c:'#39c5cf'},
      {l:'IRON LVL', v:`${(sim.ironLevel*100).toFixed(0)}%`,c:sim.ironLevel>0.80?'#e5534b':'#FF8F00'},
      {l:'STATUS',   v:running?'OPERATING ●':'SHUTDOWN ○', c:running?'#57ab5a':'#546E7A'},
    ].forEach(({l,v,c},ki)=>{
      const px=W*0.01+ki*W*0.165
      ctx.fillStyle='#4d7a9a'; ctx.font=`${clamp(W*0.009,6,9)}px monospace`; ctx.textAlign='left'; ctx.fillText(l,px,H*0.012)
      ctx.fillStyle=c; ctx.font=`bold ${clamp(W*0.010,7,10)}px monospace`; ctx.fillText(v,px,H*0.023)
    })

    // Footer
    ctx.fillStyle='rgba(4,8,18,0.92)'; ctx.fillRect(0,H-18,W,18)
    ctx.fillStyle='#2c4055'; ctx.font=`${clamp(W*0.009,7,10)}px monospace`; ctx.textAlign='left'
    ctx.fillText(`BLAST FURNACE IRON MAKING  |  WIND:${windRate}%  |  COKE:${cokePct}%  |  ORE:${orePct}%  |  FLUX:${fluxPct}%  |  ${new Date().toLocaleTimeString()}`,8,H-4)

    rafRef.current = requestAnimationFrame(draw)
  }, [running, windRate, cokePct, orePct, fluxPct, hotBlastTemp])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  return <canvas ref={canvasRef} style={{width:'100%',height:'100%',display:'block'}} />
}

// ─── UI ──────────────────────────────────────────────────────────────────────
const C={bg:'#07090f',panel:'#0b1220',border:'#1a2d45',text:'#cdd9e5',muted:'#6e8098',accent:'#FF8F00',success:'#57ab5a',danger:'#e5534b',cyan:'#39c5cf',green:'#4CAF50'}

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

export default function IronMakingModel(){
  const [running,setRunning]         = useState(false)
  const [windRate,setWindRate]       = useState(75)
  const [cokePct,setCokePct]         = useState(15)
  const [orePct,setOrePct]           = useState(70)
  const [fluxPct,setFluxPct]         = useState(15)
  const [hotBlastTemp,setHotBlastTemp] = useState(1100)
  const [panelOpen,setPanelOpen]     = useState(true)
  const [elapsed,setElapsed]         = useState(0)
  const [ironCasts,setIronCasts]     = useState(0)
  const [slagCasts,setSlagCasts]     = useState(0)
  const [resetCount,setResetCount]   = useState(0)
  const [ironTemp,setIronTemp]       = useState(1490)
  const [slagTemp,setSlagTemp]       = useState(1475)
  const [bfTemp,setBfTemp]           = useState(1520)
  const [gasUtilization,setGasUtilization] = useState('48.0')
  const [productionRate,setProductionRate] = useState(0)
  const timerRef = useRef(null)

  useEffect(()=>{
    if(running){timerRef.current=setInterval(()=>setElapsed(t=>t+1),1000)}
    else clearInterval(timerRef.current)
    return()=>clearInterval(timerRef.current)
  },[running])

  const burdenTotal = cokePct+orePct+fluxPct
  const fmt=t=>`${String(Math.floor(t/3600)).padStart(2,'0')}:${String(Math.floor((t%3600)/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`

  return(
    <div style={{height:'100dvh',background:C.bg,color:C.text,fontFamily:'monospace',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{background:'#060a10',borderBottom:`1px solid ${C.border}`,padding:'0 12px',height:48,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:20}}>🏭</span>
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'0.04em'}}>BLAST FURNACE IRON MAKING MODEL</div>
            <div style={{fontSize:8,color:C.muted,letterSpacing:'0.1em'}}>PHYSICS-BASED REAL-TIME PLANT SIMULATION</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {[
            {l:'TIME',   v:fmt(elapsed),            c:running?C.success:C.muted},
            {l:'BF TEMP',v:`${bfTemp}°C`,           c:C.accent},
            {l:'HM TEMP',v:`${ironTemp}°C`,         c:'#FF6D00'},
            {l:'PROD',   v:`${productionRate}t/d`,  c:C.cyan},
            {l:'CO UTIL',v:`${gasUtilization}%`,    c:C.green},
            {l:'CASTS',  v:`${ironCasts}`,           c:'#9b5de5'},
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
          <button onClick={()=>{setRunning(v=>!v);if(!running){setElapsed(0);setIronCasts(0);setSlagCasts(0);setProductionRate(0);setResetCount(c=>c+1)}}}
            style={{padding:'6px 14px',borderRadius:4,border:`1px solid ${running?C.danger:C.success}`,background:running?'rgba(229,83,73,0.15)':'rgba(87,171,90,0.15)',color:running?C.danger:C.success,fontSize:11,fontWeight:700,cursor:'pointer',letterSpacing:'0.05em'}}>
            {running?'⏹ STOP':'▶ START'}
          </button>
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {panelOpen&&(
          <div style={{width:220,background:C.panel,borderRight:`1px solid ${C.border}`,overflow:'auto',flexShrink:0,padding:'12px'}}>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:12}}>BLAST PARAMETERS</div>
            <Slider label="Wind Rate" value={windRate} onChange={setWindRate} min={40} max={100} unit="%" color='#29B6F6'/>
            <Slider label="Hot Blast Temp" value={hotBlastTemp} onChange={setHotBlastTemp} min={800} max={1300} unit="°C" color='#FF7043'/>
            <div style={{height:1,background:C.border,margin:'10px 0'}}/>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:8}}>BURDEN MIX</div>
            <Slider label="Coke Rate" value={cokePct} onChange={v=>{setCokePct(v);setOrePct(clamp(100-v-fluxPct,0,100))}} min={10} max={25} unit="%" color='#37474F' disabled={running}/>
            <Slider label="Ore Rate" value={orePct} onChange={v=>{setOrePct(v);setFluxPct(clamp(100-v-cokePct,0,30))}} min={55} max={80} unit="%" color='#8D4E00' disabled={running}/>
            <Slider label="Flux Rate" value={fluxPct} onChange={setFluxPct} min={5} max={20} unit="%" color='#546E7A' disabled={running}/>
            <div style={{padding:'6px 8px',background:burdenTotal===100?'#0a2010':'#2a1000',borderRadius:4,border:`1px solid ${burdenTotal===100?C.success:C.danger}`,marginBottom:10}}>
              <div style={{fontSize:9,color:C.muted}}>BURDEN TOTAL</div>
              <div style={{fontSize:13,fontWeight:700,color:burdenTotal===100?C.success:C.danger}}>{burdenTotal}% {burdenTotal===100?'✓':'≠ 100%'}</div>
            </div>
            <div style={{height:1,background:C.border,margin:'10px 0'}}/>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:8}}>LIVE VALUES</div>
            {[
              {l:'BF Avg Temp',     v:`${bfTemp}°C`,          c:C.accent},
              {l:'Iron (HM) Temp',  v:`${ironTemp}°C`,        c:'#FF6D00'},
              {l:'Slag Temp',       v:`${slagTemp}°C`,        c:'#A5D6A7'},
              {l:'CO Utilization',  v:`${gasUtilization}%`,   c:C.green},
              {l:'Production',      v:`${productionRate}t/d`, c:C.cyan},
              {l:'Iron Casts',      v:`${ironCasts}`,          c:'#9b5de5'},
              {l:'Slag Casts',      v:`${slagCasts}`,          c:'#78909C'},
            ].map(r=>(
              <div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:9,color:C.muted}}>{r.l}</span>
                <span style={{fontSize:10,fontWeight:600,color:r.c}}>{r.v}</span>
              </div>
            ))}
            <div style={{height:1,background:C.border,margin:'10px 0'}}/>
            <div style={{fontSize:9,color:C.muted,marginBottom:6}}>PROCESS LEGEND</div>
            {[
              ['#FF6D00','Liquid iron (hot metal)'],['#A5D6A7','Liquid slag'],
              ['#29B6F6','Hot blast air'],['#57ab5a','Top gas (CO+CO₂)'],
              ['#FFD54F','Raceway combustion'],['#8D4E00','Iron ore burden'],
              ['#37474F','Coke burden'],['#546E7A','Limestone flux'],
            ].map(([c,l])=>(
              <div key={l} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
                <div style={{width:8,height:8,borderRadius:2,background:c,flexShrink:0}}/><span style={{fontSize:8,color:C.muted}}>{l}</span>
              </div>
            ))}
            <div style={{height:1,background:C.border,margin:'10px 0'}}/>
            <div style={{fontSize:9,color:'#4d7a9a',marginBottom:4}}>KEY REACTIONS</div>
            {['C + O₂ → CO₂  (tuyere)','CO₂ + C → 2CO  (bosh)','Fe₂O₃ + 3CO → 2Fe + 3CO₂','CaO + SiO₂ → CaSiO₃  (slag)'].map(r=>(
              <div key={r} style={{fontSize:8,color:C.muted,marginBottom:3}}>{r}</div>
            ))}
          </div>
        )}
        <div style={{flex:1,overflow:'hidden',background:'#06090f'}}>
          <BlastFurnaceCanvas
            running={running} windRate={windRate} cokePct={cokePct}
            orePct={orePct} fluxPct={fluxPct} hotBlastTemp={hotBlastTemp}
            setIronTemp={setIronTemp} setSlagTemp={setSlagTemp}
            setBfTemp={setBfTemp} setGasUtilization={setGasUtilization}
            setProductionRate={setProductionRate}
            onIronCast={()=>setIronCasts(v=>v+1)}
            onSlagCast={()=>setSlagCasts(v=>v+1)}
            doReset={resetCount}
          />
        </div>
      </div>
    </div>
  )
}
