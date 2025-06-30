// DOM Elements
const jigNumberInput = document.getElementById('jigNumberInput');
const searchJigBtn = document.getElementById('searchJigBtn');

const jigDetailsDisplaySection = document.getElementById('jigDetailsDisplay');
const displayJigNumber = document.getElementById('displayJigNumber');
const displaySaleOrders = document.getElementById('displaySaleOrders');
const displayTopAssyNo = document.getElementById('displayTopAssyNo'); // FIX: Corrected typo
const displayLaunchingStatus = document.getElementById('displayLaunchingStatus');

const shortageListBtn = document.getElementById('shortageListBtn');

const shortageListModal = document.getElementById('shortageListModal');
const closeShortageModalBtn = document.getElementById('closeShortageModal');
const shortageModalOkBtn = document.getElementById('shortageModalOk');

const shortageTableBody = document.getElementById('shortageTableBody');
const noShortageMessage = document.getElementById('noShortageMessage');

const alertModal = document.getElementById('alertModal');
const closeModalBtn = document.getElementById('closeModal');
const modalOkBtn = document.getElementById('modalOk');
const sendAlertPlatformBtn = document.getElementById('sendAlertPlatformBtn');
const loadingSpinner = document.getElementById('loadingSpinner');

const downloadAllPartsExcelBtn = document.getElementById('downloadAllPartsExcelBtn');


let currentTesterId = null;
let currentSaleOrders = []; // Stores the list of Sale Orders for currentTesterId (for display)
let currentJigAllPartsData = null; // IMPORTANT: Stores all parts data from /api/all_parts_for_jig/


const API_BASE_URL = 'https://hal-jig-tracker.onrender.com/api'; // IMPORTANT: Your Render URL


// --- CORE UTILITY FUNCTIONS ---

function showAlert(title, message, type) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    sendAlertPlatformBtn.classList.add('hidden');
    alertModal.classList.remove('hidden');
    const modalContent = alertModal.querySelector('.modal-content');
    modalContent.style.transform = 'scale(0.8) translateY(-50px)';
    modalContent.style.opacity = '0';
    requestAnimationFrame(() => {
        modalContent.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        modalContent.style.transform = 'scale(1)';
        modalContent.style.opacity = '1';
    });
}

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

function resetSections(clearInput = true) {
    jigDetailsDisplaySection.classList.add('hidden');
    shortageListModal.classList.add('hidden');
    alertModal.classList.add('hidden');
    if (clearInput) {
        jigNumberInput.value = '';
    }
    currentTesterId = null;
    currentSaleOrders = [];
    currentJigAllPartsData = null; // Clear all parts data
    
    displaySaleOrders.innerHTML = '<span>--</span>';

    shortageTableBody.innerHTML = '';
    noShortageMessage.classList.add('hidden');
    document.getElementById('shortageModalTitle').textContent = 'All Parts List';
    
    [jigDetailsDisplaySection, shortageListModal, alertModal].forEach(section => {
        section.style.opacity = '';
        section.style.transform = '';
        section.style.transition = '';
    });
}

function clearForm() {
    resetSections(true);
    jigNumberInput.focus();
    jigNumberInput.style.transform = 'scale(0.95)';
    setTimeout(() => { jigNumberInput.style.transform = ''; }, 150);
}

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


