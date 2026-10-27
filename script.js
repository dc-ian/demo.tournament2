// ---------- 1. Constants & helpers ----------
// p2: pads a number to 2 digits (5 -> "05"), used for clock times and dates.
const p2=n=>String(n).padStart(2,"0");
// Default placeholder names: Org 1 = Player 1-16, Org 2 = Player 17-32.
const FT0=Array.from({length:16},(_,i)=>"Player "+(i+1)),HH0=Array.from({length:16},(_,i)=>"Player "+(i+17));
// RN = round names. SZ = how many matches per round (16, 8, 4, 2, 1).
const RN=["Round 1","Round 2","Quarter Final","Semi Final","Final"],SZ=[16,8,4,2,1];
// Month and weekday names used when printing dates.
const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],DAY=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
// blank(): an empty score grid, one null (no result) per match in every round.
const blank=()=>SZ.map(n=>Array(n).fill(null));
// seed(): the starting data for a brand-new event.
//   title/sub: event name and subtitle   start: legacy start date
//   rs: round start times, keyed by round   pass: admin passcode
//   updated: last-saved time   live: matches marked live, keyed "r-i"
//   roster: every player as {n: name, t: "O1" or "O2"}
//   pairs: round-1 matchups as [Org 1 name, Org 2 name]
//   scores: scores[round][match] = [scoreA, scoreB], or null if not played
const seed=()=>{const sc=blank();return{title:"",sub:"",start:"",rs:{},pass:"Heyhoney",n1:"",n2:"",updated:null,live:{},roster:[...FT0.map(n=>({n,t:"O1"})),...HH0.map(n=>({n,t:"O2"}))],pairs:FT0.map((n,i)=>[n,HH0[i]]),scores:sc}};

// ---------- 2. App state & storage ----------
// S holds all event data. Load a saved copy from localStorage if one exists.
let S=seed();
try{const r=localStorage.getItem("cott6");if(r)S=JSON.parse(r)}catch(e){}
// S.mt = per-match date/time overrides, keyed "r-i".
S.mt=S.mt||{};S.n1=S.n1||"";S.n2=S.n2||"";
// authed: whether the admin has logged in (remembered for this browser tab only).
let authed=false;try{authed=sessionStorage.getItem("cottA")==="1"}catch(e){}
// UI state: view = public round tab, aview = admin round tab, tab = admin tab,
// err/note = messages shown to the user, addForm/edit = which forms are open,
// sched = round whose schedule form is open (-1 = none), em = match being edited.
let hlN="",view=0,aview=0,tab="overview",err="",note="",addForm=false,sched=-1,edit=false,em=null;
// save(): stamps the update time and writes S to localStorage.
const save=()=>{S.updated=new Date().toISOString();try{localStorage.setItem("cott6",JSON.stringify(S))}catch(e){}};
// esc(): makes text safe to put in HTML (stops names breaking the page).
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

// on(t): display name of an org ("O1"/"O2"); falls back to "Org 1"/"Org 2" when no custom name is set.
// tg(t): short uppercase tag (max 6 chars) shown next to player names.
const on=t=>(t==="O2"?S.n2:S.n1)||(t==="O2"?"Org 2":"Org 1"),tg=t=>t?on(t).toUpperCase().slice(0,6):"";

// ---------- 3. Bracket logic ----------
// teamOf(name): which org a player belongs to ("O1"/"O2").
const teamOf=n=>(S.roster.find(x=>x.n===n)||{}).t||"";
// ent(r,i): the two players in a match. Round 1 reads from S.pairs;
// later rounds take the winners of the two matches that feed into it.
const ent=(r,i)=>r===0?(S.pairs[i]||[null,null]):[win(r-1,2*i),win(r-1,2*i+1)];
// win(r,i): the winner's name, or null if no result yet (or a tie).
function win(r,i){const s=S.scores[r][i];if(!s||s[0]===s[1])return null;return ent(r,i)[s[0]>s[1]?0:1]}
// lost(n): true if this player has lost any match (used for "Eliminated").
function lost(n){for(let r=0;r<5;r++)for(let i=0;i<SZ[r];i++){const s=S.scores[r][i];if(s&&s[0]!==s[1]){const k=ent(r,i).indexOf(n);if(k>-1&&s[k]<s[1-k])return true}}return false}
// clear(r,i): when a result changes, wipe the matches it feeds into, all the way to the Final.
function clear(r,i){if(r+1<5){const j=i>>1;if(S.scores[r+1][j]){S.scores[r+1][j]=null;clear(r+1,j)}}}

