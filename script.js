// DOM Elements (Defined at the top for easy access)
const jigNumberInput = document.getElementById('jigNumberInput');
const searchJigBtn = document.getElementById('searchJigBtn');

const jigDetailsDisplaySection = document.getElementById('jigDetailsDisplay');
const displayJigNumber = document.getElementById('displayJigNumber');
const displaySaleOrder = document.getElementById('displaySaleOrder');
const displayTopAssyNo = document.getElementById('displayTopAssyNo');
const displayLaunchingStatus = document.getElementById('displayLaunchingStatus');

const launchingStatusYesBtn = document.getElementById('launchingStatusYes'); 
const launchingStatusNoBtn = document.getElementById('launchingStatusNo');   

const shortageListBtn = document.getElementById('shortageListBtn');

const shortageListModal = document.getElementById('shortageListModal'); // This modal is back in use
const closeShortageModalBtn = document.getElementById('closeShortageModal'); 
const shortageModalOkBtn = document.getElementById('shortageModalOk'); 
const shortageTableBody = document.getElementById('shortageTableBody'); 
const noShortageMessage = document.getElementById('noShortageMessage'); 

const alertModal = document.getElementById('alertModal');
const closeModalBtn = document.getElementById('closeModal');
const modalOkBtn = document.getElementById('modalOk');
const sendAlertPlatformBtn = document.getElementById('sendAlertPlatformBtn'); 
const loadingSpinner = document.getElementById('loadingSpinner');

// NEW: Download as Excel button reference
const downloadShortageExcelBtn = document.getElementById('downloadShortageExcelBtn');


// Global state variables
let currentJigData = null; // Stores summary and details from /api/jig_details

// ********************************************************************************
// >>>>> IMPORTANT FIX: Change this API_BASE_URL to your deployed Render URL's API endpoint <<<<<
// ********************************************************************************
// You MUST replace 'https://hal-jig-tracker.onrender.com' with your EXACT Render service URL.
// For example, if your Render URL is 'https://my-awesome-app.onrender.com',
// then API_BASE_URL should be 'https://my-awesome-app.onrender.com/api'.
const API_BASE_URL = 'https://hal-jig-tracker.onrender.com/api'; 
// ********************************************************************************


// --- CORE UTILITY FUNCTIONS (MUST BE DEFINED FIRST) ---

// Displays alerts in a modal
function showAlert(title, message, type) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    sendAlertPlatformBtn.classList.add('hidden'); // Hide by default within showAlert
    alertModal.classList.remove('hidden');
    // Add entrance animation
    const modalContent = alertModal.querySelector('.modal-content');
    modalContent.style.transform = 'scale(0.8) translateY(-50px)';
    modalContent.style.opacity = '0';
    requestAnimationFrame(() => {
        modalContent.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        modalContent.style.transform = 'scale(1)';
        modalContent.style.opacity = '1';
    });
}

// Closes the general alert modal
function closeModalFunction() {
    const modalContent = alertModal.querySelector('.modal-content');
    modalContent.style.transform = 'scale(0.8) translateY(-50px)';
    modalContent.style.opacity = '0';
    setTimeout(() => {
        alertModal.classList.add('hidden');
        modalContent.style.transform = '';
        modalContent.style.opacity = '';
        modalContent.style.transition = '';
    }, 300);
}

// Shows/hides the loading spinner
function showLoading(show) {
    if (show) {
        loadingSpinner.classList.remove('hidden');
        const spinner = loadingSpinner.querySelector('.spinner');
        spinner.style.transform = 'scale(0.5)';
        spinner.style.opacity = '0';
        requestAnimationFrame(() => {
            spinner.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
            spinner.style.transform = 'scale(1)';
            spinner.style.opacity = '1';
        });
    } else {
        const spinner = loadingSpinner.querySelector('.spinner');
        spinner.style.transform = 'scale(0.5)';
        spinner.style.opacity = '0';
        setTimeout(() => {
            loadingSpinner.classList.add('hidden');
            spinner.style.transform = '';
            spinner.style.opacity = '';
            spinner.style.transition = '';
        }, 300);
    }
}

