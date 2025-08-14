const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Email status enum: FETCHED, REVIEW, MANAGED, DELETED
const EMAIL_STATUS = {
  FETCHED: 'FETCHED',
  REVIEW: 'REVIEW', 
  MANAGED: 'MANAGED',
  DELETED: 'DELETED'
};

// Email categories
const EMAIL_CATEGORY = {
  CUSTOMER_INQUIRY: 'CUSTOMER_INQUIRY',
  INVOICE: 'INVOICE',
  OTHER: 'OTHER'
};

// Modular JSON database with separate files by status and category
class ModularJsonDatabase {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    
    // New modular file structure
    this.structure = {
      emails: {
        fetched: {
          'customer-inquiries.json': 'customer_inquiry',
          'invoices.json': 'invoice', 
          'other.json': 'other'
        },
        review: {
          'customer-inquiries.json': 'customer_inquiry',
          'invoices.json': 'invoice',
          'other.json': 'other'
        },
        managed: {
          'customer-inquiries.json': 'customer_inquiry',
          'invoices.json': 'invoice',
          'other.json': 'other'
        },
        deleted: {
          'all.json': 'all'
        }
      },
      'extracted-data': {
        'customer-inquiries.json': 'customer_inquiry',
        'invoices.json': 'invoice'
      },
      attachments: {
        'all.json': 'all'
      },
      notifications: {
        'all.json': 'all'
      }
    };

    // Single files
    this.singleFiles = {
      users: 'users.json',
      settings: 'settings.json'
    };
    
