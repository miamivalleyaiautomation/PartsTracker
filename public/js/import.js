// js/import.js
// Import workflow page logic

import { 
  initializeTheme,
  APP_CONFIG
} from './config.js';
import { 
  normalizeCode,
  formatFileSize,
  formatDate,
  showStatus,
  parseCSV,
  createStoragePath,
  initializeCommonUI
} from './utils.js';
import { 
  JobsAPI,
  ImportsAPI,
  StorageAPI
} from './supabase-client.js';

// State
let selectedFiles = [];
let parsedData = [];
let columnMapping = {};
let currentJob = null;
let jobs = [];

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const importOptions = document.getElementById('importOptions');
const jobNumberInput = document.getElementById('jobNumberInput');
const jobSearchResults = document.getElementById('jobSearchResults');
const jobInfo = document.getElementById('jobInfo');
const startImportBtn = document.getElementById('startImportBtn');
const jobsGrid = document.getElementById('jobsGrid');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressDetails = document.getElementById('progressDetails');
const refreshJobsBtn = document.getElementById('refreshJobsBtn');

// Column Mapper Modal Elements
const columnMapperModal = document.getElementById('columnMapperModal');
const closeMapperBtn = document.getElementById('closeMapper');
const cancelMapperBtn = document.getElementById('cancelMapperBtn');
const confirmMapperBtn = document.getElementById('confirmMapperBtn');
const mapPartNumber = document.getElementById('mapPartNumber');
const mapLocation = document.getElementById('mapLocation');
const mapAdditionalLocation = document.getElementById('mapAdditionalLocation');
const mapQuantity = document.getElementById('mapQuantity');
const mapDescription = document.getElementById('mapDescription');
const previewTable = document.getElementById('previewTable');

// File Manager Modal Elements  
const fileManagerModal = document.getElementById('fileManagerModal');
const closeFileManagerBtn = document.getElementById('closeFileManager');
const fileManagerGrid = document.getElementById('fileManagerGrid');
const deleteSelectedFilesBtn = document.getElementById('deleteSelectedFilesBtn');
const deleteAllFilesBtn = document.getElementById('deleteAllFilesBtn');
const deleteJobBtn = document.getElementById('deleteJobBtn');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initializeTheme();
  initializeCommonUI();
  
  // Set up event listeners
  setupEventListeners();
  
  // Load jobs
  await loadJobs();
});

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Upload area
  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', handleDragOver);
  uploadArea.addEventListener('dragleave', handleDragLeave);
  uploadArea.addEventListener('drop', handleDrop);
  fileInput.addEventListener('change', handleFileSelect);
  
  // Job search
  jobNumberInput.addEventListener('input', handleJobSearch);
  jobNumberInput.addEventListener('keydown', handleJobSearchKeydown);
  
  // Import button
  startImportBtn.addEventListener('click', startImport);
  
  // Refresh jobs
  refreshJobsBtn.addEventListener('click', loadJobs);
  
  // Column mapper modal
  closeMapperBtn.addEventListener('click', closeColumnMapper);
  cancelMapperBtn.addEventListener('click', closeColumnMapper);
  confirmMapperBtn.addEventListener('click', confirmMapping);
  
  // File manager modal
  closeFileManagerBtn.addEventListener('click', closeFileManager);
  deleteSelectedFilesBtn.addEventListener('click', deleteSelectedFiles);
  deleteAllFilesBtn.addEventListener('click', deleteAllFiles);
  deleteJobBtn.addEventListener('click', deleteJob);
  
  // Click outside modals
  window.addEventListener('click', (e) => {
    if (e.target === columnMapperModal) closeColumnMapper();
    if (e.target === fileManagerModal) closeFileManager();
  });
}

/**
 * Handle drag over
 */
function handleDragOver(e) {
  e.preventDefault();
  uploadArea.classList.add('dragover');
}

/**
 * Handle drag leave
 */
function handleDragLeave(e) {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
}

/**
 * Handle file drop
 */
function handleDrop(e) {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  
  const files = Array.from(e.dataTransfer.files).filter(f => 
    f.type === 'text/csv' || f.name.endsWith('.csv') || f.name.endsWith('.txt')
  );
  
  if (files.length > 0) {
    handleFiles(files);
  } else {
    showStatus('Please drop CSV files only', 'error');
  }
}

/**
 * Handle file select
 */
function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  handleFiles(files);
}

/**
 * Handle files
 */
