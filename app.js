const PROJECT="PRM0001297784";
const MY_MAPS_URL="https://www.google.com/maps/d/u/1/edit?mid=1m9hb-O3axriFGU5971D2sjqFOQ_Tv1w&usp=sharing";
const MAKE_READY_PDF_URL = "https://drive.google.com/file/d/1TUSsHo9TNyamg38bGJMS2quFliZ43sn9/view";
const UTILITY_MAP_PDF_URL = "https://drive.google.com/file/d/1vh6zp7VjtKb1JrQU52GPt9uxxeH6TF8N/view";
const WORK_TYPES=[
 ["newStrand","PLACE NEW STRAND","FT"],["installDownGuy","INSTALL DOWNGUY","EA"],["reworkDownGuy","TRANSFER / REWORK EXISTING DOWN GUY","EA"],["overheadGuy","PLACE OVERHEAD GUY","EA"],["groundBond","INSTALL POLE GROUND AND BOND","EA"],["raiseLower","RAISE OR LOWER POLE ATTACHMENT","POLE"],["riserGuard","INSTALL NEW RISER GUARD TO SECURE CABLES TO POLES","10FT"],["treeTrimming","TREE TRIMMING","FT"],["fArms","PLACE F-ARMS","EA"],["guardArm","PLACE GUARD ARM","EA"],["doubleGuardArm","PLACE DOUBLE GUARD ARM","EA"],["removeArm","REMOVE ARM","EA"],["poleTransfer","POLE TRANSFER","EA"]
];
const STATE_KEY="makeReadyAgent_state_v2";
let basePoles=[],state={},currentPole=null;
const $=s=>document.querySelector(s);
function emptyRecord(p){return{projectPole:p.projectPole,poleId:p.poleId,status:"Not started",work:{},originalHoa:"",actualHoa:"",heightChangeDescription:"",anchorStatus:"",anchorDetails:"",bondingStatus:"",bondingDetails:"",vgrStatus:"",vgrDetails:"",downGuyActual:"",changeReason:"",crew:"",fieldNotes:"",updatedAt:""}}
function loadState(){try{state=JSON.parse(localStorage.getItem(STATE_KEY)||"{}")}catch(e){state={}}}
function saveState(){localStorage.setItem(STATE_KEY,JSON.stringify(state))}
function record(p){return{...emptyRecord(p),...(state[p.projectPole]||{}),work:{...(state[p.projectPole]?.work||{})}}}
function esc(s){return String(s||"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch]))}
function badgeClass(s){return s==="Completed"?"b2":s==="In progress"?"b1":s==="Problem"?"b3":"b0"}
function render(){
 const q=$("#search").value.toLowerCase().trim(), sf=$("#statusFilter").value;
 const arr=basePoles.filter(p=>{const r=record(p);return (`${p.projectPole} ${p.poleId}`).toLowerCase().includes(q)&&(!sf||r.status===sf)});
 $("#list").innerHTML=arr.map(p=>{const r=record(p);return `<article class="pole" data-pole="${p.projectPole}"><div class="poleTop"><div><h3>Pole ${p.projectPole}</h3><div class="muted">${esc(p.poleId||"No Pole ID")}</div></div><span class="badge ${badgeClass(r.status)}">${r.status}</span></div><div class="desc">${esc(p.description)}</div></article>`}).join("");
 document.querySelectorAll(".pole").forEach(el=>el.addEventListener("click",()=>openPole(Number(el.dataset.pole))));
 const count=s=>basePoles.filter(p=>record(p).status===s).length;
 $("#stats").innerHTML=`<div class="stat"><b>${basePoles.length}</b>Всего</div><div class="stat"><b>${count("Not started")}</b>Не начато</div><div class="stat"><b>${count("In progress")}</b>В работе</div><div class="stat"><b>${count("Completed")}</b>Готово</div>`;
}
function buildWorkGrid(){$("#workGrid").innerHTML=WORK_TYPES.map(([k,n,u])=>`<div class="workItem"><label>${n} (${u})</label><input id="w_${k}" type="number" min="0" step="any"></div>`).join("")}
function openPole(n){
 currentPole=basePoles.find(p=>p.projectPole===n);if(!currentPole)return;
 const r=record(currentPole);$("#title").textContent=`Pole ${n}`;$("#poleId").textContent=currentPole.poleId||"No Pole ID";$("#description").textContent=currentPole.description||"";
 WORK_TYPES.forEach(([k])=>$("#w_"+k).value=r.work[k]??"");
 ["originalHoa","actualHoa","heightChangeDescription","anchorStatus","anchorDetails","bondingStatus","bondingDetails","vgrStatus","vgrDetails","downGuyActual","changeReason","status","crew","fieldNotes"].forEach(id=>$("#"+id).value=r[id]||"");
 $("#saveMsg").textContent="";renderGalleries();$("#poleDialog").showModal();
}
function collect(){const old=record(currentPole),work={};WORK_TYPES.forEach(([k])=>work[k]=$("#w_"+k).value);return{...old,work,originalHoa:$("#originalHoa").value,actualHoa:$("#actualHoa").value,heightChangeDescription:$("#heightChangeDescription").value,anchorStatus:$("#anchorStatus").value,anchorDetails:$("#anchorDetails").value,bondingStatus:$("#bondingStatus").value,bondingDetails:$("#bondingDetails").value,vgrStatus:$("#vgrStatus").value,vgrDetails:$("#vgrDetails").value,downGuyActual:$("#downGuyActual").value,changeReason:$("#changeReason").value,status:$("#status").value,crew:$("#crew").value,fieldNotes:$("#fieldNotes").value,updatedAt:new Date().toISOString()}}
$("#saveBtn").addEventListener("click",()=>{state[currentPole.projectPole]=collect();saveState();$("#saveMsg").textContent="Сохранено на этом устройстве.";render();setTimeout(()=>$("#poleDialog").close(),400)});
$("#closeDialog").addEventListener("click",()=>$("#poleDialog").close());
$("#search").addEventListener("input",render);$("#statusFilter").addEventListener("change",render);
$("#nextPoleBtn").addEventListener("click",()=>window.open(MY_MAPS_URL,"_blank"));
$("#myMapsBtn").addEventListener("click",()=>window.open(MY_MAPS_URL,"_blank"));
$("#openMapFromPole").addEventListener("click",()=>window.open(MY_MAPS_URL,"_blank"));
$("#openGoogleNav").addEventListener("click",()=>window.open(`https://www.google.com/maps/dir/?api=1&destination=${currentPole.lat},${currentPole.lon}`,"_blank"));
function download(name,text,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),500)}
function csv(v){const s=String(v??"");return `"${s.replaceAll('"','""')}"`}
$("#exportBtn").addEventListener("click",()=>{const ps=basePoles.map(record),lines=[];lines.push(["Work Type","Unit",...ps.map(p=>"Pole "+p.projectPole)].map(csv).join(","));WORK_TYPES.forEach(([k,n,u])=>lines.push([n,u,...ps.map(p=>p.work[k]||"")].map(csv).join(",")));lines.push("");lines.push(["Project Pole","Pole ID","Status","Original HOA","Actual HOA","Height Change Description","Anchor Status","Anchor Details","Bonding Status","Bonding Details","VGR Status","VGR Details","Down Guy Actual","Reason / Field Condition","Crew","Field Notes","Updated At"].map(csv).join(","));ps.forEach(p=>lines.push([p.projectPole,p.poleId,p.status,p.originalHoa,p.actualHoa,p.heightChangeDescription,p.anchorStatus,p.anchorDetails,p.bondingStatus,p.bondingDetails,p.vgrStatus,p.vgrDetails,p.downGuyActual,p.changeReason,p.crew,p.fieldNotes,p.updatedAt].map(csv).join(",")));download(`${PROJECT}_Production.csv`,lines.join("\r\n"),"text/csv;charset=utf-8")});
$("#backupBtn").addEventListener("click",()=>download(`${PROJECT}_backup.json`,JSON.stringify({version:2,project:PROJECT,exportedAt:new Date().toISOString(),state},null,2),"application/json"));
$("#restoreInput").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;try{const j=JSON.parse(await f.text());state=j.state||{};saveState();render();alert("Данные восстановлены.")}catch(err){alert("Неверный JSON")}});
// photos in IndexedDB
const DB="MakeReadyAgentDB",STORE="photos";
function openDb(){return new Promise((ok,bad)=>{const q=indexedDB.open(DB,1);q.onupgradeneeded=()=>{const d=q.result;if(!d.objectStoreNames.contains(STORE)){const s=d.createObjectStore(STORE,{keyPath:"id"});s.createIndex("poleType","poleType")}};q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error)})}
async function photoPut(obj){const d=await openDb();return new Promise((ok,bad)=>{const t=d.transaction(STORE,"readwrite");t.objectStore(STORE).put(obj);t.oncomplete=ok;t.onerror=()=>bad(t.error)})}
async function photoDelete(id){const d=await openDb();return new Promise((ok,bad)=>{const t=d.transaction(STORE,"readwrite");t.objectStore(STORE).delete(id);t.oncomplete=ok;t.onerror=()=>bad(t.error)})}
async function photosFor(pole,type){const d=await openDb();return new Promise((ok,bad)=>{const t=d.transaction(STORE,"readonly"),q=t.objectStore(STORE).index("poleType").getAll(`${pole}|${type}`);q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error)})}
async function addPhotos(files,type){if(!currentPole)return;for(const f of files){await photoPut({id:crypto.randomUUID(),poleType:`${currentPole.projectPole}|${type}`,projectPole:currentPole.projectPole,type,name:f.name,blob:f})}renderGalleries()}
$("#beforeInput").addEventListener("change",e=>addPhotos([...e.target.files],"BEFORE"));$("#afterInput").addEventListener("change",e=>addPhotos([...e.target.files],"AFTER"));
async function gallery(type,selector){const a=await photosFor(currentPole.projectPole,type),root=$(selector);root.innerHTML="";a.forEach(x=>{const u=URL.createObjectURL(x.blob),d=document.createElement("div");d.className="thumb";const im=document.createElement("img");im.src=u;const b=document.createElement("button");b.type="button";b.textContent="×";b.addEventListener("click",async()=>{await photoDelete(x.id);URL.revokeObjectURL(u);renderGalleries()});d.append(im,b);root.appendChild(d)})}
async function renderGalleries(){if(!currentPole)return;await Promise.all([gallery("BEFORE","#beforeGallery"),gallery("AFTER","#afterGallery")])}
if("serviceWorker" in navigator)navigator.serviceWorker.register("service-worker.js");
(async()=>{buildWorkGrid();loadState();basePoles=await (await fetch("data.json",{cache:"no-store"})).json();render();const p=Number(new URLSearchParams(location.search).get("pole"));if(p&&basePoles.some(x=>x.projectPole===p))setTimeout(()=>openPole(p),100)})().catch(e=>{console.error(e);document.querySelector("#list").innerHTML=`<div class="pole">Ошибка загрузки данных: ${esc(e.message)}</div>`});


