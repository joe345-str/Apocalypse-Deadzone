// ================================================================
//  DEAD ZONE  v3.0
//  Assets: sprite soldier/zombies/gun, Web Audio SFX bank,
//  Apocalyptic env: asteroids, earthquakes, screen shake,
//  falling debris, fire columns, ground cracks, ash particles
// ================================================================

// ── GLOBALS ──────────────────────────────────────────────────────
const canvas   = document.getElementById('gc');
const C        = canvas.getContext('2d');
const HUD_H    = 56;
const DPR      = Math.min(window.devicePixelRatio || 1, 2);
let G          = {};
let animId     = null;
let paused     = false;
let viewMode   = '3p';
let keys       = {};
let mouseX     = 300, mouseY = 300;
let mShooting  = false;
let mobileFire = false;
let mDirs      = {u:false,d:false,l:false,r:false};
let shootCD    = 0;
let groanTimer = 120;
let autoAim    = false;
let aimTarget  = null;

// Screen shake state
let shakeX=0, shakeY=0, shakeMag=0, shakeDur=0;

function cW(){ return canvas.width  / DPR; }
function cH(){ return canvas.height / DPR; }

// ================================================================
//  SPRITE CACHE SYSTEM
// ================================================================
const SPRITES = {};



// ── NAVIGATION ───────────────────────────────────────────────────
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el=document.getElementById(id);
  if(el) el.classList.add('active');
}
function backToTitle(){
  cancelAnimationFrame(animId); paused=false; hideAllOvr(); SFX.stopMusic();
  autoAim=false; aimTarget=null; showScreen('sTitle');
}
function quitTofunction makeSprite(name, w, h, drawFn){
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;

  const cx = cv.getContext('2d');

  cx.save();
  cx.translate(w/2, h/2);

  drawFn(cx);

  cx.restore();

  SPRITES[name] = cv;
}Title(){ backToTitle(); }
function gotoInfo(id){
  if(document.getElementById('sGame').classList.contains('active')&&!paused){
    paused=true; cancelAnimationFrame(animId);
  }
  showScreen(id);
}
function smartBack(){
  if(G.player&&paused) returnToGame(); else showScreen('sTitle');
}
function returnToGame(){
  showScreen('sGame');
  if(paused&&G.player){ paused=false; loop(); }
}

// ================================================================
//  SOUND ENGINE -- Web Audio API procedural SFX bank
//  All sounds generated with oscillators + noise, zero files
// ================================================================
const SFX=(()=>{
  let ctx=null, muted=false, musicTimer=null;

  function ac(){
    if(!ctx) ctx=new(window.AudioContext||window.webkitAudioContext)();
    if(ctx.state==='suspended') ctx.resume();
    return ctx;
  }

  // Core oscillator helper
  function osc(freq,type,vol,dur,freqEnd,delayMs){
    setTimeout(()=>{
      try{
        const c=ac(),o=c.createOscillator(),g=c.createGain();
        o.type=type; o.frequency.setValueAtTime(freq,c.currentTime);
        if(freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd,c.currentTime+dur);
        g.gain.setValueAtTime(vol,c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
        o.connect(g); g.connect(c.destination);
        o.start(); o.stop(c.currentTime+dur);
      }catch(e){}
    }, delayMs||0);
  }

  // White/filtered noise helper
  function noise(vol,dur,filterFreq,filterType,delayMs){
    setTimeout(()=>{
      try{
        const c=ac();
        const buf=c.createBuffer(1,Math.floor(c.sampleRate*dur),c.sampleRate);
        const d=buf.getChannelData(0);
        for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
        const src=c.createBufferSource(); src.buffer=buf;
        const g=c.createGain();
        g.gain.setValueAtTime(vol,c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
        const f=c.createBiquadFilter();
        f.type=filterType||'bandpass';
        f.frequency.value=filterFreq||600; f.Q.value=1.2;
        src.connect(f); f.connect(g); g.connect(c.destination);
        src.start(); src.stop(c.currentTime+dur);
      }catch(e){}
    }, delayMs||0);
  }

  // ── WEAPON SOUNDS ──────────────────────────────────────────────

  // Gunshot: sharp crack + low thud
  function gunshot(){
    if(muted) return;
    noise(0.7, 0.04, 2200, 'highpass');          // crack
    noise(0.5, 0.12, 320, 'bandpass');            // body thud
    osc(180, 'sawtooth', 0.35, 0.08, 28);         // low punch
  }

  // Shotgun blast: wide spread boom
  function shotgunBlast(){
    if(muted) return;
    noise(0.9, 0.06, 1800, 'highpass');
    noise(0.7, 0.2,  200, 'lowpass');
    osc(90, 'sawtooth', 0.55, 0.18, 20);
    osc(140,'sawtooth', 0.3,  0.12, 30, 20);
  }

  // Empty click when no ammo
  function emptyClick(){
    if(muted) return;
    osc(900,'square',0.15,0.04,800);
  }

  // Reload: 3-stage mechanical
  function reload(){
    if(muted) return;
    osc(1100,'square',0.12,0.05,900,0);
    osc(600, 'square',0.14,0.06,500,90);
    noise(0.2, 0.08, 800,'bandpass',90);
    osc(1400,'square',0.1, 0.04,1200,200);
    osc(700, 'square',0.18,0.07,600,200);
  }

  // ── ZOMBIE SOUNDS ──────────────────────────────────────────────

  // Zombie groan: deep guttural
  function zombieGroan(){
    if(muted) return;
    const pitch = 60+Math.random()*80;
    osc(pitch, 'sawtooth', 0.22, 0.6,  pitch*0.5);
    osc(pitch*1.4,'sine',  0.08, 0.45, pitch*0.6);
    noise(0.05, 0.5, 200, 'lowpass');
  }

  // Zombie scream: runner shriek
  function zombieScream(){
    if(muted) return;
    const p=200+Math.random()*300;
    osc(p,'sawtooth',0.3,0.4,p*0.3);
    osc(p*1.6,'square',0.1,0.35,p*0.4);
  }

  // Zombie hit: meaty impact
  function hit(){
    if(muted) return;
    noise(0.45, 0.07, 600, 'bandpass');
    osc(120,'sawtooth',0.2,0.06,60);
  }

  // Zombie death: collapse thud + gurgle
  function death(){
    if(muted) return;
    osc(80,'sawtooth',0.5,0.35,20);
    noise(0.4, 0.18, 400, 'bandpass');
    osc(300,'sine',0.15,0.25,80,80);
  }

  // Boss roar
  function bossRoar(){
    if(muted) return;
    const p=40+Math.random()*30;
    osc(p,'sawtooth',0.6,0.8,p*0.4);
    osc(p*2,'sawtooth',0.3,0.7,p*0.6);
    noise(0.3,0.6,150,'lowpass');
  }

  // ── PLAYER SOUNDS ─────────────────────────────────────────────

  function playerHurt(){
    if(muted) return;
    noise(0.55,0.1,400,'bandpass');
    osc(380,'sawtooth',0.3,0.12,150);
  }

  function playerDeath(){
    if(muted) return;
    [350,250,160,80].forEach((f,i)=>osc(f,'sawtooth',0.4,0.3,f*0.3,i*120));
    noise(0.4,0.4,300,'bandpass',100);
  }

  // ── ENVIRONMENT SOUNDS ────────────────────────────────────────

  // Earthquake rumble: deep sub-bass growl
  function earthquakeRumble(){
    if(muted) return;
    osc(30,'sawtooth',0.8,1.5,15);
    osc(45,'sine',    0.6,1.5,20);
    noise(0.5,1.5,80,'lowpass');
    noise(0.3,1.0,160,'bandpass',200);
  }

  // Asteroid impact: thunderous boom
  function asteroidImpact(){
    if(muted) return;
    osc(40,'sawtooth',0.9,0.6,10);
    osc(60,'square',  0.7,0.5,15);
    noise(0.8,0.3,300,'lowpass');
    noise(0.6,0.5,1200,'highpass',50);
    noise(0.4,0.8,200,'lowpass',100);
  }

  // Debris crash: crunching
  function debrisCrash(){
    if(muted) return;
    noise(0.5,0.15,800,'bandpass');
    osc(200,'sawtooth',0.3,0.1,80);
    noise(0.3,0.25,400,'bandpass',80);
  }

  // Fire crackle: looping (called periodically)
  function fireCrackle(){
    if(muted) return;
    noise(0.12,0.08,1200,'bandpass');
    osc(800,'square',0.04,0.06,600);
  }

  // Wave clear fanfare
  function waveClear(){
    if(muted) return;
    [523,659,784,1047].forEach((f,i)=>osc(f,'sine',0.22,0.2,f,i*130));
  }

  function gameOverSnd(){
    if(muted) return;
    [380,280,190,100].forEach((f,i)=>osc(f,'sawtooth',0.35,0.28,f*0.5,i*150));
    noise(0.3,0.8,200,'lowpass',100);
  }

  // ── MUSIC ─────────────────────────────────────────────────────
  function startMusic(){
    if(muted||musicTimer) return;
    const c=ac();
    const mG=c.createGain(); mG.gain.value=0.04; mG.connect(c.destination);
    const bassNotes=[38,41,43,46,38,41,36,38];
    let beat=0;
    function tick(){
      if(muted){ stopMusic(); return; }
      const freq=Math.pow(2,(bassNotes[beat%bassNotes.length]-69)/12)*440;
      // Bass note
      const o=c.createOscillator(),g=c.createGain();
      o.type='sawtooth'; o.frequency.value=freq;
      g.gain.setValueAtTime(0.7,c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+0.4);
      o.connect(g); g.connect(mG); o.start(); o.stop(c.currentTime+0.45);
      // Occasional percussion hit
      if(beat%4===0){
        const pb=c.createBuffer(1,Math.floor(c.sampleRate*0.1),c.sampleRate);
        const pd=pb.getChannelData(0);
        for(let i=0;i<pd.length;i++) pd[i]=(Math.random()*2-1)*Math.exp(-i/(c.sampleRate*0.04));
        const ps=c.createBufferSource(); ps.buffer=pb;
        const pg=c.createGain(); pg.gain.value=0.25;
        ps.connect(pg); pg.connect(mG); ps.start();
      }
      beat++;
      musicTimer=setTimeout(tick,480);
    }
    tick();
  }
  function stopMusic(){ clearTimeout(musicTimer); musicTimer=null; }

  function toggle(){
    muted=!muted;
    document.getElementById('sndBtn').textContent=muted?'🔇':'🔊';
    if(muted) stopMusic(); else startMusic();
  }
  function unlock(){ ac(); startMusic(); }

  return{
    gunshot,shotgunBlast,emptyClick,reload,
    zombieGroan,zombieScream,hit,death,bossRoar,
    playerHurt,playerDeath,
    earthquakeRumble,asteroidImpact,debrisCrash,fireCrackle,
    waveClear,gameOverSnd,startMusic,stopMusic,toggle,unlock
  };
})();

// ── CANVAS RESIZE ─────────────────────────────────────────────────
function resizeCanvas(){
  const W=window.innerWidth, H=window.innerHeight-HUD_H;
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  canvas.width=Math.floor(W*DPR); canvas.height=Math.floor(H*DPR);
  C.setTransform(DPR,0,0,DPR,0,0);
  if(G.player){
    G.player.x=Math.max(G.player.r,Math.min(cW()-G.player.r,G.player.x));
    G.player.y=Math.max(G.player.r,Math.min(cH()-G.player.r,G.player.y));
  }
}
resizeCanvas();
window.addEventListener('resize',resizeCanvas);

// ── INPUT ─────────────────────────────────────────────────────────
window.addEventListener('keydown',e=>{
  keys[e.key.toLowerCase()]=true;
  if(e.code==='Space'){e.preventDefault();mShooting=true;}
  if(e.key.toLowerCase()==='r') doReload();
  if(e.key.toLowerCase()==='p'||e.key==='Escape') togglePause();
  if(e.key.toLowerCase()==='v') setView(viewMode==='3p'?'1p':'3p');
  if(e.key==='Tab'){e.preventDefault();toggleAutoAim();}
});
window.addEventListener('keyup',e=>{
  keys[e.key.toLowerCase()]=false;
  if(e.code==='Space') mShooting=false;
});
canvas.addEventListener('mousemove',e=>{
  const r=canvas.getBoundingClientRect();
  mouseX=e.clientX-r.left; mouseY=e.clientY-r.top;
});
canvas.addEventListener('mousedown',e=>{if(e.button===0){SFX.unlock();mShooting=true;}});
canvas.addEventListener('mouseup',  e=>{if(e.button===0) mShooting=false;});

(function(){
  const map={dU:'u',dD:'d',dL:'l',dR:'r'};
  Object.entries(map).forEach(([id,dir])=>{
    const el=document.getElementById(id); if(!el)return;
    const on =e=>{e.preventDefault();mDirs[dir]=true; el.classList.add('pressed');};
    const off=e=>{e.preventDefault();mDirs[dir]=false;el.classList.remove('pressed');};
    el.addEventListener('touchstart',on, {passive:false});
    el.addEventListener('touchend',  off,{passive:false});
    el.addEventListener('touchcancel',off,{passive:false});
  });
})();

const sbtnEl=document.getElementById('sbtn');
sbtnEl.addEventListener('touchstart',e=>{e.preventDefault();SFX.unlock();mobileFire=true; sbtnEl.classList.add('firing');},   {passive:false});
sbtnEl.addEventListener('touchend',  e=>{e.preventDefault();              mobileFire=false;sbtnEl.classList.remove('firing');},{passive:false});
sbtnEl.addEventListener('touchcancel',()=>{mobileFire=false;sbtnEl.classList.remove('firing');});
sbtnEl.addEventListener('mousedown', ()=>{SFX.unlock();mobileFire=true; sbtnEl.classList.add('firing');});
sbtnEl.addEventListener('mouseup',   ()=>{              mobileFire=false;sbtnEl.classList.remove('firing');});

const rbtnEl=document.getElementById('rbtn');
rbtnEl.addEventListener('touchstart',e=>{e.preventDefault();SFX.unlock();doReload();},{passive:false});
rbtnEl.addEventListener('click',()=>doReload());

// ── VIEW / PAUSE / NOTIFS ─────────────────────────────────────────
function setView(v){
  viewMode=v;
  document.getElementById('v3b').classList.toggle('on',v==='3p');
  document.getElementById('v1b').classList.toggle('on',v==='1p');
  document.getElementById('xhair').style.display=v==='1p'?'block':'none';
}
setView('3p');

function togglePause(){
  if(!G.player)return; paused=!paused;
  if(paused){
    cancelAnimationFrame(animId);
    document.getElementById('pauseStats').textContent=`WAVE ${G.wave}  |  SCORE ${G.score.toLocaleString()}`;
    document.getElementById('ovrPause').classList.add('show');
  }else{
    document.getElementById('ovrPause').classList.remove('show');
    loop();
  }
}
function hideAllOvr(){['ovrPause','ovrWave','ovrDead'].forEach(id=>document.getElementById(id).classList.remove('show'));}

function showNotif(msg,cls){
  const el=document.getElementById('notifs');
  const n=document.createElement('div');
  n.className='nf'+(cls?' '+cls:'');
  n.textContent=msg; el.appendChild(n);
  setTimeout(()=>{if(el.contains(n))el.removeChild(n);},2500);
}
function waveAnnounce(w){
  const el=document.getElementById('wann');
  el.textContent='WAVE '+w;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),3200);
}

function doReload(){
  if(!G.player||G.reloading||G.ammo>=G.maxAmmo)return;
  G.reloading=true; G.reloadTimer=90; SFX.reload(); showNotif('RELOADING...','o');
}

function toggleAutoAim(){
  autoAim=!autoAim; aimTarget=null;
  showNotif(autoAim?'AUTO-AIM ON':'AUTO-AIM OFF', autoAim?'':'r');
  document.getElementById('autoAimBtn').classList.toggle('on',autoAim);
  const mob=document.getElementById('aabtnMobile');
  if(mob) mob.classList.toggle('on',autoAim);
}

// ── AUTO-AIM ──────────────────────────────────────────────────────
function getAutoAimTarget(p){
  if(!autoAim||G.zombies.length===0) return null;
  const SNAP_RANGE=320;
  let best=null, bestScore=Infinity;
  for(const z of G.zombies){
    const dist=Math.hypot(p.x-z.x,p.y-z.y);
    if(dist>SNAP_RANGE) continue;
    const hysteresis=(z===aimTarget)?0.7:1.0;
    const score=dist*hysteresis;
    if(score<bestScore){bestScore=score;best=z;}
  }
  return best;
}

// ── SCREEN SHAKE ──────────────────────────────────────────────────
function triggerShake(magnitude,duration){
  shakeMag=Math.max(shakeMag,magnitude);
  shakeDur=Math.max(shakeDur,duration);
}
function updateShake(){
  if(shakeDur>0){
    shakeX=(Math.random()-0.5)*shakeMag*2;
    shakeY=(Math.random()-0.5)*shakeMag*2;
    shakeDur--;
    shakeMag*=0.9;
  }else{
    shakeX=0; shakeY=0; shakeMag=0;
  }
}

// ================================================================
//  ZOMBIE DEFINITIONS
// ================================================================
const ZTYPES=[
  {col:'#4a7a3a',speed:1.2, hp:2,  size:18,pts:100,  dmg:1},  // Walker
  {col:'#8b2020',speed:2.8, hp:1,  size:14,pts:150,  dmg:1},  // Runner
  {col:'#3a3a2a',speed:0.8, hp:6,  size:24,pts:200,  dmg:2},  // Tank
  {col:'#5a2080',speed:1.5, hp:20, size:30,pts:1000, dmg:3},  // Boss
];

// ================================================================
//  GAME STATE
// ================================================================
function initState(){
  resizeCanvas();
  return{
    player:{x:cW()/2,y:cH()/2,r:18,speed:3.6,hp:100,maxHp:100,angle:0,invTimer:0},
    bullets:[],zombies:[],particles:[],bloodDecals:[],
    // Apocalyptic environment
    asteroids:[],
    earthquakeTimer:0,  earthquakeActive:false, earthquakeDur:0,
    cracks:[], fires:[], debris:[], ashParticles:[],
    nextAsteroid:180+Math.floor(Math.random()*240),
    nextEarthquake:300+Math.floor(Math.random()*300),
    nextFire:120,
    score:0,wave:1,ammo:12,maxAmmo:12,
    reloading:false,reloadTimer:0,
    spawnQueue:[],spawnTimer:0,zombiesTotal:0,zombiesLeft:0,waveDone:false,
    justFired:false,
  };
}

function buildSpawnQueue(){
  const w=G.wave, count=8+w*3; const q=[];
  for(let i=0;i<count;i++){
    const r=Math.random(); let t=0;
    if(w>=5&&r>0.96)t=3;
    else if(w>=3&&r>0.74)t=2;
    else if(w>=2&&r>0.50)t=1;
    q.push(t);
  }
  G.spawnQueue=q; G.zombiesTotal=count; G.zombiesLeft=count;
  G.waveDone=false; G.spawnTimer=0;
}

// ── GAME FLOW ─────────────────────────────────────────────────────
function startGame(){
  cancelAnimationFrame(animId); paused=false; hideAllOvr();
  autoAim=false; aimTarget=null;
  G=initState(); updateHUD();
  buildSpawnQueue(); waveAnnounce(G.wave);
  showScreen('sGame'); SFX.unlock(); SFX.startMusic(); loop();
}
function nextWave(){
  cancelAnimationFrame(animId);
  document.getElementById('ovrWave').classList.remove('show');
  G.wave++; G.ammo=G.maxAmmo;
  G.player.hp=Math.min(G.player.maxHp,G.player.hp+30);
  // Increase apocalyptic frequency every wave
  G.nextAsteroid=Math.max(90, 180-G.wave*15);
  G.nextEarthquake=Math.max(180, 300-G.wave*20);
  buildSpawnQueue(); updateHUD(); waveAnnounce(G.wave);
  SFX.startMusic(); loop();
}
function endWave(){
  cancelAnimationFrame(animId); SFX.waveClear(); SFX.stopMusic();
  const bonus=500*G.wave; G.score+=bonus; updateHUD();
  document.getElementById('wcTitle').textContent=`WAVE ${G.wave} CLEAR!`;
  document.getElementById('wcStats').innerHTML=`BONUS +${bonus.toLocaleString()} PTS<br>SCORE: ${G.score.toLocaleString()}`;
  document.getElementById('ovrWave').classList.add('show');
}
function gameOver(){
  cancelAnimationFrame(animId); SFX.playerDeath(); SFX.stopMusic();
  document.getElementById('goStats').innerHTML=`SCORE: ${G.score.toLocaleString()}<br>SURVIVED: WAVE ${G.wave}`;
  document.getElementById('ovrDead').classList.add('show');
}

// ── MAIN LOOP ─────────────────────────────────────────────────────
function loop(){ update(); render(); animId=requestAnimationFrame(loop); }

// ================================================================
//  UPDATE
// ================================================================
function update(){
  if(paused||!G.player) return;
  const p=G.player;

  // Movement
  let dx=0,dy=0;
  if(keys['w']||keys['arrowup']   ||mDirs.u) dy-=p.speed;
  if(keys['s']||keys['arrowdown'] ||mDirs.d) dy+=p.speed;
  if(keys['a']||keys['arrowleft'] ||mDirs.l) dx-=p.speed;
  if(keys['d']||keys['arrowright']||mDirs.r) dx+=p.speed;
  // Earthquake pushes player randomly
  if(G.earthquakeActive){
    dx+=(Math.random()-0.5)*G.earthquakeDur*0.08;
    dy+=(Math.random()-0.5)*G.earthquakeDur*0.08;
  }
  if(dx&&dy){dx*=0.707;dy*=0.707;}
  p.x=Math.max(p.r,Math.min(cW()-p.r,p.x+dx));
  p.y=Math.max(p.r,Math.min(cH()-p.r,p.y+dy));

  // Auto-aim / manual aim
  if(autoAim){
    aimTarget=getAutoAimTarget(p);
    if(aimTarget){
      const bspeed=14, dist=Math.hypot(p.x-aimTarget.x,p.y-aimTarget.y);
      const lead=dist/bspeed;
      const predX=aimTarget.x+Math.cos(aimTarget.angle)*aimTarget.speed*lead;
      const predY=aimTarget.y+Math.sin(aimTarget.angle)*aimTarget.speed*lead;
      const ta=Math.atan2(predY-p.y,predX-p.x);
      const diff=((ta-p.angle+Math.PI*3)%(Math.PI*2))-Math.PI;
      p.angle+=diff*0.28;
    }else{
      if(viewMode==='3p') p.angle=Math.atan2(mouseY-p.y,mouseX-p.x);
      else if(dx||dy) p.angle=Math.atan2(dy,dx);
    }
  }else{
    aimTarget=null;
    if(viewMode==='3p') p.angle=Math.atan2(mouseY-p.y,mouseX-p.x);
    else if(dx||dy) p.angle=Math.atan2(dy,dx);
  }

  // Shoot
  if(shootCD>0) shootCD--;
  const wantShoot=mShooting||mobileFire;
  if(wantShoot&&shootCD===0&&!G.reloading){
    if(G.ammo>0){
      const a=p.angle;
      G.bullets.push({x:p.x+Math.cos(a)*28,y:p.y+Math.sin(a)*28,
        vx:Math.cos(a)*14,vy:Math.sin(a)*14,life:90,angle:a,trail:[]});
      G.ammo--; shootCD=10; updateHUD(); SFX.gunshot();
      for(let i=0;i<6;i++){
        const fa=a+(-0.3+Math.random()*0.6);
        G.particles.push({x:p.x+Math.cos(a)*28,y:p.y+Math.sin(a)*28,
          vx:Math.cos(fa)*(4+Math.random()*6),vy:Math.sin(fa)*(4+Math.random()*6),
          life:6+Math.random()*5,col:'flash',sz:3+Math.random()*4});
      }
      document.getElementById('mflash').style.display='block';
      setTimeout(()=>document.getElementById('mflash').style.display='none',60);
      G.justFired=true; setTimeout(()=>{if(G)G.justFired=false;},80);
      if(G.ammo===0) showNotif('EMPTY -- RELOAD!','r');
    }else{
      SFX.emptyClick(); shootCD=15;
    }
  }

  // Reload
  if(G.reloading){
    G.reloadTimer--;
    if(G.reloadTimer<=0){G.ammo=G.maxAmmo;G.reloading=false;showNotif('RELOADED','');updateHUD();}
  }

  // Spawn zombies
  if(G.spawnQueue.length>0){
    G.spawnTimer++;
    const interval=Math.max(15,55-G.wave*4);
    if(G.spawnTimer>=interval){
      const t=ZTYPES[G.spawnQueue.pop()];
      const side=Math.floor(Math.random()*4);
      let zx,zy;
      if(side===0){zx=Math.random()*cW();zy=-40;}
      else if(side===1){zx=cW()+40;zy=Math.random()*cH();}
      else if(side===2){zx=Math.random()*cW();zy=cH()+40;}
      else{zx=-40;zy=Math.random()*cH();}
      G.zombies.push({x:zx,y:zy,hp:t.hp,maxHp:t.hp,
        speed:t.speed*(1+G.wave*0.05),
        size:t.size,col:t.col,pts:t.pts,dmg:t.dmg,
        angle:0,flash:0,ti:ZTYPES.indexOf(t),
        walkCycle:Math.random()*Math.PI*2});
      G.spawnTimer=0;
      if(t===ZTYPES[3]) SFX.bossRoar();
    }
  }

  // Random groan
  groanTimer--;
  if(groanTimer<=0&&G.zombies.length>0){
    const z=G.zombies[Math.floor(Math.random()*G.zombies.length)];
    if(z.ti===1) SFX.zombieScream(); else SFX.zombieGroan();
    groanTimer=80+Math.random()*120;
  }

  // Update zombies
  if(p.invTimer>0) p.invTimer--;
  for(let i=G.zombies.length-1;i>=0;i--){
    const z=G.zombies[i];
    const ang=Math.atan2(p.y-z.y,p.x-z.x);
    z.angle=ang; z.walkCycle+=0.08+z.speed*0.06;
    z.x+=Math.cos(ang)*z.speed; z.y+=Math.sin(ang)*z.speed;
    z.x=Math.max(z.size,Math.min(cW()-z.size,z.x));
    z.y=Math.max(z.size,Math.min(cH()-z.size,z.y));
    if(z.flash>0) z.flash--;
    if(p.invTimer===0&&Math.hypot(p.x-z.x,p.y-z.y)<p.r+z.size){
      p.hp=Math.max(0,p.hp-z.dmg); p.invTimer=40; SFX.playerHurt(); updateHUD();
      if(p.hp<=0){gameOver();return;}
    }
  }

  // Update bullets
  if(G.particles.length>200) G.particles.splice(0,G.particles.length-200);
  for(let i=G.bullets.length-1;i>=0;i--){
    const b=G.bullets[i];
    b.trail.push({x:b.x,y:b.y}); if(b.trail.length>7)b.trail.shift();
    b.x+=b.vx; b.y+=b.vy; b.life--;
    if(b.life<=0||b.x<0||b.x>cW()||b.y<0||b.y>cH()){G.bullets.splice(i,1);continue;}
    let hit=false;
    for(let j=G.zombies.length-1;j>=0;j--){
      const z=G.zombies[j];
      if(Math.hypot(b.x-z.x,b.y-z.y)<z.size){
        z.hp--; z.flash=10; SFX.hit(); spawnBlood(b.x,b.y,8);
        G.bloodDecals.push({x:b.x,y:b.y,r:3+Math.random()*4,a:0.7,
          oval:0.5+Math.random()*0.8,rot:Math.random()*Math.PI});
        if(z.hp<=0){
          G.score+=z.pts; G.zombiesLeft--;
          SFX.death();
          spawnBlood(z.x,z.y,22);
          for(let k=0;k<6;k++) G.bloodDecals.push({
            x:z.x+(-18+Math.random()*36),y:z.y+(-18+Math.random()*36),
            r:4+Math.random()*9,a:0.8,oval:0.4+Math.random()*0.9,rot:Math.random()*Math.PI});
          if(z===aimTarget) aimTarget=null;
          G.zombies.splice(j,1); updateHUD();
        }
        hit=true; break;
      }
    }
    if(hit) G.bullets.splice(i,1);
  }

  // Particles
  for(let i=G.particles.length-1;i>=0;i--){
    const pt=G.particles[i];
    pt.x+=pt.vx; pt.y+=pt.vy; pt.vy+=0.1; pt.vx*=0.92; pt.life--;
    if(pt.life<=0) G.particles.splice(i,1);
  }

  // Blood decals
  if(G.bloodDecals.length>150) G.bloodDecals.splice(0,G.bloodDecals.length-150);
  for(let i=G.bloodDecals.length-1;i>=0;i--){
    G.bloodDecals[i].a-=0.002;
    if(G.bloodDecals[i].a<=0) G.bloodDecals.splice(i,1);
  }

  // ================================================================
  //  APOCALYPTIC ENVIRONMENT UPDATE
  // ================================================================
  updateAsteroidSystem();
  updateEarthquakeSystem();
  updateFireSystem();
  updateDebrisSystem();
  updateAshSystem();
  updateShake();

  // Wave complete
  if(!G.waveDone&&G.zombiesLeft<=0&&G.spawnQueue.length===0&&G.zombies.length===0){
    G.waveDone=true; setTimeout(endWave,600);
  }
}

function spawnBlood(x,y,n){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, s=Math.random()*4+1;
    G.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-1,life:12+Math.random()*16,col:'blood',sz:1.5+Math.random()*3});
  }
}

// ================================================================
//  APOCALYPTIC ENVIRONMENT SYSTEMS
// ================================================================

// ── ASTEROID SYSTEM ───────────────────────────────────────────────
function updateAsteroidSystem(){
  // Spawn timer
  G.nextAsteroid--;
  if(G.nextAsteroid<=0){
    spawnAsteroid();
    G.nextAsteroid=Math.max(90,180-G.wave*15)+Math.floor(Math.random()*120);
  }
  // Update asteroids
  for(let i=G.asteroids.length-1;i>=0;i--){
    const ast=G.asteroids[i];
    ast.y+=ast.speed;
    ast.x+=ast.vx;
    ast.rot+=0.03;
    // Spawn trailing fire/smoke particles
    if(Math.random()<0.4){
      G.particles.push({
        x:ast.x+(Math.random()-0.5)*ast.r,
        y:ast.y-ast.r,
        vx:(Math.random()-0.5)*1.5, vy:-0.5-Math.random()*2,
        life:18+Math.random()*20,
        col:Math.random()<0.5?'fireorange':'smokegrey',
        sz:3+Math.random()*6
      });
    }
    // Check impact
    if(ast.y>cH()+ast.r||ast.x<-ast.r||ast.x>cW()+ast.r){
      G.asteroids.splice(i,1); continue;
    }
    // Impact on ground (near bottom)
    if(ast.y>cH()-20&&!ast.impacted){
      ast.impacted=true;
      triggerShake(12,45);
      SFX.asteroidImpact();
      // Crater effect -- spawn debris
      for(let k=0;k<20;k++){
        const ba=Math.random()*Math.PI*2, bs=3+Math.random()*8;
        G.debris.push({x:ast.x,y:ast.y,
          vx:Math.cos(ba)*bs, vy:Math.sin(ba)*bs-5,
          life:40+Math.random()*40, rot:Math.random()*Math.PI*2, rotV:(-0.2+Math.random()*0.4),
          w:4+Math.random()*12, h:3+Math.random()*8, col:'#5a4a30'});
      }
      // Explosion particles
      for(let k=0;k<30;k++){
        const ba=Math.random()*Math.PI*2, bs=2+Math.random()*10;
        G.particles.push({x:ast.x,y:ast.y,
          vx:Math.cos(ba)*bs, vy:Math.sin(ba)*bs-4,
          life:20+Math.random()*25,
          col:Math.random()<0.6?'fireorange':Math.random()<0.5?'fieryellow':'smokegrey',
          sz:4+Math.random()*8});
      }
      // Ground crack
      G.cracks.push({x:ast.x,y:cH()-10,
        lines:generateCrackLines(ast.x,cH()-10,5),a:0.9});
      // Damage player if close
      if(G.player&&Math.hypot(G.player.x-ast.x,G.player.y-ast.y)<ast.r+40){
        G.player.hp=Math.max(0,G.player.hp-15);
        G.player.invTimer=60; SFX.playerHurt(); updateHUD();
        if(G.player.hp<=0){gameOver();return;}
      }
      // Damage nearby zombies
      for(const z of G.zombies){
        if(Math.hypot(z.x-ast.x,z.y-ast.y)<ast.r+50){
          z.hp-=3; z.flash=12;
          if(z.hp<=0){G.score+=z.pts;G.zombiesLeft--;spawnBlood(z.x,z.y,15);}
        }
      }
      G.zombies=G.zombies.filter(z=>z.hp>0);
    }
  }
}

function spawnAsteroid(){
  const r=18+Math.random()*28;
  G.asteroids.push({
    x: r + Math.random()*(cW()-r*2),
    y: -r*2,
    vx: (-0.5+Math.random())*2,
    speed: 3+Math.random()*4+G.wave*0.3,
    r, rot:0, impacted:false,
    // Polygon points for rocky shape
    pts: Array.from({length:8},(_,i)=>{
      const a=(i/8)*Math.PI*2;
      const radius=r*(0.7+Math.random()*0.5);
      return{x:Math.cos(a)*radius, y:Math.sin(a)*radius};
    })
  });
}

function generateCrackLines(ox,oy,branches){
  const lines=[];
  for(let b=0;b<branches;b++){
    const a=Math.random()*Math.PI*2;
    const len=30+Math.random()*60;
    let cx=ox,cy=oy;
    const segs=[];
    for(let s=0;s<4;s++){
      const na=a+(-0.4+Math.random()*0.8);
      const nl=len/4*(0.7+Math.random()*0.6);
      segs.push({x:cx+Math.cos(na)*nl, y:cy+Math.sin(na)*nl});
      cx+=Math.cos(na)*nl; cy+=Math.sin(na)*nl;
    }
    lines.push({ox,oy,segs});
  }
  return lines;
}

// ── EARTHQUAKE SYSTEM ─────────────────────────────────────────────
function updateEarthquakeSystem(){
  G.nextEarthquake--;
  if(G.nextEarthquake<=0&&!G.earthquakeActive){
    G.earthquakeActive=true;
    G.earthquakeDur=90+Math.floor(Math.random()*90);
    triggerShake(8,G.earthquakeDur);
    SFX.earthquakeRumble();
    showNotif('EARTHQUAKE!','r');
    // Spawn ground cracks
    for(let i=0;i<4;i++){
      G.cracks.push({
        x:Math.random()*cW(), y:Math.random()*cH(),
        lines:generateCrackLines(Math.random()*cW(),Math.random()*cH(),4),
        a:0.8
      });
    }
    G.nextEarthquake=Math.max(180,300-G.wave*20)+Math.floor(Math.random()*180);
  }
  if(G.earthquakeActive){
    G.earthquakeDur--;
    if(G.earthquakeDur<=0) G.earthquakeActive=false;
  }
  // Fade cracks
  for(let i=G.cracks.length-1;i>=0;i--){
    G.cracks[i].a-=0.0015;
    if(G.cracks[i].a<=0) G.cracks.splice(i,1);
  }
}

