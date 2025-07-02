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

    const shortageListBtn = document.getElementById('shortageListBtn');
    const downloadAllPartsExcelBtn = document.getElementById('downloadAllPartsExcelBtn');
    const sendTelegramAlertBtn = document.getElementById('sendTelegramAlertBtn');

    const shortageListModal = document.getElementById('shortageListModal');
    const closeShortageModalBtn = document.getElementById('closeShortageModal');
    const shortageModalOkBtn = document.getElementById('shortageModalOk');
    const shortageTableBody = document.getElementById('shortageTableBody');
    const noShortageMessage = document.getElementById('noShortageMessage');
    const shortageSaleOrderSelect = document.getElementById('shortageSaleOrderSelect');

    const alertModal = document.getElementById('alertModal');
    const closeModalBtn = document.getElementById('closeModal');
    const modalOkBtn = document.getElementById('modalOk');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');

    const loadingSpinner = document.getElementById('loadingSpinner');

    // --- State Management ---
    let currentJigData = null;
    let allPartsData = {};

    // --- Event Listeners ---
    if (searchJigBtn) searchJigBtn.addEventListener('click', searchJigDetails);
    if (jigNumberInput) jigNumberInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchJigDetails();
    });

    if (clearBtn) clearBtn.addEventListener('click', () => clearForm());
    if (shortageListBtn) shortageListBtn.addEventListener('click', openPartsListModal);
    if (downloadAllPartsExcelBtn) downloadAllPartsExcelBtn.addEventListener('click', downloadAllPartsExcel);
    if (sendTelegramAlertBtn) sendTelegramAlertBtn.addEventListener('click', sendTelegramAlert);

    if (closeShortageModalBtn) closeShortageModalBtn.addEventListener('click', () => shortageListModal.classList.add('hidden'));
    if (shortageModalOkBtn) shortageModalOkBtn.addEventListener('click', () => shortageListModal.classList.add('hidden'));
    if (closeModalBtn) closeModalBtn.addEventListener('click', () => alertModal.classList.add('hidden'));
    if (modalOkBtn) modalOkBtn.addEventListener('click', () => alertModal.classList.add('hidden'));
    if (shortageSaleOrderSelect) shortageSaleOrderSelect.addEventListener('change', displaySelectedPartsList);

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
            currentJigData = data;

            displayJigNumber.textContent = data.tester_jig_number || 'N/A';
            displaySaleOrders.textContent = data.sale_orders.join(', ') || 'N/A';
            displayTopAssyNo.textContent = data.top_assy_no || 'N/A';
            displayLaunchingStatus.textContent = data.status || 'Status Unknown';

            if (data.status && data.status.toLowerCase().includes('delayed')) {
                displayLaunchingStatus.parentElement.className = 'status-indicator-box status-delayed';
                if (statusIcon) statusIcon.className = 'fas fa-exclamation-triangle';
            } else {
                displayLaunchingStatus.parentElement.className = 'status-indicator-box status-ready';
                if (statusIcon) statusIcon.className = 'fas fa-check-circle';
            }

            jigDetailsDisplaySection.classList.remove('hidden');
            jigDetailsDisplaySection.classList.add('fade-in');
            
            await fetchAllPartsForJig();
        } catch (error) {
            console.error('Error fetching jig details:', error);
            showInfoModal('Search Failed', `Could not find details. Reason: ${error.message}`, true);
            currentJigData = null;
        } finally {
            showLoading(false);
        }
    }
    
    async function fetchAllPartsForJig() {
        if (!currentJigData) return;
        allPartsData = {};

        try {
            const response = await fetch(`/api/all_parts_for_jig?jig_number=${encodeURIComponent(currentJigData.tester_jig_number)}`);
            if (!response.ok) throw new Error('Server responded with an error fetching parts.');
            
            const allParts = await response.json();
            
            currentJigData.sale_orders.forEach(so => {
                allPartsData[so] = allParts.filter(p => p.sale_order === so);
            });
            console.log("All parts data has been pre-fetched.");
        } catch (error) {
            console.error("Could not pre-fetch parts data:", error);
        }
    }

    function openPartsListModal() {
        if (!currentJigData) return;
        shortageSaleOrderSelect.innerHTML = currentJigData.sale_orders.map(so => `<option value="${so}">${so}</option>`).join('');
        displaySelectedPartsList();
        shortageListModal.classList.remove('hidden');
    }

    function displaySelectedPartsList() {
        const selectedSaleOrder = shortageSaleOrderSelect.value;
        const partsData = allPartsData[selectedSaleOrder];
        populatePartsTable(partsData);
    }

    function populatePartsTable(partsData) {
        shortageTableBody.innerHTML = ''; 
        if (!partsData || partsData.length === 0) {
            noShortageMessage.classList.remove('hidden');
            shortageTableBody.parentElement.classList.add('hidden');
            return;
        }
        noShortageMessage.classList.add('hidden');
        shortageTableBody.parentElement.classList.remove('hidden');
        partsData.forEach(item => {
            const status = (item.availability_status || 'unknown').toLowerCase().replace(/\s+/g, '-');
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.part_number || 'N/A'}</td>
                <td>${item.unitName || 'N/A'}</td>
                <td>${item.requiredQuantity}</td>
                <td>${item.currentStock}</td>
                <td><span class="status-cell ${status}">${item.availability_status}</span></td>
            `;
            shortageTableBody.appendChild(row);
        });
    }

    async function sendTelegramAlert() {
        if (!currentJigData) {
            showInfoModal('Error', 'Please search for a Jig Number first.', true);
            return;
        }

        showLoading(true);

        const jigNumber = currentJigData.tester_jig_number;
        const status = currentJigData.status;
        
        let shortageCount = 0;
        if (allPartsData) {
            Object.values(allPartsData).forEach(parts => {
                shortageCount += parts.filter(p => p.availability_status === 'Shortage').length;
            });
        }

        const message = `
*HAL Alert: Tester Jig Status*
------------------------------------
*Jig Number:* \`${jigNumber}\`
*Overall Status:* ${status}
*Total Shortages:* ${shortageCount}
*Official In-Charge:* ${currentJigData.officialIncharge || 'N/A'}
------------------------------------
This is a manual alert triggered by a user.
        `;

        try {
            const response = await fetch('/api/send_telegram_alert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message.trim() })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to send alert.');
            
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

    function clearForm(keepInput = false) {
        if (!keepInput) jigNumberInput.value = '';
        jigDetailsDisplaySection.classList.add('hidden');
        currentJigData = null;
        allPartsData = {};
        jigNumberInput.focus();
    }

    function showLoading(show) {
        if(loadingSpinner) loadingSpinner.classList.toggle('hidden', !show);
    }

    function showInfoModal(title, message, isError = false) {
        if (modalTitle) modalTitle.textContent = title;
        if (modalMessage) modalMessage.textContent = message;
        if (modalTitle) modalTitle.style.color = isError ? 'var(--danger-red)' : '';
        if (alertModal) alertModal.classList.remove('hidden');
    }
});
