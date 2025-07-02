document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element Selection ---
    const jigNumberInput = document.getElementById('jigNumberInput');
    const searchJigBtn = document.getElementById('searchJigBtn');
    const clearBtn = document.getElementById('clearBtn');

    const jigDetailsDisplaySection = document.getElementById('jigDetailsDisplay');
    const displayJigNumber = document.getElementById('displayJigNumber');
    const displaySaleOrders = document.getElementById('displaySaleOrders');
    const displayTopAssyNo = document.getElementById('displayTopAssyNo');
    const displayLaunchingStatus = document.getElementById('displayLaunchingStatus');
    const statusIcon = document.getElementById('statusIcon');

    // --- BUTTONS ---
    const viewAllPartsBtn = document.getElementById('viewAllPartsBtn');
    const downloadAllPartsExcelBtn = document.getElementById('downloadAllPartsExcelBtn');
    const sendTelegramAlertBtn = document.getElementById('sendTelegramAlertBtn');

    // --- MODALS ---
    const partsListModal = document.getElementById('partsListModal');
    const closePartsListModalBtn = document.getElementById('closePartsListModal');
    const partsListModalOkBtn = document.getElementById('partsListModalOk');
    const partsTableBody = document.getElementById('partsTableBody');
    const partsListSaleOrderSelect = document.getElementById('partsListSaleOrderSelect');
    const partsListModalTitle = document.getElementById('partsListModalTitle');

    const alertModal = document.getElementById('alertModal');
    const closeModalBtn = document.getElementById('closeModal');
    const modalOkBtn = document.getElementById('modalOk');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');

    const loadingSpinner = document.getElementById('loadingSpinner');

    // --- State Management ---
    let currentJigData = null;
    let allPartsData = {}; // Store all parts data by sale order to avoid re-fetching

    // --- Event Listeners ---
    searchJigBtn.addEventListener('click', searchJigDetails);
    jigNumberInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchJigDetails();
    });

    clearBtn.addEventListener('click', () => clearForm());
    viewAllPartsBtn.addEventListener('click', openPartsListModal);
    downloadAllPartsExcelBtn.addEventListener('click', downloadAllPartsExcel);
    sendTelegramAlertBtn.addEventListener('click', sendTelegramAlert);

    // Modal close listeners
    closePartsListModalBtn.addEventListener('click', () => partsListModal.classList.add('hidden'));
    partsListModalOkBtn.addEventListener('click', () => partsListModal.classList.add('hidden'));
    closeModalBtn.addEventListener('click', () => alertModal.classList.add('hidden'));
    modalOkBtn.addEventListener('click', () => alertModal.classList.add('hidden'));
    partsListSaleOrderSelect.addEventListener('change', displaySelectedPartsList);

    // --- Core Functions ---

    async function searchJigDetails() {
        const jigNumber = jigNumberInput.value.trim();
        if (!jigNumber) {
            showInfoModal('Input Required', 'Please enter a Tester Jig Number.', true);
            return;
        }

        showLoading(true);
        clearForm(true);

        try {
            const response = await fetch(`/api/jig_details?jig_number=${encodeURIComponent(jigNumber)}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Error: ${response.status}`);
            }

            const data = await response.json();
            currentJigData = data; // Store all jig data

            displayJigNumber.textContent = data.tester_jig_number || 'N/A';
            displaySaleOrders.textContent = data.sale_orders.join(', ') || 'N/A';
            displayTopAssyNo.textContent = data.top_assy_no || 'N/A';
            displayLaunchingStatus.textContent = data.status || 'Status Unknown';

            if (data.status && data.status.toLowerCase().includes('delayed')) {
                displayLaunchingStatus.parentElement.className = 'status-indicator-box status-delayed';
                statusIcon.className = 'fas fa-exclamation-triangle';
            } else {
                displayLaunchingStatus.parentElement.className = 'status-indicator-box status-ready';
                statusIcon.className = 'fas fa-check-circle';
            }

            jigDetailsDisplaySection.classList.remove('hidden');
            // Pre-fetch all parts data in the background
            fetchAllPartsForJig();
        } catch (error) {
            console.error('Error fetching jig details:', error);
            showInfoModal('Search Failed', `Could not find details. Reason: ${error.message}`, true);
            currentJigData = null; // Reset on failure
        } finally {
            showLoading(false);
        }
    }
    
    async function fetchAllPartsForJig() {
        if (!currentJigData) return;
        allPartsData = {}; // Clear previous data
        
        // This is a new API endpoint we'll add to app.py to get everything at once
        try {
            const response = await fetch(`/api/all_parts_for_jig?jig_number=${encodeURIComponent(currentJigData.tester_jig_number)}`);
            const allParts = await response.json();
            
            // Group parts by sale order for easy access later
            currentJigData.sale_orders.forEach(so => {
                allPartsData[so] = allParts.filter(p => p.sale_order === so);
            });
            console.log("All parts data pre-fetched and grouped.");
        } catch (error) {
            console.error("Could not pre-fetch parts data:", error);
        }
    }

    function openPartsListModal() {
        if (!currentJigData) return;

        partsListModalTitle.textContent = 'All Parts List';
        partsListSaleOrderSelect.innerHTML = currentJigData.sale_orders.map(so => `<option value="${so}">${so}</option>`).join('');
        
        displaySelectedPartsList();
        partsListModal.classList.remove('hidden');
    }

    function displaySelectedPartsList() {
        const selectedSaleOrder = partsListSaleOrderSelect.value;
        const partsData = allPartsData[selectedSaleOrder];
        populatePartsTable(partsData);
    }

    function populatePartsTable(partsData) {
        partsTableBody.innerHTML = ''; // Clear previous data
        if (!partsData || partsData.length === 0) {
            partsTableBody.innerHTML = '<tr><td colspan="5">No parts found for this selection.</td></tr>';
            return;
        }

        partsData.forEach(item => {
            const status = (item.availability_status || 'unknown').toLowerCase().replace(' ', '-');
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.part_number || 'N/A'}</td>
                <td>${item.unitName || 'N/A'}</td>
                <td>${item.requiredQuantity}</td>
                <td>${item.currentStock}</td>
                <td><span class="status-cell ${status}">${item.availability_status}</span></td>
            `;
            partsTableBody.appendChild(row);
        });
    }

    async function sendTelegramAlert() {
        if (!currentJigData) {
            showInfoModal('Error', 'Please search for a Jig Number first.', true);
            return;
        }

        const jigNumber = currentJigData.tester_jig_number;
        const status = currentJigData.status;
        const shortages = allPartsData[currentJigData.sale_orders[0]]?.filter(p => p.availability_status === 'Shortage').length || 0;

        const message = `
*HAL Alert: Tester Jig Status*
------------------------------------
*Jig Number:* \`${jigNumber}\`
*Overall Status:* ${status}
*Total Shortages:* ${shortages}
*Official In-Charge:* ${currentJigData.officialIncharge || 'N/A'}
------------------------------------
This is an automated notification.
        `;

        showLoading(true);
        try {
            const response = await fetch('/api/send_telegram_alert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message.trim() })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || 'Failed to send alert.');
            }
            showInfoModal('Success', result.message);
        } catch (error) {
            console.error('Error sending Telegram alert:', error);
            showInfoModal('Telegram Error', `Could not send alert. Reason: ${error.message}`, true);
        } finally {
            showLoading(false);
        }
    }

    function downloadAllPartsExcel() {
        if (!currentJigData) {
            showInfoModal('Error', 'Please search for a Jig Number first.', true);
            return;
        }
        const url = `/api/download_all_parts_excel?jig_number=${encodeURIComponent(currentJigData.tester_jig_number)}`;
        window.open(url, '_blank');
    }

    // --- UI Helper Functions ---
    function clearForm(keepInput = false) {
        if (!keepInput) jigNumberInput.value = '';
        jigDetailsDisplaySection.classList.add('hidden');
        currentJigData = null;
        allPartsData = {};
        jigNumberInput.focus();
    }

    function showLoading(show) {
        loadingSpinner.classList.toggle('hidden', !show);
    }



    function showInfoModal(title, message, isError = false) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalTitle.style.color = isError ? 'var(--danger-red)' : '';
        alertModal.classList.remove('hidden');
    }
});
