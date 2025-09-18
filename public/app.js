/* Parts Assistant — v3: always create job on import, map later if needed */

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const els = {
  csvFile: $('#csvFile'),
  noHeader: $('#noHeader'),
  jobsList: $('#jobsList'),
  jobSelect: $('#jobSelect'), // legacy (removed)
  jobSearch: $('#jobSearch'),
  jobMatches: $('#jobMatches'),
  deleteJobBtn: $('#deleteJobBtn'),
  jobStats: $('#jobStats'),
  partSearch: $('#partSearch'),
  clearSearch: $('#clearSearch'),
  unassignedOnly: $('#unassignedOnly'),
  results: $('#results'),
  exportReport: $('#exportReport'),
  backupBtn: $('#backupBtn'),
  restoreBtn: $('#restoreBtn'),
  mapperDialog: $('#mapperDialog'),
  mapperFields: $('#mapperFields'),
  mapperConfirm: $('#mapperConfirm'),
};

// Storage
const STORAGE_KEY = 'parts-assistant/jobs.v1';

// State
let state = {
  jobs: {}, // { [jobId]: Job }
  selectedJobId: null,
  searchPart: '',
  unassignedOnly: true,
  locationFilter: null,
  jobQuery: '',
  theme: 'warm',
  scanMode: false,
};

// Job schema:
// job = {
//   id, filename,
//   pendingRaw: { headers: [], rows: [] } | null,
//   parts: {
//     [partNumber]: {
//       description: '',
//       locations: { [location]: qtyNumber },
//       assigned:  { [location]: assignedQtyNumber }
//     }
//   }
// }

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    jobs: state.jobs,
    selectedJobId: state.selectedJobId,
    locationFilter: state.locationFilter,
    searchPart: state.searchPart,
    unassignedOnly: state.unassignedOnly,
    jobQuery: state.jobQuery,
    theme: state.theme,
    scanMode: state.scanMode,
  }));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    state.jobs = data.jobs || {};
    state.selectedJobId = data.selectedJobId || Object.keys(state.jobs)[0] || null;
    state.locationFilter = (data.locationFilter===undefined)? null : data.locationFilter;
    state.searchPart = (data.searchPart===undefined)? '' : data.searchPart;
    state.unassignedOnly = (data.unassignedOnly===undefined)? true : !!data.unassignedOnly;
    state.jobQuery = (data.jobQuery===undefined)? '' : data.jobQuery;
    state.theme = (data.theme===undefined)? 'warm' : data.theme;
    state.scanMode = !!data.scanMode;
  } catch(e) { console.warn('Failed to load storage', e); }
}

function formatIdFromFilename(name) {
  const base = name.replace(/\.[^/.]+$/, '');
  return base.trim().replace(/\s+/g, '_');
}

function ensureJob(jobId, filename) {
  if (!state.jobs[jobId]) {
    state.jobs[jobId] = { id: jobId, filename: filename || jobId, pendingRaw: null, parts: {} };
  }
  return state.jobs[jobId];
}

function upsertPart(job, partNumber, location, qty, description='') {
  const pn = String(partNumber || '').trim();
  const loc = String(location || '').trim() || 'UNSPECIFIED';
  const q = Number(qty) || 0;
  if (!pn || q <= 0) return;

  const parts = job.parts;
  if (!parts[pn]) parts[pn] = { description: '', locations: {}, assigned: {} };
  const part = parts[pn];
  if (description && !part.description) part.description = String(description).trim();
  part.locations[loc] = (part.locations[loc] || 0) + q;
  if (part.assigned[loc] == null) part.assigned[loc] = 0;
}

function computeJobStats(job) {
  let required = 0, assigned = 0, lines = 0;
  for (const pn of Object.keys(job.parts)) {
    const p = job.parts[pn];
    for (const loc of Object.keys(p.locations)) {
      const req = p.locations[loc];
      const asg = p.assigned[loc] || 0;
      required += req;
      assigned += Math.min(asg, req);
      lines++;
    }
  }
  const pct = required ? Math.round(100 * assigned / required) : 0;
  return { required, assigned, lines, pct };
}


function filterJobs(ids, query){
  const q = (query||'').trim().toLowerCase();
  if (!q) return ids.map(id => ({id, matchIdx: -1}));
  const scored = [];
  for (const id of ids){
    const idx = id.toLowerCase().indexOf(q);
    
    scored.push({id, matchIdx: idx});
  }
  scored.sort((a,b)=> a.matchIdx - b.matchIdx);
  return scored;
}

function highlightMatch(id, query){
  const q = (query||'').trim();
  if (!q) return id;
  const i = id.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return id;
  return id.slice(0,i) + '<mark>' + id.slice(i, i+q.length) + '</mark>' + id.slice(i+q.length);
}