// Resets sections to initial state (hides details, modals)
function resetSections(clearInput = true) {
    jigDetailsDisplaySection.classList.add('hidden');
    shortageListModal.classList.add('hidden'); 
    alertModal.classList.add('hidden');
    if (clearInput) {
        jigNumberInput.value = '';
    }
    currentJigData = null; // Clear current jig data
    // Reset styles to allow re-animation
    [jigDetailsDisplaySection, shortageListModal, alertModal].forEach(section => {
        section.style.opacity = '';
        section.style.transform = '';
        section.style.transition = '';
    });
}

// Clears form and resets sections
function clearForm() {
    resetSections(true); // Clear input
    jigNumberInput.focus();
    jigNumberInput.style.transform = 'scale(0.95)';
    setTimeout(() => { jigNumberInput.style.transform = ''; }, 150);
}

// Creates particle effect for buttons
function createParticleEffect(element) {
    const rect = element.getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
        const particle = document.createElement('div');
        particle.style.position = 'fixed';
        particle.style.width = '4px';
        particle.style.height = '4px';
        particle.style.background = '#f97316';
        particle.style.borderRadius = '50%';
        particle.style.pointerEvents = 'none';
        particle.style.zIndex = '9999';
        particle.style.left = rect.left + rect.width / 2 + 'px';
        particle.style.top = rect.top + rect.height / 2 + 'px';
        document.body.appendChild(particle);
        const angle = (i / 6) * Math.PI * 2;
        const velocity = 80;
        const vx = Math.cos(angle) * velocity;
        const vy = Math.sin(angle) * velocity;
        let x = 0, y = 0, opacity = 1;
        const animate = () => {
            x += vx * 0.02;
            y += vy * 0.02;
            opacity -= 0.03;
            particle.style.transform = `translate(${x}px, ${y}px)`;
            particle.style.opacity = opacity;
            if (opacity > 0) { requestAnimationFrame(animate); } else { document.body.removeChild(particle); }
        };
        animate();
    }
}


