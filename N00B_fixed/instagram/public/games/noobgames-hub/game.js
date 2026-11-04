/* ============ NOOB GAMES — playable layer for dashboard ============ */
(function(){
'use strict';
var PC=['#FF4A4A','#2F80ED','#27AE60','#F2C94C'];
var PN=['Player 1','Player 2','Player 3','Player 4'];
var KEYMAP=[
 {up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',act:'Space'},
 {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',act:'Enter'},
 {up:'KeyI',down:'KeyK',left:'KeyJ',right:'KeyL',act:'KeyU'},
 {up:'KeyT',down:'KeyG',left:'KeyF',right:'KeyH',act:'KeyY'}
];
var keys={};
addEventListener('keydown',function(e){
  keys[e.code]=true;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Enter'].indexOf(e.code)>=0)e.preventDefault();
});
addEventListener('keyup',function(e){keys[e.code]=false;});

/* ---------- trophies (localStorage) ---------- */
function getWins(){return parseInt(localStorage.getItem('nb_wins')||'0',10)||0;}
function setWins(w){localStorage.setItem('nb_wins',String(w));var el=document.getElementById('winCount');if(el)el.textContent=w;}
function addWin(){setWins(getWins()+1);}
setWins(getWins());
(function(){var t=document.getElementById('trophy'),c=t.cloneNode(true);t.parentNode.replaceChild(c,t);
c.addEventListener('click',function(){if(confirm('Reset trophy count to 0?'))setWins(0);});
window.__nbAddWin=addWin;})();

/* ---------- overlay ---------- */
var device=document.getElementById('device');
var layer=document.createElement('div');
layer.id='gameLayer';
layer.style.cssText='position:absolute;inset:0;z-index:60;background:#0A1128;display:none;flex-direction:column;';
layer.innerHTML=
 '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;flex:0 0 auto;">'+
  '<button id="gBack" style="background:#1E293B;color:#fff;border:0;border-radius:18px;padding:8px 16px;font-family:Montserrat;font-weight:700;cursor:pointer;">◀ Games</button>'+
  '<div id="gTitle" style="flex:1;color:#fff;font-size:17px;"></div>'+
  '<button id="gRestart" style="background:#1E293B;color:#F2C94C;border:0;border-radius:18px;padding:8px 16px;font-family:Montserrat;font-weight:700;cursor:pointer;">↻ Rematch</button>'+
 '</div>'+
 '<div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;min-height:0;">'+
  '<canvas id="gCanvas" style="max-width:96%;max-height:92%;border-radius:14px;box-shadow:0 10px 30px #000a;touch-action:none;"></canvas>'+
  '<div id="gResult" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(10,17,40,.88);z-index:5;text-align:center;padding:20px;">'+
    '<div id="gWinText" style="font-size:30px;color:#fff;margin-bottom:8px;"></div>'+
    '<div id="gTrophyText" style="font-family:Montserrat;font-weight:700;color:#F2C94C;margin-bottom:18px;"></div>'+
    '<div><button id="gAgain" style="background:linear-gradient(135deg,#ffd200,#f7971e);color:#0A1128;border:0;border-radius:24px;padding:12px 28px;font-family:Montserrat;font-weight:800;cursor:pointer;margin:4px;">Rematch</button>'+
    '<button id="gHome" style="background:#1E293B;color:#fff;border:0;border-radius:24px;padding:12px 28px;font-family:Montserrat;font-weight:800;cursor:pointer;margin:4px;">All Games</button></div>'+
  '</div>'+
 '</div>'+
 '<div id="gHint" style="flex:0 0 auto;padding:8px 14px 12px;font-family:Montserrat;font-weight:600;font-size:11px;color:#94A3B8;text-align:center;"></div>';
device.appendChild(layer);

var cv,lx,over=false,raf=0,cleanupFn=null;
var GAME=null,PLAYERS=[];

/* ---------- touch joysticks (region-mapped per player) ---------- */
var joy=[null,null,null,null]; // per player: {dx,dy,tap,down}
function joyRegion(x,w){
  var m=state.mode;
  if(m===1)return 0;
  if(m===2)return x<w/2?0:1;
  if(x<w/2&&x<w*0.55&&true){}
  if(x<w/2)return 0; // TL or BL decided by y
  return x>=w/2?1:0;
}
function bindTouches(canvas){
  var map={}; // touchId -> player
  function pos(e){var r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*(canvas.width/r.width),y:(e.clientY-r.top)*(canvas.height/r.height),w:r.width};}
  canvas.addEventListener('pointerdown',function(e){
    var p=pos(e),pl;
    if(state.mode===1)pl=0;
    else if(state.mode===2)pl=p.x<p.w/2?0:1;
    else{ // quadrants TL=0 TR=1 BL=2 BR=3
      pl=(p.x<p.w/2?0:1)+(p.y<canvas.height/2?0:2);
      if(state.mode===3)pl=Math.min(pl,2);
    }
    map[e.pointerId]={p:pl,sx:p.x,sy:p.y,t0:Date.now(),moved:0};
    joy[pl]={dx:0,dy:0,tap:false};
  });
  canvas.addEventListener('pointermove',function(e){
    var t=map[e.pointerId];if(!t)return;var p=pos(e);
    var dx=p.x-t.sx,dy=p.y-t.sy,d=Math.hypot(dx,dy);t.moved=Math.max(t.moved,d);
    if(joy[t.p]){var f=Math.min(d,40)/40;joy[t.p].dx=d?dx/d*f:0;joy[t.p].dy=d?dy/d*f:0;}
  });
  function up(e){
    var t=map[e.pointerId];if(!t)return;
    if(joy[t.p]){if(Date.now()-t.t0<260&&t.moved<12)joy[t.p].tap=true;joy[t.p].dx=0;joy[t.p].dy=0;}
    delete map[e.pointerId];
  }
  canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
}
function kdir(i){ // key dir for player i (-1..1 each axis) merged with joystick
  var k=KEYMAP[i],x=0,y=0;
  if(keys[k.left])x-=1;if(keys[k.right])x+=1;
  if(keys[k.up])y-=1;if(keys[k.down])y+=1;
  var j=joy[i];if(j){if(Math.abs(j.dx)>0.25)x=j.dx;if(Math.abs(j.dy)>0.25)y=j.dy;}
  var d=Math.hypot(x,y);if(d>1){x/=d;y/=d;}
  return{x:x,y:y};
}
function ktap(i){var j=joy[i];if(j&&j.tap){j.tap=false;return true;}
  var k=KEYMAP[i];var was=keys[k.act];keys[k.act]=false;return was;}

/* ---------- state ---------- */
var state={mode:1};
function modeN(){return parseInt(document.body.getAttribute('data-mode'),10)||1;}
function buildPlayers(versus){ // versus:true => exactly 2 entities, P2 is AI in solo
  var m=modeN(),n=versus?2:(m===1?2:m);
  var arr=[];
  for(var i=0;i<n;i++)arr.push({i:i,color:PC[i],name:versus&&i===1&&m===1?'AI':PN[i],
    isAI:versus?i===1&&m===1:i>0&&m===1&&i===1}); // AI only ever slot 1 in solo
  if(m===1)arr[1].isAI=true;
  return arr;
}
function loop(fn){function tick(){if(over)return;fn();raf=requestAnimationFrame(tick);}tick();}
function stopAll(){over=true;if(raf)cancelAnimationFrame(raf);if(cleanupFn){cleanupFn();cleanupFn=null;}}

function finish(win){ // win = {name,color,human} or null (draw)
  over=true;cancelAnimationFrame(raf);
  var rt=document.getElementById('gResult');
  document.getElementById('gWinText').innerHTML=win?('🏆 <span style="color:'+win.color+'">'+win.name+'</span> wins!'):'🤝 It\'s a draw!';
  document.getElementById('gTrophyText').textContent=win&&win.human?'⭐ +1 trophy saved!':'';
  if(win&&win.human)addWin();
  rt.style.display='flex';
}
function startGame(key){
  stopAll();over=false;
  GAME=GAMES[key];state.mode=modeN();
  PLAYERS=GAME.players();
  document.getElementById('gTitle').textContent=GAME.title;
  document.getElementById('gHint').textContent=GAME.hint(state.mode);
  document.getElementById('gResult').style.display='none';
  layer.style.display='flex';
  document.querySelector('#scroll').style.visibility='hidden';
  cv=document.getElementById('gCanvas');
  lx=cv.getContext('2d');
  if(!cv._bound){bindTouches(cv);cv._bound=true;}
  cleanupFn=GAME.init(cv,lx,PLAYERS,function(w){finish(w);});
}
function goHome(){
  stopAll();layer.style.display='none';
  document.querySelector('#scroll').style.visibility='visible';
}
document.getElementById('gBack').onclick=goHome;
document.getElementById('gHome').onclick=goHome;
document.getElementById('gRestart').onclick=function(){if(GAME)startGame(Object.keys(GAMES).find(function(k){return GAMES[k]===GAME;}));};
document.getElementById('gAgain').onclick=function(){if(GAME)startGame(Object.keys(GAMES).find(function(k){return GAMES[k]===GAME;}));};

/* wire dashboard cards */
var CARDKEY={'Snakes':'snakes','Spinner War':'spinner','Paint Fight':'paint','Pool':'pool','Racing Cars':'racing','Tank Battle':'tank','Archery':'archery'};
document.querySelectorAll('.gcard').forEach(function(c){
  c.addEventListener('click',function(){var k=CARDKEY[c.dataset.game];if(k)startGame(k);});
});

/* helpers */
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function angLerp(a,b,t){var d=((b-a+Math.PI*3)%(Math.PI*2))-Math.PI;return a+d*t;}

/* ================================================================
   1) SNAKES
================================================================ */
GAMES={};
var GAMES;
GAMES.snakes={
 title:'🐍 Snakes',
 players:function(){return buildPlayers(false);},
 hint:function(m){return m===1?'You: WASD / drag your half — beat the AI snake!':'P1 WASD · P2 Arrows · P3 IJKL · P4 TFGH — last snake alive wins!';},
 init:function(cv,lx,PL,end){
  cv.width=600;cv.height=425;
  var CS=25,GW=24,GH=17;
  var snakes=PL.map(function(p,i){var s={p:p,cells:[],dir:i%2?{x:-1,y:0}:{x:1,y:0},ndir:null,alive:true,grow:0};
    var cx=i%2?GW-6:5,cy=i<2?4:GH-5;
    for(var j=0;j<4;j++)s.cells.push({x:cx,y:cy});
    return s;});
  var stars=[];function spawn(){var c;do{c={x:Math.random()*GW|0,y:Math.random()*GH|0};}
    while(snakes.some(function(s){return s.cells.some(function(q){return q.x===c.x&&q.y===c.y;});})||stars.some(function(q){return q.x===c.x&&q.y===c.y;}));
    stars.push(c);}
  spawn();spawn();
  var KEYD={KeyW:{x:0,y:-1},KeyS:{x:0,y:1},KeyA:{x:-1,y:0},KeyD:{x:1,y:0},
    ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},
    KeyI:{x:0,y:-1},KeyK:{x:0,y:1},KeyJ:{x:-1,y:0},KeyL:{x:1,y:0},
    KeyT:{x:0,y:-1},KeyG:{x:0,y:1},KeyF:{x:-1,y:0},KeyH:{x:1,y:0}};
  function occ(x,y,skip){for(var i=0;i<snakes.length;i++){if(i===skip)continue;
    if(snakes[i].cells.some(function(c){return c.x===x&&c.y===y;}))return true;}return false;}
  function aiDir(s,si){
    var head=s.cells[0],best=null,bd=1e9;
    [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}].forEach(function(d){
      if(d.x===-s.dir.x&&d.y===-s.dir.y)return;
      var nx=head.x+d.x,ny=head.y+d.y;
      if(nx<0||ny<0||nx>=GW||ny>=GH)return;
      if(occ(nx,ny,si)||s.cells.some(function(c){return c.x===nx&&c.y===ny;}))return;
      stars.forEach(function(st){var dd=Math.abs(st.x-nx)+Math.abs(st.y-ny);if(dd<bd){bd=dd;best=d;}});
    });
    return best;
  }
  var acc=0,last=performance.now();
  function step(){
    snakes.forEach(function(s,i){
      if(!s.alive)return;
      if(s.p.isAI){var d=aiDir(s,i);if(d)s.ndir=d;}
      else{for(var k in KEYD){if(keys[k]&&KEYMAP[i]&&k){}} 
        // pick newest pressed key for this player
        var km=KEYMAP[i];
        [['up','KeyW','ArrowUp','KeyI','KeyT'],['down','KeyS','ArrowDown','KeyK','KeyG'],
         ['left','KeyA','ArrowLeft','KeyJ','KeyF'],['right','KeyD','ArrowRight','KeyL','KeyH']].forEach(function(row){
        });
        // direct scan
        var cand=Object.keys(KEYD).filter(function(code){
          var grp=code.startsWith('KeyW')||code.startsWith('KeyS')||code.startsWith('KeyA')||code.startsWith('KeyD')?0:
                  code.startsWith('Arrow')?1:code.startsWith('KeyI')||code.startsWith('KeyK')||code.startsWith('KeyJ')||code.startsWith('KeyL')?2:3;
          return grp===i&&keys[code];});
        if(cand.length){var d=KEYD[cand[cand.length-1]];
          if(!(d.x===-s.dir.x&&d.y===-s.dir.y))s.ndir=d;}
        var j=joy[i];if(j&&(Math.abs(j.dx)>0.4||Math.abs(j.dy)>0.4)){
          var jd=Math.abs(j.dx)>Math.abs(j.dy)?{x:j.dx>0?1:-1,y:0}:{x:0,y:j.dy>0?1:-1};
          if(!(jd.x===-s.dir.x&&jd.y===-s.dir.y))s.ndir=jd;}
      }
    });
    snakes.forEach(function(s){
      if(!s.alive)return;
      if(s.ndir){s.dir=s.ndir;s.ndir=null;}
      var h=s.cells[0],nh={x:h.x+s.dir.x,y:h.y+s.dir.y};
      if(nh.x<0||nh.y<0||nh.x>=GW||nh.y>=GH||occ(nh.x,nh.y,-1)||
         s.cells.slice(0,-1).some(function(c){return c.x===nh.x&&c.y===nh.y;})){s.alive=false;return;}
      s.cells.unshift(nh);
      var fi=stars.findIndex(function(st){return st.x===nh.x&&st.y===nh.y;});
      if(fi>=0){stars.splice(fi,1);spawn();s.grow+=2;}
      if(s.grow>0)s.grow--;else s.cells.pop();
    });
    var alive=snakes.filter(function(s){return s.alive;});
    if(alive.length<=1){
      var w=alive[0];
      end(w?{name:w.p.name,color:w.p.color,human:!w.p.isAI}:null);
    }
  }
  function draw(){
    lx.fillStyle='#10192E';lx.fillRect(0,0,600,425);
    lx.strokeStyle='#1B2740';lx.lineWidth=1;
    for(var x=0;x<=GW;x++){lx.beginPath();lx.moveTo(x*CS,0);lx.lineTo(x*CS,GH*CS);lx.stroke();}
    for(var y=0;y<=GH;y++){lx.beginPath();lx.moveTo(0,y*CS);lx.lineTo(GW*CS,y*CS);lx.stroke();}
    stars.forEach(function(st){
      lx.fillStyle='#fff';lx.beginPath();
      var cx=st.x*CS+CS/2,cy=st.y*CS+CS/2;
      for(var k=0;k<5;k++){var a=-Math.PI/2+k*2*Math.PI/5,a2=a+Math.PI/5;
        lx.lineTo(cx+Math.cos(a)*7,cy+Math.sin(a)*7);lx.lineTo(cx+Math.cos(a2)*3,cy+Math.sin(a2)*3);}
      lx.fill();
    });
    snakes.forEach(function(s){
      if(!s.alive)return;
      s.cells.forEach(function(c,i){
        lx.fillStyle=i===0?s.p.color:s.p.color+'CC';
        lx.fillRect(c.x*CS+1,c.y*CS+1,CS-2,CS-2);
      });
      var h=s.cells[0];
      lx.fillStyle='#fff';lx.fillRect(h.x*CS+7,h.y*CS+7,4,4);lx.fillRect(h.x*CS+14,h.y*CS+7,4,4);
    });
    lx.fillStyle='#94A3B8';lx.font='bold 13px Montserrat';lx.textAlign='left';
    var txt=snakes.map(function(s){return s.p.name+': '+(s.alive?'♥':'✖');}).join('   ');
    lx.fillText(txt,10,418);
  }
  loop(function(){
    var now=performance.now();
    if(now-acc>110){acc=now;step();}
    draw();
  });
  return function(){};
 }
};

/* ================================================================
   2) SPINNER WAR
================================================================ */
GAMES.spinner={
 title:'⚡ Spinner War',
 players:function(){return buildPlayers(true);},
 hint:function(m){return m===1?'You: WASD / drag — push the AI off the arena!':'P1 WASD · P2 Arrows · (P3 IJKL · P4 TFGH in 3-4P) — last spinner standing!';},
 init:function(cv,lx,PL,end){
  cv.width=480;cv.height=480;
  var CX=240,CY=240,R=200;
  var ps=PL.map(function(p,i){
    var a=i/PL.length*Math.PI*2+Math.PI/4;
    return{p:p,x:CX+Math.cos(a)*130,y:CY+Math.sin(a)*130,vx:0,vy:0,alive:true,ang:a,spin:0};});
  var flash=null;
  loop(function(){
    ps.forEach(function(s){
      if(!s.alive)return;
      var d={x:0,y:0};
      if(s.p.isAI){
        var t=ps.filter(function(o){return o.alive&&o!==s;})[0];
        if(t){var dx=t.x-s.x,dy=t.y-s.y,dd=Math.hypot(dx,dy)||1;
          var ox=(s.x-CX),oy=(s.y-CY),od=Math.hypot(ox,oy)||1;
          d.x=dx/dd*1.0-ox/od*0.55;d.y=dy/dd*1.0-oy/od*0.55;}
      }else{var k=kdir(s.p.i);d.x=k.x;d.y=k.y;}
      s.vx+=d.x*0.38;s.vy+=d.y*0.38;
      s.vx*=0.975;s.vy*=0.975;
      s.x+=s.vx;s.y+=s.vy;s.spin+=0.3;
      if(Math.hypot(s.x-CX,s.y-CY)>R+14){s.alive=false;}
    });
    for(var i=0;i<ps.length;i++)for(var j=i+1;j<ps.length;j++){
      var a=ps[i],b=ps[j];if(!a.alive||!b.alive)continue;
      var dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
      if(d<40){var nx=dx/d,ny=dy/d,ov=(40-d)/2;
        a.x-=nx*ov;a.y-=ny*ov;b.x+=nx*ov;b.y+=ny*ov;
        var t=a.vx;a.vx=a.vx*.4+b.vx*.9+nx*3.2;a.vy=a.vy*.4+b.vy*.9+ny*3.2;
        b.vx=t*.9+b.vx*.4-nx*3.2;b.vy=t*.9+b.vy*.4-ny*3.2;
        flash={x:(a.x+b.x)/2,y:(a.y+b.y)/2,t:10};}
    }
    var alive=ps.filter(function(s){return s.alive;});
    if(alive.length<=1)end(alive[0]?{name:alive[0].p.name,color:alive[0].p.color,human:!alive[0].p.isAI}:null);
    // draw
    lx.fillStyle='#050608';lx.fillRect(0,0,480,480);
    lx.beginPath();lx.arc(CX,CY,R,0,7);lx.fillStyle='#12141C';lx.fill();
    lx.lineWidth=5;lx.strokeStyle='#FFFFFF';lx.stroke();
    lx.beginPath();lx.arc(CX,CY,R-14,0,7);lx.strokeStyle='#9BE7FF44';lx.lineWidth=2;lx.stroke();
    ps.forEach(function(s){
      if(!s.alive)return;
      lx.save();lx.translate(s.x,s.y);lx.rotate(s.spin);
      lx.beginPath();
      for(var k=0;k<12;k++){var r2=k%2?9:20,aa=k/12*Math.PI*2;lx.lineTo(Math.cos(aa)*r2,Math.sin(aa)*r2);}
      lx.closePath();lx.fillStyle=s.p.color;lx.fill();lx.strokeStyle='rgba(0,0,0,.4)';lx.stroke();
      lx.beginPath();lx.arc(0,0,6,0,7);lx.fillStyle='#111';lx.fill();
      lx.restore();
    });
    if(flash&&flash.t>0){flash.t--;
      lx.fillStyle='#FF9F1C';lx.beginPath();
      for(var k=0;k<10;k++){var r2=k%2?6:18,aa=k/10*Math.PI*2;lx.lineTo(flash.x+Math.cos(aa)*r2,flash.y+Math.sin(aa)*r2);}
      lx.closePath();lx.fill();}
  });
  return function(){};
 }
};

/* ================================================================
   3) PAINT FIGHT
================================================================ */
GAMES.paint={
 title:'🎨 Paint Fight',
 players:function(){return buildPlayers(false);},
 hint:function(m){return m===1?'You: WASD / drag your roller — out-paint the AI before time runs out!':'P1 WASD · P2 Arrows · P3 IJKL · P4 TFGH — most canvas painted wins!';},
 init:function(cv,lx,PL,end){
  cv.width=600;cv.height=400;
  var CS=25,GW=24,GH=16;
  var grid=[];for(var i=0;i<GW*GH;i++)grid.push(-1);
  var corners=[[0,0],[GW-1,0],[0,GH-1],[GW-1,GH-1]];
  var ps=PL.map(function(p,i){
    var c=corners[i%4];grid[c[1]*GW+c[0]]=i;
    return{p:p,x:c[0],y:c[1],dx:0,dy:0,acc:0};});
  var time=35,acc2=0,acc=0;
  function count(i){var n=0;for(var k=0;k<grid.length;k++)if(grid[k]===i)n++;return n;}
  function aiMove(s){
    var best=null,bd=1e9;
    [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}].forEach(function(d){
      var nx=s.x+d.x,ny=s.y+d.y;
      if(nx<0||ny<0||nx>=GW||ny>=GH)return;
      var sc=(grid[ny*GW+nx]===-1?-6:0)+Math.random()*2;
      // prefer heading toward nearest unpainted
      if(grid[ny*GW+nx]===-1)sc-=2;
      if(sc<bd){bd=sc;best=d;}});
    return best;
  }
  function tickMove(){
    ps.forEach(function(s,i){
      if(s.p.isAI){var d=aiMove(s);if(d){s.dx=d.x;s.dy=d.y;}}
      else{var k=kdir(i);if(Math.abs(k.x)>Math.abs(k.y))s.dx=k.x>0.35?1:k.x<-0.35?-1:0,s.dy=0;
        else if(Math.abs(k.y)>0.35)s.dy=k.y>0?1:-1,s.dx=0;}
      var nx=clamp(s.x+s.dx,0,GW-1),ny=clamp(s.y+s.dy,0,GH-1);
      var blocked=ps.some(function(o){return o!==s&&o.x===nx&&o.y===ny;});
      if(!blocked){s.x=nx;s.y=ny;}
      grid[s.y*GW+s.x]=i;
    });
    var unpainted=grid.indexOf(-1)>=0;
    if(time<=0||!unpainted){
      var best=-1,bw=null,tie=true,prev=null;
      ps.forEach(function(s){var c=count(s.p.i);
        if(prev===null||c>best){best=c;bw=s;tie=false;}else if(c===best)tie=true;prev=c;});
      end(tie?null:{name:bw.p.name,color:bw.p.color,human:!bw.p.isAI});
    }
  }
  loop(function(){
    var now=performance.now();
    if(!over){
      if(now-acc>120){acc=now;tickMove();}
      if(now-acc2>1000){acc2=now;time--;if(time<=0)tickMove();}
    }
    lx.fillStyle='#F4F6F8';lx.fillRect(0,0,600,400);
    for(var y=0;y<GH;y++)for(var x=0;x<GW;x++){
      var v=grid[y*GW+x];
      if(v>=0){lx.fillStyle=PC[v];lx.fillRect(x*CS,y*CS,CS,CS);}
      lx.strokeStyle='#D3DAE3';lx.strokeRect(x*CS,y*CS,CS,CS);
    }
    ps.forEach(function(s){
      lx.save();lx.translate(s.x*CS+CS/2,s.y*CS+CS/2);
      lx.fillStyle=s.p.color;lx.fillRect(-14,-6,28,12);
      lx.fillStyle='#fff';lx.fillRect(-14,-6,28,4);
      lx.restore();
    });
    lx.fillStyle='#0A1128';lx.font='bold 14px Montserrat';lx.textAlign='left';
    lx.fillText('⏱ '+Math.max(0,time)+'s',10,18);
    lx.textAlign='right';
    ps.forEach(function(s,i){lx.fillStyle=PC[i];lx.fillText(s.p.name+': '+count(i),600-10-i*90,18);});
  });
  return function(){};
 }
};

