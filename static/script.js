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
    const docsSidebar = document.getElementById('docsSidebar');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const sidebarJigNumber = document.getElementById('sidebarJigNumber');
    const docLinks = document.querySelectorAll('.doc-link');
    const shortageListModal = document.getElementById('shortageListModal');
    const closeShortageModalBtn = document.getElementById('closeShortageModal');
    const shortageModalOkBtn = document.getElementById('shortageModalOk');
    const shortageTableBody = document.getElementById('shortageTableBody');
    const noShortageMessage = document.getElementById('noShortageMessage');
    const shortageSaleOrderSelect = document.getElementById('shortageSaleOrderSelect');
    const alertModal = document.getElementById('alertModal');
    const closeModalBtn = document.getElementById('closeModal');
    const modalOkBtn = document.getElementById('modalOk');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const themeToggle = document.getElementById('themeToggle');
    // New Elements
    const alertSentPopup = document.getElementById('alertSentPopup');
    const searchHistoryList = document.getElementById('searchHistory');

    // --- State Management ---
    let currentJigData = null;
    let allPartsData = {};

    // --- Event Listeners ---
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    if (searchJigBtn) searchJigBtn.addEventListener('click', searchJigDetails);
    if (jigNumberInput) jigNumberInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchJigDetails();
    });
    if (clearBtn) clearBtn.addEventListener('click', () => clearForm());
    if (shortageListBtn) shortageListBtn.addEventListener('click', openPartsListModal);
    if (downloadAllPartsExcelBtn) downloadAllPartsExcelBtn.addEventListener('click', downloadAllPartsExcel);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
    docLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const docType = e.currentTarget.dataset.docType;
            openDocument(docType);
        });
    });
    if (closeShortageModalBtn) closeShortageModalBtn.addEventListener('click', () => hideModal(shortageListModal));
    if (shortageModalOkBtn) shortageModalOkBtn.addEventListener('click', () => hideModal(shortageListModal));
    if (closeModalBtn) closeModalBtn.addEventListener('click', () => hideModal(alertModal));
    if (modalOkBtn) modalOkBtn.addEventListener('click', () => hideModal(alertModal));
    if (shortageSaleOrderSelect) shortageSaleOrderSelect.addEventListener('change', displaySelectedPartsList);

    // --- Core Functions ---

    async function searchJigDetails() {
        // Force input to uppercase and save to history
        const jigNumber = jigNumberInput.value.trim().toUpperCase();
        jigNumberInput.value = jigNumber;

        if (!jigNumber) {
            showInfoModal('Input Required', 'Please enter a Tester Jig Number.', true);
            return;
        }

        showLoading(true);
        clearForm(true);
        closeSidebar();

        try {
            const response = await fetch(`/api/jig_details?jig_number=${encodeURIComponent(jigNumber)}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Error: ${response.status}`);
            }

            const data = await response.json();
            currentJigData = data;
            
            saveSearchTerm(jigNumber);

            const statusFromServer = data.status || 'Status Unknown';
            displayJigNumber.textContent = data.tester_jig_number || 'N/A';
            displaySaleOrders.textContent = data.sale_orders.join(', ') || 'N/A';
            displayTopAssyNo.textContent = data.top_assy_no || 'N/A';
            displayLaunchingStatus.textContent = statusFromServer;
            
            const isNotLaunched = statusFromServer.trim().toLowerCase() === 'not launched';

            if (isNotLaunched) {
                displayLaunchingStatus.parentElement.className = 'status-indicator-box status-not-launched';
                if (statusIcon) statusIcon.className = 'fas fa-exclamation-triangle';
            } else {
                displayLaunchingStatus.parentElement.className = 'status-indicator-box status-ready';
                if (statusIcon) statusIcon.className = 'fas fa-check-circle';
            }

            jigDetailsDisplaySection.classList.remove('hidden');
            jigDetailsDisplaySection.classList.add('fade-in');
            
            await fetchAllPartsForJig();
            openSidebar();

            if (isNotLaunched) {
                await sendTelegramAlert();
            }

        } catch (error) {
            console.error('Error fetching jig details:', error);
            showInfoModal('Search Failed', `Could not find details. Reason: ${error.message}`, true);
            currentJigData = null;
        } finally {
            showLoading(false);
        }
    }
    
    async function sendTelegramAlert() {
        if (!currentJigData) return;

        const jigNumber = currentJigData.tester_jig_number;
        const status = currentJigData.status;
        let shortageCount = 0;
        if (allPartsData) {
            Object.values(allPartsData).forEach(parts => {
                shortageCount += parts.filter(p => p.availability_status === 'Shortage').length;
            });
        }

        const message = `*Automatic Alert: Tester Jig Status*\n------------------------------------\n*Jig Number:* \`${jigNumber}\`\n*Overall Status:* ${status}\n*Total Shortages:* ${shortageCount}`;

        try {
            const response = await fetch('/api/send_telegram_alert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message.trim() })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to send alert.');
            
            showAlertSentPopup(); // Show the new icon pop-up
        } catch (error) {
            console.error('Error sending Telegram alert:', error);
            showInfoModal('Telegram Error', `Automatic alert failed. Reason: ${error.message}`, true);
        }
    }

    // --- New Feature Functions ---

    function loadSearchHistory() {
        if (!searchHistoryList) return;
        const history = JSON.parse(localStorage.getItem('jigSearchHistory')) || [];
        searchHistoryList.innerHTML = history.map(term => `<option value="${term}"></option>`).join('');
    }

    function saveSearchTerm(term) {
        if (!term) return;
        let history = JSON.parse(localStorage.getItem('jigSearchHistory')) || [];
        history = history.filter(item => item.toLowerCase() !== term.toLowerCase());
        history.unshift(term);
        const historyLimit = 10;
        if (history.length > historyLimit) {
            history = history.slice(0, historyLimit);
        }
        localStorage.setItem('jigSearchHistory', JSON.stringify(history));
        loadSearchHistory();
    }

    function showAlertSentPopup() {
        if (!alertSentPopup) return;
        alertSentPopup.classList.remove('hidden');
        // A small delay to allow the element to be rendered before adding the show class for transition
        setTimeout(() => {
            alertSentPopup.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            alertSentPopup.classList.remove('show');
            setTimeout(() => {
                alertSentPopup.classList.add('hidden');
            }, 500); // This delay should match the transition duration in CSS
        }, 1500);
    }

    // --- Existing Helper and UI Functions (Unchanged) ---
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
        } catch (error) { console.error("Could not pre-fetch parts data:", error); }
    }
    function openPartsListModal() {
        if (!currentJigData) return;
        shortageSaleOrderSelect.innerHTML = currentJigData.sale_orders.map(so => `<option value="${so}">${so}</option>`).join('');
        displaySelectedPartsList();
        showModal(shortageListModal);
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
        partsData.forEach((item) => {
            const status = (item.availability_status || 'unknown').toLowerCase().replace(/\s+/g, '-');
            const row = document.createElement('tr');
            row.innerHTML = `<td>${item.part_number || 'N/A'}</td><td>${item.unitName || 'N/A'}</td><td>${item.requiredQuantity}</td><td>${item.currentStock}</td><td><span class="status-cell ${status}">${item.availability_status}</span></td>`;
            shortageTableBody.appendChild(row);
        });
    }
    function downloadAllPartsExcel() {
        if (!currentJigData) { showInfoModal('Error', 'Please search for a Jig Number first.', true); return; }
        window.open(`/api/download_all_parts_excel?jig_number=${encodeURIComponent(currentJigData.tester_jig_number)}`, '_blank');
    }
    function clearForm(keepInput = false) {
        if (!keepInput) jigNumberInput.value = '';
        jigDetailsDisplaySection.classList.add('hidden');
        currentJigData = null; allPartsData = {}; closeSidebar(); jigNumberInput.focus();
    }
    function openSidebar() {
        if (!currentJigData) return;
        sidebarJigNumber.textContent = currentJigData.tester_jig_number;
        docsSidebar.classList.add('open');
    }
    function closeSidebar() { docsSidebar.classList.remove('open'); }
    function openDocument(docType) {
        if (!currentJigData) { showInfoModal('Error', 'No Tester Jig selected.', true); return; }
        const jigNumber = currentJigData.tester_jig_number;
        showInfoModal('Opening Document', `Attempting to open ${docType} for ${jigNumber}.`);
    }
    function showLoading(show) { if (loadingSpinner) loadingSpinner.classList.toggle('hidden', !show); }
    function showModal(modal) { if (modal) modal.classList.remove('hidden'); }
    function hideModal(modal) { if (modal) modal.classList.add('hidden'); }
    function showInfoModal(title, message, isError = false) {
        const modalTitleEl = document.getElementById('modalTitle');
        const modalMessageEl = document.getElementById('modalMessage');
        if (modalTitleEl) modalTitleEl.textContent = title;
        if (modalMessageEl) modalMessageEl.textContent = message;
        if (modalTitleEl) modalTitleEl.style.color = isError ? 'var(--danger-red)' : '';
        if (alertModal) showModal(alertModal);
    }
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
    }

    // --- Initializations ---
    loadSearchHistory();
    console.log('HAL Tracker Initialized.');
});
