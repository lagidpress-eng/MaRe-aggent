(() => {
"use strict";

let PROJECT = "";
const APP_VERSION = "11.9.2";
const DEFAULT_MY_MAPS_URL = "https://www.google.com/maps/d/u/1/edit?mid=1m9hb-O3axriFGU5971D2sjqFOQ_Tv1w&usp=sharing";
const DEFAULT_MAKE_READY_PDF_URL = "https://drive.google.com/file/d/1TUSsHo9TNyamg38bGJMS2quFliZ43sn9/view";
const DEFAULT_UTILITY_MAP_PDF_URL = "https://drive.google.com/file/d/1vh6zp7VjtKb1JrQU52GPt9uxxeH6TF8N/view";

const GOOGLE_CLIENT_ID = "134936424695-ktnolqsbld9mjhh2qqht0n2pms5cguab.apps.googleusercontent.com";
const GOOGLE_SCOPES = "openid email https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";
const CLOUD_CONFIG_PREFIX = "makeReadyAgent_V10_cloud_";
const PROJECT_REGISTRY_SPREADSHEET_ID = "1Tc0u7SU4O0zPcy55XGmjvEcsA0TaiiKpngj7e2lSnZ0";
const PROJECT_REGISTRY_SHEET = "Projects";


const ADMIN_EMAILS = new Set([
  "ruslan.strtower@gmail.com"
]);
let signedInEmail = "";
let userRole = "TECHNICIAN";

function isAdmin(){
  return userRole === "ADMIN";
}

function applyRoleUi(){
  document.querySelectorAll(".admin-only").forEach(node => {
    node.classList.toggle("hidden", !isAdmin());
  });

  const badge = el("roleBadge");
  if(badge){
    badge.textContent = isAdmin() ? "ADMIN" : "TECHNICIAN";
    badge.className = "role-badge " + (isAdmin() ? "admin" : "tech");
    if(signedInEmail) badge.title = signedInEmail;
  }
}

async function loadSignedInGoogleUser(){
  if(!googleToken){
    signedInEmail = "";
    userRole = "TECHNICIAN";
    applyRoleUi();
    return;
  }

  try{
    const profile = await googleFetch("https://www.googleapis.com/oauth2/v3/userinfo");
    signedInEmail = String(profile.email || "").toLowerCase();
    userRole = ADMIN_EMAILS.has(signedInEmail) ? "ADMIN" : "TECHNICIAN";
  }catch(err){
    signedInEmail = "";
    userRole = "TECHNICIAN";
  }
  applyRoleUi();
}

function requireAdmin(){
  if(isAdmin()) return true;
  alert("Admin access required.");
  return false;
}

let googleToken = "";
let tokenClient = null;
let cloudConfig = {};
let syncBusy = false;


const PROJECTS_KEY = "makeReadyAgent_V10_projects";
const ACTIVE_PROJECT_KEY = "makeReadyAgent_V10_active_project";
const DB_NAME = "MakeReadyAgentV10Photos";
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

let projects = {};
let activeProject = null;
let poles = [];
let state = {};
let currentPole = null;

function el(id){ return document.getElementById(id); }


function projectStateKey(projectId){
  return `makeReadyAgent_V10_state_${projectId}`;
}
function cloudConfigKey(projectId){
  return `${CLOUD_CONFIG_PREFIX}${projectId}`;
}
function projectPhotoKey(projectPole, type){
  return `${PROJECT}|${projectPole}|${type}`;
}

function seedDefaultProject(){
  if(projects["PRM0001297784"]) return;
  projects["PRM0001297784"] = {
    id:"PRM0001297784",
    name:"PRM0001297784",
    myMapsUrl:DEFAULT_MY_MAPS_URL,
    makeReadyUrl:DEFAULT_MAKE_READY_PDF_URL,
    utilityMapUrl:DEFAULT_UTILITY_MAP_PDF_URL,
    dataUrl:"data.json",
    poles:null
  };
}

function loadProjects(){
  try{
    projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || "{}");
  }catch{
    projects = {};
  }
  seedDefaultProject();
  saveProjects();
}
function saveProjects(){
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}
function getActiveProjectId(){
  return localStorage.getItem(ACTIVE_PROJECT_KEY) || Object.keys(projects)[0] || "PRM0001297784";
}
function setActiveProjectId(id){
  localStorage.setItem(ACTIVE_PROJECT_KEY,id);
}
function renderProjectSelect(){
  const select = el("projectSelect");
  select.innerHTML = Object.values(projects)
    .sort((a,b)=>String(a.id).localeCompare(String(b.id)))
    .map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || p.id)}</option>`)
    .join("");
  if(activeProject) select.value = activeProject.id;
}
async function switchProject(id){
  const p = projects[id];
  if(!p) return;

  activeProject = p;
  PROJECT = p.id;
  setActiveProjectId(id);
  currentPole = null;

  loadState();
  loadCloudConfig();

  if(Array.isArray(p.poles)){
    poles = p.poles;
  }else{
    const response = await fetch(`${p.dataUrl || "data.json"}?v=${APP_VERSION}`, {cache:"no-store"});
    if(!response.ok) throw new Error(`Project data: HTTP ${response.status}`);
    poles = await response.json();
  }

  renderProjectSelect();
  renderList();
  updateProjectHeader();

  if(googleToken && cloudConfig.spreadsheetId){
    try{
      await pullCloudState();
      setCloudStatus("☁️ Restored from Google · ready","connected");
    }catch(err){
      setCloudStatus("📱 Local data shown · cloud restore failed","error");
    }
  }else{
    setCloudStatus("📱 Offline cache · press Sync now to load cloud projects","local");
  }
}
function updateProjectHeader(){
  const sub = document.querySelector(".subtitle");
  if(sub) sub.textContent = `${PROJECT}`;
}
function projectUrl(key){
  return activeProject?.[key] || "";
}

function parseCsvText(text){
  const rows = [];
  let row = [], cell = "", quote = false;

  for(let i=0;i<text.length;i++){
    const ch = text[i];
    const next = text[i+1];

    if(ch === '"' && quote && next === '"'){
      cell += '"'; i++; continue;
    }
    if(ch === '"'){
      quote = !quote; continue;
    }
    if(ch === ',' && !quote){
      row.push(cell); cell = ""; continue;
    }
    if((ch === '\n' || ch === '\r') && !quote){
      if(ch === '\r' && next === '\n') i++;
      row.push(cell); cell = "";
      if(row.some(x=>String(x).trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if(cell.length || row.length){
    row.push(cell);
    if(row.some(x=>String(x).trim() !== "")) rows.push(row);
  }
  if(!rows.length) return [];

  const headers = rows[0].map(x=>String(x).trim());
  const idx = name => headers.findIndex(h=>h.toLowerCase()===name.toLowerCase());

  const nameI = idx("Name");
  const poleI = idx("Pole #");
  const latI = idx("Latitude");
  const lonI = idx("Longitude");
  const descI = idx("Description");

  return rows.slice(1).map(r=>{
    const name = r[nameI] || "";
    const m = String(name).match(/(\d+)/);
    return {
      projectPole:m ? Number(m[1]) : null,
      poleId:String(r[poleI] || "").replace(/\.0$/,"").trim(),
      lat:Number(r[latI]),
      lon:Number(r[lonI]),
      description:String(r[descI] || "").trim()
    };
  }).filter(p=>Number.isFinite(p.projectPole));
}

function showError(message){
  console.error(message);
  const box = el("errorBox");
  if(!box) return;
  box.textContent = "Site error: " + message;
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



function makeReadyRequiresDownGuy(description){
  const text = String(description || "").toUpperCase();
  return /\bDOWN\s*GUY\b|\bDOWNGUY\b|\bDG\b/.test(text);
}

function makeReadyRequiresRamsHead(description){
  const text = String(description || "").toUpperCase();
  return /\bRAM'?S?\s*HEAD\b|\bRAMSHEAD\b/.test(text);
}

function normalizeHoaForCompare(value){
  return String(value || "")
    .toUpperCase()
    .replace(/\s+/g,"")
    .replace(/[()]/g,"");
}

function hasHoaChange(projectHoa, actualHoa){
  const actual = normalizeHoaForCompare(actualHoa);
  if(!actual) return false;

  // Multiple design HOA values can exist. Treat Actual as unchanged if it matches any design HOA value.
  const projectParts = String(projectHoa || "")
    .split("|")
    .map(normalizeHoaForCompare)
    .filter(Boolean);

  if(!projectParts.length) return true;
  return !projectParts.includes(actual);
}

function completionRequirements(record, pole){
  const projectHoa = extractProjectHoa(pole.description);
  const actualHoa = record.actualHoa || "";
  const hoaIsChanged = hasHoaChange(projectHoa, actualHoa);
  const hoaMissingDescription = false;

  const dgRequired = makeReadyRequiresDownGuy(pole.description);
  const dgQty = Number(record.work?.installDownGuy || 0);
  const dgNeedsConfirmation = dgRequired && !(dgQty > 0);

  const ramRequired = makeReadyRequiresRamsHead(pole.description);
  const ramResult = record.ramsHeadResult || "";
  const ramNeedsConfirmation = ramRequired && !["INSTALLED","NOT REQUIRED"].includes(ramResult);

  return {
    projectHoa,
    actualHoa,
    hoaIsChanged,
    hoaMissingDescription,
    dgRequired,
    dgNeedsConfirmation,
    ramRequired,
    ramNeedsConfirmation
  };
}

function extractProjectHoa(description){
  const text = String(description || "");
  const results = [];
  const seen = new Set();

  // Capture HOA values and, when present, the direction immediately following them.
  const regex = /HOA\s*=\s*(\d{1,3}'\s*\d{1,2}")([^A-Z0-9]{0,8}\([NSEW\/]+\))?/gi;
  let match;

  while((match = regex.exec(text)) !== null){
    let value = match[1].replace(/\s+/g,"");
    const suffix = (match[2] || "").trim();
    if(suffix) value += " " + suffix;

    const key = value.toUpperCase();
    if(!seen.has(key)){
      seen.add(key);
      results.push(value);
    }
  }

  return results.join(" | ");
}

function hoaChanged(projectHoa, actualHoa){
  const a = String(projectHoa || "").trim();
  const b = String(actualHoa || "").trim();
  if(!b) return "";
  if(!a) return "ACTUAL ENTERED";
  return a === b ? "NO" : "YES";
}

function defaultRecord(pole){
  return {
    projectPole: pole.projectPole,
    poleId: pole.poleId || "",
    status: "Not started",
    work: {},
    originalHoa: extractProjectHoa(pole.description),
    actualHoa: "",
    heightChangeDescription: "",
    hoaChangeConfirmed: "",
    anchorStatus: "",
    anchorDetails: "",
    fieldNotes: "",
    dgException: "",
    ramsHeadResult: "",
    validationNote: "",
    updatedAt: ""
  };
}

function recordFor(pole){
  const saved = state[String(pole.projectPole)] || {};
  return {
    ...defaultRecord(pole),
    ...saved,
    originalHoa: extractProjectHoa(pole.description),
    work: { ...(saved.work || {}) }
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(projectStateKey(PROJECT));
    state = raw ? JSON.parse(raw) : {};
  }catch(err){
    state = {};
    showError("Could not read saved project data.");
  }
}

function saveState(){
  localStorage.setItem(projectStateKey(PROJECT), JSON.stringify(state));
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
    <div class="stat"><b>${poles.length}</b>Total</div>
    <div class="stat"><b>${counts["Not started"]}</b>Not Started</div>
    <div class="stat"><b>${counts["In progress"]}</b>In Progress</div>
    <div class="stat"><b>${counts["Completed"]}</b>Completed</div>
  `;
}

