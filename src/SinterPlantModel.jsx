import { useState, useEffect, useRef, useCallback } from 'react'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function heatColor(temp, min = 100, max = 1350) {
  const t = clamp((temp - min) / (max - min), 0, 1)
  if (t > 0.88) return `rgba(255,255,${Math.round((1-t)*6*255)},0.97)`
  if (t > 0.72) return `rgba(255,${Math.round(90+t*165)},0,0.95)`
  if (t > 0.52) return `rgba(${Math.round(210+t*45)},${Math.round(45+t*45)},0,0.92)`
  if (t > 0.30) return `rgba(${Math.round(120+t*90)},${Math.round(20+t*25)},0,0.87)`
  if (t > 0.10) return `rgba(${Math.round(50+t*80)},${Math.round(30+t*20)},${Math.round(60+t*20)},0.82)`
  return `rgba(30,40,75,0.75)`
}

// ─── CANVAS ───────────────────────────────────────────────────────────────────
function SinterCanvas({
  running, windBoxPres, bedDepth, returnFines, cokePct, speed,
  setIgnTemp, setBurntThrough, setProductionRate, setSinterTemp,
  onSinterCut, doReset
}) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const mouseRef  = useRef({ x:-999, y:-999 })
  const S = useRef({
    t:0, frame:0,
    // Mix bed on pallet cars (moving left→right on the strand)
    palletOffset: 0,
    // Burning front (moves downward through bed)
    burnFrontY: 0.08,       // 0=top of bed, 1=bottom (grate)
    burnTemp: 1280,
    btpReached: false,
    btpX: 0,                // X where BTP occurred
    // Segment temperatures (horizontal x, vertical y = depth)
    bedSegments: [],
    // Windboxes below pallet — suction draws air down through bed
    windBoxFlows: Array.from({length:14},(_,i)=>({suction:0.5+Math.random()*0.3, temp:200+i*40})),
    // Gas particles going DOWN into windbox (suction)
    suctionParticles: [],
    // Flame / ignition hood
    ignHoodActive: false, ignTemp: 0, ignParticles: [],
    // Exhaust gas from windbox main
    exhaustParticles: [],
    // Sinter product
    sinterBreaker: { x:0, breakerOn:false },
    sinterCoolerFill: 0,
    coolAirParticles: [],
    // Return fines conveyor
    returnFinesFlow: [],
    // Mixer drum
    mixerAngle: 0,
    // Raw mix bins
    rawBinLevels: [0.82, 0.75, 0.88, 0.70],
    // Sinter product cut pieces
    cutPieces: [],
    // Production
    totalProduced: 0, cutsMade: 0,
    // Emissions
    flueGas: [], dustParticles: [],
  })

  useEffect(() => {
    const el = canvasRef.current; if (!el) return
    const fit = () => {
      const w = el.parentElement ? el.parentElement.clientWidth : window.innerWidth
      const h = el.parentElement ? el.parentElement.clientHeight : window.innerHeight
      if (w > 0 && h > 0) { el.width = w; el.height = h }
    }
    fit(); const t1=setTimeout(fit,100), t2=setTimeout(fit,400)
    window.addEventListener('resize', fit)
    const onMove=(e)=>{const r=el.getBoundingClientRect();mouseRef.current={x:(e.clientX-r.left)*(el.width/r.width),y:(e.clientY-r.top)*(el.height/r.height)}}
    const onLeave=()=>{mouseRef.current={x:-999,y:-999}}
    el.addEventListener('mousemove',onMove); el.addEventListener('mouseleave',onLeave)
    el.addEventListener('touchmove',(e)=>{e.preventDefault();const tb=e.touches[0],r=el.getBoundingClientRect();mouseRef.current={x:(tb.clientX-r.left)*(el.width/r.width),y:(tb.clientY-r.top)*(el.height/r.height)}},{passive:false})
    el.addEventListener('touchend',onLeave)
    return ()=>{clearTimeout(t1);clearTimeout(t2);window.removeEventListener('resize',fit);el.removeEventListener('mousemove',onMove);el.removeEventListener('mouseleave',onLeave)}
  },[])

  useEffect(()=>{
    if(!doReset) return
    const sim=S.current
    Object.assign(sim,{
      t:0,frame:0,palletOffset:0,burnFrontY:0.08,burnTemp:1280,btpReached:false,btpX:0,
      bedSegments:[],windBoxFlows:Array.from({length:14},(_,i)=>({suction:0.5+Math.random()*0.3,temp:200+i*40})),
      suctionParticles:[],ignHoodActive:false,ignTemp:0,ignParticles:[],
      exhaustParticles:[],sinterBreaker:{x:0,breakerOn:false},
      sinterCoolerFill:0,coolAirParticles:[],returnFinesFlow:[],
      mixerAngle:0,rawBinLevels:[0.82,0.75,0.88,0.70],
      cutPieces:[],totalProduced:0,cutsMade:0,flueGas:[],dustParticles:[],
    })
  },[doReset])

  const draw = useCallback(()=>{
    const canvas=canvasRef.current
    if(!canvas){rafRef.current=requestAnimationFrame(draw);return}
    const ctx=canvas.getContext('2d')
    const W=canvas.width, H=canvas.height
    if(!W||!H||W<10||H<10){
      if(canvas.parentElement?.clientWidth>0){canvas.width=canvas.parentElement.clientWidth;canvas.height=canvas.parentElement.clientHeight}
      rafRef.current=requestAnimationFrame(draw);return
    }
    const sim=S.current
    sim.t+=0.016; sim.frame++

    try{
    // ── LAYOUT ────────────────────────────────────────────────────────────
    // Left→Right flow: Raw Mix Bins → Mixer → Sinter Strand → Breaker → Cooler → BF
    const STRAND_X0  = W*0.12  // start of pallet strand
    const STRAND_X1  = W*0.78  // end of strand (discharge)
    const STRAND_W   = STRAND_X1 - STRAND_X0
    const STRAND_Y0  = H*0.30  // top of sinter bed (surface)
    const STRAND_Y1  = H*0.58  // bottom of bed / top of windboxes
    const BED_H      = STRAND_Y1 - STRAND_Y0
    const GRATE_Y    = STRAND_Y1
    const WB_Y0      = STRAND_Y1
    const WB_Y1      = H*0.74
    const WB_H       = WB_Y1 - WB_Y0
    const N_WB       = 14      // number of windboxes
    const WB_W       = STRAND_W / N_WB
    const IGN_X0     = STRAND_X0 + STRAND_W*0.04
    const IGN_X1     = STRAND_X0 + STRAND_W*0.15
    const COOLER_X0  = STRAND_X1 + W*0.012
    const COOLER_X1  = W*0.96
    const COOLER_Y0  = H*0.28
    const COOLER_Y1  = H*0.62

    // ── PHYSICS ──────────────────────────────────────────────────────────
    if(running){
      const spd = speed * 0.4
      const wpn = windBoxPres / 100   // 0–1
      const bdn = bedDepth / 650      // 0–1
      const cke = cokePct / 5.5      // 0–1

      // Pallet movement (left to right)
      sim.palletOffset = (sim.palletOffset + spd * 0.8) % 48

      // Ignition hood
      sim.ignHoodActive = true
      sim.ignTemp = clamp(1050 + cke*150 + wpn*80 + (Math.random()-0.5)*25, 900, 1350)
      setIgnTemp(Math.round(sim.ignTemp))
      if(sim.frame%4===0){
        for(let px=IGN_X0+8;px<IGN_X1-8;px+=18){
          sim.ignParticles.push({x:px+(Math.random()-0.5)*12,y:STRAND_Y0-8,vy:-1.5-Math.random()*2.5,vx:(Math.random()-0.5)*1.2,life:1,r:3+Math.random()*4,col:Math.random()>0.4?'rgba(255,180,50,0.72)':'rgba(255,100,0,0.65)'})
        }
      }

      // Burn front moves DOWN through bed (governed by suction + coke)
      const burnSpeed = wpn * 0.00018 * cke * 1.2 * spd
      sim.burnFrontY = Math.min(1.0, sim.burnFrontY + burnSpeed)
      sim.burnTemp = clamp(1200 + cke*180 + wpn*120, 900, 1450)
      setSinterTemp(Math.round(sim.burnTemp))

      // BTP (burn-through point) when front reaches bottom
      if(sim.burnFrontY >= 0.98 && !sim.btpReached){
        sim.btpReached = true
        sim.btpX = STRAND_X0 + STRAND_W * 0.82
        setBurntThrough(true)
        sim.cutsMade++
        onSinterCut()
        sim.cutPieces.push({x:STRAND_X1+10,y:STRAND_Y0,w:W*0.04,h:BED_H,temp:900+Math.random()*150,vx:1.2+Math.random()})
      }

      // Production rate
      const prod = clamp(spd * bedDepth * (windBoxPres/80) * cke * 420, 0, 800)
      setProductionRate(Math.round(prod))

      // Windbox suction particles (air drawn DOWN through bed)
      sim.windBoxFlows = sim.windBoxFlows.map((wb,i)=>({
        suction: clamp(wpn * (0.7+Math.random()*0.3), 0.1, 1.0),
        temp: clamp(150 + i*(sim.burnFrontY*350) + (Math.random()-0.5)*30, 120, 520)
      }))
      if(sim.frame%2===0){
        const wx=STRAND_X0+Math.random()*STRAND_W
        sim.suctionParticles.push({x:wx,y:STRAND_Y0+Math.random()*BED_H*0.3,vy:1.2+Math.random()*2.5*wpn,vx:(Math.random()-0.5)*0.5,life:1,r:1.5+Math.random()*2.5,col:'rgba(100,160,220,0.42)'})
      }

      // Exhaust from windbox main → chimney
      if(sim.frame%5===0){
        sim.exhaustParticles.push({x:STRAND_X0-W*0.05,y:WB_Y1-8,vx:-1.2-Math.random(),vy:-0.8-Math.random()*1.5,life:1,r:3+Math.random()*5,col:'rgba(140,130,80,0.42)'})
      }

      // Sinter cooler — air blast upward through hot sinter
      if(sim.frame%4===0){
        sim.coolAirParticles.push({x:COOLER_X0+Math.random()*(COOLER_X1-COOLER_X0),y:COOLER_Y1-4,vy:-1.4-Math.random()*2.2,life:1,r:2+Math.random()*3,col:'rgba(100,190,240,0.42)'})
      }

      // Moving cut pieces on cooler
      sim.cutPieces=sim.cutPieces.map(p=>({...p,x:p.x+p.vx,temp:Math.max(120,p.temp-0.4)})).filter(p=>p.x<COOLER_X1+10)

      // Return fines
      if(sim.frame%6===0) sim.returnFinesFlow.push({x:COOLER_X1-10,y:COOLER_Y1+H*0.04,vx:-1.8-Math.random()*1.2,life:1,r:2+Math.random()*2.5,col:'rgba(140,110,60,0.65)'})

      // Mixer rotation
      sim.mixerAngle+=spd*0.06

      // Flue gas up chimney
      if(sim.frame%6===0) sim.flueGas.push({x:STRAND_X0-W*0.07,y:WB_Y1-12,vx:-0.5+Math.random()*0.5,vy:-2-Math.random()*2.5,life:1,r:3+Math.random()*6,col:`rgba(${110+Math.round(Math.random()*40)},${100+Math.round(Math.random()*30)},60,0.40)`})
    }

    // Advance all particles
    sim.ignParticles   =sim.ignParticles.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,r:p.r+0.2,life:p.life-0.025}))
    sim.suctionParticles=sim.suctionParticles.filter(p=>p.life>0&&p.y<GRATE_Y).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.018}))
    sim.exhaustParticles=sim.exhaustParticles.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.016}))
    sim.coolAirParticles=sim.coolAirParticles.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,life:p.life-0.020}))
    sim.returnFinesFlow =sim.returnFinesFlow.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,life:p.life-0.014}))
    sim.flueGas        =sim.flueGas.filter(p=>p.life>0).map(p=>({...p,x:p.x+p.vx,y:p.y+p.vy,r:p.r+0.3,life:p.life-0.015}))

    // ── DRAW ─────────────────────────────────────────────────────────────
    ctx.fillStyle='#06090f'; ctx.fillRect(0,0,W,H)
    ctx.strokeStyle='rgba(255,255,255,0.015)'; ctx.lineWidth=0.5
    for(let gx=0;gx<W;gx+=36){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke()}
    for(let gy=0;gy<H;gy+=36){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke()}

    const lbl=(t,x,y,c='#78909C',sz=9,al='center')=>{ctx.fillStyle=c;ctx.font=`${sz}px monospace`;ctx.textAlign=al;ctx.fillText(t,x,y)}
    const lblB=(t,x,y,c='#78909C',sz=9,al='center')=>{ctx.fillStyle=c;ctx.font=`bold ${sz}px monospace`;ctx.textAlign=al;ctx.fillText(t,x,y)}

    // ── RAW MIX BINS (far left) ────────────────────────────────────────────
    const BIN_LABELS=['ORE FINES','COKE','LIME','RETURN\nFINES']
    const BIN_COLS  =['rgba(140,55,15,0.85)','rgba(28,28,28,0.90)','rgba(200,205,185,0.82)','rgba(145,110,60,0.82)']
    const BIN_X0=W*0.01, BIN_W=W*0.022, BIN_H=H*0.14, BIN_Y0=H*0.08
    BIN_LABELS.forEach((name,i)=>{
      const bx=BIN_X0+i*(BIN_W+W*0.006)
      ctx.fillStyle='#1e2d3d'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1
      ctx.beginPath(); ctx.moveTo(bx,BIN_Y0); ctx.lineTo(bx+BIN_W,BIN_Y0)
      ctx.lineTo(bx+BIN_W-4,BIN_Y0+BIN_H); ctx.lineTo(bx+4,BIN_Y0+BIN_H); ctx.closePath()
      ctx.fill(); ctx.stroke()
      // Fill level
      const fl=sim.rawBinLevels[i]*BIN_H
      ctx.fillStyle=BIN_COLS[i]
      ctx.beginPath(); ctx.moveTo(bx+4+(1-sim.rawBinLevels[i])*4,BIN_Y0+BIN_H-fl)
      ctx.lineTo(bx+BIN_W-4-(1-sim.rawBinLevels[i])*4,BIN_Y0+BIN_H-fl)
      ctx.lineTo(bx+BIN_W-4,BIN_Y0+BIN_H); ctx.lineTo(bx+4,BIN_Y0+BIN_H); ctx.closePath(); ctx.fill()
      // Outlet pipe
      ctx.fillStyle='#0d1520'; ctx.fillRect(bx+BIN_W*0.3,BIN_Y0+BIN_H,BIN_W*0.4,H*0.03)
      lbl(i===3?'RET\nFINES':name.split('\n')[0],bx+BIN_W/2,BIN_Y0-4,running?BIN_COLS[i].replace('0.85','0.9').replace('0.90','0.9').replace('0.82','0.9'):'#37474F',clamp(W*0.009,6,8))
    })
    lbl('RAW MIX BINS',BIN_X0+(BIN_W*4+W*0.018)/2,BIN_Y0-14,'#2c4055',clamp(W*0.010,8,10))
    // Conveyor from bins to mixer
    ctx.strokeStyle='#1a2535'; ctx.lineWidth=4
    ctx.beginPath(); ctx.moveTo(BIN_X0+(BIN_W*4+W*0.018)/2,BIN_Y0+BIN_H+H*0.03); ctx.lineTo(W*0.10,H*0.26); ctx.stroke()
    if(running){
      const cg=ctx.createLinearGradient(BIN_X0,BIN_Y0+BIN_H+H*0.03,W*0.10,H*0.26)
      cg.addColorStop(0,'rgba(140,110,60,0.55)'); cg.addColorStop(1,'rgba(140,110,60,0.20)')
      ctx.strokeStyle=cg; ctx.lineWidth=6
      ctx.beginPath(); ctx.moveTo(BIN_X0+(BIN_W*4+W*0.018)/2,BIN_Y0+BIN_H+H*0.03); ctx.lineTo(W*0.10,H*0.26); ctx.stroke()
    }

    // ── MIXER DRUM ────────────────────────────────────────────────────────
    const MX=W*0.10, MY=H*0.265, MR=W*0.025
    ctx.fillStyle='#1e2d3d'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
    ctx.beginPath(); ctx.ellipse(MX,MY,MR,MR*0.55,0,0,Math.PI*2); ctx.fill(); ctx.stroke()
    // Rotating mixer blades
    if(running){
      ctx.save(); ctx.translate(MX,MY)
      ctx.rotate(sim.mixerAngle)
      ctx.strokeStyle='rgba(140,110,60,0.5)'; ctx.lineWidth=2
      ;[0,1,2,3].forEach(k=>{const a=k*Math.PI/2; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*MR*0.85,Math.sin(a)*MR*0.45); ctx.stroke()})
      ctx.restore()
    }
    lblB('MIXER',MX,MY+MR*0.55+12,'#546E7A',clamp(W*0.009,7,9))
    // Mixer to strand conveyor
    ctx.strokeStyle='#1a2535'; ctx.lineWidth=5
    ctx.beginPath(); ctx.moveTo(MX+MR,MY); ctx.lineTo(STRAND_X0,STRAND_Y0-H*0.025); ctx.stroke()
    if(running){
      const mg=ctx.createLinearGradient(MX+MR,MY,STRAND_X0,STRAND_Y0)
      mg.addColorStop(0,'rgba(140,110,60,0.6)'); mg.addColorStop(1,'rgba(140,110,60,0.2)')
      ctx.strokeStyle=mg; ctx.lineWidth=8
      ctx.beginPath(); ctx.moveTo(MX+MR,MY); ctx.lineTo(STRAND_X0,STRAND_Y0-H*0.025); ctx.stroke()
    }

    // ── WINDBOX MAIN (below strand) ───────────────────────────────────────
    // Main duct running full strand length below windboxes
    ctx.fillStyle='#0d1520'; ctx.strokeStyle='#1a2535'; ctx.lineWidth=1.5
    ctx.fillRect(STRAND_X0-4, WB_Y1-4, STRAND_W+8, H*0.04); ctx.strokeRect(STRAND_X0-4,WB_Y1-4,STRAND_W+8,H*0.04)
    lblB('WINDBOX MAIN DUCT → ESP → CHIMNEY',STRAND_X0+STRAND_W*0.4,WB_Y1+H*0.028,'#1e3040',clamp(W*0.009,7,9))

    // ── WINDBOXES ─────────────────────────────────────────────────────────
    for(let wi=0;wi<N_WB;wi++){
      const wx=STRAND_X0+wi*WB_W, wt=sim.windBoxFlows[wi].temp
      // Windbox chamber
      ctx.fillStyle=running?heatColor(wt,100,520).replace('0.82','0.30').replace('0.87','0.28').replace('0.92','0.25').replace('0.95','0.22').replace('0.97','0.20'):'rgba(10,18,30,0.8)'
      ctx.fillRect(wx+1,WB_Y0,WB_W-2,WB_H-4)
      ctx.strokeStyle=running?heatColor(wt,100,520):'#1a2535'; ctx.lineWidth=0.7; ctx.strokeRect(wx+1,WB_Y0,WB_W-2,WB_H-4)
      // Suction valve indicator
      const sv=sim.windBoxFlows[wi].suction
      ctx.fillStyle=running?`rgba(41,182,246,${sv*0.5})`:'rgba(20,40,60,0.3)'
      ctx.fillRect(wx+WB_W*0.1,WB_Y0+WB_H*0.1,WB_W*0.8,WB_H*0.12)
      // Temp label on alternate boxes
      if(wi%3===0&&running) lbl(`${Math.round(wt)}°`,wx+WB_W/2,WB_Y0+WB_H*0.58,heatColor(wt,100,520),clamp(W*0.007,5,7))
      // Box number
      lbl(`W${wi+1}`,wx+WB_W/2,WB_Y1+H*0.018,'#1e3040',clamp(W*0.007,5,7))
    }
    lbl('WINDBOXES (DOWNDRAFT SUCTION)',STRAND_X0+STRAND_W/2,WB_Y0-6,'#1e3040',clamp(W*0.009,7,9))
    // Suction pressure arrows
    if(running){
      for(let wi=0;wi<N_WB;wi+=3){
        const wx=STRAND_X0+wi*WB_W+WB_W/2
        ctx.strokeStyle='rgba(41,182,246,0.25)'; ctx.lineWidth=1; ctx.setLineDash([2,3])
        ctx.beginPath(); ctx.moveTo(wx,STRAND_Y0+BED_H*0.3); ctx.lineTo(wx,WB_Y1-6); ctx.stroke()
        ctx.setLineDash([])
        // Downward arrow
        ctx.fillStyle='rgba(41,182,246,0.25)'
        ctx.beginPath(); ctx.moveTo(wx,WB_Y1-4); ctx.lineTo(wx-4,WB_Y1-12); ctx.lineTo(wx+4,WB_Y1-12); ctx.closePath(); ctx.fill()
      }
    }

    // ── SINTER STRAND BED (the heart of the process) ──────────────────────
    // Pallet car grate (bottom horizontal lines moving left→right)
    ctx.fillStyle='#0d1822'; ctx.fillRect(STRAND_X0,STRAND_Y0,STRAND_W,BED_H)
    // Grate bars
    for(let px=STRAND_X0+(sim.palletOffset%48);px<STRAND_X1;px+=48){
      ctx.fillStyle='#1a2535'; ctx.fillRect(px,GRATE_Y-6,44,6)
      // Pallet car wheels
      ;[px+6,px+38].forEach(wx2=>{
        ctx.fillStyle='#1e2d3d'; ctx.beginPath(); ctx.arc(wx2,GRATE_Y+8,6,0,Math.PI*2); ctx.fill()
        ctx.strokeStyle='#2c4055'; ctx.lineWidth=0.8; ctx.stroke()
      })
    }
    // Pallet car track rail
    ctx.fillStyle='#1a2535'; ctx.fillRect(STRAND_X0,GRATE_Y+12,STRAND_W,4)

    // Bed layers with temperature heat map (horizontal scan + vertical burning front)
    const burnFY = sim.burnFrontY  // 0=top, 1=bottom
    for(let px=STRAND_X0;px<STRAND_X1;px+=3){
      const xFrac=(px-STRAND_X0)/STRAND_W
      // How far has the burn progressed at this X position?
      // Burn front progresses from left (after ignition) to right
      const burnProgress=xFrac<0.04?0:xFrac<0.14?0:(xFrac-0.14)/0.86
      const localBurnY = Math.min(burnFY, burnProgress*0.95+0.05)

      for(let py=STRAND_Y0;py<STRAND_Y1;py+=4){
        const yFrac=(py-STRAND_Y0)/BED_H
        let temp
        if(yFrac<localBurnY-0.08){
          // Burnt zone — sinter formed (dark red-grey, cooling)
          temp=300+localBurnY*600*(1-yFrac)
        } else if(yFrac>=localBurnY-0.08&&yFrac<=localBurnY+0.05){
          // Active combustion zone — hottest
          temp=sim.burnTemp*(0.8+0.2*Math.sin(sim.t*5+px*0.1))
        } else if(yFrac>localBurnY+0.05&&yFrac<localBurnY+0.25){
          // Pre-heat zone
          temp=400+localBurnY*400
        } else {
          // Raw mix (cold)
          temp=80+yFrac*100
        }
        ctx.fillStyle=heatColor(temp,80,1400)
        ctx.fillRect(px,py,3,4)
      }
    }

    // Burning front line (the combustion zone boundary)
    if(running&&sim.burnFrontY>0.05){
      const bfY=STRAND_Y0+BED_H*sim.burnFrontY
      ctx.strokeStyle=`rgba(255,${180+Math.round(50*Math.sin(sim.t*6))},0,0.65)`; ctx.lineWidth=2; ctx.setLineDash([4,4])
      ctx.beginPath(); ctx.moveTo(STRAND_X0+STRAND_W*0.14,bfY); ctx.lineTo(STRAND_X1,bfY); ctx.stroke()
      ctx.setLineDash([])
      lbl('BURNING FRONT',STRAND_X0+STRAND_W*0.50,bfY-7,'rgba(255,180,0,0.55)',clamp(W*0.009,7,9))
    }

    // Burnt-through point marker
    if(sim.btpReached){
      ctx.strokeStyle='rgba(255,220,0,0.55)'; ctx.lineWidth=2
      ctx.beginPath(); ctx.moveTo(sim.btpX,STRAND_Y0); ctx.lineTo(sim.btpX,STRAND_Y1); ctx.stroke()
      lblB('BTP',sim.btpX,STRAND_Y0-8,'#FFD54F',clamp(W*0.010,8,10))
      lbl('Burn-Through',sim.btpX,STRAND_Y0-18,'rgba(255,213,79,0.5)',clamp(W*0.009,7,8))
    }

    // Sinter strand outer frame
    ctx.strokeStyle='#2c4055'; ctx.lineWidth=2; ctx.strokeRect(STRAND_X0,STRAND_Y0,STRAND_W,BED_H)
    // Bed depth marker
    ctx.strokeStyle='rgba(0,188,212,0.30)'; ctx.lineWidth=1.2; ctx.setLineDash([3,3])
    ctx.beginPath(); ctx.moveTo(STRAND_X1+6,STRAND_Y0); ctx.lineTo(STRAND_X1+6,STRAND_Y1); ctx.stroke(); ctx.setLineDash([])
    lbl(`${bedDepth}mm`,STRAND_X1+10,STRAND_Y0+BED_H/2,'rgba(0,188,212,0.45)',clamp(W*0.009,7,9),'left')
    lblB('SINTER STRAND',STRAND_X0+STRAND_W/2,STRAND_Y0-24,'#546E7A',clamp(W*0.012,9,13))
    lbl(`Bed ${bedDepth}mm  Speed ${speed.toFixed(1)}m/min  Coke ${cokePct}%`,STRAND_X0+STRAND_W/2,STRAND_Y0-10,'#37474F',clamp(W*0.009,7,9))

    // ── IGNITION HOOD ─────────────────────────────────────────────────────
    const IGN_Y0=STRAND_Y0-H*0.10, IGN_H=H*0.10
    ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
    ctx.beginPath()
    ctx.moveTo(IGN_X0-4,STRAND_Y0); ctx.lineTo(IGN_X0-4,IGN_Y0+4)
    ctx.lineTo(IGN_X0+4,IGN_Y0); ctx.lineTo(IGN_X1-4,IGN_Y0)
    ctx.lineTo(IGN_X1+4,IGN_Y0+4); ctx.lineTo(IGN_X1+4,STRAND_Y0); ctx.closePath()
    ctx.fill(); ctx.stroke()
    // Flames inside hood
    if(running){
      for(let fx=IGN_X0+8;fx<IGN_X1-8;fx+=12){
        const fr=3+2.5*Math.sin(sim.t*10+fx*0.5)
        const fg=ctx.createRadialGradient(fx,STRAND_Y0-4,0,fx,STRAND_Y0-4,fr*2.5)
        fg.addColorStop(0,'rgba(255,255,100,0.85)'); fg.addColorStop(0.4,'rgba(255,120,0,0.65)'); fg.addColorStop(1,'rgba(255,50,0,0)')
        ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(fx,STRAND_Y0-4,fr*2.5,0,Math.PI*2); ctx.fill()
      }
    }
    // Ignition particles
    sim.ignParticles.forEach(p=>{ctx.globalAlpha=p.life*0.70;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1
    // Gas burner pipes
    ;[IGN_X0+W*0.014,IGN_X0+W*0.028].forEach(gpx=>{
      ctx.fillStyle='#1a3040'; ctx.fillRect(gpx-3,IGN_Y0-H*0.04,6,H*0.04)
      ctx.fillStyle=running?'#FF6D00':'#1e2d3d'; ctx.beginPath(); ctx.arc(gpx,IGN_Y0,5,0,Math.PI*2); ctx.fill()
    })
    lblB('IGNITION HOOD',IGN_X0+(IGN_X1-IGN_X0)/2,IGN_Y0-H*0.05,'#FF7043',clamp(W*0.009,7,10))
    lbl(`${Math.round(sim.ignTemp)}°C  COG burners`,IGN_X0+(IGN_X1-IGN_X0)/2,IGN_Y0-H*0.02,running?'#FF8F00':'#37474F',clamp(W*0.009,7,9))

    // Suction particles
    sim.suctionParticles.forEach(p=>{ctx.globalAlpha=p.life*0.48;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1

    // ── SINTER BREAKER ────────────────────────────────────────────────────
    const BRKR_X=STRAND_X1, BRKR_Y=STRAND_Y0
    ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
    ctx.fillRect(BRKR_X,BRKR_Y-H*0.03,W*0.014,BED_H+H*0.05); ctx.strokeRect(BRKR_X,BRKR_Y-H*0.03,W*0.014,BED_H+H*0.05)
    if(running){
      const teeth=4
      for(let ti=0;ti<teeth;ti++){
        const ty=BRKR_Y+ti*(BED_H/teeth)+(sim.t*80%12)
        ctx.fillStyle='#FF7043'; ctx.fillRect(BRKR_X-4,ty,W*0.014+8,5)
      }
    }
    lblB('SINTER\nBREAKER',BRKR_X+W*0.007,BRKR_Y-H*0.05,'#FF7043',clamp(W*0.009,7,9))

    // Hot sinter drop onto screen/cooler
    if(running&&sim.cutPieces.length===0&&sim.btpReached){
      ctx.fillStyle='rgba(255,100,0,0.45)'
      ctx.fillRect(BRKR_X+W*0.014,STRAND_Y0,W*0.006,BED_H)
    }

    // ── SINTER COOLER ─────────────────────────────────────────────────────
    ctx.fillStyle='#0f1825'; ctx.strokeStyle='#1e2d3d'; ctx.lineWidth=1.5
    ctx.fillRect(COOLER_X0,COOLER_Y0,COOLER_X1-COOLER_X0,COOLER_Y1-COOLER_Y0)
    ctx.strokeRect(COOLER_X0,COOLER_Y0,COOLER_X1-COOLER_X0,COOLER_Y1-COOLER_Y0)
    // Cooler belt movement
    const coolW=COOLER_X1-COOLER_X0
    for(let cx=COOLER_X0+(sim.palletOffset*0.5%32);cx<COOLER_X1;cx+=32){
      ctx.strokeStyle='#1a2535'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(cx,COOLER_Y0); ctx.lineTo(cx,COOLER_Y1); ctx.stroke()
    }
    // Sinter in cooler (heat map)
    if(sim.cutPieces.length>0||sim.btpReached){
      for(let cx2=COOLER_X0+4;cx2<COOLER_X1-4;cx2+=4){
        const tempFrac=(cx2-COOLER_X0)/coolW
        const sinTemp=clamp(850-tempFrac*650,100,900)
        ctx.fillStyle=heatColor(sinTemp,80,900); ctx.fillRect(cx2,COOLER_Y0+4,4,COOLER_Y1-COOLER_Y0-8)
      }
    }
    // Cool air rising (bottom to top)
    sim.coolAirParticles.forEach(p=>{ctx.globalAlpha=p.life*0.42;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1
    // Cool air intake (bottom)
    ctx.fillStyle='#1a2535'; ctx.fillRect(COOLER_X0,COOLER_Y1,coolW,H*0.025); ctx.strokeStyle='#2c4055'; ctx.lineWidth=1; ctx.strokeRect(COOLER_X0,COOLER_Y1,coolW,H*0.025)
    for(let ax=COOLER_X0+8;ax<COOLER_X1-4;ax+=20){
      ctx.fillStyle=running?'rgba(100,190,240,0.28)':'#0d1520'; ctx.fillRect(ax,COOLER_Y1,14,H*0.025)
    }
    lblB('SINTER COOLER',COOLER_X0+coolW/2,COOLER_Y0-8,'#39c5cf',clamp(W*0.010,8,10))
    lbl('↑ COOL AIR BLAST',COOLER_X0+coolW/2,COOLER_Y1+H*0.035,running?'rgba(100,190,240,0.5)':'#1e3040',clamp(W*0.009,7,9))
    lbl('→ TO BLAST FURNACE',COOLER_X1+6,COOLER_Y0+COOLER_Y1/2*0.5,'#57ab5a',clamp(W*0.009,7,9),'left')

    // ── RETURN FINES CONVEYOR ──────────────────────────────────────────────
    const RFY=COOLER_Y1+H*0.04
    ctx.strokeStyle='#1a2535'; ctx.lineWidth=4
    ctx.beginPath(); ctx.moveTo(COOLER_X1-10,RFY); ctx.lineTo(STRAND_X0+STRAND_W*0.18,RFY+H*0.02); ctx.stroke()
    if(running){
      const rfg=ctx.createLinearGradient(COOLER_X1,RFY,STRAND_X0,RFY)
      rfg.addColorStop(0,'rgba(145,110,60,0.6)'); rfg.addColorStop(1,'rgba(145,110,60,0.2)')
      ctx.strokeStyle=rfg; ctx.lineWidth=6
      ctx.beginPath(); ctx.moveTo(COOLER_X1-10,RFY); ctx.lineTo(STRAND_X0+STRAND_W*0.18,RFY+H*0.02); ctx.stroke()
    }
    sim.returnFinesFlow.forEach(p=>{ctx.globalAlpha=p.life*0.68;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,RFY+H*0.01,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1
    lbl(`← RETURN FINES ${returnFines}%`,STRAND_X0+STRAND_W*0.40,RFY-4,running?'rgba(145,110,60,0.55)':'#1e3040',clamp(W*0.009,7,9))

    // ── EXHAUST & CHIMNEY ──────────────────────────────────────────────────
    const CHX=STRAND_X0-W*0.06, CHY0=H*0.04, CHH=WB_Y1-H*0.04
    ctx.fillStyle='#1a2535'; ctx.strokeStyle='#2c4055'; ctx.lineWidth=1.5
    ctx.fillRect(CHX-8,CHY0,16,CHH); ctx.strokeRect(CHX-8,CHY0,16,CHH)
    ctx.fillStyle='rgba(80,80,80,0.3)'; ctx.fillRect(CHX-10,CHY0-4,20,8)
    sim.flueGas.forEach(p=>{ctx.globalAlpha=p.life*0.38;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1
    sim.exhaustParticles.forEach(p=>{ctx.globalAlpha=p.life*0.42;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1
    lbl('ESP',CHX,CHY0+CHH*0.55,'#1e3040',clamp(W*0.009,7,8))
    lbl('CHIMNEY',CHX,CHY0-8,'#2c4055',clamp(W*0.009,7,9))
    // Main duct from windboxes to chimney
    ctx.strokeStyle='#1a2535'; ctx.lineWidth=8
    ctx.beginPath(); ctx.moveTo(STRAND_X0,WB_Y1+H*0.02); ctx.lineTo(CHX,WB_Y1+H*0.02); ctx.lineTo(CHX,CHH); ctx.stroke()

    // ── STATUS STRIP ──────────────────────────────────────────────────────
    ctx.fillStyle='rgba(4,8,18,0.82)'; ctx.fillRect(0,0,W,H*0.028)
    ;[
      {l:'IGN TEMP',   v:`${Math.round(sim.ignTemp)}°C`,    c:'#FF7043'},
      {l:'BURN TEMP',  v:`${Math.round(sim.burnTemp)}°C`,   c:heatColor(sim.burnTemp,900,1400)},
      {l:'BURN FRONT', v:`${(sim.burnFrontY*100).toFixed(0)}%`,c:'#FF8F00'},
      {l:'WB PRES',    v:`${windBoxPres} mmWC`,             c:'#29B6F6'},
      {l:'BTP',        v:sim.btpReached?'REACHED ✓':'PENDING',c:sim.btpReached?'#57ab5a':'#546E7A'},
      {l:'STATUS',     v:running?'OPERATING ●':'STANDBY ○', c:running?'#57ab5a':'#546E7A'},
    ].forEach(({l,v,c},ki)=>{
      const px=W*0.01+ki*W*0.165
      ctx.fillStyle='#4d7a9a'; ctx.font=`${clamp(W*0.009,6,9)}px monospace`; ctx.textAlign='left'; ctx.fillText(l,px,H*0.012)
      ctx.fillStyle=c; ctx.font=`bold ${clamp(W*0.010,7,10)}px monospace`; ctx.fillText(v,px,H*0.023)
    })

    // ── HUD ───────────────────────────────────────────────────────────────
    const HX=W*0.01,HY=H*0.78,HW=W*0.10,RH=24
    ctx.fillStyle='rgba(4,8,18,0.88)'; ctx.fillRect(HX,HY,HW,RH*10+14)
    ctx.strokeStyle='#1a3050'; ctx.lineWidth=0.8; ctx.strokeRect(HX,HY,HW,RH*10+14)
    lblB('SINTER MONITOR',HX+HW/2,HY+14,'#3d6a8a',clamp(W*0.010,8,11))
    const hudRows=[
      ['IGN TEMP',    `${Math.round(sim.ignTemp)}°C`,               '#FF7043'],
      ['BURN TEMP',   `${Math.round(sim.burnTemp)}°C`,              heatColor(sim.burnTemp,900,1400)],
      ['BURN FRONT',  `${(sim.burnFrontY*100).toFixed(0)}%`,        '#FF8F00'],
      ['WB PRESSURE', `${windBoxPres} mmWC`,                        '#29B6F6'],
      ['BED DEPTH',   `${bedDepth} mm`,                             '#78909C'],
      ['STRAND SPD',  `${speed.toFixed(1)} m/min`,                  '#9b5de5'],
      ['COKE RATE',   `${cokePct} %`,                               '#FFB300'],
      ['RETURN FINES',`${returnFines} %`,                           '#8D6E63'],
      ['BTP',         sim.btpReached?'REACHED ✓':'PENDING',         sim.btpReached?'#57ab5a':'#546E7A'],
      ['STATUS',      running?'OPERATING ●':'STANDBY ○',            running?'#57ab5a':'#546E7A'],
    ]
    hudRows.forEach(([l,v,c],i)=>{
      const ry=HY+18+i*RH
      ctx.fillStyle='#0a1422'; ctx.fillRect(HX+2,ry,HW-4,RH-2)
      ctx.strokeStyle='#1a3050'; ctx.lineWidth=0.3; ctx.strokeRect(HX+2,ry,HW-4,RH-2)
      ctx.fillStyle='#4d7a9a'; ctx.font=`${clamp(W*0.009,7,9)}px monospace`; ctx.textAlign='left'; ctx.fillText(l,HX+5,ry+11)
      ctx.fillStyle=c; ctx.font=`bold ${clamp(W*0.010,8,10)}px monospace`; ctx.textAlign='right'; ctx.fillText(v,HX+HW-4,ry+RH-5)
    })

    // ── HOVER TOOLTIPS ────────────────────────────────────────────────────
    const mx=mouseRef.current.x, my=mouseRef.current.y
    let tooltip=null

    // Hit: sinter bed zones
    if(!tooltip&&mx>=STRAND_X0&&mx<=STRAND_X1&&my>=STRAND_Y0&&my<=STRAND_Y1){
      const xFrac=(mx-STRAND_X0)/STRAND_W
      const yFrac=(my-STRAND_Y0)/BED_H
      const burnP=Math.min(sim.burnFrontY,(xFrac-0.14)/0.86*0.95+0.05)
      const isBurnt=yFrac<burnP-0.08
      const isActive=yFrac>=burnP-0.08&&yFrac<=burnP+0.05
      const isPreheat=yFrac>burnP+0.05&&yFrac<burnP+0.25
      const zone=isActive?'COMBUSTION ZONE':isBurnt?'SINTER ZONE (BURNT)':isPreheat?'PRE-HEAT ZONE':'RAW MIX ZONE'
      const zoneCol=isActive?'#FF5722':isBurnt?'#FF8F00':isPreheat?'#FFB300':'#78909C'
      const zoneTemp=isActive?Math.round(sim.burnTemp):isBurnt?Math.round(300+burnP*600):isPreheat?Math.round(400+burnP*400):Math.round(80+yFrac*100)
      tooltip={title:`BED — ${zone}`,color:zoneCol,lines:[
        {label:'Zone temp',value:`~${zoneTemp} °C`,col:heatColor(zoneTemp,80,1400)},
        {label:'Depth in bed',value:`${Math.round(yFrac*bedDepth)} / ${bedDepth} mm`,col:'#78909C'},
        {label:'Position on strand',value:`${Math.round(xFrac*100)}% of length`,col:'#546E7A'},
        ...(isActive?[
          {label:'Reaction',value:'Coke + O₂ → CO₂ + heat',col:'#8BC34A'},
          {label:'Binder',value:'CaO + SiO₂ → liquid slag bonds',col:'#FFB300'},
          {label:'Temp range',value:'1200 – 1350°C',col:'#FF5722'},
        ]:[]),
        ...(isBurnt?[
          {label:'Structure',value:'Sinter cake — fused ore particles',col:'rgba(180,200,210,0.9)'},
          {label:'Cooling',value:'Air drawn up through burnt zone',col:'#29B6F6'},
        ]:[]),
        ...(isPreheat?[
          {label:'Process',value:'Moisture evap + ore heat-up',col:'rgba(180,200,210,0.9)'},
        ]:[]),
      ]}
    }

    // Hit: ignition hood
    if(!tooltip&&mx>=IGN_X0-5&&mx<=IGN_X1+5&&my>=IGN_Y0&&my<=STRAND_Y0){
      tooltip={title:'IGNITION HOOD',color:'#FF7043',lines:[
        {label:'Temperature',value:`${Math.round(sim.ignTemp)} °C`,col:'#FF6D00'},
        {label:'Fuel',value:'Coke Oven Gas (COG)',col:'#FFB300'},
        {label:'Purpose',value:'Ignites coke in top 10–20mm of bed',col:'rgba(180,200,210,0.9)'},
        {label:'Length',value:'~1.5–2.5m hood length',col:'#78909C'},
        {label:'After hood',value:'Suction alone sustains combustion',col:'rgba(180,200,210,0.9)'},
      ]}
    }

    // Hit: windboxes
    if(!tooltip&&mx>=STRAND_X0&&mx<=STRAND_X1&&my>=WB_Y0&&my<=WB_Y1){
      const wi=Math.floor((mx-STRAND_X0)/WB_W)
      if(wi>=0&&wi<N_WB){
        const wb=sim.windBoxFlows[wi]
        tooltip={title:`WINDBOX W${wi+1}`,color:'#29B6F6',lines:[
          {label:'Exhaust temp',value:`${Math.round(wb.temp)} °C`,col:heatColor(wb.temp,100,520)},
          {label:'Suction',value:`${(wb.suction*100).toFixed(0)}% of ${windBoxPres} mmWC`,col:'#29B6F6'},
          {label:'Function',value:'Draws air DOWN through bed',col:'rgba(180,200,210,0.9)'},
          {label:'Gas',value:'CO₂ + N₂ + H₂O from combustion',col:'#8BC34A'},
          {label:'Note',value:wi<3?'Early — moisture evap zone':wi<8?'Mid — main combustion zone':'Late — cooling zone',col:'#78909C'},
        ]}
      }
    }

    // Hit: sinter breaker
    if(!tooltip&&mx>=BRKR_X&&mx<=BRKR_X+W*0.015&&my>=BRKR_Y-H*0.03&&my<=STRAND_Y1+H*0.04){
      tooltip={title:'SINTER BREAKER',color:'#FF7043',lines:[
        {label:'Function',value:'Breaks sinter cake to <150mm',col:'rgba(180,200,210,0.9)'},
        {label:'Type',value:'Star wheel / gyratory crusher',col:'#78909C'},
        {label:'Product temp',value:`~${Math.round(sim.burnTemp*0.7)}°C at discharge`,col:'#FF8F00'},
        {label:'After',value:'Hot sinter → cooler conveyor',col:'rgba(180,200,210,0.9)'},
      ]}
    }

    // Hit: cooler
    if(!tooltip&&mx>=COOLER_X0&&mx<=COOLER_X1&&my>=COOLER_Y0&&my<=COOLER_Y1){
      const coolFrac=(mx-COOLER_X0)/(COOLER_X1-COOLER_X0)
      const coolTemp=Math.round(850-coolFrac*700)
      tooltip={title:'SINTER COOLER',color:'#39c5cf',lines:[
        {label:'Type',value:'Circular / linear cold air cooler',col:'rgba(180,200,210,0.9)'},
        {label:'Inlet temp',value:`~850°C (from breaker)`,col:'#FF8F00'},
        {label:'At this point',value:`~${coolTemp}°C`,col:heatColor(coolTemp,80,900)},
        {label:'Outlet temp',value:'<120°C to blast furnace',col:'#57ab5a'},
        {label:'Cooling by',value:'Ambient air blast through bed',col:'#29B6F6'},
        {label:'Hot air',value:'Recovered → ignition hood or AHP',col:'#FFB300'},
      ]}
    }

    // Hit: raw mix bins
    if(!tooltip&&mx>=BIN_X0&&mx<=BIN_X0+(BIN_W*4+W*0.018)&&my>=BIN_Y0&&my<=BIN_Y0+BIN_H){
      const bi=Math.floor((mx-BIN_X0)/(BIN_W+W*0.006))
      if(bi>=0&&bi<4){
        const binInfo=[
          {name:'Iron Ore Fines',comp:'Fe 60–65%, SiO₂ 4–6%',size:'<6mm',note:'Main iron bearing material'},
          {name:'Metallurgical Coke',comp:'C>88%, Ash<12%',size:'<3mm (breeze)',note:'Fuel — provides heat for sintering'},
          {name:'Limestone/Lime',comp:'CaO 50–55%',size:'<3mm',note:'Flux — improves basicity and softening'},
          {name:'Return Sinter Fines',comp:'Fe 55–60%',size:'<6mm',note:'Recycles <10mm undersize sinter'},
        ]
        const inf=binInfo[bi]
        tooltip={title:`${BIN_LABELS[bi]} BIN`,color:BIN_COLS[bi].replace('0.85','0.9').replace('0.90','0.9').replace('0.82','0.9'),lines:[
          {label:'Material',value:inf.name,col:'rgba(200,215,225,0.9)'},
          {label:'Composition',value:inf.comp,col:'rgba(180,200,210,0.9)'},
          {label:'Size',value:inf.size,col:'#78909C'},
          {label:'Level',value:`${(sim.rawBinLevels[bi]*100).toFixed(0)}%`,col:BIN_COLS[bi]},
          {label:'Role',value:inf.note,col:'rgba(170,195,215,0.8)'},
        ]}
      }
    }

    // Draw tooltip
    if(tooltip){
      const TW=clamp(W*0.30,260,380); const lineH=25,pad=16
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
        ctx.fillStyle=line.col; ctx.font=`bold ${clamp(W*0.012,10,13)}px monospace`; ctx.textAlign='right'; ctx.fillText(line.value.length>28?line.value.substring(0,26)+'…':line.value,tx+TW-pad,ly)
      })
      ctx.fillStyle=tooltip.color; ctx.beginPath(); ctx.arc(mx,my,4,0,Math.PI*2); ctx.fill()
      ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1; ctx.stroke()
    }

    // Footer
    ctx.fillStyle='rgba(4,8,18,0.92)'; ctx.fillRect(0,H-18,W,18)
    ctx.fillStyle='#2c4055'; ctx.font=`${clamp(W*0.009,7,10)}px monospace`; ctx.textAlign='left'
    ctx.fillText(`SINTER PLANT  |  BED:${bedDepth}mm  SPEED:${speed.toFixed(1)}m/m  WB:${windBoxPres}mmWC  COKE:${cokePct}%  RF:${returnFines}%  |  ${new Date().toLocaleTimeString()}`,8,H-4)

    }catch(e){
      ctx.fillStyle='#06090f'; ctx.fillRect(0,0,W,H)
      ctx.fillStyle='#e5534b'; ctx.font='14px monospace'; ctx.textAlign='left'
      ctx.fillText('ERROR: '+e.message,20,40); console.error('SinterPlant:',e)
    }
    rafRef.current=requestAnimationFrame(draw)
  },[running,windBoxPres,bedDepth,returnFines,cokePct,speed])

  useEffect(()=>{rafRef.current=requestAnimationFrame(draw);return()=>cancelAnimationFrame(rafRef.current)},[draw])
  return <canvas ref={canvasRef} style={{width:'100%',height:'100%',display:'block'}}/>
}

// ─── UI ──────────────────────────────────────────────────────────────────────
const C={bg:'#07090f',panel:'#0b1220',border:'#1a2d45',text:'#cdd9e5',muted:'#6e8098',accent:'#FF8F00',success:'#57ab5a',danger:'#e5534b',cyan:'#39c5cf'}

function Slider({label,value,onChange,min,max,step=1,unit,disabled,color}){
  return(<div style={{marginBottom:12}}>
    <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span style={{fontSize:10,color:C.muted,textTransform:'uppercase',letterSpacing:'0.07em'}}>{label}</span><span style={{fontSize:11,color:color||C.accent,fontFamily:'monospace',fontWeight:700}}>{value}{unit}</span></div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)} disabled={disabled} style={{width:'100%',accentColor:color||C.accent,opacity:disabled?0.4:1,cursor:disabled?'not-allowed':'pointer',height:20}}/>
  </div>)
}

export default function SinterPlantModel(){
  const [running,setRunning]         = useState(false)
  const [windBoxPres,setWindBoxPres] = useState(1400)
  const [bedDepth,setBedDepth]       = useState(550)
  const [returnFines,setReturnFines] = useState(25)
  const [cokePct,setCokePct]         = useState(4.8)
  const [speed,setSpeed]             = useState(1.8)
  const [elapsed,setElapsed]         = useState(0)
  const [ignTemp,setIgnTemp]         = useState(1100)
  const [burntThrough,setBurntThrough]= useState(false)
  const [productionRate,setProductionRate]=useState(0)
  const [sinterTemp,setSinterTemp]   = useState(1250)
  const [sinterCuts,setSinterCuts]   = useState(0)
  const [panelOpen,setPanelOpen]     = useState(true)
  const [resetCount,setResetCount]   = useState(0)
  const timerRef = useRef(null)
  const fmt=t=>`${String(Math.floor(t/3600)).padStart(2,'0')}:${String(Math.floor((t%3600)/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`

  useEffect(()=>{
    if(running){timerRef.current=setInterval(()=>setElapsed(t=>t+1),1000)}
    else clearInterval(timerRef.current)
    return()=>clearInterval(timerRef.current)
  },[running])

  const handleStart=()=>{setRunning(true);setBurntThrough(false);setElapsed(0);setSinterCuts(0);setProductionRate(0);setResetCount(c=>c+1)}

  return(
    <div style={{height:'100dvh',background:C.bg,color:C.text,fontFamily:'monospace',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{background:'#060a10',borderBottom:`1px solid ${C.border}`,padding:'0 12px',height:48,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:20}}>🔥</span>
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'0.04em'}}>SINTER PLANT MODEL</div>
            <div style={{fontSize:8,color:C.muted,letterSpacing:'0.1em'}}>DOWNDRAFT SINTERING — REAL-TIME PHYSICS SIMULATION</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {[
            {l:'TIME',  v:fmt(elapsed),              c:running?C.success:C.muted},
            {l:'IGN°C', v:`${ignTemp}°C`,            c:'#FF7043'},
            {l:'BURN°C',v:`${sinterTemp}°C`,         c:C.accent},
            {l:'PROD',  v:`${productionRate}t/h`,    c:C.cyan},
            {l:'BTP',   v:burntThrough?'✓ REACHED':'PENDING',c:burntThrough?C.success:'#546E7A'},
          ].map(item=>(
            <div key={item.l} style={{textAlign:'center'}}>
              <div style={{fontSize:7,color:C.muted}}>{item.l}</div>
              <div style={{fontSize:12,fontWeight:700,color:item.c}}>{item.v}</div>
            </div>
          ))}
          <button onClick={()=>setPanelOpen(v=>!v)} style={{padding:'4px 8px',borderRadius:3,border:`1px solid ${C.border}`,background:'transparent',color:C.muted,fontSize:11,cursor:'pointer'}}>{panelOpen?'◀':'▶'}</button>
          <button onClick={()=>{setRunning(v=>!v);if(!running)handleStart()}} style={{padding:'6px 14px',borderRadius:4,border:`1px solid ${running?C.danger:C.success}`,background:running?'rgba(229,83,73,0.15)':'rgba(87,171,90,0.15)',color:running?C.danger:C.success,fontSize:11,fontWeight:700,cursor:'pointer',letterSpacing:'0.05em'}}>
            {running?'⏹ STOP':'▶ START'}
          </button>
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        {panelOpen&&(
          <div style={{width:220,background:C.panel,borderRight:`1px solid ${C.border}`,overflow:'auto',flexShrink:0,padding:'12px'}}>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:10}}>PROCESS PARAMETERS</div>
            <Slider label="Wind Box Pressure" value={windBoxPres} onChange={setWindBoxPres} min={800} max={2000} step={50} unit=" mmWC" color='#29B6F6'/>
            <Slider label="Bed Depth"          value={bedDepth}    onChange={setBedDepth}    min={400} max={700} step={10} unit=" mm" color='#9b5de5'/>
            <Slider label="Strand Speed"       value={speed}       onChange={setSpeed}       min={0.8} max={3.0} step={0.1} unit=" m/m" color='#FF8F00'/>
            <Slider label="Coke Rate"          value={cokePct}     onChange={setCokePct}     min={3.0} max={7.0} step={0.1} unit="%" color='#FFB300'/>
            <Slider label="Return Fines"       value={returnFines} onChange={setReturnFines} min={10} max={40} unit="%" color='#8D6E63'/>
            <div style={{height:1,background:C.border,margin:'10px 0'}}/>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',marginBottom:8}}>LIVE VALUES</div>
            {[
              {l:'Ignition Temp',  v:`${ignTemp}°C`,          c:'#FF7043'},
              {l:'Sinter Temp',    v:`${sinterTemp}°C`,        c:C.accent},
              {l:'Production',     v:`${productionRate}t/h`,   c:C.cyan},
              {l:'BTP Status',     v:burntThrough?'Reached':'Pending',c:burntThrough?C.success:'#546E7A'},
            ].map(r=>(
              <div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:9,color:C.muted}}>{r.l}</span>
                <span style={{fontSize:10,fontWeight:600,color:r.c}}>{r.v}</span>
              </div>
            ))}
            <div style={{height:1,background:C.border,margin:'10px 0'}}/>
            <div style={{fontSize:9,color:'#4d7a9a',marginBottom:6}}>HOVER TOOLTIPS</div>
            {[['🌡','Sinter bed zones (heat map)'],['🔥','Ignition hood'],['💨','Windboxes (suction)'],['⚙','Sinter breaker'],['❄','Sinter cooler'],['📦','Raw mix bins']].map(([ic,l])=>(
              <div key={l} style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}><span style={{fontSize:11}}>{ic}</span><span style={{fontSize:8,color:C.muted}}>{l}</span></div>
            ))}
            <div style={{height:1,background:C.border,margin:'8px 0'}}/>
            <div style={{fontSize:9,color:'#4d7a9a',marginBottom:4}}>KEY REACTIONS</div>
            {['C + O₂ → CO₂ + heat (coke)','CaCO₃ → CaO + CO₂ (flux)','CaO + SiO₂ → CaSiO₃ (bond)','Fe₂O₃ → Fe₃O₄ (reduction)','Partial melt → sinter bond'].map(r=><div key={r} style={{fontSize:8,color:C.muted,marginBottom:3}}>{r}</div>)}
            <div style={{height:1,background:C.border,margin:'8px 0'}}/>
            <div style={{fontSize:9,color:'#4d7a9a',marginBottom:4}}>BED ZONES (top→bottom)</div>
            {[['#78909C','RAW MIX — cold, unburnt'],['#FFB300','PRE-HEAT — moisture evap'],['#FF5722','COMBUSTION — 1200–1350°C'],['#FF8F00','SINTER ZONE — cooling cake']].map(([c,l])=>(
              <div key={l} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}><div style={{width:8,height:8,borderRadius:2,background:c,flexShrink:0}}/><span style={{fontSize:8,color:C.muted}}>{l}</span></div>
            ))}
          </div>
        )}
        <div style={{flex:1,overflow:'hidden',background:'#06090f'}}>
          <SinterCanvas
            running={running} windBoxPres={windBoxPres} bedDepth={bedDepth}
            returnFines={returnFines} cokePct={cokePct} speed={speed}
            setIgnTemp={setIgnTemp} setBurntThrough={setBurntThrough}
            setProductionRate={setProductionRate} setSinterTemp={setSinterTemp}
            onSinterCut={()=>setSinterCuts(c=>c+1)} doReset={resetCount}
          />
        </div>
      </div>
    </div>
  )
}
