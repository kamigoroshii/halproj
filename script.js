// DOM Elements
const jigNumberInput = document.getElementById('jigNumberInput');
const searchJigBtn = document.getElementById('searchJigBtn');

const jigDetailsDisplaySection = document.getElementById('jigDetailsDisplay');
const displayJigNumber = document.getElementById('displayJigNumber');
const displaySaleOrders = document.getElementById('displaySaleOrders'); // New element for multiple Sale Orders
const displayTopAssyNo = document.getElementById('displayTopAssyNo');
const displayLaunchingStatus = document.getElementById('displayLaunchingStatus');

const shortageListBtn = document.getElementById('shortageListBtn');

const shortageListModal = document.getElementById('shortageListModal');
const closeShortageModalBtn = document.getElementById('closeShortageModal');
const shortageModalOkBtn = document.getElementById('shortageModalOk'); // This button will have dynamic behavior

const selectSoInstruction = document.getElementById('selectSoInstruction'); // New element for instruction text
const saleOrderSelectionDiv = document.getElementById('saleOrderSelection'); // Container for Sale Order radio buttons

const specificShortageListDiv = document.getElementById('specificShortageList'); // Section to show the actual shortage table
const selectedSaleOrderSpan = document.getElementById('selectedSaleOrder'); // Span to display selected SO
const specificShortageTableBody = document.getElementById('specificShortageTableBody'); // Table body for specific SO
const noSpecificShortageMessage = document.getElementById('noSpecificShortageMessage'); // Message for no shortages in specific SO

const alertModal = document.getElementById('alertModal');
const closeModalBtn = document.getElementById('closeModal');
const modalOkBtn = document.getElementById('modalOk');
const sendAlertPlatformBtn = document.getElementById('sendAlertPlatformBtn');
const loadingSpinner = document.getElementById('loadingSpinner');

// NEW: Download as Excel button reference (specific to selected SO)
const downloadSpecificShortageExcelBtn = document.getElementById('downloadSpecificShortageExcelBtn');


// Global state variables
let currentTesterId = null; // Stores the Tester Jig Number from search
let currentSaleOrders = []; // Stores the list of Sale Orders for currentTesterId


