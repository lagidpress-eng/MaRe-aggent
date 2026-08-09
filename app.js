(() => {
"use strict";

const PROJECT = "PRM0001297784";
const APP_VERSION = "6.0.0";
const MY_MAPS_URL = "https://www.google.com/maps/d/u/1/edit?mid=1m9hb-O3axriFGU5971D2sjqFOQ_Tv1w&usp=sharing";
const MAKE_READY_PDF_URL = "https://drive.google.com/file/d/1TUSsHo9TNyamg38bGJMS2quFliZ43sn9/view";
const UTILITY_MAP_PDF_URL = "https://drive.google.com/file/d/1vh6zp7VjtKb1JrQU52GPt9uxxeH6TF8N/view";

const STATE_KEY = "makeReadyAgent_V6_state";
const DB_NAME = "MakeReadyAgentV6Photos";
const DB_STORE = "photos";

const WORK_TYPES = [
  ["newStrand","PLACE NEW STRAND","FT"],
  ["installDownGuy","INSTALL DOWNGUY","EA"],
  ["reworkDownGuy","TRANSFER / REWORK EXISTING DOWN GUY","EA"],
  ["overheadGuy","PLACE OVERHEAD GUY","EA"],
  ["groundBond","INSTALL POLE GROUND AND BOND","EA"],
  ["raiseLower","RAISE OR LOWER POLE ATTACHMENT","POLE"],
  ["riserGuard","INSTALL NEW RISER GUARD TO SECURE CABLES TO POLES","10FT"],
  ["treeTrimming","TREE TRIMMING","FT"],
  ["fArms","PLACE F-ARMS","EA"],
  ["guardArm","PLACE GUARD ARM","EA"],
  ["doubleGuardArm","PLACE DOUBLE GUARD ARM","EA"],
  ["removeArm","REMOVE ARM","EA"],
  ["poleTransfer","POLE TRANSFER","EA"]
];

let poles = [];
let state = {};
let currentPole = null;

function el(id){ return document.getElementById(id); }

function showError(message){
  console.error(message);
  const box = el("errorBox");
  if(!box) return;
  box.textContent = "Ошибка сайта: " + message;
  box.classList.remove("hidden");
}

window.addEventListener("error", e => {
  showError(e.message || "JavaScript error");
});

window.addEventListener("unhandledrejection", e => {
  showError(e.reason?.message || String(e.reason || "Promise error"));
});

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));
}

function defaultRecord(pole){
  return {
    projectPole: pole.projectPole,
    poleId: pole.poleId || "",
    status: "Not started",
    work: {},
    originalHoa: "",
    actualHoa: "",
    heightChangeDescription: "",
    anchorStatus: "",
    anchorDetails: "",
    bondingStatus: "",
    bondingDetails: "",
    vgrStatus: "",
    vgrDetails: "",
    downGuyActual: "",
    changeReason: "",
    crew: "",
    fieldNotes: "",
    updatedAt: ""
  };
}

function recordFor(pole){
  const saved = state[String(pole.projectPole)] || {};
  return {
    ...defaultRecord(pole),
    ...saved,
    work: { ...(saved.work || {}) }
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STATE_KEY);
    state = raw ? JSON.parse(raw) : {};
  }catch(err){
    state = {};
    showError("Не удалось прочитать сохранённые данные.");
  }
}