function renderList(){
  const q = (el("searchInput").value || "").trim().toLowerCase();
  const filter = el("statusFilter").value;

  const terminalStatuses = new Set(["Completed","Do not attach","Blown pole"]);

  const filtered = poles
    .filter(p => {
      const rec = recordFor(p);
      const hay = `pole ${p.projectPole} ${p.projectPole} ${p.poleId || ""}`.toLowerCase();
      return hay.includes(q) && (!filter || rec.status === filter);
    })
    .sort((a,b) => {
      const sa = recordFor(a).status;
      const sb = recordFor(b).status;
      const aDone = terminalStatuses.has(sa) ? 1 : 0;
      const bDone = terminalStatuses.has(sb) ? 1 : 0;

      if(aDone !== bDone) return aDone - bDone;

      // Inside completed/special group keep natural pole order.
      if(aDone && bDone) return Number(a.projectPole) - Number(b.projectPole);

      // Active poles stay in natural project order.
      return Number(a.projectPole) - Number(b.projectPole);
    });

  if(filtered.length === 0){
    el("poleList").innerHTML = `<div class="loading">Nothing found.</div>`;
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
  el("completedBtn").classList.toggle("active", s === "Completed");
  el("problemBtn").classList.toggle("active", s === "Problem");
  el("doNotAttachBtn").classList.toggle("active", s === "Do not attach");
  el("blownPoleBtn").classList.toggle("active", s === "Blown pole");
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
    "originalHoa","actualHoa",
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
    originalHoa: extractProjectHoa(currentPole.description),
    actualHoa: el("actualHoa").value,
    heightChangeDescription: old.heightChangeDescription || "",
    anchorStatus: el("anchorStatus").value,
    anchorDetails: el("anchorDetails").value,
    status: el("statusSelect").value,
    fieldNotes: el("fieldNotes").value,
    dgException: old.dgException || "",
    ramsHeadResult: old.ramsHeadResult || "",
    validationNote: old.validationNote || "",
    updatedAt: new Date().toISOString()
  };
}

