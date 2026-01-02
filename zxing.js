<script>
let zxingReader = new ZXing.BrowserMultiFormatReader();
let cameraStream = null;
let scanHistory = [];
let isCameraActive = false;
let cameraControls = null;
let isStartingCamera = false;
let isProcessingScan = false;
let hardStopScan = false;

let lastScannedCode = null;
let lastScanTime = 0;
const SCAN_COOLDOWN = 3000;

let bulkQRItems = [];
let bulkBarcodeItems = [];

let activeScannerTab = 'camera';
let activeQRTab = 'single-qr';
let activeBarcodeTab = 'single-barcode';
  
const barcodeFormatRules = {
    'EAN13': {
        pattern: /^\d{12}$/,
        example: '5901234123457',
        description: 'Exactly 12 digits (12 data + 1 check digit)',
        minLength: 12,
        maxLength: 12
    },
    'EAN8': {
        pattern: /^\d{7}$/,
        example: '1234567',
        description: 'Exactly 7 digits (7 data + 1 check digit)',
        minLength: 7,
        maxLength: 7
    },
    'UPC': {
        pattern: /^\d{11}$/,
        example: '123456789012',
        description: 'Exactly 11 digits (11 data + 1 check digit)',
        minLength: 11,
        maxLength: 11
    },
    'UPCE': {
        pattern: /^\d{6,8}$/,
        example: '123456',
        description: '6 digits',
        minLength: 6,
        maxLength: 8
    },
    'CODE39': {
        pattern: /^[0-9A-Z\s\-\$\/\+%\.]+$/,
        example: 'A-123',
        description: 'Alphanumeric, space, -.$/+%',
        minLength: 1,
        maxLength: 255
    },
    'CODE39Extended': {
        pattern: /^[\x00-\x7F]+$/,
        example: 'ABC123',
        description: 'Full ASCII characters',
        minLength: 1,
        maxLength: 255
    },
    'CODE128': {
        pattern: /^[\x00-\x7F]+$/,
        example: 'ABC123',
        description: 'Full ASCII characters',
        minLength: 1,
        maxLength: 255
    },
    'ITF14': {
        pattern: /^\d{13}$/,
        example: '12345678901231',
        description: 'Exactly 13 digits',
        minLength: 13,
        maxLength: 13
    },
    'ITF': {
        pattern: /^\d+$/,
        example: '1234',
        description: 'Digits only, even length',
        minLength: 2,
        maxLength: 255
    },
    'MSI': {
        pattern: /^\d+$/,
        example: '123456',
        description: 'Digits only',
        minLength: 1,
        maxLength: 255
    },
    'Pharmacode': {
        pattern: /^\d+$/,
        example: '123456',
        description: 'Numbers 3-131070',
        minLength: 1,
        maxLength: 6
    },
    'Codabar': {
        pattern: /^[ABCD][0-9\-\$\:\.\/\+]+[ABCD]$/,
        example: 'A1234B',
        description: 'Digits and -:$/.+',
        minLength: 1,
        maxLength: 255
    }
};

function getFormatName(format) {
    const formatNames = {
        'EAN13': 'EAN-13',
        'EAN8': 'EAN-8',
        'UPC': 'UPC-A',
        'UPCE': 'UPC-E',
        'CODE39': 'CODE39',
        'CODE39Extended': 'CODE39 Extended',
        'CODE128': 'CODE128',
        'ITF14': 'ITF-14',
        'ITF': 'ITF',
        'MSI': 'MSI',
        'Pharmacode': 'Pharmacode',
        'Codabar': 'Codabar'
    };
    return formatNames[normalizeFormat(format)] || format;
}
function getScanTypeAndIcon(format) {
    const isQR = format === ZXing.BarcodeFormat.QR_CODE;
    return {
        format: isQR ? 'QR Code' : 'Barcode',
        type: isQR ? 'QR Code' : 'Barcode',
        icon: isQR ? 'fa-qrcode' : 'fa-barcode'
    };
}


function focusToElement(elementId, highlight = true) {
    const element = document.getElementById(elementId);
    if (element) {
        element.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
        
        if (highlight) {
            element.classList.add('focus-highlight');
            setTimeout(() => {
                element.classList.remove('focus-highlight');
            }, 2000);
        }
        
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
            element.focus();
        }
    }
}

function scrollToGeneratedCode(type) {
    switch(type) {
        case 'single-qr':
            focusToElement('qr-preview-container');
            break;
        case 'bulk-qr':
            focusToElement('bulk-qr-container');
            break;
        case 'single-barcode':
            focusToElement('barcode-preview-container');
            break;
        case 'bulk-barcode':
            focusToElement('bulk-barcode-container');
            break;
    }
}

function scrollToScanResults(tab) {
    switch(tab) {
        case 'camera':
            focusToElement('camera-results');
            break;
        case 'upload':
            focusToElement('upload-results-container');
            break;
        case 'url':
            focusToElement('url-results-container');
            break;
    }
}

document.addEventListener('DOMContentLoaded', initScanner);

function initScanner() {
    setupEventListeners();
    setupTabs();
    initFileUpload();
    initQRTypeButtons();
    initValidation();
    hideInitialContainers();
    
    document.getElementById('qr-preview').innerHTML = '<p class="empty">Generate a QR code to see preview</p>';
    document.getElementById('barcode-preview').innerHTML = '<p class="empty">Generate a barcode to see preview</p>';
}

function hideInitialContainers() {
    document.querySelectorAll('.scan-results').forEach(el => {
        el.classList.remove('has-results');
    });
    
    document.querySelectorAll('.preview-container, .bulk-results-container').forEach(el => {
        el.classList.remove('has-content');
    });
    
    const selectedFiles = document.getElementById('selected-files');
    if (selectedFiles && selectedFiles.querySelector('.empty')) {
        selectedFiles.style.display = 'none';
    }
}

