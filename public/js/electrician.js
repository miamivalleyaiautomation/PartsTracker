
// js/electrician.js - Updated for table layout
// Electrician page logic with table-based parts display

import {
initializeTheme,
APP_CONFIG
} from ‘./config.js’;
import {
normalizeCode,
formatDate,
showStatus,
debounce,
initializeCommonUI
} from ‘./utils.js’;
import {
JobsAPI,
PartsAPI,
LocationsAPI
} from ‘./supabase-client.js’;

// State
let currentJob = null;
let allParts = [];
let filteredParts = [];
let allLocations = [];
let selectedLocation = ‘all’;
let jobs = [];

// DOM Elements
const jobSearch = document.getElementById(‘jobSearch’);
const jobResults = document.getElementById(‘jobResults’);
const partSearch = document.getElementById(‘partSearch’);
const partResults = document.getElementById(‘partResults’);
const locationPills = document.getElementById(‘locationPills’);
const partsTableBody = document.getElementById(‘partsTableBody’);
const loadingSpinner = document.getElementById(‘loadingSpinner’);
const emptyState = document.getElementById(‘emptyState’);
const statusBar = document.getElementById(‘statusBar’);

// Initialize
document.addEventListener(‘DOMContentLoaded’, async () => {
initializeTheme();
initializeCommonUI();

// Set up event listeners
setupEventListeners();

// Load jobs
await loadJobs();

// Check for job parameter in URL
const urlParams = new URLSearchParams(window.location.search);
const jobId = urlParams.get(‘job’);
if (jobId) {
const job = jobs.find(j => j.id === jobId);
if (job) {
await selectJob(job);
}
} else if (jobs.length > 0) {
// Auto-select first job if available
await selectJob(jobs[0]);
}
});

/**

- Set up event listeners
  */
  function setupEventListeners() {
  // Job search
  jobSearch.addEventListener(‘input’, debounce(handleJobSearch, 300));
  jobSearch.addEventListener(‘keydown’, handleJobSearchKeydown);

// Part search
partSearch.addEventListener(‘input’, debounce(handlePartSearch, 300));
partSearch.addEventListener(‘keydown’, handlePartSearchKeydown);

// Click outside search results
document.addEventListener(‘click’, (e) => {
if (!e.target.closest(’.search-group’)) {
jobResults.classList.remove(‘active’);
partResults.classList.remove(‘active’);
}
});
}

/**

- Load jobs
  */
  async function loadJobs() {
  try {
  jobs = await JobsAPI.list();
  
  // Get stats for each job
  for (const job of jobs) {
  const stats = await JobsAPI.getWithStats(job.id);
  job.part_count = stats.part_count;
  job.location_count = stats.location_count;
  }

} catch (error) {
console.error(‘Error loading jobs:’, error);
showStatus(‘Error loading jobs’, ‘error’);
}
}

/**

- Handle job search
  */
  async function handleJobSearch() {
  const query = jobSearch.value.trim();

if (!query) {
jobResults.classList.remove(‘active’);
return;
}

// Filter jobs
const matchingJobs = jobs.filter(job =>
job.job_number.toLowerCase().includes(query.toLowerCase()) ||
normalizeCode(job.job_number).includes(normalizeCode(query))
);

displayJobSearchResults(matchingJobs);
}

/**

- Handle job search keydown
  */
  function handleJobSearchKeydown(e) {
  if (e.key === ‘Enter’) {
  const firstResult = jobResults.querySelector(’.search-result-item’);
  if (firstResult) {
  firstResult.click();
  }
  } else if (e.key === ‘Escape’) {
  jobResults.classList.remove(‘active’);
  }
  }

/**

- Display job search results
  */
  function displayJobSearchResults(jobs) {
  if (jobs.length === 0) {
  jobResults.classList.remove(‘active’);
  return;
  }

const html = jobs.map(job => `<div class="search-result-item" data-job-id="${job.id}"> <div class="result-main">${job.job_number}</div> <div class="result-sub">${job.part_count || 0} parts, ${job.location_count || 0} locations</div> </div>`).join(’’);

jobResults.innerHTML = html;
jobResults.classList.add(‘active’);

// Add click handlers
jobResults.querySelectorAll(’.search-result-item’).forEach(item => {
item.addEventListener(‘click’, () => {
const jobId = item.dataset.jobId;
const job = jobs.find(j => j.id === jobId);
selectJob(job);
});
});
}

