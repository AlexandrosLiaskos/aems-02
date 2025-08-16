/**
 * Audit Logger Module
 * Tracks all critical state changes and security-related events
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class AuditLogger {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    this.auditFile = path.join(this.logDir, 'audit.log');
    this.securityFile = path.join(this.logDir, 'security.log');
    this.errorFile = path.join(this.logDir, 'error.log');
    this.init();
  }

  async init() {
    // Ensure log directory exists
    try {
      await fs.access(this.logDir);
    } catch (error) {
      await fs.mkdir(this.logDir, { recursive: true });
    }

    // Initialize log files if they don't exist
    const files = [this.auditFile, this.securityFile, this.errorFile];
    for (const file of files) {
      try {
        await fs.access(file);
      } catch (error) {
        await fs.writeFile(file, '');
      }
    }
  }

  /**
   * Generate a unique event ID for tracking
   */
  generateEventId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Format log entry with timestamp and structure
   */
  formatLogEntry(eventType, eventData, metadata = {}) {
    const entry = {
      eventId: this.generateEventId(),
      timestamp: new Date().toISOString(),
      eventType,
      eventData,
      metadata: {
        ...metadata,
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid
      }
    };

    return JSON.stringify(entry) + '\n';
  }

  /**
   * Write to log file with rotation check
   */
  async writeToLog(filepath, entry) {
    try {
      // Ensure the file exists first
      try {
        await fs.access(filepath);
      } catch (e) {
        // File doesn't exist, create it
        await fs.writeFile(filepath, '');
      }
      
      // Check file size and rotate if needed (10MB limit)
      const stats = await fs.stat(filepath);
      if (stats.size > 10 * 1024 * 1024) {
        await this.rotateLog(filepath);
      }

      // Append to log file
      await fs.appendFile(filepath, entry);
    } catch (error) {
      console.error(`Failed to write to log ${filepath}:`, error);
    }
  }

  /**
   * Rotate log file when it gets too large
   */
  async rotateLog(filepath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedPath = `${filepath}.${timestamp}`;
    
    try {
      await fs.rename(filepath, rotatedPath);
      await fs.writeFile(filepath, '');
      
      // Keep only last 5 rotated logs
      await this.cleanupOldLogs(filepath);
    } catch (error) {
      console.error('Failed to rotate log:', error);
    }
  }

  /**
   * Clean up old rotated log files
   */
  async cleanupOldLogs(baseFilepath) {
    try {
      const dir = path.dirname(baseFilepath);
      const basename = path.basename(baseFilepath);
      const files = await fs.readdir(dir);
      
      const rotatedFiles = files
        .filter(f => f.startsWith(basename + '.'))
        .sort()
        .reverse();
      
      // Remove logs beyond the 5 most recent
      for (let i = 5; i < rotatedFiles.length; i++) {
        await fs.unlink(path.join(dir, rotatedFiles[i]));
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }

  // ======================
  // AUDIT LOGGING METHODS
  // ======================

  /**
   * Log email state transitions
   */
  async logEmailStateChange(emailId, fromState, toState, userId, additionalData = {}) {
    const entry = this.formatLogEntry('EMAIL_STATE_CHANGE', {
      emailId,
      fromState,
      toState,
      userId,
      ...additionalData
    });
    
    await this.writeToLog(this.auditFile, entry);
  }

  /**
   * Log email categorization changes
   */
  async logCategoryChange(emailId, fromCategory, toCategory, userId, method = 'manual') {
    const entry = this.formatLogEntry('CATEGORY_CHANGE', {
      emailId,
      fromCategory,
      toCategory,
      userId,
      method // 'manual', 'ai', 'bulk'
    });
    
    await this.writeToLog(this.auditFile, entry);
  }

  /**
   * Log data extraction events
   */
  async logDataExtraction(emailId, extractionType, success, extractedFields = {}) {
    const entry = this.formatLogEntry('DATA_EXTRACTION', {
      emailId,
      extractionType, // 'customer_inquiry', 'invoice'
      success,
      fieldsExtracted: Object.keys(extractedFields).filter(k => extractedFields[k] !== null),
      fieldCount: Object.values(extractedFields).filter(v => v !== null).length
    });
    
    await this.writeToLog(this.auditFile, entry);
  }

  /**
   * Log bulk operations
   */
  async logBulkOperation(operation, emailCount, successCount, errorCount, userId) {
    const entry = this.formatLogEntry('BULK_OPERATION', {
      operation, // 'approve', 'decline', 'delete', etc.
      emailCount,
      successCount,
      errorCount,
      userId,
      successRate: emailCount > 0 ? (successCount / emailCount * 100).toFixed(2) + '%' : '0%'
    });
    
    await this.writeToLog(this.auditFile, entry);
  }

  /**
   * Log data exports
   */
  async logDataExport(exportType, recordCount, userId, format = 'xlsx') {
    const entry = this.formatLogEntry('DATA_EXPORT', {
      exportType, // 'managed_emails', 'processed_emails'
      recordCount,
      format,
      userId
    });
    
    await this.writeToLog(this.auditFile, entry);
  }

  // ======================
  // SECURITY LOGGING METHODS
  // ======================

  /**
   * Log authentication events
   */
  async logAuthentication(eventType, userId, success, metadata = {}) {
    const entry = this.formatLogEntry('AUTHENTICATION', {
      eventType, // 'login', 'logout', 'token_refresh'
      userId,
      success,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent
    });
    
    await this.writeToLog(this.securityFile, entry);
  }

  /**
   * Log authorization failures
   */
  async logAuthorizationFailure(userId, resource, action, reason) {
    const entry = this.formatLogEntry('AUTHORIZATION_FAILURE', {
      userId,
      resource,
      action,
      reason
    });
    
    await this.writeToLog(this.securityFile, entry);
  }

  /**
   * Log rate limit violations
   */
  async logRateLimitViolation(ipAddress, endpoint, limit) {
    const entry = this.formatLogEntry('RATE_LIMIT_VIOLATION', {
      ipAddress,
      endpoint,
      limit,
      timestamp: new Date().toISOString()
    });
    
    await this.writeToLog(this.securityFile, entry);
  }

  /**
   * Log input validation failures
   */
  async logValidationFailure(endpoint, validationType, invalidData, ipAddress) {
    const entry = this.formatLogEntry('VALIDATION_FAILURE', {
      endpoint,
      validationType,
      invalidDataSummary: this.sanitizeForLog(invalidData),
      ipAddress
    });
    
    await this.writeToLog(this.securityFile, entry);
  }

  /**
   * Log CSRF token failures
   */
  async logCSRFFailure(ipAddress, endpoint, userAgent) {
    const entry = this.formatLogEntry('CSRF_FAILURE', {
      ipAddress,
      endpoint,
      userAgent
    });
    
    await this.writeToLog(this.securityFile, entry);
  }

  // ======================
  // ERROR LOGGING METHODS
  // ======================

  /**
   * Log application errors
   */
  async logError(errorType, error, context = {}) {
    const entry = this.formatLogEntry('APPLICATION_ERROR', {
      errorType,
      message: error.message,
      stack: error.stack,
      context
    });
    
    await this.writeToLog(this.errorFile, entry);
  }

  /**
   * Log API failures
   */
  async logAPIFailure(service, endpoint, error, retryCount = 0) {
    const entry = this.formatLogEntry('API_FAILURE', {
      service, // 'gmail', 'openai'
      endpoint,
      error: error.message,
      statusCode: error.response?.status,
      retryCount
    });
    
    await this.writeToLog(this.errorFile, entry);
  }

  /**
   * Log database errors
   */
  async logDatabaseError(operation, error, details = {}) {
    const entry = this.formatLogEntry('DATABASE_ERROR', {
      operation,
      error: error.message,
      details
    });
    
    await this.writeToLog(this.errorFile, entry);
  }

  // ======================
  // UTILITY METHODS
  // ======================

  /**
   * Sanitize sensitive data before logging
   */
  sanitizeForLog(data) {
    if (typeof data === 'string') {
      // Truncate long strings
      return data.length > 100 ? data.substring(0, 100) + '...' : data;
    }
    
    if (typeof data === 'object' && data !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(data)) {
        // Redact sensitive fields
        if (['password', 'token', 'apiKey', 'secret'].some(s => key.toLowerCase().includes(s))) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'string' && value.length > 100) {
          sanitized[key] = value.substring(0, 100) + '...';
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }
    
    return data;
  }

  /**
   * Get recent audit entries
   */
  async getRecentAuditEntries(count = 100) {
    try {
      const content = await fs.readFile(this.auditFile, 'utf8');
      const lines = content.trim().split('\n').filter(line => line);
      const recent = lines.slice(-count);
      
      return recent.map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      }).filter(entry => entry !== null);
    } catch (error) {
      console.error('Failed to read audit log:', error);
      return [];
    }
  }

  /**
   * Get security events for monitoring
   */
  async getSecurityEvents(since = null) {
    try {
      const content = await fs.readFile(this.securityFile, 'utf8');
      const lines = content.trim().split('\n').filter(line => line);
      
      const events = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      }).filter(entry => entry !== null);
      
      if (since) {
        const sinceDate = new Date(since);
        return events.filter(e => new Date(e.timestamp) > sinceDate);
      }
      
      return events;
    } catch (error) {
      console.error('Failed to read security log:', error);
      return [];
    }
  }

  /**
   * Generate audit report
   */
  async generateAuditReport(startDate, endDate) {
    const entries = await this.getRecentAuditEntries(10000); // Get more entries for reporting
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const filtered = entries.filter(e => {
      const date = new Date(e.timestamp);
      return date >= start && date <= end;
    });
    
    // Group by event type
    const summary = {};
    filtered.forEach(entry => {
      if (!summary[entry.eventType]) {
        summary[entry.eventType] = {
          count: 0,
          events: []
        };
      }
      summary[entry.eventType].count++;
      summary[entry.eventType].events.push(entry);
    });
    
    return {
      period: { startDate, endDate },
      totalEvents: filtered.length,
      eventTypes: Object.keys(summary),
      summary,
      events: filtered
    };
  }
}

module.exports = new AuditLogger();