// ---------- 4. Dates, times & status ----------
// fmt(): formats a number for display (en-GB).
const fmt=n=>n.toLocaleString("en-GB");
// getStart(r): the start date/time set for a round, or null.
function getStart(r){return S.rs[r]?new Date(S.rs[r]):null}
// loc(d): turns a Date into "YYYY-MM-DDTHH:MM" for datetime-local inputs.
const loc=d=>d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate())+"T"+p2(d.getHours())+":"+p2(d.getMinutes());
// dShort(d): short date like "27 Oct".
const dShort=d=>d.getDate()+" "+MON[d.getMonth()];
// mStart(r,i): when a match starts: its own override if set, else round start + 5 minutes per match.
const mStart=(r,i)=>{const o=S.mt[r+"-"+i];if(o)return new Date(o);const g=getStart(r);return g?new Date(g.getTime()+i*300000):null};
// when(r,i): readable match time, e.g. "Tue 27 Oct, 21:00".
function when(r,i){const d=mStart(r,i);if(!d)return"Time not set";return DAY[d.getDay()]+" "+d.getDate()+" "+MON[d.getMonth()]+", "+p2(d.getHours())+":"+p2(d.getMinutes())}
// dates(): the event date range shown in the header.
const dates=()=>{const L=[0,1,2,3,4].map(getStart).filter(Boolean).sort((a,b)=>a-b);if(L.length){const a=dShort(L[0]),z=dShort(L[L.length-1]);return a===z?a:a+" — "+z}if(S.start){const[y,m,d]=S.start.split("-").map(Number);return dShort(new Date(y,m-1,d))}return"Not set"};
// upd(): time of the last save as HH:MM.
const upd=()=>{const d=S.updated?new Date(S.updated):new Date();return p2(d.getHours())+":"+p2(d.getMinutes())};
// done(r): how many matches in round r have a result.
const done=r=>S.scores[r].filter(s=>s&&s[0]!==s[1]).length;
// stat(r,i): match status: "c" = complete, "l" = live, "s" = scheduled.
function stat(r,i){const s=S.scores[r][i];if(s&&s[0]!==s[1])return"c";return S.live[r+"-"+i]?"l":"s"}

