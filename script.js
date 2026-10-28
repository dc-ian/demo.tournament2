// HeyHoney Tournaments: up to 5 at once. Team brackets (1v1 to 16v16) or free for all.
const KEY="hh9",OLD=["hh8","cott7"],MAX=5,API="/api/data",app=document.getElementById("app");
const v=id=>document.getElementById(id).value;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sh=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
// TikTok: a pasted profile/video link or @handle becomes "@username"; players named like that get their TikTok photo.
const TT=/^(?:https?:\/\/)?(?:www\.|m\.)?(?:tiktok\.com\/)?@([\w.]{1,24})(?:[\/?#].*)?$/i;
const tt=s=>{const m=TT.exec(String(s).trim());return m?"@"+m[1]:s};
const ttUser=n=>/^@[\w.]{1,24}$/.test(n)?n.slice(1):"";
const pic=n=>ttUser(n)?`<img class="pfp" src="/api/avatar?u=${encodeURIComponent(ttUser(n))}" alt="" loading="lazy" referrerpolicy="no-referrer">`:"";
const dn=n=>String(n).replace(/^@/,""); // names are stored with their @ (needed for the TikTok photo and link) but shown without it
// A TikTok player's name as a tappable link to their profile (plain text for everyone else)
const plink=n=>ttUser(n)?`<a href="https://www.tiktok.com/@${esc(ttUser(n))}" target="_blank" rel="noopener noreferrer">${esc(dn(n))}</a>`:esc(dn(n));
const ini=s=>esc(([...dn(String(s).trim())][0]||"?").toUpperCase()); // emoji-safe initial
const okNum=x=>x!==""&&x!=null&&Number.isFinite(+x)&&+x>=0&&+x<=99999;
const str=(s,n)=>typeof s==="string"?s.slice(0,n):"";
const uid=()=>Math.random().toString(36).slice(2,8);

// ---------- State ----------
// S.T = tournaments. Team: {id,name,type:"team",size,teams:[{n,m:[]}],pairs,sc}. FFA: {id,name,type:"ffa",pl,rn,pts,done}
// Validate everything read from storage or an import file. Corrupt or hostile data can't crash or inject.
function clean(raw){
  const o={T:[]};
  if(!raw||typeof raw!=="object")return o;
  (Array.isArray(raw.T)?raw.T:[]).slice(0,MAX).forEach(x=>{
    if(!x||typeof x!=="object"||!/^\w{1,16}$/.test(x.id)||o.T.some(y=>y.id===String(x.id)))return;
    const t={id:String(x.id),name:str(x.name,60)||"Untitled"};
    if(x.type==="ffa"){
      const pl=(Array.isArray(x.pl)?x.pl:[]).map(p=>str(p,40).trim()).filter(Boolean).slice(0,64);
      if(pl.length<2)return;
      t.type="ffa";t.pl=pl;t.rn=Math.min(10,Math.max(1,Math.floor(+x.rn)||1));t.done=!!x.done;t.pts={};
      pl.forEach((_,i)=>{const r=x.pts&&x.pts[i];t.pts[i]=Array.isArray(r)?r.slice(0,t.rn).map(p=>okNum(p)?+p:null):[]})
    }else{
      const teams=(Array.isArray(x.teams)?x.teams:[]).slice(0,32).map(m=>({n:str(m&&m.n,40).trim(),m:(Array.isArray(m&&m.m)?m.m:[]).map(s=>str(s,40).trim()).filter(Boolean),o:m&&m.o===1?1:0}));
      if(teams.length<2||teams.some(m=>!m.n))return;
      t.type="team";t.size=Math.min(16,Math.max(1,Math.floor(+x.size)||1));t.teams=teams;if(Array.isArray(x.og)&&x.og.length===2){const g=x.og.map(y=>str(y,40).trim());if(g.every(Boolean))t.og=g}
      const R=32-Math.clz32(teams.length-1),p=1<<R;
      const good=Array.isArray(x.pairs)&&x.pairs.length===p/2&&x.pairs.every(q=>Array.isArray(q)&&q.length===2&&q.every(i=>i===null||Number.isInteger(i)&&i>=0&&i<teams.length))
        &&Array.isArray(x.sc)&&x.sc.length===R&&x.sc.every((rd,r)=>Array.isArray(rd)&&rd.length===p>>(r+1)&&rd.every(s=>s===null||Array.isArray(s)&&s.length===2&&okNum(s[0])&&okNum(s[1])&&+s[0]!==+s[1]));
      if(good){t.pairs=x.pairs;t.sc=x.sc.map(rd=>rd.map(s=>s&&[+s[0],+s[1]]))}else draw(t)
    }
    t.mt={};Object.entries(x.mt||{}).forEach(([k,s])=>{if(/^\d+_\d+$/.test(k)&&/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s))t.mt[k]=s});
    t.live={};Object.entries(x.live||{}).forEach(([k,s])=>{if(/^\d+_\d+$/.test(k)&&s===true)t.live[k]=true});
    t.rt={};if(t.sc)Object.entries(x.rt||{}).forEach(([k,s])=>{if(/^\d+$/.test(k)&&+k<t.sc.length&&typeof s==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s))t.rt[k]=s.slice(0,16)});
    o.T.push(t)});
  return o}
// Tournaments live in a shared database behind /api/data (Upstash Redis), so every device sees the same data.
// localStorage only keeps a copy of the last data loaded, so the page can paint instantly.
let S={T:[]},rev=0,need=false,ready=false,offline=false,busy=false,dirty=false,reload=false,tok="";
const cache=()=>{try{localStorage.setItem(KEY,JSON.stringify({T:S.T,rev}))}catch(e){}};
try{const r=JSON.parse(localStorage.getItem(KEY)||"null");if(r){S=clean(r);rev=+r.rev||0}}catch(e){}
// Tournaments saved by older versions of this app in this browser. Moved to the shared database at the first admin login if it is still empty.
let legacy=[];try{for(const k of OLD){const r=localStorage.getItem(k);if(r){legacy=clean(JSON.parse(r)).T;if(legacy.length)break}}}catch(e){}
const SESSION_MS=8*36e5;let nav=false;
let authed=false;try{tok=sessionStorage.getItem("hhTok")||"";authed=!!tok&&+sessionStorage.getItem("hhAuth")>Date.now()}catch(e){}
let err="",note="",showForm=false;
async function api(body){
  const h={};if(body)h["Content-Type"]="application/json";if(tok)h.Authorization="Bearer "+tok;
  const r=await fetch(API,{method:body?"POST":"GET",headers:h,body:body?JSON.stringify(body):undefined,cache:"no-store"});
  let d={};try{d=await r.json()}catch(e){}
  return{ok:r.ok,status:r.status,d}}
// Fetch the latest tournaments. Skipped while an admin change is still being saved, so it can't be overwritten.
async function load(){
  if(dirty&&!busy&&authed)flush();
  const was=[ready,need,offline,rev].join();
  try{const r=await api();if(!r.ok||!Array.isArray(r.d.T))throw 0;
    ready=true;offline=false;need=!!r.d.need;
    if(!busy&&!dirty&&r.d.rev!==rev){S=clean({T:r.d.T});rev=r.d.rev;cache()}}
  catch(e){offline=true}
  if([ready,need,offline,rev].join()!==was){const a=document.activeElement;if(!(authed&&a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)))render(true)}}
// save() is called after every admin change: the screen updates at once, the server write follows in the background.
function save(){cache();dirty=true;flush()}
async function flush(){
  if(busy)return;busy=true;let show=false;
  try{while(dirty){dirty=false;
    const r=await api({action:"save",T:S.T,rev});
    if(r.ok){rev=r.d.rev;cache();if(err.startsWith("Could not save")){err="";show=true}}
    else if(r.status===401){dropAuth();err="Your admin session ended, so the last change was not saved. Log in again.";reload=show=true;break}
    else if(r.status===409){S=clean({T:r.d.T});rev=r.d.rev;cache();err="Another device saved changes first, so your last change was not saved. The latest version is shown.";show=true;break}
    else throw 0}}
  catch(e){dirty=true;err="Could not save to the server. Your last change is not saved yet. It retries automatically.";show=true}
  busy=false;if(show)render(true);if(reload){reload=false;rev=-1;load()}}
function dropAuth(){authed=false;showForm=false;tok="";try{sessionStorage.removeItem("hhTok");sessionStorage.removeItem("hhAuth")}catch(e){}}
const get=id=>S.T.find(t=>t.id===id);

// ---------- Bracket logic (team formats) ----------
// Teams are padded to a power of two with byes, which advance automatically.
const seedOrder=p=>{let o=[0];while(o.length<p){const n=o.length*2;o=o.flatMap(x=>[x,n-1-x])}return o};
function draw(t,list){const n=t.teams.length,R=32-Math.clz32(n-1),p=1<<R,o=(list?x=>x:sh)(t.teams.map((_,i)=>i));
  while(o.length<p)o.push(null);
  const s=seedOrder(p); // standard seeding: byes go to top seeds and never stack up in one match
  t.pairs=Array.from({length:p/2},(_,i)=>[o[s[2*i]],o[s[2*i+1]]]);
  t.sc=Array.from({length:R},(_,r)=>Array(p>>(r+1)).fill(null));t.mt={};t.live={}}
const ent=(t,r,i)=>r?[win(t,r-1,2*i),win(t,r-1,2*i+1)]:t.pairs[i];
function win(t,r,i){const[a,b]=ent(t,r,i);
  if(!r){if(a!=null&&b==null)return a;if(b!=null&&a==null)return b}
  const s=t.sc[r][i];return s&&s[0]!==s[1]?(s[0]>s[1]?a:b):null}