function setupEventListeners() {
    const cameraPreview = document.getElementById('camera-preview');
    if (cameraPreview) {
        cameraPreview.addEventListener('click', startCameraScanner);
    }
    
    document.getElementById('scan-files').addEventListener('click', scanFiles);
    document.getElementById('clear-files').addEventListener('click', clearFiles);
    document.getElementById('scan-url').addEventListener('click', scanURL);
    
  document.getElementById('url-input').addEventListener('blur', () => {
    document.getElementById('icon-url').style.color = 'yellow';
});
  
    document.getElementById('url-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') scanURL();
    });
    
    document.getElementById('url-input').addEventListener('input', function() {
        hideError('url-error');
      document.getElementById('icon-url').style.color = 'black';
        markInputError('url-input', false);
    });
    
    document.getElementById('generate-qr').addEventListener('click', generateQR);
    document.getElementById('copy-qr').addEventListener('click', () => copyCode('qr'));
    document.getElementById('download-qr').addEventListener('click', () => downloadCode('qr'));
    document.getElementById('generate-barcode').addEventListener('click', generateBarcode);
    document.getElementById('copy-barcode').addEventListener('click', () => copyCode('barcode'));
    document.getElementById('download-barcode').addEventListener('click', () => downloadCode('barcode'));
    document.getElementById('generate-bulk-qr').addEventListener('click', generateBulkQR);
    document.getElementById('clear-bulk-qr').addEventListener('click', clearBulkQR);
    document.getElementById('generate-bulk-barcode').addEventListener('click', generateBulkBarcode);
    document.getElementById('clear-bulk-barcode').addEventListener('click', clearBulkBarcode);
    document.getElementById('download-all-qr').addEventListener('click', downloadAllQR);
    document.getElementById('export-qr-excel').addEventListener('click', exportQRToExcel);
    document.getElementById('download-all-barcode').addEventListener('click', downloadAllBarcode);
    document.getElementById('export-barcode-excel').addEventListener('click', exportBarcodeToExcel);
    
    document.getElementById('qr-size').addEventListener('input', function() {
        document.getElementById('qr-size-value').textContent = this.value + 'px';
    });
    
    document.getElementById('qr-margin').addEventListener('input', function() {
        document.getElementById('qr-margin-value').textContent = this.value;
    });
    
    document.getElementById('barcode-size').addEventListener('input', function() {
        document.getElementById('barcode-size-value').textContent = this.value + 'x';
    });
    
    document.getElementById('barcode-font-size').addEventListener('input', function() {
        document.getElementById('barcode-font-size-value').textContent = this.value + 'px';
    });
    
    document.getElementById('barcode-width').addEventListener('input', function() {
        document.getElementById('barcode-width-value').textContent = this.value;
    });
    
    document.getElementById('barcode-height').addEventListener('input', function() {
        document.getElementById('barcode-height-value').textContent = this.value + 'px';
    });
    
    document.getElementById('bulk-qr-size').addEventListener('input', function() {
        document.getElementById('bulk-qr-size-value').textContent = this.value + 'px';
    });
    
    document.getElementById('bulk-barcode-size').addEventListener('input', function() {
        document.getElementById('bulk-barcode-size-value').textContent = this.value + 'x';
    });
    
    document.getElementById('bulk-barcode-height').addEventListener('input', function() {
        document.getElementById('bulk-barcode-height-value').textContent = this.value + 'px';
    });
    
    document.getElementById('qr-content').addEventListener('input', function() {
        hideError('qr-content-error');
        markInputError('qr-content', false);
    });
    
    document.getElementById('wifi-ssid').addEventListener('input', function() {
        hideError('wifi-ssid-error');
        markInputError('wifi-ssid', false);
    });
    
    document.getElementById('wifi-password').addEventListener('input', function() {
        hideError('wifi-ssid-error');
        markInputError('wifi-password', false);
    });
    
    document.getElementById('contact-email').addEventListener('input', function() {
        hideError('contact-email-error');
        markInputError('contact-email', false);
    });
    
    document.getElementById('contact-phone').addEventListener('input', function() {
        hideError('contact-email-error');
        markInputError('contact-phone', false);
    });
    
    document.getElementById('barcode-data').addEventListener('input', function() {
        hideError('barcode-data-error');
        markInputError('barcode-data', false);
        const format = document.getElementById('barcode-format').value;
        updateFormatHint('barcode-data', format);
    });
    
    document.getElementById('bulk-qr-data').addEventListener('input', function() {
        hideError('bulk-qr-data-error');
        markInputError('bulk-qr-data', false);
    });
    
    document.getElementById('bulk-barcode-data').addEventListener('input', function() {
        hideError('bulk-barcode-data-error');
        markInputError('bulk-barcode-data', false);
        const format = document.getElementById('bulk-barcode-format').value;
        updateBulkFormatHint('bulk-barcode-data', format);
    });
    
    document.getElementById('barcode-format').addEventListener('change', function() {
        const format = this.value;
        updateFormatHint('barcode-data', format);
        
        const input = document.getElementById('barcode-data');
        if (input.value.trim()) {
            const validation = validateBarcodeFormat(input.value.trim(), format);
            if (!validation.valid) {
                showError('barcode-data-error', validation.error);
                markInputError('barcode-data', true);
                focusToElement('barcode-data');
            }
        }
    });
    
    document.getElementById('bulk-barcode-format').addEventListener('change', function() {
        const format = this.value;
        updateBulkFormatHint('bulk-barcode-data', format);
    });
    
    setTimeout(() => {
        document.getElementById('barcode-format').dispatchEvent(new Event('change'));
        document.getElementById('bulk-barcode-format').dispatchEvent(new Event('change'));
    }, 100);
}

function updateFormatHint(inputId, format) {
    const input = document.getElementById(inputId);
    const rules = barcodeFormatRules[format];
    
    if (rules) {
        input.placeholder = `Enter ${getFormatName(format)} data (e.g., ${rules.example})`;
        const hintContainer = input.parentNode.querySelector('.format-hint-container');
        if (!hintContainer) {
            const container = document.createElement('div');
            container.className = 'format-hint-container';
            container.innerHTML = `<small class="format-hint">${rules.description}</small>`;
            input.parentNode.appendChild(container);
        } else {
            hintContainer.innerHTML = `<small class="format-hint">${rules.description}</small>`;
        }
    }
}

function updateBulkFormatHint(textareaId, format) {
    const textarea = document.getElementById(textareaId);
    const rules = barcodeFormatRules[format];
    
    if (rules) {
        textarea.placeholder = `Enter ${getFormatName(format)} data (one per line)\nExample:\n${rules.example}\nAnother item`;
    }
}

function initValidation() {
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = message;
        element.classList.add('show');
    }
}

function hideError(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.remove('show');
        element.textContent = '';
    }
}

function markInputError(inputId, hasError) {
    const input = document.getElementById(inputId);
    if (input) {
        if (hasError) {
            input.classList.add('input-error');
        } else {
            input.classList.remove('input-error');
        }
    }
}

function validateQRInput() {
    const activeBtn = document.querySelector('.qr-type-btn.active');
    const type = activeBtn ? activeBtn.dataset.type : 'text';
    
    hideError('qr-content-error');
    hideError('wifi-ssid-error');
    hideError('contact-email-error');
    markInputError('qr-content', false);
    markInputError('wifi-ssid', false);
    markInputError('contact-email', false);
    
    let isValid = true;
    let errorFieldId = null;
    
    switch(type) {
        case 'text':
            const textContent = document.getElementById('qr-content').value.trim();
            if (!textContent) {
                showError('qr-content-error', 'Please enter text or URL for the QR code');
                markInputError('qr-content', true);
                isValid = false;
                errorFieldId = 'qr-content';
            }
            break;
            
        case 'wifi':
            const ssid = document.getElementById('wifi-ssid').value.trim();
            if (!ssid) {
                showError('wifi-ssid-error', 'WiFi network name (SSID) is required');
                markInputError('wifi-ssid', true);
                isValid = false;
                errorFieldId = 'wifi-ssid';
            } else if (ssid.length > 32) {
                showError('wifi-ssid-error', 'SSID must be 32 characters or less');
                markInputError('wifi-ssid', true);
                isValid = false;
                errorFieldId = 'wifi-ssid';
            }
            
            const password = document.getElementById('wifi-password').value;
            if (password.length > 63) {
                showError('wifi-ssid-error', 'Password must be 63 characters or less');
                markInputError('wifi-password', true);
                isValid = false;
                errorFieldId = errorFieldId || 'wifi-password';
            }
            break;
            
        case 'contact':
            const email = document.getElementById('contact-email').value.trim();
            if (!email) {
                showError('contact-email-error', 'Email address is required for contact QR');
                markInputError('contact-email', true);
                isValid = false;
                errorFieldId = 'contact-email';
            } else if (!isValidEmail(email)) {
                showError('contact-email-error', 'Please enter a valid email address (e.g., name@example.com)');
                markInputError('contact-email', true);
                isValid = false;
                errorFieldId = 'contact-email';
            }
            
            const phone = document.getElementById('contact-phone').value.trim();
            if (phone && !/^[\d\s\-\+\(\)]+$/.test(phone)) {
                showError('contact-email-error', 'Please enter a valid phone number');
                markInputError('contact-phone', true);
                isValid = false;
                errorFieldId = errorFieldId || 'contact-phone';
            }
            break;
    }
    
    return { isValid, errorFieldId };
}

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validateBarcodeInput() {
    const data = document.getElementById('barcode-data').value.trim();
    const format = document.getElementById('barcode-format').value;
    
    hideError('barcode-data-error');
    markInputError('barcode-data', false);
    
    if (!data) {
        showError('barcode-data-error', 'Please enter barcode data');
        markInputError('barcode-data', true);
        return { isValid: false, errorFieldId: 'barcode-data' };
    }
    
    const validation = validateBarcodeFormat(data, format);
    if (!validation.valid) {
        const formatName = getFormatName(format);
        showError('barcode-data-error', `${formatName}: ${validation.error}`);
        markInputError('barcode-data', true);
        return { isValid: false, errorFieldId: 'barcode-data' };
    }
    
    return { isValid: true, errorFieldId: null };
}

function validateBarcodeFormat(data, format) {
    const cleanData = data.trim();
    
    if (!cleanData) return { valid: false, error: 'Data is required' };
    
    const rules = barcodeFormatRules[format];
    if (!rules) return { valid: true, error: null };
    
    if (cleanData.length < rules.minLength || cleanData.length > rules.maxLength) {
        return { 
            valid: false, 
            error: `Must be ${rules.minLength === rules.maxLength ? `exactly ${rules.minLength}` : `${rules.minLength}-${rules.maxLength}`} characters`
        };
    }
    
    if (!rules.pattern.test(cleanData)) {
        return { 
            valid: false, 
            error: `Invalid characters. ${rules.description}`
        };
    }
    
    switch(format) {
        case 'EAN13':
            if (!validateEAN13(cleanData)) {
                return { valid: true, error: 'Invalid EAN-13 check digit' };
            }
            break;
        case 'EAN8':
            if (!validateEAN8(cleanData)) {
                return { valid: true, error: 'Invalid EAN-8 check digit' };
            }
            break;
        case 'UPC':
            if (!validateUPC(cleanData)) {
                return { valid: true, error: 'Invalid UPC-A check digit' };
            }
            break;
        case 'ITF':
            if (cleanData.length % 2 !== 0) {
                return { valid: false, error: 'ITF requires even number of digits' };
            }
            break;
        case 'Pharmacode':
            const num = parseInt(cleanData, 10);
            if (num < 3 || num > 131070) {
                return { valid: false, error: 'Pharmacode must be between 3 and 131070' };
            }
            break;
    }
    
    return { valid: true, error: null };
}