// ---------- 5. Public page HTML builders ----------
// player(): HTML for one player in a match row (avatar, name, org tag, score, crown if winner).
function player(n,s,w,l){if(!n)return'<div class="p tbd">TBD</div>';return`<div class="p ${teamOf(n)} ${w?"win":""} ${l?"lose":""}"><span class="av">${esc(n[0].toUpperCase())}</span><span class="n">${esc(n)}</span><span class="t">${esc(tg(teamOf(n)))}</span>${s!=null?`<span class="s">${fmt(s)}</span>`:""}${w?"<span>♛</span>":""}</div>`}
// matchRow(): one full match row on the public list (time, both players, status).
function matchRow(r,i){const e=ent(r,i),s=S.scores[r][i],st=stat(r,i),w=st==="c"?(s[0]>s[1]?0:1):-1;
return`<div class="m ${st}"><div class="when"><b>${when(r,i)}</b><span>${RN[r]} · Match ${i+1}</span></div>${player(e[0],s?s[0]:null,w===0,w===1)}<div class="vs">vs</div>${player(e[1],s?s[1]:null,w===1,w===0)}<div class="st">${st==="c"?"<b>Complete</b><span>Winner advances</span>":st==="l"?'<b class="lv">Live now</b>':"<span>Scheduled</span>"}</div></div>`}
// tabsHtml(): the row of round buttons. fn = name of the function to call when one is clicked.
const tabsHtml=(cur,fn)=>`<div class="tabs" role="tablist">${RN.map((n,i)=>`<button role="tab" aria-selected="${i===cur}" class="${i===cur?"on":""}" onclick="${fn}(${i})">${n}<small>${done(i)}/${SZ[i]}</small></button>`).join("")}</div>`;
// creatorsHtml(): the two player lists (Org 1 / Org 2) with Still in / Eliminated tags.
function creatorsHtml(){const col=(t,h)=>{const L=S.roster.filter(x=>x.t===t);return`<div class="col ${t}"><h3><span>${h}</span><span>${L.length}</span></h3>${L.map(x=>`<div class="cr"><span class="av">${esc(x.n[0].toUpperCase())}</span>${esc(x.n)} <span class="pill ${lost(x.n)?"out":"in"}">${lost(x.n)?"Eliminated":"Still in"}</span></div>`).join("")}</div>`};return`<div class="cols">${col("O1",esc(on("O1")))}${col("O2",esc(on("O2")))}</div>`}
// tally(): per-org match wins, points scored and players still in.
function tally(){const t={O1:{w:0,p:0,a:0,n:0},O2:{w:0,p:0,a:0,n:0}};S.roster.forEach(x=>{const o=t[x.t];if(o){o.n++;if(!lost(x.n))o.a++}});
for(let r=0;r<5;r++)for(let i=0;i<SZ[r];i++){const s=S.scores[r][i];if(s&&s[0]!==s[1]){const e=ent(r,i);[0,1].forEach(k=>{const o=t[teamOf(e[k])];if(o){o.p+=s[k];if(s[k]>s[1-k])o.w++}})}}return t}
// feat(): the matches worth showing first: everything live, otherwise the next playable match.
function feat(){const L=[];let N=null;for(let r=0;r<5;r++)for(let i=0;i<SZ[r];i++){const e=ent(r,i);if(!(e[0]&&e[1]))continue;const st=stat(r,i);if(st==="l")L.push([r,i]);else if(st==="s"&&!N)N=[r,i]}return L.length?{k:"Live now",L}:N?{k:"Up next",L:[N]}:null}
// head(cur): top bar, navigation and the Org 1 vs Org 2 scoreboard.
function head(cur){const t=tally(),a=t.O1.w,b=t.O2.w,ch=win(4,0),f=feat(),cd=S.scores.flat().filter(s=>s&&s[0]!==s[1]).length;
const nav=[["","Matches"],["bracket","Bracket"],["players","Players"]].map(([k,n])=>`<button class="${k===cur?"on":""}" onclick="go('${k}')">${n}</button>`).join("");
const side=(c,o,n)=>`<div class="side ${c}"><span class="org">${o}</span><b class="big">${t[n].w}</b><span class="lbl">match wins</span><span class="alive">${t[n].a} of ${t[n].n} still in · ${fmt(t[n].p)} pts</span></div>`;
const tm=S.title?"":" dim";
return`<header class="top"><a class="brand" href="#" onclick="go('');return false"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 3L7 17.5v29L32 61z" fill="var(--o1)"/><path d="M32 3l25 14.5v29L32 61z" fill="var(--o2)"/></svg><span>${esc(S.title||"Tournament")}</span></a><nav class="seg" aria-label="Tournament views">${nav}</nav><button class="pri adm" onclick="go('admin')">🔒 Admin</button></header>
<section class="clash"><p class="sub">${esc(dates())}${S.sub?" — "+esc(S.sub):""}</p><h1 class="${tm}">${esc((S.title||"Event title").toUpperCase())}</h1>
<div class="board">${side("o1",esc(on("O1")),"O1")}<div class="mid"><b>VS</b><span>${cd} of 31 played</span></div>${side("o2",esc(on("O2")),"O2")}</div>
<div class="tug" role="img" aria-label="Match wins: ${esc(on("O1"))} ${a}, ${esc(on("O2"))} ${b}"><i class="o1" style="flex:${a||1}"></i><i class="o2" style="flex:${b||1}"></i></div>
${ch?`<div class="champ ${teamOf(ch).toLowerCase()}"><span>Champion</span><b>♛ ${esc(ch)}</b><em>${esc(on(teamOf(ch)))}</em></div>`:f?`<div class="feat"><h2>${f.k}</h2>${f.L.map(([r,i])=>matchRow(r,i)).join("")}</div>`:""}</section>`}
// pub(h): the public page. h = "" (matches), "bracket" or "players".
function pub(h){const bk=h==="bracket",pl=h==="players",cur=bk?"bracket":pl?"players":"";
const body=bk?`<p class="meta">Tap a player to trace their run. Scroll sideways on small screens.</p><div class="bwrap">${bracketSvg()}</div>`:pl?creatorsHtml():`${tabsHtml(view,"setView")}<p class="meta">${SZ[view]} matches in ${RN[view]}, ${done(view)} complete</p><div class="ml">${S.scores[view].map((_,i)=>matchRow(view,i)).join("")}</div>`;
return head(cur)+`<main>${body}</main><footer class="foot"><span>Updated ${upd()}</span></footer>`}

