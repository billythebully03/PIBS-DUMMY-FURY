// @ts-nocheck
import { Audience } from './audience';
import { BloodField } from './blood';
import { drawDuck, launchDuck, updateDucks, DUCK_RELEASE, DUCK_THROW_DURATION } from './duck';
import { laserCutGeometry, splitArticulated, updateArticulated } from './severed';

/* ============================ UTILS ============================ */
const TAU=Math.PI*2, rad=d=>d*Math.PI/180;
const BODY_PIXEL=3, HEAD_PIXEL=1.5;
const clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t;
const rnd=(a,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
const ease=t=>t*t*(3-2*t);
const DIRX=[1,-1,0,0], DIRY=[0,0,1,-1];
const TIE_N=6, TIE_SEG=9;
const CAPE_N=7, CAPE_SEG=19;
const HL_HOVER=19;
// The original 540-unit floor view remains at y=0..540. The expanded world
// extends upward, so existing combat/floor coordinates do not move.
const WORLD_TOP=-1080, BRIDGE_Y=-610, VIEW_H=540;
const RUN_SPD=520, RUN_ACC=1250;
const BOX_GAP=.1, OVEREXTEND_DUR=1.12, FLANK_DUR=.34;
const CHOKE_OFFSET=48, CHOKE_DPS=2.2, COUNTER_RELEASE=.43, COUNTER_DUR=.86;
const SHOVE_DUR=.58, SHOVE_IMPACT=.25, SHOVE_REACH=105;
const BLEED_DPS=2, BLEED_AFTER_DEATH=3;
const STAGGER_KNOCKDOWN_CHANCE=.4, STAGGER_KO_CHANCE=.4;
const LAMP_PULL_DUR=.7;
// Short ambient lines are deliberately separate from combat AI and have a
// long cooldown so a quiet sandbox feels alive without becoming a chat log.
const CHESTER_HUMS=['In the end...','I tried so hard','I\'ve become so numb'];
const CASUAL_LINES={
  walt:['A quiet moment.','Time to think.','Nice and easy.','Looks peaceful.'],
  homelander:['Lovely day.','All under control.','Looking good.','Nice and quiet.'],
  saul:['No worries.','Better call Saul.','What a day.','Taking a break.'],
  tubtrooper:['All clear.','Nice and easy.','Where is my duck?','Just chilling.'],
  negan:['Well, well.','Not a bad day.','Taking it easy.','Nice and quiet.'],
  jane:['Interesting.','Lovely day.','Just observing.','Take it easy.'],
  chester:['Just humming.',...CHESTER_HUMS],
};
const DOWN_LINES=['Ouch!','Damn!','Ow!','Ugh!'];
const CHECK_LINES=['You okay?','Need a hand?','Take it easy.','That looked rough.'];
// PibsPhy6/WeightPhysic: вес/рост/хп и множители. Тяжелее = медленнее и
// сложнее сбить с ног; легче = быстрее и проще сбить. Масса в регдолле.
const WSTATS={
  jane:{weight:75,height:180,hp:100,speedMul:1.02,knockResist:.35,ragMass:1},
  negan:{weight:90,height:185,hp:110,speedMul:.95,knockResist:.55,ragMass:1.2},
  homelander:{weight:105,height:190,hp:120,speedMul:.92,knockResist:.75,ragMass:1.4},
  walt:{weight:80,height:178,hp:95,speedMul:1,knockResist:.42,ragMass:1.07},
  saul:{weight:70,height:175,hp:90,speedMul:1.06,knockResist:.28,ragMass:.93},
  chester:{weight:74,height:178,hp:100,speedMul:1.04,knockResist:.34,ragMass:.98},
  tubtrooper:{weight:84,height:181,hp:100,speedMul:.98,knockResist:.43,ragMass:1.1}
};
const wstat=skin=>WSTATS[skin]||WSTATS.jane;
const knockScaleFor=skin=>1-wstat(skin).knockResist*.55;
const knockThresholdFor=skin=>.25+wstat(skin).knockResist*.55;
const ragMassFor=skin=>wstat(skin).ragMass;
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
duck(){ this.tone(660,930,.075,.09,'sine'); this.tone(950,550,.1,.07,'sine',.035); },
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
function armIK(J,s,t,preferUp=false){
  const sh=J.sh; let dx=t.x-sh.x,dy=t.y-sh.y,L=Math.hypot(dx,dy)||1e-3;
  const maxL=(UA+FA)*.998,minL=Math.abs(UA-FA)+3;
  if(L>maxL){dx*=maxL/L;dy*=maxL/L;L=maxL;} if(L<minL){dx*=minL/L;dy*=minL/L;L=minL;}
  const cosA=(UA*UA+L*L-FA*FA)/(2*UA*L),A=Math.acos(clamp(cosA,-1,1)),base=Math.atan2(dy,dx);
  let best=null,bs=-1e9;
  for(const sg of [1,-1]){const ang=base+sg*A,ex=sh.x+Math.cos(ang)*UA,ey=sh.y+Math.sin(ang)*UA,sc=preferUp?-ey:ey-ex*.35;if(sc>bs){bs=sc;best={x:ex,y:ey}}}
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
function aimArmWorld(R,s,x,y,preferUp=false){
  const d=R.dir,J={sh:{x:0,y:0}};
  armIK(J,s,{x:(x-R.sh.x)*d,y:y-R.sh.y},preferUp);
  R['e'+s]={x:R.sh.x+J['e'+s].x*d,y:R.sh.y+J['e'+s].y};
  R['w'+s]={x:R.sh.x+J['w'+s].x*d,y:R.sh.y+J['w'+s].y};
}
function guardWobblePose(p,f){
  const k=clamp(f.guardFlinch/.2,0,1),phase=f.guardShakePhase+f.t*42;
  if(!k)return p;
  // The upper body rocks around the planted hips with the same decaying
  // impulse as the hands, without moving the feet or altering the guard pose.
  const wobble=Math.sin(phase)*f.guardShakeX*k;
  return Object.assign({},p,{tl:p.tl+wobble*.55,hd:p.hd+wobble*.35});
}
function poseGuardArms(R,f){
  const k=clamp(f.guardFlinch/.2,0,1),phase=f.guardShakePhase+f.t*42;
  // Each impact has its own small, decaying wobble in both extended arms.
  const sx=Math.sin(phase)*f.guardShakeX*k,sy=Math.cos(phase*1.13)*f.guardShakeY*k;
  aimArmWorld(R,'N',R.head.x+R.dir*(50-4*k+sx),R.head.y+10+3*k+sy);
  aimArmWorld(R,'F',R.head.x+R.dir*(46-3*k-sx*.7),R.head.y+1+2*k-sy*.8);
  R.cN=R.cF=0;R.bd=null;
}
function poseLampArms(R,f){
  const lamp=f.lampRef||f.lampGoal;if(!lamp||lamp.detached)return;
  const p=f.lampRef?lamp.point(30+(f.lampClimb||0)):lamp.grip();
  // Hands wrap around the rope above the shade, with the head to one side.
  aimArmWorld(R,'N',p.x-R.dir*3,p.y);
  aimArmWorld(R,'F',p.x+R.dir*3,p.y+3);
  R.cN=R.cF=0;R.bd=null;
}
function poseLampPullArms(R,v){
  if(!v||!v.rig)return;
  const p=v.rig.kN;
  aimArmWorld(R,'N',p.x-R.dir*3,p.y-4);
  aimArmWorld(R,'F',p.x+R.dir*5,p.y+4);
  R.cN=R.cF=0;R.bd=null;
}
function poseNeckHold(R,v){
  if(!v||!v.rig)return;
  const n=v.rig.neck,d=R.dir;
  aimArmWorld(R,'N',n.x+d*7,n.y+3);
  aimArmWorld(R,'F',n.x-d*4,n.y-3);
  R.cN=R.cF=0;R.bd=null;
}
function poseStruggleArms(R,t,prone=false){
  const n=R.neck,d=R.dir;
  aimArmWorld(R,'N',n.x+d*(12+Math.sin(t*15)*4),n.y-4+Math.sin(t*12)*4,prone);
  aimArmWorld(R,'F',n.x-d*(6+Math.sin(t*13+1)*3),n.y-7+Math.cos(t*11)*4,prone);
  R.cN=R.cF=0;R.bd=null;
}
function cloneRig(R){
  const out={dir:R.dir,cN:R.cN,cF:R.cF,mo:R.mo,ey:R.ey,bd:R.bd?{...R.bd}:null};
  for(const k of JN)out[k]={x:R[k].x,y:R[k].y};
  out.fdN={...R.fdN};out.fdF={...R.fdF};
  return out;
}
function counterCarryRig(base,thrower,progress){
  const u=ease(clamp(progress,0,1)),d=thrower.dir,ang=d*2.35*u,ca=Math.cos(ang),sa=Math.sin(ang);
  const px=lerp(base.pel.x,thrower.x+d*68,u);
  // Keep the carried body close enough to the bent shoulders for a real grip,
  // then release it into independent physics at the top of the throw.
  const py=base.pel.y-25*u-45*Math.sin(Math.PI*u);
  const R={dir:base.dir,cN:base.cN,cF:base.cF,mo:.8,ey:base.ey,bd:null};
  for(const k of JN){
    const x=base[k].x-base.pel.x,y=base[k].y-base.pel.y;
    R[k]={x:px+x*ca-y*sa,y:py+x*sa+y*ca};
  }
  for(const k of ['fdN','fdF'])R[k]={x:base[k].x*ca-base[k].y*sa,y:base[k].x*sa+base[k].y*ca};
  return R;
}
function poseCounterGrip(R,thrower){
  if(!thrower.counterBase||thrower.counterReleased)return;
  const held=counterCarryRig(thrower.counterBase,thrower,thrower.st/COUNTER_RELEASE),p=held.pel,d=R.dir;
  aimArmWorld(R,'N',p.x+d*5,p.y-4);
  aimArmWorld(R,'F',p.x-d*5,p.y+4);
  R.cN=R.cF=1;R.bd=null;
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
const LAMP_REACH=P({H:88,tl:2,hd:-8,a1:170,e1:0,c1:0,a2:160,e2:8,c2:0,f1x:15,f1h:20,f2x:-14,f2h:12,mo:.35,bg:0});
const LAMP_HANG=P({H:87,tl:-6,hd:-10,a1:170,e1:0,c1:0,a2:24,e2:35,c2:0,f1x:15,f1h:14,fa1:25,f2x:-8,f2h:4,fa2:30,mo:.4,bg:0});
const LAMP_PULL=P({H:66,tl:-18,hd:-8,px:-6,a1:95,e1:35,c1:0,a2:85,e2:35,c2:0,f1x:29,f2x:-28,mo:.5,bg:0});
// Grounded combat poses. The held fighter stays lower with bent legs; arm IK
// below keeps the grip and struggling hands attached to the animated neck.
const OVEREXTEND_POSE=P({H:70,tl:58,hd:22,px:12,a1:72,e1:20,a2:64,e2:30,f1x:42,f2x:-24,mo:.65,bg:0});
const GUARD_POSE=P({H:77,tl:-5,hd:-4,px:-3,f1x:26,f2x:-22,mo:.1,bg:0});
const GUARD_RECOIL=P({H:74,tl:-25,hd:-16,px:-8,a1:145,e1:42,c1:0,a2:128,e2:46,c2:0,f1x:32,f1h:7,f2x:-16,f2h:3,mo:.4,bg:0});
// Both arms first draw back with bent elbows, then extend together in one quick shove.
const SHOVE_KF=KF([
  [0,{bg:0}],
  [.12,{H:77,tl:-12,hd:-5,px:-7,a1:-80,e1:105,c1:0,a2:-72,e2:110,c2:0,f1x:17,f2x:-28,bg:0}],
  [.25,{H:76,tl:18,hd:8,px:7,a1:90,e1:-3,c1:0,a2:88,e2:4,c2:0,f1x:36,f2x:-26,bg:0}],
  [.34,{H:77,tl:16,hd:7,px:6,a1:90,e1:-3,c1:0,a2:88,e2:4,c2:0,f1x:36,f2x:-26,bg:0}],
  [SHOVE_DUR,{bg:0}]
]);
const FLANK_POSE=P({H:76,tl:22,hd:9,px:4,a1:55,e1:40,c1:0,a2:45,e2:55,c2:0,f1x:36,f1h:8,f2x:-26,mo:.2,bg:0});
const CHOKE_HOLD_POSE=P({H:84,tl:6,hd:2,a1:70,e1:55,c1:0,a2:64,e2:65,c2:0,f1x:24,f2x:-20,mo:.3,bg:0});
const CHOKED_POSE=P({H:60,tl:-5,hd:-8,px:-2,a1:130,e1:45,c1:0,a2:120,e2:45,c2:0,f1x:27,f2x:-18,mo:.8,ey:.3,bg:0});
// Near arm points slightly upward at the target; the far hand draws the duck
// behind the body, holds the aim, then swings forward to release it.
const DUCK_AIM_KF=KF([
  [0,{bg:0}],
  [.18,{H:80,tl:-10,hd:-2,px:-5,a1:105,e1:4,c1:0,a2:-58,e2:22,c2:0,f1x:24,f2x:-27,bg:0}],
  [.54,{H:80,tl:-9,hd:-2,px:-5,a1:110,e1:0,c1:0,a2:-95,e2:30,c2:0,f1x:25,f2x:-27,bg:0}],
  [.78,{H:78,tl:-18,hd:-4,px:-9,a1:110,e1:0,c1:0,a2:-138,e2:20,c2:0,f1x:25,f2x:-31,bg:0}],
  [.96,{H:78,tl:18,hd:8,px:7,a1:92,e1:6,c1:0,a2:108,e2:0,c2:0,f1x:34,f2x:-25,bg:0}],
  [1.12,{H:78,tl:20,hd:9,px:8,a1:56,e1:40,c1:0,a2:100,e2:6,c2:0,f1x:34,f2x:-24,bg:0}],
  [DUCK_THROW_DURATION,{bg:0}]
]);
const COUNTER_KF=KF([
  [0,CHOKED_POSE],
  [.12,{H:58,tl:12,hd:8,px:4,a1:94,e1:25,c1:0,a2:87,e2:28,c2:0,f1x:30,f2x:-23,mo:.8,bg:0}],
  [.33,{H:58,tl:72,hd:34,px:14,a1:90,e1:8,c1:0,a2:82,e2:12,c2:0,f1x:38,f2x:-24,mo:.8,bg:0}],
  [.43,{H:60,tl:82,hd:44,px:16,a1:105,e1:12,c1:0,a2:95,e2:16,c2:0,f1x:40,f2x:-22,mo:.8,bg:0}],
  [.64,{H:72,tl:36,hd:16,px:7,a1:58,e1:60,c1:0,a2:46,e2:72,c2:0,f1x:30,f2x:-22,mo:.4,bg:0}],
  [.86,{}]
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
// A lethal Lucille strike winds behind the back, rises over the head and
// then drives down through the target rather than reusing a short jab.
const BAT_FINISH={
  n:'overhead-finisher',finisher:true,dur:1.02,hs:.58,he:.72,cancel:9,
  reach:116,dmg:12,zone:'head',pw:1.2,launch:true,lvx:250,lvy:520,bat:true,lt:.43,lunge:125,y:[80,220],
  kf:KF([[0,{}],[.2,{H:75,tl:-25,hd:-8,px:-9,gx:-2,gy:4,bt:225,f1x:16,f2x:-30}],
    [.42,{H:82,tl:-20,hd:-12,px:-8,gx:15,gy:-42,bt:195,f1x:18,f2x:-29}],
    [.59,{H:72,tl:34,hd:15,px:12,gx:58,gy:10,bt:70,f1x:40,f2x:-20}],
    [.72,{H:70,tl:38,hd:18,px:13,gx:57,gy:26,bt:50,f1x:40,f2x:-20}],[1.02,{}]])
};
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
const ATK_GUITAR=ATK_BAT.map(a=>Object.assign({},a,{guitar:true}));
const atkSetFor=skin=>skin==='negan'?ATK_BAT:skin==='chester'?ATK_GUITAR:skin==='homelander'?ATK_HL:ATK;
/* ---- Dive kick (running leap) and back-hop poses ---- */
const KICK_POSE=P({H:66,tl:-52,hd:-16,px:-8,a1:-50,e1:25,a2:-35,e2:30,f1x:82,f1h:56,f2x:56,f2h:32,mo:.7});
/* ============================ PIXEL-ART CHARACTER SKINS ============================ */
const SKINS = ['jane', 'negan', 'homelander', 'walt', 'saul', 'chester', 'tubtrooper'];
const SKIN_META = {
  jane:       { label: 'ПАТРИК ДЖЕЙН', color: '#68717E' },
  negan:      { label: 'НИГАН', color: '#A7252D' },
  homelander: { label: 'ХОУМЛЕНДЕР', color: '#31527D' },
  walt:       { label: 'УОЛТЕР', color: '#718D55' },
  saul:       { label: 'СОЛ', color: '#D94B8D' },
  chester:    { label: 'ЧЕСТЕР', color: '#BD2536' },
  tubtrooper: { label: 'ТАБТРУПЕР', color: '#E95338' }
};
let skinCursor = 0;
function pickSkin() {
  const skin = SKINS[skinCursor % SKINS.length];
  skinCursor++;
  return skin;
}
// User-supplied transparent portraits take priority. The existing characters
// keep their former remote portraits as a fallback; Chester uses a drawn
// placeholder if his local file is unavailable.
const HEAD_URL = {
  jane:'/faces/patrick.png', negan:'/faces/negan.png', chester:'/faces/chester.png',
  homelander:'/faces/homelander.png', saul:'/faces/saul.png', walt:'/faces/walt.png',
  tubtrooper:'/faces/stormtrooper.png'
};
const HEAD_FALLBACK = {
  jane:'https://i.ibb.co/NnNTL5KG/IMG-4282.png',
  negan:'https://i.ibb.co/ZRGCwwQT/IMG-4289.png',
  homelander:'https://i.ibb.co/bjQK83QV/IMG-4290.png',
  walt:'https://i.ibb.co/KxpN1fp4/IMG-4298.png',
  saul:'https://i.ibb.co/nHFz7pG/IMG-4297.png',
  tubtrooper:'/faces/trooper.png'
};
// The requested stormtrooper.png currently contains a whole opaque drawing,
// not a cut-out head. Prefer it as soon as it is replaced with a transparent
// portrait; until then the neighbouring transparent trooper.png is the helmet.
function portraitHasTransparency(image){
  try{
    const c=document.createElement('canvas');c.width=c.height=24;
    const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0,24,24);
    const pixels=g.getImageData(0,0,24,24).data;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i]<32)return true;
    return false;
  }catch{return true;}
}
const skinHeads = Object.create(null);
SKINS.forEach(key => {
  const portrait = new Image();
  portrait.decoding = 'async';
  portrait.referrerPolicy = 'no-referrer';
  let triedFallback = false;
  portrait.onload = () => {
    if(key==='tubtrooper'&&!triedFallback&&!portraitHasTransparency(portrait)){
      triedFallback=true;portrait.src=HEAD_FALLBACK[key];return;
    }
    skinHeads[key] = { img: portrait, aspect: portrait.naturalWidth / Math.max(1, portrait.naturalHeight), loaded: true };
  };
  portrait.onerror = () => {
    if (!triedFallback && HEAD_FALLBACK[key]) {
      triedFallback = true; portrait.src = HEAD_FALLBACK[key]; return;
    }
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
  })(),
  // Black tank top, bare tattooed arms and charcoal trousers, as in the
  // supplied clothing reference. Tattoos are baked into both animated arms.
  chester: (() => {
    const O='#100e11', K='#191a1d', Kh='#343438', KD='#24252a', T='#3b3d42', Th='#56575a';
    const skin='#d6a17e', light='#e6b18e', shadow='#b98265', ink='#345a54', ink2='#7b4c4b';
    const tattoos=[[2,2,1,3,ink],[4,3,1,2,ink2],[3,5,2,1,ink],[2,7,1,2,ink2],
      [4,8,2,1,ink],[3,10,1,2,ink],[5,11,1,2,ink2],[2,12,1,1,ink]];
    return {
      neck:[[0,0,6,7,O],[1,0,4,5,skin],[2,0,2,4,light],[1,5,4,2,K]],
      chest:[...box(0,0,13,16,O),[1,1,11,14,K],[1,1,3,3,skin],[9,1,3,3,shadow],
        [4,1,5,2,skin],[4,2,5,1,shadow],[2,5,1,9,Kh],[10,4,1,10,'#101114']],
      abdomen:[...box(0,0,12,13,O),[1,1,10,11,K],[2,2,1,8,Kh],[9,1,2,11,KD],
        [3,7,5,1,'#29292c']],
      pelvis:[...box(0,0,12,11,O),[1,1,10,9,T],[1,1,10,2,KD],[2,1,2,1,Th],[8,3,3,7,KD]],
      uArm:b=>[...limb(O,8,15,b?shadow:skin,b?skin:light,shadow),...tattoos],
      lArm:b=>[...sleeve(O),[2,1,5,10,b?shadow:skin],[3,1,1,9,light],
        [2,2,1,3,ink],[4,3,2,1,ink2],[3,5,2,1,ink],[2,7,1,2,ink2],[4,8,1,2,ink],
        ...hand(b?shadow:skin,light,shadow,O)],
      thigh:b=>[...limb(O,9,17,b?KD:T,Th,KD),[5,3,1,10,Kh]],
      shin:b=>[...limb(O,8,17,b?KD:T,Th,KD),[4,3,1,10,Kh]],
      boot:b=>shoe(O,b?'#121316':'#202124','#45464a',KD,b)
    };
  })(),
  // Bare torso, red swimming trunks, drawstring and bare feet: the playful
  // bath-time stormtrooper rather than his usual armour.
  tubtrooper: (() => {
    const O='#4d2d25',skin='#d99f76',lit='#efbb91',shade='#b47b58',red='#d12e21',redHi='#ed4b32',redDark='#8e1b18',white='#f1e4cd';
    return {
      neck:[[0,0,6,7,O],[1,0,4,6,skin],[2,1,3,4,lit]],
      chest:[...box(0,0,13,16,O),[1,1,11,14,skin],[1,1,3,12,lit],[10,1,2,13,shade],
        [3,3,3,1,shade],[7,3,3,1,shade],[4,4,5,1,lit],[3,7,7,1,shade],[6,8,1,6,shade]],
      abdomen:[...box(0,0,12,13,O),[1,1,10,11,skin],[2,1,1,10,lit],[9,1,2,10,shade],
        [5,1,1,8,shade],[3,3,2,1,shade],[7,3,2,1,shade],[3,6,2,1,shade],[7,6,2,1,shade],
        [3,9,2,1,shade],[7,9,2,1,shade]],
      pelvis:[...box(0,0,12,11,O),[1,1,10,9,red],[1,1,10,2,redDark],[1,1,9,1,redHi],
        [4,2,4,1,white],[5,3,1,4,white],[7,3,1,4,white],[9,4,2,3,redDark]],
      uArm:b=>limb(O,8,15,b?shade:skin,b?skin:lit,shade,2),
      lArm:b=>[...sleeve(O),[2,1,5,10,b?shade:skin],[3,1,1,9,lit],[6,2,1,8,shade],...hand(b?shade:skin,lit,shade,O)],
      thigh:b=>[...limb(O,9,17,b?shade:skin,b?skin:lit,shade),[1,1,7,5,b?redDark:red],
        [2,1,2,3,redHi],[1,5,7,1,redDark],[6,2,1,2,white]],
      shin:b=>limb(O,8,17,b?shade:skin,b?skin:lit,shade),
      boot:b=>shoe(O,b?shade:skin,lit,skin,b)
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
// Composite blood into each original limb sprite, not into world space. The
// alpha mask and the usual limb transform keep stains on the moving skin.
const STAINED_SKIN_CACHE=new WeakMap();
function stainedSkinSprite(sprite,part,level){
  if(!sprite||!level)return sprite;
  const amount=clamp(Math.ceil(level),1,3),cacheKey=part+amount;
  let cache=STAINED_SKIN_CACHE.get(sprite);
  if(!cache){cache=new Map();STAINED_SKIN_CACHE.set(sprite,cache);}
  if(cache.has(cacheKey))return cache.get(cacheKey);
  const c=mk();c.width=sprite.width;c.height=sprite.height;
  const g=c.getContext('2d');g.drawImage(sprite,0,0);
  g.globalCompositeOperation='source-atop';g.globalAlpha=.84;g.fillStyle='#8c1724';
  if(part==='boot'){
    g.fillRect(2,3,3,2);g.fillRect(6,4,3,2);g.fillRect(10,3,2,2);
    if(amount>1){g.fillRect(1,5,4,2);g.fillRect(8,2,3,3);}
    if(amount>2)g.fillRect(4,4,6,3);
    g.globalAlpha=.7;g.fillStyle='#b32a35';g.fillRect(3,3,2,1);
  }else if(part==='shin'){
    g.fillRect(2,13,2,3);g.fillRect(5,12,1,3);g.fillRect(4,15,2,1);
    if(amount>1){g.fillRect(1,14,2,2);g.fillRect(4,11,2,2);}
    if(amount>2)g.fillRect(2,12,4,4);
    g.globalAlpha=.65;g.fillStyle='#b32a35';g.fillRect(2,13,1,1);
  }else{
    // A small irregular patch on both sides of the joint, so it remains
    // continuous as the knee or elbow bends. Feet use their separate stains.
    const bottom=part==='knee-thigh'||part==='elbow-upper';
    const y=bottom?sprite.height-4:1;
    g.fillRect(2,y,3,2);g.fillRect(4,y+2,2,1);g.fillRect(1,y+1,1,2);
    if(amount>1){g.fillRect(1,y,2,2);g.fillRect(5,y+1,1,2);}
    if(amount>2)g.fillRect(2,y+2,3,1);
    g.globalAlpha=.65;g.fillStyle='#b32a35';g.fillRect(3,y,2,1);
  }
  cache.set(cacheKey,c);return c;
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
// Red Strat-style guitar: the fretted neck and headstock remain at the hands,
// while the body flexes around a constrained joint and accumulates cracks.
function drawGuitarShape(g,damage=0,flex=0){
  const px=(x,y,w,h,c)=>{g.fillStyle=c;g.fillRect(x,y,w,h);};
  g.save();g.scale(3,3);
  px(0,-2,4,4,'#8d633e');px(0,-3,3,1,'#d1ad77');px(0,2,3,1,'#c19a6a');
  for(let x=0;x<4;x+=2){px(x,-3,1,1,'#dad6c7');px(x,2,1,1,'#dad6c7');}
  px(3,-2,18,4,'#18171b');px(3,-2,18,1,'#504747');
  for(let x=5;x<21;x+=2)px(x,-2,1,4,'#a4a2a0');
  g.translate(20,0);g.rotate(clamp(flex+damage*.1,-.22,.26));
  // The two horns, contoured red body, white pickguard and dark pickups.
  px(0,-2,5,4,'#560611');
  // Stepped, asymmetrical horns leave a narrow waist beside the neck.
  px(1,-7,4,3,'#730713');px(2,-8,3,2,'#bd1325');px(3,-6,2,2,'#e13a40');
  px(2,4,4,3,'#730713');px(3,5,3,3,'#a50c1c');
  px(5,-5,11,10,'#6a0712');px(5,-6,9,12,'#a80c1f');
  px(7,-7,6,14,'#c71b2d');px(13,-5,3,10,'#ad1021');px(15,-3,2,6,'#780818');
  // The white guard has the curved/stepped shape of the reference rather
  // than a square label, with three dark single-coil pickups.
  px(5,-2,3,4,'#d3d0ca');px(7,-4,4,8,'#e3e1dc');
  px(9,-3,4,7,'#f0eee9');px(12,-1,2,3,'#e3e1dc');
  px(7,-2,1,4,'#4b4c4c');px(9,-2,1,4,'#4b4c4c');px(11,-2,1,4,'#4b4c4c');
  px(13,3,2,1,'#c3c5c4');px(14,2,1,1,'#f5eee5');
  if(damage>.24){px(1,-1,1,2,'#38020a');px(2,0,2,1,'#ef7370');}
  if(damage>.58){
    px(1,-4,1,2,'#190c0c');px(2,-2,1,2,'#190c0c');px(1,0,1,2,'#190c0c');
    px(2,2,1,2,'#190c0c');px(3,1,1,1,'#ffd8bb');
  }
  g.restore();
}
function drawBat(g,f){
  const R=f.rig; if(!R||!R.bd||f.batLost||f.hp<=0)return;
  const w=R.wN,v=R.bd;
  g.save();g.imageSmoothingEnabled=false;
  g.translate(w.x-v.x*16,w.y-v.y*16);g.rotate(Math.atan2(v.y,v.x));
  if(v.x<0)g.scale(1,-1);
  if(f.skin==='chester')drawGuitarShape(g,f.guitarDamage,f.guitarFlex);
  else g.drawImage(BAT_SPR,0,-13.5,78,27);
  g.restore();
}
function stowsBat(f){
  const relaxed=f.peaceful&&!f.dive&&['spawn','idle','run','hop','air'].includes(f.state);
  return relaxed||f.boxing||(f.bleed&&f.bleed.pressing)||['guard','guard_recoil','shove','flank','choke','choked','counter_throw','counter_carried','lamp_jump','lamp_hang','lamp_pull'].includes(f.state);
}
function drawStowedBat(g,f){
  const R=f.rig;if(!R||f.batLost||f.hp<=0)return;
  const dx=R.pel.x-R.sh.x,dy=R.pel.y-R.sh.y;
  g.save();g.imageSmoothingEnabled=false;
  g.translate(R.sh.x-R.dir*13,R.sh.y-8);g.rotate(Math.atan2(dy,dx));
  if(R.dir<0)g.scale(1,-1);
  if(f.skin==='chester'){g.translate(-4,0);drawGuitarShape(g,f.guitarDamage,f.guitarFlex);}
  else g.drawImage(BAT_SPR,-4,-13.5,78,27);g.restore();
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
  if(b.kind==='guitar'){g.translate(-48,0);drawGuitarShape(g,b.damage||0,0);}
  else g.drawImage(BAT_SPR,-39,-13.5,78,27);
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
function drawRaggedHole(g,x,y,size,angle,cloth,under,phase,time){
  g.save();g.translate(x,y);g.rotate(angle);
  const w=size,h=Math.max(6,size*.72),j=Math.sin(phase)*1.2;
  // The opening has a slightly uneven, stable outline rather than a rectangle.
  g.fillStyle='#090A0D';g.beginPath();
  g.moveTo(-w*.52,-h*.14);g.lineTo(-w*.42,-h*.43);g.lineTo(-w*.13,-h*.5+j);
  g.lineTo(w*.05,-h*.34);g.lineTo(w*.34,-h*.47-j);g.lineTo(w*.5,-h*.16);
  g.lineTo(w*.4,h*.08);g.lineTo(w*.52,h*.28);g.lineTo(w*.24,h*.5);
  g.lineTo(-w*.05,h*.35);g.lineTo(-w*.32,h*.48-j);g.lineTo(-w*.5,h*.2);
  g.closePath();g.fill();
  g.fillStyle=under;g.beginPath();
  g.moveTo(-w*.35,-h*.12);g.lineTo(-w*.26,-h*.3);g.lineTo(-w*.07,-h*.36);
  g.lineTo(w*.08,-h*.22);g.lineTo(w*.29,-h*.3);g.lineTo(w*.32,-h*.05);
  g.lineTo(w*.25,h*.09);g.lineTo(w*.34,h*.23);g.lineTo(w*.17,h*.32);
  g.lineTo(-w*.04,h*.22);g.lineTo(-w*.23,h*.32);g.lineTo(-w*.34,h*.12);
  g.closePath();g.fill();
  g.fillStyle='rgba(0,0,0,.28)';g.fillRect(-w*.22,-h*.29,w*.4,1.5);
  g.fillStyle=cloth;g.fillRect(-w*.48,-h*.42,w*.22,2);
  g.fillRect(w*.22,h*.22,2,3+Math.sin(time*8+phase));
  g.restore();
}
function drawLimbRips(g,R,f,part,a,b,halfWidth){
  const rips=f.wounds.rips;
  let found=false;for(const rip of rips)if(rip.part===part){found=true;break;}
  if(!found)return;
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
  const nx=R.dir*dy/len,ny=-R.dir*dx/len;
  // Clip each opening to the limb, and paint it with that limb rather than
  // over a different arm/leg later in the fighter's layer stack.
  g.save();g.beginPath();
  g.moveTo(a.x+nx*halfWidth,a.y+ny*halfWidth);g.lineTo(b.x+nx*halfWidth,b.y+ny*halfWidth);
  g.lineTo(b.x-nx*halfWidth,b.y-ny*halfWidth);g.lineTo(a.x-nx*halfWidth,a.y-ny*halfWidth);
  g.closePath();g.clip();
  for(const rip of rips){
    if(rip.part!==part)continue;
    const offset=clamp(rip.offset??rip.side*4,-halfWidth*.65,halfWidth*.65);
    const x=a.x+dx*rip.t+nx*offset,y=a.y+dy*rip.t+ny*offset;
    const angle=Math.atan2(dy,dx)-Math.PI/2+rip.angle*R.dir;
    drawRaggedHole(g,x,y,rip.size,angle,rip.cloth,rip.under,rip.phase,f.t);
  }
  g.restore();
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
  if(mode!=='arms') for(const rip of f.wounds.rips){
    if(rip.part!=='torso')continue;
    const point=rip.laser?surfacePoint(R,{seg:'torso',t:rip.t,s:rip.offset}):
      {x:n.x+dir*uy*rip.x+ux*scale*rip.y,y:n.y-dir*ux*rip.x+uy*scale*rip.y};
    const angle=Math.atan2(uy,ux)-Math.PI/2+rip.angle*dir;
    drawRaggedHole(g,point.x,point.y,rip.size,angle,rip.cloth,rip.under,rip.phase,f.t);
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
  if (!data || !data.img || !data.loaded || !data.img.complete || !data.img.naturalWidth) {
    const angle=Math.atan2(head.y-neck.y,head.x-neck.x)+Math.PI/2;
    g.save();g.translate(head.x,head.y);g.rotate(angle);
    // Neutral pixel-art stand-in, replaced automatically when the PNG loads.
    g.fillStyle='#241b1b';g.fillRect(-14,-23,28,34);
    g.fillStyle='#d6a17e';g.fillRect(-12,-18,24,28);
    g.fillStyle='#e3b08d';g.fillRect(-9,-15,17,19);
    g.fillStyle=f.skin==='chester'?'#4b3d37':'#49382f';g.fillRect(-12,-23,24,7);g.fillRect(-14,-18,4,8);
    g.fillStyle='#292021';g.fillRect(-8,-8,4,3);g.fillRect(4,-8,4,3);
    g.fillStyle='#9e624e';g.fillRect(-2,-3,4,5);g.fillRect(-5,5,10,2);
    g.restore();return;
  }
  const angle = Math.atan2(head.y - neck.y, head.x - neck.x) + Math.PI / 2;
  // The helmet sits over a head rather than having the same silhouette as one.
  const height = f.skin === 'tubtrooper' ? 49 : 44;
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
  const stain=f.jointBlood?.['e'+prefix]||0;
  const upper = stainedSkinSprite(far ? S.uArmB : S.uArmF,'elbow-upper',stain);
  const lower = stainedSkinSprite(far ? S.lArmB : S.lArmF,'elbow-lower',stain);
  drawSkinSegment(g, upper, R.sh, elbow, far ? 18 : 19, 4, 4, R.dir === 1);
  drawSkinSegment(g, lower, elbow, wrist, 18, 3, 5, R.dir === 1);
  drawSkinLimbWounds(g, f.wounds['u' + prefix], R.sh, elbow, 8, R.dir);
  drawSkinLimbWounds(g, f.wounds['f' + prefix], elbow, wrist, 8, R.dir);
  drawLimbRips(g,R,f,'u'+prefix,R.sh,elbow,far?9:9.5);
  drawLimbRips(g,R,f,'f'+prefix,elbow,wrist,9);
}
function drawPixelLeg(g, R, f, far, S) {
  const prefix = far ? 'F' : 'N';
  const knee = R['k' + prefix], ankle = R['a' + prefix], foot = R[far ? 'fdF' : 'fdN'];
  const stain=f.footBlood?.[prefix]||0,joint=f.jointBlood?.['k'+prefix]||0;
  const thigh=stainedSkinSprite(far ? S.thighB : S.thighF,'knee-thigh',joint);
  const shin=stainedSkinSprite(stainedSkinSprite(far ? S.shinB : S.shinF,'shin',stain),'knee-shin',joint);
  drawSkinSegment(g, thigh, R.pel, knee, far ? 20 : 21, 5, 5, R.dir === 1);
  drawSkinSegment(g, shin, knee, ankle, 18, 4, 4, R.dir === 1);
  drawSkinLimbWounds(g, f.wounds['t' + prefix], R.pel, knee, 10, R.dir);
  drawSkinLimbWounds(g, f.wounds['s' + prefix], knee, ankle, 8, R.dir);
  drawLimbRips(g,R,f,'t'+prefix,R.pel,knee,far?10:10.5);
  drawLimbRips(g,R,f,'s'+prefix,knee,ankle,9);
  drawSkinBoot(g, stainedSkinSprite(far ? S.bootB : S.bootF,'boot',stain), ankle, foot, R.dir, 29, 18);
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
function surfacePoint(R,b){
  if(!R||!b)return null;
  if(b.seg==='head'){
    const angle=Math.atan2(R.head.y-R.neck.y,R.head.x-R.neck.x)+Math.PI/2;
    const ca=Math.cos(angle),sa=Math.sin(angle);
    return {x:R.head.x+b.lx*ca-b.ly*sa,y:R.head.y+b.lx*sa+b.ly*ca};
  }
  const info=BURN_MAP[b.seg];if(!info)return null;
  const A=R[info[1]],B=R[info[2]];if(!A||!B)return null;
  const dx=B.x-A.x,dy=B.y-A.y,len=Math.hypot(dx,dy)||1;
  const nx=R.dir*dy/len,ny=-R.dir*dx/len;
  return {x:A.x+dx*b.t+nx*b.s,y:A.y+dy*b.t+ny*b.s};
}
function paintBleeding(g,R,b){
  const p=surfacePoint(R,b.mark);if(p)paintBleedingAt(g,p,b);
}
function paintBleedingAt(g,p,b){
  const q=3,x=Math.round(p.x/q)*q,y=Math.round(p.y/q)*q;
  g.globalAlpha=.94;g.fillStyle='#690c1a';
  // The wound starts as just two dark pixels; thin rivulets grow afterward.
  g.fillRect(x,y,q,q);g.fillRect(x+q,y+q,q,q);
  const length=clamp((b.flowTime-.3)*10,0,33);
  for(let dy=6;dy<length;dy+=3){
    const dx=Math.round(Math.sin(dy*.21+b.phase)*.7)*q;
    g.fillStyle=dy%9===0?'#9b1b2b':'#6f0d1b';g.fillRect(x+dx,y+dy,q,q);
    if(dy>15&&dy%12===0)g.fillRect(x+dx+q,y+dy,q,q);
  }
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
  if(!R)return;
  const marks=[...(f.burns||[]),...(f.bloodStains||[])];
  const bleed=f.bleed&&f.bleed.mark.layer===layer?f.bleed:null;
  if(!bleed&&!marks.some(b=>b.layer===layer))return;
  g.save();
  g.globalCompositeOperation='source-atop';
  for(const b of marks){
    if(b.layer!==layer)continue;
    const p=surfacePoint(R,b);if(!p)continue;
    if(b.kind==='blood')paintBloodSpot(g,p.x,p.y,b);else paintBurnSpot(g,p.x,p.y,b);
  }
  if(bleed)paintBleeding(g,R,bleed);
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
  drawSkinSegment(ctx, S.neck, R.sh, f.headDestroyed?R.neck:R.head, 14, 4, 8, R.dir === 1);
  if(f.headDestroyed){
    const p=R.neck;ctx.fillStyle='#4c0610';ctx.fillRect(p.x-8,p.y-4,16,8);
    ctx.fillStyle='#a51b27';ctx.fillRect(p.x-6,p.y-4,12,4);
  }
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
  if (!R || !f.visible || f.headDestroyed) return;
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
// A hot cut travels across the visible body before it separates. Ordinary
// laser burns fade after seconds; the orange borders on the pieces below do not.
function drawSliceProgress(g,f){
  const job=f.laserSlice,R=f.rig;if(!job||!R)return;
  const {nx,ny,cuts}=laserCutGeometry(R,job.slope);
  // The tangent of each physical cut gives exactly the line that will be
  // severed, even while a falling ragdoll rotates during the wind-up.
  const tx=ny,ty=-nx,reach=140;
  g.save();g.globalCompositeOperation='source-atop';g.lineCap='butt';
  for(const cut of cuts){
    const cx=R.neck.x+nx*cut,cy=R.neck.y+ny*cut;
    const x0=cx-tx*reach,y0=cy-ty*reach;
    const x1=x0+tx*reach*2*job.progress,y1=y0+ty*reach*2*job.progress;
    g.strokeStyle='#ad3011';g.lineWidth=7;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();
    g.strokeStyle='#ff971b';g.lineWidth=3;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();
  }
  g.restore();
}
// Build a texture for each anatomical segment, preserving its outfit and
// surface wounds. The physics graph will split these textures only where the
// cut crosses the underlying bone; intact elbows and knees stay articulated.
function goreBoneTexture(f,R,def){
  if(def.name==='link')return null;
  const S=SK_[f.skin]||SK_.jane;
  const a0=R[def.a],b0=R[def.b],len=Math.hypot(b0.x-a0.x,b0.y-a0.y);
  const c=mk();c.width=56;c.height=Math.ceil(len+16);
  const g=c.getContext('2d');g.imageSmoothingEnabled=false;
  const a={x:c.width/2,y:8},b={x:c.width/2,y:8+len},flip=f.dir===1;
  let width=0;
  if(def.name==='torso'){
    const p1=pointBetween(a,b,.34),p2=pointBetween(a,b,.68);
    drawSkinSegment(g,S.chest,a,p1,38,6,6,flip);
    drawSkinSegment(g,S.abdomen,p1,p2,35,4,4,flip);
    drawSkinSegment(g,S.pelvis,p2,b,35,4,6,flip);
  }else if(def.name==='neck'){
    drawSkinSegment(g,S.neck,a,b,14,4,8,flip);
  }else{
    const far=def.name[1]==='F',kind=def.name[0];
    let sprite,padA,padB;
    if(kind==='u'){sprite=far?S.uArmB:S.uArmF;width=far?18:19;padA=padB=4;}
    else if(kind==='f'){sprite=far?S.lArmB:S.lArmF;width=18;padA=3;padB=5;}
    else if(kind==='t'){sprite=far?S.thighB:S.thighF;width=far?20:21;padA=padB=5;}
    else{sprite=far?S.shinB:S.shinF;width=18;padA=padB=4;}
    drawSkinSegment(g,sprite,a,b,width,padA,padB,flip);
  }
  if(def.name!=='neck'){
    // Preserve badges, seams, tears and other outfit detail from the actual
    // pose. Mask it to this bone so it moves with the resulting fragment.
    const ux=(b0.x-a0.x)/(len||1),uy=(b0.y-a0.y)/(len||1),local={dir:f.dir};
    for(const k of ['head','neck','sh','pel','eN','wN','eF','wF','kN','aN','kF','aF']){
      const p=R[k],x=p.x-a0.x,y=p.y-a0.y;
      local[k]={x:a.x+x*uy-y*ux,y:a.y+x*ux+y*uy};
    }
    g.save();g.globalCompositeOperation='source-atop';drawSkinOutfitDetails(g,local,f);g.restore();
    if(def.name==='torso')drawSkinTorsoWounds(g,{neck:a,pel:b,dir:f.dir},f);
    else{
      drawSkinLimbWounds(g,f.wounds[def.name],a,b,width/2,f.dir);
      drawLimbRips(g,{dir:f.dir},f,def.name,a,b,width/2);
    }
  }
  return c;
}
function makeLaserPieces(f,job){
  const R=f.rig;if(!R)return [];
  const defs=[
    {name:'link',a:'neck',b:'sh',width:8,z:1},
    {name:'neck',a:'neck',b:'head',width:14,z:5},
    {name:'uF',a:'sh',b:'eF',width:18,z:0},{name:'fF',a:'eF',b:'wF',width:18,z:0},
    {name:'tF',a:'pel',b:'kF',width:20,z:1},{name:'sF',a:'kF',b:'aF',width:18,z:1},
    {name:'torso',a:'sh',b:'pel',width:38,z:2},
    {name:'tN',a:'pel',b:'kN',width:21,z:3},{name:'sN',a:'kN',b:'aN',width:18,z:3},
    {name:'uN',a:'sh',b:'eN',width:19,z:6},{name:'fN',a:'eN',b:'wN',width:18,z:6}
  ];
  for(const d of defs){
    d.length=Math.hypot(R[d.b].x-R[d.a].x,R[d.b].y-R[d.a].y);
    d.padA=8;d.padB=8;d.canvas=goreBoneTexture(f,R,d);
  }
  return splitArticulated(R,f.rag,defs,job,f.gy);
}
function updateGorePieces(pieces,dt,width){updateArticulated(pieces,dt,width);}
function updateGoreBlood(f,dt){
  if(f.gy!==Game.gy||!f.fx)return;
  const contacts=[];
  for(const piece of f.gorePieces){
    if(piece.age>4)continue;
    for(const part of piece.parts){
      if(part.cutA&&part.a.y+part.a.r>=f.gy-3)contacts.push(part.a);
      if(part.cutB&&part.b.y+part.b.r>=f.gy-3)contacts.push(part.b);
    }
  }
  if(!contacts.length)return;
  f.poolT-=dt;
  if(f.poolT<=0){
    f.poolT=.16;
    const random=()=>f.fx.bloodField.random(),p=contacts[Math.floor(random()*contacts.length)];
    f.fx.pool(p.x,f.gy+1+random()*12,8);
  }
}
// A wound remains on its own moving fragment rather than the old hidden body.
function goreSurfacePoint(f,mark){
  if(!f.gorePieces||!mark)return null;
  if(mark.seg==='head'){
    const h=f.gorePieces.flatMap(p=>p.heads)[0];
    return h?surfacePoint({head:h.head,neck:h.neck},mark):null;
  }
  const part=f.gorePieces.flatMap(p=>p.parts).find(p=>p.name===mark.seg&&mark.t>=p.t0&&mark.t<=p.t1);
  if(!part)return null;
  const t=clamp((mark.t-part.t0)/(part.t1-part.t0),0,1);
  const dx=part.b.x-part.a.x,dy=part.b.y-part.a.y,len=Math.hypot(dx,dy)||1;
  return {x:part.a.x+dx*t+f.dir*dy/len*mark.s,y:part.a.y+dy*t-f.dir*dx/len*mark.s};
}
// A head impact splashes only fragments actually near the impact. The frozen
// parent rig no longer represents where a severed corpse is located.
function splashSevered(f,point){
  const nearby=[];
  for(const piece of f.gorePieces){
    for(const h of piece.heads){
      const distance=Math.hypot(h.head.x-point.x,h.head.y-point.y);
      if(distance<190)nearby.push({head:true,distance});
    }
    for(const part of piece.parts){
      const def=BURN_MAP[part.name];if(!def)continue;
      const distance=distSeg(point.x,point.y,part.a.x,part.a.y,part.b.x,part.b.y);
      if(distance<190)nearby.push({part,def,distance});
    }
  }
  if(!nearby.length)return;
  const distance=Math.min(...nearby.map(n=>n.distance));
  const count=Math.round(14+16*(1-distance/190));
  for(let i=0;i<count;i++){
    const candidate=nearby[Math.floor(Math.random()*nearby.length)];
    const mark=candidate.head?
      {seg:'head',layer:'head',lx:rnd(-11,11),ly:rnd(-19,10)}:
      {seg:candidate.part.name,layer:candidate.def[4],
        t:rnd(candidate.part.t0,candidate.part.t1),s:rnd(-candidate.def[3]*.7,candidate.def[3]*.7)};
    f.bloodStains.push(Object.assign(mark,{kind:'blood',age:0,sz:rnd(.4,1)}));
  }
  if(f.bloodStains.length>36)f.bloodStains.splice(0,f.bloodStains.length-36);
}
function paintGoreSegmentMarks(g,part,f,len,marks){
  const local=(t,s=0)=>t>=part.t0&&t<=part.t1?
    {x:f.dir*s,y:len*(t-part.t0)/(part.t1-part.t0)}:null;
  g.save();g.beginPath();g.rect(-part.canvas.width/2,-part.padA,part.canvas.width,len+part.padA+part.padB);g.clip();
  g.globalCompositeOperation='source-atop';
  for(const mark of marks){
    if(mark.seg!==part.name)continue;
    const p=local(mark.t,mark.s);if(!p)continue;
    if(mark.kind==='blood')paintBloodSpot(g,p.x,p.y,mark);else paintBurnSpot(g,p.x,p.y,mark);
  }
  if(f.bleed?.mark.seg===part.name){
    const p=local(f.bleed.mark.t,f.bleed.mark.s);if(p)paintBleedingAt(g,p,f.bleed);
  }
  const kind=part.name[0],side=part.name[1];
  const joint=(kind==='u'||kind==='f'?'e':kind==='t'||kind==='s'?'k':null);
  const stain=(t,level)=>{
    const p=local(t);if(!p||!level)return;
    const amount=clamp(Math.ceil(level),1,3),x=Math.round(p.x/3)*3,y=Math.round(p.y/3)*3;
    g.globalAlpha=.84;g.fillStyle='#8c1724';g.fillRect(x-6,y-3,9,6);g.fillRect(x+3,y,3,3);
    if(amount>1)g.fillRect(x-9,y,3,3);if(amount>2)g.fillRect(x-3,y+3,6,3);
    g.globalAlpha=.65;g.fillStyle='#b32a35';g.fillRect(x-3,y-3,3,3);
  };
  if(joint)stain((kind==='u'||kind==='t') ? .9 : .1,f.jointBlood[joint+side]);
  if(kind==='s')stain(.9,f.footBlood[side]);
  g.restore();
}
function gorePartCanvas(part,f,marks){
  const applies=mark=>mark.seg===part.name&&mark.t>=part.t0&&mark.t<=part.t1;
  const localMarks=marks.filter(applies),kind=part.name[0],side=part.name[1];
  const joint=(kind==='u'||kind==='f'?'e':kind==='t'||kind==='s'?'k':null);
  const jointLevel=joint?Math.ceil(f.jointBlood[joint+side]||0):0;
  const footLevel=kind==='s'?Math.ceil(f.footBlood[side]||0):0;
  const bleed=f.bleed&&applies(f.bleed.mark)?f.bleed:null;
  if(!localMarks.length&&!jointLevel&&!footLevel&&!bleed)return part.canvas;
  // Composite stains on a tiny cached texture, not the full-screen layer.
  // Quantized fade steps avoid continuously re-uploading textures to the GPU.
  let key=`${jointLevel}:${footLevel}:`;
  for(const m of localMarks){
    const age=m.kind==='blood'?Math.floor(Math.min(m.age,4)):Math.floor(m.life*2);
    key+=`${m.kind||'burn'},${m.t},${m.s},${m.sz},${age};`;
  }
  if(bleed)key+=`bleed,${bleed.mark.t},${bleed.mark.s},${bleed.phase},${Math.floor(Math.min(bleed.flowTime,3.6)*2)}`;
  if(part.markCanvas&&part.markKey===key)return part.markCanvas;
  let c=part.markCanvas;
  if(!c){c=mk();c.width=part.canvas.width;c.height=part.canvas.height;part.markCanvas=c;}
  const q=c.getContext('2d');q.setTransform(1,0,0,1,0,0);q.globalAlpha=1;q.globalCompositeOperation='source-over';
  q.clearRect(0,0,c.width,c.height);q.imageSmoothingEnabled=false;q.drawImage(part.canvas,0,0);
  q.save();q.translate(c.width/2,part.padA);
  paintGoreSegmentMarks(q,part,f,Math.max(.01,c.height-part.padA-part.padB),localMarks);
  q.restore();part.markKey=key;
  return c;
}
// A settled pile never moves again, so its whole layer can be reused until a
// wound, blood stain, portrait, camera or the set of corpses changes.
function goreVisualKey(f){
  const portrait=skinHeads[f.skin]?.img;
  let key=`${f.id}:${portrait?.complete?portrait.naturalWidth:0}:${portrait?.src||''}:`;
  for(const k of ['eN','eF','kN','kF'])key+=`${Math.ceil(f.jointBlood[k]||0)},`;
  key+=`${Math.ceil(f.footBlood.N||0)},${Math.ceil(f.footBlood.F||0)};`;
  for(const wound of f.wounds.head)key+=`${wound.k},${wound.x},${wound.y},${wound.r},${wound.a},${wound.v},${wound.old};`;
  for(const mark of [...f.burns,...f.bloodStains]){
    const age=mark.kind==='blood'?Math.floor(Math.min(mark.age,4)):Math.floor(mark.life*2);
    key+=`${mark.kind||'burn'},${mark.seg},${mark.t},${mark.s},${mark.lx},${mark.ly},${mark.sz},${age};`;
  }
  if(f.bleed){
    const b=f.bleed,m=b.mark;
    key+=`bleed,${m.seg},${m.t},${m.s},${m.lx},${m.ly},${b.phase},${Math.floor(Math.min(b.flowTime,3.6)*2)}`;
  }
  return key;
}
// Composite a head's marks on its own small texture. On the shared gore layer,
// source-atop would also paint over any other fragment overlapping the face.
function goreHeadCanvas(head,f){
  const key=goreVisualKey(f);
  if(head.texture&&head.textureKey===key)return head.texture;
  const c=head.texture||mk();
  if(!head.texture){c.width=c.height=72;head.texture=c;}
  const q=c.getContext('2d');q.setTransform(1,0,0,1,0,0);q.globalAlpha=1;q.globalCompositeOperation='source-over';
  q.clearRect(0,0,c.width,c.height);q.imageSmoothingEnabled=false;
  const rig={head:{x:36,y:36},neck:{x:36,y:56}};
  drawSkinHead(q,rig,f);drawLayerBurns(q,rig,f,'head');
  head.textureKey=key;return c;
}
function drawGorePieces(g,pieces,f){
  const S=SK_[f.skin]||SK_.jane,marks=[...(f.burns||[]),...(f.bloodStains||[])];
  g.save();g.imageSmoothingEnabled=false;
  // Draw far limbs first across all independent pieces, then body/near limbs.
  const parts=pieces.flatMap(p=>p.parts).sort((a,b)=>a.z-b.z);
  for(const part of parts){
    if(!part.canvas)continue;
    const a=part.a,b=part.b,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<.1)continue;
    const texture=gorePartCanvas(part,f,marks);
    g.save();g.translate(a.x,a.y);g.rotate(Math.atan2(dy,dx)-Math.PI/2);
    g.drawImage(texture,-texture.width/2,-part.padA,texture.width,len+part.padA+part.padB);
    g.restore();
  }
  for(const piece of pieces){
    for(const h of piece.heads){
      const angle=Math.atan2(h.head.y-h.neck.y,h.head.x-h.neck.x)+Math.PI/2;
      g.save();g.translate(h.head.x,h.head.y);g.rotate(angle);
      g.drawImage(goreHeadCanvas(h,f),-36,-36);g.restore();
    }
    for(const foot of piece.feet){
      const sprite=stainedSkinSprite(foot.side==='F'?S.bootB:S.bootF,'boot',f.footBlood[foot.side]);
      drawSkinBoot(g,sprite,foot.ankle,footDirRag(foot.knee,foot.ankle,f.dir),f.dir,29,18);
    }
  }
  g.restore();
}
/* ---------- injuries ---------- */
const RIP={
  jane:      {cloth:'#343840', torso:'#DCE5EF', arm:'#DCE5EF', leg:'#B58C73'},
  negan:     {cloth:'#17191D', torso:'#CFCBC2', arm:'#CFCBC2', leg:'#B58C73'},
  homelander:{cloth:'#182943', torso:'#EFEFEF', arm:'#EFEFEF', leg:'#B58C73'},
  walt:      {cloth:'#526B3D', torso:'#E0A67F', arm:'#E0A67F', leg:null},
  saul:      {cloth:'#17191F', torso:'#EF5B9A', arm:'#EF5B9A', leg:'#B58C73'},
  chester:   {cloth:'#191a1d', torso:'#D89B72', arm:null, leg:'#B58C73'},
  tubtrooper:{cloth:'#d12e21', torso:'#d99f76', arm:null, leg:null}
};
function addLaserRip(f,mark){
  if(!mark||mark.seg==='head'||!BURN_MAP[mark.seg])return false;
  const part=mark.seg,leg=/^[ts][NF]$/.test(part),arm=/^[uf][NF]$/.test(part);
  // The end of a forearm sprite is the hand, not a sleeve.
  if(arm&&part[0]==='f'&&mark.t>.62)return false;
  const pal=RIP[f.skin]||RIP.jane;
  if(arm&&!pal.arm)return false; // bare tattooed arms are not a sleeve
  let cloth=pal.cloth,under=part==='torso'?pal.torso:leg?pal.leg:pal.arm;
  if(leg){
    if(f.skin==='tubtrooper'){
      // Only the top of the thigh is covered by the swim shorts.
      if(part[0]!=='t'||mark.t>=.34)return false;
      cloth='#d12e21';under='#d99f76';
    }else if(f.skin==='walt'){
      // Walt has bare legs: only his shorts or socks are actually cloth.
      if(part[0]==='t'&&mark.t<.23)cloth='#E9E7DF';
      else if(part[0]==='s'&&mark.t>.6)cloth='#8E9196';
      else return false;
      under=SF;
    }else{
      const trousers={jane:'#50555E',negan:'#323438',homelander:'#263B59',saul:'#22242B',chester:'#3b3d42'};
      cloth=trousers[f.skin]||pal.cloth;
      if(f.skin==='homelander'&&part[0]==='s'&&mark.t>.35)cloth='#B81D26';
    }
  }
  const rips=f.wounds.rips;
  if(rips.length>=8||rips.filter(r=>r.part===part).length>=2||
     rips.some(r=>r.laser&&r.part===part&&Math.abs(r.t-mark.t)<.18&&Math.abs(r.offset-mark.s)<7)||
     Math.random()>=.34)return false;
  const width=BURN_MAP[part][3];
  rips.push({laser:true,part,t:mark.t,offset:clamp(mark.s,-width*.65,width*.65),
    size:part==='torso'?rnd(12,17):rnd(9,13),angle:rnd(-.35,.35),cloth,under,phase:rnd(TAU)});
  return true;
}
function injure(f,zone,pw,laserMark=null){
  const rr=Math.random;
  // Laser cuts are created separately on the actual impact segment.
  if(zone!=='head'&&!laserMark){
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
    const part=laserMark&&f.wounds[laserMark.seg]?laserMark.seg:'s'+(rr()<.5?'N':'F');
    const width=BURN_MAP[part]?.[3]||8;
    addW(f,part,{k:'bruise',t:laserMark?.t??rnd(.2,.7),
      s:laserMark?clamp(laserMark.s/width,-.7,.7):rnd(-.4,.4),r:rnd(2.8,4.6),v:.5+pw*.2});
  }
}
/* ============================ FX / PIXEL BLOOD ============================ */
class FX{
  constructor(){
    this.sm=[];this.bl=[];this.sp=[];this.gibs=[];this.laserSparks=[];this.fl=[];this.rg=[];this.marks=[];this.decal=null;this.floorY=468;
    this.bloodField=new BloodField(960,this.floorY);
  }
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
        fy:this.floorY+rnd(2,27),
        life:2.5,
        fleck,shape
      });
    }
  }
  headFragments(x,y,dir,owner,floor=this.floorY){
    const colors=['#6e0815','#a31825','#cc413d','#e4a080','#f0c0a2'];
    for(let i=0;i<24;i++)this.gibs.push({x:x+rnd(-7,7),y:y+rnd(-8,5),
      vx:dir*rnd(80,260)+rnd(-210,150),vy:-rnd(100,370),size:3+((i%4===0)?3:0),
      color:colors[i%colors.length],life:rnd(8,14),owner,floor,settled:false});
    if(this.gibs.length>160)this.gibs.splice(0,this.gibs.length-160);
  }
  drip(x,y){
    // Small, slow drops instead of the existing explosive hit spray.
    this.bl.push({x,y,vx:rnd(-6,6),vy:rnd(8,25),r:1.5,fy:this.floorY+this.bloodField.range(3,15),
      life:2,shape:'drop',fleck:false,drip:true});
  }
  stampDrip(x,y){this.bloodField.add(x,y,'drip');}
  splash(x,y,dir,power){
    // A strong step produces just a few tiny droplets, not another hit spray.
    // Cosmetic randomness stays independent of the combat random stream.
    const field=this.bloodField,n=3+(power>.85?2:1);
    for(let i=0;i<n;i++)this.bl.push({
      x:x+field.range(-4,4),y:y-2,
      vx:(i%2?1:-1)*field.range(25,75)+dir*field.range(0,18),
      vy:-field.range(55,150),r:1.5,fy:this.floorY+field.range(2,20),
      life:1.2,shape:'drop',fleck:false,drip:true,splash:true
    });
  }
  clearBlood(){this.bl=[];this.bloodField.clear();}
  spark(x,y,n,col){for(let i=0;i<n;i++){const a=rnd(TAU),s=rnd(80,380);this.sp.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rnd(.15,.35),col:col||'255,210,90'});}}
  laserSpark(x,y,n,surf='body'){
    // Cosmetic randomness is independent of combat. Floor and wall sparks
    // travel away from the surface and fade in flight without leaving marks.
    const field=this.bloodField,colors=['255,72,62','255,120,75','255,190,140'];
    for(let i=0;i<n;i++){
      let a=field.range(0,TAU);
      if(surf==='floor')a=field.range(-2.65,-.49);
      else if(surf==='wall'&&y<=WORLD_TOP+12)a=field.range(.35,Math.PI-.35);
      else if(surf==='wall')a=(x<field.width/2?0:Math.PI)+field.range(-1.2,1.2);
      const speed=field.range(75,185),life=field.range(.18,.4),radius=field.range(2.3,4.4);
      this.laserSparks.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life,max:life,
        radius,aspect:field.range(.75,1.15),col:colors[Math.floor(field.random()*colors.length)]});
    }
    if(this.laserSparks.length>120)this.laserSparks.splice(0,this.laserSparks.length-120);
  }
  impact(x,y,dir,pw){this.fl.push({x,y,life:.16,max:.16,r:24+pw*30});this.spark(x,y,6+pw*8|0);}
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
  stamp(x,y,r,vx){this.bloodField.add(x,y,'hit',r);}
  pool(x,y,r){this.bloodField.add(x,y,'seep',r);}
  crack(x,y,dir){
    const d=this.decal;if(!d)return;
    d.strokeStyle='rgba(0,0,0,.65)';d.lineWidth=1.3;
    for(let k=0;k<4;k++){let cx=x,cy=y;d.beginPath();d.moveTo(cx,cy);for(let i=0;i<7;i++){cx+=(dir*(k<2?1:-1))*rnd(8,18);cy+=rnd(-4,4);d.lineTo(cx,cy);}d.stroke();}
  }
  update(dt){
    for(const s of this.sm){
      const k=Math.exp(-s.drag*dt);
      s.vx*=k; s.vy*=k;
      s.vy-=38*dt;
      s.x+=(s.vx+Math.sin(s.phase+s.life*s.freq)*s.turb)*dt;
      s.y+=s.vy*dt;
      s.life-=dt;
    }
    this.sm=this.sm.filter(s=>s.life>0);
    for(const b of this.bl){
      b.vy+=1600*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      if(b.y>=b.fy){
        if(b.splash)this.bloodField.add(b.x,b.fy,'splash');
        else if(b.drip)this.stampDrip(b.x,b.fy);else this.stamp(b.x,b.fy,b.r,b.vx);
        b.dead=true;
      }
    }
    this.bl=this.bl.filter(b=>!b.dead&&b.life>0);
    for(const p of this.gibs){
      p.life-=dt;
      if(p.settled)continue;
      p.vy+=1400*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(p.y>=p.floor-p.size){p.y=p.floor-p.size;p.vy=-Math.abs(p.vy)*.22;p.vx*=.62;
        if(Math.abs(p.vy)<35&&Math.abs(p.vx)<35){p.vx=p.vy=0;p.settled=true;}}
    }
    this.gibs=this.gibs.filter(p=>p.life>0);
    for(const s of this.sp){s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=500*dt;s.life-=dt;}
    this.sp=this.sp.filter(s=>s.life>0);
    for(const s of this.laserSparks){s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=220*dt;s.life-=dt;}
    this.laserSparks=this.laserSparks.filter(s=>s.life>0);
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
    for(const p of this.gibs){
      ctx.fillStyle=p.color;ctx.fillRect(Math.round(p.x/q)*q,Math.round(p.y/q)*q,p.size,p.size);
    }
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
  }
  drawLaserSparks(ctx){
    for(const s of this.laserSparks){
      const k=clamp(s.life/s.max,0,1),radius=s.radius*(.55+.45*k);
      ctx.fillStyle=`rgba(${s.col},${k})`;ctx.beginPath();
      ctx.ellipse(s.x,s.y,radius,radius*s.aspect,0,0,TAU);ctx.fill();
    }
  }
}
/* ============================ RAGDOLL ============================ */
const RK=['head','neck','pel','eN','wN','eF','wF','kN','aN','kF','aF'];
const RAD_R={head:12,neck:5,pel:8.5,eN:4.5,wN:5,eF:4.5,wF:5,kN:6.5,aN:7.5,kF:6.5,aF:7.5};
const DC=[['head','neck',NECKH],['neck','pel',TORSO_L],['eN','neck',UA],['wN','eN',FA],['eF','neck',UA],['wF','eF',FA],['kN','pel',THIGH],['aN','kN',SHIN],['kF','pel',THIGH],['aF','kF',SHIN]];
const DMIN=[['head','pel',64,84],['aN','pel',33,100],['aF','pel',33,100],['wN','neck',24,66],['wF','neck',24,66],['kN','neck',44,215],['kF','neck',44,215]];
const HSTEP=1/120;
class Ragdoll{
  constructor(R,f){
    this.f=f;this.dir=f.dir;this.t=0;this.acc=0;this.settle=0;this.imp=0;this.p={};this.highFall=false;
    for(const k of RK)this.p[k]={x:R[k].x,y:R[k].y,px:R[k].x,py:R[k].y,r:RAD_R[k]};
  }
  launch(vx,vy,highFall=false){
    // Ordinary punches retain their restrained launch; a real high fall keeps
    // its downward momentum rather than being clamped into a slow glide.
    const mass=ragMassFor(this.f.skin);
    if(highFall){vx=clamp(vx,-650,650);vy=clamp(vy,-1800,600);}
    else{vx=clamp(vx,-480,480)/Math.sqrt(mass);vy=clamp(vy,-350,500)/Math.sqrt(mass);}
    this.highFall=highFall;
    const P=this.p;
    // Rotation follows the incoming impulse, not the fighter's facing.
    // A blow from the front can therefore tip them backwards.
    const turn=Math.abs(vx)>15?Math.sign(vx):(Math.random()<.5?-1:1);
    const spin=turn*(highFall?rnd(3.8,5.1):rnd(2.5,3.5));
    for(const k of RK){const p=P[k],rx=p.x-P.pel.x,ry=p.y-P.pel.y;
      const flail=highFall&&(k[0]==='w'||k[0]==='a')?rnd(-85,85):rnd(-28,28);
      const ax=vx-ry*spin+flail,ay=-vy+rx*spin+rnd(-28,28);p.px=p.x-ax*HSTEP;p.py=p.y-ay*HSTEP;}
    this.sleeping=false;
  }
  wake(){this.sleeping=false;this.frozen=false;this.settle=0;}
  grounded(){return RK.filter(k=>this.p[k].y>=this.f.gy-this.p[k].r-1).length>=2;}
  update(dt){
    if(this.frozen)return;
    this.t+=dt;this.imp-=dt;
    if(this.sleeping){
      this.settle+=dt;
    }else{
      // Solver impulses are not a reliable rest test. Compare actual world-space
      // movement over the frame so a settled pile of limbs can really sleep.
      const before=RK.map(k=>({x:this.p[k].x,y:this.p[k].y}));
      this.acc+=dt;let n=0;
      while(this.acc>=HSTEP&&n<6){this.step();this.acc-=HSTEP;n++;}
      if(n>=6)this.acc=0;
      let motion=0;for(let i=0;i<RK.length;i++){
        const p=this.p[RK[i]];motion+=Math.hypot(p.x-before[i].x,p.y-before[i].y);
      }
      const resting=this.grounded()&&this.p.neck.y>this.f.gy-105&&motion/RK.length/Math.max(dt,1e-5)<16;
      if(resting)this.settle+=dt;else this.settle=0;
      if(this.t>.5&&this.settle>.45){
        this.sleeping=true;this.acc=0;
        for(const k of RK){const p=this.p[k];p.px=p.x;p.py=p.y;}
      }
    }
    if(this.f.hp<=0&&((this.settle>1.25&&this.t>1.5)||this.t>6)){
      this.frozen=true;for(const k of RK){const p=this.p[k];p.px=p.x;p.py=p.y;}
    }
  }
  // Position corrections are mostly carried into the previous Verlet sample.
  // Otherwise every constraint/contact iteration creates artificial velocity.
  movePoint(p,dx,dy){p.x+=dx;p.y+=dy;p.px+=dx*.9;p.py+=dy*.9;}
  step(){
    const P=this.p,f=this.f,airborne=this.highFall&&!this.grounded();
    const g=(airborne?2200:1900)*HSTEP*HSTEP,gy=f.gy,maxSpd=this.highFall?(airborne?16:8):4.5,contacts=new Set();
    const drag=airborne?.998:.985;
    for(const k of RK){
      const p=P[k];let vx=(p.x-p.px)*drag,vy=(p.y-p.py)*drag;
      const speed=Math.hypot(vx,vy);if(speed>maxSpd){vx*=maxSpd/speed;vy*=maxSpd/speed;}
      p.px=p.x;p.py=p.y;p.x+=vx;p.y+=vy+g;
    }
    for(let it=0;it<5;it++){
      for(const [a,b,l] of DC){
        const A=P[a],B=P[b],dx=B.x-A.x,dy=B.y-A.y,d=Math.hypot(dx,dy)||1e-4,df=(d-l)/d*.5;
        this.movePoint(A,dx*df,dy*df);this.movePoint(B,-dx*df,-dy*df);
      }
      for(const [a,b,mn,mx] of DMIN){
        const A=P[a],B=P[b],dx=B.x-A.x,dy=B.y-A.y,d=Math.hypot(dx,dy)||1e-4;
        let t=0;if(d<mn)t=mn;else if(d>mx)t=mx;else continue;
        const df=(d-t)/d*.5;this.movePoint(A,dx*df,dy*df);this.movePoint(B,-dx*df,-dy*df);
      }
      this.lim(P.pel,P.kN,P.aN,this.dir);this.lim(P.pel,P.kF,P.aF,this.dir);
      this.lim(P.neck,P.eN,P.wN,-this.dir);this.lim(P.neck,P.eF,P.wF,-this.dir);
      // Whole-body point/segment self-collision fought the joint constraints
      // and pumped energy into the body. Keep only symmetric joint separation;
      // it preserves the silhouette without making a resting body crawl.
      for(const [a,b,m] of [['wN','wF',8],['kN','kF',10],['aN','aF',11],['kN','aF',9],['kF','aN',9],['wN','head',16],['wF','head',16]]){
        const A=P[a],B=P[b],dx=B.x-A.x,dy=B.y-A.y,d=Math.hypot(dx,dy)||1e-4;
        if(d<m){const df=(d-m)/d*.5;this.movePoint(A,dx*df,dy*df);this.movePoint(B,-dx*df,-dy*df);}
      }
      for(const k of RK){const p=P[k],lim=gy-p.r;
        if(p.y>lim){
          const vy=p.y-p.py;if(vy>2.4&&this.imp<=0)this.impact(p,vy);
          p.y=lim;p.py=p.y+(vy>0?vy*.06:-vy);contacts.add(p);
        }
        if(p.x<f.minX-30){p.x=f.minX-30;p.px=p.x;}
        if(p.x>f.maxX+30){p.x=f.maxX+30;p.px=p.x;}
      }
    }
    for(const k of RK){
      const p=P[k];let vx=p.x-p.px,vy=p.y-p.py;
      const speed=Math.hypot(vx,vy);if(speed>maxSpd){vx*=maxSpd/speed;vy*=maxSpd/speed;}
      if(contacts.has(p)){vx*=.72;if(Math.abs(vx)<.025)vx=0;}
      p.px=p.x-vx;p.py=p.y-vy;
    }
  }
  lim(a,b,c,sign){
    // Gently correct an inverted elbow/knee instead of mirroring the joint in
    // one step. Equal/opposite corrections avoid injecting centre-of-mass drift.
    const ux=c.x-a.x,uy=c.y-a.y,L=Math.hypot(ux,uy)||1;
    const distance=((b.x-a.x)*uy-(b.y-a.y)*ux)*sign/L;
    if(distance < -1){
      const nx=uy/L*sign,ny=-ux/L*sign,d=Math.min(5,(-distance-1)*.35);
      this.movePoint(b,nx*d*.5,ny*d*.5);
      this.movePoint(a,-nx*d*.25,-ny*d*.25);this.movePoint(c,-nx*d*.25,-ny*d*.25);
    }
  }
  impact(p,vy){
    this.imp=.14;const f=this.f;
    if(vy>6&&f.fx)f.fx.landing(p.x,f.gy,clamp((vy-4)/12,.25,.9));
    if(vy>5)Snd.thud();
    f.applyFallDamage(p);
    f.ragInjury(vy);
  }
  toRig(f){
    const P=this.p,R={dir:f.dir};for(const k of RK)R[k]=P[k];
    R.sh={x:lerp(P.neck.x,P.pel.x,.07),y:lerp(P.neck.y,P.pel.y,.07)};
    R.fdN=footDirRag(P.kN,P.aN,f.dir);R.fdF=footDirRag(P.kF,P.aF,f.dir);
    R.cN=.35;R.cF=.35;R.mo=.5;R.ey=f.hp<=0?1:.75;R.bd=null;
    // While alive, Lucille stays in Negan's near hand (1-handed); upon death he lets go of it.
    if((f.skin==='negan'||f.skin==='chester')&&f.hp>0&&!f.batLost){
      let dx=P.wN.x-P.eN.x,dy=P.wN.y-P.eN.y;const l=Math.hypot(dx,dy)||1;
      R.bd=clampBatFloor(P.wN.x,P.wN.y,dx/l,dy/l,f.gy);
    }
    return R;
  }
}
/* ============================ FIGHTER ============================ */
let NEXT_ID=1;
function distSeg(px,py,ax,ay,bx,by){
  const sx=bx-ax,sy=by-ay,l2=sx*sx+sy*sy||1;const t=clamp(((px-ax)*sx+(py-ay)*sy)/l2,0,1);
  return Math.hypot(px-(ax+sx*t),py-(ay+sy*t));
}
// Body test used by the laser ray: capsules along the rig (works for standing fighters and ragdolls).
const BODY_CAPS=[['neck','pel',17],['pel','kN',10],['pel','kF',10],['kN','aN',8],['kF','aF',8],['neck','eN',7],['eN','wN',6],['neck','eF',7],['eF','wF',6]];
function bodyHit(g,px,py){
  const R=g.rig;if(!R||g.gorePieces)return false;
  if(Math.abs(px-R.pel.x)>170)return false;
  if(!g.headDestroyed&&Math.hypot(px-R.head.x,py-(R.head.y-6))<18)return true;
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
    this.ctrl={mx:0,jump:false,punch:false,run:false,hop:false,laser:false,noFace:false,crouch:false};
    this.autopilot=new AutoCombat();
    this.reset(o.x||300,o.dir||1);
  }
  reset(x,dir){
    Object.assign(this,{
      x,y:0,vx:0,vy:0,dir,hp:100,
      state:'idle',st:0,t:0,walkPh:0,comboStep:0,comboT:9,
      dashCD:0,invT:0,landT:0,stunT:0,cur:null,blend:0,
      visible:true,rig:null,atk:null,ak:0,atkStamp:0,
      connected:false,lastHitTarget:null,lastAttackEnd:-Infinity,lastSign:1,rag:null,hitZone:'head',
      poolT:0,sp:0,spT:0,dashW:0,dashF:true,dashT:0,
      hitDone:false,queued:false,lungeDone:false,wh:false,dustT:0,peaceful:false,tie:null,cape:null,pvx:0,pvy:0,corpseFade:0,
      speech:'',speechTime:0,speechWait:5+(this.seed%1)*6,speechWasDown:false,spokenDownTarget:null,
      ambientSeed:(Math.floor(this.seed*429496729)>>>0)||1,
      lz:null,lzSnd:false,burns:[],dive:false,diveT:0,diveHit:false,kickExt:0,bodyJump:false,fastGetup:false,
      hoverY:0,hlBrake:0,hlBrakeDir:1,hlBrakeFrom:null,hlLiftFx:false,hopDur:.38,
      batLost:false,guitarDamage:0,guitarFlex:0,guitarFlexVel:0,dizzyAlpha:0,dizzyPh:Math.random()*TAU,
      boxing:false,boxCD:0,guardCD:0,guardDur:0,guardFlinch:0,guardShakePhase:0,guardShakeX:0,guardShakeY:0,guardMoves:false,guardPhase:0,dodgedBy:null,
      crouchActive:false,crouchTime:0,runStopFrom:null,
      overextendFor:null,overextendStamp:0,flankTarget:null,flankFrom:0,
      chokeCD:0,chokeCooldownPending:false,chokeTarget:null,chokedBy:null,chokeDuration:0,chokeCounterAt:Infinity,chokeReleaseAt:Infinity,
      counterBase:null,counterReleased:false,fallDamage:null,
      staggerDir:0,staggerDur:0,shoveWillFall:false,
      shoveCD:0,shoveTarget:null,shoveDone:false,
      lampGoal:null,lampRef:null,lampAction:'pullup',lampStamina:0,lampClimb:0,
      onBridge:false,fallPeak:0,fallReactT:0,bridgeTarget:null,tackleCheck:0,
      duckCD:1.2,duckTarget:null,duckReleased:false,
      lampGrabGap:52,lampGrabSide:0,lampBreakAt:Infinity,lampDiveAt:Infinity,lampHangStamp:0,lampPullTarget:null,lampPullDone:false,
      bloodStains:[],footBlood:{N:0,F:0},jointBlood:{kN:0,kF:0,eN:0,eF:0},bloodFootfall:null,footSplashCooldown:0,
      headDestroyed:false,laserSlice:null,gorePieces:null,
      bleed:null,collapseFrom:null,blinkT:rnd(2.2,5.5),blink:0,coughT:rnd(1,2.6)
    });
  }
  spawn(delay){this.state='spawn';this.sp=0;this.spT=delay||.05;this.visible=false;this.y=this.spawnY;this.vy=0;this.vx=0;this.st=0;this.cur=null;this.hoverY=0;}
  canBeHit(){return this.hp>0&&this.state!=='ragdoll'&&this.state!=='getup'&&this.state!=='spawn'&&this.state!=='win'&&this.invT<=0;}
  faceOpp(o){if(this.ctrl.noFace)return;if(this.skin==='homelander'&&this.hlBrake>.42)return;if(o&&this.y<2&&Math.abs(o.x-this.x)>10)this.dir=o.x>this.x?1:-1;}
  // Ambient choices use their own deterministic stream; dialogue and solo
  // wandering must not change the random decisions in an ongoing fight.
  ambientRandom(){this.ambientSeed=(Math.imul(this.ambientSeed,1664525)+1013904223)>>>0;return this.ambientSeed/4294967296;}
  ambientBetween(a,b){return a+this.ambientRandom()*(b-a);}
  ambientLine(lines){return lines[Math.floor(this.ambientRandom()*lines.length)];}
  speak(text,duration=2.4){this.speech=text;this.speechTime=duration;}
  updateSpeech(dt,target){
    if(this.speechTime>0){this.speechTime=Math.max(0,this.speechTime-dt);if(!this.speechTime)this.speech='';}
    this.speechWait-=dt;
    if(this.hp<=0){this.speech='';this.speechTime=0;return;}
    const down=this.state==='ragdoll';
    if(down&&!this.speechWasDown){
      this.speak(this.ambientLine(DOWN_LINES),1.5);this.speechWait=this.ambientBetween(5,9);
    }
    this.speechWasDown=down;
    if(down)return;
    const unconscious=target&&target.hp>0&&target.state==='ragdoll'&&Math.abs(target.x-this.x)<280;
    if(!unconscious)this.spokenDownTarget=null;
    else if(this.spokenDownTarget!==target&&this.speechWait<=0&&!this.speechTime){
      this.spokenDownTarget=target;this.speechWait=this.ambientBetween(9,16);
      if(this.ambientRandom()<.3)this.speak(this.ambientLine(CHECK_LINES),2.3);
    }
    if(!target&&['idle','run'].includes(this.state)&&this.speechWait<=0&&!this.speechTime){
      this.speak(this.ambientLine(CASUAL_LINES[this.skin]||CASUAL_LINES.jane),2.8);
      this.speechWait=this.ambientBetween(11,20);
    }
  }
  bloodStrength(){
    if(!this.bleed)return 1;
    const weakness=clamp((this.bleed.lost+Math.max(0,30-this.hp)*.55)/32,0,1);
    return lerp(1,.4,weakness);
  }
  speedMul(){return wstat(this.skin).speedMul*(this.hp<30?.85:1)*this.bloodStrength();}
  startAttack(i,boxing=false){
    if(this.state==='bleed_collapse')return false;
    const pressing=this.bleed&&this.bleed.pressing;
    const set=(boxing||pressing)?(this.skin==='homelander'?ATK_HL:ATK):atkSetFor(this.skin);
    let a=set[i];
    if(!a||(pressing&&(a.fist===this.bleed.arm||a.bat)))return false;
    if(this.skin==='negan'&&!boxing&&!pressing&&!a.air){
      const target=Game.fighters.find(o=>o!==this&&o.hp>0&&o.hp<=BAT_FINISH.dmg&&o.canBeHit()&&
        Math.abs(o.x-this.x)<145&&Math.abs((o.gy-o.y)-(this.gy-this.y))<110);
      if(target)a=BAT_FINISH;
    }
    this.state='attack';this.boxing=boxing;this.atk=a;
    this.ak=i;this.st=0;this.hitDone=false;this.queued=false;this.lungeDone=false;
    this.connected=false;this.lastHitTarget=null;this.lastAttackEnd=-Infinity;this.dodgedBy=null;this.wh=false;this.atkStamp++;this.lzSnd=false;this.lz=null;this.hlBrake=0;
    return true;
  }
  startDuckThrow(target){
    if(this.skin!=='tubtrooper'||this.state!=='idle'||this.hp<=0||this.y>5||this.duckCD>0||
       !target||target.hp<=0||!target.rig||target===this||!target.canBeHit()||
       (this.bleed&&this.bleed.pressing))return false;
    const dx=target.x-this.x,vertical=Math.abs((this.gy-this.y)-(target.gy-target.y));
    if(Math.abs(dx)<185||Math.abs(dx)>800||vertical>150)return false;
    this.dir=dx>0?1:-1;this.state='duck_throw';this.st=0;this.vx=0;
    this.duckTarget=target;this.duckReleased=false;this.duckCD=rnd(4.5,6.5);this.comboT=9;
    return true;
  }
  startBoxing(){
    if(this.state!=='idle'||this.hp<=0||this.y>5||this.boxCD>0||(this.bleed&&this.bleed.pressing))return false;
    this.boxCD=rnd(1.4,2.1);this.startAttack(0,true);return true;
  }
  flinchGuard(){
    this.guardFlinch=.2;this.guardShakePhase=rnd(TAU);
    this.guardShakeX=rnd(3.5,6);this.guardShakeY=rnd(3,5.5);
  }
  startGuard(att){
    if(this.state!=='idle'||this.hp<=0||this.y>5||this.guardCD>0||!att||(this.bleed&&this.bleed.pressing))return false;
    this.dir=att.x>=this.x?1:-1;this.state='guard';this.st=0;this.vx=0;
    this.guardDur=rnd(1.7,2.4);this.guardCD=rnd(1.8,3);this.hlBrake=0;
    this.guardMoves=Math.random()<.5;this.guardPhase=rnd(TAU);return true;
  }
  startShove(v){
    if(this.state!=='idle'||this.hp<=0||this.y>5||this.shoveCD>0||(this.bleed&&this.bleed.pressing)||!v||v===this||
       !Game.fighters.includes(this)||!Game.fighters.includes(v)||!v.canBeHit()||v.y>5||
       v.state==='lamp_jump'||Math.abs(v.gy-this.gy)>100||Math.abs(v.x-this.x)>SHOVE_REACH)return false;
    this.dir=v.x>=this.x?1:-1;this.state='shove';this.st=0;this.vx=0;
    this.shoveTarget=v;this.shoveDone=false;this.shoveCD=rnd(3,4.5);this.hlBrake=0;
    Snd.whoosh();return true;
  }
  receiveShove(att){
    if(!att||!this.canBeHit()||this.y>5||this.state==='lamp_jump')return false;
    if(this.state==='push_stagger'||this.state==='stagger_fall'){
      this.toRagdoll(this.staggerDir*130,120);Snd.thud();return true;
    }
    if(this.state==='guard'&&(att.x-this.x)*this.dir>=-12){
      this.flinchGuard();this.vx=att.dir*50;
      if(this.fx&&this.rig)this.fx.puff(this.rig.sh.x,this.rig.sh.y,3,.5);
      Snd.thud();return true;
    }
    this.breakChoke();this.boxing=false;this.lampPullTarget=null;this.shoveTarget=null;
    this.bodyJump=false;this.dive=false;this.kickExt=0;
    this.staggerDir=att.dir;this.dir=-this.staggerDir;
    this.staggerDur=rnd(.75,1.1);this.shoveWillFall=Math.random()<.42;
    this.state='push_stagger';this.st=0;this.vx=this.staggerDir*145;this.vy=0;this.y=0;this.invT=0;this.lz=null;
    if(this.fx&&this.rig)this.fx.puff(this.rig.sh.x,this.rig.sh.y+25,3,.7);
    Snd.thud();return true;
  }
  canStagger(att){
    return !!(att&&this.rig&&this.y<5&&this.hp>=0&&
      ['idle','attack','hit','guard_recoil','overextend'].includes(this.state)&&
      (att.x-this.x)*this.dir>8);
  }
  startStagger(){
    this.state='stagger_fall';this.st=0;this.staggerDir=-this.dir;
    this.staggerDur=rnd(.72,1.02);this.vx=this.staggerDir*110;
    this.vy=0;this.y=0;this.boxing=false;this.invT=0;this.lz=null;
  }
  startLampJump(lamp){
    if(this.state!=='idle'||this.hp<=0||this.y>5||!lamp||!Game.lamps.includes(lamp)||
       this.onBridge||lamp.detached||!lamp.canGrab()||Math.abs(lamp.x-this.x)>42)return false;
    this.lampGoal=lamp;
    this.state='lamp_jump';this.st=0;this.y=.5;this.vy=840;
    this.vx=clamp((lamp.x-this.x)*3,-120,120);this.hlBrake=0;this.invT=0;
    Snd.hop();if(this.fx)this.fx.landing(this.x,this.gy,.45);
    return true;
  }
  grabLamp(lamp){
    if(this.state!=='lamp_jump'||!lamp||lamp.detached||!lamp.canGrab()||!Game.lamps.includes(lamp))return false;
    const grip=lamp.grip();
    const sh=this.cur?computeRig(this.cur,this.x,this.gy,this.y+(this.hoverY||0),this.dir,false).sh:
      this.rig?this.rig.sh:{x:this.x,y:grip.y+52};
    // Keep the shoulder where it was at the instant of contact, then ease into
    // the hang. A small impulse starts a damped physical swing, not a looped pose.
    this.lampGrabGap=clamp(sh.y-grip.y,15,63);
    this.lampGrabSide=clamp(sh.x-grip.x,-26,26);
    lamp.riders.add(this);this.lampClimb=0;
    lamp.omega+=clamp(this.vx/lamp.length*.22,-.04,.04)+this.dir*rnd(.018,.03);
    this.lampRef=lamp;this.lampGoal=null;this.state='lamp_hang';this.st=0;
    this.vx=0;this.vy=0;this.lampHangStamp++;
    const pursuit=Game.fighters.some(o=>o!==this&&o.hp>0&&(o.onBridge||(o.state==='lamp_hang'&&o.lampClimb>120)));
    this.lampAction=pursuit||Math.random()<.42?'climb':'pullup';
    this.lampStamina=this.lampAction==='climb'?rnd(7.8,9):rnd(2.8,3.5);
    this.lampDiveAt=rnd(1.65,2.25);this.tackleCheck=rnd(.8,1.5);
    // Detachment is much rarer than a jump, and the global map cap is enforced by Game.
    this.lampBreakAt=Math.random()<.02?rnd(.8,2.4):Infinity;
    return true;
  }
  clearLamp(){
    const lamp=this.lampRef;
    if(lamp)lamp.riders.delete(this);
    this.lampRef=null;this.lampGoal=null;
  }
  releaseLamp(reason='tired',source=null){
    const lamp=this.lampRef;
    const swing=lamp?clamp(lamp.omega*lamp.length*Math.cos(lamp.theta),-220,220):0;
    if(source&&reason!=='pull')this.dir=source.x>=this.x?1:-1;
    if(lamp&&reason==='pull'&&source)lamp.omega+=source.dir*.3;
    if(lamp&&(reason==='jump'||reason==='dive'))lamp.omega-=this.dir*.06;
    this.clearLamp();this.st=0;
    if(reason==='pull'||reason==='break'){
      if(source)this.fallDamage={amount:3,source};
      this.toRagdoll(source?source.dir*100:swing,-170);return;
    }
    if(reason==='dive'&&source&&source.hp>0){
      this.state='air';this.dive=true;this.diveT=.12;this.diveHit=false;this.kickExt=0;
      this.vx=this.dir*430+swing*.25;this.vy=-80;Snd.whoosh();return;
    }
    this.state='air';this.dive=false;
    if(reason==='jump'){
      this.vx=this.dir*230+swing*.55;this.vy=230;Snd.hop();
    }else{this.vx=swing*.65;this.vy=-60;}
  }
  updateLampHang(dt,opponent){
    const lamp=this.lampRef;
    if(!lamp||!Game.lamps.includes(lamp)||lamp.detached||!lamp.riders.has(this)){this.releaseLamp();return;}
    if(this.st>=this.lampBreakAt){this.lampBreakAt=Infinity;if(Game.detachLamp(lamp))return;}
    this.lampStamina-=dt;
    if(this.lampStamina<=0){this.releaseLamp();return;}
    if(this.lampAction==='climb'){
      // More than one person can follow the same rope, but a following rider
      // cannot pass through the one above them.
      let limit=lamp.length-32;
      for(const rider of lamp.riders)if(rider!==this&&rider.lampClimb>this.lampClimb)
        limit=Math.min(limit,Math.max(this.lampClimb,rider.lampClimb-90));
      this.lampClimb=Math.min(limit,this.lampClimb+205*dt);
    }
    const settle=ease(clamp(this.st/.22,0,1));
    const lift=this.lampAction==='pullup'?
      ease(clamp((this.st-.2)/.5,0,1))*(1-ease(clamp((this.st-1)/.5,0,1))):0;
    const gap=lerp(this.lampGrabGap,53,settle)-18*lift;
    const side=lerp(this.lampGrabSide,-this.dir*27,settle);
    const grip=lamp.point(30+this.lampClimb),pose=this.targetPose();
    const base=computeRig(pose,0,this.gy,0,this.dir,false);
    this.x=clamp(grip.x+side-base.sh.x,this.minX,this.maxX);
    this.y=Math.max(.5,base.sh.y-(grip.y+gap));this.vx=0;this.vy=0;
    if(this.lampAction==='climb'&&this.gy-this.y<=BRIDGE_Y){
      // Switch reference floors while keeping the feet at the same world y.
      this.clearLamp();this.gy=BRIDGE_Y;this.y=0;this.vy=0;this.onBridge=true;
      this.state='idle';this.st=0;this.cur=null;this.fallPeak=0;return;
    }
    if(this.lampAction==='climb'&&opponent&&opponent.hp>0&&this.y>350){
      this.tackleCheck-=dt;
      if(this.tackleCheck<=0){
        this.tackleCheck=rnd(1.2,2);
        if(Math.random()<.22&&this.startHighTackle(opponent))return;
      }
    }
    if((this.lampAction==='pullup'||this.lampAction==='dive')&&this.st>=this.lampDiveAt){
      const target=opponent&&opponent.hp>0?opponent:null;
      const dive=target&&Math.abs(target.x-this.x)<300&&
        (this.lampAction==='dive'||Math.random()<.35);
      this.releaseLamp(dive?'dive':'jump',target);
    }
  }
  leaveBridge(){
    if(!this.onBridge)return;
    const old=this.gy;this.gy=Game.gy;this.y+=Game.gy-old;
    this.onBridge=false;this.fallPeak=Math.max(this.fallPeak,this.y);
  }
  prepareHighFall(source=null){
    if(this.gy!==Game.gy||!this.rig)return;
    const height=Math.max(this.fallPeak,Game.gy-Math.max(this.rig.aN.y,this.rig.aF.y));
    if(height<350)return;
    const amount=clamp((height-220)*.13,35,120);
    if(!this.fallDamage||this.fallDamage.amount<amount)
      this.fallDamage={amount,source:source||this.fallDamage?.source||{dir:this.dir},severe:true};
  }
  startHighTackle(v){
    if(this.hp<=0||!v||v.hp<=0||!v.rig||!this.rig||
       !(this.onBridge||(this.state==='lamp_hang'&&this.y>350)))return false;
    const dx=v.x-this.x,dy=v.rig.pel.y-this.rig.pel.y;
    if(Math.abs(dx)<45||Math.abs(dx)>220||Math.abs(dy)>125)return false;
    // Never jump toward someone hundreds of pixels below the bridge.
    this.dir=dx>0?1:-1;this.bridgeTarget=v;
    if(this.onBridge)this.leaveBridge();else this.clearLamp();
    this.state='bridge_leap';this.st=0;this.vx=this.dir*360;this.vy=180;this.dive=false;
    this.fallPeak=Math.max(this.fallPeak,this.y);Snd.whoosh();return true;
  }
  startLampPull(v){
    if(this.state!=='idle'||this.hp<=0||this.y>5||!v||!Game.fighters.includes(v)||
       v.state!=='lamp_hang'||!v.lampRef||!v.rig||Math.abs(v.x-this.x)>80||
       this.gy-Math.max(v.rig.aN.y,v.rig.aF.y)>210)return false;
    this.dir=v.x>=this.x?1:-1;this.state='lamp_pull';this.st=0;this.vx=0;
    this.lampPullTarget=v;this.lampPullDone=false;Snd.whoosh();return true;
  }
  startOverextend(dodger){
    this.state='overextend';this.st=0;this.vx=this.dir*210;this.boxing=false;
    this.overextendFor=dodger;this.overextendStamp++;this.dodgedBy=null;this.invT=0;
  }
  startFlank(v){
    if(this.state!=='idle'||this.hp<=0||this.chokeCD>0||!v||v.hp<=0||
      v.state!=='overextend'||v.overextendFor!==this||v.chokedBy||Math.abs(v.x-this.x)>180)return false;
    const behind=v.x-v.dir*CHOKE_OFFSET;
    if(behind<this.minX+10||behind>this.maxX-10)return false;
    this.flankTarget=v;this.flankFrom=this.x;this.state='flank';this.st=0;this.vx=0;
    this.dir=v.x>=this.x?1:-1;this.chokeCD=1;this.hlBrake=0;return true;
  }
  startChoke(v){
    if(this.state!=='flank'||this.flankTarget!==v||!v||v.hp<=0||this.hp<=0||
      !Game.fighters.includes(v)||!Game.fighters.includes(this)||
      v.state!=='overextend'||v.overextendFor!==this||v.chokedBy||this.chokeTarget)return false;
    this.dir=v.dir;this.x=clamp(v.x-this.dir*CHOKE_OFFSET,this.minX,this.maxX);
    this.state='choke';this.st=0;this.vx=0;this.vy=0;this.y=0;this.hoverY=0;this.boxing=false;
    // Keep the old timer during the hold; double its remaining value on release.
    this.flankTarget=null;this.chokeTarget=v;this.chokeCD=rnd(5,7);this.chokeCooldownPending=true;
    this.chokeDuration=rnd(2.2,2.9);
    // The counter mistake is private state, not a visual tell.
    this.chokeCounterAt=Math.random()<.33?rnd(.55,1.05):Infinity;
    this.chokeReleaseAt=Math.random()<.12?rnd(.8,1.55):Infinity;
    v.chokedBy=this;v.overextendFor=null;v.state='choked';v.st=0;v.vx=0;v.vy=0;v.y=0;v.hoverY=0;
    v.boxing=false;v.invT=0;v.lz=null;v.dive=false;
    Snd.whoosh();return true;
  }
  finishChokeCooldown(){
    if(this.chokeCooldownPending){this.chokeCD*=2;this.chokeCooldownPending=false;}
  }
  releaseChoke(stagger=false){
    const v=this.chokeTarget,linked=!!v&&v.chokedBy===this;this.chokeTarget=null;
    this.finishChokeCooldown();
    if(linked)v.chokedBy=null;
    if(this.state==='choke'||this.state==='counter_carried'){
      this.state='idle';this.st=0;this.vx=0;this.comboT=9;
    }
    if(linked&&(v.state==='choked'||v.state==='counter_throw')){
      v.state=stagger?'hit':'idle';v.st=0;v.vx=0;v.comboT=9;v.counterBase=null;
      if(stagger){v.stunT=.28;v.hitZone='body';}
    }
  }
  breakChoke(){
    if(this.chokeTarget)this.releaseChoke();
    if(this.chokedBy)this.chokedBy.releaseChoke();
    this.flankTarget=null;
  }
  beginCounter(){
    const v=this.chokeTarget;
    if(!v||v.chokedBy!==this||!this.rig)return;
    v.counterBase=cloneRig(this.rig);v.counterReleased=false;v.state='counter_throw';v.st=0;
    this.state='counter_carried';this.st=0;this.vx=0;Snd.whoosh();
  }
  releaseCounter(){
    const carried=this.chokedBy;if(!carried||!this.counterBase)return;
    carried.rig=counterCarryRig(this.counterBase,this,1);
    carried.chokeTarget=null;carried.finishChokeCooldown();this.chokedBy=null;this.counterReleased=true;
    carried.fallDamage={amount:8,source:this};
    carried.toRagdoll(this.dir*360,330);
    if(this.fx)this.fx.puff(this.rig.sh.x,this.rig.sh.y,4,.8);
    Snd.whoosh();
  }
  startJump(){this.vy=770;this.y=.5;this.state='air';this.st=0;this.hlBrake=0;this.fx&&this.fx.landing(this.x,this.gy,.5);}
  startBodyJump(){
    if(this.state!=='run'||this.hp<=0||this.y>5||Math.abs(this.vx)<260)return false;
    // A normal running jump over a body: no flying kick or forced tumble.
    this.state='air';this.st=0;this.y=.5;this.vy=770;this.bodyJump=true;this.dive=false;this.hlBrake=0;
    Snd.hop();if(this.fx)this.fx.landing(this.x,this.gy,.45);return true;
  }
  startDash(w){
    this.state='dash';this.st=0;this.dashF=w>0;this.dashW=w*this.dir;this.dashT=w>0?.24:.27;this.dashCD=.6;this.dashDust=0;this.hlBrake=0;
    if(w<0)this.invT=.22;Snd.whoosh();
  }
  // Dodge: remember which incoming attack was evaded, but only a missed swing
  // can create the brief overextension opening.
  startHop(){
    for(const e of Game.fighters){
      if(e===this||e.hp<=0||e.state!=='attack'||!e.atk||e.atk.air||e.atk.laser||e.st>e.atk.he)continue;
      const dx=(this.x-e.x)*e.dir;
      if(dx>=-10&&dx<=e.atk.reach+100)e.dodgedBy=this;
    }
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
    const interrupted=o.state==='choke'||o.state==='choked'||o.state==='flank'||o.state==='counter_throw'||o.state==='counter_carried';
    if(interrupted){o.breakChoke();o.state='hit';o.st=0;o.stunT=.35;o.hitZone='body';o.vx=this.dir*220;}
    else if(o.state==='lamp_jump'||o.state==='lamp_hang')o.toRagdoll(this.dir*150,-100);
    else if(o.state==='idle')o.vx=this.dir*220;
    this.fx&&this.fx.puff(this.x+this.dir*20,this.gy-20,3,1.2);
    this.toRagdoll(this.vx*.85,260);
  }
  queueBloodFootfall(foot,power,landed=false){
    if(!this.fx||power<.65)return;
    const old=this.bloodFootfall;
    if(!old||(landed&&!old.landed)||(!old.landed&&power>old.power))
      this.bloodFootfall={foot,feet:foot?[foot]:['N','F'],power,landed,remaining:.14};
  }
  resolveBloodFootfall(dt=0){
    const contact=this.bloodFootfall;
    if(!contact)return;
    if(this.gy!==Game.gy||!this.fx||!this.rig||this.hp<=0||this.y>2||(!contact.landed&&this.hoverY>5)||this.state==='ragdoll'){
      this.bloodFootfall=null;return;
    }
    const hits=[],waiting=[];
    for(const foot of contact.feet){
      const ankle=this.rig['a'+foot],dir=this.rig['fd'+foot];
      if(!ankle||!dir)continue;
      // The blended rig can reach the ground a few frames after the gait
      // phase crosses zero, especially at high frame rates. Wait briefly for
      // the actual shoe instead of splashing under an airborne foot.
      if(ankle.y<this.gy-22){waiting.push(foot);continue;}
      const x=ankle.x+dir.x*7;
      const blood=this.fx.bloodField.contactAtFoot(x,this.gy);
      if(!blood)continue;
      // A sparse fleck leaves a faint trace; repeating a step on that one
      // fleck cannot saturate the boot as if it were a deep pool.
      this.footBlood[foot]=Math.max(this.footBlood[foot],blood.intensity*3);
      if(blood.splashable)hits.push(x);
    }
    contact.remaining-=dt;
    if(waiting.length&&contact.remaining>0)contact.feet=waiting;
    else this.bloodFootfall=null;
    if(hits.length&&this.footSplashCooldown<=0){
      this.fx.splash(hits.reduce((a,b)=>a+b,0)/hits.length,this.gy+3,this.dir,contact.power);
      this.footSplashCooldown=.22;
    }
  }
  resolveBloodJointContacts(dt){
    const field=this.fx?.bloodField,R=this.rig;
    if(this.gy!==Game.gy||!field||!field.groups.size||!R||!this.visible||(this.state==='spawn'&&this.sp<2))return;
    for(const joint of ['kN','kF','eN','eF']){
      if(this.jointBlood[joint]>=3)continue;
      // Once severed, only a real detached joint can touch the pool; the old
      // invisible parent ragdoll must not pick up blood at a phantom location.
      const points=this.gorePieces?
        this.gorePieces.flatMap(piece=>piece.nodes.filter(n=>n.joint===joint)):[R[joint]];
      for(const p of points){
        if(!p||p.y+(p.r??JR[joint])<this.gy-1.5)continue;
        const blood=field.contactAtFoot(p.x,this.gy);
        if(blood){
          const target=blood.intensity*3;
          this.jointBlood[joint]=Math.max(this.jointBlood[joint],Math.min(target,this.jointBlood[joint]+dt*(1+blood.intensity*3)));
        }
      }
    }
    if(this.gorePieces)for(const piece of this.gorePieces)for(const foot of piece.feet){
      if(foot.ankle.y+foot.ankle.r<this.gy-1.5)continue;
      const blood=field.contactAtFoot(foot.ankle.x,this.gy);
      if(blood)this.footBlood[foot.side]=Math.max(this.footBlood[foot.side],blood.intensity*3);
    }
  }
  onLand(impact){
    const pvx=this.vx,fallHeight=this.fallPeak;this.fallPeak=0;
    this.landT=.12;this.vx*=.35;
    if(this.gy===Game.gy&&fallHeight>=350&&this.hp>0){
      const amount=clamp((fallHeight-220)*.13,35,120);
      this.fallDamage={amount,source:{dir:this.dir},severe:true};
      this.toRagdoll(pvx*.4,0,true);this.applyFallDamage(this.rag?.p.pel);return;
    }
    if(impact>=450&&this.fx)this.queueBloodFootfall(null,clamp(impact/900,.65,1),true);
    if(impact>250&&this.fx)this.fx.landing(this.x,this.gy,clamp(impact/1100,.25,.8));
    if(impact>500)Snd.thud();
    if(this.dive){ // missed: tumbles along with the leftover momentum
      this.dive=false;this.fastGetup=true;Snd.thud();
      this.toRagdoll(pvx*.9,200);return;
    }
    if(this.state==='lamp_jump')this.clearLamp();
    this.bodyJump=false;
    if(this.state==='air'||this.state==='lamp_jump'||this.state==='dash'||this.state==='hop'||(this.state==='attack'&&this.atk.air)){this.state='idle';this.st=0;this.comboT=9;}
  }
  tryHit(a,opponents){
    let hitAny=false;
    for(const o of opponents){
      if(!o||o===this||!o.canBeHit())continue;
      const dx=(o.x-this.x)*this.dir;if(dx<-20||dx>a.reach+14)continue;
      const height=this.y+(Game.gy-this.gy),otherHeight=o.y+(Game.gy-o.gy);
      const lo=height+a.y[0],hi=height+a.y[1],ov=Math.min(hi,otherHeight+200)-Math.max(lo,otherHeight+55);if(ov<20)continue;
      // A committed low squat ducks bare-handed strikes, not knees, bats,
      // lasers or the flying kick. The missed swing can still overextend.
      if(o.crouchActive&&o.crouchTime>=.07&&a.fist&&!a.bat){this.dodgedBy=o;continue;}
      o.takeHit(this,a);
      this.lastHitTarget=o;hitAny=true;
      break;
    }
    return hitAny;
  }
  takeHit(att,a,point){
    // A guarded ordinary punch is absorbed in place. A blow that would launch
    // or knock out the defender breaks the guard and forces a short back-hop,
    // but cannot itself put the defender into a ragdoll or below one HP.
    if(this.state==='guard'&&(att.x-this.x)*this.dir>=-12){
      const p=this.rig?this.rig.head:{x:this.x,y:this.gy-160};
      if(this.fx)this.fx.puff(p.x+this.dir*10,p.y+7,4,.75);
      Snd.thud();Game.shake=Math.max(Game.shake,2);Game.hs=Math.max(Game.hs,.025);
      this.flinchGuard();
      if(a.launch||a.dmg>=this.hp){
        this.hp-=Math.min(a.dmg*.2,Math.max(0,this.hp-1));
        this.state='guard_recoil';this.st=0;this.vx=-this.dir*180;this.y=.5;this.vy=230;
      }
      return;
    }
    const mayStagger=this.canStagger(att),lampImpact=this.state==='lamp_jump'||this.state==='lamp_hang';
    const wasAirborne=this.y>5||this.dive||this.bodyJump||this.state==='air'||this.state==='hop'||
      (this.state==='attack'&&this.atk&&this.atk.air);
    const wasRunning=this.state==='run'&&!wasAirborne;
    const wasStaggering=this.state==='push_stagger'||this.state==='stagger_fall';
    this.lampPullTarget=null;this.shoveTarget=null;this.duckTarget=null;this.bodyJump=false;
    this.breakChoke();this.boxing=false;
    this.hp=Math.max(0,this.hp-a.dmg);
    const impact=point&&typeof point.x==='number'?point:null;
    const px=impact?impact.x:this.x-att.dir*10;
    const py=impact?impact.y:this.gy-this.y-(a.zone==='head'?166:a.zone==='torso'?122:38);
    Game.hitFX(att,this,a,px,py);
    injure(this,a.zone,a.pw);
    if(!this.bleed&&a.pw>=.95&&Math.random()<.035)this.startBleeding(px,py,att);
    att.handDamage(a,this);
    if(this.hp<=0){
      const headFinish=att.skin==='negan'&&a.bat&&!a.guitar&&a.zone==='head';
      if(headFinish)Game.explodeHead(this,att,px,py);
      Game.ko(this,att,Object.assign({},a,{noStagger:headFinish||a.noStagger||!mayStagger}));return;
    }
    if(this.state==='ragdoll'&&this.rag){
      this.rag.wake();for(const k of RK)this.rag.p[k].px-=att.dir*.65;
      return;
    }
    if(lampImpact){this.toRagdoll(att.dir*(a.lvx||170),a.lvy||150);return;}
    if(wasRunning){
      // A grounded runner keeps their footing and loses momentum over a few
      // steps, even on a launching hit. Airborne runners still fall normally.
      this.runStopFrom=this.runPose();this.state='run_hit_stop';this.st=0;
      this.stunT=Math.max(.35,a.stun||.35);this.hitZone=a.zone==='head'?'head':'body';
      this.vx=clamp(this.vx,-RUN_SPD,RUN_SPD);this.vy=0;this.y=0;this.invT=0;
      return;
    }
    // A follow-up hit during a backward stumble always knocks them down.
    if(wasStaggering){this.toRagdoll(this.staggerDir*130,120);return;}
    if(!a.noStagger&&mayStagger&&(a.launch||a.pw>=.9)&&Math.random()<STAGGER_KNOCKDOWN_CHANCE){
      this.startStagger();return;
    }
    if(this.dive){
      // A flying tackle is airborne and still falls with its momentum.
      const iv=clamp(this.vx*.9,-640,640);this.dive=false;
      this.toRagdoll(iv+att.dir*40,300);
    }
    else if(a.launch||wasAirborne){this.toRagdoll(att.dir*(a.lvx||200),a.lvy||420);}
    else{
      this.state='hit';this.st=0;this.stunT=a.stun;this.hitZone=a.zone==='head'?'head':'body';this.vx=att.dir*a.kb;this.invT=0;
      if(a.pull)this.x=clamp(att.x+att.dir*a.pull,this.minX,this.maxX);
    }
  }
  takeDuckHit(duck,damage,dir,speed){
    if(this.hp<=0)return;
    const wasAirborne=this.y>6||this.state==='lamp_hang'||this.state==='bridge_leap';
    const wasRagdoll=this.state==='ragdoll'&&this.rag;
    // One independent 50/50 decision per damaging collision, not every frame
    // while the duck overlaps a body.
    const willFall=Math.random()<.5;
    this.hp=Math.max(0,this.hp-damage);this.duckTarget=null;
    this.breakChoke();this.boxing=false;this.shoveTarget=null;this.lampPullTarget=null;
    if(this.fx)this.fx.puff(duck.x,duck.y,3,.45);
    Snd.duck();Game.shake=Math.max(Game.shake,2);Game.hs=Math.max(Game.hs,.015);
    injure(this,'torso',.3);
    const source={dir,x:duck.x-dir*25,skin:'tubtrooper'};
    if(this.hp<=0){Game.ko(this,source,{pw:.35,noStagger:true,lvx:160,lvy:220});return;}
    if(wasRagdoll){
      this.rag.wake();
      for(const k of RK)this.rag.p[k].px-=dir*clamp(speed*.12,20,95)*HSTEP;
    }else if(willFall||wasAirborne){
      this.toRagdoll(dir*clamp(speed*.25,100,220),wasAirborne?0:150);
    }else{
      this.clearLamp();this.state='push_stagger';this.st=0;this.staggerDir=dir;
      this.staggerDur=.55;this.shoveWillFall=false;this.vx=dir*125;this.vy=0;this.y=0;this.invT=0;
    }
  }
  handDamage(a,vic){
    if(this.skin==='chester'&&a.guitar){
      // Every successful hit bends the neck briefly and accumulates visible,
      // capped damage. The remaining guitar stays held and usable.
      this.guitarDamage=Math.min(1,this.guitarDamage+.16+.045*(a.pw||0));
      this.guitarFlexVel=clamp(this.guitarFlexVel+2.8,-4,4);
    }
  }
  toRagdoll(vx,vy,gentle=false){
    this.prepareHighFall();
    this.bridgeTarget=null;this.clearLamp();this.lampPullTarget=null;this.shoveTarget=null;this.duckTarget=null;
    this.breakChoke();this.boxing=false;
    if(!this.rig)return;
    const high=!!this.fallDamage?.severe;
    const inheritedVy=high?Math.min(vy,this.vy):vy;
    this.rag=new Ragdoll(this.rig,this);this.rag.highFall=high;
    if(!gentle)this.rag.launch(vx,inheritedVy,high);
    this.state='ragdoll';this.st=0;this.y=0;this.vx=0;this.vy=0;this.invT=0;this.dive=false;this.bodyJump=false;this.lz=null;this.fallReactT=0;
    this.hoverY=0;this.hlBrake=0;this.hlBrakeFrom=null;
    if(this.fx&&this.rig.pel.y>this.gy-100)this.fx.landing(this.x,this.gy,.6);
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
  applyFallDamage(point){
    const hit=this.fallDamage;if(!hit||this.hp<=0)return;
    this.fallDamage=null;this.fallPeak=0;this.hp=Math.max(0,this.hp-hit.amount);
    injure(this,'torso',.7);
    if(hit.severe&&!this.bleed&&Math.random()<.28){
      const p=point||this.rag.p.pel;this.startBleeding(p.x,p.y,hit.source);
    }
    if(this.fx)this.fx.impact(this.rag.p.pel.x,this.gy-12,hit.source.dir,.5);
    if(this.hp<=0)Game.ko(this,hit.source,{pw:.8,preserveRagdoll:true});
  }
  startGetup(){
    const R=this.rag.toRig(this);this.blendFrom=R;
    this.x=clamp(this.rag.p.pel.x,this.minX,this.maxX);this.rag=null;this.state='getup';this.st=0;this.blend=.3;this.cur=null;
    this.hoverY=0;this.hlLiftFx=false;this.fallPeak=0;
  }
  /* ---------------- Homelander's eye laser ---------------- */
  laserEye(){const h=this.rig.head;return {x:h.x+this.dir*9,y:h.y-5};}
  addBurn(x,y){
    const mark=locateSurface(this.rig,x,y);if(!mark)return null;
    this.burns.push(Object.assign(mark,{life:3.4,max:3.4,sz:Math.random()}));
    if(this.burns.length>20)this.burns.shift();
    return mark;
  }
  addBloodStain(x,y){
    const mark=locateSurface(this.rig,x,y);if(!mark)return;
    this.bloodStains.push(Object.assign(mark,{kind:'blood',age:0,sz:Math.random()}));
    if(this.bloodStains.length>36)this.bloodStains.shift();
  }
  startBleeding(x,y,source){
    if(this.bleed||!this.rig)return false;
    const mark=locateSurface(this.rig,x,y);if(!mark)return false;
    this.bleed={mark,source:source||{dir:-this.dir},age:0,flowTime:0,lost:0,dripT:.65,
      phase:rnd(TAU),arm:(mark.seg==='uN'||mark.seg==='fN')?'F':'N',
      pressing:false,pressT:0,decision:rnd(.8,1.7),deathTime:0,stopped:false};
    return true;
  }
  startPressure(){
    const b=this.bleed,p=b&&surfacePoint(this.rig,b.mark);
    if(!b||b.stopped||b.pressing||this.hp<=0||this.state!=='idle'||!p||
       Math.hypot(p.x-this.rig.sh.x,p.y-this.rig.sh.y)>63)return false;
    b.pressing=true;b.pressT=rnd(1.8,3.5);return true;
  }
  updateBleeding(dt){
    const b=this.bleed;if(!b||b.stopped)return;
    b.age+=dt;b.decision-=dt;
    if(b.pressing){
      b.pressT-=dt;
      if(this.hp<=0||b.pressT<=0||!['idle','run','attack','run_hit_stop'].includes(this.state)){
        b.pressing=false;b.decision=rnd(2.2,4);
      }
    }
    if(this.hp<=0){
      b.deathTime+=dt;
      if(b.deathTime>=BLEED_AFTER_DEATH){b.stopped=true;return;}
    }
    if(b.pressing)return;
    b.flowTime+=dt;b.dripT-=dt;
    if(this.hp>0){
      const lost=Math.min(this.hp,BLEED_DPS*dt);this.hp-=lost;b.lost+=lost;
      if(this.hp<=0)Game.ko(this,b.source,{bleedOut:true});
    }
    if(b.flowTime>.3&&b.dripT<=0&&this.fx){
      b.dripT=rnd(.55,.9);
      const p=this.gorePieces?goreSurfacePoint(this,b.mark):surfacePoint(this.rig,b.mark);
      if(p)this.fx.drip(p.x,Math.min(this.gy-3,p.y+clamp((b.flowTime-.3)*10,0,30)));
    }
  }
  takeLaser(att,pt,first){
    const mark=this.addBurn(pt.x,pt.y);
    if(this.state==='spawn'||this.invT>0)return;
    addLaserRip(this,mark);
    if(this.hp<=0)return;
    this.lampPullTarget=null;this.shoveTarget=null;
    this.breakChoke();this.boxing=false;
    this.hp=Math.max(0,this.hp-(first?3.5:1.6));
    if(this.fx&&first)this.fx.blood(pt.x,pt.y,att.dir,6,.5);
    if(this.hp<=0){
      const eye=att.rig?.head||{x:att.x,y:pt.y};
      const dx=pt.x-eye.x,dy=pt.y-eye.y;
      this.laserSlice={progress:0,duration:.24,slope:clamp(dy/(Math.abs(dx)<20?(dx<0?-20:20):dx),-.55,.55),dir:att.dir||1};
      Game.ko(this,att,{lvx:300,lvy:380,pw:.9,noStagger:true,preserveRagdoll:true});return;
    }
    if(first){
      Snd.hit(.8);Game.shake=Math.max(Game.shake,5);
      const zone=!mark||mark.seg==='torso'?'torso':mark.seg==='head'?'head':'limb';
      injure(this,zone,.6,mark);
      if(this.state!=='ragdoll'&&this.state!=='getup')this.toRagdoll(att.dir*300,400);
    }else if(this.state==='ragdoll'&&this.rag){
      this.rag.wake();for(const k of RK){this.rag.p[k].px-=att.dir*.35;}
    }
  }
  updateLaser(dt,all,target){
    const a=this.atk,st=this.st;
    if(!this.rig)return;
    const eye=this.laserEye();
    if(st<a.chargeT){
      if(!this.lzSnd){this.lzSnd=true;Snd.laserCharge();}
      if(this.fx&&this.fx.bloodField.random()<.6){
        const field=this.fx.bloodField;
        this.fx.laserSpark(eye.x+field.range(-12,12),eye.y+field.range(-12,12),1,'eye');
      }
      return;
    }
    if(st>a.fireEnd){this.lz=null;return;}
    let desired=0;
    if(target&&target.rig){
      const T=target.rig,ch={x:lerp(T.neck.x,T.pel.x,.35),y:lerp(T.neck.y,T.pel.y,.35)};
      desired=clamp(Math.atan2(ch.y-eye.y,Math.max(8,(ch.x-eye.x)*this.dir)),-1,1.2);
    }
    if(!this.lz){
      this.lz={rel:desired,tick:0,age:0,hits:new Set(),sx:eye.x,sy:eye.y,ex:eye.x,ey:eye.y,surf:'none',f:null,on:true};
      Snd.laser();Game.shake=Math.max(Game.shake,3);
    }
    const lz=this.lz;lz.age+=dt;
    const m=2.1*dt;lz.rel+=clamp(desired-lz.rel,-m,m);
    const ux=Math.cos(lz.rel)*this.dir,uy=Math.sin(lz.rel);
    const res=Game.castRay(eye.x,eye.y,ux,uy,this);
    lz.sx=eye.x;lz.sy=eye.y;lz.ex=res.x;lz.ey=res.y;lz.surf=res.surf;lz.f=res.f;
    lz.tick-=dt;
    if(lz.tick<=0){
      lz.tick=.07;
      if(res.f){const first=!lz.hits.has(res.f.id);lz.hits.add(res.f.id);res.f.takeLaser(this,res,first);}
      else if(this.fx&&res.surf!=='none')this.fx.burnSurface(res.x,res.y,res.surf);
      if(this.fx&&res.surf!=='none'){
        const n=3+Math.floor(this.fx.bloodField.random()*3);
        this.fx.laserSpark(res.x,res.y,n,res.surf);
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
    if(this.skin==='chester'){this.guitarFlexVel+=(-38*this.guitarFlex-9*this.guitarFlexVel)*dt;this.guitarFlex=clamp(this.guitarFlex+this.guitarFlexVel*dt,-.25,.32);}
    const isHL=this.skin==='homelander';
    this.peaceful=this.hp>0&&!targetOpp;
    this.dashCD=Math.max(0,this.dashCD-dt);
    this.boxCD=Math.max(0,this.boxCD-dt);this.guardCD=Math.max(0,this.guardCD-dt);this.shoveCD=Math.max(0,this.shoveCD-dt);
    if(this.skin==='tubtrooper')this.duckCD=Math.max(0,this.duckCD-dt);
    this.chokeCD=Math.max(0,this.chokeCD-dt);
    this.guardFlinch=Math.max(0,this.guardFlinch-dt);
    this.footSplashCooldown=Math.max(0,this.footSplashCooldown-dt);
    // Homelander first settles out of his hover; the lowered pose and its
    // dodge window only begin once his feet have actually reached the floor.
    const wantsCrouch=this.state==='idle'&&c.crouch&&this.y<=1;
    this.crouchActive=!!(wantsCrouch&&(!isHL||this.hoverY<=.7));
    this.crouchTime=this.crouchActive?Math.min(1,this.crouchTime+dt):0;
    if(this.invT>0)this.invT-=dt;if(this.landT>0)this.landT-=dt;if(this.blend>0)this.blend-=dt;
    if(this.state!=='attack')this.comboT+=dt;
    if(this.burns.length){for(const b of this.burns)b.life-=dt;this.burns=this.burns.filter(b=>b.life>0);}
    for(const b of this.bloodStains)b.age+=dt;
    this.updateBleeding(dt);
    if(this.lz&&!(this.state==='attack'&&this.atk&&this.atk.laser))this.lz=null;
    if(this.state!=='ragdoll'&&this.state!=='spawn'&&this.state!=='lamp_hang'&&(this.y>0||this.vy>0)){
      if(this.gy===Game.gy)this.fallPeak=Math.max(this.fallPeak,this.y);
      this.vy-=2200*dt;this.y+=this.vy*dt;
      if(this.y<=0){const im=-this.vy;this.y=0;this.vy=0;this.onLand(im);}
    }
    // Dangerous uncontrolled drops make a living fighter lose their pose in
    // midair almost immediately. A committed high tackle gets a brief chance
    // to reach its target before the missed jump becomes an uncontrolled fall.
    const dangerousFall=this.hp>0&&this.gy===Game.gy&&this.y>350&&this.vy<-180&&
      ['air','bridge_leap'].includes(this.state)&&!this.bodyJump&&
      (this.state!=='bridge_leap'||this.st>.4);
    this.fallReactT=dangerousFall?this.fallReactT+dt:0;
    if(this.fallReactT>=.08){
      this.buildRig(0);this.toRagdoll(this.vx,this.vy);
    }
    switch(this.state){
     case 'spawn':{
      this.spT-=dt;
      if(this.sp===0){if(this.spT<=0){this.sp=1;this.visible=true;this.y=this.spawnY;this.vy=0;Snd.spawn();}}
      else if(this.sp===1){
        this.vy-=2600*dt;this.y+=this.vy*dt;
        if(this.fx&&Math.random()<.5&&this.rig)this.fx.spark(this.rig.pel.x+rnd(-20,20),this.rig.pel.y+rnd(-60,60),1,'120,200,255');
        if(this.y<=0){this.y=0;this.vy=0;this.sp=2;this.spT=.55;this.st=0;
          this.queueBloodFootfall(null,1,true);
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
      const toward=mv*this.dir,spd=mv?(this.crouchActive?70:(toward>0?235:185)):0;
      const tgtVx=mv*spd*this.speedMul();
      if(isHL&&this.hlBrake>0){
        this.hlBrake=Math.max(0,this.hlBrake-dt/.34);
        const brakeRate=lerp(9.5,14,1-this.hlBrake);
        this.vx+=(tgtVx-this.vx)*Math.min(1,dt*brakeRate);
      }else{
        this.vx+=(tgtVx-this.vx)*Math.min(1,dt*14);
      }
      if((!isHL||this.peaceful)&&Math.abs(this.vx)>8){
        this.walkPh+=(this.vx*this.dir>=0?1:-1)*Math.abs(this.vx)*dt*.08;
        const sg=Math.sin(this.walkPh)>0?1:-1;
        if(sg!==this.lastSign){
          this.lastSign=sg;
          if(Math.abs(this.vx)>120&&this.fx)this.fx.step(this.x-this.dir*10,this.gy,this.dir*(this.vx*this.dir>=0?1:-1));
          if(Math.abs(this.vx)>=220&&this.y<=2)this.queueBloodFootfall(sg>0?'N':'F',.68);
        }
      }
      if(c.hop){this.startHop();}
      else if(c.jump){ if(mv&&this.dashCD<=0)this.startDash(toward>0?1:-1); else if(!mv)this.startJump(); }
      else if(c.laser&&isHL){this.startAttack(3);}
      else if(c.punch){
        const next=this.comboT<.6?this.comboStep:0;
        if(!this.startAttack(next)&&this.bleed&&this.bleed.pressing)
          this.startAttack(this.bleed.arm==='N'?1:0);
      }
      break;}
     case 'run':{
      if(!c.run||!c.mx){
        if(isHL&&!this.peaceful&&Math.abs(this.vx)>210){
          this.hlBrake=clamp(Math.abs(this.vx)/RUN_SPD,.35,1);
          this.hlBrakeDir=this.vx>=0?1:-1;
          this.hlBrakeFrom=this.runPose();
          if(this.hlBrake>.65)Snd.whoosh();
          if(this.fx)this.fx.dash(this.x+this.hlBrakeDir*12,this.gy,-this.hlBrakeDir);
        }
        this.state='idle';this.st=0;break;
      }
      this.dir=c.mx>0?1:-1;
      const tgt=this.dir*RUN_SPD*(this.hp<30?.9:1)*this.bloodStrength(),A=RUN_ACC*dt;
      this.vx+=clamp(tgt-this.vx,-A,A);
      const rs=clamp(Math.abs(this.vx)/RUN_SPD,0,1);
      if(isHL&&!this.peaceful){
        if(rs>.45&&this.fx){
          if(Math.random()<dt*13)this.fx.smoke(this.x-this.dir*26,this.gy-96+rnd(-14,14),-this.dir*rnd(115,190),rnd(-8,8),rnd(3,6),rnd(7,13),rnd(.14,.24),.24);
          if(Math.random()<dt*10)this.fx.dash(this.x-this.dir*8,this.gy,this.dir);
        }
      }else{
        this.walkPh+=(9+rs*13)*dt;
        const sg=Math.sin(this.walkPh)>0?1:-1;
        if(sg!==this.lastSign){
          this.lastSign=sg;
          if(rs>.25&&this.fx)this.fx.step(this.x-this.dir*10,this.gy,this.dir);
          if(rs>=.58&&this.y<=2)this.queueBloodFootfall(sg>0?'N':'F',clamp(rs,.65,1));
        }
      }
      if(c.jump){this.startDive();break;}
      for(const o of allFighters){
        if(o===this||Math.abs(o.gy-this.gy)>100)continue;
        const dx=(o.x-this.x)*this.dir;
        if(!o.gorePieces&&o.state==='ragdoll'&&o.rag?.grounded()&&dx>0&&dx<85){
          // Notice a prone body and brake instead of repeatedly falling over it.
          // Planned vaults jump earlier, before reaching this safety zone.
          this.vx*=Math.exp(-dt*8);continue;
        }
        if(o.hp<=0||o.y>40||o.state==='ragdoll'||o.state==='spawn')continue;
        if(o.state==='getup'&&o.st<1.35)continue; // still lying low
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
      if(this.bodyJump){
        this.vx*=Math.exp(-dt*.12);
        break;
      }
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
     case 'lamp_jump':{
      const lamp=this.lampGoal;
      if(!lamp||!Game.lamps.includes(lamp)||lamp.detached||!lamp.canGrab()){this.clearLamp();this.state='air';break;}
      this.vx+=(clamp((lamp.x-this.x)*2,-100,100)-this.vx)*Math.min(1,dt*4);
      if(this.rig){
        const grip=lamp.grip(),sh=this.rig.sh,dy=sh.y-grip.y;
        if(this.y>2&&dy>=15&&dy<=63&&Math.abs(sh.x-grip.x)<26)this.grabLamp(lamp);
      }
      break;}
     case 'bridge_leap':{
      const v=this.bridgeTarget;
      if(v&&allFighters.includes(v)&&v.hp>0&&v.rig&&
         Math.abs(v.x-this.x)<62&&Math.abs(v.rig.pel.y-(this.gy-this.y-88))<105){
        if(v.state==='lamp_hang')v.releaseLamp('pull',this);
        else{if(v.onBridge)v.leaveBridge();v.toRagdoll(this.dir*180,-80);}
        this.toRagdoll(this.dir*90,-80);Snd.thud();break;
      }
      if(this.st>1.3){this.bridgeTarget=null;this.state='air';this.st=0;}
      break;}
     case 'lamp_hang':{
      this.updateLampHang(dt,targetOpp);break;}
     case 'lamp_pull':{
      this.vx=0;
      const v=this.lampPullTarget;
      if(!this.lampPullDone&&(!v||!allFighters.includes(v)||v.hp<=0||v.state!=='lamp_hang'||Math.abs(v.x-this.x)>95)){
        this.lampPullTarget=null;this.state='idle';this.st=0;break;
      }
      if(!this.lampPullDone&&this.st>=.38){
        this.lampPullDone=true;this.lampPullTarget=null;v.releaseLamp('pull',this);
      }
      if(this.st>=LAMP_PULL_DUR){this.state='idle';this.st=0;this.lampPullTarget=null;}
      break;}
     case 'dash':{
      const k=1-this.st/this.dashT*.5;this.vx=this.dashW*(this.dashF?840:620)*k;
      this.dashDust-=dt;if(this.dashDust<=0&&this.fx){this.dashDust=.035;this.fx.dash(this.x,isHL?this.gy-22:this.gy,this.dashW);}
      if(this.st>=this.dashT){this.state='idle';this.st=0;this.vx*=.3;}
      break;}
     case 'duck_throw':{
      this.vx*=Math.exp(-dt*12);
      if(!this.duckReleased&&this.st>=DUCK_RELEASE){
        this.duckReleased=true;
        const hand=this.rig?.wF,target=this.duckTarget;
        if(hand&&target&&target.hp>0&&allFighters.includes(target)){
          launchDuck(Game,this,target,{x:hand.x+this.dir*7,y:hand.y-5});Snd.whoosh();
        }
      }
      if(this.st>=DUCK_THROW_DURATION){this.duckTarget=null;this.state='idle';this.st=0;this.comboT=9;}
      break;}
     case 'attack':{
      const a=this.atk;
      if(c.punch&&!a.air&&!this.boxing)this.queued=true;
      if(!this.lungeDone&&this.st>=a.lt){this.lungeDone=true;if(a.lunge)this.vx=this.dir*a.lunge;}
      if(!a.air||this.y<=0)this.vx*=Math.exp(-dt*9);
      if(a.laser){this.updateLaser(dt,allFighters,targetOpp);}
      if(!this.wh&&this.st>=a.hs-.03){this.wh=true;Snd.whoosh();}
      if(!this.hitDone&&this.st>=a.hs&&this.st<=a.he){if(this.tryHit(a,allFighters)){this.hitDone=true;this.connected=true;}}
      if(!this.hitDone&&this.st>a.he){
        this.hitDone=true;
        if(this.dodgedBy&&this.dodgedBy.hp>0&&!a.air&&!a.laser&&Math.random()<.5){this.startOverextend(this.dodgedBy);break;}
      }
      if(this.boxing){
        if(this.ak===0&&this.st>=a.dur+BOX_GAP){this.startAttack(1,true);break;}
        if(this.ak===1&&this.st>=a.dur){this.boxing=false;this.state='idle';this.st=0;this.comboT=9;this.lastAttackEnd=this.t;}
      }else{
        if(this.queued&&this.st>=a.cancel&&this.ak<3&&!a.air){
          if(this.startAttack(this.ak+1))break;
          this.queued=false;
        }
        if(this.st>=a.dur){this.comboStep=(this.ak<3&&!a.air)?this.ak+1:0;this.comboT=0;this.state=this.y>0?'air':'idle';this.st=0;this.lz=null;this.lastAttackEnd=this.t;}
      }
      break;}
     case 'shove':{
      this.vx=0;
      if(!this.shoveDone&&this.st>=SHOVE_IMPACT){
        this.shoveDone=true;
        const v=this.shoveTarget;this.shoveTarget=null;
        if(v&&allFighters.includes(v)&&v.hp>0){
          const dx=(v.x-this.x)*this.dir;
          if(dx>=0&&dx<=SHOVE_REACH&&v.y<=5)v.receiveShove(this);
        }
      }
      if(this.st>=SHOVE_DUR){this.state='idle';this.st=0;this.shoveTarget=null;this.comboT=9;}
      break;}
     case 'guard':{
      // Some fighters shuffle both ways without lowering the guard.
      const target=this.guardMoves?this.dir*48*Math.sin(this.st*4.8+this.guardPhase):0;
      this.vx+=(target-this.vx)*Math.min(1,dt*9);
      this.walkPh+=this.vx*this.dir*dt*.1;
      if(this.st>=this.guardDur){this.state='idle';this.st=0;}
      break;}
     case 'guard_recoil':{
      this.vx*=Math.exp(-dt*5);
      if(this.st>=.38&&this.y<=0){this.state='idle';this.st=0;}
      break;}
     case 'overextend':{
      this.vx*=Math.exp(-dt*1.6);
      if(this.st>=OVEREXTEND_DUR){this.overextendFor=null;this.state='idle';this.st=0;}
      break;}
     case 'flank':{
      const v=this.flankTarget;
      if(!v||!allFighters.includes(v)||v.hp<=0||v.state!=='overextend'||v.overextendFor!==this){
        this.flankTarget=null;this.state='idle';this.st=0;break;
      }
      const dest=clamp(v.x-v.dir*CHOKE_OFFSET,this.minX,this.maxX),u=ease(clamp(this.st/FLANK_DUR,0,1));
      this.x=lerp(this.flankFrom,dest,u);this.vx=0;
      this.dir=this.st>=FLANK_DUR*.9?v.dir:(v.x>=this.x?1:-1);
      if(this.st>=FLANK_DUR&&!this.startChoke(v)){this.flankTarget=null;this.state='idle';this.st=0;}
      break;}
     case 'choke':{
      const v=this.chokeTarget;
      if(this.hp<=0||!v||!allFighters.includes(v)||v.hp<=0||v.chokedBy!==this||v.state!=='choked'){
        this.releaseChoke();break;
      }
      if(this.st>=this.chokeCounterAt){this.beginCounter();break;}
      if(this.st>=this.chokeReleaseAt){this.releaseChoke(true);break;}
      v.hp=Math.max(0,v.hp-CHOKE_DPS*dt);
      if(v.hp<=0){Game.ko(v,this,{lvx:160,lvy:260,pw:.55});break;}
      if(this.st>=this.chokeDuration){
        this.releaseChoke();v.fastGetup=false;v.toRagdoll(this.dir*70,220);
        if(v.rag)v.rag.stunScale=1.5;
        v.dizzyAlpha=1;Snd.thud();break;
      }
      // The pair can shuffle while the restrained fighter struggles.
      this.vx=Math.sin(this.t*2.8)*18;
      break;}
     case 'choked':{
      const holder=this.chokedBy;
      if(!holder||!allFighters.includes(holder)||holder.hp<=0||holder.chokeTarget!==this||holder.state!=='choke'){
        if(holder&&holder.chokeTarget===this)holder.releaseChoke();
        else{this.chokedBy=null;this.state='idle';this.st=0;}
        break;
      }
      this.dir=holder.dir;this.x=clamp(holder.x+holder.dir*CHOKE_OFFSET,this.minX,this.maxX);
      this.vx=0;this.vy=0;this.y=0;
      break;}
     case 'counter_throw':{
      this.vx=0;
      const holder=this.chokedBy;
      if(!this.counterReleased&&(!holder||!allFighters.includes(holder)||holder.hp<=0||holder.chokeTarget!==this||holder.state!=='counter_carried')){
        this.breakChoke();this.state='idle';this.st=0;break;
      }
      if(!this.counterReleased&&this.st>=COUNTER_RELEASE)this.releaseCounter();
      if(this.st>=COUNTER_DUR){this.state='idle';this.st=0;this.counterBase=null;}
      break;}
     case 'counter_carried':{
      const v=this.chokeTarget;
      if(!v||!allFighters.includes(v)||v.hp<=0||v.chokedBy!==this||v.state!=='counter_throw'){
        this.breakChoke();this.state='idle';this.st=0;
      }
      this.vx=0;this.vy=0;this.y=0;
      break;}
     case 'stagger_fall':{
      const u=clamp(this.st/this.staggerDur,0,1);
      this.vx=this.staggerDir*(u<.78?100+25*Math.sin(this.st*18):45);
      if(this.st>=this.staggerDur){this.toRagdoll(this.staggerDir*75,70);}
      break;}
     case 'push_stagger':{
      const u=clamp(this.st/this.staggerDur,0,1);
      this.vx=this.staggerDir*(u<.78?120+24*Math.sin(this.st*18):55);
      if(this.st>=this.staggerDur){
        if(this.shoveWillFall)this.toRagdoll(this.staggerDir*85,70);
        else{this.state='idle';this.st=0;this.vx*=.3;this.comboT=9;}
      }
      break;}
     case 'bleed_collapse':{
      this.vx*=Math.exp(-dt*3);
      if(this.st>=1.35)this.toRagdoll(0,0,true);
      break;}
     case 'run_hit_stop':{
      this.vx*=Math.exp(-dt*6.5);
      this.walkPh+=Math.abs(this.vx)*dt*.07;
      if(this.st>=this.stunT&&Math.abs(this.vx)<30){this.state='idle';this.st=0;this.vx=0;this.runStopFrom=null;}
      break;}
     case 'hit':{
      this.vx*=Math.exp(-dt*8);
      if(this.st>=this.stunT){this.state='idle';this.st=0;}
      break;}
     case 'ragdoll':{
      const r=this.rag;r.update(dt);
      this.x=clamp(r.p.pel.x,this.minX,this.maxX);
      if(this.gy===Game.gy&&this.hp<80&&r.settle>.08&&r.t<4&&!r.frozen){
        this.poolT-=dt;
        if(this.poolT<=0&&this.fx){
          this.poolT=this.hp<=0?.14:.22;
          const bPt=Math.random()<.5?r.p.head:r.p.pel;
          this.fx.pool(bPt.x,this.gy+rnd(1,13),clamp((85-this.hp)/9,2.5,10));
        }
      }
      // Keep the original get-up timings, but do not stand in midair after
      // falling from a lamp; the retained ragdoll physics determines contact.
      if(this.hp>0&&r.grounded()){
        const stunScale=r.stunScale||1;
        if(this.fastGetup){ if((r.t>.35&&r.settle>.08)||r.t>1.2)this.startGetup(); }
        else if(r.t>.9*stunScale&&r.settle>.35)this.startGetup();
        else if(r.t>4.2*stunScale)this.startGetup();
      }
      break;}
     case 'getup':{
      this.vx=0;
      if(this.fastGetup)this.st+=dt*.8; // gets up faster after a dive/trip
      if(this.st>=GETUP_DUR){this.state='idle';this.st=0;this.invT=.45;this.comboT=9;this.fastGetup=false;}
      break;}
    }
    if(this.state!=='ragdoll'){
      this.x+=this.vx*dt;
      const min=this.state==='choke'&&this.dir<0?this.minX+CHOKE_OFFSET:this.minX;
      const max=this.state==='choke'&&this.dir>0?this.maxX-CHOKE_OFFSET:this.maxX;
      this.x=clamp(this.x,min,max);
    }
    c.jump=c.punch=false;
    // Homelander walks on the ground while peaceful and resumes hovering in combat.
    if(!isHL||this.state==='ragdoll'){
      this.hoverY=0;
    }else if(this.state==='spawn'){
      this.hoverY=this.peaceful||this.sp<3?0:HL_HOVER*ease(clamp(1-this.spT/.45,0,1));
    }else if(['stagger_fall','push_stagger','shove','lamp_jump','lamp_hang','lamp_pull','bleed_collapse'].includes(this.state)){
      this.hoverY=0;
    }else if(this.state==='getup'){
      if(this.peaceful||this.st<1.76){this.hoverY=0;}
      else{
        if(!this.hlLiftFx){this.hlLiftFx=true;if(this.fx)this.fx.landing(this.x,this.gy,.32);}
        const lift=ease(clamp((this.st-1.76)/(GETUP_DUR-1.76),0,1));
        this.hoverY=(HL_HOVER+Math.sin(this.t*2.7+this.seed)*2.2)*lift;
      }
    }else{
      const grounded=this.peaceful||['choke','choked','counter_throw','counter_carried'].includes(this.state)||
        (this.state==='idle'&&c.crouch);
      const baseH=grounded?0:this.state==='run'?HL_HOVER+8:HL_HOVER;
      const tgtH=baseH+(grounded?0:Math.sin(this.t*2.7+this.seed)*2.2);
      if(this.state==='idle'&&c.crouch)this.hoverY=Math.max(0,this.hoverY-dt*75);
      else this.hoverY+=(tgtH-this.hoverY)*Math.min(1,dt*14);
    }
    // Orbiting pixel yellow stars while unconscious in temporary knockdown (fade out when getting up).
    if(this.hp>0&&this.state==='ragdoll'&&!this.fastGetup&&this.rag&&(this.rag.t>.12||this.dizzyAlpha>.2)){
      this.dizzyAlpha=Math.min(1,this.dizzyAlpha+dt*5.5);
    }else{
      this.dizzyAlpha=Math.max(0,this.dizzyAlpha-dt*2.4);
    }
    if(this.dizzyAlpha>0)this.dizzyPh+=dt*4.4;
    this.buildRig(dt);
    if(this.laserSlice&&!this.gorePieces){
      this.laserSlice.progress=Math.min(1,this.laserSlice.progress+dt/this.laserSlice.duration);
      if(this.laserSlice.progress>=1){
        const pieces=makeLaserPieces(this,this.laserSlice);
        if(pieces.length){
          this.gorePieces=pieces;this.poolT=0;
          // The detached graph owns physics from this point on. Stop the
          // hidden whole-body solver from creating phantom contacts or pools.
          if(this.rag)this.rag.frozen=true;
        }else this.laserSlice=null;
      }
    }
    if(this.gorePieces){updateGorePieces(this.gorePieces,dt,Game.W);updateGoreBlood(this,dt);}
    this.resolveBloodFootfall(dt);
    this.resolveBloodJointContacts(dt);
    if(!this.gorePieces){this.updateTie(dt);this.updateCape(dt);}
    if(this.hp<=0&&this.state==='ragdoll'&&this.rag&&this.rag.frozen){this.corpseFade=Math.min(.14,this.corpseFade+dt*.018);}
  }
  runPose(){
    const rs=clamp(Math.abs(this.vx)/RUN_SPD,0,1);
    if(this.skin==='homelander'&&!this.peaceful){
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
     case 'getup':return sampleKF((this.skin==='negan'||this.skin==='chester')?GETUP_NEGAN:isHL?GETUP_HL:GETUP,this.st);
     case 'lamp_jump':return LAMP_REACH;
     case 'lamp_hang':{
      const p=Object.assign({},LAMP_HANG),lamp=this.lampRef;
      const sway=lamp?clamp(lamp.omega,-.45,.45):0;
      p.tl+=(lamp?lamp.theta*20:0)-sway*5;
      p.f1x+=sway*12;p.f2x+=sway*9;
      if(this.lampAction==='climb'){
        const step=Math.sin(this.t*11);p.f1x+=step*12;p.f2x-=step*12;
        p.f1h+=Math.max(0,step)*15;p.f2h+=Math.max(0,-step)*15;
      }
      return p;}
     case 'lamp_pull':{
      const p=Object.assign({},LAMP_PULL);p.tl-=ease(clamp(this.st/LAMP_PULL_DUR,0,1))*14;return p;}
     case 'stagger_fall':
     case 'push_stagger':{
      const u=clamp(this.st/this.staggerDur,0,1),step=Math.sin(this.st*19);
      const lean=this.state==='push_stagger'&&!this.shoveWillFall?Math.sin(Math.PI*u)*.7:u;
      return P({H:lerp(80,67,lean),tl:lerp(-16,-55,lean)+step*4,hd:lerp(-14,-38,lean),px:lerp(-5,-14,lean),
        a1:68+step*8,e1:55,c1:0,a2:54-step*8,e2:62,c2:0,
        f1x:22+step*21,f1h:Math.max(0,step)*15,f2x:-22-step*18,f2h:Math.max(0,-step)*13,mo:.8,bg:0});}
     case 'shove':return sampleKF(SHOVE_KF,this.st);
     case 'guard':{
      const p=Object.assign({},GUARD_POSE),w=clamp(Math.abs(this.vx)/48,0,1),step=Math.sin(this.walkPh)*w;
      p.f1x+=step*12;p.f2x-=step*12;p.f1h=Math.max(0,step)*7;p.f2h=Math.max(0,-step)*7;
      return p;}
     case 'guard_recoil':return GUARD_RECOIL;
     case 'overextend':{
      const p=Object.assign({},OVEREXTEND_POSE);
      p.tl+=Math.sin(this.st*13)*5;p.f1h+=Math.max(0,Math.sin(this.st*12))*11;
      return mix(D,p,ease(clamp(this.st/.16,0,1)));}
     case 'flank':{
      const p=Object.assign({},FLANK_POSE),step=Math.sin(this.st*23);
      p.f1x+=step*17;p.f2x-=step*17;p.f1h=Math.max(0,-step)*14;p.f2h=Math.max(0,step)*14;
      return p;}
     case 'choke':{
      const p=Object.assign({},CHOKE_HOLD_POSE);p.tl+=Math.sin(this.st*4)*2;return p;}
     case 'choked':{
      const p=Object.assign({},CHOKED_POSE);p.tl+=Math.sin(this.st*9)*3;p.hd+=Math.sin(this.st*11)*3;return p;}
     case 'counter_throw':return sampleKF(COUNTER_KF,this.st);
     case 'win':{
      if(isHL){const p=Object.assign({},HL_IDLE,{tl:-5,hd:-10,a1:142,e1:22,c1:1,a2:154,e2:16,c2:1,mo:1});p.a1+=Math.sin(t*8)*5;p.a2+=Math.sin(t*8+1)*5;return p;}
      const p=Object.assign({},WIN);p.H+=Math.sin(t*5)*1.5;p.a1+=Math.sin(t*9)*6;p.a2+=Math.sin(t*9+1)*6;return p;}
     case 'bleed_collapse':{
      const weak=P({H:37,tl:48,hd:46,px:2,a1:12,e1:30,c1:0,a2:6,e2:35,c2:0,
        f1x:28,f2x:-18,mo:.65,ey:.6,bg:0});
      return mix(this.collapseFrom||D,weak,ease(clamp(this.st/1.3,0,1)));}
     case 'run_hit_stop':{
      const base=this.hitZone==='head'?HITH:HITB;
      return mix(this.runStopFrom||D,base,ease(clamp(this.st/.22,0,1))*.65);
     }
     case 'hit':{
      const base=this.hitZone==='head'?HITH:HITB;
      const p=isHL?Object.assign({},base,{f1x:10,f1h:14,fa1:42,f2x:-10,f2h:2,fa2:50}):Object.assign({},base);
      const sh=Math.sin(this.st*55)*Math.max(0,1-this.st/this.stunT)*5;p.tl+=sh;p.hd+=sh*1.3;return p;}
     case 'bridge_leap':
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
     case 'duck_throw':return sampleKF(DUCK_AIM_KF,this.st);
     case 'dash':{
      if(isHL){
        return this.dashF
          ?P({H:80,tl:38,hd:12,px:8,a1:78,e1:14,c1:1,a2:70,e2:18,c2:1,f1x:-48,f1h:9,fa1:64,f2x:-42,f2h:4,fa2:68,mo:.3})
          :P({H:84,tl:-18,hd:8,px:-5,a1:46,e1:34,c1:0,a2:34,e2:38,c2:0,f1x:24,f1h:18,fa1:36,f2x:10,f2h:10,fa2:44,mo:.2});
      }
      return this.dashF?DASHF:DASHB;}
     case 'attack':return sampleKF(this.atk.kf,this.st);
    }
    if(s==='idle'&&this.crouchActive){
      const walking=clamp(Math.abs(this.vx)/70,0,1),step=Math.sin(this.walkPh)*walking;
      // A distinct low squat with a forward-leaning torso.
      return P({H:49+Math.abs(step)*2,tl:48,hd:24+Math.sin(t*2)*3,px:8,
        a1:55,e1:100,c1:0,a2:42,e2:115,c2:0,
        f1x:25+step*10,f1h:Math.max(0,step)*5,f2x:-20-step*10,f2h:Math.max(0,-step)*5,
        gx:48,gy:22,bt:145,mo:.15});
    }
    if(this.peaceful&&s==='idle'){
      // Neutral, upright posture with relaxed elbows. Walking swings the arms
      // and legs gently instead of reverting to a raised fighting guard.
      const p=P({H:85,tl:2,hd:1,px:0,a1:5,e1:22,c1:0,a2:-5,e2:25,c2:0,
        f1x:19,f2x:-17,bg:0});
      const w=clamp(Math.abs(this.vx)/210,0,1),b=t*2+this.seed,step=Math.sin(this.walkPh);
      p.tl+=Math.sin(b)*.7+w*2;p.hd+=Math.sin(b*.7)*.7;
      p.a1+=Math.sin(b)*1.4*(1-w)+step*13*w;p.a2+=Math.sin(b+1)*1.4*(1-w)-step*13*w;
      p.f1x+=Math.cos(this.walkPh)*21*w;p.f2x-=Math.cos(this.walkPh)*21*w;
      p.f1h=Math.max(0,-step)*14*w;p.f2h=Math.max(0,step)*14*w;
      p.H+=Math.abs(step)*2*w;
      if(this.landT>0)return mix(p,LAND,clamp(this.landT/.12,0,1));
      return p;
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
    if(this.state==='counter_carried'&&this.chokeTarget&&this.chokeTarget.counterBase){
      this.rig=counterCarryRig(this.chokeTarget.counterBase,this.chokeTarget,this.chokeTarget.st/COUNTER_RELEASE);
      // Other fighters target the carried body where it actually is, not the
      // original standing position left behind by the throw.
      this.x=clamp(this.rig.pel.x,this.minX,this.maxX);return;
    }
    const tp=this.targetPose();
    const hard=['getup','spawn','counter_throw','lamp_hang','shove'].includes(this.state);
    const k=hard?1:(this.state==='attack'||this.state==='hit')?1-Math.exp(-dt*45):1-Math.exp(-dt*24);
    this.cur=(this.cur&&!hard)?mix(this.cur,tp,k):Object.assign({},tp);
    const hasBat=(this.skin==='negan'||this.skin==='chester')&&this.hp>0&&!this.batLost&&!stowsBat(this);
    const guarding=this.state==='guard'||this.state==='guard_recoil';
    const pose=guarding?guardWobblePose(this.cur,this):this.cur;
    let R=computeRig(pose,this.x,this.gy,this.y+(this.hoverY||0),this.dir,hasBat);
    if(guarding)poseGuardArms(R,this);
    if(this.state==='lamp_jump'||this.state==='lamp_hang')poseLampArms(R,this);
    if(this.state==='lamp_pull')poseLampPullArms(R,this.lampPullTarget);
    if(this.state==='choke')poseNeckHold(R,this.chokeTarget);
    if(this.state==='choked')poseStruggleArms(R,this.st);
    if(this.state==='counter_throw')poseCounterGrip(R,this);
    if(this.bleed&&this.bleed.pressing){
      const p=surfacePoint(R,this.bleed.mark);
      if(p){aimArmWorld(R,this.bleed.arm,p.x,p.y);R['c'+this.bleed.arm]=0;R.bd=null;}
    }
    if(this.state==='getup'&&this.blend>0&&this.blendFrom)R=blendRig(this.blendFrom,R,ease(1-this.blend/.3));
    this.rig=R;
  }
}
/* ============================ AUTONOMOUS BRAWL CONTROLLER ============================ */
/*
  The original retreat/wait/charge remains available. Around a prone opponent
  the fighter can also keep distance, crouch to inspect, or run and jump over
  the body. A vault is planned only when it is unlikely to rise in time.
*/
function safeToVault(body,seconds){
  if(!body||body.gorePieces||body.state!=='ragdoll'||!body.rag||!body.rag.grounded()||
     body.rag.p.head.y<body.gy-100)return false;
  if(body.hp<=0)return true;
  if(body.fastGetup)return false;
  const r=body.rag,scale=r.stunScale||1;
  // Earliest possible ordinary recovery: both the minimum stun and the rest
  // threshold must be met, unless the old maximum-stun timeout comes first.
  const earliest=Math.min(Math.max(.9*scale-r.t,.35-r.settle),4.2*scale-r.t);
  return earliest>seconds;
}
class AutoCombat{
  constructor(){
    this.attackWait=rnd(.25,.75);this.mode='engage';this.modeT=0;
    this.hopCD=rnd(0,1);this.reactT=-1;this.reactAttacker=null;this.seen=Object.create(null);
    this.downDecided=false;this.downTarget=null;this.handledCorpses=new WeakSet();
    this.farCD=rnd(.3,1.5);this.laserCD=rnd(1,3);
    this.dodgeP=rnd(.28,.5);this.retreatP=rnd(.35,.6);
    this.jumpDist=250;this.goalX=0;this.retRun=false;
    this.vaultTarget=null;this.vaultSide=0;this.vaultStart=0;this.watchDistance=170;this.watchUntil=2;
    this.shoveSeen=-1;this.pendingShove=null;this.pendingShoveT=0;
    this.lampCheck=rnd(5,12);this.lampTarget=null;this.hangSeen=null;this.hangStamp=-1;this.hangResponse=null;
    this.rolled=false;this.intercept=false;this.afterHop=0;this.reactAction='hop';
    this.spaceCD=rnd(2,4);this.spaceDuration=0;
    this.openingSeen=Object.create(null);this.openingTarget=null;this.bridgeTackleCD=0;
    this.wanderAction='stand';this.wanderT=1.5;this.wanderDir=1;
    this.duckPlanTarget=null;this.duckPlanT=0;this.duckMaintain=false;this.duckIdeal=340;
    this.chargeDuckDecided=false;
  }
  setMode(m){this.mode=m;this.modeT=0;}
  wander(dt,f,st){
    if(st!=='idle'&&st!=='run')return;
    const c=f.ctrl;
    this.wanderT-=dt;
    if(this.wanderT<=0){
      const r=f.ambientRandom();
      this.wanderAction=r<.32?'stand':r<.68?'walk':r<.83?'crouch':r<.95?'run':'jump';
      this.wanderT=this.wanderAction==='run'?f.ambientBetween(.6,1.3):f.ambientBetween(1.5,4);
      this.wanderDir=f.ambientRandom()<.5?-1:1;
    }
    if(this.wanderAction==='crouch'){c.crouch=true;return;}
    if(this.wanderAction==='jump'){
      if(st==='idle'){c.jump=true;this.wanderAction='stand';this.wanderT=f.ambientBetween(2,4);}
      return;
    }
    if(this.wanderAction==='walk'||this.wanderAction==='run'){
      if(f.x<f.minX+90)this.wanderDir=1;
      if(f.x>f.maxX-90)this.wanderDir=-1;
      c.mx=this.wanderDir;c.noFace=true;f.dir=this.wanderDir;
      c.run=this.wanderAction==='run';
    }
  }
  planVault(f,body){
    if(!safeToVault(body,1.25))return false;
    const side=f.x>=body.x?1:-1;
    const start=clamp(body.x+side*210,f.minX,f.maxX);
    const landing=body.x-side*180;
    if((start-body.x)*side<155||landing<f.minX||landing>f.maxX)return false;
    this.vaultTarget=body;this.vaultSide=side;this.vaultStart=start;
    this.setMode(Math.abs(f.x-body.x)>=190?'vault_run':'vault_retreat');
    return true;
  }
  startCharge(dist){
    this.setMode('charge');this.chargeDuckDecided=false;
    const r=Math.random();
    // 10%: never jumps and runs into the enemy; 12%: jumps too early; 10%: too late; otherwise a good timing
    let jd=r<.10?-1:r<.22?rnd(350,440):r<.32?rnd(30,70):rnd(190,300);
    if(jd>0&&jd>dist-120)jd=Math.max(30,dist-120);
    this.jumpDist=jd;
  }
  update(dt,f,o,all){
    const c=f.ctrl;
    c.mx=0;c.jump=false;c.punch=false;c.run=false;c.laser=false;c.hop=false;c.noFace=false;c.crouch=false;
    this.attackWait-=dt;this.hopCD-=dt;this.farCD-=dt;this.laserCD-=dt;this.lampCheck-=dt;this.spaceCD-=dt;this.bridgeTackleCD-=dt;this.duckPlanT-=dt;this.modeT+=dt;
    this.pendingShoveT=Math.max(0,this.pendingShoveT-dt);
    if(f.hp<=0){this.mode='engage';this.openingTarget=null;this.lampTarget=null;return;}
    const st=f.state;
    if(f.bleed&&!f.bleed.stopped&&!f.bleed.pressing&&f.bleed.decision<=0&&st==='idle'){
      f.bleed.decision=rnd(2.2,4);
      if(Math.random()<.6)f.startPressure();
    }
    if(['ragdoll','getup','stagger_fall','push_stagger','spawn','hit','run_hit_stop','bleed_collapse'].includes(st)){
      this.mode='engage';this.reactT=-1;this.reactAttacker=null;this.openingTarget=null;this.lampTarget=null;
      this.pendingShove=null;this.vaultTarget=null;this.downTarget=null;this.downDecided=false;
      if(!['ragdoll','stagger_fall','push_stagger','bleed_collapse'].includes(st))f.faceOpp(o);
      return;
    }
    // Once airborne keep the running-jump momentum; interruption or landing
    // ends the plan without ever converting it into a flying kick.
    if(this.mode==='vault_air'){
      if(st==='air'&&f.bodyJump){c.noFace=true;return;}
      this.vaultTarget=null;this.downTarget=null;this.setMode('engage');
    }
    if(this.mode==='vault_retreat'||this.mode==='vault_run'){
      const body=this.vaultTarget,side=this.vaultSide;
      const danger=all.some(e=>e!==f&&e!==body&&e.hp>0&&
        !['spawn','ragdoll','getup','stagger_fall','push_stagger'].includes(e.state)&&Math.abs(e.x-f.x)<200);
      const needed=this.mode==='vault_retreat'?1+.005*Math.abs(this.vaultStart-f.x):.7;
      if(!body||!all.includes(body)||danger||!safeToVault(body,needed)||
         !['idle','run'].includes(st)||this.modeT>4){
        this.vaultTarget=null;this.setMode('engage');return;
      }
      c.noFace=true;
      if(this.mode==='vault_retreat'){
        const d=this.vaultStart-f.x;
        if(Math.abs(d)>12){c.mx=d>0?1:-1;f.dir=c.mx;}
        else this.setMode('vault_run');
        return;
      }
      const ahead=(body.x-f.x)*-side;
      if(ahead<=0){this.vaultTarget=null;this.setMode('engage');return;}
      f.dir=-side;
      if(st==='run'&&ahead<=135&&Math.abs(f.vx)>=260&&f.startBodyJump()){
        this.setMode('vault_air');return;
      }
      c.mx=-side;c.run=true;return;
    }
    // Corpses are not valid combat targets, but they are still real obstacles
    // to inspect or jump over when there is no immediate living opponent.
    if(!o){
      if(['keep_distance','inspect_down'].includes(this.mode)&&this.downTarget&&
         this.downTarget.hp<=0&&all.includes(this.downTarget))o=this.downTarget;
      else o=all.filter(e=>e!==f&&e.hp<=0&&!this.handledCorpses.has(e)&&
        Math.abs(e.x-f.x)<350&&safeToVault(e,0)).sort((a,b)=>Math.abs(a.x-f.x)-Math.abs(b.x-f.x))[0]||null;
    }
    if(!o){
      this.mode='engage';this.openingTarget=null;this.lampTarget=null;this.downTarget=null;this.downDecided=false;
      this.duckPlanTarget=null;this.wander(dt,f,st);return;
    }
    const dx=o.x-f.x,dist=Math.abs(dx),toward=dx>=0?1:-1;
    if(['guard','guard_recoil','shove','overextend','flank','choke','choked','counter_throw','counter_carried','lamp_jump','lamp_hang','lamp_pull','duck_throw'].includes(st)){
      c.noFace=true;return;
    }
    // Navigate between floors before ordinary 1-D combat. A pursuer can use
    // the same rope once the first fighter is high enough, or another rope.
    const highTarget=o.onBridge||(o.state==='lamp_hang'&&o.lampClimb>120);
    if(!f.onBridge&&f.gy===Game.gy&&highTarget&&['idle','run'].includes(st)){
      if(this.mode!=='vertical_chase'){
        this.lampTarget=null;this.setMode('vertical_chase');
      }
      let lamp=this.lampTarget;
      if(!lamp||lamp.detached||!Game.lamps.includes(lamp)||!lamp.canGrab()){
        lamp=Game.lamps.filter(l=>!l.detached&&l.canGrab()).sort((a,b)=>
          (Math.abs(a.x-f.x)+.35*Math.abs(a.anchorX-o.x))-(Math.abs(b.x-f.x)+.35*Math.abs(b.anchorX-o.x)))[0];
        this.lampTarget=lamp||null;
      }
      if(!lamp)return;
      const d=lamp.x-f.x;c.noFace=true;
      if(Math.abs(d)>20){c.mx=d>0?1:-1;f.dir=c.mx;return;}
      if(st==='idle'&&f.startLampJump(lamp)){this.lampTarget=null;this.setMode('engage');}
      return;
    }
    if(this.mode==='vertical_chase'){this.lampTarget=null;this.setMode('engage');}
    if(f.onBridge){
      const nearHeight=o.rig&&f.rig&&Math.abs(o.rig.pel.y-f.rig.pel.y)<125;
      if(st==='idle'&&nearHeight&&dist>55&&dist<200&&this.bridgeTackleCD<=0&&Math.random()<dt*.32){
        this.bridgeTackleCD=rnd(4,7);if(f.startHighTackle(o))return;
      }
      if(!o.onBridge){
        // Stay on the bridge rather than trying to punch or jump at an enemy
        // far below. Approach someone who is arriving on a nearby rope.
        if(st==='idle'&&dist>85){c.mx=toward;c.noFace=true;f.dir=toward;}
        return;
      }
    }
    // Decide once per missed swing, not on every frame. A defender can finish
    // the back-hop and then cross behind the still-stumbling attacker.
    const opening=all.find(e=>e!==f&&e.hp>0&&e.state==='overextend'&&e.overextendFor===f);
    if(opening&&f.chokeCD<=0&&this.openingSeen[opening.id]!==opening.overextendStamp){
      this.openingSeen[opening.id]=opening.overextendStamp;
      if(Math.random()<.7){this.openingTarget=opening;this.setMode('engage');}
    }
    const target=this.openingTarget;
    if(target){
      if(!all.includes(target)||target.hp<=0||target.state!=='overextend'||target.overextendFor!==f){this.openingTarget=null;}
      else if(st==='idle'){
        const delta=target.x-f.x;
        if(Math.abs(delta)<=180){
          this.openingTarget=null;
          if(f.startFlank(target))return;
        }else{c.mx=delta>0?1:-1;return;}
      }
    }
    if(this.mode!=='retreat'&&st!=='run'&&st!=='air'&&st!=='hop')f.faceOpp(o);
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
        if(this.hopCD<=0&&this.reactT<0&&Math.random()<this.dodgeP*(f.hp<45?1.35:1)){
          this.reactT=rnd(.015,.06);this.reactAttacker=e;
          this.reactAction=e.atk.fist&&!e.atk.bat&&Math.random()<.32?'duck':'hop';
        }
      }
      if(this.reactT>=0){
        const threat=this.reactAttacker;
        if(!threat||!all.includes(threat)||threat.hp<=0||threat.state!=='attack'||!threat.atk||threat.st>threat.atk.he){
          this.reactT=-1;this.reactAttacker=null;
        }else{
          this.reactT-=dt;
          if(this.reactT<0){
            this.reactAttacker=null;this.hopCD=rnd(1.8,3);
            f.dir=threat.x>=f.x?1:-1;
            if(this.reactAction==='duck'){
              this.setMode('duck');this.spaceDuration=rnd(.48,.8);c.crouch=true;c.noFace=true;return;
            }
            if(f.guardCD<=0&&Math.random()<.25&&f.startGuard(threat)){this.afterHop=0;return;}
            c.noFace=true;c.hop=true;this.afterHop=.5;return;
          }
          return;
        }
      }
      if(this.afterHop>0){ // landed: sometimes answer with a charge
        this.afterHop-=dt;
        if(this.afterHop<=0){
          const dn=o.state==='ragdoll'||o.state==='getup'||o.state==='spawn';
          if(!dn&&dist>170&&Math.random()<.4){this.startCharge(dist);}
        }
      }
    }

    const oppDown=o.state==='ragdoll'||o.state==='getup'||o.state==='spawn';
    if(this.mode==='duck'){
      if(st!=='idle'||oppDown||this.modeT>=this.spaceDuration){this.setMode('engage');return;}
      c.noFace=true;c.crouch=true;f.dir=toward;
      return;
    }
    if(this.mode==='space_out'){
      if(st!=='idle'||oppDown||this.modeT>=this.spaceDuration||dist>230){this.setMode('engage');return;}
      c.noFace=true;f.dir=toward;
      if(dist<180)c.mx=-toward;
      return;
    }
    if(this.mode==='lamp_approach'){
      const lamp=this.lampTarget;
      if(!lamp||!Game.lamps.includes(lamp)||lamp.detached||!lamp.canGrab()||oppDown||o.state==='lamp_hang'||this.modeT>3){
        this.lampTarget=null;this.setMode('engage');return;
      }
      if(st!=='idle')return;
      const d=lamp.x-f.x;
      if(Math.abs(d)>22){c.mx=d>0?1:-1;return;}
      if(f.startLampJump(lamp)){this.lampTarget=null;this.setMode('engage');}
      return;
    }
    if(o.state==='lamp_hang'){
      if(this.hangSeen!==o||this.hangStamp!==o.lampHangStamp){
        this.hangSeen=o;this.hangStamp=o.lampHangStamp;
        const roll=Math.random();this.hangResponse=roll<.32?'ignore':roll<.64?'pull':'strike';
      }
      // A hanging opponent interrupts the old charge/retreat/wait behavior so
      // the chosen lamp response can run instead of walking past the rope.
      if(['charge','retreat','wait','keep_distance','inspect_down'].includes(this.mode)){
        this.downTarget=null;this.setMode('engage');
      }
      if(this.hangResponse==='ignore')return;
      if(this.hangResponse==='pull'){
        if(st!=='idle')return;
        if(dist>72){c.mx=toward;return;}
        if(f.startLampPull(o))return;
        this.hangResponse='strike'; // too high to grab: try reaching with a hit instead
      }
    }
    if(this.mode==='keep_distance'||this.mode==='inspect_down'){
      const body=this.downTarget;
      const danger=all.some(e=>e!==f&&e!==body&&e.hp>0&&
        !['spawn','ragdoll','getup','stagger_fall','push_stagger'].includes(e.state)&&Math.abs(e.x-f.x)<180);
      if(!body||!all.includes(body)||body.state!=='ragdoll'||danger||
         (body.hp<=0&&this.modeT>=this.watchUntil)){
        this.downTarget=null;this.setMode('engage');return;
      }
      if(st!=='idle')return;
      const d=body.x-f.x,range=Math.abs(d),face=d>=0?1:-1;
      f.dir=face;c.noFace=true;c.crouch=this.mode==='inspect_down';
      if(range>this.watchDistance+12)c.mx=face;
      else if(range<this.watchDistance-12)c.mx=-face;
      return;
    }
    if(this.mode==='charge'){
      if(oppDown||this.modeT>5){this.setMode('engage');return;}
      // Sometimes abort the flying kick while there is still room to stop,
      // plant the feet and use a ready duck instead.
      if(f.skin==='tubtrooper'&&!this.chargeDuckDecided&&f.duckCD<=0&&st==='run'&&dist>=260&&dist<=620&&
         Math.abs((f.gy-f.y)-(o.gy-o.y))<150){
        this.chargeDuckDecided=true;
        if(Math.random()<.48){
          this.duckPlanTarget=o;this.duckPlanT=rnd(2,3.5);this.duckMaintain=true;this.duckIdeal=320;
          this.setMode('engage');return;
        }
      }
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
      if(this.downTarget!==o){this.downTarget=o;this.downDecided=false;}
      if(!this.downDecided){
        this.downDecided=true;
        const W=Game.W;this.goalX=o.x<W/2?W-120:120;
        // Preserve the original walk/run away followed by wait and charge.
        if(o.hp>0&&Math.abs(f.x-this.goalX)>260&&Math.random()<this.retreatP){
          this.retRun=Math.random()<.55;this.setMode('retreat');return;
        }
        if(o.hp<=0)this.handledCorpses.add(o);
        if(o.state==='ragdoll'&&safeToVault(o,1.25)&&
           Math.random()<(o.hp<=0?.55:.3)&&this.planVault(f,o))return;
        if(o.state==='ragdoll'){
          const inspect=Math.random()<.5;
          this.watchDistance=inspect?rnd(120,145):rnd(160,195);this.watchUntil=rnd(1.6,2.7);
          this.setMode(inspect?'inspect_down':'keep_distance');return;
        }
      }
      // While the opponent is getting up or spawning, keep a little space.
      if(dist>185)c.mx=toward;else if(dist<145)c.mx=-toward;
      return;
    }
    this.downDecided=false;this.downTarget=null;
    // Break up stationary exchanges: sometimes step or hop away and keep a
    // little space, without changing any attack or guard cooldowns.
    if(this.spaceCD<=0&&dist<165&&o.y<10&&o.state!=='attack'&&Math.random()<dt*.5){
      this.spaceCD=rnd(2.8,4.8);this.spaceDuration=rnd(.55,1.3);this.setMode('space_out');
      const room=toward>0?f.x-f.minX:f.maxX-f.x;
      if(room>175&&f.dashCD<=0&&Math.random()<.4){c.noFace=true;c.hop=true;}
      else c.mx=-toward;
      return;
    }
    // Give a connected strike one optional, short follow-up decision, rather
    // than re-rolling every frame or changing the normal attack cooldown.
    if(f.lastHitTarget&&this.shoveSeen!==f.atkStamp&&f.t-f.lastAttackEnd<.5){
      this.shoveSeen=f.atkStamp;
      if(f.lastHitTarget===o&&o.canBeHit()&&o.y<=5&&dist<155&&f.shoveCD<=0&&Math.random()<.28){
        this.pendingShove=o;this.pendingShoveT=.65;
      }
    }
    if(this.pendingShove){
      if(this.pendingShove!==o||this.pendingShoveT<=0||!o.canBeHit()||o.y>5||dist>160){this.pendingShove=null;}
      else if(dist>SHOVE_REACH){c.mx=toward;return;}
      else{
        this.pendingShove=null;
        if(f.startShove(o))return;
      }
    }
    if(this.lampCheck<=0&&dist>150&&o.state!=='lamp_hang'){
      this.lampCheck=rnd(5,9);
      if(Math.random()<.06){
        const lamp=Game.lamps.filter(l=>!l.detached&&l.canGrab()&&Math.abs(l.x-f.x)<200)
          .sort((a,b)=>Math.abs(a.x-f.x)-Math.abs(b.x-f.x))[0];
        if(lamp){this.lampTarget=lamp;this.lampCheck=rnd(20,35);this.setMode('lamp_approach');return;}
      }
    }
    // Occasionally set a guard before a strike is thrown. Its existing
    // cooldown is unchanged; the longer pose can absorb a series of punches.
    if(dist>=138&&dist<=240&&f.guardCD<=0&&o.y<40&&o.state!=='lamp_hang'&&
       Math.random()<dt*.35&&f.startGuard(o))return;
    // Tubtrooper usually makes room for a clear throw instead of blindly
    // charging. The plan is rolled occasionally, not once per frame; at the
    // wall or at punching range he can still defend and fight normally.
    if(f.skin==='tubtrooper'&&o.canBeHit()&&!(f.bleed&&f.bleed.pressing)&&
       Math.abs((f.gy-f.y)-(o.gy-o.y))<150){
      if(this.duckPlanTarget!==o||this.duckPlanT<=0){
        this.duckPlanTarget=o;this.duckPlanT=rnd(2,3.5);
        this.duckMaintain=Math.random()<.78;this.duckIdeal=rnd(300,410);
      }
      const room=toward>0?f.x-f.minX:f.maxX-f.x;
      if(this.duckMaintain){
        const hasRange=dist>=Math.max(200,this.duckIdeal-65)||room<40;
        if(hasRange&&dist>=200&&dist<=760&&f.duckCD<=0&&this.attackWait<=0&&f.startDuckThrow(o)){
          this.attackWait=rnd(.9,1.3);return;
        }
        if(dist>105&&dist<this.duckIdeal-35&&room>35){
          c.noFace=true;f.dir=toward;c.mx=-toward;return;
        }
        if(dist>this.duckIdeal+140){c.mx=toward;return;}
        if(dist>=190&&room>35)return;
      }
      // Even an aggressive plan can occasionally choose the ranged action.
      if(f.duckCD<=0&&this.attackWait<=0&&dist>=200&&dist<=760&&
         Math.random()<dt*.9&&f.startDuckThrow(o)){
        this.attackWait=rnd(.9,1.3);return;
      }
    }
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
      if(!incoming&&dist<=SHOVE_REACH&&f.shoveCD<=0&&Math.random()<.14&&f.startShove(o)){
        this.attackWait=rnd(.72,1.05);return;
      }
      if(f.boxCD<=0&&Math.random()<.32&&f.startBoxing()){
        this.attackWait=rnd(.95,1.25);return;
      }
      c.punch=true;
      this.attackWait=rnd(.72,1.05);
    }
  }
}
/* ============================ HANGING LAMPS ============================ */
class HangingLamp{
  constructor(fraction,endY,W){
    this.fraction=fraction;this.anchorY=WORLD_TOP+18;this.length=endY-this.anchorY;
    this.theta=rnd(-.006,.006);this.omega=0;this.riders=new Set();this.detached=false;
    this.vx=0;this.vy=0;this.spin=0;this.angle=0;this.settled=false;
    this.resize(W);
  }
  get occupant(){return this.riders.values().next().value||null;}
  set occupant(f){if(f)this.riders.add(f);else this.riders.clear();}
  canGrab(){return this.riders.size<3&&![...this.riders].some(f=>(f.lampClimb||0)<95);}
  point(up=0){
    const length=clamp(this.length-up,0,this.length);
    return {x:this.anchorX+Math.sin(this.theta)*length,y:this.anchorY+Math.cos(this.theta)*length};
  }
  grip(){return this.point(30);}
  resize(W){
    this.anchorX=this.fraction*W;
    if(!this.detached){const p=this.point();this.x=p.x;this.y=p.y;}
    else this.x=clamp(this.x,20,W-20);
  }
  update(dt,game){
    if(this.detached){
      if(this.settled)return;
      this.vy+=1350*dt;this.x+=this.vx*dt;this.y+=this.vy*dt;this.angle+=this.spin*dt;
      this.x=clamp(this.x,24,game.W-24);
      if(this.y>game.gy-15){
        this.y=game.gy-15;
        if(this.vy>90)Snd.thud();
        this.vy=-Math.abs(this.vy)*.22;this.vx*=.65;this.spin*=.55;
        if(Math.abs(this.vy)<30&&Math.abs(this.vx)<20){this.vy=0;this.vx=0;this.spin=0;this.settled=true;}
      }
      return;
    }
    for(const rider of this.riders)if(!game.fighters.includes(rider)||rider.state!=='lamp_hang'||rider.hp<=0)this.riders.delete(rider);
    // A damped pendulum: a grab adds angular momentum, then gravity and drag
    // carry the lamp and rider together back toward rest.
    this.omega-=1800/this.length*Math.sin(this.theta)*dt;
    this.omega*=Math.exp(-.48*dt);this.theta+=this.omega*dt;
    if(Math.abs(this.theta)>.48){this.theta=clamp(this.theta,-.48,.48);this.omega*=-.25;}
    const p=this.point();this.x=p.x;this.y=p.y;
  }
}
function makeLamps(W){
  return [.2,.5,.8].map(f=>new HangingLamp(f+rnd(-.018,.018),rnd(130,165),W));
}
function drawLamp(g,lamp){
  // The rope and stepped shade are drawn on the same low-resolution layer as
  // the fighters, so moving and rotating lamps stay visibly pixelated.
  g.save();g.strokeStyle='#44434a';g.lineWidth=3;g.lineCap='butt';g.beginPath();
  g.moveTo(lamp.anchorX,lamp.anchorY);
  if(lamp.detached)g.lineTo(lamp.anchorX,WORLD_TOP+28);
  else g.lineTo(lamp.x,lamp.y);
  g.stroke();
  g.translate(lamp.x,lamp.y);g.rotate(lamp.detached?lamp.angle:-lamp.theta*.3);
  g.fillStyle='#17171d';
  g.fillRect(-9,-3,18,3);g.fillRect(-12,0,24,3);g.fillRect(-15,3,30,3);
  g.fillRect(-18,6,36,3);g.fillRect(-21,9,42,6);g.fillRect(-24,15,48,6);
  g.fillStyle='#34343b';
  g.fillRect(-9,0,18,3);g.fillRect(-12,3,24,3);g.fillRect(-15,6,30,3);
  g.fillRect(-18,9,36,6);g.fillRect(-21,15,42,3);
  g.fillStyle='#54525a';g.fillRect(-9,3,9,3);g.fillRect(-12,6,6,3);
  g.fillStyle=lamp.detached?'#81735a':'#ffe0a0';g.fillRect(-18,18,36,3);
  if(!lamp.detached){g.fillStyle='#fff1c5';g.fillRect(-9,18,18,3);}
  g.restore();
}
/* ============================ BACKGROUND ============================ */
function makeBG(W,H,gy,S){
  const c=document.createElement('canvas');const px=S/BODY_PIXEL;c.width=Math.ceil(W*px);c.height=Math.ceil(H*px);let x=c.getContext('2d');x.imageSmoothingEnabled=false;x.scale(px,px);
  let g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'#0b0910');g.addColorStop(.6,'#221620');g.addColorStop(1,'#150f14');x.fillStyle=g;x.fillRect(0,0,W,H);
  x.strokeStyle='rgba(0,0,0,.35)';x.lineWidth=1;
  for(let y=0,r=0;y<gy-60;y+=22,r++){const off=(r%2)*30;for(let xx=-off;xx<W;xx+=60)x.strokeRect(xx,y,60,22);}
  for(let i=0;i<300;i++){x.fillStyle=`rgba(${rnd(60,130)|0},${rnd(25,50)|0},${rnd(25,45)|0},${rnd(.03,.1)})`;x.fillRect(rnd(W),rnd(gy-60),rnd(10,60),rnd(6,22));}
  x.save();x.font="900 56px 'Russo One',Impact,sans-serif";x.textAlign='center';x.shadowColor='#ff2a44';x.shadowBlur=28;x.strokeStyle='#ff4a5e';x.lineWidth=3;x.strokeText('DUMMY FURY',W/2,110);x.fillStyle='rgba(255,120,130,.25)';x.fillText('DUMMY FURY',W/2,110);x.restore();
  // Keep the chain-link, railing and floor on a transparent foreground so
  // animated spectators remain behind the enclosure.
  const front=document.createElement('canvas');front.width=c.width;front.height=c.height;
  x=front.getContext('2d');x.imageSmoothingEnabled=false;x.scale(px,px);
  x.strokeStyle='rgba(180,190,210,.06)';x.lineWidth=1;
  for(let i=-H;i<W+H;i+=22){x.beginPath();x.moveTo(i,20);x.lineTo(i+H,20+H);x.stroke();x.beginPath();x.moveTo(i+H,20);x.lineTo(i,20+H);x.stroke();}
  x.fillStyle='#17151b';x.fillRect(0,gy-62,W,8);x.fillStyle='rgba(255,255,255,.12)';x.fillRect(0,gy-62,W,1.5);
  x.fillStyle='#0f0d12';for(let xx=20;xx<W;xx+=70)x.fillRect(xx,gy-54,5,30);
  x.fillStyle='#14121a';x.fillRect(22,0,10,gy-24);x.fillRect(W-32,0,10,gy-24);
  const ft=gy-24;g=x.createLinearGradient(0,ft,0,H);g.addColorStop(0,'#2d2b33');g.addColorStop(1,'#16151a');x.fillStyle=g;x.fillRect(0,ft,W,H-ft);
  x.fillStyle='rgba(0,0,0,.5)';x.fillRect(0,ft,W,3);
  x.strokeStyle='rgba(0,0,0,.35)';x.lineWidth=1.2;
  for(let k=-14;k<=14;k++){x.beginPath();x.moveTo(W/2+k*34,ft);x.lineTo(W/2+k*120,H);x.stroke();}
  for(let i=1;i<6;i++){const y=ft+(H-ft)*Math.pow(i/6,1.6);x.beginPath();x.moveTo(0,y);x.lineTo(W,y);x.stroke();}
  x.strokeStyle='rgba(255,200,60,.22)';x.lineWidth=3;x.beginPath();x.ellipse(W/2,gy+24,Math.min(W*.4,360),52,0,0,TAU);x.stroke();
  for(let i=0;i<500;i++){x.fillStyle=`rgba(255,255,255,${rnd(.01,.04)})`;x.fillRect(rnd(W),rnd(ft,H),rnd(1,3),1);}
  return {back:c,front};
}
function makeUpperBG(W,S){
  const h=-WORLD_TOP,px=S/BODY_PIXEL,c=document.createElement('canvas');
  c.width=Math.ceil(W*px);c.height=Math.ceil(h*px);
  const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.scale(px,px);g.translate(0,-WORLD_TOP);
  const wall=g.createLinearGradient(0,WORLD_TOP,0,0);
  wall.addColorStop(0,'#050609');wall.addColorStop(.38,'#0b0b11');wall.addColorStop(1,'#171018');
  g.fillStyle=wall;g.fillRect(0,WORLD_TOP,W,h);
  // Dark brick courses continue above the old scene without upper spectators.
  g.strokeStyle='rgba(87,70,77,.12)';g.lineWidth=1;
  for(let y=WORLD_TOP;y<0;y+=22){const off=(Math.floor((y-WORLD_TOP)/22)%2)*30;
    for(let x=-off;x<W;x+=60)g.strokeRect(x,y,60,22);}
  g.strokeStyle='rgba(170,180,198,.055)';g.lineWidth=1;
  for(let x=-h;x<W+h;x+=22){
    g.beginPath();g.moveTo(x,WORLD_TOP);g.lineTo(x+h,0);g.stroke();
    g.beginPath();g.moveTo(x+h,WORLD_TOP);g.lineTo(x,0);g.stroke();
  }
  // Actual ceiling and dark steel trusses, from which the lamp ropes hang.
  g.fillStyle='#090a0e';g.fillRect(0,WORLD_TOP,W,18);
  g.fillStyle='#202128';g.fillRect(0,WORLD_TOP+16,W,6);
  for(let x=32;x<W;x+=150){g.fillStyle='#14151c';g.fillRect(x,WORLD_TOP+22,8,100);
    g.strokeStyle='#191a22';g.lineWidth=4;g.beginPath();g.moveTo(x,WORLD_TOP+24);g.lineTo(x+120,WORLD_TOP+105);g.stroke();}
  g.fillStyle='#101116';g.fillRect(22,WORLD_TOP+18,10,h);g.fillRect(W-32,WORLD_TOP+18,10,h);
  // A wall-to-wall bridge in the upper third. Its 470-unit headroom reaches
  // the ceiling, more than enough for a full standing fighter.
  const y=BRIDGE_Y;
  g.fillStyle='#090b0f';g.fillRect(28,y-4,W-56,27);
  g.fillStyle='#303039';g.fillRect(28,y-4,W-56,6);
  g.fillStyle='#1a1b20';g.fillRect(28,y+3,W-56,12);
  g.fillStyle='#0c0d12';g.fillRect(28,y+15,W-56,8);
  for(let x=38;x<W-38;x+=30){g.fillStyle='#46434a';g.fillRect(x,y-2,12,2);g.fillStyle='#24252a';g.fillRect(x,y+7,17,2);}
  g.strokeStyle='#303138';g.lineWidth=5;g.beginPath();g.moveTo(32,y-75);g.lineTo(W-32,y-75);g.stroke();
  g.strokeStyle='#16171d';g.lineWidth=4;g.beginPath();g.moveTo(32,y-35);g.lineTo(W-32,y-35);g.stroke();
  for(let x=42;x<W-30;x+=95){g.fillStyle='#25262c';g.fillRect(x,y-76,5,76);g.fillStyle='#47454a';g.fillRect(x,y-75,2,4);}
  // Bridge-mounted work lights and their confined, warm illumination.
  for(const x of [W*.28,W*.72]){
    const light=g.createRadialGradient(x,y-52,2,x,y-52,150);
    light.addColorStop(0,'rgba(255,207,135,.22)');light.addColorStop(1,'rgba(255,207,135,0)');
    g.fillStyle=light;g.fillRect(x-150,y-200,300,210);
    g.fillStyle='#0d0e13';g.fillRect(x-14,y-82,28,10);
    g.fillStyle='#cebc91';g.fillRect(x-10,y-78,20,4);
    g.fillStyle='#fff2c8';g.fillRect(x-7,y-77,14,2);
  }
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
  c.setTransform(layer.scale,0,0,layer.scale,0,-(layer.offsetY||0)*layer.scale);
}
// A saturated red beam with a hot pale-red core and a small rounded impact.
function drawBeam(g,lz){
  const fl=.97+.12*Math.sin((lz.age||0)*55);
  g.save();g.lineCap='round';
  const line=()=>{g.beginPath();g.moveTo(lz.sx,lz.sy);g.lineTo(lz.ex,lz.ey);g.stroke();};
  g.strokeStyle='rgba(255,12,42,.32)';g.lineWidth=15*fl;line();
  g.strokeStyle='#ff263e';g.lineWidth=7*fl;line();
  g.strokeStyle='#ffe0e2';g.lineWidth=3;line();
  if(lz.surf!=='none'){
    const flat=lz.surf==='floor'?.55:1;
    const dot=(rx,ry,color)=>{g.fillStyle=color;g.beginPath();g.ellipse(lz.ex,lz.ey,rx,ry,0,0,TAU);g.fill();};
    dot(10*fl,10*fl*flat,'rgba(255,30,45,.55)');
    dot(5,5*flat,'rgba(255,95,90,.9)');dot(2.7,2.7,'#fff1eb');
  }
  g.restore();
}
function drawEyeGlow(g,f){
  const a=f.atk;if(!a||!a.laser||!f.rig)return;
  const e=f.laserEye(),k=f.st<a.chargeT?f.st/a.chargeT:1,s=3+k*9;
  const dot=(r,color)=>{g.fillStyle=color;g.beginPath();g.ellipse(e.x,e.y,r,r*.88,0,0,TAU);g.fill();};
  dot(s,`rgba(255,20,45,${.25+k*.35})`);
  dot(s*.55,`rgba(255,75,85,${.5+k*.4})`);
  dot(2.7,'#ffe7e5');
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
function fighterStillFalling(f){
  if(f.state==='ragdoll'&&f.rag){
    return !(f.rag.frozen||f.rag.sleeping||
      (f.rag.grounded()&&f.rag.p.neck.y>f.gy-100&&f.rag.settle>.12));
  }
  return f.state==='stagger_fall'||f.state==='bleed_collapse'||(f.state==='push_stagger'&&f.shoveWillFall)||
    f.state==='bridge_leap'||(f.state==='air'&&f.vy<0)||
    (f.state==='spawn'&&f.sp===1);
}
function drawSpeech(g,f,W){
  if(!f.rig||!f.visible||f.hp<=0||!f.speech||f.speechTime<=0)return;
  const text=f.speech,singing=f.skin==='chester'&&CHESTER_HUMS.includes(text);
  const unit=3,w=Math.ceil((text.length*9+18+(singing?12:0))/unit)*unit,h=24;
  const x=clamp(Math.round((f.rig.head.x-w/2)/unit)*unit,6,W-w-6);
  const y=Math.round((f.rig.head.y-57)/unit)*unit;
  const tail=clamp(Math.round((f.rig.head.x-x)/unit)*unit,9,w-15);
  g.save();g.imageSmoothingEnabled=false;
  // Stepped black outline and tail, with a plain white interior. There is no
  // opacity or position animation: speech appears and disappears immediately.
  g.fillStyle='#101014';g.fillRect(x,y,w,h);g.fillRect(x+tail,y+h,9,3);g.fillRect(x+tail+3,y+h+3,3,3);
  g.fillStyle='#fff';g.fillRect(x+3,y+3,w-6,h-6);g.fillRect(x+tail+3,y+h-3,3,6);
  g.fillStyle=f.col.hex;
  if(singing){ // a tiny pixel note makes the sung fragments distinct from speech
    g.fillRect(x+9,y+6,3,12);g.fillRect(x+12,y+6,6,3);g.fillRect(x+6,y+15,6,3);
  }
  g.font="9px 'Press Start 2P', monospace";g.textAlign='center';g.textBaseline='middle';
  g.fillText(text,x+w/2+(singing?6:0),y+h/2+1);
  g.restore();
}
/* ============================ SANDBOX GAME ENGINE ============================ */
const Game={
  W:960,H:540,gy:468,S:1,cv:null,
  shake:0,hs:0,ts:1,tsT:0,
  fighters:[],lamps:[],detachedLamps:0,
  droppedBats:[],ducks:[],camera:null,audience:null,
  autoSpawn:true,shiftCrouch:false,
  respawnTimer:0,
  koCount:0,
  fx:null,
  init({sandbox=false}={}){
    this.cv=document.querySelector('#gameCv');
    this.ctx=this.cv.getContext('2d');
    this.ctx.imageSmoothingEnabled=false;
    this.fighters=[];this.droppedBats=[];this.ducks=[];this.lamps=[];this.detachedLamps=0;
    this.koCount=0;this.shake=0;this.hs=0;this.ts=1;this.tsT=0;this.respawnTimer=0;this.autoSpawn=!sandbox;this.shiftCrouch=false;
    this.camera={x:this.W/2,y:270,targetY:270,zoom:1,vignette:0};this.audience=null;
    skinCursor=0;
    this.fx=new FX();
    this.dc=document.createElement('canvas');
    this.dctx=this.dc.getContext('2d');
    this.resize();
    this.audience=new Audience(this.W,this.gy);
    this.lamps=makeLamps(this.W);
    this.camera.x=this.W/2;
    this.fx.decal=this.dctx;
    this.fx.floorY=this.gy;
    if(!sandbox)this.spawnPair();
  },
  resize(){
    const iw=innerWidth,ih=innerHeight;if(!iw||!ih)return;
    const asp=iw/ih;this.W=clamp(asp*540,800,1300);
    // On narrow/portrait screens fit the whole canvas in the viewport instead.
    const displayH=Math.min(ih,iw*540/this.W);this.displayScale=displayH/540;
    const ratio=Math.min(devicePixelRatio||1,1.5,810/displayH);this.S=ratio*this.displayScale;
    this.cv.width=Math.round(this.W*this.S);this.cv.height=Math.round(540*this.S);
    this.cv.style.height=displayH+'px';this.cv.style.width=(this.W*displayH/540)+'px';
    this.cv.style.top=((ih-displayH)/2)+'px';
    if(this.camera){
      const halfW=this.W/(2*this.camera.zoom),halfH=270/this.camera.zoom;
      this.camera.x=clamp(this.camera.x,halfW,this.W-halfW);
      this.camera.y=clamp(this.camera.y,WORLD_TOP+halfH,540-halfH);
      this.camera.targetY=clamp(this.camera.targetY??this.camera.y,WORLD_TOP+halfH,540-halfH);
    }
    for(const lamp of this.lamps)lamp.resize(this.W);
    if(this.audience)this.audience.resize(this.W,this.gy);
    if(this.fx){this.fx.floorY=this.gy;this.fx.bloodField.resize(this.W,this.gy);}
    this.buildBG();
    for(const f of this.fighters){f.minX=70;f.maxX=this.W-70;}
  },
  buildBG(){
    this.bg=makeBG(this.W,540,this.gy,this.S);this.upperBG=makeUpperBG(this.W,this.S);this.vig=makeVignette(this.W,540,this.S);
    const keep=this.dc&&this.dc.width>0?this.dc:null;
    const old=document.createElement('canvas');
    if(keep){old.width=this.dc.width;old.height=this.dc.height;old.getContext('2d').drawImage(this.dc,0,0);}
    const bodyScale=this.S/BODY_PIXEL, headScale=this.S/HEAD_PIXEL;
    const makeLayer=(scale)=>{
      const c=document.createElement('canvas');
      c.width=Math.ceil(this.W*scale);c.height=Math.ceil(540*scale);
      const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.setTransform(scale,0,0,scale,0,0);
      return {canvas:c,ctx:g,scale,offsetY:0};
    };
    this.audienceLayer=makeLayer(bodyScale);
    this.lampLayer=makeLayer(bodyScale);
    this.bodyLayer=makeLayer(bodyScale);
    this.goreLayer=makeLayer(bodyScale);this.goreKey=null;
    this.headLayer=makeLayer(headScale);
    this.batLayer=makeLayer(bodyScale);
    this.frontLayer=makeLayer(bodyScale);
    this.fxLayer=makeLayer(bodyScale);
    // Tiny round laser particles need full resolution; the rest of the game
    // and the beam itself retain their deliberately pixelated layers.
    this.laserLayer=makeLayer(this.S);
    this.markLayer=makeLayer(bodyScale);
    this.bloodLayer=makeLayer(bodyScale);this.puddleMaskLayer=makeLayer(bodyScale);
    this.reflectionLayer=makeLayer(bodyScale);this.bloodVersion=-1;
    this.dc.width=Math.ceil(this.W*bodyScale);this.dc.height=Math.ceil(540*bodyScale);
    this.dctx=this.dc.getContext('2d');this.dctx.imageSmoothingEnabled=false;
    if(keep){this.dctx.setTransform(1,0,0,1,0,0);this.dctx.drawImage(old,0,0,this.dc.width,this.dc.height);}
    this.dctx.setTransform(bodyScale,0,0,bodyScale,0,0);
    if(this.fx)this.fx.decal=this.dctx;
  },
  detachLamp(lamp){
    if(!lamp||!this.lamps.includes(lamp)||lamp.detached||this.detachedLamps>=2)return false;
    const riders=[...lamp.riders];
    lamp.detached=true;this.detachedLamps++;
    lamp.vx=clamp(lamp.omega*lamp.length*Math.cos(lamp.theta),-240,240);
    lamp.vy=-Math.abs(lamp.omega*lamp.length*Math.sin(lamp.theta));
    lamp.angle=-lamp.theta*.3;lamp.spin=lamp.omega*2;lamp.settled=false;
    if(this.fx)this.fx.spark(lamp.x,lamp.y,5,'255,195,100');
    for(const rider of riders)rider.releaseLamp('break');
    Snd.thud();return true;
  },
  spawnFighter(x,dir,delay,skin,options={}){
    const dead=this.fighters.filter(f=>f.hp<=0);
    if(dead.length>6){
      const idx=this.fighters.indexOf(dead[0]);
      if(idx>=0)this.fighters.splice(idx,1);
      if(this.droppedBats.length>6)this.droppedBats.shift();
    }
    const chosenSkin=skin&&SKIN_META[skin]?skin:pickSkin();
    const meta=SKIN_META[chosenSkin];
    const px=clamp(x!==undefined?x:rnd(130,this.W-130),80,this.W-80);
    const d=dir||(px<this.W/2?1:-1);
    const onBridge=!!options.onBridge;
    const f=new Fighter({
      fx:this.fx,gy:onBridge?BRIDGE_Y:this.gy,minX:70,maxX:this.W-70,spawnY:options.spawnY??620,
      skin:chosenSkin,col:{hex:meta.color},x:px,dir:d,
      name:`#${NEXT_ID} · ${meta.label}`
    });
    f.spawn(delay!==undefined?delay:.05);f.onBridge=onBridge;
    this.fighters.push(f);
    return f;
  },
  spawnAt(x,y,skin){
    if(!Number.isFinite(x)||!Number.isFinite(y)||!SKIN_META[skin])return null;
    const px=clamp(x,80,this.W-80),onBridge=y<=BRIDGE_Y;
    const floor=onBridge?BRIDGE_Y:this.gy;
    // Keep the head inside the ceiling/under the bridge while dropping the
    // fighter onto the level actually clicked, not through the bridge.
    const maxHeight=onBridge?BRIDGE_Y-WORLD_TOP-180:this.gy-(BRIDGE_Y+18+170);
    const height=clamp(floor-y,70,maxHeight);
    const occupied=this.fighters.some(f=>{
      if(f.state==='spawn'&&Math.abs(f.x-px)<65&&Math.abs(f.gy-floor)<50)return true;
      if(!f.visible||!f.rig)return false;
      const R=f.rig,top=Math.min(R.head.y-30,R.pel.y-15),bottom=Math.max(R.aN.y,R.aF.y,R.pel.y)+20;
      return Math.abs(R.pel.x-px)<55&&y>=top&&y<=bottom;
    });
    if(occupied)return null;
    const alive=this.fighters.filter(f=>f.hp>0&&Math.abs(f.gy-floor)<100);
    let dir=px<this.W/2?1:-1;
    if(alive.length){
      const nearest=alive.reduce((a,b)=>Math.abs(a.x-px)<=Math.abs(b.x-px)?a:b);
      dir=nearest.x>=px?1:-1;
    }
    return this.spawnFighter(px,dir,0,skin,{onBridge,spawnY:height});
  },
  spawnPair(){
    this.spawnFighter(this.W*.32,1,.08);
    this.spawnFighter(this.W*.68,-1,.32);
  },
  updateCamera(dt){
    const c=this.camera;if(!c)return;
    const k=1-Math.exp(-dt*7);
    c.zoom+=(1-c.zoom)*k;c.x+=(this.W/2-c.x)*k;
    c.targetY=clamp(c.targetY??c.y,WORLD_TOP+VIEW_H/2,VIEW_H/2);
    c.y+=(c.targetY-c.y)*k;
  },
  moveCamera(delta){
    if(!this.camera||!Number.isFinite(delta))return;
    this.camera.targetY=clamp(this.camera.targetY+delta,WORLD_TOP+VIEW_H/2,VIEW_H/2);
  },
  resetCamera(){if(this.camera)this.camera.targetY=VIEW_H/2;},
  screenToWorldY(y){
    const c=this.camera;return c?(y-this.H/2)/c.zoom+c.y:y;
  },
  screenToWorldX(x){
    const c=this.camera;return c?(x-this.W/2)/c.zoom+c.x:x;
  },
  clearBodies(){
    this.fighters=this.fighters.filter(f=>f.hp>0);
    this.fx.gibs=[];
    this.droppedBats=[];
  },
  clearBlood(){
    this.fx.clearBlood();
    for(const f of this.fighters){
      if(f.hp>0)f.wounds=newWounds();
      f.bloodStains=[];f.footBlood={N:0,F:0};f.jointBlood={kN:0,kF:0,eN:0,eF:0};f.bloodFootfall=null;
    }
  },
  // Ray against the arena: stops at the first fighter body, the floor, a wall post or the ceiling.
  castRay(x,y,ux,uy,self){
    const W=this.W,gy=this.gy;
    const others=this.fighters.filter(g=>g!==self&&g.rig&&g.state!=='spawn'&&g.visible);
    let px=x,py=y,previousY=y;
    for(let t=4;t<3400;t+=4){
      px=x+ux*t;py=y+uy*t;
      for(const g of others)if(bodyHit(g,px,py))return{x:px,y:py,surf:'body',f:g};
      if((previousY<BRIDGE_Y&&py>=BRIDGE_Y)||(previousY>BRIDGE_Y+18&&py<=BRIDGE_Y+18))
        return{x:px,y:previousY<BRIDGE_Y?BRIDGE_Y:BRIDGE_Y+18,surf:'bridge',f:null};
      previousY=py;
      if(py>=gy+3)return{x:px,y:gy+3,surf:'floor',f:null};
      if(py<=WORLD_TOP+8)return{x:px,y:WORLD_TOP+8,surf:'wall',f:null};
      if(px<=34)return{x:34,y:py,surf:'wall',f:null};
      if(px>=W-34)return{x:W-34,y:py,surf:'wall',f:null};
    }
    return{x:px,y:py,surf:'none',f:null};
  },
  explodeHead(v,att,x,y){
    if(v.headDestroyed)return;
    v.headDestroyed=true;
    const p=v.rig?.head||{x,y};
    this.fx.headFragments(p.x,p.y,att.dir,v.id,v.gy);
    this.fx.blood(p.x,p.y,att.dir,65,1.5);
    for(const f of this.fighters){
      if(f===v||!f.rig||!f.visible)continue;
      if(f.gorePieces){splashSevered(f,p);continue;}
      const d=Math.min(Math.hypot(f.rig.head.x-p.x,f.rig.head.y-p.y),
        Math.hypot(f.rig.pel.x-p.x,f.rig.pel.y-p.y));
      if(d>190)continue;
      const n=Math.round(14+16*(1-d/190));
      for(let i=0;i<n;i++){
        const seg=BURN_SEGS[(Math.random()*BURN_SEGS.length)|0];
        if(i%7===0)f.bloodStains.push({seg:'head',layer:'head',lx:rnd(-11,11),ly:rnd(-19,10),kind:'blood',age:0,sz:rnd(.4,1)});
        else f.bloodStains.push({seg:seg[0],layer:seg[4],t:rnd(.12,.88),s:rnd(-seg[3]*.7,seg[3]*.7),kind:'blood',age:0,sz:rnd(.3,1)});
      }
      if(f.bloodStains.length>36)f.bloodStains.splice(0,f.bloodStains.length-36);
    }
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
    a=a||{};
    const delayed=!a.bleedOut&&!a.noStagger&&!a.preserveRagdoll&&!a.keepRag&&
      (a.launch||a.pw>=.4)&&v.canStagger(att)&&Math.random()<STAGGER_KO_CHANCE;
    v.breakChoke();v.boxing=false;v.shoveTarget=null;v.duckTarget=null;v.hp=0;
    if((v.skin==='negan'||v.skin==='chester')&&!v.batLost){
      const R=v.rig;
      const bx=R&&R.bd?R.wN.x+R.bd.x*24:v.x+v.dir*26;
      const by=R&&R.bd?R.wN.y+R.bd.y*24:v.gy-v.y-96;
      const ang=R&&R.bd?Math.atan2(R.bd.y,R.bd.x):-.8*v.dir;
      v.batLost=true;
      this.droppedBats.push({
        x:bx,y:by,gy:v.gy,flip:v.dir,kind:v.skin==='chester'?'guitar':'bat',damage:v.guitarDamage||0,
        vx:a.bleedOut?(v.vx||0)*.2:att.dir*rnd(130,250)+(v.vx||0)*.35,
        vy:a.bleedOut?-40:-rnd(190,310),
        ang,
        va:a.bleedOut?0:(att.dir||1)*rnd(7,13),
        settled:false,
        fade:0
      });
    }
    this.koCount++;
    if(this.audience)this.audience.cheer();
    if(a.bleedOut){
      // Blood loss ends in an exhausted, gradual collapse, not the impact KO
      // explosion, hit-stop or a fresh launch of an already prone body.
      if(v.state!=='ragdoll'){
        if(v.y>5)v.toRagdoll(0,0,true);
        else{v.collapseFrom=v.cur?Object.assign({},v.cur):Object.assign({},D);
          v.state='bleed_collapse';v.st=0;v.vx*=.35;v.vy=0;v.y=0;}
      }
      this.respawnTimer=2.4;return;
    }
    if((a.preserveRagdoll||a.keepRag)&&v.state==='ragdoll'&&v.rag){
      v.rag.t=0;v.rag.settle=0;
      this.fx.blood(v.x,v.gy-22,att.dir,16,.72);
    }else{
      if(delayed)v.startStagger();
      else v.toRagdoll(att.dir*(a.lvx||320)*1.15,(a.lvy||520)+150);
      this.fx.blood(v.x,v.gy-v.y-125,att.dir,16,.72);
    }
    this.ts=.32;this.tsT=.95;
    Snd.ko();Snd.splat(1.2);
    this.shake=15;
    this.respawnTimer=2.4;
  },
  findBestOpponent(f){
    let best=null,bestScore=1e9;
    for(const o of this.fighters){
      if(o===f||o.hp<=0)continue;
      const dist=Math.abs(o.x-f.x);
      const vertical=f.rig&&o.rig?Math.abs(f.rig.pel.y-o.rig.pel.y):Math.abs((f.gy-f.y)-(o.gy-o.y));
      const downPenalty=(o.state==='ragdoll'||o.state==='getup'||o.state==='spawn')?280:0;
      const sc=dist+Math.min(600,vertical*.5)+downPenalty;
      if(sc<bestScore){bestScore=sc;best=o;}
    }
    return best;
  },
  update(dt){
    const rdt=dt;
    if(this.hs>0){this.hs-=rdt;dt*=.05;}
    if(this.tsT>0){this.tsT-=rdt;dt*=this.ts;if(this.tsT<=0)this.ts=1;}
    this.shake*=Math.exp(-rdt*9);
    const alive=this.fighters.filter(f=>f.hp>0);
    const keyboardFighter=this.shiftCrouch?alive[0]:null;
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
    for(const lamp of this.lamps)lamp.update(dt,this);
    // Owners/throwers update before the restrained fighter, independent of
    // spawn order, then the holder's hands are aligned to the current neck.
    const dependent=f=>['choked','counter_carried'].includes(f.state);
    const order=[...this.fighters.filter(f=>!dependent(f)),...this.fighters.filter(dependent)];
    for(const f of order){
      const opp=f.hp>0?this.findBestOpponent(f):null;
      if(f.hp>0&&f===keyboardFighter){
        // Shift is a temporary crouch command for the first living fighter;
        // releasing it returns the fighter to the normal autonomous AI.
        const c=f.ctrl;c.mx=0;c.jump=false;c.punch=false;c.run=false;c.hop=false;c.laser=false;c.noFace=false;c.crouch=true;
      }else if(f.hp>0){
        f.autopilot.update(dt,f,opp,this.fighters);
      }else{
        const c=f.ctrl;c.mx=0;c.jump=false;c.punch=false;c.run=false;c.hop=false;c.laser=false;c.noFace=false;c.crouch=false;
      }
      f.update(dt,opp,this.fighters);
      f.updateSpeech(dt,opp);
    }
    for(const f of this.fighters){
      if(f.state==='choke'&&f.chokeTarget&&f.chokeTarget.rig)f.buildRig(0);
    }
    updateDucks(this,dt,BRIDGE_Y,WORLD_TOP);
    for(const b of this.droppedBats){
      if(b.settled){b.fade=Math.min(.14,b.fade+dt*.018);continue;}
      b.vy+=1650*dt;
      b.x+=b.vx*dt;
      b.y+=b.vy*dt;
      b.ang+=b.va*dt;
      if(b.x<56){b.x=56;b.vx=Math.abs(b.vx)*.45;}
      else if(b.x>this.W-56){b.x=this.W-56;b.vx=-Math.abs(b.vx)*.45;}
      const uy=Math.sin(b.ang),floorY=b.gy+2;
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
      if(A.hp<=0||A.y>=60||['ragdoll','spawn','run','counter_carried'].includes(A.state))continue;
      for(let j=i+1;j<alive.length;j++){
        const B=alive[j];
        if(B.hp<=0||B.y>=60||Math.abs((A.gy-A.y)-(B.gy-B.y))>100||['ragdoll','spawn','run','counter_carried'].includes(B.state))continue;
        if(A.chokeTarget===B||B.chokeTarget===A||A.flankTarget===B||B.flankTarget===A||A.lampPullTarget===B||B.lampPullTarget===A)continue;
        const dx=B.x-A.x,m=54;
        if(Math.abs(dx)<m){
          const s=dx>=0?1:-1,push=(m-Math.abs(dx))/2;
          const fixedA=['choke','choked','counter_throw'].includes(A.state);
          const fixedB=['choke','choked','counter_throw'].includes(B.state);
          const ok1=!fixedA&&A.x-s*push>=A.minX&&A.x-s*push<=A.maxX;
          const ok2=!fixedB&&B.x+s*push>=B.minX&&B.x+s*push<=B.maxX;
          if(ok1&&ok2){A.x-=s*push;B.x+=s*push;}
          else if(ok1)A.x=clamp(A.x-s*push*2,A.minX,A.maxX);
          else if(ok2)B.x=clamp(B.x+s*push*2,B.minX,B.maxX);
        }
      }
    }
    this.fx.update(dt);
    if(this.audience)this.audience.update(rdt);
    this.updateCamera(rdt);
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
    if(camera){ctx.translate(W/2,H/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);}
    const viewY=camera?clamp(camera.y-H/2,WORLD_TOP,0):0;
    for(const layer of [this.lampLayer,this.bodyLayer,this.goreLayer,this.headLayer,this.batLayer,this.frontLayer,this.fxLayer,this.laserLayer,this.markLayer])layer.offsetY=viewY;
    ctx.drawImage(this.upperBG,0,WORLD_TOP,W,-WORLD_TOP);
    ctx.drawImage(this.bg.back,0,0,W,H);
    clearPixelLayer(this.audienceLayer);
    if(this.audience)this.audience.draw(this.audienceLayer.ctx);
    ctx.drawImage(this.audienceLayer.canvas,0,0,W,H);
    ctx.drawImage(this.bg.front,0,0,W,H);
    clearPixelLayer(this.lampLayer);
    for(const lamp of this.lamps)drawLamp(this.lampLayer.ctx,lamp);
    ctx.drawImage(this.lampLayer.canvas,0,viewY,W,H);
    ctx.drawImage(this.dc,0,0,W,H);
    const blood=this.fx.bloodField;
    if(this.bloodVersion!==blood.version){
      clearPixelLayer(this.bloodLayer);blood.drawBase(this.bloodLayer.ctx);
      clearPixelLayer(this.puddleMaskLayer);blood.drawReflectionMask(this.puddleMaskLayer.ctx);
      this.bloodVersion=blood.version;
    }
    ctx.drawImage(this.bloodLayer.canvas,0,0,W,H);
    if(blood.hasPuddles()){
      clearPixelLayer(this.reflectionLayer);
      blood.drawReflections(this.reflectionLayer.ctx,this.fighters,this.lamps,this.audience?.time||0,this.puddleMaskLayer.canvas);
      ctx.drawImage(this.reflectionLayer.canvas,0,0,W,H);
    }
    // fading laser scorch marks on the floor / walls
    if(this.fx.marks.length){
      clearPixelLayer(this.markLayer);
      this.fx.drawMarks(this.markLayer.ctx);
      ctx.drawImage(this.markLayer.canvas,0,viewY,W,H);
    }
    // dropped Lucille bats from K.O.'d Negans
    if(this.droppedBats.length){
      clearPixelLayer(this.batLayer);
      for(const b of this.droppedBats){
        drawDroppedBat(this.batLayer.ctx,b);
      }
      ctx.drawImage(this.batLayer.canvas,0,viewY,W,H);
    }

    const severed=this.fighters.filter(f=>f.gorePieces&&f.rig);
    // A duck is visible over resting remains, but falling bodies/fragments
    // pass in front of it. Keep the old cache for settled gore.
    const fallingGore=this.ducks.length?severed.map(f=>({f,pieces:f.gorePieces.filter(p=>!p.settled)})).filter(e=>e.pieces.length):[];
    const earlyGore=severed.map(f=>({f,pieces:this.ducks.length?f.gorePieces.filter(p=>p.settled):f.gorePieces})).filter(e=>e.pieces.length);
    if(earlyGore.length){
      const moving=earlyGore.some(e=>e.pieces.some(p=>!p.settled));
      const key=`${viewY}|${earlyGore.map(e=>goreVisualKey(e.f)+':'+e.pieces.map(p=>e.f.gorePieces.indexOf(p)).join(',')).join('|')}`;
      if(moving||key!==this.goreKey){
        clearPixelLayer(this.goreLayer);
        for(const e of earlyGore)drawGorePieces(this.goreLayer.ctx,e.pieces,e.f);
        this.goreKey=moving?null:key;
      }
      ctx.drawImage(this.goreLayer.canvas,0,viewY,W,H);
    }else this.goreKey=null;

    const dependent=f=>['choked','counter_carried'].includes(f.state);
    const baseOrder=[...this.fighters.filter(f=>f.hp<=0),
      ...this.fighters.filter(f=>f.hp>0&&!dependent(f)),
      ...this.fighters.filter(f=>f.hp>0&&dependent(f))];
    const ordered=this.ducks.length?[...baseOrder.filter(f=>!fighterStillFalling(f)),...baseOrder.filter(f=>fighterStillFalling(f))]:baseOrder;
    let ducksDrawn=false;
    const paintDucks=()=>{
      if(ducksDrawn||!this.ducks.length)return;
      clearPixelLayer(this.batLayer);
      for(const d of this.ducks)drawDuck(this.batLayer.ctx,d.x,d.y,d.angle,d.facing);
      ctx.drawImage(this.batLayer.canvas,0,viewY,W,H);ducksDrawn=true;
    };
    for(const f of ordered){
      if(!f.rig||(f.state==='spawn'&&f.sp===0)||f.gorePieces)continue;
      if(this.ducks.length&&fighterStillFalling(f))paintDucks();
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
        q.setTransform(layer.scale,0,0,layer.scale,0,-layer.offsetY*layer.scale);
        try{paint(q);}catch(err){console.warn('Fighter layer draw recovered:',f.id,err);}
        q.restore();
        if(doTint)tintLayer(layer);
        ctx.globalAlpha=1;
        ctx.globalCompositeOperation='source-over';
        ctx.filter='none';
        ctx.drawImage(layer.canvas,0,layer.offsetY,W,H);
      };
      paintLayer(this.batLayer,q=>drawFighterShadow(q,f),false);
      if((f.skin==='negan'||f.skin==='chester')&&!f.batLost&&f.hp>0&&stowsBat(f))paintLayer(this.batLayer,q=>drawStowedBat(q,f));
      paintLayer(this.bodyLayer,q=>{drawFighterBody(q,f);if(f.laserSlice)drawSliceProgress(q,f);});
      paintLayer(this.headLayer,q=>drawFighterHead(q,f));
      if(f.state==='duck_throw'&&!f.duckReleased&&f.st>=.12&&f.rig.wF){
        paintLayer(this.batLayer,q=>drawDuck(q,f.rig.wF.x-f.dir*5,f.rig.wF.y-8,0,f.dir),false);
      }
      if((f.skin==='negan'||f.skin==='chester')&&!f.batLost&&f.hp>0&&f.rig.bd){
        paintLayer(this.batLayer,q=>drawBat(q,f));
      }
      paintLayer(this.frontLayer,q=>{drawFighterFrontArm(q,f);if(f.laserSlice)drawSliceProgress(q,f);});
      if(f.bleed&&f.bleed.pressing&&f.bleed.arm==='F')
        paintLayer(this.frontLayer,q=>drawPixelArm(q,f.rig,f,'F',true,SK_[f.skin]||SK_.jane));
      // The near arm wraps in front of the opponent's neck rather than being
      // hidden behind the opponent's sprite.
      if(f.state==='choked'&&f.chokedBy&&f.chokedBy.rig){
        const holder=f.chokedBy;
        paintLayer(this.frontLayer,q=>drawFighterFrontArm(q,holder),false);
      }else if(f.state==='counter_carried'&&f.chokeTarget&&f.chokeTarget.rig){
        const thrower=f.chokeTarget;
        paintLayer(this.frontLayer,q=>drawFighterFrontArm(q,thrower),false);
      }
      ctx.restore();
    }

    paintDucks();
    if(fallingGore.length){
      clearPixelLayer(this.goreLayer);
      for(const e of fallingGore)drawGorePieces(this.goreLayer.ctx,e.pieces,e.f);
      ctx.drawImage(this.goreLayer.canvas,0,viewY,W,H);this.goreKey=null;
    }
    clearPixelLayer(this.fxLayer);
    for(const f of this.fighters){
      if(f.state==='attack'&&f.atk&&f.atk.laser){
        drawEyeGlow(this.fxLayer.ctx,f);
        if(f.lz&&f.lz.on)drawBeam(this.fxLayer.ctx,f.lz);
      }
      if(f.dizzyAlpha>.02){
        drawDizzyStars(this.fxLayer.ctx,f);
      }
    }
    this.fx.draw(this.fxLayer.ctx);
    ctx.drawImage(this.fxLayer.canvas,0,viewY,W,H);
    if(this.fx.laserSparks.length){
      clearPixelLayer(this.laserLayer);this.fx.drawLaserSparks(this.laserLayer.ctx);
      ctx.drawImage(this.laserLayer.canvas,0,viewY,W,H);
    }

    ctx.save();ctx.globalCompositeOperation='lighter';
    for(const lamp of this.lamps){
      if(lamp.detached)continue;
      const lx=lamp.x,ly=lamp.y+18,fl=.85+Math.sin(performance.now()/90+lx)*.05;
      const g=ctx.createRadialGradient(lx,ly,4,lx,ly,380);
      g.addColorStop(0,`rgba(255,215,150,${.3*fl})`);
      g.addColorStop(1,'rgba(255,215,150,0)');
      ctx.fillStyle=g;ctx.fillRect(lx-380,ly-300,760,H);
    }
    ctx.restore();
    ctx.restore(); // Camera transform; vignettes stay fixed to the screen.
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(this.vig,0,0,W,H);
    if(this.fighters.some(f=>f.speechTime>0)){
      ctx.save();ctx.translate(shakeX,shakeY);
      if(camera){ctx.translate(W/2,H/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);}
      for(const f of this.fighters)drawSpeech(ctx,f,W);
      ctx.restore();
    }
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.setTransform(S,0,0,S,0,0);
  }
};
/* ============================ ENTRY POINT ============================ */
export function startGame(){
  // The public game starts empty; the legacy pair/auto-spawn setup remains
  // available to the engine's autonomous combat simulations.
  Game.init({sandbox:true});
  if(document.fonts?.load)document.fonts.load("9px 'Press Start 2P'").catch(()=>{});
  const cv=Game.cv;
  let gesture=null,selectedSkin=null,menuOpen=false;
  const touches=new Set();
  const capture=e=>{if(cv.setPointerCapture)try{cv.setPointerCapture(e.pointerId);}catch{}};
  const cancelGesture=()=>{gesture=null;cv.classList?.remove('panning');};
  const onDown=e=>{
    const touch=e.pointerType==='touch';
    if(touch){
      touches.add(e.pointerId);capture(e);
      // A second finger can never turn a pan or a multi-touch gesture into a tap.
      if(touches.size>1){if(gesture)gesture.suppressSpawn=true;return;}
    }
    if(gesture)return;
    const button=e.button??0;
    if(!touch&&button!==0&&button!==2)return;
    const kind=touch?'touch':button===2?'pan':'place';
    Snd.init();
    gesture={id:e.pointerId,kind,startX:e.clientX,startY:e.clientY,lastY:e.clientY,dragged:false,suppressSpawn:menuOpen};
    if(!touch)capture(e);
    if(kind==='pan')cv.classList?.add('panning');
    e.preventDefault?.();
  };
  const onMove=e=>{
    if(!gesture||e.pointerId!==gesture.id)return;
    const g=gesture,wasDragged=g.dragged;
    if(Math.hypot(e.clientX-g.startX,e.clientY-g.startY)>8)g.dragged=true;
    if(g.kind==='pan'||(g.kind==='touch'&&g.dragged)){
      const rect=cv.getBoundingClientRect();
      // Include the initial movement when a touch crosses the drag threshold.
      const fromY=g.kind==='touch'&&!wasDragged?g.startY:g.lastY;
      if(rect.height)Game.moveCamera(-(e.clientY-fromY)*VIEW_H/(rect.height*Game.camera.zoom));
    }
    g.lastY=e.clientY;
  };
  const onUp=e=>{
    if(e.pointerType==='touch')touches.delete(e.pointerId);
    if(!gesture||e.pointerId!==gesture.id)return;
    const g=gesture;
    const moved=g.dragged||Math.hypot(e.clientX-g.startX,e.clientY-g.startY)>8;
    cancelGesture();
    if(g.kind==='pan'||moved||g.suppressSpawn||menuOpen||!selectedSkin)return;
    const rect=cv.getBoundingClientRect();
    if(!rect.width||!rect.height||e.clientX<rect.left||e.clientX>rect.left+rect.width||
       e.clientY<rect.top||e.clientY>rect.top+rect.height)return;
    const screenX=(e.clientX-rect.left)/rect.width*Game.W;
    const screenY=(e.clientY-rect.top)/rect.height*VIEW_H;
    Game.spawnAt(Game.screenToWorldX(screenX),Game.screenToWorldY(screenY),selectedSkin);
  };
  const onCancel=e=>{
    if(e.pointerType==='touch')touches.delete(e.pointerId);
    if(gesture&&e.pointerId===gesture.id)cancelGesture();
  };
  const onResize=()=>{touches.clear();cancelGesture();Game.resize();};
  const onCtx=e=>e.preventDefault();
  const onWheel=e=>{
    e.preventDefault();
    const unit=e.deltaMode===1?28:e.deltaMode===2?VIEW_H:1;
    Game.moveCamera(e.deltaY*unit);
  };
  const onKeyDown=e=>{
    if(e.key==='Shift'&&!e.ctrlKey&&!e.altKey&&!e.metaKey)Game.shiftCrouch=true;
    if(!e.ctrlKey&&!e.altKey&&!e.metaKey&&!['INPUT','TEXTAREA','SELECT','BUTTON'].includes(e.target?.tagName)){
      if(e.key==='ArrowUp'||e.key==='PageUp'){e.preventDefault();Game.moveCamera(-180);}
      if(e.key==='ArrowDown'||e.key==='PageDown'){e.preventDefault();Game.moveCamera(180);}
      if(e.key==='Home'){e.preventDefault();Game.resetCamera();}
    }
  };
  const onKeyUp=e=>{if(e.key==='Shift')Game.shiftCrouch=false;};
  const onBlur=()=>{Game.shiftCrouch=false;touches.clear();cancelGesture();};
  cv.addEventListener('pointerdown',onDown);cv.addEventListener('pointermove',onMove);cv.addEventListener('pointerup',onUp);cv.addEventListener('pointercancel',onCancel);cv.addEventListener('lostpointercapture',onCancel);
  cv.addEventListener('contextmenu',onCtx);cv.addEventListener('wheel',onWheel,{passive:false});
  addEventListener('resize',onResize);
  addEventListener('keydown',onKeyDown);addEventListener('keyup',onKeyUp);addEventListener('blur',onBlur);
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
    selectSkin(skin){selectedSkin=SKIN_META[skin]?skin:null;cancelGesture();},
    setMenuOpen(open){menuOpen=!!open;cancelGesture();},
    destroy(){
      running=false;cancelAnimationFrame(raf);touches.clear();cancelGesture();
      cv.removeEventListener('pointerdown',onDown);cv.removeEventListener('pointermove',onMove);cv.removeEventListener('pointerup',onUp);cv.removeEventListener('pointercancel',onCancel);cv.removeEventListener('lostpointercapture',onCancel);
      cv.removeEventListener('contextmenu',onCtx);cv.removeEventListener('wheel',onWheel);
      removeEventListener('resize',onResize);
      removeEventListener('keydown',onKeyDown);removeEventListener('keyup',onKeyUp);removeEventListener('blur',onBlur);
      Game.shiftCrouch=false;
    }
  };
}