function validateEAN13(data) {
    if (data.length !== 13) return false;
    
    const digits = data.split('').map(Number);
    let sum = 0;
    
    for (let i = 0; i < 12; i++) {
        sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }
    
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === digits[12];
}

function validateEAN8(data) {
    if (data.length !== 8) return false;
    
    const digits = data.split('').map(Number);
    let sum = 0;
    
    for (let i = 0; i < 7; i++) {
        sum += digits[i] * (i % 2 === 0 ? 3 : 1);
    }
    
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === digits[7];
}

function validateUPC(data) {
    if (data.length !== 12) return false;
    
    const digits = data.split('').map(Number);
    let sum = 0;
    
    for (let i = 0; i < 11; i++) {
        sum += digits[i] * (i % 2 === 0 ? 3 : 1);
    }
    
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === digits[11];
}

function validateBulkQRInput() {
    const dataText = document.getElementById('bulk-qr-data').value.trim();
    
    hideError('bulk-qr-data-error');
    markInputError('bulk-qr-data', false);
    
    if (!dataText) {
        showError('bulk-qr-data-error', 'Please enter at least one item (one per line)');
        markInputError('bulk-qr-data', true);
        return { isValid: false, errorFieldId: 'bulk-qr-data' };
    }
    
    const items = dataText.split('\n')
        .filter(line => line.trim() !== '')
        .map(line => line.trim());
    
    if (items.length === 0) {
        showError('bulk-qr-data-error', 'Please enter at least one item (one per line)');
        markInputError('bulk-qr-data', true);
        return { isValid: false, errorFieldId: 'bulk-qr-data' };
    }
    
    if (items.length > 100) {
        showError('bulk-qr-data-error', 'Maximum 100 items allowed for bulk generation');
        markInputError('bulk-qr-data', true);
        return { isValid: false, errorFieldId: 'bulk-qr-data' };
    }
    
    const emptyItems = items.filter(item => item.length === 0);
    if (emptyItems.length > 0) {
        showError('bulk-qr-data-error', 'Remove empty lines from the list');
        markInputError('bulk-qr-data', true);
        return { isValid: false, errorFieldId: 'bulk-qr-data' };
    }
    
    const longItems = items.filter(item => item.length > 500);
    if (longItems.length > 0) {
        showError('bulk-qr-data-error', 'Some items are too long (max 500 characters)');
        markInputError('bulk-qr-data', true);
        return { isValid: false, errorFieldId: 'bulk-qr-data' };
    }
    
    return { isValid: true, errorFieldId: null };
}

function validateBulkBarcodeInput() {
    const dataText = document.getElementById('bulk-barcode-data').value.trim();
    const format = document.getElementById('bulk-barcode-format').value;
    
    hideError('bulk-barcode-data-error');
    markInputError('bulk-barcode-data', false);
    
    if (!dataText) {
        showError('bulk-barcode-data-error', 'Please enter at least one item (one per line)');
        markInputError('bulk-barcode-data', true);
        return { isValid: false, errorFieldId: 'bulk-barcode-data' };
    }
    
    const items = dataText.split('\n')
        .filter(line => line.trim() !== '')
        .map(line => line.trim());
    
    if (items.length === 0) {
        showError('bulk-barcode-data-error', 'Please enter at least one item (one per line)');
        markInputError('bulk-barcode-data', true);
        return { isValid: false, errorFieldId: 'bulk-barcode-data' };
    }
    
    if (items.length > 100) {
        showError('bulk-barcode-data-error', 'Maximum 100 items allowed for bulk generation');
        markInputError('bulk-barcode-data', true);
        return { isValid: false, errorFieldId: 'bulk-barcode-data' };
    }
    
    const invalidItems = [];
    items.forEach((item, index) => {
        const validation = validateBarcodeFormat(item, format);
        if (!validation.valid) {
            invalidItems.push({ 
                index: index + 1, 
                value: item, 
                error: validation.error 
            });
        }
    });
    
    if (invalidItems.length > 0) {
        const formatName = getFormatName(format);
        let errorMsg = `${invalidItems.length} item(s) have invalid format for ${formatName}`;
        
        if (invalidItems.length <= 3) {
            errorMsg += `<br>Invalid items:`;
            invalidItems.forEach(item => {
                errorMsg += `<br>Line ${item.index}: "${item.value}" - ${item.error}`;
            });
        } else {
            errorMsg += `<br>First 3 errors:`;
            invalidItems.slice(0, 3).forEach(item => {
                errorMsg += `<br>Line ${item.index}: "${item.value}" - ${item.error}`;
            });
            errorMsg += `<br>... and ${invalidItems.length - 3} more`;
        }
        
        showError('bulk-barcode-data-error', errorMsg);
        markInputError('bulk-barcode-data', true);
        return { isValid: false, errorFieldId: 'bulk-barcode-data' };
    }
    
    return { isValid: true, errorFieldId: null };
}

function initQRTypeButtons() {
    const qrTypeButtons = document.querySelectorAll('.qr-type-btn');
    qrTypeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            qrTypeButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.qr-type-fields').forEach(field => {
                field.classList.remove('active');
            });
            
            const selectedType = this.dataset.type;
            document.getElementById(`${selectedType}-fields`).classList.add('active');
        });
    });
    
    const qrFields = [
        'qr-content', 'wifi-ssid', 'wifi-password', 'wifi-encryption', 'wifi-hidden',
        'contact-firstname', 'contact-lastname', 'contact-phone', 'contact-email', 
        'contact-company', 'contact-website'
    ];
    
    qrFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', function() {
                const errorId = fieldId + '-error';
                hideError(errorId);
                markInputError(fieldId, false);
            });
        }
    });
}

function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = btn.dataset.tab;
            const section = btn.closest('.scanner-section, .generator-section');
            
            const currentActiveBtn = section.querySelector('.tab-btn.active');
            const currentActiveTab = currentActiveBtn ? currentActiveBtn.dataset.tab : null;
            
            if (currentActiveTab && currentActiveTab !== tab) {
                clearTabData(currentActiveTab, section);
            }
            
            section.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            section.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            let tabId = `${tab}-tab`;
            section.querySelector(`#${tabId}`).classList.add('active');
            
            if (tab !== 'camera' && isCameraActive) {
                stopCameraScanner();
            }
        });
    });
}

function clearTabData(tab, section) {
    if (section.classList.contains('scanner-section')) {
        clearScannerTabData(tab);
    } else if (section.closest('.qr-generator-section')) {
        clearQRGeneratorTabData(tab);
    } else if (section.closest('.barcode-generator-section')) {
        clearBarcodeGeneratorTabData(tab);
    }
}

function clearScannerTabData(tab) {
    switch(tab) {
        case 'camera':
            document.getElementById('results-list').innerHTML = '<p class="empty">Scan results will appear here</p>';
            const cameraResults = document.getElementById('camera-results');
            cameraResults.classList.remove('has-results');
            scanHistory = [];
            break;
        case 'upload':
            document.getElementById('upload-results').innerHTML = '<p class="empty">File scan results will appear here</p>';
            document.getElementById('selected-files').innerHTML = '<p class="empty">No files selected</p>';
            document.getElementById('selected-files').style.display = 'none';
            document.getElementById('file-input').value = '';
            const uploadResults = document.getElementById('upload-results-container');
            uploadResults.classList.remove('has-results');
            break;
        case 'url':
            document.getElementById('url-results').innerHTML = '<p class="empty">Enter URL and click Scan</p>';
            document.getElementById('url-input').value = '';
            hideError('url-error');
            markInputError('url-input', false);
            const urlResults = document.getElementById('url-results-container');
            urlResults.classList.remove('has-results');
            break;
    }
}