// Generic Send Alert Function (handles Telegram, Email is removed, WhatsApp simulation)
async function sendAlert(platform, alertDataObject, contextDescription) {
    // Determine the ID to use in the alert message
    const idForAlert = alertDataObject.testerJigNumber || alertDataObject.partNumber || alertDataObject.testerId || 'N/A'; 
    if (idForAlert === 'N/A') {
        console.error('sendAlert: Missing alertDataObject or its identifier (testerJigNumber/partNumber/testerId).');
        showAlert('Error', 'Cannot send alert: Jig/Part ID is missing.', 'error');
        return;
    }

    const unitNameForAlert = alertDataObject.unitName || 'N/A';
    const requiredQtyForAlert = alertDataObject.requiredQuantity !== undefined ? alertDataObject.requiredQuantity : 'N/A';
    const currentStockForAlert = alertDataObject.currentStock !== undefined ? alertDataObject.currentStock : 'N/A';
    const availabilityStatusForAlert = alertDataObject.availabilityStatus || 'N/A';
    const officialInchargeForAlert = alertDataObject.officialIncharge || 'N/A'; // Important for WhatsApp simulation

    let alertMessage = `🚨 HAL DELIVERY ALERT 🚨\n\n` +
                       `Context: ${contextDescription}\n` +
                       `ID: ${idForAlert}\n` +
                       `Unit: ${unitNameForAlert}\n`;
                       
    if (platform === 'whatsapp_simulation') { // Only add availability status for non-generic alerts
         alertMessage += `Availability Status: ${availabilityStatusForAlert}\n`;
    }

    // Add quantities only if they are valid numbers
    if (typeof requiredQtyForAlert === 'number' && typeof currentStockForAlert === 'number') {
        alertMessage += `Required Quantity: ${requiredQtyForAlert}\n`;
        alertMessage += `Current Stock: ${currentStockForAlert}\n\n`;
    } else {
        alertMessage += `Quantity Details: N/A\n\n`;
    }

    alertMessage += `Immediate attention required for delivery verification.\n\n` +
                    `Generated by HAL Tester Tracking System v2.0\n` +
                    `Hindustan Aeronautics Limited`;

    let endpoint = '';
    let successMessage = '';
    let errorMessage = '';
    let subject = `HAL Alert: ${contextDescription} - ${idForAlert} - PENDING ACTION`; // For Email subject (though email removed)

    // Update the button in the general alert modal while sending
    sendAlertPlatformBtn.classList.remove('hidden'); 
    sendAlertPlatformBtn.disabled = true;

    if (platform === 'telegram') {
        endpoint = `${API_BASE_URL}/send_telegram_alert`;
        successMessage = 'Telegram alert sent successfully!';
        errorMessage = 'Failed to send Telegram alert.';
        sendAlertPlatformBtn.innerHTML = '<i class="fab fa-telegram-plane"></i> <span>Sending Telegram...</span>';
    } else if (platform === 'email') { // Email functionality removed from frontend
        console.warn('Email alerts are disabled in frontend.');
        sendAlertPlatformBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <span>Email Disabled</span>';
        sendAlertPlatformBtn.disabled = false;
        showAlert('Email Disabled', 'Email alerts are currently disabled in the system configuration.', 'warning');
        return; 
    } else if (platform === 'whatsapp_simulation') {
        endpoint = `${API_BASE_URL}/send_whatsapp_alert`;
        successMessage = 'WhatsApp alert simulation successful!';
        errorMessage = 'Failed to send WhatsApp simulation.';
        sendAlertPlatformBtn.innerHTML = '<i class="fab fa-whatsapp"></i> <span>Sending WhatsApp...</span>';
        
        if (!officialInchargeForAlert || officialInchargeForAlert === 'N/A') {
             showAlert('Error', 'Cannot send WhatsApp alert: Official Incharge number is missing/invalid.', 'error');
             sendAlertPlatformBtn.innerHTML = '<i class="fab fa-whatsapp"></i> <span>Send Alert</span>'; // Revert button
             sendAlertPlatformBtn.disabled = false;
             return;
        }
    } else {
        showAlert('Error', 'Unsupported alert platform specified.', 'error');
        sendAlertPlatformBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <span>Error</span>';
        sendAlertPlatformBtn.disabled = false;
        return;
    }

    try {
        const payload = {};
        if (platform === 'email') { // This block will not be executed due to the 'return' above
            payload.body = alertMessage;
            payload.subject = subject;
        } else {
            payload.message = alertMessage;
        }
        if (platform === 'whatsapp_simulation') {
            payload.testerId = idForAlert;
            payload.officialIncharge = officialInchargeForAlert;
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            showAlert('Alert Notification Dispatched', successMessage, 'success');
        } else {
            showAlert('Alert Error', `${errorMessage} ${data.message || ''}`, 'error');
        }
    } catch (error) {
        console.error(`Error sending ${platform} alert:`, error);
        showAlert(
            'Network Error',
            `Could not connect to backend server at ${API_BASE_URL}. Please ensure the server is running and accessible.`,
            'error'
        );
    } finally {
        sendAlertPlatformBtn.innerHTML = '<i class="fab fa-whatsapp"></i> <span>Send Alert</span>'; // Reset to generic "Send Alert"
        sendAlertPlatformBtn.classList.add('hidden'); // Hide it again by default after sending
        sendAlertPlatformBtn.disabled = false;
    }
}


// --- MAIN LOGIC FUNCTIONS (CAN BE CALLED AFTER UTILITIES ARE DEFINED) ---

// Main search function for Tester Jig Number
async function searchJigDetails() {
    const jigNumberValue = jigNumberInput.value.trim();

    if (!jigNumberValue) {
        showAlert('Input Required', 'Please enter a Tester Jig Number to search.', 'warning');
        return;
    }

    resetSections(false); // Reset all sections except the input itself
    showLoading(true);

    try {
        // This is where the API call is made. It uses the API_BASE_URL.
        const response = await fetch(`${API_BASE_URL}/jig_details/${jigNumberValue}`);
        const data = await response.json();

        showLoading(false);

        if (response.ok) {
            currentJigData = data; // Store both summary and details
            displayJigSummary(currentJigData.summary);
            jigDetailsDisplaySection.classList.remove('hidden'); // Show the jig details section
            jigDetailsDisplaySection.classList.add('fade-in');
            
            // NOTE: Launching status is now set by user click, not determined by backend initially.
            // The display element will show the default '--' until user interacts.

        } else {
            currentJigData = null;
            displayJigSummary({ // Display 'Not Found' state
                testerJigNumber: jigNumberValue,
                saleOrder: 'N/A',
                topAssyNo: 'N/A',
                launchingStatus: '--' // Initial state for user input
            });
            jigDetailsDisplaySection.classList.remove('hidden'); // Still show section with 'Not Found'
            showAlert(
                'Jig Not Found',
                `No details found for Tester Jig Number: ${jigNumberValue}. Please verify the number.`,
                'warning'
            );
        }
    } catch (error) {
        console.error('Error fetching jig details:', error);
        showLoading(false);
        showAlert(
            'Network Error',
            `Could not connect to the backend server at ${API_BASE_URL}. Please ensure the server is running and accessible.`,
            'error'
        );
        currentJigData = null;
        displayJigSummary({ // Display error state
            testerJigNumber: jigNumberValue,
            saleOrder: 'Error',
            topAssyNo: 'Error',
            launchingStatus: 'Error'
        });
        jigDetailsDisplaySection.classList.remove('hidden');
    }
}