// bracketSvg(): draws the bracket as an SVG. Org 1 fills the left half, Org 2 the right half,
// and the two sides meet at the Final in the middle.
// w = box width, P = column spacing, H = box height, pt = vertical spacing, W/Ht = total size.
function bracketSvg(){const w=132,P=146,H=26,pt=30,top=30,W=8*P+2*w+18,Ht=top+16*pt+78;
// X(): left position of a column. ys(): vertical position of a box (later rounds sit midway between the two boxes feeding them).
const X=(sd,c)=>sd===0?c*P:W-w-c*P,ys=(r,j)=>r===0?top+j*pt:(ys(r-1,2*j)+ys(r-1,2*j+1))/2;
// cs(): shortens big scores (1500 -> "1.5k"). tr(): cuts long names with an ellipsis.
const cs=n=>n>=1000?(n/1000).toFixed(1)+"k":String(n),tr=n=>n.length>14?n.slice(0,13)+"…":n;
let g="";
// Loop 1: draw a box for every player slot (name + score), highlighting winners and fading losers.
for(let r=0;r<5;r++)for(let k=0;k<2*SZ[r];k++){const sd=k<SZ[r]?0:1,j=sd?k-SZ[r]:k,i=k>>1,q=k&1,e=ent(r,i)[q],sc=S.scores[r][i],dn=stat(r,i)==="c",isW=dn&&sc[q]>sc[1-q],isL=dn&&!isW,x=X(sd,r),y=ys(r,j);
const oc=e?(teamOf(e)==="O2"?"o2":"o1"):"";g+=`<g class="sl2" data-p="${e?esc(e):""}"><rect x="${x}" y="${y}" width="${w}" height="${H}" rx="4" class="bs ${oc} ${isW?"bw":""}"/><rect x="${x}" y="${y}" width="3" height="${H}" class="ob ${oc}"/><text x="${x+7}" y="${y+17}" class="bt ${e?"":"bm"} ${isL?"bl":""}">${e?esc(tr(e)):"TBD"}</text>${sc?`<text x="${x+w-6}" y="${y+17}" text-anchor="end" class="bn">${cs(sc[q])}</text>`:""}</g>`;
// Draw the connector lines joining each pair of boxes to the next round.
if(r<4&&j%2===0){const a=y+H/2,b=ys(r,j+1)+H/2,ed=sd?x:x+w,d=sd?-1:1,xm=ed+d*(P-w)/2,xn=sd?X(1,r+1)+w:X(0,r+1),yn=ys(r+1,j>>1)+H/2;g+=`<path class="bc" d="M${ed} ${a}H${xm}V${b}H${ed}M${xm} ${yn}H${xn}"/>`}}
// Round titles across the top.
for(let c=0;c<4;c++)g+=`<text class="bh" x="${X(0,c)+w/2}" y="16">${RN[c]}</text><text class="bh" x="${X(1,c)+w/2}" y="16">${RN[c]}</text>`;
// Champion box at the bottom centre.
const ch=win(4,0),wy=top+16*pt+8;
g+=`<text class="bh" x="${W/2}" y="16">Final</text><rect x="${W/2-110}" y="${wy}" width="220" height="32" rx="3" class="bs ${ch?"bw":""}"/><text x="${W/2}" y="${wy+21}" text-anchor="middle" class="bwl">${ch?"♛ "+esc(ch):"TBD"}</text><text x="${W/2}" y="${wy+52}" text-anchor="middle" class="bh">Winner</text>`;
return`<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="32 team single elimination bracket" class="bsvg">${g}</svg>`}