function clearQRGeneratorTabData(tab) {
    if (tab === 'bulk-qr') {
        document.getElementById('bulk-qr-data').value = '';
        clearBulkQR();
    } else if (tab === 'single-qr') {
        document.getElementById('qr-content').value = '';
        document.getElementById('wifi-ssid').value = '';
        document.getElementById('wifi-password').value = '';
        document.getElementById('contact-firstname').value = '';
        document.getElementById('contact-lastname').value = '';
        document.getElementById('contact-phone').value = '';
        document.getElementById('contact-email').value = '';
        document.getElementById('contact-company').value = '';
        document.getElementById('contact-website').value = '';
        
        document.getElementById('qr-preview').innerHTML = '<p class="empty">Generate a QR code to see preview</p>';
        const previewContainer = document.getElementById('qr-preview-container');
        previewContainer.classList.remove('has-content');
        
        hideError('qr-content-error');
        hideError('wifi-ssid-error');
        hideError('contact-email-error');
        markInputError('qr-content', false);
        markInputError('wifi-ssid', false);
        markInputError('contact-email', false);
    }
}

function clearBarcodeGeneratorTabData(tab) {
    if (tab === 'bulk-barcode') {
        document.getElementById('bulk-barcode-data').value = '';
        clearBulkBarcode();
    } else if (tab === 'single-barcode') {
        document.getElementById('barcode-data').value = '';
        document.getElementById('barcode-preview').innerHTML = '<p class="empty">Generate a barcode to see preview</p>';
        
        const previewContainer = document.getElementById('barcode-preview-container');
        previewContainer.classList.remove('has-content');
        
        hideError('barcode-data-error');
        markInputError('barcode-data', false);
    }
}

async function startCameraScanner() {
    if (isCameraActive) {
        stopCameraScanner();
        return;
    }
    
    if (isStartingCamera) return;
    
    isStartingCamera = true;
    hardStopScan = false;
    
    try {
        document.getElementById('scanner-init').style.display = 'none';
        document.querySelector('.preview-placeholder').style.display = 'flex';
        
        const video = document.getElementById('camera-feed');
        
        if (video.srcObject) {
            const tracks = video.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            video.srcObject = null;
        }
        
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
        
        video.srcObject = cameraStream;
        video.style.display = 'block';
        document.querySelector('.preview-placeholder').style.display = 'none';
        
        await video.play();
        
        isCameraActive = true;
        isProcessingScan = false;
        
        const overlay = document.getElementById('scanner-overlay');
        const laser = document.getElementById('laser-line');
        const corners = document.querySelectorAll('.corner');
        
        overlay.style.display = 'block';
        setTimeout(() => {
            laser.style.display = 'block';
            laser.style.animation = 'laserScan 2.5s ease-in-out infinite';
            
            corners.forEach(corner => {
                corner.style.display = 'block';
            });
        }, 300);
        
        startSingleShotScanner(video);
        
    } catch (error) {
        console.error('Camera error:', error);
        
        if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            try {
                const video = document.getElementById('camera-feed');
                cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });
                
                video.srcObject = cameraStream;
                video.style.display = 'block';
                document.querySelector('.preview-placeholder').style.display = 'none';
                await video.play();
                
                isCameraActive = true;
                isProcessingScan = false;
                
                const overlay = document.getElementById('scanner-overlay');
                const laser = document.getElementById('laser-line');
                const corners = document.querySelectorAll('.corner');
                
                overlay.style.display = 'block';
                setTimeout(() => {
                    laser.style.display = 'block';
                    laser.style.animation = 'laserScan 2.5s ease-in-out infinite';
                    
                    corners.forEach(corner => {
                        corner.style.display = 'block';
                    });
                }, 300);
                
                startSingleShotScanner(video);
            } catch (fallbackError) {
                console.error('Fallback camera error:', fallbackError);
                showNotification('Failed to access camera. Please check permissions.', 'error');
                resetCameraUI();
            }
        } else {
            showNotification('Failed to start camera: ' + error.message, 'error');
            resetCameraUI();
        }
    } finally {
        isStartingCamera = false;
    }
}

function startSingleShotScanner(video) {
    if (cameraControls) {
        try {
            cameraControls.stop();
        } catch (e) {}
        cameraControls = null;
    }
    
    hardStopScan = false;
    
    cameraControls = zxingReader.decodeFromVideoDevice(
        null,
        video,
        (result, error, controls) => {
            if (hardStopScan) return;
            
            if (result && !isProcessingScan) {
                isProcessingScan = true;
                hardStopScan = true;
                
                if (controls) {
                    try {
                        controls.stop();
                    } catch (e) {}
                }
                
                try {
                    zxingReader.reset();
                } catch (e) {}
                
                setTimeout(() => {
                    processCameraScan(result);
                }, 150);
            }
            
            if (error && !error.message.includes('NotFoundException')) {
                console.debug('Scan error:', error);
            }
        }
    );
}

function processCameraScan(result) {
    const currentTime = Date.now();
    
    if (result.text === lastScannedCode && (currentTime - lastScanTime) < SCAN_COOLDOWN) {
        showNotification('Code already scanned recently', 'info');
        restartScanner();
        return;
    }
    
    lastScannedCode = result.text;
    lastScanTime = currentTime;
    
    playScanSound();
    
    const scanInfo = getScanTypeAndIcon(result.getBarcodeFormat());
    
    addScanResult({
        text: result.getText(),
        format: scanInfo.format,
        type: scanInfo.type,
        timestamp: new Date().toLocaleTimeString(),
        source: 'Camera',
        icon: scanInfo.icon
    }, 'camera-results');
    
    scrollToScanResults('camera');
    
    const shortText = result.text.length > 50 ? result.text.substring(0, 50) + '...' : result.text;
    showNotification(`Scanned ${scanInfo.type}: ${shortText}`, 'success');
    
    setTimeout(() => {
        stopCameraScanner();
    }, 1000);
}

function restartScanner() {
    setTimeout(() => {
        isProcessingScan = false;
        hardStopScan = false;
        
        if (isCameraActive) {
            const video = document.getElementById('camera-feed');
            if (video) {
                startSingleShotScanner(video);
            }
        }
    }, 1000);
}

function stopCameraScanner() {
    hardStopScan = true;
    isProcessingScan = false;
    
    if (cameraControls) {
        try {
            cameraControls.stop();
        } catch (e) {}
        cameraControls = null;
    }
    
    try {
        zxingReader.reset();
    } catch (e) {}
    
    if (cameraStream) {
        const tracks = cameraStream.getTracks();
        tracks.forEach(track => {
            try {
                track.stop();
                track.enabled = false;
            } catch (e) {}
        });
        cameraStream = null;
    }
    
    const video = document.getElementById('camera-feed');
    if (video) {
        try {
            video.pause();
            video.srcObject = null;
            video.load();
            video.style.display = 'none';
        } catch (e) {
            console.error('Error clearing video:', e);
        }
    }
    
    document.getElementById('scanner-init').style.display = 'flex';
    document.querySelector('.preview-placeholder').style.display = 'none';
    
    const overlay = document.getElementById('scanner-overlay');
    const laser = document.getElementById('laser-line');
    const corners = document.querySelectorAll('.corner');
    
    overlay.style.display = 'none';
    laser.style.display = 'none';
    laser.style.animation = 'none';
    
    corners.forEach(corner => {
        corner.style.display = 'none';
    });
    
    isCameraActive = false;
}

function generateQR() {
    const validation = validateQRInput();
    if (!validation.isValid) {
        if (validation.errorFieldId) {
            focusToElement(validation.errorFieldId);
        }
        return;
    }
    
    const activeBtn = document.querySelector('.qr-type-btn.active');
    const type = activeBtn ? activeBtn.dataset.type : 'text';
    const size = parseInt(document.getElementById('qr-size').value);
    const color = document.getElementById('qr-color').value;
    const bgColor = document.getElementById('qr-bg-color').value;
    const errorLevel = document.getElementById('qr-error-level').value;
    const margin = parseInt(document.getElementById('qr-margin').value);
    const container = document.getElementById('qr-preview');
    const previewContainer = document.getElementById('qr-preview-container');
    
    previewContainer.classList.add('has-content');
    
    let qrContent = '';
    
    switch(type) {
        case 'text':
            qrContent = document.getElementById('qr-content').value.trim();
            break;
            
        case 'wifi':
            const ssid = document.getElementById('wifi-ssid').value.trim();
            const password = document.getElementById('wifi-password').value.trim();
            const encryption = document.getElementById('wifi-encryption').value;
            const hidden = document.getElementById('wifi-hidden').value;
            if (ssid) {
                qrContent = `WIFI:S:${ssid};T:${encryption};P:${password};H:${hidden};;`;
            }
            break;
            
        case 'contact':
            const firstName = document.getElementById('contact-firstname').value.trim();
            const lastName = document.getElementById('contact-lastname').value.trim();
            const phone = document.getElementById('contact-phone').value.trim();
            const email = document.getElementById('contact-email').value.trim();
            const company = document.getElementById('contact-company').value.trim();
            const website = document.getElementById('contact-website').value.trim();
            
            let vcard = 'BEGIN:VCARD\nVERSION:3.0\n';
            if (firstName || lastName) vcard += `FN:${firstName} ${lastName}\nN:${lastName};${firstName};;;\n`;
            if (phone) vcard += `TEL:${phone}\n`;
            if (email) vcard += `EMAIL:${email}\n`;
            if (company) vcard += `ORG:${company}\n`;
            if (website) vcard += `URL:${website}\n`;
            vcard += 'END:VCARD';
            qrContent = vcard;
            break;
    }
    
    if (!qrContent) {
        container.innerHTML = '<div class="empty">Enter content to generate QR code</div>';
        return;
    }
    
    container.innerHTML = '';
    
    try {
        const maxSize = window.innerWidth < 768 ? 300 : 400;
        const actualSize = Math.min(size, maxSize);
        
        const qrCode = new QRCode(container, {
            text: qrContent,
            width: actualSize,
            height: actualSize,
            colorDark: color,
            colorLight: bgColor,
            correctLevel: QRCode.CorrectLevel[errorLevel],
            margin: margin
        });
        
        showNotification('QR code generated successfully!', 'success');
        
        setTimeout(() => {
            scrollToGeneratedCode('single-qr');
        }, 300);
        
    } catch (error) {
        console.error('QR generation error:', error);
        container.innerHTML = '<div class="error">Failed to generate QR code</div>';
        showNotification('Failed to generate QR code', 'error');
    }
}