function saveCurrentPole(){
  if(!currentPole) return false;
  state[String(currentPole.projectPole)] = collectCurrentRecord();
  saveState();
  el("saveMessage").textContent = "Saved on this device.";
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
  if(!payload || typeof payload.state !== "object") throw new Error("Invalid backup JSON");
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
    poleType: projectPhotoKey(currentPole.projectPole,type),
    project: PROJECT,
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
    const req = tx.objectStore(DB_STORE).index("poleType").getAll(projectPhotoKey(projectPole,type));
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



// ---------------- Cloud project registry ----------------
// New projects are stored in one shared Google Sheet so they appear on every device.
// localStorage remains only a fast offline cache.

function normalizeProjectFromRegistryRow(row){
  const id = String(row?.[0] || "").trim();
  if(!id) return null;

  let poleData = [];
  try{
    poleData = JSON.parse(String(row?.[5] || "[]"));
    if(!Array.isArray(poleData)) poleData = [];
  }catch{
    poleData = [];
  }

  return {
    id,
    name:String(row?.[1] || id).trim() || id,
    myMapsUrl:String(row?.[2] || "").trim(),
    makeReadyUrl:String(row?.[3] || "").trim(),
    utilityMapUrl:String(row?.[4] || "").trim(),
    poles:poleData,
    cloudUpdatedAt:String(row?.[6] || ""),
    cloudUpdatedBy:String(row?.[7] || "")
  };
}

async function readProjectRegistry(){
  if(!googleToken) throw new Error("Google is not connected");

  const sid = encodeURIComponent(PROJECT_REGISTRY_SPREADSHEET_ID);
  const range = encodeURIComponent(`${PROJECT_REGISTRY_SHEET}!A2:H1000`);
  const data = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${range}`
  );

  return (data.values || [])
    .map(normalizeProjectFromRegistryRow)
    .filter(Boolean);
}

async function syncProjectsFromCloud({switchIfNeeded=false}={}){
  if(!googleToken) return false;

  setCloudStatus("☁️ Loading project list…","syncing");
  const cloudProjects = await readProjectRegistry();

  // Cloud registry is authoritative for projects it contains.
  cloudProjects.forEach(p => {
    projects[p.id] = p;
  });

  // Keep built-in project as emergency offline fallback.
  seedDefaultProject();
  saveProjects();
  renderProjectSelect();

  if(switchIfNeeded){
    const currentId = activeProject?.id || getActiveProjectId();
    if(projects[currentId]){
      if(!activeProject || activeProject.id !== currentId){
        await switchProject(currentId);
      }else{
        // Refresh active metadata/poles from registry without changing local pole status state.
        activeProject = projects[currentId];
        if(Array.isArray(activeProject.poles) && activeProject.poles.length){
          poles = activeProject.poles;
          renderList();
          updateProjectHeader();
        }
      }
    }else{
      const firstId = Object.keys(projects).sort()[0];
      if(firstId) await switchProject(firstId);
    }
  }

  setCloudStatus(`☁️ ${cloudProjects.length} project(s) loaded · ${signedInEmail || "Google"}`,"connected");
  return true;
}

async function findProjectRegistryRow(projectId){
  const sid = encodeURIComponent(PROJECT_REGISTRY_SPREADSHEET_ID);
  const range = encodeURIComponent(`${PROJECT_REGISTRY_SHEET}!A2:A1000`);
  const data = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${range}`
  );
  const values = data.values || [];
  const target = String(projectId).trim();

  for(let i=0;i<values.length;i++){
    if(String(values[i]?.[0] || "").trim() === target){
      return i + 2; // Sheet row number (header is row 1)
    }
  }
  return null;
}

function projectRegistryValues(project){
  return [[
    project.id,
    project.name || project.id,
    project.myMapsUrl || "",
    project.makeReadyUrl || "",
    project.utilityMapUrl || "",
    JSON.stringify(Array.isArray(project.poles) ? project.poles : []),
    new Date().toISOString(),
    signedInEmail || ""
  ]];
}

async function saveProjectToRegistry(project){
  if(!googleToken) throw new Error("Connect Google before creating or editing a project.");
  if(!isAdmin()) throw new Error("Admin access required.");

  const sid = encodeURIComponent(PROJECT_REGISTRY_SPREADSHEET_ID);
  const row = await findProjectRegistryRow(project.id);
  const values = projectRegistryValues(project);

  if(row){
    const range = encodeURIComponent(`${PROJECT_REGISTRY_SHEET}!A${row}:H${row}`);
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${range}?valueInputOption=RAW`,
      {
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({values})
      }
    );
  }else{
    const range = encodeURIComponent(`${PROJECT_REGISTRY_SHEET}!A:H`);
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({values})
      }
    );
  }

  projects[project.id] = project;
  saveProjects();
  renderProjectSelect();
}


// ---------------- Google cloud sync ----------------

const WORK_LABEL_TO_KEY = {
  "PLACE NEW STRAND":"newStrand",
  "INSTALL DOWNGUY":"installDownGuy",
  "TRANSFER / REWORK EXISTING DOWN GUY":"reworkDownGuy",
  "PLACE OVERHEAD GUY":"overheadGuy",
  "INSTALL POLE GROUND AND BOND":"groundBond",
  "RAISE OR LOWER POLE ATTACHMENT":"raiseLower",
  "INSTALL NEW RISER GUARD TO SECURE CABLES TO POLES":"riserGuard",
  "TREE TRIMMING":"treeTrimming",
  "PLACE F-ARMS (INCLUDING MATERIAL)*":"fArms",
  "PLACE GUARD ARM":"guardArm",
  "PLACE DOUBLE GUARD ARM":"doubleGuardArm",
  "REMOVE ARM":"removeArm",
  "POLE TRANSFER":"poleTransfer"
};

function parseTime(value){
  const t = Date.parse(value || "");
  return Number.isFinite(t) ? t : 0;
}

async function readSheetRange(range){
  if(!cloudConfig.spreadsheetId) throw new Error("Cloud spreadsheet is not configured");
  const sid = encodeURIComponent(cloudConfig.spreadsheetId);
  const encodedRange = encodeURIComponent(range);
  const data = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodedRange}`
  );
  return Array.isArray(data.values) ? data.values : [];
}

function parseCloudFieldLog(values){
  if(!values.length) return {};
  const headers = (values[0] || []).map(v => String(v || "").trim());
  const col = name => headers.findIndex(h => h === name);
  const out = {};

  for(const row of values.slice(1)){
    const projectPole = Number(row[col("Project Pole")]);
    if(!projectPole) continue;

    out[String(projectPole)] = {
      projectPole,
      poleId: row[col("Pole ID")] || "",
      status: row[col("Status")] || "Not started",
      originalHoa: row[col("Project HOA")] || "",
      actualHoa: row[col("Actual HOA")] || "",
      hoaChangeConfirmed: row[col("HOA Change Confirmed")] || "",
      dgException: row[col("DownGuy Exception")] || "",
      ramsHeadResult: row[col("Ram's Head Result")] || "",
      validationNote: row[col("Validation Note")] || "",
      anchorStatus: row[col("Anchor Status")] || "",
      anchorDetails: row[col("Anchor Details")] || "",
      fieldNotes: row[col("Field Notes")] || "",
      updatedAt: row[col("Updated At")] || "",
      work: {
        raiseLower: row[col("Lines Raised / Lowered")] === "" || row[col("Lines Raised / Lowered")] == null
          ? ""
          : Number(row[col("Lines Raised / Lowered")])
      }
    };
  }
  return out;
}