// ---------- 6. Admin page HTML builders ----------
// login(): the passcode form shown before admin access.
function login(){return`<div class="login card"><h2 style="margin-top:0">Admin login</h2><label for="pw">Passcode</label><input id="pw" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')doLogin()"><div class="err">${esc(err)}</div><p><button class="pri" onclick="doLogin()">Log in</button> <button onclick="go('')">Back to tournament</button></p></div>`}
// scSide(): one player's half of a scoring row: avatar, name, org tag, points label and score box.
function scSide(n,id,v,ok,i){const t=n?teamOf(n):"";return`<div class="sd"><div class="sp"><span class="av">${n?esc(n[0].toUpperCase()):"?"}</span><span class="n">${esc(n||"TBD")}</span>${t?`<span class="t ${t}">${esc(tg(t))}</span>`:""}</div><label class="sl" for="${id}">${esc(n||"TBD")} points</label><input type="number" min="0" inputmode="numeric" id="${id}" placeholder="0" value="${v}" ${ok?"":"disabled"} oninput="scChg(${i})"></div>`}
// scChg(i): enables "Save result" only once both score boxes have a number.
function scChg(i){const a=document.getElementById("a"+i),b=document.getElementById("b"+i),s=document.getElementById("sv"+i);if(s)s.disabled=a.disabled||a.value===""||b.value===""}
// admin(): builds the admin page. Picks the content for the current tab, then wraps it with the header and tab buttons.
function admin(){const tabs=["scoring","overview","players","matches","settings"];let b="";
// msg = the error and info messages shown at the top of a tab.
const msg=`<div class="err">${esc(err)}</div><div class="meta">${esc(note)}</div>`;
// TAB "scoring": one row per match in the chosen round, each with two score boxes and Save result / Full editor buttons.
if(tab==="scoring"){const a=aview;b=`<h3 class="sec">Matches</h3><div class="meta">Enter both final point totals and save the row. The higher scorer advances automatically.</div>${tabsHtml(a,"setAView")}<div class="meta">${done(a)} of ${SZ[a]} results saved · Points save one match at a time</div>`+S.scores[a].map((_,i)=>{const e=ent(a,i),s=S.scores[a][i]||["",""],ok=e[0]&&e[1],st=stat(a,i);return`<div class="sc"><div class="when"><b>Match ${i+1}</b><span>${when(a,i)}</span><span class="stl ${st}">${st==="c"?"Complete":st==="l"?"Live now":"Scheduled"}</span></div>${scSide(e[0],"a"+i,s[0],ok,i)}${scSide(e[1],"b"+i,s[1],ok,i)}<div class="sacts"><button class="gold" id="sv${i}" ${ok&&s[0]!==""&&s[1]!==""?"":"disabled"} onclick="saveRow(${a},${i})">Save result</button><button class="ghost" onclick="tab='matches';openEdit(${a},${i})">Full editor</button></div></div>`}).join("")+msg}
// TAB "overview": event status numbers (players assigned, org balance, matches complete, live) and bracket actions.
if(tab==="overview"){const f=S.roster.filter(x=>x.t==="O1").length,live=Object.values(S.live).filter(Boolean).length,cd=S.scores.flat().filter(s=>s&&s[0]!==s[1]).length;
b=`<h3 class="sec">Event status</h3><div class="meta">Changes appear automatically.</div><div class="grid2"><div class="kv"><span>Participants assigned</span><b>${S.roster.length} / 32</b></div><div class="kv"><span>Org balance</span><b>${f} ${esc(tg("O1"))} · ${S.roster.length-f} ${esc(tg("O2"))}</b></div><div class="kv"><span>Matches live</span><b>${live}</b></div><div class="kv"><span>Completed matches</span><b>${cd}</b></div></div><p class="acts"><button class="gold" onclick="setTab('players')"><i>＋</i>Manage players</button><button class="ico" onclick="setTab('matches')"><i>✎</i>Edit matches</button></p><hr><h3 class="sec">Bracket actions</h3><p class="acts"><button class="gold" ${S.pairs.some(Boolean)?"disabled":""} onclick="genBracket()">Generate bracket</button><button class="danger" onclick="resetBracket()">Reset bracket</button></p><div class="meta">Reset clears the draw and results, but keeps the roster.</div>${msg}`}
// TAB "players": roster lists with add / remove player.
if(tab==="players")b=`<div class="row"><h3 class="sec">Players · ${S.roster.length}</h3><p class="acts"><button class="gold" onclick="addForm=!addForm;render()"><i>＋</i>Add player</button></p></div><div class="meta">Add players to fill open org places. Removal does not reset the bracket; affected completed results require confirmation.</div>${addForm?`<div class="card"><label for="cn">Player name</label><input id="cn"><label for="ct">Org</label><select id="ct"><option value="O1">${esc(on("O1"))}</option><option value="O2">${esc(on("O2"))}</option></select><p><button class="pri" onclick="addCreator()">Add player</button></p></div>`:""}${msg}`+S.roster.map((x,i)=>`<div class="cr"><span class="t ${x.t}">${esc(tg(x.t))}</span>${esc(x.n)} <span class="pill ${lost(x.n)?"out":"in"}">${lost(x.n)?"Eliminated":"Still in"}</span><button class="danger sm" onclick="removeCreator(${i})">Remove</button></div>`).join("");
// TAB "matches": per-round schedule and match control; opens the full match editor when em is set.
if(tab==="matches")b=em?editForm(em.r,em.i):`<h3 class="sec">Rounds and match control</h3>${msg}`+RN.map((n,r)=>`<div class="row" style="margin-top:18px"><h3 class="sec">${n}</h3><button class="ico" onclick="sched=sched===${r}?-1:${r};render()"><i>🗓</i>Schedule round</button></div>`+(sched===r?`<div class="card"><label for="sd">Round start (UK time)</label><input type="datetime-local" id="sd" value="${getStart(r)?loc(getStart(r)):""}"><p><button class="pri" onclick="saveSched(${r})">Save schedule</button> <button onclick="saveSched(${r},1)">Clear schedule</button></p></div>`:"")+`<div class="card" style="padding:4px 14px">`+S.scores[r].map((_,i)=>{const e=ent(r,i),st=stat(r,i),ok=e[0]&&e[1]&&st!=="c";return`<div class="sr mr"><div>M${i+1} · ${esc(e[0]||"TBD")} vs ${esc(e[1]||"TBD")}<div class="meta">${when(r,i)}</div></div><span>${st==="c"?"Complete":st==="l"?"Live":"Scheduled"}</span><button ${ok?"":"disabled"} onclick="toggleLive('${r}-${i}')">${st==="l"?"End live":"Set live"}</button><button onclick="openEdit(${r},${i})">Edit</button></div>`}).join("")+`</div>`).join("");
// TAB "settings": edit event title / subtitle / start date and change the passcode.
if(tab==="settings")b=`<h3 class="sec">Public event details</h3><div class="meta">Displayed times use UK time (Europe/London).</div><p class="acts"><button class="gold" onclick="edit=!edit;render()"><i>⚙</i>Edit title, subtitle and start date</button></p>${edit?`<div class="card"><label for="et">Title</label><input id="et" value="${esc(S.title)}"><label for="es">Subtitle</label><input id="es" value="${esc(S.sub)}"><label for="ed">Start date</label><input type="date" id="ed" value="${S.start}"><p><button class="pri" onclick="saveDetails()">Save details</button></p></div>`:""}<hr><h3 class="sec">Team names</h3><div class="meta">Rename Org 1 and Org 2. The new names show on the scoreboard, bracket, player lists and admin.</div><div class="card"><div class="g2"><div><label for="n1">Org 1 name</label><input id="n1" maxlength="24" placeholder="Org 1" value="${esc(S.n1)}"></div><div><label for="n2">Org 2 name</label><input id="n2" maxlength="24" placeholder="Org 2" value="${esc(S.n2)}"></div></div><p><button class="pri" onclick="saveNames()">Save names</button> <button onclick="resetNames()">Reset to default</button></p></div><hr><h3 class="sec">Admin access</h3><div class="card"><label for="np">New admin passcode</label><input id="np" type="password" placeholder="Leave blank to keep"><p><button class="pri" onclick="savePass()">Save passcode</button></p></div>${msg}`;
// Final admin layout: banner, tab buttons, then the tab content above.
return`<div class="hero" style="justify-content:space-between"><div><div class="meta">${esc((S.title||"Event").toUpperCase())}</div><h1 class="ah">Tournament admin</h1></div><div><button onclick="go('')">View tournament</button> <button onclick="logout()">Log out</button></div></div><div class="atabs">${tabs.map(t=>`<button class="${t===tab?"on":""}" onclick="setTab('${t}')">${t}</button>`).join("")}</div>${b}`}