// Displays the summary details of the jig
function displayJigSummary(summary) {
    displayJigNumber.textContent = summary.testerJigNumber;
    displaySaleOrder.textContent = summary.saleOrder;
    displayTopAssyNo.textContent = summary.topAssyNo;
    displayLaunchingStatus.textContent = '--'; // Initial state before user input
    displayLaunchingStatus.className = 'status-badge status-unknown'; // Initial status class
}

// Handles the user-driven Launching Status selection
async function handleLaunchingStatus(isLaunched) {
    if (!currentJigData || !currentJigData.summary || !currentJigData.summary.testerJigNumber) {
        showAlert('Jig Not Found', 'Please search for a Tester Jig Number first before setting launching status.', 'warning');
        return;
    }

    showLoading(true);
    const clickedBtn = isLaunched ? launchingStatusYesBtn : launchingStatusNoBtn;
    createParticleEffect(clickedBtn);
    clickedBtn.style.transform = 'scale(0.95)';
    setTimeout(() => { clickedBtn.style.transform = ''; }, 150);

    const newStatusText = isLaunched ? 'Launched' : 'Not Launched';
    const newStatusClass = `status-badge ${isLaunched ? 'status-delivered' : 'status-pending'}`;

    displayLaunchingStatus.textContent = newStatusText;
    displayLaunchingStatus.className = newStatusClass;

    if (!isLaunched) {
        // If not launched, send Telegram alert
        showAlert(
            'Launching Status Alert',
            `Tester Jig Number ${currentJigData.summary.testerJigNumber} is marked as NOT launched. A Telegram alert will be sent.`,
            'alert'
        );
        sendAlert('telegram', currentJigData.summary, "Tester Jig Launching Status (User Input)");
    } else {
        showAlert('Launching Confirmed', `Tester Jig Number ${currentJigData.summary.testerJigNumber} is confirmed as Launched.`, 'success');
    }
    
    showLoading(false);
}