/**

- Select a job
  */
  async function selectJob(job) {
  if (!job) return;

currentJob = job;
jobSearch.value = job.job_number;
jobResults.classList.remove(‘active’);

// Update URL
const url = new URL(window.location);
url.searchParams.set(‘job’, job.id);
window.history.replaceState(null, ‘’, url);

// Load parts for this job
await loadParts();
}

/**

- Load parts for current job
  */
  async function loadParts() {
  if (!currentJob) return;

try {
showLoading(true);

```
// Load parts with locations
allParts = await PartsAPI.getWithLocations(currentJob.id);

// Get unique locations
allLocations = await LocationsAPI.getUniqueForJob(currentJob.id);

// Update location pills
updateLocationPills();

// Filter and display parts
filterParts();

showLoading(false);
```

} catch (error) {
console.error(‘Error loading parts:’, error);
showStatus(‘Error loading parts’, ‘error’);
showLoading(false);
}
}

/**

- Update location pills
  */
  function updateLocationPills() {
  const pills = [’<button class="pill active" data-location="all">All Locations</button>’];

allLocations.forEach(location => {
pills.push(`<button class="pill" data-location="${location}">${location}</button>`);
});

locationPills.innerHTML = pills.join(’’);

// Add click handlers
locationPills.querySelectorAll(’.pill’).forEach(pill => {
pill.addEventListener(‘click’, () => {
selectedLocation = pill.dataset.location;

```
  // Update active state
  locationPills.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  
  // Filter parts
  filterParts();
});
```

});
}

/**

- Filter parts based on selected location and search
  */
  function filterParts() {
  let filtered = […allParts];

// Filter by location
if (selectedLocation !== ‘all’) {
filtered = filtered.filter(part =>
part.part_locations?.some(loc => loc.location === selectedLocation)
);
}

// Filter by part search
const partQuery = partSearch.value.trim().toLowerCase();
if (partQuery) {
filtered = filtered.filter(part =>
part.part_number.toLowerCase().includes(partQuery) ||
(part.description && part.description.toLowerCase().includes(partQuery))
);
}

filteredParts = filtered;
displayPartsTable();
}

/**

- Display parts in table format
  */
  function displayPartsTable() {
  if (!filteredParts || filteredParts.length === 0) {
  partsTableBody.innerHTML = ‘’;
  emptyState.style.display = ‘block’;
  return;
  }

emptyState.style.display = ‘none’;

// Clear existing rows
partsTableBody.innerHTML = ‘’;

filteredParts.forEach(part => {
const row = createPartRow(part);
partsTableBody.appendChild(row);
});
}

/**

- Create a table row for a part
  *//**

- Create a double table row for a part (info row + actions row)
  */
  function createPartRow(part) {
  const fragment = document.createDocumentFragment();

// Calculate totals
const totalRequired = part.part_locations?.reduce((sum, loc) => sum + loc.qty_required, 0) || 0;
const totalAssigned = part.part_locations?.reduce((sum, loc) => sum + loc.qty_assigned, 0) || 0;
const progress = totalRequired > 0 ? Math.round((totalAssigned / totalRequired) * 100) : 0;

// Info Row
const infoRow = document.createElement(‘tr’);
infoRow.classList.add(‘part-info-row’);
infoRow.dataset.partId = part.id;

infoRow.innerHTML = `
<td class="part-col">
<div class="part-info">
<div class="part-number">${part.part_number}</div>
<div class="part-description">${part.description || ‘’}</div>
</div>
</td>

```
<td class="location-col">
  <div class="location-pills-table">
    ${part.part_locations?.map(loc => 
      `<span class="location-pill-small">${loc.location}</span>`
    ).join('') || ''}
  </div>
</td>

<td class="qty-col">
  <div class="qty-display">
    <div class="qty-text">${totalAssigned}/${totalRequired}</div>
    <div class="qty-labels">
      <span>ASGN</span>
      <span>REQ</span>
    </div>
  </div>
</td>

<td class="progress-col">
  <div class="progress-container">
    <div class="progress-bar-small">
      <div class="progress-fill-small ${getProgressClass(progress)}" 
           style="width: ${progress}%"></div>
    </div>
    <div class="progress-text-small">${progress}%</div>
  </div>
</td>
```

`;

// Actions Row
const actionsRow = document.createElement(‘tr’);
actionsRow.classList.add(‘part-actions-row’);
actionsRow.dataset.partId = part.id;

actionsRow.innerHTML = `<td colspan="4" class="actions-full-col"> <div class="action-buttons-full"> <button class="action-btn" onclick="adjustQuantity('${part.id}', -1)">-1</button> <button class="action-btn" onclick="adjustQuantity('${part.id}', 1)">+1</button> <button class="action-btn set-btn" onclick="setQuantity('${part.id}')">Set</button> <button class="action-btn full-btn" onclick="setFull('${part.id}')">Full</button> </div> </td>`;

fragment.appendChild(infoRow);
fragment.appendChild(actionsRow);

return fragment;
}

// Calculate totals
const totalRequired = part.part_locations?.reduce((sum, loc) => sum + loc.qty_required, 0) || 0;
const totalAssigned = part.part_locations?.reduce((sum, loc) => sum + loc.qty_assigned, 0) || 0;
const progress = totalRequired > 0 ? Math.round((totalAssigned / totalRequired) * 100) : 0;

row.innerHTML = `
<td class="part-col">
<div class="part-info">
<div class="part-number">${part.part_number}</div>
<div class="part-description">${part.description || ‘’}</div>
</div>
</td>

```
<td class="location-col">
  <div class="location-pills-table">
    ${part.part_locations?.map(loc => 
      `<span class="location-pill-small">${loc.location}</span>`
    ).join('') || ''}
  </div>
</td>

<td class="qty-col">
  <div class="qty-display">
    <div class="qty-text">${totalAssigned}/${totalRequired}</div>
    <div class="qty-labels">
      <span>ASGN</span>
      <span>REQ</span>
    </div>
  </div>
</td>

<td class="progress-col">
  <div class="progress-container">
    <div class="progress-bar-small">
      <div class="progress-fill-small ${getProgressClass(progress)}" 
           style="width: ${progress}%"></div>
    </div>
    <div class="progress-text-small">${progress}%</div>
  </div>
</td>

<td class="actions-col">
  <div class="action-buttons">
    <button class="action-btn" onclick="adjustQuantity('${part.id}', -1)">-1</button>
    <button class="action-btn" onclick="adjustQuantity('${part.id}', 1)">+1</button>
    <button class="action-btn set-btn" onclick="setQuantity('${part.id}')">Set</button>
    <button class="action-btn full-btn" onclick="setFull('${part.id}')">Full</button>
  </div>
</td>
```

`;

return row;
}

/**

- Get progress class based on percentage
  */
  function getProgressClass(progress) {
  if (progress === 100) return ‘complete’;
  if (progress > 0) return ‘partial’;
  return ‘empty’;
  }

/**

- Handle part search
  */
  function handlePartSearch() {
  const query = partSearch.value.trim();

if (!query) {
partResults.classList.remove(‘active’);
filterParts(); // Refresh display
return;
}

// Filter parts for search results
const matchingParts = allParts.filter(part =>
part.part_number.toLowerCase().includes(query.toLowerCase()) ||
(part.description && part.description.toLowerCase().includes(query.toLowerCase()))
);

displayPartSearchResults(matchingParts);
filterParts(); // Also update main display
}

/**

- Handle part search keydown
  */
  function handlePartSearchKeydown(e) {
  if (e.key === ‘Enter’) {
  const firstResult = partResults.querySelector(’.search-result-item’);
  if (firstResult) {
  firstResult.click();
  }
  } else if (e.key === ‘Escape’) {
  partResults.classList.remove(‘active’);
  }
  }

/**

- Display part search results
  */
  function displayPartSearchResults(parts) {
  if (parts.length === 0) {
  partResults.classList.remove(‘active’);
  return;
  }

const html = parts.slice(0, 10).map(part => {
const totalRequired = part.part_locations?.reduce((sum, loc) => sum + loc.qty_required, 0) || 0;
const totalAssigned = part.part_locations?.reduce((sum, loc) => sum + loc.qty_assigned, 0) || 0;

```
return `
  <div class="search-result-item" data-part-id="${part.id}">
    <div class="result-main">${part.part_number}</div>
    <div class="result-sub">${part.description || ''} • ${totalAssigned}/${totalRequired}</div>
  </div>
`;
```

}).join(’’);

partResults.innerHTML = html;
partResults.classList.add(‘active’);

// Add click handlers
partResults.querySelectorAll(’.search-result-item’).forEach(item => {
item.addEventListener(‘click’, () => {
const partId = item.dataset.partId;
scrollToPartInTable(partId);
partResults.classList.remove(‘active’);
});
});
}

/**

- Scroll to part in table
  */
  function scrollToPartInTable(partId) {
  const row = partsTableBody.querySelector(`tr[data-part-id="${partId}"]`);
  if (row) {
  row.scrollIntoView({ behavior: ‘smooth’, block: ‘center’ });
  row.style.background = ‘var(–primary-light)’;
  setTimeout(() => {
  row.style.background = ‘’;
  }, 2000);
  }
  }

/**

- Show/hide loading spinner
  */
  function showLoading(show) {
  if (show) {
  loadingSpinner.style.display = ‘flex’;
  emptyState.style.display = ‘none’;
  } else {
  loadingSpinner.style.display = ‘none’;
  }
  }

/**

- Adjust quantity for a part
  */
  window.adjustQuantity = async function(partId, delta) {
  try {
  const part = allParts.find(p => p.id === partId);
  if (!part || !part.part_locations?.length) return;
  
  // Find the first location or the one matching current filter
  let targetLocation = part.part_locations[0];
  if (selectedLocation !== ‘all’) {
  const locationMatch = part.part_locations.find(loc => loc.location === selectedLocation);
  if (locationMatch) {
  targetLocation = locationMatch;
  }
  }
  
  // Update quantity
  await LocationsAPI.updateAssigned(targetLocation.id, delta);
  
  // Reload parts to get fresh data
  await loadParts();
  
  showStatus(`Updated ${part.part_number}`, ‘success’);

} catch (error) {
console.error(‘Error adjusting quantity:’, error);
showStatus(‘Error updating quantity’, ‘error’);
}
};

/**

- Set specific quantity for a part
  */
  window.setQuantity = async function(partId) {
  const quantity = prompt(‘Enter quantity:’);
  if (quantity === null || quantity === ‘’) return;

const qty = parseInt(quantity);
if (isNaN(qty) || qty < 0) {
showStatus(‘Invalid quantity’, ‘error’);
return;
}

try {
const part = allParts.find(p => p.id === partId);
if (!part || !part.part_locations?.length) return;

```
let targetLocation = part.part_locations[0];
if (selectedLocation !== 'all') {
  const locationMatch = part.part_locations.find(loc => loc.location === selectedLocation);
  if (locationMatch) {
    targetLocation = locationMatch;
  }
}

await LocationsAPI.setAssigned(targetLocation.id, qty);
await loadParts();

showStatus(`Set ${part.part_number} to ${qty}`, 'success');
```

} catch (error) {
console.error(‘Error setting quantity:’, error);
showStatus(‘Error setting quantity’, ‘error’);
}
};

/**

- Set full quantity for a part
  */
  window.setFull = async function(partId) {
  try {
  const part = allParts.find(p => p.id === partId);
  if (!part || !part.part_locations?.length) return;
  
  let targetLocation = part.part_locations[0];
  if (selectedLocation !== ‘all’) {
  const locationMatch = part.part_locations.find(loc => loc.location === selectedLocation);
  if (locationMatch) {
  targetLocation = locationMatch;
  }
  }
  
  await LocationsAPI.setAssigned(targetLocation.id, targetLocation.qty_required);
  await loadParts();
  
  showStatus(`Set ${part.part_number} to full`, ‘success’);

} catch (error) {
console.error(‘Error setting full:’, error);
showStatus(‘Error setting full’, ‘error’);
}
};