function parseCloudProduction(values){
  const result = {};
  if(values.length < 5) return result;

  const poleHeaderRow = values[2] || [];
  const poleColumns = [];

  for(let c=1;c<poleHeaderRow.length;c++){
    const m = String(poleHeaderRow[c] || "").match(/Pole\s+(\d+)/i);
    if(m){
      poleColumns.push({col:c, projectPole:Number(m[1])});
      result[String(Number(m[1]))] ||= {};
    }
  }

  for(let r=5;r<values.length;r++){
    const label = String(values[r]?.[0] || "").trim().toUpperCase();
    const key = WORK_LABEL_TO_KEY[label];
    if(!key) continue;

    for(const p of poleColumns){
      const raw = values[r]?.[p.col];
      if(raw === "" || raw == null) continue;
      const n = Number(raw);
      result[String(p.projectPole)][key] = Number.isFinite(n) ? n : raw;
    }
  }
  return result;
}

async function pullCloudState(){
  if(!googleToken || !cloudConfig.spreadsheetId) return false;

  setCloudStatus("☁️ Loading saved project data…","syncing");

  const [fieldValues, productionValues] = await Promise.all([
    readSheetRange("Field Log!A1:O2000"),
    readSheetRange("Production!A1:ZZ200")
  ]);

  const cloudRecords = parseCloudFieldLog(fieldValues);
  const cloudWork = parseCloudProduction(productionValues);

  let changed = false;

  poles.forEach(p => {
    const key = String(p.projectPole);
    const local = state[key] || null;
    const remote = cloudRecords[key] || null;

    // Field Log's Updated At decides which complete Pole record is newer.
    const localTime = parseTime(local?.updatedAt);
    const remoteTime = parseTime(remote?.updatedAt);

    // If local data does not exist, or cloud is at least as new, restore cloud.
    // Equal timestamps favor cloud because Sheets is the durable copy.
    if(remote && (!local || remoteTime >= localTime)){
      state[key] = {
        ...defaultRecord(p),
        ...local,
        ...remote,
        originalHoa: extractProjectHoa(p.description),
        work:{
          ...(local?.work || {}),
          ...(remote.work || {}),
          ...(cloudWork[key] || {})
        }
      };
      changed = true;
    } else if(local && cloudWork[key] && remoteTime >= localTime){
      state[key].work = {
        ...(state[key].work || {}),
        ...cloudWork[key]
      };
      changed = true;
    }
  });

  if(changed){
    saveState();
    renderList();
  }

  return changed;
}

async function safeCloudMergeThenSync(){
  await ensureCloudProject();
  await pullCloudState();
  await syncSheetToCloud();
  await syncPhotosToCloud();
}


function driveQueryEscape(value){
  return String(value).replace(/\\/g,"\\\\").replace(/'/g,"\\'");
}

async function findDriveFileByName(name, mimeType, parentId=null){
  const parts = [
    `name = '${driveQueryEscape(name)}'`,
    `mimeType = '${driveQueryEscape(mimeType)}'`,
    "trashed = false"
  ];
  if(parentId){
    parts.push(`'${driveQueryEscape(parentId)}' in parents`);
  }

  const q = parts.join(" and ");
  const url =
    "https://www.googleapis.com/drive/v3/files" +
    `?q=${encodeURIComponent(q)}` +
    "&spaces=drive" +
    "&fields=files(id,name,mimeType,parents,createdTime,webViewLink)" +
    "&orderBy=createdTime";

  const result = await googleFetch(url);
  return Array.isArray(result.files) && result.files.length ? result.files[0] : null;
}

async function getDriveFileIfExists(fileId){
  if(!fileId) return null;
  try{
    return await googleFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,parents,webViewLink`
    );
  }catch(err){
    if(String(err.message || "").includes("File not found")) return null;
    return null;
  }
}

async function findOrCreateFolder(name, parentId=null){
  const found = await findDriveFileByName(
    name,
    "application/vnd.google-apps.folder",
    parentId
  );
  if(found) return found;
  return createDriveFolder(name, parentId);
}

async function findExistingProjectSpreadsheet(parentId){
  return findDriveFileByName(
    `Make Ready Agent Data - ${PROJECT}`,
    "application/vnd.google-apps.spreadsheet",
    parentId
  );
}

function loadCloudConfig(){
  try{
    cloudConfig = JSON.parse(localStorage.getItem(cloudConfigKey(PROJECT)) || "{}");
  }catch{
    cloudConfig = {};
  }
}

function saveCloudConfig(){
  localStorage.setItem(cloudConfigKey(PROJECT), JSON.stringify(cloudConfig));
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
        await loadSignedInGoogleUser();
        await syncProjectsFromCloud({switchIfNeeded:true});
        await ensureCloudProject();
        await pullCloudState();
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
        sheets:[
          {properties:{title:"Production", gridProperties:{frozenRowCount:5, frozenColumnCount:1}}},
          {properties:{title:"Field Log", gridProperties:{frozenRowCount:1}}}
        ]
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


async function ensureRequiredSheets(){
  if(!cloudConfig.spreadsheetId) return;

  const meta = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cloudConfig.spreadsheetId)}?fields=sheets(properties(sheetId,title))`
  );
  const titles = new Set((meta.sheets || []).map(s => s.properties.title));
  const requests = [];

  if(!titles.has("Production")){
    requests.push({addSheet:{properties:{title:"Production",gridProperties:{frozenRowCount:5,frozenColumnCount:1}}}});
  }
  if(!titles.has("Field Log")){
    requests.push({addSheet:{properties:{title:"Field Log",gridProperties:{frozenRowCount:1}}}});
  }

  if(requests.length){
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cloudConfig.spreadsheetId)}:batchUpdate`,
      {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({requests})
      }
    );
  }
}

async function ensureCloudProject(){
  if(!googleToken) throw new Error("Google is not connected");

  // 1. PROJECT ROOT: always verify/search Drive before creating.
  let root = await getDriveFileIfExists(cloudConfig.rootFolderId);
  if(!root || root.mimeType !== "application/vnd.google-apps.folder"){
    root = await findOrCreateFolder(PROJECT);
  }
  cloudConfig.rootFolderId = root.id;
  cloudConfig.rootFolderUrl = `https://drive.google.com/drive/folders/${root.id}`;
  saveCloudConfig();

  // 2. PHOTOS: one Photos folder inside the one project root.
  let photos = await getDriveFileIfExists(cloudConfig.photosFolderId);
  const photosHasCorrectParent =
    photos &&
    photos.mimeType === "application/vnd.google-apps.folder" &&
    Array.isArray(photos.parents) &&
    photos.parents.includes(root.id);

  if(!photosHasCorrectParent){
    photos = await findOrCreateFolder("Photos", root.id);
  }
  cloudConfig.photosFolderId = photos.id;
  saveCloudConfig();

  // 3. SPREADSHEET: one spreadsheet inside project root.
  let spreadsheet = await getDriveFileIfExists(cloudConfig.spreadsheetId);
  const spreadsheetHasCorrectParent =
    spreadsheet &&
    spreadsheet.mimeType === "application/vnd.google-apps.spreadsheet" &&
    Array.isArray(spreadsheet.parents) &&
    spreadsheet.parents.includes(root.id);

  if(!spreadsheetHasCorrectParent){
    spreadsheet = await findExistingProjectSpreadsheet(root.id);

    if(!spreadsheet){
      const created = await createCloudSpreadsheet();
      await moveDriveFileToFolder(created.spreadsheetId, root.id);
      spreadsheet = await getDriveFileIfExists(created.spreadsheetId);
      cloudConfig.spreadsheetUrl = created.spreadsheetUrl;
    }
  }

  cloudConfig.spreadsheetId = spreadsheet.id;
  cloudConfig.spreadsheetUrl =
    cloudConfig.spreadsheetUrl ||
    `https://docs.google.com/spreadsheets/d/${spreadsheet.id}/edit`;
  saveCloudConfig();

  await ensureRequiredSheets();
  setCloudStatus("☁️ Google connected · Production + Field Log ready", "connected");
}

