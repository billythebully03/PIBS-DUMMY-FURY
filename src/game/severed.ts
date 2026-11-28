// @ts-nocheck
// Split a fighter's *joint graph* at two slanted laser planes. Nodes on
// opposite sides of a cut are deliberately duplicated, so an uncut elbow or
// knee remains a joint while a severed limb becomes its own independent body.
const STEP = 1 / 120;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const radius = name => name === 'head' ? 12 : name === 'pel' ? 9 : name[0] === 'a' ? 7 : 5;

function sliceTexture(def, from, to) {
  if (!def.canvas) return null;
  const startPad = from === 0 ? def.padA : 0, endPad = to === 1 ? def.padB : 0;
  const y0 = def.padA + from * def.length - startPad;
  const y1 = def.padA + to * def.length + endPad;
  const c = document.createElement('canvas');
  c.width = def.canvas.width; c.height = Math.max(1, Math.ceil(y1 - y0));
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(def.canvas, 0, y0, def.canvas.width, y1 - y0, 0, 0, c.width, c.height);
  // Heat is masked to the actual sprite, not a rectangular sticker floating
  // around it. It remains on that specific moving fragment indefinitely.
  g.globalCompositeOperation = 'source-atop';
  const edge = y => {
    g.fillStyle = '#8c210b'; g.fillRect(0, y, c.width, 5);
    g.fillStyle = '#ff8219'; g.fillRect(0, y + 1, c.width, 3);
    g.fillStyle = '#ffd261'; g.fillRect(0, y + 2, c.width, 1);
  };
  if (from > 0) edge(0);
  if (to < 1) edge(Math.max(0, c.height - 5));
  g.globalCompositeOperation = 'source-over';
  return { canvas: c, padA: startPad, padB: endPad, cutA: from > 0, cutB: to < 1 };
}

// Both the visible laser sweep and the physical split use these same planes.
// Orient them with the torso so a sideways, tumbling victim is still cut
// through the body rather than only grazing a hand.
export function laserCutGeometry(rig, slope) {
  const dx=rig.pel.x-rig.neck.x,dy=rig.pel.y-rig.neck.y,length=Math.hypot(dx,dy)||1;
  const angle=clamp((slope||0)*.35,-.25,.25),ca=Math.cos(angle),sa=Math.sin(angle);
  const nx=dx/length*ca-dy/length*sa,ny=dx/length*sa+dy/length*ca;
  const project=p=>(p.x-rig.neck.x)*nx+(p.y-rig.neck.y)*ny;
  const top=project(rig.head)-14;
  const bottom=Math.max(project(rig.aN)+8,project(rig.aF)+8,project(rig.pel)+35);
  return {nx,ny,cuts:[lerp(top,bottom,.39),lerp(top,bottom,.69)],project};
}

export function splitArticulated(rig, rag, definitions, job, floor) {
  const {nx,ny,cuts,project}=laserCutGeometry(rig,job.slope);
  const value=(p,cut)=>project(p)-cut;
  const bandFor = p => value(p,cuts[0]) < 0 ? 0 : value(p,cuts[1]) < 0 ? 1 : 2;
  const vFor = name => {
    let p = rag?.p?.[name];
    if (name === 'sh' && rag?.p?.neck && rag?.p?.pel) {
      const a=rag.p.neck,b=rag.p.pel;
      return { x: lerp((a.x-a.px)/STEP,(b.x-b.px)/STEP,.07), y: lerp((a.y-a.py)/STEP,(b.y-b.py)/STEP,.07) };
    }
    return p ? { x: (p.x-p.px)/STEP, y: (p.y-p.py)/STEP } : { x: 0, y: 0 };
  };
  const nodes = [], nodeByKey = new Map(), links = [], segments = [];
  function node(key, p, velocity, band, r) {
    if (nodeByKey.has(key)) return nodeByKey.get(key);
    const separation = (band - 1) * 44;
    const vx = velocity.x + separation * nx + job.dir * 12;
    const vy = velocity.y + separation * ny;
    const joint = key.startsWith('cut:') ? null : key.slice(0, key.lastIndexOf(':'));
    const n = { x:p.x, y:p.y, px:p.x-vx*STEP, py:p.y-vy*STEP, r, joint, index:nodes.length };
    nodes.push(n); nodeByKey.set(key,n); return n;
  }
  for (let bi=0;bi<definitions.length;bi++) {
    const def = definitions[bi], a = rig[def.a], b = rig[def.b];
    if (!a || !b) continue;
    const va=vFor(def.a), vb=vFor(def.b), split=[0,1];
    for (const cut of cuts) {
      const v0=value(a,cut),v1=value(b,cut),den=v0-v1;
      if (Math.abs(den)>1e-7) { const t=v0/den; if (t>1e-5&&t<1-1e-5) split.push(t); }
    }
    split.sort((x,y)=>x-y);
    for (let i=0;i<split.length-1;i++) {
      const t0=split[i],t1=split[i+1]; if(t1-t0<1e-5)continue;
      const pos=t=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)});
      const velocity=t=>({x:lerp(va.x,vb.x,t),y:lerp(va.y,vb.y,t)});
      const band=bandFor(pos((t0+t1)/2));
      const key=(t,end)=>t===0?`${def.a}:${band}`:t===1?`${def.b}:${band}`:`cut:${bi}:${end}:${band}`;
      const p0=pos(t0),p1=pos(t1);
      const n0=node(key(t0,i),p0,velocity(t0),band,t0===0?radius(def.a):Math.max(4,(def.width||12)*.25));
      const n1=node(key(t1,i+1),p1,velocity(t1),band,t1===1?radius(def.b):Math.max(4,(def.width||12)*.25));
      const link={a:n0,b:n1,length:Math.hypot(p1.x-p0.x,p1.y-p0.y)};
      links.push(link);
      const image=sliceTexture(def,t0,t1);
      segments.push({name:def.name, z:def.z, a:n0, b:n1, t0, t1, ...image});
    }
  }
  const parent=nodes.map((_,i)=>i);
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(const l of links){const a=find(l.a.index),b=find(l.b.index);if(a!==b)parent[b]=a;}
  const groups=new Map();
  for(const n of nodes){const root=find(n.index);if(!groups.has(root))groups.set(root,{nodes:[],links:[],parts:[],floor,acc:0,age:0,rest:0,settled:false});groups.get(root).nodes.push(n);}
  for(const l of links)groups.get(find(l.a.index)).links.push(l);
  for(const part of segments)groups.get(find(part.a.index)).parts.push(part);
  const pieces=[...groups.values()];
  for(const p of pieces){
    p.parts.sort((a,b)=>a.z-b.z);
    p.heads=p.parts.filter(s=>s.name==='neck'&&s.t1===1).map(s=>({head:s.b,neck:s.a}));
    p.feet=p.parts.filter(s=>(s.name==='sN'||s.name==='sF')&&s.t1===1).map(s=>({ankle:s.b,knee:s.a,side:s.name[1]}));
    updateCenter(p);
  }
  return pieces;
}

