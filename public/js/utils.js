// js/utils.js
// Utility functions for Parts Assistant

import { getBarcodeSettings } from './config.js';

/**
 * Normalize code by removing non-alphanumeric characters and converting to lowercase
 * This matches the SQL normalize_code function
 * @param {string} code - Code to normalize
 * @returns {string} Normalized code
 */
export function normalizeCode(code) {
  if (!code) return '';
  return code.toLowerCase().replace(/[^0-9a-z]/gi, '');
}

/**
 * Apply barcode settings to normalize a scanned code
 * @param {string} code - Raw barcode value
 * @returns {string} Processed barcode
 */
export function processBarcode(code) {
  if (!code) return '';
  
  const settings = getBarcodeSettings();
  let processed = code;
  
  // Strip prefix/suffix
  if (settings.stripPrefix) {
    processed = processed.replace(new RegExp(`^${settings.stripPrefix}`), '');
  }
  if (settings.stripSuffix) {
    processed = processed.replace(new RegExp(`${settings.stripSuffix}$`), '');
  }
  
  // Trim to last N characters
  if (settings.trimToLastNChars > 0) {
    processed = processed.slice(-settings.trimToLastNChars);
  }
  
  // Handle UPC/EAN
  if (settings.upcEanValidation) {
    processed = processUPCEAN(processed, settings);
  }
  
  // Apply case normalization
  if (settings.uppercaseNormalization) {
    processed = processed.toUpperCase();
  }
  
  return processed;
}

/**
 * Process UPC/EAN barcodes
 * @param {string} code - Barcode value
 * @param {object} settings - Barcode settings
 * @returns {string} Processed UPC/EAN
 */
function processUPCEAN(code, settings) {
  // Remove non-digits if setting enabled
  if (settings.ignoreNonDigit) {
    code = code.replace(/\D/g, '');
  }
  
  // Expand UPCE to UPCA if needed
  if (settings.expandUPCE && code.length === 8) {
    code = expandUPCE(code);
  }
  
  // Validate checksum if it's a valid UPC/EAN length
  if ([8, 12, 13].includes(code.length) && /^\d+$/.test(code)) {
    if (!validateUPCEANChecksum(code)) {
      console.warn('Invalid UPC/EAN checksum:', code);
    }
  }
  
  return code;
}

/**
 * Expand UPCE to UPCA
 * @param {string} upce - 8-digit UPCE code
 * @returns {string} 12-digit UPCA code
 */
function expandUPCE(upce) {
  if (upce.length !== 8 || !/^\d+$/.test(upce)) return upce;
  
  const manufacturer = upce.substring(1, 4);
  const product = upce.substring(4, 6);
  const lastDigit = upce[6];
  
  let expanded;
  switch (lastDigit) {
    case '0':
    case '1':
    case '2':
      expanded = `0${manufacturer}${lastDigit}0000${product}`;
      break;
    case '3':
      expanded = `0${manufacturer}00000${product}`;
      break;
    case '4':
      expanded = `0${manufacturer}0000${product}0`;
      break;
    default:
      expanded = `0${manufacturer.substring(0, 2)}${lastDigit}0000${manufacturer[2]}${product}`;
  }
  
  return expanded + upce[7]; // Add check digit
}

/**
 * Validate UPC/EAN checksum
 * @param {string} code - UPC/EAN code
 * @returns {boolean} True if valid
 */
function validateUPCEANChecksum(code) {
  if (!/^\d+$/.test(code)) return false;
  
  const digits = code.split('').map(Number);
  const checkDigit = digits.pop();
  
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  
  const calculatedCheck = (10 - (sum % 10)) % 10;
  return calculatedCheck === checkDigit;
}

/**
 * Debounce function to limit function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format date for display
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date
 */
export function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Show status message
 * @param {string} message - Message to show
 * @param {string} type - Type of message (success, error, info)
 * @param {number} duration - Duration in milliseconds
 */
export function showStatus(message, type = 'info', duration = 3000) {
  const statusBar = document.getElementById('statusBar');
  if (!statusBar) return;
  
  const statusText = statusBar.querySelector('.status-text');
  if (statusText) {
    statusText.textContent = message;
  }
  
  statusBar.className = `status-bar show ${type}`;
  
  setTimeout(() => {
    statusBar.classList.remove('show');
  }, duration);
}

/**
 * Play beep sound
 */
export function playBeep() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = 800;
  oscillator.type = 'sine';
  gainNode.gain.value = 0.1;
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.1);
}

/**
 * Vibrate device
 * @param {number} duration - Vibration duration in milliseconds
 */
export function vibrate(duration = 200) {
  if ('vibrate' in navigator) {
    navigator.vibrate(duration);
  }
}

/**
 * Scroll element into view with highlight
 * @param {HTMLElement} element - Element to scroll to
 */
export function scrollToElement(element) {
  if (!element) return;
  
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
  
  element.classList.add('highlight');
  setTimeout(() => {
    element.classList.remove('highlight');
  }, 1000);
}

/**
 * Parse CSV file using PapaParse
 * @param {File} file - CSV file to parse
 * @returns {Promise} Parsed data
 */
export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      delimitersToGuess: [',', '\t', '|', ';'],
      complete: (results) => {
        // Strip whitespace from headers
        if (results.meta && results.meta.fields) {
          results.meta.fields = results.meta.fields.map(f => f.trim());
          results.data = results.data.map(row => {
            const cleaned = {};
            for (const key in row) {
              cleaned[key.trim()] = row[key];
            }
            return cleaned;
          });
        }
        resolve(results);
      },
      error: reject,
    });
  });
}

/**
 * Chunk array for batch processing
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array} Array of chunks
 */
export function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Generate timestamp string for file naming
 * @returns {string} Timestamp string
 */
export function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

/**
 * Create file path for storage
 * @param {string} jobNumber - Job number
 * @param {string} fileName - Original file name
 * @returns {string} Storage path
 */
export function createStoragePath(jobNumber, fileName) {
  const jobNorm = normalizeCode(jobNumber);
  const timestamp = getTimestamp();
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${jobNorm}/${timestamp}-${safeFileName}`;
}

/**
 * Toggle mobile navigation
 */
export function toggleMobileNav() {
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  
  if (hamburger && mobileNav) {
    hamburger.classList.toggle('active');
    mobileNav.classList.toggle('active');
  }
}

/**
 * Initialize common UI elements
 */
export function initializeCommonUI() {
  // Hamburger menu
  const hamburger = document.getElementById('hamburger');
  if (hamburger) {
    hamburger.addEventListener('click', toggleMobileNav);
  }
  
  // Close mobile nav on outside click
  document.addEventListener('click', (e) => {
    const mobileNav = document.getElementById('mobileNav');
    const hamburger = document.getElementById('hamburger');
    if (mobileNav && hamburger && 
        !mobileNav.contains(e.target) && 
        !hamburger.contains(e.target) &&
        mobileNav.classList.contains('active')) {
      toggleMobileNav();
    }
  });
  
  // Theme toggle
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('parts-assistant-theme', newTheme);
    });
  }
}

// Export all utilities
export default {
  normalizeCode,
  processBarcode,
  debounce,
  formatFileSize,
  formatDate,
  showStatus,
  playBeep,
  vibrate,
  scrollToElement,
  parseCSV,
  chunk,
  getTimestamp,
  createStoragePath,
  toggleMobileNav,
  initializeCommonUI,
};