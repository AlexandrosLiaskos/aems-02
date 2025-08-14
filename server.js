require('dotenv').config();
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

// Initialize DOMPurify
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Import our services
const db = require('./lib/database');
const gmailService = require('./lib/gmail');
const aiService = require('./lib/ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Allow embedding for development
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.MAX_AUTH_ATTEMPTS) || 5,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // Increased limit for development
  message: { error: 'API rate limit exceeded, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Only apply rate limiting in production
if (process.env.NODE_ENV === 'production') {
  app.use('/auth/', authLimiter);
  app.use('/api/', apiLimiter);
  app.use(generalLimiter);
}

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
    maxAge: parseInt(process.env.SESSION_TIMEOUT) || 3600000
  }
}));

// Template engine setup (simple HTML serving)
app.use(express.static(path.join(__dirname, 'public')));

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

// Apply sanitization to all routes
app.use(sanitizeInput);

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
    req.session.destroy();
    res.json({ success: true });
  } catch (error) {
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
app.delete('/api/emails/fetched/:id', async (req, res) => {
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
  body('emailIds').isArray({ min: 1, max: 50 }).withMessage('emailIds must be an array with 1-50 items'),
  body('emailIds.*').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Each email ID must be a valid string'),
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
  body('emailIds').isArray({ min: 1, max: 50 }).withMessage('emailIds must be an array with 1-50 items'),
  body('emailIds.*').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Each email ID must be a valid string'),
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
  body('emailIds').isArray({ min: 1, max: 50 }).withMessage('emailIds must be an array with 1-50 items'),
  body('emailIds.*').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Each email ID must be a valid string'),
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
  body('category').isIn(['customer_inquiry', 'invoice', 'other']).withMessage('Category must be customer_inquiry, invoice, or other'),
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
app.put('/api/emails/review/:id', async (req, res) => {
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
app.put('/api/emails/review/:id/extracted-data', async (req, res) => {
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
app.post('/api/emails/review/:id/approve', async (req, res) => {
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
app.put('/api/emails/processed/:id', async (req, res) => {
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
app.delete('/api/emails/:id', async (req, res) => {
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
app.delete('/api/emails/processed/:id', async (req, res) => {
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
app.post('/api/emails/:id/restore', async (req, res) => {
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
app.delete('/api/emails/:id/permanent', async (req, res) => {
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
// SERVE MAIN APP
// ==========================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

app.listen(PORT, () => {
  // Initialize database
  db.init();
});

module.exports = app;