async function sendAlert(platform, alertDataObject, contextDescription) {
    const idForAlert = alertDataObject.testerJigNumber || 'N/A';
    if (idForAlert === 'N/A') {
        console.error('sendAlert: Missing alertDataObject or its identifier (testerJigNumber).');
        showAlert('Error', 'Cannot send alert: Tester Jig ID is missing.', 'error');
        return;
    }

    let alertMessage = `🚨 HAL Alert: ${contextDescription}\n` +
                       `Tester Jig ID: ${idForAlert}`;

    let endpoint = '';
    let successMessage = '';
    let errorMessage = '';

    sendAlertPlatformBtn.classList.remove('hidden');
    sendAlertPlatformBtn.disabled = true;

    if (platform === 'telegram') {
        endpoint = `${API_BASE_URL}/send_telegram_alert`;
        successMessage = 'Telegram alert sent successfully!';
        errorMessage = 'Failed to send Telegram alert.';
        sendAlertPlatformBtn.innerHTML = '<i class="fab fa-telegram-plane"></i> <span>Sending Telegram...</span>';
    } else if (platform === 'whatsapp_simulation') {
        endpoint = `${API_BASE_URL}/send_whatsapp_alert`;
        successMessage = 'WhatsApp alert simulation successful!';
        errorMessage = 'Failed to send WhatsApp simulation.';
        sendAlertPlatformBtn.innerHTML = '<i class="fab fa-whatsapp"></i> <span>Sending WhatsApp...</span>';

        const officialInchargeForAlert = alertDataObject.officialIncharge || 'N/A';
        if (!officialInchargeForAlert || officialInchargeForAlert === 'N/A') {
             showAlert('Error', 'Cannot send WhatsApp alert: Official Incharge number is missing/invalid.', 'error');
             sendAlertPlatformBtn.innerHTML = '<i class="fab fa-whatsapp"></i> <span>Send Alert</span>';
             sendAlertPlatformBtn.disabled = false;
             return;
        }
        const whatsappPayloadData = {
            testerId: alertDataObject.testerId || idForAlert,
            officialIncharge: officialInchargeForAlert,
            message: alertMessage
        };

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(whatsappPayloadData)
            });
            const data = await response.json();
            if (response.ok) {
                showAlert('Alert Notification Dispatched', successMessage, 'success');
            } else {
                showAlert('Alert Error', `${errorMessage} ${data.message || ''}`, 'error');
            }
        } catch (error) {
            console.error(`Error sending ${platform} alert:`, error);
            showAlert('Network Error', `Could not connect to backend for WhatsApp simulation at ${API_BASE_URL}.`, 'error');
        } finally {
            sendAlertPlatformBtn.innerHTML = '<i class="fab fa-whatsapp"></i> <span>Send Alert</span>';
            sendAlertPlatformBtn.classList.add('hidden');
            sendAlertPlatformBtn.disabled = false;
        }
        return;
    } else {
        showAlert('Error', 'Unsupported alert platform specified.', 'error');
        sendAlertPlatformBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <span>Error</span>';
        sendAlertPlatformBtn.disabled = false;
        return;
    }

    try {
        const payload = { message: alertMessage };

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
        showAlert('Network Error', `Could not connect to backend server at ${API_BASE_URL}.`, 'error');
    } finally {
        sendAlertPlatformBtn.innerHTML = '<i class="fab fa-whatsapp"></i> <span>Send Alert</span>';
        sendAlertPlatformBtn.classList.add('hidden');
        sendAlertPlatformBtn.disabled = false;
    }
}


// --- MAIN LOGIC FUNCTIONS ---