/* ================================================================
   4) POOL
================================================================ */
GAMES.pool={
 title:'🎱 Pool',
 players:function(){return buildPlayers(true);},
 hint:function(m){return m===1?'Drag from the white ball to shoot — first to pot 3 balls beats the AI!':'P1 vs P2 — take turns, drag from the white ball. First to 3 pots wins!';},
 init:function(cv,lx,PL,end){
  cv.width=480;cv.height=620;
  var W=480,H=620,R=12;
  var pockets=[[26,26],[W-26,26],[26,H-26],[W-26,H-26],[W/2,26],[W/2,H-26]];
  var COLS=['#E74C3C','#F39C12','#F1C40F','#27AE60','#2F80ED','#8E44AD','#E91E63'];
  var turn=0,balls,potted,scores;
  function reset(){
    balls=[{x:W/2,y:H-160,vx:0,vy:0,c:'#fff'}];
    COLS.forEach(function(c,i){var row=i<4?0:1,col=i%4;
      balls.push({x:90+col*90+(row?45:0),y:170+row*66,vx:0,vy:0,c:c});});
    potted=[];scores=[0,0];turn=0;
  }
  reset();
  var aiming=null,shootCd=0,pending=false;
  function allStopped(){return balls.every(function(b){return Math.hypot(b.vx,b.vy)<0.05;});}
  function aiShot(){
    var cue=balls[0],targ=null,bd=1e9;
    balls.forEach(function(b){if(b.c!=='#fff'){var d=dist(cue,b);if(d<bd){bd=d;targ=b;}}});
    if(!targ){end(scores[0]>scores[1]?{name:PL[0].name,color:PL[0].color,human:true}:scores[1]>scores[0]?{name:PL[1].name,color:PL[1].color,human:!PL[1].isAI}:null);return;}
    var a=Math.atan2(targ.y-cue.y,targ.x-cue.x)+(Math.random()-0.5)*0.09;
    cue.vx=Math.cos(a)*9;cue.vy=Math.sin(a)*9;
  }
  function step(){
    var moving=false;
    balls.forEach(function(b){
      b.x+=b.vx;b.y+=b.vy;b.vx*=0.985;b.vy*=0.985;
      if(b.x<R||b.x>W-R){b.vx*=-1;b.x=clamp(b.x,R,W-R);}
      if(b.y<R||b.y>H-R){b.vy*=-1;b.y=clamp(b.y,R,H-R);}
      if(Math.hypot(b.vx,b.vy)>0.05)moving=true;else{b.vx=0;b.vy=0;}
    });
    for(var i=0;i<balls.length;i++)for(var j=i+1;j<balls.length;j++){
      var a=balls[i],b=balls[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||0.01;
      if(d<R*2){var nx=dx/d,ny=dy/d,ov=(R*2-d)/2;
        a.x-=nx*ov;a.y-=ny*ov;b.x+=nx*ov;b.y+=ny*ov;
        var p=(a.vx*nx+a.vy*ny)-(b.vx*nx+b.vy*ny);
        a.vx-=p*nx*0.9;a.vy-=p*ny*0.9;b.vx+=p*nx*0.9;b.vy+=p*ny*0.9;moving=true;}
    }
    for(var k=pockets.length-1;k>=0;k--)for(var i=balls.length-1;i>=0;i--){
      var b=balls[i];
      if(Math.hypot(b.x-pockets[k][0],b.y-pockets[k][1])<22){
        if(b.c==='#fff'){b.x=W/2;b.y=H-160;b.vx=0;b.vy=0;turn=1-turn;pending=false;}
        else{balls.splice(i,1);potted.push(b.c);scores[turn]++;pending=false;
          // respawn the potted ball so the game keeps flowing
          var ok=false,nx,ny;
          while(!ok){nx=90+Math.random()*300;ny=150+Math.random()*130;ok=true;
            for(var q=0;q<balls.length;q++)if(Math.hypot(balls[q].x-nx,balls[q].y-ny)<30)ok=false;}
          balls.push({x:nx,y:ny,vx:0,vy:0,c:b.c});
          if(scores[turn]>=3){
            var w2=scores[0]>=3?PL[0]:PL[1];
            end({name:w2.name,color:w2.color,human:!w2.isAI});return;}
        }
      }
    }
    if(!moving&&shootCd<=0){
      if(pending){pending=false;turn=1-turn;}
      else if(PLAYERS[turn].isAI){shootCd=45;aiShot();pending=true;}
    }
    if(shootCd>0)shootCd--;
  }
  loop(function(){
    if(!over)step();
    lx.fillStyle='#0E4D2E';lx.fillRect(0,0,W,H);
    lx.strokeStyle='#7B4A21';lx.lineWidth=12;lx.strokeRect(8,8,W-16,H-16);
    pockets.forEach(function(p){lx.beginPath();lx.arc(p[0],p[1],16,0,7);lx.fillStyle='#0A0A0A';lx.fill();});
    balls.forEach(function(b){
      lx.beginPath();lx.arc(b.x,b.y,R,0,7);lx.fillStyle=b.c;lx.fill();
      lx.beginPath();lx.arc(b.x-4,b.y-4,R/3,0,7);lx.fillStyle='#ffffff66';lx.fill();});
    if(aiming){lx.strokeStyle='#ffffffaa';lx.setLineDash([8,6]);lx.lineWidth=3;
      lx.beginPath();lx.moveTo(balls[0].x,balls[0].y);
      lx.lineTo(balls[0].x+(balls[0].x-aiming.x)*1.4,balls[0].y+(balls[0].y-aiming.y)*1.4);lx.stroke();lx.setLineDash([]);}
    lx.fillStyle='#fff';lx.font='bold 15px Montserrat';lx.textAlign='center';
    lx.fillText(PLAYERS[turn].name+"'s turn — P1 "+scores[0]+' : '+scores[1]+' P2',W/2,586);
  });
  // aiming input: drag anywhere = shoot direction from cue ball
  var drag=null;
  cv.onpointerdown=function(e){var p=evPos(e);if(!allStopped())return;
    if(PLAYERS[turn].isAI)return;drag={x:p.x,y:p.y};aiming={x:p.x,y:p.y};};
  cv.onpointermove=function(e){if(!drag)return;var p=evPos(e);aiming={x:p.x,y:p.y};};
  cv.onpointerup=function(){if(!drag)return;
    var dx=balls[0].x-aiming.x,dy=balls[0].y-aiming.y,d=Math.hypot(dx,dy);
    if(d>15){var f=Math.min(d,200)/d;balls[0].vx=dx*f*0.14;balls[0].vy=dy*f*0.14;pending=true;}
    drag=null;aiming=null;};
  function evPos(e){var r=cv.getBoundingClientRect();return{x:(e.clientX-r.left)*(cv.width/r.width),y:(e.clientY-r.top)*(cv.height/r.height)};}
  return function(){cv.onpointerdown=null;cv.onpointermove=null;cv.onpointerup=null;};
 }
};

/* ================================================================
   5) RACING CARS
================================================================ */
GAMES.racing={
 title:'🏁 Racing Cars',
 players:function(){return buildPlayers(true);},
 hint:function(m){return m===1?'You: A/D steer, W gas · S brake — beat the AI over 2 laps!':'P1: WASD · P2: Arrows — first to finish 2 laps wins!';},
 init:function(cv,lx,PL,end){
  cv.width=480;cv.height=480;
  var CX=240,CY=240,LAPS=2;
  var WPS=[];for(var i=0;i<16;i++){var a=i/16*Math.PI*2;WPS.push({x:CX+Math.cos(a)*150,y:CY+Math.sin(a)*150});}
  var cars=PL.map(function(p,i){
    return{p:p,x:WPS[14].x+(i?26:0),y:WPS[14].y,ang:-Math.PI/2,spd:0,wp:15,lap:0,done:false,time:0};});
  function step(){
    cars.forEach(function(c){
      if(c.done)return;
      c.time++;
      var k=c.p.isAI?null:kdir(c.p.i);
      var steer=0,gas=0;
      if(c.p.isAI){
        var t=WPS[c.wp];
        var want=Math.atan2(t.y-c.y,t.x-c.x);
        c.ang=angLerp(c.ang,want,0.08);
        gas=1;
      }else{
        if(k.left)steer=-1;if(k.right)steer=1;
        if(k.up)gas=1;if(k.down)gas=-0.6;
        c.ang+=steer*0.055*(0.4+c.spd/6);
      }
      c.spd=clamp(c.spd+gas*0.09-(gas===0?0.008:0),0,6);
      var nx=c.x+Math.cos(c.ang)*c.spd,ny=c.y+Math.sin(c.ang)*c.spd;
      var dc=Math.hypot(nx-CX,ny-CY);
      if(dc<98||dc>202){c.spd*=0.86;} // off track (grass)
      c.x=clamp(nx+ (dc<98||dc>202?0:0),5,475);c.y=clamp(ny,5,475);
      // waypoint progress
      var t=WPS[c.wp];
      if(Math.hypot(c.x-t.x,c.y-t.y)<46){c.wp=(c.wp+1)%16;if(c.wp===0){c.lap++;
        if(c.lap>=LAPS){c.done=true;
          end({name:c.p.name,color:c.p.color,human:!c.p.isAI});return;}}}
    });
    // car-car soft collision
    if(cars.length===2){var a=cars[0],b=cars[1];
      var d=dist(a,b);if(d<26&&d>0){var push=(26-d)/2,ax=(b.x-a.x)/d,ay=(b.y-a.y)/d;
        a.x-=ax*push;a.y-=ay*push;b.x+=ax*push;b.y+=ay*push;}}
  }
  loop(function(){
    if(!over)step();
    lx.fillStyle='#3E7D3E';lx.fillRect(0,0,480,480);
    lx.beginPath();lx.arc(CX,CY,150,0,7);lx.lineWidth=104;lx.strokeStyle='#6B7076';lx.stroke();
    lx.beginPath();lx.arc(CX,CY,150,0,7);lx.lineWidth=96;lx.strokeStyle='#575C62';lx.stroke();
    lx.beginPath();lx.arc(CX,CY,98,0,7);lx.lineWidth=3;lx.strokeStyle='#ffffff55';lx.stroke();
    lx.beginPath();lx.arc(CX,CY,202,0,7);lx.lineWidth=3;lx.strokeStyle='#ffffff55';lx.stroke();
    // start line
    lx.save();lx.translate(WPS[0].x,WPS[0].y);lx.rotate(0);
    for(var s=0;s<5;s++){lx.fillStyle=s%2?'#fff':'#111';lx.fillRect(-4,-26+s*10,8,10);}
    lx.restore();
    cars.forEach(function(c){
      lx.save();lx.translate(c.x,c.y);lx.rotate(c.ang);
      lx.fillStyle=c.p.color;
      lx.fillRect(-14,-9,28,18);
      lx.fillStyle='#0A1128';lx.fillRect(-17,-11,5,6);lx.fillRect(-17,5,5,6);
      lx.fillRect(13,-11,5,6);lx.fillRect(13,5,5,6);
      lx.fillStyle='#BDE3FF';lx.fillRect(-2,-5,8,10);
      lx.restore();
      // progress tick
      lx.fillStyle=c.p.color;lx.font='bold 13px Montserrat';lx.textAlign='left';
      lx.fillText(c.p.name+'  Lap '+Math.min(c.lap+1,LAPS)+'/'+LAPS,10,470-c.p.i*18);
    });
  });
  return function(){};
 }
};

/* ================================================================
   6) TANK BATTLE
================================================================ */
GAMES.tank={
 title:'💥 Tank Battle',
 players:function(){return buildPlayers(true);},
 hint:function(m){return m===1?'You: WASD move, Space shoot — destroy the AI tank!':'P1: WASD + Space · P2: Arrows + Enter — last tank standing wins!';},
 init:function(cv,lx,PL,end){
  cv.width=560;cv.height=420;
  var CS=28,GW=20,GH=15;
  var walls=[];
  for(var i=0;i<GW*GH;i++)walls.push(false);
  for(var n=0;n<26;n++){var x=2+Math.random()*(GW-4)|0,y=1+Math.random()*(GH-3)|0;
    if(Math.abs(y*CS+14-210)<40&&Math.abs(x*CS+14-70)<50)continue;
    if(Math.abs(y*CS+14-210)<40&&Math.abs(x*CS+14-490)<50)continue;
    walls[y*GW+x]=true;}
  function solid(px,py){var gx=px/CS|0,gy=py/CS|0;
    if(gx<0||gy<0||gx>=GW||gy>=GH)return true;return walls[gy*GW+gx];}
  var tanks=PL.map(function(p,i){
    return{p:p,x:i?490:70,y:210,ang:i?Math.PI:0,cd:0,alive:true};});
  var bullets=[];
  function fire(t){if(t.cd>0)return;t.cd=28;
    bullets.push({x:t.x+Math.cos(t.ang)*24,y:t.y+Math.sin(t.ang)*24,vx:Math.cos(t.ang)*6.5,vy:Math.sin(t.ang)*6.5,own:t});}
  function step(){
    tanks.forEach(function(t){
      if(!t.alive)return;
      t.cd--;
      if(t.p.isAI){
        var e=tanks.find(function(o){return o!==t&&o.alive;});
        if(e){var want=Math.atan2(e.y-t.y,e.x-t.x);
          var diff=((want-t.ang+Math.PI*3)%(Math.PI*2))-Math.PI;
          t.ang+=clamp(diff,-0.05,0.05);
          if(Math.abs(diff)<0.13)fire(t);
          var fx=t.x+Math.cos(t.ang)*30,fy=t.y+Math.sin(t.ang)*30;
          if(!solid(fx,fy)){t.x+=Math.cos(t.ang)*0.9;t.y+=Math.sin(t.ang)*0.9;}
          else t.ang+=(Math.random()<0.5?0.06:-0.06);
        }
      }else{
        var k=kdir(t.p.i);
        if(k.x||k.y){
          var want=Math.atan2(k.y,k.x);
          var diff=((want-t.ang+Math.PI*3)%(Math.PI*2))-Math.PI;
          t.ang+=clamp(diff,-0.09,0.09);
          var fx=t.x+Math.cos(t.ang)*2.2,fy=t.y+Math.sin(t.ang)*2.2;
          if(!solid(fx+Math.cos(t.ang)*12,fy+Math.sin(t.ang)*12)){t.x=fx;t.y=fy;}
        }
        if(ktap(t.p.i))fire(t);
      }
    });
    bullets.forEach(function(b){
      b.x+=b.vx;b.y+=b.vy;
      if(solid(b.x,b.y)){var gx=b.x/CS|0,gy=b.y/CS|0;walls[gy*GW+gx]=false;b.dead=true;}
      tanks.forEach(function(t){if(t.alive&&t!==b.own&&Math.hypot(t.x-b.x,t.y-b.y)<16){t.alive=false;b.dead=true;}});
      if(b.x<0||b.y<0||b.x>560||b.y>420)b.dead=true;
    });
    bullets=bullets.filter(function(b){return!b.dead;});
    var alive=tanks.filter(function(t){return t.alive;});
    if(alive.length<=1)end(alive[0]?{name:alive[0].p.name,color:alive[0].p.color,human:!alive[0].p.isAI}:null);
  }
  loop(function(){
    if(!over)step();
    lx.fillStyle='#E8DCC0';lx.fillRect(0,0,560,420);
    for(var y=0;y<GH;y++)for(var x=0;x<GW;x++)if(walls[y*GW+x]){
      lx.fillStyle='#3E5E3E';lx.fillRect(x*CS+1,y*CS+1,CS-2,CS-2);
      lx.fillStyle='#4C734C';lx.fillRect(x*CS+1,y*CS+1,CS-2,5);}
    tanks.forEach(function(t){
      if(!t.alive){lx.fillStyle='#7a6a52';lx.font='24px sans-serif';lx.fillText('💥',t.x-12,t.y+8);return;}
      lx.save();lx.translate(t.x,t.y);lx.rotate(t.ang);
      lx.fillStyle='#3E3E3E';lx.fillRect(-16,-10,32,20);
      lx.fillStyle=t.p.color;lx.fillRect(-11,-7,22,14);
      lx.fillStyle='#5B3A1A';lx.fillRect(8,-3,22,6);
      lx.restore();});
    bullets.forEach(function(b){
      lx.beginPath();lx.arc(b.x,b.y,4.5,0,7);lx.fillStyle='#F2C94C';lx.fill();});
  });
  return function(){};
 }
};

/* ================================================================
   7) ARCHERY
================================================================ */
GAMES.archery={
 title:'🏹 Archery',
 players:function(){return buildPlayers(true);},
 hint:function(m){return m===1?'Angle swings by itself — hold Space to charge power, release to fire. 5 shots, beat the AI!':'P1: Space · P2: Enter — angle swings, hold to charge, release to fire. Best of 5 shots!';},
 init:function(cv,lx,PL,end){
  cv.width=520;cv.height=460;
  var TX=390,TY=230,R=[105,82,60,38,18];
  var RC=['#fff','#1A1A1A','#2F80ED','#FF4A4A','#F2C94C'];
  var SHOTS=5;
  var ps=PL.map(function(p){return{p:p,scores:[],shot:0,ang:Math.PI/2,dir:1,power:0,charging:false,fly:null};});
  var cur=0,wind=(Math.random()*8-4),msg='';
  function rings(){return R;}
  function shoot(s){
    var vx=Math.cos(s.ang)*s.power*0.16,vy=-Math.abs(Math.sin(s.ang))*s.power*0.16+2.2;
    s.fly={x:60,y:420,vx:vx,vy:vy};s.charging=false;
  }
  function land(s){
    // target plane at ground level: distance from TX,TY
    var d=Math.hypot(s.fly.x-TX,s.fly.y-TY);
    var sc=d<R[4]?10:d<R[3]?8:d<R[2]?6:d<R[1]?4:d<R[0]?2:0;
    s.scores.push(sc);
    s.fly=null;s.shot++;
    wind=(Math.random()*8-4);s.ang=Math.PI/2;s.dir=Math.random()<0.5?1:-1;s.power=0;
    // next player or finish
    var allDone=ps.every(function(q){return q.shot>=SHOTS;});
    if(allDone){
      var best=-1,bw=null,tie=true,prev=null;
      ps.forEach(function(q){var t=q.scores.reduce(function(a,b){return a+b;},0);
        if(prev===null||t>best){best=t;bw=q;tie=false;}else if(t===best)tie=true;prev=t;});
      end(tie?null:{name:bw.p.name,color:bw.p.color,human:!bw.p.isAI});
    }else cur=(cur+1)%ps.length;
  }
  function aiTurn(s){
    s.power=28+Math.random()*22;
    var target=[10,10,8,8,6,6,4][1+Math.random()*5|0];
    var acc=Math.random()<0.35?target:target-Math.random()*6;
    s.scores.push(Math.max(0,Math.round(acc)));
    s.shot++;wind=(Math.random()*8-4);
    msg='AI shot: '+(s.scores[s.scores.length-1])+' pts';
    var allDone=ps.every(function(q){return q.shot>=SHOTS;});
    if(allDone){
      var best=-1,bw=null,tie=true,prev=null;
      ps.forEach(function(q){var t=q.scores.reduce(function(a,b){return a+b;},0);
        if(prev===null||t>best){best=t;bw=q;tie=false;}else if(t===best)tie=true;prev=t;});
      end(tie?null:{name:bw.p.name,color:bw.p.color,human:!bw.p.isAI});
    }else cur=(cur+1)%ps.length;
  }
  loop(function(){
    var s=ps[cur];
    if(s&&!s.p.isAI&&!s.fly&&s.shot<SHOTS){
      if(!s.charging&&!s.locked){s.ang+=0.028*s.dir;if(s.ang>2.5||s.ang<0.65)s.dir*=-1;}
      if(ktap(cur)||joy[cur]&&joy[cur].tap){joy[cur]&&(joy[cur].tap=false);s.charging=true;s.power=0;}
      if(s.charging){s.power+=0.9;if(s.power>=42){shoot(s);}}
    }
    if(s&&s.p.isAI&&!s.fly&&s.shot<SHOTS){aiTurn(s);}
    ps.forEach(function(q){if(q.fly){q.fly.x+=q.fly.vx;q.fly.y+=q.fly.vy;q.fly.vy+=0.09;q.fly.vx+=wind*0.004;
      if((q.fly.vy>0&&q.fly.y>=TY-2)||q.fly.x>520||q.fly.x<-20)land(q);}});
    // draw
    lx.fillStyle='#5DA9E9';lx.fillRect(0,0,520,460);
    lx.fillStyle='#3E7D5B';lx.fillRect(0,400,520,60);
    // target
    for(var i=4;i>=0;i--){lx.beginPath();lx.arc(TX,TY,R[i],0,7);lx.fillStyle=RC[i];lx.fill();}
    // arrow indicator
    if(s&&!s.fly&&s.shot<SHOTS&&!s.p.isAI){
      lx.save();lx.translate(60,420);lx.rotate(-s.ang);
      lx.fillStyle='#8D5A2B';lx.fillRect(0,-2,60,4);
      lx.fillStyle='#27AE60';lx.beginPath();lx.moveTo(0,0);lx.lineTo(-14,-7);lx.lineTo(-14,7);lx.fill();
      lx.restore();
      if(s.charging){lx.fillStyle='#F2C94C';lx.fillRect(30,440,s.power*4,10);}
    }
    if(s&&s.fly){lx.fillStyle='#8D5A2B';lx.beginPath();lx.arc(s.fly.x,s.fly.y,4,0,7);lx.fill();}
    // wind + scores
    lx.fillStyle='#fff';lx.font='bold 15px Montserrat';lx.textAlign='left';
    lx.fillText('💨 Wind: '+(wind>0?'→ ':'← ')+Math.abs(wind).toFixed(1),14,26);
    ps.forEach(function(q,i){
      lx.fillStyle=q.p.color;
      lx.fillText(q.p.name+': '+q.scores.join(' ')+'  = '+q.scores.reduce(function(a,b){return a+b;},0)+' pts',14,50+i*20);});
    lx.fillStyle='#F2C94C';lx.textAlign='right';lx.fillText(msg||('Turn: '+s.p.name),506,26);
  });
  return function(){};
 }
};

/* settings cog → small panel */
var cog=document.getElementById('cog');
var panel=document.createElement('div');
panel.style.cssText='position:absolute;top:56px;left:16px;z-index:70;background:#1E293B;border-radius:12px;padding:12px;display:none;box-shadow:0 8px 20px #000a;';
panel.innerHTML='<button id="resetTrophies" style="background:#FF4A4A;color:#fff;border:0;border-radius:14px;padding:8px 14px;font-family:Montserrat;font-weight:700;cursor:pointer;">Reset trophies</button>';
device.appendChild(panel);
cog.addEventListener('click',function(){panel.style.display=panel.style.display==='none'?'block':'none';});
panel.addEventListener('click',function(e){
  if(e.target.id==='resetTrophies'){setWins(0);panel.style.display='none';}
});
})();

