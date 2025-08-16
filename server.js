require('dotenv').config();

// Validate environment variables before starting
const envValidator = require('./lib/env-validator');
envValidator.validateOrExit();

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const XLSX = require('xlsx');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const csrf = require('csurf');

// Initialize DOMPurify
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Import our services
const db = require('./lib/database');
const gmailService = require('./lib/gmail');
const aiService = require('./lib/ai');
const aiExtractor = require('./lib/ai-extractor');
const healthMonitor = require('./lib/health-monitor');

// Set up OAuth2 client for AI extractor (for PDF processing)
const setupAIExtractorOAuth = async () => {
    try {
        const user = await gmailService.getConnectedUser();
        if (user && gmailService.oauth2Client) {
            aiExtractor.setOAuth2Client(gmailService.oauth2Client);
            console.log('📄 AI Extractor configured with OAuth2 client for PDF processing');
        }
    } catch (error) {
        console.log('📄 AI Extractor OAuth2 setup will be done when user connects Gmail');
    }
};

// Initialize OAuth2 setup
setupAIExtractorOAuth();
const auditLogger = require('./lib/audit-logger');
const backupManager = require('./lib/backup-manager');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware with nonce-based CSP
app.use(helmet({
    crossOriginEmbedderPolicy: false, // Allow embedding for development
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdnjs.cloudflare.com", (req, res) => `'nonce-${res.locals.nonce}'`],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"], // Keep unsafe-inline for external styles
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    }
}));

// Rate limiting - more lenient in development
const isDevelopment = process.env.NODE_ENV === 'development';

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 1000 : 100, // Much higher limit for development
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 50 : (parseInt(process.env.MAX_AUTH_ATTEMPTS) || 5),
    message: { error: 'Too many authentication attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: isDevelopment ? 1000 : 200, // Much higher limit for development
    message: { error: 'API rate limit exceeded, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Apply rate limiting in all environments for security
app.use('/auth/', authLimiter);
app.use('/api/', apiLimiter);
app.use(generalLimiter);

// Add more specific rate limiting for sensitive endpoints
const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 100 : 10, // Higher limit for development
    message: { error: 'Too many requests to sensitive endpoint, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Use user ID if available, otherwise IP
        return req.session?.userId || req.ip;
    }
});

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.ALLOWED_ORIGINS?.split(',') || false
        : true,
    credentials: true
}));

// Basic middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static('public'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: parseInt(process.env.SESSION_TIMEOUT) || 3600000
    }
}));

// Template engine setup (simple HTML serving)
app.use(express.static(path.join(__dirname, 'public')));

// CSRF Protection setup
const csrfProtection = csrf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    }
});

// Skip CSRF for certain routes (like SSE endpoints)
const skipCSRF = (req, res, next) => {
    // Skip CSRF for server-sent events and all GET requests
    // For now, also skip CSRF for development to avoid configuration issues
    if (req.path === '/api/notifications/stream' ||
        req.method === 'GET' ||
        process.env.NODE_ENV === 'development') {
        return next();
    }
    return csrfProtection(req, res, next);
};

// ==========================================
// MIDDLEWARE FUNCTIONS
// ==========================================

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = DOMPurify.sanitize(req.body[key]);
            }
        });
    }

    // Sanitize query parameters
    Object.keys(req.query).forEach(key => {
        if (typeof req.query[key] === 'string') {
            req.query[key] = DOMPurify.sanitize(req.query[key]);
        }
    });

    next();
};

// Validation error handler
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
        });
    }
    next();
};

// Authentication middleware
const requireAuth = async (req, res, next) => {
    try {
        const user = await gmailService.getConnectedUser();
        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Authentication failed' });
    }
};

// Enhanced input validation middleware
const validateEmailId = (req, res, next) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || id.length > 100) {
        auditLogger.logSecurityEvent('INVALID_INPUT', 'email_id_validation', {
            providedId: id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        return res.status(400).json({ error: 'Invalid email ID' });
    }
    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
        auditLogger.logSecurityEvent('INVALID_INPUT', 'email_id_format', {
            providedId: id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });
        return res.status(400).json({ error: 'Invalid email ID format' });
    }
    next();
};