// ── FIRE COLUMN SYSTEM ────────────────────────────────────────────
function updateFireSystem(){
  G.nextFire--;
  if(G.nextFire<=0){
    // Spawn fire column at random edge position
    G.fires.push({
      x: Math.random()*cW(),
      y: cH()-5,
      life: 120+Math.random()*180,
      maxLife: 300, intensity: 0.3+Math.random()*0.7,
      w: 20+Math.random()*30
    });
    G.nextFire=60+Math.floor(Math.random()*90);
    if(Math.random()<0.3) SFX.fireCrackle();
  }
  for(let i=G.fires.length-1;i>=0;i--){
    const f=G.fires[i]; f.life--;
    // Spawn fire particles
    if(Math.random()<0.6){
      G.particles.push({
        x:f.x+(-f.w/2+Math.random()*f.w), y:f.y,
        vx:(-0.5+Math.random())*1.5, vy:-(2+Math.random()*4),
        life:20+Math.random()*25,
        col:Math.random()<0.6?'fireorange':Math.random()<0.5?'fieryellow':'fiered',
        sz:4+Math.random()*8
      });
    }
    if(f.life<=0) G.fires.splice(i,1);
    // Damage player standing in fire
    if(G.player&&Math.abs(G.player.x-f.x)<f.w/2&&G.player.y>f.y-40){
      if(G.player.invTimer===0&&Math.random()<0.05){
        G.player.hp=Math.max(0,G.player.hp-1);
        G.player.invTimer=20; updateHUD();
        if(G.player.hp<=0){gameOver();return;}
      }
    }
  }
}

// ── DEBRIS SYSTEM ─────────────────────────────────────────────────
function updateDebrisSystem(){
  // Periodically spawn falling debris
  if(Math.random()<0.008+G.wave*0.002){
    G.debris.push({
      x:Math.random()*cW(), y:-20,
      vx:(-0.5+Math.random())*2, vy:2+Math.random()*4,
      life:80+Math.random()*60, rot:Math.random()*Math.PI*2,
      rotV:(-0.1+Math.random()*0.2),
      w:6+Math.random()*20, h:4+Math.random()*14,
      col:Math.random()<0.5?'#5a4a30':'#444438'
    });
  }
  for(let i=G.debris.length-1;i>=0;i--){
    const d=G.debris[i];
    d.x+=d.vx; d.y+=d.vy; d.vy+=0.12; d.rot+=d.rotV; d.life--;
    // Impact
    if(d.y>cH()&&!d.landed){
      d.landed=true; d.vy=0; d.vx=0;
      SFX.debrisCrash();
      triggerShake(3,12);
      // Damage player if hit
      if(G.player&&Math.hypot(G.player.x-d.x,G.player.y-d.y)<20){
        G.player.hp=Math.max(0,G.player.hp-8);
        G.player.invTimer=40; updateHUD(); SFX.playerHurt();
        if(G.player.hp<=0){gameOver();return;}
      }
    }
    if(d.life<=0) G.debris.splice(i,1);
  }
}

// ── ASH PARTICLES SYSTEM ──────────────────────────────────────────
function updateAshSystem(){
  // Continuously spawn drifting ash
  if(Math.random()<0.15+G.wave*0.02){
    G.ashParticles.push({
      x:Math.random()*cW(), y:-5,
      vx:(-0.3+Math.random()*0.6)*0.8,
      vy:0.3+Math.random()*0.8,
      life:200+Math.random()*200,
      sz:1+Math.random()*2.5,
      a:0.3+Math.random()*0.4,
      wobble:Math.random()*Math.PI*2
    });
  }
  if(G.ashParticles.length>300) G.ashParticles.splice(0,G.ashParticles.length-300);
  for(let i=G.ashParticles.length-1;i>=0;i--){
    const a=G.ashParticles[i];
    a.wobble+=0.02; a.x+=a.vx+Math.sin(a.wobble)*0.3;
    a.y+=a.vy; a.life--;
    if(a.life<=0||a.y>cH()+10) G.ashParticles.splice(i,1);
  }
}

