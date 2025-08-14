# Security Implementation Guide

## 🔒 Comprehensive Security Implementation

This document details all security measures that need to be implemented for AEMS according to README specifications.

## 🎯 Security Requirements Overview

### Core Security Features (from README)
- Session-based authentication with configurable timeout
- Input validation and sanitization for all user inputs
- XSS/CSRF protection with specific implementations
- Content Security Policy (CSP) headers
- HTML entity encoding for email content display
- CSRF tokens for state-changing operations
- Comprehensive audit logging

## 📋 Phase-by-Phase Security Implementation

### Phase 1: Critical Security (Immediate)

#### 1.1 Session Timeout Middleware

**Add to `server.js`:**

```javascript
// Session timeout middleware
const sessionTimeout = (req, res, next) => {
  const timeout = process.env.SESSION_TIMEOUT || 3600000; // 1 hour default
  
  if (!req.session) {
    return next();
  }
  
  const now = Date.now();
  
  // Initialize lastActivity on first request
  if (!req.session.lastActivity) {
    req.session.lastActivity = now;
    return next();
  }
  
  // Check if session has timed out
  if (now - req.session.lastActivity > timeout) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
      }
      return res.status(401).json({ 
        error: 'Session expired',
        code: 'SESSION_TIMEOUT',
        redirectTo: '/auth/login'
      });
    });
    return;
  }
  
  // Update last activity
  req.session.lastActivity = now;
  next();
};

// Apply to all API routes
app.use('/api', sessionTimeout);
```

#### 1.2 CSRF Protection Implementation

**Install required packages:**
```bash
npm install csurf helmet express-rate-limit express-validator dompurify
```

**Add to `server.js`:**

```javascript
const csrf = require('csurf');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// CSRF Protection
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

// Apply CSRF protection to state-changing routes
if (process.env.ENABLE_CSRF_PROTECTION === 'true') {
  app.use('/api', csrfProtection);
}

// Make CSRF token available to templates
app.use((req, res, next) => {
  if (req.csrfToken) {
    res.locals.csrfToken = req.csrfToken();
  }
  next();
});

// CSRF token endpoint
app.get('/api/csrf-token', (req, res) => {
  res.json({ 
    csrfToken: req.csrfToken ? req.csrfToken() : null 
  });
});
```

#### 1.3 Security Headers with Helmet

```javascript
// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", // Allow inline styles for now
        "https://cdnjs.cloudflare.com",
        "https://fonts.googleapis.com"
      ],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Remove in production
        "https://cdnjs.cloudflare.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://cdnjs.cloudflare.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https:"
      ],
      connectSrc: [
        "'self'",
        "https://api.openai.com"
      ]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

### Phase 2: Input Validation & Sanitization

#### 2.1 Input Validation Middleware

**Create `lib/security.js`:**

```javascript
const { body, param, query, validationResult } = require('express-validator');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

class SecurityService {
  // Validation rules for different data types
  static emailValidation() {
    return [
      body('subject')
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Subject must be between 1 and 200 characters')
        .escape(),
      
      body('body')
        .trim()
        .isLength({ max: 10000 })
        .withMessage('Body must not exceed 10000 characters')
        .customSanitizer(value => this.sanitizeHTML(value)),
      
      body('fromAddress')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Invalid from address'),
      
      body('toAddress')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Invalid to address')
    ];
  }

  static extractedDataValidation() {
    return [
      body('customerName')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .escape(),
      
      body('customerEmail')
        .optional()
        .trim()
        .isEmail()
        .normalizeEmail(),
      
      body('customerPhone')
        .optional()
        .trim()
        .isMobilePhone('any', { strictMode: false }),
      
      body('company')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .escape(),
      
      body('invoiceAmount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Invoice amount must be a positive number'),
      
      body('invoiceVAT')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('VAT must be a positive number')
    ];
  }

  static settingsValidation() {
    return [
      body('syncInterval')
        .optional()
        .isInt({ min: 1, max: 60 })
        .withMessage('Sync interval must be between 1 and 60 minutes'),
      
      body('autoSync')
        .optional()
        .isBoolean()
        .withMessage('Auto sync must be boolean'),
      
      body('notifications')
        .optional()
        .isBoolean()
        .withMessage('Notifications must be boolean'),
      
      body('sessionTimeout')
        .optional()
        .isInt({ min: 300000, max: 86400000 })
        .withMessage('Session timeout must be between 5 minutes and 24 hours')
    ];
  }

