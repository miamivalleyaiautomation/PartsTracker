// js/scanner.js
// Camera-based barcode scanning using ZXing-cpp WASM

import { APP_CONFIG, getBarcodeSettings } from './config.js';
import { processBarcode, playBeep, vibrate, showStatus } from './utils.js';

// ZXing WASM module
let zxingModule = null;
let zxingReader = null;
let videoStream = null;
let scannerActive = false;
let lastScanTime = 0;
let selectedCameraId = null;

// Scanner configuration
const SCAN_INTERVAL = 100; // ms between scan attempts
const SCAN_COOLDOWN = 1000; // ms before same code can be scanned again
const lastScannedCodes = new Map(); // Track recently scanned codes

/**
 * Initialize ZXing WASM module
 */
async function initZXing() {
  if (zxingModule) return;
  
  try {
    // Load ZXing-cpp WASM
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@undecaf/zxing-wasm@latest/dist/index.js';
    document.head.appendChild(script);
    
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
    });
    
    // Initialize the module
    if (window.ZXingWASM) {
      zxingModule = await window.ZXingWASM();
      
      // Create reader with desired formats
      zxingReader = new zxingModule.BarcodeReader({
        formats: [
          'Code128',
          'Code39',
          'Code93',
          'EAN13',
          'EAN8',
          'UPC-A',
          'UPC-E',
          'QRCode',
          'DataMatrix',
          'PDF417',
          'Aztec',
          'ITF'
        ],
        tryHarder: true,
        tryInvert: true,
        tryDownscale: true,
        maxNumberOfSymbols: 1
      });
      
      console.log('ZXing WASM initialized successfully');
    } else {
      throw new Error('ZXing WASM failed to load');
    }
  } catch (error) {
    console.error('Error initializing ZXing:', error);
    
    // Fallback to ZXing Browser library
    await initZXingBrowserFallback();
  }
}

/**
 * Fallback to ZXing Browser library if WASM fails
 */
async function initZXingBrowserFallback() {
  try {
    // The ZXing Browser library is already included in index.html
    if (!window.ZXing) {
      throw new Error('ZXing Browser library not found');
    }
    
    console.log('Using ZXing Browser fallback');
  } catch (error) {
    console.error('Error initializing ZXing fallback:', error);
  }
}

/**
 * Get available cameras
 */
export async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput');
  } catch (error) {
    console.error('Error getting cameras:', error);
    return [];
  }
}

/**
 * Open camera scanner
 */
export async function openScanner() {
  const modal = document.getElementById('scannerModal');
  const video = document.getElementById('scannerVideo');
  const cameraSelect = document.getElementById('cameraSelect');
  const scannerResult = document.getElementById('scannerResult');
  
  if (!modal || !video) return;
  
  try {
    // Initialize ZXing if needed
    await initZXing();
    
    // Get cameras and populate select
    const cameras = await getCameras();
    
    if (cameras.length === 0) {
      showStatus('No cameras found', 'error');
      return;
    }
    
    // Populate camera select
    cameraSelect.innerHTML = cameras.map((camera, index) => {
      const label = camera.label || `Camera ${index + 1}`;
      return `<option value="${camera.deviceId}">${label}</option>`;
    }).join('');
    
    // Prefer back camera
    const backCamera = cameras.find(camera => 
      camera.label.toLowerCase().includes('back') ||
      camera.label.toLowerCase().includes('rear') ||
      camera.label.toLowerCase().includes('environment')
    );
    
    if (backCamera) {
      cameraSelect.value = backCamera.deviceId;
      selectedCameraId = backCamera.deviceId;
    } else {
      selectedCameraId = cameras[0].deviceId;
    }
    
    // Start camera
    await startCamera(video, selectedCameraId);
    
    // Show modal
    modal.classList.add('active');
    scannerActive = true;
    
    // Start scanning
    if (zxingReader) {
      scanWithZXingWASM(video);
    } else {
      scanWithZXingBrowser(video);
    }
    
    // Handle camera change
    cameraSelect.addEventListener('change', async (e) => {
      selectedCameraId = e.target.value;
      await stopCamera();
      await startCamera(video, selectedCameraId);
    });
    
    // Clear result after delay
    scannerResult.classList.remove('show');
    
  } catch (error) {
    console.error('Error opening scanner:', error);
    showStatus('Error opening camera scanner', 'error');
  }
}

/**
 * Start camera stream
 */
async function startCamera(video, deviceId) {
  try {
    const constraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };
    
    videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = videoStream;
    
    // Wait for video to be ready
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
    });
    
  } catch (error) {
    console.error('Error starting camera:', error);
    throw error;
  }
}

