// js/settings.js
// Settings page logic for Parts Assistant

import { 
  initializeTheme,
  APP_CONFIG,
  DEFAULT_BARCODE_SETTINGS,
  DEFAULT_ASSIGNMENT_SETTINGS,
  getBarcodeSettings,
  saveBarcodeSettings,
  getAssignmentSettings,
  saveAssignmentSettings
} from './config.js';
import { 
  processBarcode,
  showStatus,
  initializeCommonUI,
  playBeep,
  vibrate
} from './utils.js';

// DOM Elements - Barcode Settings
const stripPrefixInput = document.getElementById('stripPrefix');
const stripSuffixInput = document.getElementById('stripSuffix');
const trimToLastNInput = document.getElementById('trimToLastN');
const uppercaseCheckbox = document.getElementById('uppercaseNormalization');
const upcEanCheckbox = document.getElementById('upcEanValidation');
const expandUPCECheckbox = document.getElementById('expandUPCE');
const ignoreNonDigitCheckbox = document.getElementById('ignoreNonDigit');

// DOM Elements - Assignment Settings
const autoAssignSingleCheckbox = document.getElementById('autoAssignToSingle');
const autoAssignPillCheckbox = document.getElementById('autoAssignToActivePill');

// DOM Elements - Camera Settings
const preferredCameraSelect = document.getElementById('preferredCamera');
const beepCheckbox = document.getElementById('beepOnSuccess');
const vibrateCheckbox = document.getElementById('vibrateOnSuccess');
const vibrateDurationInput = document.getElementById('vibrateDuration');

// DOM Elements - Test Area
const testBarcodeInput = document.getElementById('testBarcode');
const testButton = document.getElementById('testButton');
const testResult = document.getElementById('testResult');

// DOM Elements - Actions
const saveButton = document.getElementById('saveButton');
const resetButton = document.getElementById('resetButton');

// State
let currentBarcodeSettings = {};
let currentAssignmentSettings = {};
let currentCameraSettings = {};
let availableCameras = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initializeTheme();
  initializeCommonUI();
  
  // Load current settings
  loadSettings();
  
  // Load available cameras
  await loadCameras();
  
  // Set up event listeners
  setupEventListeners();
});

/**
 * Load current settings from localStorage
 */
function loadSettings() {
  // Load barcode settings
  currentBarcodeSettings = getBarcodeSettings();
  stripPrefixInput.value = currentBarcodeSettings.stripPrefix || '';
  stripSuffixInput.value = currentBarcodeSettings.stripSuffix || '';
  trimToLastNInput.value = currentBarcodeSettings.trimToLastNChars || 0;
  uppercaseCheckbox.checked = currentBarcodeSettings.uppercaseNormalization || false;
  upcEanCheckbox.checked = currentBarcodeSettings.upcEanValidation || false;
  expandUPCECheckbox.checked = currentBarcodeSettings.expandUPCE || false;
  ignoreNonDigitCheckbox.checked = currentBarcodeSettings.ignoreNonDigit || false;
  
  // Load assignment settings
  currentAssignmentSettings = getAssignmentSettings();
  autoAssignSingleCheckbox.checked = currentAssignmentSettings.autoAssignToSingle;
  autoAssignPillCheckbox.checked = currentAssignmentSettings.autoAssignToActivePill;
  
  // Load camera settings from APP_CONFIG
  currentCameraSettings = {
    preferredCamera: localStorage.getItem('preferred-camera') || '',
    beepOnSuccess: APP_CONFIG.SCANNER.beepOnSuccess,
    vibrateOnSuccess: APP_CONFIG.SCANNER.vibrateOnSuccess,
    vibrateDuration: APP_CONFIG.SCANNER.vibrateDuration
  };
  
  beepCheckbox.checked = currentCameraSettings.beepOnSuccess;
  vibrateCheckbox.checked = currentCameraSettings.vibrateOnSuccess;
  vibrateDurationInput.value = currentCameraSettings.vibrateDuration;
}

/**
 * Load available cameras
 */
