/* Mandarin 老師 — no-build SPA. Routes: #/ (index) · #/lesson/<id> · #/practice · #/practice/<id>.
   Lessons: lessons/<id>/lesson.json. Conversation practice: conversations/<id>/entry.json (same score schema). */
(()=>{"use strict";
const APPV="1";
const C={1:"#E4572E",2:"#17A398",3:"#3B5BDB",4:"#9C36B5",5:"#868E96"},G={1:"ˉ",2:"ˊ",3:"ˇ",4:"ˋ",5:"·"};
const $=id=>document.getElementById(id),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const OWN='<p class="own">Personal study notes. Audio belongs to its respective owners.</p>';
let A={},LBL={},EL={};          // audio key -> url / label
const au=new Audio();au.preload="auto";let rate=1,curEl=null,curK=null,dragging=false;
const HZ=z=>z?(z.s?`<span class="T">${esc(z.t)}</span><span class="S">${esc(z.s)}</span>`:esc(z.t)):"";
const H2=z=>z&&z.s?`<span class="h2"><span class="T">${esc(z.t)}</span><span class="S">${esc(z.s)}</span></span>`:'<span class="h2"></span>';
function cell(c){
 if(c.pu)return `<span class="pu">${esc(c.pu)}</span>`;
 if(c.lat)return `<span class="sy"><b>&nbsp;</b><i>${esc(c.py)}</i><span class="hz lat">${esc(c.ch)}</span><span class="h2"></span><span class="ex"></span></span>`;
 const col=C[c.t]||C[5],z={t:c.ch,s:c.s};
 const mk=c.mk?`<span class="mk k-${c.mk[0]}" style="color:${c.mk[2]}">${esc(c.mk[1])}</span>`:"";
 const said=c.said?`<span class="said">said ${esc(c.said)}</span>`:"";
 const fc=(c.fc||[]).map(([l,t])=>`<span class="fc" title="${esc(t)}">${esc(l)}</span>`).join("");
 const pz=c.pz?`<small class="pz">${esc(c.pz)}</small>`:"";
 return `<span class="sy"><b style="color:${col}">${G[c.t]||G[5]}</b><i>${mk}${esc(c.py)}</i><span class="hz" style="border-color:${col}">${HZ(z)}${pz}</span>${H2(z)}<span class="ex">${said}${fc}</span></span>`}
const cues=cs=>cs&&cs.length?`<div class="cues">${cs.map(q=>q.chip?`<div><span class="fc">${esc(q.chip)}</span> <u>${esc(q.lab)}</u> ${esc(q.cue)}</div>`:`<div class="r-${esc(q.kind)}"><b style="color:${q.col}">${esc(q.sym)}</b> <u>${esc(q.lab)}</u> ${esc(q.cue)}</div>`).join("")}</div>`:"";
function bits(words){if(!words||!words.length)return "";
 return `<div class="bits">`+words.map(w=>`<span class="bit"><b class="hz">${HZ({t:w.t,s:w.s})}</b> <i>${esc(w.py)}</i> <span class="ent">${esc(w.en)}</span></span>`).join("")+`</div>`}
let base="";
function reg(a){const k=a.src;const mapped=window.AUDIO&&window.AUDIO[k];A[k]=mapped||(/^(data:|https?:|blob:)/.test(k)?k:(base+k));if(!LBL[k])LBL[k]=a.label||k;return k}
const scoreBadge=a=>a.real?`<span class="real sm" title="re-transcription score ${a.score??"–"}">REAL</span>`+(a.score!=null&&(a.score<0.9||a.ok===false)?` <span class="syn" title="lower re-transcription match: spot-listen">check ⚠ ${a.score}</span>`:""):`<span class="syn">synthetic</span>`;
function line(it,isPod){
 const au0=it.audio||[];au0.forEach(reg);
 const da=au0.length?` data-a="${esc(au0[0].src)}"`:"";
 const spk=(it.spk!==undefined&&(!isPod||it.spk))?`<span class="spk ${it.g==="m"?"m":"f"}">${esc(it.spk)}</span>`:"";
 let bb="",bd="";
 if(it.buttons){bb=au0.map(a=>`<button class="pb" data-k="${esc(a.src)}">${a.kind==="slow"?"🐢 slow":"⚡ natural"}</button>`).join("");
  bd=au0.length?[...new Set(au0.map(a=>(a.kind==="slow"?"🐢 ":"⚡ ")+scoreBadge(a)))].join(" "):'<span class="syn">no clip</span>'}
 else bd=au0[0]?(au0[0].real?'<span class="real">▶ REAL clip</span>':`<span class="syn">▶ synthetic · ${esc(au0[0].voice||"")} TW voice</span>`):"";
 const pyl=it.py?`<div class="pyl">${esc(it.py)}</div>`:"";
 const note=it.note?`<div class="note">${esc(it.note)}</div>`:"";
 return `<div class="ln"${da}>${spk}<div class="sc">${it.cells.map(cell).join("")}</div><div class="en">${bb}<span class="ent">${esc(it.en)}</span> ${bd}</div>${pyl}${bits(it.words)}${note}${cues(it.cues)}<button class="pk" title="peek: show all hints for this line">👁</button></div>`}
function vocab(items){let h="",grp=null;for(const it of items){(it.audio||[]).forEach(reg);
 if(it.grp&&it.grp!==grp){grp=it.grp;h+=`<h3>${esc(grp)}</h3>`}
 const a=it.audio&&it.audio[0];
 h+=`<div class="vw"${a?` data-a="${esc(a.src)}"`:""}><div class="sc">${it.cells.map(cell).join("")}</div><div class="vg"><b class="ent">${esc(it.en)}</b>${it.note?`<div class="nt cuex">${esc(it.note)}</div>`:""}${cues(it.cues)}</div><span class="play">${a?(a.real?'<span class="real sm">REAL</span>':'<span class="syn">synthetic</span>'):""}</span><button class="pk" title="peek">👁</button></div>`}return h}
const cards=xs=>(xs||[]).map(([a,b])=>`<div class="card"><h4>${esc(a)}</h4><p>${esc(b)}</p></div>`).join("");
function drill(s){const lead=s.lead?`<p class="kick">${esc(s.lead)}</p>`:"";
 return lead+(s.items||[]).map(it=>{
  const zh=`<div class="sc">${(it.cells||[]).map(cell).join("")}</div>`;
  const prompt=it.kind==="zh"?zh:`<p class="ent">${esc(it.prompt||it.en||"")}</p>`;
  let back="";
  if(it.audio&&it.audio[0]){const k=reg(it.audio[0]);back+=`<div class="en"><button type="button" class="pb" data-k="${esc(k)}">▶</button> <span class="syn">synthetic</span></div>`}
  if(it.kind!=="zh")back+=zh;
  if(it.py)back+=`<div class="pyl">${esc(it.py)}</div>`;
  if(it.kind==="zh")back+=`<div class="en"><span class="ent">${esc(it.en||"")}</span></div>`;
  back+=bits(it.words);
  if(it.note)back+=`<div class="note">${esc(it.note)}</div>`;
  return `<div class="dcard" data-drill="${esc(it.kind||"en")}" data-tag="${esc(it.tag||"")}"><div class="dtag">${esc(it.tag||"Recall")}</div><div class="dprompt">${prompt}</div><button type="button" class="drev" aria-expanded="false">Reveal</button><div class="dback" hidden>${back}</div></div>`}).join("")}
function section(s,L){
 const hd=(id)=>`<h2${id?` id="${id}"`:""}>${esc(s.title)} ${HZ(s.zh)} ${s.kick?`<small class="kick">${esc(s.kick)}</small>`:""}</h2>`;
 const pod=L.kind==="podcast";
 switch(s.type){
  case"tracks":return hd()+s.items.map(t=>{const k=reg(t.audio[0]);return `<div class="trk" data-a="${esc(k)}"><div class="tl"><span class="real">${esc(t.badge||"REAL")}</span> ${esc(t.label)}</div><span class="go">▶</span></div>`}).join("")+(s.links&&s.links.length?`<p class="kick">${s.links.map(l=>`<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(" · ")}</p>`:"");
  case"lines":return hd()+s.items.map(i=>line(i,pod)).join("");
  case"vocab":return hd()+vocab(s.items);
  case"hints":return hd("hintsh")+`<div id="hints">`+s.items.map(h=>{const a=h.audio&&h.audio[0];if(a)reg(a);return `<div class="hint"${a?` data-a="${esc(a.src)}"`:""}><div class="w">${HZ(h.word)}${H2(h.word)}<small>${esc(h.py)}</small></div><p>${esc(h.hint)} ${a&&a.real?'<span class="real sm">REAL</span>':""}</p></div>`}).join("")+cards(s.cards)+`</div>`;
  case"cards":return hd()+cards(s.items);
  case"quiz":return hd()+(s.items||[]).map(([q,a])=>`<details class="card"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("");
  case"drill":return hd()+drill(s);
  default:return ""}}
// ---------- player (port of lesson_ui.js) ----------
const fmt=t=>{t=isFinite(t)?Math.max(0,t):0;return Math.floor(t/60)+":"+String(Math.floor(t%60)).padStart(2,"0")};
const mark=on=>{if(curEl)curEl.classList.toggle("playing",on)};
function play(k,el){if(curK===k&&!au.paused){au.pause();return}
 if(curK!==k){mark(false);au.src=A[k];curK=k}curEl=el;au.playbackRate=rate;au.preservesPitch=true;mark(true);
 $("fpl").textContent=LBL[k]||k;$("fp").classList.add("show");document.body.classList.add("fpon");
 const p=au.play();if(p&&p.catch)p.catch(()=>{});
 if("mediaSession"in navigator){try{navigator.mediaSession.metadata=new MediaMetadata({title:LBL[k]||k,artist:"Mandarin 老師"})}catch(e){}}}
function seek(d){if(!au.src)return;const D=isFinite(au.duration)?au.duration:0;au.currentTime=Math.min(Math.max(0,au.currentTime+d),D?Math.max(0,D-0.05):au.currentTime+d)}
window.seek=seek;window.au=au;
au.onplay=()=>{$("fpp").textContent="⏸";mark(true)};au.onpause=()=>{$("fpp").textContent="▶"};au.onended=()=>{$("fpp").textContent="▶";mark(false)};
au.ontimeupdate=au.onloadedmetadata=()=>{$("fpt").textContent=fmt(au.currentTime);$("fpd").textContent=fmt(au.duration);if(!dragging&&au.duration)$("fps").value=Math.round(1000*au.currentTime/au.duration)};
$("fps").oninput=()=>{dragging=true;if(au.duration)$("fpt").textContent=fmt($("fps").value/1000*au.duration)};
$("fps").onchange=()=>{if(au.duration)au.currentTime=$("fps").value/1000*au.duration;dragging=false};
$("fpp").onclick=()=>{if(!au.src)return;au.paused?(au.playbackRate=rate,au.play()):au.pause()};$("fpb").onclick=()=>seek(-10);$("fpf").onclick=()=>seek(10);
if("mediaSession"in navigator){const ms=navigator.mediaSession;try{ms.setActionHandler("play",()=>au.play());ms.setActionHandler("pause",()=>au.pause());
 ms.setActionHandler("seekbackward",()=>seek(-10));ms.setActionHandler("seekforward",()=>seek(10))}catch(e){}}
// ---------- drawer + prefs ----------
$("ctl").innerHTML=window.CONTROLS;
function dr(o){$("drawer").classList.toggle("open",o);$("scrim").classList.toggle("open",o);$("dbtn").setAttribute("aria-expanded",o)}
$("dbtn").onclick=()=>dr(!$("drawer").classList.contains("open"));$("scrim").onclick=()=>dr(false);$("dclose").onclick=()=>dr(false);
document.addEventListener("keydown",e=>{if(e.key==="Escape")dr(false)});
const PK="llmPrefs",L9=["tone","py","mk","pos","cue","fc","en","sec","hz"],PRE={full:L9,pyhz:["py","hz","sec","en"],hz:["hz"],audio:[]};
let st;try{st=JSON.parse(localStorage.getItem(PK)||"null")}catch(e){}st=st||{on:L9.slice(),simp:false};
let pageSimp=null; // conversation pages open in simplified without rewriting the lesson preference
const simpNow=()=>pageSimp===null?!!st.simp:pageSimp;
function apply(){const b=document.body,simp=simpNow();L9.forEach(l=>b.classList.toggle("off-"+l,!st.on.includes(l)));b.classList.toggle("simp",simp);
 b.classList.toggle("hidden-some",st.on.length<L9.length);
 document.querySelectorAll("[data-l]").forEach(x=>x.classList.toggle("on",st.on.includes(x.dataset.l)));
 $("flip").textContent=simp?"简 simplified primary ⇄":"繁 traditional primary ⇄";
 document.querySelectorAll("[data-p]").forEach(x=>x.classList.toggle("on",JSON.stringify(PRE[x.dataset.p].slice().sort())==JSON.stringify(st.on.slice().sort())));
 document.documentElement.lang=simp?"zh-Hans":"zh-Hant";try{localStorage.setItem(PK,JSON.stringify(st))}catch(e){}}
if(st.rate){rate=st.rate}
const syncRate=()=>document.querySelectorAll(".speed button").forEach(x=>x.classList.toggle("on",+x.dataset.r===rate));syncRate();
document.querySelectorAll(".speed button").forEach(b=>b.onclick=()=>{rate=+b.dataset.r;syncRate();au.playbackRate=rate;st.rate=rate;apply()});
document.querySelectorAll("[data-l]").forEach(x=>x.onclick=()=>{const l=x.dataset.l;st.on=st.on.includes(l)?st.on.filter(y=>y!=l):st.on.concat([l]);apply()});
document.querySelectorAll("[data-p]").forEach(x=>x.onclick=()=>{st.on=PRE[x.dataset.p].slice();document.querySelectorAll(".peek").forEach(e=>e.classList.remove("peek"));apply()});
$("flip").onclick=()=>{if(pageSimp===null)st.simp=!st.simp;else pageSimp=!pageSimp;apply()};apply();
// delegated clicks on lesson content
$("app").addEventListener("click",e=>{
 const rev=e.target.closest(".drev");if(rev){e.stopPropagation();const back=rev.parentElement.querySelector(".dback");const open=back.hasAttribute("hidden");
  if(open)back.removeAttribute("hidden");else back.setAttribute("hidden","");rev.setAttribute("aria-expanded",open?"true":"false");rev.textContent=open?"Hide":"Reveal";return}
 const pk=e.target.closest(".pk");if(pk){e.stopPropagation();pk.parentElement.classList.toggle("peek");return}
 const pb=e.target.closest(".pb");if(pb){play(pb.dataset.k,pb);return}
 if(e.target.closest("a,summary,details.lg"))return;const el=e.target.closest("[data-a]");if(el)play(el.dataset.a,el)});
// ---------- data ----------
const getJSON=u=>fetch(u,{cache:"no-cache"}).then(r=>{if(!r.ok)throw new Error(u+" "+r.status);return r.json()});
let IDX=null;const idx=()=>IDX?Promise.resolve(IDX):getJSON("lessons/index.json").then(j=>IDX=j);
let PIDX=null;const pidx=()=>PIDX?Promise.resolve(PIDX):getJSON("conversations/index.json").then(j=>PIDX=j);
const isNew=d=>Date.now()-new Date(d).getTime()<7*864e5;
const fdate=d=>{try{return new Date(d).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}catch(e){return d}};
let filt=localStorage.getItem("laoshiFilter")||"all";
function lessonCard(l){return `<a class="lc" href="#/lesson/${encodeURIComponent(l.id)}" data-id="${esc(l.id)}">${isNew(l.date)?'<span class="new">NEW</span>':""}<div class="em" style="background:${esc(l.color||"#E9ECEF")}22">${esc(l.emoji||"📗")}</div><div class="bd"><h3>${esc(l.title)}</h3><div class="sub">${esc(l.subtitle||"")}</div><div class="meta">${esc(l.source)} · ${esc(fdate(l.date))}</div></div></a>`}
function practiceCard(l){return `<a class="lc" href="#/practice/${encodeURIComponent(l.id)}" data-id="${esc(l.id)}" data-kind="conversation">${isNew(l.date)?'<span class="new">NEW</span>':""}<div class="em" style="background:${esc(l.color||"#E9ECEF")}22">${esc(l.emoji||"💬")}</div><div class="bd"><h3>${esc(l.title)}</h3><div class="sub">${esc(l.subtitle||"")}</div><div class="meta">${esc(l.source||"Conversation Practice")} · ${esc(fdate(l.date))}</div></div></a>`}
function renderIndex(j,conv){pageSimp=null;const ls=j.lessons.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const srcs=[...new Set(ls.map(l=>l.source))];if(filt!=="all"&&!srcs.includes(filt))filt="all";
 const shown=ls.filter(l=>filt==="all"||l.source===filt);
 const entries=(conv&&conv.entries?conv.entries:[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 $("app").innerHTML=`<div class="hero"><h1>Mandarin 老師</h1><p>Textbook lessons, podcast lessons, and conversation practice · newest first · tap a card</p></div>
 <section id="practice" data-section="conversation"><h2 class="grp">Conversation Practice</h2>
 <p class="kick">Dated chat notes for later review. Separate from textbook and podcast lessons. Filters below apply to lessons only.</p>
 <div class="cards" id="practice-cards">${entries.map(practiceCard).join("")||"<p class='kick'>No conversation entries yet.</p>"}</div></section>
 <h2 class="grp">Lessons</h2>
 <div class="filters">${["all",...srcs].map(s=>`<button data-f="${esc(s)}" class="${s===filt?"on":""}">${s==="all"?"All":esc(s)}</button>`).join("")}</div>
 <div class="cards" id="cards">${shown.map(lessonCard).join("")}</div>${OWN}`;
 document.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{filt=b.dataset.f;localStorage.setItem("laoshiFilter",filt);renderIndex(j,conv)});apply()}
function renderPractice(j){pageSimp=null;const es=(j.entries||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 $("app").innerHTML=`<div class="hero"><h1>Conversation Practice</h1><p>Dated exchanges for reference, vocabulary, and phrase recall. Textbook and podcast lessons stay on the home list.</p></div>
 <div class="cards" id="practice-cards">${es.map(practiceCard).join("")||"<p class='kick'>No conversation entries yet.</p>"}</div>${OWN}`;apply()}
function renderLesson(L,basePath){A={};LBL={};pageSimp=L.script==="hans"?true:null;base=basePath||`lessons/${encodeURIComponent(L.id)}/`;
 $("app").innerHTML=`<article class="lesson" data-id="${esc(L.id)}" data-kind="${esc(L.kind||"")}" data-script="${esc(L.script||"")}"><div class="kick">${esc(L.kick)}</div><h1>${L.h1||esc(L.title)}</h1>${L.focus?`<div class="kick">Focus: ${esc(L.focus)}</div>`:""}
 ${window.LEGEND}<div class="key">${L.key||""}</div>${L.sections.map(s=>section(s,L)).join("")}
 <p class="kick">${esc(L.foot||"")} Markers 1 2 3 ʰ ° ~ ü ↗ ↓ and cues = house A3 Marker style; teal final chips are an HTML-only extension. Contours/sandhi idealized by rule, not measured.</p>${OWN}</article>`;apply()}
async function route(){const h=location.hash||"#/";const m=h.match(/^#\/lesson\/([^/?]+)/);const pm=h.match(/^#\/practice\/([^/?]+)/);const pi=/^#\/practice\/?$/.test(h);dr(false);
 if(curK){au.pause();mark(false)}
 try{if(m){const id=decodeURIComponent(m[1]);$("back").hidden=false;$("dbtn").hidden=false;$("tt").textContent="…";
   const L=await getJSON(`lessons/${encodeURIComponent(id)}/lesson.json`);document.title=(L.short||L.title)+" · Mandarin 老師";$("tt").textContent=L.short||L.title;renderLesson(L);window.scrollTo(0,0)}
  else if(pm){const id=decodeURIComponent(pm[1]);$("back").hidden=false;$("dbtn").hidden=false;$("tt").textContent="…";
   const L=await getJSON(`conversations/${encodeURIComponent(id)}/entry.json`);document.title=(L.short||L.title)+" · Mandarin 老師";$("tt").textContent=L.short||L.title;renderLesson(L,`conversations/${encodeURIComponent(id)}/`);window.scrollTo(0,0)}
  else if(pi){$("back").hidden=false;$("dbtn").hidden=true;$("tt").textContent="Conversation Practice";document.title="Conversation Practice · Mandarin 老師";renderPractice(await pidx());window.scrollTo(0,0)}
  else{$("back").hidden=true;$("dbtn").hidden=true;$("tt").textContent="Mandarin 老師";document.title="Mandarin 老師";
   const lessons=await idx();let conv={entries:[]};try{conv=await pidx()}catch(e){}renderIndex(lessons,conv)}}
 catch(e){$("app").innerHTML=`<div class="err">Couldn’t load: ${esc(e.message)}. <a href="#/">All lessons</a></div>`}}
$("back").onclick=()=>{location.hash=/^#\/practice\/.+/.test(location.hash)?"#/practice":"#/"};window.addEventListener("hashchange",route);route();
if("serviceWorker"in navigator&&location.protocol!=="file:")navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
