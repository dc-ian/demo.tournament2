// Pure tournament logic: no DOM, no storage. Imported by script.js and covered by logic.test.js.
export const MAX=5;
export const sh=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
export const okNum=x=>x!==""&&x!=null&&Number.isFinite(+x)&&+x>=0&&+x<=99999;
export const str=(s,n)=>typeof s==="string"?s.slice(0,n):"";

// Validate everything read from storage or an import file. Corrupt or hostile data can't crash or inject.
export function clean(raw){
  const o={T:[]};
  if(!raw||typeof raw!=="object")return o;
  if(typeof raw.hash==="string"&&typeof raw.salt==="string"){o.hash=raw.hash;o.salt=raw.salt}
  else if(typeof raw.pass==="string"&&raw.pass)o.pass=raw.pass; // legacy plaintext, upgraded on next login
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
      t.type="team";t.size=1;t.teams=teams;if(Array.isArray(x.og)&&x.og.length===2){const g=x.og.map(y=>str(y,40).trim());if(g.every(Boolean))t.og=g}
      const R=32-Math.clz32(teams.length-1),p=1<<R;
      const good=Array.isArray(x.pairs)&&x.pairs.length===p/2&&x.pairs.every(q=>Array.isArray(q)&&q.length===2&&q.every(i=>i===null||Number.isInteger(i)&&i>=0&&i<teams.length))
        &&Array.isArray(x.sc)&&x.sc.length===R&&x.sc.every((rd,r)=>Array.isArray(rd)&&rd.length===p>>(r+1)&&rd.every(s=>s===null||Array.isArray(s)&&s.length===2&&okNum(s[0])&&okNum(s[1])&&+s[0]!==+s[1]));
      if(good){t.pairs=x.pairs;t.sc=x.sc.map(rd=>rd.map(s=>s&&[+s[0],+s[1]]))}else draw(t)
    }
    t.mt={};Object.entries(x.mt||{}).forEach(([k,s])=>{if(/^\d+_\d+$/.test(k)&&/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s))t.mt[k]=s});
    t.live={};Object.entries(x.live||{}).forEach(([k,s])=>{if(/^\d+_\d+$/.test(k)&&s===true)t.live[k]=true});
    o.T.push(t)});
  return o}

// ---------- Bracket logic (team formats) ----------
// Teams are padded to a power of two with byes, which advance automatically.
export const seedOrder=p=>{let o=[0];while(o.length<p){const n=o.length*2;o=o.flatMap(x=>[x,n-1-x])}return o};
export function draw(t,list){const n=t.teams.length,R=32-Math.clz32(n-1),p=1<<R,o=(list?x=>x:sh)(t.teams.map((_,i)=>i));
  while(o.length<p)o.push(null);
  const s=seedOrder(p); // standard seeding: byes go to top seeds and never stack up in one match
  t.pairs=Array.from({length:p/2},(_,i)=>[o[s[2*i]],o[s[2*i+1]]]);
  t.sc=Array.from({length:R},(_,r)=>Array(p>>(r+1)).fill(null));t.mt={};t.live={}}
export const ent=(t,r,i)=>r?[win(t,r-1,2*i),win(t,r-1,2*i+1)]:t.pairs[i];
export function win(t,r,i){const[a,b]=ent(t,r,i);
  if(!r){if(a!=null&&b==null)return a;if(b!=null&&a==null)return b}
  const s=t.sc[r][i];return s&&s[0]!==s[1]?(s[0]>s[1]?a:b):null}
export function clear(t,r,i){if(r+1<t.sc.length){const j=i>>1;if(t.sc[r+1][j]){t.sc[r+1][j]=null;clear(t,r+1,j)}}}
export const champ=t=>win(t,t.sc.length-1,0);


export const tot=(t,i)=>(t.pts[i]||[]).reduce((a,x)=>a+(x||0),0);
export function board(t){const L=t.pl.map((n,i)=>({i,n,s:tot(t,i)})).sort((a,b)=>b.s-a.s||a.i-b.i);
  L.forEach((x,k)=>{x.rank=k&&L[k-1].s===x.s?L[k-1].rank:k+1});return L}

export const fin=t=>t.type==="ffa"?!!t.done:champ(t)!=null;
export function prog(t){let d=0;
  if(t.type==="ffa"){for(let r=0;r<t.rn;r++)if(t.pl.every((_,i)=>(t.pts[i]||[])[r]!=null))d++;return[d,t.rn]}
  t.sc.forEach(x=>x.forEach(s=>{if(s)d++}));return[d,t.teams.length-1]}