function generateBarcode() {
    const validation = validateBarcodeInput();
    if (!validation.isValid) {
        if (validation.errorFieldId) {
            focusToElement(validation.errorFieldId);
        }
        return;
    }

    const data = document.getElementById('barcode-data').value.trim();
    const format = String(document.getElementById('barcode-format').value || '').trim().toUpperCase();
    const size = parseFloat(document.getElementById('barcode-size').value);
    const color = document.getElementById('barcode-color').value;
    const fontSize = parseInt(document.getElementById('barcode-font-size').value);
    const width = parseFloat(document.getElementById('barcode-width').value);
    const height = parseInt(document.getElementById('barcode-height').value);
    const textAlign = document.getElementById('barcode-text-align').value;
    const displayValue = document.getElementById('barcode-display-value').value === 'true';
    const container = document.getElementById('barcode-preview');
    const previewContainer = document.getElementById('barcode-preview-container');

    previewContainer.classList.add('has-content');
    container.innerHTML = ''; // Clear previous content

    try {
        const scaleFactor = window.innerWidth < 768 ? 0.8 : 1;
        const actualSize = size * scaleFactor;

        if (format === 'PHARMACODE') {
            // Pharmacode: BWIP-JS only
            if (!/^\d+$/.test(data)) {
                throw new Error('Pharmacode must be numeric.');
            }
            const canvas = document.createElement('canvas');
            container.appendChild(canvas);
            bwipjs.toCanvas(canvas, {
                bcid: 'pharmacode',
                text: data,
                scale: 3,
                height: 15
            });

        } else if (format === 'CODABAR') {
            // Codabar: JsBarcode with validation
            if (!/^[ABCD][0-9\-\$\:\.\/\+]+[ABCD]$/.test(data)) {
                throw new Error('Codabar must start/end with A-D and contain digits or -:$/.+ in between.');
            }
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.id = 'barcode-svg';
            container.appendChild(svg);
            JsBarcode('#barcode-svg', data, {
                format: 'CODABAR',
                displayValue: displayValue,
                fontSize: fontSize,
                background: '#ffffff',
                lineColor: color,
                width: width,
                height: height,
                margin: 10,
                textAlign: textAlign || undefined
            });

        } else {
            // All other formats: JsBarcode
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.id = 'barcode-svg';
            container.appendChild(svg);
            const options = {
                format: format,
                displayValue: displayValue,
                fontSize: fontSize,
                background: '#ffffff',
                lineColor: color,
                width: width,
                height: height,
                margin: 10
            };
            if (textAlign) options.textAlign = textAlign;
            if (format === 'UPC' || format === 'UPCE' || format === 'EAN8' || format === 'EAN13') {
                options.fontSize = Math.max(fontSize, 12);
            }
            if (format === 'CODE39EXTENDED') {
                options.format = 'CODE39';
                options.mod43 = false;
            }
            JsBarcode('#barcode-svg', data, options);
        }

        showNotification('Barcode generated successfully!', 'success');
        setTimeout(() => {
            scrollToGeneratedCode('single-barcode');
        }, 300);

    } catch (error) {
        console.error('Barcode generation error:', error);
        container.innerHTML = '<div class="error">Failed to generate barcode: ' + error.message + '</div>';
        showNotification('Failed to generate barcode: ' + error.message, 'error');
    }
}

// Helper: normalize format string (uppercase)
function normalizeFormat(format) {
    return String(format || '').trim().toUpperCase();
}

function addScanResult(scan, containerId = null) {
    let resultList, resultContainer;
    
    if (containerId) {
        resultContainer = document.getElementById(containerId);
        resultList = resultContainer.querySelector('.results-list');
    } else {
        const activeTab = document.querySelector('.scanner-section .tab-content.active').id;
        
        if (activeTab === 'upload-tab') {
            resultContainer = document.getElementById('upload-results-container');
            resultList = document.getElementById('upload-results');
        } else if (activeTab === 'url-tab') {
            resultContainer = document.getElementById('url-results-container');
            resultList = document.getElementById('url-results');
        } else {
            resultContainer = document.getElementById('camera-results');
            resultList = document.getElementById('results-list');
        }
    }
    
    if (resultContainer) {
        resultContainer.classList.add('has-results');
    }
    
    const emptyMsg = resultList.querySelector('.empty, .loading');
    if (emptyMsg) emptyMsg.remove();
    
    const iconClass = scan.icon || 'fa-qrcode';
    const scanType = scan.type || 'QR Code';
    const scanFormat = scan.format || 'Unknown';
    
    const item = document.createElement('div');
    item.className = 'result-item';
    
    item.innerHTML = `
        <div class="result-item-header">
            <div class="result-row">
                <div class="result-type">
                    <i class="fas ${iconClass}"></i>
                    <span>${scanType}</span>
                </div>
                <div class="result-time">
                    <i class="far fa-clock"></i> ${scan.timestamp}
                </div>
            </div>
            <div class="result-source-row">
                <span class="result-source">Source: ${scan.source || 'Unknown'}</span>
            </div>
        </div>
        <div class="result-content-section">
            <div class="result-content-title">
                <i class="fas fa-file-alt"></i> Content:
            </div>
            <div class="result-content">
                <pre>${scan.text}</pre>
            </div>
        </div>
        <div class="result-actions">
            <button class="icon-btn small copy-btn" data-text="${scan.text}" title="Copy">
                <i class="fas fa-copy"></i>
            </button>
            ${scan.text.startsWith('http') ? `
                <button class="icon-btn small open-btn" data-url="${scan.text}" title="Open">
                    <i class="fas fa-external-link-alt"></i>
                </button>
            ` : ''}
        </div>
    `;
    
    item.querySelector('.copy-btn').addEventListener('click', function() {
        navigator.clipboard.writeText(this.dataset.text)
            .then(() => showNotification('Copied to clipboard', 'success'))
            .catch(() => showNotification('Failed to copy', 'error'));
    });
    
    const openBtn = item.querySelector('.open-btn');
    if (openBtn) {
        openBtn.addEventListener('click', function() {
            window.open(this.dataset.url, '_blank');
        });
    }
    
    resultList.insertBefore(item, resultList.firstChild);
    const items = resultList.querySelectorAll('.result-item');
    if (items.length > 20) {
        resultList.removeChild(items[items.length - 1]);
    }
}