function renderJobsList() {
  if (!els.jobsList) return;
  els.jobsList.innerHTML = '';
  const ids = Object.keys(state.jobs);
  const filtered = filterJobs(ids, state.jobQuery);
  if (!ids.length) {
    els.jobsList.innerHTML = '<li><small>No jobs yet. Import CSVs to create jobs.</small></li>';
  } else if (!filtered.length) {
    els.jobsList.innerHTML = '<li><small>No matches.</small></li>';
  } else {
    filtered.forEach(({id}) => {
      const job = state.jobs[id];
      const stats = computeJobStats(job);
      const li = document.createElement('li');
      li.className = (state.selectedJobId===id) ? 'active' : '';
      li.innerHTML = `
        <div>
          <strong>${highlightMatch(id, state.jobQuery)}</strong><br/>
          <small>${job.filename}</small>
        </div>
        <div class="tag">${stats.pct}%</div>
      `;
      li.addEventListener('click', ()=>{ state.selectedJobId=id; save(); syncUI(); });
      els.jobsList.appendChild(li);
    });
  }
  if (els.deleteJobBtn) els.deleteJobBtn.disabled = !state.selectedJobId;
}




function renderJobStats() {
  if (!els.jobStats) return;
  if (!state.selectedJobId || !state.jobs[state.selectedJobId]) {
    els.jobStats.textContent = 'No job selected.';
    return;
  }
  const job = state.jobs[state.selectedJobId];
  const s = computeJobStats(job);
  const pending = job.pendingRaw ? '<div class="tag" style="border-color:#f59e0b">Mapping pending</div>' : '';
  els.jobStats.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <div><strong>Lines:</strong> ${s.lines}</div>
      <div><strong>Required:</strong> ${s.required}</div>
      <div><strong>Assigned:</strong> ${s.assigned}</div>
      <div class="progress"><div style="width:${s.pct}%"></div></div>
      <div><strong>${s.pct}%</strong> complete</div>
      ${pending}
    </div>
  `;
}


function collectLocations(job){
  const set = new Set();
  for (const p of Object.values(job.parts)){
    for (const loc of Object.keys(p.locations)) set.add(loc);
  }
  return Array.from(set).sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}));
}

function renderLocationFilters(){
  const box = document.getElementById('locationFilters');
  if (!box) return;
  box.innerHTML = '';
  if (!state.selectedJobId || !state.jobs[state.selectedJobId]) return;
  const job = state.jobs[state.selectedJobId];
  const locs = collectLocations(job);
  if (!locs.length && !job.pendingRaw){
    box.innerHTML = '<div class="empty">No locations yet.</div>';
    return;
  }
  const mk = (text, key, extra='')=>{
    const span = document.createElement('span');
    span.className = 'pill ' + (extra||'');
    span.textContent = text;
    if ((key==null && !state.locationFilter) || (key===state.locationFilter)) span.classList.add('active');
    span.addEventListener('click', ()=>{
      if (key == null){ state.locationFilter = null; }
      else { state.locationFilter = (state.locationFilter===key) ? null : key; }
      save(); syncUI();
    });
    return span;
  };
  box.appendChild(mk('All locations', null, 'all'));
  locs.forEach(loc=> box.appendChild(mk(loc, loc)));
}

function matchHeaders(headers) {
  const lower = headers.map(h => String(h||'').toLowerCase().trim());
  const find = (...cands) => {
    for (const c of cands) {
      const idx = lower.findIndex(h => h === c || h.includes(c));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  const locPrimary = find('location','loc','panel','cabinet');
  let locSecondary = -1;
  if (locPrimary !== -1) {
    for (const cand of ['cabinet','panel','room','area','section','bay']) {
      const idx = lower.findIndex((h,i)=> (h===cand || h.includes(cand)) && i!==locPrimary);
      if (idx !== -1) { locSecondary = idx; break; }
    }
  }
  return {
    part: find('part number','part','catalog','cat','mfg catalog','manufacturer catalog','catalog number','cat no','cat#','component_tag','component tag','item'),
    location: locPrimary,
    location2: locSecondary,
    quantity: find('qty','quantity','count','total','sum'),
    description: find('description','desc','details','component description','component_description','name','title'),
  };
}

function openMapperDialog(sampleHeaders) {
  if (!els.mapperDialog) return Promise.resolve(null);
  els.mapperFields.innerHTML = '';

  const headers = sampleHeaders || [];
  const hasHeader = !els.noHeader?.checked;
  const options = hasHeader ? headers : headers.map((_,i)=>String(i));

  const guessed = hasHeader ? matchHeaders(headers) : { part: 0, location: 1, location2: -1, quantity: -1, description: -1 };

  const fields = [
    {key:'jobId', label:'Job ID (from filename)', type:'text', value:''},
    {key:'part', label:'Part Number column', type:'select', value:guessed.part},
    {key:'location', label:'Location column', type:'select', value:guessed.location},
    {key:'location2', label:'Additional location column (optional)', type:'select', value:(guessed.location2 ?? -1)},
    {key:'quantity', label:'Quantity column (optional; defaults to 1)', type:'select', value:(guessed.quantity ?? -1)},
    {key:'description', label:'Description column (optional)', type:'select', value:guessed.description},
  ];

  fields.forEach(f=>{
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('label');
    label.textContent = f.label;
    let input;
    if (f.type === 'select') {
      input = document.createElement('select');
      const noneOpt = document.createElement('option');
      noneOpt.value = -1; noneOpt.textContent = '-- none --';
      input.appendChild(noneOpt);
      options.forEach((opt,i)=>{
        const o = document.createElement('option');
        o.value = i; o.textContent = hasHeader ? opt : ('Column ' + i);
        input.appendChild(o);
      });
      if (f.value != null && f.value >= 0) input.value = f.value;
    } else {
      input = document.createElement('input');
      input.type = 'text'; input.placeholder = '(auto from filename)';
    }
    input.dataset.key = f.key;
    wrap.appendChild(label); wrap.appendChild(input);
    els.mapperFields.appendChild(wrap);
  });

  return new Promise(resolve => {
    els.mapperDialog.showModal();
    els.mapperConfirm.onclick = (e)=>{
      e.preventDefault();
      const res = {};
      $$('.mapper-fields [data-key]').forEach(el => {
        const key = el.dataset.key;
        res[key] = (el.tagName === 'SELECT') ? parseInt(el.value,10) : el.value.trim();
      });
      els.mapperDialog.close();
      resolve(res);
    };
    els.mapperDialog.addEventListener('close', ()=>{
      if (!els.mapperDialog.returnValue) resolve(null);
    }, {once:true});
  });
}

function openMapperForJob(jobId) {
  const job = state.jobs[jobId];
  if (!job || !job.pendingRaw) { alert('No pending CSV mapping data for this job. Import a CSV first.'); return; }
  const { headers, rows } = job.pendingRaw;
  openMapperDialog(headers).then(mapping => {
    if (!mapping) return; // keep pendingRaw
    const combineLoc = (a,b) => {
      const s1 = String(a||'').trim(), s2 = String(b||'').trim();
      if (s1 && s2) return s1 + ' / ' + s2;
      return s1 || s2 || 'UNSPECIFIED';
    };
    // Allow user to rename jobId during mapping
    if (mapping.jobId && mapping.jobId.trim()) {
      const newId = mapping.jobId.trim();
      if (newId !== job.id && !state.jobs[newId]) {
        state.jobs[newId] = { ...job, id: newId };
        delete state.jobs[job.id];
        state.selectedJobId = newId;
      }
    }
    const currentJob = state.jobs[state.selectedJobId] || job;

    rows.forEach(r => {
      const get = (idx) => (idx>=0 ? r[idx] : '');
      const part = get(mapping.part) || get(matchHeaders(headers).part);
      const loc = combineLoc(get(mapping.location), get(mapping.location2));
      const qtyRaw = get(mapping.quantity);
      const qty = (mapping.quantity != null && mapping.quantity >= 0 && String(qtyRaw).trim()!=='') ? qtyRaw : 1;
      const desc = get(mapping.description);
      upsertPart(currentJob, part, loc, qty, desc);
    });
    currentJob.pendingRaw = null;
    state.selectedJobId = currentJob.id;
    save(); syncUI();
  });
}

function parseCsvText(text, filename) {
  return new Promise((resolve,reject)=>{
    Papa.parse(text, {
      skipEmptyLines: true,
      complete: (results) => resolve(results),
      error: (err) => reject(err),
    });
  }).then(async (res)=>{
    const rows = res.data;
    if (!rows.length) throw new Error('CSV has no rows');
    let headers = rows[0];
    const noHeader = els.noHeader?.checked;
    const dataRows = noHeader ? rows : rows.slice(1);

    const defaultJobId = formatIdFromFilename(filename);
    const job = ensureJob(defaultJobId, filename);
    job.pendingRaw = { headers: (noHeader ? rows[0].map((_,i)=>'Column '+i) : headers), rows: dataRows };
    state.selectedJobId = job.id;
    save(); syncUI();
    openMapperForJob(job.id);
  }).catch(err => {
    alert('Failed to parse CSV: ' + err.message);
  });
}

function renderResults() {
  const container = els.results;
  if (!container) return;
  container.innerHTML = '';

  if (!state.selectedJobId) {
    container.innerHTML = '<div class="empty">Upload a CSV to begin.</div>';
    return;
  }
  const job = state.jobs[state.selectedJobId];
  const partQuery = (state.searchPart||'').trim().toLowerCase();

  if (job.pendingRaw && !Object.keys(job.parts).length) {
    container.innerHTML = '<div class="empty">Job created. Click <strong>Map Columns</strong> to complete import.</div>';
    return;
  }

  const entries = Object.entries(job.parts);

  // Apply location filter first
  const loc = state.locationFilter;
  let list = loc ? entries.filter(([pn, p]) => p.locations.hasOwnProperty(loc)) : entries;

  // Dynamic search: substring on part number OR description
  if (partQuery) {
    list = list.filter(([pn, p]) => pn.toLowerCase().includes(partQuery) || (p.description||'').toLowerCase().includes(partQuery));
  }

  // Unassigned-only filter (ignored when a specific location is selected per user's request)
  const applyUnassigned = !loc && state.unassignedOnly;
  if (applyUnassigned) {
    list = list.filter(([pn, p]) => {
      const unassignedTotal = Object.keys(p.locations).reduce((sum,loc)=>{
        const req = p.locations[loc];
        const asg = p.assigned[loc]||0;
        return sum + Math.max(0, req - asg);
      },0);
      return unassignedTotal > 0;
    });
  }

  if (!list.length) {
    const msg = loc ? `No parts found for location <strong>${loc}</strong> with current search.` : 'No parts match your filters.';
    container.innerHTML = '<div class="empty">' + msg + '</div>';
    return;
  }

  // Render cards. If a location is selected, only show that row inside each card.
  list.forEach(([pn, p]) => container.appendChild(renderPartCard(pn, p, false, loc)));
}


function renderPartCard(partNumber, part, expanded, onlyLoc) {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'part-' + partNumber;

  // Compute stats (respect onlyLoc when computing assigned)
  const required = Object.entries(part.locations).reduce((acc,[loc,qty])=> acc + (onlyLoc && loc!==onlyLoc ? 0 : qty), 0);
  const assigned = Object.entries(part.assigned).reduce((acc,[loc,val])=>{
    const req = part.locations[loc]||0;
    const use = onlyLoc && loc!==onlyLoc ? 0 : Math.min(req, val||0);
    return acc + use;
  },0);
  const pct = required ? Math.round(100*assigned/required) : 0;

  card.innerHTML = `
    <h3>${partNumber}</h3>
    <div class="meta">
      <span class="badge">${part.description || '— no description —'}</span>
      <span class="badge">Required: ${required}</span>
      <span class="badge">Assigned: ${assigned}</span>
      <span class="badge">Remaining: ${Math.max(0, required - assigned)}</span>
    </div>
    <div class="progress"><div style="width:${pct}%"></div></div>
  `;

  const table = document.createElement('table');
  table.className = 'table';
  table.innerHTML = '<thead><tr><th>Location</th><th>Required</th><th>Assigned</th><th>Remaining</th><th>Update</th></tr></thead>';
  const tbody = document.createElement('tbody');

  Object.keys(part.locations).sort().forEach(loc => {
    if (onlyLoc && loc !== onlyLoc) return;
    const req = part.locations[loc];
    const asg = Math.min(part.assigned[loc]||0, req);
    const rem = Math.max(0, req - asg);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${loc}</strong></td>
      <td>${req}</td>
      <td>${asg}</td>
      <td>${rem}</td>
      <td class="qty">
        <div class="counter">
          <button data-delta="-1" class="ghost small">-1</button>
          <button data-delta="+1" class="ghost small">+1</button>
        </div>
        <input type="number" min="0" step="1" value="${asg}" class="assign-input"/>
        <button class="primary small apply">Apply</button>
      </td>
    `;
    const [minus, plus] = tr.querySelectorAll('button.ghost');
    minus.addEventListener('click', ()=> adjustAssignment(state.selectedJobId, partNumber, loc, -1));
    plus.addEventListener('click', ()=> adjustAssignment(state.selectedJobId, partNumber, loc, +1));
    const applyBtn = tr.querySelector('button.apply');
    const input = tr.querySelector('input.assign-input');
    applyBtn.addEventListener('click', ()=> setAssignment(state.selectedJobId, partNumber, loc, parseInt(input.value,10)||0));
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  card.appendChild(table);

  const footer = document.createElement('div');
  footer.style.marginTop = '8px';
  const fillAll = document.createElement('button');
  fillAll.className = 'ghost small';
  fillAll.textContent = onlyLoc ? `Mark Fully Assigned (${onlyLoc})` : 'Mark Fully Assigned';
  fillAll.addEventListener('click', ()=> {
    if (onlyLoc) {
      // set only this location to full
      if (!part.locations[onlyLoc]) return;
      part.assigned[onlyLoc] = part.locations[onlyLoc];
      save(); syncUI();
    } else {
      markFullyAssigned(state.selectedJobId, partNumber);
    }
  });
  footer.appendChild(fillAll);

  card.appendChild(footer);
  return card;
}