function productionSheetValues(){
  const poleHeaders = poles.map(p => `Pole ${p.projectPole}`);
  const qtyHeaders = poles.map(() => "Qty");

  const workRows = [
    ["PLACE NEW STRAND","newStrand"],
    ["INSTALL DOWNGUY","installDownGuy"],
    ["TRANSFER / REWORK EXISTING DOWN GUY","reworkDownGuy"],
    ["PLACE OVERHEAD GUY","overheadGuy"],
    ["INSTALL POLE GROUND AND BOND","groundBond"],
    ["RAISE OR LOWER POLE ATTACHMENT","raiseLower"],
    ["INSTALL NEW RISER GUARD TO SECURE CABLES TO POLES","riserGuard"],
    ["TREE TRIMMING","treeTrimming"],
    ["PLACE F-ARMS (INCLUDING MATERIAL)*","fArms"],
    ["PLACE GUARD ARM","guardArm"],
    ["PLACE DOUBLE GUARD ARM","doubleGuardArm"],
    ["REMOVE ARM","removeArm"],
    ["POLE TRANSFER","poleTransfer"]
  ];

  const values = [
    [PROJECT, ...poles.map(() => "")],
    [`Updated: ${new Date().toLocaleDateString()}`, ...poles.map(() => "")],
    ["Description", ...poleHeaders],
    ["", ...qtyHeaders],
    ["POLE STATUS", ...poles.map(p => {
      const status = recordFor(p).status;
      if(status === "Do not attach") return "DO NOT ATTACH";
      if(status === "Blown pole") return "BLOWN POLE";
      return "";
    })]
  ];

  workRows.forEach(([label,key]) => {
    values.push([
      label,
      ...poles.map(p => {
        const r = recordFor(p);
        const v = r.work?.[key];
        return v === "" || v == null ? "" : v;
      })
    ]);
  });

  return values;
}

function fieldLogSheetValues(){
  const headers = [
    "Project Pole",
    "Pole ID",
    "Status",
    "Project HOA",
    "Actual HOA",
    "HOA Changed",
    "HOA Change Confirmed",
    "Lines Raised / Lowered",
    "DownGuy Exception",
    "Ram's Head Result",
    "Validation Note",
    "Anchor Status",
    "Anchor Details",
    "Field Notes",
    "Updated At"
  ];

  const rows = poles.map(p => {
    const r = recordFor(p);
    const projectHoa = extractProjectHoa(p.description);
    const actualHoa = r.actualHoa ?? "";

    return [
      r.projectPole,
      r.poleId,
      r.status,
      projectHoa,
      actualHoa,
      hoaChanged(projectHoa,actualHoa),
      r.hoaChangeConfirmed ?? "",
      r.work?.raiseLower ?? "",
      r.dgException ?? "",
      r.ramsHeadResult ?? "",
      r.validationNote ?? "",
      r.anchorStatus ?? "",
      r.anchorDetails ?? "",
      r.fieldNotes ?? "",
      r.updatedAt ?? ""
    ];
  });

  return [headers,...rows];
}



async function syncSheetToCloud(){
  if(!cloudConfig.spreadsheetId) throw new Error("Cloud spreadsheet is not configured");

  const spreadsheetId = encodeURIComponent(cloudConfig.spreadsheetId);

  // Production
  const prodValues = productionSheetValues();
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Production!A1:ZZ100?valueInputOption=RAW`,
    {
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        range:"Production!A1:ZZ100",
        majorDimension:"ROWS",
        values:prodValues
      })
    }
  );

  // Field Log
  const fieldValues = fieldLogSheetValues();
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Field%20Log!A1:O100?valueInputOption=RAW`,
    {
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        range:"Field Log!A1:O100",
        majorDimension:"ROWS",
        values:fieldValues
      })
    }
  );

  // Basic formatting
  const sheetMeta = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`
  );
  const prodSheet = sheetMeta.sheets.find(s => s.properties.title === "Production");
  const fieldSheet = sheetMeta.sheets.find(s => s.properties.title === "Field Log");

  const requests = [];

  if(prodSheet){
    const id = prodSheet.properties.sheetId;
    requests.push(
      {
        repeatCell:{
          range:{sheetId:id,startRowIndex:0,endRowIndex:1},
          cell:{userEnteredFormat:{backgroundColor:{red:1,green:1,blue:0},textFormat:{bold:true}}},
          fields:"userEnteredFormat(backgroundColor,textFormat)"
        }
      },
      {
        repeatCell:{
          range:{sheetId:id,startRowIndex:2,endRowIndex:5},
          cell:{userEnteredFormat:{textFormat:{bold:true},horizontalAlignment:"CENTER"}},
          fields:"userEnteredFormat(textFormat,horizontalAlignment)"
        }
      },
      {
        repeatCell:{
          range:{sheetId:id,startColumnIndex:0,endColumnIndex:1},
          cell:{userEnteredFormat:{textFormat:{bold:false}}},
          fields:"userEnteredFormat.textFormat"
        }
      },
      {
        updateDimensionProperties:{
          range:{sheetId:id,dimension:"COLUMNS",startIndex:0,endIndex:1},
          properties:{pixelSize:360},
          fields:"pixelSize"
        }
      }
    );
  }

  if(fieldSheet){
    const id = fieldSheet.properties.sheetId;
    requests.push({
      repeatCell:{
        range:{sheetId:id,startRowIndex:0,endRowIndex:1},
        cell:{userEnteredFormat:{textFormat:{bold:true},backgroundColor:{red:0.9,green:0.94,blue:0.97}}},
        fields:"userEnteredFormat(textFormat,backgroundColor)"
      }
    });
  }

  if(requests.length){
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({requests})
      }
    );
  }
}

async function ensurePolePhotoFolders(projectPole, poleId){
  cloudConfig.poleFolders ||= {};
  const key = String(projectPole);
  const folderName = poleId ? `${projectPole}_${poleId}` : `Pole_${projectPole}`;

  // Always recover the pole folder from Drive if local config is absent/stale.
  let poleFolder = null;
  const saved = cloudConfig.poleFolders[key];

  if(saved?.poleId){
    poleFolder = await getDriveFileIfExists(saved.poleId);
    if(
      !poleFolder ||
      poleFolder.mimeType !== "application/vnd.google-apps.folder" ||
      !Array.isArray(poleFolder.parents) ||
      !poleFolder.parents.includes(cloudConfig.photosFolderId)
    ){
      poleFolder = null;
    }
  }

  if(!poleFolder){
    poleFolder = await findOrCreateFolder(folderName, cloudConfig.photosFolderId);
  }

  let before = saved?.beforeId ? await getDriveFileIfExists(saved.beforeId) : null;
  if(
    !before ||
    before.mimeType !== "application/vnd.google-apps.folder" ||
    !Array.isArray(before.parents) ||
    !before.parents.includes(poleFolder.id)
  ){
    before = await findOrCreateFolder("BEFORE", poleFolder.id);
  }

  let after = saved?.afterId ? await getDriveFileIfExists(saved.afterId) : null;
  if(
    !after ||
    after.mimeType !== "application/vnd.google-apps.folder" ||
    !Array.isArray(after.parents) ||
    !after.parents.includes(poleFolder.id)
  ){
    after = await findOrCreateFolder("AFTER", poleFolder.id);
  }

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

async function moveDriveFileToExactFolder(fileId, folderId){
  const file = await getDriveFileIfExists(fileId);
  if(!file) return false;

  const parents = Array.isArray(file.parents) ? file.parents : [];
  if(parents.length === 1 && parents[0] === folderId) return true;

  const params = new URLSearchParams();
  params.set("addParents", folderId);
  if(parents.length) params.set("removeParents", parents.join(","));
  params.set("fields", "id,parents");

  await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`,
    {method:"PATCH"}
  );
  return true;
}