function handleFiles(files) {
  selectedFiles = files;
  displayFileList();
  
  // Show import options
  importOptions.style.display = 'block';
  
  // Set default job number from first file
  if (files.length > 0 && !jobNumberInput.value) {
    const fileName = files[0].name.replace(/\.[^/.]+$/, '');
    jobNumberInput.value = fileName;
  }
}

/**
 * Display file list
 */
function displayFileList() {
  if (selectedFiles.length === 0) {
    fileList.innerHTML = '';
    fileList.classList.remove('has-files');
    return;
  }
  
  fileList.classList.add('has-files');
  
  const items = selectedFiles.map((file, index) => `
    <div class="file-item">
      <div class="file-info">
        <div class="file-icon">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div class="file-details">
          <div class="file-name">${file.name}</div>
          <div class="file-size">${formatFileSize(file.size)}</div>
        </div>
      </div>
      <button class="file-remove" onclick="removeFile(${index})">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `).join('');
  
  fileList.innerHTML = items;
}

/**
 * Remove file from list
 */
window.removeFile = function(index) {
  selectedFiles = selectedFiles.filter((_, i) => i !== index);
  displayFileList();
  
  if (selectedFiles.length === 0) {
    importOptions.style.display = 'none';
  }
};

/**
 * Handle job search
 */
async function handleJobSearch() {
  const query = jobNumberInput.value.trim();
  
  if (!query) {
    jobSearchResults.classList.remove('active');
    currentJob = null;
    jobInfo.innerHTML = '';
    return;
  }
  
  // Search existing jobs
  const matchingJobs = jobs.filter(job => 
    job.job_number.toLowerCase().includes(query.toLowerCase()) ||
    normalizeCode(job.job_number).includes(normalizeCode(query))
  );
  
  if (matchingJobs.length > 0) {
    displayJobSearchResults(matchingJobs);
  } else {
    jobSearchResults.innerHTML = '<div class="search-result-item new-job">Create new job: ' + query + '</div>';
    jobSearchResults.classList.add('active');
    
    // Handle click on new job
    jobSearchResults.querySelector('.new-job').addEventListener('click', () => {
      currentJob = null;
      jobInfo.innerHTML = '<span style="color: var(--success)">✓ Will create new job</span>';
      jobSearchResults.classList.remove('active');
    });
  }
}

/**
 * Handle job search keydown
 */
function handleJobSearchKeydown(e) {
  if (e.key === 'Enter') {
    const firstResult = jobSearchResults.querySelector('.search-result-item');
    if (firstResult) {
      firstResult.click();
    }
  } else if (e.key === 'Escape') {
    jobSearchResults.classList.remove('active');
  }
}

/**
 * Display job search results
 */
function displayJobSearchResults(jobs) {
  const html = jobs.map(job => `
    <div class="search-result-item" data-job-id="${job.id}">
      <div class="result-main">${job.job_number}</div>
      <div class="result-sub">${job.part_count || 0} parts, ${job.location_count || 0} locations</div>
    </div>
  `).join('');
  
  jobSearchResults.innerHTML = html;
  jobSearchResults.classList.add('active');
  
  // Add click handlers
  jobSearchResults.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const jobId = item.dataset.jobId;
      const job = jobs.find(j => j.id === jobId);
      selectJob(job);
    });
  });
}

/**
 * Select a job
 */
function selectJob(job) {
  currentJob = job;
  jobNumberInput.value = job.job_number;
  jobSearchResults.classList.remove('active');
  jobInfo.innerHTML = `<span style="color: var(--info)">ℹ Existing job with ${job.part_count || 0} parts</span>`;
}

/**
 * Start import
 */
async function startImport() {
  if (selectedFiles.length === 0) {
    showStatus('Please select files to import', 'error');
    return;
  }
  
  const jobNumber = jobNumberInput.value.trim();
  if (!jobNumber) {
    showStatus('Please enter a job number', 'error');
    return;
  }
  
  // Parse all files
  parsedData = [];
  for (const file of selectedFiles) {
    try {
      const result = await parseCSV(file);
      parsedData.push({
        file: file.name,
        data: result.data,
        fields: result.meta.fields
      });
    } catch (error) {
      console.error('Error parsing file:', file.name, error);
      showStatus(`Error parsing ${file.name}`, 'error');
      return;
    }
  }
  
  // Open column mapper
  openColumnMapper();
}

/**
 * Open column mapper
 */