function adjustAssignment(jobId, partNumber, loc, delta) {
  const job = state.jobs[jobId]; if (!job) return;
  const part = job.parts[partNumber]; if (!part) return;
  const req = part.locations[loc] || 0;
  const cur = part.assigned[loc] || 0;
  const next = Math.max(0, Math.min(req, cur + delta));
  part.assigned[loc] = next;
  save(); syncUI();
}

function setAssignment(jobId, partNumber, loc, value) {
  const job = state.jobs[jobId]; if (!job) return;
  const part = job.parts[partNumber]; if (!part) return;
  const req = part.locations[loc] || 0;
  const next = Math.max(0, Math.min(req, value));
  part.assigned[loc] = next;
  save(); syncUI();
}

function markFullyAssigned(jobId, partNumber) {
  const job = state.jobs[jobId]; if (!job) return;
  const part = job.parts[partNumber]; if (!part) return;
  for (const loc of Object.keys(part.locations)) {
    part.assigned[loc] = part.locations[loc];
  }
  save(); syncUI();
}

function exportReportCsv() {
  const job = state.jobs[state.selectedJobId];
  if (!job) return;
  const rows = [['Job','Part Number','Location','Required Qty','Assigned Qty','Remaining Qty','Description']];
  for (const [pn, p] of Object.entries(job.parts)) {
    for (const loc of Object.keys(p.locations)) {
      const req = p.locations[loc];
      const asg = Math.min(req, p.assigned[loc]||0);
      const rem = Math.max(0, req - asg);
      rows.push([job.id, pn, loc, req, asg, rem, p.description||'']);
    }
  }
  const csv = rows.map(r => r.map(v => String(v).includes(',') ? `"${String(v).replace(/"/g,'""')}"` : String(v)).join(',')).join('\n');
  downloadText(csv, `${job.id}_assignment_report.csv`, 'text/csv');
}