async function listDriveChildren(parentId){
  if(!parentId) return [];
  const q = `'${driveQueryEscape(parentId)}' in parents and trashed = false`;
  let pageToken = "";
  const out = [];

  do{
    const params = new URLSearchParams({
      q,
      spaces:"drive",
      fields:"nextPageToken,files(id,name,mimeType,parents,createdTime,modifiedTime)",
      pageSize:"1000"
    });
    if(pageToken) params.set("pageToken", pageToken);

    const data = await googleFetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`
    );
    out.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  }while(pageToken);

  return out;
}

function parseAppPhotoName(name){
  // Current/legacy app naming:
  // 241_110490953_BEFORE_1720000000000_IMG_1234.jpg
  const m = String(name || "").match(/^(\d+)_([^_]+)_(BEFORE|AFTER)_/i);
  if(!m) return null;
  return {
    projectPole:Number(m[1]),
    poleId:String(m[2] || "").trim(),
    type:String(m[3] || "").toUpperCase()
  };
}

function matchingProjectPole(projectPole, poleId){
  return poles.find(p => {
    if(Number(p.projectPole) !== Number(projectPole)) return false;
    if(!poleId || poleId === "NOID") return true;
    return String(p.poleId || "").trim() === String(poleId).trim();
  }) || null;
}

async function reconcileDriveOrphanPhotos(){
  // Older/cached builds could leave app-created photos in:
  // Google Drive root, project root, or the project's Photos folder.
  // Recover only files whose app-generated filename matches a pole in THIS project.
  const locations = [
    "root",
    cloudConfig.rootFolderId,
    cloudConfig.photosFolderId
  ].filter(Boolean);

  const seen = new Set();
  let repaired = 0;

  for(const parentId of locations){
    let children = [];
    try{
      children = await listDriveChildren(parentId);
    }catch(err){
      console.warn("Could not scan Drive folder for misplaced photos", parentId, err);
      continue;
    }

    for(const file of children){
      if(seen.has(file.id)) continue;
      seen.add(file.id);

      if(file.mimeType === "application/vnd.google-apps.folder") continue;

      const parsed = parseAppPhotoName(file.name);
      if(!parsed) continue;

      const pole = matchingProjectPole(parsed.projectPole, parsed.poleId);
      if(!pole) continue;

      const folders = await ensurePolePhotoFolders(pole.projectPole, pole.poleId);
      const targetId = parsed.type === "BEFORE" ? folders.beforeId : folders.afterId;
      if(!targetId) continue;

      const parents = Array.isArray(file.parents) ? file.parents : [];
      if(parents.length === 1 && parents[0] === targetId) continue;

      await moveDriveFileToExactFolder(file.id, targetId);
      repaired++;
    }
  }

  return repaired;
}


async function syncPhotosToCloud(){
  // Reconcile ALL local project photos, not only new uploads.
  // This repairs photos that an older version uploaded into the project root/Photos folder.
  const photos = (await allLocalPhotos()).filter(p => p.project === PROJECT);

  for(let i=0; i<photos.length; i++){
    const item = photos[i];
    setCloudStatus(`☁️ Sorting photos ${i+1}/${photos.length}…`, "syncing");

    const folders = await ensurePolePhotoFolders(item.projectPole, item.poleId);
    const folderId = String(item.type || "").toUpperCase() === "BEFORE"
      ? folders.beforeId
      : folders.afterId;

    if(!folderId) throw new Error(`Photo folder is missing for Pole ${item.projectPole}`);

    if(item.driveFileId){
      const existing = await getDriveFileIfExists(item.driveFileId);
      if(existing){
        await moveDriveFileToExactFolder(item.driveFileId, folderId);
        item.syncedAt = new Date().toISOString();
        await updatePhotoRecord(item);
        continue;
      }
      // Drive file was removed; upload the local copy again into the correct folder.
      item.driveFileId = "";
    }

    const uploaded = await uploadBlobToDrive(item, folderId);
    await moveDriveFileToExactFolder(uploaded.id, folderId);

    item.driveFileId = uploaded.id;
    item.syncedAt = new Date().toISOString();
    await updatePhotoRecord(item);
  }

  // Important: also repair files already on Drive that are no longer represented
  // in this device's IndexedDB (for example after changing phone/computer).
  await reconcileDriveOrphanPhotos();
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
    setCloudStatus(`☁️ Synced · photos sorted · ${signedInEmail || "Google"} · ${userRole}`, "connected");
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



let pendingHoaAction = null;

function currentHoaDifference(){
  if(!currentPole) return false;
  const draft = collectCurrentRecord();
  const projectHoa = extractProjectHoa(currentPole.description);
  return hasHoaChange(projectHoa, draft.actualHoa || "");
}

function openHoaDifferenceCheck(actionAfter){
  if(!currentPole) return false;

  const draft = collectCurrentRecord();
  const projectHoa = extractProjectHoa(currentPole.description);
  const actualHoa = draft.actualHoa || "";

  if(!hasHoaChange(projectHoa,actualHoa)){
    return false;
  }

  if(draft.hoaChangeConfirmed === "YES" && Number(draft.work?.raiseLower || 0) > 0){
    return false;
  }
  if(draft.hoaChangeConfirmed === "NO"){
    return false;
  }

  pendingHoaAction = actionAfter;
  el("hoaDifferenceText").textContent =
    `Make Ready HOA: ${projectHoa || "Not found"} | Actual HOA: ${actualHoa || "Not entered"}`;
  el("hoaLinesBlock").classList.add("hidden");
  el("hoaLinesMoved").value = draft.work?.raiseLower || "";
  el("hoaLinesMessage").textContent = "";
  el("hoaChangeDialog").showModal();
  return true;
}

function saveHoaDecision(changed, linesMoved=0){
  if(!currentPole) return;
  const rec = collectCurrentRecord();
  rec.hoaChangeConfirmed = changed ? "YES" : "NO";

  if(changed){
    rec.work.raiseLower = Number(linesMoved);
  }

  state[String(currentPole.projectPole)] = rec;
  saveState();

  const raiseInput = document.getElementById("work_raiseLower");
  if(raiseInput) raiseInput.value = rec.work.raiseLower ?? "";
}

async function continueAfterHoaDecision(){
  const action = pendingHoaAction;
  pendingHoaAction = null;
  el("hoaChangeDialog").close();

  if(action === "save"){
    await saveAndMaybeSync();
    setTimeout(()=>el("poleDialog").close(),300);
  }else if(action === "map"){
    if(await saveAndMaybeSync()){
      el("poleDialog").close();
      window.location.assign(projectUrl("myMapsUrl"));
    }
  }else if(action === "complete"){
    setQuickStatus("Completed");
    openCompletionValidation(null);
  }
}

let pendingCompletionAction = null;

function selectedRamResult(){
  const checked = document.querySelector('input[name="ramResult"]:checked');
  return checked ? checked.value : "";
}

function resetValidationDialog(){
  el("dgNotRequiredCheck").checked = false;
  document.querySelectorAll('input[name="ramResult"]').forEach(r => r.checked = false);
  el("validationNote").value = "";
  el("validationMessage").textContent = "";
}

function openCompletionValidation(actionAfter){
  if(!currentPole) return false;

  const draft = collectCurrentRecord();
  const req = completionRequirements(draft,currentPole);

  // Existing confirmations should remain selected when reopening.
  resetValidationDialog();
  if(draft.dgException === "NOT REQUIRED"){
    el("dgNotRequiredCheck").checked = true;
  }
  document.querySelectorAll('input[name="ramResult"]').forEach(r => {
    r.checked = r.value === draft.ramsHeadResult;
  });
  el("validationNote").value = draft.validationNote || "";

  const showHoa = req.hoaIsChanged;
  const showDg = req.dgNeedsConfirmation || draft.dgException === "NOT REQUIRED";
  const showRam = req.ramRequired;

  el("hoaValidationBlock").classList.toggle("hidden", !showHoa);
  el("dgValidationBlock").classList.toggle("hidden", !showDg);
  el("ramValidationBlock").classList.toggle("hidden", !showRam);

  el("hoaValidationText").textContent =
    `PROJECT HOA: ${req.projectHoa || "Not found"} | ACTUAL HOA: ${req.actualHoa || "Not entered"}`;

  const requiresDialog =
    req.hoaMissingDescription ||
    req.dgNeedsConfirmation ||
    req.ramNeedsConfirmation;

  if(!requiresDialog){
    return false;
  }

  pendingCompletionAction = actionAfter;
  el("completionValidationDialog").showModal();
  return true;
}

function validateCompletionDialog(){
  if(!currentPole) return {ok:false,message:"No Pole selected."};

  const draft = collectCurrentRecord();
  const req = completionRequirements(draft,currentPole);

  if(req.dgNeedsConfirmation && !el("dgNotRequiredCheck").checked){
    return {ok:false,message:"Confirm that DOWNGUY is NOT REQUIRED."};
  }

  if(req.ramRequired && !selectedRamResult()){
    return {ok:false,message:"Select INSTALLED or NOT REQUIRED for RAM'S HEAD."};
  }

  return {ok:true};
}

function applyValidationConfirmations(){
  if(!currentPole) return;
  const existing = state[String(currentPole.projectPole)] || {};
  const draft = collectCurrentRecord();
  const req = completionRequirements(draft,currentPole);

  draft.dgException =
    req.dgRequired && !(Number(draft.work?.installDownGuy || 0) > 0) && el("dgNotRequiredCheck").checked
      ? "NOT REQUIRED"
      : "";

  draft.ramsHeadResult =
    req.ramRequired ? selectedRamResult() : "";

  draft.validationNote = el("validationNote").value.trim();

  state[String(currentPole.projectPole)] = {
    ...existing,
    ...draft,
    status:"Completed",
    updatedAt:new Date().toISOString()
  };
  saveState();

  // Keep card synchronized with stored Completed state.
  el("statusSelect").value = "Completed";
  syncQuickButtons();
  updateCardStatusBadge();
}

async function completeAfterValidation(){
  const result = validateCompletionDialog();
  if(!result.ok){
    el("validationMessage").textContent = result.message;
    return false;
  }

  applyValidationConfirmations();
  el("completionValidationDialog").close();
  renderList();

  if(googleToken){
    try{
      await syncAllToCloud();
    }catch(err){
      setCloudStatus("📱 Saved locally · sync failed: " + err.message,"error");
    }
  }

  if(pendingCompletionAction === "close"){
    el("poleDialog").close();
  }else if(pendingCompletionAction === "map"){
    el("poleDialog").close();
    window.location.assign(projectUrl("myMapsUrl"));
  }

  pendingCompletionAction = null;
  return true;
}

// ---------------- Events ----------------

function bindProjectEvents(){
  el("projectSelect").addEventListener("change", async e => {
    try{ await switchProject(e.target.value); }
    catch(err){ showError(err.message || String(err)); }
  });

  el("newProjectBtn").addEventListener("click", () => {
    if(!requireAdmin()) return;
    if(!googleToken){
      setCloudStatus("☁️ Connect Google before creating a project.","error");
      requestGoogleAccess();
      return;
    }
    el("newProjectMessage").textContent = "";
    el("newProjectDialog").showModal();
  });
  el("closeNewProjectBtn").addEventListener("click", () => el("newProjectDialog").close());

  el("createProjectBtn").addEventListener("click", async () => {
    if(!requireAdmin()) return;
    const id = el("newProjectId").value.trim();
    if(!id){
      el("newProjectMessage").textContent = "Project ID is required.";
      return;
    }
    if(projects[id]){
      el("newProjectMessage").textContent = "Project already exists.";
      return;
    }

    const file = el("newProjectCsv").files?.[0];
    if(!file){
      el("newProjectMessage").textContent = "Pole CSV is required.";
      return;
    }

    const poleData = parseCsvText(await file.text());
    if(!poleData.length){
      el("newProjectMessage").textContent = "No poles found in CSV.";
      return;
    }

    if(!googleToken){
      el("newProjectMessage").textContent = "Connect Google first. New projects are saved to the cloud.";
      return;
    }

    const newProject = {
      id,
      name:el("newProjectName").value.trim() || id,
      myMapsUrl:el("newMyMapsUrl").value.trim(),
      makeReadyUrl:el("newMakeReadyUrl").value.trim(),
      utilityMapUrl:el("newUtilityMapUrl").value.trim(),
      poles:poleData
    };

    el("newProjectMessage").textContent = "Saving project to Google…";
    try{
      await saveProjectToRegistry(newProject);
      el("newProjectDialog").close();
      await switchProject(id);
      await ensureCloudProject();
      await syncAllToCloud();
    }catch(err){
      el("newProjectMessage").textContent = "Could not save project: " + (err.message || String(err));
    }
  });

  el("projectSettingsBtn").addEventListener("click", () => {
    if(!requireAdmin()) return;
    if(!activeProject) return;
    el("settingsProjectName").value = activeProject.name || activeProject.id;
    el("settingsMyMapsUrl").value = activeProject.myMapsUrl || "";
    el("settingsMakeReadyUrl").value = activeProject.makeReadyUrl || "";
    el("settingsUtilityMapUrl").value = activeProject.utilityMapUrl || "";
    el("projectSettingsDialog").showModal();
  });
  el("closeProjectSettingsBtn").addEventListener("click", () => el("projectSettingsDialog").close());
  el("saveProjectSettingsBtn").addEventListener("click", async () => {
    if(!requireAdmin()) return;
    if(!activeProject) return;
    if(!googleToken){
      alert("Connect Google first. Project settings are stored in the cloud.");
      return;
    }

    activeProject.name = el("settingsProjectName").value.trim() || activeProject.id;
    activeProject.myMapsUrl = el("settingsMyMapsUrl").value.trim();
    activeProject.makeReadyUrl = el("settingsMakeReadyUrl").value.trim();
    activeProject.utilityMapUrl = el("settingsUtilityMapUrl").value.trim();
    projects[activeProject.id] = activeProject;

    try{
      await saveProjectToRegistry(activeProject);
      el("projectSettingsDialog").close();
    }catch(err){
      alert("Could not save project settings: " + (err.message || String(err)));
    }
  });
}


function enableBackdropClose(){
  document.querySelectorAll("dialog").forEach(dialog => {
    dialog.addEventListener("click", event => {
      // Native <dialog> backdrop is outside the dialog's visible rectangle.
      const rect = dialog.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if(!inside){
        dialog.close();
      }
    });
  });
}

function bindEvents(){
  el("myMapsBtn").addEventListener("click", () => window.open(projectUrl("myMapsUrl"),"_blank"));
  el("makeReadyBtn").addEventListener("click", () => window.open(projectUrl("makeReadyUrl"),"_blank"));
  el("utilityMapBtn").addEventListener("click", () => window.open(projectUrl("utilityMapUrl"),"_blank"));

  el("adminBtn").addEventListener("click", () => el("adminDialog").showModal());
  el("googleConnectBtn").addEventListener("click", requestGoogleAccess);
  el("syncNowBtn").addEventListener("click", async () => {
    if(!googleToken) return requestGoogleAccess();
    try{
      await syncProjectsFromCloud({switchIfNeeded:true});
      await ensureCloudProject();
      await pullCloudState();
      await syncAllToCloud();
    }catch(err){
      setCloudStatus("⚠️ " + err.message,"error");
    }
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
  
  el("closeHoaChangeBtn").addEventListener("click", () => {
    pendingHoaAction = null;
    el("hoaChangeDialog").close();
  });

  el("hoaNotChangedBtn").addEventListener("click", async () => {
    saveHoaDecision(false,0);
    await continueAfterHoaDecision();
  });

  el("hoaChangedBtn").addEventListener("click", () => {
    el("hoaLinesBlock").classList.remove("hidden");
  });

  el("confirmHoaLinesBtn").addEventListener("click", async () => {
    const count = Number(el("hoaLinesMoved").value);
    if(!Number.isFinite(count) || count < 1){
      el("hoaLinesMessage").textContent = "Enter the number of lines moved.";
      return;
    }
    saveHoaDecision(true,count);
    await continueAfterHoaDecision();
  });

el("closeValidationBtn").addEventListener("click", () => {
    pendingCompletionAction = null;
    el("completionValidationDialog").close();
  });
  el("cancelValidationBtn").addEventListener("click", () => {
    pendingCompletionAction = null;
    el("completionValidationDialog").close();
  });
  el("confirmValidationBtn").addEventListener("click", completeAfterValidation);

  el("searchInput").addEventListener("input", renderList);
  el("statusFilter").addEventListener("change", renderList);

  el("cardMyMapsBtn").addEventListener("click", () => window.open(projectUrl("myMapsUrl"),"_blank"));
  el("googleNavBtn").addEventListener("click", () => {
    if(!currentPole) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${currentPole.lat},${currentPole.lon}`;
    window.location.assign(url);
  });
  el("completedBtn").addEventListener("click", () => {
    if(openHoaDifferenceCheck("complete")) return;
    setQuickStatus("Completed");
    openCompletionValidation(null);
  });
  el("problemBtn").addEventListener("click", () => setQuickStatus("Problem"));
  el("trafficControlBtn").addEventListener("click", () => setQuickStatus("Traffic Control"));
  el("doNotAttachBtn").addEventListener("click", () => setQuickStatus("Do not attach"));
  el("blownPoleBtn").addEventListener("click", () => setQuickStatus("Blown pole"));
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
        showError("Could not save BEFORE photo: " + err.message);
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
        showError("Could not save AFTER photo: " + err.message);
      }
    });
  });

  el("saveBtn").addEventListener("click", async () => {
    if(openHoaDifferenceCheck("save")) return;

    if(el("statusSelect").value === "Completed"){
      const blocked = openCompletionValidation("close");
      if(blocked) return;
    }

    await saveAndMaybeSync();
    setTimeout(() => el("poleDialog").close(), 300);
  });

  el("saveNextBtn").addEventListener("click", async () => {
    if(openHoaDifferenceCheck("map")) return;

    if(el("statusSelect").value === "Completed"){
      const blocked = openCompletionValidation("map");
      if(blocked) return;
    }

    if(await saveAndMaybeSync()){
      el("poleDialog").close();
      window.location.assign(projectUrl("myMapsUrl"));
    }
  });

  el("exportCsvBtn").addEventListener("click", exportCsv);
  el("backupBtn").addEventListener("click", backupJson);

  el("restoreInput").addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if(!file) return;
    try{
      await restoreJson(file);
      alert("Data restored.");
      e.target.value = "";
    }catch(err){
      alert(err.message || "Could not restore backup.");
    }
  });
}


async function init(){
  buildWorkGrid();
  loadProjects();
  bindProjectEvents();
  bindEvents();
  enableBackdropClose();
  applyRoleUi();

  try{
    const activeId = getActiveProjectId();
    await switchProject(activeId);

    const requestedPole = Number(new URLSearchParams(location.search).get("pole"));
    if(requestedPole){
      const exists = poles.some(p => Number(p.projectPole) === requestedPole);
      if(exists) await openPole(requestedPole);
    }
  }catch(err){
    showError(err.message || String(err));
    el("poleList").innerHTML = `<div class="loading">Could not load project.</div>`;
  }
}

document.addEventListener("DOMContentLoaded", init);

})();