function updateCenter(p) {
  p.x=p.nodes.reduce((s,n)=>s+n.x,0)/p.nodes.length;
  p.y=p.nodes.reduce((s,n)=>s+n.y,0)/p.nodes.length;
  p.vx=p.nodes.reduce((s,n)=>s+(n.x-n.px)/STEP,0)/p.nodes.length;
  p.vy=p.nodes.reduce((s,n)=>s+(n.y-n.py)/STEP,0)/p.nodes.length;
}
function move(n,dx,dy){n.x+=dx;n.y+=dy;n.px+=dx*.88;n.py+=dy*.88;}

export function updateArticulated(pieces,dt,width) {
  for(const p of pieces){
    p.age+=dt;
    if(p.settled)continue;
    const before=p.nodes.map(n=>({x:n.x,y:n.y}));
    p.acc+=dt;let steps=0;
    while(p.acc>=STEP&&steps<6){
      p.acc-=STEP;steps++;
      for(const n of p.nodes){
        let vx=(n.x-n.px)*.998,vy=(n.y-n.py)*.998;
        const speed=Math.hypot(vx,vy);if(speed>16){vx*=16/speed;vy*=16/speed;}
        n.px=n.x;n.py=n.y;n.x+=vx;n.y+=vy+2200*STEP*STEP;
      }
      for(let it=0;it<5;it++){
        for(const l of p.links){
          const dx=l.b.x-l.a.x,dy=l.b.y-l.a.y,dist=Math.hypot(dx,dy)||1e-5;
          const k=(dist-l.length)/dist*.5;
          move(l.a,dx*k,dy*k);move(l.b,-dx*k,-dy*k);
        }
        for(const n of p.nodes){
          if(n.y>p.floor-n.r){
            const vy=n.y-n.py,vx=n.x-n.px;
            n.y=p.floor-n.r;n.py=n.y+(vy>0?vy*.12:-vy);n.px=n.x-vx*.78;
          }
          if(n.x<34+n.r){n.x=34+n.r;n.px=n.x+Math.abs(n.x-n.px)*.25;}
          if(n.x>width-34-n.r){n.x=width-34-n.r;n.px=n.x-Math.abs(n.x-n.px)*.25;}
        }
      }
    }
    if(steps>=6)p.acc=0;
    let movement=0;
    for(let i=0;i<p.nodes.length;i++)movement+=Math.hypot(p.nodes[i].x-before[i].x,p.nodes[i].y-before[i].y);
    const grounded=p.nodes.some(n=>n.y>=p.floor-n.r-1);
    if(grounded&&movement/p.nodes.length/Math.max(dt,1e-5)<14)p.rest+=dt;else p.rest=0;
    // Never stop a piece in mid-air, including after long slow-motion effects.
    if(grounded&&p.rest>.8){p.settled=true;for(const n of p.nodes){n.px=n.x;n.py=n.y;}}
    updateCenter(p);
  }
}