function openColumnMapper() {
  if (parsedData.length === 0) return;
  
  // Get fields from first file
  const fields = parsedData[0].fields || [];
  
  // Populate select options
  const options = ['<option value="">Select column...</option>'];
  fields.forEach(field => {
    options.push(`<option value="${field}">${field}</option>`);
  });
  
  mapPartNumber.innerHTML = options.join('');
  mapLocation.innerHTML = options.join('');
  
  const optionalOptions = ['<option value="">None</option>', ...options.slice(1)];
  mapAdditionalLocation.innerHTML = optionalOptions.join('');
  mapDescription.innerHTML = optionalOptions.join('');
  
  const qtyOptions = ['<option value="">Default to 1</option>', ...options.slice(1)];
  mapQuantity.innerHTML = qtyOptions.join('');
  
  // Auto-detect common column names
  autoDetectColumns(fields);
  
  // Show preview
  updatePreview();
  
  // Show modal
  columnMapperModal.classList.add('active');
}

/**
 * Auto-detect column mappings
 */
function autoDetectColumns(fields) {
  const lowerFields = fields.map(f => f.toLowerCase());
  
  // Part number
  const partPatterns = ['part', 'part number', 'part_number', 'partno', 'pn', 'item'];
  for (const pattern of partPatterns) {
    const index = lowerFields.findIndex(f => f.includes(pattern));
    if (index >= 0) {
      mapPartNumber.value = fields[index];
      break;
    }
  }
  
  // Location
  const locPatterns = ['location', 'loc', 'room', 'cabinet', 'bin'];
  for (const pattern of locPatterns) {
    const index = lowerFields.findIndex(f => f.includes(pattern));
    if (index >= 0) {
      mapLocation.value = fields[index];
      break;
    }
  }
  
  // Quantity
  const qtyPatterns = ['quantity', 'qty', 'count', 'amount'];
  for (const pattern of qtyPatterns) {
    const index = lowerFields.findIndex(f => f.includes(pattern));
    if (index >= 0) {
      mapQuantity.value = fields[index];
      break;
    }
  }
  
  // Description
  const descPatterns = ['description', 'desc', 'name'];
  for (const pattern of descPatterns) {
    const index = lowerFields.findIndex(f => f.includes(pattern));
    if (index >= 0) {
      mapDescription.value = fields[index];
      break;
    }
  }
}

/**
 * Update preview
 */
