/* Service worker: app shell cache-first (versioned), JSON network-first, audio cached on first play (Range-aware). */
const V="laoshi-20261101131759",SHELL=["./","index.html","app.js","app.css","viewer.css","legend.js","manifest.webmanifest","icons/icon-180.png","icons/icon-192.png","icons/icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k!=="laoshi-audio").map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
async function audio(req){const c=await caches.open("laoshi-audio");const url=req.url.split("#")[0];
 let full=await c.match(url);
 if(!full){const r=await fetch(url);if(!r.ok)return r;await c.put(url,r.clone());full=r}
 const range=req.headers.get("range");if(!range)return full;
 const buf=await full.arrayBuffer();const m=/bytes=(\d*)-(\d*)/.exec(range)||[];const n=buf.byteLength;
 let s=m[1]?+m[1]:0,e=m[2]?+m[2]:n-1;if(!m[1]&&m[2]){s=n-+m[2];e=n-1}e=Math.min(e,n-1);
 return new Response(buf.slice(s,e+1),{status:206,headers:{"Content-Type":"audio/mpeg","Content-Range":`bytes ${s}-${e}/${n}`,"Content-Length":String(e-s+1),"Accept-Ranges":"bytes"}})}
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin)return;
 if(u.pathname.endsWith(".mp3")){e.respondWith(audio(e.request));return}
 if(u.pathname.endsWith(".json")){e.respondWith(fetch(e.request).then(r=>{const cl=r.clone();caches.open(V).then(c=>c.put(e.request,cl));return r}).catch(()=>caches.match(e.request)));return}
 e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)))});