function clear(t,r,i){if(r+1<t.sc.length){const j=i>>1;if(t.sc[r+1][j]){t.sc[r+1][j]=null;clear(t,r+1,j)}}}
const champ=t=>win(t,t.sc.length-1,0);

// ---------- Free for all ----------
const tot=(t,i)=>(t.pts[i]||[]).reduce((a,x)=>a+(x||0),0);
function board(t){const L=t.pl.map((n,i)=>({i,n,s:tot(t,i)})).sort((a,b)=>b.s-a.s||a.i-b.i);
  L.forEach((x,k)=>{x.rank=k&&L[k-1].s===x.s?L[k-1].rank:k+1});return L}
function readFfa(t){t.pl.forEach((_,i)=>{t.pts[i]=Array.from({length:t.rn},(_,r)=>{
  const x=document.getElementById("f"+i+"_"+r);if(!x)return(t.pts[i]||[])[r]??null;
  return okNum(x.value)?+x.value:null})})}

// ---------- Shared status ----------
const fin=t=>t.type==="ffa"?!!t.done:champ(t)!=null;
function prog(t){let d=0;
  if(t.type==="ffa"){for(let r=0;r<t.rn;r++)if(t.pl.every((_,i)=>(t.pts[i]||[])[r]!=null))d++;return[d,t.rn]}
  t.sc.forEach(x=>x.forEach(s=>{if(s)d++}));return[d,t.teams.length-1]}
const fmtOf=t=>t.type==="ffa"?"Free for all · "+t.pl.length+" players":t.og?esc(t.og[0])+" vs "+esc(t.og[1])+" · "+t.teams.length+" players":t.size+"v"+t.size+" · "+t.teams.length+(t.size===1?" players":" teams");
const pill=t=>fin(t)?'<span class="pill gold">Finished</span>':'<span class="pill in">In progress</span>';

// ---------- Views ----------
const LOAD='<div class="card"><p>Loading tournaments…</p></div>';
const topbar=()=>`<header class="top"><div class="brand"><img src="logo-256.png" alt=""><span>HeyHoney Tournaments</span></div><nav class="seg" aria-label="Main"><a href="#/" class="${location.hash==="#/admin"?"":"on"}" ${location.hash==="#/admin"?"":'aria-current="page"'}>Dashboard</a><a href="#/admin" class="${location.hash==="#/admin"?"on":""}" ${location.hash==="#/admin"?'aria-current="page"':""}>Admin</a>${authed?'<button onclick="logout()">Log out</button>':""}</nav></header>`;

const login=()=>{if(!ready)return`<div class="card login"><p>${offline?"Can’t reach the server. Check your connection and reload.":"Loading…"}</p></div>`;const su=need;
  return`<form class="card login" onsubmit="doLogin();return false"><h2 class="flush">${su?"Create admin passcode":"Admin login"}</h2>${su?'<p class="meta">First time here. Choose a passcode of at least 8 characters.</p>':""}<label for="pw">Passcode</label><input id="pw" type="password" autocomplete="${su?"new-password":"current-password"}"><div class="err" id="le" role="alert"></div><p class="acts"><button class="gold" type="submit">${su?"Save and log in":"Log in"}</button></p></form>`};

function card(t){const[d,n]=prog(t);let lead;
  if(t.type==="ffa"){const b=board(t)[0];lead=b&&b.s>0?"Leading: "+esc(dn(b.n))+" ("+b.s+" pts)":"No scores yet"}
  else{const c=champ(t);lead=c!=null?"Champion: "+esc(dn(t.teams[c].n)):d+" of "+n+" matches played"}
  return`<a class="tile" href="#/t/${t.id}"><div class="tile-top"><h2 class="tile-name">${esc(t.name)}</h2>${pill(t)}</div><p class="tile-meta">${fmtOf(t)}</p><div class="tile-prev" aria-hidden="true">${t.type==="ffa"?'<ol class="tile-ffa">'+board(t).slice(0,3).map(x=>`<li>${pic(x.n)}<b>${esc(dn(x.n))}</b><span>${x.s}</span></li>`).join("")+"</ol>":miniBracket(t)}</div><p class="tile-lead">${lead}</p></a>`}
// Read-only bracket preview for the dashboard tiles: same drawing as the full view, minus interactivity and the forced min-width
const miniBracket=t=>{const keep=trc;trc=null;const svg=bracketSvg(t,"view");trc=keep;return svg.replace(/\s*tabindex="0"\s*role="button"\s*onclick="[^"]*"\s*onkeydown="[^"]*"/g,"").replace(/ data-mw="\d+"/,"").replace(/ id="sl\d+_\d+"/g,"")}

let ntype="player";
const teamRows=()=>`<div class="g2"><div class="tsa"><label for="cn0">Team 1 name</label><input id="cn0" maxlength="40" placeholder="Team name"><label for="cm0">Players or TikTok links</label><textarea id="cm0" rows="8" placeholder="One player per line: name or TikTok link"></textarea></div><div class="tsb"><label for="cn1">Team 2 name</label><input id="cn1" maxlength="40" placeholder="Team name"><label for="cm1">Players or TikTok links</label><textarea id="cm1" rows="8" placeholder="One player per line: name or TikTok link"></textarea></div></div>`;
const createForm=()=>{const tm=ntype==="team",ff=ntype==="ffa",o=(x,l)=>`<option value="${x}" ${ntype===x?"selected":""}>${l}</option>`;
  return`<div class="card"><h2 style="margin-top:0">New tournament</h2><div class="g2"><div><label for="nn">Name</label><input id="nn" maxlength="60"></div><div><label for="nt">Match type</label><select id="nt" onchange="ntype=this.value;render(true)">${o("player","Player vs Player")}${o("team","Team vs Team")}${o("ffa","Free for all")}</select></div></div>`
    +`${tm?teamRows():`<label for="nl">Players or TikTok links, one per line</label><textarea id="nl" rows="8" placeholder="One player per line: name or TikTok link"></textarea>`}<div class="meta">${ff?"Free for all takes 2 to 64 players.":tm?"Row 1 of Team 1 plays row 1 of Team 2, and so on. Up to 32 players in total.":"Brackets take 2 to 32 players; odd counts get byes."}</div>`
  +(ff?`<div class="g2"><div><label for="nr">Rounds</label><input id="nr" type="number" min="1" max="10" value="3"></div></div>`:`<div class="g2"><div><label for="nsd">Seeding</label><select id="nsd">${tm?`<option value="pairs">Row vs row, as typed</option>`:""}<option value="rand">Random draw</option>${tm?"":`<option value="list">Entry order (first = top seed)</option>`}</select></div></div>`)
  +`<div class="err" id="fe"></div><p class="acts end"><button onclick="showForm=false;render()">Cancel</button><button class="gold" onclick="createT()">Create tournament</button></p></div>`};

function dash(){const n=S.T.length;
  return`<section class="hero"><div><h1>Tournaments</h1><p class="sub">${n} of ${MAX} tournaments on the board${authed&&n>=MAX?". Delete one to make room.":""}</p></div>${authed?`<button class="pri" ${n>=MAX?"disabled":""} onclick="showForm=!showForm;render()">New tournament</button>`:""}</section>`
  +(authed&&showForm?createForm():"")
  +(n?`<div class="tiles">${S.T.map(card).join("")}${authed?Array.from({length:MAX-n},()=>'<button class="tile tile-empty" onclick="showForm=true;render()">+ Open slot</button>').join(""):""}</div>`:`<div class="card"><p>No tournaments yet. ${authed?"Choose New tournament to start one.":"Check back soon."}</p></div>`)}

// ---------- Tournament page: Bracket / Matches tabs ----------
let tv=matchMedia("(max-width:700px)").matches?"matches":"bracket",mview=0;
const viewTabs=()=>`<div class="tabs vt">${[["bracket","Bracket view"],["matches","Matches"]].map(([k,l])=>`<button class="${tv===k?"on":""}" onclick="tv='${k}';render()">${l}</button>`).join("")}</div>`;
// Big round photo for a match card (TikTok photo, or the initial if there is none or it fails to load)
const mpic=n=>{const i=ini(n);return ttUser(n)?pic(n).replace('class="pfp"',`class="pfp mcimg" data-i="${i}"`):`<span class="mca">${i}</span>`};
// Team vs Team scoreboard: match wins, points and players still in for each side
function scoreboard(t){
  if(!t.og)return"";
  const w=[0,0],p=[0,0],tot=[0,0],left=[0,0];
  t.teams.forEach((x,i)=>{tot[x.o]++;if(!isOut(t,i))left[x.o]++});
  matches(t).forEach(m=>{const s=t.sc[m.r][m.i];if(!s)return;p[t.teams[m.a].o]+=s[0];p[t.teams[m.b].o]+=s[1];const wi=win(t,m.r,m.i);if(wi!=null)w[t.teams[wi].o]++});
  const[d,n]=prog(t),ds=[...Object.values(rtOf(t)),...Object.values(mtOf(t))].sort()[0],bar=w[0]+w[1]?w:[1,1];
  const side=k=>`<div class="side o${k+1}"><span class="org">${esc(t.og[k])}</span><span class="big">${w[k]}</span><span class="lbl">Match wins</span><span class="alive">${left[k]} of ${tot[k]} still in · ${p[k]} pts</span></div>`;
  return`<div class="clash"><p class="sub">${when(ds)||"Not set"}</p><div class="board">${side(0)}<div class="mid"><b>VS</b><span>${d} of ${n} played</span></div>${side(1)}</div><div class="tug"><i class="o1" style="flex-grow:${bar[0]}"></i><i class="o2" style="flex-grow:${bar[1]}"></i></div></div>`}