function backupAll() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    state: { jobs: state.jobs, selectedJobId: state.selectedJobId }
  };
  downloadText(JSON.stringify(data,null,2), `parts-assistant-backup-${Date.now()}.json`, 'application/json');
}

function restoreAll() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!data || !data.state || !data.state.jobs) throw new Error('Invalid backup format');
      state.jobs = data.state.jobs;
      state.selectedJobId = data.state.selectedJobId || Object.keys(state.jobs)[0] || null;
      save(); syncUI();
      alert('Backup restored.');
    } catch (e) {
      alert('Failed to restore backup: ' + e.message);
    }
  };
  input.click();
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}

function syncUI() {
  renderJobsList();
  renderJobStats();
  renderLocationFilters();
  renderResults();

  if (els.deleteJobBtn) els.deleteJobBtn.disabled = !state.selectedJobId;
}

function initEvents() {
  if (els.csvFile) {
    els.csvFile.addEventListener('change', async (e)=>{
      const files = Array.from(e.target.files||[]);
      for (const f of files) {
        const text = await f.text();
        await parseCsvText(text, f.name);
      
  if (els.jobSearch) {
    els.jobSearch.value = state.jobQuery || '';
    els.jobSearch.addEventListener('input', ()=>{
      state.jobQuery = els.jobSearch.value;
      syncUI();
    });
    els.jobSearch.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') {
        const ids = Object.keys(state.jobs);
        const filtered = filterJobs(ids, state.jobQuery);
        if (filtered.length) {
          state.selectedJobId = filtered[0].id;
          save(); syncUI();
          // Focus part search for quick scanning
          if (els.partSearch) els.partSearch.focus();
        }
      }
    });
  }
  // Mobile job matches list (only exists on mobile)
  if (els.jobMatches) {
    // Rendered in renderJobsList via the same function? We'll render here.
    const ids = Object.keys(state.jobs);
    const filtered = filterJobs(ids, state.jobQuery);
    els.jobMatches.innerHTML = '';
    filtered.slice(0,20).forEach(({id})=>{
      const li = document.createElement('li');
      li.className = (state.selectedJobId===id) ? 'active' : '';
      li.innerHTML = `<strong>${highlightMatch(id, state.jobQuery)}</strong>`;
      li.addEventListener('click', ()=>{ state.selectedJobId=id; save(); syncUI(); });
      els.jobMatches.appendChild(li);
    });
  }

}
      els.csvFile.value = '';
    });
  
  if (els.jobSearch) {
    els.jobSearch.value = state.jobQuery || '';
    els.jobSearch.addEventListener('input', ()=>{
      state.jobQuery = els.jobSearch.value;
      syncUI();
    });
    els.jobSearch.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') {
        const ids = Object.keys(state.jobs);
        const filtered = filterJobs(ids, state.jobQuery);
        if (filtered.length) {
          state.selectedJobId = filtered[0].id;
          save(); syncUI();
          // Focus part search for quick scanning
          if (els.partSearch) els.partSearch.focus();
        }
      }
    });
  }
  // Mobile job matches list (only exists on mobile)
  if (els.jobMatches) {
    // Rendered in renderJobsList via the same function? We'll render here.
    const ids = Object.keys(state.jobs);
    const filtered = filterJobs(ids, state.jobQuery);
    els.jobMatches.innerHTML = '';
    filtered.slice(0,20).forEach(({id})=>{
      const li = document.createElement('li');
      li.className = (state.selectedJobId===id) ? 'active' : '';
      li.innerHTML = `<strong>${highlightMatch(id, state.jobQuery)}</strong>`;
      li.addEventListener('click', ()=>{ state.selectedJobId=id; save(); syncUI(); });
      els.jobMatches.appendChild(li);
    });
  }

}
  if (els.deleteJobBtn) {
    els.deleteJobBtn.addEventListener('click', ()=>{
      if (!state.selectedJobId) return;
      const id = state.selectedJobId;
      if (confirm(`Delete job "${id}"? This cannot be undone.`)) {
        delete state.jobs[id];
        state.selectedJobId = Object.keys(state.jobs)[0] || null;
        save(); syncUI();
      
  if (els.jobSearch) {
    els.jobSearch.value = state.jobQuery || '';
    els.jobSearch.addEventListener('input', ()=>{
      state.jobQuery = els.jobSearch.value;
      syncUI();
    });
    els.jobSearch.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') {
        const ids = Object.keys(state.jobs);
        const filtered = filterJobs(ids, state.jobQuery);
        if (filtered.length) {
          state.selectedJobId = filtered[0].id;
          save(); syncUI();
          // Focus part search for quick scanning
          if (els.partSearch) els.partSearch.focus();
        }
      }
    });
  }
  // Mobile job matches list (only exists on mobile)
  if (els.jobMatches) {
    // Rendered in renderJobsList via the same function? We'll render here.
    const ids = Object.keys(state.jobs);
    const filtered = filterJobs(ids, state.jobQuery);
    els.jobMatches.innerHTML = '';
    filtered.slice(0,20).forEach(({id})=>{
      const li = document.createElement('li');
      li.className = (state.selectedJobId===id) ? 'active' : '';
      li.innerHTML = `<strong>${highlightMatch(id, state.jobQuery)}</strong>`;
      li.addEventListener('click', ()=>{ state.selectedJobId=id; save(); syncUI(); });
      els.jobMatches.appendChild(li);
    });
  }

}
    });
  
  if (els.jobSearch) {
    els.jobSearch.value = state.jobQuery || '';
    els.jobSearch.addEventListener('input', ()=>{
      state.jobQuery = els.jobSearch.value;
      syncUI();
    });
    els.jobSearch.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') {
        const ids = Object.keys(state.jobs);
        const filtered = filterJobs(ids, state.jobQuery);
        if (filtered.length) {
          state.selectedJobId = filtered[0].id;
          save(); syncUI();
          // Focus part search for quick scanning
          if (els.partSearch) els.partSearch.focus();
        }
      }
    });
  }
  // Mobile job matches list (only exists on mobile)
  if (els.jobMatches) {
    // Rendered in renderJobsList via the same function? We'll render here.
    const ids = Object.keys(state.jobs);
    const filtered = filterJobs(ids, state.jobQuery);
    els.jobMatches.innerHTML = '';
    filtered.slice(0,20).forEach(({id})=>{
      const li = document.createElement('li');
      li.className = (state.selectedJobId===id) ? 'active' : '';
      li.innerHTML = `<strong>${highlightMatch(id, state.jobQuery)}</strong>`;
      li.addEventListener('click', ()=>{ state.selectedJobId=id; save(); syncUI(); });
      els.jobMatches.appendChild(li);
    });
  }

}
  if (els.partSearch) {
    els.partSearch.addEventListener('input', ()=>{
      state.searchPart = els.partSearch.value.trim();
      syncUI();
    });
  
  if (els.jobSearch) {
    els.jobSearch.value = state.jobQuery || '';
    els.jobSearch.addEventListener('input', ()=>{
      state.jobQuery = els.jobSearch.value;
      syncUI();
    });
    els.jobSearch.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') {
        const ids = Object.keys(state.jobs);
        const filtered = filterJobs(ids, state.jobQuery);
        if (filtered.length) {
          state.selectedJobId = filtered[0].id;
          save(); syncUI();
          // Focus part search for quick scanning
          if (els.partSearch) els.partSearch.focus();
        }
      }
    });
  }
  // Mobile job matches list (only exists on mobile)
  if (els.jobMatches) {
    // Rendered in renderJobsList via the same function? We'll render here.
    const ids = Object.keys(state.jobs);
    const filtered = filterJobs(ids, state.jobQuery);
    els.jobMatches.innerHTML = '';
    filtered.slice(0,20).forEach(({id})=>{
      const li = document.createElement('li');
      li.className = (state.selectedJobId===id) ? 'active' : '';
      li.innerHTML = `<strong>${highlightMatch(id, state.jobQuery)}</strong>`;
      li.addEventListener('click', ()=>{ state.selectedJobId=id; save(); syncUI(); });
      els.jobMatches.appendChild(li);
    });
  }

}
  if (els.clearSearch) {
    els.clearSearch.addEventListener('click', ()=>{
      if (els.partSearch) els.partSearch.value='';
      state.searchPart=''; syncUI();
    });
  
  if (els.jobSearch) {
    els.jobSearch.value = state.jobQuery || '';
    els.jobSearch.addEventListener('input', ()=>{
      state.jobQuery = els.jobSearch.value;
      syncUI();
    });
    els.jobSearch.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') {
        const ids = Object.keys(state.jobs);
        const filtered = filterJobs(ids, state.jobQuery);
        if (filtered.length) {
          state.selectedJobId = filtered[0].id;
          save(); syncUI();
          // Focus part search for quick scanning
          if (els.partSearch) els.partSearch.focus();
        }
      }
    });
  }
  // Mobile job matches list (only exists on mobile)
  if (els.jobMatches) {
    // Rendered in renderJobsList via the same function? We'll render here.
    const ids = Object.keys(state.jobs);
    const filtered = filterJobs(ids, state.jobQuery);
    els.jobMatches.innerHTML = '';
    filtered.slice(0,20).forEach(({id})=>{
      const li = document.createElement('li');
      li.className = (state.selectedJobId===id) ? 'active' : '';
      li.innerHTML = `<strong>${highlightMatch(id, state.jobQuery)}</strong>`;
      li.addEventListener('click', ()=>{ state.selectedJobId=id; save(); syncUI(); });
      els.jobMatches.appendChild(li);
    });
  }

}
  if (els.unassignedOnly) {
    els.unassignedOnly.addEventListener('change', ()=>{
      state.unassignedOnly = !!els.unassignedOnly.checked;
      syncUI();
    });
  
  if (els.jobSearch) {
    els.jobSearch.value = state.jobQuery || '';
    els.jobSearch.addEventListener('input', ()=>{
      state.jobQuery = els.jobSearch.value;
      syncUI();
    });
    els.jobSearch.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') {
        const ids = Object.keys(state.jobs);
        const filtered = filterJobs(ids, state.jobQuery);
        if (filtered.length) {
          state.selectedJobId = filtered[0].id;
          save(); syncUI();
          // Focus part search for quick scanning
          if (els.partSearch) els.partSearch.focus();
        }
      }
    });
  }
  // Mobile job matches list (only exists on mobile)
  if (els.jobMatches) {
    // Rendered in renderJobsList via the same function? We'll render here.
    const ids = Object.keys(state.jobs);
    const filtered = filterJobs(ids, state.jobQuery);
    els.jobMatches.innerHTML = '';
    filtered.slice(0,20).forEach(({id})=>{
      const li = document.createElement('li');
      li.className = (state.selectedJobId===id) ? 'active' : '';
      li.innerHTML = `<strong>${highlightMatch(id, state.jobQuery)}</strong>`;
      li.addEventListener('click', ()=>{ state.selectedJobId=id; save(); syncUI(); });
      els.jobMatches.appendChild(li);
    });
  }

}
  if (els.exportReport) {
    els.exportReport.addEventListener('click', exportReportCsv);
  
  if (els.jobSearch) {
    els.jobSearch.value = state.jobQuery || '';
    els.jobSearch.addEventListener('input', ()=>{
      state.jobQuery = els.jobSearch.value;
      syncUI();
    });
    els.jobSearch.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') {
        const ids = Object.keys(state.jobs);
        const filtered = filterJobs(ids, state.jobQuery);
        if (filtered.length) {
          state.selectedJobId = filtered[0].id;
          save(); syncUI();
          // Focus part search for quick scanning
          if (els.partSearch) els.partSearch.focus();
        }
      }
    });
  }
  // Mobile job matches list (only exists on mobile)
  if (els.jobMatches) {
    // Rendered in renderJobsList via the same function? We'll render here.
    const ids = Object.keys(state.jobs);
    const filtered = filterJobs(ids, state.jobQuery);
    els.jobMatches.innerHTML = '';
    filtered.slice(0,20).forEach(({id})=>{
      const li = document.createElement('li');
      li.className = (state.selectedJobId===id) ? 'active' : '';
      li.innerHTML = `<strong>${highlightMatch(id, state.jobQuery)}</strong>`;
      li.addEventListener('click', ()=>{ state.selectedJobId=id; save(); syncUI(); });
      els.jobMatches.appendChild(li);
    });
  }

}
  if (els.backupBtn) els.backupBtn.addEventListener('click', backupAll);
  if (els.restoreBtn) els.restoreBtn.addEventListener('click', restoreAll);
  const mapBtn = document.getElementById('mapColumnsBtn');
  if (mapBtn) {
    mapBtn.addEventListener('click', ()=>{
      if (!state.selectedJobId) { alert('Select a job first.'); return; 
  if (els.jobSearch) {
    els.jobSearch.value = state.jobQuery || '';
    els.jobSearch.addEventListener('input', ()=>{
      state.jobQuery = els.jobSearch.value;
      syncUI();
    });
    els.jobSearch.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') {
        const ids = Object.keys(state.jobs);
        const filtered = filterJobs(ids, state.jobQuery);
        if (filtered.length) {
          state.selectedJobId = filtered[0].id;
          save(); syncUI();
          // Focus part search for quick scanning
          if (els.partSearch) els.partSearch.focus();
        }
      }
    });
  }
  // Mobile job matches list (only exists on mobile)
  if (els.jobMatches) {
    // Rendered in renderJobsList via the same function? We'll render here.
    const ids = Object.keys(state.jobs);
    const filtered = filterJobs(ids, state.jobQuery);
    els.jobMatches.innerHTML = '';
    filtered.slice(0,20).forEach(({id})=>{
      const li = document.createElement('li');
      li.className = (state.selectedJobId===id) ? 'active' : '';
      li.innerHTML = `<strong>${highlightMatch(id, state.jobQuery)}</strong>`;
      li.addEventListener('click', ()=>{ state.selectedJobId=id; save(); syncUI(); });
      els.jobMatches.appendChild(li);
    });
  }

}
      openMapperForJob(state.selectedJobId);
    });
  
  if (els.jobSearch) {
    els.jobSearch.value = state.jobQuery || '';
    els.jobSearch.addEventListener('input', ()=>{
      state.jobQuery = els.jobSearch.value;
      syncUI();
    });
    els.jobSearch.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') {
        const ids = Object.keys(state.jobs);
        const filtered = filterJobs(ids, state.jobQuery);
        if (filtered.length) {
          state.selectedJobId = filtered[0].id;
          save(); syncUI();
          // Focus part search for quick scanning
          if (els.partSearch) els.partSearch.focus();
        }
      }
    });
  }
  // Mobile job matches list (only exists on mobile)
  if (els.jobMatches) {
    // Rendered in renderJobsList via the same function? We'll render here.
    const ids = Object.keys(state.jobs);
    const filtered = filterJobs(ids, state.jobQuery);
    els.jobMatches.innerHTML = '';
    filtered.slice(0,20).forEach(({id})=>{
      const li = document.createElement('li');
      li.className = (state.selectedJobId===id) ? 'active' : '';
      li.innerHTML = `<strong>${highlightMatch(id, state.jobQuery)}</strong>`;
      li.addEventListener('click', ()=>{ state.selectedJobId=id; save(); syncUI(); });
      els.jobMatches.appendChild(li);
    });
  }

}
}


