// @ts-nocheck
/* ============================ UTILS ============================ */
const TAU=Math.PI*2, rad=d=>d*Math.PI/180;
const BODY_PIXEL=3, HEAD_PIXEL=1.5;
const clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t;
const rnd=(a,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
const ease=t=>t*t*(3-2*t);
const $=s=>document.querySelector(s);
const DIRX=[1,-1,0,0], DIRY=[0,0,1,-1];
const TIE_N=6, TIE_SEG=9;
const CAPE_N=7, CAPE_SEG=19;
const HL_HOVER=19;
const RUN_SPD=520, RUN_ACC=1250;
const GRAB_PREP_DUR=1.35, GRAB_THROW_DUR=.84;
// Jane's ability uses game time for its phases and real time for the brief
// cinematic slowdown, so it composes safely with hit-stop and knockout slow-mo.
const HYPNO_FOCUS=.42, HYPNO_HOLSTER=.42, HYPNO_DRAW=.42, HYPNO_RAISE=.2;
const HYPNO_RECOIL=.22, HYPNO_RECOVER=.34, TRANCE_KNEEL=.78;
const HYPNO_RANGE=350, BULLET_SPEED=1800, BULLET_DAMAGE=9, FRAGMENT_DUR=.42;
const HYPNO_LINES=[
  'Calm down.', 'Sleep, sleep, sleep.', 'Follow my voice.',
  'Let the noise fade.', 'Breathe. Just breathe.', 'Nothing to worry about.',
  'Rest for a moment.', 'Drift away.', 'There is only quiet.',
  'Close your eyes.', 'Let it all go.', 'You are safe here.',
  'That is it... relax.', 'Just one quiet thought.'
];
/* ============================ AUDIO ============================ */
const Snd={ac:null,on:true,nb:null,
init(){ if(this.ac){ if(this.ac.state==='suspended')this.ac.resume(); return;}
  try{ this.ac=new (window.AudioContext||window.webkitAudioContext)(); const n=this.ac.sampleRate; this.nb=this.ac.createBuffer(1,n,n); const d=this.nb.getChannelData(0); for(let i=0;i<n;i++)d[i]=Math.random()*2-1; }catch(e){this.ac=null} },
noise(dur,f0,f1,q,gain,type,delay){ if(!this.on||!this.ac)return; const ac=this.ac,t=ac.currentTime+(delay||0); const s=ac.createBufferSource(); s.buffer=this.nb; s.loop=true; const f=ac.createBiquadFilter(); f.type=type||'bandpass'; f.frequency.setValueAtTime(f0,t); f.frequency.exponentialRampToValueAtTime(Math.max(30,f1),t+dur); f.Q.value=q; const g=ac.createGain(); g.gain.setValueAtTime(gain,t); g.gain.exponentialRampToValueAtTime(.001,t+dur); s.connect(f);f.connect(g);g.connect(ac.destination); s.start(t); s.stop(t+dur+.05); },
tone(f0,f1,dur,gain,type,delay){ if(!this.on||!this.ac)return; const ac=this.ac,t=ac.currentTime+(delay||0); const o=ac.createOscillator(); o.type=type||'sine'; o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur); const g=ac.createGain(); g.gain.setValueAtTime(gain,t); g.gain.exponentialRampToValueAtTime(.001,t+dur); o.connect(g);g.connect(ac.destination); o.start(t); o.stop(t+dur+.05); },
hit(p){p=p||1; this.noise(.14,2200,260,.8,.55*p,'lowpass'); this.tone(160,42,.18,.8*p); this.noise(.05,4000,1500,2,.2*p,'highpass');},
bat(p){p=p||1; this.noise(.16,1800,200,.7,.6*p,'lowpass'); this.tone(120,40,.2,.9*p,'triangle'); this.tone(900,300,.08,.15*p,'square');},
splat(p){p=p||1; this.noise(.19,1600,180,1.2,.42*p,'bandpass'); this.tone(110,38,.14,.45*p,'triangle');},
whoosh(){ this.noise(.2,500,2400,1.2,.18,'bandpass'); },
hop(){ this.noise(.22,700,2800,1.2,.2,'bandpass'); this.tone(240,460,.12,.08,'triangle'); },
thud(){ this.tone(90,35,.22,.7); this.noise(.18,500,80,.7,.4,'lowpass'); },
stomp(){ this.tone(70,25,.5,1); this.noise(.5,900,60,.6,.6,'lowpass'); },
ui(){ this.tone(520,820,.08,.18,'square'); },
ko(){ this.tone(120,30,1,.9); this.noise(.8,1500,80,.5,.6,'lowpass'); },
spawn(){ this.noise(.3,6000,300,.6,.25,'bandpass'); this.tone(900,100,.4,.2,'sawtooth'); },
laserCharge(){ this.tone(300,1300,.4,.1,'sawtooth'); this.noise(.4,800,3200,1,.1,'bandpass'); },
laser(){ this.tone(220,170,.7,.14,'sawtooth'); this.tone(880,640,.7,.05,'square'); this.noise(.7,5000,2500,.8,.12,'highpass'); },
hypnotize(){ this.tone(380,240,.55,.08,'sine'); this.tone(570,360,.7,.035,'sine'); },
shot(){ this.noise(.11,3600,280,.8,.48,'lowpass'); this.tone(180,55,.16,.48,'triangle'); }
};
/* ============================ POSES / FK / PROPORTIONS ============================ */
// Neck slightly shorter than before (22.5 -> 20).
const TORSO_L=62, THIGH=51, SHIN=49, UA=35.5, FA=31, NECKH=20, ANK=7.5;
const LEG_S=(THIGH+SHIN)/90;
// gx,gy,bt,bg: two-handed grip (bat) in the torso frame: forward / down from shoulder, bat direction (0=down, 90=forward, 180=up), and 2-hand weight (0=one-handed FK, 1=two-handed IK)
const PK=['px','H','tl','hd','a1','e1','c1','a2','e2','c2','f1x','f1h','fa1','f2x','f2h','fa2','mo','ey','gx','gy','bt','bg'];
const D={px:0,H:84,tl:9,hd:3,a1:40,e1:115,c1:1,a2:15,e2:140,c2:1,f1x:24,f1h:0,fa1:0,f2x:-22,f2h:0,fa2:0,mo:0,ey:0,gx:55,gy:16,bt:162,bg:1};
const P=o=>Object.assign({},D,o);
const KF=a=>a.map(([t,o])=>[t,P(o)]);
function mix(a,b,t){const r={};for(const k of PK)r[k]=a[k]+(b[k]-a[k])*t;return r;}
function sampleKF(kf,t){
  if(t<=kf[0][0])return kf[0][1];
  for(let i=1;i<kf.length;i++){ if(t<=kf[i][0]){const a=kf[i-1],b=kf[i];return mix(a[1],b[1],ease((t-a[0])/(b[0]-a[0])));} }
  return kf[kf.length-1][1];
}
const JN=['pel','neck','sh','head','eN','wN','eF','wF','kN','aN','kF','aF'];
const JR={head:13,pel:8.5,wN:6,wF:6,kN:6.5,kF:6.5,aN:7.5,aF:7.5,eN:4.5,eF:4.5,neck:3.5};
function legIK(J,s,fx,fh){
  let dx=fx*LEG_S-J.pel.x, dy=-(ANK+fh*LEG_S)-J.pel.y, L=Math.hypot(dx,dy);
  const maxL=(THIGH+SHIN)*0.998, minL=Math.abs(THIGH-SHIN)+3;
  if(L>maxL){dx*=maxL/L;dy*=maxL/L;L=maxL;}
  if(L<minL){ if(L<.001){dx=1;dy=0;L=1} dx*=minL/L;dy*=minL/L;L=minL; }
  const cosA=(THIGH*THIGH+L*L-SHIN*SHIN)/(2*THIGH*L), A=Math.acos(clamp(cosA,-1,1)), base=Math.atan2(dy,dx);
  // Anatomical human knee bend: knee always points toward the front of the leg, shin bends slightly backward.
  const ang=base-A;
  J['k'+s]={x:J.pel.x+Math.cos(ang)*THIGH,y:J.pel.y+Math.sin(ang)*THIGH};
  J['a'+s]={x:J.pel.x+dx,y:J.pel.y+dy};
}
function armFK(J,s,a,e){
  a=rad(a);const b=a+rad(e);
  const el={x:J.sh.x+Math.sin(a)*UA,y:J.sh.y+Math.cos(a)*UA};
  J['e'+s]=el; J['w'+s]={x:el.x+Math.sin(b)*FA,y:el.y+Math.cos(b)*FA};
}
// 2-bone IK for arms: used when a fighter holds a two-handed weapon (the hands must stay on the handle).
function armIK(J,s,t){
  const sh=J.sh; let dx=t.x-sh.x,dy=t.y-sh.y,L=Math.hypot(dx,dy)||1e-3;
  const maxL=(UA+FA)*.998,minL=Math.abs(UA-FA)+3;
  if(L>maxL){dx*=maxL/L;dy*=maxL/L;L=maxL;} if(L<minL){dx*=minL/L;dy*=minL/L;L=minL;}
  const cosA=(UA*UA+L*L-FA*FA)/(2*UA*L),A=Math.acos(clamp(cosA,-1,1)),base=Math.atan2(dy,dx);
  let best=null,bs=-1e9;
  for(const sg of [1,-1]){const ang=base+sg*A,ex=sh.x+Math.cos(ang)*UA,ey=sh.y+Math.sin(ang)*UA,sc=ey-ex*.35;if(sc>bs){bs=sc;best={x:ex,y:ey}}}
  J['e'+s]=best; J['w'+s]={x:sh.x+dx,y:sh.y+dy};
}
function clampBatFloor(wx,wy,bdx,bdy,gy){
  const maxVy=clamp((gy-4-wy)/62,-1,1);
  if(bdy>maxVy){
    const sg=bdx>=0?1:-1;
    bdy=maxVy;
    bdx=sg*Math.sqrt(Math.max(.001,1-bdy*bdy));
  }
  const l=Math.hypot(bdx,bdy)||1;
  return {x:bdx/l,y:bdy/l};
}
function computeRig(p,x,gy,y,dir,bat){
  const J={}; J.pel={x:p.px*LEG_S,y:-p.H*LEG_S};
  const tl=rad(p.tl); J.neck={x:J.pel.x+Math.sin(tl)*TORSO_L,y:J.pel.y-Math.cos(tl)*TORSO_L};
  J.sh={x:lerp(J.pel.x,J.neck.x,.93),y:lerp(J.pel.y,J.neck.y,.93)};
  const hd=rad(p.hd); J.head={x:J.neck.x+Math.sin(hd)*NECKH,y:J.neck.y-Math.cos(hd)*NECKH};
  let bv=null,bg=1;
  if(bat){
    bg=clamp(p.bg===undefined?1:p.bg,0,1);
    const c=Math.cos(tl),s=Math.sin(tl);
    const G={x:J.sh.x+p.gx*c-p.gy*s,y:J.sh.y+p.gx*s+p.gy*c};
    const th=rad(p.bt-p.tl), bvIK={x:Math.sin(th),y:Math.cos(th)};
    if(bg>=.999){
      armIK(J,'N',G); armIK(J,'F',{x:G.x+bvIK.x*8.5,y:G.y+bvIK.y*8.5});
      bv=bvIK;
    }else{
      armFK(J,'N',p.a1,p.e1); armFK(J,'F',p.a2,p.e2);
      const fa=rad(p.a1+p.e1+58), bvFK={x:Math.sin(fa),y:Math.cos(fa)};
      if(bg<=.001){
        bv=bvFK;
      }else{
        const Jik={sh:J.sh};
        armIK(Jik,'N',G); armIK(Jik,'F',{x:G.x+bvIK.x*8.5,y:G.y+bvIK.y*8.5});
        J.eN={x:lerp(J.eN.x,Jik.eN.x,bg),y:lerp(J.eN.y,Jik.eN.y,bg)};
        J.wN={x:lerp(J.wN.x,Jik.wN.x,bg),y:lerp(J.wN.y,Jik.wN.y,bg)};
        J.eF={x:lerp(J.eF.x,Jik.eF.x,bg),y:lerp(J.eF.y,Jik.eF.y,bg)};
        J.wF={x:lerp(J.wF.x,Jik.wF.x,bg),y:lerp(J.wF.y,Jik.wF.y,bg)};
        const bx=lerp(bvFK.x,bvIK.x,bg),by=lerp(bvFK.y,bvIK.y,bg),bl=Math.hypot(bx,by)||1;
        bv={x:bx/bl,y:by/bl};
      }
    }
  }else{ armFK(J,'N',p.a1,p.e1); armFK(J,'F',p.a2,p.e2); }
  legIK(J,'N',p.f1x,p.f1h); legIK(J,'F',p.f2x,p.f2h);
  let low=0; for(const k in JR){const v=J[k].y+JR[k]; if(v>low)low=v;}
  const R={dir};
  for(const k of JN)R[k]={x:x+J[k].x*dir,y:gy-y+J[k].y-low};
  R.fdN={x:Math.cos(rad(p.fa1))*dir,y:Math.sin(rad(p.fa1))};
  R.fdF={x:Math.cos(rad(p.fa2))*dir,y:Math.sin(rad(p.fa2))};
  R.cN=p.c1;R.cF=p.c2;R.mo=p.mo;R.ey=p.ey;
  if(bv){
    const rawX=bv.x*dir,rawY=bv.y;
    R.bd=bg<.95?clampBatFloor(R.wN.x,R.wN.y,rawX,rawY,gy):{x:rawX,y:rawY};
  }
  return R;
}
function blendRig(A,B,t){
  const R={dir:B.dir};
  for(const k of JN)R[k]={x:lerp(A[k].x,B[k].x,t),y:lerp(A[k].y,B[k].y,t)};
  const ks=['fdN','fdF'];if(A.bd&&B.bd)ks.push('bd');
  for(const k of ks){let x=lerp(A[k].x,B[k].x,t),y=lerp(A[k].y,B[k].y,t);const l=Math.hypot(x,y)||1;R[k]={x:x/l,y:y/l};}
  R.cN=lerp(A.cN,B.cN,t);R.cF=lerp(A.cF,B.cF,t);R.mo=lerp(A.mo,B.mo,t);R.ey=lerp(A.ey,B.ey,t);
  return R;
}
function pinHandsWorld(R,tx,ty){
  const d=R.dir,J={sh:{x:0,y:0}};
  const lx=(tx-R.sh.x)*d,ly=ty-R.sh.y;
  armIK(J,'N',{x:lx,y:ly});
  armIK(J,'F',{x:lx+4,y:ly+2});
  R.eN={x:R.sh.x+J.eN.x*d,y:R.sh.y+J.eN.y};
  R.wN={x:R.sh.x+J.wN.x*d,y:R.sh.y+J.wN.y};
  R.eF={x:R.sh.x+J.eF.x*d,y:R.sh.y+J.eF.y};
  R.wF={x:R.sh.x+J.wF.x*d,y:R.sh.y+J.wF.y};
  R.cN=1;R.cF=1;R.bd=null;
}
function poseHypnosisArm(R,f){
  const v=f.hypTarget,vr=v&&v.rig,sh=R.sh,d=R.dir,phase=f.hypPhase,t=f.hypPhaseT;
  if(phase==='recover'||!phase)return;
  const head=vr?vr.head:{x:sh.x+d*200,y:sh.y-10};
  const body=vr?pointBetween(vr.sh,vr.pel,.3):head;
  const reach=target=>{
    const dx=target.x-sh.x,dy=target.y-sh.y,L=Math.hypot(dx,dy)||1;
    return {x:sh.x+dx/L*60,y:sh.y+dy/L*60};
  };
  const extended=reach(head),aimBody=reach(body),hip={x:R.pel.x-d*8,y:R.pel.y+2};
  const between=(a,b,k)=>({x:lerp(a.x,b.x,k),y:lerp(a.y,b.y,k)});
  let hand,aimPoint=head;
  if(phase==='focus')hand=between(R.wN,extended,ease(clamp(t/.34,0,1)));
  else if(phase==='holster')hand=between(extended,hip,ease(clamp(t/HYPNO_HOLSTER,0,1)));
  else if(phase==='draw'){hand=between(hip,aimBody,ease(clamp(t/HYPNO_DRAW,0,1)));aimPoint=body;}
  else if(phase==='aim'){hand=aimBody;aimPoint=body;}
  else if(phase==='raise'){hand=between(aimBody,extended,ease(clamp(t/HYPNO_RAISE,0,1)));aimPoint=between(body,head,ease(clamp(t/HYPNO_RAISE,0,1)));}
  else hand=extended;
  const J={sh:{x:0,y:0}};
  armIK(J,'N',{x:(hand.x-sh.x)*d,y:hand.y-sh.y});
  R.eN={x:sh.x+J.eN.x*d,y:sh.y+J.eN.y};
  R.wN={x:sh.x+J.wN.x*d,y:sh.y+J.wN.y};
  R.cN=f.hypGun?1:0;
  if(f.hypGun){
    let dx=aimPoint.x-R.wN.x,dy=aimPoint.y-R.wN.y,L=Math.hypot(dx,dy)||1;
    dx/=L;dy/=L;
    if(phase==='draw'){
      const k=ease(clamp(t/HYPNO_DRAW,0,1));
      dx=lerp(d*.2,dx,k);dy=lerp(1,dy,k);L=Math.hypot(dx,dy)||1;dx/=L;dy/=L;
    }
    f.hypGunDir={x:dx,y:dy};
  }
}
/* poses */
const AIRL={f1x:24,f1h:30,f2x:-12,f2h:22};
const T_POSE=P({H:92,tl:0,hd:0,a1:90,e1:0,c1:0,a2:-90,e2:0,c2:0,f1x:3,f2x:-3,bg:0});
const LAND=P({H:60,tl:30,px:2,a1:28,e1:85,a2:20,e2:100,f1x:30,f2x:-26,hd:10,gx:50,gy:22,bt:146});
const RISE=P({H:92,tl:6,a1:62,e1:110,a2:38,e2:122,f1x:22,f1h:36,f2x:-12,f2h:26,mo:.2,gx:52,gy:12,bt:166});
const FALL=P({H:94,tl:2,a1:48,e1:75,a2:32,e2:80,c1:0,c2:0,f1x:18,f1h:8,f2x:-16,f2h:3,gx:50,gy:20,bt:152});
const DASHF=P({H:66,tl:44,hd:22,px:6,a1:-25,e1:30,a2:-35,e2:40,f1x:46,f1h:16,fa1:20,f2x:-46,f2h:18,fa2:45,mo:.3,gx:52,gy:20,bt:138});
const DASHB=P({H:86,tl:-16,hd:-8,px:-4,a1:58,e1:100,a2:42,e2:112,f1x:28,f1h:20,f2x:10,f2h:12,mo:.2,gx:50,gy:18,bt:160});
const HITH=P({tl:-12,hd:-26,H:81,px:-6,a1:12,e1:60,c1:0,a2:5,e2:70,c2:0,f1x:28,f2x:-26,ey:1,mo:.85,gx:46,gy:20,bt:170});
const HITB=P({tl:34,hd:14,H:72,px:4,a1:30,e1:80,c1:0,a2:35,e2:85,c2:0,f1x:22,f2x:-24,ey:1,mo:.9,gx:48,gy:24,bt:145});
const WIN=P({H:90,tl:-6,hd:-12,a1:140,e1:25,c1:1,a2:155,e2:15,c2:1,mo:1,gx:28,gy:-42,bt:172});
const LY={px:0,H:11,tl:-88,hd:-84,a1:98,e1:0,c1:0,a2:105,e2:0,c2:0,f1x:56,f2x:64,ey:1,mo:.3,bg:0};
const GETUP=KF([
[0,LY],[.4,Object.assign({},LY,{H:12,tl:-86,mo:.5})],
[.8,{H:13,tl:-56,hd:-46,a1:-42,e1:-5,c1:1,a2:-50,e2:-5,c2:1,f1x:62,f2x:68,ey:1,mo:.5}],
[1.05,{H:13,tl:-10,hd:6,a1:-34,e1:-6,c1:1,a2:-40,e2:-4,c2:1,f1x:72,f2x:78,ey:0,mo:.6}],
[1.35,{H:34,tl:28,hd:12,a1:40,e1:50,c1:1,a2:55,e2:40,c2:1,f1x:26,f2x:20,mo:.7}],
[1.65,{H:66,tl:38,hd:10,a1:28,e1:8,c1:1,a2:30,e2:8,c2:1,f1x:26,f2x:-14,mo:.7}],
[1.9,{H:80,tl:24,hd:14,a1:6,e1:22,c1:0,a2:6,e2:26,c2:0,mo:.6}],
[2.3,{}]
]);
// Negan getup: Lucille stays in one hand (N) while his free hand (F) props off the floor, then both hands regrip.
const GETUP_NEGAN=KF([
[0,Object.assign({},LY,{a1:94,e1:10,bg:0})],
[.4,Object.assign({},LY,{H:12,tl:-86,mo:.5,a1:90,e1:14,bg:0})],
[.8,{H:13,tl:-56,hd:-46,a1:66,e1:28,c1:1,a2:-48,e2:-5,c2:1,f1x:62,f2x:68,ey:1,mo:.5,bg:0}],
[1.05,{H:14,tl:-10,hd:6,a1:56,e1:34,c1:1,a2:-40,e2:-4,c2:1,f1x:72,f2x:78,ey:0,mo:.6,bg:0}],
[1.35,{H:35,tl:28,hd:12,a1:46,e1:40,c1:1,a2:-10,e2:30,c2:1,f1x:26,f2x:20,mo:.7,bg:0}],
[1.65,{H:67,tl:34,hd:10,a1:50,e1:30,c1:1,a2:28,e2:42,c2:0,f1x:26,f2x:-14,mo:.65,bg:0}],
[1.92,{H:81,tl:18,hd:8,a1:62,e1:24,c1:1,a2:64,e2:26,c2:1,f1x:25,f2x:-18,mo:.4,gx:50,gy:20,bt:152,bg:.55}],
[2.3,{}]
]);
// Homelander hover stance, braking flare, and getup (stands onto his feet, then immediately lifts off).
const HL_IDLE=P({px:0,H:85,tl:3,hd:2,a1:20,e1:26,c1:0,a2:12,e2:22,c2:0,f1x:7,f1h:13,fa1:40,f2x:-9,f2h:0,fa2:48,mo:0,ey:0});
const HL_BRAKE_POSE=P({px:-4,H:84,tl:-12,hd:5,a1:44,e1:38,c1:0,a2:30,e2:42,c2:0,f1x:18,f1h:18,fa1:30,f2x:4,f2h:8,fa2:38,mo:.15,ey:0});
const GETUP_HL=KF([
[0,LY],[.4,Object.assign({},LY,{H:12,tl:-86,mo:.5})],
[.8,{H:13,tl:-56,hd:-46,a1:-42,e1:-5,c1:1,a2:-50,e2:-5,c2:1,f1x:62,f2x:68,ey:1,mo:.5}],
[1.05,{H:13,tl:-10,hd:6,a1:-34,e1:-6,c1:1,a2:-40,e2:-4,c2:1,f1x:72,f2x:78,ey:0,mo:.6}],
[1.35,{H:34,tl:28,hd:12,a1:40,e1:50,c1:1,a2:55,e2:40,c2:1,f1x:26,f2x:20,mo:.7}],
[1.62,{H:68,tl:30,hd:10,a1:24,e1:14,c1:1,a2:26,e2:14,c2:1,f1x:22,f2x:-14,mo:.6}],
[1.78,{H:83,tl:10,hd:5,a1:16,e1:22,c1:0,a2:12,e2:24,c2:0,f1x:14,f1h:0,fa1:0,f2x:-12,f2h:0,fa2:0,mo:.35}],
[2.04,Object.assign({},HL_IDLE,{H:85,tl:5,f1h:9,fa1:26,fa2:34,mo:.15})],
[2.3,HL_IDLE]
]);
const GETUP_DUR=2.3;
// The kneeling pose is held without idle bobbing; the existing leg IK puts the
// knees on the floor and folds the lower legs back underneath the fighter.
const TRANCE_POSE=P({H:40,tl:3,hd:0,px:0,a1:4,e1:22,c1:0,a2:-4,e2:20,c2:0,f1x:-18,f2x:-24,fa1:0,fa2:0,mo:0,ey:0,bg:0});
const HYPNO_POSE=P({H:84,tl:4,hd:1,px:0,a1:30,e1:58,c1:0,a2:16,e2:105,c2:0,f1x:20,f2x:-20,mo:0});
const GRAB_PREP_POSE=P({H:72,tl:34,hd:22,px:6,a1:26,e1:24,c1:0,a2:32,e2:26,c2:0,f1x:28,f2x:-20,mo:.2,bg:0});
const GRAB_THROW_KF=KF([
  [0,{H:66,tl:46,hd:24,px:8,a1:32,e1:18,c1:1,a2:26,e2:22,c2:1,f1x:32,f2x:-22,mo:.4,bg:0}],
  [.18,{H:80,tl:16,hd:4,px:4,a1:96,e1:16,c1:1,a2:90,e2:20,c2:1,f1x:28,f2x:-22,mo:.6,bg:0}],
  [.36,{H:89,tl:-14,hd:-16,px:-3,a1:168,e1:10,c1:1,a2:162,e2:14,c2:1,f1x:22,f2x:-24,mo:.75,bg:0}],
  [.38,{H:89,tl:14,hd:-10,px:3,a1:168,e1:10,c1:1,a2:162,e2:14,c2:1,f1x:24,f2x:-22,mo:.8,bg:0}],
  [.58,{H:65,tl:52,hd:24,px:12,a1:36,e1:14,c1:1,a2:30,e2:18,c2:1,f1x:38,f2x:-24,mo:.95,bg:0}],
  [.74,{H:79,tl:20,hd:8,px:4,a1:42,e1:72,c1:1,a2:28,e2:88,c2:1,f1x:28,f2x:-22,mo:.35,gx:50,gy:20,bt:152,bg:.45}],
  [.84,{}]
]);
const JAB_S={tl:22,px:9,H:80,a1:88,e1:-4,a2:35,e2:135,f1x:40,hd:12,mo:.4};
const CRS_S={tl:30,px:17,H:78,a2:92,e2:-6,a1:34,e1:132,f1x:44,f2x:-12,f2h:3,fa2:35,hd:14,mo:.5};
const KNE_S={tl:26,px:8,hd:20,a1:62,e1:42,c1:0,a2:58,e2:48,c2:0,f1x:34,f1h:48,fa1:55,f2x:-16,mo:.6};
const UPR_S={H:90,tl:-8,px:14,a2:135,e2:22,a1:30,e1:130,f1x:30,f2x:-20,f2h:8,fa2:50,hd:-10,mo:.8};
const AIR_S=Object.assign({},AIRL,{tl:28,a1:75,e1:-6,a2:20,e2:130,hd:14,mo:.5});
const ATK=[
{n:'jab',dur:.38,hs:.11,he:.2,cancel:.22,reach:112,dmg:5,zone:'head',pw:.4,stun:.34,kb:95,fist:'N',lt:.07,lunge:215,y:[94,198],
  kf:KF([[0,{}],[.07,{tl:4,px:-5,a1:22,e1:135,f1x:20}],[.12,JAB_S],[.2,JAB_S],[.38,{}]])},
{n:'cross',dur:.44,hs:.14,he:.23,cancel:.25,reach:116,dmg:6,zone:'head',pw:.55,stun:.4,kb:125,fist:'F',lt:.09,lunge:235,y:[94,198],
  kf:KF([[0,{}],[.08,{tl:2,px:-8,a2:-8,e2:100,a1:42,e1:112,f2x:-27,hd:0}],[.15,CRS_S],[.24,CRS_S],[.44,{}]])},
{n:'knee',dur:.52,hs:.17,he:.27,cancel:.3,reach:104,dmg:7,zone:'torso',pw:.68,stun:.5,kb:35,pull:66,fist:null,lt:.05,lunge:265,y:[54,154],
  kf:KF([[0,{}],[.1,{tl:12,px:-6,a1:75,e1:55,c1:0,a2:65,e2:60,c2:0,f1x:20,f1h:18,hd:8}],[.19,KNE_S],[.29,KNE_S],[.52,{}]])},
{n:'upper',dur:.68,hs:.21,he:.32,cancel:9,reach:108,dmg:11,zone:'head',pw:1,launch:true,lvx:285,lvy:700,fist:'F',lt:.1,lunge:210,y:[64,220],
  kf:KF([[0,{}],[.13,{H:58,tl:22,px:-6,a2:-28,e2:30,a1:45,e1:110,f1x:28,f2x:-32,hd:12}],[.25,UPR_S],[.36,UPR_S],[.68,{}]])},
{n:'air',air:true,dur:.4,hs:.12,he:.26,cancel:9,reach:108,dmg:6,zone:'head',pw:.5,stun:.35,kb:145,fist:'N',lt:.0,lunge:0,y:[20,150],
  kf:KF([[0,AIRL],[.08,Object.assign({},AIRL,{tl:12,a1:30,e1:110})],[.13,AIR_S],[.26,AIR_S],[.4,Object.assign({},AIRL,{tl:8})]])}
];
/* ---- Negan: two-handed swings with "Lucille" on outstretched arms (balanced reach, no unfair attack advantage) ---- */
const BAT_W1={tl:-8,px:-8,H:82,hd:-6,gx:22,gy:-6,bt:212};
const BAT_S1={tl:16,px:12,H:78,hd:10,f1x:40,gx:57,gy:14,bt:96};
const BAT_F1={tl:20,px:14,H:76,hd:12,f1x:40,gx:52,gy:28,bt:62};
const BAT_W2={tl:12,px:-4,H:70,hd:6,gx:26,gy:44,bt:-26,f1x:30,f2x:-20};
const BAT_S2={tl:22,px:12,H:76,hd:10,f1x:38,gx:57,gy:16,bt:108};
const BAT_W3={tl:-10,px:-6,H:84,hd:-8,gx:18,gy:-26,bt:202};
const BAT_S3={tl:34,px:14,H:70,hd:16,f1x:40,f2x:-18,gx:56,gy:26,bt:52};
const BAT_W4={H:56,tl:24,px:-10,hd:8,gx:24,gy:42,bt:-22,f1x:34,f2x:-24};
const BAT_S4={H:84,tl:-6,px:14,hd:-6,gx:58,gy:10,bt:124,f1x:30,f2x:-20};
const BAT_F4={H:88,tl:-10,px:12,hd:-10,gx:44,gy:-14,bt:170,f1x:28,f2x:-20};
const ATK_BAT=[
{n:'swing',dur:.5,hs:.17,he:.27,cancel:.3,reach:112,dmg:6,zone:'head',pw:.55,stun:.36,kb:105,bat:true,lt:.1,lunge:200,y:[84,204],
  kf:KF([[0,{}],[.14,BAT_W1],[.2,BAT_S1],[.28,BAT_S1],[.34,BAT_F1],[.5,{}]])},
{n:'upswing',dur:.54,hs:.19,he:.3,cancel:.32,reach:116,dmg:7,zone:'torso',pw:.7,stun:.42,kb:120,bat:true,lt:.12,lunge:215,y:[40,172],
  kf:KF([[0,{}],[.15,BAT_W2],[.23,BAT_S2],[.31,BAT_S2],[.54,{}]])},
{n:'smash',dur:.72,hs:.22,he:.33,cancel:9,reach:108,dmg:9,zone:'head',pw:.85,stun:.48,kb:70,bat:true,lt:.14,lunge:220,y:[70,214],
  kf:KF([[0,{}],[.2,BAT_W3],[.27,BAT_S3],[.36,BAT_S3],[.72,{}]])},
{n:'homerun',dur:.82,hs:.26,he:.38,cancel:9,reach:112,dmg:11,zone:'head',pw:1,launch:true,lvx:300,lvy:700,bat:true,lt:.16,lunge:200,y:[54,220],
  kf:KF([[0,{}],[.2,BAT_W4],[.3,BAT_S4],[.4,BAT_F4],[.48,BAT_F4],[.82,{}]])},
{n:'air',air:true,bat:true,dur:.4,hs:.13,he:.26,cancel:9,reach:108,dmg:6,zone:'head',pw:.55,stun:.35,kb:145,lt:.0,lunge:0,y:[20,160],
  kf:KF([[0,AIRL],[.07,Object.assign({},AIRL,{tl:-6,gx:20,gy:-18,bt:200})],[.13,Object.assign({},AIRL,{tl:26,hd:14,gx:54,gy:24,bt:54})],[.26,Object.assign({},AIRL,{tl:26,hd:14,gx:54,gy:24,bt:54})],[.4,Object.assign({},AIRL,{tl:8,gx:50,gy:18,bt:150})]])}
];
/* ---- Homelander: hovering jab/cross/knee + eye laser finisher (chest out, arms back) ---- */
const HL_L={f1x:8,f1h:13,fa1:40,f2x:-10,f2h:0,fa2:48};
const HL_S=P(Object.assign({},HL_IDLE,{H:89,tl:7,hd:-3,px:3,a1:-62,e1:-6,c1:1,a2:-80,e2:-4,c2:1,f1x:6,f1h:14,fa1:44,f2x:-12,f2h:2,fa2:52,mo:.35}));
const LASER={n:'laser',laser:true,dur:1.35,chargeT:.4,fireEnd:1.05,hs:99,he:0,cancel:99,reach:0,dmg:0,zone:'head',pw:0,lt:9,lunge:0,y:[0,0],
  kf:KF([[0,HL_IDLE],[.3,HL_S],[1.05,HL_S],[1.35,HL_IDLE]])};