// Read-only match list: "Up next" card, one tab per round, then every match with time, players and status.
function mList(t){
  const R=t.sc.length,ms=matches(t),mt=mtOf(t),lv=lvOf(t);if(mview>=R)mview=0;
  const cnt=r=>{const L=ms.filter(m=>m.r===r);return[L.filter(m=>t.sc[r][m.i]).length,L.length]};
  const side=(x,w)=>x==null?'<div class="mcp"><span class="mca">?</span><b class="tbd">TBD</b></div>':(n=>`<div class="mcp${w===x?" w":""}" data-t="${x}" data-tid="${t.id}">${mpic(n)}<b>${esc(dn(n))}${w===x?" ♛":""}</b>${t.og?`<span class="t O${t.teams[x].o+1}">${esc(t.og[t.teams[x].o])}</span>`:""}${ttUser(n)?`<a class="mcl" href="https://www.tiktok.com/@${esc(ttUser(n))}" target="_blank" rel="noopener noreferrer">View profile ↗</a>`:""}</div>`)(t.teams[x].n);
  const row=(m,j)=>{const k=m.r+"_"+m.i,s=t.sc[m.r][m.i],w=win(t,m.r,m.i),live=lv[k];
    return`<div class="mc"><div class="mch"><div class="mtm"><b>${when(mt[k])||"Time not set"}</b><span>${rname(t,m.r)} · Match ${j+1}</span></div><div class="ms ${s?"c":live?"l":""}">${s?"Completed":live?"Live now":"Scheduled"}</div></div>${side(m.a,w)}<div class="mcm"><span class="vsb">VS</span>${s?`<span class="mcs">${s[0]} – ${s[1]}</span>`:""}</div>${side(m.b,w)}</div>`};
  const idx=m=>ms.indexOf(m),todo=ms.filter(m=>m.a!=null&&m.b!=null&&!t.sc[m.r][m.i]),
    nxt=todo.slice().sort((x,y)=>(lv[y.r+"_"+y.i]?1:0)-(lv[x.r+"_"+x.i]?1:0)||(mt[x.r+"_"+x.i]||"9").localeCompare(mt[y.r+"_"+y.i]||"9")||idx(x)-idx(y))[0];
  const L=ms.filter(m=>m.r===mview),[d,n]=cnt(mview);
  return scoreboard(t)+(nxt?`<div class="card upnext"><h3 class="sec">Up next</h3>${row(nxt,ms.filter(m=>m.r===nxt.r).indexOf(nxt))}</div>`:"")
  +`<div class="tabs">${t.sc.map((_,r)=>{const[x,y]=cnt(r);return`<button class="${r===mview?"on":""}" onclick="mview=${r};render()">${rname(t,r)}<small>${x}/${y}</small></button>`}).join("")}</div>`
  +`<p class="meta">${n} match${n===1?"":"es"} in ${rname(t,mview)}, ${d} complete</p><div class="card">${L.map((m,j)=>m===nxt?"":row(m,j)).join("")||`<p class="meta">${L.length?"The only match in this round is shown in Up next.":"No matches in this round yet."}</p>`}</div>`}

// Big round photo for the champion banner (TikTok photo, or the initial if there is none or it fails to load)
const champPic=n=>{const i=ini(n.replace(/^@/,""));return ttUser(n)?pic(n).replace('class="pfp"',`class="pfp champ-img" data-i="${i}"`):`<div class="champ-av">${i}</div>`};
// Shown after tapping a player in the bracket: their name and a profile link (the phone version of right-click)
const trcBar=t=>{if(trcId!==t.id||trc==null||!t.teams[trc])return"";const n=t.teams[trc].n,u=ttUser(n);
  return`<div class="trcbar"><b>${esc(dn(n))}</b>${u?`<a class="champ-link" href="https://www.tiktok.com/@${esc(u)}" target="_blank" rel="noopener noreferrer">View profile ↗</a>`:""}<button class="sm" onclick="trc=null;render()">Clear</button></div>`};
function teamView(t){const c=champ(t);
  return(c!=null?`<div class="champ">${champPic(t.teams[c].n)}<span>Champion</span><b>${esc(dn(t.teams[c].n))}</b>${ttUser(t.teams[c].n)?`<a class="champ-link" href="https://www.tiktok.com/@${esc(ttUser(t.teams[c].n))}" target="_blank" rel="noopener noreferrer">View TikTok profile ↗</a>`:""}${t.size>1?`<em>${esc(t.teams[c].m.join(", "))}</em>`:""}</div>`:"")
  +`${t.og?`<p class="meta"><b style="color:var(--o1)">${esc(t.og[0])}</b> vs <b style="color:var(--o2)">${esc(t.og[1])}</b></p>`:""}${viewTabs()}${tv==="matches"?mList(t):`<p class="meta">Tap a player to trace their run. Scroll sideways on small screens.</p><div class="bwrap" tabindex="0" role="region" aria-label="Tournament bracket">${bracketSvg(t,"view")}</div>${trcBar(t)}`}`
  +(t.size>1?`<h2>Teams</h2><div class="tl">${t.teams.map(x=>`<div class="card"><b>${esc(dn(x.n))}</b><p class="meta">${x.m.length?esc(x.m.join(", ")):"No members listed"}</p></div>`).join("")}</div>`:"")
  +(authed?`<p class="acts"><button class="pri" onclick="asel='${t.id}';atab='bracket';bmode='arrange';bsel=null;location.hash='#/admin'">Edit bracket</button><button onclick="redraw('${t.id}')">Redraw bracket</button><button class="danger" onclick="del('${t.id}')">Delete tournament</button></p>`:"")}

function ffaView(t){const L=board(t),rs=Array.from({length:t.rn},(_,r)=>r);
  return`<div class="bwrap"><table class="ff"><thead><tr><th>Rank</th><th>Player</th>${rs.map(r=>`<th>R${r+1}</th>`).join("")}<th style="text-align:right">Total</th></tr></thead><tbody>${L.map(x=>`<tr class="${x.rank===1&&x.s>0?"top1":""}"><td>${x.rank}</td><td>${pic(x.n)}${esc(dn(x.n))}</td>${rs.map(r=>{const p=(t.pts[x.i]||[])[r];return`<td>${authed&&!t.done?`<input type="number" min="0" id="f${x.i}_${r}" value="${p??""}" aria-label="${esc(dn(x.n))} round ${r+1}">`:(p??"–")}</td>`}).join("")}<td class="tot">${x.s}</td></tr>`).join("")}</tbody></table></div>`
  +(authed?`<p class="acts">${t.done?"":`<button class="pri" onclick="saveFfa('${t.id}')">Save scores</button><button ${t.rn>=10?"disabled":""} onclick="addRound('${t.id}')">Add round</button>`}<button onclick="finish('${t.id}')">${t.done?"Reopen":"Mark finished"}</button><button class="danger" onclick="del('${t.id}')">Delete tournament</button></p>`:"")}

function tview(t){const[d,n]=prog(t);
  return`<p class="meta"><a class="linkb" href="#/">Back to dashboard</a></p><section class="hero"><div><h1>${esc(t.name)}</h1><p class="sub">${fmtOf(t)} · ${d} of ${n} ${t.type==="ffa"?"rounds":"matches"} played</p></div>${pill(t)}</section>`+(t.type==="ffa"?ffaView(t):teamView(t))}