async function generateBulkQR() {
    const validation = validateBulkQRInput();
    if (!validation.isValid) {
        if (validation.errorFieldId) {
            focusToElement(validation.errorFieldId);
        }
        return;
    }
    
    const dataText = document.getElementById('bulk-qr-data').value.trim();
    const size = parseInt(document.getElementById('bulk-qr-size').value);
    const color = document.getElementById('bulk-qr-color').value;
    const bgColor = document.getElementById('bulk-qr-bg-color').value;
    const errorLevel = document.getElementById('bulk-qr-error-level').value;
    
    const items = dataText.split('\n')
        .filter(line => line.trim() !== '')
        .map(line => line.trim());
    
    if (items.length > 50) {
        showNotification(`Limiting to first 50 items (${items.length} provided)`, 'info');
        items.length = 50;
    }
    
    const preview = document.getElementById('bulk-qr-results');
    const container = document.getElementById('bulk-qr-container');
    
    container.classList.add('has-content');
    
    preview.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Generating ' + items.length + ' QR codes...</div>';
    
    bulkQRItems = [];
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const codeContainer = document.createElement('div');
        codeContainer.className = 'bulk-item';
        codeContainer.id = `bulk-qr-item-${i}`;
        
        try {
            codeContainer.innerHTML = '<div class="bulk-item-content"></div>';
            const contentDiv = codeContainer.querySelector('.bulk-item-content');
            
            await generateBulkQRCode(contentDiv, item, color, bgColor, size, errorLevel);
            
            const label = document.createElement('div');
            label.className = 'bulk-item-label';
            label.textContent = item.length > 30 ? item.substring(0, 30) + '...' : item;
            label.title = item;
            codeContainer.appendChild(label);
            
            const actions = document.createElement('div');
            actions.className = 'bulk-item-actions';
            actions.innerHTML = `
                <button class="icon-btn small" onclick="downloadSingleBulkItem('qr', ${i})" title="Download">
                    <i class="fas fa-download"></i>
                </button>
                <button class="icon-btn small" onclick="copyBulkItemData('qr', ${i})" title="Copy Text">
                    <i class="fas fa-copy"></i>
                </button>
            `;
            codeContainer.appendChild(actions);
            
            bulkQRItems.push({
                id: i,
                data: item,
                type: 'qr',
                color: color,
                bgColor: bgColor,
                size: size,
                errorLevel: errorLevel,
                element: codeContainer
            });
            
        } catch (error) {
            console.error('Error generating bulk QR code:', error);
        }
    }
    
    updateBulkQRPreview();
    document.getElementById('bulk-qr-count').textContent = `${items.length} QR codes generated`;
    
    showNotification(`Successfully generated ${items.length} QR codes`, 'success');
    
    setTimeout(() => {
        scrollToGeneratedCode('bulk-qr');
    }, 300);
}

function generateBulkQRCode(container, text, color, bgColor, size, errorLevel) {
    return new Promise((resolve) => {
        const qrCode = new QRCode(container, {
            text: text,
            width: Math.min(size, 300),
            height: Math.min(size, 300),
            colorDark: color,
            colorLight: bgColor,
            correctLevel: QRCode.CorrectLevel[errorLevel],
            margin: 4
        });
        setTimeout(resolve, 50);
    });
}

function updateBulkQRPreview() {
    const preview = document.getElementById('bulk-qr-results');
    if (bulkQRItems.length === 0) {
        preview.innerHTML = '<p class="empty">No QR codes generated yet</p>';
        return;
    }
    
    preview.innerHTML = '';
    bulkQRItems.forEach(item => {
        preview.appendChild(item.element);
    });
}

function clearBulkQR() {
    bulkQRItems = [];
    document.getElementById('bulk-qr-data').value = '';
    document.getElementById('bulk-qr-results').innerHTML = '<p class="empty">No QR codes generated yet</p>';
    document.getElementById('bulk-qr-count').textContent = '0 codes';
    hideError('bulk-qr-data-error');
    markInputError('bulk-qr-data', false);
    
    const container = document.getElementById('bulk-qr-container');
    container.classList.remove('has-content');
    
    
}

async function generateBulkBarcode() {
    const validation = validateBulkBarcodeInput();
    if (!validation.isValid) {
        if (validation.errorFieldId) {
            focusToElement(validation.errorFieldId);
        }
        return;
    }
    
    const dataText = document.getElementById('bulk-barcode-data').value.trim();
    const format = document.getElementById('bulk-barcode-format').value;
    const color = document.getElementById('bulk-barcode-color').value;
    const size = parseFloat(document.getElementById('bulk-barcode-size').value);
    const height = parseInt(document.getElementById('bulk-barcode-height').value);
    
    const items = dataText.split('\n')
        .filter(line => line.trim() !== '')
        .map(line => line.trim());
    
    if (items.length > 50) {
        showNotification(`Limiting to first 50 items (${items.length} provided)`, 'info');
        items.length = 50;
    }
    
    const preview = document.getElementById('bulk-barcode-results');
    const container = document.getElementById('bulk-barcode-container');
    
    container.classList.add('has-content');
    
    preview.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Generating ' + items.length + ' barcodes...</div>';
    
    bulkBarcodeItems = [];
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const codeContainer = document.createElement('div');
        codeContainer.className = 'bulk-item';
        codeContainer.id = `bulk-barcode-item-${i}`;
        
        try {
            codeContainer.innerHTML = '<div class="bulk-item-content"></div>';
            const contentDiv = codeContainer.querySelector('.bulk-item-content');
            
            await generateBulkBarcodeCode(contentDiv, item, format, color, size, height);
            
            const label = document.createElement('div');
            label.className = 'bulk-item-label';
            label.textContent = item.length > 30 ? item.substring(0, 30) + '...' : item;
            label.title = item;
            codeContainer.appendChild(label);
            
            const actions = document.createElement('div');
            actions.className = 'bulk-item-actions';
            actions.innerHTML = `
                <button class="icon-btn small" onclick="downloadSingleBulkItem('barcode', ${i})" title="Download">
                    <i class="fas fa-download"></i>
                </button>
                <button class="icon-btn small" onclick="copyBulkItemData('barcode', ${i})" title="Copy Text">
                    <i class="fas fa-copy"></i>
                </button>
            `;
            codeContainer.appendChild(actions);
            
            bulkBarcodeItems.push({
                id: i,
                data: item,
                type: 'barcode',
                format: format,
                color: color,
                size: size,
                height: height,
                element: codeContainer
            });
            
        } catch (error) {
            console.error('Error generating bulk barcode:', error);
        }
    }
    
    updateBulkBarcodePreview();
    document.getElementById('bulk-barcode-count').textContent = `${items.length} barcodes generated`;
    
    showNotification(`Successfully generated ${items.length} barcodes`, 'success');
    
    setTimeout(() => {
        scrollToGeneratedCode('bulk-barcode');
    }, 300);
}

function generateBulkBarcodeCode(container, data, format, color, size, height) {
    return new Promise((resolve) => {
        container.innerHTML = '<svg class="barcode-svg"></svg>';
        const svg = container.querySelector('.barcode-svg');
        const scaledSize = Math.min(size, 3) * 2;
        
        try {
            const options = {
                format: format,
                width: scaledSize,
                height: height,
                displayValue: true,
                fontSize: 12,
                lineColor: color,
                background: '#ffffff',
                margin: 5
            };
            
            if (format === 'CODE39Extended') {
                options.format = 'CODE39';
                options.mod43 = false;
            }
            
            JsBarcode(svg, data, options);
            
            svg.style.width = '100%';
            svg.style.height = '60px';
            svg.style.display = 'block';
            svg.style.maxWidth = '100%';
            
            setTimeout(resolve, 50);
        } catch (error) {
            console.error('Barcode generation error:', error);
            container.innerHTML = '<div class="error">Invalid format or data</div>';
            resolve();
        }
    });
}

function updateBulkBarcodePreview() {
    const preview = document.getElementById('bulk-barcode-results');
    if (bulkBarcodeItems.length === 0) {
        preview.innerHTML = '<p class="empty">No barcodes generated yet</p>';
        return;
    }
    
    preview.innerHTML = '';
    bulkBarcodeItems.forEach(item => {
        preview.appendChild(item.element);
    });
}

function clearBulkBarcode() {
    bulkBarcodeItems = [];
    document.getElementById('bulk-barcode-data').value = '';
    document.getElementById('bulk-barcode-results').innerHTML = '<p class="empty">No barcodes generated yet</p>';
    document.getElementById('bulk-barcode-count').textContent = '0 codes';
    hideError('bulk-barcode-data-error');
    markInputError('bulk-barcode-data', false);
    
    const container = document.getElementById('bulk-barcode-container');
    container.classList.remove('has-content');
}

function initFileUpload() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    
    dropZone.addEventListener('click', (e) => {
        if (e.target !== fileInput) {
            fileInput.value = '';
            fileInput.click();
        }
    });
    
    fileInput.addEventListener('change', handleFileSelection);
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelection();
            showNotification(`${e.dataTransfer.files.length} file(s) added`, 'success');
        }
    });
}