const ATK_HL=[
  Object.assign({},ATK[0],{kf:KF([[0,HL_IDLE],[.07,Object.assign({},HL_IDLE,{tl:5,px:-4,a1:24,e1:130,c1:1,a2:22,e2:125,c2:1})],[.12,Object.assign({},JAB_S,HL_L,{H:84})],[.2,Object.assign({},JAB_S,HL_L,{H:84})],[.38,HL_IDLE]])}),
  Object.assign({},ATK[1],{kf:KF([[0,HL_IDLE],[.08,Object.assign({},HL_IDLE,{tl:2,px:-6,a2:-8,e2:100,c2:1,a1:38,e1:112,c1:1,hd:0})],[.15,Object.assign({},CRS_S,HL_L,{H:83})],[.24,Object.assign({},CRS_S,HL_L,{H:83})],[.44,HL_IDLE]])}),
  Object.assign({},ATK[2],{kf:KF([[0,HL_IDLE],[.1,Object.assign({},HL_IDLE,{tl:12,px:-5,a1:70,e1:52,c1:0,a2:60,e2:58,c2:0,f1x:16,f1h:22,hd:8})],[.19,Object.assign({},KNE_S,{f2x:-12,f2h:4,fa2:50,H:85})],[.29,Object.assign({},KNE_S,{f2x:-12,f2h:4,fa2:50,H:85})],[.52,HL_IDLE]])}),
  LASER,
  ATK[4]
];
const atkSetFor=skin=>skin==='negan'?ATK_BAT:skin==='homelander'?ATK_HL:ATK;
/* ---- Dive kick (running leap) and back-hop poses ---- */
const KICK_POSE=P({H:66,tl:-52,hd:-16,px:-8,a1:-50,e1:25,a2:-35,e2:30,f1x:82,f1h:56,f2x:56,f2h:32,mo:.7});
/* ============================ PIXEL-ART CHARACTER SKINS ============================ */
const SKINS = ['jane', 'negan', 'homelander', 'walt', 'saul'];
const SKIN_META = {
  jane:       { label: 'ПАТРИК ДЖЕЙН', color: '#68717E' },
  negan:      { label: 'НИГАН', color: '#A7252D' },
  homelander: { label: 'ХОУМЛЕНДЕР', color: '#31527D' },
  walt:       { label: 'УОЛТЕР', color: '#718D55' },
  saul:       { label: 'СОЛ', color: '#D94B8D' }
};
let skinCursor = 0;
function pickSkin() {
  const skin = SKINS[skinCursor % SKINS.length];
  skinCursor++;
  return skin;
}
const HEAD_URL = {
  jane: 'https://i.ibb.co/NnNTL5KG/IMG-4282.png',
  negan: 'https://i.ibb.co/ZRGCwwQT/IMG-4289.png',
  homelander: 'https://i.ibb.co/bjQK83QV/IMG-4290.png',
  walt: 'https://i.ibb.co/KxpN1fp4/IMG-4298.png',
  saul: 'https://i.ibb.co/nHFz7pG/IMG-4297.png'
};
const skinHeads = Object.create(null);
SKINS.forEach(key => {
  const portrait = new Image();
  portrait.decoding = 'async';
  portrait.referrerPolicy = 'no-referrer';
  portrait.onload = () => {
    skinHeads[key] = { img: portrait, aspect: portrait.naturalWidth / Math.max(1, portrait.naturalHeight), loaded: true };
  };
  portrait.onerror = () => {
    skinHeads[key] = { img: null, aspect: .8, loaded: false };
  };
  portrait.src = HEAD_URL[key];
});

const mk = () => document.createElement('canvas');
const SF = '#D89B72', SHI = '#E6B18C', SSH = '#B67A52', SBK = '#C2855C';
const paintSkinRects = (g, l) => l.forEach(([x, y, w, h, c]) => { g.fillStyle = c; g.fillRect(x, y, w, h); });
const spr = (w, h, l) => { const c = mk(); c.width = w; c.height = h; paintSkinRects(c.getContext('2d'), l); return c; };
const box = (x, y, w, h, o) => [[x + 1, y, w - 2, h, o], [x, y + 1, w, h - 2, o]];
const limb = (o, w, h, base, hi, dk, hw = 1) => [...box(0, 0, w, h, o), [1, 1, w - 2, h - 2, base], [2, 1, hw, h - 2, hi], [w - 3, 1, 2, h - 2, dk]];
const hand = (f, hi, gr, o) => [[2, 11, 6, 7, o], [3, 12, 4, 5, f], [3, 12, 4, 1, hi], [4, 14, 1, 3, gr], [6, 14, 1, 3, gr], [0, 13, 3, 4, o], [1, 14, 1, 2, f], [1, 14, 1, 1, hi]];
const shoe = (so, base, hi, cuff, b) => [[1, 1, 11, 6, so], [0, 3, 13, 5, so], [6, 1, 5, 4, cuff], [1, 3, 10, 3, base], [1, 3, 4, 2, b ? base : hi], [0, 6, 13, 2, so]];
const sleeve = o => box(1, 0, 7, 11, o);