function render(keepInputs){
  const m=location.hash.match(/^#\/t\/(\w+)/),t=m&&get(m[1]),y=scrollY,fo=document.activeElement,fid=fo&&fo.id,pos=fo&&fo.selectionStart;
  if(authed){try{if(!(+sessionStorage.getItem("hhAuth")>Date.now()))authed=false}catch(e){}}
  const keep={},sl=[...app.querySelectorAll(".bwrap")].map(x=>x.scrollLeft);
  if(keepInputs===true)app.querySelectorAll("input[id],textarea[id],select[id]").forEach(x=>{if(x.type!=="file")keep[x.id]=x.value});
  const body=location.hash==="#/admin"?(authed?admin():login()):m?(t?tview(t):!ready&&!offline?LOAD:'<div class="card"><p>Tournament not found. It may have been deleted.</p><p><a class="linkb" href="#/">Back to dashboard</a></p></div>'):!ready&&!offline&&!S.T.length?LOAD:dash();
  app.innerHTML=topbar()+`<main id="main">${offline?'<div class="note" role="status">Can’t reach the server right now. Showing the last copy loaded on this device.</div>':""}${err?`<div class="err" role="alert">${esc(err)}</div>`:""}${note?`<div class="note" role="status">${esc(note)}</div>`:""}${body}</main>`;
  document.title=(t?t.name+" · ":location.hash==="#/admin"?"Admin · ":"")+"HeyHoney Tournaments";
  Object.keys(keep).forEach(id=>{const n=document.getElementById(id);if(n)n.value=keep[id]});
  app.querySelectorAll("[data-w]").forEach(x=>{x.style.width=x.dataset.w+"%"});
  app.querySelectorAll("[data-mw]").forEach(x=>{x.style.minWidth=x.dataset.mw+"px"});
  const wasNav=nav;nav=false;
  if(wasNav){app.querySelectorAll(".bwrap").forEach(x=>{if(x.querySelector(".bsvg"))x.scrollLeft=(x.scrollWidth-x.clientWidth)/2});scrollTo(0,0);const h=app.querySelector("h1");if(h){h.tabIndex=-1;h.focus({preventScroll:true})}}
  else{app.querySelectorAll(".bwrap").forEach((x,i)=>{x.scrollLeft=sl[i]??(x.querySelector(".bsvg")?(x.scrollWidth-x.clientWidth)/2:0)});scrollTo(0,y);const n=fid&&document.getElementById(fid);if(n){n.focus({preventScroll:true});try{n.setSelectionRange(pos,pos)}catch(e){}}}}

// ---------- Actions ----------
async function doLogin(){
  const le=document.getElementById("le"),p=v("pw"),bt=document.querySelector(".login button[type=submit]");
  if(need&&p.length<8)return void(le.textContent="Use at least 8 characters.");
  le.textContent="";if(bt)bt.disabled=true;
  let r;try{r=await api({action:need?"setup":"login",pass:p})}catch(e){if(bt)bt.disabled=false;return void(le.textContent="Can’t reach the server. Check your connection and try again.")}
  if(!r.ok){if(bt)bt.disabled=false;if(r.d.need)need=true;return void(le.textContent=r.d.error||"Something went wrong. Try again.")}
  tok=r.d.token;authed=true;need=false;try{sessionStorage.setItem("hhTok",tok);sessionStorage.setItem("hhAuth",Date.now()+SESSION_MS)}catch(e){}
  await load();
  if(!S.T.length&&legacy.length){S.T=legacy.slice(0,MAX);legacy=[];note="Moved "+S.T.length+" tournament(s) from this browser to the shared database.";save()}
  location.hash==="#/admin"?render():location.hash="#/admin"}
function logout(){api({action:"logout"}).catch(()=>{});dropAuth();render()}

function createT(){const e=m=>{document.getElementById("fe").textContent=m},nm=v("nn").trim(),ty=v("nt"),f=ty==="ffa"?"ffa":ty==="team"?"2":"1",L=ty==="team"?[]:v("nl").split("\n").map(x=>x.trim()).filter(Boolean).map(tt),id=uid();let t;
  if(S.T.length>=MAX)return e("The board is full. Delete a tournament first.");
  if(!nm)return e("Enter a tournament name.");
  if(ty==="team")return createVs(id,nm,e);
  if(f==="ffa"){
    if(L.length<2||L.length>64)return e("Free for all needs 2 to 64 players.");
    if(L.some(x=>x.length>40))return e("Player names can be at most 40 characters.");
    if(new Set(L.map(x=>x.toLowerCase())).size!==L.length)return e("Each player name must be different.");
    t={id,name:nm,type:"ffa",pl:L,rn:Math.min(10,Math.max(1,Math.floor(+v("nr"))||3)),pts:{},done:false}
  }else{
    const size=+f,teams=(L.map(l=>{const k=l.indexOf("|"),a=k<0?l:l.slice(0,k),b=k<0?"":l.slice(k+1);return{n:a.trim(),m:(b||"").split(",").map(x=>x.trim()).filter(Boolean)}}))
    if(teams.length<2||teams.length>32)return e("Enter 2 to 32 players, one per line.");
    if(teams.some(x=>!x.n))return e("Every team needs a name.");
    if(teams.some(x=>x.n.length>40))return e((size>1?"Team":"Player")+" names can be at most 40 characters.");
    if(new Set(teams.map(x=>x.n.toLowerCase())).size!==teams.length)return e("Each "+(size>1?"team":"player")+" name must be different.");
    const big=teams.find(x=>x.m.length>size);if(big)return e(big.n+" lists more than "+size+" members.");
    t={id,name:nm,type:"team",size,teams};
    draw(t,v("nsd")==="list")}
  S.T.push(t);showForm=false;save();location.hash="#/t/"+id}

// Team vs Team: two named teams, players typed once; row 1 of Team 1 plays row 1 of Team 2.
function createVs(id,nm,e){const o=[v("cn0").trim(),v("cn1").trim()],[A,B]=[0,1].map(k=>v("cm"+k).split(/[\n,]/).map(x=>x.trim()).filter(Boolean).map(tt)),all=[...A,...B],mode=v("nsd"),L=A.length,n=all.length;
  if(!o[0]||!o[1])return e("Enter a name for both teams.");
  if(o[0].toLowerCase()===o[1].toLowerCase())return e("The two teams need different names.");
  if(!L||!B.length)return e("Each team needs at least one player.");
  if(n>32)return e("Brackets take up to 32 players in total.");
  if(all.some(x=>x.length>40))return e("Player names can be at most 40 characters.");
  if(new Set(all.map(x=>x.toLowerCase())).size!==n)return e("Each player name must be different.");
  if(mode==="pairs"&&(L!==B.length||n&(n-1)))return e("Row vs row needs the same number of players on both teams, and 2, 4, 8, 16 or 32 players in total. Choose Random draw instead.");
  const t={id,name:nm,type:"team",size:1,teams:all.map((x,i)=>({n:x,m:[],o:i<L?0:1})),og:o};
  draw(t);if(mode==="pairs")t.pairs=Array.from({length:L},(_,i)=>[i,L+i]);
  S.T.push(t);showForm=false;save();location.hash="#/t/"+id}
function setScore(id,r,i){const t=get(id),a=v("a"+r+"_"+i),b=v("b"+r+"_"+i);err=note="";
  if(!okNum(a)||!okNum(b))err="Enter both scores as numbers (0 or more).";
  else if(ent(t,r,i).some(x=>x==null))err="Both teams must be known before a score can be saved.";
  else if(+a===+b)err="Scores can’t be tied. A winner is needed to advance.";
  else{const p=win(t,r,i);t.sc[r][i]=[+a,+b];if(win(t,r,i)!==p)clear(t,r,i);delete lvOf(t)[r+"_"+i];save()}
  render(!!err)}
function redraw(id){if(!confirm("Redraw the bracket? All results are cleared."))return;const t=get(id);draw(t);t.live={};err=note="";note="Bracket redrawn.";save();render()}
function del(id){if(!confirm("Delete this tournament and its results?"))return;S.T=S.T.filter(t=>t.id!==id);save();err=note="";if(location.hash.startsWith("#/t/"))location.hash="#/";else render()}
function saveFfa(id){const t=get(id);err=note="";readFfa(t);note="Scores saved.";save();render()}
function addRound(id){const t=get(id);err=note="";readFfa(t);if(t.rn>=10)return fail("Maximum is 10 rounds.");t.rn++;save();render()}
function finish(id){const t=get(id);err=note="";if(!t.done)readFfa(t);t.done=!t.done;save();render()}

// ---------- Admin area: Scoring, Overview, Players, Matches, Settings ----------
let atab="overview",asel="";
const TABS=["scoring","overview","players","bracket","matches","settings"];
const mtOf=t=>t.mt||(t.mt={}),lvOf=t=>t.live||(t.live={}),rtOf=t=>t.rt||(t.rt={});
// Short round date for inside the bracket, e.g. "1 Nov, 18:00"
const rdt=s=>{const d=s&&new Date(s);return d&&!isNaN(d)?d.toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):""};
const rname=(t,r)=>{const k=t.sc.length-1-r;return k===0?"Final":k===1?"Semi Final":k===2?"Quarter Final":"Round "+(r+1)};
const when=s=>{const d=s&&new Date(s);return d&&!isNaN(d)?d.toLocaleString("en-GB",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):""};
const cur=()=>get(asel)||S.T[0];
const nm=(t,x)=>x==null?"TBD":esc(dn(t.teams[x].n));
// Real matches only (round-1 byes are skipped).
function matches(t){const L=[];t.sc.forEach((rd,r)=>rd.forEach((_,i)=>{const[a,b]=ent(t,r,i);if(!r&&(a==null||b==null))return;L.push({r,i,a,b})}));return L}
const sel=t=>`<label for="as">Tournament</label><select id="as" onchange="asel=this.value;em=null;bsel=null;render()">${S.T.map(x=>`<option value="${x.id}" ${x.id===t.id?"selected":""}>${esc(x.name)} · ${fmtOf(x)}</option>`).join("")}</select>`;

function admin(){const t=cur();let body;
  if(atab==="overview")body=aOver();
  else if(atab==="settings")body=aSet();
  else if(!t)body='<div class="card"><p>No tournaments yet. Create one in Overview.</p></div>';
  else body=sel(t)+({scoring:aScore,players:aPlayers,bracket:aBracket,matches:aMatches}[atab])(t);
  return`<section class="hero"><h1>Tournament admin</h1></section><div class="atabs">${TABS.map(k=>`<button class="${atab===k?"on":""}" onclick="atab='${k}';sset='';em=null;bsel=null;err=note='';render()">${k}</button>`).join("")}</div>${body}`}

function aOver(){const n=S.T.length,f=S.T.filter(fin).length;
  return`<div class="stat"><div><b>${n}/${MAX}</b>Tournaments</div><div><b>${n-f}</b>In progress</div><div><b>${f}</b>Finished</div></div><p class="acts"><button class="pri" ${n>=MAX?"disabled":""} onclick="showForm=!showForm;render()">New tournament</button></p>${showForm?createForm():""}`
  +S.T.map(t=>`<div class="card row"><div><span class="tn">${esc(t.name)}</span><p class="meta">${fmtOf(t)}</p></div><div class="acts">${pill(t)}<button class="sm" onclick="asel='${t.id}';atab='scoring';render()">Score</button><button class="sm" onclick="location.hash='#/t/${t.id}'">View</button><button class="sm danger" onclick="del('${t.id}')">Delete</button></div></div>`).join("")}

