// js/electrician.js
// Electrician workflow page logic

import { 
  initializeTheme, 
  initializeScanMode, 
  APP_CONFIG,
  getAssignmentSettings 
} from './config.js';
import { 
  normalizeCode, 
  processBarcode, 
  debounce, 
  showStatus, 
  scrollToElement,
  playBeep,
  vibrate,
  initializeCommonUI
} from './utils.js';
import { 
  JobsAPI, 
  PartsAPI, 
  LocationsAPI 
} from './supabase-client.js';

// State
let currentJob = null;
let currentParts = [];
let filteredParts = [];
let activeLocation = 'all';
let scanMode = false;

// DOM Elements
const jobSearchInput = document.getElementById('jobSearch');
const jobResults = document.getElementById('jobResults');
const partSearchInput = document.getElementById('partSearch');
const partResults = document.getElementById('partResults');
const locationPills = document.getElementById('locationPills');
const partsGrid = document.getElementById('partsGrid');
const scanToggle = document.getElementById('scanToggle');
const loadingSpinner = document.getElementById('loadingSpinner');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initializeTheme();
  initializeCommonUI();
  
  // Initialize scan mode
  scanMode = initializeScanMode();
  updateScanToggle();
  
  // Set up event listeners
  setupEventListeners();
  
  // Load initial data if job in URL
  const urlParams = new URLSearchParams(window.location.search);
  const jobId = urlParams.get('job');
  if (jobId) {
    await loadJob(jobId);
  }
});

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Job search
  jobSearchInput.addEventListener('input', debounce(handleJobSearch, APP_CONFIG.SEARCH_DEBOUNCE));
  jobSearchInput.addEventListener('keydown', handleJobSearchKeydown);
  
  // Part search
  partSearchInput.addEventListener('input', debounce(handlePartSearch, APP_CONFIG.SEARCH_DEBOUNCE));
  partSearchInput.addEventListener('keydown', handlePartSearchKeydown);
  
  // Scan toggle
  scanToggle.addEventListener('click', toggleScanMode);
  
  // Click outside to close dropdowns
  document.addEventListener('click', (e) => {
    if (!jobSearchInput.contains(e.target) && !jobResults.contains(e.target)) {
      jobResults.classList.remove('active');
    }
    if (!partSearchInput.contains(e.target) && !partResults.contains(e.target)) {
      partResults.classList.remove('active');
    }
  });
}

/**
 * Handle job search input
 */
async function handleJobSearch() {
  const query = jobSearchInput.value.trim();
  
  if (!query) {
    jobResults.classList.remove('active');
    return;
  }
  
  try {
    const jobs = await JobsAPI.search(query);
    displayJobResults(jobs);
  } catch (error) {
    console.error('Job search error:', error);
    showStatus('Error searching jobs', 'error');
  }
}

/**
 * Handle job search keydown
 */
function handleJobSearchKeydown(e) {
  if (e.key === 'Enter') {
    const firstResult = jobResults.querySelector('.search-result-item');
    if (firstResult) {
      firstResult.click();
    }
  } else if (e.key === 'Escape') {
    jobResults.classList.remove('active');
    jobSearchInput.blur();
  }
}

/**
 * Display job search results
 */
function displayJobResults(jobs) {
  if (jobs.length === 0) {
    jobResults.innerHTML = '<div class="empty-state">No jobs found</div>';
  } else {
    jobResults.innerHTML = jobs.map(job => `
      <div class="search-result-item" data-job-id="${job.id}">
        <div class="result-main">${job.job_number}</div>
        ${job.filename ? `<div class="result-sub">${job.filename}</div>` : ''}
      </div>
    `).join('');
    
    // Add click handlers
    jobResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const jobId = item.dataset.jobId;
        const job = jobs.find(j => j.id === jobId);
        selectJob(job);
      });
    });
  }
  
  jobResults.classList.add('active');
}

/**
 * Select a job
 */
async function selectJob(job) {
  currentJob = job;
  jobSearchInput.value = job.job_number;
  jobResults.classList.remove('active');
  
  // Update URL
  const url = new URL(window.location);
  url.searchParams.set('job', job.id);
  window.history.pushState({}, '', url);
  
  // Load job data
  await loadJob(job.id);
}

/**
 * Load job data
 */
async function loadJob(jobId) {
  try {
    showLoading(true);
    
    // Get job if not already loaded
    if (!currentJob || currentJob.id !== jobId) {
      const jobs = await JobsAPI.list();
      currentJob = jobs.find(j => j.id === jobId);
      if (currentJob) {
        jobSearchInput.value = currentJob.job_number;
      }
    }
    
    if (!currentJob) {
      showStatus('Job not found', 'error');
      showLoading(false);
      return;
    }
    
    // Load parts with locations
    currentParts = await PartsAPI.getWithLocations(jobId);
    
    // Load unique locations
    const locations = await LocationsAPI.getUniqueForJob(jobId);
    displayLocationPills(locations);
    
    // Display parts
    filterAndDisplayParts();
    
    showStatus(`Loaded ${currentParts.length} parts`, 'success');
  } catch (error) {
    console.error('Error loading job:', error);
    showStatus('Error loading job data', 'error');
  } finally {
    showLoading(false);
  }
}