// ---------- 7. Navigation & rendering ----------
// render(): redraws the whole page from current state. Called after every change.
// The URL hash picks the page: #admin = admin (or login), #bracket = bracket, anything else = match list.
function render(){hlN="";document.title=S.title?S.title+(S.sub?" | "+S.sub:""):"Tournament";const h=location.hash.slice(1);document.getElementById("app").innerHTML=h==="admin"?(authed?admin():login()):pub(h);if(h==="admin"&&!authed){const p=document.getElementById("pw");p&&p.focus()}}
// go(h): changes the URL hash (the page) and redraws.
function go(h){err=note="";location.hash=h;render()}
// setView / setAView: switch the round tab on the public / admin page.
const setView=i=>{view=i;render()},setAView=i=>{aview=i;err=note="";render()};
// setTab(t): switches admin tab and closes any open forms.
function setTab(t){tab=t;em=null;err=note="";addForm=false;edit=false;sched=-1;render()}

// ---------- 8. Admin actions (these change data, then save and redraw) ----------
// doLogin(): checks the typed passcode against S.pass.
function doLogin(){if(document.getElementById("pw").value===S.pass){authed=true;try{sessionStorage.setItem("cottA","1")}catch(e){}err="";render()}else{err="Incorrect passcode.";render()}}
// logout(): ends the admin session and returns to the public page.
function logout(){authed=false;try{sessionStorage.removeItem("cottA")}catch(e){}go("")}
// saveRow(r,i): saves the two scores typed on a scoring row. Rejects blanks, negatives and ties;
// if the winner changed, later matches that depended on it are cleared.
function saveRow(r,i){const a=document.getElementById("a"+i).value,b=document.getElementById("b"+i).value;err=note="";
if(a===""||b===""||+a<0||+b<0){err="Enter both scores as positive numbers.";return render()}
if(+a===+b){err="Scores can’t be tied. A winner is needed to advance.";return render()}
const prev=win(r,i);S.scores[r][i]=[+a,+b];if(win(r,i)!==prev)clear(r,i);save();render()}
// sh(): returns a shuffled copy of an array (Fisher-Yates).
const sh=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
// genBracket(): the draw. Needs 16 players per org, shuffles both, and pairs each Org 1 player with an Org 2 player for Round 1.
function genBracket(){err=note="";const f=S.roster.filter(x=>x.t==="O1"),h=sh(S.roster.filter(x=>x.t==="O2"));if(f.length!==16||h.length!==16){err="Each org needs 16 players before the draw.";return render()}S.pairs=sh(f).map((x,i)=>[x.n,h[i].n]);note="Bracket generated.";save();render()}
// resetBracket(): after confirmation, clears the draw, all results and live flags (keeps the roster).
function resetBracket(){if(!confirm("Reset the draw and all results? The roster is kept."))return;S.pairs=[];S.scores=blank();S.live={};err="";note="Bracket reset.";save();render()}
// addCreator(): adds a player to the roster. Blocks blank names, duplicates, and more than 16 per org.
function addCreator(){const n=document.getElementById("cn").value.trim(),t=document.getElementById("ct").value;err=note="";
if(!n){err="Enter a player name.";return render()}
if(S.roster.some(x=>x.n.toLowerCase()===n.toLowerCase())){err="That player is already on the roster.";return render()}
if(S.roster.filter(x=>x.t===t).length>=16){err="That org already has 16 players. Remove one first.";return render()}
S.roster.push({n,t});addForm=false;note="Added "+n+".";save();render()}
// removeCreator(i): removes a player from the roster; asks first if they already have results.
function removeCreator(i){const x=S.roster[i];const used=S.scores.some((rd,r)=>rd.some((s,j)=>s&&ent(r,j).includes(x.n)));
if(used&&!confirm(x.n+" has completed results. Remove anyway? The bracket will not reset."))return;S.roster.splice(i,1);err="";note="Removed "+x.n+".";save();render()}
// toggleLive(k): flips a match's "Live now" flag (k = "r-i").
function toggleLive(k){S.live[k]=!S.live[k];save();render()}
// saveSched(r,c): saves a round's start time. c = true clears it.
function saveSched(r,c){const v=document.getElementById("sd").value;if(c||!v)delete S.rs[r];else S.rs[r]=v;save();sched=-1;render()}
// saveDetails(): saves the event title, subtitle and start date from the settings form.
function saveDetails(){const t=document.getElementById("et").value.trim(),s=document.getElementById("es").value.trim(),d=document.getElementById("ed").value;err=note="";
S.title=t;S.sub=s;S.start=/^\d{4}-\d{2}-\d{2}$/.test(d)?d:"";edit=false;note="Event details saved.";save();render()}
// saveNames(): saves custom names for the two orgs (blank = default "Org 1" / "Org 2").
function saveNames(){const a=document.getElementById("n1").value.trim(),b=document.getElementById("n2").value.trim();err=note="";
if((a||"Org 1").toLowerCase()===(b||"Org 2").toLowerCase()){err="The two orgs need different names.";return render()}
S.n1=a;S.n2=b;note="Team names saved.";save();render()}
// resetNames(): back to "Org 1" / "Org 2".
function resetNames(){S.n1=S.n2="";err="";note="Team names reset.";save();render()}
// savePass(): saves a new admin passcode.
function savePass(){const p=document.getElementById("np").value;err=note="";if(!p){err="Enter a new passcode.";return render()}S.pass=p;note="Passcode updated.";save();render()}