let aview=0,em=null;
function aScore(t){if(t.type==="ffa")return ffaView(t);
  if(em&&em.id===t.id)return editor(t);
  const R=t.sc.length,ms=matches(t),cnt=r=>{const L=ms.filter(m=>m.r===r);return[L.filter(m=>t.sc[r][m.i]).length,L.length]};
  if(aview>=R)aview=0;
  const L=ms.filter(m=>m.r===aview),[d,n]=cnt(aview);
  return`<h3 class="sec">Matches</h3><div class="meta">Enter both final point totals and save the row. The higher scorer advances automatically.</div>`
  +`<div class="tabs">${t.sc.map((_,r)=>{const[x,y]=cnt(r);return`<button class="${r===aview?"on":""}" onclick="aview=${r};err=note='';render()">${rname(t,r)}<small>${x}/${y}</small></button>`}).join("")}</div>`
  +`<div class="meta">${d} of ${n} results saved · Points save one match at a time</div><div>${L.map((m,j)=>{
    const k=m.r+"_"+m.i,s=t.sc[m.r][m.i],lv=lvOf(t)[k],w=win(t,m.r,m.i),ok=m.a!=null&&m.b!=null;
    const side=(x,p)=>`<div class="sd"><div class="sp">${x==null?'<span class="n tbd">TBD</span>':`<span class="av">${ini(t.teams[x].n)}</span><span class="n">${esc(dn(t.teams[x].n))}</span>`}${x!=null&&w===x?'<span class="hp">♛</span>':""}</div><div class="sl">${nm(t,x)} points</div><input type="number" min="0" placeholder="0" id="${p}${k}" ${ok?"":"disabled"} oninput="chk('${k}')" value="${s?s[p==="a"?0:1]:""}"></div>`;
    return`<div class="sc"><div class="when"><b>Match ${j+1}</b><span>${when(mtOf(t)[k])||"Time not set"}</span><span class="stl ${s?"c":lv?"l":""}">${s?"Completed":lv?"Live now":"Scheduled"}</span></div>${side(m.a,"a")}${side(m.b,"b")}<div class="sacts"><button class="gold" id="sv${k}" ${s?"":"disabled"} onclick="setScore('${t.id}',${m.r},${m.i})">Save result</button><button class="ghost" ${ok?"":"disabled"} onclick="openEdit('${t.id}',${m.r},${m.i})">Full editor</button></div></div>`}).join("")}</div>`}

function editor(t){const{r,i}=em,[a,b]=ent(t,r,i),k=r+"_"+i,s=t.sc[r][i],[dv,tv]=(mtOf(t)[k]||"T").split("T"),st=s?"c":lvOf(t)[k]?"l":"s",both=a!=null&&b!=null,o=(x,l)=>`<option value="${x}" ${st===x?"selected":""}>${l}</option>`;
  return`<div class="meta">MATCH CONTROL</div><h2 style="margin:4px 0 14px">Edit ${rname(t,r)} match</h2><div class="meta">${nm(t,a)} vs ${nm(t,b)}. Teams come from the draw and earlier results. Rename them in Players.</div>`
  +`<div class="g2"><div><label for="md">Date</label><input type="date" id="md" value="${dv}"></div><div><label for="mtm">Time</label><input type="time" id="mtm" value="${tv}"></div></div>`
  +`<label for="ms">Status</label><select id="ms">${o("s","Scheduled")}${o("l","Live")}${o("c","Completed")}</select>`
  +`<div class="g2"><div><label for="pa">${nm(t,a)} points</label><input type="number" min="0" id="pa" value="${s?s[0]:""}" ${both?"":"disabled"}></div><div><label for="pb">${nm(t,b)} points</label><input type="number" min="0" id="pb" value="${s?s[1]:""}" ${both?"":"disabled"}></div></div>`
  +`<div class="meta">Enter the final points and choose Save result. The higher score advances automatically. Ties cannot be completed.</div><hr><p class="acts end"><button onclick="em=null;err='';render()">Cancel</button><button onclick="saveMatch('${t.id}',${r},${i})">Save match</button><button class="gold" ${both?"":"disabled"} onclick="saveResult('${t.id}',${r},${i})">Save result</button></p>`}

// Enable a row's Save button once both scores are typed.
function chk(k){document.getElementById("sv"+k).disabled=v("a"+k)===""||v("b"+k)===""}
function openEdit(id,r,i){em={id,r,i};err=note="";render()}
function applyTime(t,k){const d=v("md"),x=v("mtm");
  if(d&&x)mtOf(t)[k]=d+"T"+x;else if(!d&&!x)delete mtOf(t)[k];else{err="Enter both a date and a time, or clear both.";return false}return true}
function saveMatch(id,r,i){const t=get(id),k=r+"_"+i,st=v("ms"),s=t.sc[r][i],[a,b]=ent(t,r,i);err=note="";
  if(!applyTime(t,k))return render(true);
  if(st==="c"&&!s)return fail("Enter the points and choose Save result to complete this match.");
  if(st==="l"&&!(a!=null&&b!=null))return fail("Both teams are needed to set a match live.");
  if(st!=="c"&&s){if(!confirm("This match has a saved result. Clear it?"))return render();t.sc[r][i]=null;clear(t,r,i)}
  lvOf(t)[k]=st==="l";em=null;note="Match saved.";save();render()}
function saveResult(id,r,i){const t=get(id),k=r+"_"+i,a=v("pa"),b=v("pb");err=note="";
  if(!applyTime(t,k))return render(true);
  if(!okNum(a)||!okNum(b))return fail("Enter both scores as numbers (0 or more).");
  if(ent(t,r,i).some(x=>x==null))return fail("Both teams must be known before a score can be saved.");
  if(+a===+b)return fail("Scores can’t be tied. A winner is needed to advance.");
  const p=win(t,r,i);t.sc[r][i]=[+a,+b];if(win(t,r,i)!==p)clear(t,r,i);delete lvOf(t)[k];em=null;note="Result saved.";save();render()}

// ---------- Players list (1v1): add into open bye places, remove without resetting the bracket ----------
let padd=false;
const isOut=(t,x)=>t.sc.some((rd,r)=>rd.some((s,i)=>s&&ent(t,r,i).includes(x)&&win(t,r,i)!==x));
const hitR1=(t,i)=>!!(t.sc[0][i]||(t.sc[1]&&t.sc[1][i>>1]));
function resetR1(t,i){t.sc[0][i]=null;clear(t,0,i);delete lvOf(t)["0_"+i];for(let r=1,j=i>>1;r<t.sc.length;r++,j>>=1)delete lvOf(t)[r+"_"+j]}
function pList(t){const pos=x=>{for(const p of t.pairs){const k=p.indexOf(x);if(k>=0)return k}return 0},open=t.pairs.some(p=>p[0]==null||p[1]==null);
  return`<div class="row"><div><h3 class="sec" style="margin-top:0">Players · ${t.teams.length}</h3><p class="meta">Add players to fill open places. Removal does not reset the bracket; affected completed results require confirmation.</p></div><button class="pri" ${open?"":"disabled"} onclick="padd=!padd;render()"><i>+</i>Add player</button></div>`
  +(padd?`<div class="card g2"><div><label for="npn">Player name or TikTok link</label><input id="npn" maxlength="40"></div><p class="acts" style="align-self:end"><button class="gold" onclick="addTeamPlayer('${t.id}')">Add</button><button onclick="padd=false;render()">Cancel</button></p></div>`:"")
  +(open?"":'<p class="meta">The bracket is full. Remove a player to free a place, or generate a new bracket in Bracket.</p>')
  +`<div>${t.teams.map((x,i)=>{const k=t.og?x.o:pos(i),o=isOut(t,i);return`<div class="cr"><span class="t O${k+1}">${t.og?esc(t.og[k]):"Team "+(k+1)}</span><span class="pn">${pic(x.n)}${esc(dn(x.n))}</span><span class="pill ${o?"out":"in"}">${o?"Out":"Still in"}</span><span class="ra"><button class="sm" onclick="renameP('${t.id}',${i})">Rename</button><button class="sm danger" onclick="removeP('${t.id}',${i})">Remove</button></span></div>`}).join("")}</div>`}
function addTeamPlayer(id){const t=get(id),n=tt(v("npn").trim());err=note="";
  if(!n)return fail("Enter a player name.");
  if(t.teams.some(x=>x.n.toLowerCase()===n.toLowerCase()))return fail("That player is already in this tournament.");
  const i=t.pairs.findIndex(p=>p[0]==null||p[1]==null);
  if(i<0)return fail("The bracket is full. Remove a player or generate a new bracket.");
  if(hitR1(t,i)&&!confirm("Adding a player here clears the result that depended on the free pass. Continue?"))return;
  const k=t.pairs[i][0]==null?0:1;t.teams.push({n,m:[],o:k});t.pairs[i][k]=t.teams.length-1;resetR1(t,i);
  padd=false;note="Added "+dn(n)+" to match "+(i+1)+".";save();render()}