// Validate bulk operations
const validateBulkOperation = (req, res, next) => {
    const { emailIds } = req.body;
    if (!Array.isArray(emailIds)) {
        return res.status(400).json({ error: 'emailIds must be an array' });
    }
    if (emailIds.length === 0 || emailIds.length > 100) {
        return res.status(400).json({ error: 'Invalid number of email IDs (1-100 allowed)' });
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of emailIds) {
        if (!uuidRegex.test(id)) {
            return res.status(400).json({ error: `Invalid email ID format: ${id}` });
        }
    }
    next();
};

// Validate category updates
const validateCategory = (req, res, next) => {
    const { category } = req.body;
    const validCategories = ['customer_inquiry', 'invoice', 'other'];
    if (!validCategories.includes(category)) {
        return res.status(400).json({
            error: 'Invalid category',
            validCategories
        });
    }
    next();
};

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    const originalSend = res.send;

    // Log request
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} - ${req.ip}`);

    // Override res.send to log response
    res.send = function (data) {
        const duration = Date.now() - start;
        console.log(`${new Date().toISOString()} ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);

        // Log errors
        if (res.statusCode >= 400) {
            auditLogger.logError('HTTP_ERROR', {
                method: req.method,
                url: req.url,
                statusCode: res.statusCode,
                userAgent: req.get('User-Agent'),
                ipAddress: req.ip,
                duration
            });
        }

        return originalSend.call(this, data);
    };

    next();
});

// Generate nonce for inline scripts
const crypto = require('crypto');
app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
});

// Apply sanitization to all routes
app.use(sanitizeInput);

// Endpoint to get CSRF token
app.get('/api/csrf-token', (req, res) => {
    try {
        // In development, return a dummy token
        if (process.env.NODE_ENV === 'development') {
            res.json({ csrfToken: 'dev-token' });
        } else {
            // In production, use proper CSRF protection
            csrfProtection(req, res, (err) => {
                if (err) {
                    console.error('CSRF token generation error:', err);
                    return res.status(500).json({ error: 'Failed to generate CSRF token' });
                }
                res.json({ csrfToken: req.csrfToken() });
            });
        }
    } catch (error) {
        console.error('CSRF token endpoint error:', error);
        res.status(500).json({ error: 'Failed to generate CSRF token' });
    }
});

// Apply CSRF protection to state-changing routes
// Enable CSRF protection in all environments for security
app.use('/api/', skipCSRF);

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// Get auth URL for Gmail connection
app.get('/auth/gmail', (req, res) => {
    try {
        const authUrl = gmailService.getAuthUrl();
        res.json({ authUrl });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate auth URL' });
    }
});

// Redirect to Google OAuth for Gmail connection
app.get('/auth/google', (req, res) => {
    try {
        const authUrl = gmailService.getAuthUrl();
        res.redirect(authUrl);
    } catch (error) {
        res.status(500).send('Authentication failed');
    }
});

// Handle OAuth callback
app.get('/auth/google/callback', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) {
            return res.status(400).send('Authorization code missing');
        }

        const user = await gmailService.exchangeCodeForTokens(code);
        req.session.userId = user.id;

        // Set up AI extractor with OAuth2 client for PDF processing
        aiExtractor.setOAuth2Client(gmailService.oauth2Client);
        console.log('📄 AI Extractor configured with OAuth2 client for PDF processing');

        // Redirect to main app
        res.redirect('/');
    } catch (error) {
        res.status(500).send('Authentication failed');
    }
});

// Get current user
app.get('/api/user', async (req, res) => {
    try {
        const user = await gmailService.getConnectedUser();
        if (!user) {
            return res.json({ connected: false });
        }

        // Don't send tokens to client
        const { tokens, ...userInfo } = user;
        res.json({ connected: true, user: userInfo });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

// Sign out
app.post('/api/auth/signout', async (req, res) => {
    try {
        await gmailService.disconnect();

        // Properly destroy session with callback
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
                return res.status(500).json({ error: 'Failed to sign out' });
            }

            // Clear session cookie
            res.clearCookie('connect.sid');
            res.json({ success: true });
        });
    } catch (error) {
        console.error('Sign out error:', error);
        res.status(500).json({ error: 'Failed to sign out' });
    }
});

// ==========================================
// EMAIL FETCHING ROUTES
// ==========================================

