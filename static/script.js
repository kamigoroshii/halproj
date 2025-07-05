document.addEventListener('DOMContentLoaded', () => {
    // --- All DOM Element Selections ---
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
    const alertSentPopup = document.getElementById('alertSentPopup');
    const searchHistoryList = document.getElementById('searchHistory');
    const menuToggle = document.getElementById('menuToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    
    // Recommendation Elements
    const recommendPurchaseBtn = document.getElementById('recommendPurchaseBtn');
    const pFactorColHeader = document.querySelector('#shortageListModal .p-factor-col');
    const recommendedQtyColHeader = document.querySelector('#shortageListModal .recommended-qty-col');

    // Modal-specific download buttons
    const downloadShortageExcelModalBtn = document.getElementById('downloadShortageExcelModalBtn');
    const downloadRecommendedExcelModalBtn = document.getElementById('downloadRecommendedExcelModalBtn');

    // Documentation Search Elements
    const docSearchInput = document.getElementById('docSearchInput');
    const docSearchResults = document.getElementById('docSearchResults');
    const defaultDocLinks = document.getElementById('defaultDocLinks');

    // NEW: Desktop Documentation Button
    const documentationButton = document.getElementById('documentationButton');


    // --- State Management ---
    let currentJigData = null;
    let allPartsData = {}; // Stores all parts for the current jig, including p_factor
    let recommendedPartsData = {}; // Stores parts with recommended quantities after calculation

    // --- Initial Setup: Ensure sidebar is closed on page load ---
    closeSidebar(); 

    // --- Event Listeners ---
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    if (searchJigBtn) searchJigBtn.addEventListener('click', searchJigDetails);
    if (jigNumberInput) jigNumberInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchJigDetails();
    });
    if (clearBtn) clearBtn.addEventListener('click', () => clearForm());
    
    // Generate Shortage List button (now just opens modal in shortage mode)
    if (shortageListBtn) shortageListBtn.addEventListener('click', () => openPartsListModal('shortage')); 
    
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
    
    if (menuToggle) menuToggle.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar); 

    // Event listeners for Recommendation and Download buttons
    if (recommendPurchaseBtn) recommendPurchaseBtn.addEventListener('click', handleRecommendPurchase);
    if (downloadShortageExcelModalBtn) downloadShortageExcelModalBtn.addEventListener('click', downloadShortageExcel); 
    if (downloadRecommendedExcelModalBtn) downloadRecommendedExcelModalBtn.addEventListener('click', downloadRecommendedExcel); 

    // Documentation Search Event Listener
    if (docSearchInput) docSearchInput.addEventListener('input', searchDocumentation);

    // NEW: Desktop Documentation Button Listener
    if (documentationButton) documentationButton.addEventListener('click', openSidebar);


    // --- Functions ---

    function openDocument(docType) {
        if (!currentJigData || !currentJigData.tester_jig_number) {
            showInfoModal('Error', 'No Tester Jig selected.', true);
            return;
        }
        const jigNumber = currentJigData.tester_jig_number;
        const pdfUrl = `/static/docs/${jigNumber}_${docType}.pdf`;
        console.log(`Attempting to open document at: ${pdfUrl}`);
        window.open(pdfUrl, '_blank');
        showToast(`Opening ${docType} document...`, 'info');
    }

    async function searchJigDetails() {
        const jigNumber = jigNumberInput.value.trim().toUpperCase();
        jigNumberInput.value = jigNumber;
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
            
            await fetchAllPartsForJig(); // Fetch all parts data, including P-Factor
            
            // Update sidebar content after search
            sidebarJigNumber.textContent = currentJigData.tester_jig_number;

            // REMOVED: Automatic openSidebar() call for desktop after search.
            // Now, users click the dedicated 'Documentation' button to open it.

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
            showAlertSentPopup();
        } catch (error) {
            console.error('Error sending Telegram alert:', error);
            showInfoModal('Telegram Error', `Automatic alert failed. Reason: ${error.message}`, true);
        }
    }

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
        setTimeout(() => {
            alertSentPopup.classList.add('show');
        }, 10);
        setTimeout(() => {
            alertSentPopup.classList.remove('show');
            setTimeout(() => {
                alertSentPopup.classList.add('hidden');
            }, 500);
        }, 1500);
    }
    
    // Fetches ALL parts data for the jig, stores it in allPartsData
    async function fetchAllPartsForJig(){ 
        if (!currentJigData) return; 
        allPartsData = {}; // Clear previous data
        recommendedPartsData = {}; // Clear previous recommendations

        try { 
            const response = await fetch(`/api/all_parts_for_jig?jig_number=${encodeURIComponent(currentJigData.tester_jig_number)}`); 
            if (!response.ok) throw new Error('Server responded with an error fetching parts.'); 
            const allParts = await response.json(); 
            
            // Group by sale order and store in allPartsData
            currentJigData.sale_orders.forEach(so => { 
                allPartsData[so] = allParts.filter(p => p.sale_order === so); 
            });
            console.log("All parts data fetched:", allPartsData);

        } catch (error) { 
            console.error("Could not pre-fetch parts data:", error); 
            showInfoModal('Data Error', 'Failed to load all parts data for this jig.', true);
        } 
    }

    // Handler for "Recommend Purchase" button click
    async function handleRecommendPurchase() {
        if (!currentJigData) {
            showInfoModal('Error', 'Please search for a Jig Number first.', true);
            return;
        }

        showLoading(true);
        try {
            const response = await fetch(`/api/recommend_purchase?jig_number=${encodeURIComponent(currentJigData.tester_jig_number)}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to get purchase recommendations.');
            }
            const partsWithRecommendations = await response.json();
            
            // Store recommended data, grouped by sale order
            recommendedPartsData = {};
            currentJigData.sale_orders.forEach(so => {
                recommendedPartsData[so] = partsWithRecommendations.filter(p => p.sale_order === so);
            });
            console.log("Recommended parts data:", recommendedPartsData);

            // Open the modal and display recommendations
            openPartsListModal('recommendation');

        } catch (error) {
            console.error('Error fetching purchase recommendations:', error);
            showInfoModal('Recommendation Failed', `Could not generate purchase recommendations. Reason: ${error.message}`, true);
        } finally {
            showLoading(false);
        }
    }

    // Download Shortage List Excel (now linked to button INSIDE modal)
    function downloadShortageExcel(){ 
        if (!currentJigData) { 
            showInfoModal('Error', 'Please search for a Jig Number first.', true); 
            return; 
        } 
        window.open(`/api/download_all_parts_excel?jig_number=${encodeURIComponent(currentJigData.tester_jig_number)}`, '_blank'); 
    }

    // Download Recommended Excel (now linked to button INSIDE modal)
    function downloadRecommendedExcel() {
        if (!currentJigData) {
            showInfoModal('Error', 'Please search for a Jig Number first to download recommendations.', true);
            return;
        }
        window.open(`/api/download_recommended_excel?jig_number=${encodeURIComponent(currentJigData.tester_jig_number)}`, '_blank');
    }

    // Modified to accept a 'mode' to display either shortage or recommendation
    function openPartsListModal(mode = 'shortage'){ 
        if (!currentJigData) {
            showInfoModal('Error', 'Please search for a Jig Number first.', true);
            return;
        }
        
        // Populate Sale Order dropdown
        shortageSaleOrderSelect.innerHTML = currentJigData.sale_orders.map(so => `<option value="${so}">${so}</option>`).join(''); 
        
        // Determine which data source to use and which columns to show
        let dataToDisplay = allPartsData;
        let modalTitle = 'Shortage List';
        let showPFactorAndRecommended = false;

        if (mode === 'recommendation') {
            dataToDisplay = recommendedPartsData;
            modalTitle = 'Recommended Purchase List';
            showPFactorAndRecommended = true;
            // Show only the recommended excel download button
            downloadRecommendedExcelModalBtn.classList.remove('hidden');
            downloadShortageExcelModalBtn.classList.add('hidden');
        } else { // default to shortage
             modalTitle = 'Shortage List';
             // If a jig has no shortages, and we're showing 'shortage' mode, filter
             // to show only shortage items OR all items if no shortages exist
             const hasShortages = Object.values(allPartsData).flat().some(p => p.availability_status === 'Shortage');
             if (hasShortages) {
                // Filter to show only shortage items
                let filteredData = {};
                for (const so in allPartsData) {
                    filteredData[so] = allPartsData[so].filter(p => p.availability_status === 'Shortage');
                }
                dataToDisplay = filteredData;
             } else {
                 // If no shortages, show all parts in the 'shortage' view, but keep original title
                 dataToDisplay = allPartsData;
             }
             // Show only the shortage excel download button
             downloadRecommendedExcelModalBtn.classList.add('hidden');
             downloadShortageExcelModalBtn.classList.remove('hidden');
        }

        // Update modal title
        document.querySelector('#shortageListModal .modal-header h3').textContent = modalTitle;

        // Toggle P-Factor and Recommended Qty columns visibility
        if (pFactorColHeader && recommendedQtyColHeader) {
            if (showPFactorAndRecommended) {
                pFactorColHeader.classList.remove('hidden');
                recommendedQtyColHeader.classList.remove('hidden');
            } else {
                pFactorColHeader.classList.add('hidden');
                recommendedQtyColHeader.classList.add('hidden');
            }
        }

        // Store the current data mode in the select element itself or a global variable
        // for `displaySelectedPartsList` to pick up.
        shortageSaleOrderSelect.dataset.currentMode = mode;

        displaySelectedPartsList(); // Display for the initially selected SO
        showModal(shortageListModal);
    }

    // Modified to use the correct data source based on currentMode
    function displaySelectedPartsList(){ 
        const selectedSaleOrder = shortageSaleOrderSelect.value;
        const currentMode = shortageSaleOrderSelect.dataset.currentMode || 'shortage'; // Get the mode
        
        let partsData = [];
        if (currentMode === 'recommendation') {
            partsData = recommendedPartsData[selectedSaleOrder] || [];
        } else {
            // In 'shortage' mode, filter for 'Shortage' unless there are no shortages at all, then show all.
            const allPartsForSO = allPartsData[selectedSaleOrder] || [];
            const hasShortagesInSO = allPartsForSO.some(p => p.availability_status === 'Shortage');

            if (hasShortagesInSO) {
                partsData = allPartsForSO.filter(p => p.availability_status === 'Shortage');
            } else {
                // If no shortages for this SO, show all parts for completeness in shortage view
                partsData = allPartsForSO;
            }
        }
        populatePartsTable(partsData, currentMode === 'recommendation'); 
    }

    // Modified to conditionally display P-Factor and Recommended Quantity
    function populatePartsTable(partsData, showRecommendationColumns){ 
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
            row.innerHTML = `
                <td>${item.part_number || 'N/A'}</td>
                <td>${item.unitName || 'N/A'}</td>
                <td>${item.requiredQuantity}</td>
                <td>${item.currentStock}</td>
                <td class="p-factor-cell ${showRecommendationColumns ? '' : 'hidden'}">${item.p_factor || 0}%</td>
                <td class="recommended-qty-cell ${showRecommendationColumns ? '' : 'hidden'}">${item.recommendedQuantity || 0}</td>
                <td><span class="status-cell ${status}">${item.availability_status}</span></td>
            `;
            shortageTableBody.appendChild(row); 
        }); 
    }

    function clearForm(keepInput = false){ 
        if (!keepInput) jigNumberInput.value = ''; 
        jigDetailsDisplaySection.classList.add('hidden'); 
        currentJigData = null; 
        allPartsData = {}; 
        recommendedPartsData = {}; // Clear recommendations on form clear
        closeSidebar(); 
        jigNumberInput.focus(); 
    }

    function openSidebar(){ 
        if (!currentJigData) {
            showInfoModal('Information', 'Please search for a Tester Jig first to view documentation.', false);
            return;
        }
        sidebarJigNumber.textContent = currentJigData.tester_jig_number; 
        docsSidebar.classList.add('open'); 
        sidebarOverlay.classList.add('open'); 
    }

    function closeSidebar(){ 
        docsSidebar.classList.remove('open'); 
        sidebarOverlay.classList.remove('open'); 
    }

    function toggleSidebar() {
        if (docsSidebar.classList.contains('open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    function showLoading(show){ if (loadingSpinner) loadingSpinner.classList.toggle('hidden', !show); }
    function showModal(modal){ if (modal) modal.classList.remove('hidden'); }
    function hideModal(modal){ if (modal) modal.classList.add('hidden'); }
    function showInfoModal(title, message, isError = false){ 
        const modalTitleEl = document.getElementById('modalTitle'); 
        const modalMessageEl = document.getElementById('modalMessage'); 
        if (modalTitleEl) modalTitleEl.textContent = title; 
        if (modalMessageEl) modalMessageEl.textContent = message; 
        if (modalTitleEl) modalTitleEl.style.color = isError ? 'var(--danger-red)' : ''; 
        if (alertModal) showModal(alertModal); 
    }
    function toggleTheme(){ 
        const currentTheme = document.documentElement.getAttribute('data-theme'); 
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark'; 
        document.documentElement.setAttribute('data-theme', newTheme); 
    }
    // Dummy functions for toast (if not fully implemented in style.css or elsewhere)
    function initializeTheme(){}
    function showToast(message, type, duration = 2000) {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.textContent = message;

        toastContainer.appendChild(toast);

        // Animate in
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        // Animate out and remove
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, duration);
    }
    
    // Documentation Search Function
    async function searchDocumentation() {
        const query = docSearchInput.value.trim();
        docSearchResults.innerHTML = ''; // Clear previous results

        if (query.length < 3) { // Only search for queries 3+ characters
            docSearchResults.classList.add('hidden'); // Hide results if query is too short
            if (defaultDocLinks) defaultDocLinks.classList.remove('hidden'); // Show default links
            return;
        }

        showLoading(true); // Assuming showLoading is global
        if (defaultDocLinks) defaultDocLinks.classList.add('hidden'); // Hide default links when searching
        docSearchResults.classList.remove('hidden');

        try {
            const response = await fetch(`/api/search_docs?query=${encodeURIComponent(query)}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Error: ${response.status}`);
            }
            const results = await response.json();

            if (results.length === 0) {
                docSearchResults.innerHTML = '<li class="no-results">No results found.</li>';
            } else {
                const ul = document.createElement('ul');
                ul.classList.add('search-results-list');
                results.forEach(result => {
                    const li = document.createElement('li');
                    // Link to PDF page: /static/docs/<filename>#page=<page_num>
                    const pdfLink = `/static/docs/${result.filename}#page=${result.page_num}`;
                    li.innerHTML = `
                        <a href="${pdfLink}" target="_blank" class="search-result-link">
                            <span class="search-result-title">${result.filename} (Page ${result.page_num})</span>
                            <span class="search-result-snippet">${result.snippet || '...'}</span>
                        </a>
                    `;
                    ul.appendChild(li);
                });
                docSearchResults.appendChild(ul);
            }
        } catch (error) {
            console.error('Error during documentation search:', error);
            docSearchResults.innerHTML = `<li class="error-results">Error: ${error.message}</li>`;
        } finally {
            showLoading(false);
        }
    }
    
    loadSearchHistory();
});