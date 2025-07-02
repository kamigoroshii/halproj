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
    let currentJigNumber = null;
    let currentSaleOrders = [];

    // --- Event Listeners ---
    searchJigBtn.addEventListener('click', searchJigDetails);
    jigNumberInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            searchJigDetails();
        }
    });

    clearBtn.addEventListener('click', clearForm);
    shortageListBtn.addEventListener('click', openShortageModal);
    downloadAllPartsExcelBtn.addEventListener('click', downloadAllPartsExcel);

    // Modal close listeners
    closeShortageModalBtn.addEventListener('click', () => shortageListModal.classList.add('hidden'));
    shortageModalOkBtn.addEventListener('click', () => shortageListModal.classList.add('hidden'));
    closeModalBtn.addEventListener('click', () => alertModal.classList.add('hidden'));
    modalOkBtn.addEventListener('click', () => alertModal.classList.add('hidden'));

    // --- Core Functions ---

    /**
     * Fetches and displays details for the entered Jig Number.
     */
    async function searchJigDetails() {
        const jigNumber = jigNumberInput.value.trim();
        if (!jigNumber) {
            showInfoModal('Input Required', 'Please enter a Tester Jig Number.', true);
            return;
        }

        showLoading(true);
        clearForm(true); // Clear previous results but keep input value

        try {
            // CORRECTED API CALL: Using query parameters
            const response = await fetch(`/api/jig_details?jig_number=${encodeURIComponent(jigNumber)}`);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Error: ${response.status}`);
            }

            const data = await response.json();

            // Store state
            currentJigNumber = data.tester_jig_number;
            currentSaleOrders = data.sale_orders;

            // Populate display fields
            displayJigNumber.textContent = data.tester_jig_number;
            displaySaleOrders.textContent = data.sale_orders.join(', ');
            displayTopAssyNo.textContent = data.top_assy_no;
            displayLaunchingStatus.textContent = data.status;

            // Update status indicator color and icon based on the launch status
            if (data.status.toLowerCase().includes('delayed')) {
                displayLaunchingStatus.classList.remove('status-ready');
                displayLaunchingStatus.classList.add('status-delayed');
                statusIcon.className = 'fas fa-exclamation-triangle';
            } else {
                displayLaunchingStatus.classList.remove('status-delayed');
                displayLaunchingStatus.classList.add('status-ready');
                statusIcon.className = 'fas fa-check-circle';
            }

            jigDetailsDisplaySection.classList.remove('hidden');

        } catch (error) {
            console.error('Error fetching jig details:', error);
            showInfoModal('Search Failed', `Could not find details. Reason: ${error.message}`, true);
        } finally {
            showLoading(false);
        }
    }

    /**
     * Opens the shortage modal and populates it with data.
     */
    async function openShortageModal() {
        if (!currentJigNumber) return;

        // Populate the select dropdown with sale orders
        shortageSaleOrderSelect.innerHTML = currentSaleOrders.map(so => `<option value="${so}">${so}</option>`).join('');
        
        // Fetch shortage for the first sale order by default
        await fetchAndDisplayShortageList();

        shortageListModal.classList.remove('hidden');
    }
    
    // Add event listener for the new dropdown
    shortageSaleOrderSelect.addEventListener('change', fetchAndDisplayShortageList);


    /**
     * Fetches and displays the shortage list for the selected sale order.
     */
    async function fetchAndDisplayShortageList() {
        const selectedSaleOrder = shortageSaleOrderSelect.value;
        if (!currentJigNumber || !selectedSaleOrder) return;

        showLoading(true);
        
        try {
            // CORRECTED API CALL: Using query parameters
            const response = await fetch(`/api/shortage_list?jig_number=${encodeURIComponent(currentJigNumber)}&sale_order=${encodeURIComponent(selectedSaleOrder)}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Error: ${response.status}`);
            }

            const shortageData = await response.json();
            populateShortageTable(shortageData);

        } catch (error) {
             console.error('Error fetching shortage list:', error);
             showInfoModal('Error', `Could not fetch shortage list. Reason: ${error.message}`, true);
        } finally {
            showLoading(false);
        }
    }


    /**
     * Populates the shortage table with data.
     * @param {Array} shortageData - Array of shortage items.
     */
    function populateShortageTable(shortageData) {
        shortageTableBody.innerHTML = ''; // Clear previous data

        if (shortageData.length === 0) {
            noShortageMessage.classList.remove('hidden');
            shortageTableBody.classList.add('hidden');
        } else {
            noShortageMessage.classList.add('hidden');
            shortageTableBody.classList.remove('hidden');
            shortageData.forEach(item => {
                const missingQty = item.requiredQuantity - item.currentStock;
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.part_number || 'N/A'}</td>
                    <td>${item.unitName || 'N/A'}</td>
                    <td>${item.requiredQuantity}</td>
                    <td>${item.currentStock}</td>
                    <td class="status-delayed">${missingQty > 0 ? missingQty : 'N/A'}</td>
                `;
                shortageTableBody.appendChild(row);
            });
        }
    }

    /**
     * Downloads an Excel file with all parts for the current jig.
     */
    function downloadAllPartsExcel() {
        if (!currentJigNumber) {
            showInfoModal('Error', 'Please search for a Jig Number first.', true);
            return;
        }
        // CORRECTED API CALL: Using query parameters
        const url = `/api/download_all_parts_excel?jig_number=${encodeURIComponent(currentJigNumber)}`;
        window.open(url, '_blank');
    }

    // --- UI Helper Functions ---

    /**
     * Resets the form and display areas.
     * @param {boolean} keepInput - If true, does not clear the jig number input field.
     */
    function clearForm(keepInput = false) {
        if (!keepInput) {
            jigNumberInput.value = '';
        }
        jigDetailsDisplaySection.classList.add('hidden');
        displayJigNumber.textContent = '';
        displaySaleOrders.textContent = '';
        displayTopAssyNo.textContent = '';
        displayLaunchingStatus.textContent = '';
        currentJigNumber = null;
        currentSaleOrders = [];
        jigNumberInput.focus();
    }

    /**
     * Shows or hides the loading spinner.
     * @param {boolean} show - True to show, false to hide.
     */
    function showLoading(show) {
        if (show) {
            loadingSpinner.classList.remove('hidden');
        } else {
            loadingSpinner.classList.add('hidden');
        }
    }

    /**
     * Displays a generic information modal.
     * @param {string} title - The title of the modal.
     * @param {string} message - The message content.
     * @param {boolean} isError - If true, styles the title as an error.
     */
    function showInfoModal(title, message, isError = false) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalTitle.style.color = isError ? 'var(--danger-red)' : '';
        alertModal.classList.remove('hidden');
    }
});