function updatePreview() {
  if (parsedData.length === 0) return;
  
  // Add change listeners to update preview
  [mapPartNumber, mapLocation, mapAdditionalLocation, mapQuantity, mapDescription].forEach(select => {
    select.removeEventListener('change', updatePreview);
    select.addEventListener('change', updatePreview);
  });
  
  const data = parsedData[0].data.slice(0, 5);
  
  const headers = ['Part Number', 'Location', 'Quantity', 'Description'];
  const headerRow = headers.map(h => `<th>${h}</th>`).join('');
  
  const rows = data.map(row => {
    const partNumber = mapPartNumber.value ? row[mapPartNumber.value] || '' : '';
    const location = mapLocation.value ? row[mapLocation.value] || '' : '';
    const additionalLoc = mapAdditionalLocation.value ? row[mapAdditionalLocation.value] || '' : '';
    const fullLocation = additionalLoc ? `${location} / ${additionalLoc}` : location;
    const quantity = mapQuantity.value ? row[mapQuantity.value] || 1 : 1;
    const description = mapDescription.value ? row[mapDescription.value] || '' : '';
    
    return `
      <tr>
        <td>${partNumber}</td>
        <td>${fullLocation}</td>
        <td>${quantity}</td>
        <td>${description}</td>
      </tr>
    `;
  }).join('');
  
  previewTable.innerHTML = `
    <table>
      <thead><tr>${headerRow}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * Close column mapper
 */
function closeColumnMapper() {
  columnMapperModal.classList.remove('active');
}

/**
 * Confirm mapping and import
 */
async function confirmMapping() {
  // Validate required fields
  if (!mapPartNumber.value || !mapLocation.value) {
    showStatus('Part Number and Location are required', 'error');
    return;
  }
  
  // Store mapping
  columnMapping = {
    partNumber: mapPartNumber.value,
    location: mapLocation.value,
    additionalLocation: mapAdditionalLocation.value,
    quantity: mapQuantity.value,
    description: mapDescription.value
  };
  
  // Close modal
  closeColumnMapper();
  
  // Execute import
  await executeImport();
}

/**
 * Execute import
 */
async function executeImport() {
  try {
    // Show progress
    progressSection.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = 'Preparing import...';
    progressDetails.innerHTML = '';
    
    // Get import settings
    const strategy = document.querySelector('input[name="strategy"]:checked').value;
    const replaceQtyOnMerge = document.getElementById('replaceQtyOnMerge').checked;
    const jobNumber = jobNumberInput.value.trim();
    
    // Create or get job
    progressText.textContent = 'Creating/finding job...';
    const job = await JobsAPI.upsert(jobNumber, selectedFiles[0].name);
    
    // Upload files to storage
    progressText.textContent = 'Uploading files...';
    const storagePaths = [];
    
    for (const file of selectedFiles) {
      const path = createStoragePath(job.job_number, file.name);
      await StorageAPI.upload(path, file);
      storagePaths.push(path);
    }
    
    // Process all files
    let allItems = [];
    for (const parsed of parsedData) {
      const items = parsed.data.map(row => {
        const location = columnMapping.location ? row[columnMapping.location] || '' : '';
        const additionalLoc = columnMapping.additionalLocation ? row[columnMapping.additionalLocation] || '' : '';
        const fullLocation = additionalLoc ? `${location} / ${additionalLoc}` : location;
        
        return {
          partNumber: row[columnMapping.partNumber] || '',
          location: fullLocation,
          quantity: columnMapping.quantity ? parseInt(row[columnMapping.quantity]) || 1 : 1,
          description: columnMapping.description ? row[columnMapping.description] || '' : ''
        };
      }).filter(item => item.partNumber && item.location);
      
      allItems = allItems.concat(items);
    }
    
    // Create import record
    const importRecord = await ImportsAPI.create(job.id, strategy, storagePaths[0]);
    
    // Execute import with progress callback
    const results = await ImportsAPI.executeImport({
      jobId: job.id,
      strategy,
      items: allItems,
      replaceQtyOnMerge,
      progressCallback: (message) => {
        progressText.textContent = message;
        const match = message.match(/(\d+)%/);
        if (match) {
          progressFill.style.width = match[1] + '%';
        }
      }
    });
    
    // Show results
    progressFill.style.width = '100%';
    progressText.textContent = 'Import complete!';
    progressDetails.innerHTML = `
      <div>✓ Parts created: ${results.partsCreated}</div>
      <div>✓ Parts updated: ${results.partsUpdated}</div>
      <div>✓ Locations created: ${results.locationsCreated}</div>
      <div>✓ Locations updated: ${results.locationsUpdated}</div>
      ${results.deleted > 0 ? `<div>✓ Deleted: ${results.deleted}</div>` : ''}
      ${results.errors.length > 0 ? `<div style="color: var(--danger)">✗ Errors: ${results.errors.length}</div>` : ''}
    `;
    
    // Clear form
    setTimeout(() => {
      progressSection.style.display = 'none';
      selectedFiles = [];
      displayFileList();
      importOptions.style.display = 'none';
      jobNumberInput.value = '';
      loadJobs();
    }, 3000);
    
    showStatus('Import completed successfully', 'success');
    
  } catch (error) {
    console.error('Import error:', error);
    progressText.textContent = 'Import failed!';
    progressDetails.innerHTML = `<div style="color: var(--danger)">Error: ${error.message}</div>`;
    showStatus('Import failed', 'error');
  }
}

/**
 * Load jobs
 */
async function loadJobs() {
  try {
    jobsGrid.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Loading jobs...</p>
      </div>
    `;
    
    jobs = await JobsAPI.list();
    
    // Get stats for each job
    for (const job of jobs) {
      const stats = await JobsAPI.getWithStats(job.id);
      job.part_count = stats.part_count;
      job.location_count = stats.location_count;
    }
    
    displayJobs();
  } catch (error) {
    console.error('Error loading jobs:', error);
    showStatus('Error loading jobs', 'error');
  }
}

/**
 * Display jobs
 */
function displayJobs() {
  if (jobs.length === 0) {
    jobsGrid.innerHTML = `
      <div class="empty-state">
        <p>No jobs found. Import a BOM to get started.</p>
      </div>
    `;
    return;
  }
  
  const cards = jobs.map(job => `
    <div class="job-card">
      <div class="job-header">
        <div class="job-number">${job.job_number}</div>
        <div class="job-date">${formatDate(job.created_at)}</div>
      </div>
      
      <div class="job-stats">
        <div class="job-stat">
          <span class="job-stat-value">${job.part_count || 0}</span>
          <span class="job-stat-label">Parts</span>
        </div>
        <div class="job-stat">
          <span class="job-stat-value">${job.location_count || 0}</span>
          <span class="job-stat-label">Locations</span>
        </div>
      </div>
      
      <div class="job-actions">
        <a href="index.html?job=${job.id}" class="btn btn-primary btn-sm">Open</a>
        <button class="btn btn-secondary btn-sm" onclick="openFileManager('${job.id}')">Files</button>
      </div>
    </div>
  `).join('');
  
  jobsGrid.innerHTML = cards;
}

