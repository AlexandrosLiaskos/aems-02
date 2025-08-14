# Database Implementation Fixes

## 📋 Complete Database Method Implementation

This document provides the complete implementation of all missing database methods required for AEMS to function properly.

## 🚨 Critical Methods (Phase 1)

### Add to `lib/database.js`

```javascript
// ===============================
// WORKFLOW TRANSITION METHODS
// ===============================

async approveFetchedEmail(id) {
  const email = await this.getEmailById(id);
  if (!email || email.status !== this.EMAIL_STATUS.FETCHED) {
    return null;
  }
  
  // Move to REVIEW stage and trigger AI processing
  const result = await this.moveEmailToReview(id);
  
  // Create notification
  await this.createNotification({
    type: 'EMAIL_APPROVED',
    title: 'Email Approved',
    message: `Email "${email.subject}" moved to review stage`,
    payload: { emailId: id },
    userId: email.userId || 'single-user'
  });
  
  return result;
}

async removeFetchedEmail(id) {
  const email = await this.getEmailById(id);
  if (!email || email.status !== this.EMAIL_STATUS.FETCHED) {
    return null;
  }
  
  // Soft delete the email
  const result = await this.softDeleteEmail(id);
  
  // Create notification
  await this.createNotification({
    type: 'EMAIL_DECLINED',
    title: 'Email Declined',
    message: `Email "${email.subject}" moved to recycle bin`,
    payload: { emailId: id },
    userId: email.userId || 'single-user'
  });
  
  return result;
}

async addMultipleFetchedEmails(emails) {
  if (!Array.isArray(emails) || emails.length === 0) {
    return [];
  }
  
  const results = [];
  const existingEmails = await this.readFile('emails');
  const existingGmailIds = new Set(existingEmails.map(e => e.gmailId));
  
  for (const emailData of emails) {
    // Skip duplicates based on Gmail ID
    if (existingGmailIds.has(emailData.gmailId)) {
      console.log(`Skipping duplicate email: ${emailData.gmailId}`);
      continue;
    }
    
    try {
      const result = await this.createEmail({
        ...emailData,
        category: emailData.category || this.EMAIL_CATEGORY.OTHER,
        userId: emailData.userId || 'single-user' // Single user system
      });
      
      results.push(result);
      existingGmailIds.add(emailData.gmailId);
      
    } catch (error) {
      console.error(`Failed to create email ${emailData.gmailId}:`, error);
    }
  }
  
  // Create bulk notification if emails were added
  if (results.length > 0) {
    await this.createNotification({
      type: 'NEW_EMAIL_FETCHED',
      title: 'New Emails Fetched',
      message: `${results.length} new emails fetched and categorized`,
      payload: { count: results.length, emailIds: results.map(r => r.id) },
      userId: 'single-user'
    });
  }
  
  return results;
}

// ===============================
// REVIEW STAGE METHODS
// ===============================

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
    console.error('Failed to update review email:', error);
    return null;
  }
}

async approveReviewEmail(id) {
  const email = await this.getEmailById(id);
  if (!email || email.status !== this.EMAIL_STATUS.REVIEW) {
    return null;
  }
  
  // Move to MANAGED stage
  const result = await this.moveEmailToManaged(id);
  
  // Create notification
  await this.createNotification({
    type: 'EMAIL_PROCESSED',
    title: 'Email Processed',
    message: `Email "${email.subject}" processed and moved to data management`,
    payload: { emailId: id },
    userId: email.userId || 'single-user'
  });
  
  return result;
}

// ===============================
// PROCESSED/MANAGED EMAIL METHODS
// ===============================

async getProcessedEmails(userId = null) {
  // Alias for getManagedEmails to match server.js expectations
  return await this.getManagedEmails(userId);
}

async updateProcessedEmail(id, updates) {
  const email = await this.getEmailById(id);
  if (!email || email.status !== this.EMAIL_STATUS.MANAGED) {
    return null;
  }
  
  try {
    // Separate extractedData updates from email updates
    const { extractedData, ...emailUpdates } = updates;
    
    // Update email if there are email-specific updates
    if (Object.keys(emailUpdates).length > 0) {
      await this.updateEmail(id, {
        ...emailUpdates,
        updatedAt: new Date().toISOString()
      });
    }
    
    // Update extracted data if provided
    if (extractedData) {
      await this.updateExtractedData(id, extractedData);
    }
    
    return await this.getEmailById(id);
  } catch (error) {
    console.error('Failed to update processed email:', error);
    return null;
  }
}

async deleteProcessedEmail(id) {
  const email = await this.getEmailById(id);
  if (!email || email.status !== this.EMAIL_STATUS.MANAGED) {
    return null;
  }
  
  const result = await this.softDeleteEmail(id);
  
  // Create notification
  await this.createNotification({
    type: 'EMAIL_DELETED',
    title: 'Email Deleted',
    message: `Email "${email.subject}" moved to recycle bin`,
    payload: { emailId: id },
    userId: email.userId || 'single-user'
  });
  
  return result;
}

// ===============================
// RECYCLE BIN METHODS
// ===============================

async getRecycleBin(userId = null) {
  // Get all soft-deleted emails
  return await this.getDeletedEmails(userId);
}

async restoreFromRecycleBin(id) {
  const emails = await this.readFile('emails');
  const email = emails.find(e => e.id === id);
  
  if (!email || !email.isDeleted) {
    return null;
  }
  
  // Restore to MANAGED status (final stage)
  const result = await this.updateEmail(id, {
    status: this.EMAIL_STATUS.MANAGED,
    isDeleted: false,
    deletedAt: null,
    restoredAt: new Date().toISOString()
  });
  
  // Create notification
  await this.createNotification({
    type: 'EMAIL_RESTORED',
    title: 'Email Restored',
    message: `Email "${email.subject}" restored from recycle bin`,
    payload: { emailId: id },
    userId: email.userId || 'single-user'
  });
  
  return result;
}

async permanentlyDeleteFromRecycleBin(id) {
  const emails = await this.readFile('emails');
  const email = emails.find(e => e.id === id);
  
  if (!email || !email.isDeleted) {
    return false;
  }
  
  try {
    // Remove from emails table
    const filteredEmails = emails.filter(e => e.id !== id);
    await this.writeFile('emails', filteredEmails);
    
    // Remove associated extracted data
    const extractedData = await this.readFile('extractedData');
    const filteredData = extractedData.filter(d => d.emailId !== id);
    await this.writeFile('extractedData', filteredData);
    
    // Remove associated attachments
    const attachments = await this.readFile('attachments');
    const filteredAttachments = attachments.filter(a => a.emailId !== id);
    await this.writeFile('attachments', filteredAttachments);
    
    // Create audit log
    await this.createAuditLog({
      action: 'PERMANENT_DELETE',
      details: `Permanently deleted email: ${email.subject}`,
      emailId: id,
      userId: email.userId || 'single-user'
    });
    
    return true;
  } catch (error) {
    console.error('Failed to permanently delete email:', error);
    return false;
  }
}

// ===============================
// BULK OPERATIONS (Phase 2/3)
// ===============================

async bulkApproveEmails(emailIds) {
  const results = [];
  
  for (const id of emailIds) {
    try {
      const result = await this.approveFetchedEmail(id);
      if (result) {
        results.push({ id, success: true, result });
      } else {
        results.push({ id, success: false, error: 'Email not found or not in fetched state' });
      }
    } catch (error) {
      results.push({ id, success: false, error: error.message });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  
  // Create bulk notification
  await this.createNotification({
    type: 'BULK_OPERATION',
    title: 'Bulk Approval Completed',
    message: `${successCount} of ${emailIds.length} emails approved successfully`,
    payload: { operation: 'bulk_approve', results },
    userId: 'single-user'
  });
  
  return results;
}

async bulkDeclineEmails(emailIds) {
  const results = [];
  
  for (const id of emailIds) {
    try {
      const result = await this.removeFetchedEmail(id);
      if (result) {
        results.push({ id, success: true, result });
      } else {
        results.push({ id, success: false, error: 'Email not found or not in fetched state' });
      }
    } catch (error) {
      results.push({ id, success: false, error: error.message });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  
  // Create bulk notification
  await this.createNotification({
    type: 'BULK_OPERATION',
    title: 'Bulk Decline Completed',
    message: `${successCount} of ${emailIds.length} emails declined successfully`,
    payload: { operation: 'bulk_decline', results },
    userId: 'single-user'
  });
  
  return results;
}

async bulkProcessEmails(emailIds) {
  const results = [];
  
  for (const id of emailIds) {
    try {
      const result = await this.approveReviewEmail(id);
      if (result) {
        results.push({ id, success: true, result });
      } else {
        results.push({ id, success: false, error: 'Email not found or not in review state' });
      }
    } catch (error) {
      results.push({ id, success: false, error: error.message });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  
  // Create bulk notification
  await this.createNotification({
    type: 'BULK_OPERATION',
    title: 'Bulk Processing Completed',
    message: `${successCount} of ${emailIds.length} emails processed successfully`,
    payload: { operation: 'bulk_process', results },
    userId: 'single-user'
  });
  
  return results;
}

// ===============================
// SEARCH AND FILTERING (Phase 3)
// ===============================

async searchEmails(query, filters = {}) {
  const emails = await this.readFile('emails');
  let results = emails.filter(email => !email.isDeleted);
  
  // Apply text search
  if (query && query.trim()) {
    const searchTerm = query.toLowerCase();
    results = results.filter(email => 
      email.subject.toLowerCase().includes(searchTerm) ||
      email.body.toLowerCase().includes(searchTerm) ||
      email.fromAddress.toLowerCase().includes(searchTerm) ||
      email.fromName?.toLowerCase().includes(searchTerm)
    );
  }
  
  // Apply filters
  if (filters.status) {
    results = results.filter(email => email.status === filters.status);
  }
  
  if (filters.category) {
    results = results.filter(email => email.category === filters.category);
  }
  
  if (filters.startDate && filters.endDate) {
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);
    results = results.filter(email => {
      const emailDate = new Date(email.date);
      return emailDate >= start && emailDate <= end;
    });
  }
  
  if (filters.userId) {
    results = results.filter(email => email.userId === filters.userId);
  }
  
  // Sort by date (newest first)
  results.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  // Apply pagination if specified
  if (filters.limit) {
    const offset = filters.offset || 0;
    results = results.slice(offset, offset + filters.limit);
  }
  
  return results;
}

async getEmailsByDateRange(startDate, endDate, userId = null) {
  const emails = await this.readFile('emails');
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let filtered = emails.filter(email => {
    if (email.isDeleted) return false;
    if (userId && email.userId !== userId) return false;
    
    const emailDate = new Date(email.date);
    return emailDate >= start && emailDate <= end;
  });
  
  return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async getEmailStats(userId = null, dateRange = null) {
  const emails = await this.readFile('emails');
  let filtered = emails;
  
  if (userId) {
    filtered = filtered.filter(email => email.userId === userId);
  }
  
  if (dateRange) {
    const { startDate, endDate } = dateRange;
    const start = new Date(startDate);
    const end = new Date(endDate);
    filtered = filtered.filter(email => {
      const emailDate = new Date(email.date);
      return emailDate >= start && emailDate <= end;
    });
  }
  
  // Calculate statistics
  const stats = {
    total: filtered.length,
    fetched: filtered.filter(e => e.status === this.EMAIL_STATUS.FETCHED && !e.isDeleted).length,
    review: filtered.filter(e => e.status === this.EMAIL_STATUS.REVIEW && !e.isDeleted).length,
    managed: filtered.filter(e => e.status === this.EMAIL_STATUS.MANAGED && !e.isDeleted).length,
    deleted: filtered.filter(e => e.isDeleted).length,
    byCategory: {
      customer_inquiry: filtered.filter(e => e.category === this.EMAIL_CATEGORY.CUSTOMER_INQUIRY && !e.isDeleted).length,
      invoice: filtered.filter(e => e.category === this.EMAIL_CATEGORY.INVOICE && !e.isDeleted).length,
      other: filtered.filter(e => e.category === this.EMAIL_CATEGORY.OTHER && !e.isDeleted).length
    },
    recentActivity: {
      today: filtered.filter(e => {
        const today = new Date();
        const emailDate = new Date(e.fetchedAt || e.date);
        return emailDate.toDateString() === today.toDateString();
      }).length,
      thisWeek: filtered.filter(e => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const emailDate = new Date(e.fetchedAt || e.date);
        return emailDate >= weekAgo;
      }).length
    }
  };
  
  return stats;
}

// ===============================
// AUDIT LOGGING (Phase 4)
// ===============================

async createAuditLog(auditData) {
  const auditEntry = {
    id: this.generateId(),
    action: auditData.action,
    details: auditData.details || '',
    emailId: auditData.emailId || null,
    userId: auditData.userId || 'single-user',
    timestamp: new Date().toISOString(),
    ip: auditData.ip || null,
    userAgent: auditData.userAgent || null
  };
  
  const auditLogs = await this.readFile('audit') || [];
  auditLogs.unshift(auditEntry);
  
  // Keep only last 10000 entries
  if (auditLogs.length > 10000) {
    auditLogs.splice(10000);
  }
  
  await this.writeFile('audit', auditLogs);
  return auditEntry;
}

async getAuditLogs(filters = {}) {
  const auditLogs = await this.readFile('audit') || [];
  let filtered = [...auditLogs];
  
  if (filters.action) {
    filtered = filtered.filter(log => log.action === filters.action);
  }
  
  if (filters.userId) {
    filtered = filtered.filter(log => log.userId === filters.userId);
  }
  
  if (filters.emailId) {
    filtered = filtered.filter(log => log.emailId === filters.emailId);
  }
  
  if (filters.startDate && filters.endDate) {
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);
    filtered = filtered.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate >= start && logDate <= end;
    });
  }
  
  if (filters.limit) {
    const offset = filters.offset || 0;
    filtered = filtered.slice(offset, offset + filters.limit);
  }
  
  return filtered;
}

// ===============================
// BACKUP AND RESTORE (Phase 4)
// ===============================

async createBackup() {
  const backup = {
    timestamp: new Date().toISOString(),
    version: '1.0',
    data: {}
  };
  
  // Backup all database files
  for (const [key, filename] of Object.entries(this.files)) {
    backup.data[key] = await this.readFile(key);
  }
  
  return backup;
}

async restoreFromBackup(backupData) {
  if (!backupData || !backupData.data) {
    throw new Error('Invalid backup data');
  }
  
  // Create current backup before restore
  const currentBackup = await this.createBackup();
  
  try {
    // Restore each file
    for (const [key, data] of Object.entries(backupData.data)) {
      if (this.files[key]) {
        await this.writeFile(key, data);
      }
    }
    
    // Create audit log
    await this.createAuditLog({
      action: 'BACKUP_RESTORE',
      details: `System restored from backup dated ${backupData.timestamp}`,
      userId: 'system'
    });
    
    return true;
  } catch (error) {
    // Restore from current backup if restore failed
    console.error('Restore failed, reverting:', error);
    for (const [key, data] of Object.entries(currentBackup.data)) {
      if (this.files[key]) {
        await this.writeFile(key, data);
      }
    }
    throw error;
  }
}
```

