// AEMS Main Application
class AEMS {
    constructor() {
        this.user = null;
        this.notifications = [];
        this.newEmailNotifications = []; // Separate array for new email notifications
        this.currentView = 'welcome';
        this.eventSource = null;
        this.unreadNotifications = 0;
        this.unreadNewEmails = 0; // Count of unread new email notifications
        this.csrfToken = null;
        this.eventListeners = new Map(); // Track event listeners for cleanup
        this.confirmCallback = null; // Store callback for custom confirm dialog
        this.init();
    }

    async init() {
        this.initializeComponents();
        await this.checkAuth();
        await this.fetchCSRFToken();
        this.bindEvents();
        this.setupRealTimeUpdates();
        this.setupCleanup();
    }

    /**
     * Setup cleanup handlers
     */
    setupCleanup() {
        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        // Clean up on visibility change (when tab becomes hidden)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Reduce resource usage when tab is hidden
                if (this.eventSource) {
                    this.eventSource.close();
                }
            } else {
                // Reconnect when tab becomes visible
                this.setupRealTimeUpdates();
            }
        });
    }

    /**
     * Clean up all resources
     */
    cleanup() {
        // Clean up event listeners
        this.cleanupEventListeners();

        // Close event source
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        // Clean up performance cache if available
        if (window.performanceCache) {
            window.performanceCache.cleanup();
        }
    }

    /**
     * Show custom confirmation dialog
     * @param {string} message - The confirmation message
     * @param {string} title - The dialog title (optional)
     * @param {string} confirmText - Text for confirm button (optional)
     * @param {string} confirmClass - CSS class for confirm button (optional)
     * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
     */
    showConfirmDialog(message, title = 'Confirm Action', confirmText = 'Confirm', confirmClass = 'btn-primary') {
        return new Promise((resolve) => {
            const dialog = document.getElementById('confirmDialog');
            const titleElement = document.getElementById('confirmTitle');
            const messageElement = document.getElementById('confirmMessage');
            const cancelButton = document.getElementById('confirmCancel');
            const confirmButton = document.getElementById('confirmOk');

            // Set content
            titleElement.textContent = title;
            messageElement.textContent = message;
            confirmButton.textContent = confirmText;

            // Update confirm button class
            confirmButton.className = `btn ${confirmClass}`;

            // Show dialog
            dialog.style.display = 'flex';

            // Handle cancel
            const handleCancel = () => {
                dialog.style.display = 'none';
                cleanup();
                resolve(false);
            };

            // Handle confirm
            const handleConfirm = () => {
                dialog.style.display = 'none';
                cleanup();
                resolve(true);
            };

            // Clean up event listeners
            const cleanup = () => {
                cancelButton.removeEventListener('click', handleCancel);
                confirmButton.removeEventListener('click', handleConfirm);
                document.removeEventListener('keydown', handleKeydown);
            };

            // Handle keyboard events
            const handleKeydown = (e) => {
                if (e.key === 'Escape') {
                    handleCancel();
                } else if (e.key === 'Enter') {
                    handleConfirm();
                }
            };

            // Add event listeners
            cancelButton.addEventListener('click', handleCancel);
            confirmButton.addEventListener('click', handleConfirm);
            document.addEventListener('keydown', handleKeydown);
        });
    }

    /**
     * Safely set HTML content using security utils
     */
    setSecureHTML(element, htmlContent) {
        if (typeof element === 'string') {
            element = document.getElementById(element);
        }

        if (!element) {
            console.error('Element not found for secure HTML setting');
            return;
        }

        if (window.securityUtils) {
            window.securityUtils.setSecureHTML(element, htmlContent);
        } else {
            // Fallback - at least escape basic HTML entities
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            element.innerHTML = tempDiv.innerHTML;
        }
    }

    /**
     * Safely escape user input for display
     */
    escapeHTML(text) {
        if (window.securityUtils) {
            return window.securityUtils.sanitizeInput(text);
        }

        // Fallback escaping
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Add event listener with cleanup tracking
     */
    addEventListener(element, event, handler, options = {}) {
        if (typeof element === 'string') {
            element = document.getElementById(element);
        }

        if (!element) {
            console.warn('Element not found for event listener:', element);
            return null;
        }

        const wrappedHandler = (e) => {
            try {
                return handler.call(this, e);
            } catch (error) {
                console.error('Event handler error:', error);
            }
        };

        element.addEventListener(event, wrappedHandler, options);

        // Track for cleanup
        const key = `${element.id || 'unknown'}_${event}_${Date.now()}`;
        this.eventListeners.set(key, {
            element,
            event,
            handler: wrappedHandler,
            options
        });

        return key;
    }

    /**
     * Remove specific event listener
     */
    removeEventListener(key) {
        const listener = this.eventListeners.get(key);
        if (listener) {
            listener.element.removeEventListener(listener.event, listener.handler, listener.options);
            this.eventListeners.delete(key);
        }
    }

    /**
     * Clean up all event listeners
     */
    cleanupEventListeners() {
        this.eventListeners.forEach((listener, key) => {
            listener.element.removeEventListener(listener.event, listener.handler, listener.options);
        });
        this.eventListeners.clear();
    }

    /**
     * Create a secure button with event listener instead of inline onclick
     */
    createSecureButton(text, className, clickHandler, attributes = {}) {
        const button = document.createElement('button');
        button.textContent = text;
        button.className = className;

        // Add any additional attributes
        Object.keys(attributes).forEach(key => {
            button.setAttribute(key, attributes[key]);
        });

        // Add secure event listener
        this.addEventListener(button, 'click', clickHandler);

        return button;
    }

    /**
     * Replace innerHTML with secure DOM manipulation
     */
    setSecureContent(container, contentBuilder) {
        // Clear existing content
        container.innerHTML = '';

        // Build content using DOM methods
        const content = contentBuilder();
        if (content instanceof Node) {
            container.appendChild(content);
        } else if (Array.isArray(content)) {
            content.forEach(node => {
                if (node instanceof Node) {
                    container.appendChild(node);
                }
            });
        }
    }

    initializeComponents() {
        this.modal = new ModalManager();
        this.tables = new DataTableManager();
        this.forms = new FormManager();
        this.workflow = new WorkflowManager();
    }

    async fetchCSRFToken() {
        // Always fetch CSRF token for security
        try {
            const response = await fetch('/api/csrf-token');
            if (response.ok) {
                const data = await response.json();
                this.csrfToken = data.csrfToken;
            }
        } catch (error) {
            console.error('Failed to fetch CSRF token:', error);
            // Continue without CSRF token - server will handle gracefully
        }
    }

    async apiRequest(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Add CSRF token if available and it's a state-changing request
        if (this.csrfToken && options.method && options.method !== 'GET') {
            headers['CSRF-Token'] = this.csrfToken;
        }

        return fetch(url, {
            ...options,
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        });
    }

    async checkAuth() {
        try {
            const response = await fetch('/api/user');
            const data = await response.json();

            if (data.connected) {
                this.user = data.user;
                this.showDashboard();
            } else {
                this.showWelcome();
            }
        } catch (error) {
            this.showWelcome();
        }
    }

    showWelcome() {
        this.currentView = 'welcome';
        const mainContent = document.getElementById('mainContent');

        // Use secure HTML rendering
        const welcomeHTML = `
      <div class="welcome-screen">
        <div class="card welcome-card">
          <div class="card-header">
            <div class="flex items-center justify-center mb-4">
              <i class="fas fa-envelope-open-text" style="font-size: 3rem; color: hsl(var(--primary));"></i>
            </div>
            <h2 class="card-title text-center">Welcome to AEMS</h2>
            <p class="card-description text-center">
              Connect your Gmail account to start managing your emails with AI-powered categorization and extraction.
            </p>
          </div>
          <div class="card-content">
            <button class="btn btn-primary btn-xl" id="connectGmailBtn" style="width: 100%;">
              <i class="fas fa-google"></i>
              Connect Gmail Account
            </button>
          </div>
        </div>
      </div>
    `;

        if (window.securityUtils) {
            window.securityUtils.setSecureHTML(mainContent, welcomeHTML);
        } else {
            // Fallback for when security utils not loaded
            mainContent.innerHTML = welcomeHTML;
        }

        // Add event listener for connect button
        const connectBtn = document.getElementById('connectGmailBtn');
        if (connectBtn) {
            connectBtn.addEventListener('click', function () {
                window.location.href = '/auth/google';
            });
        }

        // Update header user button
        const userButton = document.getElementById('userButton');
        if (userButton) {
            userButton.innerHTML = '<i class="fas fa-user"></i><span>Connect Gmail</span>';
        }

        // Hide dashboard buttons
        const syncBtn = document.getElementById('syncBtn');
        const recycleBinBtn = document.getElementById('recycleBinBtn');
        const signOutBtn = document.getElementById('signOutBtn');

        if (syncBtn) syncBtn.style.display = 'none';
        if (recycleBinBtn) recycleBinBtn.style.display = 'none';
        if (signOutBtn) signOutBtn.style.display = 'none';
    }

    async showDashboard() {
        this.currentView = 'dashboard';

        try {
            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
        <div class="container dashboard">
          <div class="dashboard-header">
            <h1 class="dashboard-title">Email Dashboard</h1>
            <p class="dashboard-description">Manage your emails across the three-stage workflow</p>
          </div>

          <!-- Navigation Tabs -->
          <div class="nav-tabs">
            <button class="nav-tab active" data-stage="fetched" id="fetchedTab">
              Fetched
              <span class="badge badge-secondary" id="fetchedBadge">0</span>
            </button>
            <button class="nav-tab" data-stage="review" id="reviewTab">
              Review
              <span class="badge badge-secondary" id="reviewBadge">0</span>
            </button>
            <button class="nav-tab" data-stage="managed" id="managedTab">
              Managed
              <span class="badge badge-secondary" id="managedBadge">0</span>
            </button>
          </div>

          <!-- Email Table Container -->
          <div class="card">
            <div class="card-header">
              <div class="flex justify-between items-center">
                <div>
                  <div class="card-title" id="currentStageTitle">Fetched Emails</div>
                  <div class="card-description text-muted-foreground" id="currentStageDescription">
                    New emails waiting for approval
                  </div>
                </div>
                <div class="flex gap-2" id="tableControls" style="display: none;">
                  <button class="btn btn-outline btn-sm" id="showOtherToggle" data-show-other="false">
                    <i class="fas fa-eye-slash"></i>
                    Show Other
                  </button>
                  <button class="btn btn-ghost btn-sm" id="syncOldBtn">
                    <i class="fas fa-history"></i>
                    Sync Old
                  </button>
                </div>
              </div>
            </div>
            <div class="card-content">
              <div id="emailTableContainer">
                <div id="emailTable"></div>
              </div>
            </div>
          </div>
        </div>
      `;

            // Update header user info
            const userButton = document.getElementById('userButton');
            const userInfo = document.getElementById('userInfo');
            if (userButton && this.user) {
                const userName = this.escapeHTML(this.user.name || this.user.email);
                userButton.innerHTML = `<i class="fas fa-user"></i><span>${userName}</span>`;

                // Populate user info in dropdown
                if (userInfo) {
                    userInfo.innerHTML = `
                        <div style="padding: 0.75rem; border-bottom: 1px solid hsl(var(--border));">
                            <div style="font-weight: 500; margin-bottom: 0.25rem;">${userName}</div>
                            <div style="font-size: 0.875rem; color: hsl(var(--muted-foreground));">${this.escapeHTML(this.user.email)}</div>
                        </div>
                    `;
                }
            }

            // Show dashboard buttons
            const syncBtn = document.getElementById('syncBtn');
            const recycleBinBtn = document.getElementById('recycleBinBtn');
            const signOutBtn = document.getElementById('signOutBtn');

            if (syncBtn) syncBtn.style.display = 'block';
            if (recycleBinBtn) recycleBinBtn.style.display = 'block';
            if (signOutBtn) signOutBtn.style.display = 'block';

            // Initialize dashboard functionality
            this.bindDashboardEvents();
            this.showOtherEmails = false; // Track filter state
            this.renderNotifications(); // Initialize notification display

            // Add direct event listener for sync old button
            const syncOldBtn = document.getElementById('syncOldBtn');
            if (syncOldBtn) {
                syncOldBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.showSyncOldModal();
                });
            }

            // Update all tab badges with current stats
            await this.updateAllTabBadges();

            // Load the fetched stage (default)
            await this.loadCurrentStage('fetched');

        } catch (error) {
            console.error('Failed to load dashboard:', error);
        }
    }


    async updateAllTabBadges() {
        try {
            console.log('Updating all tab badges...');

            // Load counts for all stages including deleted
            const [fetchedResponse, reviewResponse, managedResponse, deletedResponse] = await Promise.all([
                fetch('/api/emails/fetched'),
                fetch('/api/emails/review'),
                fetch('/api/emails/processed'),
                fetch('/api/emails/deleted')
            ]);

            const [fetchedEmails, reviewEmails, managedEmails, deletedEmails] = await Promise.all([
                fetchedResponse.json(),
                reviewResponse.json(),
                managedResponse.json(),
                deletedResponse.json()
            ]);

            console.log('Email counts:', {
                fetched: fetchedEmails.length,
                review: reviewEmails.length,
                managed: managedEmails.length,
                deleted: deletedEmails.length
            });

            // Update tab badges
            const fetchedBadge = document.getElementById('fetchedBadge');
            const reviewBadge = document.getElementById('reviewBadge');
            const managedBadge = document.getElementById('managedBadge');

            if (fetchedBadge) fetchedBadge.textContent = fetchedEmails.length;
            if (reviewBadge) reviewBadge.textContent = reviewEmails.length;
            if (managedBadge) managedBadge.textContent = managedEmails.length;

            // Recycle bin badge removed - no longer showing count

        } catch (error) {
            console.error('Failed to update tab badges:', error);
        }
    }

    async loadCurrentStage(stage) {
        const endpoints = {
            fetched: '/api/emails/fetched',
            review: '/api/emails/review',
            managed: '/api/emails/processed',
            deleted: '/api/emails/deleted'
        };

        const titles = {
            fetched: 'Fetched Emails',
            review: 'Under Review',
            managed: 'Processed Emails',
            deleted: 'Recycle Bin'
        };

        const descriptions = {
            fetched: 'New emails waiting for approval',
            review: 'Emails being reviewed and processed',
            managed: 'Completed and processed emails',
            deleted: 'Deleted emails that can be restored'
        };

        try {
            // Build URL with query parameters for fetched emails
            let url = endpoints[stage];
            if (stage === 'fetched') {
                const showOther = this.showOtherEmails || false;
                url += `?includeOther=${showOther}`;
            }

            const response = await fetch(url);
            const emails = await response.json();

            console.log(`Loading ${stage} stage:`, { url, emailCount: emails.length, emails: emails.slice(0, 2) });

            // Update UI
            document.getElementById('currentStageTitle').textContent = titles[stage];
            document.getElementById('currentStageDescription').textContent = descriptions[stage];

            // Show/hide table controls for fetched stage
            const tableControls = document.getElementById('tableControls');
            if (tableControls) {
                tableControls.style.display = stage === 'fetched' ? 'flex' : 'none';
            }

            // Update navigation tab badges
            const badges = {
                fetched: document.getElementById('fetchedBadge'),
                review: document.getElementById('reviewBadge'),
                managed: document.getElementById('managedBadge'),
                deleted: document.getElementById('deletedBadge')
            };

            if (badges[stage]) {
                badges[stage].textContent = emails.length;
            }

            // Render email table
            this.renderEmailTable(stage, emails);

        } catch (error) {
            console.error(`Failed to load ${stage} emails:`, error);
            // Show error message in table
            const container = document.getElementById('emailTable');
            if (container) {
                const safeStage = this.escapeHTML(stage);

                // Create error content using secure DOM manipulation
                this.setSecureContent(container, () => {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'text-center';
                    errorDiv.style.padding = '2rem';

                    const errorText = document.createElement('p');
                    errorText.className = 'text-destructive';
                    errorText.textContent = `Failed to load ${safeStage} emails. Please try again.`;

                    const retryButton = this.createSecureButton(
                        'Retry',
                        'btn btn-outline btn-sm',
                        () => this.loadCurrentStage(stage)
                    );

                    errorDiv.appendChild(errorText);
                    errorDiv.appendChild(retryButton);

                    return errorDiv;
                });
            }
        }
    }

    renderEmailTable(stage, emails) {
        const container = document.getElementById('emailTable');
        console.log(`Rendering ${stage} table:`, { emailCount: emails.length, container: !!container });

        if (!container) {
            console.error('Email table container not found!');
            return;
        }

        if (emails.length === 0) {
            container.innerHTML = `
        <div class="text-center" style="padding: 2rem;">
          <p class="text-muted">No emails in this stage</p>
        </div>
      `;
            return;
        }

        // Define headers based on stage
        let headers = '';
        if (stage === 'review') {
            headers = `
        <th><input type="checkbox" id="selectAll"></th>
        <th>Date</th>
        <th>Subject</th>
        <th>Category</th>
        <th>Customer Info</th>
        <th>Business Details</th>
        <th>Actions</th>
      `;
        } else if (stage === 'managed') {
            headers = `
        <th><input type="checkbox" id="selectAll"></th>
        <th>Date</th>
        <th>Subject</th>
        <th>Category</th>
        <th>Customer Info</th>
        <th>Business Details</th>
        <th>Actions</th>
      `;
        } else if (stage === 'deleted') {
            headers = `
        <th><input type="checkbox" id="selectAll"></th>
        <th>Date</th>
        <th>Subject</th>
        <th>From</th>
        <th>Category</th>
        <th>Deleted At</th>
        <th>Actions</th>
      `;
        } else {
            headers = `
        <th><input type="checkbox" id="selectAll"></th>
        <th>Date</th>
        <th>Subject</th>
        <th>From</th>
        <th>Category</th>
        <th>Actions</th>
      `;
        }

        let tableHTML = `
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              ${headers}
            </tr>
          </thead>
          <tbody>
            ${emails.map(email => this.renderEmailRow(stage, email)).join('')}
          </tbody>
        </table>
      </div>
      ${this.renderBulkActions(stage)}
    `;

        container.innerHTML = tableHTML;
        this.bindTableEvents(stage);
    }

    renderEmailRow(stage, email) {
        const date = new Date(email.date).toLocaleDateString();
        const category = this.formatCategory(email.category);
        const actions = this.getActionsForStage(stage, email.id);

        if (stage === 'review') {
            const combinedFields = this.getCombinedFields(email);
            return `
        <tr id="email-row-${email.id}">
          <td><input type="checkbox" class="email-checkbox" value="${email.id}"></td>
          <td>${date}</td>
          <td class="truncate" style="max-width: 200px;" title="${email.subject}">${email.subject}</td>
          <td>${category}</td>
          <td>${combinedFields.customerInfo}</td>
          <td>${combinedFields.businessDetails}</td>
          <td>${actions}</td>
        </tr>
      `;
        } else if (stage === 'managed') {
            const combinedFields = this.getCombinedFields(email);
            return `
        <tr id="email-row-${email.id}">
          <td><input type="checkbox" class="email-checkbox" value="${email.id}"></td>
          <td>${date}</td>
          <td class="truncate" style="max-width: 200px;" title="${email.subject}">${email.subject}</td>
          <td>${category}</td>
          <td>${combinedFields.customerInfo}</td>
          <td>${combinedFields.businessDetails}</td>
          <td>${actions}</td>
        </tr>
      `;
        } else if (stage === 'deleted') {
            const deletedDate = email.deletedAt ? new Date(email.deletedAt).toLocaleDateString() : 'Unknown';
            return `
        <tr id="email-row-${email.id}">
          <td><input type="checkbox" class="email-checkbox" value="${email.id}"></td>
          <td>${date}</td>
          <td class="truncate" style="max-width: 200px;" title="${email.subject}">${email.subject}</td>
          <td>${email.fromName || email.fromAddress}</td>
          <td>${category}</td>
          <td>${deletedDate}</td>
          <td>${actions}</td>
        </tr>
      `;
        } else {
            // Fetched stage - add category selector for "other" emails
            const categorySelector = this.renderCategorySelector(email);
            return `
        <tr id="email-row-${email.id}">
          <td><input type="checkbox" class="email-checkbox" value="${email.id}"></td>
          <td>${date}</td>
          <td class="truncate" style="max-width: 300px;" title="${email.subject}">${email.subject}</td>
          <td>${email.fromName || email.fromAddress}</td>
          <td>${categorySelector}</td>
          <td>${actions}</td>
        </tr>
      `;
        }
    }

    renderExtractedDataPreview(email) {
        // Review stage - show extracted data that can be edited
        const category = (email.category || '').toLowerCase();

        if (category === 'customer_inquiry') {
            return `
        <div class="extracted-data customer-data">
          <div class="data-field">
            <span class="field-label">Name:</span>
            <span class="field-value editable" data-field="customerName" data-email-id="${email.id}">
              ${email.customerName || 'Not extracted'}
            </span>
          </div>
          <div class="data-field">
            <span class="field-label">Email:</span>
            <span class="field-value editable" data-field="customerEmail" data-email-id="${email.id}">
              ${email.customerEmail || 'Not extracted'}
            </span>
          </div>
          <div class="data-field">
            <span class="field-label">Phone:</span>
            <span class="field-value editable" data-field="customerPhone" data-email-id="${email.id}">
              ${email.customerPhone || 'Not extracted'}
            </span>
          </div>
          <div class="data-field">
            <span class="field-label">Company:</span>
            <span class="field-value editable" data-field="company" data-email-id="${email.id}">
              ${email.company || 'Not extracted'}
            </span>
          </div>
          <div class="data-field">
            <span class="field-label">Service:</span>
            <span class="field-value editable" data-field="serviceInterest" data-email-id="${email.id}">
              ${email.serviceInterest || 'Not extracted'}
            </span>
          </div>
        </div>
      `;
        } else if (category === 'invoice') {
            return `
        <div class="extracted-data invoice-data">
          <div class="data-field">
            <span class="field-label">Invoice #:</span>
            <span class="field-value editable" data-field="invoiceNumber" data-email-id="${email.id}">
              ${email.invoiceNumber || 'Not extracted'}
            </span>
          </div>
          <div class="data-field">
            <span class="field-label">Date:</span>
            <span class="field-value editable" data-field="invoiceDate" data-email-id="${email.id}">
              ${email.invoiceDate || 'Not extracted'}
            </span>
          </div>
          <div class="data-field">
            <span class="field-label">Customer:</span>
            <span class="field-value editable" data-field="invoiceClient" data-email-id="${email.id}">
              ${email.invoiceClient || 'Not extracted'}
            </span>
          </div>
          <div class="data-field">
            <span class="field-label">Amount:</span>
            <span class="field-value editable" data-field="invoiceAmount" data-email-id="${email.id}">
              ${email.invoiceAmount || 'Not extracted'}
            </span>
          </div>
          <div class="data-field">
            <span class="field-label">VAT:</span>
            <span class="field-value editable" data-field="invoiceVAT" data-email-id="${email.id}">
              ${email.invoiceVAT || 'Not extracted'}
            </span>
          </div>
        </div>
      `;
        } else {
            return `<span class="text-muted">No extraction available</span>`;
        }
    }

    renderProcessedDataPreview(email) {
        // Managed stage - show final processed data
        const category = (email.category || '').toLowerCase();

        if (category === 'customer_inquiry') {
            const name = email.customerName || 'N/A';
            const email_addr = email.customerEmail || 'N/A';
            const company = email.company || 'N/A';
            return `
        <div class="processed-data">
          <strong>${name}</strong><br>
          ${email_addr}<br>
          ${company}
        </div>
      `;
        } else if (category === 'invoice') {
            const invoiceNum = email.invoiceNumber || 'N/A';
            const amount = email.invoiceAmount || 'N/A';
            const customer = email.invoiceClient || 'N/A';
            return `
        <div class="processed-data">
          <strong>Invoice #${invoiceNum}</strong><br>
          ${customer}<br>
          Amount: ${amount}
        </div>
      `;
        } else {
            return `<span class="text-muted">No data</span>`;
        }
    }

    formatCategory(category) {
        const categoryMap = {
            'CUSTOMER_INQUIRY': { label: 'Customer Inquiry', class: 'badge-secondary' },
            'customer_inquiry': { label: 'Customer Inquiry', class: 'badge-secondary' },
            'INVOICE': { label: 'Invoice', class: 'badge-secondary' },
            'invoice': { label: 'Invoice', class: 'badge-secondary' },
            'OTHER': { label: 'Other', class: 'badge-secondary' },
            'other': { label: 'Other', class: 'badge-secondary' }
        };

        const cat = categoryMap[category] || categoryMap.OTHER;
        return `<span class="badge ${cat.class}">${cat.label}</span>`;
    }

    getActionsForStage(stage, emailId) {
        switch (stage) {
            case 'fetched':
                return `
          <div class="btn-group">
            <button class="btn btn-sm btn-primary" data-action="approveEmail" data-email-id="${emailId}">
              Process
            </button>
            <button class="btn btn-sm btn-secondary" data-action="declineEmail" data-email-id="${emailId}">
              Decline
            </button>
          </div>
        `;
            case 'review':
                return `
          <div class="btn-group">
            <button class="btn btn-sm btn-primary" data-action="processEmail" data-email-id="${emailId}">
              Approve
            </button>
            <button class="btn btn-sm btn-outline" data-action="editEmail" data-email-id="${emailId}">
              Edit
            </button>
            <button class="btn btn-sm btn-secondary" data-action="deleteEmail" data-email-id="${emailId}">
              Delete
            </button>
          </div>
        `;
            case 'managed':
                return `
          <div class="btn-group">
            <button class="btn btn-sm btn-secondary" data-action="deleteEmail" data-email-id="${emailId}">
              Delete
            </button>
          </div>
        `;
            case 'deleted':
                return `
          <div class="btn-group">
            <button class="btn btn-sm btn-primary" data-action="restoreEmail" data-email-id="${emailId}">
              Restore
            </button>
            <button class="btn btn-sm btn-destructive" data-action="permanentDeleteEmail" data-email-id="${emailId}">
              Delete Permanently
            </button>
          </div>
        `;
            default:
                return '';
        }
    }

    renderBulkActions(stage) {
        const actions = {
            fetched: [
                { label: 'Process Selected', action: 'bulkApprove', class: 'btn-primary' },
                { label: 'Decline Selected', action: 'bulkDecline', class: 'btn-secondary' }
            ],
            review: [
                { label: 'Approve Selected', action: 'bulkApproveReview', class: 'btn-primary' }
            ],
            managed: [
                { label: 'Export All', action: 'exportManagedEmails', class: 'btn-outline', icon: 'fas fa-download' }
            ],
            deleted: [
                { label: 'Restore Selected', action: 'bulkRestoreEmails', class: 'btn-primary' },
                { label: 'Delete Permanently', action: 'bulkPermanentDeleteEmails', class: 'btn-destructive' }
            ]
        };

        if (!actions[stage]) return '';

        return `
      <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border);">
        <div class="flex justify-between items-center">
          <span id="selectedCount" class="text-muted">0 selected</span>
          <div class="btn-group">
            ${actions[stage].map(action =>
            `<button class="btn btn-sm ${action.class}" data-action="${action.action}" ${action.action === 'exportManagedEmails' ? '' : 'disabled'}>
                ${action.icon ? `<i class="${action.icon}"></i> ` : ''}${action.label}
              </button>`
        ).join('')}
          </div>
        </div>
      </div>
    `;
    }

    bindDashboardEvents() {
        // Navigation tab events
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                // Add active class to clicked tab
                tab.classList.add('active');

                const stageName = tab.dataset.stage;
                this.loadCurrentStage(stageName);
            });
        });

        // Event delegation for action buttons
        document.addEventListener('click', (e) => {
            const button = e.target.closest('[data-action]');
            if (button) {
                const action = button.dataset.action;
                const emailId = button.dataset.emailId;

                // Call the appropriate method on the app instance
                if (this[action] && typeof this[action] === 'function') {
                    if (emailId) {
                        this[action](emailId);
                    } else {
                        this[action]();
                    }
                }
            }
        });

        // Use event delegation for dynamically created buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('#showOtherToggle')) {
                e.preventDefault();
                this.toggleOtherEmails();
            }
            // Note: syncOldBtn moved to main event delegation system
        });

        // Use event delegation for recycle bin button, AEMS title, and notifications
        document.addEventListener('click', (e) => {
            if (e.target.closest('#recycleBinBtn')) {
                e.preventDefault();
                this.showRecycleBin();
            }

            // Handle AEMS title click for home navigation
            if (e.target.closest('#aemsTitle')) {
                e.preventDefault();

                // Navigate to home (dashboard or welcome)
                if (this.user) {
                    this.showDashboard();
                } else {
                    this.showWelcome();
                }
            }

            // Handle notification button click
            if (e.target.closest('#notificationBtn')) {
                e.preventDefault();
                const dropdown = document.getElementById('notificationDropdown');
                if (dropdown) {
                    dropdown.classList.toggle('active');
                }
            }

            // Handle user button click
            if (e.target.closest('#userButton')) {
                e.preventDefault();
                if (this.user) {
                    // Show dropdown if already connected
                    const dropdown = document.getElementById('userDropdown');
                    if (dropdown) {
                        dropdown.classList.toggle('active');
                    }
                } else {
                    // Redirect to Gmail auth if not connected
                    window.location.href = '/auth/google';
                }
            }

            // Handle sync button click
            if (e.target.closest('#syncBtn')) {
                e.preventDefault();
                if (this.currentView === 'dashboard') {
                    this.syncEmails();
                }
            }

            // Handle sign out button click
            if (e.target.closest('#signOutBtn')) {
                e.preventDefault();
                this.signOut();
            }

            // Handle mark all notifications as read button
            if (e.target.closest('#markAllReadBtn')) {
                e.preventDefault();
                this.markAllNotificationsAsRead();
            }

            // Handle sync old emails button
            if (e.target.closest('#syncOldBtn')) {
                e.preventDefault();
                this.showSyncOldModal();
            }

            // Close dropdowns when clicking outside
            if (!e.target.closest('.notification-dropdown')) {
                const notificationDropdown = document.getElementById('notificationDropdown');
                if (notificationDropdown) {
                    notificationDropdown.classList.remove('active');
                }
            }
            if (!e.target.closest('.user-dropdown')) {
                const userDropdown = document.getElementById('userDropdown');
                if (userDropdown) {
                    userDropdown.classList.remove('active');
                }
            }
        });
    }

    bindTableEvents(stage) {
        // Select all checkbox
        const selectAll = document.getElementById('selectAll');
        if (selectAll) {
            selectAll.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('.email-checkbox');
                checkboxes.forEach(cb => cb.checked = e.target.checked);
                this.updateSelectedCount();
            });
        }

        // Individual checkboxes
        document.querySelectorAll('.email-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateSelectedCount();
            });
        });
    }

    updateSelectedCount() {
        const selectedCheckboxes = document.querySelectorAll('.email-checkbox:checked');
        const count = selectedCheckboxes.length;

        const selectedCountEl = document.getElementById('selectedCount');
        if (selectedCountEl) {
            selectedCountEl.textContent = `${count} selected`;
        }

        // Enable/disable bulk action buttons
        const bulkButtons = document.querySelectorAll('[data-action^="bulk"]');
        bulkButtons.forEach(btn => {
            btn.disabled = count === 0;
        });
    }

    async syncEmails() {
        const syncBtn = document.getElementById('syncBtn');
        const originalHTML = syncBtn.innerHTML;

        try {
            syncBtn.innerHTML = '<div class="spinner"></div> Syncing...';
            syncBtn.disabled = true;

            const response = await fetch('/api/emails/sync', { method: 'POST' });
            const result = await response.json();

            if (response.ok) {
                this.addNotification('Email Sync', `Synced ${result.count} new emails`, 'success');
                await this.refreshCurrentView();
            } else {
                throw new Error(result.error || 'Sync failed');
            }

        } catch (error) {
            // Email sync failed
        } finally {
            syncBtn.innerHTML = originalHTML;
            syncBtn.disabled = false;
        }
    }

    async refreshCurrentView() {
        // Update all tab badges with fresh counts
        await this.updateAllTabBadges();

        // Reload current stage or current view
        if (this.currentView === 'recycle-bin') {
            await this.showRecycleBin();
        } else {
            const activeTab = document.querySelector('.nav-tab.active');
            if (activeTab) {
                await this.loadCurrentStage(activeTab.dataset.stage);
            }
        }
    }

    async showRecycleBin() {
        console.log('showRecycleBin() called');
        this.currentView = 'recycle-bin';

        try {
            // Remove active class from all nav tabs
            document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));

            // Load deleted emails
            const response = await fetch('/api/emails/deleted');
            const emails = await response.json();

            // Update main content
            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
        <div class="container dashboard">
          <div class="dashboard-header">
            <div class="flex justify-between items-center">
              <div>
                <h2 class="dashboard-title">Recycle Bin</h2>
                <p class="dashboard-description">Deleted emails that can be restored or permanently deleted</p>
              </div>
              <button class="btn btn-ghost btn-sm" id="backToDashboardBtn">
                <i class="fas fa-arrow-left"></i>
                Back to Dashboard
              </button>
            </div>
          </div>

          <div class="card">
            <div class="card-content">
              <div id="recycleBinTable"></div>
            </div>
          </div>
        </div>
      `;

            // Bind back to dashboard button
            const backBtn = document.getElementById('backToDashboardBtn');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    this.showDashboard();
                });
            }

            // Render the deleted emails table
            this.renderRecycleBinTable(emails);

        } catch (error) {
            console.error('Failed to load recycle bin:', error);
            // Show error message
            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
        <div class="container">
          <div class="text-center" style="padding: 2rem;">
            <p class="text-muted">Failed to load recycle bin</p>
            <button class="btn btn-primary" id="backToDashboardErrorBtn">Back to Dashboard</button>
          </div>
        </div>
      `;

            // Bind back to dashboard button for error case
            const backErrorBtn = document.getElementById('backToDashboardErrorBtn');
            if (backErrorBtn) {
                backErrorBtn.addEventListener('click', () => {
                    this.showDashboard();
                });
            }
        }
    }

    renderRecycleBinTable(emails) {
        const container = document.getElementById('recycleBinTable');

        if (emails.length === 0) {
            container.innerHTML = `
        <div class="text-center" style="padding: 2rem;">
          <p class="text-muted">Recycle bin is empty</p>
        </div>
      `;
            return;
        }

        const tableHTML = `
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th><input type="checkbox" id="selectAll"></th>
              <th>Date</th>
              <th>Subject</th>
              <th>From</th>
              <th>Category</th>
              <th>Deleted At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${emails.map(email => this.renderEmailRow('deleted', email)).join('')}
          </tbody>
        </table>
      </div>
      ${this.renderBulkActions('deleted')}
    `;

        container.innerHTML = tableHTML;
        this.bindTableEvents('deleted');
    }

    async approveEmail(emailId) {
        // Find the process button for this email
        const processBtn = document.querySelector(`[data-action="approveEmail"][data-email-id="${emailId}"]`);
        const originalHTML = processBtn ? processBtn.innerHTML : '';

        try {
            // Show loading state
            if (processBtn) {
                processBtn.innerHTML = '<div class="spinner"></div> Processing...';
                processBtn.disabled = true;
            }

            const response = await fetch(`/api/emails/fetched/${emailId}/approve`, {
                method: 'POST'
            });

            if (response.ok) {
                this.addNotification('Email Processed', 'Email moved to review stage for data extraction', 'success');
                await this.refreshCurrentView();
            } else {
                throw new Error('Failed to approve email');
            }
        } catch (error) {
            this.addNotification('Process Failed', 'Failed to process email', 'error');
        } finally {
            // Restore button state (if still exists after refresh)
            if (processBtn && document.contains(processBtn)) {
                processBtn.innerHTML = originalHTML;
                processBtn.disabled = false;
            }
        }
    }

    async declineEmail(emailId) {
        try {
            const response = await this.apiRequest(`/api/emails/fetched/${emailId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.addNotification('Email Declined', 'Email moved to recycle bin', 'success');
                await this.refreshCurrentView();
            } else {
                throw new Error('Failed to decline email');
            }
        } catch (error) {
            this.addNotification('Decline Failed', 'Failed to decline email', 'error');
        }
    }

    async viewEmail(emailId) {
        try {
            // Show loading state with UI enhancements
            if (window.uiEnhancements) {
                window.uiEnhancements.showLoading('Loading email details...');
            }

            // Fetch email details
            const response = await fetch(`/api/emails/managed/${emailId}`);
            if (!response.ok) throw new Error('Failed to fetch email details');

            const email = await response.json();

            // Debug: Log the received email data
            console.log('Received email data:', email);
            console.log('Email fields:', {
                category: email.category,
                customerName: email.customerName,
                customerEmail: email.customerEmail,
                invoiceNumber: email.invoiceNumber,
                body: email.body,
                snippet: email.snippet,
                htmlBody: email.htmlBody,
                content: email.content
            });

            // Hide loading
            if (window.uiEnhancements) {
                window.uiEnhancements.hideLoading();
            }

            // Show email in modal
            this.showEmailModal(email);

        } catch (error) {
            console.error('Failed to view email:', error);
            if (window.uiEnhancements) {
                window.uiEnhancements.hideLoading();
                window.uiEnhancements.showToast('Failed to load email details', 'error');
            }
        }
    }

    showEmailModal(email) {
        const modal = document.getElementById('emailModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalFooter = document.getElementById('modalFooter');

        if (!modal || !modalTitle || !modalBody) {
            console.error('Modal elements not found');
            return;
        }

        // Set modal title
        modalTitle.textContent = email.subject || 'Email Details';

        // Format the email date
        const emailDate = new Date(email.date).toLocaleString();
        const category = this.formatCategory(email.category);

        // Build modal body content
        let extractedDataHtml = '';

        if (email.category === 'customer_inquiry' || email.category === 'CUSTOMER_INQUIRY') {
            extractedDataHtml = `
        <div class="modal-section">
          <h4>Customer Information</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Name:</span>
              <span class="info-value">${email.customerName || 'N/A'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Email:</span>
              <span class="info-value">${email.customerEmail || 'N/A'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Phone:</span>
              <span class="info-value">${email.customerPhone || 'N/A'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Company:</span>
              <span class="info-value">${email.company || 'N/A'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Service Interest:</span>
              <span class="info-value">${email.serviceInterest || 'N/A'}</span>
            </div>
          </div>
        </div>
      `;
        } else if (email.category === 'invoice' || email.category === 'INVOICE') {
            extractedDataHtml = `
        <div class="modal-section">
          <h4>Invoice Details</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Invoice Number:</span>
              <span class="info-value">${email.invoiceNumber || 'N/A'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Date:</span>
              <span class="info-value">${email.invoiceDate || 'N/A'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Client:</span>
              <span class="info-value">${email.invoiceClient || 'N/A'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Amount:</span>
              <span class="info-value">${email.invoiceAmount || 'N/A'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">VAT:</span>
              <span class="info-value">${email.invoiceVAT || 'N/A'}</span>
            </div>
          </div>
        </div>
      `;
        }

        modalBody.innerHTML = `
      <div class="modal-section">
        <h4>Email Information</h4>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">From:</span>
            <span class="info-value">${email.fromName || email.fromAddress || 'Unknown'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Date:</span>
            <span class="info-value">${emailDate}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Category:</span>
            <span class="info-value">${category}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Status:</span>
            <span class="info-value"><span class="badge badge-success">Managed</span></span>
          </div>
        </div>
      </div>

      ${extractedDataHtml}

      <div class="modal-section">
        <h4>Email Content</h4>
        <div class="email-content">
          ${email.body || email.snippet || email.htmlBody || 'No content available'}
        </div>
      </div>

      <div class="modal-section">
        <h4>AI Analysis</h4>
        <div class="ai-analysis">
          <div class="info-item">
            <span class="info-label">Summary:</span>
            <span class="info-value">${email.summary || 'No summary available'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Action Required:</span>
            <span class="info-value">${email.action_required || 'None specified'}</span>
          </div>
        </div>
      </div>
    `;

        // Add footer actions
        modalFooter.innerHTML = `
      <button class="btn btn-outline" onclick="window.print()">
        <i class="fas fa-print"></i> Print
      </button>
      <button class="btn btn-outline" onclick="app.exportEmail('${email.id}')">
        <i class="fas fa-download"></i> Export
      </button>
      <button class="btn btn-secondary" id="closeModalBtnFooter">
        Close
      </button>
    `;

        // Bind close button in footer
        const closeBtn = document.getElementById('closeModalBtnFooter');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }

        // Show modal with animation
        modal.style.display = 'block';
        modal.classList.add('fade-in');

        // Add click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    async exportEmail(emailId) {
        try {
            // Show loading toast
            let toastId;
            if (window.uiEnhancements) {
                toastId = window.uiEnhancements.showToast('Exporting email...', 'loading');
            }

            const response = await fetch(`/api/emails/managed/${emailId}`);
            if (!response.ok) throw new Error('Failed to export email');

            const email = await response.json();

            // Create a formatted text export
            const exportContent = this.formatEmailForExport(email);

            // Download the file
            const blob = new Blob([exportContent], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `email_${email.id}_${new Date().toISOString().split('T')[0]}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            // Update toast
            if (window.uiEnhancements && toastId) {
                window.uiEnhancements.removeToast(toastId);
                window.uiEnhancements.showToast('Email exported successfully', 'success');
            }

        } catch (error) {
            console.error('Failed to export email:', error);
            if (window.uiEnhancements) {
                window.uiEnhancements.showToast('Failed to export email', 'error');
            }
        }
    }

    formatEmailForExport(email) {
        const date = new Date(email.date).toLocaleString();
        let content = `Email Export - ${date}\n`;
        content += '='.repeat(50) + '\n\n';

        content += `Subject: ${email.subject || 'No subject'}\n`;
        content += `From: ${email.fromName || email.fromAddress || 'Unknown'}\n`;
        content += `Date: ${date}\n`;
        content += `Category: ${email.category || 'Uncategorized'}\n`;
        content += `Status: Managed\n\n`;

        if (email.category === 'customer_inquiry' || email.category === 'CUSTOMER_INQUIRY') {
            content += 'CUSTOMER INFORMATION\n';
            content += '-'.repeat(20) + '\n';
            content += `Name: ${email.customerName || 'N/A'}\n`;
            content += `Email: ${email.customerEmail || 'N/A'}\n`;
            content += `Phone: ${email.customerPhone || 'N/A'}\n`;
            content += `Company: ${email.company || 'N/A'}\n`;
            content += `Service Interest: ${email.serviceInterest || 'N/A'}\n\n`;
        } else if (email.category === 'invoice' || email.category === 'INVOICE') {
            content += 'INVOICE DETAILS\n';
            content += '-'.repeat(20) + '\n';
            content += `Invoice Number: ${email.invoiceNumber || 'N/A'}\n`;
            content += `Invoice Date: ${email.invoiceDate || 'N/A'}\n`;
            content += `Client: ${email.invoiceClient || 'N/A'}\n`;
            content += `Amount: ${email.invoiceAmount || 'N/A'}\n`;
            content += `VAT: ${email.invoiceVAT || 'N/A'}\n\n`;
        }

        content += 'EMAIL CONTENT\n';
        content += '-'.repeat(20) + '\n';
        content += email.content || email.snippet || 'No content available';
        content += '\n\n';

        if (email.summary) {
            content += 'AI ANALYSIS\n';
            content += '-'.repeat(20) + '\n';
            content += `Summary: ${email.summary}\n`;
            if (email.action_required) {
                content += `Action Required: ${email.action_required}\n`;
            }
        }

        return content;
    }

    async bulkApprove() {
        const selectedIds = Array.from(document.querySelectorAll('.email-checkbox:checked'))
            .map(cb => cb.value);

        if (selectedIds.length === 0) {
            this.addNotification('No Selection', 'Please select emails to process', 'warning');
            return;
        }

        // Find the bulk process button
        const bulkBtn = document.querySelector('[data-action="bulkApprove"]');
        const originalHTML = bulkBtn ? bulkBtn.innerHTML : '';

        try {
            // Show loading state
            if (bulkBtn) {
                bulkBtn.innerHTML = '<div class="spinner"></div> Processing...';
                bulkBtn.disabled = true;
            }

            // Show notification about the process
            this.addNotification('Processing Emails', `Processing ${selectedIds.length} email${selectedIds.length > 1 ? 's' : ''} and extracting data...`, 'info');

            const response = await fetch('/api/emails/bulk-approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emailIds: selectedIds })
            });

            const result = await response.json();

            if (response.ok) {
                const successCount = result.results.filter(r => r.success).length;
                this.addNotification('Bulk Process Complete', `${successCount} email${successCount > 1 ? 's' : ''} moved to review stage`, 'success');
                await this.refreshCurrentView();
            } else {
                throw new Error(result.error || 'Bulk approve failed');
            }
        } catch (error) {
            this.addNotification('Bulk Process Failed', 'Failed to process selected emails', 'error');
        } finally {
            // Restore button state (if still exists after refresh)
            if (bulkBtn && document.contains(bulkBtn)) {
                bulkBtn.innerHTML = originalHTML;
                bulkBtn.disabled = false;
            }
        }
    }

    async bulkDecline() {
        const selectedIds = Array.from(document.querySelectorAll('.email-checkbox:checked'))
            .map(cb => cb.value);

        if (selectedIds.length === 0) {
            // Please select emails first
            return;
        }

        try {
            const response = await fetch('/api/emails/bulk-decline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emailIds: selectedIds })
            });

            const result = await response.json();

            if (response.ok) {
                const successCount = result.results.filter(r => r.success).length;
                // Emails declined
                await this.refreshCurrentView();
            } else {
                throw new Error(result.error || 'Bulk decline failed');
            }
        } catch (error) {
            // Bulk decline operation failed
        }
    }

    async bulkApproveReview() {
        const selectedIds = Array.from(document.querySelectorAll('.email-checkbox:checked'))
            .map(cb => cb.value);

        if (selectedIds.length === 0) {
            this.addNotification('No Selection', 'Please select emails to approve', 'warning');
            return;
        }

        // Find the bulk approve button
        const bulkBtn = document.querySelector('[data-action="bulkApproveReview"]');
        const originalHTML = bulkBtn ? bulkBtn.innerHTML : '';

        try {
            // Show loading state
            if (bulkBtn) {
                bulkBtn.innerHTML = '<div class="spinner"></div> Approving...';
                bulkBtn.disabled = true;
            }

            // Show notification about the process
            this.addNotification('Approving Emails', `Approving ${selectedIds.length} email${selectedIds.length > 1 ? 's' : ''} for final processing...`, 'info');

            const response = await fetch('/api/emails/bulk-approve-review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emailIds: selectedIds })
            });

            const result = await response.json();

            if (response.ok) {
                this.addNotification('Bulk Approve Complete', result.message, 'success');
                await this.refreshCurrentView();
            } else {
                throw new Error(result.error || 'Bulk approve failed');
            }
        } catch (error) {
            this.addNotification('Bulk Approve Failed', 'Failed to approve selected emails', 'error');
        } finally {
            // Restore button state (if still exists after refresh)
            if (bulkBtn && document.contains(bulkBtn)) {
                bulkBtn.innerHTML = originalHTML;
                bulkBtn.disabled = false;
            }
        }
    }

    async exportManagedEmails() {
        try {
            const response = await fetch('/api/emails/export/managed', {
                method: 'GET',
                headers: {
                    'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `aems-managed-export-${new Date().toISOString().split('T')[0]}.xlsx`;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            } else {
                console.error('Export failed:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('Error details:', errorText);
            }
        } catch (error) {
            console.error('Export error:', error);
        }
    }

    // Keep the old exportData method for backward compatibility if needed
    async exportData() {
        await this.exportManagedEmails();
    }

    toggleOtherEmails() {
        this.showOtherEmails = !this.showOtherEmails;

        const toggle = document.getElementById('showOtherToggle');

        if (toggle) {
            if (this.showOtherEmails) {
                toggle.innerHTML = '<i class="fas fa-eye"></i> Hide Other';
                toggle.dataset.showOther = 'true';
            } else {
                toggle.innerHTML = '<i class="fas fa-eye-slash"></i> Show Other';
                toggle.dataset.showOther = 'false';
            }
        }

        const activeTab = document.querySelector('.nav-tab.active');
        if (activeTab && activeTab.dataset.stage === 'fetched') {
            this.loadCurrentStage('fetched');
        }
    }

    showSyncOldModal() {
        const modal = document.getElementById('emailModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalFooter = document.getElementById('modalFooter');

        modalTitle.textContent = 'Sync Old Emails';

        // Create modal body content using secure DOM manipulation
        this.setSecureContent(modalBody, () => {
            const container = document.createElement('div');

            // From Date field
            const fromDateDiv = document.createElement('div');
            fromDateDiv.style.marginBottom = '1rem';

            const fromDateLabel = document.createElement('label');
            fromDateLabel.setAttribute('for', 'fromDate');
            fromDateLabel.style.cssText = 'display: block; margin-bottom: 0.5rem; font-weight: 500;';
            fromDateLabel.textContent = 'From Date:';

            const fromDateInput = document.createElement('input');
            fromDateInput.type = 'date';
            fromDateInput.id = 'fromDate';
            fromDateInput.className = 'form-input';
            fromDateInput.style.cssText = 'width: 100%; padding: 0.5rem; border: 1px solid hsl(var(--border)); border-radius: calc(var(--radius) - 2px);';

            fromDateDiv.appendChild(fromDateLabel);
            fromDateDiv.appendChild(fromDateInput);

            // To Date field
            const toDateDiv = document.createElement('div');
            toDateDiv.style.marginBottom = '1rem';

            const toDateLabel = document.createElement('label');
            toDateLabel.setAttribute('for', 'toDate');
            toDateLabel.style.cssText = 'display: block; margin-bottom: 0.5rem; font-weight: 500;';
            toDateLabel.textContent = 'To Date:';

            const toDateInput = document.createElement('input');
            toDateInput.type = 'date';
            toDateInput.id = 'toDate';
            toDateInput.className = 'form-input';
            toDateInput.style.cssText = 'width: 100%; padding: 0.5rem; border: 1px solid hsl(var(--border)); border-radius: calc(var(--radius) - 2px);';

            toDateDiv.appendChild(toDateLabel);
            toDateDiv.appendChild(toDateInput);

            // Max Results field
            const maxResultsDiv = document.createElement('div');
            maxResultsDiv.style.marginBottom = '1rem';

            const maxResultsLabel = document.createElement('label');
            maxResultsLabel.setAttribute('for', 'maxResults');
            maxResultsLabel.style.cssText = 'display: block; margin-bottom: 0.5rem; font-weight: 500;';
            maxResultsLabel.textContent = 'Max Results:';

            const maxResultsInput = document.createElement('input');
            maxResultsInput.type = 'number';
            maxResultsInput.id = 'maxResults';
            maxResultsInput.value = '100';
            maxResultsInput.min = '1';
            maxResultsInput.max = '500';
            maxResultsInput.className = 'form-input';
            maxResultsInput.style.cssText = 'width: 100%; padding: 0.5rem; border: 1px solid hsl(var(--border)); border-radius: calc(var(--radius) - 2px);';

            maxResultsDiv.appendChild(maxResultsLabel);
            maxResultsDiv.appendChild(maxResultsInput);

            // Info text
            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'color: hsl(var(--muted-foreground)); font-size: 0.875rem;';

            const infoIcon = document.createElement('i');
            infoIcon.className = 'fas fa-info-circle';
            infoIcon.style.marginRight = '0.5rem';

            const infoText = document.createTextNode(' This will fetch emails from the specified date range. Duplicates will be automatically skipped.');

            infoDiv.appendChild(infoIcon);
            infoDiv.appendChild(infoText);

            container.appendChild(fromDateDiv);
            container.appendChild(toDateDiv);
            container.appendChild(maxResultsDiv);
            container.appendChild(infoDiv);

            return container;
        });

        // Create modal footer with secure event listeners
        this.setSecureContent(modalFooter, () => {
            const container = document.createElement('div');

            const cancelButton = this.createSecureButton(
                'Cancel',
                'btn btn-ghost',
                () => {
                    document.getElementById('emailModal').style.display = 'none';
                }
            );

            const syncButton = this.createSecureButton(
                'Sync Emails',
                'btn btn-primary',
                () => this.syncOldEmails()
            );

            container.appendChild(cancelButton);
            container.appendChild(syncButton);

            return container;
        });

        // Set default dates (last 30 days)
        const toDate = new Date();
        const fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

        document.getElementById('fromDate').value = fromDate.toISOString().split('T')[0];
        document.getElementById('toDate').value = toDate.toISOString().split('T')[0];

        modal.style.display = 'flex';
    }

    async syncOldEmails() {
        const fromDate = document.getElementById('fromDate').value;
        const toDate = document.getElementById('toDate').value;
        const maxResults = parseInt(document.getElementById('maxResults').value) || 50;

        if (!fromDate || !toDate) {
            this.addNotification('Invalid Input', 'Please select both from and to dates', 'warning');
            return;
        }

        if (new Date(fromDate) >= new Date(toDate)) {
            this.addNotification('Invalid Date Range', 'From date must be before to date', 'warning');
            return;
        }

        try {
            // Close modal
            document.getElementById('emailModal').style.display = 'none';

            // Show loading notification
            this.addNotification('Syncing Old Emails', 'Fetching emails from the specified date range...', 'info');

            const response = await this.apiRequest('/api/emails/sync-old', {
                method: 'POST',
                body: JSON.stringify({ fromDate, toDate, maxResults })
            });

            if (response.ok) {
                const result = await response.json();
                let message = `Synced ${result.count} old emails`;
                if (result.skipped > 0) {
                    message += ` (${result.skipped} duplicates skipped)`;
                }
                this.addNotification('Old Email Sync Complete', message, 'success');
                await this.refreshCurrentView();
            } else {
                const result = await response.json();
                throw new Error(result.error || 'Sync failed');
            }

        } catch (error) {
            console.error('Sync old emails error:', error);
            this.addNotification('Sync Failed', error.message || 'Failed to sync old emails', 'error');
        }
    }

    async processEmail(emailId) {
        // Find the approve button for this email in review stage
        const approveBtn = document.querySelector(`[data-action="processEmail"][data-email-id="${emailId}"]`);
        const originalHTML = approveBtn ? approveBtn.innerHTML : '';

        try {
            // Show loading state
            if (approveBtn) {
                approveBtn.innerHTML = '<div class="spinner"></div> Approving...';
                approveBtn.disabled = true;
            }

            const response = await fetch(`/api/emails/review/${emailId}/approve`, {
                method: 'POST'
            });

            if (response.ok) {
                this.addNotification('Email Approved', 'Email moved to data management stage', 'success');
                await this.refreshCurrentView();
            } else {
                throw new Error('Failed to process email');
            }
        } catch (error) {
            this.addNotification('Approve Failed', 'Failed to approve email', 'error');
        } finally {
            // Restore button state (if still exists after refresh)
            if (approveBtn && document.contains(approveBtn)) {
                approveBtn.innerHTML = originalHTML;
                approveBtn.disabled = false;
            }
        }
    }


    editEmail(emailId) {
        // Open edit modal for the email
        this.showEditEmailModal(emailId);
    }

    showEditEmailModal(emailId) {
        // Find the email in the current review emails
        fetch('/api/emails/review')
            .then(response => response.json())
            .then(emails => {
                const email = emails.find(e => e.id === emailId);
                if (!email) {
                    this.addNotification('Error', 'Email not found', 'error');
                    return;
                }

                const modal = document.getElementById('emailModal');
                const modalTitle = document.getElementById('modalTitle');
                const modalBody = document.getElementById('modalBody');
                const modalFooter = document.getElementById('modalFooter');

                modalTitle.textContent = 'Edit Extracted Data';

                const category = (email.category || '').toLowerCase();
                let formHTML = '';

                if (category === 'customer_inquiry') {
                    formHTML = `
            <div class="edit-form">
              <div class="form-group">
                <label for="edit-customerName">Customer Name:</label>
                <input type="text" id="edit-customerName" class="form-input" value="${email.customerName || ''}" />
              </div>
              <div class="form-group">
                <label for="edit-customerEmail">Email:</label>
                <input type="email" id="edit-customerEmail" class="form-input" value="${email.customerEmail || ''}" />
              </div>
              <div class="form-group">
                <label for="edit-customerPhone">Phone:</label>
                <input type="text" id="edit-customerPhone" class="form-input" value="${email.customerPhone || ''}" />
              </div>
              <div class="form-group">
                <label for="edit-company">Company:</label>
                <input type="text" id="edit-company" class="form-input" value="${email.company || ''}" />
              </div>
              <div class="form-group">
                <label for="edit-serviceInterest">Service Interest:</label>
                <textarea id="edit-serviceInterest" class="form-input" rows="3">${email.serviceInterest || ''}</textarea>
              </div>
            </div>
          `;
                } else if (category === 'invoice') {
                    formHTML = `
            <div class="edit-form">
              <div class="form-group">
                <label for="edit-invoiceNumber">Invoice Number:</label>
                <input type="text" id="edit-invoiceNumber" class="form-input" value="${email.invoiceNumber || ''}" />
              </div>
              <div class="form-group">
                <label for="edit-invoiceDate">Invoice Date:</label>
                <input type="date" id="edit-invoiceDate" class="form-input" value="${email.invoiceDate || ''}" />
              </div>
              <div class="form-group">
                <label for="edit-invoiceClient">Customer:</label>
                <input type="text" id="edit-invoiceClient" class="form-input" value="${email.invoiceClient || ''}" />
              </div>
              <div class="form-group">
                <label for="edit-invoiceAmount">Amount:</label>
                <input type="text" id="edit-invoiceAmount" class="form-input" value="${email.invoiceAmount || ''}" />
              </div>
              <div class="form-group">
                <label for="edit-invoiceVAT">VAT:</label>
                <input type="text" id="edit-invoiceVAT" class="form-input" value="${email.invoiceVAT || ''}" />
              </div>
            </div>
          `;
                } else {
                    formHTML = '<p class="text-muted">No extractable data for this email type.</p>';
                }

                modalBody.innerHTML = formHTML;

                // Create modal footer with secure event listeners
                this.setSecureContent(modalFooter, () => {
                    const container = document.createElement('div');

                    const cancelButton = this.createSecureButton(
                        'Cancel',
                        'btn btn-ghost',
                        () => {
                            document.getElementById('emailModal').style.display = 'none';
                        }
                    );

                    const saveButton = this.createSecureButton(
                        'Save Changes',
                        'btn btn-primary',
                        () => this.saveExtractedDataEdits(emailId)
                    );

                    container.appendChild(cancelButton);
                    container.appendChild(saveButton);

                    return container;
                });

                modal.style.display = 'flex';
            })
            .catch(error => {
                this.addNotification('Error', 'Failed to load email for editing', 'error');
            });
    }

    async saveExtractedDataEdits(emailId) {
        try {
            const category = await this.getEmailCategory(emailId);
            let extractedData = {};

            if (category === 'customer_inquiry') {
                extractedData = {
                    customerName: document.getElementById('edit-customerName')?.value || null,
                    customerEmail: document.getElementById('edit-customerEmail')?.value || null,
                    customerPhone: document.getElementById('edit-customerPhone')?.value || null,
                    company: document.getElementById('edit-company')?.value || null,
                    serviceInterest: document.getElementById('edit-serviceInterest')?.value || null
                };
            } else if (category === 'invoice') {
                extractedData = {
                    invoiceNumber: document.getElementById('edit-invoiceNumber')?.value || null,
                    invoiceDate: document.getElementById('edit-invoiceDate')?.value || null,
                    invoiceClient: document.getElementById('edit-invoiceClient')?.value || null,
                    invoiceAmount: document.getElementById('edit-invoiceAmount')?.value || null,
                    invoiceVAT: document.getElementById('edit-invoiceVAT')?.value || null
                };
            }

            const response = await fetch(`/api/emails/review/${emailId}/extracted-data`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ extractedData })
            });

            if (response.ok) {
                document.getElementById('emailModal').style.display = 'none';
                this.addNotification('Success', 'Extracted data updated successfully', 'success');
                await this.refreshCurrentView();
            } else {
                throw new Error('Failed to save changes');
            }
        } catch (error) {
            this.addNotification('Error', 'Failed to save extracted data changes', 'error');
        }
    }

    async getEmailCategory(emailId) {
        try {
            const response = await fetch('/api/emails/review');
            const emails = await response.json();
            const email = emails.find(e => e.id === emailId);
            return email ? (email.category || '').toLowerCase() : 'other';
        } catch (error) {
            return 'other';
        }
    }

    renderCategorySelector(email) {
        const currentCategory = (email.category || '').toLowerCase();

        // If it's not "other", just show the category badge
        if (currentCategory !== 'other') {
            return this.formatCategory(email.category);
        }

        // For "other" emails, show a select dropdown
        return `
      <select class="category-selector" data-email-id="${email.id}" onchange="window.app.changeEmailCategory('${email.id}', this.value)">
        <option value="other" ${currentCategory === 'other' ? 'selected' : ''}>Other</option>
        <option value="customer_inquiry" ${currentCategory === 'customer_inquiry' ? 'selected' : ''}>Customer Inquiry</option>
        <option value="invoice" ${currentCategory === 'invoice' ? 'selected' : ''}>Invoice</option>
      </select>
    `;
    }

    async changeEmailCategory(emailId, newCategory) {
        try {
            console.log(`Changing category for email ${emailId} to ${newCategory}`);

            const response = await fetch(`/api/emails/fetched/${emailId}/category`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: newCategory })
            });

            if (response.ok) {
                this.addNotification('Success', `Email category updated to ${newCategory.replace('_', ' ')}`, 'success');
                await this.refreshCurrentView();
            } else {
                throw new Error('Failed to update category');
            }
        } catch (error) {
            this.addNotification('Error', 'Failed to update email category', 'error');
            // Revert the select dropdown
            const selector = document.querySelector(`[data-email-id="${emailId}"]`);
            if (selector) {
                const email = await this.getEmailById(emailId);
                if (email) {
                    selector.value = (email.category || '').toLowerCase();
                }
            }
        }
    }

    async getEmailById(emailId) {
        try {
            // Try fetched emails first
            const fetchedResponse = await fetch('/api/emails/fetched?includeOther=true');
            const fetchedEmails = await fetchedResponse.json();
            const email = fetchedEmails.find(e => e.id === emailId);
            if (email) return email;

            // Try review emails
            const reviewResponse = await fetch('/api/emails/review');
            const reviewEmails = await reviewResponse.json();
            return reviewEmails.find(e => e.id === emailId);
        } catch (error) {
            return null;
        }
    }

    getCombinedFields(email) {
        const category = (email.category || '').toLowerCase();

        const wrapField = (value, fallback = 'Not extracted') => {
            const displayValue = value || fallback;
            const isExtracted = value && value !== fallback;
            return isExtracted ? displayValue : `<span class="text-muted">${displayValue}</span>`;
        };

        if (category === 'customer_inquiry') {
            const name = wrapField(email.customerName);
            const email_addr = email.customerEmail || '';
            const phone = email.customerPhone || '';

            // Combine contact info (email and phone)
            let contactInfo = [];
            if (email_addr && email_addr !== 'Not extracted') contactInfo.push(email_addr);
            if (phone && phone !== 'Not extracted') contactInfo.push(phone);
            const contact = contactInfo.length > 0 ? contactInfo.join(' • ') : '<span class="text-muted">Not extracted</span>';

            const customerInfo = `
        <div class="customer-info">
          <div class="font-medium">${name}</div>
          <div class="text-sm text-muted-foreground">${contact}</div>
        </div>
      `;

            const company = wrapField(email.company);
            const service = wrapField(email.serviceInterest);
            const businessDetails = `
        <div class="business-info">
          <div class="font-medium">${company}</div>
          <div class="text-sm text-muted-foreground">${service}</div>
        </div>
      `;

            return { customerInfo, businessDetails };
        } else if (category === 'invoice') {
            const name = wrapField(email.invoiceClient);
            const customerInfo = `
        <div class="customer-info">
          <div class="font-medium">${name}</div>
          <div class="text-sm text-muted-foreground">Invoice Customer</div>
        </div>
      `;

            const invoiceNum = wrapField(email.invoiceNumber);
            const amount = email.invoiceAmount ? `€${email.invoiceAmount}` : '<span class="text-muted">Not extracted</span>';
            const businessDetails = `
        <div class="business-info">
          <div class="font-medium">${invoiceNum}</div>
          <div class="text-sm text-muted-foreground">${amount}</div>
        </div>
      `;

            return { customerInfo, businessDetails };
        } else {
            return {
                customerInfo: '<span class="text-muted">N/A</span>',
                businessDetails: '<span class="text-muted">N/A</span>'
            };
        }
    }

    // Keep old method for backward compatibility with edit modal
    getExtractedFields(email) {
        const category = (email.category || '').toLowerCase();

        const wrapField = (value, fallback = 'Not extracted') => {
            const displayValue = value || fallback;
            const isExtracted = value && value !== fallback;
            return `<span class="extracted-data-cell ${isExtracted ? '' : 'text-muted'}" title="${displayValue}">${displayValue}</span>`;
        };

        if (category === 'customer_inquiry') {
            return {
                name: wrapField(email.customerName),
                email: wrapField(email.customerEmail),
                phone: wrapField(email.customerPhone),
                companyOrInvoice: wrapField(email.company),
                serviceOrAmount: wrapField(email.serviceInterest)
            };
        } else if (category === 'invoice') {
            return {
                name: wrapField(email.invoiceClient, 'Not extracted'),
                email: '<span class="extracted-data-cell text-muted">N/A</span>',
                phone: '<span class="extracted-data-cell text-muted">N/A</span>',
                companyOrInvoice: wrapField(email.invoiceNumber),
                serviceOrAmount: wrapField(email.invoiceAmount ? `€${email.invoiceAmount}` : null)
            };
        } else {
            return {
                name: '<span class="extracted-data-cell text-muted">N/A</span>',
                email: '<span class="extracted-data-cell text-muted">N/A</span>',
                phone: '<span class="extracted-data-cell text-muted">N/A</span>',
                companyOrInvoice: '<span class="extracted-data-cell text-muted">N/A</span>',
                serviceOrAmount: '<span class="extracted-data-cell text-muted">N/A</span>'
            };
        }
    }

    setupRealTimeUpdates() {
        if (this.eventSource) {
            this.eventSource.close();
        }

        this.eventSource = new EventSource('/api/notifications/stream');

        this.eventSource.onopen = () => { };
        this.eventSource.onerror = (error) => { };

        this.eventSource.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'new_emails_fetched') {
                    this.handleNewEmailsNotification(data);
                }
                if (data.type === 'sync_completed' && this.currentView === 'dashboard') {
                    this.refreshCurrentView();
                }
                if (data.type === 'bulk_progress') {
                    this.handleBulkProgress(data);
                }
                if (data.type === 'bulk_complete') {
                    this.handleBulkComplete(data);
                }
            } catch (error) {
                // Invalid message format
            }
        });
    }

    handleBulkProgress(data) {
        // Show progress indicator
        let progressContainer = document.getElementById('bulkProgressContainer');
        if (!progressContainer) {
            progressContainer = document.createElement('div');
            progressContainer.id = 'bulkProgressContainer';
            progressContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: hsl(var(--background));
        border: 1px solid hsl(var(--border));
        border-radius: var(--radius);
        padding: 1rem;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        z-index: 1000;
        max-width: 300px;
      `;
            document.body.appendChild(progressContainer);
        }

        const percentage = Math.round((data.current / data.total) * 100);
        progressContainer.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
        <div class="spinner" style="width: 16px; height: 16px;"></div>
        <strong>AI Processing</strong>
      </div>
      <div style="margin-bottom: 0.5rem; font-size: 0.875rem; color: hsl(var(--muted-foreground));">
        ${data.message}
      </div>
      <div style="background: hsl(var(--muted)); border-radius: 4px; height: 8px; overflow: hidden;">
        <div style="background: hsl(var(--primary)); height: 100%; width: ${percentage}%; transition: width 0.3s ease;"></div>
      </div>
      <div style="text-align: right; font-size: 0.75rem; color: hsl(var(--muted-foreground)); margin-top: 0.25rem;">
        ${data.current} / ${data.total} (${percentage}%)
      </div>
    `;
    }

    handleBulkComplete(data) {
        const progressContainer = document.getElementById('bulkProgressContainer');
        if (progressContainer) {
            progressContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
          <i class="fas fa-check-circle" style="color: hsl(var(--success));"></i>
          <strong>Processing Complete</strong>
        </div>
        <div style="font-size: 0.875rem; color: hsl(var(--muted-foreground));">
          ${data.message}
        </div>
      `;

            // Remove progress container after 3 seconds
            setTimeout(() => {
                if (progressContainer && progressContainer.parentNode) {
                    progressContainer.parentNode.removeChild(progressContainer);
                }
            }, 3000);
        }

        this.addNotification('Bulk Processing Complete', data.message, 'success');
        this.refreshCurrentView();
    }

    handleNewEmailsNotification(data) {
        const { count, categoryStats } = data;

        // Only show notification for non-other categories
        const relevantCount = (categoryStats.customer_inquiry || 0) + (categoryStats.invoice || 0);

        if (relevantCount > 0) {
            let message = `${relevantCount} new email${relevantCount > 1 ? 's' : ''} fetched`;
            if (categoryStats.customer_inquiry) {
                message += `, ${categoryStats.customer_inquiry} customer inquir${categoryStats.customer_inquiry > 1 ? 'ies' : 'y'}`;
            }
            if (categoryStats.invoice) {
                message += `, ${categoryStats.invoice} invoice${categoryStats.invoice > 1 ? 's' : ''}`;
            }

            // Use the new email notification method instead of general notifications
            this.addNewEmailNotification('New Emails', message, { count: relevantCount, categoryStats });
        }

        if (this.currentView === 'dashboard') {
            this.refreshCurrentView();
        }
    }

    async deleteEmail(emailId) {
        if (!emailId) {
            console.error('No email ID provided for deletion');
            return;
        }

        // Confirm deletion with custom dialog
        const confirmed = await this.showConfirmDialog(
            'Are you sure you want to delete this email? It will be moved to the recycle bin.',
            'Delete Email',
            'Delete',
            'btn-destructive'
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await this.apiRequest(`/api/emails/${emailId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (response.ok) {
                this.addNotification('Email Deleted', 'Email moved to recycle bin', 'success');
                await this.refreshCurrentView();
            } else {
                throw new Error(result.error || 'Failed to delete email');
            }
        } catch (error) {
            console.error('Delete email error:', error);
            this.addNotification('Delete Failed', error.message || 'Could not delete email', 'error');
        }
    }

    async restoreEmail(emailId) {
        if (!emailId) {
            console.error('No email ID provided for restoration');
            return;
        }

        // Confirm restore with custom dialog
        const confirmed = await this.showConfirmDialog(
            'Are you sure you want to restore this email?',
            'Restore Email',
            'Restore',
            'btn-primary'
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`/api/emails/${emailId}/restore`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok) {
                this.addNotification('Email Restored', 'Email restored successfully', 'success');
                await this.refreshCurrentView();
            } else {
                throw new Error(result.error || 'Failed to restore email');
            }
        } catch (error) {
            console.error('Restore email error:', error);
            this.addNotification('Restore Failed', error.message || 'Could not restore email', 'error');
        }
    }

    async permanentDeleteEmail(emailId) {
        if (!emailId) {
            console.error('No email ID provided for permanent deletion');
            return;
        }

        // Confirm permanent deletion with custom dialog
        const confirmed = await this.showConfirmDialog(
            'Are you sure you want to permanently delete this email? This action cannot be undone.',
            'Permanent Delete',
            'Delete Forever',
            'btn-destructive'
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await this.apiRequest(`/api/emails/${emailId}/permanent`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (response.ok) {
                this.addNotification('Email Permanently Deleted', 'Email permanently deleted', 'success');
                await this.refreshCurrentView();
            } else {
                throw new Error(result.error || 'Failed to permanently delete email');
            }
        } catch (error) {
            console.error('Permanent delete email error:', error);
            this.addNotification('Permanent Delete Failed', error.message || 'Could not permanently delete email', 'error');
        }
    }

    addNotification(title, message, type = 'info') {
        const notification = {
            id: Date.now().toString(),
            title,
            message,
            type,
            time: new Date(),
            read: false
        };

        this.notifications.unshift(notification);
        this.unreadNotifications++;
        // Note: Badge is now only updated for new email notifications
        this.renderNotifications();
    }

    addNewEmailNotification(title, message, emailData = null) {
        const notification = {
            id: Date.now().toString(),
            title,
            message,
            type: 'new_email',
            time: new Date(),
            read: false,
            emailData // Store email data for potential future use
        };

        this.newEmailNotifications.unshift(notification);
        this.unreadNewEmails++;
        this.updateNotificationBadge();
        this.renderNotifications();
    }

    updateNotificationBadge() {
        const badge = document.getElementById('notificationCount');
        if (badge) {
            if (this.unreadNewEmails > 0) {
                badge.textContent = this.unreadNewEmails;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    renderNotifications() {
        const container = document.getElementById('notificationItems');
        const markAllReadBtn = document.getElementById('markAllReadBtn');

        if (!container) return;

        // Show/hide the "Mark All as Read" button based on unread count
        if (markAllReadBtn) {
            markAllReadBtn.style.display = this.unreadNewEmails > 0 ? 'block' : 'none';
        }

        if (this.newEmailNotifications.length === 0) {
            container.innerHTML = '<div style="padding: 1rem; text-align: center; color: hsl(var(--muted-foreground));">No new emails</div>';
            return;
        }

        const html = this.newEmailNotifications.slice(0, 10).map(notification => {
            const timeAgo = this.getTimeAgo(notification.time);
            return `
        <div class="notification-item ${!notification.read ? 'unread' : ''}" data-id="${notification.id}" data-type="new_email">
          <div class="notification-title">
            <i class="fas fa-envelope" style="margin-right: 0.5rem; color: hsl(var(--primary));"></i>
            ${notification.title}
          </div>
          <div class="notification-message">${notification.message}</div>
          <div class="notification-time">${timeAgo}</div>
        </div>
      `;
        }).join('');

        container.innerHTML = html;

        // Add click handlers to mark as read
        container.querySelectorAll('.notification-item.unread').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                const type = item.dataset.type;
                this.markNotificationAsRead(id, type);
            });
        });
    }

    markNotificationAsRead(id, type = 'general') {
        if (type === 'new_email') {
            const notification = this.newEmailNotifications.find(n => n.id === id);
            if (notification && !notification.read) {
                notification.read = true;
                this.unreadNewEmails--;
                this.updateNotificationBadge();
                this.renderNotifications();
            }
        } else {
            const notification = this.notifications.find(n => n.id === id);
            if (notification && !notification.read) {
                notification.read = true;
                this.unreadNotifications--;
                this.renderNotifications();
            }
        }
    }

    markAllNotificationsAsRead() {
        // Mark all new email notifications as read
        this.newEmailNotifications.forEach(n => n.read = true);
        this.unreadNewEmails = 0;

        // Also mark general notifications as read
        this.notifications.forEach(n => n.read = true);
        this.unreadNotifications = 0;

        this.updateNotificationBadge();
        this.renderNotifications();
    }

    getTimeAgo(date) {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }

    bindEvents() {
        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'r':
                        e.preventDefault();
                        if (this.currentView === 'dashboard') {
                            this.syncEmails();
                        }
                        break;
                }
            }
        });
    }

    async signOut() {
        try {
            const response = await this.apiRequest('/api/auth/signout', {
                method: 'POST'
            });

            if (response.ok) {
                // Clear user data
                this.user = null;

                // Close any open dropdowns
                const userDropdown = document.getElementById('userDropdown');
                if (userDropdown) {
                    userDropdown.classList.remove('active');
                }

                // Show welcome screen
                this.showWelcome();

                // Add notification
                this.addNotification('Signed Out', 'You have been successfully signed out', 'success');
            } else {
                this.addNotification('Sign Out Failed', 'Failed to sign out. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Sign out error:', error);
            this.addNotification('Sign Out Error', 'An error occurred while signing out', 'error');
        }
    }

    async bulkRestoreEmails() {
        const selectedIds = this.getSelectedEmailIds();
        if (selectedIds.length === 0) {
            this.addNotification('No Selection', 'Please select emails to restore', 'warning');
            return;
        }

        // Confirm bulk restore with custom dialog
        const confirmed = await this.showConfirmDialog(
            `Are you sure you want to restore ${selectedIds.length} email${selectedIds.length > 1 ? 's' : ''}?`,
            'Bulk Restore',
            'Restore All',
            'btn-primary'
        );

        if (!confirmed) {
            return;
        }

        try {
            // Process each email individually since there might not be a bulk restore API
            let successCount = 0;
            let errorCount = 0;

            for (const emailId of selectedIds) {
                try {
                    const response = await this.apiRequest(`/api/emails/${emailId}/restore`, {
                        method: 'POST'
                    });

                    if (response.ok) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (error) {
                    errorCount++;
                }
            }

            if (successCount > 0) {
                this.addNotification(
                    'Bulk Restore Complete',
                    `${successCount} email${successCount > 1 ? 's' : ''} restored successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
                    errorCount > 0 ? 'warning' : 'success'
                );
                await this.refreshCurrentView();
            } else {
                this.addNotification('Bulk Restore Failed', 'Failed to restore any emails', 'error');
            }
        } catch (error) {
            console.error('Bulk restore error:', error);
            this.addNotification('Bulk Restore Failed', 'An error occurred during bulk restore', 'error');
        }
    }

    async bulkPermanentDeleteEmails() {
        const selectedIds = this.getSelectedEmailIds();
        if (selectedIds.length === 0) {
            this.addNotification('No Selection', 'Please select emails to delete permanently', 'warning');
            return;
        }

        // Confirm bulk permanent delete with custom dialog
        const confirmed = await this.showConfirmDialog(
            `Are you sure you want to permanently delete ${selectedIds.length} email${selectedIds.length > 1 ? 's' : ''}? This action cannot be undone.`,
            'Permanent Delete',
            'Delete Forever',
            'btn-destructive'
        );

        if (!confirmed) {
            return;
        }

        try {
            // Process each email individually
            let successCount = 0;
            let errorCount = 0;

            for (const emailId of selectedIds) {
                try {
                    const response = await this.apiRequest(`/api/emails/${emailId}/permanent`, {
                        method: 'DELETE'
                    });

                    if (response.ok) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (error) {
                    errorCount++;
                }
            }

            if (successCount > 0) {
                this.addNotification(
                    'Bulk Delete Complete',
                    `${successCount} email${successCount > 1 ? 's' : ''} permanently deleted${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
                    errorCount > 0 ? 'warning' : 'success'
                );
                await this.refreshCurrentView();
            } else {
                this.addNotification('Bulk Delete Failed', 'Failed to delete any emails', 'error');
            }
        } catch (error) {
            console.error('Bulk permanent delete error:', error);
            this.addNotification('Bulk Delete Failed', 'An error occurred during bulk delete', 'error');
        }
    }
}

// Simple component classes
class ModalManager {
    show(content, title = '') { }
    closeAll() { }
}

class DataTableManager {
    constructor() {
        this.tables = new Map();
    }
}

class FormManager {
    constructor() {
        // Form management functionality
    }
}

class WorkflowManager {
    constructor() {
        // Workflow management functionality
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AEMS();
});