const DEF = {
  jane: (() => {
    const B = '#50555E', St = '#646A75', D = '#3B3F46', K = '#43474F', V = '#2C2F35', Vh = '#383C43', BT = '#CED4DE', SH = '#DCE6F2', SHs = '#B5C5D8', O = '#17191C', BL = '#1E2024';
    return {
      neck: [[0, 0, 6, 7, O], [1, 0, 4, 4, SSH], [1, 1, 3, 3, SF], [1, 4, 4, 3, SH], [1, 4, 2, 2, SF]],
      chest: [...box(0, 0, 13, 16, O), [1, 1, 4, 4, SH], [2, 2, 2, 3, SHs], [1, 4, 4, 11, V], [3, 4, 1, 11, Vh], [2, 6, 1, 1, BT], [2, 9, 1, 1, BT], [2, 12, 1, 1, BT], [5, 1, 7, 14, B], [4, 2, 2, 13, D], [5, 3, 1, 5, St], [7, 1, 1, 14, St], [10, 1, 1, 14, St], [11, 1, 1, 14, D]],
      abdomen: [...box(0, 0, 12, 13, O), [1, 1, 4, 10, V], [2, 2, 1, 1, BT], [2, 5, 1, 1, BT], [2, 8, 1, 1, BT], [1, 10, 2, 2, BL], [4, 1, 7, 11, B], [4, 1, 1, 11, D], [6, 1, 1, 11, St], [9, 1, 1, 11, St], [7, 7, 3, 1, D]],
      pelvis: [...box(0, 0, 12, 11, O), [1, 1, 10, 9, B], [1, 1, 3, 2, BL], [3, 2, 1, 8, St], [6, 1, 1, 9, St], [9, 1, 2, 9, D]],
      uArm: b => [...box(0, 0, 8, 15, O), [1, 1, 6, 13, b ? K : B], [2, 1, 1, 13, b ? B : St], [5, 1, 2, 13, D]],
      lArm: b => [...sleeve(O), [2, 1, 5, 8, b ? K : B], [3, 1, 1, 8, b ? B : St], [6, 1, 1, 8, D], [2, 9, 5, 2, SH], [5, 9, 2, 2, SHs], ...hand(b ? SBK : SF, SHI, SSH, O)],
      thigh: b => [...limb(O, 9, 17, b ? K : B, b ? B : St, D), [5, 1, 1, 15, b ? B : St]],
      shin: b => limb(O, 8, 17, b ? K : B, b ? B : St, D),
      boot: b => shoe('#17110C', b ? '#472B16' : '#5C381E', '#784B2A', B, b)
    };
  })(),
  negan: (() => {
    const LT = '#1C1E22', LH = '#343942', LS = '#111316', SC = '#9E1F28', SCh = '#C22B36', SCs = '#6E131A', SV = '#C4CCD4', BB = '#754724', BBh = '#945C31', J = '#323438', Jh = '#43464C', Js = '#222428', O = '#0B0C0E';
    return {
      neck: [[0, 0, 6, 7, O], [1, 0, 4, 2, SF], [0, 2, 6, 5, O], [1, 2, 4, 5, SC], [1, 2, 3, 2, SCh], [2, 4, 3, 2, SCs]],
      chest: [...box(0, 0, 13, 16, O), [1, 1, 11, 14, LT], [1, 0, 4, 4, SC], [2, 1, 2, 2, SCh], [2, 3, 4, 5, LH], [5, 4, 1, 1, SV], [2, 6, 1, 1, SV], [3, 6, 1, 9, SV], [5, 7, 4, 1, SV], [7, 2, 2, 12, LH], [10, 1, 2, 14, LS]],
      abdomen: [...box(0, 0, 12, 13, O), [1, 1, 10, 11, LT], [3, 1, 1, 8, SV], [6, 3, 1, 4, SV], [7, 1, 2, 7, LH], [0, 8, 12, 4, O], [1, 9, 10, 2, LS], [2, 8, 3, 4, SV], [3, 9, 1, 2, LS]],
      pelvis: [...box(0, 0, 12, 11, O), [1, 1, 10, 9, J], [1, 1, 10, 2, BB], [4, 2, 7, 2, BB], [1, 1, 3, 2, BBh], [3, 1, 2, 2, SV], [2, 4, 2, 5, Jh], [8, 4, 3, 6, Js]],
      uArm: b => [...box(0, 0, 8, 15, O), [1, 1, 6, 13, LT], [2, 2, 2, 11, b ? LT : LH], [5, 1, 2, 13, LS]],
      // Negan wears leather gloves on both hands (they grip the bat).
      lArm: b => [...sleeve(O), [2, 1, 5, 10, LT], [3, 2, 2, 8, b ? LT : LH], [5, 7, 1, 3, SV], ...hand(b ? LS : LT, LH, O, O)],
      thigh: b => limb(O, 9, 17, b ? Js : J, b ? J : Jh, Js, 2),
      shin: b => [...box(0, 0, 8, 17, O), [1, 1, 6, 8, b ? Js : J], [2, 1, 2, 7, b ? J : Jh], [0, 8, 8, 8, O], [1, 9, 6, 7, LT], [2, 9, 2, 6, LH], [1, 13, 6, 1, LS], [3, 13, 1, 1, SV]],
      boot: b => [[1, 0, 12, 8, O], [0, 2, 13, 6, O], [6, 1, 5, 5, LT], [1, 3, 10, 3, LT], ...(b ? [] : [[1, 3, 4, 2, LH]]), [6, 3, 4, 1, LS], [0, 6, 13, 2, O]]
    };
  })(),
  homelander: (() => {
    const BL = '#263B59', BLh = '#39557D', BLs = '#1A283D', G = '#D9B13B', Gh = '#F5D76E', Gs = '#9C781B', RD = '#B81D26', RDh = '#DE2C37', RDs = '#7D1118', BR = '#BA5E28', BRh = '#D97B38', O = '#101722';
    return {
      neck: [[0, 0, 6, 7, O], [1, 0, 4, 3, SF], [1, 3, 4, 4, BL], [1, 3, 2, 3, RD], [3, 3, 1, 2, G]],
      chest: [...box(0, 0, 13, 16, O), [1, 1, 11, 14, BL], [1, 2, 4, 6, BLh], [4, 2, 1, 13, RD], [1, 8, 3, 1, BLs], [5, 0, 6, 4, G], [6, 1, 4, 2, Gh], [5, 3, 6, 1, Gs], [9, 4, 3, 11, BLs]],
      abdomen: [...box(0, 0, 12, 13, O), [1, 1, 10, 11, BL], [1, 1, 3, 8, BLh], [4, 1, 1, 8, RD], [1, 4, 3, 1, BLs], [1, 7, 3, 1, BLs], [8, 1, 3, 8, BLs], [0, 8, 12, 4, O], [1, 9, 10, 3, G], [1, 9, 3, 3, Gh], [2, 10, 1, 1, Gs], [8, 9, 3, 3, Gs]],
      pelvis: [...box(0, 0, 12, 11, O), [1, 1, 10, 9, BL], [1, 1, 3, 8, BLh], [8, 1, 3, 9, BLs]],
      uArm: b => [...box(0, 0, 8, 15, O), [1, 1, 6, 13, b ? BLs : BL], [2, 4, 2, 9, b ? BL : BLh], [0, 0, 8, 4, O], [1, 1, 6, 3, G], [2, 1, 3, 2, Gh], [1, 3, 6, 1, Gs]],
      lArm: b => [...sleeve(O), [2, 1, 5, 2, b ? BLs : BL], [2, 3, 5, 7, BR], [2, 3, 2, 7, BRh], [2, 5, 5, 1, Gs], [2, 8, 5, 1, Gs], ...hand(b ? RDs : RD, RDh, b ? '#5A0C11' : RDs, O)],
      thigh: b => limb(O, 9, 17, b ? BLs : BL, b ? BL : BLh, BLs, 2),
      shin: b => [...box(0, 0, 8, 17, O), [1, 1, 6, 5, b ? BLs : BL], [0, 6, 8, 10, O], [1, 6, 6, 10, b ? RDs : RD], [2, 6, 2, 2, G], ...(b ? [] : [[1, 8, 2, 7, RDh]])],
      boot: b => [[1, 0, 12, 8, O], [0, 2, 13, 6, O], [6, 1, 5, 5, b ? RDs : RD], [1, 3, 10, 3, b ? RDs : RD], ...(b ? [] : [[1, 3, 4, 2, RDh]]), [7, 2, 2, 2, G], [0, 6, 13, 2, '#2B080B']]
    };
  })(),
  walt: (() => {
    const G = '#6F8B52', Gh = '#88A66A', Gs = '#566E3F', Gd = '#3E5230', O = '#26301F', W = '#E9E7DF', Ws = '#BEBBAE', BN = '#E3E8CE', SK = '#8E9196', SKh = '#AEB1B6', T = '#A98558', Th = '#C6A375', Td = '#5A4529';
    return {
      neck: [[0, 0, 6, 7, O], [1, 0, 4, 4, SSH], [1, 1, 3, 3, SF], [1, 4, 4, 3, G], [1, 4, 2, 2, SF], [3, 4, 2, 1, Gh]],
      chest: [...box(0, 0, 13, 16, O), [1, 1, 11, 14, G], [1, 1, 4, 3, Gh], [2, 1, 2, 3, SF], [3, 4, 1, 11, Gs], [3, 6, 1, 1, BN], [3, 9, 1, 1, BN], [3, 12, 1, 1, BN], [7, 5, 3, 3, Gs], [7, 5, 3, 1, Gd], [9, 1, 3, 14, Gs]],
      abdomen: [...box(0, 0, 12, 13, O), [1, 1, 10, 11, G], [3, 1, 1, 10, Gs], [3, 3, 1, 1, BN], [3, 7, 1, 1, BN], [5, 4, 2, 1, Gh], [8, 1, 3, 11, Gs]],
      pelvis: [...box(0, 0, 12, 11, O), [1, 1, 10, 3, G], [1, 3, 10, 1, Gs], [1, 4, 10, 6, W], [1, 4, 3, 6, '#F6F4EC'], [8, 4, 3, 6, Ws]],
      uArm: b => [...box(0, 0, 8, 15, O), [1, 1, 6, 13, b ? Gs : G], [2, 1, 1, 13, b ? G : Gh], [5, 1, 2, 13, Gs]],
      lArm: b => [...sleeve(O), [2, 1, 5, 8, b ? Gs : G], [3, 1, 1, 8, b ? G : Gh], [6, 1, 1, 8, Gs], [2, 9, 5, 2, Gs], [5, 9, 1, 1, BN], ...hand(b ? SBK : SF, SHI, SSH, O)],
      thigh: b => [...limb(O, 9, 17, b ? SBK : SF, b ? SF : SHI, SSH), [1, 1, 7, 4, b ? Ws : W], [1, 4, 7, 1, Ws]],
      shin: b => [...limb(O, 8, 17, b ? SBK : SF, b ? SF : SHI, SSH), [1, 10, 6, 6, SK], [2, 10, 1, 6, SKh], [1, 12, 6, 1, SKh]],
      boot: b => shoe(Td, b ? '#8C6B42' : T, Th, SK, b)
    };
  })(),
  saul: (() => {
    const J = '#22242B', Jb = '#1A1C21', P = '#363A45', D = '#121317', O = '#08090C', PK = '#E8478F', PKh = '#F46FA8', PKs = '#B8316B', TI = '#1D2540', TK = '#2B3560', TD = '#5767A0', BE = '#7A4A28', BEh = '#9B6137', SV = '#C9CED6', PS = '#E0583C', TL = '#2EB8B0';
    return {
      neck: [[0, 0, 6, 7, O], [1, 0, 4, 4, SSH], [1, 1, 3, 3, SF], [1, 4, 4, 3, PK], [2, 4, 2, 3, TK]],
      chest: [...box(0, 0, 13, 16, O), [1, 1, 11, 14, J], [1, 1, 4, 14, PK], [1, 1, 1, 14, PKh], [2, 1, 2, 14, TI], [2, 1, 2, 2, TK], [2, 5, 1, 1, TD], [3, 7, 1, 1, TD], [2, 9, 1, 1, TD], [3, 11, 1, 1, TD], [3, 13, 1, 1, TD], [5, 2, 2, 13, D], [5, 4, 1, 1, TL], [7, 1, 1, 14, P], [10, 1, 1, 14, P], [11, 1, 1, 14, D], [8, 5, 2, 1, PS], [9, 5, 1, 1, '#F2D6C8']],
      abdomen: [...box(0, 0, 12, 13, O), [1, 1, 10, 11, J], [1, 1, 3, 11, PK], [1, 1, 1, 11, PKh], [2, 1, 2, 11, TI], [2, 4, 1, 1, TD], [3, 7, 1, 1, TD], [2, 10, 1, 1, TD], [4, 1, 2, 11, D], [7, 1, 1, 11, P], [9, 1, 1, 11, P]],
      pelvis: [...box(0, 0, 12, 11, O), [1, 1, 10, 9, J], [1, 1, 10, 2, BE], [1, 1, 3, 2, BEh], [2, 1, 2, 2, SV], [3, 3, 1, 7, P], [6, 3, 1, 7, P], [9, 3, 2, 7, D]],
      uArm: b => [...box(0, 0, 8, 15, O), [1, 1, 6, 13, b ? Jb : J], [2, 1, 1, 13, P], [5, 1, 2, 13, D]],
      lArm: b => [...sleeve(O), [2, 1, 5, 8, b ? Jb : J], [3, 1, 1, 8, P], [6, 1, 1, 8, D], [2, 9, 5, 2, PK], [5, 9, 2, 2, PKs], ...hand(b ? SBK : SF, SHI, SSH, O)],
      thigh: b => [...limb(O, 9, 17, b ? Jb : J, P, D), [5, 1, 1, 15, P]],
      shin: b => limb(O, 8, 17, b ? Jb : J, P, D),
      boot: b => shoe(O, b ? '#0F1013' : '#16171A', '#383B42', b ? Jb : J, b)
    };
  })()
};
const DIM = { neck: [6, 7], chest: [13, 16], abdomen: [12, 13], pelvis: [12, 11], uArm: [8, 15], lArm: [8, 18], thigh: [9, 17], shin: [8, 17], boot: [13, 8] };
const SK_ = {};
for (const k in DEF) {
  SK_[k] = {};
  for (const p in DIM) {
    const f = DEF[k][p], [w, h] = DIM[p];
    if (typeof f === 'function') { SK_[k][p + 'F'] = spr(w, h, f(0)); SK_[k][p + 'B'] = spr(w, h, f(1)); }
    else SK_[k][p] = spr(w, h, f);
  }
}
/* Lucille: a baseball bat wrapped in barbed wire (26x9 sprite, 3px per cell, handle on the left). */
const BAT_SPR=(()=>{
  const W=26,H=9,C=4,c=mk();c.width=W;c.height=H;const g=c.getContext('2d');
  const O='#1a0e08',WD='#8c5a2b',WH='#b8803f',WS='#5c3a1b',TP='#25252a',TPh='#4a4a52',WR='#cfd5df',WRs='#737a88',BL='#7a0e14';
  for(let x=0;x<W;x++){
    const h=x<9?1:x<16?(x<12?1:2):2, top=C-h-1, bot=C+h+1;
    g.fillStyle=O;g.fillRect(x,top,1,bot-top+1);
    for(let y=top+1;y<=bot-1;y++){
      if(x<8) g.fillStyle=y===top+1?TPh:TP; else g.fillStyle=y===top+1?WH:(y===bot-1?WS:WD);
      g.fillRect(x,y,1,1);
    }
  }
  g.clearRect(W-1,C-3,1,1);g.clearRect(W-1,C+3,1,1);
  for(const x of [12,15,18,21,24]){
    const h=x<16?2:2, top=C-h-1, bot=C+h+1;
    for(let y=top+1;y<=bot-1;y++){g.fillStyle=(y+x)%2?WR:WRs;g.fillRect(x,y,1,1);}
    g.fillStyle=WR;g.fillRect(x,top-1,1,1);g.fillRect(x,bot+1,1,1);
    g.fillStyle=O;g.fillRect(x,top,1,1);g.fillRect(x,bot,1,1);
  }
  g.fillStyle=BL;for(const [x,y] of [[17,3],[19,5],[22,4],[14,5],[20,2],[23,6],[16,4]])g.fillRect(x,y,1,1);
  return c;
})();
function drawBat(g,f){
  const R=f.rig; if(!R||!R.bd||f.batLost||f.hp<=0)return;
  const w=R.wN,v=R.bd;
  g.save();g.imageSmoothingEnabled=false;
  g.translate(w.x-v.x*16,w.y-v.y*16);g.rotate(Math.atan2(v.y,v.x));
  if(v.x<0)g.scale(1,-1);
  g.drawImage(BAT_SPR,0,-13.5,78,27);
  g.restore();
}
function drawDroppedBat(g,b){
  const gy=b.gy||468;
  g.save();g.imageSmoothingEnabled=false;
  const shA=clamp(1-(gy-b.y)/140,.15,1)*.34;
  g.fillStyle=`rgba(0,0,0,${shA})`;
  const sx=Math.round(b.x/3)*3, sy=Math.round((gy+2)/3)*3;
  g.fillRect(sx-30,sy-3,60,6);
  g.translate(b.x,b.y);g.rotate(b.ang);
  if(b.flip<0)g.scale(1,-1);
  g.drawImage(BAT_SPR,-39,-13.5,78,27);
  g.restore();
}
// A small dark-gray pixel pistol; every draw creates a new physical weapon
// when the hand reaches the holster rather than reusing a discarded one.
const GUN_SPR=(()=>{
  const c=mk();c.width=12;c.height=8;const g=c.getContext('2d');
  g.fillStyle='#101217';g.fillRect(1,1,10,4);g.fillRect(2,4,4,4);
  g.fillStyle='#363b43';g.fillRect(2,1,8,2);g.fillRect(3,3,5,1);
  g.fillStyle='#656d76';g.fillRect(3,1,6,1);g.fillRect(9,2,2,1);
  g.fillStyle='#292d33';g.fillRect(3,4,2,3);
  g.fillStyle='#181b20';g.fillRect(4,5,2,3);g.fillRect(10,3,2,1);
  return c;
})();
function drawHeldGun(g,f){
  if(!f.hypGun||!f.rig)return;
  const v=f.hypGunDir||{x:f.dir,y:0},w=f.rig.wN;
  g.save();g.imageSmoothingEnabled=false;
  g.translate(w.x,w.y);g.rotate(Math.atan2(v.y,v.x));
  if(v.x<0)g.scale(1,-1);
  g.drawImage(GUN_SPR,-7,-6,30,20);
  g.restore();
}
function drawDroppedGun(g,b){
  g.save();g.imageSmoothingEnabled=false;
  g.translate(b.x,b.y);g.rotate(b.ang);
  if(b.flip<0)g.scale(1,-1);
  g.drawImage(GUN_SPR,-15,-10,30,20);
  g.restore();
}
/* ============================ WOUNDS ============================ */
function newWounds(){
  const w={head:[],torso:[],uN:[],uF:[],fN:[],fF:[],hN:[],hF:[],tN:[],tF:[],sN:[],sF:[],rips:[],clothHits:0,tieTorn:false};
  const m=(k,o)=>Object.assign({k,a:rnd(TAU),old:false,v:.8,r:3},o);
  w.head.push(m('scar',{x:8.4,y:-6.2,r:2.8,v:.65,a:-.5}));
  w.torso.push(m('scar',{x:7,y:38,r:3.8,v:.55}));
  return w;
}
function addW(f,part,o){
  const L=f.wounds[part]; L.push(Object.assign({a:rnd(TAU),old:false,v:.8,r:4},o));
  if(L.length>15){const i=L.findIndex(x=>x.k!=='scar'&&x.k!=='lip'&&x.k!=='nose'&&!x.old);L.splice(i<0?0:i,1);}
}
function drawWound(ctx,w,x,y){
  const r=w.r,v=w.v,c=Math.cos(w.a),s=Math.sin(w.a);
  switch(w.k){
    case 'bruise': {
      const q=3, pattern=[[-2,-1,2,1],[-1,-2,2,1],[0,-1,2,2],[-2,1,2,1],[-1,0,3,1],[1,1,1,1],[-1,2,2,1]];
      for(let i=0;i<pattern.length;i++){
        const [ox,oy,ww,hh]=pattern[i], px=Math.round((x+ox*q)/q)*q, py=Math.round((y+oy*q)/q)*q;
        ctx.fillStyle=w.old?`rgba(150,132,65,${(.16+(i%3)*.045)*v})`:`rgba(${i%3===0?'65,34,91':i%3===1?'103,45,111':'139,61,112'},${(.19+(i%3)*.055)*v})`;
        ctx.fillRect(px,py,ww*q,hh*q);
      }
      break;
    }
    case 'scratch':
      ctx.lineCap='round';ctx.strokeStyle=`rgba(160,45,38,${.5+.3*v})`;ctx.lineWidth=.65;
      for(let i=-1;i<=1;i++){
        ctx.beginPath();ctx.moveTo(x-c*r+s*i*1.4,y-s*r-c*i*1.4);ctx.lineTo(x+c*r+s*i*1.4,y+s*r-c*i*1.4);ctx.stroke();
      }
      break;
    case 'abr':
      ctx.fillStyle='rgba(190,70,60,.35)';ctx.beginPath();ctx.ellipse(x,y,r*1.2,r*.8,w.a,0,TAU);ctx.fill();
      break;
    case 'scar':
      ctx.lineCap='round';ctx.strokeStyle='rgba(255,228,208,.6)';ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(x-c*r,y-s*r);ctx.lineTo(x+c*r,y+s*r);ctx.stroke();
      ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(x-s*1.2,y+c*1.2);ctx.lineTo(x+s*1.2,y-c*1.2);ctx.stroke();
      break;
  }
}
function footDirRag(k,a,dir){
  let sx=a.x-k.x,sy=a.y-k.y;const L=Math.hypot(sx,sy)||1;sx/=L;sy/=L;let fx=-sy,fy=sx;
  if(Math.abs(fx)>.3){if(fx*dir<0){fx=-fx;fy=-fy}}else if(fy>0){fx=-fx;fy=-fy}
  return {x:fx,y:fy};
}
/* ============================ SKIN DRAW HELPERS ============================ */
function drawSkinSegment(g, sprite, a, b, width, padA, padB, flip) {
  if (!sprite || !a || !b) return;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  if (len < .5) return;
  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(a.x, a.y);
  g.rotate(Math.atan2(dy, dx) - Math.PI / 2);
  if (flip) g.scale(-1, 1);
  g.drawImage(sprite, -width / 2, -padA, width, len + padA + padB);
  g.restore();
}
function pointBetween(a, b, t) { return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }; }
function drawSkinBoot(g, sprite, ankle, footDir, facing, width, height) {
  if (!sprite || !ankle || !footDir) return;
  const toe = { x: ankle.x + footDir.x * 19, y: ankle.y + footDir.y * 19 };
  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(ankle.x, ankle.y);
  g.rotate(Math.atan2(toe.y - ankle.y, toe.x - ankle.x) - Math.PI);
  if (facing === 1) g.scale(1, -1);
  g.drawImage(sprite, -width * .72, -height * .45, width, height);
  g.restore();
}
function drawSkinLimbWounds(g, list, a, b, width, dir) {
  if (!list || !list.length) return;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const nx = dir * dy / len, ny = -dir * dx / len;
  for (const wound of list) {
    drawWound(g, wound, a.x + dx * wound.t + nx * wound.s * width, a.y + dy * wound.t + ny * wound.s * width);
  }
}
function drawPixelBand(g, a, b, t, halfWidth, thickness, color, edge) {
  if (!a || !b) return;
  const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy)||1;
  const nx=-dy/len, ny=dx/len;
  const cx=a.x+dx*t, cy=a.y+dy*t;
  g.save(); g.lineCap='butt'; g.lineJoin='miter';
  g.strokeStyle=edge||'rgba(0,0,0,.75)'; g.lineWidth=thickness+2;
  g.beginPath(); g.moveTo(cx-nx*halfWidth,cy-ny*halfWidth); g.lineTo(cx+nx*halfWidth,cy+ny*halfWidth); g.stroke();
  g.strokeStyle=color; g.lineWidth=thickness;
  g.beginPath(); g.moveTo(cx-nx*halfWidth,cy-ny*halfWidth); g.lineTo(cx+nx*halfWidth,cy+ny*halfWidth); g.stroke();
  g.restore();
}
function drawPixelStitch(g, a, b, t0, t1, offset, color, step=5) {
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
  g.fillStyle=color;
  for(let t=t0;t<=t1;t+=step){const x=a.x+dx*t+nx*offset,y=a.y+dy*t+ny*offset;g.fillRect(Math.round(x),Math.round(y),2,1);}
}
function drawSkinOutfitDetails(g, R, f, mode='all') {
  const skin=f.skin, n=R.neck, p=R.pel, dir=R.dir;
  let ux=p.x-n.x,uy=p.y-n.y; const len=Math.hypot(ux,uy)||1; ux/=len;uy/=len;
  const scale=len/54;
  if(mode!=='arms'){
  g.save(); g.transform(dir*uy,-dir*ux,ux*scale,uy*scale,n.x,n.y);
  const px=(x,y,w,h,c)=>{g.fillStyle=c;g.fillRect(x,y,w,h);};
  const line=(x1,y1,x2,y2,c,w=1)=>{g.strokeStyle=c;g.lineWidth=w;g.lineCap='butt';g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();};
  if(skin==='jane'){
    px(-3,-1,6,8,'#DCE5EF'); px(-1,0,2,7,'#F3F5F7');
    line(-5,2,-10,14,'#858B96',1.5); line(5,2,10,14,'#858B96',1.5);
    line(-10,14,-7,29,'#25282E',2); line(10,14,7,29,'#25282E',2);
    line(-3,8,-2,42,'#202329',2); line(3,8,2,42,'#202329',2);
    for(let y=14;y<42;y+=6) px(-.5,y,1,1,'#D4D8DE');
    for(let x of [-12,-8,8,12]) for(let y=16;y<48;y+=7) px(x,y,1,3,'#858B96');
    px(-10,17,3,1,'#AEB5C0'); px(7,17,3,1,'#AEB5C0');
    line(-12,31,-8,31,'#9DA4AE',1); line(8,31,12,31,'#9DA4AE',1);
  } else if(skin==='negan'){
    px(-5,-1,10,8,'#8E1C27'); px(-4,0,8,3,'#C52D38');
    line(-4,4,-11,16,'#555B64',2); line(4,4,11,16,'#555B64',2);
    line(1,8,2,43,'#090B0E',2); line(2,10,3,42,'#737982',1);
    for(let y=13;y<42;y+=4) px(2,y,1,1,'#C4CBD2');
    line(-11,18,-7,30,'#090B0E',2); line(11,18,7,30,'#090B0E',2);
    px(-12,22,3,1,'#69717B'); px(9,22,3,1,'#69717B');
    line(-9,39,-4,41,'#565B63',1); line(5,39,10,37,'#565B63',1);
  } else if(skin==='homelander'){
    line(-4,3,-4,42,'#A91B2B',1.5); line(4,3,4,42,'#A91B2B',1.5);
    for(let y=10;y<42;y+=4){line(-10,y,-6,y+1,'#49658A',.8);line(6,y+1,10,y,'#172941',.8);}
    px(-2,9,4,2,'#D7B23F'); px(-1,8,2,4,'#F2D46B');
    line(-12,44,12,44,'#9A741E',3); line(-12,43,12,43,'#F0D36A',1);
    px(-2,41,4,5,'#D7B23F'); px(-1,42,2,2,'#FFF0A0');
    line(-10,49,-7,52,'#D6B34C',1); line(10,49,7,52,'#D6B34C',1);
  } else if(skin==='walt'){
    px(-4,-1,8,6,'#D2D8C4'); line(-4,0,-1,6,'#F0EEDC',1); line(4,0,1,6,'#F0EEDC',1);
    line(0,4,0,43,'#3F5630',1.5);
    for(let y=10;y<42;y+=6) px(-.5,y,1,1,'#E4E6D5');
    for(let x of [-8,4]){
      g.strokeStyle='#3E542F';g.lineWidth=1;g.strokeRect(x,13,4,7);
      line(x,13,x+4,13,'#9EB17F',1); px(x+2,16,1,1,'#D7DEC5');
    }
    line(-11,8,-8,13,'#91A878',1); line(11,8,8,13,'#455D35',1);
    for(let y=25;y<43;y+=5){line(-11,y,-8,y+1,'#536D3D',.7);line(8,y+1,11,y,'#40542E',.7);}
  } else if(skin==='saul'){
    px(-4,-1,8,8,'#EF5B9A'); line(-4,0,-9,15,'#777B85',2); line(4,0,9,15,'#777B85',2);
    line(-9,15,-7,34,'#111318',2); line(9,15,7,34,'#111318',2);
    px(-11,17,3,2,'#E9E6DF'); px(-10,18,2,1,'#D84B87');
    line(-12,34,-7,35,'#4A4E59',1); line(7,35,12,34,'#4A4E59',1);
    line(-3,42,3,42,'#A56B37',2); px(-1,40,3,4,'#C08B4E');
  }
  g.restore();
  }
  const arm=(side)=>({el:R['e'+side],wr:R['w'+side]});
  for(const side of ['F','N']){
    const {el,wr}=arm(side), sh=R.sh;
    if(skin==='jane'){
      drawPixelBand(g,el,wr,.84,7,3,'#DCE5EF','#202329');
      drawPixelBand(g,sh,el,.16,7,2,'#737A85','#202329');
      drawPixelStitch(g,sh,el,.22,.8,5,'#858C97',6);
    } else if(skin==='negan'){
      drawPixelBand(g,el,wr,.16,7,2,'#555B64','#08090B');
      drawPixelBand(g,el,wr,.82,7,2,'#17191D','#08090B');
      drawPixelStitch(g,sh,el,.18,.85,5,'#4B5058',7);
    } else if(skin==='homelander'){
      drawPixelBand(g,sh,el,.12,9,5,'#D6B13F','#101722');
      drawPixelBand(g,el,wr,.18,8,4,'#B51C28','#5C1018');
      drawPixelBand(g,el,wr,.27,8,2,'#E4B74B','#5C1018');
    } else if(skin==='walt'){
      drawPixelBand(g,el,wr,.22,8,4,'#8DA66C','#35452B');
      drawPixelBand(g,el,wr,.28,7,2,'#C0D09D','#35452B');
      drawPixelStitch(g,sh,el,.18,.78,5,'#91A979',7);
    } else if(skin==='saul'){
      drawPixelBand(g,el,wr,.82,7,3,'#E84D91','#101116');
      drawPixelBand(g,sh,el,.15,7,2,'#4A4D58','#101116');
      drawPixelStitch(g,sh,el,.2,.8,5,'#626774',6);
    }
  }
  if(mode!=='arms') for(const side of ['F','N']){
    const hip=R.pel,knee=R['k'+side],ankle=R['a'+side];
    if(skin==='jane'||skin==='saul'){
      drawPixelStitch(g,hip,knee,.18,.85,7,skin==='jane'?'#777E89':'#555A65',5);
      drawPixelStitch(g,knee,ankle,.18,.82,5,skin==='jane'?'#777E89':'#454A54',5);
    } else if(skin==='negan'){
      drawPixelBand(g,knee,ankle,.12,7,2,'#454A52','#15171B');
      drawPixelStitch(g,hip,knee,.18,.82,7,'#545961',6);
    } else if(skin==='walt'){
      drawPixelBand(g,knee,ankle,.13,7,3,'#777C83','#34383D');
      drawPixelBand(g,knee,ankle,.2,6,1,'#B8BBC0','#34383D');
    } else if(skin==='homelander'){
      drawPixelBand(g,knee,ankle,.15,7,3,'#B81D26','#4A1017');
      drawPixelBand(g,knee,ankle,.22,7,1,'#E1B94D','#4A1017');
    }
  }
  const drawRaggedHole=(x,y,size,angle,cloth,under,phase)=>{
    g.save();g.translate(x,y);g.rotate(angle);
    const q=2, w=size, h=Math.max(6,size*.72);
    g.fillStyle='#090A0D';g.fillRect(-w/2-1,-h/2-1,w+2,h+2);
    g.fillStyle=under;g.fillRect(-w/2+q,-h/2+q,Math.max(2,w-2*q),Math.max(2,h-2*q));
    g.fillStyle='rgba(0,0,0,.35)';g.fillRect(-w/2+q,-h/2+q,Math.max(2,w-2*q),2);
    g.fillStyle=cloth;
    g.fillRect(-w/2-3,-h/2-2,Math.max(3,w*.36),3);
    g.fillRect(w*.16,-h/2-3,Math.max(3,w*.34),3);
    g.fillRect(-w/2-3,h/2-1,Math.max(3,w*.28),3);
    g.fillRect(w/2-1,-h/2+2,3,Math.max(3,h*.4));
    const flap=Math.sin(f.t*8+phase)*2.2;
    g.fillStyle=cloth;g.fillRect(w*.16,h/2-1,3,6+flap);
    g.fillStyle='rgba(0,0,0,.45)';g.fillRect(w*.16+2,h/2+2,1,Math.max(2,4+flap));
    g.restore();
  };
  for(const rip of (f.wounds.rips||[])){
    if(rip.part==='torso' && mode!=='arms') { const wx=n.x+dir*uy*rip.x+ux*scale*rip.y, wy=n.y-dir*ux*rip.x+uy*scale*rip.y; drawRaggedHole(wx,wy,rip.size,rip.angle,rip.cloth,rip.under,rip.phase); }
    else if(rip.part!=='torso'){
      const map={uN:[R.sh,R.eN],uF:[R.sh,R.eF],fN:[R.eN,R.wN],fF:[R.eF,R.wF],tN:[R.pel,R.kN],tF:[R.pel,R.kF],sN:[R.kN,R.aN],sF:[R.kF,R.aF]};
      const pair=map[rip.part];
      if(pair && (mode==='arms' ? rip.part[0]==='u'||rip.part[0]==='f' : true)){
        const pt=pointBetween(pair[0],pair[1],rip.t); const dx=pair[1].x-pair[0].x,dy=pair[1].y-pair[0].y;
        drawRaggedHole(pt.x+(-dy/Math.hypot(dx,dy))*rip.side*5,pt.y+(dx/Math.hypot(dx,dy))*rip.side*5,rip.size,rip.angle,rip.cloth,rip.under,rip.phase);
      }
    }
  }
  const tear=(a,b,list,width,color)=>{
    if(!list||!list.length)return;
    for(const w of list){ if(w.k==='scar')continue; const t=clamp(w.t??.5,.12,.9); const x=a.x+(b.x-a.x)*t, y=a.y+(b.y-a.y)*t;
      g.fillStyle='rgba(7,8,10,.88)';g.fillRect(Math.round(x-2),Math.round(y-1),5,3);
      g.fillStyle=color;g.fillRect(Math.round(x-3),Math.round(y-2),2,1);g.fillRect(Math.round(x+2),Math.round(y+2),2,1);
    }
  };
  if(mode!=='arms') tear(R.sh,R.pel,f.wounds.torso,12,skin==='walt'?'#88A66A':'#A5AAB2');
  for(const side of ['F','N']){
    tear(R.sh,R['e'+side],f.wounds['u'+side],8,'#A5AAB2');
    tear(R['e'+side],R['w'+side],f.wounds['f'+side],8,'#A5AAB2');
    tear(R.pel,R['k'+side],f.wounds['t'+side],9,'#A5AAB2');
    tear(R['k'+side],R['a'+side],f.wounds['s'+side],8,'#A5AAB2');
  }
}
function drawSkinTorsoWounds(g, R, f) {
  const n = R.neck, p = R.pel, dir = R.dir;
  let ux = p.x - n.x, uy = p.y - n.y;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len; uy /= len;
  const scale = len / 54;
  g.save();
  g.transform(dir * uy, -dir * ux, ux * scale, uy * scale, n.x, n.y);
  for (const wound of f.wounds.torso) drawWound(g, wound, wound.x, wound.y);
  g.restore();
}
/* Homelander's full-length pixel-art American flag cape (15x49 sprite, sliced along a 7-segment Verlet spine). */
const CAPE_TEX=(()=>{
  const W=15,H=49,c=mk();c.width=W;c.height=H;const g=c.getContext('2d');
  const O='#0B1018',RD='#B81D26',RDs='#88131B',RDh='#D42934',WH='#EDE9DE',WHs='#CCC7BA',WHh='#F7F4EC';
  const BL='#1E3354',BLs='#14233B',BLh='#2A456F',ST='#F6F4EC',GD='#D9B13B',GDh='#F5D76E';
  g.fillStyle=O;g.fillRect(0,0,W,H);
  // 7 vertical alternating red & white stripes across inner columns x=1..13
  for(let y=2;y<H-1;y++){
    for(let x=1;x<=13;x++){
      const s=Math.floor((x-1)/2); // 0..6
      const isRed=(s%2===0);
      if(isRed){
        g.fillStyle=x===1||x===13?RDs:(x%2===1?RDh:RD);
      }else{
        g.fillStyle=x<=2?WHs:(x%2===1?WHh:WH);
      }
      g.fillRect(x,y,1,1);
    }
  }
  // Subtle horizontal cloth-fold shading bands so long drape feels dimensional
  for(const fy of [14,28,40]){
    g.fillStyle='rgba(8,12,20,.16)';g.fillRect(1,fy,13,2);
  }
  // Upper star-spangled blue canton on the outer side of the draped flag (x=6..13, y=2..20)
  g.fillStyle='#101B2E';g.fillRect(5,2,9,19);
  g.fillStyle=BL;g.fillRect(6,2,8,18);
  g.fillStyle=BLh;g.fillRect(6,2,2,18);
  g.fillStyle=BLs;g.fillRect(13,2,1,18);
  g.fillStyle=ST;
  for(let row=0;row<8;row++){
    const py=3+row*2;
    const shift=row%2;
    for(let col=0;col<3;col++){
      const px=7+col*2+shift;
      if(px<=12&&py<=18)g.fillRect(px,py,1,1);
    }
  }
  // Gold shoulder clasp / cord at the collar (y=0..1)
  g.fillStyle=O;g.fillRect(0,0,W,1);
  g.fillStyle=GD;g.fillRect(1,1,W-2,1);
  g.fillStyle=GDh;g.fillRect(3,1,5,1);
  return c;
})();
function drawSkinCape(g, R, f) {
  if (f.skin !== 'homelander') return;
  const sh = R.sh, pel = R.pel, n = R.neck, dir = R.dir;
  const anchor = { x: sh.x - dir * 5, y: sh.y + 1 };
  let pts;
  if (f.cape && f.cape.length === CAPE_N) {
    pts = [anchor, ...f.cape];
  } else {
    let ux = pel.x - n.x, uy = pel.y - n.y;
    const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
    const bx = -dir * uy, by = dir * ux;
    pts = [anchor];
    for (let i = 1; i <= CAPE_N; i++) {
      pts.push({
        x: anchor.x + ux * (i * CAPE_SEG) + bx * (3 + i * 2.1),
        y: Math.min(f.gy - 2, anchor.y + uy * (i * CAPE_SEG) + by * (3 + i * 2.1))
      });
    }
  }
  const flip = dir === 1;
  const rowsPerSeg = 7;
  g.save();
  g.imageSmoothingEnabled = false;
  for (let i = 0; i < CAPE_N; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < .4) continue;
    const w = 20 + i * 2.7;
    const padA = i === 0 ? 1 : (i === 3 ? 1.2 : 2.6);
    const padB = i === CAPE_N - 1 ? 1 : 2.6;
    g.save();
    g.translate(a.x, a.y);
    g.rotate(Math.atan2(dy, dx) - Math.PI / 2);
    if (flip) g.scale(-1, 1);
    g.drawImage(CAPE_TEX, 0, i * rowsPerSeg, 15, rowsPerSeg, -w * .16, -padA, w, len + padA + padB);
    g.restore();
  }
  g.restore();
}
function drawSkinHead(g, R, f) {
  const head = R.head, neck = R.neck, data = skinHeads[f.skin];
  if (!data || !data.img || !data.loaded || !data.img.complete || !data.img.naturalWidth) return;
  const angle = Math.atan2(head.y - neck.y, head.x - neck.x) + Math.PI / 2;
  const height = 44; // heads are ~2% larger than before
  const aspect = clamp(data.aspect || .8, .55, 1.35);
  const width = height * aspect;
  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(head.x, head.y);
  g.rotate(angle);
  g.drawImage(data.img, -width / 2, -height * .60 - 1, width, height);
  for (const wound of f.wounds.head) {
    if (wound.k === 'bruise' || wound.k === 'scratch' || wound.k === 'scar') drawWound(g, wound, wound.x, wound.y);
  }
  g.restore();
}
function drawSaulTie(g, R, f) {
  if (f.skin !== 'saul' || !f.tie || !R) return;
  const n = R.neck, p = R.pel, dir = R.dir;
  let ux = p.x - n.x, uy = p.y - n.y; const len = Math.hypot(ux, uy) || 1; ux /= len; uy /= len;
  const scale = len / 54;
  const world = (lx, ly) => ({ x: n.x + dir * uy * lx + ux * scale * ly, y: n.y - dir * ux * lx + uy * scale * ly });
  const pts = [world(7, 3), ...f.tie];
  g.save(); g.imageSmoothingEnabled = false;
  const k0 = pts[0];
  g.fillStyle = '#B8860B';
  g.fillRect(Math.round(k0.x / 3) * 3 - 3, Math.round(k0.y / 3) * 3 - 3, 6, 6);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    const w = [4, 4, 5, 5, 6, 6][i] || 6;
    const hw = Math.round(w / 2);
    const steps = Math.max(2, Math.ceil(L / 3));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const x = Math.round((a.x + dx * t) / 3) * 3, y = Math.round((a.y + dy * t) / 3) * 3;
      g.fillStyle = '#F2C230';
      g.fillRect(x - hw, y - 1, w, 3);
      g.fillStyle = '#FFE889';
      g.fillRect(x - hw, y - 1, w, 1);
      if (k % 3 === 2) { g.fillStyle = '#B9841A'; g.fillRect(x + hw - 1, y + 1, 1, 2); }
    }
  }
  g.restore();
}
function drawPixelArm(g, R, f, side, far, S) {
  const prefix = far ? 'F' : 'N';
  const elbow = R['e' + prefix], wrist = R['w' + prefix];
  const upper = far ? S.uArmB : S.uArmF;
  const lower = far ? S.lArmB : S.lArmF;
  drawSkinSegment(g, upper, R.sh, elbow, far ? 18 : 19, 4, 4, R.dir === 1);
  drawSkinSegment(g, lower, elbow, wrist, 18, 3, 5, R.dir === 1);
  drawSkinLimbWounds(g, f.wounds['u' + prefix], R.sh, elbow, 8, R.dir);
  drawSkinLimbWounds(g, f.wounds['f' + prefix], elbow, wrist, 8, R.dir);
}
function drawPixelLeg(g, R, f, far, S) {
  const prefix = far ? 'F' : 'N';
  const knee = R['k' + prefix], ankle = R['a' + prefix], foot = R[far ? 'fdF' : 'fdN'];
  drawSkinSegment(g, far ? S.thighB : S.thighF, R.pel, knee, far ? 20 : 21, 5, 5, R.dir === 1);
  drawSkinSegment(g, far ? S.shinB : S.shinF, knee, ankle, 18, 4, 4, R.dir === 1);
  drawSkinLimbWounds(g, f.wounds['t' + prefix], R.pel, knee, 10, R.dir);
  drawSkinLimbWounds(g, f.wounds['s' + prefix], knee, ankle, 8, R.dir);
  drawSkinBoot(g, far ? S.bootB : S.bootF, ankle, foot, R.dir, 29, 18);
}
// Orange laser scorch marks anchored to skin segments and masked strictly onto skin pixels ('source-atop').
const BURN_SEGS=[
  ['torso','sh','pel',15,'body'],
  ['uF','sh','eF',7,'body'],
  ['fF','eF','wF',6,'body'],
  ['tF','pel','kF',8,'body'],
  ['sF','kF','aF',7,'body'],
  ['tN','pel','kN',8,'body'],
  ['sN','kN','aN',7,'body'],
  ['uN','sh','eN',7,'front'],
  ['fN','eN','wN',6,'front']
];
const BURN_MAP=Object.fromEntries(BURN_SEGS.map(s=>[s[0],s]));
// Store marks in the struck joint's local coordinates so they follow animated
// limbs, ragdolls and kneeling fighters rather than remaining in world space.
function locateSurface(R,x,y){
  if(!R)return null;
  let seg='head',layer='head',hw=15,best=Math.hypot(x-R.head.x,y-(R.head.y-6))-15;
  for(const [name,kA,kB,width,part] of BURN_SEGS){
    const A=R[kA],B=R[kB];if(!A||!B)continue;
    const d=distSeg(x,y,A.x,A.y,B.x,B.y)-width;
    if(d<best){best=d;seg=name;layer=part;hw=width;}
  }
  if(seg==='head'){
    const angle=Math.atan2(R.head.y-R.neck.y,R.head.x-R.neck.x)+Math.PI/2;
    const ca=Math.cos(angle),sa=Math.sin(angle),dx=x-R.head.x,dy=y-R.head.y;
    return {seg,layer,lx:clamp(dx*ca+dy*sa+rnd(-2,2),-13,13),ly:clamp(-dx*sa+dy*ca+rnd(-2,2),-22,14)};
  }
  const info=BURN_MAP[seg],A=R[info[1]],B=R[info[2]],dx=B.x-A.x,dy=B.y-A.y,len=Math.hypot(dx,dy)||1;
  const t=clamp(((x-A.x)*dx+(y-A.y)*dy)/(len*len)+rnd(-.04,.04),.08,.92);
  const nx=R.dir*dy/len,ny=-R.dir*dx/len;
  const perp=(x-(A.x+dx*t))*nx+(y-(A.y+dy*t))*ny;
  return {seg,layer,t,s:clamp(perp+rnd(-1.5,1.5),-hw*.78,hw*.78)};
}
function paintBurnSpot(g,wx,wy,b){
  const k=b.life/b.max, a=Math.min(1,k*1.6);
  const x=Math.round(wx/3)*3, y=Math.round(wy/3)*3;
  g.globalAlpha=a*.72;g.fillStyle='#2b0b04';
  g.fillRect(x-6,y-3,12,9);g.fillRect(x-3,y-6,6,12);
  g.globalAlpha=a*.95;g.fillStyle=k>.62?'#ff9d26':k>.32?'#e85d12':'#9c2f0c';
  g.fillRect(x-3,y-3,6,6);
  if(b.sz>.38)g.fillRect(x+(b.sz>.7?3:-6),y,3,3);
  if(k>.42){g.fillStyle=k>.74?'#fff0b3':'#ffc857';g.fillRect(x-3+(b.sz>.5?3:0),y-3,3,3);}
}
function paintBloodSpot(g,wx,wy,b){
  const x=Math.round(wx/3)*3,y=Math.round(wy/3)*3;
  // Fresh flecks darken gradually but stay attached until the blood is cleared.
  const k=clamp(b.age/4,0,1);
  g.globalAlpha=.78;g.fillStyle=`rgb(${Math.round(168-79*k)},${Math.round(23-5*k)},${Math.round(38-11*k)})`;
  g.fillRect(x-3,y-3,6,6);
  if(b.sz>.45)g.fillRect(x+3,y,3,3);
  if(b.age<1.2){g.globalAlpha=.85*(1-b.age/1.2);g.fillStyle='#dc3740';g.fillRect(x-3,y-3,3,3);}
}
function drawLayerBurns(g,R,f,layer){
  if(!R||(!(f.burns&&f.burns.length)&&!(f.bloodStains&&f.bloodStains.length)))return;
  const marks=[...(f.burns||[]),...(f.bloodStains||[])];
  if(!marks.some(b=>b.layer===layer))return;
  g.save();
  g.globalCompositeOperation='source-atop';
  for(const b of marks){
    if(b.layer!==layer)continue;
    let wx,wy;
    if(b.seg==='head'){
      const angle=Math.atan2(R.head.y-R.neck.y,R.head.x-R.neck.x)+Math.PI/2;
      const ca=Math.cos(angle),sa=Math.sin(angle);
      wx=R.head.x+b.lx*ca-b.ly*sa;wy=R.head.y+b.lx*sa+b.ly*ca;
    }else{
      const info=BURN_MAP[b.seg];if(!info)continue;
      const A=R[info[1]],B=R[info[2]];if(!A||!B)continue;
      const dx=B.x-A.x,dy=B.y-A.y,len=Math.hypot(dx,dy)||1;
      const nx=R.dir*dy/len,ny=-R.dir*dx/len;
      wx=A.x+dx*b.t+nx*b.s;wy=A.y+dy*b.t+ny*b.s;
    }
    if(b.kind==='blood')paintBloodSpot(g,wx,wy,b);else paintBurnSpot(g,wx,wy,b);
  }
  g.restore();
}
function drawFighterShadow(ctx, f) {
  const R = f.rig;
  if (!R || !f.visible) return;
  const sx = (R.aN.x + R.aF.x + R.pel.x) / 3;
  const h = clamp(f.state === 'ragdoll' ? (f.gy - R.pel.y - 20) / 200 : (f.y + (f.hoverY || 0)) / 260, 0, 1);
  ctx.fillStyle = `rgba(0,0,0,${.42 * (1 - h * .7)})`;
  ctx.beginPath(); ctx.ellipse(sx, f.gy + 3, (f.state === 'ragdoll' ? 74 : 48) * (1 - h * .4), 8, 0, 0, TAU); ctx.fill();
}
function drawFighterBody(ctx, f) {
  const R = f.rig;
  if (!R || !f.visible) return;
  const S = SK_[f.skin] || SK_.jane;
  drawPixelArm(ctx, R, f, 'F', true, S);
  drawPixelLeg(ctx, R, f, true, S);
  drawSkinCape(ctx, R, f);
  drawSkinSegment(ctx, S.neck, R.sh, R.head, 14, 4, 8, R.dir === 1);
  const p1 = pointBetween(R.sh, R.pel, .34);
  const p2 = pointBetween(R.sh, R.pel, .68);
  drawSkinSegment(ctx, S.chest, R.sh, p1, 38, 6, 6, R.dir === 1);
  drawSkinSegment(ctx, S.abdomen, p1, p2, 35, 4, 4, R.dir === 1);
  drawSkinSegment(ctx, S.pelvis, p2, R.pel, 35, 4, 6, R.dir === 1);
  drawSkinOutfitDetails(ctx, R, f);
  drawSkinTorsoWounds(ctx, R, f);
  drawSaulTie(ctx, R, f);
  drawPixelLeg(ctx, R, f, false, S);
  drawLayerBurns(ctx, R, f, 'body');
}
function drawFighterHead(ctx, f) {
  const R = f.rig;
  if (!R || !f.visible) return;
  drawSkinHead(ctx, R, f);
  drawLayerBurns(ctx, R, f, 'head');
}
function drawFighterFrontArm(ctx, f) {
  const R = f.rig;
  if (!R || !f.visible) return;
  const S = SK_[f.skin] || SK_.jane;
  drawPixelArm(ctx, R, f, 'N', false, S);
  drawSkinOutfitDetails(ctx, R, f, 'arms');
  drawLayerBurns(ctx, R, f, 'front');
}
/* ---------- injuries ---------- */
const RIP={
  jane:      {cloth:'#343840', torso:'#DCE5EF', arm:'#DCE5EF', leg:'#B58C73'},
  negan:     {cloth:'#17191D', torso:'#CFCBC2', arm:'#CFCBC2', leg:'#B58C73'},
  homelander:{cloth:'#182943', torso:'#EFEFEF', arm:'#EFEFEF', leg:'#B58C73'},
  walt:      {cloth:'#526B3D', torso:'#E0A67F', arm:'#E0A67F', leg:null},
  saul:      {cloth:'#17191F', torso:'#EF5B9A', arm:'#EF5B9A', leg:'#B58C73'}
};
function injure(f,zone,pw){
  const rr=Math.random;
  if(zone!=='head'){
    f.wounds.clothHits=(f.wounds.clothHits||0)+1;
    if((rr()<.19+pw*.08 || (f.wounds.clothHits>=5 && !f.wounds.rips.length)) && f.wounds.rips.length<3){
      const pal=RIP[f.skin]||RIP.jane;
      let choices=zone==='torso'?['torso']:['uN','uF','fN','fF','tN','tF','sN','sF'];
      if(!pal.leg)choices=choices.filter(c=>!/^[ts][NF]$/.test(c));
      const part=choices[(rr()*choices.length)|0];
      const isTorso=part==='torso';
      const isLeg=/^[ts][NF]$/.test(part);
      const under=isTorso?pal.torso:isLeg?pal.leg:pal.arm;
      f.wounds.rips.push({part,x:rnd(-8,8),y:rnd(15,43),t:rnd(.28,.76),side:rr()<.5?-1:1,size:rnd(13,20),angle:rnd(-.7,.7),cloth:pal.cloth,under,phase:rnd(TAU)});
    }
  }
  if(zone==='head'){
    f.hits.head++;
    const spots=[['cheek',3.5,5,4.2],['brow',8,-5.6,3.0],['forehead',2,-9.5,3.6]];
    const s=spots[(rr()*spots.length)|0];
    const ex=f.wounds.head.find(w=>w.k==='bruise'&&w.spot===s[0]&&!w.old);
    if(ex){ex.v=Math.min(1,ex.v+.2+pw*.2);ex.r+=.25;}
    else addW(f,'head',{k:'bruise',x:s[1],y:s[2],r:s[3],v:.4+pw*.28,spot:s[0]});
    if(rr()<.25+pw*.22)addW(f,'head',{k:'scratch',x:5+rr()*3,y:-5+rr()*8,r:2.2+rr()*1.3,v:.45+pw*.25});
  }else if(zone==='torso'){
    f.hits.torso++;
    addW(f,'torso',{k:'bruise',x:rnd(0,9),y:rnd(12,42),r:rnd(3.5,5.5),v:.45+pw*.3});
    if(pw>.45&&rr()<.35)addW(f,'torso',{k:'scratch',x:rnd(-2,9),y:rnd(13,40),r:rnd(2.5,4.5),v:.55});
  }else{
    const s=rr()<.5?'N':'F';
    addW(f,'s'+s,{k:'bruise',t:rnd(.2,.7),s:rnd(-.4,.4),r:rnd(2.8,4.6),v:.5+pw*.2});
  }
}
/* ============================ FX / PIXEL BLOOD ============================ */
class FX{
  constructor(){this.sm=[];this.bl=[];this.sp=[];this.fl=[];this.rg=[];this.marks=[];this.bits=[];this.decal=null;this.floorY=468;}
  smoke(x,y,vx,vy,r,gr,life,a,spr){
    if(this.sm.length>110)this.sm.shift();
    const n=3+((Math.random()*4)|0), cells=[];
    let cx=0,cy=0;
    for(let i=0;i<n;i++){cells.push([cx,cy]);const d=(Math.random()*4)|0;cx+=DIRX[d];cy+=DIRY[d];}
    this.sm.push({
      x,y,vx,vy,grow:gr||0,life,max:life,a,spr:spr||0,cells,
      sc:clamp((r||6)/7,.55,2.2),
      seed:Math.random()*1000,
      phase:rnd(TAU),freq:rnd(2,6),turb:rnd(6,22),drag:rnd(2.4,4.2)
    });
  }
  landing(x,y,p){
    p=p||1;
    const n=Math.round(4*p);
    for(let i=0;i<n;i++)this.smoke(x+rnd(-14,14),y-2,(i%2?1:-1)*rnd(30,140)*p,-rnd(3,18),rnd(6,12),rnd(6,14),rnd(.45,.85),.5);
    this.rg.push({x,y,r:6,life:.35,max:.35,w:90*p});
  }
  step(x,y,dir){ if(Math.random()<.5)this.smoke(x,y-1,-dir*rnd(10,40),-rnd(3,12),rnd(4,7),rnd(3,6),rnd(.25,.45),.35); }
  dash(x,y,dir){this.smoke(x-dir*rnd(0,16),y-3,-dir*rnd(60,190),-rnd(2,20),rnd(6,11),rnd(20,34),rnd(.35,.6),.5);}
  puff(x,y,n,s){for(let i=0;i<n;i++)this.smoke(x+rnd(-6,6),y+rnd(-6,6),rnd(-40,40),-rnd(10,40),rnd(3,6)*(s||1),rnd(10,20),rnd(.4,.7),.45);}
  blood(x,y,dir,n,pw){
    if(pw>.5 && Math.random()<.55)this.smoke(x+dir*5,y,dir*rnd(12,38),-rnd(3,16),rnd(4,8),rnd(14,24),rnd(.18,.28),.22,2);
    const count=Math.max(1,Math.ceil(n*(1+pw*.75)/4));
    for(let i=0;i<count;i++){
      const mist=Math.random()<.20;
      const fleck=!mist&&Math.random()<.22;
      const shape=mist?'mist':fleck?'line':(Math.random()<.48?'drop':'block');
      this.bl.push({
        x,y,
        vx:(dir*rnd(55,255)+rnd(-125,125))*1.18,
        vy:rnd(-190,72)*1.12,
        r:mist?2:fleck?2:rnd(2,4),
        fy:this.floorY+rnd(-8,30),
        life:2.5,
        fleck,shape
      });
    }
  }
  spark(x,y,n,col){for(let i=0;i<n;i++){const a=rnd(TAU),s=rnd(80,380);this.sp.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rnd(.15,.35),col:col||'255,210,90'});}}
  impact(x,y,dir,pw){this.fl.push({x,y,life:.16,max:.16,r:24+pw*30});this.spark(x,y,6+pw*8|0);}
  fragment(R,skin,dir){
    if(!R)return;
    const palette=[(SKIN_META[skin]||SKIN_META.jane).color,'#ddd5c8','#33343b','#8d1c28','#f3cf7a'];
    const segments=[['head','neck'],['neck','pel'],['sh','eN'],['eN','wN'],['sh','eF'],['eF','wF'],['pel','kN'],['kN','aN'],['pel','kF'],['kF','aF']];
    for(const [ka,kb] of segments){
      const A=R[ka],B=R[kb];if(!A||!B)continue;
      for(let i=0;i<6;i++){
        const t=rnd(1),life=rnd(.48,1.05);
        this.bits.push({x:lerp(A.x,B.x,t)+rnd(-7,7),y:lerp(A.y,B.y,t)+rnd(-7,7),
          vx:dir*rnd(35,170)+rnd(-125,125),vy:rnd(-250,50),life,max:life,
          size:Math.random()<.7?3:6,color:palette[(Math.random()*palette.length)|0]});
      }
    }
    if(this.bits.length>240)this.bits.splice(0,this.bits.length-240);
    this.spark(R.pel.x,R.pel.y,12,'255,212,80');
  }
  // Laser scorch on a floor/wall: orange blocks that cool down and fade.
  burnSurface(x,y,surf){
    if(this.marks.length>70)this.marks.shift();
    this.marks.push({x:x+rnd(-6,6),y:y+(surf==='floor'?rnd(-2,6):rnd(-6,6)),surf,life:3.6,max:3.6,w:rnd(8,16)});
  }
  drawMarks(ctx){
    const q=3,sn=v=>Math.round(v/q)*q;
    for(const m of this.marks){
      const k=m.life/m.max,a=Math.min(1,k*1.5);
      const fl=m.surf==='floor';
      const w=sn(fl?m.w*1.7:m.w),h=sn(fl?6:m.w*.8)||3;
      const x=sn(m.x-w/2),y=sn(m.y-h/2);
      ctx.globalAlpha=a*.55;ctx.fillStyle='#120708';ctx.fillRect(x-3,y-3,w+6,h+6);
      ctx.globalAlpha=a*.9;ctx.fillStyle=k>.7?'#ffb030':k>.4?'#ff6a18':'#9a2c0e';ctx.fillRect(x,y,w,h);
      if(k>.5){ctx.fillStyle=k>.78?'#fff0b0':'#ffd070';ctx.fillRect(sn(m.x-w/4),sn(m.y-h/4),Math.max(3,sn(w/2)),Math.max(3,sn(h/2)));}
    }
    ctx.globalAlpha=1;
  }
  stamp(x,y,r,vx){
    const d=this.decal;if(!d)return;
    const q=3, snap=v=>Math.round(v/q)*q;
    const sx=snap(x), sy=snap(y);
    const stretch=clamp(1+Math.abs(vx||0)/300,1,2.4);
    const wide=Math.max(6,snap((r*2.2+5)*stretch));
    d.save();
    d.fillStyle='rgba(48,0,5,.88)';
    d.fillRect(sx-wide/2,sy-3,wide,6);
    d.fillStyle='rgba(104,4,14,.88)';
    d.fillRect(sx-wide*.32,sy-6,wide*.64,9);
    d.fillStyle='rgba(154,10,24,.88)';
    d.fillRect(sx-wide*.2,sy-3,wide*.42,3);
    for(let i=0;i<4;i++){
      const bx=snap(sx+rnd(-wide*.8,wide*.8)), by=snap(sy+rnd(-9,6));
      d.fillStyle=i%2?'rgba(92,3,12,.82)':'rgba(142,8,20,.82)';
      d.fillRect(bx,by,q*(i%3===0?2:1),q);
    }
    d.restore();
  }
  pool(x,y,r){
    const d=this.decal;if(!d)return;
    const q=3, snap=v=>Math.round(v/q)*q, sx=snap(x), sy=snap(y);
    const wide=Math.max(18,snap(r*5.6)), rows=Math.max(2,Math.ceil(r/3));
    d.save();
    d.fillStyle='rgba(47,0,5,.88)';
    d.fillRect(sx-wide/2,sy-3,wide,6);
    d.fillRect(sx-wide*.34,sy-6,wide*.68,9);
    d.fillStyle='rgba(103,3,13,.9)';
    d.fillRect(sx-wide*.27,sy-3,wide*.54,6);
    d.fillStyle='rgba(155,8,23,.8)';
    d.fillRect(sx-wide*.14,sy-3,wide*.25,3);
    for(let i=0;i<rows+2;i++){
      const side=i%2?-1:1, bx=snap(sx+side*rnd(wide*.25,wide*.62));
      const by=snap(sy+rnd(-6,6));
      d.fillStyle=i%3?'rgba(91,2,11,.82)':'rgba(167,11,28,.78)';
      d.fillRect(bx,by,q*(i%2+1),q);
    }
    d.restore();
  }
  crack(x,y,dir){
    const d=this.decal;if(!d)return;
    d.strokeStyle='rgba(0,0,0,.65)';d.lineWidth=1.3;
    for(let k=0;k<4;k++){let cx=x,cy=y;d.beginPath();d.moveTo(cx,cy);for(let i=0;i<7;i++){cx+=(dir*(k<2?1:-1))*rnd(8,18);cy+=rnd(-4,4);d.lineTo(cx,cy);}d.stroke();}
  }
  update(dt,fighters=[]){
    for(const s of this.sm){
      const k=Math.exp(-s.drag*dt);
      s.vx*=k; s.vy*=k;
      s.vy-=38*dt;
      s.x+=(s.vx+Math.sin(s.phase+s.life*s.freq)*s.turb)*dt;
      s.y+=s.vy*dt;
      s.life-=dt;
    }
    this.sm=this.sm.filter(s=>s.life>0);
    const exposed=fighters.filter(f=>f.skin==='jane'&&f.state==='hypnosis'&&f.hp>0&&f.rig);
    for(const b of this.bl){
      const oldX=b.x,oldY=b.y;
      b.vy+=1600*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      for(const f of exposed){
        for(let s=0;s<=2;s++){
          const x=lerp(oldX,b.x,s/2),y=lerp(oldY,b.y,s/2);
          if(bodyHit(f,x,y)){f.addBloodStain(x,y);b.dead=true;break;}
        }
        if(b.dead)break;
      }
      if(!b.dead&&b.y>=b.fy){
        this.stamp(b.x,b.fy,b.r,b.vx);
        b.dead=true;
      }
    }
    this.bl=this.bl.filter(b=>!b.dead&&b.life>0);
    for(const b of this.bits){b.vy+=650*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;}
    this.bits=this.bits.filter(b=>b.life>0);
    for(const s of this.sp){s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=500*dt;s.life-=dt;}
    this.sp=this.sp.filter(s=>s.life>0);
    for(const f of this.fl)f.life-=dt;this.fl=this.fl.filter(f=>f.life>0);
    for(const r of this.rg){r.life-=dt;r.r+=r.w*dt/r.max;}this.rg=this.rg.filter(r=>r.life>0);
    for(const m of this.marks)m.life-=dt;this.marks=this.marks.filter(m=>m.life>0);
  }
  draw(ctx){
    const q=3;
    for(const s of this.sm){
      const k=s.life/s.max, fade=Math.min(1,k*1.6)*s.a;
      const sc=s.sc*(1+(1-k)*s.grow*.03);
      const bx=Math.round(s.x/q)*q, by=Math.round(s.y/q)*q;
      ctx.globalAlpha=fade;
      ctx.fillStyle=s.spr===2?'#6F1118':s.spr===1?'#77747A':'#B7AFA5';
      const tick=Math.floor(s.life*s.freq*5);
      for(let i=0;i<s.cells.length;i++){
        if(Math.floor(s.seed+i*37+tick*11)%5===0)continue;
        const c=s.cells[i];
        ctx.fillRect(bx+Math.round(c[0]*sc)*q, by+Math.round(c[1]*sc)*q, q, q);
      }
    }
    ctx.globalAlpha=1;
    for(const r of this.rg){ctx.fillStyle=`rgba(220,205,185,${r.life/r.max*.42})`;for(let i=-5;i<=5;i++){const x=Math.round((r.x+i*r.r/5)/3)*3,y=Math.round((r.y+Math.abs(i)*.45)/3)*3;ctx.fillRect(x,y,3,3);}}
    ctx.globalAlpha=1;
    for(const b of this.bl){
      const snap=v=>Math.round(v/q)*q;
      const x=snap(b.x), y=snap(b.y), sz=Math.max(q,snap(b.r));
      const speed=Math.hypot(b.vx,b.vy), ux=b.vx/(speed||1), uy=b.vy/(speed||1);
      ctx.fillStyle='rgba(43,0,5,.92)';
      if(b.shape==='line'){
        const tailX=snap(x-ux*9),tailY=snap(y-uy*9);
        ctx.fillRect(tailX-q,tailY-q,sz+q,sz+q);
        ctx.fillStyle='rgba(174,13,28,.96)';ctx.fillRect(x,y,sz+q,q);
      }else if(b.shape==='drop'){
        ctx.fillRect(x,y-q,sz+q,sz+q*2);
        ctx.fillStyle='rgba(174,13,28,.96)';ctx.fillRect(x+q,y,Math.max(q,sz-q),sz+q);
      }else{
        ctx.fillRect(x-q,y-q/2,sz+q,sz+q/2);
        ctx.fillStyle=b.shape==='mist'?'rgba(120,12,24,.82)':'rgba(132,5,19,.96)';
        ctx.fillRect(x,y,sz,sz);
      }
      if(speed>90){
        ctx.fillStyle='rgba(104,3,13,.88)';
        ctx.fillRect(snap(x-ux*6),snap(y-uy*6),q,q);
      }
      if(b.fleck){ctx.fillStyle='rgba(207,33,43,.9)';ctx.fillRect(x,y,q,q);}
    }
    for(const f of this.fl){
      const k=f.life/f.max,r=f.r*(1.3-k*.5);ctx.globalAlpha=k;
      ctx.fillStyle='#F2C36B';for(let i=0;i<10;i++){const a=i*TAU/10+f.x*.01,rr=r*(i%2?.72:1);const x=Math.round((f.x+Math.cos(a)*rr)/q)*q,y=Math.round((f.y+Math.sin(a)*rr*.55)/q)*q;ctx.fillRect(x,y,q,q);}
      ctx.fillStyle='#FFF0C5';ctx.fillRect(Math.round(f.x/q)*q,Math.round(f.y/q)*q,q,q);ctx.globalAlpha=1;
    }
    for(const s of this.sp){ctx.fillStyle=`rgba(${s.col},${clamp(s.life*5,0,1)})`;ctx.fillRect(Math.round(s.x/q)*q,Math.round(s.y/q)*q,q,q);}
    for(const b of this.bits){
      ctx.globalAlpha=clamp(b.life*3,0,1);ctx.fillStyle=b.color;
      ctx.fillRect(Math.round(b.x/q)*q,Math.round(b.y/q)*q,b.size,b.size);
    }
    ctx.globalAlpha=1;
  }
}
/* ============================ RAGDOLL ============================ */
const RK=['head','neck','pel','eN','wN','eF','wF','kN','aN','kF','aF'];
const RAD_R={head:12,neck:5,pel:8.5,eN:4.5,wN:5,eF:4.5,wF:5,kN:6.5,aN:7.5,kF:6.5,aF:7.5};
const DC=[['head','neck',NECKH],['neck','pel',TORSO_L],['eN','neck',UA],['wN','eN',FA],['eF','neck',UA],['wF','eF',FA],['kN','pel',THIGH],['aN','kN',SHIN],['kF','pel',THIGH],['aF','kF',SHIN]];
const DMIN=[['head','pel',64,84],['aN','pel',33,100],['aF','pel',33,100],['wN','neck',24,66],['wF','neck',24,66],['kN','neck',44,215],['kF','neck',44,215]];
const SEGS=[['neck','pel',10.5],['pel','kN',8.8],['pel','kF',8.8],['kN','aN',6.2],['kF','aF',6.2],['neck','eN',5.8],['neck','eF',5.8],['eN','wN',4.8],['eF','wF',4.8]];
const PTS=[['head',12],['eN',4.6],['wN',5],['eF',4.6],['wF',5],['kN',6.2],['aN',5.8],['kF',6.2],['aF',5.8]];
const NEIGH={head:['neck'],eN:['neck','wN'],wN:['eN'],eF:['neck','wF'],wF:['eF'],kN:['pel','aN'],aN:['kN'],kF:['pel','aF'],aF:['kF']};
const HSTEP=1/120;
let NEXT_RAG_ID=1;
class Ragdoll{
  constructor(R,f){
    this.id=NEXT_RAG_ID++;this.pin=null;
    this.f=f;this.dir=f.dir;this.t=0;this.acc=0;this.settle=0;this.imp=0;this.p={};
    for(const k of RK)this.p[k]={x:R[k].x,y:R[k].y,px:R[k].x,py:R[k].y,r:RAD_R[k]};
  }
  launch(vx,vy){
    const P=this.p,d=this.dir;vx=clamp(vx,-620,620);vy=clamp(vy,180,620);const spin=-d*rnd(1.25,2.4)*(vy>300?1:.5);
    for(const k of RK){const p=P[k],rx=p.x-P.pel.x,ry=p.y-P.pel.y;
      const ax=vx-ry*spin+rnd(-60,60),ay=-vy+rx*spin+rnd(-60,60);p.px=p.x-ax*HSTEP;p.py=p.y-ay*HSTEP;}
  }
  update(dt){
    if(this.frozen)return;
    this.t+=dt;this.imp-=dt;this.acc+=dt;let n=0;
    while(this.acc>=HSTEP&&n<6){this.step();this.acc-=HSTEP;n++;}
    if(n>=6)this.acc=0;
    // At high frame rates there may be no physics substep this frame, but the
    // held ankle still has to follow the grabber's freshly updated hands.
    if(this.pin){const p=this.p[this.pin.key];p.x=this.pin.x;p.y=this.pin.y;p.px=p.x;p.py=p.y;}
    let sp=0;for(const k of RK){const p=this.p[k];sp+=Math.abs(p.x-p.px)+Math.abs(p.y-p.py);}
    sp/=RK.length;if(sp<.42&&!this.pin)this.settle+=dt;else this.settle=0;
    if(this.f.hp<=0&&((this.settle>1.25&&this.t>1.5)||this.t>6)){this.frozen=true;for(const k of RK){const p=this.p[k];p.px=p.x;p.py=p.y;}}
  }
  step(){
    const P=this.p,f=this.f,g=1900*HSTEP*HSTEP,gy=f.gy,pin=this.pin,maxSpd=pin?18:8.5;
    for(const k of RK){const p=P[k];let vx=(p.x-p.px)*.986,vy=(p.y-p.py)*.986;const speed=Math.hypot(vx,vy);if(speed>maxSpd){vx*=maxSpd/speed;vy*=maxSpd/speed;}p.px=p.x;p.py=p.y;p.x+=vx;p.y+=vy+(pin?g*.35:g);}
    if(pin){
      const pull=(pt,dist,w)=>{
        const tx=pin.x+pin.ux*dist,ty=Math.min(gy-pt.r,pin.y+pin.uy*dist);
        const dx=(tx-pt.x)*w,dy=(ty-pt.y)*w;
        pt.x+=dx;pt.y+=dy;pt.px+=dx*.35;pt.py+=dy*.35;
      };
      pull(P.pel,92,.22);
      pull(P.neck,148,.20);
      pull(P.head,168,.16);
    }
    for(let it=0;it<5;it++){
      if(pin){const gp=P[pin.key];gp.x=pin.x;gp.y=pin.y;gp.px=pin.x;gp.py=pin.y;}
      for(const [a,b,l] of DC){const A=P[a],B=P[b],dx=B.x-A.x,dy=B.y-A.y,d=Math.hypot(dx,dy)||1e-4,df=(d-l)/d*.5;A.x+=dx*df;A.y+=dy*df;B.x-=dx*df;B.y-=dy*df;}
      for(const [a,b,mn,mx] of DMIN){const A=P[a],B=P[b],dx=B.x-A.x,dy=B.y-A.y,d=Math.hypot(dx,dy)||1e-4;let t=0;if(d<mn)t=mn;else if(d>mx)t=mx;else continue;const df=(d-t)/d*.5;A.x+=dx*df;A.y+=dy*df;B.x-=dx*df;B.y-=dy*df;}
      this.lim(P.pel,P.kN,P.aN,this.dir);this.lim(P.pel,P.kF,P.aF,this.dir);
      this.lim(P.neck,P.eN,P.wN,-this.dir);this.lim(P.neck,P.eF,P.wF,-this.dir);
      for(const [pn,pr] of PTS){const p=P[pn],nb=NEIGH[pn];
        for(const [an,bn,sr] of SEGS){if(pn===an||pn===bn)continue;
          const A=P[an],B=P[bn],sx=B.x-A.x,sy=B.y-A.y,l2=sx*sx+sy*sy||1;let t=clamp(((p.x-A.x)*sx+(p.y-A.y)*sy)/l2,0,1);
          if(nb.includes(an)&&t<.35)continue;if(nb.includes(bn)&&t>.65)continue;
          const cx=A.x+sx*t,cy=A.y+sy*t,dx=p.x-cx,dy=p.y-cy,d=Math.hypot(dx,dy)||1e-4,m=pr+sr;
          if(d<m){const push=(m-d),nx=dx/d,ny=dy/d;p.x+=nx*push*.6;p.y+=ny*push*.6;A.x-=nx*push*.2*(1-t);A.y-=ny*push*.2*(1-t);B.x-=nx*push*.2*t;B.y-=ny*push*.2*t;}}}
      for(const [a,b,m] of [['wN','wF',8],['kN','kF',10],['aN','aF',11],['kN','aF',9],['kF','aN',9],['wN','head',16],['wF','head',16]]){
        const A=P[a],B=P[b],dx=B.x-A.x,dy=B.y-A.y,d=Math.hypot(dx,dy)||1e-4;if(d<m){const df=(d-m)/d*.5;A.x+=dx*df;A.y+=dy*df;B.x-=dx*df;B.y-=dy*df;}}
      if(pin){const gp=P[pin.key];gp.x=pin.x;gp.y=pin.y;gp.px=pin.x;gp.py=pin.y;}
      for(const k of RK){const p=P[k],lim=gy-p.r;
        if(p.y>lim){const vy=p.y-p.py;if(vy>2.4&&this.imp<=0&&(!pin||!pin.lift))this.impact(p,vy);p.y=lim;p.py=p.y+vy*.22;p.px+=(p.x-p.px)*.22;}
        if(p.x<f.minX-30){p.x=f.minX-30;p.px=p.x;}if(p.x>f.maxX+30){p.x=f.maxX+30;p.px=p.x;}}
    }
  }
  lim(a,b,c,sign){
    const cr=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
    if(cr*sign<-3){
      const ux=c.x-a.x,uy=c.y-a.y,L=Math.hypot(ux,uy)||1,nx=ux/L,ny=uy/L,vx=b.x-a.x,vy=b.y-a.y,pr=vx*nx+vy*ny;
      const rx=a.x+2*pr*nx-vx,ry=a.y+2*pr*ny-vy,ddx=rx-b.x,ddy=ry-b.y;
      b.x=rx;b.y=ry;b.px+=ddx;b.py+=ddy;
    }
  }
  impact(p,vy){
    this.imp=.14;const f=this.f;
    if(vy>6&&f.fx)f.fx.landing(p.x,f.gy,clamp((vy-4)/12,.25,.9));
    if(vy>5)Snd.thud();
    f.ragInjury(vy);
  }
  toRig(f){
    const P=this.p,R={dir:f.dir};for(const k of RK)R[k]=P[k];
    R.sh={x:lerp(P.neck.x,P.pel.x,.07),y:lerp(P.neck.y,P.pel.y,.07)};
    R.fdN=footDirRag(P.kN,P.aN,f.dir);R.fdF=footDirRag(P.kF,P.aF,f.dir);
    R.cN=.35;R.cF=.35;R.mo=.5;R.ey=f.hp<=0?1:.75;R.bd=null;
    // While alive, Lucille stays in Negan's near hand (1-handed); upon death he lets go of it.
    if(f.skin==='negan'&&f.hp>0&&!f.batLost){
      let dx=P.wN.x-P.eN.x,dy=P.wN.y-P.eN.y;const l=Math.hypot(dx,dy)||1;
      R.bd=clampBatFloor(P.wN.x,P.wN.y,dx/l,dy/l,f.gy);
    }
    return R;
  }
}
/* ============================ FIGHTER ============================ */
let NEXT_ID=1, NEXT_GUN_ID=1;
function distSeg(px,py,ax,ay,bx,by){
  const sx=bx-ax,sy=by-ay,l2=sx*sx+sy*sy||1;const t=clamp(((px-ax)*sx+(py-ay)*sy)/l2,0,1);
  return Math.hypot(px-(ax+sx*t),py-(ay+sy*t));
}
// Body test used by the laser ray: capsules along the rig (works for standing fighters and ragdolls).
const BODY_CAPS=[['neck','pel',17],['pel','kN',10],['pel','kF',10],['kN','aN',8],['kF','aF',8],['neck','eN',7],['eN','wN',6],['neck','eF',7],['eF','wF',6]];
function bodyHit(g,px,py){
  const R=g.rig;if(!R)return false;
  if(Math.abs(px-R.pel.x)>170)return false;
  if(Math.hypot(px-R.head.x,py-(R.head.y-6))<18)return true;
  for(const [a,b,r] of BODY_CAPS){if(distSeg(px,py,R[a].x,R[a].y,R[b].x,R[b].y)<r)return true;}
  return false;
}
class Fighter{
  constructor(o){
    const chosenSkin=o.skin||pickSkin();
    const meta=SKIN_META[chosenSkin]||SKIN_META.jane;
    const pal=o.col||{hex:meta.color};
    Object.assign(this,{
      id:NEXT_ID++,
      skin:chosenSkin,
      col:pal,
      fx:null,gy:468,minX:70,maxX:900,spawnY:620,
      name:'БОЕЦ #'+NEXT_ID
    },o);
    this.wounds=newWounds();this.hits={head:0,torso:0};this.seed=Math.random()*10;
    this.ctrl={mx:0,jump:false,punch:false,run:false,hop:false,laser:false,noFace:false};
    this.autopilot=new AutoCombat();
    this.reset(o.x||300,o.dir||1);
  }
  reset(x,dir){
    Object.assign(this,{
      x,y:0,vx:0,vy:0,dir,hp:100,lagHp:100,
      state:'idle',st:0,t:0,walkPh:0,comboStep:0,comboT:9,
      dashCD:0,invT:0,landT:0,stunT:0,cur:null,blend:0,
      visible:true,rig:null,atk:null,ak:0,atkStamp:0,
      connected:false,lastSign:1,rag:null,hitZone:'head',
      poolT:0,sp:0,spT:0,dashW:0,dashF:true,dashT:0,
      hitDone:false,queued:false,lungeDone:false,wh:false,dustT:0,calmT:0,tie:null,cape:null,pvx:0,pvy:0,corpseFade:0,
      lz:null,lzSnd:false,burns:[],dive:false,diveT:0,diveHit:false,kickExt:0,fastGetup:false,
      hoverY:0,hlBrake:0,hlBrakeDir:1,hlBrakeFrom:null,hlLiftFx:false,hopDur:.38,
      batLost:false,dizzyAlpha:0,dizzyPh:Math.random()*TAU,
      grabCD:0,grabTarget:null,grabbedBy:null,grabInitDir:1,grabAnkle:'aN',grabTurned:false,grabSlammed:false,grabHand:null,
      hypCD:this.skin==='jane'?rnd(1,3):0,hypTarget:null,hypPhase:null,hypPhaseT:0,hypAimWait:0,
      hypGun:null,hypGunDir:null,hypFirePending:false,
      tranceT:0,tranceFrom:null,trancePhrase:'',speechT:0,bloodStains:[],fragmentDir:1
    });
  }
  spawn(delay){this.state='spawn';this.sp=0;this.spT=delay||.05;this.visible=false;this.y=this.spawnY;this.vy=0;this.vx=0;this.st=0;this.cur=null;this.hoverY=0;}
  canBeHit(){return this.hp>0&&this.state!=='ragdoll'&&this.state!=='getup'&&this.state!=='spawn'&&this.state!=='win'&&this.invT<=0;}
  faceOpp(o){if(this.ctrl.noFace)return;if(this.skin==='homelander'&&this.hlBrake>.42)return;if(o&&this.y<2&&Math.abs(o.x-this.x)>10)this.dir=o.x>this.x?1:-1;}
  speedMul(){return this.hp<30?.85:1;}
  canHypnotize(v){
    return !!(this.skin==='jane'&&this.hp>0&&this.state==='idle'&&this.y<5&&this.hypCD<=0&&
      v&&v!==this&&Game.fighters.includes(v)&&v.hp>0&&v.rig&&v.canBeHit()&&v.y<35&&!v.tranceT&&!v.grabbedBy&&
      Math.abs(v.x-this.x)>=75&&Math.abs(v.x-this.x)<=HYPNO_RANGE);
  }
  startHypnosis(v){
    if(!this.canHypnotize(v))return false;
    this.dir=v.x>this.x?1:-1;this.vx=0;this.state='hypnosis';this.st=0;
    this.hypTarget=v;this.hypPhase='focus';this.hypPhaseT=0;this.hypAimWait=0;
    this.hypGun=null;this.hypGunDir={x:this.dir,y:0};this.hypFirePending=false;
    // Match Homelander's 5–9 second laser cooldown, including interrupted casts.
    this.hypCD=rnd(5,9);
    Game.beginHypnosisCamera(this);
    Snd.hypnotize();
    return true;
  }
  enterTrance(){
    if(!this.canBeHit()||this.y>=35||this.tranceT>0||this.grabbedBy)return false;
    if(this.state==='hypnosis')this.cancelHypnosis();
    if(this.state==='grab_prep'||this.state==='grab_throw')this.cancelGrab(true);
    this.tranceFrom=Object.assign({},this.cur||this.targetPose());
    this.tranceT=rnd(5.8,7.2);
    this.trancePhrase=HYPNO_LINES[(Math.random()*HYPNO_LINES.length)|0];
    this.speechT=1.8;
    this.state='trance';this.st=0;this.vx=0;this.vy=0;this.y=0;this.lz=null;this.dive=false;
    this.invT=0;this.fastGetup=false;
    return true;
  }
  cancelHypnosis(){
    if(this.hypGun)Game.dropGun(this,false);
    this.hypTarget=null;this.hypPhase=null;this.hypPhaseT=0;this.hypFirePending=false;
    if(this.state==='hypnosis'){this.state='idle';this.st=0;this.comboT=9;}
    Game.endHypnosisCamera(this);
  }
  updateHypnosis(dt){
    this.vx=0;this.hypPhaseT+=dt;
    const v=this.hypTarget;
    switch(this.hypPhase){
      case 'focus':
        if(!v||!Game.fighters.includes(v)||!v.canBeHit()||v.y>=35||v.tranceT>0||(v.x-this.x)*this.dir<35||Math.abs(v.x-this.x)>HYPNO_RANGE+25){this.cancelHypnosis();break;}
        if(this.hypPhaseT>=HYPNO_FOCUS){
          if(!v.enterTrance()){this.cancelHypnosis();break;}
          this.hypPhase='holster';this.hypPhaseT=0;
        }
        break;
      case 'holster':
        if(this.hypPhaseT>=HYPNO_HOLSTER){
          this.hypGun={id:NEXT_GUN_ID++};this.hypPhase='draw';this.hypPhaseT=0;
        }
        break;
      case 'draw':
        if(this.hypPhaseT>=HYPNO_DRAW){
          this.hypAimWait=rnd(.55,1.8);this.hypPhase='aim';this.hypPhaseT=0;
        }
        break;
      case 'aim':
        if(this.hypPhaseT>=this.hypAimWait){this.hypPhase='raise';this.hypPhaseT=0;}
        break;
      case 'raise':
        if(this.hypPhaseT>=HYPNO_RAISE){this.hypPhase='recoil';this.hypPhaseT=0;this.hypFirePending=true;}
        break;
      case 'recoil':
        if(this.hypPhaseT>=HYPNO_RECOIL){
          if(this.hypGun)Game.dropGun(this,true);
          this.hypPhase='recover';this.hypPhaseT=0;
        }
        break;
      case 'recover':
        if(this.hypPhaseT>=HYPNO_RECOVER)this.cancelHypnosis();
        break;
      default:this.cancelHypnosis();
    }
  }
  canThrowFromHere(o){
    if(!o||o.hp<=0||o.state!=='ragdoll'||!o.rag||o.grabbedBy)return false;
    const d0=Math.abs(o.x-this.x)>8?(o.x>this.x?1:-1):this.dir;
    const standX=o.x-d0*48,slamEnd=standX-d0*205;
    return standX>=this.minX+18&&standX<=this.maxX-18&&slamEnd>=this.minX+14&&slamEnd<=this.maxX-14;
  }
  startGrabPrep(vic,d0){
    if(!vic||vic.hp<=0||vic.state!=='ragdoll'||!vic.rag||vic.grabbedBy)return false;
    const slamEnd=this.x-d0*195;
    if(slamEnd<this.minX+12||slamEnd>this.maxX-12)return false;
    this.dir=d0;this.grabInitDir=d0;this.grabTarget=vic;vic.grabbedBy=this;
    this.state='grab_prep';this.st=0;this.vx=0;this.hlBrake=0;this.grabHand=null;
    return true;
  }
  startGrabThrow(){
    const vic=this.grabTarget;
    if(!vic||vic.hp<=0||vic.state!=='ragdoll'||!vic.rag){this.cancelGrab(false);return;}
    const P=vic.rag.p,hx=this.x+this.dir*32;
    this.grabAnkle=Math.abs(P.aN.x-hx)<=Math.abs(P.aF.x-hx)?'aN':'aF';
    this.state='grab_throw';this.st=0;this.vx=0;this.grabInitDir=this.dir;
    this.grabTurned=false;this.grabSlammed=false;this.grabCD=rnd(9.5,14);
    Snd.whoosh();
  }
  cancelGrab(interrupted){
    const vic=this.grabTarget;
    if(vic){
      if(vic.grabbedBy===this)vic.grabbedBy=null;
      if(vic.rag)vic.rag.pin=null;
    }
    this.grabTarget=null;this.grabHand=null;
    if(interrupted)this.grabCD=Math.max(this.grabCD,rnd(6,9));
    if(this.state==='grab_prep'||this.state==='grab_throw'){this.state='idle';this.st=0;}
  }
  startAttack(i){this.state='attack';this.atk=atkSetFor(this.skin)[i];this.ak=i;this.st=0;this.hitDone=false;this.queued=false;this.lungeDone=false;this.connected=false;this.wh=false;this.atkStamp++;this.lzSnd=false;this.lz=null;this.hlBrake=0;}
  startJump(){this.vy=770;this.y=.5;this.state='air';this.st=0;this.hlBrake=0;this.fx&&this.fx.landing(this.x,this.gy,.5);}
  startDash(w){
    this.state='dash';this.st=0;this.dashF=w>0;this.dashW=w*this.dir;this.dashT=w>0?.24:.27;this.dashCD=.6;this.dashDust=0;this.hlBrake=0;
    if(w<0)this.invT=.22;Snd.whoosh();
  }
  // Dodge: back-hop (or sharp aerial fly-back over the exact same distance for Homelander).
  startHop(){
    if(this.skin==='homelander'){
      this.state='hop';this.st=0;this.y=0;this.vy=0;this.hopDur=.38;
      this.vx=-this.dir*780;this.invT=.38;this.dashCD=.6;this.hlBrake=0;
      Snd.whoosh();
      if(this.fx){this.fx.dash(this.x,this.gy-22,-this.dir);this.fx.puff(this.x+this.dir*10,this.gy-76,3,.9);}
      return;
    }
    this.state='hop';this.st=0;this.vy=450;this.y=.5;this.vx=-this.dir*500;this.invT=.38;this.dashCD=.6;
    Snd.hop();if(this.fx){this.fx.landing(this.x,this.gy,.5);this.fx.dash(this.x,this.gy,-this.dir);}
  }
  // Running leap: flying kick (or Superman hands-first flying tackle for Homelander, same logic).
  startDive(){
    this.state='air';this.dive=true;this.diveT=0;this.diveHit=false;this.kickExt=0;this.st=0;this.hlBrake=0;
    this.vy=560;this.y=.5;this.vx=this.dir*Math.max(Math.abs(this.vx),430);
    Snd.whoosh();
    if(this.fx){
      if(this.skin==='homelander')this.fx.dash(this.x,this.gy-24,this.dir);
      else this.fx.landing(this.x,this.gy,.7);
    }
  }
  kickHit(o){
    o.takeHit(this,{dmg:10,zone:'torso',pw:.95,launch:true,lvx:430,lvy:470,stun:.5,kb:200});
    // the kicker falls too, but gets up almost at once
    this.dive=false;this.fastGetup=true;
    this.toRagdoll(-this.dir*70,250);
  }
  trip(o){
    Snd.thud();this.fastGetup=true;
    if(o.state==='hypnosis'){
      o.cancelHypnosis();o.state='hit';o.st=0;o.stunT=.35;o.vx=this.dir*220;
    }else if(o.state==='grab_prep'||o.state==='grab_throw'){
      o.cancelGrab(true);o.state='hit';o.st=0;o.stunT=.35;o.vx=this.dir*220;
    }else if(o.state==='idle')o.vx=this.dir*220;
    this.fx&&this.fx.puff(this.x+this.dir*20,this.gy-20,3,1.2);
    this.toRagdoll(this.vx*.85,260);
  }
  onLand(impact){
    const pvx=this.vx;
    this.landT=.12;this.vx*=.35;
    if(impact>250&&this.fx)this.fx.landing(this.x,this.gy,clamp(impact/1100,.25,.8));
    if(impact>500)Snd.thud();
    if(this.dive){ // missed: tumbles along with the leftover momentum
      this.dive=false;this.fastGetup=true;Snd.thud();
      this.toRagdoll(pvx*.9,200);return;
    }
    if(this.state==='air'||this.state==='dash'||this.state==='hop'||(this.state==='attack'&&this.atk.air)){this.state='idle';this.st=0;this.comboT=9;}
  }
  tryHit(a,opponents){
    let hitAny=false;
    for(const o of opponents){
      if(!o||o===this||!o.canBeHit())continue;
      const dx=(o.x-this.x)*this.dir;if(dx<-20||dx>a.reach+14)continue;
      const lo=this.y+a.y[0],hi=this.y+a.y[1],ov=Math.min(hi,o.y+200)-Math.max(lo,o.y+55);if(ov<20)continue;
      o.takeHit(this,a);
      hitAny=true;
      break;
    }
    return hitAny;
  }
  takeHit(att,a,point){
    const wasHypnotizing=this.state==='hypnosis';
    if(wasHypnotizing)this.cancelHypnosis();
    if(this.grabTarget)this.cancelGrab(true);
    this.hp=Math.max(0,this.hp-a.dmg);
    const impact=point&&typeof point.x==='number'?point:null;
    const trancePoint=this.state==='trance'&&this.rig?(a.zone==='head'?this.rig.head:pointBetween(this.rig.sh,this.rig.pel,.4)):null;
    const px=impact?impact.x:trancePoint?trancePoint.x:this.x-att.dir*10;
    const py=impact?impact.y:trancePoint?trancePoint.y:this.gy-this.y-(a.zone==='head'?166:a.zone==='torso'?122:38);
    Game.hitFX(att,this,a,px,py);
    injure(this,a.zone,a.pw);
    if(wasHypnotizing)this.addBloodStain(px,py);
    att.handDamage(a,this);
    if(this.hp<=0){Game.ko(this,att,a);return;}
    // Ordinary hits damage a hypnotized fighter without breaking the trance;
    // launching attacks and lasers can still move them into ragdoll physics.
    if(this.state==='trance'&&this.tranceT>0&&!a.launch){this.vx=0;return;}
    if(this.state==='ragdoll'&&this.rag){
      for(const k of RK)this.rag.p[k].px-=att.dir*.65;
      return;
    }
    if(this.state==='run'||this.dive){
      // caught while running / flying: keeps going forward in a ragdoll by inertia
      const iv=clamp(this.vx*.9,-640,640);this.dive=false;
      this.toRagdoll(iv+att.dir*40,300);
    }
    else if(a.launch||this.y>8){this.toRagdoll(att.dir*(a.lvx||200),a.lvy||420);}
    else{
      this.state='hit';this.st=0;this.stunT=a.stun;this.hitZone=a.zone==='head'?'head':'body';this.vx=att.dir*a.kb;this.invT=0;
      if(a.pull)this.x=clamp(att.x+att.dir*a.pull,this.minX,this.maxX);
    }
  }
  handDamage(a,vic){}
  toRagdoll(vx,vy){
    if(this.state==='hypnosis')this.cancelHypnosis();
    if(this.grabTarget)this.cancelGrab(true);
    if(this.grabbedBy)this.grabbedBy.cancelGrab(false);
    if(!this.rig)return;
    this.rag=new Ragdoll(this.rig,this);this.rag.launch(vx,vy);
    this.state='ragdoll';this.st=0;this.y=0;this.vx=0;this.vy=0;this.invT=0;this.dive=false;this.lz=null;
    this.hoverY=0;this.hlBrake=0;this.hlBrakeFrom=null;
    this.fx&&this.fx.landing(this.x,this.gy,.6);
  }
  ragInjury(spd){
    if(spd<3.0)return;
    const parts=['uN','fN','tN','sN','fF','sF','torso'],p=parts[(Math.random()*parts.length)|0];
    if(p==='torso')addW(this,'torso',{k:'abr',x:rnd(-6,8),y:rnd(8,40),r:rnd(3,5.2),v:.75});
    else addW(this,p,{k:Math.random()<.5?'abr':'scratch',t:rnd(.2,.9),s:rnd(-.6,.6),r:rnd(3,5.2),v:.75});
    if(this.hp<70&&Math.random()<.65&&this.fx){
      const r=this.rig;if(r)this.fx.blood(r.pel.x,r.pel.y,this.dir,6,.45);
    }
  }
  startGetup(){
    const R=this.rag.toRig(this);this.blendFrom=R;
    this.x=clamp(this.rag.p.pel.x,this.minX,this.maxX);this.rag=null;this.state='getup';this.st=0;this.blend=.3;this.cur=null;
    this.hoverY=0;this.hlLiftFx=false;
  }
  /* ---------------- Homelander's eye laser ---------------- */
  laserEye(){const h=this.rig.head;return {x:h.x+this.dir*9,y:h.y-5};}
  addBurn(x,y){
    const mark=locateSurface(this.rig,x,y);if(!mark)return;
    this.burns.push(Object.assign(mark,{life:3.4,max:3.4,sz:Math.random()}));
    if(this.burns.length>20)this.burns.shift();
  }
  addBloodStain(x,y){
    const mark=locateSurface(this.rig,x,y);if(!mark)return;
    this.bloodStains.push(Object.assign(mark,{kind:'blood',age:0,sz:Math.random()}));
    if(this.bloodStains.length>36)this.bloodStains.shift();
  }
  takeLaser(att,pt,first){
    this.addBurn(pt.x,pt.y);
    if(this.hp<=0||this.state==='spawn'||this.invT>0)return;
    if(this.state==='hypnosis')this.cancelHypnosis();
    if(this.grabTarget)this.cancelGrab(true);
    this.hp=Math.max(0,this.hp-(first?3.5:1.6));
    if(this.fx){this.fx.spark(pt.x,pt.y,2,'255,150,40');if(first)this.fx.blood(pt.x,pt.y,att.dir,6,.5);}
    if(this.hp<=0){Game.ko(this,att,{lvx:300,lvy:380,pw:.9});return;}
    if(first){
      Snd.hit(.8);Game.shake=Math.max(Game.shake,5);
      injure(this,'torso',.6);
      if(this.state!=='ragdoll'&&this.state!=='getup')this.toRagdoll(att.dir*300,400);
    }else if(this.state==='ragdoll'&&this.rag){
      for(const k of RK){this.rag.p[k].px-=att.dir*.35;}
    }
  }
  updateLaser(dt,all,target){
    const a=this.atk,st=this.st;
    if(!this.rig)return;
    const eye=this.laserEye();
    if(st<a.chargeT){
      if(!this.lzSnd){this.lzSnd=true;Snd.laserCharge();}
      if(this.fx&&Math.random()<.6)this.fx.spark(eye.x+rnd(-16,16),eye.y+rnd(-16,16),1,'255,90,40');
      return;
    }
    if(st>a.fireEnd){this.lz=null;return;}
    let desired=0;
    if(target&&target.rig){
      const T=target.rig,ch={x:lerp(T.neck.x,T.pel.x,.35),y:lerp(T.neck.y,T.pel.y,.35)};
      desired=clamp(Math.atan2(ch.y-eye.y,Math.max(8,(ch.x-eye.x)*this.dir)),-1,1.2);
    }
    if(!this.lz){
      this.lz={rel:desired,tick:0,hits:new Set(),sx:eye.x,sy:eye.y,ex:eye.x,ey:eye.y,surf:'none',f:null,on:true};
      Snd.laser();Game.shake=Math.max(Game.shake,3);
    }
    const lz=this.lz;
    const m=2.1*dt;lz.rel+=clamp(desired-lz.rel,-m,m);
    const ux=Math.cos(lz.rel)*this.dir,uy=Math.sin(lz.rel);
    const res=Game.castRay(eye.x,eye.y,ux,uy,this);
    lz.sx=eye.x;lz.sy=eye.y;lz.ex=res.x;lz.ey=res.y;lz.surf=res.surf;lz.f=res.f;
    lz.tick-=dt;
    if(lz.tick<=0){
      lz.tick=.07;
      if(res.f){const first=!lz.hits.has(res.f.id);lz.hits.add(res.f.id);res.f.takeLaser(this,res,first);}
      else if(res.surf!=='none'){this.fx.burnSurface(res.x,res.y,res.surf);}
      if(this.fx){
        this.fx.spark(res.x,res.y,2,'255,160,50');
        if(Math.random()<.3)this.fx.smoke(res.x,res.y,rnd(-30,30),-rnd(10,50),rnd(3,6),rnd(8,14),rnd(.3,.6),.4,1);
      }
    }
  }
  /*
    Saul's tie: verlet chain hanging from the collar.
  */
  updateTie(dt){
    if(this.skin!=='saul'||!this.rig||dt<=0)return;
    const R=this.rig,n=R.neck,p=R.pel,dir=R.dir;
    let ux=p.x-n.x,uy=p.y-n.y;const L=Math.hypot(ux,uy)||1;ux/=L;uy/=L;
    const scale=L/54;
    const ax=(this.vx-this.pvx)/dt, ay=(this.vy-this.pvy)/dt;
    this.pvx=this.vx;this.pvy=this.vy;
    const world=(lx,ly)=>({x:n.x+dir*uy*lx+ux*scale*ly,y:n.y-dir*ux*lx+uy*scale*ly});
    const anchor=world(7,3);
    const bad=this.tie&&this.tie.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y));
    if(!this.tie||this.tie.length!==TIE_N||bad){
      this.tie=[];
      for(let i=0;i<TIE_N;i++){const y=anchor.y+(i+1)*TIE_SEG;this.tie.push({x:anchor.x,y,px:anchor.x,py:y});}
    }
    const dt2=dt*dt,T=this.t;
    for(let i=0;i<TIE_N;i++){
      const q=this.tie[i], f=(i+1)/TIE_N;
      const vx=(q.x-q.px)*.965, vy=(q.y-q.py)*.965;
      q.px=q.x;q.py=q.y;
      const fl1=Math.sin(T*11+i*1.6)*.6+Math.sin(T*23+i*2.9)*.3;
      const fl2=Math.cos(T*9+i*2.2)*.4;
      q.x+=vx+(-ax*.8*f*dt2)+fl1*2400*f*dt2;
      q.y+=vy+900*dt2-(ay*.25*f*dt2)+fl2*1600*f*dt2;
    }
    for(let it=0;it<5;it++){
      for(let i=0;i<TIE_N;i++){
        const q=this.tie[i], pp=i?this.tie[i-1]:anchor;
        const dx=q.x-pp.x,dy=q.y-pp.y,d=Math.hypot(dx,dy)||1e-4,df=(d-TIE_SEG)/d;
        if(i===0){q.x-=dx*df;q.y-=dy*df;}
        else{q.x-=dx*df*.5;q.y-=dy*df*.5;pp.x+=dx*df*.5;pp.y+=dy*df*.5;}
      }
      for(const q of this.tie){
        const rx=q.x-n.x,ry=q.y-n.y;
        const lx=rx*dir*uy-ry*dir*ux;
        if(lx<3||lx>13){const dl=clamp(lx,3,13)-lx;q.x+=dl*dir*uy;q.y+=-dl*dir*ux;}
      }
    }
  }
  /*
    Homelander's full-length American flag cape: 7-segment Verlet spine hanging nearly to the ankles.
  */
  updateCape(dt){
    if(this.skin!=='homelander'||!this.rig||dt<=0)return;
    const R=this.rig,n=R.neck,p=R.pel,sh=R.sh,dir=R.dir;
    let ux=p.x-n.x,uy=p.y-n.y;const L=Math.hypot(ux,uy)||1;ux/=L;uy/=L;
    const bx=-dir*uy, by=dir*ux; // always points out of Homelander's back
    const anchor={x:sh.x-dir*5,y:sh.y+1};
    const ax=clamp((this.vx-this.pvx)/dt,-2600,2600), ay=clamp((this.vy-this.pvy)/dt,-2600,2600);
    this.pvx=this.vx;this.pvy=this.vy;
    const bad=this.cape&&this.cape.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y));
    if(!this.cape||this.cape.length!==CAPE_N||bad){
      this.cape=[];
      for(let i=0;i<CAPE_N;i++){
        const d=(i+1)*CAPE_SEG;
        const x=anchor.x+ux*d+bx*(3+(i+1)*2.1);
        const y=Math.min(this.gy-2,anchor.y+uy*d+by*(3+(i+1)*2.1));
        this.cape.push({x,y,px:x,py:y});
      }
    }
    const dt2=dt*dt,T=this.t,spd=Math.hypot(this.vx,this.vy);
    const fastK=clamp(spd/RUN_SPD,0,1);
    const grav=lerp(1180,380,fastK);
    for(let i=0;i<CAPE_N;i++){
      const q=this.cape[i], fk=(i+1)/CAPE_N;
      const vx=(q.x-q.px)*.945, vy=(q.y-q.py)*.945;
      q.px=q.x;q.py=q.y;
      const wave=(Math.sin(T*5.1-i*.85+this.seed)*.7+Math.sin(T*9.6-i*1.35)*.3)*(1+fastK*1.2);
      const dragX=-this.vx*(1.4+fk*1.9), dragY=-this.vy*.8;
      q.x+=vx+(-ax*.35*fk+dragX+bx*(180+wave*190)*fk)*dt2;
      q.y+=vy+(grav-ay*.2*fk+dragY+by*(140+wave*190)*fk)*dt2;
    }
    for(let it=0;it<5;it++){
      for(let i=0;i<CAPE_N;i++){
        const q=this.cape[i], pp=i?this.cape[i-1]:anchor;
        const dx=q.x-pp.x,dy=q.y-pp.y,d=Math.hypot(dx,dy)||1e-4,df=(d-CAPE_SEG)/d;
        if(i===0){q.x-=dx*df;q.y-=dy*df;}
        else{q.x-=dx*df*.5;q.y-=dy*df*.5;pp.x+=dx*df*.5;pp.y+=dy*df*.5;}
      }
      if(this.state!=='ragdoll'){
        for(let i=0;i<CAPE_N;i++){
          const q=this.cape[i];
          const rx=q.x-anchor.x,ry=q.y-anchor.y;
          const backProj=rx*bx+ry*by;
          const minBack=3+i*2.1;
          if(backProj<minBack){
            const push=minBack-backProj;
            q.x+=bx*push;q.y+=by*push;
          }
        }
      }
      for(let i=0;i<CAPE_N;i++){
        const q=this.cape[i];
        if(q.y>this.gy-2){q.y=this.gy-2;q.px+=(q.x-q.px)*.3;}
      }
    }
  }
  update(dt,targetOpp,allFighters){
    this.t+=dt;this.st+=dt;const c=this.ctrl;
    const isHL=this.skin==='homelander';
    if(!targetOpp&&this.hp>0&&this.state==='idle')this.calmT+=dt;else this.calmT=0;
    this.lagHp=Math.max(this.hp,this.lagHp-dt*28);
    this.dashCD=Math.max(0,this.dashCD-dt);
    this.grabCD=Math.max(0,this.grabCD-dt);
    this.hypCD=Math.max(0,this.hypCD-dt);
    if(this.tranceT>0){
      this.tranceT=Math.max(0,this.tranceT-dt);
      if(this.tranceT===0&&this.state==='trance'){this.state='idle';this.st=0;this.comboT=9;}
    }
    if(this.speechT>0)this.speechT=Math.max(0,this.speechT-dt);
    if(this.invT>0)this.invT-=dt;if(this.landT>0)this.landT-=dt;if(this.blend>0)this.blend-=dt;
    if(this.state!=='attack')this.comboT+=dt;
    if(this.burns.length){for(const b of this.burns)b.life-=dt;this.burns=this.burns.filter(b=>b.life>0);}
    for(const b of this.bloodStains)b.age+=dt;
    if(this.lz&&!(this.state==='attack'&&this.atk&&this.atk.laser))this.lz=null;
    if(this.state!=='ragdoll'&&this.state!=='spawn'&&(this.y>0||this.vy>0)){
      this.vy-=2200*dt;this.y+=this.vy*dt;
      if(this.y<=0){const im=-this.vy;this.y=0;this.vy=0;this.onLand(im);}
    }
    switch(this.state){
     case 'spawn':{
      this.spT-=dt;
      if(this.sp===0){if(this.spT<=0){this.sp=1;this.visible=true;this.y=this.spawnY;this.vy=0;Snd.spawn();}}
      else if(this.sp===1){
        this.vy-=2600*dt;this.y+=this.vy*dt;
        if(this.fx&&Math.random()<.5&&this.rig)this.fx.spark(this.rig.pel.x+rnd(-20,20),this.rig.pel.y+rnd(-60,60),1,'120,200,255');
        if(this.y<=0){this.y=0;this.vy=0;this.sp=2;this.spT=.55;this.st=0;
          if(this.fx){this.fx.landing(this.x,this.gy,1.2);for(let i=0;i<4;i++)this.fx.smoke(this.x+rnd(-20,20),this.gy-rnd(0,20),rnd(-60,60),-rnd(20,90),rnd(12,22),rnd(20,40),rnd(.8,1.4),.5,1);this.fx.crack(this.x,this.gy+8,1);}
          Snd.stomp();}
      }
      else if(this.sp===2){if(this.spT<=0){this.sp=3;this.spT=.45;}}
      else if(this.spT<=0){this.state='idle';this.st=0;}
      break;}
     case 'idle':{
      this.faceOpp(targetOpp);
      const mv=c.mx;
      if(c.run&&mv&&!c.hop){this.dir=mv>0?1:-1;this.hlBrake=0;this.state='run';this.st=0;break;}
      const toward=mv*this.dir,spd=mv?(toward>0?235:185):0;
      const tgtVx=mv*spd*this.speedMul();
      if(isHL&&this.hlBrake>0){
        this.hlBrake=Math.max(0,this.hlBrake-dt/.34);
        const brakeRate=lerp(9.5,14,1-this.hlBrake);
        this.vx+=(tgtVx-this.vx)*Math.min(1,dt*brakeRate);
      }else{
        this.vx+=(tgtVx-this.vx)*Math.min(1,dt*14);
      }
      if(!isHL&&Math.abs(this.vx)>8){
        this.walkPh+=(this.vx*this.dir>=0?1:-1)*Math.abs(this.vx)*dt*.08;
        const sg=Math.sin(this.walkPh)>0?1:-1;
        if(sg!==this.lastSign){this.lastSign=sg;if(Math.abs(this.vx)>120&&this.fx)this.fx.step(this.x-this.dir*10,this.gy,this.dir*(this.vx*this.dir>=0?1:-1));}
      }
      if(c.hop){this.startHop();}
      else if(c.jump){ if(mv&&this.dashCD<=0)this.startDash(toward>0?1:-1); else if(!mv)this.startJump(); }
      else if(c.laser&&isHL){this.startAttack(3);}
      else if(c.punch){this.startAttack(this.comboT<.6?this.comboStep:0);}
      break;}
     case 'run':{
      if(!c.run||!c.mx){
        if(isHL&&Math.abs(this.vx)>210){
          this.hlBrake=clamp(Math.abs(this.vx)/RUN_SPD,.35,1);
          this.hlBrakeDir=this.vx>=0?1:-1;
          this.hlBrakeFrom=this.runPose();
          if(this.hlBrake>.65)Snd.whoosh();
          if(this.fx)this.fx.dash(this.x+this.hlBrakeDir*12,this.gy,-this.hlBrakeDir);
        }
        this.state='idle';this.st=0;break;
      }
      this.dir=c.mx>0?1:-1;
      const tgt=this.dir*RUN_SPD*(this.hp<30?.9:1),A=RUN_ACC*dt;
      this.vx+=clamp(tgt-this.vx,-A,A);
      const rs=clamp(Math.abs(this.vx)/RUN_SPD,0,1);
      if(isHL){
        if(rs>.45&&this.fx){
          if(Math.random()<dt*13)this.fx.smoke(this.x-this.dir*26,this.gy-96+rnd(-14,14),-this.dir*rnd(115,190),rnd(-8,8),rnd(3,6),rnd(7,13),rnd(.14,.24),.24);
          if(Math.random()<dt*10)this.fx.dash(this.x-this.dir*8,this.gy,this.dir);
        }
      }else{
        this.walkPh+=(9+rs*13)*dt;
        const sg=Math.sin(this.walkPh)>0?1:-1;
        if(sg!==this.lastSign){this.lastSign=sg;if(rs>.25&&this.fx)this.fx.step(this.x-this.dir*10,this.gy,this.dir);}
      }
      if(c.jump){this.startDive();break;}
      for(const o of allFighters){
        if(o===this||o.hp<=0||o.y>40||o.state==='ragdoll'||o.state==='spawn')continue;
        const dx=(o.x-this.x)*this.dir;
        if(dx>-10&&dx<62&&Math.abs(this.vx)>260){this.trip(o);break;}
      }
      break;}
     case 'hop':{
      if(isHL){
        this.vx*=Math.exp(-dt*3.85);
        if(this.st>=this.hopDur){this.state='idle';this.st=0;this.comboT=9;}
        break;
      }
      this.vx*=Math.exp(-dt*1.1);
      break;}
     case 'air':{
      if(this.dive){
        this.diveT+=dt;
        let near=false;
        if(targetOpp){const dx=(targetOpp.x-this.x)*this.dir;near=dx>-20&&dx<165&&this.diveT>.1;}
        this.kickExt+=((near?1:0)-this.kickExt)*Math.min(1,dt*16);
        this.vx*=Math.exp(-dt*.25);
        if(!this.diveHit){
          for(const o of allFighters){
            if(o===this||o.hp<=0||!o.canBeHit())continue;
            const dx=(o.x-this.x)*this.dir;
            if(dx>-24&&dx<84&&this.y<175&&this.y>6){this.diveHit=true;this.kickHit(o);break;}
          }
        }
        break;
      }
      this.vx+=(c.mx*215-this.vx)*Math.min(1,dt*2.5);
      if(c.punch)this.startAttack(4);
      break;}
     case 'dash':{
      const k=1-this.st/this.dashT*.5;this.vx=this.dashW*(this.dashF?840:620)*k;
      this.dashDust-=dt;if(this.dashDust<=0&&this.fx){this.dashDust=.035;this.fx.dash(this.x,isHL?this.gy-22:this.gy,this.dashW);}
      if(this.st>=this.dashT){this.state='idle';this.st=0;this.vx*=.3;}
      break;}
     case 'attack':{
      const a=this.atk;
      if(c.punch&&!a.air)this.queued=true;
      if(!this.lungeDone&&this.st>=a.lt){this.lungeDone=true;if(a.lunge)this.vx=this.dir*a.lunge;}
      if(!a.air||this.y<=0)this.vx*=Math.exp(-dt*9);
      if(a.laser){this.updateLaser(dt,allFighters,targetOpp);}
      if(!this.wh&&this.st>=a.hs-.03){this.wh=true;Snd.whoosh();}
      if(!this.hitDone&&this.st>=a.hs&&this.st<=a.he){if(this.tryHit(a,allFighters)){this.hitDone=true;this.connected=true;}}
      if(this.st>a.he)this.hitDone=true;
      if(this.queued&&this.st>=a.cancel&&this.ak<3&&!a.air){this.startAttack(this.ak+1);break;}
      if(this.st>=a.dur){this.comboStep=(this.ak<3&&!a.air)?this.ak+1:0;this.comboT=0;this.state=this.y>0?'air':'idle';this.st=0;this.lz=null;}
      break;}
     case 'hypnosis':{
      this.updateHypnosis(dt);
      break;}
     case 'trance':{
      this.vx=0;this.vy=0;this.y=0;
      break;}
     case 'fragmenting':{
      this.vx=0;this.vy=0;
      if(this.st>=FRAGMENT_DUR)this.toRagdoll(this.fragmentDir*180,260);
      break;}
     case 'grab_prep':{
      this.vx*=Math.exp(-dt*14);
      const vic=this.grabTarget;
      if(!vic||vic.hp<=0||vic.state!=='ragdoll'||!vic.rag||vic.grabbedBy!==this||Math.abs(vic.x-this.x)>155){
        this.cancelGrab(false);break;
      }
      if(this.st>=GRAB_PREP_DUR){
        this.startGrabThrow();
      }
      break;}
     case 'grab_throw':{
      this.vx=0;
      const vic=this.grabTarget,d0=this.grabInitDir;
      if(!this.grabSlammed){
        if(!vic||vic.hp<=0||vic.state!=='ragdoll'||!vic.rag||vic.grabbedBy!==this){
          this.cancelGrab(false);break;
        }
        const u=clamp(this.st/.58,0,1);
        if(!this.grabTurned&&u>=.5){
          this.grabTurned=true;
          this.dir=-d0;
          Snd.whoosh();
        }
        const s=u<.5?.5*Math.pow(u*2,1.35):1-.5*Math.pow((1-u)*2,1.65);
        const theta=lerp(.06,Math.PI+.16,s);
        const baseY=this.gy-(this.hoverY||0);
        let hx=this.x+d0*Math.cos(theta)*52;
        let hy=Math.min(this.gy-12,(baseY-94)-Math.sin(theta)*88+Math.pow(Math.cos(theta),2)*48);
        // Keep the ankle inside both arms' reach throughout the arc, including the
        // facing change and Homelander's small hover-height adjustment this frame.
        const poseRig=computeRig(this.targetPose(),this.x,this.gy,this.y+(this.hoverY||0),this.dir,false);
        const dx=hx-poseRig.sh.x,dy=hy-poseRig.sh.y,dist=Math.hypot(dx,dy);
        const reach=UA+FA-7;
        if(dist>reach){hx=poseRig.sh.x+dx*reach/dist;hy=poseRig.sh.y+dy*reach/dist;}
        const bodyTh=lerp(.04,Math.PI+.04,s);
        const ux=d0*Math.cos(bodyTh),uy=-Math.sin(bodyTh);
        this.grabHand={x:hx,y:hy};
        vic.rag.pin={key:this.grabAnkle,x:this.grabHand.x,y:this.grabHand.y,ux,uy,lift:u<.86};
        if(this.st>=.58){
          this.grabSlammed=true;
          this.grabHand=null;
          vic.rag.pin=null;
          vic.grabbedBy=null;
          this.grabTarget=null;
          for(const k of ['pel','neck','head','kN','kF']){
            const pt=vic.rag.p[k];
            pt.x=clamp(pt.x,vic.minX-10,vic.maxX+10);
            pt.px=pt.x+d0*1.4;
            pt.py=pt.y-3.6;
          }
          const impX=clamp(lerp(vic.rag.p.pel.x,vic.rag.p.head.x,.55),vic.minX,vic.maxX);
          if(this.fx){
            this.fx.crack(impX,this.gy+8,1.2);
            this.fx.landing(impX,this.gy,1.3);
            this.fx.impact(impX,this.gy-14,this.dir,1);
            this.fx.blood(impX,this.gy-16,this.dir,10,.78);
            for(let i=0;i<4;i++)this.fx.smoke(impX+rnd(-24,24),this.gy-rnd(2,16),rnd(-85,85),-rnd(25,95),rnd(10,18),rnd(20,36),rnd(.55,1),.48,1);
          }
          Snd.stomp();Snd.hit(.92);Snd.splat(.85);
          Game.shake=Math.max(Game.shake,13);
          Game.hs=.06;
          vic.hp=Math.max(0,vic.hp-16);
          injure(vic,'torso',.95);injure(vic,'head',.75);
          if(vic.hp<=0){
            Game.ko(vic,this,{lvx:150,lvy:180,pw:1.05,keepRag:true});
          }else{
            vic.fastGetup=false;
            vic.rag.t=-.85;
            vic.rag.settle=0;
            vic.dizzyAlpha=1;
          }
        }
      }
      if(this.st>=GRAB_THROW_DUR){
        this.grabHand=null;
        this.state='idle';this.st=0;this.comboT=9;
      }
      break;}
     case 'hit':{
      this.vx*=Math.exp(-dt*8);
      if(this.st>=this.stunT){this.state='idle';this.st=0;}
      break;}
     case 'ragdoll':{
      const r=this.rag;r.update(dt);
      this.x=clamp(r.p.pel.x,this.minX,this.maxX);
      if(this.hp<80&&r.settle>.08&&r.t<4&&!r.frozen){
        this.poolT-=dt;
        if(this.poolT<=0&&this.fx){
          this.poolT=this.hp<=0?.14:.22;
          const bPt=Math.random()<.5?r.p.head:r.p.pel;
          this.fx.pool(bPt.x,this.gy+rnd(1,13),clamp((85-this.hp)/9,2.5,10));
        }
      }
      if(this.hp>0&&!this.grabbedBy&&this.tranceT<=0){
        if(this.fastGetup){ if((r.t>.35&&r.settle>.08)||r.t>1.2)this.startGetup(); }
        else if(r.t>.9&&r.settle>.35)this.startGetup();
        else if(r.t>4.2)this.startGetup();
      }
      break;}
     case 'getup':{
      this.vx=0;
      if(this.fastGetup)this.st+=dt*.8; // gets up faster after a dive/trip
      if(this.st>=GETUP_DUR){this.state='idle';this.st=0;this.invT=.45;this.comboT=9;this.fastGetup=false;}
      break;}
    }
    if(this.state!=='ragdoll'){this.x+=this.vx*dt;this.x=clamp(this.x,this.minX,this.maxX);}
    c.jump=c.punch=false;
    // Homelander hover height: lies flat on the floor in ragdoll, stands onto his feet on getup and immediately lifts off.
    if(!isHL||this.state==='ragdoll'){
      this.hoverY=0;
    }else if(this.state==='spawn'){
      this.hoverY=this.sp<3?0:HL_HOVER*ease(clamp(1-this.spT/.45,0,1));
    }else if(this.state==='getup'){
      if(this.st<1.76){this.hoverY=0;}
      else{
        if(!this.hlLiftFx){this.hlLiftFx=true;if(this.fx)this.fx.landing(this.x,this.gy,.32);}
        const lift=ease(clamp((this.st-1.76)/(GETUP_DUR-1.76),0,1));
        this.hoverY=(HL_HOVER+Math.sin(this.t*2.7+this.seed)*2.2)*lift;
      }
    }else{
      const baseH=this.state==='trance'?0:this.state==='grab_prep'?8:this.state==='run'?HL_HOVER+8:HL_HOVER;
      const tgtH=baseH+(this.state==='trance'?0:Math.sin(this.t*2.7+this.seed)*2.2);
      this.hoverY+=(tgtH-this.hoverY)*Math.min(1,dt*(this.state==='trance'?7:14));
    }
    // Orbiting pixel yellow stars while unconscious in temporary knockdown (fade out when getting up).
    if(this.hp>0&&this.state==='ragdoll'&&!this.fastGetup&&this.rag&&(this.rag.t>.12||this.dizzyAlpha>.2)){
      this.dizzyAlpha=Math.min(1,this.dizzyAlpha+dt*5.5);
    }else{
      this.dizzyAlpha=Math.max(0,this.dizzyAlpha-dt*2.4);
    }
    if(this.dizzyAlpha>0)this.dizzyPh+=dt*4.4;
    this.buildRig(dt);
    // Fire only after this frame's aiming rig is built, so the projectile starts
    // at the visible muzzle even at different frame rates and facing directions.
    if(this.hypFirePending&&this.state==='hypnosis'&&this.hypGun){
      this.hypFirePending=false;Game.fireHypBullet(this);
    }
    this.updateTie(dt);
    this.updateCape(dt);
    if(this.hp<=0&&this.state==='ragdoll'&&this.rag&&this.rag.frozen){this.corpseFade=Math.min(.14,this.corpseFade+dt*.018);}
  }
  runPose(){
    const rs=clamp(Math.abs(this.vx)/RUN_SPD,0,1);
    if(this.skin==='homelander'){
      const bob=Math.sin(this.t*7.5+this.seed)*1.1;
      // Forward-leaning power-glide: arms swept back at sides, legs nearly straight and slightly bent backward behind the spine.
      return P({
        H:lerp(85,82,rs)+bob*(1-rs*.35),
        tl:lerp(12,35,rs),
        hd:lerp(5,9,rs),
        px:lerp(2,8,rs),
        a1:lerp(18,-24,rs),e1:lerp(26,18,rs),c1:1,
        a2:lerp(12,-32,rs),e2:lerp(22,14,rs),c2:1,
        f1x:lerp(5,-46,rs),f1h:lerp(13,7.5,rs),fa1:lerp(42,62,rs),
        f2x:lerp(-9,-40,rs),f2h:lerp(1,2.5,rs),fa2:lerp(48,66,rs),
        mo:.22*rs
      });
    }
    const p=Object.assign({},D),ph=this.walkPh;
    const c1=Math.cos(ph),c2=-c1,s1=Math.sin(ph),s2=-s1;
    p.tl=6+24*rs;p.hd=lerp(3,11,rs);p.px=2+8*rs;
    p.H=84-9*rs+(2+4*rs)*Math.abs(Math.sin(ph));
    const A=12+22*rs;
    p.f1x=D.f1x+2+A*c1;p.f2x=D.f2x+2+A*c2;
    p.f1h=Math.max(0,-s1)*(10+30*rs);p.f2h=Math.max(0,-s2)*(10+30*rs);
    p.a1=lerp(40,28,rs)-lerp(10,50,rs)*c1;
    p.a2=lerp(15,28,rs)-lerp(10,50,rs)*c2;
    p.e1=lerp(115,95,rs);p.e2=lerp(140,98,rs);
    p.mo=.4*rs;
    // two-handed weapon: held on extended arms in front while sprinting
    p.gx=51;p.gy=20;p.bt=142;
    return p;
  }
  divePose(){
    if(this.skin==='homelander'){
      const lean=ease(clamp(this.diveT/.32,0,1)),ext=this.kickExt;
      return P({
        H:lerp(78,72,lean),
        tl:lerp(48,66,lean)+4*ext,
        hd:lerp(16,26,lean),
        px:lerp(8,12,lean),
        a1:lerp(92,108,lean)+6*ext,e1:4,c1:1,
        a2:lerp(86,102,lean)+6*ext,e2:6,c2:1,
        f1x:lerp(-52,-72,lean),f1h:lerp(18,36,lean),fa1:lerp(72,96,lean),
        f2x:lerp(-48,-68,lean),f2h:lerp(14,32,lean),fa2:lerp(76,100,lean),
        mo:.5
      });
    }
    const lean=ease(clamp(this.diveT/.55,0,1));
    const base=P({H:lerp(80,72,lean),tl:lerp(20,-40,lean),hd:lerp(10,-10,lean),px:lerp(5,-6,lean),
      a1:lerp(-30,-55,lean),e1:20,a2:lerp(-40,-60,lean),e2:15,
      f1x:lerp(40,46,lean),f1h:lerp(30,38,lean),f2x:lerp(-30,-6,lean),f2h:lerp(26,18,lean),mo:.5,
      gx:lerp(50,38,lean),gy:lerp(22,32,lean),bt:lerp(135,85,lean)});
    return mix(base,KICK_POSE,this.kickExt);
  }
  targetPose(){
    const s=this.state,t=this.t,isHL=this.skin==='homelander';
    switch(s){
     case 'spawn':{
      if(this.sp<3){const p=Object.assign({},T_POSE);if(this.sp===2){p.H+=Math.sin(this.st*38)*1.2*(this.spT/.55);p.tl+=Math.sin(this.st*30)*2*(this.spT/.55);}p.ey=0;return p;}
      return mix(T_POSE,isHL?HL_IDLE:D,ease(1-this.spT/.45));}
     case 'getup':return sampleKF(this.skin==='negan'?GETUP_NEGAN:isHL?GETUP_HL:GETUP,this.st);
     case 'hypnosis':return HYPNO_POSE;
     case 'trance':return mix(this.tranceFrom||D,TRANCE_POSE,ease(clamp(this.st/TRANCE_KNEEL,0,1)));
     case 'grab_prep':{
      const p=Object.assign({},GRAB_PREP_POSE);
      if(isHL){p.f1x=12;p.f1h=10;p.fa1=34;p.f2x=-10;p.f2h=2;p.fa2=42;}
      if(this.skin==='negan'){p.a1=-16;p.e1=22;p.c1=1;p.a2=34;p.e2=24;p.c2=0;p.bg=0;}
      p.tl+=Math.sin(t*7)*1.8;p.a2+=Math.sin(t*7)*3;
      return p;}
     case 'grab_throw':{
      const p=sampleKF(GRAB_THROW_KF,this.st);
      if(isHL){
        const hlP=Object.assign({},p,{f1x:12,f1h:12,fa1:36,f2x:-10,f2h:2,fa2:44});
        const endK=clamp((this.st-.62)/.22,0,1);
        return endK>0?mix(hlP,HL_IDLE,ease(endK)):hlP;
      }
      return p;}
     case 'win':{
      if(isHL){const p=Object.assign({},HL_IDLE,{tl:-5,hd:-10,a1:142,e1:22,c1:1,a2:154,e2:16,c2:1,mo:1});p.a1+=Math.sin(t*8)*5;p.a2+=Math.sin(t*8+1)*5;return p;}
      const p=Object.assign({},WIN);p.H+=Math.sin(t*5)*1.5;p.a1+=Math.sin(t*9)*6;p.a2+=Math.sin(t*9+1)*6;return p;}
     case 'hit':{
      const base=this.hitZone==='head'?HITH:HITB;
      const p=isHL?Object.assign({},base,{f1x:10,f1h:14,fa1:42,f2x:-10,f2h:2,fa2:50}):Object.assign({},base);
      const sh=Math.sin(this.st*55)*Math.max(0,1-this.st/this.stunT)*5;p.tl+=sh;p.hd+=sh*1.3;return p;}
     case 'air':{
      if(this.dive)return this.divePose();
      if(isHL){
        const up=clamp(this.vy/650+.1,0,1);
        return P({H:86,tl:lerp(4,12,up)+clamp(this.vx*this.dir/55,-8,14),hd:lerp(0,8,up),a1:lerp(24,42,up),e1:34,c1:0,a2:lerp(16,32,up),e2:38,c2:0,f1x:8,f1h:18,fa1:44,f2x:-12,f2h:6,fa2:52,mo:.2});
      }
      const p=mix(FALL,RISE,clamp(this.vy/650+.1,0,1));p.tl+=clamp(this.vx*this.dir/60,-4,6);return p;}
     case 'hop':{
      if(isHL){
        const k=1-clamp(this.st/this.hopDur,0,1);
        return P({H:84,tl:lerp(2,-20,k),hd:lerp(2,10,k),px:lerp(0,-6,k),a1:lerp(20,52,k),e1:32,c1:0,a2:lerp(12,38,k),e2:36,c2:0,f1x:lerp(7,28,k),f1h:lerp(13,20,k),fa1:36,f2x:lerp(-9,14,k),f2h:lerp(0,12,k),fa2:44,mo:.25});
      }
      const k=clamp(this.vy/450,-1,1);return P({H:82,tl:lerp(2,-20,(k+1)/2),hd:-6,px:-5,a1:50,e1:100,a2:30,e2:112,f1x:30,f1h:36,f2x:12,f2h:28,mo:.3,gx:50,gy:18,bt:158});}
     case 'run':return this.runPose();
     case 'dash':{
      if(isHL){
        return this.dashF
          ?P({H:80,tl:38,hd:12,px:8,a1:78,e1:14,c1:1,a2:70,e2:18,c2:1,f1x:-48,f1h:9,fa1:64,f2x:-42,f2h:4,fa2:68,mo:.3})
          :P({H:84,tl:-18,hd:8,px:-5,a1:46,e1:34,c1:0,a2:34,e2:38,c2:0,f1x:24,f1h:18,fa1:36,f2x:10,f2h:10,fa2:44,mo:.2});
      }
      return this.dashF?DASHF:DASHB;}
     case 'attack':return sampleKF(this.atk.kf,this.st);
    }
    if(isHL){
      const p=Object.assign({},HL_IDLE),sp=Math.abs(this.vx),w=clamp(sp/210,0,1),b=t*3.1+this.seed;
      p.tl+=Math.sin(b+1)*.9*(1-w);
      p.a1+=Math.sin(b+.5)*2.4*(1-w);p.a2+=Math.sin(b+1.4)*2.4*(1-w);
      p.f1h+=Math.sin(b)*1.8*(1-w);
      if(w>0){
        const fwd=this.vx*this.dir>=0;
        if(fwd){
          p.tl+=15*w;p.hd+=6*w;p.px+=4*w;
          p.a1=lerp(p.a1,-12,w);p.a2=lerp(p.a2,-18,w);
          p.f1x=lerp(p.f1x,-10,w);p.f1h=lerp(p.f1h,17,w);p.fa1=lerp(p.fa1,56,w);
          p.f2x=lerp(p.f2x,-24,w);p.f2h=lerp(p.f2h,8,w);p.fa2=lerp(p.fa2,64,w);
        }else{
          p.tl-=11*w;p.hd+=3*w;p.px-=3*w;
          p.a1=lerp(p.a1,34,w);p.a2=lerp(p.a2,26,w);
          p.f1x=lerp(p.f1x,18,w);p.f1h=lerp(p.f1h,16,w);p.fa1=lerp(p.fa1,34,w);
          p.f2x=lerp(p.f2x,4,w);p.f2h=lerp(p.f2h,6,w);p.fa2=lerp(p.fa2,42,w);
        }
      }
      if(this.hp<30){p.tl+=5;p.mo=.25+.2*Math.sin(t*9);p.hd+=4;}
      if(this.hlBrake>0){
        const bk=this.hlBrake;
        if(bk>.55){
          const u=ease((bk-.55)/.45);
          return mix(HL_BRAKE_POSE,this.hlBrakeFrom||HL_BRAKE_POSE,u);
        }
        return mix(p,HL_BRAKE_POSE,ease(bk/.55));
      }
      return p;
    }
    const p=Object.assign({},D),sp=Math.abs(this.vx),w=clamp(sp/140,0,1),b=t*5.6+this.seed;
    if(this.calmT>2.8&&sp<12){
      p.a1=54+Math.sin(t*1.2)*2;p.a2=54+Math.sin(t*1.2+1)*2;p.e1=105;p.e2=105;p.tl+=Math.sin(t*1.4)*.5;p.H-=1.5;p.hd+=Math.sin(t*.8)*1.2;
      p.gx=50;p.gy=22;p.bt=150;
      return p;
    }
    p.H+=Math.sin(b)*1.7*(1-w);p.tl+=Math.sin(b+1)*1.2*(1-w);p.a1+=Math.sin(b+.6)*3*(1-w);p.a2+=Math.sin(b+1.2)*3*(1-w);
    p.f1x+=Math.sin(t*2.8)*2*(1-w);p.f2x-=Math.sin(t*2.8)*2*(1-w);
    p.bt+=Math.sin(b+.6)*3*(1-w);p.gy+=Math.sin(b)*1.2*(1-w);
    if(w>0){
      const fwd=this.vx*this.dir>=0,ph=this.walkPh,A=fwd?21:14;
      const c1=Math.cos(ph),c2=Math.cos(ph+Math.PI),s1=Math.sin(ph),s2=Math.sin(ph+Math.PI);
      p.f1x=lerp(p.f1x,D.f1x+(fwd?3:-2)+A*c1,w);p.f2x=lerp(p.f2x,D.f2x+(fwd?3:-2)+A*c2,w);
      p.f1h=Math.max(0,-s1)*(fwd?15:11)*w;p.f2h=Math.max(0,-s2)*(fwd?15:11)*w;
      p.H+=(-2+3.2*Math.abs(Math.sin(ph)))*w;p.tl+=(fwd?7:-6)*w;p.hd+=(fwd?3:-4)*w;p.px+=(fwd?3:-3)*w;
      p.a1+=Math.sin(ph*2)*(fwd?8:4)*w;p.a2+=Math.sin(ph*2+1.5)*(fwd?6:3)*w;if(!fwd){p.e1+=10*w;p.e2+=8*w;}
      p.bt+=Math.sin(ph*2)*4*w;
    }
    if(this.landT>0)return mix(p,LAND,clamp(this.landT/.12,0,1));
    if(this.hp<30){p.tl+=6;p.H-=4;p.mo=.25+.2*Math.sin(t*9);p.hd+=4;}
    return p;
  }
  buildRig(dt){
    if(this.state==='ragdoll'){this.rig=this.rag.toRig(this);return;}
    if(this.state==='fragmenting')return; // retain the impact pose for the eventual ragdoll
    const tp=this.targetPose();
    const hard=this.state==='getup'||this.state==='spawn'||this.state==='grab_throw'||this.state==='trance';
    const k=hard?1:(this.state==='attack'||this.state==='hit')?1-Math.exp(-dt*45):1-Math.exp(-dt*24);
    this.cur=(this.cur&&!hard)?mix(this.cur,tp,k):Object.assign({},tp);
    const hasBat=this.skin==='negan'&&this.hp>0&&!this.batLost&&!(this.state==='grab_throw'&&this.st<.68);
    let R=computeRig(this.cur,this.x,this.gy,this.y+(this.hoverY||0),this.dir,hasBat);
    if(this.state==='hypnosis')poseHypnosisArm(R,this);
    if(this.state==='grab_throw'&&this.grabHand&&!this.grabSlammed)pinHandsWorld(R,this.grabHand.x,this.grabHand.y);
    if(this.state==='getup'&&this.blend>0&&this.blendFrom)R=blendRig(this.blendFrom,R,ease(1-this.blend/.3));
    this.rig=R;
  }
}
/* ============================ AUTONOMOUS BRAWL CONTROLLER ============================ */
/*
  Modes:
   engage  - walk up and fight (combo), Homelander may open with the eye laser from range
   retreat - when the enemy is down: turn away and walk/run to the far end of the arena
   wait    - turn around and wait for the enemy to stand up
   charge  - sprint at the enemy and (usually) leap into a flying kick; the timing can be wrong on purpose
  Also: reacts to incoming strikes with a back-hop (dodge) and sometimes intercepts runners.
*/
class AutoCombat{
  constructor(){
    this.attackWait=rnd(.25,.75);this.mode='engage';this.modeT=0;
    this.hopCD=rnd(0,1);this.reactT=-1;this.seen=Object.create(null);
    this.downDecided=false;this.farCD=rnd(.3,1.5);this.laserCD=rnd(1,3);
    this.dodgeP=rnd(.28,.5);this.retreatP=rnd(.35,.6);
    this.jumpDist=250;this.goalX=0;this.retRun=false;
    this.rolled=false;this.intercept=false;this.afterHop=0;
    this.grabChecked=0;
  }
  setMode(m){this.mode=m;this.modeT=0;}
  startCharge(dist){
    this.setMode('charge');
    const r=Math.random();
    // 10%: never jumps and runs into the enemy; 12%: jumps too early; 10%: too late; otherwise a good timing
    let jd=r<.10?-1:r<.22?rnd(350,440):r<.32?rnd(30,70):rnd(190,300);
    if(jd>0&&jd>dist-120)jd=Math.max(30,dist-120);
    this.jumpDist=jd;
  }
  update(dt,f,o,all){
    const c=f.ctrl;
    c.mx=0;c.jump=false;c.punch=false;c.run=false;c.laser=false;c.hop=false;c.noFace=false;
    this.attackWait-=dt;this.hopCD-=dt;this.farCD-=dt;this.laserCD-=dt;this.modeT+=dt;
    if(!o||f.hp<=0){this.mode='engage';return;}
    const st=f.state;
    if(st==='grab_prep'||st==='grab_throw'||st==='hypnosis'||st==='trance'){c.noFace=true;return;}
    const dx=o.x-f.x,dist=Math.abs(dx),toward=dx>=0?1:-1;
    if(st==='ragdoll'||st==='getup'||st==='spawn'||st==='hit'){
      this.mode='engage';this.reactT=-1;
      if(st!=='ragdoll')f.faceOpp(o);
      return;
    }
    if(this.mode!=='retreat'&&this.mode!=='grab_approach'&&st!=='run'&&st!=='air'&&st!=='hop')f.faceOpp(o);
    if(st==='air'||st==='hop'||st==='dash')return;

    // ---- dodge: notice a fresh strike aimed at me and hop back ----
    if(st==='idle'){
      for(const e of all){
        if(e===f||e.hp<=0||e.state!=='attack'||!e.atk||e.atk.laser)continue;
        if(this.seen[e.id]===e.atkStamp)continue;
        this.seen[e.id]=e.atkStamp;
        const d=(f.x-e.x)*e.dir;
        if(d<-10||d>e.atk.reach+60)continue;
        if(e.st>e.atk.hs-.02)continue;
        if(this.hopCD<=0&&this.reactT<0&&Math.random()<this.dodgeP*(f.hp<45?1.35:1))this.reactT=rnd(.015,.06);
      }
      if(this.reactT>=0){
        this.reactT-=dt;
        if(this.reactT<0){c.hop=true;this.hopCD=rnd(1.8,3);this.afterHop=.5;return;}
      }
      if(this.afterHop>0){ // landed: sometimes answer with a charge
        this.afterHop-=dt;
        if(this.afterHop<=0){
          const dn=o.state==='ragdoll'||o.state==='getup'||o.state==='spawn';
          if(!dn&&dist>170&&Math.random()<.4){this.startCharge(dist);}
        }
      }
    }

    // Jane decides autonomously, just like Homelander's laser, but the
    // cooldown is consumed only when an eligible standing target is acquired.
    if(st==='idle'&&dist>=150&&f.canHypnotize(o)&&Math.random()<dt*(dist>=190?4:1.8)){
      if(f.startHypnosis(o)){this.setMode('engage');this.attackWait=Math.max(this.attackWait,.8);return;}
    }
    const oppDown=o.state==='ragdoll'||o.state==='getup'||o.state==='spawn';
    if(this.mode==='grab_approach'){
      if(o.hp<=0||o.state!=='ragdoll'||!o.rag||o.grabbedBy||f.grabCD>0||this.modeT>2.3||!f.canThrowFromHere(o)){
        this.setMode('engage');return;
      }
      const d0=Math.abs(o.x-f.x)>8?(o.x>f.x?1:-1):f.dir;
      const P=o.rag.p,footX=clamp(Math.abs(P.aN.x-f.x)<=Math.abs(P.aF.x-f.x)?P.aN.x:P.aF.x,o.x-85,o.x+85);
      const standX=footX-d0*44;
      if(standX<f.minX+18||standX>f.maxX-18||standX-d0*195<f.minX+12||standX-d0*195>f.maxX-12){
        this.setMode('engage');return;
      }
      const gd=standX-f.x;
      if(Math.abs(gd)>22){
        c.noFace=true;
        const md=gd>0?1:-1;c.mx=md;c.run=Math.abs(gd)>125;
        if(st==='idle')f.dir=md;
      }else if(st==='idle'&&o.rag.settle>.04){
        f.startGrabPrep(o,d0);
        this.setMode('engage');
      }
      return;
    }
    if(this.mode==='charge'){
      if(oppDown||this.modeT>5){this.setMode('engage');return;}
      c.mx=toward;c.run=true;
      if(st==='run'&&this.jumpDist>0&&dist<=this.jumpDist&&Math.abs(f.vx)>=RUN_SPD*(dist>260?.88:.5)){
        c.jump=true;this.setMode('engage');
      }
      return;
    }
    if(this.mode==='retreat'){
      c.noFace=true;
      const gd=this.goalX-f.x;
      if(Math.abs(gd)>36&&this.modeT<7&&!(!oppDown&&dist<190)){
        const d=gd>0?1:-1;c.mx=d;c.run=this.retRun;
        if(st==='idle')f.dir=d;
      }else{this.setMode(Math.abs(gd)>36?'engage':'wait');}
      return;
    }
    if(this.mode==='wait'){
      if(st!=='idle')return;
      if(!oppDown&&this.modeT>.5){
        if(f.skin==='homelander'&&this.laserCD<=0&&dist>180){c.laser=true;this.laserCD=rnd(5,9);this.setMode('engage');return;}
        if(dist>300)this.startCharge(dist);else this.setMode('engage');
      }
      if(this.modeT>7)this.setMode('engage');
      return;
    }
    // ---- engage ----
    if(st==='attack'||st!=='idle')return;
    if(oppDown){
      if(o.state==='ragdoll'&&o.rag&&!o.fastGetup&&!o.grabbedBy&&this.grabChecked!==o.rag.id){
        if(f.grabCD<=0&&dist<320&&f.canThrowFromHere(o)){
          // A distant or wall-blocked knockdown can become eligible later.
          this.grabChecked=o.rag.id;
          let threatNear=false;
          for(const e of all){
            if(e!==f&&e!==o&&e.hp>0&&e.state!=='ragdoll'&&e.state!=='spawn'&&Math.abs(e.x-f.x)<200){threatNear=true;break;}
          }
          let pGrab=threatNear?.08:(o.hp>38?.38:.28);
          if(f.hp<25&&threatNear)pGrab=0;
          if(Math.random()<pGrab){this.setMode('grab_approach');return;}
        }
      }
      if(!this.downDecided){
        this.downDecided=true;
        const W=Game.W;this.goalX=o.x<W/2?W-120:120;
        if(Math.abs(f.x-this.goalX)>260&&Math.random()<this.retreatP){this.retRun=Math.random()<.55;this.setMode('retreat');return;}
      }
      if(dist>112)c.mx=toward;
      return;
    }
    this.downDecided=false;
    const incoming=(o.state==='run'||o.dive)&&dist<230&&((f.x-o.x)*o.dir>0);
    if(incoming){
      if(!this.rolled){this.rolled=true;this.intercept=Math.random()<.6;if(this.intercept)this.attackWait=Math.min(this.attackWait,rnd(0,.1));}
    }else this.rolled=false;
    if(dist>380&&this.farCD<=0){
      this.farCD=rnd(1.5,3);
      if(f.skin==='homelander'&&this.laserCD<=0&&Math.random()<.5){c.laser=true;this.laserCD=rnd(5,9);return;}
      if(Math.random()<.5){this.startCharge(dist);return;}
    }
    if(f.skin==='homelander'&&dist>200&&dist<760&&this.laserCD<=0&&this.attackWait<=0&&Math.random()<dt*.8){
      c.laser=true;this.laserCD=rnd(5,9);this.attackWait=rnd(.8,1.2);return;
    }
    if(dist>108)c.mx=toward;
    else if(dist<62)c.mx=-toward*.08;
    const reach=(incoming&&this.intercept)?170:136;
    if(dist<=reach&&this.attackWait<=0){
      c.mx=0;
      c.punch=true;
      this.attackWait=rnd(.72,1.05);
    }
  }
}
/* ============================ BACKGROUND ============================ */
function makeBG(W,H,gy,S){
  const c=document.createElement('canvas');const px=S/BODY_PIXEL;c.width=Math.ceil(W*px);c.height=Math.ceil(H*px);const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.scale(px,px);
  let g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'#0b0910');g.addColorStop(.6,'#221620');g.addColorStop(1,'#150f14');x.fillStyle=g;x.fillRect(0,0,W,H);
  x.strokeStyle='rgba(0,0,0,.35)';x.lineWidth=1;
  for(let y=0,r=0;y<gy-60;y+=22,r++){const off=(r%2)*30;for(let xx=-off;xx<W;xx+=60)x.strokeRect(xx,y,60,22);}
  for(let i=0;i<300;i++){x.fillStyle=`rgba(${rnd(60,130)|0},${rnd(25,50)|0},${rnd(25,45)|0},${rnd(.03,.1)})`;x.fillRect(rnd(W),rnd(gy-60),rnd(10,60),rnd(6,22));}
  x.save();x.font="900 56px 'Russo One',Impact,sans-serif";x.textAlign='center';x.shadowColor='#ff2a44';x.shadowBlur=28;x.strokeStyle='#ff4a5e';x.lineWidth=3;x.strokeText('DUMMY FURY',W/2,110);x.fillStyle='rgba(255,120,130,.25)';x.fillText('DUMMY FURY',W/2,110);x.restore();
  for(let row=0;row<2;row++){
    const by=gy-118+row*14;
    for(let xx=-10;xx<W+20;xx+=24+rnd(8)){
      const hh=rnd(0,8),shade=row?'#0b0809':'#150f14';
      x.fillStyle=shade;x.beginPath();x.ellipse(xx,by+34-hh*.3,17,24,0,Math.PI,0);x.fill();x.fillRect(xx-17,by+34-hh*.3,34,40);
      x.beginPath();x.arc(xx,by+6-hh,9,0,TAU);x.fill();
      x.fillStyle='rgba(255,170,120,.07)';x.beginPath();x.arc(xx-2,by+4-hh,8,Math.PI,Math.PI*1.7);x.fill();
      if(Math.random()<.12){x.strokeStyle=shade;x.lineWidth=5;x.lineCap='round';x.beginPath();x.moveTo(xx+10,by+24);x.lineTo(xx+16,by-14-hh);x.stroke();}
    }
  }
  x.strokeStyle='rgba(180,190,210,.06)';x.lineWidth=1;
  for(let i=-H;i<W+H;i+=22){x.beginPath();x.moveTo(i,20);x.lineTo(i+H,20+H);x.stroke();x.beginPath();x.moveTo(i+H,20);x.lineTo(i,20+H);x.stroke();}
  x.fillStyle='#17151b';x.fillRect(0,gy-62,W,8);x.fillStyle='rgba(255,255,255,.12)';x.fillRect(0,gy-62,W,1.5);
  x.fillStyle='#0f0d12';for(let xx=20;xx<W;xx+=70)x.fillRect(xx,gy-54,5,30);
  x.fillStyle='#14121a';x.fillRect(22,0,10,gy-24);x.fillRect(W-32,0,10,gy-24);
  for(const lx of [W*.2,W*.5,W*.8]){x.strokeStyle='#333';x.lineWidth=2;x.beginPath();x.moveTo(lx,0);x.lineTo(lx,34);x.stroke();x.fillStyle='#2a2a30';x.beginPath();x.moveTo(lx-22,52);x.lineTo(lx-8,34);x.lineTo(lx+8,34);x.lineTo(lx+22,52);x.closePath();x.fill();x.fillStyle='#ffe0a0';x.beginPath();x.ellipse(lx,52,17,3.5,0,0,TAU);x.fill();}
  const ft=gy-24;g=x.createLinearGradient(0,ft,0,H);g.addColorStop(0,'#2d2b33');g.addColorStop(1,'#16151a');x.fillStyle=g;x.fillRect(0,ft,W,H-ft);
  x.fillStyle='rgba(0,0,0,.5)';x.fillRect(0,ft,W,3);
  x.strokeStyle='rgba(0,0,0,.35)';x.lineWidth=1.2;
  for(let k=-14;k<=14;k++){x.beginPath();x.moveTo(W/2+k*34,ft);x.lineTo(W/2+k*120,H);x.stroke();}
  for(let i=1;i<6;i++){const y=ft+(H-ft)*Math.pow(i/6,1.6);x.beginPath();x.moveTo(0,y);x.lineTo(W,y);x.stroke();}
  x.strokeStyle='rgba(255,200,60,.22)';x.lineWidth=3;x.beginPath();x.ellipse(W/2,gy+24,Math.min(W*.4,360),52,0,0,TAU);x.stroke();
  for(let i=0;i<500;i++){x.fillStyle=`rgba(255,255,255,${rnd(.01,.04)})`;x.fillRect(rnd(W),rnd(ft,H),rnd(1,3),1);}
  return c;
}
function makeVignette(W,H,S){
  const c=document.createElement('canvas');c.width=Math.round(W*S);c.height=Math.round(H*S);const x=c.getContext('2d');
  const g=x.createRadialGradient(c.width/2,c.height/2,c.height*.35,c.width/2,c.height/2,c.width*.65);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.65)');x.fillStyle=g;x.fillRect(0,0,c.width,c.height);return c;
}
function clearPixelLayer(layer){
  const c=layer.ctx;
  c.setTransform(1,0,0,1,0,0);
  c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';
  c.shadowBlur=0;c.shadowColor='transparent';c.setLineDash([]);
  c.clearRect(0,0,layer.canvas.width,layer.canvas.height);
  c.imageSmoothingEnabled=false;
  c.setTransform(layer.scale,0,0,layer.scale,0,0);
}
// Laser beam (drawn on the 3px FX layer): glow, hot body and white core, plus an impact flare.
function drawBeam(g,lz){
  const fl=.85+Math.random()*.3,sn=v=>Math.round(v/3)*3;
  g.save();g.lineCap='butt';
  const line=()=>{g.beginPath();g.moveTo(lz.sx,lz.sy);g.lineTo(lz.ex,lz.ey);g.stroke();};
  g.strokeStyle='rgba(255,70,25,.30)';g.lineWidth=15*fl;line();
  g.strokeStyle='rgba(255,130,40,.82)';g.lineWidth=7*fl;line();
  g.strokeStyle='#fff0c0';g.lineWidth=3;line();
  const x=sn(lz.ex),y=sn(lz.ey),s=lz.surf==='floor'?1:0;
  g.fillStyle='rgba(255,90,25,.55)';g.fillRect(x-12*fl,y-(s?6:12)*fl,24*fl,(s?12:24)*fl);
  g.fillStyle='rgba(255,170,50,.9)';g.fillRect(x-6,y-(s?3:6),12,s?6:12);
  g.fillStyle='#fff6d0';g.fillRect(x-3,y-3,6,6);
  g.restore();
}
function drawEyeGlow(g,f){
  const a=f.atk;if(!a||!a.laser||!f.rig)return;
  const e=f.laserEye();
  const k=f.st<a.chargeT?f.st/a.chargeT:1;
  const s=Math.round((3+k*9)/3)*3;
  g.fillStyle=`rgba(255,60,25,${.25+k*.35})`;g.fillRect(e.x-s,e.y-s,s*2,s*2);
  g.fillStyle=`rgba(255,120,40,${.5+k*.4})`;g.fillRect(e.x-s/2-1.5,e.y-s/2-1.5,s+3,s+3);
  g.fillStyle='#fff3c8';g.fillRect(Math.round(e.x/3)*3-3,Math.round(e.y/3)*3-3,6,6);
}
/*
  Pixel-art yellow dizzy stars orbiting above a knocked-out (unconscious) fighter's head.
  Rendered on the 3px pixel FX layer so every block snaps cleanly to the pixel grid.
*/
function drawDizzyStars(g,f){
  if(!f.rig||f.dizzyAlpha<=.02)return;
  const hd=f.rig.head,a=f.dizzyAlpha;
  const sn=v=>Math.round(v/3)*3;
  const cx=hd.x,cy=hd.y-26,rx=21,ry=6.5;
  const stars=[];
  for(let i=0;i<3;i++){
    const ang=f.dizzyPh+i*(TAU/3);
    stars.push({ang,s:Math.sin(ang),c:Math.cos(ang),i});
  }
  stars.sort((A,B)=>A.s-B.s);
  g.save();
  for(const st of stars){
    const front=st.s>=-.05;
    // subtle pixel trail dot behind each orbiting star
    const tang=st.ang-.34;
    const tx=sn(cx+Math.cos(tang)*rx),ty=sn(cy+Math.sin(tang)*ry);
    g.globalAlpha=a*(front?.48:.26);
    g.fillStyle='#f6b918';
    g.fillRect(tx-1.5,ty-1.5,3,3);

    const sx=sn(cx+st.c*rx),sy=sn(cy+st.s*ry+Math.sin(f.dizzyPh*2+st.i)*1.5);
    g.globalAlpha=a*(front?1:.76);
    if(front){
      // 5x5 pixel star (15x15 world units on the 3px grid): warm amber outline + bright yellow arms + pale core
      g.fillStyle='#a85c05';
      g.fillRect(sx-1.5,sy-7.5,3,15);
      g.fillRect(sx-7.5,sy-1.5,15,3);
      g.fillRect(sx-4.5,sy-4.5,9,9);
      g.fillStyle='#ffd624';
      g.fillRect(sx-1.5,sy-4.5,3,9);
      g.fillRect(sx-4.5,sy-1.5,9,3);
      g.fillStyle='#fff9b8';
      g.fillRect(sx-1.5,sy-1.5,3,3);
    }else{
      // slightly smaller pixel star on the far side of the orbit for 3D depth
      g.fillStyle='#a85c05';
      g.fillRect(sx-1.5,sy-4.5,3,9);
      g.fillRect(sx-4.5,sy-1.5,9,3);
      g.fillStyle='#ffd020';
      g.fillRect(sx-1.5,sy-1.5,3,3);
      g.fillStyle='#fff6a8';
      g.fillRect(sx-1.5,sy-1.5,3,3);
    }
  }
  g.restore();
}
/*
  Small pixel-art gray circle that fills with green over GRAB_PREP_DUR right before a leg-grab slam,
  and immediately disappears once filled or if interrupted.
*/
function drawGrabCircle(g,f){
  if(f.state!=='grab_prep'||!f.grabTarget)return;
  const vic=f.grabTarget;
  const prog=clamp(f.st/GRAB_PREP_DUR,0,1);
  if(prog>=1)return;
  const sn=v=>Math.round(v/3)*3;
  const cx=sn(lerp(f.x+f.dir*24,vic.x,.48)),cy=sn(f.gy-132);
  g.save();
  g.fillStyle='rgba(14,16,22,.88)';
  g.beginPath();g.arc(cx,cy,14.5,0,TAU);g.fill();
  g.fillStyle='#636a7a';
  g.beginPath();g.arc(cx,cy,11.5,0,TAU);g.fill();
  g.fillStyle='#2b303a';
  g.beginPath();g.arc(cx,cy,5.4,0,TAU);g.fill();
  if(prog>.01){
    const a0=-Math.PI/2,a1=a0+TAU*prog;
    g.fillStyle='#37d858';
    g.beginPath();g.moveTo(cx,cy);g.arc(cx,cy,11.5,a0,a1);g.closePath();g.fill();
    g.fillStyle='#9affad';
    g.beginPath();g.moveTo(cx,cy);g.arc(cx,cy,11.5,Math.max(a0,a1-.22),a1);g.closePath();g.fill();
    g.fillStyle='#232830';
    g.beginPath();g.arc(cx,cy,5.4,0,TAU);g.fill();
    g.fillStyle='rgba(65,225,98,.42)';
    g.beginPath();g.moveTo(cx,cy);g.arc(cx,cy,5.4,a0,a1);g.closePath();g.fill();
  }
  g.restore();
}
function drawHypBullet(g,p,alpha=1){
  const x0=p.prevX===undefined?p.x0:p.prevX,y0=p.prevY===undefined?p.y0:p.prevY;
  const x1=p.x===undefined?p.x1:p.x,y1=p.y===undefined?p.y1:p.y;
  g.save();g.globalAlpha=alpha;g.lineCap='square';
  g.strokeStyle='#bd7608';g.lineWidth=9;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();
  g.strokeStyle='#ffe52f';g.lineWidth=5;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();
  g.fillStyle='#fff9a6';g.fillRect(Math.round(x1/3)*3-3,Math.round(y1/3)*3-3,6,6);
  g.restore();
}
function drawTranceText(g,f,W,camera,displayScale){
  if(!f.rig||f.hp<=0||f.tranceT<=0)return;
  const z=camera?camera.zoom:1;
  const left=camera?Math.max(0,camera.x-W/(2*z)):0,right=camera?Math.min(W,camera.x+W/(2*z)):W;
  const top=camera?Math.max(0,camera.y-270/z):0;
  // Keep a minimum readable CSS-pixel size on a letterboxed phone canvas.
  const fontSize=clamp(11/((displayScale||1)*z),12,30),k=fontSize/12;
  const head=f.rig.head;
  if(head.x<left-25||head.x>right+25)return;
  const cx=clamp(head.x,left+45*k,right-45*k);
  const hasSpeech=f.speechT>0&&f.trancePhrase;
  const labelY=Math.max(top+(hasSpeech?45:14)*k,head.y-27*k);
  const pulse=(1+Math.sin(f.t*4.2))*.5;
  g.save();g.textAlign='center';g.textBaseline='middle';g.font=`bold ${fontSize}px monospace`;
  g.lineWidth=3*k;g.strokeStyle='#31200a';g.fillStyle=`rgb(255,${Math.round(190+pulse*55)},${Math.round(30+pulse*68)})`;
  g.strokeText('In trance',cx,labelY);g.fillText('In trance',cx,labelY);
  if(hasSpeech){
    const text=f.trancePhrase,w=Math.min(right-left-16,Math.ceil((text.length*7.25+20)*k/3)*3),h=27*k;
    const x=clamp(Math.round((head.x-w/2)/3)*3,left+8,right-w-8),y=Math.max(top+5,labelY-h-13*k);
    const tail=clamp(cx,x+6*k,x+w-6*k);
    // Rectilinear, static pixel cloud; the line itself is never animated.
    g.fillStyle='#181821';g.fillRect(x+3*k,y,w-6*k,h);g.fillRect(x,y+3*k,w,h-6*k);
    g.fillStyle='#fff9e9';g.fillRect(x+5*k,y+3*k,w-10*k,h-6*k);g.fillRect(x+3*k,y+6*k,w-6*k,h-12*k);
    g.fillStyle='#181821';g.fillRect(tail-3*k,y+h-k,6*k,6*k);
    g.fillStyle='#fff9e9';g.fillRect(tail-3*k,y+h-3*k,3*k,4*k);
    g.fillStyle='#232027';g.fillText(text,x+w/2,y+h/2+.5);
  }
  g.restore();
}
/* ============================ SANDBOX GAME ENGINE ============================ */
const Game={
  W:960,H:540,gy:468,S:1,cv:null,
  shake:0,hs:0,ts:1,tsT:0,
  fighters:[],
  droppedBats:[],droppedGuns:[],bullets:[],tracers:[],camera:null,
  autoSpawn:true,
  respawnTimer:0,
  koCount:0,
  fx:null,
  init(){
    this.cv=document.querySelector('#gameCv');
    this.ctx=this.cv.getContext('2d');
    this.ctx.imageSmoothingEnabled=false;
    this.fighters=[];this.droppedBats=[];this.droppedGuns=[];this.bullets=[];this.tracers=[];
    this.koCount=0;this.shake=0;this.hs=0;this.ts=1;this.tsT=0;this.respawnTimer=0;this.autoSpawn=true;
    this.camera={x:this.W/2,y:270,zoom:1,vignette:0,owner:null,slowLeft:0,slowDuration:1.05};
    skinCursor=0;
    this.fx=new FX();
    this.dc=document.createElement('canvas');
    this.dctx=this.dc.getContext('2d');
    this.resize();
    this.camera.x=this.W/2;
    this.fx.decal=this.dctx;
    this.fx.floorY=this.gy;
    this.spawnPair();
  },
  resize(){
    const iw=innerWidth,ih=innerHeight;if(!iw||!ih)return;
    const asp=iw/ih;this.W=clamp(asp*540,800,1300);
    // On narrow/portrait screens fitting to height cropped most of the arena,
    // hiding the trance target. Fit the whole canvas in the viewport instead.
    const displayH=Math.min(ih,iw*540/this.W);this.displayScale=displayH/540;
    const ratio=Math.min(devicePixelRatio||1,1.5,810/displayH);this.S=ratio*this.displayScale;
    this.cv.width=Math.round(this.W*this.S);this.cv.height=Math.round(540*this.S);
    this.cv.style.height=displayH+'px';this.cv.style.width=(this.W*displayH/540)+'px';
    this.cv.style.top=((ih-displayH)/2)+'px';
    if(this.camera){
      const halfW=this.W/(2*this.camera.zoom),halfH=270/this.camera.zoom;
      this.camera.x=clamp(this.camera.x,halfW,this.W-halfW);
      this.camera.y=clamp(this.camera.y,halfH,540-halfH);
    }
    this.buildBG();
    for(const f of this.fighters){f.minX=70;f.maxX=this.W-70;}
  },
  buildBG(){
    this.bg=makeBG(this.W,540,this.gy,this.S);this.vig=makeVignette(this.W,540,this.S);
    const keep=this.dc&&this.dc.width>0?this.dc:null;
    const old=document.createElement('canvas');
    if(keep){old.width=this.dc.width;old.height=this.dc.height;old.getContext('2d').drawImage(this.dc,0,0);}
    const bodyScale=this.S/BODY_PIXEL, headScale=this.S/HEAD_PIXEL;
    const makeLayer=(scale)=>{
      const c=document.createElement('canvas');
      c.width=Math.ceil(this.W*scale);c.height=Math.ceil(540*scale);
      const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.setTransform(scale,0,0,scale,0,0);
      return {canvas:c,ctx:g,scale};
    };
    this.bodyLayer=makeLayer(bodyScale);
    this.headLayer=makeLayer(headScale);
    this.batLayer=makeLayer(bodyScale);
    this.frontLayer=makeLayer(bodyScale);
    this.fxLayer=makeLayer(bodyScale);
    this.markLayer=makeLayer(bodyScale);
    // Text needs full canvas resolution even though its surrounding cloud is pixel art.
    this.textLayer=makeLayer(this.S);
    this.dc.width=Math.ceil(this.W*bodyScale);this.dc.height=Math.ceil(540*bodyScale);
    this.dctx=this.dc.getContext('2d');this.dctx.imageSmoothingEnabled=false;
    if(keep){this.dctx.setTransform(1,0,0,1,0,0);this.dctx.drawImage(old,0,0,this.dc.width,this.dc.height);}
    this.dctx.setTransform(bodyScale,0,0,bodyScale,0,0);
    if(this.fx)this.fx.decal=this.dctx;
  },
  spawnFighter(x,dir,delay){
    const dead=this.fighters.filter(f=>f.hp<=0);
    if(dead.length>6){
      const idx=this.fighters.indexOf(dead[0]);
      if(idx>=0)this.fighters.splice(idx,1);
      if(this.droppedBats.length>6)this.droppedBats.shift();
    }
    const skin=pickSkin();
    const meta=SKIN_META[skin];
    const px=clamp(x!==undefined?x:rnd(130,this.W-130),80,this.W-80);
    const d=dir||(px<this.W/2?1:-1);
    const f=new Fighter({
      fx:this.fx,gy:this.gy,minX:70,maxX:this.W-70,spawnY:620,
      skin,col:{hex:meta.color},x:px,dir:d,
      name:`#${NEXT_ID} · ${meta.label}`
    });
    f.spawn(delay!==undefined?delay:.05);
    this.fighters.push(f);
    this.syncHudCards();
    return f;
  },
  spawnPair(){
    this.spawnFighter(this.W*.32,1,.08);
    this.spawnFighter(this.W*.68,-1,.32);
  },
  beginHypnosisCamera(f){
    const c=this.camera;if(!c)return;
    // One camera cannot frame simultaneous casts; keep following the first
    // uninterrupted caster rather than jumping between several Janes.
    if(!c.owner||c.owner.state!=='hypnosis'){
      c.owner=f;c.slowLeft=c.slowDuration;
    }
  },
  endHypnosisCamera(f){
    const c=this.camera;
    if(c&&c.owner===f){
      c.owner=this.fighters.find(other=>other!==f&&other.hp>0&&other.state==='hypnosis')||null;
      c.slowLeft=0;
    }
  },
  updateCamera(dt){
    const c=this.camera;if(!c)return;
    let active=c.owner&&c.owner.hp>0&&c.owner.state==='hypnosis'&&this.fighters.includes(c.owner);
    // A removed caster cannot keep the initial slowdown alive indefinitely.
    if(!active){c.owner=this.fighters.find(f=>f.hp>0&&f.state==='hypnosis')||null;c.slowLeft=0;active=!!c.owner;}
    const k=1-Math.exp(-dt*(active?4:3));
    c.zoom+=((active?1.2:1)-c.zoom)*k;
    const halfW=this.W/(2*c.zoom),halfH=this.H/(2*c.zoom);
    const target=active?c.owner.hypTarget:null;
    // Favor Jane while keeping the hypnotized opponent visible at long range.
    const offset=target?clamp((target.x-c.owner.x)*.14,-35,35):0;
    const tx=active?clamp(c.owner.x+offset,halfW,this.W-halfW):this.W/2;
    const ty=active?clamp(c.owner.gy-125,halfH,this.H-halfH):this.H/2;
    c.x+=(tx-c.x)*k;c.y+=(ty-c.y)*k;
    c.vignette+=((active?1:0)-c.vignette)*k;
  },
  screenToWorldX(x){
    const c=this.camera;return c?(x-this.W/2)/c.zoom+c.x:x;
  },
  dropGun(f,thrown){
    if(!f.hypGun)return;
    const R=f.rig,v=f.hypGunDir||{x:f.dir,y:0};
    this.droppedGuns.push({id:f.hypGun.id,x:R?R.wN.x:f.x,y:R?R.wN.y:f.gy-85,
      vx:f.dir*(thrown?rnd(80,180):rnd(-80,-30)),vy:thrown?-rnd(170,250):-rnd(60,120),
      ang:Math.atan2(v.y,v.x),va:(thrown?1:-1)*f.dir*rnd(5,11),flip:f.dir,settled:false});
    if(this.droppedGuns.length>16)this.droppedGuns.shift();
    f.hypGun=null;
  },
  fireHypBullet(f){
    if(!f.rig||!f.hypGun)return;
    const v=f.hypGunDir||{x:f.dir,y:0},muzzle={x:f.rig.wN.x+v.x*23,y:f.rig.wN.y+v.y*23};
    this.bullets.push({x:muzzle.x,y:muzzle.y,prevX:muzzle.x,prevY:muzzle.y,
      vx:v.x*BULLET_SPEED,vy:v.y*BULLET_SPEED,life:1,owner:f});
    this.fx.impact(muzzle.x,muzzle.y,f.dir,.35);
    this.fx.spark(muzzle.x,muzzle.y,5,'255,231,92');
    this.shake=Math.max(this.shake,3.5);Snd.shot();
  },
  updateBullets(dt){
    for(const p of this.bullets){
      const x0=p.x,y0=p.y,x1=x0+p.vx*dt,y1=y0+p.vy*dt;
      const steps=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)/4));
      p.prevX=x0;p.prevY=y0;
      for(let i=1;i<=steps;i++){
        const x=lerp(x0,x1,i/steps),y=lerp(y0,y1,i/steps);
        p.x=x;p.y=y;
        let hit=null;
        for(const f of this.fighters){
          if(f===p.owner||f.hp<=0||!f.rig||!f.visible||f.state==='spawn'||f.invT>0)continue;
          if((f.canBeHit()||f.state==='ragdoll')&&bodyHit(f,x,y)){hit=f;break;}
        }
        if(hit){
          hit.takeHit(p.owner,{dmg:BULLET_DAMAGE,zone:'head',pw:.72,stun:.4,kb:95,fragmentOnKo:true},{x,y});
          p.dead=true;
        }else if(x<34||x>this.W-34||y<8||y>this.gy+3){
          this.fx.spark(x,y,4,'255,220,80');p.dead=true;
        }
        if(p.dead){
          this.tracers.push({x0,y0,x1:x,y1:y,life:.11,max:.11});
          break;
        }
      }
      p.life-=dt;
    }
    this.bullets=this.bullets.filter(p=>!p.dead&&p.life>0);
    for(const t of this.tracers)t.life-=dt;
    this.tracers=this.tracers.filter(t=>t.life>0);
  },
  clearBodies(){
    for(const f of this.fighters){
      if(f.grabTarget&&f.grabTarget.hp<=0)f.cancelGrab(false);
    }
    this.fighters=this.fighters.filter(f=>f.hp>0);
    this.droppedBats=[];this.droppedGuns=[];
    this.syncHudCards();
  },
  clearBlood(){
    this.dctx.save();
    this.dctx.setTransform(1,0,0,1,0,0);
    this.dctx.clearRect(0,0,this.dc.width,this.dc.height);
    this.dctx.restore();
    for(const f of this.fighters)if(f.hp>0){f.wounds=newWounds();f.bloodStains=[];}
  },
  // Ray against the arena: stops at the first fighter body, the floor, a wall post or the ceiling.
  castRay(x,y,ux,uy,self){
    const W=this.W,gy=this.gy;
    const others=this.fighters.filter(g=>g!==self&&g.rig&&g.state!=='spawn'&&g.visible);
    let px=x,py=y;
    for(let t=4;t<3400;t+=4){
      px=x+ux*t;py=y+uy*t;
      for(const g of others)if(bodyHit(g,px,py))return{x:px,y:py,surf:'body',f:g};
      if(py>=gy+3)return{x:px,y:gy+3,surf:'floor',f:null};
      if(py<=8)return{x:px,y:8,surf:'wall',f:null};
      if(px<=34)return{x:34,y:py,surf:'wall',f:null};
      if(px>=W-34)return{x:W-34,y:py,surf:'wall',f:null};
    }
    return{x:px,y:py,surf:'none',f:null};
  },
  hitFX(att,vic,a,x,y){
    this.fx.impact(x,y,att.dir,a.pw);
    this.fx.blood(x,y,att.dir,Math.floor(5+a.pw*8),a.pw*.72);
    this.shake=Math.max(this.shake,1+a.pw*3+(a.bat?1.5:0));
    this.hs=.035+a.pw*.045;
    if(a.bat)Snd.bat(.7+a.pw*.5);else Snd.hit(.6+a.pw*.6);
    if(a.pw>.6)Snd.splat(a.pw);
  },
  ko(v,att,a){
    if(v.state==='hypnosis')v.cancelHypnosis();
    if(v.grabTarget)v.cancelGrab(false);
    if(v.grabbedBy)v.grabbedBy.cancelGrab(false);
    v.hp=0;v.tranceT=0;v.speechT=0;
    if(v.skin==='negan'&&!v.batLost){
      const R=v.rig;
      const bx=R&&R.bd?R.wN.x+R.bd.x*24:v.x+v.dir*26;
      const by=R&&R.bd?R.wN.y+R.bd.y*24:v.gy-v.y-96;
      const ang=R&&R.bd?Math.atan2(R.bd.y,R.bd.x):-.8*v.dir;
      v.batLost=true;
      this.droppedBats.push({
        x:bx,y:by,gy:v.gy,flip:v.dir,
        vx:att.dir*rnd(130,250)+(v.vx||0)*.35,
        vy:-rnd(190,310),
        ang,
        va:(att.dir||1)*rnd(7,13),
        settled:false,
        fade:0
      });
    }
    this.koCount++;
    if(a&&a.fragmentOnKo&&v.rig){
      // Keep the struck pose while pixel fragments fly, then let the same body
      // fall as a normal ragdoll instead of making the KO a cosmetic cutscene.
      this.fx.fragment(v.rig,v.skin,att.dir);
      this.fx.blood(v.rig.pel.x,v.rig.pel.y,att.dir,16,.75);
      v.rag=null;v.state='fragmenting';v.st=0;v.vx=0;v.vy=0;v.fragmentDir=att.dir;
    }else if(a&&a.keepRag&&v.state==='ragdoll'&&v.rag){
      v.rag.t=0;v.rag.settle=0;
      this.fx.blood(v.x,v.gy-22,att.dir,16,.75);
    }else{
      v.toRagdoll(att.dir*(a.lvx||320)*1.15,(a.lvy||520)+150);
      this.fx.blood(v.x,v.gy-v.y-125,att.dir,16,.72);
    }
    this.ts=.32;this.tsT=.95;
    Snd.ko();Snd.splat(1.2);
    this.shake=15;
    this.respawnTimer=2.4;
  },
  findBestOpponent(f){
    if(f.hypTarget&&f.state==='hypnosis'&&f.hypTarget.hp>0)return f.hypTarget;
    if(f.grabTarget&&f.grabTarget.hp>0)return f.grabTarget;
    let best=null,bestScore=1e9;
    for(const o of this.fighters){
      if(o===f||o.hp<=0)continue;
      const dist=Math.abs(o.x-f.x);
      const downPenalty=(o.state==='ragdoll'||o.state==='getup'||o.state==='spawn')?280:0;
      const busyPenalty=(o.grabbedBy&&o.grabbedBy!==f)?220:0;
      const sc=dist+downPenalty+busyPenalty;
      if(sc<bestScore){bestScore=sc;best=o;}
    }
    return best;
  },
  update(dt){
    const rdt=dt,koSlow=this.tsT>0;
    if(this.hs>0){this.hs-=rdt;dt*=.05;}
    if(this.tsT>0){this.tsT-=rdt;dt*=this.ts;if(this.tsT<=0)this.ts=1;}
    const camera=this.camera;
    if(camera&&camera.slowLeft>0){
      const elapsed=camera.slowDuration-camera.slowLeft;
      const strength=ease(clamp(Math.min(elapsed/.18,camera.slowLeft/.25),0,1));
      if(!koSlow)dt*=1-.38*strength;
      camera.slowLeft=Math.max(0,camera.slowLeft-rdt);
    }
    this.shake*=Math.exp(-rdt*9);
    const alive=this.fighters.filter(f=>f.hp>0);
    if(this.autoSpawn&&alive.length<2){
      this.respawnTimer-=rdt;
      if(this.respawnTimer<=0){
        this.respawnTimer=2.2;
        if(alive.length===0){
          this.spawnPair();
        }else{
          const survivor=alive[0];
          const spawnX=survivor.x<this.W*.5 ? rnd(this.W*.62,this.W*.82) : rnd(this.W*.18,this.W*.38);
          this.spawnFighter(spawnX, spawnX<survivor.x?1:-1, .1);
        }
      }
    }
    // Update a grabber before its held opponent regardless of spawn order, so
    // the ragdoll solves against the hand position from this frame, not the last.
    const updateOrder=[...this.fighters.filter(f=>!f.grabbedBy),...this.fighters.filter(f=>f.grabbedBy)];
    for(const f of updateOrder){
      const opp=f.hp>0?this.findBestOpponent(f):null;
      if(f.hp>0&&opp){
        f.autopilot.update(dt,f,opp,this.fighters);
      }else{
        const c=f.ctrl;c.mx=0;c.jump=false;c.punch=false;c.run=false;c.hop=false;c.laser=false;c.noFace=false;
      }
      f.update(dt,opp,this.fighters);
    }
    this.updateBullets(dt);
    for(const b of this.droppedGuns){
      if(b.settled)continue;
      b.vy+=1650*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.ang+=b.va*dt;
      if(b.x<42){b.x=42;b.vx=Math.abs(b.vx)*.4;}
      else if(b.x>this.W-42){b.x=this.W-42;b.vx=-Math.abs(b.vx)*.4;}
      if(b.y>this.gy-5){
        b.y=this.gy-5;
        if(b.vy>0){b.vy=-b.vy*.3;b.vx*=.65;b.va*=.65;}
        if(Math.abs(b.vy)<35&&Math.abs(b.vx)<18){b.vy=0;b.vx=0;b.va=0;b.ang=b.flip<0?Math.PI:0;b.settled=true;}
      }
    }
    for(const b of this.droppedBats){
      if(b.settled){b.fade=Math.min(.14,b.fade+dt*.018);continue;}
      b.vy+=1650*dt;
      b.x+=b.vx*dt;
      b.y+=b.vy*dt;
      b.ang+=b.va*dt;
      if(b.x<56){b.x=56;b.vx=Math.abs(b.vx)*.45;}
      else if(b.x>this.W-56){b.x=this.W-56;b.vx=-Math.abs(b.vx)*.45;}
      const uy=Math.sin(b.ang),floorY=this.gy+2;
      const yH=b.y-uy*30+4, yT=b.y+uy*36+6.5, pen=Math.max(yH-floorY,yT-floorY);
      if(pen>0){
        b.y-=pen;
        if(b.vy>0){
          if(b.vy>95)Snd.bat(clamp(b.vy/520,.18,.45));
          b.vy=-b.vy*.32;
          b.vx*=.72;
        }
        const restAng=Math.cos(b.ang)>=0?-.038:Math.PI+.038;
        const da=Math.atan2(Math.sin(restAng-b.ang),Math.cos(restAng-b.ang));
        b.va=b.va*.58+da*14;
        if(Math.abs(b.vy)<28&&Math.abs(b.vx)<18&&Math.abs(da)<.08&&Math.abs(b.va)<.6){
          b.vy=0;b.vx=0;b.va=0;b.ang=restAng;b.y=floorY-5.2;b.settled=true;
        }
      }
    }
    for(let i=0;i<alive.length;i++){
      const A=alive[i];
      if(A.hp<=0||A.y>=60||A.state==='ragdoll'||A.state==='spawn'||A.state==='run'||A.state==='grab_throw')continue;
      for(let j=i+1;j<alive.length;j++){
        const B=alive[j];
        if(B.hp<=0||B.y>=60||B.state==='ragdoll'||B.state==='spawn'||B.state==='run'||B.state==='grab_throw')continue;
        const dx=B.x-A.x,m=54;
        if(Math.abs(dx)<m){
          const s=dx>=0?1:-1,push=(m-Math.abs(dx))/2;
          const fixedA=A.state==='trance'||A.state==='hypnosis',fixedB=B.state==='trance'||B.state==='hypnosis';
          const ok1=!fixedA&&A.x-s*push>=A.minX&&A.x-s*push<=A.maxX;
          const ok2=!fixedB&&B.x+s*push>=B.minX&&B.x+s*push<=B.maxX;
          if(ok1&&ok2){A.x-=s*push;B.x+=s*push;}
          else if(ok1)A.x=clamp(A.x-s*push*2,A.minX,A.maxX);
          else if(ok2)B.x=clamp(B.x+s*push*2,B.minX,B.maxX);
        }
      }
    }
    this.fx.update(dt,this.fighters);
    this.updateCamera(rdt);
    this.updateHud();
  },
  syncHudCards(){
    const wrap=$('#rosterHud');
    if(!wrap)return;
    wrap.innerHTML='';
    const list=this.fighters.slice(-6);
    for(const f of list){
      const el=document.createElement('div');
      el.className='fcard'+(f.hp<=0?' dead':'');
      el.id='fc_'+f.id;
      el.innerHTML=`
        <div class="top"><span>${f.name}</span><span class="hpv">${Math.ceil(f.hp)} HP</span></div>
        <div class="bar">
          <div class="lag" style="width:${f.lagHp}%"></div>
          <div class="fill" style="width:${f.hp}%;background:${f.col.hex}"></div>
        </div>`;
      wrap.appendChild(el);
    }
  },
  updateHud(){
    const aliveCount=this.fighters.filter(f=>f.hp>0).length;
    const st=$('#statTxt');
    if(st)st.textContent=`В бою: ${aliveCount} · Нокаутов: ${this.koCount} · Бойцы сражаются самостоятельно`;
    for(const f of this.fighters){
      const el=document.getElementById('fc_'+f.id);
      if(!el)continue;
      el.classList.toggle('dead',f.hp<=0);
      const hpv=el.querySelector('.hpv');
      if(hpv)hpv.textContent=f.hp>0?Math.ceil(f.hp)+' HP':'K.O.';
      const fill=el.querySelector('.fill');
      if(fill)fill.style.width=f.hp+'%';
      const lag=el.querySelector('.lag');
      if(lag)lag.style.width=f.lagHp+'%';
    }
  },
  render(){
    const ctx=this.ctx,S=this.S,W=this.W,H=540;
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.clearRect(0,0,this.cv.width,this.cv.height);
    ctx.setTransform(S,0,0,S,0,0);
    ctx.imageSmoothingEnabled=false;
    ctx.save();
    const shakeX=this.shake>.3?rnd(-1,1)*this.shake:0,shakeY=this.shake>.3?rnd(-1,1)*this.shake:0;
    ctx.translate(shakeX,shakeY);
    const camera=this.camera;
    if(camera){
      ctx.translate(W/2,H/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);
    }
    ctx.drawImage(this.bg,0,0,W,H);
    ctx.drawImage(this.dc,0,0,W,H);
    // fading laser scorch marks on the floor / walls
    if(this.fx.marks.length){
      clearPixelLayer(this.markLayer);
      this.fx.drawMarks(this.markLayer.ctx);
      ctx.drawImage(this.markLayer.canvas,0,0,W,H);
    }
    // Dropped weapons are independent physics objects and are never re-equipped.
    if(this.droppedBats.length||this.droppedGuns.length){
      clearPixelLayer(this.batLayer);
      for(const b of this.droppedBats)drawDroppedBat(this.batLayer.ctx,b);
      for(const b of this.droppedGuns)drawDroppedGun(this.batLayer.ctx,b);
      ctx.drawImage(this.batLayer.canvas,0,0,W,H);
    }

    const ordered=[...this.fighters.filter(f=>f.hp<=0),...this.fighters.filter(f=>f.hp>0)];
    for(const f of ordered){
      if(!f.rig||(f.state==='spawn'&&f.sp===0))continue;
      f.visible=true;
      ctx.save();
      const tintLayer=(layer)=>{if(f.hp<=0&&f.rag&&f.rag.frozen&&f.corpseFade>.015){const q=layer.ctx;q.save();q.setTransform(1,0,0,1,0,0);q.globalCompositeOperation='source-atop';q.globalAlpha=Math.min(.18,f.corpseFade);q.fillStyle='#17151A';q.fillRect(0,0,layer.canvas.width,layer.canvas.height);q.restore();}};
      const paintLayer=(layer,paint,doTint=true)=>{
        clearPixelLayer(layer);
        const q=layer.ctx;
        q.save();
        q.globalAlpha=1;
        q.globalCompositeOperation='source-over';
        q.filter='none';
        q.shadowBlur=0;
        q.imageSmoothingEnabled=false;
        q.setTransform(layer.scale,0,0,layer.scale,0,0);
        try{paint(q);}catch(err){console.warn('Fighter layer draw recovered:',f.id,err);}
        q.restore();
        if(doTint)tintLayer(layer);
        ctx.globalAlpha=f.state==='fragmenting'?clamp(1-f.st/FRAGMENT_DUR,0,1):1;
        ctx.globalCompositeOperation='source-over';
        ctx.filter='none';
        ctx.drawImage(layer.canvas,0,0,W,H);
        ctx.globalAlpha=1;
      };
      paintLayer(this.batLayer,q=>drawFighterShadow(q,f),false);
      paintLayer(this.bodyLayer,q=>drawFighterBody(q,f));
      paintLayer(this.headLayer,q=>drawFighterHead(q,f));
      if(f.skin==='negan'&&!f.batLost&&f.hp>0&&f.rig.bd){
        paintLayer(this.batLayer,q=>drawBat(q,f));
      }
      if(f.hypGun)paintLayer(this.batLayer,q=>drawHeldGun(q,f));
      paintLayer(this.frontLayer,q=>drawFighterFrontArm(q,f));
      ctx.restore();
    }

    clearPixelLayer(this.fxLayer);
    for(const f of this.fighters){
      if(f.state==='attack'&&f.atk&&f.atk.laser){
        drawEyeGlow(this.fxLayer.ctx,f);
        if(f.lz&&f.lz.on)drawBeam(this.fxLayer.ctx,f.lz);
      }
      if(f.state==='grab_prep'&&f.visible){
        drawGrabCircle(this.fxLayer.ctx,f);
      }
      if(f.dizzyAlpha>.02){
        drawDizzyStars(this.fxLayer.ctx,f);
      }
    }
    this.fx.draw(this.fxLayer.ctx);
    for(const p of this.bullets)drawHypBullet(this.fxLayer.ctx,p);
    for(const t of this.tracers)drawHypBullet(this.fxLayer.ctx,t,clamp(t.life/t.max,0,1));
    ctx.drawImage(this.fxLayer.canvas,0,0,W,H);

    ctx.save();ctx.globalCompositeOperation='lighter';
    for(const lx of [W*.2,W*.5,W*.8]){
      const fl=.85+Math.sin(performance.now()/90+lx)*.05+Math.random()*.04;
      const g=ctx.createRadialGradient(lx,54,4,lx,54,380);
      g.addColorStop(0,`rgba(255,215,150,${.3*fl})`);
      g.addColorStop(1,'rgba(255,215,150,0)');
      ctx.fillStyle=g;ctx.fillRect(lx-380,0,760,H);
    }
    ctx.restore();
    ctx.restore(); // camera transform: the vignettes stay fixed to the screen
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(this.vig,0,0,W,H);
    if(camera&&camera.vignette>.005){
      const g=ctx.createRadialGradient(W/2,H/2,H*.22,W/2,H/2,Math.max(W*.62,H*.72));
      g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${.35*camera.vignette})`);
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    }
    // Text remains bright and readable above the cinematic vignette while using
    // the same camera and shake as the character it follows.
    if(this.fighters.some(f=>f.hp>0&&f.tranceT>0&&f.rig)){
      clearPixelLayer(this.textLayer);
      for(const f of this.fighters)drawTranceText(this.textLayer.ctx,f,W,camera,this.displayScale);
      ctx.save();ctx.translate(shakeX,shakeY);ctx.imageSmoothingEnabled=false;
      if(camera){ctx.translate(W/2,H/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);}
      ctx.drawImage(this.textLayer.canvas,0,0,W,H);ctx.restore();
    }
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.setTransform(S,0,0,S,0,0);
  }
};
/* ============================ ENTRY POINT ============================ */
export function startGame(){
  Game.init();
  const cv=Game.cv;
  const onDown=e=>{
    Snd.init();
    const rect=cv.getBoundingClientRect();
    const screenX=(e.clientX-rect.left)/rect.width*Game.W;
    const worldX=clamp(Game.screenToWorldX(screenX),80,Game.W-80);
    const alive=Game.fighters.filter(f=>f.hp>0);
    let dir=worldX<Game.W/2?1:-1;
    if(alive.length){
      let nearest=alive[0],bestD=1e9;
      for(const a of alive){const d=Math.abs(a.x-worldX);if(d<bestD){bestD=d;nearest=a;}}
      dir=nearest.x>=worldX?1:-1;
    }
    Game.spawnFighter(worldX,dir,0);
  };
  const onResize=()=>Game.resize();
  const onCtx=e=>e.preventDefault();
  cv.addEventListener('pointerdown',onDown);
  addEventListener('resize',onResize);
  document.addEventListener('contextmenu',onCtx);
  let raf=0,last=performance.now(),running=true;
  const frame=ts=>{
    if(!running)return;
    raf=requestAnimationFrame(frame);
    const dt=Math.min(.033,(ts-last)/1000);last=ts;if(!(dt>0))return;
    Game.update(dt);
    Game.render();
  };
  raf=requestAnimationFrame(frame);
  return {
    spawnOne(){Snd.init();Snd.ui();Game.spawnFighter(rnd(120,Game.W-120),undefined,0);},
    spawnPair(){Snd.init();Snd.ui();Game.spawnPair();},
    setAutoSpawn(v){Snd.init();Snd.ui();Game.autoSpawn=v;},
    clearBodies(){Snd.init();Snd.ui();Game.clearBodies();},
    clearBlood(){Snd.init();Snd.ui();Game.clearBlood();},
    setSound(on){Snd.init();Snd.on=on;if(on)Snd.ui();},
    destroy(){
      running=false;cancelAnimationFrame(raf);
      cv.removeEventListener('pointerdown',onDown);
      removeEventListener('resize',onResize);
      document.removeEventListener('contextmenu',onCtx);
    }
  };
}