    this.EMAIL_STATUS = EMAIL_STATUS;
    this.EMAIL_CATEGORY = EMAIL_CATEGORY;
    this.init();
  }

  async init() {
    // Ensure data directory exists
    try {
      await fs.access(this.dataDir);
    } catch (error) {
      await fs.mkdir(this.dataDir, { recursive: true });
    }

    // Create modular directory structure
    for (const [mainDir, structure] of Object.entries(this.structure)) {
      const mainDirPath = path.join(this.dataDir, mainDir);
      
      try {
        await fs.access(mainDirPath);
      } catch (error) {
        await fs.mkdir(mainDirPath, { recursive: true });
      }

      // Create subdirectories and files
      if (typeof structure === 'object' && !Array.isArray(structure)) {
        for (const [subDir, files] of Object.entries(structure)) {
          if (typeof files === 'object') {
            // It's a subdirectory with files
            const subDirPath = path.join(mainDirPath, subDir);
            try {
              await fs.access(subDirPath);
            } catch (error) {
              await fs.mkdir(subDirPath, { recursive: true });
            }

            // Initialize files in subdirectory
            for (const filename of Object.keys(files)) {
              const filepath = path.join(subDirPath, filename);
              try {
                await fs.access(filepath);
              } catch (error) {
                await fs.writeFile(filepath, JSON.stringify([], null, 2));
              }
            }
          } else {
            // It's a direct file in main directory
            const filepath = path.join(mainDirPath, subDir);
            try {
              await fs.access(filepath);
            } catch (error) {
              await fs.writeFile(filepath, JSON.stringify([], null, 2));
            }
          }
        }
      }
    }

    // Initialize single files
    for (const [key, filename] of Object.entries(this.singleFiles)) {
      const filepath = path.join(this.dataDir, filename);
      try {
        await fs.access(filepath);
      } catch (error) {
        const initialData = key === 'settings' ? this.getDefaultSettings() : [];
        await fs.writeFile(filepath, JSON.stringify(initialData, null, 2));
      }
    }
  }

  getDefaultSettings() {
    return {
      syncInterval: 5, // minutes
      autoSync: true,
      emailCategories: ['customer_inquiry', 'invoice'],
      language: 'both', // 'greek', 'english', 'both'
      notifications: true,
      lastSync: null
    };
  }

  // Helper methods to get file paths
  getEmailFilePath(status, category) {
    const statusDir = status.toLowerCase();
    let filename;
    
    if (status === 'DELETED') {
      filename = 'all.json';
    } else {
      switch (category.toLowerCase()) {
        case 'customer_inquiry':
          filename = 'customer-inquiries.json';
          break;
        case 'invoice':
          filename = 'invoices.json';
          break;
        default:
          filename = 'other.json';
      }
    }
    
    return path.join(this.dataDir, 'emails', statusDir, filename);
  }

  getExtractedDataFilePath(category) {
    const filename = category === 'customer_inquiry' ? 'customer-inquiries.json' : 'invoices.json';
    return path.join(this.dataDir, 'extracted-data', filename);
  }

  getAttachmentsFilePath() {
    return path.join(this.dataDir, 'attachments', 'all.json');
  }

  getNotificationsFilePath() {
    return path.join(this.dataDir, 'notifications', 'all.json');
  }

  // Generic file operations
  async readJsonFile(filepath) {
    try {
      const data = await fs.readFile(filepath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  async writeJsonFile(filepath, data) {
    try {
      await fs.writeFile(filepath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error('Error writing file:', filepath, error);
      return false;
    }
  }

  // User management (unchanged)
  async getUser() {
    const filepath = path.join(this.dataDir, this.singleFiles.users);
    const users = await this.readJsonFile(filepath);
    return users.length > 0 ? users[0] : null;
  }

  async saveUser(userData) {
    const filepath = path.join(this.dataDir, this.singleFiles.users);
    return await this.writeJsonFile(filepath, [userData]);
  }

  async removeUser() {
    const filepath = path.join(this.dataDir, this.singleFiles.users);
    return await this.writeJsonFile(filepath, []);
  }

  // ===============================
  // MODULAR EMAIL OPERATIONS
  // ===============================

  async createEmail(emailData) {
    const email = {
      id: uuidv4(),
      gmailId: emailData.gmailId,
      threadId: emailData.threadId || null,
      subject: emailData.subject || '',
      body: emailData.body || '',
      htmlBody: emailData.htmlBody || null,
      snippet: emailData.snippet || null,
      fromAddress: emailData.fromAddress || '',
      fromName: emailData.fromName || null,
      toAddress: emailData.toAddress || '',
      date: emailData.date || new Date().toISOString(),
      category: emailData.category || EMAIL_CATEGORY.OTHER,
      status: EMAIL_STATUS.FETCHED,
      fetchedAt: new Date().toISOString(),
      reviewedAt: null,
      managedAt: null,
      isDeleted: false,
      deletedAt: null,
      userId: emailData.userId
    };

    // Save to appropriate file based on status and category
    const filepath = this.getEmailFilePath(email.status, email.category);
    const emails = await this.readJsonFile(filepath);
    emails.unshift(email);
    await this.writeJsonFile(filepath, emails);
    
    return email;
  }

  async getEmails(filters = {}) {
    const results = [];

    if (filters.status && filters.category) {
      // Get from specific file
      const filepath = this.getEmailFilePath(filters.status, filters.category);
      const emails = await this.readJsonFile(filepath);
      results.push(...emails.filter(email => !email.isDeleted));
    } else if (filters.status) {
      // Get all categories for this status
      const status = filters.status;
      if (status === 'DELETED') {
        const filepath = this.getEmailFilePath(status, 'all');
        const emails = await this.readJsonFile(filepath);
        results.push(...emails);
      } else {
        const categories = ['customer_inquiry', 'invoice', 'other'];
        for (const category of categories) {
          const filepath = this.getEmailFilePath(status, category);
          const emails = await this.readJsonFile(filepath);
          results.push(...emails.filter(email => !email.isDeleted));
        }
      }
    } else {
      // Get all emails from all files
      const statuses = ['FETCHED', 'REVIEW', 'MANAGED', 'DELETED'];
      for (const status of statuses) {
        if (status === 'DELETED') {
          const filepath = this.getEmailFilePath(status, 'all');
          const emails = await this.readJsonFile(filepath);
          results.push(...emails);
        } else {
          const categories = ['customer_inquiry', 'invoice', 'other'];
          for (const category of categories) {
            const filepath = this.getEmailFilePath(status, category);
            const emails = await this.readJsonFile(filepath);
            results.push(...emails.filter(email => !email.isDeleted));
          }
        }
      }
    }

    // Apply additional filters
    let filtered = results;
    if (filters.category && !filters.status) {
      filtered = filtered.filter(email => email.category === filters.category);
    }
    if (filters.userId) {
      filtered = filtered.filter(email => email.userId === filters.userId);
    }

    return filtered;
  }

  async getEmailById(emailId) {
    // Search across all email files
    const statuses = ['FETCHED', 'REVIEW', 'MANAGED', 'DELETED'];
    
    for (const status of statuses) {
      if (status === 'DELETED') {
        const filepath = this.getEmailFilePath(status, 'all');
        const emails = await this.readJsonFile(filepath);
        const found = emails.find(email => email.id === emailId);
        if (found) return found;
      } else {
        const categories = ['customer_inquiry', 'invoice', 'other'];
        for (const category of categories) {
          const filepath = this.getEmailFilePath(status, category);
          const emails = await this.readJsonFile(filepath);
          const found = emails.find(email => email.id === emailId && !email.isDeleted);
          if (found) return found;
        }
      }
    }
    
    return null;
  }

  async updateEmail(emailId, updates) {
    const email = await this.getEmailById(emailId);
    if (!email) return null;

    const oldStatus = email.status;
    const oldCategory = email.category;
    const newStatus = updates.status || oldStatus;
    const newCategory = updates.category || oldCategory;

    // Update email object
    const updatedEmail = {
      ...email,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // If status or category changed, move to new file
    if (oldStatus !== newStatus || oldCategory !== newCategory) {
      // Remove from old file
      await this.removeEmailFromFile(emailId, oldStatus, oldCategory);
      
      // Add to new file
      const newFilepath = this.getEmailFilePath(newStatus, newCategory);
      const emails = await this.readJsonFile(newFilepath);
      emails.unshift(updatedEmail);
      await this.writeJsonFile(newFilepath, emails);
    } else {
      // Update in same file
      const filepath = this.getEmailFilePath(oldStatus, oldCategory);
      const emails = await this.readJsonFile(filepath);
      const emailIndex = emails.findIndex(e => e.id === emailId);
      
      if (emailIndex !== -1) {
        emails[emailIndex] = updatedEmail;
        await this.writeJsonFile(filepath, emails);
      }
    }

    return updatedEmail;
  }

  async removeEmailFromFile(emailId, status, category) {
    const filepath = this.getEmailFilePath(status, category);
    const emails = await this.readJsonFile(filepath);
    const filtered = emails.filter(email => email.id !== emailId);
    await this.writeJsonFile(filepath, filtered);
  }

  // Continue with other methods...
  async addMultipleFetchedEmails(emails) {
    if (!Array.isArray(emails) || emails.length === 0) {
      return [];
    }
    
    const results = [];
    
    // Group emails by category for efficient file operations
    const emailsByCategory = {
      customer_inquiry: [],
      invoice: [],
      other: []
    };

    // Get existing Gmail IDs to check for duplicates across ALL statuses
    const existingGmailIds = new Set();
    const categories = ['customer_inquiry', 'invoice', 'other'];
    const statuses = ['FETCHED', 'REVIEW', 'MANAGED'];
    
    for (const status of statuses) {
      for (const category of categories) {
        const filepath = this.getEmailFilePath(status, category);
        const existingEmails = await this.readJsonFile(filepath);
        existingEmails.forEach(email => existingGmailIds.add(email.gmailId));
      }
    }
    
    for (const emailData of emails) {
      // Skip duplicates based on Gmail ID
      if (existingGmailIds.has(emailData.gmailId)) {
        continue;
      }
      
      try {
        const email = {
          id: uuidv4(),
          gmailId: emailData.gmailId,
          threadId: emailData.threadId || null,
          subject: emailData.subject || '',
          body: emailData.body || '',
          htmlBody: emailData.htmlBody || null,
          snippet: emailData.snippet || null,
          fromAddress: emailData.fromAddress || '',
          fromName: emailData.fromName || null,
          toAddress: emailData.toAddress || '',
          date: emailData.date || new Date().toISOString(),
          category: emailData.category || EMAIL_CATEGORY.OTHER,
          status: EMAIL_STATUS.FETCHED,
          fetchedAt: new Date().toISOString(),
          reviewedAt: null,
          managedAt: null,
          isDeleted: false,
          deletedAt: null,
          userId: emailData.userId || 'single-user'
        };
        
        const category = email.category.toLowerCase();
        if (emailsByCategory[category]) {
          emailsByCategory[category].push(email);
        } else {
          emailsByCategory.other.push(email);
        }
        
        results.push(email);
        existingGmailIds.add(emailData.gmailId);
        
      } catch (error) {
        // Failed to create email, skip
      }
    }
    
    // Save emails to their respective category files
    for (const [category, categoryEmails] of Object.entries(emailsByCategory)) {
      if (categoryEmails.length > 0) {
        const filepath = this.getEmailFilePath('FETCHED', category);
        const existingEmails = await this.readJsonFile(filepath);
        existingEmails.unshift(...categoryEmails);
        await this.writeJsonFile(filepath, existingEmails);
      }
    }
    
    return results;
  }

  // ===============================
  // CONVENIENCE METHODS
  // ===============================

  async getFetchedEmails(userId = null) {
    return await this.getEmails({ status: EMAIL_STATUS.FETCHED, userId });
  }

  async getReviewEmails(userId = null) {
    const emails = await this.getEmails({ status: EMAIL_STATUS.REVIEW, userId });
    
    // Join with extracted data
    return Promise.all(emails.map(async email => {
      const extractedData = await this.getExtractedDataByEmailId(email.id);
      if (extractedData) {
        const { id, emailId, extractedAt, isDeleted, jsonBlob, greekFields, ...extractedFields } = extractedData;
        return { ...email, ...extractedFields };
      }
      return email;
    }));
  }

  async getManagedEmails(userId = null) {
    const emails = await this.getEmails({ status: EMAIL_STATUS.MANAGED, userId });
    
    // Join with extracted data for managed emails too
    return Promise.all(emails.map(async email => {
      const extractedData = await this.getExtractedDataByEmailId(email.id);
      if (extractedData) {
        const { id, emailId, extractedAt, isDeleted, jsonBlob, greekFields, ...extractedFields } = extractedData;
        return { ...email, ...extractedFields };
      }
      return email;
    }));
  }

  async getProcessedEmails(userId = null) {
    // Alias for getManagedEmails to match server.js expectations
    return await this.getManagedEmails(userId);
  }

  // ===============================
  // EXTRACTED DATA OPERATIONS
  // ===============================

  async createExtractedData(extractedDataInfo) {
    const extractedData = {
      id: uuidv4(),
      jsonBlob: JSON.stringify(extractedDataInfo.rawData || {}),
      greekFields: JSON.stringify(extractedDataInfo.greekFields || {}),
      // Customer inquiry fields
      customerName: extractedDataInfo.customerName || null,
      customerEmail: extractedDataInfo.customerEmail || null,
      customerPhone: extractedDataInfo.customerPhone || null,
      company: extractedDataInfo.company || null,
      serviceInterest: extractedDataInfo.serviceInterest || null,
      // Invoice fields
      invoiceNumber: extractedDataInfo.invoiceNumber || null,
      invoiceDate: extractedDataInfo.invoiceDate || null,
      invoiceClient: extractedDataInfo.invoiceClient || null,
      invoiceAmount: extractedDataInfo.invoiceAmount || null,
      invoiceVAT: extractedDataInfo.invoiceVAT || null,
      // Metadata
      extractedAt: new Date().toISOString(),
      confidence: extractedDataInfo.confidence || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
      deletedAt: null,
      emailId: extractedDataInfo.emailId
    };

    // Determine category based on data fields
    const category = extractedDataInfo.invoiceNumber ? 'invoice' : 'customer_inquiry';
    const filepath = this.getExtractedDataFilePath(category);
    
    // Remove existing data for this email (one-to-one relationship)
    const existingData = await this.readJsonFile(filepath);
    const filtered = existingData.filter(data => data.emailId !== extractedDataInfo.emailId);
    filtered.unshift(extractedData);
    await this.writeJsonFile(filepath, filtered);
    
    return extractedData;
  }

  async getExtractedDataByEmailId(emailId) {
    // Check both customer inquiry and invoice files
    const categories = ['customer_inquiry', 'invoice'];
    
    for (const category of categories) {
      const filepath = this.getExtractedDataFilePath(category);
      const data = await this.readJsonFile(filepath);
      const found = data.find(item => item.emailId === emailId && !item.isDeleted);
      if (found) return found;
    }
    
    return null;
  }

  // ===============================
  // NOTIFICATION OPERATIONS
  // ===============================

  async createNotification(notificationData) {
    const notification = {
      id: uuidv4(),
      type: notificationData.type,
      title: notificationData.title,
      message: notificationData.message,
      payload: JSON.stringify(notificationData.payload || {}),
      isRead: false,
      readAt: null,
      createdAt: new Date().toISOString(),
      isDeleted: false,
      deletedAt: null,
      userId: notificationData.userId
    };

    const filepath = this.getNotificationsFilePath();
    const notifications = await this.readJsonFile(filepath);
    notifications.unshift(notification);
    await this.writeJsonFile(filepath, notifications);
    
    return notification;
  }

  async getNotifications(userId, onlyUnread = false) {
    const filepath = this.getNotificationsFilePath();
    const notifications = await this.readJsonFile(filepath);
    let filtered = notifications.filter(notif => notif.userId === userId && !notif.isDeleted);
    
    if (onlyUnread) {
      filtered = filtered.filter(notif => !notif.isRead);
    }

    return filtered;
  }

  // ===============================
  // WORKFLOW METHODS
  // ===============================

  async moveEmailToReview(emailId) {
    return await this.updateEmail(emailId, {
      status: EMAIL_STATUS.REVIEW,
      reviewedAt: new Date().toISOString()
    });
  }

  async moveEmailToManaged(emailId) {
    return await this.updateEmail(emailId, {
      status: EMAIL_STATUS.MANAGED,
      managedAt: new Date().toISOString()
    });
  }

  async softDeleteEmail(emailId) {
    const email = await this.getEmailById(emailId);
    if (!email) return null;

    const updatedEmail = {
      ...email,
      status: EMAIL_STATUS.DELETED,
      isDeleted: true,
      deletedAt: new Date().toISOString()
    };

    // Remove from current file
    await this.removeEmailFromFile(emailId, email.status, email.category);

    // Add to deleted file
    const deletedFilepath = this.getEmailFilePath('DELETED', 'all');
    const deletedEmails = await this.readJsonFile(deletedFilepath);
    deletedEmails.unshift(updatedEmail);
    await this.writeJsonFile(deletedFilepath, deletedEmails);

    return updatedEmail;
  }

  // Settings management
  async getSettings() {
    const filepath = path.join(this.dataDir, this.singleFiles.settings);
    return await this.readJsonFile(filepath) || this.getDefaultSettings();
  }

  async updateSettings(newSettings) {
    const currentSettings = await this.getSettings();
    const updatedSettings = { ...currentSettings, ...newSettings };
    const filepath = path.join(this.dataDir, this.singleFiles.settings);
    return await this.writeJsonFile(filepath, updatedSettings);
  }

  // ===============================  
  // EMAIL CATEGORY MANAGEMENT
  // ===============================

  async updateEmailCategory(emailId, newCategory) {
    console.log(`=== UPDATING EMAIL CATEGORY: ${emailId} → ${newCategory} ===`);
    const email = await this.getEmailById(emailId);
    
    if (!email) {
      console.log('Email not found');
      return null;
    }

    if (!email.status === this.EMAIL_STATUS.FETCHED) {
      console.log('Email is not in FETCHED status, cannot change category');
      return null;
    }

    const oldCategory = email.category;
    console.log(`Changing category from ${oldCategory} to ${newCategory}`);

    // Validate new category
    const validCategories = ['customer_inquiry', 'invoice', 'other'];
    if (!validCategories.includes(newCategory.toLowerCase())) {
      console.log('Invalid category provided');
      return null;
    }

    // Update the email category using the existing updateEmail method
    // This will automatically move the email to the correct file
    const result = await this.updateEmail(emailId, {
      category: newCategory.toLowerCase(),
      updatedAt: new Date().toISOString()
    });

    console.log(`Category update result: ${result ? 'SUCCESS' : 'FAILED'}`);
    return result;
  }

  // ===============================
  // EMAIL APPROVAL WORKFLOW
  // ===============================

  async approveFetchedEmail(id) {
    console.log(`=== APPROVING FETCHED EMAIL: ${id} ===`);
    const email = await this.getEmailById(id);
    if (!email || email.status !== this.EMAIL_STATUS.FETCHED) {
      console.log(`Email not found or not in FETCHED status. Found: ${email ? email.status : 'null'}`);
      return null;
    }
    
    console.log(`Email found: ${email.subject}, Category: ${email.category}`);
    
    // Move to REVIEW stage
    const result = await this.moveEmailToReview(id);
    console.log(`Moved to REVIEW stage: ${result ? 'SUCCESS' : 'FAILED'}`);
    
    // Trigger AI extraction using the dedicated extraction agent
    try {
      console.log('=== STARTING AI EXTRACTION AGENT ===');
      const aiExtractor = require('./ai-extractor');
      const extractionResult = await aiExtractor.extractData(email);
      
      console.log('AI extraction result:', JSON.stringify(extractionResult, null, 2));
      
      if (extractionResult.success && extractionResult.extractedData) {
        console.log('=== SAVING EXTRACTED DATA ===');
        // Map the extracted data to database schema
        const mappedData = this.mapExtractedDataToSchema(extractionResult.extractedData, email.category, id);
        
        console.log('Mapped data for database:', JSON.stringify(mappedData, null, 2));
        const savedData = await this.createExtractedData(mappedData);
        console.log('Extracted data saved:', savedData ? 'SUCCESS' : 'FAILED');
      } else {
        console.log('No extracted data or extraction failed:', extractionResult.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Failed to extract data during approval:', error);
      console.error('Error stack:', error.stack);
      // Continue even if AI extraction fails
    }
    
    return result;
  }

  mapExtractedDataToSchema(extractedData, category, emailId) {
    const mappedData = {
      emailId: emailId
    };

    if (category === 'customer_inquiry') {
      // Map customer inquiry fields
      mappedData.customerName = extractedData.customerName || null;
      mappedData.customerEmail = extractedData.customerEmail || null;
      mappedData.customerPhone = extractedData.customerPhone || null;
      mappedData.company = extractedData.company || null;
      mappedData.serviceInterest = extractedData.serviceInterest || null;
      
      // Additional customer fields
      mappedData.location = extractedData.location || null;
      mappedData.budget = extractedData.budget || null;
      mappedData.timeline = extractedData.timeline || null;
      mappedData.additionalNotes = extractedData.additionalNotes || null;
    } else if (category === 'invoice') {
      // Map invoice fields  
      mappedData.invoiceNumber = extractedData.invoiceNumber || null;
      mappedData.invoiceDate = extractedData.invoiceDate || null;
      mappedData.invoiceClient = extractedData.customerName || null;
      mappedData.invoiceAmount = extractedData.totalAmount || null;
      mappedData.invoiceVAT = extractedData.vatAmount || null;
      
      // Additional invoice fields
      mappedData.currency = extractedData.currency || null;
      mappedData.dueDate = extractedData.dueDate || null;
      mappedData.paymentStatus = extractedData.paymentStatus || null;
      mappedData.description = extractedData.description || null;
    }

    return mappedData;
  }

  async removeFetchedEmail(id) {
    const email = await this.getEmailById(id);
    if (!email || email.status !== this.EMAIL_STATUS.FETCHED) {
      return null;
    }
    
    // Soft delete the email
    const result = await this.softDeleteEmail(id);
    
    // No notification for declined emails (only show NEW_EMAIL_FETCHED)
    
    return result;
  }

  async approveReviewEmail(id) {
    const email = await this.getEmailById(id);
    if (!email || email.status !== this.EMAIL_STATUS.REVIEW) {
      return null;
    }
    
    // Move to MANAGED stage
    const result = await this.moveEmailToManaged(id);
    
    // No notification for processed emails (only show NEW_EMAIL_FETCHED)
    
    return result;
  }

  async updateReviewEmail(id, extractedData) {
    const email = await this.getEmailById(id);
    if (!email || email.status !== this.EMAIL_STATUS.REVIEW) {
      return null;
    }
    
    try {
      // Update or create extracted data
      await this.createExtractedData({
        emailId: id,
        ...extractedData,
        extractedAt: new Date().toISOString()
      });
      
      // Update email timestamp
      const result = await this.updateEmail(id, {
        updatedAt: new Date().toISOString()
      });
      
      return result;
    } catch (error) {
      return null;
    }
  }

  // ===============================
  // BULK OPERATIONS
  // ===============================

  async bulkApproveEmails(emailIds) {
    console.log(`=== BULK APPROVING ${emailIds.length} EMAILS ===`);
    const results = [];
    const errors = [];

    for (const emailId of emailIds) {
      try {
        const result = await this.approveFetchedEmail(emailId);
        if (result) {
          results.push({ emailId, success: true, email: result });
        } else {
          errors.push({ emailId, error: 'Email not found or not in FETCHED status' });
        }
      } catch (error) {
        console.error(`Failed to approve email ${emailId}:`, error);
        errors.push({ emailId, error: error.message });
      }
    }

    console.log(`Bulk approve results: ${results.length} success, ${errors.length} errors`);
    return { results, errors, totalProcessed: emailIds.length };
  }

  async bulkDeclineEmails(emailIds) {
    console.log(`=== BULK DECLINING ${emailIds.length} EMAILS ===`);
    const results = [];
    const errors = [];

    for (const emailId of emailIds) {
      try {
        const result = await this.removeFetchedEmail(emailId);
        if (result) {
          results.push({ emailId, success: true, email: result });
        } else {
          errors.push({ emailId, error: 'Email not found or not in FETCHED status' });
        }
      } catch (error) {
        console.error(`Failed to decline email ${emailId}:`, error);
        errors.push({ emailId, error: error.message });
      }
    }

    console.log(`Bulk decline results: ${results.length} success, ${errors.length} errors`);
    return { results, errors, totalProcessed: emailIds.length };
  }

  async bulkApproveReviewEmails(emailIds) {
    console.log(`=== BULK APPROVING ${emailIds.length} REVIEW EMAILS ===`);
    const results = [];
    const errors = [];

    for (const emailId of emailIds) {
      try {
        const result = await this.approveReviewEmail(emailId);
        if (result) {
          results.push({ emailId, success: true, email: result });
        } else {
          errors.push({ emailId, error: 'Email not found or not in REVIEW status' });
        }
      } catch (error) {
        console.error(`Failed to approve review email ${emailId}:`, error);
        errors.push({ emailId, error: error.message });
      }
    }

    console.log(`Bulk approve review results: ${results.length} success, ${errors.length} errors`);
    return { results, errors, totalProcessed: emailIds.length };
  }

  // ===============================
  // STATISTICS AND METRICS
  // ===============================

  async getStats() {
    try {
      const fetchedEmails = await this.getFetchedEmails();
      const reviewEmails = await this.getReviewEmails();
      const managedEmails = await this.getManagedEmails();
      
      return {
        fetched: fetchedEmails.length,
        review: reviewEmails.length,
        managed: managedEmails.length,
        total: fetchedEmails.length + reviewEmails.length + managedEmails.length
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return { fetched: 0, review: 0, managed: 0, total: 0 };
    }
  }

  async getEmailStats() {
    return await this.getStats();
  }

  // Additional utility methods
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

module.exports = new ModularJsonDatabase();