function removeP(id,x){const t=get(id),p=t.pairs.length*2;err=note="";
  if(t.teams.length-1<=p/2)return fail("Removing another player would shrink the bracket. Generate a new bracket instead.");
  const i=t.pairs.findIndex(q=>q.includes(x)),k=t.pairs[i].indexOf(x);
  if(t.pairs[i][1-k]==null)return fail("This player has a free pass. Swap them into a match first, or generate a new bracket.");
  if(!confirm(hitR1(t,i)?"Remove "+dn(t.teams[x].n)+"? Results that depend on them will be cleared and their opponent gets a free pass.":"Remove "+dn(t.teams[x].n)+"? Their opponent gets a free pass."))return;
  t.pairs[i][k]=null;resetR1(t,i);t.teams.splice(x,1);t.pairs=t.pairs.map(q=>q.map(y=>y!=null&&y>x?y-1:y));
  trc=null;bsel=null;note="Player removed.";save();render()}
function renameP(id,x){const t=get(id),n=(prompt("Rename player",t.teams[x].n)||"").trim().slice(0,40);err=note="";if(!n)return;
  if(t.teams.some((y,j)=>j!==x&&y.n.toLowerCase()===n.toLowerCase()))return fail("Each player name must be different.");
  t.teams[x].n=n;note="Saved "+dn(n)+".";save();render()}

function aPlayers(t){
  if(t.type==="ffa")return`<div class="card">${t.pl.map((n,i)=>`<div class="cr"><span class="av">${ini(n)}</span>${esc(dn(n))}<button class="sm danger" onclick="rmPl('${t.id}',${i})">Remove</button></div>`).join("")}<div class="g2" style="margin-top:12px"><div><label for="np1">Add player</label><input id="np1" maxlength="40"></div><div style="align-self:end"><button class="gold" onclick="addPl('${t.id}')">Add player</button></div></div></div>`;
  if(t.size===1)return pList(t);
  return`<p class="meta">Team size is ${t.size}. Changing names or members doesn’t affect the bracket or results.</p>`+t.teams.map((x,i)=>`<div class="card g2"><div><label for="tn${i}">${t.size===1?"Player":"Team"} name</label><input id="tn${i}" value="${esc(x.n)}" maxlength="40"></div><div><label for="tm${i}">Members (comma separated)</label><input id="tm${i}" value="${esc(x.m.join(", "))}"></div><p class="acts"><button class="sm gold" onclick="saveTeam('${t.id}',${i})">Save</button></p></div>`).join("")}

function aMatches(t){
  if(t.type==="ffa")return'<div class="card"><p>Free for all has rounds instead of matches. Add rounds and enter points in Scoring.</p></div>';
  return matches(t).map(m=>{const k=m.r+"_"+m.i,s=t.sc[m.r][m.i],lv=lvOf(t)[k];
    return`<div class="card row"><div><b>${rname(t,m.r)}</b><p class="meta">${nm(t,m.a)} vs ${nm(t,m.b)} · ${s?"Complete":lv?"Live now":"Scheduled"}</p></div><div class="acts"><input type="datetime-local" style="width:auto" id="d${k}" value="${mtOf(t)[k]||""}" aria-label="Start time"><button class="sm" onclick="saveTime('${t.id}','${k}')">Save time</button><button class="sm ${lv?"on":""}" ${s||m.a==null||m.b==null?"disabled":""} onclick="toggleLive('${t.id}','${k}')">${lv?"End live":"Go live"}</button></div></div>`}).join("")}

// Settings never assumes a tournament: choose one first, then its settings appear.
let sset="";
function aSet(){const t=get(sset),pick=S.T.length?`<label for="ss">Tournament</label><select id="ss" onchange="sset=this.value;err=note='';render()"><option value="">Select a tournament…</option>${S.T.map(x=>`<option value="${x.id}" ${t&&x.id===t.id?"selected":""}>${esc(x.name)} · ${fmtOf(x)}</option>`).join("")}</select>${t?"":'<p class="meta">Choose a tournament to rename, redraw or delete it.</p>'}`:'<div class="card"><p>No tournaments yet. Create one in Overview.</p></div>';
  return pick+(t?`<div class="card"><label for="rn">Tournament name</label><input id="rn" maxlength="60" value="${esc(t.name)}"><p class="acts"><button class="gold" onclick="rename('${t.id}')">Save name</button>${t.type==="ffa"?`<button onclick="finish('${t.id}')">${t.done?"Reopen":"Mark finished"}</button>`:`<button onclick="redraw('${t.id}')">Redraw bracket</button>`}<button class="danger" onclick="del('${t.id}')">Delete tournament</button></p></div>`:"")
  +backup()+`<div class="card"><label for="np">New admin passcode (8+ characters)</label><input id="np" type="password" autocomplete="new-password"><p class="acts"><button class="gold" onclick="savePass()">Save passcode</button></p></div>`}

// ---------- Mirrored bracket (SVG): Round 1 on both outer edges, Final in the middle ----------
// Column r shows who plays in round r; the last column is the Winner. Tap a player to trace their run.
let trc=null,trcId="",bsel=null,bmode="arrange";
// Long names are squeezed to fit their slot instead of being cut off with "…"
const fit=(s,w,cw=6.4)=>[...String(s)].length*cw>w?` textLength="${Math.round(w)}" lengthAdjust="spacingAndGlyphs"`:"";
const cut=(s,n)=>{const a=[...s];return a.length>n?a.slice(0,n-1).join("")+"…":s};
function bracketSvg(t,mode){
  const R=t.sc.length,SW=R<=3?140:R===4?120:104,SH=19,P=21,G=7,GC=20,FG=14,PAD=12,TOP=44,pitch=SW+GC,h0=t.pairs.length,
    LF=PAD+(R-1)*pitch,RF=LF+SW+FG,W=RF+SW+(R-1)*pitch+PAD,
    xL=r=>PAD+r*pitch,xR=r=>RF+(R-1-r)*pitch,hl=mode==="view"&&trcId===t.id&&trc!=null,on=x=>hl&&x!=null&&x===trc;
  const Y=[Array.from({length:h0},(_,j)=>TOP+j*P+(j>>1)*G)];
  for(let r=1;r<R;r++){const q=Y[r-1];Y.push(Array.from({length:q.length/2},(_,j)=>(q[2*j]+q[2*j+1])/2))}
  const bot=Y[0][h0-1]+SH,cx=(LF+RF+SW)/2,wy=bot+22,H=wy+48,ch=champ(t);
  let heads="",lines="",slots="";
  const tap=can=>can?` tabindex="0" role="button" onclick="slotTap(this,'${t.id}','${mode}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();slotTap(this,'${t.id}','${mode}')}"`:"";
  for(let r=0;r<R;r++){
    const h=Y[r].length,hd=rname(t,r);
    const dt=rdt((t.rt||{})[r]),dl=x=>dt?`<text class="bd" x="${x}" y="29">${esc(dt)}</text>`:"";
    if(r<R-1)heads+=`<text class="bh" x="${xL(r)+SW/2}" y="16">${hd}</text>${dl(xL(r)+SW/2)}<text class="bh" x="${xR(r)+SW/2}" y="16">${hd}</text>${dl(xR(r)+SW/2)}`;
    else heads+=`<text class="bh" x="${cx}" y="16">${hd}</text>${dl(cx)}`;
    for(let side=0;side<2;side++)for(let j=0;j<h;j++){
      const g=side*h+j,i=g>>1,k=g&1,x=side?xR(r):xL(r),y=Y[r][j],tm=ent(t,r,i)[k],s=t.sc[r][i],w=win(t,r,i);
      if(r)for(let f=0;f<2;f++){ // elbow lines from the two feeder slots of the previous round
        const gf=side*2*h+2*j+f,fx=side?xR(r-1):xL(r-1),fy=Y[r-1][2*j+f]+SH/2,tf=ent(t,r-1,gf>>1)[gf&1],
          d=side?`M${fx} ${fy}H${fx-GC/2}V${y+SH/2}H${x+SW}`:`M${fx+SW} ${fy}H${fx+SW+GC/2}V${y+SH/2}H${x}`;
        lines+=`<path class="bc${on(tf)&&tf===tm?" on":""}" d="${d}"/>`}
      const can=mode==="view"?tm!=null:mode==="arrange"?r===0:true,
        sel=mode==="arrange"?r===0&&bsel&&bsel.g===g:mode==="score"&&bsel&&bsel.r===r&&bsel.i===i,
        label=tm==null?(r?"TBD":"Bye"):dn(t.teams[tm].n),un=tm==null?"":ttUser(t.teams[tm].n),mem=tm!=null&&t.og?" ("+t.og[t.teams[tm].o]+")":tm!=null&&t.size>1&&t.teams[tm].m.length?" ("+t.teams[tm].m.join(", ")+")":"";
      slots+=`<g class="sl2${on(tm)?" on":""}${sel?" sel":""}${can?"":" nc"}${mode==="arrange"&&r===0?" dr":""}" id="sl${r}_${g}" data-r="${r}" data-g="${g}" data-t="${tm??""}"${tap(can)} aria-label="${esc(label+(s?", score "+s[k]:""))}"><title>${esc(label+mem)}</title><rect class="bs${w!=null&&w===tm?" bw":""}" x="${x}" y="${y}" width="${SW}" height="${SH}" rx="3"/>${tm!=null?`<rect class="ob ${(t.og?t.teams[tm].o:k)?"o2":"o1"}" x="${x}" y="${y}" width="3" height="${SH}"/>`:""}${un?`<image href="/api/avatar?u=${encodeURIComponent(un)}" x="${x+5}" y="${y+2}" width="15" height="15" clip-path="url(#avc)" preserveAspectRatio="xMidYMid slice"/>`:""}<text class="bt${tm==null?" bm":""}" x="${x+(un?23:9)}" y="${y+13}"${fit(label,SW-(un?23:9)-(s?26:6))}>${esc(label)}</text>${s?`<text class="bn" x="${x+SW-5}" y="${y+13}" text-anchor="end">${s[k]}</text>`:""}</g>`}}
  lines+=`<path class="bc" d="M${LF+SW} ${Y[R-1][0]+SH/2}H${RF}"/>`;
  slots+=`<g class="sl2 nc${on(ch)?" on":""}" data-t="${ch??""}"><rect class="bs${ch!=null?" bw":""}" x="${cx-75}" y="${wy}" width="150" height="26" rx="3"/><text class="bwl" x="${cx}" y="${wy+18}" text-anchor="middle"${ch==null?"":fit(dn(t.teams[ch].n),142,8.4)}>${ch==null?"TBD":esc(dn(t.teams[ch].n))}</text></g><text class="bh" x="${cx}" y="${wy+40}">Winner</text>`;
  return`<svg class="bsvg${hl?" hl":""}" viewBox="0 0 ${W} ${H}" data-id="${t.id}" data-mw="${Math.round(W)}" role="group" aria-label="Tournament bracket"><defs><clipPath id="avc" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath></defs>${heads}${lines}${slots}</svg>`}