/**
 * Stop camera stream
 */
async function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
}

/**
 * Scan with ZXing-cpp WASM
 */
async function scanWithZXingWASM(video) {
  if (!scannerActive || !zxingReader) return;
  
  try {
    // Create canvas for frame capture
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Get image data
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    // Read barcode
    const result = zxingReader.readBarcode(
      imageData.data,
      canvas.width,
      canvas.height,
      zxingModule.ImageFormat.RGBA
    );
    
    if (result && result.text) {
      handleScanResult(result.text);
    }
    
  } catch (error) {
    // Silently ignore scan errors (common when no barcode in view)
  }
  
  // Continue scanning
  if (scannerActive) {
    setTimeout(() => scanWithZXingWASM(video), SCAN_INTERVAL);
  }
}

/**
 * Scan with ZXing Browser (fallback)
 */
async function scanWithZXingBrowser(video) {
  if (!scannerActive || !window.ZXing) return;
  
  try {
    const codeReader = new ZXing.BrowserMultiFormatReader();
    
    await codeReader.decodeFromVideoDevice(
      selectedCameraId,
      video,
      (result, error) => {
        if (result && result.text) {
          handleScanResult(result.text);
        }
        
        if (error && error.name !== 'NotFoundException') {
          console.error('Scan error:', error);
        }
      }
    );
    
  } catch (error) {
    console.error('Error with ZXing Browser scanner:', error);
  }
}

/**
 * Handle scan result
 */
function handleScanResult(code) {
  const now = Date.now();
  
  // Check if this code was recently scanned
  const lastScan = lastScannedCodes.get(code);
  if (lastScan && now - lastScan < SCAN_COOLDOWN) {
    return; // Ignore duplicate scan
  }
  
  // Update last scan time
  lastScannedCodes.set(code, now);
  
  // Process barcode with settings
  const processed = processBarcode(code);
  
  // Show result in modal
  const scannerResult = document.getElementById('scannerResult');
  if (scannerResult) {
    scannerResult.textContent = `Scanned: ${processed}`;
    scannerResult.className = 'scanner-result show success';
  }
  
  // Play feedback
  const settings = getBarcodeSettings();
  if (APP_CONFIG.SCANNER.beepOnSuccess) {
    playBeep();
  }
  if (APP_CONFIG.SCANNER.vibrateOnSuccess) {
    vibrate(APP_CONFIG.SCANNER.vibrateDuration);
  }
  
  // Send result to part search
  const partSearchInput = document.getElementById('partSearch');
  if (partSearchInput) {
    partSearchInput.value = processed;
    
    // Trigger input event
    const event = new Event('input', { bubbles: true });
    partSearchInput.dispatchEvent(event);
    
    // If in scan mode, trigger enter
    const scanMode = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.scanMode) === 'true';
    if (scanMode) {
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      partSearchInput.dispatchEvent(enterEvent);
    }
  }
  
  // Auto-close scanner after delay
  setTimeout(() => {
    closeScanner();
  }, APP_CONFIG.SCANNER.autoCloseScannerDelay);
  
  // Clean up old scanned codes
  for (const [oldCode, time] of lastScannedCodes.entries()) {
    if (now - time > SCAN_COOLDOWN * 2) {
      lastScannedCodes.delete(oldCode);
    }
  }
}

/**
 * Close scanner
 */
export async function closeScanner() {
  const modal = document.getElementById('scannerModal');
  const video = document.getElementById('scannerVideo');
  
  scannerActive = false;
  
  if (modal) {
    modal.classList.remove('active');
  }
  
  if (video) {
    video.srcObject = null;
  }
  
  await stopCamera();
}

/**
 * Test barcode processing
 */
export function testBarcodeProcessing(code) {
  return processBarcode(code);
}

// Initialize scanner when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Camera scan button
  const scanCameraBtn = document.getElementById('scanCameraBtn');
  if (scanCameraBtn) {
    scanCameraBtn.addEventListener('click', openScanner);
  }
  
  // Close scanner button
  const closeBtn = document.getElementById('closeScanner');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeScanner);
  }
  
  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && scannerActive) {
      closeScanner();
    }
  });
  
  // Initialize ZXing on page load for faster first scan
  initZXing().catch(console.error);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (scannerActive) {
    stopCamera();
  }
  
  if (zxingReader) {
    zxingReader.delete();
    zxingReader = null;
  }
});

// Export functions for use in other modules
export default {
  openScanner,
  closeScanner,
  getCameras,
  testBarcodeProcessing
};