// ===== V3 Admin / Next Pole UI =====
(function(){
  const nextBtn = document.getElementById("nextPoleBtn");
  if (nextBtn) {
    nextBtn.onclick = () => window.open(MY_MAPS_URL, "_blank");
  }

  const adminBtn = document.getElementById("adminBtn");
  const adminDialog = document.getElementById("adminDialog");
  const closeAdminBtn = document.getElementById("closeAdminBtn");
  if (adminBtn && adminDialog) adminBtn.onclick = () => adminDialog.showModal();
  if (closeAdminBtn && adminDialog) closeAdminBtn.onclick = () => adminDialog.close();
})();


// ===== V4 Main field document buttons =====
(function(){
  const mainMapsBtn = document.getElementById("mainMapsBtn");
  if (mainMapsBtn) mainMapsBtn.onclick = () => window.open(MY_MAPS_URL, "_blank");

  const makeReadyPdfBtn = document.getElementById("makeReadyPdfBtn");
  if (makeReadyPdfBtn) makeReadyPdfBtn.onclick = () => window.open(MAKE_READY_PDF_URL, "_blank");

  const utilityMapPdfBtn = document.getElementById("utilityMapPdfBtn");
  if (utilityMapPdfBtn) utilityMapPdfBtn.onclick = () => window.open(UTILITY_MAP_PDF_URL, "_blank");
})();