// Shows the shortage list modal with parts for the current jig
async function showShortageListModal() {
    if (!currentJigData || !currentJigData.details || currentJigData.details.length === 0) {
        showAlert('No Jig Data', 'Please search for a Tester Jig Number first to view the shortage list.', 'warning');
        return;
    }

    shortageTableBody.innerHTML = ''; // Clear previous entries
    let hasActualShortages = false; // Flag to determine if any "Shortage" or "Critical Shortage" exists

    // Sort parts to show critical/shortage first
    const sortedParts = [...currentJigData.details].sort((a, b) => { // Use spread to avoid modifying original array
        const statusOrder = { "Critical Shortage": 1, "Shortage": 2, "Pending": 3, "Adequate": 4, "Surplus": 5, "N/A": 6, "Unknown": 7 };
        return statusOrder[a.availabilityStatus] - statusOrder[b.availabilityStatus];
    });

    sortedParts.forEach(part => {
        // Check for shortage/surplus statuses, not just critical shortage
        if (part.availabilityStatus === "Critical Shortage" || part.availabilityStatus === "Shortage" || part.availabilityStatus === "Surplus") {
            hasActualShortages = true;
        }

        const row = document.createElement('tr');
        let rowClass = '';
        // Use availabilityStatus directly for class name, after cleaning
        const availabilityStatusCleaned = part.availabilityStatus ? part.availabilityStatus.toLowerCase().replace(/ /g, '_') : 'n_a';

        if (availabilityStatusCleaned === "critical_shortage") {
            rowClass = 'critical-shortage-row';
        } else if (availabilityStatusCleaned === "shortage") {
            rowClass = 'shortage-row';
        } else if (availabilityStatusCleaned === "surplus") {
            rowClass = 'surplus-row';
        }
        row.className = rowClass;

        let actionRequiredText = 'N/A';
        if (part.availabilityStatus === "Shortage") {
            actionRequiredText = `Missing ${part.requiredQuantity - part.currentStock} units.`;
        } else if (part.availabilityStatus === "Critical Shortage") {
            actionRequiredText = 'Immediate action: ZERO stock!';
        } else if (part.availabilityStatus === "Surplus") {
            actionRequiredText = `Surplus of ${part.currentStock - part.requiredQuantity} units.`;
        } else if (part.availabilityStatus === "Adequate") {
            actionRequiredText = 'Quantity is adequate.';
        }

        row.innerHTML = `
            <td>${part.testerId || '--'}</td>
            <td>${part.unitName || '--'}</td>
            <td>${part.requiredQuantity !== undefined ? part.requiredQuantity : '--'}</td>
            <td>${part.currentStock !== undefined ? part.currentStock : '--'}</td>
            <td><span class="status-badge status-${availabilityStatusCleaned}">${part.availabilityStatus || 'N/A'}</span></td>
            <td>${actionRequiredText}</td>
        `;
        shortageTableBody.appendChild(row);
    });

    if (hasActualShortages) {
        noShortageMessage.classList.add('hidden');
        // Trigger Telegram alert for shortage
        showAlert(
            'Shortage Detected!', 
            `Shortages or surpluses found for Tester Jig Number: ${currentJigData.summary.testerJigNumber}. A Telegram alert will be sent.`, 
            'alert'
        );
        sendAlert('telegram', currentJigData.summary, "Shortage List Displayed");
    } else {
        noShortageMessage.classList.remove('hidden'); 
        noShortageMessage.textContent = 'All components have adequate stock for this Tester Jig.';
        showAlert('No Shortages', 'All components have adequate stock for this Tester Jig.', 'success');
    }

    shortageListModal.classList.remove('hidden');
    shortageListModal.classList.add('fade-in');
}

// Hides the shortage list modal
function hideShortageListModal() {
    shortageListModal.classList.add('hidden');
}


// Handles the click on send alert button in the general alert modal.
// This button is now generic and its behavior depends on current context.
// In the current flow, this button is less prominent as alerts are mostly auto-triggered.
// It will default to a WhatsApp simulation for the *first part* of the current jig data's details.
async function handleSendAlertPlatformClick() {
    if (currentJigData && currentJigData.details && currentJigData.details.length > 0) {
        const firstPart = currentJigData.details[0]; // Take the first part as a representative
        sendAlert('whatsapp_simulation', firstPart, "Manual Part Alert (Jig)");
    } else {
        showAlert('Error', 'No jig part data available to send a specific alert.', 'error');
    }
}

// NEW: Function to trigger Excel download
function downloadShortageExcel() {
    if (!currentJigData || !currentJigData.summary || !currentJigData.summary.testerJigNumber) {
        showAlert('Error', 'No jig data available to download shortage list.', 'warning');
        return;
    }
    const jigNumber = currentJigData.summary.testerJigNumber;
    const downloadUrl = `${API_BASE_URL}/download_shortage_excel/${jigNumber}`;
    window.location.href = downloadUrl; // This will trigger the file download
}


// --- EVENT LISTENERS (ATTACHED AFTER ALL FUNCTIONS ARE DEFINED) ---

document.addEventListener('DOMContentLoaded', function() {
    console.log('HAL Tester Jig Tracking System v2.0 initialized');
    console.log('Professional Interface Loaded - Hindustan Aeronautics Limited');
    
    resetSections(true); // Clear input on initial load

    // Focus on the input field with animation
    setTimeout(() => {
        jigNumberInput.focus();
        jigNumberInput.style.transform = 'scale(1.02)';
        setTimeout(() => {
            jigNumberInput.style.transform = '';
        }, 200);
    }, 500);
    
    // Add welcome animation for cards - adjust delay due to new initial state
    const cards = document.querySelectorAll('.glass-card');
    cards.forEach((card, index) => {
        // Only animate the input section card on initial load
        if (card.closest('.input-section')) { 
            card.style.opacity = '0';
            card.style.transform = 'translateY(30px)';
            
            setTimeout(() => {
                card.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * 200 + 700); 
        }
    });
});

// Attach primary event listeners
jigNumberInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchJigDetails();
    }
});
searchJigBtn.addEventListener('click', searchJigDetails); 