function saveState(){
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function statusClass(status){
  return "status-" + String(status).replace(/\s+/g,"-");
}

function renderStats(){
  const counts = {"Not started":0,"In progress":0,"Completed":0,"Problem":0};
  poles.forEach(p => {
    const s = recordFor(p).status;
    if(counts[s] !== undefined) counts[s]++;
  });
  el("stats").innerHTML = `
    <div class="stat"><b>${poles.length}</b>Всего</div>
    <div class="stat"><b>${counts["Not started"]}</b>Не начато</div>
    <div class="stat"><b>${counts["In progress"]}</b>В работе</div>
    <div class="stat"><b>${counts["Completed"]}</b>Готово</div>
  `;
}

function renderList(){
  const q = (el("searchInput").value || "").trim().toLowerCase();
  const filter = el("statusFilter").value;

  const filtered = poles.filter(p => {
    const rec = recordFor(p);
    const hay = `pole ${p.projectPole} ${p.projectPole} ${p.poleId || ""}`.toLowerCase();
    return hay.includes(q) && (!filter || rec.status === filter);
  });

  if(filtered.length === 0){
    el("poleList").innerHTML = `<div class="loading">Ничего не найдено.</div>`;
    renderStats();
    return;
  }

  el("poleList").innerHTML = filtered.map(p => {
    const rec = recordFor(p);
    return `
      <article class="pole-card" data-pole="${p.projectPole}">
        <div class="pole-top">
          <div>
            <h3>Pole ${p.projectPole}</h3>
            <div class="muted">${escapeHtml(p.poleId || "No Pole ID")}</div>
          </div>
          <span class="status-badge ${statusClass(rec.status)}">${escapeHtml(rec.status)}</span>
        </div>
        <div class="desc">${escapeHtml(p.description || "")}</div>
      </article>
    `;
  }).join("");

  document.querySelectorAll(".pole-card").forEach(card => {
    card.addEventListener("click", () => openPole(Number(card.dataset.pole)));
  });

  renderStats();
}

function buildWorkGrid(){
  el("workGrid").innerHTML = WORK_TYPES.map(([key,name,unit]) => `
    <div class="work-item">
      <label for="work_${key}">${escapeHtml(name)} (${escapeHtml(unit)})</label>
      <input id="work_${key}" type="number" min="0" step="any" placeholder="0">
    </div>
  `).join("");
}

function setQuickStatus(status){
  el("statusSelect").value = status;
  syncQuickButtons();
  updateCardStatusBadge();
}

function syncQuickButtons(){
  const s = el("statusSelect").value;
  el("startBtn").classList.toggle("active", s === "In progress");
  el("completedBtn").classList.toggle("active", s === "Completed");
  el("problemBtn").classList.toggle("active", s === "Problem");
}

function updateCardStatusBadge(){
  const s = el("statusSelect").value;
  const badge = el("cardStatusBadge");
  badge.textContent = s;
  badge.className = "status-badge " + statusClass(s);
}

async function openPole(projectPole){
  const pole = poles.find(p => Number(p.projectPole) === Number(projectPole));
  if(!pole) return;

  currentPole = pole;
  const rec = recordFor(pole);

  el("cardPoleTitle").textContent = `Pole ${pole.projectPole}`;
  el("cardPoleId").textContent = pole.poleId || "No Pole ID";
  el("projectDescription").textContent = pole.description || "";

  WORK_TYPES.forEach(([key]) => {
    const input = el("work_" + key);
    if(input) input.value = rec.work[key] ?? "";
  });

  [
    "originalHoa","actualHoa","heightChangeDescription",
    "anchorStatus","anchorDetails","bondingStatus","bondingDetails",
    "vgrStatus","vgrDetails","downGuyActual","changeReason",
    "crew","fieldNotes"
  ].forEach(id => { el(id).value = rec[id] || ""; });

  el("statusSelect").value = rec.status || "Not started";
  syncQuickButtons();
  updateCardStatusBadge();
  el("saveMessage").textContent = "";

  await renderPhotos();

  el("poleDialog").showModal();
}

function collectCurrentRecord(){
  const old = recordFor(currentPole);
  const work = {};
  WORK_TYPES.forEach(([key]) => {
    const val = el("work_" + key).value;
    work[key] = val === "" ? "" : Number(val);
  });

  return {
    ...old,
    work,
    originalHoa: el("originalHoa").value,
    actualHoa: el("actualHoa").value,
    heightChangeDescription: el("heightChangeDescription").value,
    anchorStatus: el("anchorStatus").value,
    anchorDetails: el("anchorDetails").value,
    bondingStatus: el("bondingStatus").value,
    bondingDetails: el("bondingDetails").value,
    vgrStatus: el("vgrStatus").value,
    vgrDetails: el("vgrDetails").value,
    downGuyActual: el("downGuyActual").value,
    changeReason: el("changeReason").value,
    status: el("statusSelect").value,
    crew: el("crew").value,
    fieldNotes: el("fieldNotes").value,
    updatedAt: new Date().toISOString()
  };
}

function saveCurrentPole(){
  if(!currentPole) return false;
  state[String(currentPole.projectPole)] = collectCurrentRecord();
  saveState();
  el("saveMessage").textContent = "Сохранено на этом устройстве.";
  renderList();
  return true;
}

function downloadFile(filename, content, mime){
  const blob = new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value){
  return `"${String(value ?? "").replaceAll('"','""')}"`;
}

function exportCsv(){
  const records = poles.map(p => recordFor(p));
  const lines = [];

  lines.push(["Work Type","Unit",...records.map(r => `Pole ${r.projectPole}`)].map(csvCell).join(","));
  WORK_TYPES.forEach(([key,name,unit]) => {
    lines.push([name,unit,...records.map(r => r.work[key] ?? "")].map(csvCell).join(","));
  });

  lines.push("");
  lines.push([
    "Project Pole","Pole ID","Status","Original HOA","Actual HOA","Height Change Description",
    "Anchor Status","Anchor Details","Bonding Status","Bonding Details",
    "VGR Status","VGR Details","Down Guy Actual","Reason / Field Condition",
    "Crew","Field Notes","Updated At"
  ].map(csvCell).join(","));

  records.forEach(r => {
    lines.push([
      r.projectPole,r.poleId,r.status,r.originalHoa,r.actualHoa,r.heightChangeDescription,
      r.anchorStatus,r.anchorDetails,r.bondingStatus,r.bondingDetails,
      r.vgrStatus,r.vgrDetails,r.downGuyActual,r.changeReason,
      r.crew,r.fieldNotes,r.updatedAt
    ].map(csvCell).join(","));
  });

  downloadFile(`${PROJECT}_Production.csv`, lines.join("\r\n"), "text/csv;charset=utf-8");
}

function backupJson(){
  const payload = {
    appVersion: APP_VERSION,
    project: PROJECT,
    exportedAt: new Date().toISOString(),
    state
  };
  downloadFile(`${PROJECT}_backup.json`, JSON.stringify(payload,null,2), "application/json");
}

async function restoreJson(file){
  const text = await file.text();
  const payload = JSON.parse(text);
  if(!payload || typeof payload.state !== "object") throw new Error("Неверный backup JSON");
  state = payload.state;
  saveState();
  renderList();
}

// ---------------- Photo IndexedDB ----------------
function openPhotoDb(){
  return new Promise((resolve,reject) => {
    const req = indexedDB.open(DB_NAME,1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(DB_STORE)){
        const store = db.createObjectStore(DB_STORE,{keyPath:"id"});
        store.createIndex("poleType","poleType",{unique:false});
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addPhoto(file,type){
  const db = await openPhotoDb();
  const obj = {
    id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`),
    poleType: `${currentPole.projectPole}|${type}`,
    projectPole: currentPole.projectPole,
    poleId: currentPole.poleId || "",
    type,
    name: file.name,
    createdAt: new Date().toISOString(),
    blob: file
  };

  await new Promise((resolve,reject) => {
    const tx = db.transaction(DB_STORE,"readwrite");
    tx.objectStore(DB_STORE).put(obj);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function photosFor(projectPole,type){
  const db = await openPhotoDb();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(DB_STORE,"readonly");
    const req = tx.objectStore(DB_STORE).index("poleType").getAll(`${projectPole}|${type}`);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deletePhoto(id){
  const db = await openPhotoDb();
  await new Promise((resolve,reject) => {
    const tx = db.transaction(DB_STORE,"readwrite");
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function renderGallery(type, galleryId, countId){
  const items = await photosFor(currentPole.projectPole,type);
  const gallery = el(galleryId);
  gallery.innerHTML = "";

  items.forEach(item => {
    const url = URL.createObjectURL(item.blob);
    const wrap = document.createElement("div");
    wrap.className = "thumb";

    const img = document.createElement("img");
    img.src = url;
    img.alt = item.name || type;
    img.onload = () => URL.revokeObjectURL(url);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete-photo";
    del.textContent = "×";
    del.addEventListener("click", async () => {
      await deletePhoto(item.id);
      await renderPhotos();
    });

    wrap.appendChild(img);
    wrap.appendChild(del);
    gallery.appendChild(wrap);
  });

  const count = el(countId);
  count.textContent = `${items.length}/3`;
  count.classList.toggle("ok", items.length >= 3);
}

async function renderPhotos(){
  if(!currentPole) return;
  await Promise.all([
    renderGallery("BEFORE","beforeGallery","beforeCount"),
    renderGallery("AFTER","afterGallery","afterCount")
  ]);
}

async function handlePhotoFiles(fileList,type){
  if(!currentPole) return;
  const files = Array.from(fileList || []);
  for(const file of files){
    await addPhoto(file,type);
  }
  await renderPhotos();
}

// ---------------- Events ----------------
function bindEvents(){
  el("nextPoleBtn").addEventListener("click", () => window.open(MY_MAPS_URL,"_blank"));
  el("myMapsBtn").addEventListener("click", () => window.open(MY_MAPS_URL,"_blank"));
  el("makeReadyBtn").addEventListener("click", () => window.open(MAKE_READY_PDF_URL,"_blank"));
  el("utilityMapBtn").addEventListener("click", () => window.open(UTILITY_MAP_PDF_URL,"_blank"));

  el("adminBtn").addEventListener("click", () => el("adminDialog").showModal());
  el("closeAdminBtn").addEventListener("click", () => el("adminDialog").close());
  el("closePoleBtn").addEventListener("click", () => el("poleDialog").close());

  el("searchInput").addEventListener("input", renderList);
  el("statusFilter").addEventListener("change", renderList);

  el("cardMyMapsBtn").addEventListener("click", () => window.open(MY_MAPS_URL,"_blank"));
  el("googleNavBtn").addEventListener("click", () => {
    if(!currentPole) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${currentPole.lat},${currentPole.lon}`,"_blank");
  });

  el("startBtn").addEventListener("click", () => setQuickStatus("In progress"));
  el("completedBtn").addEventListener("click", () => setQuickStatus("Completed"));
  el("problemBtn").addEventListener("click", () => setQuickStatus("Problem"));
  el("statusSelect").addEventListener("change", () => {
    syncQuickButtons();
    updateCardStatusBadge();
  });

  el("beforeInput").addEventListener("change", async e => {
    try{
      await handlePhotoFiles(e.target.files,"BEFORE");
      e.target.value = "";
    }catch(err){
      showError("Не удалось сохранить BEFORE фото: " + err.message);
    }
  });

  el("afterInput").addEventListener("change", async e => {
    try{
      await handlePhotoFiles(e.target.files,"AFTER");
      e.target.value = "";
    }catch(err){
      showError("Не удалось сохранить AFTER фото: " + err.message);
    }
  });

  el("saveBtn").addEventListener("click", () => {
    saveCurrentPole();
    setTimeout(() => el("poleDialog").close(), 300);
  });

  el("saveNextBtn").addEventListener("click", () => {
    if(saveCurrentPole()){
      el("poleDialog").close();
      window.open(MY_MAPS_URL,"_blank");
    }
  });

  el("exportCsvBtn").addEventListener("click", exportCsv);
  el("backupBtn").addEventListener("click", backupJson);

  el("restoreInput").addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if(!file) return;
    try{
      await restoreJson(file);
      alert("Данные восстановлены.");
      e.target.value = "";
    }catch(err){
      alert(err.message || "Не удалось восстановить backup.");
    }
  });
}

async function loadPoles(){
  const response = await fetch(`data.json?v=${APP_VERSION}`, {cache:"no-store"});
  if(!response.ok) throw new Error(`data.json: HTTP ${response.status}`);
  const data = await response.json();
  if(!Array.isArray(data)) throw new Error("data.json имеет неверный формат");
  poles = data;
}

async function init(){
  buildWorkGrid();
  loadState();
  bindEvents();

  try{
    await loadPoles();
    renderList();

    const requestedPole = Number(new URLSearchParams(location.search).get("pole"));
    if(requestedPole){
      const exists = poles.some(p => Number(p.projectPole) === requestedPole);
      if(exists) await openPole(requestedPole);
    }
  }catch(err){
    showError(err.message || String(err));
    el("poleList").innerHTML = `<div class="loading">Не удалось загрузить список Pole.</div>`;
  }
}

document.addEventListener("DOMContentLoaded", init);

})();