function slotTap(el,id,mode){const t=get(id),r=+el.dataset.r,g=+el.dataset.g,i=g>>1,x=el.dataset.t===""?null:+el.dataset.t;err=note="";
  if(mode==="view"){const same=trcId===id&&trc===x;trcId=id;trc=same?null:x;return render()}
  if(mode==="arrange"){if(!bsel)bsel={g};else if(bsel.g===g)bsel=null;else return swapR1(t,bsel.g,g);return render()}
  const[a,b]=ent(t,r,i);
  if(a==null||b==null)err=!r?"That match is a bye, so there is nothing to score.":"Both teams must be known before this match can be scored.";else bsel={r,i};
  render()}
function swapR1(t,g1,g2){const np=t.pairs.map(p=>p.slice()),i1=g1>>1,k1=g1&1,i2=g2>>1,k2=g2&1;
  [np[i1][k1],np[i2][k2]]=[np[i2][k2],np[i1][k1]];
  if(np.some(p=>p[0]==null&&p[1]==null))return fail("A match can’t have two byes. Swap the bye with a team in a different match.");
  const ch=[...new Set([i1,i2])];
  if(ch.some(i=>t.sc[0][i]||(t.sc[1]&&t.sc[1][i>>1]))&&!confirm("Changed matches have results that will be cleared. Continue?"))return render();
  ch.forEach(i=>{t.sc[0][i]=null;clear(t,0,i);delete lvOf(t)["0_"+i];for(let r=1,j=i>>1;r<t.sc.length;r++,j>>=1)delete lvOf(t)[r+"_"+j]});
  const n=x=>x==null?"Bye":dn(t.teams[x].n),a=t.pairs[i1][k1],b=t.pairs[i2][k2];
  t.pairs=np;bsel=null;note="Swapped "+n(a)+" and "+n(b)+".";save();render()}
// Drag a first-round slot onto another to swap them (pointer events: mouse, pen and touch)
let dg=null,dragged=false;
app.addEventListener("pointerdown",e=>{const el=e.target.closest&&e.target.closest(".sl2.dr");if(!el||(e.pointerType==="mouse"&&e.button!==0))return;
  const svg=el.closest("svg");dg={el,svg,g:+el.dataset.g,x:e.clientX,y:e.clientY,sc:svg.viewBox.baseVal.width/svg.getBoundingClientRect().width,on:false,tg:null}});
document.addEventListener("pointermove",e=>{if(!dg)return;const dx=e.clientX-dg.x,dy=e.clientY-dg.y;
  if(!dg.on){if(Math.hypot(dx,dy)<6)return;dg.on=true;dg.el.classList.add("drag");dg.svg.appendChild(dg.el)}
  dg.el.setAttribute("transform","translate("+dx*dg.sc+" "+dy*dg.sc+")");
  const h=document.elementFromPoint(e.clientX,e.clientY),tg=h&&h.closest&&h.closest(".sl2.dr");
  if(dg.tg&&dg.tg!==tg)dg.tg.classList.remove("tgt");
  dg.tg=tg&&tg!==dg.el?tg:null;if(dg.tg)dg.tg.classList.add("tgt");e.preventDefault()});
const dEnd=e=>{if(!dg)return;const d=dg;dg=null;if(!d.on)return;dragged=true;setTimeout(()=>{dragged=false},0);
  err=note="";const t=get(d.svg.dataset.id);
  if(e.type==="pointerup"&&d.tg)swapR1(t,d.g,+d.tg.dataset.g);else render()};
document.addEventListener("pointerup",dEnd);document.addEventListener("pointercancel",dEnd);
document.addEventListener("click",e=>{if(dragged){e.stopPropagation();e.preventDefault();dragged=false}},true);
function bpanel(t,mode){
  if(mode==="arrange"){
    if(!bsel)return'<p class="meta">Drag a first-round slot onto another to swap them, or tap one and then tap the other. Swap with a Bye to give a player a free pass.</p>';
    const i=bsel.g>>1,k=bsel.g&1,x=t.pairs[i][k];
    return`<div class="card"><b>${x==null?"Bye":esc(dn(t.teams[x].n))}</b><p class="meta">Match ${i+1}, ${k?"bottom":"top"} slot. Tap another first-round slot to swap.</p><div class="g2">${x==null?"":`<div><label for="rnm">Rename</label><input id="rnm" maxlength="40" value="${esc(t.teams[x].n)}"></div>`}<p class="acts" style="align-self:end">${x==null?"":`<button class="sm gold" onclick="renameTeam('${t.id}',${x})">Save name</button>`}<button class="sm" onclick="bsel=null;render()">Deselect</button></p></div></div>`}
  if(!bsel)return'<p class="meta">Tap a match to enter its score. The higher score advances automatically.</p>';
  const{r,i}=bsel,[a,b]=ent(t,r,i),s=t.sc[r][i];
  return`<div class="card"><b>${rname(t,r)}: ${nm(t,a)} vs ${nm(t,b)}</b><div class="g2"><div><label for="a${r}_${i}">${nm(t,a)} points</label><input type="number" min="0" id="a${r}_${i}" value="${s?s[0]:""}"></div><div><label for="b${r}_${i}">${nm(t,b)} points</label><input type="number" min="0" id="b${r}_${i}" value="${s?s[1]:""}"></div></div><p class="acts"><button class="gold" onclick="bScore('${t.id}',${r},${i})">Save result</button>${s?`<button onclick="bClear('${t.id}',${r},${i})">Clear result</button>`:""}<button onclick="atab='scoring';openEdit('${t.id}',${r},${i})">Date, time and status</button><button onclick="bsel=null;render()">Close</button></p></div>`}
function bScore(id,r,i){setScore(id,r,i);if(!err){bsel=null;render()}}
function bClear(id,r,i){const t=get(id);
  if(t.sc[r+1]&&t.sc[r+1][i>>1]&&!confirm("Clearing this also clears later results that depend on it. Continue?"))return;
  t.sc[r][i]=null;clear(t,r,i);delete lvOf(t)[r+"_"+i];bsel=null;err="";note="Result cleared.";save();render()}
function renameTeam(id,x){const t=get(id),n=v("rnm").trim();err=note="";
  if(!n)return fail("Enter a name.");
  if(t.teams.some((y,j)=>j!==x&&y.n.toLowerCase()===n.toLowerCase()))return fail("Each name must be different.");
  t.teams[x].n=n;note="Saved "+dn(n)+".";save();render()}


// ---------- Bracket tab: visual editor + auto generate ----------
const slotOpts=(t,s)=>'<option value="">Bye</option>'+t.teams.map((x,i)=>`<option value="${i}" ${s===i?"selected":""}>${esc(dn(x.n))}</option>`).join("");
function aBracket(t){
  if(t.type==="ffa")return'<div class="card"><p>Free for all has no bracket. Manage players in Players.</p></div>';
  const slot=(p,i,k)=>`<div><label for="s${i}_${k}">Match ${i+1}, ${k?"bottom":"top"}</label><select id="s${i}_${k}" data-prev="${p[k]??""}" onchange="swapSlot(this)">${slotOpts(t,p[k])}</select></div>`,
    mb=(m,l)=>`<button class="${bmode===m?"on":""}" onclick="bmode='${m}';bsel=null;err=note='';render()">${l}</button>`;
  return`<h3 class="sec">Bracket editor</h3><div class="tabs">${mb("arrange","Arrange players")}${mb("score","Enter scores")}</div><div class="bwrap" tabindex="0" role="region" aria-label="Bracket editor">${bracketSvg(t,bmode)}</div>${bpanel(t,bmode)}`
  +`<div class="card"><h3 class="sec">Round schedule</h3><p class="meta">Set a date and time for each round. It shows under the round title inside the bracket. Leave a round empty to hide its date.</p><div class="g2">${t.sc.map((_,r)=>`<div><label for="rt${r}">${rname(t,r)}</label><input type="datetime-local" id="rt${r}" value="${rtOf(t)[r]||""}"></div>`).join("")}</div><p class="acts"><button class="gold" onclick="saveRounds('${t.id}')">Save round schedule</button></p></div>`
  +`<div class="card"><h3 class="sec">Auto generate</h3><p class="meta">Builds a new bracket from the entrants. Odd counts get byes automatically. ${prog(t)[0]?"This clears all saved results.":""}</p><div class="g2"><div><label for="bm">Seeding</label><select id="bm"><option value="rand">Random draw</option><option value="list">Entry order (first = top seed)</option></select></div></div><p class="acts"><button class="gold" onclick="genBracket('${t.id}')">Generate bracket</button></p></div>`
  +`<details><summary>Edit first round as a list</summary><div class="card"><p class="meta">Choose who plays in each slot. Picking a team that is already placed swaps the two. A changed match loses its result and anything that depended on it.</p>${t.pairs.map((p,i)=>`<div class="g2 slot">${slot(p,i,0)}${slot(p,i,1)}</div>`).join("")}<p class="acts"><button class="gold" onclick="saveSlots('${t.id}')">Save bracket</button></p></div></details>`}