async function loadCameras() {
  try {
    // Request camera permission first
    await navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        // Stop the stream immediately
        stream.getTracks().forEach(track => track.stop());
      });
    
    // Get all video input devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableCameras = devices.filter(device => device.kind === 'videoinput');
    
    // Populate camera select
    const savedCamera = localStorage.getItem('preferred-camera') || '';
    
    preferredCameraSelect.innerHTML = '<option value="">Auto-select</option>';
    
    availableCameras.forEach((camera, index) => {
      const option = document.createElement('option');
      option.value = camera.deviceId;
      option.textContent = camera.label || `Camera ${index + 1}`;
      
      if (camera.deviceId === savedCamera) {
        option.selected = true;
      }
      
      preferredCameraSelect.appendChild(option);
    });
    
  } catch (error) {
    console.error('Error loading cameras:', error);
    preferredCameraSelect.innerHTML = '<option value="">No cameras available</option>';
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Test button
  testButton.addEventListener('click', testBarcodeProcessing);
  testBarcodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      testBarcodeProcessing();
    }
  });
  
  // Save button
  saveButton.addEventListener('click', saveSettings);
  
  // Reset button
  resetButton.addEventListener('click', resetSettings);
  
  // Real-time test on input change
  const inputs = [
    stripPrefixInput,
    stripSuffixInput,
    trimToLastNInput,
    uppercaseCheckbox,
    upcEanCheckbox,
    expandUPCECheckbox,
    ignoreNonDigitCheckbox
  ];
  
  inputs.forEach(input => {
    input.addEventListener('change', () => {
      if (testBarcodeInput.value) {
        testBarcodeProcessing();
      }
    });
  });
  
  // UPC/EAN dependency
  upcEanCheckbox.addEventListener('change', () => {
    expandUPCECheckbox.disabled = !upcEanCheckbox.checked;
    ignoreNonDigitCheckbox.disabled = !upcEanCheckbox.checked;
    
    if (!upcEanCheckbox.checked) {
      expandUPCECheckbox.checked = false;
      ignoreNonDigitCheckbox.checked = false;
    }
  });
  
  // Test feedback sounds
  beepCheckbox.addEventListener('change', () => {
    if (beepCheckbox.checked) {
      playBeep();
    }
  });
  
  vibrateCheckbox.addEventListener('change', () => {
    if (vibrateCheckbox.checked) {
      const duration = parseInt(vibrateDurationInput.value) || 200;
      vibrate(duration);
    }
  });
  
  vibrateDurationInput.addEventListener('change', () => {
    if (vibrateCheckbox.checked) {
      const duration = parseInt(vibrateDurationInput.value) || 200;
      vibrate(duration);
    }
  });
}

/**
 * Test barcode processing with current settings
 */
function testBarcodeProcessing() {
  const input = testBarcodeInput.value.trim();
  
  if (!input) {
    testResult.innerHTML = '<span style="color: var(--text-tertiary);">Enter a barcode to test</span>';
    testResult.classList.remove('success');
    return;
  }
  
  // Get current form settings (not saved yet)
  const testSettings = {
    stripPrefix: stripPrefixInput.value,
    stripSuffix: stripSuffixInput.value,
    trimToLastNChars: parseInt(trimToLastNInput.value) || 0,
    uppercaseNormalization: uppercaseCheckbox.checked,
    upcEanValidation: upcEanCheckbox.checked,
    expandUPCE: expandUPCECheckbox.checked,
    ignoreNonDigit: ignoreNonDigitCheckbox.checked
  };
  
  // Temporarily save settings for processing
  const originalSettings = getBarcodeSettings();
  saveBarcodeSettings(testSettings);
  
  // Process barcode
  const processed = processBarcode(input);
  
  // Restore original settings
  saveBarcodeSettings(originalSettings);
  
  // Show result
  testResult.innerHTML = `
    <div>
      <strong>Input:</strong> ${input}<br>
      <strong>Output:</strong> <span style="font-size: 1.125rem; font-weight: 600;">${processed}</span>
    </div>
  `;
  testResult.classList.add('success');
  
  // Test feedback if enabled
  if (beepCheckbox.checked) {
    playBeep();
  }
  if (vibrateCheckbox.checked) {
    const duration = parseInt(vibrateDurationInput.value) || 200;
    vibrate(duration);
  }
}

/**
 * Save all settings
 */