function handleFileSelection() {
    const files = document.getElementById('file-input').files;
    const container = document.getElementById('selected-files');
    
    if (!files.length) {
        container.innerHTML = '<p class="empty">No files selected</p>';
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    let html = '<div class="files-grid">';
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        html += `
            <div class="file-item" data-index="${i}">
                <i class="fas fa-file-image"></i>
                <div class="file-item-info">
                    <div class="file-item-name">${file.name}</div>
                    <div class="file-item-size">${formatFileSize(file.size)}</div>
                </div>
                <button class="icon-btn small remove-file" onclick="removeFile(${i})" title="Remove">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }
    html += '</div>';
    
    container.innerHTML = html;
}

function removeFile(index) {
    const fileInput = document.getElementById('file-input');
    const files = Array.from(fileInput.files);
    
    if (index >= 0 && index < files.length) {
        files.splice(index, 1);
        const dataTransfer = new DataTransfer();
        files.forEach(file => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files;
        
        if (files.length === 0) {
            const container = document.getElementById('selected-files');
            container.innerHTML = '<p class="empty">No files selected</p>';
            container.style.display = 'none';
        }
        
        handleFileSelection();
        showNotification('File removed', 'info');
    }
}

async function scanFiles() {
    const files = document.getElementById('file-input').files;
    const resultsList = document.getElementById('upload-results');
    const resultsContainer = document.getElementById('upload-results-container');
    
    if (files.length === 0) {
        showNotification('Please select files first', 'warning');
        return;
    }
    
    resultsList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Scanning files...</div>';
    resultsContainer.classList.add('has-results');
    
    let successCount = 0;
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        try {
            const img = new Image();
            const url = URL.createObjectURL(file);
            
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = url;
            });
            
            const result = await zxingReader.decodeFromImage(img);
            if (result) {
                successCount++;
                
                const scanInfo = getScanTypeAndIcon(result.getBarcodeFormat());
                
                const scanResult = {
                    text: result.getText(),
                    format: scanInfo.format,
                    type: scanInfo.type,
                    timestamp: new Date().toLocaleTimeString(),
                    source: file.name,
                    icon: scanInfo.icon
                };
                
                const emptyMsg = resultsList.querySelector('.empty, .loading');
                if (emptyMsg) emptyMsg.remove();
                
                const resultItem = document.createElement('div');
                resultItem.className = 'result-item';
                
                resultItem.innerHTML = `
                    <div class="result-item-header">
                        <div class="result-row">
                            <div class="result-type">
                                <i class="fas ${scanInfo.icon}"></i>
                                <span>${scanInfo.type}</span>
                            </div>
                            <div class="result-time">
                                <i class="far fa-clock"></i> ${scanResult.timestamp}
                            </div>
                        </div>
                        <div class="result-source-row">
                            <span class="result-source">Source: ${scanResult.source}</span>
                        </div>
                    </div>
                    <div class="result-content-section">
                        <div class="result-content-title">
                            <i class="fas fa-file-alt"></i> Content:
                        </div>
                        <div class="result-content">
                            <pre>${scanResult.text}</pre>
                        </div>
                    </div>
                    <div class="result-actions">
                        <button class="icon-btn small copy-btn" data-text="${scanResult.text}" title="Copy">
                            <i class="fas fa-copy"></i>
                        </button>
                    ${scanResult.text.startsWith('http') ? `
                <button class="icon-btn small open-btn" data-url="${scanResult.text}" title="Open">
                    <i class="fas fa-external-link-alt"></i>
                </button>
            ` : ''}
        </div>
    `;

    resultItem.querySelector('.copy-btn').addEventListener('click', function () {
        navigator.clipboard.writeText(this.dataset.text)
            .then(() => showNotification('Copied to clipboard', 'success'))
            .catch(() => showNotification('Failed to copy', 'error'));
    });

    const openBtn = resultItem.querySelector('.open-btn');
    if (openBtn) {
        openBtn.addEventListener('click', function () {
            window.open(this.dataset.url, '_blank');
        });
    }
                
                resultsList.insertBefore(resultItem, resultsList.firstChild);
                
                const fileItems = document.querySelectorAll('.file-item');
                if (fileItems[i]) {
                    fileItems[i].style.borderColor = '#10b981';
                }
            }
            
            URL.revokeObjectURL(url);
        } catch (error) {
        }
    }
    
    if (successCount > 0) {
        playScanSound();
        showNotification(`Scanned ${successCount} file(s) successfully`, 'success');
        
        scrollToScanResults('upload');
        
        setTimeout(() => {
            clearFiles(false);
        }, 1000);
    } else {
        resultsList.innerHTML = '<p class="empty">No codes found in files</p>';
        showNotification('No codes found in files', 'info');
    }
}

function clearFiles(showNotification = true) {
    const fileInput = document.getElementById('file-input');
    fileInput.value = '';
    document.getElementById('selected-files').innerHTML = '<p class="empty">No files selected</p>';
    document.getElementById('selected-files').style.display = 'none';
    if (showNotification) {
        showNotification('Files cleared', 'info');
    }
}

async function scanURL() {
    const urlInput = document.getElementById('url-input');
    const url = urlInput.value.trim();
    const resultsDiv = document.getElementById('url-results');
    const resultsContainer = document.getElementById('url-results-container');
    
    resultsDiv.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading image...</div>';
    resultsContainer.classList.add('has-results');
    
    if (!url) {
        showError('url-error', 'Please enter a URL');
        markInputError('url-input', true);
        focusToElement('url-input');
        resultsDiv.innerHTML = '<p class="empty">Enter URL and click Scan</p>';
        resultsContainer.classList.remove('has-results');
      document.getElementById('icon-url').style.color = 'red';
        return;
    }
    
    let validUrl = url;
    if (url.startsWith('http://') && url.startsWith('https://')) {
        validUrl = 'https://' + url;
    }
    
    try {
        new URL(validUrl);
    } catch (e) {
      document.getElementById('icon-url').style.color = 'red';
        showError('url-error', 'Please enter a valid URL (e.g., https://example.com/image.jpg)');
        markInputError('url-input', true);
        focusToElement('url-input');
        resultsDiv.innerHTML = '<p class="empty">Enter URL and click Scan</p>';
      
        resultsContainer.classList.remove('has-results');
        return;
    }
    
    hideError('url-error');
    markInputError('url-input', );
    
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Image loading timeout')), 10000);
        });
        
        await Promise.race([
            new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Failed to load image from URL. Make sure the URL points to an image file.'));
                img.src = validUrl;
            }),
            timeoutPromise
        ]);
      
      
        
        const result = await zxingReader.decodeFromImage(img);

if (result) {
    resultsDiv.innerHTML = '';
    const scanInfo = getScanTypeAndIcon(result.getBarcodeFormat());
    const scanResult = {
        text: result.getText(),
        format: scanInfo.format,
        type: scanInfo.type,
        timestamp: new Date().toLocaleTimeString(),
        source: 'URL',
        icon: scanInfo.icon
    };

    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';

    resultItem.innerHTML = `
        <div class="result-item-header">
            <div class="result-row">
                <div class="result-type">
                    <i class="fas ${scanInfo.icon}"></i>
                    <span>${scanInfo.type}</span>
                </div>
                <div class="result-time">
                    <i class="far fa-clock"></i> ${scanResult.timestamp}
                </div>
            </div>
            <div class="result-source-row">
                <span class="result-source">Source: ${scanResult.source}</span>
            </div>
        </div>

        <div class="result-content-section">
            <div class="result-content-title">
                <i class="fas fa-file-alt"></i> Content:
            </div>
            <div class="result-content">
                <pre>${scanResult.text}</pre>
            </div>
        </div>

        <div class="result-actions">
            <button class="icon-btn small copy-btn" data-text="${scanResult.text}" title="Copy">
                <i class="fas fa-copy"></i>
            </button>
            ${scanResult.text.startsWith('http') ? `
                <button class="icon-btn small open-btn" data-url="${scanResult.text}" title="Open">
                    <i class="fas fa-external-link-alt"></i>
                </button>
            ` : ''}
        </div>
    `;

    resultItem.querySelector('.copy-btn').addEventListener('click', function () {
        navigator.clipboard.writeText(this.dataset.text)
            .then(() => showNotification('Copied to clipboard', 'success'))
            .catch(() => showNotification('Failed to copy', 'error'));
    });

    const openBtn = resultItem.querySelector('.open-btn');
    if (openBtn) {
        openBtn.addEventListener('click', function () {
            window.open(this.dataset.url, '_blank');
        });
    }

    resultsDiv.appendChild(resultItem);

    playScanSound();
    showNotification('URL scanned successfully', 'success');
    scrollToScanResults('url');
}
      else {
            resultsDiv.innerHTML = '<p class="empty">No code found in the image</p>';
            showNotification('No code found in the image', 'info');
        }
        
    } catch (error) {
        console.error('URL scan error:', error);
        
        resultsDiv.innerHTML = `
            <div class="result-item">
                <div class="result-item-header">
                    <div class="result-row">
                        <div class="result-type">
                            <i class="fas fa-times-circle"></i>
                            <span>Scan Failed</span>
                        </div>
                    </div>
                </div>
                <div class="result-content-section">
                    <div class="result-content-title">
                        <i class="fas fa-exclamation-triangle"></i> Error:
                    </div>
                    <div class="result-content">
                        <p>${error.message}</p>
                    </div>
                </div>
            </div>
        `;
        showNotification('Failed to scan URL: ' + error.message, 'error');
    }
}

async function downloadAllQR() {
    if (bulkQRItems.length === 0) {
        showNotification('No QR codes to download', 'warning');
        return;
    }
    
    showNotification(`Preparing ${bulkQRItems.length} QR codes for download...`, 'info');
    
    const zip = new JSZip();
    const qrFolder = zip.folder("qr_codes");
    
    for (let i = 0; i < bulkQRItems.length; i++) {
        const item = bulkQRItems[i];
        const container = document.getElementById(`bulk-qr-item-${i}`);
        if (container) {
            const canvas = container.querySelector('canvas');
            if (canvas) {
                const dataUrl = canvas.toDataURL('image/png');
                const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
                qrFolder.file(`qrcode_${i + 1}.png`, base64Data, { base64: true });
            }
        }
    }
    
    let csvContent = "ID,Data,Timestamp\n";
    bulkQRItems.forEach((item, index) => {
        csvContent += `${index + 1},"${item.data.replace(/"/g, '""')}",${new Date().toISOString()}\n`;
    });
    qrFolder.file("qr_data.csv", csvContent);
    
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `qr_codes_${Date.now()}.zip`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    showNotification(`Downloaded ${bulkQRItems.length} QR codes as ZIP`, 'success');
}

