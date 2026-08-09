(() => {
"use strict";

const PROJECT = "PRM0001297784";
const APP_VERSION = "8.1.0";
const MY_MAPS_URL = "https://www.google.com/maps/d/u/1/edit?mid=1m9hb-O3axriFGU5971D2sjqFOQ_Tv1w&usp=sharing";
const MAKE_READY_PDF_URL = "https://drive.google.com/file/d/1TUSsHo9TNyamg38bGJMS2quFliZ43sn9/view";
const UTILITY_MAP_PDF_URL = "https://drive.google.com/file/d/1vh6zp7VjtKb1JrQU52GPt9uxxeH6TF8N/view";

const GOOGLE_CLIENT_ID = "134936424695-ktnolqsbld9mjhh2qqht0n2pms5cguab.apps.googleusercontent.com";
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";
const CLOUD_CONFIG_KEY = "makeReadyAgent_V8_cloud_config";

let googleToken = "";
let tokenClient = null;
let cloudConfig = {};
let syncBusy = false;


const STATE_KEY = "makeReadyAgent_V7_state";
const DB_NAME = "MakeReadyAgentV7Photos";
const DB_STORE = "photos";

const PRIMARY_WORK_TYPES = [
  ["newStrand","PLACE NEW STRAND","FT"],
  ["installDownGuy","INSTALL DOWNGUY","EA"],
  ["treeTrimming","TREE TRIMMING","FT"],
  ["groundBond","INSTALL POLE GROUND AND BOND","EA"],
  ["guardArm","PLACE GUARD ARM","EA"],
  ["doubleGuardArm","PLACE DOUBLE GUARD ARM","EA"]
];

const OTHER_WORK_TYPES = [
  ["reworkDownGuy","TRANSFER / REWORK EXISTING DOWN GUY","EA"],
  ["overheadGuy","PLACE OVERHEAD GUY","EA"],
  ["raiseLower","RAISE OR LOWER POLE ATTACHMENT","POLE"],
  ["riserGuard","INSTALL NEW RISER GUARD TO SECURE CABLES TO POLES","10FT"],
  ["fArms","PLACE F-ARMS","EA"],
  ["removeArm","REMOVE ARM","EA"],
  ["poleTransfer","POLE TRANSFER","EA"]
];

const ALL_WORK_TYPES = [...PRIMARY_WORK_TYPES, ...OTHER_WORK_TYPES];

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
  el("workGrid").innerHTML = PRIMARY_WORK_TYPES.map(([key,name,unit]) => `
    <div class="work-item">
      <label for="work_${key}">${escapeHtml(name)} (${escapeHtml(unit)})</label>
      <input id="work_${key}" type="number" min="0" step="any" placeholder="0">
    </div>
  `).join("");

  el("otherWorkGrid").innerHTML = OTHER_WORK_TYPES.map(([key,name,unit]) => `
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

  ALL_WORK_TYPES.forEach(([key]) => {
    const input = el("work_" + key);
    if(input) input.value = rec.work[key] ?? "";
  });

  [
    "originalHoa","actualHoa","heightChangeDescription",
    "anchorStatus","anchorDetails","fieldNotes"
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
  ALL_WORK_TYPES.forEach(([key]) => {
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
    status: el("statusSelect").value,
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
  ALL_WORK_TYPES.forEach(([key,name,unit]) => {
    lines.push([name,unit,...records.map(r => r.work[key] ?? "")].map(csvCell).join(","));
  });

  lines.push("");
  lines.push([
    "Project Pole","Pole ID","Status","Original HOA","Actual HOA","Height Change Description",
    "Anchor Status","Anchor Details","Field Notes","Updated At"
  ].map(csvCell).join(","));

  records.forEach(r => {
    lines.push([
      r.projectPole,r.poleId,r.status,r.originalHoa,r.actualHoa,r.heightChangeDescription,
      r.anchorStatus,r.anchorDetails,r.fieldNotes,r.updatedAt
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


async function updatePhotoRecord(item){
  const db = await openPhotoDb();
  await new Promise((resolve,reject) => {
    const tx = db.transaction(DB_STORE,"readwrite");
    tx.objectStore(DB_STORE).put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function allLocalPhotos(){
  const db = await openPhotoDb();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(DB_STORE,"readonly");
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
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
    blob: file,
    driveFileId: "",
    syncedAt: ""
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


// ---------------- Google cloud sync ----------------
function loadCloudConfig(){
  try{
    cloudConfig = JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY) || "{}");
  }catch{
    cloudConfig = {};
  }
}

function saveCloudConfig(){
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(cloudConfig));
}

function setCloudStatus(text, mode="local"){
  const node = el("cloudStatus");
  if(!node) return;
  node.textContent = text;
  node.className = "cloud-status " + mode;
}

function initGoogleClient(){
  if(!window.google?.accounts?.oauth2) return false;
  if(tokenClient) return true;

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_SCOPES,
    callback: async response => {
      if(response.error){
        setCloudStatus("⚠️ Google authorization failed", "error");
        return;
      }
      googleToken = response.access_token || "";
      setCloudStatus("☁️ Google connected · preparing project…", "syncing");
      try{
        await ensureCloudProject();
        await syncAllToCloud();
      }catch(err){
        setCloudStatus("⚠️ Cloud error: " + err.message, "error");
      }
    }
  });
  return true;
}

function requestGoogleAccess(){
  if(!initGoogleClient()){
    setCloudStatus("⏳ Google login library is still loading. Try again.", "error");
    return;
  }
  tokenClient.requestAccessToken({
    prompt: googleToken ? "" : "consent"
  });
}

async function googleFetch(url, options={}){
  if(!googleToken) throw new Error("Google is not connected");
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", "Bearer " + googleToken);
  const response = await fetch(url, {...options, headers});
  if(response.status === 401){
    googleToken = "";
    setCloudStatus("📱 Saved locally · reconnect Google to sync", "local");
    throw new Error("Google session expired. Press Connect Google again.");
  }
  if(!response.ok){
    const text = await response.text();
    let detail = text;
    try{
      const j = JSON.parse(text);
      detail = j.error?.message || text;
    }catch{}
    throw new Error(detail || `Google API HTTP ${response.status}`);
  }
  const ct = response.headers.get("content-type") || "";
  return ct.includes("application/json") ? response.json() : response.text();
}

async function createDriveFolder(name, parentId=null){
  const body = {
    name,
    mimeType: "application/vnd.google-apps.folder"
  };
  if(parentId) body.parents = [parentId];

  const file = await googleFetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",
    {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body)
    }
  );
  return file;
}

async function createCloudSpreadsheet(){
  const created = await googleFetch(
    "https://sheets.googleapis.com/v4/spreadsheets",
    {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        properties:{title:`Make Ready Agent Data - ${PROJECT}`},
        sheets:[{properties:{title:"Poles", frozenRowCount:1}}]
      })
    }
  );
  return created;
}

async function moveDriveFileToFolder(fileId, folderId){
  await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?addParents=${encodeURIComponent(folderId)}&fields=id,parents`,
    {method:"PATCH"}
  );
}

async function ensureCloudProject(){
  if(!googleToken) throw new Error("Google is not connected");

  if(!cloudConfig.rootFolderId){
    const root = await createDriveFolder(PROJECT);
    cloudConfig.rootFolderId = root.id;
    cloudConfig.rootFolderUrl = `https://drive.google.com/drive/folders/${root.id}`;
    saveCloudConfig();
  }

  if(!cloudConfig.photosFolderId){
    const photos = await createDriveFolder("Photos", cloudConfig.rootFolderId);
    cloudConfig.photosFolderId = photos.id;
    saveCloudConfig();
  }

  if(!cloudConfig.spreadsheetId){
    const ss = await createCloudSpreadsheet();
    cloudConfig.spreadsheetId = ss.spreadsheetId;
    cloudConfig.spreadsheetUrl = ss.spreadsheetUrl;
    await moveDriveFileToFolder(ss.spreadsheetId, cloudConfig.rootFolderId);
    saveCloudConfig();
  }

  setCloudStatus("☁️ Google connected · ready to sync", "connected");
}

function cloudSheetRows(){
  const headers = [
    "Project Pole","Pole ID","Status",
    "PLACE NEW STRAND","INSTALL DOWNGUY","TREE TRIMMING",
    "INSTALL POLE GROUND AND BOND","PLACE GUARD ARM","PLACE DOUBLE GUARD ARM",
    "TRANSFER / REWORK EXISTING DOWN GUY","PLACE OVERHEAD GUY",
    "RAISE OR LOWER POLE ATTACHMENT","INSTALL NEW RISER GUARD",
    "PLACE F-ARMS","REMOVE ARM","POLE TRANSFER",
    "Original HOA","Actual HOA","Height Change Description",
    "Anchor Status","Anchor Details","Field Notes","Updated At"
  ];

  const rows = poles.map(p => {
    const r = recordFor(p);
    const w = r.work || {};
    return [
      r.projectPole, r.poleId, r.status,
      w.newStrand ?? "", w.installDownGuy ?? "", w.treeTrimming ?? "",
      w.groundBond ?? "", w.guardArm ?? "", w.doubleGuardArm ?? "",
      w.reworkDownGuy ?? "", w.overheadGuy ?? "",
      w.raiseLower ?? "", w.riserGuard ?? "",
      w.fArms ?? "", w.removeArm ?? "", w.poleTransfer ?? "",
      r.originalHoa ?? "", r.actualHoa ?? "", r.heightChangeDescription ?? "",
      r.anchorStatus ?? "", r.anchorDetails ?? "", r.fieldNotes ?? "", r.updatedAt ?? ""
    ];
  });

  return [headers, ...rows];
}

async function syncSheetToCloud(){
  if(!cloudConfig.spreadsheetId) throw new Error("Cloud spreadsheet is not configured");

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cloudConfig.spreadsheetId)}/values/Poles!A1:W100?valueInputOption=RAW`,
    {
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        range:"Poles!A1:W100",
        majorDimension:"ROWS",
        values:cloudSheetRows()
      })
    }
  );
}

async function ensurePolePhotoFolders(projectPole, poleId){
  cloudConfig.poleFolders ||= {};
  const key = String(projectPole);

  if(cloudConfig.poleFolders[key]?.beforeId && cloudConfig.poleFolders[key]?.afterId){
    return cloudConfig.poleFolders[key];
  }

  const poleFolder = await createDriveFolder(
    poleId ? `${projectPole}_${poleId}` : `Pole_${projectPole}`,
    cloudConfig.photosFolderId
  );
  const before = await createDriveFolder("BEFORE", poleFolder.id);
  const after = await createDriveFolder("AFTER", poleFolder.id);

  cloudConfig.poleFolders[key] = {
    poleId: poleFolder.id,
    beforeId: before.id,
    afterId: after.id
  };
  saveCloudConfig();
  return cloudConfig.poleFolders[key];
}

async function uploadBlobToDrive(item, folderId){
  const boundary = "mr_boundary_" + Math.random().toString(36).slice(2);
  const metadata = {
    name: `${item.projectPole}_${item.poleId || "NOID"}_${item.type}_${Date.now()}_${item.name || "photo.jpg"}`,
    parents:[folderId]
  };

  const prefix =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) + `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${item.blob.type || "image/jpeg"}\r\n\r\n`;
  const suffix = `\r\n--${boundary}--`;

  const body = new Blob([prefix, item.blob, suffix], {
    type:`multipart/related; boundary=${boundary}`
  });

  return googleFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method:"POST",
      headers:{"Content-Type":`multipart/related; boundary=${boundary}`},
      body
    }
  );
}

async function syncPhotosToCloud(){
  const photos = await allLocalPhotos();
  const unsynced = photos.filter(p => !p.driveFileId);

  for(let i=0; i<unsynced.length; i++){
    const item = unsynced[i];
    setCloudStatus(`☁️ Uploading photos ${i+1}/${unsynced.length}…`, "syncing");

    const folders = await ensurePolePhotoFolders(item.projectPole, item.poleId);
    const folderId = item.type === "BEFORE" ? folders.beforeId : folders.afterId;
    const uploaded = await uploadBlobToDrive(item, folderId);

    item.driveFileId = uploaded.id;
    item.syncedAt = new Date().toISOString();
    await updatePhotoRecord(item);
  }
}

async function syncAllToCloud(){
  if(syncBusy) return;
  if(!googleToken){
    setCloudStatus("📱 Saved locally · connect Google to sync", "local");
    return;
  }

  syncBusy = true;
  try{
    setCloudStatus("☁️ Syncing data…", "syncing");
    await ensureCloudProject();
    await syncSheetToCloud();
    await syncPhotosToCloud();
    setCloudStatus("☁️ Synced · Google Drive + Sheets", "connected");
  }finally{
    syncBusy = false;
  }
}

async function saveAndMaybeSync(){
  const ok = saveCurrentPole();
  if(ok && googleToken){
    try{
      await syncAllToCloud();
    }catch(err){
      setCloudStatus("📱 Saved locally · sync failed: " + err.message, "error");
    }
  }else if(ok){
    setCloudStatus("📱 Saved locally · Google not connected", "local");
  }
  return ok;
}

// ---------------- Events ----------------
function bindEvents(){
  el("nextPoleBtn").addEventListener("click", () => window.open(MY_MAPS_URL,"_blank"));
  el("myMapsBtn").addEventListener("click", () => window.open(MY_MAPS_URL,"_blank"));
  el("makeReadyBtn").addEventListener("click", () => window.open(MAKE_READY_PDF_URL,"_blank"));
  el("utilityMapBtn").addEventListener("click", () => window.open(UTILITY_MAP_PDF_URL,"_blank"));

  el("adminBtn").addEventListener("click", () => el("adminDialog").showModal());
  el("googleConnectBtn").addEventListener("click", requestGoogleAccess);
  el("syncNowBtn").addEventListener("click", async () => {
    if(!googleToken) return requestGoogleAccess();
    try{ await syncAllToCloud(); }catch(err){ setCloudStatus("⚠️ " + err.message,"error"); }
  });
  el("openCloudSheetBtn").addEventListener("click", () => {
    if(cloudConfig.spreadsheetUrl) window.open(cloudConfig.spreadsheetUrl,"_blank");
    else alert("Connect Google first.");
  });
  el("openCloudFolderBtn").addEventListener("click", () => {
    if(cloudConfig.rootFolderUrl) window.open(cloudConfig.rootFolderUrl,"_blank");
    else alert("Connect Google first.");
  });
  el("otherWorkBtn").addEventListener("click", () => el("otherWorkDialog").showModal());
  el("closeOtherWorkBtn").addEventListener("click", () => el("otherWorkDialog").close());
  el("saveOtherWorkBtn").addEventListener("click", () => el("otherWorkDialog").close());
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

  ["beforeCameraInput","beforeLibraryInput"].forEach(id => {
    el(id).addEventListener("change", async e => {
      try{
        await handlePhotoFiles(e.target.files,"BEFORE");
        e.target.value = "";
        if(googleToken) await syncAllToCloud();
      }catch(err){
        showError("Не удалось сохранить BEFORE фото: " + err.message);
      }
    });
  });

  ["afterCameraInput","afterLibraryInput"].forEach(id => {
    el(id).addEventListener("change", async e => {
      try{
        await handlePhotoFiles(e.target.files,"AFTER");
        e.target.value = "";
        if(googleToken) await syncAllToCloud();
      }catch(err){
        showError("Не удалось сохранить AFTER фото: " + err.message);
      }
    });
  });

  el("saveBtn").addEventListener("click", async () => {
    await saveAndMaybeSync();
    setTimeout(() => el("poleDialog").close(), 300);
  });

  el("saveNextBtn").addEventListener("click", async () => {
    if(await saveAndMaybeSync()){
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
  loadCloudConfig();
  bindEvents();

  if(cloudConfig.spreadsheetId){
    setCloudStatus("📱 Saved locally · press Connect Google to sync", "local");
  }

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