function applyTheme(){
  const root = document.documentElement;
  root.setAttribute('data-theme', state.theme || 'warm');
  // Update toggle UI text
  const t = document.getElementById('themeToggle');
  if (t) t.textContent = (state.theme==='warm') ? 'Color: Warm' : 'Color: Cosmic';
}
function toggleTheme(){
  state.theme = (state.theme === 'warm') ? 'cosmic' : 'warm';
  save(); applyTheme();
  const t = document.getElementById('themeToggle');
  if (t) t.setAttribute('aria-pressed', state.theme==='cosmic');
}
function toggleScan(){
  state.scanMode = !state.scanMode;
  const s = document.getElementById('scanToggle');
  if (s){ s.textContent = state.scanMode ? 'Scan: On' : 'Scan: Off'; s.classList.add('toggle'); s.classList.toggle('on', state.scanMode); s.setAttribute('aria-pressed', state.scanMode); }
  if (state.scanMode && els.partSearch) els.partSearch.focus();
  save();
}
function beep(ok=true){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type='sine'; o.frequency.value = ok ? 880 : 200; g.gain.value = 0.06;
    o.connect(g); g.connect(ctx.destination);
    o.start(); setTimeout(()=>{ o.stop(); ctx.close(); }, ok ? 120 : 200);
  }catch(e){}
}
function handleScanEnter(){
  if (!state.scanMode) return false;
  const job = state.jobs[state.selectedJobId]; if (!job) return false;
  const q = (state.searchPart||'').trim().toLowerCase();
  const entries = Object.entries(job.parts);
  // Apply current location filter first
  const loc = state.locationFilter;
  let list = loc ? entries.filter(([pn, p]) => p.locations.hasOwnProperty(loc)) : entries;
  // Substring match by part # or description
  if (q) list = list.filter(([pn,p])=> pn.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q));
  if (list.length !== 1) { beep(false); return false; }

  const [pn, p] = list[0];
  // If there is exactly one location with remaining > 0, auto assign +1 to it.
  const remainingLocs = Object.keys(p.locations).filter(L => (p.locations[L] - (p.assigned[L]||0)) > 0);
  if (remainingLocs.length === 1){
    adjustAssignment(state.selectedJobId, pn, remainingLocs[0], +1);
    beep(true);
  } else {
    beep(true);
  }
  // Scroll to the card and flash
  const el = document.getElementById('part-' + CSS.escape(pn));
  if (el){ el.classList.add('flash'); el.scrollIntoView({behavior:'smooth', block:'center'}); setTimeout(()=>el.classList.remove('flash'), 900); }
  // Clear search for next scan
  state.searchPart = ''; if (els.partSearch) els.partSearch.value = ''; save(); syncUI();
  return true;
}