function exportQRToExcel() {
    if (bulkQRItems.length === 0) {
        showNotification('No QR codes to export', 'warning');
        return;
    }
    
    const wb = XLSX.utils.book_new();
    
    const wsData = [
        ["QR Code Export", "", "", ""],
        ["Generated on", new Date().toLocaleString(), "", ""],
        ["", "", "", ""],
        ["ID", "QR Code Data", "Size", "Color", "Background Color", "Error Level"]
    ];
    
    bulkQRItems.forEach((item, index) => {
        wsData.push([
            index + 1,
            item.data,
            `${item.size}px`,
            item.color,
            item.bgColor,
            item.errorLevel
        ]);
    });
    
    wsData.push(["", "", "", "", "", ""]);
    wsData.push(["Total QR Codes", bulkQRItems.length, "", "", "", ""]);
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    XLSX.utils.book_append_sheet(wb, ws, "QR Codes");
    
    XLSX.writeFile(wb, `qr_codes_export_${Date.now()}.xlsx`);
    
    showNotification(`Exported ${bulkQRItems.length} QR codes to Excel`, 'success');
}

async function downloadAllBarcode() {
    if (bulkBarcodeItems.length === 0) {
        showNotification('No barcodes to download', 'warning');
        return;
    }
    
    showNotification(`Preparing ${bulkBarcodeItems.length} barcodes for download...`, 'info');
    
    const zip = new JSZip();
    const barcodeFolder = zip.folder("barcodes");
    
    for (let i = 0; i < bulkBarcodeItems.length; i++) {
        const item = bulkBarcodeItems[i];
        const container = document.getElementById(`bulk-barcode-item-${i}`);
        if (container) {
            const svg = container.querySelector('svg');
            if (svg) {
                const svgData = new XMLSerializer().serializeToString(svg);
                barcodeFolder.file(`barcode_${i + 1}.svg`, svgData);
            }
        }
    }
    
    let csvContent = "ID,Data,Format,Size,Height,Color\n";
    bulkBarcodeItems.forEach((item, index) => {
        csvContent += `${index + 1},"${item.data.replace(/"/g, '""')}",${item.format},${item.size},${item.height},${item.color}\n`;
    });
    barcodeFolder.file("barcode_data.csv", csvContent);
    
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `barcodes_${Date.now()}.zip`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    showNotification(`Downloaded ${bulkBarcodeItems.length} barcodes as ZIP`, 'success');
}

function exportBarcodeToExcel() {
    if (bulkBarcodeItems.length === 0) {
        showNotification('No barcodes to export', 'warning');
        return;
    }
    
    const wb = XLSX.utils.book_new();
    
    const wsData = [
        ["Barcode Export", "", "", ""],
        ["Generated on", new Date().toLocaleString(), "", ""],
        ["", "", "", ""],
        ["ID", "Barcode Data", "Format", "Size", "Height", "Color"]
    ];
    
    bulkBarcodeItems.forEach((item, index) => {
        wsData.push([
            index + 1,
            item.data,
            item.format,
            item.size,
            item.height,
            item.color
        ]);
    });
    
    wsData.push(["", "", "", "", "", ""]);
    wsData.push(["Total Barcodes", bulkBarcodeItems.length, "", "", "", ""]);
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    XLSX.utils.book_append_sheet(wb, ws, "Barcodes");
    
    XLSX.writeFile(wb, `barcodes_export_${Date.now()}.xlsx`);
    
    showNotification(`Exported ${bulkBarcodeItems.length} barcodes to Excel`, 'success');
}

function downloadSingleBulkItem(type, index) {
    let item, containerId;
    
    if (type === 'qr') {
        item = bulkQRItems[index];
        containerId = `bulk-qr-item-${index}`;
    } else {
        item = bulkBarcodeItems[index];
        containerId = `bulk-barcode-item-${index}`;
    }
    
    if (!item) return;
    
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const canvas = container.querySelector('canvas');
    const svg = container.querySelector('svg');
    
    if (canvas) {
        const link = document.createElement('a');
        link.download = `qrcode-${index + 1}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showNotification('QR code downloaded', 'success');
    } else if (svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `barcode-${index + 1}.svg`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        showNotification('Barcode downloaded', 'success');
    }
}

function copyBulkItemData(type, index) {
    let item;
    
    if (type === 'qr') {
        item = bulkQRItems[index];
    } else {
        item = bulkBarcodeItems[index];
    }
    
    if (item) {
        navigator.clipboard.writeText(item.data)
            .then(() => showNotification('Data copied to clipboard', 'success'))
            .catch(() => showNotification('Failed to copy data', 'error'));
    }
}

async function copyCode(type) {
    try {
        if (type === 'qr') {
            const canvas = document.querySelector('#qr-preview canvas');
            if (canvas) {
                canvas.toBlob(async (blob) => {
                    try {
                        await navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': blob })
                        ]);
                        showNotification('QR code copied to clipboard', 'success');
                    } catch (error) {
                        showNotification('Failed to copy QR code', 'error');
                    }
                });
            } else {
                showNotification('No QR code to copy', 'warning');
            }
        } else {
            const svg = document.querySelector('#barcode-svg');
            if (svg) {
                const svgData = new XMLSerializer().serializeToString(svg);
                await navigator.clipboard.writeText(svgData);
                showNotification('Barcode copied to clipboard', 'success');
            } else {
                showNotification('No barcode to copy', 'warning');
            }
        }
    } catch (error) {
        showNotification('Failed to copy', 'error');
    }
}

function downloadCode(type) {
    if (type === 'qr') {
        const canvas = document.querySelector('#qr-preview canvas');
        if (canvas) {
            const link = document.createElement('a');
            link.download = `qrcode-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showNotification('QR code downloaded', 'success');
        } else {
            showNotification('No QR code to download', 'warning');
        }
    } else {
        const svg = document.querySelector('#barcode-svg');
        if (svg) {
            const svgData = new XMLSerializer().serializeToString(svg);
            const blob = new Blob([svgData], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `barcode-${Date.now()}.svg`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
            showNotification('Barcode downloaded', 'success');
        } else {
            showNotification('No barcode to download', 'warning');
        }
    }
}

function showNotification(message, type = 'info') {
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => {
        if (notification.parentNode) {
            notification.remove();
        }
    });
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    const duration = type === 'success' ? 3000 : 4000;
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.4s ease';
            setTimeout(() => notification.remove(), 400);
        }
    }, duration);
}

function playScanSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function resetCameraUI() {
    document.getElementById('scanner-init').style.display = 'flex';
    document.querySelector('.preview-placeholder').style.display = 'none';
    isCameraActive = false;
    isStartingCamera = false;
}

window.downloadSingleBulkItem = downloadSingleBulkItem;
window.copyBulkItemData = copyBulkItemData;
window.removeFile = removeFile;
</script>