/**
 * Display location pills
 */
function displayLocationPills(locations) {
  const pills = ['<button class="pill active" data-location="all">All Locations</button>'];
  
  locations.forEach(location => {
    pills.push(`<button class="pill" data-location="${location}">${location}</button>`);
  });
  
  locationPills.innerHTML = pills.join('');
  
  // Add click handlers
  locationPills.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      locationPills.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeLocation = pill.dataset.location;
      filterAndDisplayParts();
    });
  });
}

/**
 * Handle part search
 */
async function handlePartSearch() {
  if (!currentJob) {
    showStatus('Please select a job first', 'info');
    return;
  }
  
  filterAndDisplayParts();
}

/**
 * Handle part search keydown
 */
async function handlePartSearchKeydown(e) {
  if (e.key === 'Enter' && scanMode) {
    e.preventDefault();
    await handleScan(partSearchInput.value);
    partSearchInput.value = '';
  } else if (e.key === 'Escape') {
    partSearchInput.blur();
  }
}

/**
 * Filter and display parts
 */
function filterAndDisplayParts() {
  const searchQuery = partSearchInput.value.trim();
  const normalized = normalizeCode(searchQuery);
  
  // Filter by search query
  if (searchQuery) {
    filteredParts = currentParts.filter(part => {
      const partNorm = normalizeCode(part.part_number);
      const descMatch = part.description && 
        part.description.toLowerCase().includes(searchQuery.toLowerCase());
      return partNorm.includes(normalized) || descMatch;
    });
  } else {
    filteredParts = [...currentParts];
  }
  
  // Filter by location
  if (activeLocation !== 'all') {
    filteredParts = filteredParts.filter(part => {
      return part.part_locations.some(loc => loc.location === activeLocation);
    });
  }
  
  displayParts();
}

/**
 * Display parts grid
 */