async function searchJigDetails() {
    const jigNumberValue = jigNumberInput.value.trim();
    if (!jigNumberValue) {
        showAlert('Input Required', 'Please enter a Tester Jig Number to search.', 'warning');
        return;
    }

    resetSections(false);
    showLoading(true);
    currentTesterId = jigNumberValue;

    try {
        // Fetch Jig Summary and Sale Orders
        const jigDetailsResponse = await fetch(`${API_BASE_URL}/jig_details/${jigNumberValue}`);
        const jigDetailsData = await jigDetailsResponse.json();

        // Fetch ALL Parts for the current Tester Jig for launching status check and shortage display
        const allPartsResponse = await fetch(`${API_BASE_URL}/all_parts_for_jig/${jigNumberValue}`);
        const allPartsData = await allPartsResponse.json();
        
        console.log("DEBUG: Jig Details Data received:", jigDetailsData);
        console.log("DEBUG: All Parts Data received:", allPartsData);

        showLoading(false);

        if (jigDetailsResponse.ok && allPartsResponse.ok) {
            const jigSummary = jigDetailsData.summary;
            const saleOrders = jigDetailsData.saleOrders || [];
            currentSaleOrders = saleOrders;
            currentJigAllPartsData = allPartsData; // Store all parts data for direct use by shortage list

            displayJigSummary(jigSummary, currentSaleOrders);
            jigDetailsDisplaySection.classList.remove('hidden');
            jigDetailsDisplaySection.classList.add('fade-in');

            // --- Automatic Launching Status Detection ---
            let isOverallLaunched = true;
            let firstShortageSaleOrder = null;

            if (!Array.isArray(currentJigAllPartsData) || currentJigAllPartsData.length === 0) {
                 isOverallLaunched = false; // If no parts data, or empty, consider not launched
                 firstShortageSaleOrder = "No Parts Data Found";
                 console.log("Launching Status: Not Launched (No parts data found)");
            } else {
                for (const part of currentJigAllPartsData) { // Iterate through all parts
                    const status = part.availabilityStatus ? String(part.availabilityStatus).trim() : '';
                    if (status === "Shortage" || status === "Critical Shortage") {
                        isOverallLaunched = false;
                        firstShortageSaleOrder = part.sale_order; // Get the SO where shortage was found
                        console.log(`Launching Status: Not Launched (Shortage/Critical Shortage in SO: ${firstShortageSaleOrder}, Part: ${part.part_number}, Status: ${status})`);
                        break; // Found a shortage, no need to check further parts
                    }
                }
                if (isOverallLaunched) {
                     console.log("Launching Status: Launched (All parts adequate/surplus)");
                }
            }
            // --- End Automatic Launching Status Detection ---

            const newStatusText = isOverallLaunched ? 'Yes' : 'No';
            const newStatusClass = `status-badge ${isOverallLaunched ? 'status-delivered' : 'status-pending'}`;
            displayLaunchingStatus.textContent = newStatusText;
            displayLaunchingStatus.className = newStatusClass;

            if (!isOverallLaunched) {
                sendAlert('telegram', jigSummary, `Tester detected as NOT launched (Shortage in SO: ${firstShortageSaleOrder})`);
            } else {
                showAlert('Launching Confirmed', `Tester Jig Number ${jigSummary.testerJigNumber} has all required parts across all Sale Orders and is considered Launched.`, 'success');
            }

        } else {
            // Handle cases where either jigDetails or allParts fetch failed
            const errorMessage = jigDetailsData.message || allPartsData.message || 'Unknown error occurred.';
            showAlert('Search Error', `Failed to retrieve all jig details: ${errorMessage}`, 'error');
            
            currentTesterId = null;
            currentSaleOrders = [];
            currentJigAllPartsData = null;
            displayJigSummary({ testerJigNumber: jigNumberValue, topAssyNo: 'N/A' }, []);
            displayLaunchingStatus.textContent = 'Error';
            displayLaunchingStatus.className = 'status-badge status-pending';
            jigDetailsDisplaySection.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error fetching jig details or all parts:', error);
        showLoading(false);
        showAlert(
            'Network Error',
            `Could not connect to the backend server at ${API_BASE_URL}. Please ensure the server is running and accessible.`,
            'error'
        );
        currentTesterId = null;
        currentSaleOrders = [];
        currentJigAllPartsData = null;
        displayJigSummary({ testerJigNumber: jigNumberValue, topAssyNo: 'Error' }, []);
        displayLaunchingStatus.textContent = 'Error';
        displayLaunchingStatus.className = 'status-badge status-pending';
        jigDetailsDisplaySection.classList.remove('hidden');
    }
}


function displayJigSummary(summary, saleOrders) {
    displayJigNumber.textContent = summary.testerJigNumber;
    displayTopAssyNo.textContent = summary.topAssyNo;

    displaySaleOrders.innerHTML = '';
    if (saleOrders && saleOrders.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'list-disc list-inside space-y-1';
        saleOrders.forEach(so => {
            const li = document.createElement('li');
            li.textContent = so;
            ul.appendChild(li);
        });
        displaySaleOrders.appendChild(ul);
    } else {
        const span = document.createElement('span');
        span.textContent = 'N/A';
        displaySaleOrders.appendChild(span);
    }
    displayLaunchingStatus.textContent = '--';
    displayLaunchingStatus.className = 'status-badge status-unknown';
}


async function showShortageListModal() {
    if (!currentTesterId || !currentJigAllPartsData) {
        showAlert('No Tester Selected', 'Please search for a Tester Jig Number first.', 'warning');
        return;
    }

    shortageTableBody.innerHTML = '';
    noShortageMessage.classList.add('hidden');
    showLoading(true); // Show loading while populating table (even if data is local)

    try {
        const allParts = currentJigAllPartsData; // Use already fetched data

        if (Array.isArray(allParts) && allParts.length > 0) {
            let hasActualShortages = false;

            const sortedParts = [...allParts].sort((a, b) => {
                const soCompare = String(a.sale_order).localeCompare(String(b.sale_order));
                if (soCompare !== 0) return soCompare;

                const statusOrder = { "Critical Shortage": 1, "Shortage": 2, "Pending": 3, "Adequate": 4, "Surplus": 5, "N/A": 6, "Unknown": 7 };
                return statusOrder[String(a.availabilityStatus).trim()] - statusOrder[String(b.availabilityStatus).trim()];
            });


            sortedParts.forEach(part => {
                const status = part.availabilityStatus ? String(part.availabilityStatus).trim() : '';
                if (status === "Critical Shortage" || status === "Shortage" || status === "Surplus") {
                    hasActualShortages = true;
                }

                const row = document.createElement('tr');
                let rowClass = '';
                const availabilityStatusCleaned = status.toLowerCase().replace(/ /g, '_');

                if (availabilityStatusCleaned === "critical_shortage") {
                    rowClass = 'critical-shortage-row';
                } else if (availabilityStatusCleaned === "shortage") {
                    rowClass = 'shortage-row';
                } else if (availabilityStatusCleaned === "surplus") {
                    rowClass = 'surplus-row';
                }
                row.className = rowClass;

                let actionRequiredText = 'N/A';
                const required = Number(part.requiredQuantity);
                const current = Number(part.currentStock);

                if (!isNaN(required) && !isNaN(current)) {
                    if (status === "Shortage") {
                        actionRequiredText = `Missing ${required - current} units.`;
                    } else if (status === "Critical Shortage") {
                        actionRequiredText = 'Immediate action: ZERO stock!';
                    } else if (status === "Surplus") {
                        actionRequiredText = `Surplus of ${current - required} units.`;
                    } else if (status === "Adequate") {
                        actionRequiredText = 'NILL';
                    }
                } else {
                    actionRequiredText = 'Quantity data unavailable/invalid.';
                }
                console.log(`Frontend Part: ${part.part_number}, SO: ${part.sale_order}, Req: ${required}, Curr: ${current}, Status: '${status}', Action: '${actionRequiredText}'`);

                row.innerHTML = `
                    <td>${part.part_number || '--'}</td>
                    <td>${part.unitName || '--'}</td>
                    <td>${part.sale_order || '--'}</td>
                    <td>${part.requiredQuantity !== undefined ? part.requiredQuantity : '--'}</td>
                    <td>${part.currentStock !== undefined ? part.currentStock : '--'}</td>
                    <td><span class="status-badge status-${availabilityStatusCleaned}">${part.availabilityStatus || 'N/A'}</span></td>
                    <td>${actionRequiredText}</td>
                `;
                shortageTableBody.appendChild(row);
            });

            if (!hasActualShortages) {
                noShortageMessage.classList.remove('hidden');
                noShortageMessage.textContent = 'All components across all Sale Orders have adequate stock for this Tester Jig.';
            } else {
                noShortageMessage.classList.add('hidden');
            }

        } else {
            noShortageMessage.classList.remove('hidden');
            noShortageMessage.textContent = `No parts found for Tester Jig: ${currentTesterId}.`;
            shortageTableBody.innerHTML = '';
        }

    } catch (error) {
        console.error('Error populating all parts list:', error);
        showAlert('Error', 'Failed to display the comprehensive parts list.', 'error');
        shortageTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger-red">Error loading data.</td></tr>';
    } finally {
        showLoading(false);
    }

    shortageListModal.classList.remove('hidden');
    shortageListModal.classList.add('fade-in');
}


function hideShortageListModal() {
    shortageListModal.classList.add('hidden');
    shortageTableBody.innerHTML = '';
    noShortageMessage.classList.add('hidden');
    document.getElementById('shortageModalTitle').textContent = 'All Parts List';
}


function downloadAllPartsExcel() {
    if (!currentTesterId) {
        showAlert('Error', 'No Tester Jig Number selected.', 'warning');
        return;
    }
    const downloadUrl = `${API_BASE_URL}/download_all_parts_excel/${currentTesterId}`;
    window.location.href = downloadUrl;
}


// --- EVENT LISTENERS ---

document.addEventListener('DOMContentLoaded', function() {
    console.log('HAL Tester Jig Tracking System v2.0 initialized');
    console.log('Professional Interface Loaded - Hindustan Aeronautics Limited');

    resetSections(true);

    setTimeout(() => {
        jigNumberInput.focus();
        jigNumberInput.style.transform = 'scale(1.02)';
        setTimeout(() => { jigNumberInput.style.transform = ''; }, 200);
    }, 500);

    const cards = document.querySelectorAll('.glass-card');
    cards.forEach((card, index) => {
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


jigNumberInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { searchJigDetails(); }
});
searchJigBtn.addEventListener('click', searchJigDetails);

shortageListBtn.addEventListener('click', showShortageListModal);
closeShortageModalBtn.addEventListener('click', hideShortageListModal);
shortageModalOkBtn.addEventListener('click', hideShortageListModal);

closeModalBtn.addEventListener('click', closeModalFunction);
modalOkBtn.addEventListener('click', closeModalFunction);
sendAlertPlatformBtn.addEventListener('click', (e) => {
    createParticleEffect(e.currentTarget);
    handleSendAlertPlatformClick();
});

downloadAllPartsExcelBtn.addEventListener('click', (e) => {
    createParticleEffect(e.currentTarget);
    downloadAllPartsExcel();
});


jigNumberInput.addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
jigNumberInput.addEventListener('focus', () => { jigNumberInput.parentElement.classList.add('focused'); });
jigNumberInput.addEventListener('blur', () => { jigNumberInput.parentElement.classList.remove('focused'); });

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModalFunction();
        hideShortageListModal();
    }
    if (e.ctrlKey && e.key === 'r') { e.preventDefault(); clearForm(); jigNumberInput.focus(); }
    if (e.key === 'Enter' && document.activeElement === jigNumberInput) { searchJigDetails(); }
});

setInterval(() => {
    if (jigNumberInput.value.trim() !== '' && currentTesterId) {
        const sessionData = {
            jigNumber: jigNumberInput.value.trim(),
            lastSearchTesterId: currentTesterId,
            lastSearchSaleOrders: currentSaleOrders,
            timestamp: new Date().toISOString(),
            version: '2.0-all-parts-final-fix'
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
            setTimeout(() => { document.body.removeChild(saveIndicator); }, 300);
        }, 1500);
    });
}, 45000);

window.HALTrackingSystem = {
    searchJigDetails,
    clearForm,
    getCurrentData: () => ({ testerId: currentTesterId, saleOrders: currentSaleOrders }),
    exportSession: () => {
        return {
            jigNumber: jigNumberInput.value.trim(),
            lastSearchTesterId: currentTesterId,
            lastSearchSaleOrders: currentSaleOrders,
            timestamp: new Date().toISOString(),
            version: '2.0-all-parts-final-fix'
        };
    }
};

document.documentElement.style.scrollBehavior = 'smooth';

const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !entry.target.classList.contains('fade-in')) {
            entry.target.classList.add('fade-in');
        }
    });
}, observerOptions);
document.querySelectorAll('.glass-card').forEach(card => { observer.observe(card); });