function saveRounds(id){const t=get(id);err=note="";
  t.sc.forEach((_,r)=>{const x=v("rt"+r);if(x)rtOf(t)[r]=x;else delete rtOf(t)[r]});
  note="Round schedule saved.";save();render()}
function genBracket(id){const t=get(id);err=note="";
  if(prog(t)[0]&&!confirm("Generate a new bracket? All results are cleared."))return;
  draw(t,v("bm")==="list");note="New bracket generated.";save();render()}
function swapSlot(s){const x=s.value,prev=s.dataset.prev;
  if(x!=="")document.querySelectorAll(".slot select").forEach(o=>{if(o!==s&&o.value===x){o.value=prev;o.dataset.prev=prev}});
  s.dataset.prev=x}
function saveSlots(id){const t=get(id);err=note="";
  const np=t.pairs.map((_,i)=>[0,1].map(k=>{const x=v("s"+i+"_"+k);return x===""?null:+x})),used=np.flat().filter(x=>x!=null);
  if(used.length!==t.teams.length||new Set(used).size!==used.length)return fail("Every team must be placed exactly once.");
  if(np.some(p=>p[0]==null&&p[1]==null))return fail("A match can’t have two byes.");
  const ch=np.map((p,i)=>p[0]!==t.pairs[i][0]||p[1]!==t.pairs[i][1]);
  if(!ch.some(Boolean)){note="No changes to save.";return render()}
  if(ch.some((c,i)=>c&&(t.sc[0][i]||t.sc[1]&&t.sc[1][i>>1]))&&!confirm("Changed matches have results that will be cleared. Continue?"))return;
  ch.forEach((c,i)=>{if(c){t.sc[0][i]=null;clear(t,0,i);delete mtOf(t)["0_"+i];delete lvOf(t)["0_"+i]}});
  t.pairs=np;note="Bracket updated.";save();render()}

// ---------- Admin actions ----------
const fail=m=>{err=m;render(true)};
function rename(id){const n=v("rn").trim();err=note="";if(!n)return fail("Enter a tournament name.");get(id).name=n;note="Name saved.";save();render()}
async function savePass(){const p=v("np");err=note="";if(p.length<8)return fail("Use a passcode of at least 8 characters.");
  let r;try{r=await api({action:"passwd",pass:p})}catch(e){return fail("Can’t reach the server. Try again.")}
  if(!r.ok)return fail(r.d.error||"Could not update the passcode.");
  tok=r.d.token;try{sessionStorage.setItem("hhTok",tok)}catch(e){}note="Passcode updated. Other devices are logged out.";render()}
function saveTime(id,k){const t=get(id),x=v("d"+k);if(x)mtOf(t)[k]=x;else delete mtOf(t)[k];err="";note="Time saved.";save();render()}
function toggleLive(id,k){const t=get(id);lvOf(t)[k]=!lvOf(t)[k];err=note="";save();render()}
function addPl(id){const t=get(id),n=tt(v("np1").trim());err=note="";
  if(!n)return fail("Enter a player name.");
  if(t.pl.length>=64)return fail("Free for all holds up to 64 players.");
  if(t.pl.some(x=>x.toLowerCase()===n.toLowerCase()))return fail("That player is already in this tournament.");
  t.pl.push(n);t.pts[t.pl.length-1]=[];note="Added "+dn(n)+".";save();render()}
function rmPl(id,i){const t=get(id);err=note="";
  if(t.pl.length<=2)return fail("A free for all needs at least 2 players.");
  if(!confirm("Remove "+dn(t.pl[i])+" and their scores?"))return;
  const np={};let k=0;t.pl.forEach((_,j)=>{if(j!==i)np[k++]=t.pts[j]||[]});t.pl.splice(i,1);t.pts=np;note="Player removed.";save();render()}
function saveTeam(id,i){const t=get(id),n=v("tn"+i).trim(),m=v("tm"+i).split(",").map(x=>x.trim()).filter(Boolean);err=note="";
  if(!n)return fail("Enter a name.");
  if(t.teams.some((x,j)=>j!==i&&x.n.toLowerCase()===n.toLowerCase()))return fail("Each name must be different.");
  if(m.length>t.size)return fail("Members are limited to "+t.size+" for this format.");
  t.teams[i]={n,m};note="Saved "+dn(n)+".";save();render()}

const backup=()=>`<div class="card"><h3 class="sec">Backup</h3><p class="meta">Tournaments are saved to the shared database, so every device sees the same data. Export a copy for your own backup.</p><p class="acts"><button onclick="exportData()">Export JSON</button><button onclick="document.getElementById('imp').click()">Import JSON</button><input id="imp" type="file" accept=".json,application/json" hidden onchange="importData(this.files[0])"></p></div>`;
function exportData(){const b=new Blob([JSON.stringify({v:8,T:S.T},null,2)],{type:"application/json"}),a=document.createElement("a");
  a.href=URL.createObjectURL(b);a.download="heyhoney-tournaments-"+new Date().toISOString().slice(0,10)+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1e3)}
async function importData(f){if(!f)return;err=note="";
  try{if(f.size>2e6)throw 0;const d=clean(JSON.parse(await f.text()));
    if(!d.T.length)return fail("No valid tournaments found in that file.");
    if(!confirm("Replace all current tournaments with the "+d.T.length+" in this file?"))return;
    S.T=d.T;asel="";em=null;note="Imported "+d.T.length+" tournament(s).";save();render()}
  catch(e){fail("That file isn’t a valid tournament backup.")}}

// Right-click a player (in the bracket or the match list) for a small menu with a link to their TikTok profile.
let cm=null;
const closeCm=()=>{if(cm){cm.remove();cm=null}};
document.addEventListener("contextmenu",closeCm,true);
app.addEventListener("contextmenu",e=>{
  const el=e.target.closest&&e.target.closest(".sl2[data-t],.mp[data-t],.mcp[data-t]");
  if(!el||el.dataset.t==="")return;
  const svg=el.closest("svg"),t=get(el.dataset.tid||(svg&&svg.dataset.id)),p=t&&t.teams[+el.dataset.t];
  if(!p)return;
  e.preventDefault();const u=ttUser(p.n);
  cm=document.createElement("div");cm.className="cmenu";cm.setAttribute("role","menu");
  cm.innerHTML=`<div class="cm-n">${esc(dn(p.n))}</div>`+(u?`<a role="menuitem" href="https://www.tiktok.com/@${esc(u)}" target="_blank" rel="noopener noreferrer">View profile ↗</a>`:'<span class="cm-off">No TikTok profile</span>');
  document.body.appendChild(cm);
  cm.style.left=Math.max(8,Math.min(e.clientX,innerWidth-cm.offsetWidth-8))+"px";
  cm.style.top=Math.max(8,Math.min(e.clientY,innerHeight-cm.offsetHeight-8))+"px";
  const a=cm.querySelector("a");if(a)a.focus()});
document.addEventListener("click",e=>{if(cm&&!cm.contains(e.target))closeCm()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeCm()});
window.addEventListener("scroll",closeCm,true);window.addEventListener("resize",closeCm);

// Hide a missing logo instead of showing a broken image. Player photos (.pfp) are skipped: the retry/fallback handler below owns them.
app.addEventListener("error",e=>{if(e.target.tagName==="IMG"&&!e.target.classList.contains("pfp"))e.target.hidden=true},true);
window.addEventListener("hashchange",()=>{err=note="";nav=true;render()});render();
// Load the shared data now, then check for changes every 15 seconds while the tab is visible.
load();setInterval(()=>{if(!document.hidden)load()},15000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)load()});
document.addEventListener("error",e=>{const t=e.target;if(t&&t.classList&&t.classList.contains("pfp")){const n=+t.dataset.r||0;if(n<3){t.dataset.s=t.dataset.s||t.src;t.dataset.r=n+1;setTimeout(()=>{if(t.isConnected)t.src=t.dataset.s+(t.dataset.s.includes("?")?"&":"?")+"r="+(n+1)},2000*(n+1)+Math.random()*3000);return}if(t.classList.contains("champ-img")||t.classList.contains("mcimg")){const d=document.createElement("div");d.className=t.classList.contains("mcimg")?"mca":"champ-av";d.textContent=t.dataset.i;t.replaceWith(d)}else t.remove()}},true);
// Bracket photos are SVG <image> elements: drop one that fails to load instead of showing a broken-image icon.
document.addEventListener("error",e=>{if(window.SVGImageElement&&e.target instanceof SVGImageElement)e.target.remove()},true);