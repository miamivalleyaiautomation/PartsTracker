// js/config.js
// Configuration module for Parts Assistant

// Supabase configuration
// These will be injected at build time via Netlify environment variables
export const SUPABASE_URL = window.SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

// Application settings
export const APP_CONFIG = {
  // Batch sizes for database operations
  BATCH_SIZE: 500,
  
  // Search debounce delay (ms)
  SEARCH_DEBOUNCE: 300,
  
  // Status message display duration (ms)
  STATUS_DURATION: 3000,
  
  // Scanner settings
  SCANNER: {
    preferredCamera: 'environment', // 'environment' or 'user'
    beepOnSuccess: true,
    vibrateOnSuccess: true,
    vibrateDuration: 200,
    autoCloseScannerDelay: 1000,
  },
  
  // Default import settings
  IMPORT: {
    defaultStrategy: 'merge',
    replaceQtyOnMerge: false,
  },
  
  // Storage bucket
  STORAGE_BUCKET: 'project-files',
  
  // Local storage keys
  STORAGE_KEYS: {
    theme: 'parts-assistant-theme',
    scanMode: 'parts-assistant-scan-mode',
    barcodeSettings: 'parts-assistant-barcode-settings',
    assignmentSettings: 'parts-assistant-assignment-settings',
  },
};

// Default barcode settings
export const DEFAULT_BARCODE_SETTINGS = {
  stripPrefix: '',
  stripSuffix: '',
  uppercaseNormalization: false,
  trimToLastNChars: 0,
  upcEanValidation: false,
  expandUPCE: false,
  ignoreNonDigit: false,
};

// Default assignment settings
export const DEFAULT_ASSIGNMENT_SETTINGS = {
  autoAssignToSingle: true,
  autoAssignToActivePill: false,
};

// Theme configuration
export const THEMES = {
  light: 'light',
  dark: 'dark',
};

// Initialize theme
export function initializeTheme() {
  const savedTheme = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.theme) || THEMES.light;
  document.documentElement.setAttribute('data-theme', savedTheme);
  return savedTheme;
}

// Initialize scan mode
export function initializeScanMode() {
  const savedMode = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.scanMode) === 'true';
  return savedMode;
}

// Get barcode settings
export function getBarcodeSettings() {
  try {
    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.barcodeSettings);
    return saved ? { ...DEFAULT_BARCODE_SETTINGS, ...JSON.parse(saved) } : DEFAULT_BARCODE_SETTINGS;
  } catch (e) {
    console.error('Error loading barcode settings:', e);
    return DEFAULT_BARCODE_SETTINGS;
  }
}

// Save barcode settings
export function saveBarcodeSettings(settings) {
  try {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.barcodeSettings, JSON.stringify(settings));
  } catch (e) {
    console.error('Error saving barcode settings:', e);
  }
}

// Get assignment settings
export function getAssignmentSettings() {
  try {
    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.assignmentSettings);
    return saved ? { ...DEFAULT_ASSIGNMENT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_ASSIGNMENT_SETTINGS;
  } catch (e) {
    console.error('Error loading assignment settings:', e);
    return DEFAULT_ASSIGNMENT_SETTINGS;
  }
}

// Save assignment settings
export function saveAssignmentSettings(settings) {
  try {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.assignmentSettings, JSON.stringify(settings));
  } catch (e) {
    console.error('Error saving assignment settings:', e);
  }
}

// Validate configuration
export function validateConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Supabase configuration missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
    return false;
  }
  return true;
}

// Export all configuration
export default {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  APP_CONFIG,
  DEFAULT_BARCODE_SETTINGS,
  DEFAULT_ASSIGNMENT_SETTINGS,
  THEMES,
  initializeTheme,
  initializeScanMode,
  getBarcodeSettings,
  saveBarcodeSettings,
  getAssignmentSettings,
  saveAssignmentSettings,
  validateConfig,
};