/* Service worker. Shell is versioned. Install fetches with cache:"reload" so GitHub
   Pages' max-age=600 HTTP cache cannot pin an old index.html or app.js into the
   new cache. index.html and app.js stay network-first and fall back to that cache
   offline. JSON is network-first. Audio is cached on first play (Range-aware).
   IndexedDB (study progress) is not touched. */
const V="laoshi-20261121023000";
const SHELL=["./","index.html","app.js","app.css","viewer.css","legend.js","manifest.webmanifest","icons/icon-180.png","icons/icon-192.png","icons/icon-512.png","phrasebook/page.js","phrasebook/page.css","phrasebook/card.mjs","phrasebook/search.mjs","phrasebook/packs.json","cards/page.js","cards/page.css","cards/fsrs.mjs","cards/tones.mjs","cards/queue.mjs","cards/settings.mjs","cards/storage.mjs","cards/sync.mjs","tools/conversation/pinyin.mjs"];
function shellRequest(path){return new Request(new URL(path,self.registration.scope),{cache:"reload"})}
async function storeFresh(cache,url,res){
 const buf=await res.arrayBuffer();
 const headers=new Headers(res.headers);
 const copy=()=>new Response(buf.slice(0),{status:res.status,statusText:res.statusText,headers});
 await cache.put(url,copy());
 return copy();
}
async function precache(){
 const cache=await caches.open(V);
 await Promise.all(SHELL.map(async path=>{
  const req=shellRequest(path);
  const res=await fetch(req);
  if(!res.ok)throw new Error(path+" "+res.status);
  await storeFresh(cache,req.url,res);
 }));
}
self.addEventListener("install",e=>{e.waitUntil(precache().then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(k=>k!==V&&k!=="laoshi-audio").map(k=>caches.delete(k)));
 await self.clients.claim();
 const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
 await Promise.all(windows.map(client=>{
  if(!client.url||typeof client.navigate!=="function")return null;
  return client.navigate(client.url).catch(()=>{});
 }));
})())});
function isEntry(u){const p=u.pathname;return p.endsWith("/")||p.endsWith("/index.html")||p.endsWith("/app.js")}
async function networkFirst(req){
 const cache=await caches.open(V);
 try{
  const res=await fetch(new Request(req.url,{cache:"reload"}));
  if(res.ok)return await storeFresh(cache,req.url,res);
 }catch(err){}
 const hit=await caches.match(req,{ignoreSearch:true});
 if(hit)return hit;
 return fetch(req);
}
async function audio(req){const c=await caches.open("laoshi-audio");const url=req.url.split("#")[0];
 let full=await c.match(url);
 if(!full){const r=await fetch(new Request(url,{cache:"reload"}));if(!r.ok)return r;await c.put(url,r.clone());full=r}
 const range=req.headers.get("range");if(!range)return full;
 const buf=await full.arrayBuffer();const m=/bytes=(\d*)-(\d*)/.exec(range)||[];const n=buf.byteLength;
 let s=m[1]?+m[1]:0,e=m[2]?+m[2]:n-1;if(!m[1]&&m[2]){s=n-+m[2];e=n-1}e=Math.min(e,n-1);
 return new Response(buf.slice(s,e+1),{status:206,headers:{"Content-Type":"audio/mpeg","Content-Range":`bytes ${s}-${e}/${n}`,"Content-Length":String(e-s+1),"Accept-Ranges":"bytes"}})}
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin)return;
 if(u.pathname.endsWith(".mp3")){e.respondWith(audio(e.request));return}
 if(u.pathname.endsWith(".json")||isEntry(u)){e.respondWith(networkFirst(e.request));return}
 e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)))});