function main() {
  load();
  if (els.unassignedOnly) els.unassignedOnly.checked = state.unassignedOnly;
  if (els.partSearch) els.partSearch.value = state.searchPart || '';
  if (els.jobSearch) els.jobSearch.value = state.jobQuery || '';
  initEvents();
  applyTheme();
  // Initialize toggle button labels
  const tbtn = document.getElementById('themeToggle'); if (tbtn){ tbtn.textContent = (state.theme==='warm') ? 'Color: Warm' : 'Color: Cosmic'; tbtn.setAttribute('aria-pressed', state.theme==='cosmic'); }
  const sbtn = document.getElementById('scanToggle'); if (sbtn){ sbtn.textContent = state.scanMode ? 'Scan: On' : 'Scan: Off'; sbtn.classList.add('toggle'); sbtn.classList.toggle('on', state.scanMode); sbtn.setAttribute('aria-pressed', state.scanMode); }
  syncUI();
}

document.addEventListener('DOMContentLoaded', main);


// Click delegation fallback (ensures toggles work even if early binds failed)
document.addEventListener('click', (e)=>{
  const t = e.target.closest('#themeToggle'); if (t){ e.preventDefault(); toggleTheme(); }
  const s = e.target.closest('#scanToggle'); if (s){ e.preventDefault(); toggleScan(); }
});