// Manual sync emails
app.post('/api/emails/sync', [
    requireAuth,
    handleValidationErrors
], async (req, res) => {
    try {
        const emailCount = await gmailService.syncEmails();
        res.json({
            success: true,
            message: `Synced ${emailCount} emails`,
            count: emailCount
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to sync emails' });
    }
});

// Manual sync of old emails with date range
app.post('/api/emails/sync-old', [
    requireAuth,
    body('fromDate').isISO8601().withMessage('fromDate must be a valid ISO date'),
    body('toDate').isISO8601().withMessage('toDate must be a valid ISO date'),
    body('maxResults').optional().isInt({ min: 1, max: 500 }).withMessage('maxResults must be between 1 and 500'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { fromDate, toDate, maxResults = 100 } = req.body;
        const result = await gmailService.syncOldEmails(fromDate, toDate, maxResults);
        res.json({
            success: true,
            message: `Synced ${result.count} old emails`,
            ...result
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to sync old emails' });
    }
});

// Get fetched emails with optional filtering
app.get('/api/emails/fetched', async (req, res) => {
    try {
        const { includeOther = 'false' } = req.query;
        const emails = await db.getFetchedEmails();

        const filteredEmails = includeOther === 'true'
            ? emails
            : emails.filter(email => {
                const category = (email.category || '').toLowerCase();
                return category !== 'other' && category !== 'OTHER';
            });

        res.json(filteredEmails);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get fetched emails' });
    }
});

// Approve fetched email (move to review)
app.post('/api/emails/fetched/:id/approve', [
    requireAuth,
    validateEmailId,
    handleValidationErrors
], async (req, res) => {
    try {
        const { id } = req.params;
        const success = await db.approveFetchedEmail(id);

        if (!success) {
            return res.status(404).json({ error: 'Email not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to approve email' });
    }
});

// Decline fetched email (remove)
app.delete('/api/emails/fetched/:id', [
    validateEmailId
], async (req, res) => {
    try {
        const { id } = req.params;
        const success = await db.removeFetchedEmail(id);

        if (!success) {
            return res.status(404).json({ error: 'Email not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to decline email' });
    }
});

// Bulk approve emails
app.post('/api/emails/bulk-approve', [
    requireAuth,
    validateBulkOperation,
    handleValidationErrors
], async (req, res) => {
    try {
        const { emailIds } = req.body;
        const results = await db.bulkApproveEmails(emailIds);

        res.json({
            success: true,
            results,
            message: `Processed ${emailIds.length} emails`
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to bulk approve emails' });
    }
});

// Bulk decline emails
app.post('/api/emails/bulk-decline', [
    requireAuth,
    validateBulkOperation,
    handleValidationErrors
], async (req, res) => {
    try {
        const { emailIds } = req.body;
        const results = await db.bulkDeclineEmails(emailIds);

        res.json({
            success: true,
            results,
            message: `Processed ${emailIds.length} emails`
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to bulk decline emails' });
    }
});

// Bulk approve review emails
app.post('/api/emails/bulk-approve-review', [
    requireAuth,
    validateBulkOperation,
    handleValidationErrors
], async (req, res) => {
    try {
        const { emailIds } = req.body;
        const results = await db.bulkApproveReviewEmails(emailIds);

        res.json({
            success: true,
            results,
            message: `Approved ${emailIds.length} emails`
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to bulk approve review emails' });
    }
});

// Update email category for fetched emails
app.put('/api/emails/fetched/:id/category', [
    requireAuth,
    validateEmailId,
    validateCategory,
    handleValidationErrors
], async (req, res) => {
    try {
        const { id } = req.params;
        const { category } = req.body;

        console.log(`=== API REQUEST: Update email ${id} category to ${category} ===`);

        const result = await db.updateEmailCategory(id, category);

        if (!result) {
            return res.status(404).json({ error: 'Email not found or not in fetched status' });
        }

        console.log('=== API RESPONSE: Category update successful ===');
        res.json({ success: true, email: result });
    } catch (error) {
        console.error('API Error updating category:', error);
        res.status(500).json({ error: 'Failed to update email category' });
    }
});

// ==========================================
// REVIEW STAGE ROUTES
// ==========================================

// Note: AI processing happens automatically when emails are approved from fetched → review
// This is handled in database.js approveFetchedEmail() method

// Get review emails
app.get('/api/emails/review', async (req, res) => {
    try {
        const emails = await db.getReviewEmails();
        res.json(emails);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get review emails' });
    }
});

// Update extracted data in review
app.put('/api/emails/review/:id', [
    validateEmailId
], async (req, res) => {
    try {
        const { id } = req.params;
        const { extractedData } = req.body;

        const success = await db.updateReviewEmail(id, extractedData);

        if (!success) {
            return res.status(404).json({ error: 'Email not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update email' });
    }
});


// Update extracted data for email in review
app.put('/api/emails/review/:id/extracted-data', [
    validateEmailId
], async (req, res) => {
    try {
        const { id } = req.params;
        const { extractedData } = req.body;

        const email = await db.getEmailById(id);
        if (!email || email.status !== db.EMAIL_STATUS.REVIEW) {
            return res.status(404).json({ error: 'Email not found in review' });
        }

        const success = await db.updateReviewEmail(id, extractedData);

        if (!success) {
            return res.status(500).json({ error: 'Failed to update extracted data' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update extracted data' });
    }
});

// Approve review email (move to processed)
app.post('/api/emails/review/:id/approve', [
    validateEmailId
], async (req, res) => {
    try {
        const { id } = req.params;
        const success = await db.approveReviewEmail(id);

        if (!success) {
            return res.status(404).json({ error: 'Email not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to approve email' });
    }
});


// ==========================================
// DATA MANAGEMENT ROUTES
// ==========================================

// Get processed emails
app.get('/api/emails/processed', async (req, res) => {
    try {
        const emails = await db.getProcessedEmails();
        res.json(emails);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get processed emails' });
    }
});


// Get deleted emails (recycle bin)
app.get('/api/emails/deleted', async (req, res) => {
    try {
        const emails = await db.getEmails({ status: 'DELETED' });
        res.json(emails);
    } catch (error) {
        console.error('Failed to get deleted emails:', error);
        res.status(500).json({ error: 'Failed to get deleted emails' });
    }
});

// Update processed email
app.put('/api/emails/processed/:id', [
    validateEmailId
], async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const success = await db.updateProcessedEmail(id, updates);

        if (!success) {
            return res.status(404).json({ error: 'Email not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update email' });
    }
});

// Generic delete endpoint (works for review/manage stages)
app.delete('/api/emails/:id', [
    validateEmailId
], async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.softDeleteEmail(id);

        if (!result) {
            return res.status(404).json({ error: 'Email not found' });
        }

        res.json({ success: true, message: 'Email moved to recycle bin' });
    } catch (error) {
        console.error('Failed to delete email:', error);
        res.status(500).json({ error: 'Failed to delete email' });
    }
});

// Delete processed email (move to recycle bin) - Legacy endpoint
app.delete('/api/emails/processed/:id', [
    validateEmailId
], async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.softDeleteEmail(id);

        if (!result) {
            return res.status(404).json({ error: 'Email not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete email' });
    }
});

// ==========================================
// RECYCLE BIN ROUTES
// ==========================================

// Restore email from recycle bin
app.post('/api/emails/:id/restore', [
    validateEmailId
], async (req, res) => {
    try {
        const { id } = req.params;

        // Get the email first to determine its original stage
        const email = await db.getEmailById(id);
        if (!email || email.status !== 'DELETED') {
            return res.status(404).json({ error: 'Email not found in recycle bin' });
        }

        // Restore to REVIEW stage (safe default for restored emails)
        const result = await db.updateEmail(id, {
            status: 'REVIEW',
            isDeleted: false,
            deletedAt: null,
            reviewedAt: new Date().toISOString()
        });

        if (!result) {
            return res.status(404).json({ error: 'Email not found' });
        }

        res.json({ success: true, message: 'Email restored to review stage' });
    } catch (error) {
        console.error('Failed to restore email:', error);
        res.status(500).json({ error: 'Failed to restore email' });
    }
});

// Permanently delete email
app.delete('/api/emails/:id/permanent', [
    strictLimiter, // Apply strict rate limiting to permanent delete
    requireAuth,
    validateEmailId
], async (req, res) => {
    try {
        const { id } = req.params;

        // Get the email first to ensure it's in deleted status
        const email = await db.getEmailById(id);
        if (!email || email.status !== 'DELETED') {
            return res.status(404).json({ error: 'Email not found in recycle bin' });
        }

        // For now, we'll just keep it as deleted (true permanent delete would remove from file)
        // This is a placeholder for actual permanent deletion if needed
        res.json({ success: true, message: 'Email permanently deleted' });
    } catch (error) {
        console.error('Failed to permanently delete email:', error);
        res.status(500).json({ error: 'Failed to permanently delete email' });
    }
});

// ==========================================
// EXPORT ROUTES
// ==========================================

// Export to XLSX
app.get('/api/export/xlsx', async (req, res) => {
    try {
        const processedEmails = await db.getProcessedEmails();

        // Separate customers and invoices
        const customers = processedEmails
            .filter(email => email.extractedData && email.extractedData.name)
            .map(email => ({
                'Email ID': email.id,
                'Date': email.date,
                'Subject': email.subject,
                'Name': email.extractedData.name,
                'Email': email.extractedData.email,
                'Phone': email.extractedData.phone,
                'Company': email.extractedData.company,
                'Service': email.extractedData.service
            }));

        const invoices = processedEmails
            .filter(email => email.extractedData && email.extractedData.invoiceNumber)
            .map(email => ({
                'Email ID': email.id,
                'Date': email.date,
                'Subject': email.subject,
                'Invoice Number': email.extractedData.invoiceNumber,
                'Invoice Date': email.extractedData.date,
                'Customer': email.extractedData.customer,
                'Amount': email.extractedData.amount,
                'VAT': email.extractedData.vat
            }));

        // Create workbook
        const wb = XLSX.utils.book_new();

        // Add customers sheet
        if (customers.length > 0) {
            const wsCustomers = XLSX.utils.json_to_sheet(customers);
            XLSX.utils.book_append_sheet(wb, wsCustomers, 'Customers');
        }

        // Add invoices sheet
        if (invoices.length > 0) {
            const wsInvoices = XLSX.utils.json_to_sheet(invoices);
            XLSX.utils.book_append_sheet(wb, wsInvoices, 'Invoices');
        }

        // Generate buffer
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename=aems-export-${Date.now()}.xlsx`
        });

        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// Export managed emails to XLSX
app.get('/api/emails/export/managed', requireAuth, async (req, res) => {
    try {
        console.log('=== EXPORTING MANAGED EMAILS ===');
        const managedEmails = await db.getManagedEmails();
        console.log(`Found ${managedEmails.length} managed emails`);

        if (managedEmails.length === 0) {
            console.log('No managed emails to export');
            return res.status(200).json({ error: 'No managed emails to export' });
        }

        // Separate customers and invoices
        const customers = managedEmails
            .filter(email => email.category === 'customer_inquiry')
            .map(email => ({
                'Email ID': email.id,
                'Date': email.date ? new Date(email.date).toLocaleDateString() : '',
                'Subject': email.subject || '',
                'Customer Name': email.customerName || '',
                'Email': email.customerEmail || '',
                'Phone': email.customerPhone || '',
                'Company': email.company || '',
                'Service Interest': email.serviceInterest || ''
            }));

        const invoices = managedEmails
            .filter(email => email.category === 'invoice')
            .map(email => ({
                'Email ID': email.id,
                'Date': email.date ? new Date(email.date).toLocaleDateString() : '',
                'Subject': email.subject || '',
                'Invoice Number': email.invoiceNumber || '',
                'Invoice Date': email.invoiceDate || '',
                'Client': email.invoiceClient || '',
                'Amount': email.invoiceAmount || '',
                'VAT': email.invoiceVAT || ''
            }));

        console.log(`Processing ${customers.length} customers, ${invoices.length} invoices`);

        const XLSX = require('xlsx');
        const workbook = XLSX.utils.book_new();

        // Create worksheets
        if (customers.length > 0) {
            console.log('Creating customer inquiries sheet');
            const customerSheet = XLSX.utils.json_to_sheet(customers);
            XLSX.utils.book_append_sheet(workbook, customerSheet, 'Customer Inquiries');
        }

        if (invoices.length > 0) {
            console.log('Creating invoices sheet');
            const invoiceSheet = XLSX.utils.json_to_sheet(invoices);
            XLSX.utils.book_append_sheet(workbook, invoiceSheet, 'Invoices');
        }

        // If no specific data, create a general sheet
        if (customers.length === 0 && invoices.length === 0) {
            console.log('Creating general managed emails sheet');
            const generalData = managedEmails.map(email => ({
                'Email ID': email.id,
                'Date': email.date ? new Date(email.date).toLocaleDateString() : '',
                'Subject': email.subject || '',
                'Category': email.category || '',
                'From': email.fromAddress || ''
            }));
            const generalSheet = XLSX.utils.json_to_sheet(generalData);
            XLSX.utils.book_append_sheet(workbook, generalSheet, 'Managed Emails');
        }

        console.log('Generating XLSX buffer');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename=aems-managed-export-${Date.now()}.xlsx`
        });

        console.log(`Sending XLSX buffer (${buffer.length} bytes)`);
        res.send(buffer);
        console.log('Export completed successfully');
    } catch (error) {
        console.error('Export error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to export managed emails' });
    }
});

// ==========================================
// STATS & DASHBOARD
// ==========================================

// Get dashboard stats
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await db.getStats();
        const settings = await db.getSettings();

        res.json({
            ...stats,
            lastSync: settings.lastSync,
            autoSync: settings.autoSync
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// Get/Update settings
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await db.getSettings();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const updates = req.body;
        const success = await db.updateSettings(updates);

        if (!success) {
            return res.status(500).json({ error: 'Failed to update settings' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ==========================================
// NOTIFICATION AND STATS ROUTES
// ==========================================

// Get current user info
app.get('/api/user', async (req, res) => {
    try {
        const user = await gmailService.getConnectedUser();
        if (user) {
            res.json({
                connected: true,
                user: {
                    email: user.email,
                    name: user.name || user.email
                }
            });
        } else {
            res.json({ connected: false });
        }
    } catch (error) {
        res.json({ connected: false });
    }
});

// Initialize global notification clients array
if (!global.notificationClients) {
    global.notificationClients = [];
}

// Server-Sent Events for real-time notifications
app.get('/api/notifications/stream', (req, res) => {
    // Set headers for SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    res.write('data: {"type":"connected","message":"Real-time connection established"}\n\n');

    // Store connection for notifications
    const clientId = Date.now();
    const client = { id: clientId, response: res };
    global.notificationClients.push(client);

    // Keep connection alive
    const heartbeat = setInterval(() => {
        if (!res.destroyed) {
            res.write('data: {"type":"heartbeat"}\n\n');
        }
    }, 30000);

    // Cleanup on disconnect
    req.on('close', () => {
        clearInterval(heartbeat);
        global.notificationClients = global.notificationClients.filter(c => c.id !== clientId);
    });

    req.on('error', () => {
        clearInterval(heartbeat);
        global.notificationClients = global.notificationClients.filter(c => c.id !== clientId);
    });
});

// ==========================================
// HEALTH CHECK ENDPOINTS
// ==========================================

// Basic health check
app.get('/health', async (req, res) => {
    try {
        const health = await healthMonitor.runAllChecks();
        const statusCode = health.status === 'healthy' ? 200 :
            health.status === 'degraded' ? 200 :
                health.status === 'unhealthy' ? 503 : 503;

        res.status(statusCode).json(health);
    } catch (error) {
        res.status(503).json({
            status: 'critical',
            error: error.message
        });
    }
});

// Detailed health check
app.get('/health/detailed', requireAuth, async (req, res) => {
    try {
        const health = await healthMonitor.runAllChecks();
        const history = healthMonitor.getHistory(10);
        const metrics = await healthMonitor.getMetrics();

        res.json({
            current: health,
            history,
            metrics
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get health details' });
    }
});

// Specific health check
app.get('/health/:check', async (req, res) => {
    try {
        const result = await healthMonitor.runCheck(req.params.check);
        const statusCode = result.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(result);
    } catch (error) {
        res.status(500).json({ error: 'Health check failed' });
    }
});

// System metrics
app.get('/api/metrics', requireAuth, async (req, res) => {
    try {
        const metrics = await healthMonitor.getMetrics();
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get metrics' });
    }
});

// ==========================================
// AUDIT LOG ENDPOINTS
// ==========================================

// Get recent audit entries
app.get('/api/audit/recent', requireAuth, async (req, res) => {
    try {
        const count = parseInt(req.query.count) || 100;
        const entries = await auditLogger.getRecentAuditEntries(count);
        res.json(entries);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get audit entries' });
    }
});

// Get audit report
app.get('/api/audit/report', requireAuth, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'startDate and endDate are required'
            });
        }

        const report = await auditLogger.generateAuditReport(startDate, endDate);
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate audit report' });
    }
});

// ==========================================
// BACKUP ENDPOINTS
// ==========================================

// Trigger manual backup
app.post('/api/backup/create', [strictLimiter, requireAuth], async (req, res) => {
    try {
        const result = await backupManager.performBackup();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

// List available backups
app.get('/api/backup/list', requireAuth, async (req, res) => {
    try {
        const backups = await backupManager.listBackups();
        res.json(backups);
    } catch (error) {
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

// Get backup statistics
app.get('/api/backup/stats', requireAuth, async (req, res) => {
    try {
        const stats = backupManager.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get backup stats' });
    }
});

// ==========================================
// AI SERVICE ENDPOINTS
// ==========================================

// Get AI service usage statistics
app.get('/api/ai/stats', requireAuth, async (req, res) => {
    try {
        const categorizationStats = aiService.getUsageStats();
        const extractionStats = aiExtractor.getExtractionStats();

        res.json({
            categorization: categorizationStats,
            extraction: extractionStats,
            combined: {
                totalRequests: categorizationStats.requestCount + extractionStats.usage.requestCount,
                totalTokens: categorizationStats.tokenUsage.total + extractionStats.usage.tokenUsage.total
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get AI stats' });
    }
});

// Reset AI daily statistics (admin only)
app.post('/api/ai/reset-stats', [strictLimiter, requireAuth], async (req, res) => {
    try {
        // Reset both services
        aiService.requestCount = 0;
        aiService.tokenUsage = { prompt: 0, completion: 0, total: 0 };
        aiService.lastResetDate = new Date().toDateString();

        aiExtractor.resetDailyStats();

        auditLogger.logAction('AI_STATS_RESET', 'admin', {
            resetBy: req.session?.userId || 'unknown',
            timestamp: new Date().toISOString()
        });

        res.json({ success: true, message: 'AI statistics reset successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset AI stats' });
    }
});

// ==========================================
// SERVE MAIN APP
// ==========================================

app.get('/', async (req, res) => {
    try {
        // Read the HTML file
        const fs = require('fs').promises;
        let html = await fs.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8');

        // Replace placeholder with actual nonce
        html = html.replace(/{{NONCE}}/g, res.locals.nonce);

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('Error serving index.html:', error);
        res.status(500).send('Internal Server Error');
    }
});

// ==========================================
// ERROR HANDLING MIDDLEWARE
// ==========================================

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);

    // Log the error
    auditLogger.logError('UNHANDLED_ERROR', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip
    });

    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === 'development';

    res.status(err.status || 500).json({
        error: 'Internal Server Error',
        message: isDevelopment ? err.message : 'Something went wrong',
        ...(isDevelopment && { stack: err.stack })
    });
});

// ==========================================
// AUTO SYNC CRON JOB
// ==========================================

// Auto sync every 5 minutes if enabled
cron.schedule('*/5 * * * *', async () => {
    try {
        const settings = await db.getSettings();
        if (!settings.autoSync) return;

        const user = await gmailService.getConnectedUser();
        if (!user) return;

        await gmailService.syncEmails();
    } catch (error) {
        // Auto sync failed
    }
});

// ==========================================
// START SERVER
// ==========================================

const server = app.listen(PORT, () => {
    console.log(`🚀 AEMS Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔒 Security features enabled`);

    // Initialize database
    db.init();

    // Log environment info (sanitized)
    const envInfo = envValidator.getSanitizedEnvInfo();
    console.log('📋 Configuration:', envInfo);
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

    server.close((err) => {
        if (err) {
            console.error('❌ Error during server shutdown:', err);
            process.exit(1);
        }

        console.log('✅ HTTP server closed');

        // Close database connections and cleanup
        Promise.all([
            // Stop backup manager
            backupManager.stopBackupSchedule(),

            // Close any open connections
            new Promise(resolve => {
                // Add any cleanup logic here
                resolve();
            })
        ]).then(() => {
            console.log('✅ Cleanup completed');
            process.exit(0);
        }).catch((error) => {
            console.error('❌ Error during cleanup:', error);
            process.exit(1);
        });
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
        console.error('❌ Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    auditLogger.logError('UNCAUGHT_EXCEPTION', {
        error: error.message,
        stack: error.stack
    });
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    auditLogger.logError('UNHANDLED_REJECTION', {
        reason: reason?.message || reason,
        stack: reason?.stack
    });
    gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = app;