  static paramValidation() {
    return [
      param('id')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .isLength({ min: 1, max: 50 })
        .withMessage('Invalid ID format')
    ];
  }

  static queryValidation() {
    return [
      query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
      
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
      
      query('search')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .escape()
    ];
  }

  // HTML sanitization
  static sanitizeHTML(input) {
    if (!input || typeof input !== 'string') {
      return input;
    }
    
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li'],
      ALLOWED_ATTR: []
    });
  }

  // General input sanitization
  static sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }
    
    // Remove potentially dangerous characters
    return input
      .replace(/[<>'"]/g, '') // Remove HTML/script characters
      .replace(/javascript:/gi, '') // Remove javascript protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  // Validation error handler middleware
  static handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  }

  // Rate limiting configurations
  static createRateLimit(windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests') {
    return rateLimit({
      windowMs,
      max,
      message: {
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({
          error: message,
          retryAfter: Math.ceil(windowMs / 1000),
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  // Specific rate limits
  static apiRateLimit = this.createRateLimit(15 * 60 * 1000, 100, 'Too many API requests');
  static authRateLimit = this.createRateLimit(15 * 60 * 1000, 5, 'Too many authentication attempts');
  static syncRateLimit = this.createRateLimit(5 * 60 * 1000, 10, 'Too many sync requests');
  static aiRateLimit = this.createRateLimit(60 * 1000, 20, 'Too many AI processing requests');
}

module.exports = SecurityService;
```

#### 2.2 Apply Validation to Routes

**Update `server.js` routes:**

```javascript
const SecurityService = require('./lib/security');

// Apply rate limiting
app.use('/api', SecurityService.apiRateLimit);
app.use('/auth', SecurityService.authRateLimit);
app.use('/api/emails/sync', SecurityService.syncRateLimit);
app.use('/api/emails/*/process', SecurityService.aiRateLimit);

// Email routes with validation
app.post('/api/emails/fetched/:id/approve', 
  SecurityService.paramValidation(),
  SecurityService.handleValidationErrors,
  async (req, res) => {
    // Route implementation
  }
);

app.put('/api/emails/review/:id',
  SecurityService.paramValidation(),
  SecurityService.extractedDataValidation(),
  SecurityService.handleValidationErrors,
  async (req, res) => {
    // Route implementation
  }
);

app.put('/api/settings',
  SecurityService.settingsValidation(),
  SecurityService.handleValidationErrors,
  async (req, res) => {
    // Route implementation
  }
);
```

### Phase 3: Audit Logging System

#### 3.1 Audit Logging Service

**Create `lib/audit.js`:**

```javascript
const db = require('./database');
const os = require('os');

class AuditService {
  static async log(action, details, req, additionalData = {}) {
    try {
      const auditData = {
        action,
        details,
        userId: req.session?.userId || 'anonymous',
        ip: this.getClientIP(req),
        userAgent: req.get('User-Agent') || '',
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString(),
        hostname: os.hostname(),
        ...additionalData
      };

      await db.createAuditLog(auditData);
      
      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 AUDIT: ${action} - ${details}`);
      }
    } catch (error) {
      console.error('❌ Audit logging failed:', error);
      // Don't throw - audit logging shouldn't break the application
    }
  }

  static getClientIP(req) {
    return req.ip || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress ||
           req.headers['x-forwarded-for']?.split(',')[0] ||
           'unknown';
  }

  // Specific audit log methods
  static async logAuthentication(action, userId, req, success = true) {
    await this.log(`AUTH_${action.toUpperCase()}`, 
      `User ${userId} ${action} ${success ? 'successful' : 'failed'}`, 
      req, 
      { userId, success }
    );
  }

  static async logEmailOperation(action, emailId, req, details = '') {
    await this.log(`EMAIL_${action.toUpperCase()}`, 
      `Email ${emailId} ${action.toLowerCase()} ${details}`, 
      req, 
      { emailId }
    );
  }

  static async logDataOperation(action, req, details = '', count = null) {
    await this.log(`DATA_${action.toUpperCase()}`, 
      details || `Data ${action.toLowerCase()} operation`, 
      req, 
      { recordCount: count }
    );
  }

  static async logSecurityEvent(event, severity, req, details = '') {
    await this.log(`SECURITY_${event.toUpperCase()}`, 
      details, 
      req, 
      { severity, securityEvent: true }
    );
  }

  static async logSystemEvent(event, details, additionalData = {}) {
    const fakeReq = {
      method: 'SYSTEM',
      path: '/system',
      ip: 'system',
      get: () => 'System Process'
    };

    await this.log(`SYSTEM_${event.toUpperCase()}`, 
      details, 
      fakeReq, 
      { systemEvent: true, ...additionalData }
    );
  }
}

module.exports = AuditService;
```

#### 3.2 Audit Middleware

**Create audit middleware in `server.js`:**

```javascript
const AuditService = require('./lib/audit');

// Audit middleware for all API routes
const auditMiddleware = (req, res, next) => {
  // Store original json method
  const originalJson = res.json;
  
  // Override json method to capture response
  res.json = function(data) {
    // Log successful operations
    if (res.statusCode < 400) {
      // Determine action based on method and path
      let action = 'UNKNOWN';
      if (req.method === 'POST' && req.path.includes('approve')) action = 'APPROVE';
      else if (req.method === 'POST' && req.path.includes('sync')) action = 'SYNC';
      else if (req.method === 'PUT') action = 'UPDATE';
      else if (req.method === 'DELETE') action = 'DELETE';
      else if (req.method === 'GET' && req.path.includes('export')) action = 'EXPORT';
      
      if (action !== 'UNKNOWN') {
        AuditService.log(action, `API ${req.method} ${req.path}`, req);
      }
    } else {
      // Log errors
      AuditService.logSecurityEvent(
        'API_ERROR',
        'high',
        req,
        `${req.method} ${req.path} returned ${res.statusCode}`
      );
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

// Apply audit middleware
app.use('/api', auditMiddleware);
```

### Phase 4: Frontend Security

#### 4.1 CSRF Token Handling in Frontend

**Add to `public/js/security.js`:**

```javascript
class SecurityManager {
  constructor() {
    this.csrfToken = null;
    this.init();
  }

  async init() {
    await this.fetchCSRFToken();
    this.bindSecurityEvents();
  }

  async fetchCSRFToken() {
    try {
      const response = await fetch('/api/csrf-token');
      const data = await response.json();
      this.csrfToken = data.csrfToken;
    } catch (error) {
      console.error('Failed to fetch CSRF token:', error);
    }
  }

  // Add CSRF token to all POST/PUT/DELETE requests
  async secureRequest(url, options = {}) {
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...(this.csrfToken && { 'X-CSRF-Token': this.csrfToken }),
        ...options.headers
      },
      credentials: 'same-origin',
      ...options
    };

    try {
      const response = await fetch(url, defaultOptions);
      
      // Handle CSRF token refresh
      if (response.status === 403 && response.headers.get('X-CSRF-Token')) {
        this.csrfToken = response.headers.get('X-CSRF-Token');
        // Retry request with new token
        defaultOptions.headers['X-CSRF-Token'] = this.csrfToken;
        return fetch(url, defaultOptions);
      }
      
      return response;
    } catch (error) {
      console.error('Secure request failed:', error);
      throw error;
    }
  }

  // Input sanitization for frontend
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }

  // Validate email addresses
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validate phone numbers (basic)
  isValidPhone(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  }

  bindSecurityEvents() {
    // Prevent form submission without CSRF token
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (form.method.toLowerCase() !== 'get' && !this.csrfToken) {
        e.preventDefault();
        console.error('Cannot submit form without CSRF token');
        return false;
      }
    });
    
    // Sanitize all form inputs on submit
    document.addEventListener('submit', (e) => {
      const form = e.target;
      const inputs = form.querySelectorAll('input[type="text"], textarea');
      
      inputs.forEach(input => {
        input.value = this.sanitizeInput(input.value);
      });
    });
  }
}

// Initialize security manager
document.addEventListener('DOMContentLoaded', () => {
  window.securityManager = new SecurityManager();
});
```

#### 4.2 Content Security Policy for Email Content

**Add to email display components:**

```javascript
class EmailContentRenderer {
  static sanitizeEmailContent(htmlContent) {
    // Use DOMPurify if available, otherwise fallback
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(htmlContent, {
        ALLOWED_TAGS: ['p', 'br', 'div', 'span', 'strong', 'em', 'u', 'ol', 'ul', 'li', 'a'],
        ALLOWED_ATTR: ['href', 'class', 'style'],
        ALLOW_DATA_ATTR: false
      });
    }
    
    // Fallback sanitization
    const div = document.createElement('div');
    div.innerHTML = htmlContent;
    
    // Remove dangerous elements
    const dangerousElements = div.querySelectorAll('script, iframe, object, embed, form');
    dangerousElements.forEach(el => el.remove());
    
    // Remove dangerous attributes
    const allElements = div.querySelectorAll('*');
    allElements.forEach(el => {
      const attrs = el.attributes;
      for (let i = attrs.length - 1; i >= 0; i--) {
        const attr = attrs[i];
        if (attr.name.startsWith('on') || attr.name === 'javascript:') {
          el.removeAttribute(attr.name);
        }
      }
    });
    
    return div.innerHTML;
  }

  static renderEmailContent(container, content) {
    const sanitizedContent = this.sanitizeEmailContent(content);
    container.innerHTML = sanitizedContent;
    
    // Make all links open in new tab and add security attributes
    const links = container.querySelectorAll('a');
    links.forEach(link => {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });
  }
}
```

## 🛡️ Additional Security Measures

### Environment Variable Security

**Update `.env` handling:**

```javascript
// Validate environment variables on startup
function validateEnvironment() {
  const required = [
    'OPENAI_API_KEY',
    'GOOGLE_CLIENT_ID', 
    'GOOGLE_CLIENT_SECRET',
    'SESSION_SECRET'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing);
    process.exit(1);
  }
  
  // Validate SESSION_SECRET strength
  if (process.env.SESSION_SECRET.length < 32) {
    console.warn('⚠️ SESSION_SECRET should be at least 32 characters long');
  }
  
  console.log('✅ Environment validation passed');
}

validateEnvironment();
```

### File Upload Security

**For import functionality:**

```javascript
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Only allow specific file types
    const allowedTypes = ['application/json', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  },
  filename: (req, file, cb) => {
    // Generate secure filename
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});
```

## 📊 Security Monitoring

**Add security monitoring to audit logs:**

```javascript
// Monitor failed authentication attempts
let authAttempts = new Map();

app.post('/auth/*', (req, res, next) => {
  const ip = AuditService.getClientIP(req);
  const attempts = authAttempts.get(ip) || 0;
  
  if (attempts > 5) {
    AuditService.logSecurityEvent('AUTH_BLOCKED', 'critical', req, 
      `IP ${ip} blocked after ${attempts} failed attempts`);
    return res.status(429).json({ error: 'Too many failed attempts' });
  }
  
  next();
});

// Track suspicious patterns
app.use((req, res, next) => {
  // Log suspicious user agents
  const userAgent = req.get('User-Agent') || '';
  if (userAgent.includes('bot') || userAgent.includes('crawler')) {
    AuditService.logSecurityEvent('SUSPICIOUS_AGENT', 'medium', req, 
      `Bot/crawler detected: ${userAgent}`);
  }
  
  // Log unusual request patterns
  if (req.path.includes('..') || req.path.includes('<script>')) {
    AuditService.logSecurityEvent('PATH_TRAVERSAL_ATTEMPT', 'high', req, 
      `Suspicious path: ${req.path}`);
  }
  
  next();
});
```

## ✅ Security Implementation Checklist

### Phase 1 (Critical)
- [ ] Session timeout middleware
- [ ] CSRF protection for all state-changing operations
- [ ] Security headers with Helmet
- [ ] Basic rate limiting
- [ ] Environment variable validation

### Phase 2 (Essential)
- [ ] Comprehensive input validation
- [ ] HTML sanitization for email content
- [ ] Audit logging system
- [ ] Frontend security utilities
- [ ] File upload security

### Phase 3 (Advanced)
- [ ] Security monitoring and alerting
- [ ] Content Security Policy refinement
- [ ] Advanced rate limiting strategies
- [ ] Security testing implementation
- [ ] Regular security audits

### Phase 4 (Production)
- [ ] Security hardening checklist
- [ ] Penetration testing
- [ ] Security documentation
- [ ] Incident response procedures
- [ ] Regular security updates

This comprehensive security implementation ensures AEMS meets enterprise-grade security standards while maintaining usability.