/**
 * Open file manager
 */
window.openFileManager = async function(jobId) {
  const job = jobs.find(j => j.id === jobId);
  if (!job) return;
  
  fileManagerModal.classList.add('active');
  fileManagerModal.dataset.jobId = jobId;
  fileManagerModal.dataset.jobNumber = job.job_number;
  
  // Load files
  await loadJobFiles(job);
};

/**
 * Load job files
 */
async function loadJobFiles(job) {
  try {
    fileManagerGrid.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Loading files...</p>
      </div>
    `;
    
    const jobNorm = normalizeCode(job.job_number);
    const files = await StorageAPI.list(jobNorm);
    
    if (files.length === 0) {
      fileManagerGrid.innerHTML = '<div class="empty-state">No files found</div>';
      return;
    }
    
    const items = files.map(file => `
      <div class="file-manager-item">
        <input type="checkbox" class="file-checkbox" data-path="${jobNorm}/${file.name}">
        <div class="file-manager-details">
          <div class="file-manager-name">${file.name}</div>
          <div class="file-manager-meta">
            ${formatFileSize(file.metadata?.size || 0)} • ${formatDate(file.created_at)}
          </div>
        </div>
      </div>
    `).join('');
    
    fileManagerGrid.innerHTML = items;
    
    // Enable/disable delete button based on selection
    fileManagerGrid.querySelectorAll('.file-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', updateDeleteButton);
    });
    
  } catch (error) {
    console.error('Error loading files:', error);
    fileManagerGrid.innerHTML = '<div class="empty-state">Error loading files</div>';
  }
}

/**
 * Update delete button state
 */
function updateDeleteButton() {
  const checked = fileManagerGrid.querySelectorAll('.file-checkbox:checked');
  deleteSelectedFilesBtn.disabled = checked.length === 0;
}

/**
 * Close file manager
 */
function closeFileManager() {
  fileManagerModal.classList.remove('active');
}

/**
 * Delete selected files
 */
async function deleteSelectedFiles() {
  const checked = fileManagerGrid.querySelectorAll('.file-checkbox:checked');
  if (checked.length === 0) return;
  
  if (!confirm(`Delete ${checked.length} selected file(s)?`)) return;
  
  try {
    for (const checkbox of checked) {
      await StorageAPI.delete(checkbox.dataset.path);
    }
    
    showStatus('Files deleted', 'success');
    
    // Reload files
    const jobId = fileManagerModal.dataset.jobId;
    const job = jobs.find(j => j.id === jobId);
    await loadJobFiles(job);
    
  } catch (error) {
    console.error('Error deleting files:', error);
    showStatus('Error deleting files', 'error');
  }
}

/**
 * Delete all files
 */
async function deleteAllFiles() {
  const jobNumber = fileManagerModal.dataset.jobNumber;
  
  if (!confirm(`Delete all files for job ${jobNumber}?`)) return;
  
  try {
    const jobNorm = normalizeCode(jobNumber);
    await StorageAPI.deleteAll(jobNorm);
    
    showStatus('All files deleted', 'success');
    closeFileManager();
    
  } catch (error) {
    console.error('Error deleting files:', error);
    showStatus('Error deleting files', 'error');
  }
}

/**
 * Delete job
 */
async function deleteJob() {
  const jobId = fileManagerModal.dataset.jobId;
  const jobNumber = fileManagerModal.dataset.jobNumber;
  
  if (!confirm(`Delete entire job ${jobNumber}? This will delete all parts, locations, and files.`)) return;
  
  try {
    // Delete storage files first
    const jobNorm = normalizeCode(jobNumber);
    await StorageAPI.deleteAll(jobNorm);
    
    // Delete job (cascades to parts, locations, imports)
    await JobsAPI.delete(jobId);
    
    showStatus('Job deleted', 'success');
    closeFileManager();
    await loadJobs();
    
  } catch (error) {
    console.error('Error deleting job:', error);
    showStatus('Error deleting job', 'error');
  }
}