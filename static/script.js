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

    // --- New Sidebar Elements ---
    const docsSidebar = document.getElementById('docsSidebar');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const sidebarJigNumber = document.getElementById('sidebarJigNumber');
    const docLinks = document.querySelectorAll('.doc-link');

    // --- Modal and Spinner Elements ---
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

    // --- Theme Toggle Elements ---
    const themeToggle = document.getElementById('themeToggle');

    // --- State Management ---
    let currentJigData = null;
    let allPartsData = {};

    // --- Theme Management ---
    function initializeTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
        
        showToast(`Switched to ${newTheme} mode`, 'info');
    }

    function updateThemeIcon(theme) {
        const icon = themeToggle.querySelector('i');
        if (theme === 'dark') {
            icon.className = 'fas fa-sun';
        } else {
            icon.className = 'fas fa-moon';
        }
    }

    // --- Enhanced Event Listeners ---
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    if (searchJigBtn) {
        searchJigBtn.addEventListener('click', (e) => {
            addRippleEffect(e, searchJigBtn);
            searchJigDetails();
        });
    }
    
    if (jigNumberInput) {
        jigNumberInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                searchJigDetails();
            }
        });
        
        // Add input animation
        jigNumberInput.addEventListener('focus', () => {
            jigNumberInput.parentElement.classList.add('focused');
        });
        
        jigNumberInput.addEventListener('blur', () => {
            jigNumberInput.parentElement.classList.remove('focused');
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            addRippleEffect(e, clearBtn);
            clearForm();
        });
    }
    
    if (shortageListBtn) {
        shortageListBtn.addEventListener('click', (e) => {
            addRippleEffect(e, shortageListBtn);
            openPartsListModal();
        });
    }
    
    if (downloadAllPartsExcelBtn) {
        downloadAllPartsExcelBtn.addEventListener('click', (e) => {
            addRippleEffect(e, downloadAllPartsExcelBtn);
            downloadAllPartsExcel();
        });
    }
    
    if (sendTelegramAlertBtn) {
        sendTelegramAlertBtn.addEventListener('click', (e) => {
            addRippleEffect(e, sendTelegramAlertBtn);
            sendTelegramAlert(false);
        });
    }

    // --- Sidebar Listeners ---
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
    docLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const docType = e.currentTarget.dataset.docType;
            openDocument(docType);
        });
    });

    // --- Modal Listeners ---
    if (closeShortageModalBtn) closeShortageModalBtn.addEventListener('click', () => hideModal(shortageListModal));
    if (shortageModalOkBtn) {
        shortageModalOkBtn.addEventListener('click', (e) => {
            addRippleEffect(e, shortageModalOkBtn);
            hideModal(shortageListModal);
        });
    }
    if (closeModalBtn) closeModalBtn.addEventListener('click', () => hideModal(alertModal));
    if (modalOkBtn) {
        modalOkBtn.addEventListener('click', (e) => {
            addRippleEffect(e, modalOkBtn);
            hideModal(alertModal);
        });
    }
    if (shortageSaleOrderSelect) shortageSaleOrderSelect.addEventListener('change', displaySelectedPartsList);

    // --- Enhanced Functions ---

    // Ripple effect for buttons
    function addRippleEffect(event, button) {
        const ripple = button.querySelector('.btn-ripple');
        if (ripple) {
            ripple.style.transform = 'scale(0)';
            setTimeout(() => {
                ripple.style.transform = 'scale(4)';
            }, 10);
            setTimeout(() => {
                ripple.style.transform = 'scale(0)';
            }, 600);
        }
    }

    // Enhanced modal functions
    function showModal(modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function hideModal(modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    // Enhanced toast notifications
    function showToast(message, type = 'info', duration = 4000) {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.textContent = message;

        toastContainer.appendChild(toast);

        // Trigger animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        // Remove toast
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
    }

    async function searchJigDetails() {
        const jigNumber = jigNumberInput.value.trim();
        if (!jigNumber) {
            showInfoModal('Input Required', 'Please enter a Tester Jig Number.', true);
            showToast('Please enter a Tester Jig Number', 'warning');
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

            const statusFromServer = data.status || 'Status Unknown';
            console.log(`[DEBUG] Status received from server: "${statusFromServer}"`);

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

            showToast(`Successfully loaded details for ${data.tester_jig_number}`, 'success');

            if (isNotLaunched) {
                console.log("[DEBUG] Condition met: Status is 'Not Launched'. Triggering automatic alert.");
                await sendTelegramAlert(true);
            } else {
                console.log("[DEBUG] Condition not met: Status is not 'Not Launched'. No automatic alert will be sent.");
            }

        } catch (error) {
            console.error('Error fetching jig details:', error);
            showInfoModal('Search Failed', `Could not find details. Reason: ${error.message}`, true);
            showToast(`Search failed: ${error.message}`, 'error');
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
            showToast("Warning: Could not load parts data", 'warning');
        }
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
        
        partsData.forEach((item, index) => {
            const status = (item.availability_status || 'unknown').toLowerCase().replace(/\s+/g, '-');
            const row = document.createElement('tr');
            row.style.animationDelay = `${index * 50}ms`;
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

    async function sendTelegramAlert(isAutomatic = false) {
        if (!currentJigData) {
            showInfoModal('Error', 'Please search for a Jig Number first.', true);
            showToast('Please search for a Jig Number first', 'error');
            return;
        }

        if (!isAutomatic) {
            showLoading(true);
        }

        const jigNumber = currentJigData.tester_jig_number;
        const status = currentJigData.status;
        
        let shortageCount = 0;
        if (allPartsData) {
            Object.values(allPartsData).forEach(parts => {
                shortageCount += parts.filter(p => p.availability_status === 'Shortage').length;
            });
        }

        const alertType = isAutomatic ? "Automatic Alert" : "Manual Alert";
        const message = `
*${alertType}: Tester Jig Status*
------------------------------------
*Jig Number:* \`${jigNumber}\`
*Overall Status:* ${status}
*Total Shortages:* ${shortageCount}
*Official In-Charge:* ${currentJigData.officialIncharge || 'N/A'}
------------------------------------
This alert was triggered ${isAutomatic ? 'automatically due to shortage' : 'manually by a user'}.
        `;

        try {
            const response = await fetch('/api/send_telegram_alert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message.trim() })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to send alert.');
            
            if (!isAutomatic) {
                showInfoModal('Success', result.message);
                showToast('Telegram alert sent successfully', 'success');
            } else {
                console.log("Automatic Telegram alert sent successfully.");
                showToast("Automatic 'Not Launched' alert sent to Telegram", 'info');
            }
        } catch (error) {
            console.error('Error sending Telegram alert:', error);
            if (!isAutomatic) {
                showInfoModal('Telegram Error', `Could not send alert. Reason: ${error.message}`, true);
                showToast(`Failed to send alert: ${error.message}`, 'error');
            }
        } finally {
            if (!isAutomatic) {
                showLoading(false);
            }
        }
    }

    function downloadAllPartsExcel() {
        if (!currentJigData) {
            showInfoModal('Error', 'Please search for a Jig Number first.', true);
            showToast('Please search for a Jig Number first', 'error');
            return;
        }
        const url = `/api/download_all_parts_excel?jig_number=${encodeURIComponent(currentJigData.tester_jig_number)}`;
        window.open(url, '_blank');
        showToast('Excel download initiated', 'success');
    }

    function clearForm(keepInput = false) {
        if (!keepInput) {
            jigNumberInput.value = '';
            showToast('Form cleared', 'info');
        }
        jigDetailsDisplaySection.classList.add('hidden');
        currentJigData = null;
        allPartsData = {};
        closeSidebar();
        jigNumberInput.focus();
    }
    
    function openSidebar() {
        if (!currentJigData) return;
        sidebarJigNumber.textContent = currentJigData.tester_jig_number;
        docsSidebar.classList.add('open');
    }

    function closeSidebar() {
        docsSidebar.classList.remove('open');
    }

    function openDocument(docType) {
        if (!currentJigData) {
            showInfoModal('Error', 'No Tester Jig selected.', true);
            showToast('No Tester Jig selected', 'error');
            return;
        }
        const jigNumber = currentJigData.tester_jig_number;
        const pdfUrl = `atp.pdf`;
        showInfoModal('Opening Document', `Attempting to open ${docType} for ${jigNumber}. In a real app, this would open a PDF file from: ${pdfUrl}`);
        showToast(`Opening ${docType} document`, 'info');
    }

    function showLoading(show) {
        if (loadingSpinner) {
            if (show) {
                loadingSpinner.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
            } else {
                loadingSpinner.classList.add('hidden');
                document.body.style.overflow = '';
            }
        }
    }

    function showInfoModal(title, message, isError = false) {
        if (modalTitle) modalTitle.textContent = title;
        if (modalMessage) modalMessage.textContent = message;
        if (modalTitle) modalTitle.style.color = isError ? '#dc2626' : '';
        if (alertModal) showModal(alertModal);
    }

    // Enhanced keyboard navigation
    document.addEventListener('keydown', (e) => {
        // ESC key to close modals and sidebar
        if (e.key === 'Escape') {
            if (!alertModal.classList.contains('hidden')) {
                hideModal(alertModal);
            } else if (!shortageListModal.classList.contains('hidden')) {
                hideModal(shortageListModal);
            } else if (docsSidebar.classList.contains('open')) {
                closeSidebar();
            }
        }
        
        // Ctrl/Cmd + K for quick search focus
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            jigNumberInput.focus();
            jigNumberInput.select();
        }

        // Ctrl/Cmd + D for theme toggle
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            toggleTheme();
        }
    });

    // Auto-focus search input on page load
    if (jigNumberInput) {
        jigNumberInput.focus();
    }

    // Add smooth scrolling for better UX
    document.documentElement.style.scrollBehavior = 'smooth';

    // Enhanced accessibility
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(button => {
        button.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                button.click();
            }
        });
    });

    // Performance optimization: Debounce input events
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Add input validation feedback
    if (jigNumberInput) {
        const debouncedValidation = debounce((value) => {
            const isValid = /^[A-Z]{2}-\d{3,4}$/i.test(value);
            if (value && !isValid) {
                jigNumberInput.style.borderColor = '#dc2626';
                showToast('Invalid format. Use format like TJ-706', 'warning', 2000);
            } else {
                jigNumberInput.style.borderColor = '';
            }
        }, 500);

        jigNumberInput.addEventListener('input', (e) => {
            debouncedValidation(e.target.value);
        });
    }

    // Initialize theme on page load
    initializeTheme();

    console.log('HAL Tester Jig Tracking System initialized successfully');
});