// ---------- 9. Full match editor ----------
// editForm(r,i): builds the full editor for one match (players, date/time, status, points).
// Players can only be changed in Round 1; later rounds are filled by winners.
function editForm(r,i){const e=ent(r,i),sc=S.scores[r][i]||["",""],st=stat(r,i),g=mStart(r,i),ro=r>0,
dv=g?g.getFullYear()+"-"+p2(g.getMonth()+1)+"-"+p2(g.getDate()):"",tv=g?p2(g.getHours())+":"+p2(g.getMinutes()):"",
dl=t=>S.roster.filter(x=>x.t===t).map(x=>`<option value="${esc(x.n)}">`).join(""),
msg=`<div class="err">${esc(err)}</div>`,both=e[0]&&e[1];
return`<div class="meta">MATCH CONTROL</div><h2 style="margin:4px 0 14px">Edit ${RN[r]} match</h2>${msg}<div class="g2"><div><label for="ma">${esc(on("O1"))} username</label><input id="ma" list="lA" value="${esc(e[0]||"")}" ${ro?"disabled":""}></div><div><label for="mb">${esc(on("O2"))} username</label><input id="mb" list="lB" value="${esc(e[1]||"")}" ${ro?"disabled":""}></div></div><datalist id="lA">${dl("O1")}</datalist><datalist id="lB">${dl("O2")}</datalist><div class="meta">${ro?"Players in this round come from earlier results.":"Type a username or choose a suggestion. Choose a player from the correct org. A player already in this round swaps places. Changing participants resets this match’s scores; affected saved scores and results require confirmation."}</div><div class="g2"><div><label for="md">Date · UK</label><input type="date" id="md" value="${dv}"></div><div><label for="mt">Time · UK</label><input type="time" id="mt" value="${tv}"></div></div><label for="ms">Status</label><select id="ms"><option value="s" ${st==="s"?"selected":""}>Scheduled</option><option value="l" ${st==="l"?"selected":""}>Live</option><option value="c" ${st==="c"?"selected":""}>Completed</option></select><div class="g2"><div><label for="pa">${esc(e[0]||on("O1")+" player")} points</label><input type="number" min="0" id="pa" value="${sc[0]}" ${both?"":"disabled"}></div><div><label for="pb">${esc(e[1]||on("O2")+" player")} points</label><input type="number" min="0" id="pb" value="${sc[1]}" ${both?"":"disabled"}></div></div><div class="meta">Enter the final points and choose Save result. The higher score advances automatically. Ties cannot be completed.</div><hr><p class="acts end"><button onclick="em=null;err='';render()">Cancel</button><button onclick="saveMatch(${r},${i})">Save match</button><button class="gold" ${both?"":"disabled"} onclick="saveResult(${r},${i})">Save result</button></p>`}
// openEdit(r,i): opens the full editor for a match.
function openEdit(r,i){em={r,i};err=note="";render()}
// applyDetails(r,i): reads the editor's player and date/time fields and applies them.
// Changing Round 1 players swaps pairings and resets affected scores (after confirmation).
// Returns false if something is invalid so the caller can stop.
function applyDetails(r,i){const gv=id=>document.getElementById(id).value.trim();
if(r===0){const cur=ent(0,i),nw=[null,null];
for(let k=0;k<2;k++){const v=gv(k?"mb":"ma");if(v){const p=S.roster.find(x=>x.t===(k?"O2":"O1")&&x.n.toLowerCase()===v.toLowerCase());if(!p){err="Choose a player from "+on(k?"O2":"O1")+".";return false}nw[k]=p.n}}
if(nw[0]!==cur[0]||nw[1]!==cur[1]){const sw=[];for(let k=0;k<2;k++)if(nw[k]&&nw[k]!==cur[k]){const j=S.pairs.findIndex((q,x)=>q&&x!==i&&q[k]===nw[k]);if(j>-1)sw.push([j,k])}
const aff=[i,...sw.map(x=>x[0])];
if(aff.some(m=>S.scores[0][m])&&!confirm("Changing participants resets saved scores and results for the affected matches. Continue?"))return false;
S.pairs[i]=S.pairs[i]||[null,null];for(let k=0;k<2;k++)if(nw[k]!==cur[k])S.pairs[i][k]=nw[k];
sw.forEach(([j,k])=>{S.pairs[j][k]=cur[k]});
aff.forEach(m=>{if(S.scores[0][m]){S.scores[0][m]=null;clear(0,m)}delete S.live["0-"+m]});save()}}
const d=gv("md"),t=gv("mt"),key=r+"-"+i;
if(d&&t)S.mt[key]=d+"T"+t;else if(!d&&!t)delete S.mt[key];else{err="Enter both a date and a time, or clear both.";return false}
return true}
// saveMatch(r,i): saves the editor's status (Scheduled / Live / Complete). Clearing a finished match asks first.
function saveMatch(r,i){err=note="";if(!applyDetails(r,i))return render();const st=document.getElementById("ms").value,k=r+"-"+i,e=ent(r,i),has=stat(r,i)==="c";
if(st==="c"&&!has){err="Enter the points and choose Save result to complete this match.";return render()}
if(st==="l"&&!(e[0]&&e[1])){err="Both players are needed to set a match live.";return render()}
if(st!=="c"&&has){if(!confirm("This match has a saved result. Clear it?"))return render();S.scores[r][i]=null;clear(r,i)}
if(st==="l")S.live[k]=true;else delete S.live[k];
em=null;note="Match saved.";save();render()}
// saveResult(r,i): saves players, time and the two points from the editor in one go, and marks the match complete.
function saveResult(r,i){err=note="";if(!applyDetails(r,i))return render();const a=document.getElementById("pa").value,b=document.getElementById("pb").value;
if(a===""||b===""||+a<0||+b<0){err="Enter both scores as positive numbers.";return render()}
if(+a===+b){err="Scores can’t be tied. A winner is needed to advance.";return render()}
const prev=win(r,i);S.scores[r][i]=[+a,+b];if(win(r,i)!==prev)clear(r,i);delete S.live[r+"-"+i];em=null;note="Result saved.";save();render()}

// Trace a player: click a slot in the bracket to highlight every slot with that name.
document.addEventListener("click",e=>{const s=document.querySelector(".bsvg");if(!s)return;const g=e.target.closest&&e.target.closest(".sl2"),n=g&&g.dataset.p;hlN=n&&n!==hlN?n:"";s.classList.toggle("hl",!!hlN);s.querySelectorAll(".sl2").forEach(x=>x.classList.toggle("on",!!hlN&&x.dataset.p===hlN))});

// ---------- 10. Start ----------
// Redraw whenever the URL hash changes, and draw once on load.
window.addEventListener("hashchange",render);render();