// IMPORTANT: This URL MUST point to your deployed Render backend.
const API_BASE_URL = 'https://hal-jig-tracker.onrender.com/api'; // Make sure this is your actual Render URL + /api


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
    currentSaleOrders = []; // Clear Sale Orders
    // Reset modal states
    saleOrderSelectionDiv.classList.remove('hidden');
    selectSoInstruction.classList.remove('hidden');
    specificShortageListDiv.classList.add('hidden');
    document.getElementById('shortageModalTitle').textContent = 'Select Sale Order'; // Reset modal title
    downloadSpecificShortageExcelBtn.classList.add('hidden'); // Hide download button initially
    
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

        const officialInchargeForAlert = alertDataObject.officialIncharge || 'N/A'; // For WhatsApp, we need an incharge
        if (!officialInchargeForAlert || officialInchargeForAlert === 'N/A') {
             showAlert('Error', 'Cannot send WhatsApp alert: Official Incharge number is missing/invalid.', 'error');
             sendAlertPlatformBtn.innerHTML = '<i class="fab fa-whatsapp"></i> <span>Send Alert</span>';
             sendAlertPlatformBtn.disabled = false;
             return;
        }
        // Specific payload for WhatsApp simulation
        const whatsappPayloadData = {
            testerId: alertDataObject.testerId || idForAlert, // Use part's testerId if available, else jig ID
            officialIncharge: officialInchargeForAlert,
            message: alertMessage // Send the simplified message content
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
    currentTesterId = jigNumberValue; // Store the current Tester ID

    try {
        const response = await fetch(`${API_BASE_URL}/jig_details/${jigNumberValue}`);
        const data = await response.json();
        showLoading(false);

        if (response.ok) {
            const jigSummary = data.summary;
            const saleOrders = data.saleOrders || []; // Ensure it's an array

            currentSaleOrders = saleOrders; // Store the list of Sale Orders

            displayJigSummary(jigSummary, currentSaleOrders);
            jigDetailsDisplaySection.classList.remove('hidden');
            jigDetailsDisplaySection.classList.add('fade-in');

            // Now, automatically determine launching status by checking all sale orders
            let isOverallLaunched = true;
            let firstShortageSaleOrder = null;

            for (const so of currentSaleOrders) {
                // Fetch details for each SO to check for shortages
                const soResponse = await fetch(`${API_BASE_URL}/shortage_list/${jigNumberValue}/${so}`);
                const soParts = await soResponse.json();

                if (soResponse.ok && Array.isArray(soParts)) {
                    const hasInsufficientPartsInSO = soParts.some(part =>
                        part.availabilityStatus === "Shortage" || part.availabilityStatus === "Critical Shortage"
                    );
                    if (hasInsufficientPartsInSO) {
                        isOverallLaunched = false;
                        firstShortageSaleOrder = so; // Store the first SO with shortage
                        break; // Found a shortage, no need to check further SOs
                    }
                } else {
                    console.warn(`Could not fetch details for Sale Order ${so} of ${jigNumberValue}. Assuming launched for this SO.`);
                }
            }

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
            currentTesterId = null;
            currentSaleOrders = [];
            displayJigSummary({ testerJigNumber: jigNumberValue, topAssyNo: 'N/A' }, []);
            displayLaunchingStatus.textContent = 'Not Found';
            displayLaunchingStatus.className = 'status-badge status-unknown';
            jigDetailsDisplaySection.classList.remove('hidden');
            showAlert('Jig Not Found', `No details found for Tester Jig Number: ${jigNumberValue}. Please verify the number.`, 'warning');
        }
    } catch (error) {
        console.error('Error fetching jig details:', error);
        showLoading(false);
        showAlert('Network Error', `Could not connect to the backend server at ${API_BASE_URL}. Please ensure the server is running and accessible.`, 'error');
        currentTesterId = null;
        currentSaleOrders = [];
        displayJigSummary({ testerJigNumber: jigNumberValue, topAssyNo: 'Error' }, []);
        displayLaunchingStatus.textContent = 'Error';
        displayLaunchingStatus.className = 'status-badge status-pending';
        jigDetailsDisplaySection.classList.remove('hidden');
    }
}