function saveSettings() {
  try {
    // Collect barcode settings
    const barcodeSettings = {
      stripPrefix: stripPrefixInput.value,
      stripSuffix: stripSuffixInput.value,
      trimToLastNChars: parseInt(trimToLastNInput.value) || 0,
      uppercaseNormalization: uppercaseCheckbox.checked,
      upcEanValidation: upcEanCheckbox.checked,
      expandUPCE: expandUPCECheckbox.checked,
      ignoreNonDigit: ignoreNonDigitCheckbox.checked
    };
    
    // Collect assignment settings
    const assignmentSettings = {
      autoAssignToSingle: autoAssignSingleCheckbox.checked,
      autoAssignToActivePill: autoAssignPillCheckbox.checked
    };
    
    // Save barcode settings
    saveBarcodeSettings(barcodeSettings);
    
    // Save assignment settings
    saveAssignmentSettings(assignmentSettings);
    
    // Save camera settings
    localStorage.setItem('preferred-camera', preferredCameraSelect.value);
    
    // Update APP_CONFIG for camera settings (temporary for this session)
    APP_CONFIG.SCANNER.beepOnSuccess = beepCheckbox.checked;
    APP_CONFIG.SCANNER.vibrateOnSuccess = vibrateCheckbox.checked;
    APP_CONFIG.SCANNER.vibrateDuration = parseInt(vibrateDurationInput.value) || 200;
    
    // Save camera settings to localStorage
    localStorage.setItem('scanner-beep', beepCheckbox.checked);
    localStorage.setItem('scanner-vibrate', vibrateCheckbox.checked);
    localStorage.setItem('scanner-vibrate-duration', vibrateDurationInput.value);
    
    showStatus('Settings saved successfully', 'success');
    
    // Update current settings
    currentBarcodeSettings = barcodeSettings;
    currentAssignmentSettings = assignmentSettings;
    
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Error saving settings', 'error');
  }
}

/**
 * Reset settings to defaults
 */
function resetSettings() {
  if (!confirm('Reset all settings to defaults? This cannot be undone.')) {
    return;
  }
  
  try {
    // Reset barcode settings
    saveBarcodeSettings(DEFAULT_BARCODE_SETTINGS);
    stripPrefixInput.value = DEFAULT_BARCODE_SETTINGS.stripPrefix || '';
    stripSuffixInput.value = DEFAULT_BARCODE_SETTINGS.stripSuffix || '';
    trimToLastNInput.value = DEFAULT_BARCODE_SETTINGS.trimToLastNChars || 0;
    uppercaseCheckbox.checked = DEFAULT_BARCODE_SETTINGS.uppercaseNormalization || false;
    upcEanCheckbox.checked = DEFAULT_BARCODE_SETTINGS.upcEanValidation || false;
    expandUPCECheckbox.checked = DEFAULT_BARCODE_SETTINGS.expandUPCE || false;
    ignoreNonDigitCheckbox.checked = DEFAULT_BARCODE_SETTINGS.ignoreNonDigit || false;
    
    // Reset assignment settings
    saveAssignmentSettings(DEFAULT_ASSIGNMENT_SETTINGS);
    autoAssignSingleCheckbox.checked = DEFAULT_ASSIGNMENT_SETTINGS.autoAssignToSingle;
    autoAssignPillCheckbox.checked = DEFAULT_ASSIGNMENT_SETTINGS.autoAssignToActivePill;
    
    // Reset camera settings
    localStorage.removeItem('preferred-camera');
    localStorage.removeItem('scanner-beep');
    localStorage.removeItem('scanner-vibrate');
    localStorage.removeItem('scanner-vibrate-duration');
    
    preferredCameraSelect.value = '';
    beepCheckbox.checked = true;
    vibrateCheckbox.checked = true;
    vibrateDurationInput.value = 200;
    
    // Clear test area
    testBarcodeInput.value = '';
    testResult.innerHTML = '<span style="color: var(--text-tertiary);">Result will appear here</span>';
    testResult.classList.remove('success');
    
    showStatus('Settings reset to defaults', 'success');
    
    // Reload settings
    loadSettings();
    
  } catch (error) {
    console.error('Error resetting settings:', error);
    showStatus('Error resetting settings', 'error');
  }
}

// Initialize camera settings from localStorage on load
document.addEventListener('DOMContentLoaded', () => {
  // Load saved camera settings
  const savedBeep = localStorage.getItem('scanner-beep');
  const savedVibrate = localStorage.getItem('scanner-vibrate');
  const savedVibrateDuration = localStorage.getItem('scanner-vibrate-duration');
  
  if (savedBeep !== null) {
    APP_CONFIG.SCANNER.beepOnSuccess = savedBeep === 'true';
  }
  if (savedVibrate !== null) {
    APP_CONFIG.SCANNER.vibrateOnSuccess = savedVibrate === 'true';
  }
  if (savedVibrateDuration !== null) {
    APP_CONFIG.SCANNER.vibrateDuration = parseInt(savedVibrateDuration) || 200;
  }
});