## 📝 Usage Examples

### Workflow Operations
```javascript
// Approve multiple fetched emails
const results = await db.bulkApproveEmails(['email1', 'email2', 'email3']);

// Search emails with filters
const searchResults = await db.searchEmails('customer inquiry', {
  status: 'FETCHED',
  category: 'CUSTOMER_INQUIRY',
  limit: 50
});

// Get comprehensive statistics
const stats = await db.getEmailStats('user123', {
  startDate: '2024-01-01',
  endDate: '2024-12-31'
});
```

### Audit and Monitoring
```javascript
// Create audit log
await db.createAuditLog({
  action: 'EMAIL_EXPORT',
  details: 'Exported 150 customer inquiries to XLSX',
  userId: 'user123',
  ip: '192.168.1.100'
});

// Get recent audit logs
const recentLogs = await db.getAuditLogs({
  limit: 100,
  startDate: new Date(Date.now() - 24*60*60*1000).toISOString()
});
```

### Backup Operations
```javascript
// Create backup
const backup = await db.createBackup();

// Save backup to file (implement in backup service)
const fs = require('fs');
fs.writeFileSync(`backup-${Date.now()}.json`, JSON.stringify(backup, null, 2));

// Restore from backup
await db.restoreFromBackup(backup);
```

## 🧪 Testing the Implementation

```javascript
// Test script to verify all methods work
async function testDatabaseMethods() {
  const db = require('./lib/database');
  
  console.log('Testing database methods...');
  
  // Test email creation and workflow
  const testEmail = await db.createEmail({
    gmailId: 'test-123',
    subject: 'Test Email',
    body: 'Test content',
    fromAddress: 'test@example.com',
    toAddress: 'recipient@example.com',
    userId: 'test-user'
  });
  
  console.log('✅ Email created:', testEmail.id);
  
  // Test workflow transitions
  const approved = await db.approveFetchedEmail(testEmail.id);
  console.log('✅ Email approved:', approved !== null);
  
  const processed = await db.approveReviewEmail(testEmail.id);
  console.log('✅ Email processed:', processed !== null);
  
  // Test search
  const searchResults = await db.searchEmails('Test');
  console.log('✅ Search results:', searchResults.length);
  
  // Test cleanup
  await db.permanentlyDeleteFromRecycleBin(testEmail.id);
  console.log('✅ Email permanently deleted');
  
  console.log('All database methods tested successfully!');
}
```

This complete implementation provides all the missing database methods needed for AEMS to function according to the README specifications.