// ================================================================
//  SPRITE ASSETS -- PLAYER
// ================================================================
function drawPlayer(x,y,angle,r,invTimer){
  C.save(); C.translate(x,y); C.rotate(angle);
  if(invTimer>0&&Math.floor(invTimer/5)%2===0) C.globalAlpha=0.35;
  const s=r/18;

  // Drop shadow
  C.fillStyle='rgba(0,0,0,0.32)';
  C.beginPath(); C.ellipse(2*s,4*s,14*s,8*s,0,0,Math.PI*2); C.fill();

  // Boots
  C.fillStyle='#1a1a12';
  C.fillRect(-6*s,10*s,5*s,7*s); C.fillRect(2*s,10*s,5*s,7*s);
  // Boot sole
  C.fillStyle='#0e0e0a';
  C.fillRect(-6*s,16*s,6*s,1.5*s); C.fillRect(2*s,16*s,6*s,1.5*s);

  // Legs - olive camo trousers
  C.fillStyle='#4a5238';
  C.fillRect(-7*s,2*s,6*s,10*s); C.fillRect(2*s,2*s,6*s,10*s);
  // Camo patches
  C.fillStyle='#3a4228';
  C.fillRect(-6*s,4*s,3*s,3*s); C.fillRect(3*s,7*s,3*s,2*s); C.fillRect(-5*s,8*s,2*s,3*s);
  // Knee pads
  C.fillStyle='#2a2e20';
  C.beginPath(); C.ellipse(-4*s,8*s,3*s,2.5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(5*s,8*s,3*s,2.5*s,0,0,Math.PI*2); C.fill();

  // Tactical vest with gradient
  const vestG=C.createLinearGradient(-8*s,-10*s,8*s,4*s);
  vestG.addColorStop(0,'#3a3a30'); vestG.addColorStop(0.4,'#2a2a22'); vestG.addColorStop(1,'#1a1a16');
  C.fillStyle=vestG; C.fillRect(-8*s,-10*s,16*s,14*s);
  // Vest plates
  const plateG=C.createLinearGradient(-7*s,-9*s,7*s,3*s);
  plateG.addColorStop(0,'#2e2e26'); plateG.addColorStop(1,'#1a1a14');
  C.fillStyle=plateG; C.fillRect(-7*s,-9*s,14*s,12*s);
  // Edge highlight
  C.strokeStyle='rgba(255,255,255,0.07)'; C.lineWidth=0.6*s;
  C.strokeRect(-7*s,-9*s,14*s,12*s);
  // MOLLE webbing
  C.strokeStyle='#1a1a14'; C.lineWidth=0.8*s;
  for(let i=0;i<3;i++){C.beginPath();C.moveTo(-6*s,(-7+i*3.5)*s);C.lineTo(6*s,(-7+i*3.5)*s);C.stroke();}
  // Pouches
  C.fillStyle='#3a3a2a';
  C.fillRect(-7*s,-6*s,4*s,4*s); C.fillRect(3*s,-6*s,4*s,4*s);
  // Shoulder pads
  C.fillStyle='#2e2e26';
  C.beginPath(); C.ellipse(-9*s,-5*s,4*s,3*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(9*s,-5*s,4*s,3*s,0,0,Math.PI*2); C.fill();

  // Neck
  C.fillStyle='#8a6a50'; C.fillRect(-2*s,-14*s,4*s,5*s);

  // Helmet with gradient
  const helmG=C.createRadialGradient(-2*s,-24*s,1*s,0,-20*s,9*s);
  helmG.addColorStop(0,'#4a5238'); helmG.addColorStop(0.5,'#2a2e20'); helmG.addColorStop(1,'#1a1e14');
  C.fillStyle=helmG;
  C.beginPath(); C.ellipse(0,-20*s,9*s,8*s,0,0,Math.PI*2); C.fill();
  // Helmet rim
  C.fillStyle='#1e2218';
  C.beginPath(); C.ellipse(0,-16*s,10*s,3*s,0,0,Math.PI*2); C.fill();
  // Camo on helmet
  C.fillStyle='#3a4228';
  C.beginPath(); C.ellipse(-3*s,-21*s,4*s,3*s,-0.3,0,Math.PI*2); C.fill();
  C.fillStyle='#2a3020';
  C.beginPath(); C.ellipse(3*s,-19*s,3*s,2*s,0.2,0,Math.PI*2); C.fill();
  // NVG mount
  C.fillStyle='#1a1a14';
  C.fillRect(-2*s,-26*s,4*s,5*s); C.fillRect(-3*s,-27*s,6*s,2*s);
  // Balaclava face
  C.fillStyle='#1a1a14';
  C.beginPath(); C.ellipse(0,-16*s,6*s,5*s,0,0,Math.PI*2); C.fill();
  // Goggles
  C.fillStyle='#006688';
  C.beginPath(); C.ellipse(-3*s,-17*s,2.5*s,1.8*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(3*s,-17*s,2.5*s,1.8*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='rgba(120,210,255,0.45)';
  C.beginPath(); C.arc(-3.5*s,-17.5*s,1*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(2.5*s,-17.5*s,1*s,0,Math.PI*2); C.fill();

  // M4 Carbine along aim axis
  C.fillStyle='#1a1208'; C.fillRect(4*s,-3*s,10*s,5*s); C.fillRect(8*s,2*s,6*s,3*s);
  C.fillStyle='#2a2a22'; C.fillRect(12*s,-4*s,12*s,7*s);
  C.fillStyle='#1a1a14';
  C.beginPath(); C.moveTo(16*s,3*s); C.lineTo(18*s,10*s); C.lineTo(22*s,10*s); C.lineTo(22*s,3*s); C.closePath(); C.fill();
  C.strokeStyle='#111'; C.lineWidth=1.2*s;
  C.beginPath(); C.arc(18*s,3*s,3.5*s,0,Math.PI); C.stroke();
  C.fillStyle='#333328'; C.fillRect(12*s,-6*s,16*s,4*s);
  C.fillStyle='#2a2a22'; C.fillRect(24*s,-5*s,14*s,8*s);
  C.fillStyle='#1e1e18';
  for(let ri=0;ri<4;ri++){C.fillRect((25+ri*3.2)*s,-5*s,1.5*s,1.5*s);C.fillRect((25+ri*3.2)*s,2.5*s,1.5*s,1.5*s);}
  C.fillStyle='#222220'; C.fillRect(36*s,-2*s,16*s,4*s);
  C.fillStyle='#333330'; C.fillRect(51*s,-3.5*s,4*s,7*s);
  C.fillStyle='#3a3a30'; C.fillRect(22*s,-7.5*s,4*s,2.5*s); C.fillRect(24*s,-9*s,4*s,2.5*s);
  // Magazine
  C.fillStyle='#2a2018';
  C.beginPath(); C.moveTo(16*s,3*s); C.lineTo(14*s,14*s); C.lineTo(22*s,14*s); C.lineTo(22*s,3*s); C.closePath(); C.fill();

  C.globalAlpha=1; C.restore();
}

// ================================================================
//  SPRITE ASSETS -- WALKER ZOMBIE
// ================================================================
function drawWalker(s,walk){
  // Feet
  C.fillStyle='#1a1a14';
  C.beginPath(); C.ellipse(-5*s+walk*8*s,12*s,3.5*s,2.5*s,walk*0.3,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(5*s-walk*8*s,12*s,3.5*s,2.5*s,-walk*0.3,0,Math.PI*2); C.fill();
  // Legs torn trousers
  C.fillStyle='#3a3020';
  C.fillRect((-7+walk*4)*s,3*s,5*s,10*s); C.fillRect((2-walk*4)*s,3*s,5*s,10*s);
  C.fillStyle='#2a2010'; C.fillRect((-6+walk*4)*s,9*s,2*s,5*s); C.fillRect((4-walk*4)*s,8*s,2*s,6*s);
  // Body torn shirt
  C.fillStyle='#5a6040'; C.fillRect(-8*s,-9*s,16*s,14*s);
  // Chest wound
  C.fillStyle='#7a1a1a';
  C.beginPath(); C.ellipse(-2*s,-3*s,3*s,4*s,0.2,0,Math.PI*2); C.fill();
  C.fillStyle='#4a0a0a';
  C.beginPath(); C.ellipse(-2*s,-3*s,1.5*s,2.5*s,0.2,0,Math.PI*2); C.fill();
  // Arms reaching
  C.fillStyle='#5a7040';
  C.save(); C.rotate(walk*0.3); C.fillRect(8*s,-4*s,14*s,5*s); C.restore();
  C.save(); C.rotate(-walk*0.3); C.fillRect(-22*s,-4*s,14*s,5*s); C.restore();
  // Hands clawing
  C.fillStyle='#7a7050';
  C.beginPath(); C.ellipse(23*s,-2*s,4*s,3*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(-23*s,-2*s,4*s,3*s,0,0,Math.PI*2); C.fill();
  C.strokeStyle='#4a4030'; C.lineWidth=1.2*s;
  [-1,0,1].forEach(f=>{
    C.beginPath(); C.moveTo((21+f*2)*s,-1*s); C.lineTo((25+f*2)*s,(1+f)*s); C.stroke();
    C.beginPath(); C.moveTo((-21+f*2)*s,-1*s); C.lineTo((-25+f*2)*s,(1+f)*s); C.stroke();
  });
  // Neck
  C.fillStyle='#4a3020'; C.fillRect(-2*s,-13*s,4*s,5*s);
  // Head with gradient
  const wkHG=C.createRadialGradient(-2*s,-22*s,1*s,0,-19*s,9*s);
  wkHG.addColorStop(0,'#8a9868'); wkHG.addColorStop(0.6,'#6a7850'); wkHG.addColorStop(1,'#4a5830');
  C.fillStyle=wkHG;
  C.beginPath(); C.ellipse(0,-19*s,8*s,9*s,0,0,Math.PI*2); C.fill();
  // Skull damage
  C.fillStyle='#5a3020';
  C.beginPath(); C.ellipse(4*s,-17*s,3*s,2*s,0.3,0,Math.PI*2); C.fill();
  // Sunken eyes
  C.fillStyle='#1a0a00';
  C.beginPath(); C.ellipse(-3*s,-20*s,2.5*s,2*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(3*s,-20*s,2.5*s,2*s,0,0,Math.PI*2); C.fill();
  // Glowing amber eyes
  C.fillStyle='#ffaa00';
  C.beginPath(); C.arc(-3*s,-20*s,1.2*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(3*s,-20*s,1.2*s,0,Math.PI*2); C.fill();
  // Mouth exposed teeth
  C.fillStyle='#1a0a00';
  C.beginPath(); C.ellipse(0,-16*s,4*s,2.5*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#e8e0d0';
  C.fillRect(-3.5*s,-17.5*s,2*s,2.5*s); C.fillRect(-0.5*s,-17.5*s,2*s,2.5*s); C.fillRect(2.5*s,-17.5*s,1.5*s,2.5*s);
  // Blood drip
  C.fillStyle='#8a0010';
  C.beginPath(); C.ellipse(1*s,-14*s,2*s,3*s,0.2,0,Math.PI*2); C.fill();
}

// ================================================================
//  SPRITE ASSETS -- RUNNER ZOMBIE
// ================================================================
function drawRunner(s,walk){
  C.fillStyle='#4a2010';
  C.fillRect((-6+walk*6)*s,2*s,4*s,12*s); C.fillRect((2-walk*6)*s,2*s,4*s,12*s);
  C.fillStyle='#6a0000';
  C.beginPath(); C.ellipse(-4*s,6*s,2*s,2*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(4*s,9*s,1.5*s,1.5*s,0,0,Math.PI*2); C.fill();
  // Body bloodsoaked
  C.fillStyle='#8a2010'; C.fillRect(-6*s,-10*s,12*s,14*s);
  C.fillStyle='#5a0808';
  C.beginPath(); C.ellipse(2*s,-5*s,3.5*s,4.5*s,-0.2,0,Math.PI*2); C.fill();
  C.fillStyle='#3a0404';
  C.beginPath(); C.ellipse(2*s,-5*s,2*s,3*s,-0.2,0,Math.PI*2); C.fill();
  // Exposed ribs
  C.strokeStyle='#c8a080'; C.lineWidth=0.8*s;
  [-2,-1,0,1].forEach(r=>{C.beginPath();C.arc(2*s,(-5+r*2)*s,3*s,Math.PI,Math.PI*1.8);C.stroke();});
  // Arms sprint pose
  C.fillStyle='#7a3018';
  C.save(); C.rotate(-0.5+walk*0.6); C.fillRect(6*s,-3*s,14*s,4*s); C.restore();
  C.save(); C.rotate(0.4-walk*0.6); C.fillRect(-20*s,-3*s,14*s,4*s); C.restore();
  // Neck wound
  C.fillStyle='#6a3020'; C.fillRect(-2*s,-14*s,4*s,5*s);
  C.fillStyle='#8a0010';
  C.beginPath(); C.ellipse(1*s,-12*s,2*s,1.5*s,0.5,0,Math.PI*2); C.fill();
  // Head missing scalp
  C.fillStyle='#7a6048';
  C.beginPath(); C.ellipse(0,-19*s,6*s,7*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#9a3020';
  C.beginPath(); C.ellipse(-2*s,-23*s,4*s,3*s,0,0.3,Math.PI*1.5); C.fill();
  C.fillStyle='#e8d8c0';
  C.beginPath(); C.ellipse(-2*s,-23*s,3.5*s,2.5*s,0,0,Math.PI*2); C.fill();
  // Wild red eyes
  C.fillStyle='#cc0000';
  C.beginPath(); C.arc(-2.5*s,-20*s,2*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(2.5*s,-20*s,2*s,0,Math.PI*2); C.fill();
  C.fillStyle='#ff4444';
  C.beginPath(); C.arc(-2.5*s,-20.5*s,1*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(2.5*s,-20.5*s,1*s,0,Math.PI*2); C.fill();
  // Screaming mouth
  C.fillStyle='#1a0808';
  C.beginPath(); C.ellipse(0,-16*s,5*s,4*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#d03020';
  C.beginPath(); C.ellipse(0,-16*s,2*s,3*s,0,0,Math.PI); C.fill();
  C.fillStyle='#e8e0d0';
  [-3,-1,1,3].forEach(tx=>{C.fillRect(tx*s-0.8*s,-18.5*s,1.6*s,2.5*s);});
}

// ================================================================
//  SPRITE ASSETS -- TANK ZOMBIE
// ================================================================
function drawTank(s,walk){
  // Feet
  C.fillStyle='#2a2018';
  C.beginPath(); C.ellipse(-7*s+walk*5*s,14*s,5.5*s,3.5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(7*s-walk*5*s,14*s,5.5*s,3.5*s,0,0,Math.PI*2); C.fill();
  // Legs bloated
  C.fillStyle='#3a3228';
  C.fillRect((-10+walk*4)*s,2*s,9*s,14*s); C.fillRect((1-walk*4)*s,2*s,9*s,14*s);
  // Body gradient
  const tkBG=C.createRadialGradient(-4*s,-8*s,3*s,0,-2*s,18*s);
  tkBG.addColorStop(0,'#6a6050'); tkBG.addColorStop(0.5,'#4a4038'); tkBG.addColorStop(1,'#2a2820');
  C.fillStyle=tkBG;
  C.beginPath(); C.ellipse(0,-2*s,18*s,17*s,0,0,Math.PI*2); C.fill();
  // Bloat highlight
  C.fillStyle='#5a5048';
  C.beginPath(); C.ellipse(-3*s,-5*s,8*s,10*s,-0.2,0,Math.PI*2); C.fill();
  // Burst seams
  C.strokeStyle='#2a2018'; C.lineWidth=1.5*s;
  C.beginPath(); C.moveTo(-6*s,-10*s); C.lineTo(-2*s,6*s); C.stroke();
  C.beginPath(); C.moveTo(4*s,-8*s); C.lineTo(8*s,4*s); C.stroke();
  // Infection pustules
  C.fillStyle='#8a8a20';
  [-5,3,-8,6].forEach((px,i)=>{C.beginPath();C.arc(px*s,(-6+i*3)*s,1.5*s,0,Math.PI*2);C.fill();});
  // Massive arms
  C.fillStyle='#4a4038';
  C.beginPath(); C.ellipse(22*s,-2*s,8*s,5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(-22*s,-2*s,8*s,5*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#5a4a38';
  C.beginPath(); C.ellipse(30*s,-1*s,5*s,5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(-30*s,-1*s,5*s,5*s,0,0,Math.PI*2); C.fill();
  // Knuckle wounds
  C.fillStyle='#8a2020';
  [28,30,32].forEach(kx=>{
    C.beginPath(); C.arc(kx*s,-2*s,1*s,0,Math.PI*2); C.fill();
    C.beginPath(); C.arc(-kx*s,-2*s,1*s,0,Math.PI*2); C.fill();
  });
  // Short neck
  C.fillStyle='#4a3a28'; C.fillRect(-5*s,-18*s,10*s,8*s);
  // Huge head
  C.fillStyle='#5a5040';
  C.beginPath(); C.ellipse(0,-24*s,11*s,10*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#e0d8c0';
  C.beginPath(); C.ellipse(2*s,-26*s,5*s,3.5*s,0.2,0,Math.PI*1.2); C.fill();
  C.fillStyle='#0a0a00';
  C.beginPath(); C.ellipse(-4*s,-25*s,3*s,2.5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(4*s,-25*s,3*s,2.5*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#ff8800';
  C.beginPath(); C.arc(-4*s,-25*s,1.5*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(4*s,-25*s,1.5*s,0,Math.PI*2); C.fill();
  C.fillStyle='#1a0a00';
  C.beginPath(); C.ellipse(0,-20*s,7*s,4*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#c0b898';
  [-5,-2.5,0,2.5,5].forEach(tx=>{C.fillRect(tx*s-1.2*s,-23.5*s,2.4*s,(2.5+Math.abs(tx)*0.3)*s);});
}

// ================================================================
//  SPRITE ASSETS -- BOSS ZOMBIE
// ================================================================
function drawBoss(s,walk){
  const bPulse=0.25+0.15*Math.sin(Date.now()/300);
  // Feet
  C.fillStyle='#2a1030';
  C.beginPath(); C.ellipse(-10*s+walk*4*s,18*s,8*s,5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(10*s-walk*4*s,18*s,8*s,5*s,0,0,Math.PI*2); C.fill();
  // Legs
  C.fillStyle='#3a1840';
  C.fillRect((-14+walk*3)*s,2*s,12*s,18*s); C.fillRect((2-walk*3)*s,2*s,12*s,18*s);
  C.strokeStyle='#6a0080'; C.lineWidth=1.5*s;
  C.beginPath(); C.moveTo(-8*s,4*s); C.lineTo(-6*s,16*s); C.stroke();
  C.beginPath(); C.moveTo(8*s,4*s); C.lineTo(6*s,16*s); C.stroke();
  // Body
  C.fillStyle='#4a1a58';
  C.beginPath(); C.ellipse(0,-4*s,24*s,22*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#6a2878';
  C.beginPath(); C.ellipse(-14*s,0,8*s,6*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(14*s,-6*s,6*s,5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(-5*s,-14*s,5*s,4*s,0,0,Math.PI*2); C.fill();
  // Veins
  C.strokeStyle='#1a0028'; C.lineWidth=1.8*s;
  C.beginPath(); C.moveTo(-14*s,-10*s); C.bezierCurveTo(-14*s,-3*s,-8*s,-3*s,-8*s,4*s); C.stroke();
  C.beginPath(); C.moveTo(6*s,-12*s); C.bezierCurveTo(6*s,-3*s,14*s,-3*s,14*s,2*s); C.stroke();
  // Pulsing core
  C.fillStyle=`rgba(180,0,255,${bPulse})`;
  C.beginPath(); C.arc(0,-4*s,8*s,0,Math.PI*2); C.fill();
  C.fillStyle=`rgba(220,100,255,${bPulse*0.5})`;
  C.beginPath(); C.arc(0,-4*s,14*s,0,Math.PI*2); C.fill();
  C.fillStyle=`rgba(255,180,255,${bPulse*0.25})`;
  C.beginPath(); C.arc(0,-4*s,20*s,0,Math.PI*2); C.fill();
  // Tentacle arms
  C.fillStyle='#5a2068';
  C.save(); C.rotate(walk*0.25);
  C.beginPath(); C.moveTo(18*s,-6*s); C.bezierCurveTo(28*s,-2*s,34*s,2*s,38*s,0); C.bezierCurveTo(34*s,2*s,28*s,6*s,18*s,4*s); C.closePath(); C.fill();
  C.restore();
  C.save(); C.rotate(-walk*0.25);
  C.beginPath(); C.moveTo(-18*s,-6*s); C.bezierCurveTo(-28*s,-2*s,-34*s,2*s,-38*s,0); C.bezierCurveTo(-34*s,2*s,-28*s,6*s,-18*s,4*s); C.closePath(); C.fill();
  C.restore();
  // Claws
  C.fillStyle='#3a1048';
  [28,33,38].forEach(ax=>{
    [1,-1].forEach(sign=>{
      C.beginPath(); C.moveTo(ax*s,0); C.lineTo((ax+5)*s,sign*5*s); C.lineTo((ax+3)*s,sign*8*s); C.closePath(); C.fill();
      C.beginPath(); C.moveTo(-ax*s,0); C.lineTo(-(ax+5)*s,sign*5*s); C.lineTo(-(ax+3)*s,sign*8*s); C.closePath(); C.fill();
    });
  });
  // Neck
  C.fillStyle='#3a1048'; C.fillRect(-6*s,-24*s,12*s,10*s);
  // Head
  C.fillStyle='#5a2070';
  C.beginPath(); C.ellipse(0,-32*s,14*s,13*s,0,0,Math.PI*2); C.fill();
  // Crown spines
  C.fillStyle='#e0d0f0';
  [-10,-6,-2,2,6,10].forEach(sx=>{
    C.beginPath(); C.moveTo(sx*s,-42*s); C.lineTo((sx-2)*s,-36*s); C.lineTo((sx+2)*s,-36*s); C.closePath(); C.fill();
  });
  // Eyes
  C.fillStyle='#0a000a';
  C.beginPath(); C.ellipse(-5*s,-33*s,3.5*s,3*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(5*s,-33*s,3.5*s,3*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#cc00ff';
  C.beginPath(); C.arc(-5*s,-33*s,2*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(5*s,-33*s,2*s,0,Math.PI*2); C.fill();
  C.fillStyle='#ff88ff';
  C.beginPath(); C.arc(-5*s,-33.5*s,0.8*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(5*s,-33.5*s,0.8*s,0,Math.PI*2); C.fill();
  // Fanged maw
  C.fillStyle='#0a000a';
  C.beginPath(); C.ellipse(0,-27*s,9*s,6*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#e8e0f0';
  [-6,-3.5,-1,1,3.5,6].forEach(tx=>{
    C.beginPath(); C.moveTo(tx*s,-31*s); C.lineTo((tx-1.5)*s,-26*s); C.lineTo((tx+1.5)*s,-26*s); C.closePath(); C.fill();
  });
  // Drool
  C.strokeStyle=`rgba(180,0,255,0.6)`; C.lineWidth=1.5*s;
  C.beginPath(); C.moveTo(-2*s,-24*s); C.lineTo(-3*s,-20*s); C.stroke();
  C.beginPath(); C.moveTo(3*s,-24*s); C.lineTo(2*s,-18*s); C.stroke();
}

// Dispatch zombie draw
function drawZombie(z){

  let sprite;

  if(z.ti===0) sprite = SPRITES.walker;
  else if(z.ti===1) sprite = SPRITES.runner;
  else if(z.ti===2) sprite = SPRITES.tank;
  else sprite = SPRITES.boss;

  const scale = z.size / 36;

  C.save();

  C.translate(z.x,z.y);

  C.rotate(z.angle);

  if(z.flash>0){
    C.filter='brightness(2)';
  }

  C.drawImage(
    sprite,
    -sprite.width*scale/2,
    -sprite.height*scale/2,
    sprite.width*scale,
    sprite.height*scale
  );

  C.filter='none';

  C.restore();

  // HP BAR
  if(z.hp<z.maxHp){

    const bw=z.size*2.8;
    const bx=z.x-bw/2;
    const by=z.y-z.size-13;

    C.fillStyle='rgba(0,0,0,0.6)';
    C.fillRect(bx-1,by-1,bw+2,7);

    C.fillStyle='#330000';
    C.fillRect(bx,by,bw,5);

    const pct=z.hp/z.maxHp;

    C.fillStyle=
      pct>0.5 ? '#22aa22' :
      pct>0.25 ? '#aaaa00' :
      '#cc0000';

    C.fillRect(bx,by,bw*pct,5);

    C.strokeStyle='rgba(255,255,255,0.15)';
    C.lineWidth=0.5;

    C.strokeRect(bx,by,bw,5);
  }

  //BOSS LABEL
  if(z.ti===3){

    C.save();

    C.font='bold 11px Barlow Condensed,sans-serif';

    C.fillStyle='#cc88ff';

    C.textAlign='center';

    C.shadowColor='#8800ff';

    C.shadowBlur=6;

    C.fillText(
      'BOSS',
      z.x,
      z.y-z.size-16
    );
   
   C.restore();
  }
}

function buildSpriteCache(){

  makeSprite('walker',128,128,()=>{
    drawWalker(2.5,0);
  });

  makeSprite('runner',128,128,()=>{
    drawRunner(2.5,0);
  });

  makeSprite('tank',180,180,()=>{
    drawTank(2.5,0);
  });

  makeSprite('boss',260,260,()=>{
    drawBoss(2.5,0);
  });
  if(G.wave % 5 === 0){
    spawnBoss();
}
 });

// ================================================================
//  SPRITE ASSETS -- BULLET
// ================================================================
function drawBullet(b){
  C.save();
  if(b.trail.length>1){
    for(let i=1;i<b.trail.length;i++){
      const alpha=(i/b.trail.length)*0.4;
      const width=4*(i/b.trail.length);
      C.beginPath(); C.moveTo(b.trail[i-1].x,b.trail[i-1].y); C.lineTo(b.trail[i].x,b.trail[i].y);
      C.strokeStyle=`rgba(255,180,40,${alpha})`; C.lineWidth=width; C.stroke();
    }
    C.beginPath(); C.moveTo(b.trail[0].x,b.trail[0].y);
    for(let i=1;i<b.trail.length;i++) C.lineTo(b.trail[i].x,b.trail[i].y);
    C.lineTo(b.x,b.y);
    C.strokeStyle='rgba(255,240,180,0.85)'; C.lineWidth=1; C.stroke();
  }
  C.translate(b.x,b.y); C.rotate(b.angle);
  const bg=C.createLinearGradient(0,-2,0,2);
  bg.addColorStop(0,'#d4a020'); bg.addColorStop(0.4,'#f0c040'); bg.addColorStop(1,'#a07010');
  C.fillStyle=bg;
  C.beginPath(); C.moveTo(6,0); C.lineTo(4,-1.8); C.lineTo(-3,-1.8); C.lineTo(-3.5,0); C.lineTo(-3,1.8); C.lineTo(4,1.8); C.closePath(); C.fill();
  C.fillStyle='#c06820'; C.beginPath(); C.moveTo(6,0); C.lineTo(4,-1.8); C.lineTo(4,1.8); C.closePath(); C.fill();
  C.fillStyle='#806010'; C.fillRect(-3.5,-2,1,4);
  C.globalAlpha=0.35; C.fillStyle='#ffcc44';
  C.beginPath(); C.arc(2,0,3.5,0,Math.PI*2); C.fill();
  C.globalAlpha=1; C.restore();
}

// ================================================================
// PARTICLE SPRITES
// ================================================================
const PARTICLE_SPRITES = {};

function makeParticleSprite(name,color,size){

  const cv = document.createElement('canvas');

  cv.width = size * 2;
  cv.height = size * 2;

  const cx = cv.getContext('2d');

  const g = cx.createRadialGradient(
    size,
    size,
    1,
    size,
    size,
    size
  );

  g.addColorStop(0,color);
  g.addColorStop(1,'transparent');

  cx.fillStyle = g;

  cx.beginPath();

  cx.arc(size,size,size,0,Math.PI*2);

  cx.fill();

  PARTICLE_SPRITES[name] = cv;
}

function buildParticleSprites(){

  makeParticleSprite('blood','#8a0010',12);

  makeParticleSprite('flash','#ffee88',14);

  makeParticleSprite('fireorange','#ff6600',20);

  makeParticleSprite('fieryellow','#ffcc22',16);

  makeParticleSprite('fiered','#cc2200',18);

  makeParticleSprite('smokegrey','#887766',18);

}

buildParticleSprites();

function drawParticle(pt){

  let sprite = null;

  if(pt.col==='blood'){
    sprite = PARTICLE_SPRITES.blood;
  }
  else if(pt.col==='flash'){
    sprite = PARTICLE_SPRITES.flash;
  }
  else if(pt.col==='fireorange'){
    sprite = PARTICLE_SPRITES.fireorange;
  }
  else if(pt.col==='fieryellow'){
    sprite = PARTICLE_SPRITES.fieryellow;
  }
  else if(pt.col==='fiered'){
    sprite = PARTICLE_SPRITES.fiered;
  }
  else if(pt.col==='smokegrey'){
    sprite = PARTICLE_SPRITES.smokegrey;
  }

  C.save();

  C.globalAlpha = Math.min(1,pt.life/20);

  if(sprite){

    const sz = pt.sz * 2;

    C.drawImage(
      sprite,
      pt.x - sz,
      pt.y - sz,
      sz * 2,
      sz * 2
    );

  }else{

    C.fillStyle = pt.col;

    C.beginPath();

    C.arc(
      pt.x,
      pt.y,
      pt.sz,
      0,
      Math.PI*2
    );

    C.fill();
  }

  C.restore();
}

// ================================================================
//  RENDER DISPATCH
// ================================================================
function render(){
  if(viewMode==='3p') render3P(); else render1P();
}

// ================================================================
//  RENDER -- 3RD PERSON
// ================================================================
function render3P(){
  const W=cW(), H=cH(), p=G.player;
  C.save();
  C.translate(shakeX,shakeY);

  // Background
  const bgG=C.createRadialGradient(W/2,H/2,50,W/2,H/2,Math.max(W,H)*0.7);
  bgG.addColorStop(0,'#141410'); bgG.addColorStop(1,'#080806');
  C.fillStyle=bgG; C.fillRect(0,0,W,H);
  // Grid
  C.strokeStyle='rgba(255,255,255,0.018)'; C.lineWidth=1;
  for(let gx=0;gx<W;gx+=60){C.beginPath();C.moveTo(gx,0);C.lineTo(gx,H);C.stroke();}
  for(let gy=0;gy<H;gy+=60){C.beginPath();C.moveTo(0,gy);C.lineTo(W,gy);C.stroke();}
  // Cracks
  C.strokeStyle='rgba(255,255,255,0.012)'; C.lineWidth=0.5;
  for(let gx=30;gx<W;gx+=60) for(let gy=30;gy<H;gy+=60){
    C.beginPath(); C.moveTo(gx,gy); C.lineTo(gx+15,gy+10); C.lineTo(gx+8,gy+22); C.stroke();
  }
  // Puddles
  C.fillStyle='rgba(0,10,20,0.35)';
  [[W*0.2,H*0.3,40,18],[W*0.7,H*0.6,55,22],[W*0.5,H*0.15,30,12],[W*0.85,H*0.4,35,15]].forEach(([px,py,rw,rh])=>{
    C.beginPath(); C.ellipse(px,py,rw,rh,0.3,0,Math.PI*2); C.fill();
    C.fillStyle='rgba(30,40,60,0.18)'; C.beginPath(); C.ellipse(px-rw*0.2,py-rh*0.2,rw*0.4,rh*0.3,0.3,0,Math.PI*2); C.fill();
    C.fillStyle='rgba(0,10,20,0.35)';
  });
  // Vignette
  const vg=C.createRadialGradient(W/2,H/2,Math.min(W,H)*0.3,W/2,H/2,Math.max(W,H)*0.8);
  vg.addColorStop(0,'transparent'); vg.addColorStop(1,'rgba(0,0,0,0.6)');
  C.fillStyle=vg; C.fillRect(0,0,W,H);

  // Earthquake ground flash
  if(G.earthquakeActive){
    const ef=G.earthquakeDur/120;
    C.fillStyle=`rgba(80,40,0,${Math.min(0.15,ef*0.1+0.05*Math.random())})`;
    C.fillRect(0,0,W,H);
  }

  // Ash particles
  for(const a of G.ashParticles){
    C.save(); C.globalAlpha=a.a*(a.life/400);
    C.fillStyle='#ccbbaa'; C.beginPath(); C.arc(a.x,a.y,a.sz,0,Math.PI*2); C.fill();
    C.restore();
  }

  // Ground cracks from earthquakes/impacts
  for(const crack of G.cracks){
    C.save(); C.globalAlpha=crack.a;
    C.strokeStyle='#ff6600'; C.lineWidth=1.5;
    C.shadowColor='#ff4400'; C.shadowBlur=4;
    for(const line of crack.lines){
      C.beginPath(); C.moveTo(line.ox,line.oy);
      for(const seg of line.segs) C.lineTo(seg.x,seg.y);
      C.stroke();
    }
    C.restore();
  }

  // Blood decals
  for(const d of G.bloodDecals){
    C.save(); C.globalAlpha=d.a;
    C.fillStyle='#580010';
    C.beginPath(); C.ellipse(d.x,d.y,d.r,d.r*(d.oval||0.7),d.rot||0,0,Math.PI*2); C.fill();
    C.globalAlpha=d.a*0.55; C.fillStyle='#380008';
    C.beginPath(); C.ellipse(d.x,d.y,d.r*0.55,d.r*0.4*(d.oval||0.7),d.rot||0,0,Math.PI*2); C.fill();
    C.restore();
  }

  // Debris on ground
  for(const d of G.debris){
    if(!d.landed) continue;
    C.save(); C.translate(d.x,d.y); C.rotate(d.rot);
    C.fillStyle=d.col; C.fillRect(-d.w/2,-d.h/2,d.w,d.h);
    C.restore();
  }

  // Fire columns
  for(const f of G.fires){
    C.save();
    const fp=(f.life/f.maxLife)*f.intensity;
    C.globalAlpha=fp*0.7;
    const fg=C.createRadialGradient(f.x,f.y,0,f.x,f.y,f.w*1.5);
    fg.addColorStop(0,'rgba(255,200,50,0.9)');
    fg.addColorStop(0.4,'rgba(255,80,0,0.6)');
    fg.addColorStop(1,'rgba(200,20,0,0)');
    C.fillStyle=fg; C.beginPath(); C.arc(f.x,f.y,f.w*1.5,0,Math.PI*2); C.fill();
    C.restore();
  }
 
  // ================================================================
  // Particles
  // ================================================================ 
  const maxParticles = 350;

const particleStart =
  Math.max(
    0,
    G.particles.length - maxParticles
  );

for(
  let i = particleStart;
  i < G.particles.length;
  i++
){
  drawParticle(G.particles[i]);
}

  // Asteroids
  for(const ast of G.asteroids){
    C.save(); C.translate(ast.x,ast.y); C.rotate(ast.rot);
    // Rock body
    const rg=C.createRadialGradient(-ast.r*0.3,-ast.r*0.3,1,0,0,ast.r);
    rg.addColorStop(0,'#888070'); rg.addColorStop(0.5,'#5a5248'); rg.addColorStop(1,'#2a2520');
    C.fillStyle=rg;
    C.beginPath(); C.moveTo(ast.pts[0].x,ast.pts[0].y);
    for(let i=1;i<ast.pts.length;i++) C.lineTo(ast.pts[i].x,ast.pts[i].y);
    C.closePath(); C.fill();
    // Glow trail
    C.globalAlpha=0.4;
    const tg=C.createRadialGradient(0,ast.r*0.5,0,0,0,ast.r*1.5);
    tg.addColorStop(0,'rgba(255,120,20,0.6)'); tg.addColorStop(1,'transparent');
    C.fillStyle=tg; C.beginPath(); C.arc(0,0,ast.r*1.5,0,Math.PI*2); C.fill();
    C.restore();
  }

  // Falling debris (airborne)
  for(const d of G.debris){
    if(d.landed) continue;
    C.save(); C.translate(d.x,d.y); C.rotate(d.rot);
    C.fillStyle=d.col; C.fillRect(-d.w/2,-d.h/2,d.w,d.h);
    C.strokeStyle='rgba(200,180,140,0.4)'; C.lineWidth=0.5; C.strokeRect(-d.w/2,-d.h/2,d.w,d.h);
    C.restore();
  }

  // Zombies
  for(const z of G.zombies) drawZombie(z);

  // Bullets
  for(const b of G.bullets) drawBullet(b);

  // Player
  drawPlayer(p.x,p.y,p.angle,p.r,p.invTimer);

  // Auto-aim indicator
  C.save();
  if(autoAim&&aimTarget){
    const lockPulse=0.6+0.4*Math.sin(Date.now()/120);
    C.strokeStyle=`rgba(255,80,0,${lockPulse})`; C.lineWidth=2;
    C.beginPath(); C.arc(aimTarget.x,aimTarget.y,aimTarget.size+6,0,Math.PI*2); C.stroke();
    C.strokeStyle=`rgba(255,160,0,${lockPulse})`; C.lineWidth=2.5;
    const br=aimTarget.size+10;
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx,sy])=>{
      const cx=aimTarget.x+sx*br, cy=aimTarget.y+sy*br;
      C.beginPath(); C.moveTo(cx,aimTarget.y+sy*(br-8)); C.lineTo(cx,cy); C.lineTo(aimTarget.x+sx*(br-8),cy); C.stroke();
    });
    C.strokeStyle='rgba(255,100,0,0.25)'; C.lineWidth=1; C.setLineDash([4,6]);
    C.beginPath(); C.moveTo(p.x,p.y); C.lineTo(aimTarget.x,aimTarget.y); C.stroke();
    C.setLineDash([]);
  }else{
    C.translate(p.x,p.y);
    const ld=55; C.strokeStyle='rgba(255,50,50,0.45)'; C.lineWidth=1; C.setLineDash([3,4]);
    C.beginPath(); C.moveTo(Math.cos(p.angle)*26,Math.sin(p.angle)*26); C.lineTo(Math.cos(p.angle)*ld,Math.sin(p.angle)*ld); C.stroke();
    C.setLineDash([]); C.fillStyle='rgba(255,50,50,0.85)';
    C.beginPath(); C.arc(Math.cos(p.angle)*ld,Math.sin(p.angle)*ld,2.5,0,Math.PI*2); C.fill();
  }
  C.restore();

  // Reload bar
  if(G.reloading){
    const prog=1-G.reloadTimer/90;
    const bw=84,bx=p.x-42,by=p.y-p.r-22;
    C.fillStyle='rgba(0,0,0,0.75)'; C.fillRect(bx-2,by-2,bw+4,12);
    C.fillStyle='#1a1a1a'; C.fillRect(bx,by,bw,7);
    const rg=C.createLinearGradient(bx,0,bx+bw*prog,0);
    rg.addColorStop(0,'#ff4400'); rg.addColorStop(1,'#ffaa00');
    C.fillStyle=rg; C.fillRect(bx,by,bw*prog,7);
    C.save(); C.font='bold 9px JetBrains Mono,monospace'; C.fillStyle='rgba(255,255,255,0.8)';
    C.textAlign='center'; C.fillText('RELOADING',p.x,by-3); C.restore();
  }

  C.restore(); // end shake transform

  // HUD overlays (no shake)
  C.save();
  C.font='bold 12px JetBrains Mono,monospace';
  C.fillStyle='rgba(0,230,118,0.5)'; C.textAlign='center';
  C.fillText(`${G.zombiesTotal-G.zombiesLeft} / ${G.zombiesTotal} ELIMINATED`,W/2,H-10);
  if(autoAim){
    const bp=0.7+0.3*Math.sin(Date.now()/200);
    C.fillStyle=`rgba(255,120,0,${bp})`; C.font='bold 11px JetBrains Mono,monospace';
    C.textAlign='right'; C.fillText('◉ AUTO-AIM',W-12,H-10);
  }
  C.restore();
}

// ================================================================
//  RENDER -- 1ST PERSON raycaster
// ================================================================
const MAP_W=32, MAP_H=20;
let RMAP=null;
function getMap(){
  if(RMAP) return RMAP; RMAP=[];
  for(let y=0;y<MAP_H;y++){
    RMAP[y]=[];
    for(let x=0;x<MAP_W;x++){
      if(x===0||y===0||x===MAP_W-1||y===MAP_H-1) RMAP[y][x]=1;
      else if(x%8===0&&y%6===0&&x>2&&y>2) RMAP[y][x]=1;
      else if(x%8===4&&y%6===3) RMAP[y][x]=1;
      else RMAP[y][x]=0;
    }
  }
  for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
    const cx=Math.floor(MAP_W/2)+dx, cy=Math.floor(MAP_H/2)+dy;
    if(RMAP[cy]&&cx>=0&&cx<MAP_W) RMAP[cy][cx]=0;
  }
  return RMAP;
}

function render1P(){
  const W=cW(), H=cH(), p=G.player;
  const map=getMap(), CELL=50;
  const px=p.x/CELL, py=p.y/CELL, angle=p.angle;
  const FOV=Math.PI/2.6, COLS=Math.min(W,480), colW=W/COLS, halfH=H/2;

  C.save();
  // Earthquake shake
  if(shakeDur>0) C.translate(shakeX,shakeY);

  // Sky
  const sky=C.createLinearGradient(0,0,0,halfH);
  sky.addColorStop(0,'#060000'); sky.addColorStop(0.5,'#130606'); sky.addColorStop(1,'#1e0c04');
  C.fillStyle=sky; C.fillRect(0,0,W,halfH);
  // Fire glow on horizon
  const fg=C.createRadialGradient(W*0.3,halfH,0,W*0.3,halfH,W*0.5);
  fg.addColorStop(0,'rgba(200,60,10,0.35)'); fg.addColorStop(1,'transparent');
  C.fillStyle=fg; C.fillRect(0,halfH*0.2,W,halfH*0.8);
  const fg2=C.createRadialGradient(W*0.75,halfH,0,W*0.75,halfH,W*0.4);
  fg2.addColorStop(0,'rgba(180,50,5,0.25)'); fg2.addColorStop(1,'transparent');
  C.fillStyle=fg2; C.fillRect(0,halfH*0.3,W,halfH*0.7);
  // Ash in sky
  for(const a of G.ashParticles){
    if(a.y>halfH) continue;
    C.save(); C.globalAlpha=a.a*0.5; C.fillStyle='#ccbbaa';
    C.beginPath(); C.arc(a.x,a.y*0.4,a.sz,0,Math.PI*2); C.fill();
    C.restore();
  }
  // Floor
  const flr=C.createLinearGradient(0,halfH,0,H);
  flr.addColorStop(0,'#1a1510'); flr.addColorStop(0.5,'#120f0a'); flr.addColorStop(1,'#080604');
  C.fillStyle=flr; C.fillRect(0,halfH,W,halfH);

  const zBuf=new Float32Array(COLS);
  for(let col=0;col<COLS;col++){
    const ra=angle-FOV/2+(col/COLS)*FOV;
    const cosA=Math.cos(ra), sinA=Math.sin(ra);
    const stepX=Math.abs(1/cosA), stepY=Math.abs(1/sinA);
    let mapX=Math.floor(px), mapY=Math.floor(py);
    let sdX=(cosA<0?(px-mapX):(mapX+1-px))*stepX;
    let sdY=(sinA<0?(py-mapY):(mapY+1-py))*stepY;
    const dX=cosA<0?-1:1, dY=sinA<0?-1:1;
    let hit=0, side=0, maxSteps=50;
    while(!hit&&maxSteps-->0){
      if(sdX<sdY){sdX+=stepX;mapX+=dX;side=0;}
      else{sdY+=stepY;mapY+=dY;side=1;}
      if(mapY>=0&&mapY<MAP_H&&mapX>=0&&mapX<MAP_W&&map[mapY][mapX]) hit=1;
    }
    let dist=Math.max(0.1, side===0?(sdX-stepX):(sdY-stepY));
    zBuf[col]=dist;
    const wallH=Math.min(H*3, H/dist);
    const top=halfH-wallH/2;
    const bright=Math.max(0.05,Math.min(1,1-dist/12));
    const dark=side?0.55:1;
    const rv=Math.floor(bright*dark*72+10);
    const gv=Math.floor(bright*dark*56+8);
    const bv=Math.floor(bright*dark*46+6);
    C.fillStyle=`rgb(${rv},${gv},${bv})`; C.fillRect(col*colW,top,colW+1,wallH);
    if(wallH>24){
      C.fillStyle=`rgb(${Math.max(0,rv-16)},${Math.max(0,gv-13)},${Math.max(0,bv-11)})`;
      const bkH=Math.max(2,wallH/8);
      for(let bk=top;bk<top+wallH;bk+=bkH) C.fillRect(col*colW,bk,colW+1,Math.max(0.5,bkH*0.1));
    }
  }

  // Zombie sprites (billboard)
  const sprites=G.zombies.map(z=>{
    const relX=z.x/CELL-px, relY=z.y/CELL-py;
    const camD=relX*Math.sin(angle)-relY*Math.cos(angle);
    const screenX=(0.5+(-relX*Math.cos(angle)-relY*Math.sin(angle))/(2*camD+0.001))*W;
    return{z, screenX, depth:Math.hypot(relX,relY), camD};
  }).filter(s=>s.camD>0.3).sort((a,b)=>b.depth-a.depth);

  for(const {z,screenX,depth} of sprites){
    const sprH=Math.min(H*2,Math.abs(Math.floor((H/depth)*0.9)));
    const sprW=Math.floor(sprH*0.7);
    const dx=Math.floor(screenX-sprW/2), dy=Math.floor(halfH-sprH/2);
    if(dx+sprW<0||dx>=W) continue;
    let vis=false;
    for(let sc=Math.max(0,dx);sc<Math.min(W,dx+sprW);sc+=Math.max(1,Math.floor(sprW/8))){
      const ci=Math.floor(sc/colW);
      if(ci<COLS&&zBuf[ci]>depth-0.1){vis=true;break;}
    }
    if(!vis) continue;
    const fade=Math.min(1,depth<1?depth:1);
    C.save(); C.globalAlpha=fade*0.95;
    C.save(); C.translate(dx+sprW/2,dy+sprH/2); C.scale(sprW/36,sprH/36);
    if(z.flash>0) C.filter='brightness(3) saturate(0)';
    const s=1, walk=Math.sin(z.walkCycle)*0.15;
    if(z.ti===0) drawWalker(s,walk);
    else if(z.ti===1) drawRunner(s,walk);
    else if(z.ti===2) drawTank(s,walk);
    else drawBoss(s,walk);
    C.filter='none'; C.restore();
    if(z.hp<z.maxHp){
      C.globalAlpha=fade;
      C.fillStyle='rgba(0,0,0,0.6)'; C.fillRect(dx,dy-8,sprW,6);
      C.fillStyle='#330000'; C.fillRect(dx,dy-7,sprW,4);
      const pct=z.hp/z.maxHp;
      C.fillStyle=pct>0.5?'#22aa22':pct>0.25?'#aaaa00':'#cc0000';
      C.fillRect(dx,dy-7,sprW*pct,4);
    }
    if(depth<0.8){
      C.globalAlpha=(1-depth/0.8)*0.4;
      C.fillStyle='#0a0000'; C.fillRect(dx,dy,sprW,sprH);
    }
    C.restore();
  }

  drawFPSGun(W,H);
  C.restore();

  C.save();
  C.font='bold 12px JetBrains Mono,monospace';
  C.fillStyle='rgba(0,230,118,0.45)'; C.textAlign='center';
  C.fillText(`${G.zombiesTotal-G.zombiesLeft} / ${G.zombiesTotal} ELIMINATED`,W/2,H-10);
  if(autoAim){
    const bp=0.7+0.3*Math.sin(Date.now()/200);
    C.fillStyle=`rgba(255,120,0,${bp})`; C.font='bold 11px JetBrains Mono,monospace';
    C.textAlign='right'; C.fillText('◉ AUTO-AIM',W-12,H-10);
  }
  C.restore();
}

// ================================================================
//  FPS WEAPON -- M4 carbine + gloved hands
// ================================================================
function drawFPSGun(W,H){
  const t=Date.now()/800;
  const moving=keys['w']||keys['a']||keys['s']||keys['d']||mDirs.u||mDirs.d||mDirs.l||mDirs.r;
  const bob=moving?Math.sin(t*5)*4:Math.sin(t*0.8)*1.2;
  const sway=moving?Math.sin(t*2.5)*3:0;
  C.save(); C.translate(W/2+80+sway,H-20+bob);

  // Right glove
  C.fillStyle='#1a1a14';
  C.beginPath(); C.moveTo(-80,-85); C.lineTo(-65,-100); C.lineTo(-45,-100);
  C.lineTo(-35,-80); C.lineTo(-40,-65); C.lineTo(-80,-65); C.closePath(); C.fill();
  C.fillStyle='#2a2a20';
  C.fillRect(-75,-98,8,4); C.fillRect(-64,-98,8,4); C.fillRect(-53,-98,8,4);

  // Left glove
  C.fillStyle='#1a1a14';
  C.beginPath(); C.moveTo(-200,-72); C.lineTo(-185,-88); C.lineTo(-165,-88);
  C.lineTo(-155,-68); C.lineTo(-160,-55); C.lineTo(-200,-55); C.closePath(); C.fill();
  C.fillStyle='#2a2a20';
  C.fillRect(-196,-86,8,4); C.fillRect(-185,-86,8,4); C.fillRect(-174,-86,8,4);

  // Stock
  C.fillStyle='#1a1208'; C.fillRect(-30,-82,55,18); C.fillRect(-10,-70,30,10);
  C.fillStyle='#242018'; C.fillRect(18,-84,8,22);

  // Lower receiver + trigger
  C.fillStyle='#2a2a22'; C.fillRect(-90,-90,65,20);
  C.fillStyle='#222220'; C.beginPath(); C.arc(-65,-70,12,0,Math.PI); C.fill();
  C.fillStyle='#3a3a30'; C.fillRect(-70,-78,4,10);

  // Grip + texture
  C.fillStyle='#1a1a14';
  C.beginPath(); C.moveTo(-80,-70); C.lineTo(-72,-68); C.lineTo(-75,-36);
  C.lineTo(-95,-36); C.lineTo(-98,-68); C.closePath(); C.fill();
  C.fillStyle='#141410';
  for(let gi=0;gi<5;gi++) C.fillRect(-96,-64+gi*6,18,2);

  // Magazine
  C.fillStyle='#2a2018';
  C.beginPath(); C.moveTo(-80,-68); C.lineTo(-90,-68); C.lineTo(-95,-20);
  C.bezierCurveTo(-90,5,-60,5,-55,-20); C.lineTo(-60,-68); C.closePath(); C.fill();
  C.fillStyle='#3a3028'; C.fillRect(-88,-60,5,35);
  C.fillStyle='#1a1208'; C.fillRect(-80,-42,2,8);

  // Upper receiver + Picatinny rail
  C.fillStyle='#333328'; C.fillRect(-90,-110,65,22);
  C.fillStyle='#2a2a20'; C.fillRect(-88,-118,60,10);
  C.fillStyle='#1e1e18';
  for(let ri=0;ri<8;ri++) C.fillRect(-86+ri*7,-116,5,6);

  // Charging handle
  C.fillStyle='#3a3a30'; C.fillRect(-55,-112,12,6); C.fillRect(-50,-118,14,8);

  // Rear BUIS sight
  C.fillStyle='#2a2a22'; C.fillRect(-85,-120,10,12); C.fillRect(-82,-122,4,4);

  // Handguard + MLOK
  C.fillStyle='#2e2e26'; C.fillRect(-200,-108,115,22);
  C.fillStyle='#262620'; C.fillRect(-198,-116,110,10);
  for(let ri=0;ri<12;ri++) C.fillRect(-196+ri*9,-114,6,6);
  C.fillStyle='#1a1a14';
  for(let ms=0;ms<5;ms++) C.fillRect(-190+ms*20,-106,12,5);

  // Gas block + front sight
  C.fillStyle='#2a2a22'; C.fillRect(-202,-122,10,18); C.fillRect(-199,-126,4,6);

  // Barrel
  C.fillStyle='#222220'; C.fillRect(-290,-101,95,8);
  C.fillStyle='#1e1e1c'; C.fillRect(-280,-106,85,3);

  // Muzzle brake
  C.fillStyle='#2e2e2a'; C.fillRect(-302,-104,16,14);
  C.fillStyle='#1a1a18';
  C.fillRect(-300,-103,3,5); C.fillRect(-296,-103,3,5); C.fillRect(-292,-103,3,5);
  C.fillRect(-300,-98,3,4);  C.fillRect(-296,-98,3,4);

  // Red dot scope
  C.fillStyle='#2a2a26'; C.fillRect(-70,-130,40,16);
  C.fillStyle='#1e1e1a'; C.fillRect(-68,-128,36,12);
  C.fillStyle='#0a1020'; C.beginPath(); C.arc(-50,-122,5,0,Math.PI*2); C.fill();
  C.fillStyle='rgba(20,60,150,0.5)'; C.beginPath(); C.arc(-50,-122,4,0,Math.PI*2); C.fill();
  C.fillStyle='rgba(100,150,255,0.3)'; C.beginPath(); C.arc(-52,-124,1.5,0,Math.PI*2); C.fill();
  C.fillStyle='rgba(255,20,20,0.9)'; C.beginPath(); C.arc(-50,-122,1,0,Math.PI*2); C.fill();

  // Muzzle flash on shot
  if(G.justFired){
    C.globalAlpha=0.55+Math.random()*0.45;
    const mfg=C.createRadialGradient(-302,-98,0,-302,-98,26);
    mfg.addColorStop(0,'rgba(255,240,180,1)');
    mfg.addColorStop(0.3,'rgba(255,160,40,0.8)');
    mfg.addColorStop(1,'rgba(255,80,0,0)');
    C.fillStyle=mfg; C.beginPath(); C.arc(-302,-98,26,0,Math.PI*2); C.fill();
    C.fillStyle='rgba(255,220,100,0.65)';
    [-30,-15,0,15,30].forEach(fy=>{
      C.beginPath(); C.moveTo(-302,-98);
      C.lineTo(-330+Math.random()*8,-98+fy);
      C.lineTo(-302,-98+fy*0.3); C.closePath(); C.fill();
    });
    C.globalAlpha=1;
  }
  C.restore();
}

// ================================================================
//  HUD UPDATE
// ================================================================
function updateHUD(){
  if(!G.player) return;
  const pct=(G.player.hp/G.player.maxHp)*100;
  const hf=document.getElementById('hfill');
  hf.style.width=pct+'%';
  hf.style.background=pct>60
    ?'linear-gradient(90deg,#880000,#ff4444)'
    :pct>30
    ?'linear-gradient(90deg,#996600,#ffaa00)'
    :'linear-gradient(90deg,#cc0000,#ff0000)';
  const ad=document.getElementById('adots'); ad.innerHTML='';
  for(let i=0;i<G.maxAmmo;i++){
    const d=document.createElement('div');
    d.className='adot'+(i>=G.ammo?' x':'');
    ad.appendChild(d);
  }
  document.getElementById('wnum').textContent=String(G.wave).padStart(2,'0');
  document.getElementById('scoreEl').textContent=G.score.toLocaleString();
}
  function noise(vol,dur,filterFreq,filterType,delayMs){
    setTimeout(()=>{
      try{
        const c=ac();
        const buf=c.createBuffer(1,Math.floor(c.sampleRate*dur),c.sampleRate);
        const d=buf.getChannelData(0);
        for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
        const src=c.createBufferSource(); src.buffer=buf;
        const g=c.createGain();
        g.gain.setValueAtTime(vol,c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
        const f=c.createBiquadFilter();
        f.type=filterType||'bandpass';
        f.frequency.value=filterFreq||600; f.Q.value=1.2;
        src.connect(f); f.connect(g); g.connect(c.destination);
        src.start(); src.stop(c.currentTime+dur);
      }catch(e){}
    }, delayMs||0);
  }

  // ── WEAPON SOUNDS ──────────────────────────────────────────────

  // Gunshot: sharp crack + low thud
  function gunshot(){
    if(muted) return;
    noise(0.7, 0.04, 2200, 'highpass');          // crack
    noise(0.5, 0.12, 320, 'bandpass');            // body thud
    osc(180, 'sawtooth', 0.35, 0.08, 28);         // low punch
  }

  // Shotgun blast: wide spread boom
  function shotgunBlast(){
    if(muted) return;
    noise(0.9, 0.06, 1800, 'highpass');
    noise(0.7, 0.2,  200, 'lowpass');
    osc(90, 'sawtooth', 0.55, 0.18, 20);
    osc(140,'sawtooth', 0.3,  0.12, 30, 20);
  }

  // Empty click when no ammo
  function emptyClick(){
    if(muted) return;
    osc(900,'square',0.15,0.04,800);
  }

  // Reload: 3-stage mechanical
  function reload(){
    if(muted) return;
    osc(1100,'square',0.12,0.05,900,0);
    osc(600, 'square',0.14,0.06,500,90);
    noise(0.2, 0.08, 800,'bandpass',90);
    osc(1400,'square',0.1, 0.04,1200,200);
    osc(700, 'square',0.18,0.07,600,200);
  }

  // ── ZOMBIE SOUNDS ──────────────────────────────────────────────

  // Zombie groan: deep guttural
  function zombieGroan(){
    if(muted) return;
    const pitch = 60+Math.random()*80;
    osc(pitch, 'sawtooth', 0.22, 0.6,  pitch*0.5);
    osc(pitch*1.4,'sine',  0.08, 0.45, pitch*0.6);
    noise(0.05, 0.5, 200, 'lowpass');
  }

  // Zombie scream: runner shriek
  function zombieScream(){
    if(muted) return;
    const p=200+Math.random()*300;
    osc(p,'sawtooth',0.3,0.4,p*0.3);
    osc(p*1.6,'square',0.1,0.35,p*0.4);
  }

  // Zombie hit: meaty impact
  function hit(){
    if(muted) return;
    noise(0.45, 0.07, 600, 'bandpass');
    osc(120,'sawtooth',0.2,0.06,60);
  }

  // Zombie death: collapse thud + gurgle
  function death(){
    if(muted) return;
    osc(80,'sawtooth',0.5,0.35,20);
    noise(0.4, 0.18, 400, 'bandpass');
    osc(300,'sine',0.15,0.25,80,80);
  }

  // Boss roar
  function bossRoar(){
    if(muted) return;
    const p=40+Math.random()*30;
    osc(p,'sawtooth',0.6,0.8,p*0.4);
    osc(p*2,'sawtooth',0.3,0.7,p*0.6);
    noise(0.3,0.6,150,'lowpass');
  }

  // ── PLAYER SOUNDS ─────────────────────────────────────────────

  function playerHurt(){
    if(muted) return;
    noise(0.55,0.1,400,'bandpass');
    osc(380,'sawtooth',0.3,0.12,150);
  }

  function playerDeath(){
    if(muted) return;
    [350,250,160,80].forEach((f,i)=>osc(f,'sawtooth',0.4,0.3,f*0.3,i*120));
    noise(0.4,0.4,300,'bandpass',100);
  }

  // ── ENVIRONMENT SOUNDS ────────────────────────────────────────

  // Earthquake rumble: deep sub-bass growl
  function earthquakeRumble(){
    if(muted) return;
    osc(30,'sawtooth',0.8,1.5,15);
    osc(45,'sine',    0.6,1.5,20);
    noise(0.5,1.5,80,'lowpass');
    noise(0.3,1.0,160,'bandpass',200);
  }

  // Asteroid impact: thunderous boom
  function asteroidImpact(){
    if(muted) return;
    osc(40,'sawtooth',0.9,0.6,10);
    osc(60,'square',  0.7,0.5,15);
    noise(0.8,0.3,300,'lowpass');
    noise(0.6,0.5,1200,'highpass',50);
    noise(0.4,0.8,200,'lowpass',100);
  }

  // Debris crash: crunching
  function debrisCrash(){
    if(muted) return;
    noise(0.5,0.15,800,'bandpass');
    osc(200,'sawtooth',0.3,0.1,80);
    noise(0.3,0.25,400,'bandpass',80);
  }

  // Fire crackle: looping (called periodically)
  function fireCrackle(){
    if(muted) return;
    noise(0.12,0.08,1200,'bandpass');
    osc(800,'square',0.04,0.06,600);
  }

  // Wave clear fanfare
  function waveClear(){
    if(muted) return;
    [523,659,784,1047].forEach((f,i)=>osc(f,'sine',0.22,0.2,f,i*130));
  }

  function gameOverSnd(){
    if(muted) return;
    [380,280,190,100].forEach((f,i)=>osc(f,'sawtooth',0.35,0.28,f*0.5,i*150));
    noise(0.3,0.8,200,'lowpass',100);
  }

  // ── MUSIC ─────────────────────────────────────────────────────
  function startMusic(){
    if(muted||musicTimer) return;
    const c=ac();
    const mG=c.createGain(); mG.gain.value=0.04; mG.connect(c.destination);
    const bassNotes=[38,41,43,46,38,41,36,38];
    let beat=0;
    function tick(){
      if(muted){ stopMusic(); return; }
      const freq=Math.pow(2,(bassNotes[beat%bassNotes.length]-69)/12)*440;
      // Bass note
      const o=c.createOscillator(),g=c.createGain();
      o.type='sawtooth'; o.frequency.value=freq;
      g.gain.setValueAtTime(0.7,c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+0.4);
      o.connect(g); g.connect(mG); o.start(); o.stop(c.currentTime+0.45);
      // Occasional percussion hit
      if(beat%4===0){
        const pb=c.createBuffer(1,Math.floor(c.sampleRate*0.1),c.sampleRate);
        const pd=pb.getChannelData(0);
        for(let i=0;i<pd.length;i++) pd[i]=(Math.random()*2-1)*Math.exp(-i/(c.sampleRate*0.04));
        const ps=c.createBufferSource(); ps.buffer=pb;
        const pg=c.createGain(); pg.gain.value=0.25;
        ps.connect(pg); pg.connect(mG); ps.start();
      }
      beat++;
      musicTimer=setTimeout(tick,480);
    }
    tick();
  }
  function stopMusic(){ clearTimeout(musicTimer); musicTimer=null; }

  function toggle(){
    muted=!muted;
    document.getElementById('sndBtn').textContent=muted?'🔇':'🔊';
    if(muted) stopMusic(); else startMusic();
  }
  function unlock(){ ac(); startMusic(); }

  return{
    gunshot,shotgunBlast,emptyClick,reload,
    zombieGroan,zombieScream,hit,death,bossRoar,
    playerHurt,playerDeath,
    earthquakeRumble,asteroidImpact,debrisCrash,fireCrackle,
    waveClear,gameOverSnd,startMusic,stopMusic,toggle,unlock
  };
})();

// ── CANVAS RESIZE ─────────────────────────────────────────────────
function resizeCanvas(){
  const W=window.innerWidth, H=window.innerHeight-HUD_H;
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  canvas.width=Math.floor(W*DPR); canvas.height=Math.floor(H*DPR);
  C.setTransform(DPR,0,0,DPR,0,0);
  if(G.player){
    G.player.x=Math.max(G.player.r,Math.min(cW()-G.player.r,G.player.x));
    G.player.y=Math.max(G.player.r,Math.min(cH()-G.player.r,G.player.y));
  }
}
resizeCanvas();
window.addEventListener('resize',resizeCanvas);

// ── INPUT ─────────────────────────────────────────────────────────
window.addEventListener('keydown',e=>{
  keys[e.key.toLowerCase()]=true;
  if(e.code==='Space'){e.preventDefault();mShooting=true;}
  if(e.key.toLowerCase()==='r') doReload();
  if(e.key.toLowerCase()==='p'||e.key==='Escape') togglePause();
  if(e.key.toLowerCase()==='v') setView(viewMode==='3p'?'1p':'3p');
  if(e.key==='Tab'){e.preventDefault();toggleAutoAim();}
});
window.addEventListener('keyup',e=>{
  keys[e.key.toLowerCase()]=false;
  if(e.code==='Space') mShooting=false;
});
canvas.addEventListener('mousemove',e=>{
  const r=canvas.getBoundingClientRect();
  mouseX=e.clientX-r.left; mouseY=e.clientY-r.top;
});
canvas.addEventListener('mousedown',e=>{if(e.button===0){SFX.unlock();mShooting=true;}});
canvas.addEventListener('mouseup',  e=>{if(e.button===0) mShooting=false;});

(function(){
  const map={dU:'u',dD:'d',dL:'l',dR:'r'};
  Object.entries(map).forEach(([id,dir])=>{
    const el=document.getElementById(id); if(!el)return;
    const on =e=>{e.preventDefault();mDirs[dir]=true; el.classList.add('pressed');};
    const off=e=>{e.preventDefault();mDirs[dir]=false;el.classList.remove('pressed');};
    el.addEventListener('touchstart',on, {passive:false});
    el.addEventListener('touchend',  off,{passive:false});
    el.addEventListener('touchcancel',off,{passive:false});
  });
})();

const sbtnEl=document.getElementById('sbtn');
sbtnEl.addEventListener('touchstart',e=>{e.preventDefault();SFX.unlock();mobileFire=true; sbtnEl.classList.add('firing');},   {passive:false});
sbtnEl.addEventListener('touchend',  e=>{e.preventDefault();              mobileFire=false;sbtnEl.classList.remove('firing');},{passive:false});
sbtnEl.addEventListener('touchcancel',()=>{mobileFire=false;sbtnEl.classList.remove('firing');});
sbtnEl.addEventListener('mousedown', ()=>{SFX.unlock();mobileFire=true; sbtnEl.classList.add('firing');});
sbtnEl.addEventListener('mouseup',   ()=>{              mobileFire=false;sbtnEl.classList.remove('firing');});

const rbtnEl=document.getElementById('rbtn');
rbtnEl.addEventListener('touchstart',e=>{e.preventDefault();SFX.unlock();doReload();},{passive:false});
rbtnEl.addEventListener('click',()=>doReload());

// ── VIEW / PAUSE / NOTIFS ─────────────────────────────────────────
function setView(v){
  viewMode=v;
  document.getElementById('v3b').classList.toggle('on',v==='3p');
  document.getElementById('v1b').classList.toggle('on',v==='1p');
  document.getElementById('xhair').style.display=v==='1p'?'block':'none';
}
setView('3p');

function togglePause(){
  if(!G.player)return; paused=!paused;
  if(paused){
    cancelAnimationFrame(animId);
    document.getElementById('pauseStats').textContent=`WAVE ${G.wave}  |  SCORE ${G.score.toLocaleString()}`;
    document.getElementById('ovrPause').classList.add('show');
  }else{
    document.getElementById('ovrPause').classList.remove('show');
    loop();
  }
}
function hideAllOvr(){['ovrPause','ovrWave','ovrDead'].forEach(id=>document.getElementById(id).classList.remove('show'));}

function showNotif(msg,cls){
  const el=document.getElementById('notifs');
  const n=document.createElement('div');
  n.className='nf'+(cls?' '+cls:'');
  n.textContent=msg; el.appendChild(n);
  setTimeout(()=>{if(el.contains(n))el.removeChild(n);},2500);
}
function waveAnnounce(w){
  const el=document.getElementById('wann');
  el.textContent='WAVE '+w;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),3200);
}

function doReload(){
  if(!G.player||G.reloading||G.ammo>=G.maxAmmo)return;
  G.reloading=true; G.reloadTimer=90; SFX.reload(); showNotif('RELOADING...','o');
}

function toggleAutoAim(){
  autoAim=!autoAim; aimTarget=null;
  showNotif(autoAim?'AUTO-AIM ON':'AUTO-AIM OFF', autoAim?'':'r');
  document.getElementById('autoAimBtn').classList.toggle('on',autoAim);
  const mob=document.getElementById('aabtnMobile');
  if(mob) mob.classList.toggle('on',autoAim);
}

// ── AUTO-AIM ──────────────────────────────────────────────────────
function getAutoAimTarget(p){
  if(!autoAim||G.zombies.length===0) return null;
  const SNAP_RANGE=320;
  let best=null, bestScore=Infinity;
  for(const z of G.zombies){
    const dist=Math.hypot(p.x-z.x,p.y-z.y);
    if(dist>SNAP_RANGE) continue;
    const hysteresis=(z===aimTarget)?0.7:1.0;
    const score=dist*hysteresis;
    if(score<bestScore){bestScore=score;best=z;}
  }
  return best;
}

// ── SCREEN SHAKE ──────────────────────────────────────────────────
function triggerShake(magnitude,duration){
  shakeMag=Math.max(shakeMag,magnitude);
  shakeDur=Math.max(shakeDur,duration);
}
function updateShake(){
  if(shakeDur>0){
    shakeX=(Math.random()-0.5)*shakeMag*2;
    shakeY=(Math.random()-0.5)*shakeMag*2;
    shakeDur--;
    shakeMag*=0.9;
  }else{
    shakeX=0; shakeY=0; shakeMag=0;
  }
}

// ================================================================
//  ZOMBIE DEFINITIONS
// ================================================================
const ZTYPES=[
  {col:'#4a7a3a',speed:1.2, hp:2,  size:18,pts:100,  dmg:1},  // Walker
  {col:'#8b2020',speed:2.8, hp:1,  size:14,pts:150,  dmg:1},  // Runner
  {col:'#3a3a2a',speed:0.8, hp:6,  size:24,pts:200,  dmg:2},  // Tank
  {col:'#5a2080',speed:1.5, hp:20, size:30,pts:1000, dmg:3},  // Boss
];

// ================================================================
//  GAME STATE
// ================================================================
function initState(){
  resizeCanvas();
  return{
    player:{x:cW()/2,y:cH()/2,r:18,speed:3.6,hp:100,maxHp:100,angle:0,invTimer:0},
    bullets:[],zombies:[],particles:[],bloodDecals:[],
    // Apocalyptic environment
    asteroids:[],
    earthquakeTimer:0,  earthquakeActive:false, earthquakeDur:0,
    cracks:[], fires:[], debris:[], ashParticles:[],
    nextAsteroid:180+Math.floor(Math.random()*240),
    nextEarthquake:300+Math.floor(Math.random()*300),
    nextFire:120,
    score:0,wave:1,ammo:12,maxAmmo:12,
    reloading:false,reloadTimer:0,
    spawnQueue:[],spawnTimer:0,zombiesTotal:0,zombiesLeft:0,waveDone:false,
    justFired:false,
  };
}

function buildSpawnQueue(){
  const w=G.wave, count=8+w*3; const q=[];
  for(let i=0;i<count;i++){
    const r=Math.random(); let t=0;
    if(w>=5&&r>0.96)t=3;
    else if(w>=3&&r>0.74)t=2;
    else if(w>=2&&r>0.50)t=1;
    q.push(t);
  }
  G.spawnQueue=q; G.zombiesTotal=count; G.zombiesLeft=count;
  G.waveDone=false; G.spawnTimer=0;
}

// ── GAME FLOW ─────────────────────────────────────────────────────
function startGame(){
  cancelAnimationFrame(animId); paused=false; hideAllOvr();
  autoAim=false; aimTarget=null;
  G=initState(); updateHUD();
  buildSpawnQueue(); waveAnnounce(G.wave);
  showScreen('sGame'); SFX.unlock(); SFX.startMusic(); loop();
}
function nextWave(){
  cancelAnimationFrame(animId);
  document.getElementById('ovrWave').classList.remove('show');
  G.wave++; G.ammo=G.maxAmmo;
  G.player.hp=Math.min(G.player.maxHp,G.player.hp+30);
  // Increase apocalyptic frequency every wave
  G.nextAsteroid=Math.max(90, 180-G.wave*15);
  G.nextEarthquake=Math.max(180, 300-G.wave*20);
  buildSpawnQueue(); updateHUD(); waveAnnounce(G.wave);
  SFX.startMusic(); loop();
}
function endWave(){
  cancelAnimationFrame(animId); SFX.waveClear(); SFX.stopMusic();
  const bonus=500*G.wave; G.score+=bonus; updateHUD();
  document.getElementById('wcTitle').textContent=`WAVE ${G.wave} CLEAR!`;
  document.getElementById('wcStats').innerHTML=`BONUS +${bonus.toLocaleString()} PTS<br>SCORE: ${G.score.toLocaleString()}`;
  document.getElementById('ovrWave').classList.add('show');
}
function gameOver(){
  cancelAnimationFrame(animId); SFX.playerDeath(); SFX.stopMusic();
  document.getElementById('goStats').innerHTML=`SCORE: ${G.score.toLocaleString()}<br>SURVIVED: WAVE ${G.wave}`;
  document.getElementById('ovrDead').classList.add('show');
}

// ── MAIN LOOP ─────────────────────────────────────────────────────
function loop(){ update(); render(); animId=requestAnimationFrame(loop); }

// ================================================================
//  UPDATE
// ================================================================
function update(){
  if(paused||!G.player) return;
  const p=G.player;

  // Movement
  let dx=0,dy=0;
  if(keys['w']||keys['arrowup']   ||mDirs.u) dy-=p.speed;
  if(keys['s']||keys['arrowdown'] ||mDirs.d) dy+=p.speed;
  if(keys['a']||keys['arrowleft'] ||mDirs.l) dx-=p.speed;
  if(keys['d']||keys['arrowright']||mDirs.r) dx+=p.speed;
  // Earthquake pushes player randomly
  if(G.earthquakeActive){
    dx+=(Math.random()-0.5)*G.earthquakeDur*0.08;
    dy+=(Math.random()-0.5)*G.earthquakeDur*0.08;
  }
  if(dx&&dy){dx*=0.707;dy*=0.707;}
  p.x=Math.max(p.r,Math.min(cW()-p.r,p.x+dx));
  p.y=Math.max(p.r,Math.min(cH()-p.r,p.y+dy));

  // Auto-aim / manual aim
  if(autoAim){
    aimTarget=getAutoAimTarget(p);
    if(aimTarget){
      const bspeed=14, dist=Math.hypot(p.x-aimTarget.x,p.y-aimTarget.y);
      const lead=dist/bspeed;
      const predX=aimTarget.x+Math.cos(aimTarget.angle)*aimTarget.speed*lead;
      const predY=aimTarget.y+Math.sin(aimTarget.angle)*aimTarget.speed*lead;
      const ta=Math.atan2(predY-p.y,predX-p.x);
      const diff=((ta-p.angle+Math.PI*3)%(Math.PI*2))-Math.PI;
      p.angle+=diff*0.28;
    }else{
      if(viewMode==='3p') p.angle=Math.atan2(mouseY-p.y,mouseX-p.x);
      else if(dx||dy) p.angle=Math.atan2(dy,dx);
    }
  }else{
    aimTarget=null;
    if(viewMode==='3p') p.angle=Math.atan2(mouseY-p.y,mouseX-p.x);
    else if(dx||dy) p.angle=Math.atan2(dy,dx);
  }

  // Shoot
  if(shootCD>0) shootCD--;
  const wantShoot=mShooting||mobileFire;
  if(wantShoot&&shootCD===0&&!G.reloading){
    if(G.ammo>0){
      const a=p.angle;
      G.bullets.push({x:p.x+Math.cos(a)*28,y:p.y+Math.sin(a)*28,
        vx:Math.cos(a)*14,vy:Math.sin(a)*14,life:90,angle:a,trail:[]});
      G.ammo--; shootCD=10; updateHUD(); SFX.gunshot();
      for(let i=0;i<6;i++){
        const fa=a+(-0.3+Math.random()*0.6);
        G.particles.push({x:p.x+Math.cos(a)*28,y:p.y+Math.sin(a)*28,
          vx:Math.cos(fa)*(4+Math.random()*6),vy:Math.sin(fa)*(4+Math.random()*6),
          life:6+Math.random()*5,col:'flash',sz:3+Math.random()*4});
      }
      document.getElementById('mflash').style.display='block';
      setTimeout(()=>document.getElementById('mflash').style.display='none',60);
      G.justFired=true; setTimeout(()=>{if(G)G.justFired=false;},80);
      if(G.ammo===0) showNotif('EMPTY -- RELOAD!','r');
    }else{
      SFX.emptyClick(); shootCD=15;
    }
  }

  // Reload
  if(G.reloading){
    G.reloadTimer--;
    if(G.reloadTimer<=0){G.ammo=G.maxAmmo;G.reloading=false;showNotif('RELOADED','');updateHUD();}
  }

  // Spawn zombies
  if(G.spawnQueue.length>0){
    G.spawnTimer++;
    const interval=Math.max(15,55-G.wave*4);
    if(G.spawnTimer>=interval){
      const t=ZTYPES[G.spawnQueue.pop()];
      const side=Math.floor(Math.random()*4);
      let zx,zy;
      if(side===0){zx=Math.random()*cW();zy=-40;}
      else if(side===1){zx=cW()+40;zy=Math.random()*cH();}
      else if(side===2){zx=Math.random()*cW();zy=cH()+40;}
      else{zx=-40;zy=Math.random()*cH();}
      G.zombies.push({x:zx,y:zy,hp:t.hp,maxHp:t.hp,
        speed:t.speed*(1+G.wave*0.05),
        size:t.size,col:t.col,pts:t.pts,dmg:t.dmg,
        angle:0,flash:0,ti:ZTYPES.indexOf(t),
        walkCycle:Math.random()*Math.PI*2});
      G.spawnTimer=0;
      if(t===ZTYPES[3]) SFX.bossRoar();
    }
  }

  // Random groan
  groanTimer--;
  if(groanTimer<=0&&G.zombies.length>0){
    const z=G.zombies[Math.floor(Math.random()*G.zombies.length)];
    if(z.ti===1) SFX.zombieScream(); else SFX.zombieGroan();
    groanTimer=80+Math.random()*120;
  }

  // Update zombies
  if(p.invTimer>0) p.invTimer--;
  for(let i=G.zombies.length-1;i>=0;i--){
    const z=G.zombies[i];
    const ang=Math.atan2(p.y-z.y,p.x-z.x);
    z.angle=ang; z.walkCycle+=0.08+z.speed*0.06;
    z.x+=Math.cos(ang)*z.speed; z.y+=Math.sin(ang)*z.speed;
    z.x=Math.max(z.size,Math.min(cW()-z.size,z.x));
    z.y=Math.max(z.size,Math.min(cH()-z.size,z.y));
    if(z.flash>0) z.flash--;
    if(p.invTimer===0&&Math.hypot(p.x-z.x,p.y-z.y)<p.r+z.size){
      p.hp=Math.max(0,p.hp-z.dmg); p.invTimer=40; SFX.playerHurt(); updateHUD();
      if(p.hp<=0){gameOver();return;}
    }
  }

  // Update bullets
  if(G.particles.length>200) G.particles.splice(0,G.particles.length-200);
  for(let i=G.bullets.length-1;i>=0;i--){
    const b=G.bullets[i];
    b.trail.push({x:b.x,y:b.y}); if(b.trail.length>7)b.trail.shift();
    b.x+=b.vx; b.y+=b.vy; b.life--;
    if(b.life<=0||b.x<0||b.x>cW()||b.y<0||b.y>cH()){G.bullets.splice(i,1);continue;}
    let hit=false;
    for(let j=G.zombies.length-1;j>=0;j--){
      const z=G.zombies[j];
      if(Math.hypot(b.x-z.x,b.y-z.y)<z.size){
        z.hp--; z.flash=10; SFX.hit(); spawnBlood(b.x,b.y,8);
        G.bloodDecals.push({x:b.x,y:b.y,r:3+Math.random()*4,a:0.7,
          oval:0.5+Math.random()*0.8,rot:Math.random()*Math.PI});
        if(z.hp<=0){
          G.score+=z.pts; G.zombiesLeft--;
          SFX.death();
          spawnBlood(z.x,z.y,22);
          for(let k=0;k<6;k++) G.bloodDecals.push({
            x:z.x+(-18+Math.random()*36),y:z.y+(-18+Math.random()*36),
            r:4+Math.random()*9,a:0.8,oval:0.4+Math.random()*0.9,rot:Math.random()*Math.PI});
          if(z===aimTarget) aimTarget=null;
          G.zombies.splice(j,1); updateHUD();
        }
        hit=true; break;
      }
    }
    if(hit) G.bullets.splice(i,1);
  }

  // Particles
  for(let i=G.particles.length-1;i>=0;i--){
    const pt=G.particles[i];
    pt.x+=pt.vx; pt.y+=pt.vy; pt.vy+=0.1; pt.vx*=0.92; pt.life--;
    if(pt.life<=0) G.particles.splice(i,1);
  }

  // Blood decals
  if(G.bloodDecals.length>150) G.bloodDecals.splice(0,G.bloodDecals.length-150);
  for(let i=G.bloodDecals.length-1;i>=0;i--){
    G.bloodDecals[i].a-=0.002;
    if(G.bloodDecals[i].a<=0) G.bloodDecals.splice(i,1);
  }

  // ================================================================
  //  APOCALYPTIC ENVIRONMENT UPDATE
  // ================================================================
  updateAsteroidSystem();
  updateEarthquakeSystem();
  updateFireSystem();
  updateDebrisSystem();
  updateAshSystem();
  updateShake();

  // Wave complete
  if(!G.waveDone&&G.zombiesLeft<=0&&G.spawnQueue.length===0&&G.zombies.length===0){
    G.waveDone=true; setTimeout(endWave,600);
  }
}

function spawnBlood(x,y,n){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, s=Math.random()*4+1;
    G.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-1,life:12+Math.random()*16,col:'blood',sz:1.5+Math.random()*3});
  }
}

// ================================================================
//  APOCALYPTIC ENVIRONMENT SYSTEMS
// ================================================================

// ── ASTEROID SYSTEM ───────────────────────────────────────────────
function updateAsteroidSystem(){
  // Spawn timer
  G.nextAsteroid--;
  if(G.nextAsteroid<=0){
    spawnAsteroid();
    G.nextAsteroid=Math.max(90,180-G.wave*15)+Math.floor(Math.random()*120);
  }
  // Update asteroids
  for(let i=G.asteroids.length-1;i>=0;i--){
    const ast=G.asteroids[i];
    ast.y+=ast.speed;
    ast.x+=ast.vx;
    ast.rot+=0.03;
    // Spawn trailing fire/smoke particles
    if(Math.random()<0.4){
      G.particles.push({
        x:ast.x+(Math.random()-0.5)*ast.r,
        y:ast.y-ast.r,
        vx:(Math.random()-0.5)*1.5, vy:-0.5-Math.random()*2,
        life:18+Math.random()*20,
        col:Math.random()<0.5?'fireorange':'smokegrey',
        sz:3+Math.random()*6
      });
    }
    // Check impact
    if(ast.y>cH()+ast.r||ast.x<-ast.r||ast.x>cW()+ast.r){
      G.asteroids.splice(i,1); continue;
    }
    // Impact on ground (near bottom)
    if(ast.y>cH()-20&&!ast.impacted){
      ast.impacted=true;
      triggerShake(12,45);
      SFX.asteroidImpact();
      // Crater effect -- spawn debris
      for(let k=0;k<20;k++){
        const ba=Math.random()*Math.PI*2, bs=3+Math.random()*8;
        G.debris.push({x:ast.x,y:ast.y,
          vx:Math.cos(ba)*bs, vy:Math.sin(ba)*bs-5,
          life:40+Math.random()*40, rot:Math.random()*Math.PI*2, rotV:(-0.2+Math.random()*0.4),
          w:4+Math.random()*12, h:3+Math.random()*8, col:'#5a4a30'});
      }
      // Explosion particles
      for(let k=0;k<30;k++){
        const ba=Math.random()*Math.PI*2, bs=2+Math.random()*10;
        G.particles.push({x:ast.x,y:ast.y,
          vx:Math.cos(ba)*bs, vy:Math.sin(ba)*bs-4,
          life:20+Math.random()*25,
          col:Math.random()<0.6?'fireorange':Math.random()<0.5?'fieryellow':'smokegrey',
          sz:4+Math.random()*8});
      }
      // Ground crack
      G.cracks.push({x:ast.x,y:cH()-10,
        lines:generateCrackLines(ast.x,cH()-10,5),a:0.9});
      // Damage player if close
      if(G.player&&Math.hypot(G.player.x-ast.x,G.player.y-ast.y)<ast.r+40){
        G.player.hp=Math.max(0,G.player.hp-15);
        G.player.invTimer=60; SFX.playerHurt(); updateHUD();
        if(G.player.hp<=0){gameOver();return;}
      }
      // Damage nearby zombies
      for(const z of G.zombies){
        if(Math.hypot(z.x-ast.x,z.y-ast.y)<ast.r+50){
          z.hp-=3; z.flash=12;
          if(z.hp<=0){G.score+=z.pts;G.zombiesLeft--;spawnBlood(z.x,z.y,15);}
        }
      }
      G.zombies=G.zombies.filter(z=>z.hp>0);
    }
  }
}

function spawnAsteroid(){
  const r=18+Math.random()*28;
  G.asteroids.push({
    x: r + Math.random()*(cW()-r*2),
    y: -r*2,
    vx: (-0.5+Math.random())*2,
    speed: 3+Math.random()*4+G.wave*0.3,
    r, rot:0, impacted:false,
    // Polygon points for rocky shape
    pts: Array.from({length:8},(_,i)=>{
      const a=(i/8)*Math.PI*2;
      const radius=r*(0.7+Math.random()*0.5);
      return{x:Math.cos(a)*radius, y:Math.sin(a)*radius};
    })
  });
}

function generateCrackLines(ox,oy,branches){
  const lines=[];
  for(let b=0;b<branches;b++){
    const a=Math.random()*Math.PI*2;
    const len=30+Math.random()*60;
    let cx=ox,cy=oy;
    const segs=[];
    for(let s=0;s<4;s++){
      const na=a+(-0.4+Math.random()*0.8);
      const nl=len/4*(0.7+Math.random()*0.6);
      segs.push({x:cx+Math.cos(na)*nl, y:cy+Math.sin(na)*nl});
      cx+=Math.cos(na)*nl; cy+=Math.sin(na)*nl;
    }
    lines.push({ox,oy,segs});
  }
  return lines;
}

// ── EARTHQUAKE SYSTEM ─────────────────────────────────────────────
function updateEarthquakeSystem(){
  G.nextEarthquake--;
  if(G.nextEarthquake<=0&&!G.earthquakeActive){
    G.earthquakeActive=true;
    G.earthquakeDur=90+Math.floor(Math.random()*90);
    triggerShake(8,G.earthquakeDur);
    SFX.earthquakeRumble();
    showNotif('EARTHQUAKE!','r');
    // Spawn ground cracks
    for(let i=0;i<4;i++){
      G.cracks.push({
        x:Math.random()*cW(), y:Math.random()*cH(),
        lines:generateCrackLines(Math.random()*cW(),Math.random()*cH(),4),
        a:0.8
      });
    }
    G.nextEarthquake=Math.max(180,300-G.wave*20)+Math.floor(Math.random()*180);
  }
  if(G.earthquakeActive){
    G.earthquakeDur--;
    if(G.earthquakeDur<=0) G.earthquakeActive=false;
  }
  // Fade cracks
  for(let i=G.cracks.length-1;i>=0;i--){
    G.cracks[i].a-=0.0015;
    if(G.cracks[i].a<=0) G.cracks.splice(i,1);
  }
}

// ── FIRE COLUMN SYSTEM ────────────────────────────────────────────
function updateFireSystem(){
  G.nextFire--;
  if(G.nextFire<=0){
    // Spawn fire column at random edge position
    G.fires.push({
      x: Math.random()*cW(),
      y: cH()-5,
      life: 120+Math.random()*180,
      maxLife: 300, intensity: 0.3+Math.random()*0.7,
      w: 20+Math.random()*30
    });
    G.nextFire=60+Math.floor(Math.random()*90);
    if(Math.random()<0.3) SFX.fireCrackle();
  }
  for(let i=G.fires.length-1;i>=0;i--){
    const f=G.fires[i]; f.life--;
    // Spawn fire particles
    if(Math.random()<0.6){
      G.particles.push({
        x:f.x+(-f.w/2+Math.random()*f.w), y:f.y,
        vx:(-0.5+Math.random())*1.5, vy:-(2+Math.random()*4),
        life:20+Math.random()*25,
        col:Math.random()<0.6?'fireorange':Math.random()<0.5?'fieryellow':'fiered',
        sz:4+Math.random()*8
      });
    }
    if(f.life<=0) G.fires.splice(i,1);
    // Damage player standing in fire
    if(G.player&&Math.abs(G.player.x-f.x)<f.w/2&&G.player.y>f.y-40){
      if(G.player.invTimer===0&&Math.random()<0.05){
        G.player.hp=Math.max(0,G.player.hp-1);
        G.player.invTimer=20; updateHUD();
        if(G.player.hp<=0){gameOver();return;}
      }
    }
  }
}

// ── DEBRIS SYSTEM ─────────────────────────────────────────────────
function updateDebrisSystem(){
  // Periodically spawn falling debris
  if(Math.random()<0.008+G.wave*0.002){
    G.debris.push({
      x:Math.random()*cW(), y:-20,
      vx:(-0.5+Math.random())*2, vy:2+Math.random()*4,
      life:80+Math.random()*60, rot:Math.random()*Math.PI*2,
      rotV:(-0.1+Math.random()*0.2),
      w:6+Math.random()*20, h:4+Math.random()*14,
      col:Math.random()<0.5?'#5a4a30':'#444438'
    });
  }
  for(let i=G.debris.length-1;i>=0;i--){
    const d=G.debris[i];
    d.x+=d.vx; d.y+=d.vy; d.vy+=0.12; d.rot+=d.rotV; d.life--;
    // Impact
    if(d.y>cH()&&!d.landed){
      d.landed=true; d.vy=0; d.vx=0;
      SFX.debrisCrash();
      triggerShake(3,12);
      // Damage player if hit
      if(G.player&&Math.hypot(G.player.x-d.x,G.player.y-d.y)<20){
        G.player.hp=Math.max(0,G.player.hp-8);
        G.player.invTimer=40; updateHUD(); SFX.playerHurt();
        if(G.player.hp<=0){gameOver();return;}
      }
    }
    if(d.life<=0) G.debris.splice(i,1);
  }
}

// ── ASH PARTICLES SYSTEM ──────────────────────────────────────────
function updateAshSystem(){
  // Continuously spawn drifting ash
  if(Math.random()<0.15+G.wave*0.02){
    G.ashParticles.push({
      x:Math.random()*cW(), y:-5,
      vx:(-0.3+Math.random()*0.6)*0.8,
      vy:0.3+Math.random()*0.8,
      life:200+Math.random()*200,
      sz:1+Math.random()*2.5,
      a:0.3+Math.random()*0.4,
      wobble:Math.random()*Math.PI*2
    });
  }
  if(G.ashParticles.length>300) G.ashParticles.splice(0,G.ashParticles.length-300);
  for(let i=G.ashParticles.length-1;i>=0;i--){
    const a=G.ashParticles[i];
    a.wobble+=0.02; a.x+=a.vx+Math.sin(a.wobble)*0.3;
    a.y+=a.vy; a.life--;
    if(a.life<=0||a.y>cH()+10) G.ashParticles.splice(i,1);
  }
}

// ================================================================
//  SPRITE ASSETS -- PLAYER
// ================================================================
function drawPlayer(x,y,angle,r,invTimer){
  C.save(); C.translate(x,y); C.rotate(angle);
  if(invTimer>0&&Math.floor(invTimer/5)%2===0) C.globalAlpha=0.35;
  const s=r/18;

  // Drop shadow
  C.fillStyle='rgba(0,0,0,0.32)';
  C.beginPath(); C.ellipse(2*s,4*s,14*s,8*s,0,0,Math.PI*2); C.fill();

  // Boots
  C.fillStyle='#1a1a12';
  C.fillRect(-6*s,10*s,5*s,7*s); C.fillRect(2*s,10*s,5*s,7*s);
  // Boot sole
  C.fillStyle='#0e0e0a';
  C.fillRect(-6*s,16*s,6*s,1.5*s); C.fillRect(2*s,16*s,6*s,1.5*s);

  // Legs - olive camo trousers
  C.fillStyle='#4a5238';
  C.fillRect(-7*s,2*s,6*s,10*s); C.fillRect(2*s,2*s,6*s,10*s);
  // Camo patches
  C.fillStyle='#3a4228';
  C.fillRect(-6*s,4*s,3*s,3*s); C.fillRect(3*s,7*s,3*s,2*s); C.fillRect(-5*s,8*s,2*s,3*s);
  // Knee pads
  C.fillStyle='#2a2e20';
  C.beginPath(); C.ellipse(-4*s,8*s,3*s,2.5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(5*s,8*s,3*s,2.5*s,0,0,Math.PI*2); C.fill();

  // Tactical vest with gradient
  const vestG=C.createLinearGradient(-8*s,-10*s,8*s,4*s);
  vestG.addColorStop(0,'#3a3a30'); vestG.addColorStop(0.4,'#2a2a22'); vestG.addColorStop(1,'#1a1a16');
  C.fillStyle=vestG; C.fillRect(-8*s,-10*s,16*s,14*s);
  // Vest plates
  const plateG=C.createLinearGradient(-7*s,-9*s,7*s,3*s);
  plateG.addColorStop(0,'#2e2e26'); plateG.addColorStop(1,'#1a1a14');
  C.fillStyle=plateG; C.fillRect(-7*s,-9*s,14*s,12*s);
  // Edge highlight
  C.strokeStyle='rgba(255,255,255,0.07)'; C.lineWidth=0.6*s;
  C.strokeRect(-7*s,-9*s,14*s,12*s);
  // MOLLE webbing
  C.strokeStyle='#1a1a14'; C.lineWidth=0.8*s;
  for(let i=0;i<3;i++){C.beginPath();C.moveTo(-6*s,(-7+i*3.5)*s);C.lineTo(6*s,(-7+i*3.5)*s);C.stroke();}
  // Pouches
  C.fillStyle='#3a3a2a';
  C.fillRect(-7*s,-6*s,4*s,4*s); C.fillRect(3*s,-6*s,4*s,4*s);
  // Shoulder pads
  C.fillStyle='#2e2e26';
  C.beginPath(); C.ellipse(-9*s,-5*s,4*s,3*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(9*s,-5*s,4*s,3*s,0,0,Math.PI*2); C.fill();

  // Neck
  C.fillStyle='#8a6a50'; C.fillRect(-2*s,-14*s,4*s,5*s);

  // Helmet with gradient
  const helmG=C.createRadialGradient(-2*s,-24*s,1*s,0,-20*s,9*s);
  helmG.addColorStop(0,'#4a5238'); helmG.addColorStop(0.5,'#2a2e20'); helmG.addColorStop(1,'#1a1e14');
  C.fillStyle=helmG;
  C.beginPath(); C.ellipse(0,-20*s,9*s,8*s,0,0,Math.PI*2); C.fill();
  // Helmet rim
  C.fillStyle='#1e2218';
  C.beginPath(); C.ellipse(0,-16*s,10*s,3*s,0,0,Math.PI*2); C.fill();
  // Camo on helmet
  C.fillStyle='#3a4228';
  C.beginPath(); C.ellipse(-3*s,-21*s,4*s,3*s,-0.3,0,Math.PI*2); C.fill();
  C.fillStyle='#2a3020';
  C.beginPath(); C.ellipse(3*s,-19*s,3*s,2*s,0.2,0,Math.PI*2); C.fill();
  // NVG mount
  C.fillStyle='#1a1a14';
  C.fillRect(-2*s,-26*s,4*s,5*s); C.fillRect(-3*s,-27*s,6*s,2*s);
  // Balaclava face
  C.fillStyle='#1a1a14';
  C.beginPath(); C.ellipse(0,-16*s,6*s,5*s,0,0,Math.PI*2); C.fill();
  // Goggles
  C.fillStyle='#006688';
  C.beginPath(); C.ellipse(-3*s,-17*s,2.5*s,1.8*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(3*s,-17*s,2.5*s,1.8*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='rgba(120,210,255,0.45)';
  C.beginPath(); C.arc(-3.5*s,-17.5*s,1*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(2.5*s,-17.5*s,1*s,0,Math.PI*2); C.fill();

  // M4 Carbine along aim axis
  C.fillStyle='#1a1208'; C.fillRect(4*s,-3*s,10*s,5*s); C.fillRect(8*s,2*s,6*s,3*s);
  C.fillStyle='#2a2a22'; C.fillRect(12*s,-4*s,12*s,7*s);
  C.fillStyle='#1a1a14';
  C.beginPath(); C.moveTo(16*s,3*s); C.lineTo(18*s,10*s); C.lineTo(22*s,10*s); C.lineTo(22*s,3*s); C.closePath(); C.fill();
  C.strokeStyle='#111'; C.lineWidth=1.2*s;
  C.beginPath(); C.arc(18*s,3*s,3.5*s,0,Math.PI); C.stroke();
  C.fillStyle='#333328'; C.fillRect(12*s,-6*s,16*s,4*s);
  C.fillStyle='#2a2a22'; C.fillRect(24*s,-5*s,14*s,8*s);
  C.fillStyle='#1e1e18';
  for(let ri=0;ri<4;ri++){C.fillRect((25+ri*3.2)*s,-5*s,1.5*s,1.5*s);C.fillRect((25+ri*3.2)*s,2.5*s,1.5*s,1.5*s);}
  C.fillStyle='#222220'; C.fillRect(36*s,-2*s,16*s,4*s);
  C.fillStyle='#333330'; C.fillRect(51*s,-3.5*s,4*s,7*s);
  C.fillStyle='#3a3a30'; C.fillRect(22*s,-7.5*s,4*s,2.5*s); C.fillRect(24*s,-9*s,4*s,2.5*s);
  // Magazine
  C.fillStyle='#2a2018';
  C.beginPath(); C.moveTo(16*s,3*s); C.lineTo(14*s,14*s); C.lineTo(22*s,14*s); C.lineTo(22*s,3*s); C.closePath(); C.fill();

  C.globalAlpha=1; C.restore();
}

// ================================================================
//  SPRITE ASSETS -- WALKER ZOMBIE
// ================================================================
function drawWalker(s,walk){
  // Feet
  C.fillStyle='#1a1a14';
  C.beginPath(); C.ellipse(-5*s+walk*8*s,12*s,3.5*s,2.5*s,walk*0.3,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(5*s-walk*8*s,12*s,3.5*s,2.5*s,-walk*0.3,0,Math.PI*2); C.fill();
  // Legs torn trousers
  C.fillStyle='#3a3020';
  C.fillRect((-7+walk*4)*s,3*s,5*s,10*s); C.fillRect((2-walk*4)*s,3*s,5*s,10*s);
  C.fillStyle='#2a2010'; C.fillRect((-6+walk*4)*s,9*s,2*s,5*s); C.fillRect((4-walk*4)*s,8*s,2*s,6*s);
  // Body torn shirt
  C.fillStyle='#5a6040'; C.fillRect(-8*s,-9*s,16*s,14*s);
  // Chest wound
  C.fillStyle='#7a1a1a';
  C.beginPath(); C.ellipse(-2*s,-3*s,3*s,4*s,0.2,0,Math.PI*2); C.fill();
  C.fillStyle='#4a0a0a';
  C.beginPath(); C.ellipse(-2*s,-3*s,1.5*s,2.5*s,0.2,0,Math.PI*2); C.fill();
  // Arms reaching
  C.fillStyle='#5a7040';
  C.save(); C.rotate(walk*0.3); C.fillRect(8*s,-4*s,14*s,5*s); C.restore();
  C.save(); C.rotate(-walk*0.3); C.fillRect(-22*s,-4*s,14*s,5*s); C.restore();
  // Hands clawing
  C.fillStyle='#7a7050';
  C.beginPath(); C.ellipse(23*s,-2*s,4*s,3*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(-23*s,-2*s,4*s,3*s,0,0,Math.PI*2); C.fill();
  C.strokeStyle='#4a4030'; C.lineWidth=1.2*s;
  [-1,0,1].forEach(f=>{
    C.beginPath(); C.moveTo((21+f*2)*s,-1*s); C.lineTo((25+f*2)*s,(1+f)*s); C.stroke();
    C.beginPath(); C.moveTo((-21+f*2)*s,-1*s); C.lineTo((-25+f*2)*s,(1+f)*s); C.stroke();
  });
  // Neck
  C.fillStyle='#4a3020'; C.fillRect(-2*s,-13*s,4*s,5*s);
  // Head with gradient
  const wkHG=C.createRadialGradient(-2*s,-22*s,1*s,0,-19*s,9*s);
  wkHG.addColorStop(0,'#8a9868'); wkHG.addColorStop(0.6,'#6a7850'); wkHG.addColorStop(1,'#4a5830');
  C.fillStyle=wkHG;
  C.beginPath(); C.ellipse(0,-19*s,8*s,9*s,0,0,Math.PI*2); C.fill();
  // Skull damage
  C.fillStyle='#5a3020';
  C.beginPath(); C.ellipse(4*s,-17*s,3*s,2*s,0.3,0,Math.PI*2); C.fill();
  // Sunken eyes
  C.fillStyle='#1a0a00';
  C.beginPath(); C.ellipse(-3*s,-20*s,2.5*s,2*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(3*s,-20*s,2.5*s,2*s,0,0,Math.PI*2); C.fill();
  // Glowing amber eyes
  C.fillStyle='#ffaa00';
  C.beginPath(); C.arc(-3*s,-20*s,1.2*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(3*s,-20*s,1.2*s,0,Math.PI*2); C.fill();
  // Mouth exposed teeth
  C.fillStyle='#1a0a00';
  C.beginPath(); C.ellipse(0,-16*s,4*s,2.5*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#e8e0d0';
  C.fillRect(-3.5*s,-17.5*s,2*s,2.5*s); C.fillRect(-0.5*s,-17.5*s,2*s,2.5*s); C.fillRect(2.5*s,-17.5*s,1.5*s,2.5*s);
  // Blood drip
  C.fillStyle='#8a0010';
  C.beginPath(); C.ellipse(1*s,-14*s,2*s,3*s,0.2,0,Math.PI*2); C.fill();
}

// ================================================================
//  SPRITE ASSETS -- RUNNER ZOMBIE
// ================================================================
function drawRunner(s,walk){
  C.fillStyle='#4a2010';
  C.fillRect((-6+walk*6)*s,2*s,4*s,12*s); C.fillRect((2-walk*6)*s,2*s,4*s,12*s);
  C.fillStyle='#6a0000';
  C.beginPath(); C.ellipse(-4*s,6*s,2*s,2*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(4*s,9*s,1.5*s,1.5*s,0,0,Math.PI*2); C.fill();
  // Body bloodsoaked
  C.fillStyle='#8a2010'; C.fillRect(-6*s,-10*s,12*s,14*s);
  C.fillStyle='#5a0808';
  C.beginPath(); C.ellipse(2*s,-5*s,3.5*s,4.5*s,-0.2,0,Math.PI*2); C.fill();
  C.fillStyle='#3a0404';
  C.beginPath(); C.ellipse(2*s,-5*s,2*s,3*s,-0.2,0,Math.PI*2); C.fill();
  // Exposed ribs
  C.strokeStyle='#c8a080'; C.lineWidth=0.8*s;
  [-2,-1,0,1].forEach(r=>{C.beginPath();C.arc(2*s,(-5+r*2)*s,3*s,Math.PI,Math.PI*1.8);C.stroke();});
  // Arms sprint pose
  C.fillStyle='#7a3018';
  C.save(); C.rotate(-0.5+walk*0.6); C.fillRect(6*s,-3*s,14*s,4*s); C.restore();
  C.save(); C.rotate(0.4-walk*0.6); C.fillRect(-20*s,-3*s,14*s,4*s); C.restore();
  // Neck wound
  C.fillStyle='#6a3020'; C.fillRect(-2*s,-14*s,4*s,5*s);
  C.fillStyle='#8a0010';
  C.beginPath(); C.ellipse(1*s,-12*s,2*s,1.5*s,0.5,0,Math.PI*2); C.fill();
  // Head missing scalp
  C.fillStyle='#7a6048';
  C.beginPath(); C.ellipse(0,-19*s,6*s,7*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#9a3020';
  C.beginPath(); C.ellipse(-2*s,-23*s,4*s,3*s,0,0.3,Math.PI*1.5); C.fill();
  C.fillStyle='#e8d8c0';
  C.beginPath(); C.ellipse(-2*s,-23*s,3.5*s,2.5*s,0,0,Math.PI*2); C.fill();
  // Wild red eyes
  C.fillStyle='#cc0000';
  C.beginPath(); C.arc(-2.5*s,-20*s,2*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(2.5*s,-20*s,2*s,0,Math.PI*2); C.fill();
  C.fillStyle='#ff4444';
  C.beginPath(); C.arc(-2.5*s,-20.5*s,1*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(2.5*s,-20.5*s,1*s,0,Math.PI*2); C.fill();
  // Screaming mouth
  C.fillStyle='#1a0808';
  C.beginPath(); C.ellipse(0,-16*s,5*s,4*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#d03020';
  C.beginPath(); C.ellipse(0,-16*s,2*s,3*s,0,0,Math.PI); C.fill();
  C.fillStyle='#e8e0d0';
  [-3,-1,1,3].forEach(tx=>{C.fillRect(tx*s-0.8*s,-18.5*s,1.6*s,2.5*s);});
}

// ================================================================
//  SPRITE ASSETS -- TANK ZOMBIE
// ================================================================
function drawTank(s,walk){
  // Feet
  C.fillStyle='#2a2018';
  C.beginPath(); C.ellipse(-7*s+walk*5*s,14*s,5.5*s,3.5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(7*s-walk*5*s,14*s,5.5*s,3.5*s,0,0,Math.PI*2); C.fill();
  // Legs bloated
  C.fillStyle='#3a3228';
  C.fillRect((-10+walk*4)*s,2*s,9*s,14*s); C.fillRect((1-walk*4)*s,2*s,9*s,14*s);
  // Body gradient
  const tkBG=C.createRadialGradient(-4*s,-8*s,3*s,0,-2*s,18*s);
  tkBG.addColorStop(0,'#6a6050'); tkBG.addColorStop(0.5,'#4a4038'); tkBG.addColorStop(1,'#2a2820');
  C.fillStyle=tkBG;
  C.beginPath(); C.ellipse(0,-2*s,18*s,17*s,0,0,Math.PI*2); C.fill();
  // Bloat highlight
  C.fillStyle='#5a5048';
  C.beginPath(); C.ellipse(-3*s,-5*s,8*s,10*s,-0.2,0,Math.PI*2); C.fill();
  // Burst seams
  C.strokeStyle='#2a2018'; C.lineWidth=1.5*s;
  C.beginPath(); C.moveTo(-6*s,-10*s); C.lineTo(-2*s,6*s); C.stroke();
  C.beginPath(); C.moveTo(4*s,-8*s); C.lineTo(8*s,4*s); C.stroke();
  // Infection pustules
  C.fillStyle='#8a8a20';
  [-5,3,-8,6].forEach((px,i)=>{C.beginPath();C.arc(px*s,(-6+i*3)*s,1.5*s,0,Math.PI*2);C.fill();});
  // Massive arms
  C.fillStyle='#4a4038';
  C.beginPath(); C.ellipse(22*s,-2*s,8*s,5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(-22*s,-2*s,8*s,5*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#5a4a38';
  C.beginPath(); C.ellipse(30*s,-1*s,5*s,5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(-30*s,-1*s,5*s,5*s,0,0,Math.PI*2); C.fill();
  // Knuckle wounds
  C.fillStyle='#8a2020';
  [28,30,32].forEach(kx=>{
    C.beginPath(); C.arc(kx*s,-2*s,1*s,0,Math.PI*2); C.fill();
    C.beginPath(); C.arc(-kx*s,-2*s,1*s,0,Math.PI*2); C.fill();
  });
  // Short neck
  C.fillStyle='#4a3a28'; C.fillRect(-5*s,-18*s,10*s,8*s);
  // Huge head
  C.fillStyle='#5a5040';
  C.beginPath(); C.ellipse(0,-24*s,11*s,10*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#e0d8c0';
  C.beginPath(); C.ellipse(2*s,-26*s,5*s,3.5*s,0.2,0,Math.PI*1.2); C.fill();
  C.fillStyle='#0a0a00';
  C.beginPath(); C.ellipse(-4*s,-25*s,3*s,2.5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(4*s,-25*s,3*s,2.5*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#ff8800';
  C.beginPath(); C.arc(-4*s,-25*s,1.5*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(4*s,-25*s,1.5*s,0,Math.PI*2); C.fill();
  C.fillStyle='#1a0a00';
  C.beginPath(); C.ellipse(0,-20*s,7*s,4*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#c0b898';
  [-5,-2.5,0,2.5,5].forEach(tx=>{C.fillRect(tx*s-1.2*s,-23.5*s,2.4*s,(2.5+Math.abs(tx)*0.3)*s);});
}

// ================================================================
//  SPRITE ASSETS -- BOSS ZOMBIE
// ================================================================
function drawBoss(s,walk){
  const bPulse=0.25+0.15*Math.sin(Date.now()/300);
  // Feet
  C.fillStyle='#2a1030';
  C.beginPath(); C.ellipse(-10*s+walk*4*s,18*s,8*s,5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(10*s-walk*4*s,18*s,8*s,5*s,0,0,Math.PI*2); C.fill();
  // Legs
  C.fillStyle='#3a1840';
  C.fillRect((-14+walk*3)*s,2*s,12*s,18*s); C.fillRect((2-walk*3)*s,2*s,12*s,18*s);
  C.strokeStyle='#6a0080'; C.lineWidth=1.5*s;
  C.beginPath(); C.moveTo(-8*s,4*s); C.lineTo(-6*s,16*s); C.stroke();
  C.beginPath(); C.moveTo(8*s,4*s); C.lineTo(6*s,16*s); C.stroke();
  // Body
  C.fillStyle='#4a1a58';
  C.beginPath(); C.ellipse(0,-4*s,24*s,22*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#6a2878';
  C.beginPath(); C.ellipse(-14*s,0,8*s,6*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(14*s,-6*s,6*s,5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(-5*s,-14*s,5*s,4*s,0,0,Math.PI*2); C.fill();
  // Veins
  C.strokeStyle='#1a0028'; C.lineWidth=1.8*s;
  C.beginPath(); C.moveTo(-14*s,-10*s); C.bezierCurveTo(-14*s,-3*s,-8*s,-3*s,-8*s,4*s); C.stroke();
  C.beginPath(); C.moveTo(6*s,-12*s); C.bezierCurveTo(6*s,-3*s,14*s,-3*s,14*s,2*s); C.stroke();
  // Pulsing core
  C.fillStyle=`rgba(180,0,255,${bPulse})`;
  C.beginPath(); C.arc(0,-4*s,8*s,0,Math.PI*2); C.fill();
  C.fillStyle=`rgba(220,100,255,${bPulse*0.5})`;
  C.beginPath(); C.arc(0,-4*s,14*s,0,Math.PI*2); C.fill();
  C.fillStyle=`rgba(255,180,255,${bPulse*0.25})`;
  C.beginPath(); C.arc(0,-4*s,20*s,0,Math.PI*2); C.fill();
  // Tentacle arms
  C.fillStyle='#5a2068';
  C.save(); C.rotate(walk*0.25);
  C.beginPath(); C.moveTo(18*s,-6*s); C.bezierCurveTo(28*s,-2*s,34*s,2*s,38*s,0); C.bezierCurveTo(34*s,2*s,28*s,6*s,18*s,4*s); C.closePath(); C.fill();
  C.restore();
  C.save(); C.rotate(-walk*0.25);
  C.beginPath(); C.moveTo(-18*s,-6*s); C.bezierCurveTo(-28*s,-2*s,-34*s,2*s,-38*s,0); C.bezierCurveTo(-34*s,2*s,-28*s,6*s,-18*s,4*s); C.closePath(); C.fill();
  C.restore();
  // Claws
  C.fillStyle='#3a1048';
  [28,33,38].forEach(ax=>{
    [1,-1].forEach(sign=>{
      C.beginPath(); C.moveTo(ax*s,0); C.lineTo((ax+5)*s,sign*5*s); C.lineTo((ax+3)*s,sign*8*s); C.closePath(); C.fill();
      C.beginPath(); C.moveTo(-ax*s,0); C.lineTo(-(ax+5)*s,sign*5*s); C.lineTo(-(ax+3)*s,sign*8*s); C.closePath(); C.fill();
    });
  });
  // Neck
  C.fillStyle='#3a1048'; C.fillRect(-6*s,-24*s,12*s,10*s);
  // Head
  C.fillStyle='#5a2070';
  C.beginPath(); C.ellipse(0,-32*s,14*s,13*s,0,0,Math.PI*2); C.fill();
  // Crown spines
  C.fillStyle='#e0d0f0';
  [-10,-6,-2,2,6,10].forEach(sx=>{
    C.beginPath(); C.moveTo(sx*s,-42*s); C.lineTo((sx-2)*s,-36*s); C.lineTo((sx+2)*s,-36*s); C.closePath(); C.fill();
  });
  // Eyes
  C.fillStyle='#0a000a';
  C.beginPath(); C.ellipse(-5*s,-33*s,3.5*s,3*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(5*s,-33*s,3.5*s,3*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#cc00ff';
  C.beginPath(); C.arc(-5*s,-33*s,2*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(5*s,-33*s,2*s,0,Math.PI*2); C.fill();
  C.fillStyle='#ff88ff';
  C.beginPath(); C.arc(-5*s,-33.5*s,0.8*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(5*s,-33.5*s,0.8*s,0,Math.PI*2); C.fill();
  // Fanged maw
  C.fillStyle='#0a000a';
  C.beginPath(); C.ellipse(0,-27*s,9*s,6*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#e8e0f0';
  [-6,-3.5,-1,1,3.5,6].forEach(tx=>{
    C.beginPath(); C.moveTo(tx*s,-31*s); C.lineTo((tx-1.5)*s,-26*s); C.lineTo((tx+1.5)*s,-26*s); C.closePath(); C.fill();
  });
  // Drool
  C.strokeStyle=`rgba(180,0,255,0.6)`; C.lineWidth=1.5*s;
  C.beginPath(); C.moveTo(-2*s,-24*s); C.lineTo(-3*s,-20*s); C.stroke();
  C.beginPath(); C.moveTo(3*s,-24*s); C.lineTo(2*s,-18*s); C.stroke();
}

// Dispatch zombie draw
function drawZombie(z){
  const s=z.size/18, walk=Math.sin(z.walkCycle)*0.2;
  C.save(); C.translate(z.x,z.y); C.rotate(z.angle);
  if(z.flash>0) C.filter='brightness(3) saturate(0)';
  if(z.ti===0) drawWalker(s,walk);
  else if(z.ti===1) drawRunner(s,walk);
  else if(z.ti===2) drawTank(s,walk);
  else drawBoss(s,walk);
  C.filter='none'; C.restore();
  // HP bar
  if(z.hp<z.maxHp){
    const bw=z.size*2.8,bx=z.x-bw/2,by=z.y-z.size-13;
    C.fillStyle='rgba(0,0,0,0.6)'; C.fillRect(bx-1,by-1,bw+2,7);
    C.fillStyle='#330000'; C.fillRect(bx,by,bw,5);
    const pct=z.hp/z.maxHp;
    C.fillStyle=pct>0.5?'#22aa22':pct>0.25?'#aaaa00':'#cc0000';
    C.fillRect(bx,by,bw*pct,5);
    C.strokeStyle='rgba(255,255,255,0.15)'; C.lineWidth=0.5; C.strokeRect(bx,by,bw,5);
  }
  if(z.ti===3){
    C.save();
    C.font='bold 11px Barlow Condensed,sans-serif';
    C.fillStyle='#cc88ff'; C.textAlign='center';
    C.shadowColor='#8800ff'; C.shadowBlur=6;
    C.fillText('BOSS',z.x,z.y-z.size-16);
    C.restore();
  }
}

// ================================================================
//  SPRITE ASSETS -- BULLET
// ================================================================
function drawBullet(b){
  C.save();
  if(b.trail.length>1){
    for(let i=1;i<b.trail.length;i++){
      const alpha=(i/b.trail.length)*0.4;
      const width=4*(i/b.trail.length);
      C.beginPath(); C.moveTo(b.trail[i-1].x,b.trail[i-1].y); C.lineTo(b.trail[i].x,b.trail[i].y);
      C.strokeStyle=`rgba(255,180,40,${alpha})`; C.lineWidth=width; C.stroke();
    }
    C.beginPath(); C.moveTo(b.trail[0].x,b.trail[0].y);
    for(let i=1;i<b.trail.length;i++) C.lineTo(b.trail[i].x,b.trail[i].y);
    C.lineTo(b.x,b.y);
    C.strokeStyle='rgba(255,240,180,0.85)'; C.lineWidth=1; C.stroke();
  }
  C.translate(b.x,b.y); C.rotate(b.angle);
  const bg=C.createLinearGradient(0,-2,0,2);
  bg.addColorStop(0,'#d4a020'); bg.addColorStop(0.4,'#f0c040'); bg.addColorStop(1,'#a07010');
  C.fillStyle=bg;
  C.beginPath(); C.moveTo(6,0); C.lineTo(4,-1.8); C.lineTo(-3,-1.8); C.lineTo(-3.5,0); C.lineTo(-3,1.8); C.lineTo(4,1.8); C.closePath(); C.fill();
  C.fillStyle='#c06820'; C.beginPath(); C.moveTo(6,0); C.lineTo(4,-1.8); C.lineTo(4,1.8); C.closePath(); C.fill();
  C.fillStyle='#806010'; C.fillRect(-3.5,-2,1,4);
  C.globalAlpha=0.35; C.fillStyle='#ffcc44';
  C.beginPath(); C.arc(2,0,3.5,0,Math.PI*2); C.fill();
  C.globalAlpha=1; C.restore();
}

// ================================================================
//  PARTICLES
// ================================================================
function drawParticle(pt){
  C.save();
  if(pt.col==='blood'){
    C.globalAlpha=Math.min(1,pt.life/12)*0.85;
    C.fillStyle='#8a0010'; C.beginPath(); C.arc(pt.x,pt.y,pt.sz,0,Math.PI*2); C.fill();
    C.fillStyle='#4a0008'; C.beginPath(); C.arc(pt.x,pt.y,pt.sz*0.5,0,Math.PI*2); C.fill();
  }else if(pt.col==='flash'){
    C.globalAlpha=Math.min(1,pt.life/6);
    C.fillStyle='#ffee88'; C.beginPath(); C.arc(pt.x,pt.y,pt.sz,0,Math.PI*2); C.fill();
    C.fillStyle='#fff'; C.beginPath(); C.arc(pt.x,pt.y,pt.sz*0.4,0,Math.PI*2); C.fill();
  }else if(pt.col==='fireorange'){
    C.globalAlpha=Math.min(1,pt.life/20)*0.8;
    const fg=C.createRadialGradient(pt.x,pt.y,0,pt.x,pt.y,pt.sz);
    fg.addColorStop(0,'#ffdd44'); fg.addColorStop(0.5,'#ff6600'); fg.addColorStop(1,'rgba(200,30,0,0)');
    C.fillStyle=fg; C.beginPath(); C.arc(pt.x,pt.y,pt.sz,0,Math.PI*2); C.fill();
  }else if(pt.col==='fieryellow'){
    C.globalAlpha=Math.min(1,pt.life/18)*0.7;
    C.fillStyle='#ffcc22'; C.beginPath(); C.arc(pt.x,pt.y,pt.sz,0,Math.PI*2); C.fill();
  }else if(pt.col==='fiered'){
    C.globalAlpha=Math.min(1,pt.life/15)*0.6;
    C.fillStyle='#cc2200'; C.beginPath(); C.arc(pt.x,pt.y,pt.sz,0,Math.PI*2); C.fill();
  }else if(pt.col==='smokegrey'){
    C.globalAlpha=Math.min(1,pt.life/30)*0.35;
    C.fillStyle='#887766'; C.beginPath(); C.arc(pt.x,pt.y,pt.sz*1.5,0,Math.PI*2); C.fill();
  }else{
    C.globalAlpha=pt.life/34; C.fillStyle=pt.col;
    C.beginPath(); C.arc(pt.x,pt.y,pt.sz,0,Math.PI*2); C.fill();
  }
  C.restore();
}

// ================================================================
//  RENDER DISPATCH
// ================================================================
function render(){
  if(viewMode==='3p') render3P(); else render1P();
}

// ================================================================
//  RENDER -- 3RD PERSON
// ================================================================
function render3P(){
  const W=cW(), H=cH(), p=G.player;
  C.save();
  C.translate(shakeX,shakeY);

  // Background
  const bgG=C.createRadialGradient(W/2,H/2,50,W/2,H/2,Math.max(W,H)*0.7);
  bgG.addColorStop(0,'#141410'); bgG.addColorStop(1,'#080806');
  C.fillStyle=bgG; C.fillRect(0,0,W,H);
  // Grid
  C.strokeStyle='rgba(255,255,255,0.018)'; C.lineWidth=1;
  for(let gx=0;gx<W;gx+=60){C.beginPath();C.moveTo(gx,0);C.lineTo(gx,H);C.stroke();}
  for(let gy=0;gy<H;gy+=60){C.beginPath();C.moveTo(0,gy);C.lineTo(W,gy);C.stroke();}
  // Cracks
  C.strokeStyle='rgba(255,255,255,0.012)'; C.lineWidth=0.5;
  for(let gx=30;gx<W;gx+=60) for(let gy=30;gy<H;gy+=60){
    C.beginPath(); C.moveTo(gx,gy); C.lineTo(gx+15,gy+10); C.lineTo(gx+8,gy+22); C.stroke();
  }
  // Puddles
  C.fillStyle='rgba(0,10,20,0.35)';
  [[W*0.2,H*0.3,40,18],[W*0.7,H*0.6,55,22],[W*0.5,H*0.15,30,12],[W*0.85,H*0.4,35,15]].forEach(([px,py,rw,rh])=>{
    C.beginPath(); C.ellipse(px,py,rw,rh,0.3,0,Math.PI*2); C.fill();
    C.fillStyle='rgba(30,40,60,0.18)'; C.beginPath(); C.ellipse(px-rw*0.2,py-rh*0.2,rw*0.4,rh*0.3,0.3,0,Math.PI*2); C.fill();
    C.fillStyle='rgba(0,10,20,0.35)';
  });
  // Vignette
  const vg=C.createRadialGradient(W/2,H/2,Math.min(W,H)*0.3,W/2,H/2,Math.max(W,H)*0.8);
  vg.addColorStop(0,'transparent'); vg.addColorStop(1,'rgba(0,0,0,0.6)');
  C.fillStyle=vg; C.fillRect(0,0,W,H);

  // Earthquake ground flash
  if(G.earthquakeActive){
    const ef=G.earthquakeDur/120;
    C.fillStyle=`rgba(80,40,0,${Math.min(0.15,ef*0.1+0.05*Math.random())})`;
    C.fillRect(0,0,W,H);
  }

  // Ash particles
  for(const a of G.ashParticles){
    C.save(); C.globalAlpha=a.a*(a.life/400);
    C.fillStyle='#ccbbaa'; C.beginPath(); C.arc(a.x,a.y,a.sz,0,Math.PI*2); C.fill();
    C.restore();
  }

  // Ground cracks from earthquakes/impacts
  for(const crack of G.cracks){
    C.save(); C.globalAlpha=crack.a;
    C.strokeStyle='#ff6600'; C.lineWidth=1.5;
    C.shadowColor='#ff4400'; C.shadowBlur=4;
    for(const line of crack.lines){
      C.beginPath(); C.moveTo(line.ox,line.oy);
      for(const seg of line.segs) C.lineTo(seg.x,seg.y);
      C.stroke();
    }
    C.restore();
  }

  // Blood decals
  for(const d of G.bloodDecals){
    C.save(); C.globalAlpha=d.a;
    C.fillStyle='#580010';
    C.beginPath(); C.ellipse(d.x,d.y,d.r,d.r*(d.oval||0.7),d.rot||0,0,Math.PI*2); C.fill();
    C.globalAlpha=d.a*0.55; C.fillStyle='#380008';
    C.beginPath(); C.ellipse(d.x,d.y,d.r*0.55,d.r*0.4*(d.oval||0.7),d.rot||0,0,Math.PI*2); C.fill();
    C.restore();
  }

  // Debris on ground
  for(const d of G.debris){
    if(!d.landed) continue;
    C.save(); C.translate(d.x,d.y); C.rotate(d.rot);
    C.fillStyle=d.col; C.fillRect(-d.w/2,-d.h/2,d.w,d.h);
    C.restore();
  }

  // Fire columns
  for(const f of G.fires){
    C.save();
    const fp=(f.life/f.maxLife)*f.intensity;
    C.globalAlpha=fp*0.7;
    const fg=C.createRadialGradient(f.x,f.y,0,f.x,f.y,f.w*1.5);
    fg.addColorStop(0,'rgba(255,200,50,0.9)');
    fg.addColorStop(0.4,'rgba(255,80,0,0.6)');
    fg.addColorStop(1,'rgba(200,20,0,0)');
    C.fillStyle=fg; C.beginPath(); C.arc(f.x,f.y,f.w*1.5,0,Math.PI*2); C.fill();
    C.restore();
  }

  // Particles
  for(const pt of G.particles) drawParticle(pt);

  // Asteroids
  for(const ast of G.asteroids){
    C.save(); C.translate(ast.x,ast.y); C.rotate(ast.rot);
    // Rock body
    const rg=C.createRadialGradient(-ast.r*0.3,-ast.r*0.3,1,0,0,ast.r);
    rg.addColorStop(0,'#888070'); rg.addColorStop(0.5,'#5a5248'); rg.addColorStop(1,'#2a2520');
    C.fillStyle=rg;
    C.beginPath(); C.moveTo(ast.pts[0].x,ast.pts[0].y);
    for(let i=1;i<ast.pts.length;i++) C.lineTo(ast.pts[i].x,ast.pts[i].y);
    C.closePath(); C.fill();
    // Glow trail
    C.globalAlpha=0.4;
    const tg=C.createRadialGradient(0,ast.r*0.5,0,0,0,ast.r*1.5);
    tg.addColorStop(0,'rgba(255,120,20,0.6)'); tg.addColorStop(1,'transparent');
    C.fillStyle=tg; C.beginPath(); C.arc(0,0,ast.r*1.5,0,Math.PI*2); C.fill();
    C.restore();
  }

  // Falling debris (airborne)
  for(const d of G.debris){
    if(d.landed) continue;
    C.save(); C.translate(d.x,d.y); C.rotate(d.rot);
    C.fillStyle=d.col; C.fillRect(-d.w/2,-d.h/2,d.w,d.h);
    C.strokeStyle='rgba(200,180,140,0.4)'; C.lineWidth=0.5; C.strokeRect(-d.w/2,-d.h/2,d.w,d.h);
    C.restore();
  }

  // Zombies
  for(const z of G.zombies) drawZombie(z);

  // Bullets
  for(const b of G.bullets) drawBullet(b);

  // Player
  drawPlayer(p.x,p.y,p.angle,p.r,p.invTimer);

  // Auto-aim indicator
  C.save();
  if(autoAim&&aimTarget){
    const lockPulse=0.6+0.4*Math.sin(Date.now()/120);
    C.strokeStyle=`rgba(255,80,0,${lockPulse})`; C.lineWidth=2;
    C.beginPath(); C.arc(aimTarget.x,aimTarget.y,aimTarget.size+6,0,Math.PI*2); C.stroke();
    C.strokeStyle=`rgba(255,160,0,${lockPulse})`; C.lineWidth=2.5;
    const br=aimTarget.size+10;
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx,sy])=>{
      const cx=aimTarget.x+sx*br, cy=aimTarget.y+sy*br;
      C.beginPath(); C.moveTo(cx,aimTarget.y+sy*(br-8)); C.lineTo(cx,cy); C.lineTo(aimTarget.x+sx*(br-8),cy); C.stroke();
    });
    C.strokeStyle='rgba(255,100,0,0.25)'; C.lineWidth=1; C.setLineDash([4,6]);
    C.beginPath(); C.moveTo(p.x,p.y); C.lineTo(aimTarget.x,aimTarget.y); C.stroke();
    C.setLineDash([]);
  }else{
    C.translate(p.x,p.y);
    const ld=55; C.strokeStyle='rgba(255,50,50,0.45)'; C.lineWidth=1; C.setLineDash([3,4]);
    C.beginPath(); C.moveTo(Math.cos(p.angle)*26,Math.sin(p.angle)*26); C.lineTo(Math.cos(p.angle)*ld,Math.sin(p.angle)*ld); C.stroke();
    C.setLineDash([]); C.fillStyle='rgba(255,50,50,0.85)';
    C.beginPath(); C.arc(Math.cos(p.angle)*ld,Math.sin(p.angle)*ld,2.5,0,Math.PI*2); C.fill();
  }
  C.restore();

  // Reload bar
  if(G.reloading){
    const prog=1-G.reloadTimer/90;
    const bw=84,bx=p.x-42,by=p.y-p.r-22;
    C.fillStyle='rgba(0,0,0,0.75)'; C.fillRect(bx-2,by-2,bw+4,12);
    C.fillStyle='#1a1a1a'; C.fillRect(bx,by,bw,7);
    const rg=C.createLinearGradient(bx,0,bx+bw*prog,0);
    rg.addColorStop(0,'#ff4400'); rg.addColorStop(1,'#ffaa00');
    C.fillStyle=rg; C.fillRect(bx,by,bw*prog,7);
    C.save(); C.font='bold 9px JetBrains Mono,monospace'; C.fillStyle='rgba(255,255,255,0.8)';
    C.textAlign='center'; C.fillText('RELOADING',p.x,by-3); C.restore();
  }

  C.restore(); // end shake transform

  // HUD overlays (no shake)
  C.save();
  C.font='bold 12px JetBrains Mono,monospace';
  C.fillStyle='rgba(0,230,118,0.5)'; C.textAlign='center';
  C.fillText(`${G.zombiesTotal-G.zombiesLeft} / ${G.zombiesTotal} ELIMINATED`,W/2,H-10);
  if(autoAim){
    const bp=0.7+0.3*Math.sin(Date.now()/200);
    C.fillStyle=`rgba(255,120,0,${bp})`; C.font='bold 11px JetBrains Mono,monospace';
    C.textAlign='right'; C.fillText('◉ AUTO-AIM',W-12,H-10);
  }
  C.restore();
}

// ================================================================
//  RENDER -- 1ST PERSON raycaster
// ================================================================
const MAP_W=32, MAP_H=20;
let RMAP=null;
function getMap(){
  if(RMAP) return RMAP; RMAP=[];
  for(let y=0;y<MAP_H;y++){
    RMAP[y]=[];
    for(let x=0;x<MAP_W;x++){
      if(x===0||y===0||x===MAP_W-1||y===MAP_H-1) RMAP[y][x]=1;
      else if(x%8===0&&y%6===0&&x>2&&y>2) RMAP[y][x]=1;
      else if(x%8===4&&y%6===3) RMAP[y][x]=1;
      else RMAP[y][x]=0;
    }
  }
  for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
    const cx=Math.floor(MAP_W/2)+dx, cy=Math.floor(MAP_H/2)+dy;
    if(RMAP[cy]&&cx>=0&&cx<MAP_W) RMAP[cy][cx]=0;
  }
  return RMAP;
}

function render1P(){
  const W=cW(), H=cH(), p=G.player;
  const map=getMap(), CELL=50;
  const px=p.x/CELL, py=p.y/CELL, angle=p.angle;
  const FOV=Math.PI/2.6, COLS=Math.min(W,480), colW=W/COLS, halfH=H/2;

  C.save();
  // Earthquake shake
  if(shakeDur>0) C.translate(shakeX,shakeY);

  // Sky
  const sky=C.createLinearGradient(0,0,0,halfH);
  sky.addColorStop(0,'#060000'); sky.addColorStop(0.5,'#130606'); sky.addColorStop(1,'#1e0c04');
  C.fillStyle=sky; C.fillRect(0,0,W,halfH);
  // Fire glow on horizon
  const fg=C.createRadialGradient(W*0.3,halfH,0,W*0.3,halfH,W*0.5);
  fg.addColorStop(0,'rgba(200,60,10,0.35)'); fg.addColorStop(1,'transparent');
  C.fillStyle=fg; C.fillRect(0,halfH*0.2,W,halfH*0.8);
  const fg2=C.createRadialGradient(W*0.75,halfH,0,W*0.75,halfH,W*0.4);
  fg2.addColorStop(0,'rgba(180,50,5,0.25)'); fg2.addColorStop(1,'transparent');
  C.fillStyle=fg2; C.fillRect(0,halfH*0.3,W,halfH*0.7);
  // Ash in sky
  for(const a of G.ashParticles){
    if(a.y>halfH) continue;
    C.save(); C.globalAlpha=a.a*0.5; C.fillStyle='#ccbbaa';
    C.beginPath(); C.arc(a.x,a.y*0.4,a.sz,0,Math.PI*2); C.fill();
    C.restore();
  }
  // Floor
  const flr=C.createLinearGradient(0,halfH,0,H);
  flr.addColorStop(0,'#1a1510'); flr.addColorStop(0.5,'#120f0a'); flr.addColorStop(1,'#080604');
  C.fillStyle=flr; C.fillRect(0,halfH,W,halfH);

  const zBuf=new Float32Array(COLS);
  for(let col=0;col<COLS;col++){
    const ra=angle-FOV/2+(col/COLS)*FOV;
    const cosA=Math.cos(ra), sinA=Math.sin(ra);
    const stepX=Math.abs(1/cosA), stepY=Math.abs(1/sinA);
    let mapX=Math.floor(px), mapY=Math.floor(py);
    let sdX=(cosA<0?(px-mapX):(mapX+1-px))*stepX;
    let sdY=(sinA<0?(py-mapY):(mapY+1-py))*stepY;
    const dX=cosA<0?-1:1, dY=sinA<0?-1:1;
    let hit=0, side=0, maxSteps=50;
    while(!hit&&maxSteps-->0){
      if(sdX<sdY){sdX+=stepX;mapX+=dX;side=0;}
      else{sdY+=stepY;mapY+=dY;side=1;}
      if(mapY>=0&&mapY<MAP_H&&mapX>=0&&mapX<MAP_W&&map[mapY][mapX]) hit=1;
    }
    let dist=Math.max(0.1, side===0?(sdX-stepX):(sdY-stepY));
    zBuf[col]=dist;
    const wallH=Math.min(H*3, H/dist);
    const top=halfH-wallH/2;
    const bright=Math.max(0.05,Math.min(1,1-dist/12));
    const dark=side?0.55:1;
    const rv=Math.floor(bright*dark*72+10);
    const gv=Math.floor(bright*dark*56+8);
    const bv=Math.floor(bright*dark*46+6);
    C.fillStyle=`rgb(${rv},${gv},${bv})`; C.fillRect(col*colW,top,colW+1,wallH);
    if(wallH>24){
      C.fillStyle=`rgb(${Math.max(0,rv-16)},${Math.max(0,gv-13)},${Math.max(0,bv-11)})`;
      const bkH=Math.max(2,wallH/8);
      for(let bk=top;bk<top+wallH;bk+=bkH) C.fillRect(col*colW,bk,colW+1,Math.max(0.5,bkH*0.1));
    }
  }

  // Zombie sprites (billboard)
  const sprites=G.zombies.map(z=>{
    const relX=z.x/CELL-px, relY=z.y/CELL-py;
    const camD=relX*Math.sin(angle)-relY*Math.cos(angle);
    const screenX=(0.5+(-relX*Math.cos(angle)-relY*Math.sin(angle))/(2*camD+0.001))*W;
    return{z, screenX, depth:Math.hypot(relX,relY), camD};
  }).filter(s=>s.camD>0.3).sort((a,b)=>b.depth-a.depth);

  for(const {z,screenX,depth} of sprites){
    const sprH=Math.min(H*2,Math.abs(Math.floor((H/depth)*0.9)));
    const sprW=Math.floor(sprH*0.7);
    const dx=Math.floor(screenX-sprW/2), dy=Math.floor(halfH-sprH/2);
    if(dx+sprW<0||dx>=W) continue;
    let vis=false;
    for(let sc=Math.max(0,dx);sc<Math.min(W,dx+sprW);sc+=Math.max(1,Math.floor(sprW/8))){
      const ci=Math.floor(sc/colW);
      if(ci<COLS&&zBuf[ci]>depth-0.1){vis=true;break;}
    }
    if(!vis) continue;
    const fade=Math.min(1,depth<1?depth:1);
    C.save(); C.globalAlpha=fade*0.95;
    C.save(); C.translate(dx+sprW/2,dy+sprH/2); C.scale(sprW/36,sprH/36);
    if(z.flash>0) C.filter='brightness(3) saturate(0)';
    const s=1, walk=Math.sin(z.walkCycle)*0.15;
    if(z.ti===0) drawWalker(s,walk);
    else if(z.ti===1) drawRunner(s,walk);
    else if(z.ti===2) drawTank(s,walk);
    else drawBoss(s,walk);
    C.filter='none'; C.restore();
    if(z.hp<z.maxHp){
      C.globalAlpha=fade;
      C.fillStyle='rgba(0,0,0,0.6)'; C.fillRect(dx,dy-8,sprW,6);
      C.fillStyle='#330000'; C.fillRect(dx,dy-7,sprW,4);
      const pct=z.hp/z.maxHp;
      C.fillStyle=pct>0.5?'#22aa22':pct>0.25?'#aaaa00':'#cc0000';
      C.fillRect(dx,dy-7,sprW*pct,4);
    }
    if(depth<0.8){
      C.globalAlpha=(1-depth/0.8)*0.4;
      C.fillStyle='#0a0000'; C.fillRect(dx,dy,sprW,sprH);
    }
    C.restore();
  }

  drawFPSGun(W,H);
  C.restore();

  C.save();
  C.font='bold 12px JetBrains Mono,monospace';
  C.fillStyle='rgba(0,230,118,0.45)'; C.textAlign='center';
  C.fillText(`${G.zombiesTotal-G.zombiesLeft} / ${G.zombiesTotal} ELIMINATED`,W/2,H-10);
  if(autoAim){
    const bp=0.7+0.3*Math.sin(Date.now()/200);
    C.fillStyle=`rgba(255,120,0,${bp})`; C.font='bold 11px JetBrains Mono,monospace';
    C.textAlign='right'; C.fillText('◉ AUTO-AIM',W-12,H-10);
  }
  C.restore();
}

// ================================================================
//  FPS WEAPON -- M4 carbine + gloved hands
// ================================================================
function drawFPSGun(W,H){
  const t=Date.now()/800;
  const moving=keys['w']||keys['a']||keys['s']||keys['d']||mDirs.u||mDirs.d||mDirs.l||mDirs.r;
  const bob=moving?Math.sin(t*5)*4:Math.sin(t*0.8)*1.2;
  const sway=moving?Math.sin(t*2.5)*3:0;
  C.save(); C.translate(W/2+80+sway,H-20+bob);

  // Right glove
  C.fillStyle='#1a1a14';
  C.beginPath(); C.moveTo(-80,-85); C.lineTo(-65,-100); C.lineTo(-45,-100);
  C.lineTo(-35,-80); C.lineTo(-40,-65); C.lineTo(-80,-65); C.closePath(); C.fill();
  C.fillStyle='#2a2a20';
  C.fillRect(-75,-98,8,4); C.fillRect(-64,-98,8,4); C.fillRect(-53,-98,8,4);

  // Left glove
  C.fillStyle='#1a1a14';
  C.beginPath(); C.moveTo(-200,-72); C.lineTo(-185,-88); C.lineTo(-165,-88);
  C.lineTo(-155,-68); C.lineTo(-160,-55); C.lineTo(-200,-55); C.closePath(); C.fill();
  C.fillStyle='#2a2a20';
  C.fillRect(-196,-86,8,4); C.fillRect(-185,-86,8,4); C.fillRect(-174,-86,8,4);

  // Stock
  C.fillStyle='#1a1208'; C.fillRect(-30,-82,55,18); C.fillRect(-10,-70,30,10);
  C.fillStyle='#242018'; C.fillRect(18,-84,8,22);

  // Lower receiver + trigger
  C.fillStyle='#2a2a22'; C.fillRect(-90,-90,65,20);
  C.fillStyle='#222220'; C.beginPath(); C.arc(-65,-70,12,0,Math.PI); C.fill();
  C.fillStyle='#3a3a30'; C.fillRect(-70,-78,4,10);

  // Grip + texture
  C.fillStyle='#1a1a14';
  C.beginPath(); C.moveTo(-80,-70); C.lineTo(-72,-68); C.lineTo(-75,-36);
  C.lineTo(-95,-36); C.lineTo(-98,-68); C.closePath(); C.fill();
  C.fillStyle='#141410';
  for(let gi=0;gi<5;gi++) C.fillRect(-96,-64+gi*6,18,2);

  // Magazine
  C.fillStyle='#2a2018';
  C.beginPath(); C.moveTo(-80,-68); C.lineTo(-90,-68); C.lineTo(-95,-20);
  C.bezierCurveTo(-90,5,-60,5,-55,-20); C.lineTo(-60,-68); C.closePath(); C.fill();
  C.fillStyle='#3a3028'; C.fillRect(-88,-60,5,35);
  C.fillStyle='#1a1208'; C.fillRect(-80,-42,2,8);

  // Upper receiver + Picatinny rail
  C.fillStyle='#333328'; C.fillRect(-90,-110,65,22);
  C.fillStyle='#2a2a20'; C.fillRect(-88,-118,60,10);
  C.fillStyle='#1e1e18';
  for(let ri=0;ri<8;ri++) C.fillRect(-86+ri*7,-116,5,6);

  // Charging handle
  C.fillStyle='#3a3a30'; C.fillRect(-55,-112,12,6); C.fillRect(-50,-118,14,8);

  // Rear BUIS sight
  C.fillStyle='#2a2a22'; C.fillRect(-85,-120,10,12); C.fillRect(-82,-122,4,4);

  // Handguard + MLOK
  C.fillStyle='#2e2e26'; C.fillRect(-200,-108,115,22);
  C.fillStyle='#262620'; C.fillRect(-198,-116,110,10);
  for(let ri=0;ri<12;ri++) C.fillRect(-196+ri*9,-114,6,6);
  C.fillStyle='#1a1a14';
  for(let ms=0;ms<5;ms++) C.fillRect(-190+ms*20,-106,12,5);

  // Gas block + front sight
  C.fillStyle='#2a2a22'; C.fillRect(-202,-122,10,18); C.fillRect(-199,-126,4,6);

  // Barrel
  C.fillStyle='#222220'; C.fillRect(-290,-101,95,8);
  C.fillStyle='#1e1e1c'; C.fillRect(-280,-106,85,3);

  // Muzzle brake
  C.fillStyle='#2e2e2a'; C.fillRect(-302,-104,16,14);
  C.fillStyle='#1a1a18';
  C.fillRect(-300,-103,3,5); C.fillRect(-296,-103,3,5); C.fillRect(-292,-103,3,5);
  C.fillRect(-300,-98,3,4);  C.fillRect(-296,-98,3,4);

  // Red dot scope
  C.fillStyle='#2a2a26'; C.fillRect(-70,-130,40,16);
  C.fillStyle='#1e1e1a'; C.fillRect(-68,-128,36,12);
  C.fillStyle='#0a1020'; C.beginPath(); C.arc(-50,-122,5,0,Math.PI*2); C.fill();
  C.fillStyle='rgba(20,60,150,0.5)'; C.beginPath(); C.arc(-50,-122,4,0,Math.PI*2); C.fill();
  C.fillStyle='rgba(100,150,255,0.3)'; C.beginPath(); C.arc(-52,-124,1.5,0,Math.PI*2); C.fill();
  C.fillStyle='rgba(255,20,20,0.9)'; C.beginPath(); C.arc(-50,-122,1,0,Math.PI*2); C.fill();

  // Muzzle flash on shot
  if(G.justFired){
    C.globalAlpha=0.55+Math.random()*0.45;
    const mfg=C.createRadialGradient(-302,-98,0,-302,-98,26);
    mfg.addColorStop(0,'rgba(255,240,180,1)');
    mfg.addColorStop(0.3,'rgba(255,160,40,0.8)');
    mfg.addColorStop(1,'rgba(255,80,0,0)');
    C.fillStyle=mfg; C.beginPath(); C.arc(-302,-98,26,0,Math.PI*2); C.fill();
    C.fillStyle='rgba(255,220,100,0.65)';
    [-30,-15,0,15,30].forEach(fy=>{
      C.beginPath(); C.moveTo(-302,-98);
      C.lineTo(-330+Math.random()*8,-98+fy);
      C.lineTo(-302,-98+fy*0.3); C.closePath(); C.fill();
    });
    C.globalAlpha=1;
  }
  C.restore();
}

// ================================================================
//  HUD UPDATE
// ================================================================
function updateHUD(){
  if(!G.player) return;
  const pct=(G.player.hp/G.player.maxHp)*100;
  const hf=document.getElementById('hfill');
  hf.style.width=pct+'%';
  hf.style.background=pct>60
    ?'linear-gradient(90deg,#880000,#ff4444)'
    :pct>30
    ?'linear-gradient(90deg,#996600,#ffaa00)'
    :'linear-gradient(90deg,#cc0000,#ff0000)';
  const ad=document.getElementById('adots'); ad.innerHTML='';
  for(let i=0;i<G.maxAmmo;i++){
    const d=document.createElement('div');
    d.className='adot'+(i>=G.ammo?' x':'');
    ad.appendChild(d);
  }
  document.getElementById('wnum').textContent=String(G.wave).padStart(2,'0');
  document.getElementById('scoreEl').textContent=G.score.toLocaleString();
}  cx.translate(w/2, h/2);

  drawFn(cx);

  cx.restore();

  SPRITES[name] = cv;
}

// ── NAVIGATION ───────────────────────────────────────────────────
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el=document.getElementById(id);
  if(el) el.classList.add('active');
}
function backToTitle(){
  cancelAnimationFrame(animId); paused=false; hideAllOvr(); SFX.stopMusic();
  autoAim=false; aimTarget=null; showScreen('sTitle');
}
function quitToTitle(){ backToTitle(); }
function gotoInfo(id){
  if(document.getElementById('sGame').classList.contains('active')&&!paused){
    paused=true; cancelAnimationFrame(animId);
  }
  showScreen(id);
}
function smartBack(){
  if(G.player&&paused) returnToGame(); else showScreen('sTitle');
}
function returnToGame(){
  showScreen('sGame');
  if(paused&&G.player){ paused=false; loop(); }
}

// ================================================================
//  SOUND ENGINE -- Web Audio API procedural SFX bank
//  All sounds generated with oscillators + noise, zero files
// ================================================================
const SFX=(()=>{
  let ctx=null, muted=false, musicTimer=null;

  function ac(){
    if(!ctx) ctx=new(window.AudioContext||window.webkitAudioContext)();
    if(ctx.state==='suspended') ctx.resume();
    return ctx;
  }

  // Core oscillator helper
  function osc(freq,type,vol,dur,freqEnd,delayMs){
    setTimeout(()=>{
      try{
        const c=ac(),o=c.createOscillator(),g=c.createGain();
        o.type=type; o.frequency.setValueAtTime(freq,c.currentTime);
        if(freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd,c.currentTime+dur);
        g.gain.setValueAtTime(vol,c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
        o.connect(g); g.connect(c.destination);
        o.start(); o.stop(c.currentTime+dur);
      }catch(e){}
    }, delayMs||0);
  }

  // White/filtered noise helper
  function noise(vol,dur,filterFreq,filterType,delayMs){
    setTimeout(()=>{
      try{
        const c=ac();
        const buf=c.createBuffer(1,Math.floor(c.sampleRate*dur),c.sampleRate);
        const d=buf.getChannelData(0);
        for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
        const src=c.createBufferSource(); src.buffer=buf;
        const g=c.createGain();
        g.gain.setValueAtTime(vol,c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);
        const f=c.createBiquadFilter();
        f.type=filterType||'bandpass';
        f.frequency.value=filterFreq||600; f.Q.value=1.2;
        src.connect(f); f.connect(g); g.connect(c.destination);
        src.start(); src.stop(c.currentTime+dur);
      }catch(e){}
    }, delayMs||0);
  }

  // ── WEAPON SOUNDS ──────────────────────────────────────────────

  // Gunshot: sharp crack + low thud
  function gunshot(){
    if(muted) return;
    noise(0.7, 0.04, 2200, 'highpass');          // crack
    noise(0.5, 0.12, 320, 'bandpass');            // body thud
    osc(180, 'sawtooth', 0.35, 0.08, 28);         // low punch
  }

  // Shotgun blast: wide spread boom
  function shotgunBlast(){
    if(muted) return;
    noise(0.9, 0.06, 1800, 'highpass');
    noise(0.7, 0.2,  200, 'lowpass');
    osc(90, 'sawtooth', 0.55, 0.18, 20);
    osc(140,'sawtooth', 0.3,  0.12, 30, 20);
  }

  // Empty click when no ammo
  function emptyClick(){
    if(muted) return;
    osc(900,'square',0.15,0.04,800);
  }

  // Reload: 3-stage mechanical
  function reload(){
    if(muted) return;
    osc(1100,'square',0.12,0.05,900,0);
    osc(600, 'square',0.14,0.06,500,90);
    noise(0.2, 0.08, 800,'bandpass',90);
    osc(1400,'square',0.1, 0.04,1200,200);
    osc(700, 'square',0.18,0.07,600,200);
  }

  // ── ZOMBIE SOUNDS ──────────────────────────────────────────────

  // Zombie groan: deep guttural
  function zombieGroan(){
    if(muted) return;
    const pitch = 60+Math.random()*80;
    osc(pitch, 'sawtooth', 0.22, 0.6,  pitch*0.5);
    osc(pitch*1.4,'sine',  0.08, 0.45, pitch*0.6);
    noise(0.05, 0.5, 200, 'lowpass');
  }

  // Zombie scream: runner shriek
  function zombieScream(){
    if(muted) return;
    const p=200+Math.random()*300;
    osc(p,'sawtooth',0.3,0.4,p*0.3);
    osc(p*1.6,'square',0.1,0.35,p*0.4);
  }

  // Zombie hit: meaty impact
  function hit(){
    if(muted) return;
    noise(0.45, 0.07, 600, 'bandpass');
    osc(120,'sawtooth',0.2,0.06,60);
  }

  // Zombie death: collapse thud + gurgle
  function death(){
    if(muted) return;
    osc(80,'sawtooth',0.5,0.35,20);
    noise(0.4, 0.18, 400, 'bandpass');
    osc(300,'sine',0.15,0.25,80,80);
  }

  // Boss roar
  function bossRoar(){
    if(muted) return;
    const p=40+Math.random()*30;
    osc(p,'sawtooth',0.6,0.8,p*0.4);
    osc(p*2,'sawtooth',0.3,0.7,p*0.6);
    noise(0.3,0.6,150,'lowpass');
  }

  // ── PLAYER SOUNDS ─────────────────────────────────────────────

  function playerHurt(){
    if(muted) return;
    noise(0.55,0.1,400,'bandpass');
    osc(380,'sawtooth',0.3,0.12,150);
  }

  function playerDeath(){
    if(muted) return;
    [350,250,160,80].forEach((f,i)=>osc(f,'sawtooth',0.4,0.3,f*0.3,i*120));
    noise(0.4,0.4,300,'bandpass',100);
  }

  // ── ENVIRONMENT SOUNDS ────────────────────────────────────────

  // Earthquake rumble: deep sub-bass growl
  function earthquakeRumble(){
    if(muted) return;
    osc(30,'sawtooth',0.8,1.5,15);
    osc(45,'sine',    0.6,1.5,20);
    noise(0.5,1.5,80,'lowpass');
    noise(0.3,1.0,160,'bandpass',200);
  }

  // Asteroid impact: thunderous boom
  function asteroidImpact(){
    if(muted) return;
    osc(40,'sawtooth',0.9,0.6,10);
    osc(60,'square',  0.7,0.5,15);
    noise(0.8,0.3,300,'lowpass');
    noise(0.6,0.5,1200,'highpass',50);
    noise(0.4,0.8,200,'lowpass',100);
  }

  // Debris crash: crunching
  function debrisCrash(){
    if(muted) return;
    noise(0.5,0.15,800,'bandpass');
    osc(200,'sawtooth',0.3,0.1,80);
    noise(0.3,0.25,400,'bandpass',80);
  }

  // Fire crackle: looping (called periodically)
  function fireCrackle(){
    if(muted) return;
    noise(0.12,0.08,1200,'bandpass');
    osc(800,'square',0.04,0.06,600);
  }

  // Wave clear fanfare
  function waveClear(){
    if(muted) return;
    [523,659,784,1047].forEach((f,i)=>osc(f,'sine',0.22,0.2,f,i*130));
  }

  function gameOverSnd(){
    if(muted) return;
    [380,280,190,100].forEach((f,i)=>osc(f,'sawtooth',0.35,0.28,f*0.5,i*150));
    noise(0.3,0.8,200,'lowpass',100);
  }

  // ── MUSIC ─────────────────────────────────────────────────────
  function startMusic(){
    if(muted||musicTimer) return;
    const c=ac();
    const mG=c.createGain(); mG.gain.value=0.04; mG.connect(c.destination);
    const bassNotes=[38,41,43,46,38,41,36,38];
    let beat=0;
    function tick(){
      if(muted){ stopMusic(); return; }
      const freq=Math.pow(2,(bassNotes[beat%bassNotes.length]-69)/12)*440;
      // Bass note
      const o=c.createOscillator(),g=c.createGain();
      o.type='sawtooth'; o.frequency.value=freq;
      g.gain.setValueAtTime(0.7,c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+0.4);
      o.connect(g); g.connect(mG); o.start(); o.stop(c.currentTime+0.45);
      // Occasional percussion hit
      if(beat%4===0){
        const pb=c.createBuffer(1,Math.floor(c.sampleRate*0.1),c.sampleRate);
        const pd=pb.getChannelData(0);
        for(let i=0;i<pd.length;i++) pd[i]=(Math.random()*2-1)*Math.exp(-i/(c.sampleRate*0.04));
        const ps=c.createBufferSource(); ps.buffer=pb;
        const pg=c.createGain(); pg.gain.value=0.25;
        ps.connect(pg); pg.connect(mG); ps.start();
      }
      beat++;
      musicTimer=setTimeout(tick,480);
    }
    tick();
  }
  function stopMusic(){ clearTimeout(musicTimer); musicTimer=null; }

  function toggle(){
    muted=!muted;
    document.getElementById('sndBtn').textContent=muted?'🔇':'🔊';
    if(muted) stopMusic(); else startMusic();
  }
  function unlock(){ ac(); startMusic(); }

  return{
    gunshot,shotgunBlast,emptyClick,reload,
    zombieGroan,zombieScream,hit,death,bossRoar,
    playerHurt,playerDeath,
    earthquakeRumble,asteroidImpact,debrisCrash,fireCrackle,
    waveClear,gameOverSnd,startMusic,stopMusic,toggle,unlock
  };
})();

// ── CANVAS RESIZE ─────────────────────────────────────────────────
function resizeCanvas(){
  const W=window.innerWidth, H=window.innerHeight-HUD_H;
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  canvas.width=Math.floor(W*DPR); canvas.height=Math.floor(H*DPR);
  C.setTransform(DPR,0,0,DPR,0,0);
  if(G.player){
    G.player.x=Math.max(G.player.r,Math.min(cW()-G.player.r,G.player.x));
    G.player.y=Math.max(G.player.r,Math.min(cH()-G.player.r,G.player.y));
  }
}
resizeCanvas();
window.addEventListener('resize',resizeCanvas);

// ── INPUT ─────────────────────────────────────────────────────────
window.addEventListener('keydown',e=>{
  keys[e.key.toLowerCase()]=true;
  if(e.code==='Space'){e.preventDefault();mShooting=true;}
  if(e.key.toLowerCase()==='r') doReload();
  if(e.key.toLowerCase()==='p'||e.key==='Escape') togglePause();
  if(e.key.toLowerCase()==='v') setView(viewMode==='3p'?'1p':'3p');
  if(e.key==='Tab'){e.preventDefault();toggleAutoAim();}
});
window.addEventListener('keyup',e=>{
  keys[e.key.toLowerCase()]=false;
  if(e.code==='Space') mShooting=false;
});
canvas.addEventListener('mousemove',e=>{
  const r=canvas.getBoundingClientRect();
  mouseX=e.clientX-r.left; mouseY=e.clientY-r.top;
});
canvas.addEventListener('mousedown',e=>{if(e.button===0){SFX.unlock();mShooting=true;}});
canvas.addEventListener('mouseup',  e=>{if(e.button===0) mShooting=false;});

(function(){
  const map={dU:'u',dD:'d',dL:'l',dR:'r'};
  Object.entries(map).forEach(([id,dir])=>{
    const el=document.getElementById(id); if(!el)return;
    const on =e=>{e.preventDefault();mDirs[dir]=true; el.classList.add('pressed');};
    const off=e=>{e.preventDefault();mDirs[dir]=false;el.classList.remove('pressed');};
    el.addEventListener('touchstart',on, {passive:false});
    el.addEventListener('touchend',  off,{passive:false});
    el.addEventListener('touchcancel',off,{passive:false});
  });
})();

const sbtnEl=document.getElementById('sbtn');
sbtnEl.addEventListener('touchstart',e=>{e.preventDefault();SFX.unlock();mobileFire=true; sbtnEl.classList.add('firing');},   {passive:false});
sbtnEl.addEventListener('touchend',  e=>{e.preventDefault();              mobileFire=false;sbtnEl.classList.remove('firing');},{passive:false});
sbtnEl.addEventListener('touchcancel',()=>{mobileFire=false;sbtnEl.classList.remove('firing');});
sbtnEl.addEventListener('mousedown', ()=>{SFX.unlock();mobileFire=true; sbtnEl.classList.add('firing');});
sbtnEl.addEventListener('mouseup',   ()=>{              mobileFire=false;sbtnEl.classList.remove('firing');});

const rbtnEl=document.getElementById('rbtn');
rbtnEl.addEventListener('touchstart',e=>{e.preventDefault();SFX.unlock();doReload();},{passive:false});
rbtnEl.addEventListener('click',()=>doReload());

// ── VIEW / PAUSE / NOTIFS ─────────────────────────────────────────
function setView(v){
  viewMode=v;
  document.getElementById('v3b').classList.toggle('on',v==='3p');
  document.getElementById('v1b').classList.toggle('on',v==='1p');
  document.getElementById('xhair').style.display=v==='1p'?'block':'none';
}
setView('3p');

function togglePause(){
  if(!G.player)return; paused=!paused;
  if(paused){
    cancelAnimationFrame(animId);
    document.getElementById('pauseStats').textContent=`WAVE ${G.wave}  |  SCORE ${G.score.toLocaleString()}`;
    document.getElementById('ovrPause').classList.add('show');
  }else{
    document.getElementById('ovrPause').classList.remove('show');
    loop();
  }
}
function hideAllOvr(){['ovrPause','ovrWave','ovrDead'].forEach(id=>document.getElementById(id).classList.remove('show'));}

function showNotif(msg,cls){
  const el=document.getElementById('notifs');
  const n=document.createElement('div');
  n.className='nf'+(cls?' '+cls:'');
  n.textContent=msg; el.appendChild(n);
  setTimeout(()=>{if(el.contains(n))el.removeChild(n);},2500);
}
function waveAnnounce(w){
  const el=document.getElementById('wann');
  el.textContent='WAVE '+w;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),3200);
}

function doReload(){
  if(!G.player||G.reloading||G.ammo>=G.maxAmmo)return;
  G.reloading=true; G.reloadTimer=90; SFX.reload(); showNotif('RELOADING...','o');
}

function toggleAutoAim(){
  autoAim=!autoAim; aimTarget=null;
  showNotif(autoAim?'AUTO-AIM ON':'AUTO-AIM OFF', autoAim?'':'r');
  document.getElementById('autoAimBtn').classList.toggle('on',autoAim);
  const mob=document.getElementById('aabtnMobile');
  if(mob) mob.classList.toggle('on',autoAim);
}

// ── AUTO-AIM ──────────────────────────────────────────────────────
function getAutoAimTarget(p){
  if(!autoAim||G.zombies.length===0) return null;
  const SNAP_RANGE=320;
  let best=null, bestScore=Infinity;
  for(const z of G.zombies){
    const dist=Math.hypot(p.x-z.x,p.y-z.y);
    if(dist>SNAP_RANGE) continue;
    const hysteresis=(z===aimTarget)?0.7:1.0;
    const score=dist*hysteresis;
    if(score<bestScore){bestScore=score;best=z;}
  }
  return best;
}

// ── SCREEN SHAKE ──────────────────────────────────────────────────
function triggerShake(magnitude,duration){
  shakeMag=Math.max(shakeMag,magnitude);
  shakeDur=Math.max(shakeDur,duration);
}
function updateShake(){
  if(shakeDur>0){
    shakeX=(Math.random()-0.5)*shakeMag*2;
    shakeY=(Math.random()-0.5)*shakeMag*2;
    shakeDur--;
    shakeMag*=0.9;
  }else{
    shakeX=0; shakeY=0; shakeMag=0;
  }
}

// ================================================================
//  ZOMBIE DEFINITIONS
// ================================================================
const ZTYPES=[
  {col:'#4a7a3a',speed:1.2, hp:2,  size:18,pts:100,  dmg:1},  // Walker
  {col:'#8b2020',speed:2.8, hp:1,  size:14,pts:150,  dmg:1},  // Runner
  {col:'#3a3a2a',speed:0.8, hp:6,  size:24,pts:200,  dmg:2},  // Tank
  {col:'#5a2080',speed:1.5, hp:20, size:30,pts:1000, dmg:3},  // Boss
];

// ================================================================
//  GAME STATE
// ================================================================
function initState(){
  resizeCanvas();
  return{
    player:{x:cW()/2,y:cH()/2,r:18,speed:3.6,hp:100,maxHp:100,angle:0,invTimer:0},
    bullets:[],zombies:[],particles:[],bloodDecals:[],
    // Apocalyptic environment
    asteroids:[],
    earthquakeTimer:0,  earthquakeActive:false, earthquakeDur:0,
    cracks:[], fires:[], debris:[], ashParticles:[],
    nextAsteroid:180+Math.floor(Math.random()*240),
    nextEarthquake:300+Math.floor(Math.random()*300),
    nextFire:120,
    score:0,wave:1,ammo:12,maxAmmo:12,
    reloading:false,reloadTimer:0,
    spawnQueue:[],spawnTimer:0,zombiesTotal:0,zombiesLeft:0,waveDone:false,
    justFired:false,
  };
}

function buildSpawnQueue(){
  const w=G.wave, count=8+w*3; const q=[];
  for(let i=0;i<count;i++){
    const r=Math.random(); let t=0;
    if(w>=5&&r>0.96)t=3;
    else if(w>=3&&r>0.74)t=2;
    else if(w>=2&&r>0.50)t=1;
    q.push(t);
  }
  G.spawnQueue=q; G.zombiesTotal=count; G.zombiesLeft=count;
  G.waveDone=false; G.spawnTimer=0;
}

// ── GAME FLOW ─────────────────────────────────────────────────────
function startGame(){
  cancelAnimationFrame(animId); paused=false; hideAllOvr();
  autoAim=false; aimTarget=null;
  G=initState(); updateHUD();
  buildSpawnQueue(); waveAnnounce(G.wave);
  showScreen('sGame'); SFX.unlock(); SFX.startMusic(); loop();
}
function nextWave(){
  cancelAnimationFrame(animId);
  document.getElementById('ovrWave').classList.remove('show');
  G.wave++; G.ammo=G.maxAmmo;
  G.player.hp=Math.min(G.player.maxHp,G.player.hp+30);
  // Increase apocalyptic frequency every wave
  G.nextAsteroid=Math.max(90, 180-G.wave*15);
  G.nextEarthquake=Math.max(180, 300-G.wave*20);
  buildSpawnQueue(); updateHUD(); waveAnnounce(G.wave);
  SFX.startMusic(); loop();
}
function endWave(){
  cancelAnimationFrame(animId); SFX.waveClear(); SFX.stopMusic();
  const bonus=500*G.wave; G.score+=bonus; updateHUD();
  document.getElementById('wcTitle').textContent=`WAVE ${G.wave} CLEAR!`;
  document.getElementById('wcStats').innerHTML=`BONUS +${bonus.toLocaleString()} PTS<br>SCORE: ${G.score.toLocaleString()}`;
  document.getElementById('ovrWave').classList.add('show');
}
function gameOver(){
  cancelAnimationFrame(animId); SFX.playerDeath(); SFX.stopMusic();
  document.getElementById('goStats').innerHTML=`SCORE: ${G.score.toLocaleString()}<br>SURVIVED: WAVE ${G.wave}`;
  document.getElementById('ovrDead').classList.add('show');
}

// ── MAIN LOOP ─────────────────────────────────────────────────────
function loop(){ update(); render(); animId=requestAnimationFrame(loop); }

// ================================================================
//  UPDATE
// ================================================================
function update(){
  if(paused||!G.player) return;
  const p=G.player;

  // Movement
  let dx=0,dy=0;
  if(keys['w']||keys['arrowup']   ||mDirs.u) dy-=p.speed;
  if(keys['s']||keys['arrowdown'] ||mDirs.d) dy+=p.speed;
  if(keys['a']||keys['arrowleft'] ||mDirs.l) dx-=p.speed;
  if(keys['d']||keys['arrowright']||mDirs.r) dx+=p.speed;
  // Earthquake pushes player randomly
  if(G.earthquakeActive){
    dx+=(Math.random()-0.5)*G.earthquakeDur*0.08;
    dy+=(Math.random()-0.5)*G.earthquakeDur*0.08;
  }
  if(dx&&dy){dx*=0.707;dy*=0.707;}
  p.x=Math.max(p.r,Math.min(cW()-p.r,p.x+dx));
  p.y=Math.max(p.r,Math.min(cH()-p.r,p.y+dy));

  // Auto-aim / manual aim
  if(autoAim){
    aimTarget=getAutoAimTarget(p);
    if(aimTarget){
      const bspeed=14, dist=Math.hypot(p.x-aimTarget.x,p.y-aimTarget.y);
      const lead=dist/bspeed;
      const predX=aimTarget.x+Math.cos(aimTarget.angle)*aimTarget.speed*lead;
      const predY=aimTarget.y+Math.sin(aimTarget.angle)*aimTarget.speed*lead;
      const ta=Math.atan2(predY-p.y,predX-p.x);
      const diff=((ta-p.angle+Math.PI*3)%(Math.PI*2))-Math.PI;
      p.angle+=diff*0.28;
    }else{
      if(viewMode==='3p') p.angle=Math.atan2(mouseY-p.y,mouseX-p.x);
      else if(dx||dy) p.angle=Math.atan2(dy,dx);
    }
  }else{
    aimTarget=null;
    if(viewMode==='3p') p.angle=Math.atan2(mouseY-p.y,mouseX-p.x);
    else if(dx||dy) p.angle=Math.atan2(dy,dx);
  }

  // Shoot
  if(shootCD>0) shootCD--;
  const wantShoot=mShooting||mobileFire;
  if(wantShoot&&shootCD===0&&!G.reloading){
    if(G.ammo>0){
      const a=p.angle;
      G.bullets.push({x:p.x+Math.cos(a)*28,y:p.y+Math.sin(a)*28,
        vx:Math.cos(a)*14,vy:Math.sin(a)*14,life:90,angle:a,trail:[]});
      G.ammo--; shootCD=10; updateHUD(); SFX.gunshot();
      for(let i=0;i<6;i++){
        const fa=a+(-0.3+Math.random()*0.6);
        G.particles.push({x:p.x+Math.cos(a)*28,y:p.y+Math.sin(a)*28,
          vx:Math.cos(fa)*(4+Math.random()*6),vy:Math.sin(fa)*(4+Math.random()*6),
          life:6+Math.random()*5,col:'flash',sz:3+Math.random()*4});
      }
      document.getElementById('mflash').style.display='block';
      setTimeout(()=>document.getElementById('mflash').style.display='none',60);
      G.justFired=true; setTimeout(()=>{if(G)G.justFired=false;},80);
      if(G.ammo===0) showNotif('EMPTY -- RELOAD!','r');
    }else{
      SFX.emptyClick(); shootCD=15;
    }
  }

  // Reload
  if(G.reloading){
    G.reloadTimer--;
    if(G.reloadTimer<=0){G.ammo=G.maxAmmo;G.reloading=false;showNotif('RELOADED','');updateHUD();}
  }

  // Spawn zombies
  if(G.spawnQueue.length>0){
    G.spawnTimer++;
    const interval=Math.max(15,55-G.wave*4);
    if(G.spawnTimer>=interval){
      const t=ZTYPES[G.spawnQueue.pop()];
      const side=Math.floor(Math.random()*4);
      let zx,zy;
      if(side===0){zx=Math.random()*cW();zy=-40;}
      else if(side===1){zx=cW()+40;zy=Math.random()*cH();}
      else if(side===2){zx=Math.random()*cW();zy=cH()+40;}
      else{zx=-40;zy=Math.random()*cH();}
      G.zombies.push({x:zx,y:zy,hp:t.hp,maxHp:t.hp,
        speed:t.speed*(1+G.wave*0.05),
        size:t.size,col:t.col,pts:t.pts,dmg:t.dmg,
        angle:0,flash:0,ti:ZTYPES.indexOf(t),
        walkCycle:Math.random()*Math.PI*2});
      G.spawnTimer=0;
      if(t===ZTYPES[3]) SFX.bossRoar();
    }
  }

  // Random groan
  groanTimer--;
  if(groanTimer<=0&&G.zombies.length>0){
    const z=G.zombies[Math.floor(Math.random()*G.zombies.length)];
    if(z.ti===1) SFX.zombieScream(); else SFX.zombieGroan();
    groanTimer=80+Math.random()*120;
  }

  // Update zombies
  if(p.invTimer>0) p.invTimer--;
  for(let i=G.zombies.length-1;i>=0;i--){
    const z=G.zombies[i];
    const ang=Math.atan2(p.y-z.y,p.x-z.x);
    z.angle=ang; z.walkCycle+=0.08+z.speed*0.06;
    z.x+=Math.cos(ang)*z.speed; z.y+=Math.sin(ang)*z.speed;
    z.x=Math.max(z.size,Math.min(cW()-z.size,z.x));
    z.y=Math.max(z.size,Math.min(cH()-z.size,z.y));
    if(z.flash>0) z.flash--;
    if(p.invTimer===0&&Math.hypot(p.x-z.x,p.y-z.y)<p.r+z.size){
      p.hp=Math.max(0,p.hp-z.dmg); p.invTimer=40; SFX.playerHurt(); updateHUD();
      if(p.hp<=0){gameOver();return;}
    }
  }

  // Update bullets
  if(G.particles.length>200) G.particles.splice(0,G.particles.length-200);
  for(let i=G.bullets.length-1;i>=0;i--){
    const b=G.bullets[i];
    b.trail.push({x:b.x,y:b.y}); if(b.trail.length>7)b.trail.shift();
    b.x+=b.vx; b.y+=b.vy; b.life--;
    if(b.life<=0||b.x<0||b.x>cW()||b.y<0||b.y>cH()){G.bullets.splice(i,1);continue;}
    let hit=false;
    for(let j=G.zombies.length-1;j>=0;j--){
      const z=G.zombies[j];
      if(Math.hypot(b.x-z.x,b.y-z.y)<z.size){
        z.hp--; z.flash=10; SFX.hit(); spawnBlood(b.x,b.y,8);
        G.bloodDecals.push({x:b.x,y:b.y,r:3+Math.random()*4,a:0.7,
          oval:0.5+Math.random()*0.8,rot:Math.random()*Math.PI});
        if(z.hp<=0){
          G.score+=z.pts; G.zombiesLeft--;
          SFX.death();
          spawnBlood(z.x,z.y,22);
          for(let k=0;k<6;k++) G.bloodDecals.push({
            x:z.x+(-18+Math.random()*36),y:z.y+(-18+Math.random()*36),
            r:4+Math.random()*9,a:0.8,oval:0.4+Math.random()*0.9,rot:Math.random()*Math.PI});
          if(z===aimTarget) aimTarget=null;
          G.zombies.splice(j,1); updateHUD();
        }
        hit=true; break;
      }
    }
    if(hit) G.bullets.splice(i,1);
  }

  // Particles
  for(let i=G.particles.length-1;i>=0;i--){
    const pt=G.particles[i];
    pt.x+=pt.vx; pt.y+=pt.vy; pt.vy+=0.1; pt.vx*=0.92; pt.life--;
    if(pt.life<=0) G.particles.splice(i,1);
  }

  // Blood decals
  if(G.bloodDecals.length>150) G.bloodDecals.splice(0,G.bloodDecals.length-150);
  for(let i=G.bloodDecals.length-1;i>=0;i--){
    G.bloodDecals[i].a-=0.002;
    if(G.bloodDecals[i].a<=0) G.bloodDecals.splice(i,1);
  }

  // ================================================================
  //  APOCALYPTIC ENVIRONMENT UPDATE
  // ================================================================
  updateAsteroidSystem();
  updateEarthquakeSystem();
  updateFireSystem();
  updateDebrisSystem();
  updateAshSystem();
  updateShake();

  // Wave complete
  if(!G.waveDone&&G.zombiesLeft<=0&&G.spawnQueue.length===0&&G.zombies.length===0){
    G.waveDone=true; setTimeout(endWave,600);
  }
}

function spawnBlood(x,y,n){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, s=Math.random()*4+1;
    G.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-1,life:12+Math.random()*16,col:'blood',sz:1.5+Math.random()*3});
  }
}

// ================================================================
//  APOCALYPTIC ENVIRONMENT SYSTEMS
// ================================================================

// ── ASTEROID SYSTEM ───────────────────────────────────────────────
function updateAsteroidSystem(){
  // Spawn timer
  G.nextAsteroid--;
  if(G.nextAsteroid<=0){
    spawnAsteroid();
    G.nextAsteroid=Math.max(90,180-G.wave*15)+Math.floor(Math.random()*120);
  }
  // Update asteroids
  for(let i=G.asteroids.length-1;i>=0;i--){
    const ast=G.asteroids[i];
    ast.y+=ast.speed;
    ast.x+=ast.vx;
    ast.rot+=0.03;
    // Spawn trailing fire/smoke particles
    if(Math.random()<0.4){
      G.particles.push({
        x:ast.x+(Math.random()-0.5)*ast.r,
        y:ast.y-ast.r,
        vx:(Math.random()-0.5)*1.5, vy:-0.5-Math.random()*2,
        life:18+Math.random()*20,
        col:Math.random()<0.5?'fireorange':'smokegrey',
        sz:3+Math.random()*6
      });
    }
    // Check impact
    if(ast.y>cH()+ast.r||ast.x<-ast.r||ast.x>cW()+ast.r){
      G.asteroids.splice(i,1); continue;
    }
    // Impact on ground (near bottom)
    if(ast.y>cH()-20&&!ast.impacted){
      ast.impacted=true;
      triggerShake(12,45);
      SFX.asteroidImpact();
      // Crater effect -- spawn debris
      for(let k=0;k<20;k++){
        const ba=Math.random()*Math.PI*2, bs=3+Math.random()*8;
        G.debris.push({x:ast.x,y:ast.y,
          vx:Math.cos(ba)*bs, vy:Math.sin(ba)*bs-5,
          life:40+Math.random()*40, rot:Math.random()*Math.PI*2, rotV:(-0.2+Math.random()*0.4),
          w:4+Math.random()*12, h:3+Math.random()*8, col:'#5a4a30'});
      }
      // Explosion particles
      for(let k=0;k<30;k++){
        const ba=Math.random()*Math.PI*2, bs=2+Math.random()*10;
        G.particles.push({x:ast.x,y:ast.y,
          vx:Math.cos(ba)*bs, vy:Math.sin(ba)*bs-4,
          life:20+Math.random()*25,
          col:Math.random()<0.6?'fireorange':Math.random()<0.5?'fieryellow':'smokegrey',
          sz:4+Math.random()*8});
      }
      // Ground crack
      G.cracks.push({x:ast.x,y:cH()-10,
        lines:generateCrackLines(ast.x,cH()-10,5),a:0.9});
      // Damage player if close
      if(G.player&&Math.hypot(G.player.x-ast.x,G.player.y-ast.y)<ast.r+40){
        G.player.hp=Math.max(0,G.player.hp-15);
        G.player.invTimer=60; SFX.playerHurt(); updateHUD();
        if(G.player.hp<=0){gameOver();return;}
      }
      // Damage nearby zombies
      for(const z of G.zombies){
        if(Math.hypot(z.x-ast.x,z.y-ast.y)<ast.r+50){
          z.hp-=3; z.flash=12;
          if(z.hp<=0){G.score+=z.pts;G.zombiesLeft--;spawnBlood(z.x,z.y,15);}
        }
      }
      G.zombies=G.zombies.filter(z=>z.hp>0);
    }
  }
}

function spawnAsteroid(){
  const r=18+Math.random()*28;
  G.asteroids.push({
    x: r + Math.random()*(cW()-r*2),
    y: -r*2,
    vx: (-0.5+Math.random())*2,
    speed: 3+Math.random()*4+G.wave*0.3,
    r, rot:0, impacted:false,
    // Polygon points for rocky shape
    pts: Array.from({length:8},(_,i)=>{
      const a=(i/8)*Math.PI*2;
      const radius=r*(0.7+Math.random()*0.5);
      return{x:Math.cos(a)*radius, y:Math.sin(a)*radius};
    })
  });
}

function generateCrackLines(ox,oy,branches){
  const lines=[];
  for(let b=0;b<branches;b++){
    const a=Math.random()*Math.PI*2;
    const len=30+Math.random()*60;
    let cx=ox,cy=oy;
    const segs=[];
    for(let s=0;s<4;s++){
      const na=a+(-0.4+Math.random()*0.8);
      const nl=len/4*(0.7+Math.random()*0.6);
      segs.push({x:cx+Math.cos(na)*nl, y:cy+Math.sin(na)*nl});
      cx+=Math.cos(na)*nl; cy+=Math.sin(na)*nl;
    }
    lines.push({ox,oy,segs});
  }
  return lines;
}

// ── EARTHQUAKE SYSTEM ─────────────────────────────────────────────
function updateEarthquakeSystem(){
  G.nextEarthquake--;
  if(G.nextEarthquake<=0&&!G.earthquakeActive){
    G.earthquakeActive=true;
    G.earthquakeDur=90+Math.floor(Math.random()*90);
    triggerShake(8,G.earthquakeDur);
    SFX.earthquakeRumble();
    showNotif('EARTHQUAKE!','r');
    // Spawn ground cracks
    for(let i=0;i<4;i++){
      G.cracks.push({
        x:Math.random()*cW(), y:Math.random()*cH(),
        lines:generateCrackLines(Math.random()*cW(),Math.random()*cH(),4),
        a:0.8
      });
    }
    G.nextEarthquake=Math.max(180,300-G.wave*20)+Math.floor(Math.random()*180);
  }
  if(G.earthquakeActive){
    G.earthquakeDur--;
    if(G.earthquakeDur<=0) G.earthquakeActive=false;
  }
  // Fade cracks
  for(let i=G.cracks.length-1;i>=0;i--){
    G.cracks[i].a-=0.0015;
    if(G.cracks[i].a<=0) G.cracks.splice(i,1);
  }
}

// ── FIRE COLUMN SYSTEM ────────────────────────────────────────────
function updateFireSystem(){
  G.nextFire--;
  if(G.nextFire<=0){
    // Spawn fire column at random edge position
    G.fires.push({
      x: Math.random()*cW(),
      y: cH()-5,
      life: 120+Math.random()*180,
      maxLife: 300, intensity: 0.3+Math.random()*0.7,
      w: 20+Math.random()*30
    });
    G.nextFire=60+Math.floor(Math.random()*90);
    if(Math.random()<0.3) SFX.fireCrackle();
  }
  for(let i=G.fires.length-1;i>=0;i--){
    const f=G.fires[i]; f.life--;
    // Spawn fire particles
    if(Math.random()<0.6){
      G.particles.push({
        x:f.x+(-f.w/2+Math.random()*f.w), y:f.y,
        vx:(-0.5+Math.random())*1.5, vy:-(2+Math.random()*4),
        life:20+Math.random()*25,
        col:Math.random()<0.6?'fireorange':Math.random()<0.5?'fieryellow':'fiered',
        sz:4+Math.random()*8
      });
    }
    if(f.life<=0) G.fires.splice(i,1);
    // Damage player standing in fire
    if(G.player&&Math.abs(G.player.x-f.x)<f.w/2&&G.player.y>f.y-40){
      if(G.player.invTimer===0&&Math.random()<0.05){
        G.player.hp=Math.max(0,G.player.hp-1);
        G.player.invTimer=20; updateHUD();
        if(G.player.hp<=0){gameOver();return;}
      }
    }
  }
}

// ── DEBRIS SYSTEM ─────────────────────────────────────────────────
function updateDebrisSystem(){
  // Periodically spawn falling debris
  if(Math.random()<0.008+G.wave*0.002){
    G.debris.push({
      x:Math.random()*cW(), y:-20,
      vx:(-0.5+Math.random())*2, vy:2+Math.random()*4,
      life:80+Math.random()*60, rot:Math.random()*Math.PI*2,
      rotV:(-0.1+Math.random()*0.2),
      w:6+Math.random()*20, h:4+Math.random()*14,
      col:Math.random()<0.5?'#5a4a30':'#444438'
    });
  }
  for(let i=G.debris.length-1;i>=0;i--){
    const d=G.debris[i];
    d.x+=d.vx; d.y+=d.vy; d.vy+=0.12; d.rot+=d.rotV; d.life--;
    // Impact
    if(d.y>cH()&&!d.landed){
      d.landed=true; d.vy=0; d.vx=0;
      SFX.debrisCrash();
      triggerShake(3,12);
      // Damage player if hit
      if(G.player&&Math.hypot(G.player.x-d.x,G.player.y-d.y)<20){
        G.player.hp=Math.max(0,G.player.hp-8);
        G.player.invTimer=40; updateHUD(); SFX.playerHurt();
        if(G.player.hp<=0){gameOver();return;}
      }
    }
    if(d.life<=0) G.debris.splice(i,1);
  }
}

// ── ASH PARTICLES SYSTEM ──────────────────────────────────────────
function updateAshSystem(){
  // Continuously spawn drifting ash
  if(Math.random()<0.15+G.wave*0.02){
    G.ashParticles.push({
      x:Math.random()*cW(), y:-5,
      vx:(-0.3+Math.random()*0.6)*0.8,
      vy:0.3+Math.random()*0.8,
      life:200+Math.random()*200,
      sz:1+Math.random()*2.5,
      a:0.3+Math.random()*0.4,
      wobble:Math.random()*Math.PI*2
    });
  }
  if(G.ashParticles.length>300) G.ashParticles.splice(0,G.ashParticles.length-300);
  for(let i=G.ashParticles.length-1;i>=0;i--){
    const a=G.ashParticles[i];
    a.wobble+=0.02; a.x+=a.vx+Math.sin(a.wobble)*0.3;
    a.y+=a.vy; a.life--;
    if(a.life<=0||a.y>cH()+10) G.ashParticles.splice(i,1);
  }
}

// ================================================================
//  SPRITE ASSETS -- PLAYER
// ================================================================
function drawPlayer(x,y,angle,r,invTimer){
  C.save(); C.translate(x,y); C.rotate(angle);
  if(invTimer>0&&Math.floor(invTimer/5)%2===0) C.globalAlpha=0.35;
  const s=r/18;

  // Drop shadow
  C.fillStyle='rgba(0,0,0,0.32)';
  C.beginPath(); C.ellipse(2*s,4*s,14*s,8*s,0,0,Math.PI*2); C.fill();

  // Boots
  C.fillStyle='#1a1a12';
  C.fillRect(-6*s,10*s,5*s,7*s); C.fillRect(2*s,10*s,5*s,7*s);
  // Boot sole
  C.fillStyle='#0e0e0a';
  C.fillRect(-6*s,16*s,6*s,1.5*s); C.fillRect(2*s,16*s,6*s,1.5*s);

  // Legs - olive camo trousers
  C.fillStyle='#4a5238';
  C.fillRect(-7*s,2*s,6*s,10*s); C.fillRect(2*s,2*s,6*s,10*s);
  // Camo patches
  C.fillStyle='#3a4228';
  C.fillRect(-6*s,4*s,3*s,3*s); C.fillRect(3*s,7*s,3*s,2*s); C.fillRect(-5*s,8*s,2*s,3*s);
  // Knee pads
  C.fillStyle='#2a2e20';
  C.beginPath(); C.ellipse(-4*s,8*s,3*s,2.5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(5*s,8*s,3*s,2.5*s,0,0,Math.PI*2); C.fill();

  // Tactical vest with gradient
  const vestG=C.createLinearGradient(-8*s,-10*s,8*s,4*s);
  vestG.addColorStop(0,'#3a3a30'); vestG.addColorStop(0.4,'#2a2a22'); vestG.addColorStop(1,'#1a1a16');
  C.fillStyle=vestG; C.fillRect(-8*s,-10*s,16*s,14*s);
  // Vest plates
  const plateG=C.createLinearGradient(-7*s,-9*s,7*s,3*s);
  plateG.addColorStop(0,'#2e2e26'); plateG.addColorStop(1,'#1a1a14');
  C.fillStyle=plateG; C.fillRect(-7*s,-9*s,14*s,12*s);
  // Edge highlight
  C.strokeStyle='rgba(255,255,255,0.07)'; C.lineWidth=0.6*s;
  C.strokeRect(-7*s,-9*s,14*s,12*s);
  // MOLLE webbing
  C.strokeStyle='#1a1a14'; C.lineWidth=0.8*s;
  for(let i=0;i<3;i++){C.beginPath();C.moveTo(-6*s,(-7+i*3.5)*s);C.lineTo(6*s,(-7+i*3.5)*s);C.stroke();}
  // Pouches
  C.fillStyle='#3a3a2a';
  C.fillRect(-7*s,-6*s,4*s,4*s); C.fillRect(3*s,-6*s,4*s,4*s);
  // Shoulder pads
  C.fillStyle='#2e2e26';
  C.beginPath(); C.ellipse(-9*s,-5*s,4*s,3*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(9*s,-5*s,4*s,3*s,0,0,Math.PI*2); C.fill();

  // Neck
  C.fillStyle='#8a6a50'; C.fillRect(-2*s,-14*s,4*s,5*s);

  // Helmet with gradient
  const helmG=C.createRadialGradient(-2*s,-24*s,1*s,0,-20*s,9*s);
  helmG.addColorStop(0,'#4a5238'); helmG.addColorStop(0.5,'#2a2e20'); helmG.addColorStop(1,'#1a1e14');
  C.fillStyle=helmG;
  C.beginPath(); C.ellipse(0,-20*s,9*s,8*s,0,0,Math.PI*2); C.fill();
  // Helmet rim
  C.fillStyle='#1e2218';
  C.beginPath(); C.ellipse(0,-16*s,10*s,3*s,0,0,Math.PI*2); C.fill();
  // Camo on helmet
  C.fillStyle='#3a4228';
  C.beginPath(); C.ellipse(-3*s,-21*s,4*s,3*s,-0.3,0,Math.PI*2); C.fill();
  C.fillStyle='#2a3020';
  C.beginPath(); C.ellipse(3*s,-19*s,3*s,2*s,0.2,0,Math.PI*2); C.fill();
  // NVG mount
  C.fillStyle='#1a1a14';
  C.fillRect(-2*s,-26*s,4*s,5*s); C.fillRect(-3*s,-27*s,6*s,2*s);
  // Balaclava face
  C.fillStyle='#1a1a14';
  C.beginPath(); C.ellipse(0,-16*s,6*s,5*s,0,0,Math.PI*2); C.fill();
  // Goggles
  C.fillStyle='#006688';
  C.beginPath(); C.ellipse(-3*s,-17*s,2.5*s,1.8*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(3*s,-17*s,2.5*s,1.8*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='rgba(120,210,255,0.45)';
  C.beginPath(); C.arc(-3.5*s,-17.5*s,1*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(2.5*s,-17.5*s,1*s,0,Math.PI*2); C.fill();

  // M4 Carbine along aim axis
  C.fillStyle='#1a1208'; C.fillRect(4*s,-3*s,10*s,5*s); C.fillRect(8*s,2*s,6*s,3*s);
  C.fillStyle='#2a2a22'; C.fillRect(12*s,-4*s,12*s,7*s);
  C.fillStyle='#1a1a14';
  C.beginPath(); C.moveTo(16*s,3*s); C.lineTo(18*s,10*s); C.lineTo(22*s,10*s); C.lineTo(22*s,3*s); C.closePath(); C.fill();
  C.strokeStyle='#111'; C.lineWidth=1.2*s;
  C.beginPath(); C.arc(18*s,3*s,3.5*s,0,Math.PI); C.stroke();
  C.fillStyle='#333328'; C.fillRect(12*s,-6*s,16*s,4*s);
  C.fillStyle='#2a2a22'; C.fillRect(24*s,-5*s,14*s,8*s);
  C.fillStyle='#1e1e18';
  for(let ri=0;ri<4;ri++){C.fillRect((25+ri*3.2)*s,-5*s,1.5*s,1.5*s);C.fillRect((25+ri*3.2)*s,2.5*s,1.5*s,1.5*s);}
  C.fillStyle='#222220'; C.fillRect(36*s,-2*s,16*s,4*s);
  C.fillStyle='#333330'; C.fillRect(51*s,-3.5*s,4*s,7*s);
  C.fillStyle='#3a3a30'; C.fillRect(22*s,-7.5*s,4*s,2.5*s); C.fillRect(24*s,-9*s,4*s,2.5*s);
  // Magazine
  C.fillStyle='#2a2018';
  C.beginPath(); C.moveTo(16*s,3*s); C.lineTo(14*s,14*s); C.lineTo(22*s,14*s); C.lineTo(22*s,3*s); C.closePath(); C.fill();

  C.globalAlpha=1; C.restore();
}

// ================================================================
//  SPRITE ASSETS -- WALKER ZOMBIE
// ================================================================
function drawWalker(C, s, walk){
  // Feet
  C.fillStyle='#1a1a14';
  C.beginPath(); C.ellipse(-5*s+walk*8*s,12*s,3.5*s,2.5*s,walk*0.3,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(5*s-walk*8*s,12*s,3.5*s,2.5*s,-walk*0.3,0,Math.PI*2); C.fill();
  // Legs torn trousers
  C.fillStyle='#3a3020';
  C.fillRect((-7+walk*4)*s,3*s,5*s,10*s); C.fillRect((2-walk*4)*s,3*s,5*s,10*s);
  C.fillStyle='#2a2010'; C.fillRect((-6+walk*4)*s,9*s,2*s,5*s); C.fillRect((4-walk*4)*s,8*s,2*s,6*s);
  // Body torn shirt
  C.fillStyle='#5a6040'; C.fillRect(-8*s,-9*s,16*s,14*s);
  // Chest wound
  C.fillStyle='#7a1a1a';
  C.beginPath(); C.ellipse(-2*s,-3*s,3*s,4*s,0.2,0,Math.PI*2); C.fill();
  C.fillStyle='#4a0a0a';
  C.beginPath(); C.ellipse(-2*s,-3*s,1.5*s,2.5*s,0.2,0,Math.PI*2); C.fill();
  // Arms reaching
  C.fillStyle='#5a7040';
  C.save(); C.rotate(walk*0.3); C.fillRect(8*s,-4*s,14*s,5*s); C.restore();
  C.save(); C.rotate(-walk*0.3); C.fillRect(-22*s,-4*s,14*s,5*s); C.restore();
  // Hands clawing
  C.fillStyle='#7a7050';
  C.beginPath(); C.ellipse(23*s,-2*s,4*s,3*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(-23*s,-2*s,4*s,3*s,0,0,Math.PI*2); C.fill();
  C.strokeStyle='#4a4030'; C.lineWidth=1.2*s;
  [-1,0,1].forEach(f=>{
    C.beginPath(); C.moveTo((21+f*2)*s,-1*s); C.lineTo((25+f*2)*s,(1+f)*s); C.stroke();
    C.beginPath(); C.moveTo((-21+f*2)*s,-1*s); C.lineTo((-25+f*2)*s,(1+f)*s); C.stroke();
  });
  // Neck
  C.fillStyle='#4a3020'; C.fillRect(-2*s,-13*s,4*s,5*s);
  // Head with gradient
  const wkHG=C.createRadialGradient(-2*s,-22*s,1*s,0,-19*s,9*s);
  wkHG.addColorStop(0,'#8a9868'); wkHG.addColorStop(0.6,'#6a7850'); wkHG.addColorStop(1,'#4a5830');
  C.fillStyle=wkHG;
  C.beginPath(); C.ellipse(0,-19*s,8*s,9*s,0,0,Math.PI*2); C.fill();
  // Skull damage
  C.fillStyle='#5a3020';
  C.beginPath(); C.ellipse(4*s,-17*s,3*s,2*s,0.3,0,Math.PI*2); C.fill();
  // Sunken eyes
  C.fillStyle='#1a0a00';
  C.beginPath(); C.ellipse(-3*s,-20*s,2.5*s,2*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(3*s,-20*s,2.5*s,2*s,0,0,Math.PI*2); C.fill();
  // Glowing amber eyes
  C.fillStyle='#ffaa00';
  C.beginPath(); C.arc(-3*s,-20*s,1.2*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(3*s,-20*s,1.2*s,0,Math.PI*2); C.fill();
  // Mouth exposed teeth
  C.fillStyle='#1a0a00';
  C.beginPath(); C.ellipse(0,-16*s,4*s,2.5*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#e8e0d0';
  C.fillRect(-3.5*s,-17.5*s,2*s,2.5*s); C.fillRect(-0.5*s,-17.5*s,2*s,2.5*s); C.fillRect(2.5*s,-17.5*s,1.5*s,2.5*s);
  // Blood drip
  C.fillStyle='#8a0010';
  C.beginPath(); C.ellipse(1*s,-14*s,2*s,3*s,0.2,0,Math.PI*2); C.fill();
}

// ================================================================
//  SPRITE ASSETS -- RUNNER ZOMBIE
// ================================================================
function drawRunner(C, s, walk){
  C.fillStyle='#4a2010';
  C.fillRect((-6+walk*6)*s,2*s,4*s,12*s); C.fillRect((2-walk*6)*s,2*s,4*s,12*s);
  C.fillStyle='#6a0000';
  C.beginPath(); C.ellipse(-4*s,6*s,2*s,2*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(4*s,9*s,1.5*s,1.5*s,0,0,Math.PI*2); C.fill();
  // Body bloodsoaked
  C.fillStyle='#8a2010'; C.fillRect(-6*s,-10*s,12*s,14*s);
  C.fillStyle='#5a0808';
  C.beginPath(); C.ellipse(2*s,-5*s,3.5*s,4.5*s,-0.2,0,Math.PI*2); C.fill();
  C.fillStyle='#3a0404';
  C.beginPath(); C.ellipse(2*s,-5*s,2*s,3*s,-0.2,0,Math.PI*2); C.fill();
  // Exposed ribs
  C.strokeStyle='#c8a080'; C.lineWidth=0.8*s;
  [-2,-1,0,1].forEach(r=>{C.beginPath();C.arc(2*s,(-5+r*2)*s,3*s,Math.PI,Math.PI*1.8);C.stroke();});
  // Arms sprint pose
  C.fillStyle='#7a3018';
  C.save(); C.rotate(-0.5+walk*0.6); C.fillRect(6*s,-3*s,14*s,4*s); C.restore();
  C.save(); C.rotate(0.4-walk*0.6); C.fillRect(-20*s,-3*s,14*s,4*s); C.restore();
  // Neck wound
  C.fillStyle='#6a3020'; C.fillRect(-2*s,-14*s,4*s,5*s);
  C.fillStyle='#8a0010';
  C.beginPath(); C.ellipse(1*s,-12*s,2*s,1.5*s,0.5,0,Math.PI*2); C.fill();
  // Head missing scalp
  C.fillStyle='#7a6048';
  C.beginPath(); C.ellipse(0,-19*s,6*s,7*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#9a3020';
  C.beginPath(); C.ellipse(-2*s,-23*s,4*s,3*s,0,0.3,Math.PI*1.5); C.fill();
  C.fillStyle='#e8d8c0';
  C.beginPath(); C.ellipse(-2*s,-23*s,3.5*s,2.5*s,0,0,Math.PI*2); C.fill();
  // Wild red eyes
  C.fillStyle='#cc0000';
  C.beginPath(); C.arc(-2.5*s,-20*s,2*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(2.5*s,-20*s,2*s,0,Math.PI*2); C.fill();
  C.fillStyle='#ff4444';
  C.beginPath(); C.arc(-2.5*s,-20.5*s,1*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(2.5*s,-20.5*s,1*s,0,Math.PI*2); C.fill();
  // Screaming mouth
  C.fillStyle='#1a0808';
  C.beginPath(); C.ellipse(0,-16*s,5*s,4*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#d03020';
  C.beginPath(); C.ellipse(0,-16*s,2*s,3*s,0,0,Math.PI); C.fill();
  C.fillStyle='#e8e0d0';
  [-3,-1,1,3].forEach(tx=>{C.fillRect(tx*s-0.8*s,-18.5*s,1.6*s,2.5*s);});
}

// ================================================================
//  SPRITE ASSETS -- TANK ZOMBIE
// ================================================================
function drawTank(C, s, walk){
  // Feet
  C.fillStyle='#2a2018';
  C.beginPath(); C.ellipse(-7*s+walk*5*s,14*s,5.5*s,3.5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(7*s-walk*5*s,14*s,5.5*s,3.5*s,0,0,Math.PI*2); C.fill();
  // Legs bloated
  C.fillStyle='#3a3228';
  C.fillRect((-10+walk*4)*s,2*s,9*s,14*s); C.fillRect((1-walk*4)*s,2*s,9*s,14*s);
  // Body gradient
  const tkBG=C.createRadialGradient(-4*s,-8*s,3*s,0,-2*s,18*s);
  tkBG.addColorStop(0,'#6a6050'); tkBG.addColorStop(0.5,'#4a4038'); tkBG.addColorStop(1,'#2a2820');
  C.fillStyle=tkBG;
  C.beginPath(); C.ellipse(0,-2*s,18*s,17*s,0,0,Math.PI*2); C.fill();
  // Bloat highlight
  C.fillStyle='#5a5048';
  C.beginPath(); C.ellipse(-3*s,-5*s,8*s,10*s,-0.2,0,Math.PI*2); C.fill();
  // Burst seams
  C.strokeStyle='#2a2018'; C.lineWidth=1.5*s;
  C.beginPath(); C.moveTo(-6*s,-10*s); C.lineTo(-2*s,6*s); C.stroke();
  C.beginPath(); C.moveTo(4*s,-8*s); C.lineTo(8*s,4*s); C.stroke();
  // Infection pustules
  C.fillStyle='#8a8a20';
  [-5,3,-8,6].forEach((px,i)=>{C.beginPath();C.arc(px*s,(-6+i*3)*s,1.5*s,0,Math.PI*2);C.fill();});
  // Massive arms
  C.fillStyle='#4a4038';
  C.beginPath(); C.ellipse(22*s,-2*s,8*s,5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(-22*s,-2*s,8*s,5*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#5a4a38';
  C.beginPath(); C.ellipse(30*s,-1*s,5*s,5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(-30*s,-1*s,5*s,5*s,0,0,Math.PI*2); C.fill();
  // Knuckle wounds
  C.fillStyle='#8a2020';
  [28,30,32].forEach(kx=>{
    C.beginPath(); C.arc(kx*s,-2*s,1*s,0,Math.PI*2); C.fill();
    C.beginPath(); C.arc(-kx*s,-2*s,1*s,0,Math.PI*2); C.fill();
  });
  // Short neck
  C.fillStyle='#4a3a28'; C.fillRect(-5*s,-18*s,10*s,8*s);
  // Huge head
  C.fillStyle='#5a5040';
  C.beginPath(); C.ellipse(0,-24*s,11*s,10*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#e0d8c0';
  C.beginPath(); C.ellipse(2*s,-26*s,5*s,3.5*s,0.2,0,Math.PI*1.2); C.fill();
  C.fillStyle='#0a0a00';
  C.beginPath(); C.ellipse(-4*s,-25*s,3*s,2.5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(4*s,-25*s,3*s,2.5*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#ff8800';
  C.beginPath(); C.arc(-4*s,-25*s,1.5*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(4*s,-25*s,1.5*s,0,Math.PI*2); C.fill();
  C.fillStyle='#1a0a00';
  C.beginPath(); C.ellipse(0,-20*s,7*s,4*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#c0b898';
  [-5,-2.5,0,2.5,5].forEach(tx=>{C.fillRect(tx*s-1.2*s,-23.5*s,2.4*s,(2.5+Math.abs(tx)*0.3)*s);});
}

// ================================================================
//  SPRITE ASSETS -- BOSS ZOMBIE
// ================================================================
function drawBoss(C, s, walk){
  const bPulse=0.25+0.15*Math.sin(Date.now()/300);
  // Feet
  C.fillStyle='#2a1030';
  C.beginPath(); C.ellipse(-10*s+walk*4*s,18*s,8*s,5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(10*s-walk*4*s,18*s,8*s,5*s,0,0,Math.PI*2); C.fill();
  // Legs
  C.fillStyle='#3a1840';
  C.fillRect((-14+walk*3)*s,2*s,12*s,18*s); C.fillRect((2-walk*3)*s,2*s,12*s,18*s);
  C.strokeStyle='#6a0080'; C.lineWidth=1.5*s;
  C.beginPath(); C.moveTo(-8*s,4*s); C.lineTo(-6*s,16*s); C.stroke();
  C.beginPath(); C.moveTo(8*s,4*s); C.lineTo(6*s,16*s); C.stroke();
  // Body
  C.fillStyle='#4a1a58';
  C.beginPath(); C.ellipse(0,-4*s,24*s,22*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#6a2878';
  C.beginPath(); C.ellipse(-14*s,0,8*s,6*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(14*s,-6*s,6*s,5*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(-5*s,-14*s,5*s,4*s,0,0,Math.PI*2); C.fill();
  // Veins
  C.strokeStyle='#1a0028'; C.lineWidth=1.8*s;
  C.beginPath(); C.moveTo(-14*s,-10*s); C.bezierCurveTo(-14*s,-3*s,-8*s,-3*s,-8*s,4*s); C.stroke();
  C.beginPath(); C.moveTo(6*s,-12*s); C.bezierCurveTo(6*s,-3*s,14*s,-3*s,14*s,2*s); C.stroke();
  // Pulsing core
  C.fillStyle=`rgba(180,0,255,${bPulse})`;
  C.beginPath(); C.arc(0,-4*s,8*s,0,Math.PI*2); C.fill();
  C.fillStyle=`rgba(220,100,255,${bPulse*0.5})`;
  C.beginPath(); C.arc(0,-4*s,14*s,0,Math.PI*2); C.fill();
  C.fillStyle=`rgba(255,180,255,${bPulse*0.25})`;
  C.beginPath(); C.arc(0,-4*s,20*s,0,Math.PI*2); C.fill();
  // Tentacle arms
  C.fillStyle='#5a2068';
  C.save(); C.rotate(walk*0.25);
  C.beginPath(); C.moveTo(18*s,-6*s); C.bezierCurveTo(28*s,-2*s,34*s,2*s,38*s,0); C.bezierCurveTo(34*s,2*s,28*s,6*s,18*s,4*s); C.closePath(); C.fill();
  C.restore();
  C.save(); C.rotate(-walk*0.25);
  C.beginPath(); C.moveTo(-18*s,-6*s); C.bezierCurveTo(-28*s,-2*s,-34*s,2*s,-38*s,0); C.bezierCurveTo(-34*s,2*s,-28*s,6*s,-18*s,4*s); C.closePath(); C.fill();
  C.restore();
  // Claws
  C.fillStyle='#3a1048';
  [28,33,38].forEach(ax=>{
    [1,-1].forEach(sign=>{
      C.beginPath(); C.moveTo(ax*s,0); C.lineTo((ax+5)*s,sign*5*s); C.lineTo((ax+3)*s,sign*8*s); C.closePath(); C.fill();
      C.beginPath(); C.moveTo(-ax*s,0); C.lineTo(-(ax+5)*s,sign*5*s); C.lineTo(-(ax+3)*s,sign*8*s); C.closePath(); C.fill();
    });
  });
  // Neck
  C.fillStyle='#3a1048'; C.fillRect(-6*s,-24*s,12*s,10*s);
  // Head
  C.fillStyle='#5a2070';
  C.beginPath(); C.ellipse(0,-32*s,14*s,13*s,0,0,Math.PI*2); C.fill();
  // Crown spines
  C.fillStyle='#e0d0f0';
  [-10,-6,-2,2,6,10].forEach(sx=>{
    C.beginPath(); C.moveTo(sx*s,-42*s); C.lineTo((sx-2)*s,-36*s); C.lineTo((sx+2)*s,-36*s); C.closePath(); C.fill();
  });
  // Eyes
  C.fillStyle='#0a000a';
  C.beginPath(); C.ellipse(-5*s,-33*s,3.5*s,3*s,0,0,Math.PI*2); C.fill();
  C.beginPath(); C.ellipse(5*s,-33*s,3.5*s,3*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#cc00ff';
  C.beginPath(); C.arc(-5*s,-33*s,2*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(5*s,-33*s,2*s,0,Math.PI*2); C.fill();
  C.fillStyle='#ff88ff';
  C.beginPath(); C.arc(-5*s,-33.5*s,0.8*s,0,Math.PI*2); C.fill();
  C.beginPath(); C.arc(5*s,-33.5*s,0.8*s,0,Math.PI*2); C.fill();
  // Fanged maw
  C.fillStyle='#0a000a';
  C.beginPath(); C.ellipse(0,-27*s,9*s,6*s,0,0,Math.PI*2); C.fill();
  C.fillStyle='#e8e0f0';
  [-6,-3.5,-1,1,3.5,6].forEach(tx=>{
    C.beginPath(); C.moveTo(tx*s,-31*s); C.lineTo((tx-1.5)*s,-26*s); C.lineTo((tx+1.5)*s,-26*s); C.closePath(); C.fill();
  });
  // Drool
  C.strokeStyle=`rgba(180,0,255,0.6)`; C.lineWidth=1.5*s;
  C.beginPath(); C.moveTo(-2*s,-24*s); C.lineTo(-3*s,-20*s); C.stroke();
  C.beginPath(); C.moveTo(3*s,-24*s); C.lineTo(2*s,-18*s); C.stroke();
}

// Dispatch zombie draw
function drawZombie(z){

  let sprite;

  if(z.ti===0) sprite = SPRITES.walker;
  else if(z.ti===1) sprite = SPRITES.runner;
  else if(z.ti===2) sprite = SPRITES.tank;
  else sprite = SPRITES.boss;

  const scale = z.size / 36;

  C.save();

  C.translate(z.x,z.y);

  C.rotate(z.angle);

  if(z.flash>0){
    C.filter='brightness(2)';
  }

  C.drawImage(
    sprite,
    -sprite.width*scale/2,
    -sprite.height*scale/2,
    sprite.width*scale,
    sprite.height*scale
  );

  C.filter='none';

  C.restore();

  // HP BAR
  if(z.hp<z.maxHp){

    const bw=z.size*2.8;
    const bx=z.x-bw/2;
    const by=z.y-z.size-13;

    C.fillStyle='rgba(0,0,0,0.6)';
    C.fillRect(bx-1,by-1,bw+2,7);

    C.fillStyle='#330000';
    C.fillRect(bx,by,bw,5);

    const pct=z.hp/z.maxHp;

    C.fillStyle=
      pct>0.5 ? '#22aa22' :
      pct>0.25 ? '#aaaa00' :
      '#cc0000';

    C.fillRect(bx,by,bw*pct,5);

    C.strokeStyle='rgba(255,255,255,0.15)';
    C.lineWidth=0.5;

    C.strokeRect(bx,by,bw,5);
  }

  //BOSS LABEL
  if(z.ti===3){

    C.save();

    C.font='bold 11px Barlow Condensed,sans-serif';

    C.fillStyle='#cc88ff';

    C.textAlign='center';

    C.shadowColor='#8800ff';

    C.shadowBlur=6;

    C.fillText(
      'BOSS',
      z.x,
      z.y-z.size-16
    );
   
   C.restore();
  }
}

function buildSpriteCache(){

  makeSprite('walker',128,128,()=>{
    drawWalker(2.5,0);
  });

  makeSprite('runner',128,128,()=>{
    drawRunner(2.5,0);
  });

  makeSprite('tank',180,180,()=>{
    drawTank(2.5,0);
  });

  makeSprite('boss',260,260,()=>{
    drawBoss(2.5,0);
  
  if(G.wave % 5 === 0){
    spawnBoss(2.5,0);
}
});

// ================================================================
//  SPRITE ASSETS -- BULLET
// ================================================================
function drawBullet(b){
  C.save();
  if(b.trail.length>1){
    for(let i=1;i<b.trail.length;i++){
      const alpha=(i/b.trail.length)*0.4;
      const width=4*(i/b.trail.length);
      C.beginPath(); C.moveTo(b.trail[i-1].x,b.trail[i-1].y); C.lineTo(b.trail[i].x,b.trail[i].y);
      C.strokeStyle=`rgba(255,180,40,${alpha})`; C.lineWidth=width; C.stroke();
    }
    C.beginPath(); C.moveTo(b.trail[0].x,b.trail[0].y);
    for(let i=1;i<b.trail.length;i++) C.lineTo(b.trail[i].x,b.trail[i].y);
    C.lineTo(b.x,b.y);
    C.strokeStyle='rgba(255,240,180,0.85)'; C.lineWidth=1; C.stroke();
  }
  C.translate(b.x,b.y); C.rotate(b.angle);
  const bg=C.createLinearGradient(0,-2,0,2);
  bg.addColorStop(0,'#d4a020'); bg.addColorStop(0.4,'#f0c040'); bg.addColorStop(1,'#a07010');
  C.fillStyle=bg;
  C.beginPath(); C.moveTo(6,0); C.lineTo(4,-1.8); C.lineTo(-3,-1.8); C.lineTo(-3.5,0); C.lineTo(-3,1.8); C.lineTo(4,1.8); C.closePath(); C.fill();
  C.fillStyle='#c06820'; C.beginPath(); C.moveTo(6,0); C.lineTo(4,-1.8); C.lineTo(4,1.8); C.closePath(); C.fill();
  C.fillStyle='#806010'; C.fillRect(-3.5,-2,1,4);
  C.globalAlpha=0.35; C.fillStyle='#ffcc44';
  C.beginPath(); C.arc(2,0,3.5,0,Math.PI*2); C.fill();
  C.globalAlpha=1; C.restore();
}

// ================================================================
// PARTICLE SPRITES
// ================================================================
const PARTICLE_SPRITES = {};

function makeParticleSprite(name,color,size){

  const cv = document.createElement('canvas');

  cv.width = size * 2;
  cv.height = size * 2;

  const cx = cv.getContext('2d');

  const g = cx.createRadialGradient(
    size,
    size,
    1,
    size,
    size,
    size
  );

  g.addColorStop(0,color);
  g.addColorStop(1,'transparent');

  cx.fillStyle = g;

  cx.beginPath();

  cx.arc(size,size,size,0,Math.PI*2);

  cx.fill();

  PARTICLE_SPRITES[name] = cv;
}

function buildParticleSprites(){

  makeParticleSprite('blood','#8a0010',12);

  makeParticleSprite('flash','#ffee88',14);

  makeParticleSprite('fireorange','#ff6600',20);

  makeParticleSprite('fieryellow','#ffcc22',16);

  makeParticleSprite('fiered','#cc2200',18);

  makeParticleSprite('smokegrey','#887766',18);

}

buildParticleSprites();

function drawParticle(pt){

  let sprite = null;

  if(pt.col==='blood'){
    sprite = PARTICLE_SPRITES.blood;
  }
  else if(pt.col==='flash'){
    sprite = PARTICLE_SPRITES.flash;
  }
  else if(pt.col==='fireorange'){
    sprite = PARTICLE_SPRITES.fireorange;
  }
  else if(pt.col==='fieryellow'){
    sprite = PARTICLE_SPRITES.fieryellow;
  }
  else if(pt.col==='fiered'){
    sprite = PARTICLE_SPRITES.fiered;
  }
  else if(pt.col==='smokegrey'){
    sprite = PARTICLE_SPRITES.smokegrey;
  }

  C.save();

  C.globalAlpha = Math.min(1,pt.life/20);

  if(sprite){

    const sz = pt.sz * 2;

    C.drawImage(
      sprite,
      pt.x - sz,
      pt.y - sz,
      sz * 2,
      sz * 2
    );

  }else{

    C.fillStyle = pt.col;

    C.beginPath();

    C.arc(
      pt.x,
      pt.y,
      pt.sz,
      0,
      Math.PI*2
    );

    C.fill();
  }

  C.restore();
}

// ================================================================
//  RENDER DISPATCH
// ================================================================
function render(){
  if(viewMode==='3p') render3P(); else render1P();
}

// ================================================================
//  RENDER -- 3RD PERSON
// ================================================================
function render3P(){
  const W=cW(), H=cH(), p=G.player;
  C.save();
  C.translate(shakeX,shakeY);

  // Background
  const bgG=C.createRadialGradient(W/2,H/2,50,W/2,H/2,Math.max(W,H)*0.7);
  bgG.addColorStop(0,'#141410'); bgG.addColorStop(1,'#080806');
  C.fillStyle=bgG; C.fillRect(0,0,W,H);
  // Grid
  C.strokeStyle='rgba(255,255,255,0.018)'; C.lineWidth=1;
  for(let gx=0;gx<W;gx+=60){C.beginPath();C.moveTo(gx,0);C.lineTo(gx,H);C.stroke();}
  for(let gy=0;gy<H;gy+=60){C.beginPath();C.moveTo(0,gy);C.lineTo(W,gy);C.stroke();}
  // Cracks
  C.strokeStyle='rgba(255,255,255,0.012)'; C.lineWidth=0.5;
  for(let gx=30;gx<W;gx+=60) for(let gy=30;gy<H;gy+=60){
    C.beginPath(); C.moveTo(gx,gy); C.lineTo(gx+15,gy+10); C.lineTo(gx+8,gy+22); C.stroke();
  }
  // Puddles
  C.fillStyle='rgba(0,10,20,0.35)';
  [[W*0.2,H*0.3,40,18],[W*0.7,H*0.6,55,22],[W*0.5,H*0.15,30,12],[W*0.85,H*0.4,35,15]].forEach(([px,py,rw,rh])=>{
    C.beginPath(); C.ellipse(px,py,rw,rh,0.3,0,Math.PI*2); C.fill();
    C.fillStyle='rgba(30,40,60,0.18)'; C.beginPath(); C.ellipse(px-rw*0.2,py-rh*0.2,rw*0.4,rh*0.3,0.3,0,Math.PI*2); C.fill();
    C.fillStyle='rgba(0,10,20,0.35)';
  });
  // Vignette
  const vg=C.createRadialGradient(W/2,H/2,Math.min(W,H)*0.3,W/2,H/2,Math.max(W,H)*0.8);
  vg.addColorStop(0,'transparent'); vg.addColorStop(1,'rgba(0,0,0,0.6)');
  C.fillStyle=vg; C.fillRect(0,0,W,H);

  // Earthquake ground flash
  if(G.earthquakeActive){
    const ef=G.earthquakeDur/120;
    C.fillStyle=`rgba(80,40,0,${Math.min(0.15,ef*0.1+0.05*Math.random())})`;
    C.fillRect(0,0,W,H);
  }

  // Ash particles
  for(const a of G.ashParticles){
    C.save(); C.globalAlpha=a.a*(a.life/400);
    C.fillStyle='#ccbbaa'; C.beginPath(); C.arc(a.x,a.y,a.sz,0,Math.PI*2); C.fill();
    C.restore();
  }

  // Ground cracks from earthquakes/impacts
  for(const crack of G.cracks){
    C.save(); C.globalAlpha=crack.a;
    C.strokeStyle='#ff6600'; C.lineWidth=1.5;
    C.shadowColor='#ff4400'; C.shadowBlur=4;
    for(const line of crack.lines){
      C.beginPath(); C.moveTo(line.ox,line.oy);
      for(const seg of line.segs) C.lineTo(seg.x,seg.y);
      C.stroke();
    }
    C.restore();
  }

  // Blood decals
  for(const d of G.bloodDecals){
    C.save(); C.globalAlpha=d.a;
    C.fillStyle='#580010';
    C.beginPath(); C.ellipse(d.x,d.y,d.r,d.r*(d.oval||0.7),d.rot||0,0,Math.PI*2); C.fill();
    C.globalAlpha=d.a*0.55; C.fillStyle='#380008';
    C.beginPath(); C.ellipse(d.x,d.y,d.r*0.55,d.r*0.4*(d.oval||0.7),d.rot||0,0,Math.PI*2); C.fill();
    C.restore();
  }

  // Debris on ground
  for(const d of G.debris){
    if(!d.landed) continue;
    C.save(); C.translate(d.x,d.y); C.rotate(d.rot);
    C.fillStyle=d.col; C.fillRect(-d.w/2,-d.h/2,d.w,d.h);
    C.restore();
  }

  // Fire columns
  for(const f of G.fires){
    C.save();
    const fp=(f.life/f.maxLife)*f.intensity;
    C.globalAlpha=fp*0.7;
    const fg=C.createRadialGradient(f.x,f.y,0,f.x,f.y,f.w*1.5);
    fg.addColorStop(0,'rgba(255,200,50,0.9)');
    fg.addColorStop(0.4,'rgba(255,80,0,0.6)');
    fg.addColorStop(1,'rgba(200,20,0,0)');
    C.fillStyle=fg; C.beginPath(); C.arc(f.x,f.y,f.w*1.5,0,Math.PI*2); C.fill();
    C.restore();
  }
 
  // ================================================================
  // Particles
  // ================================================================ 
  const maxParticles = 350;

const particleStart =
  Math.max(
    0,
    G.particles.length - maxParticles
  );

for(
  let i = particleStart;
  i < G.particles.length;
  i++
){
  drawParticle(G.particles[i]);
}

  // Asteroids
  for(const ast of G.asteroids){
    C.save(); C.translate(ast.x,ast.y); C.rotate(ast.rot);
    // Rock body
    const rg=C.createRadialGradient(-ast.r*0.3,-ast.r*0.3,1,0,0,ast.r);
    rg.addColorStop(0,'#888070'); rg.addColorStop(0.5,'#5a5248'); rg.addColorStop(1,'#2a2520');
    C.fillStyle=rg;
    C.beginPath(); C.moveTo(ast.pts[0].x,ast.pts[0].y);
    for(let i=1;i<ast.pts.length;i++) C.lineTo(ast.pts[i].x,ast.pts[i].y);
    C.closePath(); C.fill();
    // Glow trail
    C.globalAlpha=0.4;
    const tg=C.createRadialGradient(0,ast.r*0.5,0,0,0,ast.r*1.5);
    tg.addColorStop(0,'rgba(255,120,20,0.6)'); tg.addColorStop(1,'transparent');
    C.fillStyle=tg; C.beginPath(); C.arc(0,0,ast.r*1.5,0,Math.PI*2); C.fill();
    C.restore();
  }

  // Falling debris (airborne)
  for(const d of G.debris){
    if(d.landed) continue;
    C.save(); C.translate(d.x,d.y); C.rotate(d.rot);
    C.fillStyle=d.col; C.fillRect(-d.w/2,-d.h/2,d.w,d.h);
    C.strokeStyle='rgba(200,180,140,0.4)'; C.lineWidth=0.5; C.strokeRect(-d.w/2,-d.h/2,d.w,d.h);
    C.restore();
  }

  // Zombies
  for(const z of G.zombies) drawZombie(z);

  // Bullets
  for(const b of G.bullets) drawBullet(b);

  // Player
  drawPlayer(p.x,p.y,p.angle,p.r,p.invTimer);

  // Auto-aim indicator
  C.save();
  if(autoAim&&aimTarget){
    const lockPulse=0.6+0.4*Math.sin(Date.now()/120);
    C.strokeStyle=`rgba(255,80,0,${lockPulse})`; C.lineWidth=2;
    C.beginPath(); C.arc(aimTarget.x,aimTarget.y,aimTarget.size+6,0,Math.PI*2); C.stroke();
    C.strokeStyle=`rgba(255,160,0,${lockPulse})`; C.lineWidth=2.5;
    const br=aimTarget.size+10;
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx,sy])=>{
      const cx=aimTarget.x+sx*br, cy=aimTarget.y+sy*br;
      C.beginPath(); C.moveTo(cx,aimTarget.y+sy*(br-8)); C.lineTo(cx,cy); C.lineTo(aimTarget.x+sx*(br-8),cy); C.stroke();
    });
    C.strokeStyle='rgba(255,100,0,0.25)'; C.lineWidth=1; C.setLineDash([4,6]);
    C.beginPath(); C.moveTo(p.x,p.y); C.lineTo(aimTarget.x,aimTarget.y); C.stroke();
    C.setLineDash([]);
  }else{
    C.translate(p.x,p.y);
    const ld=55; C.strokeStyle='rgba(255,50,50,0.45)'; C.lineWidth=1; C.setLineDash([3,4]);
    C.beginPath(); C.moveTo(Math.cos(p.angle)*26,Math.sin(p.angle)*26); C.lineTo(Math.cos(p.angle)*ld,Math.sin(p.angle)*ld); C.stroke();
    C.setLineDash([]); C.fillStyle='rgba(255,50,50,0.85)';
    C.beginPath(); C.arc(Math.cos(p.angle)*ld,Math.sin(p.angle)*ld,2.5,0,Math.PI*2); C.fill();
  }
  C.restore();

  // Reload bar
  if(G.reloading){
    const prog=1-G.reloadTimer/90;
    const bw=84,bx=p.x-42,by=p.y-p.r-22;
    C.fillStyle='rgba(0,0,0,0.75)'; C.fillRect(bx-2,by-2,bw+4,12);
    C.fillStyle='#1a1a1a'; C.fillRect(bx,by,bw,7);
    const rg=C.createLinearGradient(bx,0,bx+bw*prog,0);
    rg.addColorStop(0,'#ff4400'); rg.addColorStop(1,'#ffaa00');
    C.fillStyle=rg; C.fillRect(bx,by,bw*prog,7);
    C.save(); C.font='bold 9px JetBrains Mono,monospace'; C.fillStyle='rgba(255,255,255,0.8)';
    C.textAlign='center'; C.fillText('RELOADING',p.x,by-3); C.restore();
  }

  C.restore(); // end shake transform

  // HUD overlays (no shake)
  C.save();
  C.font='bold 12px JetBrains Mono,monospace';
  C.fillStyle='rgba(0,230,118,0.5)'; C.textAlign='center';
  C.fillText(`${G.zombiesTotal-G.zombiesLeft} / ${G.zombiesTotal} ELIMINATED`,W/2,H-10);
  if(autoAim){
    const bp=0.7+0.3*Math.sin(Date.now()/200);
    C.fillStyle=`rgba(255,120,0,${bp})`; C.font='bold 11px JetBrains Mono,monospace';
    C.textAlign='right'; C.fillText('◉ AUTO-AIM',W-12,H-10);
  }
  C.restore();
}

// ================================================================
//  RENDER -- 1ST PERSON raycaster
// ================================================================
const MAP_W=32, MAP_H=20;
let RMAP=null;
function getMap(){
  if(RMAP) return RMAP; RMAP=[];
  for(let y=0;y<MAP_H;y++){
    RMAP[y]=[];
    for(let x=0;x<MAP_W;x++){
      if(x===0||y===0||x===MAP_W-1||y===MAP_H-1) RMAP[y][x]=1;
      else if(x%8===0&&y%6===0&&x>2&&y>2) RMAP[y][x]=1;
      else if(x%8===4&&y%6===3) RMAP[y][x]=1;
      else RMAP[y][x]=0;
    }
  }
  for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
    const cx=Math.floor(MAP_W/2)+dx, cy=Math.floor(MAP_H/2)+dy;
    if(RMAP[cy]&&cx>=0&&cx<MAP_W) RMAP[cy][cx]=0;
  }
  return RMAP;
}

function render1P(){
  const W=cW(), H=cH(), p=G.player;
  const map=getMap(), CELL=50;
  const px=p.x/CELL, py=p.y/CELL, angle=p.angle;
  const FOV=Math.PI/2.6, COLS=Math.min(W,480), colW=W/COLS, halfH=H/2;

  C.save();
  // Earthquake shake
  if(shakeDur>0) C.translate(shakeX,shakeY);

  // Sky
  const sky=C.createLinearGradient(0,0,0,halfH);
  sky.addColorStop(0,'#060000'); sky.addColorStop(0.5,'#130606'); sky.addColorStop(1,'#1e0c04');
  C.fillStyle=sky; C.fillRect(0,0,W,halfH);
  // Fire glow on horizon
  const fg=C.createRadialGradient(W*0.3,halfH,0,W*0.3,halfH,W*0.5);
  fg.addColorStop(0,'rgba(200,60,10,0.35)'); fg.addColorStop(1,'transparent');
  C.fillStyle=fg; C.fillRect(0,halfH*0.2,W,halfH*0.8);
  const fg2=C.createRadialGradient(W*0.75,halfH,0,W*0.75,halfH,W*0.4);
  fg2.addColorStop(0,'rgba(180,50,5,0.25)'); fg2.addColorStop(1,'transparent');
  C.fillStyle=fg2; C.fillRect(0,halfH*0.3,W,halfH*0.7);
  // Ash in sky
  for(const a of G.ashParticles){
    if(a.y>halfH) continue;
    C.save(); C.globalAlpha=a.a*0.5; C.fillStyle='#ccbbaa';
    C.beginPath(); C.arc(a.x,a.y*0.4,a.sz,0,Math.PI*2); C.fill();
    C.restore();
  }
  // Floor
  const flr=C.createLinearGradient(0,halfH,0,H);
  flr.addColorStop(0,'#1a1510'); flr.addColorStop(0.5,'#120f0a'); flr.addColorStop(1,'#080604');
  C.fillStyle=flr; C.fillRect(0,halfH,W,halfH);

  const zBuf=new Float32Array(COLS);
  for(let col=0;col<COLS;col++){
    const ra=angle-FOV/2+(col/COLS)*FOV;
    const cosA=Math.cos(ra), sinA=Math.sin(ra);
    const stepX=Math.abs(1/cosA), stepY=Math.abs(1/sinA);
    let mapX=Math.floor(px), mapY=Math.floor(py);
    let sdX=(cosA<0?(px-mapX):(mapX+1-px))*stepX;
    let sdY=(sinA<0?(py-mapY):(mapY+1-py))*stepY;
    const dX=cosA<0?-1:1, dY=sinA<0?-1:1;
    let hit=0, side=0, maxSteps=50;
    while(!hit&&maxSteps-->0){
      if(sdX<sdY){sdX+=stepX;mapX+=dX;side=0;}
      else{sdY+=stepY;mapY+=dY;side=1;}
      if(mapY>=0&&mapY<MAP_H&&mapX>=0&&mapX<MAP_W&&map[mapY][mapX]) hit=1;
    }
    let dist=Math.max(0.1, side===0?(sdX-stepX):(sdY-stepY));
    zBuf[col]=dist;
    const wallH=Math.min(H*3, H/dist);
    const top=halfH-wallH/2;
    const bright=Math.max(0.05,Math.min(1,1-dist/12));
    const dark=side?0.55:1;
    const rv=Math.floor(bright*dark*72+10);
    const gv=Math.floor(bright*dark*56+8);
    const bv=Math.floor(bright*dark*46+6);
    C.fillStyle=`rgb(${rv},${gv},${bv})`; C.fillRect(col*colW,top,colW+1,wallH);
    if(wallH>24){
      C.fillStyle=`rgb(${Math.max(0,rv-16)},${Math.max(0,gv-13)},${Math.max(0,bv-11)})`;
      const bkH=Math.max(2,wallH/8);
      for(let bk=top;bk<top+wallH;bk+=bkH) C.fillRect(col*colW,bk,colW+1,Math.max(0.5,bkH*0.1));
    }
  }

  // Zombie sprites (billboard)
  const sprites=G.zombies.map(z=>{
    const relX=z.x/CELL-px, relY=z.y/CELL-py;
    const camD=relX*Math.sin(angle)-relY*Math.cos(angle);
    const screenX=(0.5+(-relX*Math.cos(angle)-relY*Math.sin(angle))/(2*camD+0.001))*W;
    return{z, screenX, depth:Math.hypot(relX,relY), camD};
  }).filter(s=>s.camD>0.3).sort((a,b)=>b.depth-a.depth);

  for(const {z,screenX,depth} of sprites){
    const sprH=Math.min(H*2,Math.abs(Math.floor((H/depth)*0.9)));
    const sprW=Math.floor(sprH*0.7);
    const dx=Math.floor(screenX-sprW/2), dy=Math.floor(halfH-sprH/2);
    if(dx+sprW<0||dx>=W) continue;
    let vis=false;
    for(let sc=Math.max(0,dx);sc<Math.min(W,dx+sprW);sc+=Math.max(1,Math.floor(sprW/8))){
      const ci=Math.floor(sc/colW);
      if(ci<COLS&&zBuf[ci]>depth-0.1){vis=true;break;}
    }
    if(!vis) continue;
    const fade=Math.min(1,depth<1?depth:1);
    C.save(); C.globalAlpha=fade*0.95;
    C.save(); C.translate(dx+sprW/2,dy+sprH/2); C.scale(sprW/36,sprH/36);
    if(z.flash>0) C.filter='brightness(3) saturate(0)';
    const s=1, walk=Math.sin(z.walkCycle)*0.15;
    if(z.ti===0) drawWalker(s,walk);
    else if(z.ti===1) drawRunner(s,walk);
    else if(z.ti===2) drawTank(s,walk);
    else drawBoss(s,walk);
    C.filter='none'; C.restore();
    if(z.hp<z.maxHp){
      C.globalAlpha=fade;
      C.fillStyle='rgba(0,0,0,0.6)'; C.fillRect(dx,dy-8,sprW,6);
      C.fillStyle='#330000'; C.fillRect(dx,dy-7,sprW,4);
      const pct=z.hp/z.maxHp;
      C.fillStyle=pct>0.5?'#22aa22':pct>0.25?'#aaaa00':'#cc0000';
      C.fillRect(dx,dy-7,sprW*pct,4);
    }
    if(depth<0.8){
      C.globalAlpha=(1-depth/0.8)*0.4;
      C.fillStyle='#0a0000'; C.fillRect(dx,dy,sprW,sprH);
    }
    C.restore();
  }

  drawFPSGun(W,H);
  C.restore();

  C.save();
  C.font='bold 12px JetBrains Mono,monospace';
  C.fillStyle='rgba(0,230,118,0.45)'; C.textAlign='center';
  C.fillText(`${G.zombiesTotal-G.zombiesLeft} / ${G.zombiesTotal} ELIMINATED`,W/2,H-10);
  if(autoAim){
    const bp=0.7+0.3*Math.sin(Date.now()/200);
    C.fillStyle=`rgba(255,120,0,${bp})`; C.font='bold 11px JetBrains Mono,monospace';
    C.textAlign='right'; C.fillText('◉ AUTO-AIM',W-12,H-10);
  }
  C.restore();
}

// ================================================================
//  FPS WEAPON -- M4 carbine + gloved hands
// ================================================================
function drawFPSGun(W,H){
  const t=Date.now()/800;
  const moving=keys['w']||keys['a']||keys['s']||keys['d']||mDirs.u||mDirs.d||mDirs.l||mDirs.r;
  const bob=moving?Math.sin(t*5)*4:Math.sin(t*0.8)*1.2;
  const sway=moving?Math.sin(t*2.5)*3:0;
  C.save(); C.translate(W/2+80+sway,H-20+bob);

  // Right glove
  C.fillStyle='#1a1a14';
  C.beginPath(); C.moveTo(-80,-85); C.lineTo(-65,-100); C.lineTo(-45,-100);
  C.lineTo(-35,-80); C.lineTo(-40,-65); C.lineTo(-80,-65); C.closePath(); C.fill();
  C.fillStyle='#2a2a20';
  C.fillRect(-75,-98,8,4); C.fillRect(-64,-98,8,4); C.fillRect(-53,-98,8,4);

  // Left glove
  C.fillStyle='#1a1a14';
  C.beginPath(); C.moveTo(-200,-72); C.lineTo(-185,-88); C.lineTo(-165,-88);
  C.lineTo(-155,-68); C.lineTo(-160,-55); C.lineTo(-200,-55); C.closePath(); C.fill();
  C.fillStyle='#2a2a20';
  C.fillRect(-196,-86,8,4); C.fillRect(-185,-86,8,4); C.fillRect(-174,-86,8,4);

  // Stock
  C.fillStyle='#1a1208'; C.fillRect(-30,-82,55,18); C.fillRect(-10,-70,30,10);
  C.fillStyle='#242018'; C.fillRect(18,-84,8,22);

  // Lower receiver + trigger
  C.fillStyle='#2a2a22'; C.fillRect(-90,-90,65,20);
  C.fillStyle='#222220'; C.beginPath(); C.arc(-65,-70,12,0,Math.PI); C.fill();
  C.fillStyle='#3a3a30'; C.fillRect(-70,-78,4,10);

  // Grip + texture
  C.fillStyle='#1a1a14';
  C.beginPath(); C.moveTo(-80,-70); C.lineTo(-72,-68); C.lineTo(-75,-36);
  C.lineTo(-95,-36); C.lineTo(-98,-68); C.closePath(); C.fill();
  C.fillStyle='#141410';
  for(let gi=0;gi<5;gi++) C.fillRect(-96,-64+gi*6,18,2);

  // Magazine
  C.fillStyle='#2a2018';
  C.beginPath(); C.moveTo(-80,-68); C.lineTo(-90,-68); C.lineTo(-95,-20);
  C.bezierCurveTo(-90,5,-60,5,-55,-20); C.lineTo(-60,-68); C.closePath(); C.fill();
  C.fillStyle='#3a3028'; C.fillRect(-88,-60,5,35);
  C.fillStyle='#1a1208'; C.fillRect(-80,-42,2,8);

  // Upper receiver + Picatinny rail
  C.fillStyle='#333328'; C.fillRect(-90,-110,65,22);
  C.fillStyle='#2a2a20'; C.fillRect(-88,-118,60,10);
  C.fillStyle='#1e1e18';
  for(let ri=0;ri<8;ri++) C.fillRect(-86+ri*7,-116,5,6);

  // Charging handle
  C.fillStyle='#3a3a30'; C.fillRect(-55,-112,12,6); C.fillRect(-50,-118,14,8);

  // Rear BUIS sight
  C.fillStyle='#2a2a22'; C.fillRect(-85,-120,10,12); C.fillRect(-82,-122,4,4);

  // Handguard + MLOK
  C.fillStyle='#2e2e26'; C.fillRect(-200,-108,115,22);
  C.fillStyle='#262620'; C.fillRect(-198,-116,110,10);
  for(let ri=0;ri<12;ri++) C.fillRect(-196+ri*9,-114,6,6);
  C.fillStyle='#1a1a14';
  for(let ms=0;ms<5;ms++) C.fillRect(-190+ms*20,-106,12,5);

  // Gas block + front sight
  C.fillStyle='#2a2a22'; C.fillRect(-202,-122,10,18); C.fillRect(-199,-126,4,6);

  // Barrel
  C.fillStyle='#222220'; C.fillRect(-290,-101,95,8);
  C.fillStyle='#1e1e1c'; C.fillRect(-280,-106,85,3);

  // Muzzle brake
  C.fillStyle='#2e2e2a'; C.fillRect(-302,-104,16,14);
  C.fillStyle='#1a1a18';
  C.fillRect(-300,-103,3,5); C.fillRect(-296,-103,3,5); C.fillRect(-292,-103,3,5);
  C.fillRect(-300,-98,3,4);  C.fillRect(-296,-98,3,4);

  // Red dot scope
  C.fillStyle='#2a2a26'; C.fillRect(-70,-130,40,16);
  C.fillStyle='#1e1e1a'; C.fillRect(-68,-128,36,12);
  C.fillStyle='#0a1020'; C.beginPath(); C.arc(-50,-122,5,0,Math.PI*2); C.fill();
  C.fillStyle='rgba(20,60,150,0.5)'; C.beginPath(); C.arc(-50,-122,4,0,Math.PI*2); C.fill();
  C.fillStyle='rgba(100,150,255,0.3)'; C.beginPath(); C.arc(-52,-124,1.5,0,Math.PI*2); C.fill();
  C.fillStyle='rgba(255,20,20,0.9)'; C.beginPath(); C.arc(-50,-122,1,0,Math.PI*2); C.fill();

  // Muzzle flash on shot
  if(G.justFired){
    C.globalAlpha=0.55+Math.random()*0.45;
    const mfg=C.createRadialGradient(-302,-98,0,-302,-98,26);
    mfg.addColorStop(0,'rgba(255,240,180,1)');
    mfg.addColorStop(0.3,'rgba(255,160,40,0.8)');
    mfg.addColorStop(1,'rgba(255,80,0,0)');
    C.fillStyle=mfg; C.beginPath(); C.arc(-302,-98,26,0,Math.PI*2); C.fill();
    C.fillStyle='rgba(255,220,100,0.65)';
    [-30,-15,0,15,30].forEach(fy=>{
      C.beginPath(); C.moveTo(-302,-98);
      C.lineTo(-330+Math.random()*8,-98+fy);
      C.lineTo(-302,-98+fy*0.3); C.closePath(); C.fill();
    });
    C.globalAlpha=1;
  }
  C.restore();
}

const WEAPONS = {
  pistol:{
    damage:25,
    ammo:12,
    fireRate:12
  },
  shotgun:{
    damage:15,
    pellets:8,
    ammo:6
  },
  rifle:{
    damage:35,
    ammo:30
  }
};

G.pickups.push({
  x,
  y,
  type:'ammo'
});

// ================================================================
//  HUD UPDATE
// ================================================================
function updateHUD(){
  if(!G.player) return;
  const pct=(G.player.hp/G.player.maxHp)*100;
  const hf=document.getElementById('hfill');
  hf.style.width=pct+'%';
  hf.style.background=pct>60
    ?'linear-gradient(90deg,#880000,#ff4444)'
    :pct>30
    ?'linear-gradient(90deg,#996600,#ffaa00)'
    :'linear-gradient(90deg,#cc0000,#ff0000)';
  const ad=document.getElementById('adots'); ad.innerHTML='';
  for(let i=0;i<G.maxAmmo;i++){
    const d=document.createElement('div');
    d.className='adot'+(i>=G.ammo?' x':'');
    ad.appendChild(d);
  }
  document.getElementById('wnum').textContent=String(G.wave).padStart(2,'0');
  document.getElementById('scoreEl').textContent=G.score.toLocaleString();
}
});