function displayJigSummary(summary, saleOrders) {
    displayJigNumber.textContent = summary.testerJigNumber;
    displayTopAssyNo.textContent = summary.topAssyNo;

    displaySaleOrders.innerHTML = ''; // Clear previous content
    if (saleOrders && saleOrders.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'list-disc list-inside space-y-1'; // Basic styling for readability
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
    if (!currentTesterId || currentSaleOrders.length === 0) {
        showAlert('No Tester Selected', 'Please search for a Tester Jig Number first, and ensure it has associated Sale Orders.', 'warning');
        return;
    }

    saleOrderSelectionDiv.innerHTML = ''; // Clear previous options
    specificShortageListDiv.classList.add('hidden'); // Hide the table section initially
    downloadSpecificShortageExcelBtn.classList.add('hidden'); // Hide download button

    shortageListModal.classList.remove('hidden');
    shortageListModal.classList.add('fade-in');
    document.getElementById('shortageModalTitle').textContent = 'Select Sale Order';
    selectSoInstruction.classList.remove('hidden'); // Ensure instruction is visible
    saleOrderSelectionDiv.classList.remove('hidden'); // Ensure selection div is visible


    currentSaleOrders.forEach(saleOrder => {
        const wrapperDiv = document.createElement('div');
        wrapperDiv.className = 'flex items-center'; // For better alignment of radio button and label

        const radioBtn = document.createElement('input');
        radioBtn.type = 'radio';
        radioBtn.name = 'selectedSaleOrder'; // All radios in this group
        radioBtn.value = saleOrder;
        radioBtn.id = `so-${saleOrder}`;
        radioBtn.classList.add('form-radio', 'h-4', 'w-4', 'text-blue-600', 'focus:ring-blue-500', 'mr-2'); // Tailwind/custom styling

        const label = document.createElement('label');
        label.textContent = saleOrder;
        label.htmlFor = `so-${saleOrder}`;
        label.classList.add('text-neutral-200', 'font-medium', 'cursor-pointer');

        wrapperDiv.appendChild(radioBtn);
        wrapperDiv.appendChild(label);
        saleOrderSelectionDiv.appendChild(wrapperDiv);
    });

    // Change the OK button to trigger the fetch of the specific shortage list
    shortageModalOkBtn.onclick = async () => {
        const selectedRadio = document.querySelector('input[name="selectedSaleOrder"]:checked');
        if (selectedRadio) {
            const saleOrderValue = selectedRadio.value;
            selectedSaleOrderSpan.textContent = saleOrderValue; // Update the span
            await fetchSpecificShortageList(currentTesterId, saleOrderValue);

            document.getElementById('shortageModalTitle').textContent = 'Shortage & Availability List';
            selectSoInstruction.classList.add('hidden'); // Hide instruction
            saleOrderSelectionDiv.classList.add('hidden'); // Hide selection radios
            specificShortageListDiv.classList.remove('hidden'); // Show the table
            downloadSpecificShortageExcelBtn.classList.remove('hidden'); // Show download button
        } else {
            showAlert('Selection Required', 'Please select a Sale Order from the list.', 'warning');
        }
    };
}


async function fetchSpecificShortageList(testerId, saleOrder) {
    specificShortageTableBody.innerHTML = '';
    noSpecificShortageMessage.classList.add('hidden');
    showLoading(true);

    try {
        const response = await fetch(`${API_BASE_URL}/shortage_list/${testerId}/${saleOrder}`);
        const data = await response.json(); // This 'data' is the list of parts for the specific SO
        showLoading(false);

        if (response.ok && Array.isArray(data) && data.length > 0) {
            data.forEach(part => {
                const row = document.createElement('tr');
                const availabilityStatusCleaned = part.availabilityStatus ? part.availabilityStatus.toLowerCase().replace(/ /g, '_') : 'n_a';
                let rowClass = '';
                if (availabilityStatusCleaned === "critical_shortage") rowClass = 'critical-shortage-row';
                else if (availabilityStatusCleaned === "shortage") rowClass = 'shortage-row';
                else if (availabilityStatusCleaned === "surplus") rowClass = 'surplus-row';
                row.className = rowClass;

                let actionRequiredText = 'N/A';
                if (part.availabilityStatus === "Shortage") actionRequiredText = `Missing ${part.requiredQuantity - part.currentStock} units.`;
                else if (part.availabilityStatus === "Critical Shortage") actionRequiredText = 'Immediate action: ZERO stock!';
                else if (part.availabilityStatus === "Surplus") actionRequiredText = `Surplus of ${part.currentStock - part.requiredQuantity} units.`;
                else if (part.availabilityStatus === "Adequate") actionRequiredText = 'NILL'; // As per previous request

                row.innerHTML = `
                    <td>${part.part_number || '--'}</td> <td>${part.unitName || '--'}</td>
                    <td>${part.requiredQuantity !== undefined ? part.requiredQuantity : '--'}</td>
                    <td>${part.currentStock !== undefined ? part.currentStock : '--'}</td>
                    <td><span class="status-badge status-${availabilityStatusCleaned}">${part.availabilityStatus || 'N/A'}</span></td>
                    <td>${actionRequiredText}</td>
                `;
                specificShortageTableBody.appendChild(row);
            });
            noSpecificShortageMessage.classList.add('hidden');
        } else {
            noSpecificShortageMessage.classList.remove('hidden');
            noSpecificShortageMessage.textContent = `No parts or shortages found for Sale Order: ${saleOrder}`;
            specificShortageTableBody.innerHTML = ''; // Clear table body if no data
        }
    } catch (error) {
        console.error('Error fetching specific shortage list:', error);
        showLoading(false);
        showAlert('Error', 'Failed to fetch shortage list for the selected Sale Order.', 'error');
        specificShortageTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger-red">Error loading data.</td></tr>';
    }
}

// Ensure the OK button in the shortage modal closes the modal when the table is displayed
function setOkButtonToCloseModal() {
    shortageModalOkBtn.onclick = hideShortageListModal;
}


function hideShortageListModal() {
    shortageListModal.classList.add('hidden');
    // Reset modal state for next time it's opened
    saleOrderSelectionDiv.classList.remove('hidden');
    selectSoInstruction.classList.remove('hidden');
    specificShortageListDiv.classList.add('hidden');
    downloadSpecificShortageExcelBtn.classList.add('hidden'); // Hide download button
    document.getElementById('shortageModalTitle').textContent = 'Select Sale Order';
    shortageModalOkBtn.onclick = setOkButtonToProcessSelection; // Reset OK button behavior to handle selection
}

// Initial behavior for the shortage modal's OK button (to process selection)
function setOkButtonToProcessSelection() {
    const selectedRadio = document.querySelector('input[name="selectedSaleOrder"]:checked');
    if (selectedRadio) {
        const saleOrderValue = selectedRadio.value;
        selectedSaleOrderSpan.textContent = saleOrderValue;
        fetchSpecificShortageList(currentTesterId, saleOrderValue);
        document.getElementById('shortageModalTitle').textContent = 'Shortage & Availability List';
        selectSoInstruction.classList.add('hidden');
        saleOrderSelectionDiv.classList.add('hidden');
        specificShortageListDiv.classList.remove('hidden');
        downloadSpecificShortageExcelBtn.classList.remove('hidden'); // Show download button
        setOkButtonToCloseModal(); // Now the OK button will close the modal
    } else {
        showAlert('Selection Required', 'Please select a Sale Order from the list.', 'warning');
    }
}


function downloadShortageExcel() {
    if (!currentTesterId) {
        showAlert('Error', 'No Tester Jig Number selected.', 'warning');
        return;
    }
    const selectedRadio = document.querySelector('input[name="selectedSaleOrder"]:checked');
    if (!selectedRadio) {
        showAlert('Error', 'Please select a Sale Order to download.', 'warning');
        return;
    }
    const saleOrder = selectedRadio.value;
    const downloadUrl = `${API_BASE_URL}/download_shortage_excel/${currentTesterId}/${saleOrder}`;
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

    // Initial setup for shortage modal OK button
    shortageModalOkBtn.onclick = setOkButtonToProcessSelection;
});


jigNumberInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { searchJigDetails(); }
});
searchJigBtn.addEventListener('click', searchJigDetails);

shortageListBtn.addEventListener('click', showShortageListModal);
closeShortageModalBtn.addEventListener('click', hideShortageListModal);

closeModalBtn.addEventListener('click', closeModalFunction);
modalOkBtn.addEventListener('click', closeModalFunction);
sendAlertPlatformBtn.addEventListener('click', (e) => {
    createParticleEffect(e.currentTarget);
    handleSendAlertPlatformClick();
});

downloadSpecificShortageExcelBtn.addEventListener('click', (e) => {
    createParticleEffect(e.currentTarget);
    downloadShortageExcel();
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
            version: '2.0-multi-so'
        };
        localStorage.setItem('hal_current_session', JSON.stringify(sessionData));
        console.log('Session auto-saved:', sessionData.jigNumber);
    }
    // Visual auto-save indicator
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

// Export for console access
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
            version: '2.0-multi-so'
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