launchingStatusYesBtn.addEventListener('click', () => handleLaunchingStatus(true)); 
launchingStatusNoBtn.addEventListener('click', () => handleLaunchingStatus(false));   

shortageListBtn.addEventListener('click', showShortageListModal); // Modal is back

closeShortageModalBtn.addEventListener('click', hideShortageListModal);
shortageModalOkBtn.addEventListener('click', closeModalFunction); 

closeModalBtn.addEventListener('click', closeModalFunction);
modalOkBtn.addEventListener('click', closeModalFunction);
sendAlertPlatformBtn.addEventListener('click', (e) => {
    createParticleEffect(e.currentTarget);
    handleSendAlertPlatformClick();
});

// NEW: Event listener for the download Excel button
downloadShortageExcelBtn.addEventListener('click', (e) => {
    createParticleEffect(e.currentTarget);
    downloadShortageExcel(); // Call the new download function
});


// Auto-format jig number input (already defined above DOMContentLoaded, but placing listener here)
jigNumberInput.addEventListener('input', (e) => {
    let value = e.target.value.toUpperCase();
    e.target.value = value;
});

// Add input focus effects (already defined above DOMContentLoaded, but placing listener here)
jigNumberInput.addEventListener('focus', () => {
    jigNumberInput.parentElement.classList.add('focused');
});

jigNumberInput.addEventListener('blur', () => {
    jigNumberInput.parentElement.classList.remove('focused');
});


// Enhanced keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModalFunction();
        hideShortageListModal(); // Re-added hideShortageListModal()
    }
    
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        clearForm();
        jigNumberInput.focus();
    }
    
    if (e.key === 'Enter' && document.activeElement === jigNumberInput) {
        searchJigDetails();
    }
});

// Auto-save functionality with enhanced local storage
setInterval(() => {
    if (jigNumberInput.value.trim() !== '' && currentJigData) {
        const sessionData = {
            jigNumber: jigNumberInput.value.trim(),
            lastSearchData: currentJigData.summary,
            timestamp: new Date().toISOString(),
            version: '2.0'
        };
        localStorage.setItem('hal_current_session', JSON.stringify(sessionData));
        console.log('Session auto-saved:', sessionData.jigNumber);
    }

    const saveIndicator = document.createElement('div');
    saveIndicator.textContent = '💾 Auto-saved';
    saveIndicator.style.position = 'fixed';
    saveIndicator.style.bottom = '20px';
    saveIndicator.style.right = '20px';
    saveIndicator.style.fontSize = '14px';
    saveIndicator.style.padding = '8px 12px';
    saveIndicator.style.backgroundColor = 'rgba(16, 185, 129, 0.8)';
    saveIndicator.style.color = 'white';
    saveIndicator.style.borderRadius = '8px';
    saveIndicator.style.opacity = '0';
    saveIndicator.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    saveIndicator.style.transform = 'translateY(20px)';
    saveIndicator.style.zIndex = '1000';
    
    document.body.appendChild(saveIndicator);
    
    requestAnimationFrame(() => {
        saveIndicator.style.opacity = '1';
        saveIndicator.style.transform = 'translateY(0)';
        setTimeout(() => {
            saveIndicator.style.opacity = '0';
            saveIndicator.style.transform = 'translateY(20px)';
            setTimeout(() => {
                document.body.removeChild(saveIndicator); // Corrected this line
            }, 300);
        }, 1500);
    });
}, 45000);

// Export enhanced functions for external use
window.HALTrackingSystem = {
    searchJigDetails,
    clearForm,
    getCurrentJigData: () => currentJigData,
    exportSession: () => {
        return {
            jigNumber: jigNumberInput.value.trim(),
            lastSearchData: currentJigData ? currentJigData.summary : null,
            timestamp: new Date().toISOString(),
            version: '2.0'
        };
    }
};

// Add smooth scrolling for better UX
document.documentElement.style.scrollBehavior = 'smooth';

// Add intersection observer for animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !entry.target.classList.contains('fade-in')) {
            entry.target.classList.add('fade-in');
        }
    });
}, observerOptions);

document.querySelectorAll('.glass-card').forEach(card => {
    observer.observe(card);
});