function displayParts() {
  if (filteredParts.length === 0) {
    partsGrid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" width="64" height="64">
          <path stroke="currentColor" fill="none" stroke-width="2" d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM12 4v3m0 10v4"/>
        </svg>
        <p>No parts found</p>
      </div>
    `;
    return;
  }
  
  const cards = filteredParts.map(part => {
    // Calculate totals
    let totalRequired = 0;
    let totalAssigned = 0;
    
    // Filter locations for active location
    let locations = part.part_locations || [];
    if (activeLocation !== 'all') {
      locations = locations.filter(loc => loc.location === activeLocation);
    }
    
    locations.forEach(loc => {
      totalRequired += loc.qty_required;
      totalAssigned += loc.qty_assigned;
    });
    
    const progress = totalRequired > 0 ? (totalAssigned / totalRequired * 100) : 0;
    
    return `
      <div class="part-card" data-part-id="${part.id}" data-part-number="${part.part_number}">
        <div class="part-header">
          <div class="part-number">${part.part_number}</div>
          ${part.description ? `<div class="part-description">${part.description}</div>` : ''}
        </div>
        
        <div class="part-progress">
          <div class="progress-info">
            <span class="progress-label">Progress</span>
            <span class="progress-value">${totalAssigned} / ${totalRequired}</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${progress}%"></div>
          </div>
        </div>
        
        <div class="part-locations">
          ${locations.map(loc => {
            const remaining = loc.qty_required - loc.qty_assigned;
            const isComplete = remaining === 0;
            
            return `
              <div class="location-row" data-location-id="${loc.id}">
                <div class="location-name">${loc.location}</div>
                <div class="location-stat">
                  <span class="stat-label">Req</span>
                  <span class="stat-value">${loc.qty_required}</span>
                </div>
                <div class="location-stat">
                  <span class="stat-label">Asgn</span>
                  <span class="stat-value">${loc.qty_assigned}</span>
                </div>
                <div class="location-stat">
                  <span class="stat-label">Rem</span>
                  <span class="stat-value ${isComplete ? 'complete' : 'remaining'}">${remaining}</span>
                </div>
                <div class="location-actions">
                  <button class="action-btn" onclick="updateQuantity('${loc.id}', -1)">-1</button>
                  <button class="action-btn" onclick="updateQuantity('${loc.id}', 1)">+1</button>
                  <button class="action-btn set-btn" onclick="setQuantity('${loc.id}')">Set</button>
                  <button class="action-btn full-btn" onclick="markFull('${loc.id}')">Full</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
  
  partsGrid.innerHTML = cards;
}

/**
 * Update quantity
 */
window.updateQuantity = async function(locationId, delta) {
  try {
    await LocationsAPI.updateAssigned(locationId, delta);
    await loadJob(currentJob.id);
    
    const action = delta > 0 ? 'Added' : 'Removed';
    showStatus(`${action} ${Math.abs(delta)}`, 'success');
  } catch (error) {
    console.error('Error updating quantity:', error);
    showStatus('Error updating quantity', 'error');
  }
};

/**
 * Set quantity
 */
window.setQuantity = async function(locationId) {
  const input = prompt('Enter quantity:');
  if (input === null) return;
  
  const qty = parseInt(input);
  if (isNaN(qty) || qty < 0) {
    showStatus('Invalid quantity', 'error');
    return;
  }
  
  try {
    await LocationsAPI.setAssigned(locationId, qty);
    await loadJob(currentJob.id);
    showStatus(`Set quantity to ${qty}`, 'success');
  } catch (error) {
    console.error('Error setting quantity:', error);
    showStatus('Error setting quantity', 'error');
  }
};

/**
 * Mark location as full
 */
window.markFull = async function(locationId) {
  try {
    const location = currentParts
      .flatMap(p => p.part_locations)
      .find(l => l.id === locationId);
    
    await LocationsAPI.setAssigned(locationId, location.qty_required);
    await loadJob(currentJob.id);
    showStatus('Marked as full', 'success');
  } catch (error) {
    console.error('Error marking full:', error);
    showStatus('Error marking full', 'error');
  }
};

/**
 * Handle scan
 */
async function handleScan(code) {
  if (!currentJob) {
    showStatus('Please select a job first', 'info');
    return;
  }
  
  // Process barcode
  const processed = processBarcode(code);
  const normalized = normalizeCode(processed);
  
  // Find matching part
  const matchingParts = currentParts.filter(part => {
    return normalizeCode(part.part_number) === normalized;
  });
  
  if (matchingParts.length === 0) {
    showStatus('Part not found', 'error');
    playBeep();
    return;
  }
  
  if (matchingParts.length > 1) {
    showStatus('Multiple parts match this code', 'warning');
    return;
  }
  
  const part = matchingParts[0];
  const partCard = document.querySelector(`[data-part-id="${part.id}"]`);
  
  if (partCard) {
    scrollToElement(partCard);
  }
  
  // Auto-assign if settings allow
  const settings = getAssignmentSettings();
  const locations = activeLocation === 'all' 
    ? part.part_locations 
    : part.part_locations.filter(l => l.location === activeLocation);
  
  const locationsWithRemaining = locations.filter(l => l.qty_required > l.qty_assigned);
  
  if (locationsWithRemaining.length === 1 && settings.autoAssignToSingle) {
    // Auto-assign to single location
    await updateQuantity(locationsWithRemaining[0].id, 1);
    showStatus(`Auto-assigned to ${locationsWithRemaining[0].location}`, 'success');
    
    if (APP_CONFIG.SCANNER.beepOnSuccess) playBeep();
    if (APP_CONFIG.SCANNER.vibrateOnSuccess) vibrate();
  } else if (activeLocation !== 'all' && locationsWithRemaining.length > 0 && settings.autoAssignToActivePill) {
    // Auto-assign to first location in active pill
    await updateQuantity(locationsWithRemaining[0].id, 1);
    showStatus(`Auto-assigned to ${locationsWithRemaining[0].location}`, 'success');
    
    if (APP_CONFIG.SCANNER.beepOnSuccess) playBeep();
    if (APP_CONFIG.SCANNER.vibrateOnSuccess) vibrate();
  } else {
    showStatus(`Found ${part.part_number} - ${locationsWithRemaining.length} locations available`, 'info');
  }
}

/**
 * Toggle scan mode
 */
function toggleScanMode() {
  scanMode = !scanMode;
  localStorage.setItem(APP_CONFIG.STORAGE_KEYS.scanMode, scanMode);
  updateScanToggle();
  
  if (scanMode) {
    partSearchInput.focus();
    showStatus('Scan mode enabled', 'info');
  } else {
    showStatus('Scan mode disabled', 'info');
  }
}

/**
 * Update scan toggle UI
 */
function updateScanToggle() {
  if (scanMode) {
    scanToggle.classList.add('active');
    scanToggle.querySelector('.toggle-state').textContent = 'On';
    partSearchInput.placeholder = 'Scan or type part number...';
  } else {
    scanToggle.classList.remove('active');
    scanToggle.querySelector('.toggle-state').textContent = 'Off';
    partSearchInput.placeholder = 'Search or scan part...';
  }
}

/**
 * Show/hide loading spinner
 */
function showLoading(show) {
  if (show) {
    loadingSpinner.style.display = 'flex';
    partsGrid.style.display = 'none';
  } else {
    loadingSpinner.style.display = 'none';
    partsGrid.style.display = 'grid';
  }
}