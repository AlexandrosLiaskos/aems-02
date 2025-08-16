# Agentic Email Management System (AEMS)

A management system that leverages AI to automatically categorize, extract, and manage email data from Gmail accounts. Built with Node.js, Express, and vanilla JavaScript, AEMS provides a secure, single-user solution for intelligent email processing.

## 📋 Table of Contents

- [✨ Features](#✨-features)
- [💻 System Requirements](#💻-system-requirements)
- [🏗️ Architecture Overview](#️🏗️-architecture-overview)
- [🚀 Installation](#🚀-installation)
- [⚙️ Configuration](#️⚙️-configuration)
- [📖 Usage](#📖-usage)
- [🔌 API Documentation](#🔌-api-documentation)
- [🔒 Security](#🔒-security)
- [🐛 Troubleshooting](#🐛-troubleshooting)
- [👨‍💻 Development](#️👨‍💻-development)
- [📚 Additional Resources](#📚-additional-resources)
- [📝 Changelog](#📝-changelog)
- [📄 License](#📄-license)

## ✨ Features

- ✅ **Gmail Integration**: OAuth2-based secure Gmail connection with automatic token refresh
- ✅ **AI-Powered Categorization**: Automatic email classification using OpenAI GPT-3.5 with LangChain
- ✅ **Multi-language Support**: English and Greek language processing with bilingual AI extraction
- ✅ **Three-Stage Workflow**: Fetched → Review → Managed email pipeline
- ✅ **Intelligent Data Extraction**: AI-powered extraction of customer and invoice information
- ✅ **Bulk Operations**: Process multiple emails simultaneously with batch approvals/declines
- ✅ **Advanced Export/Import**: XLSX data export with multi-tab support by category
- ✅ **Real-time Notifications**: New Emails fetched real-time notifications
- ✅ **Recycle Bin**: Soft delete with recovery options and permanent deletion
- ✅ **PDF Content Processing**: AI data extraction from PDF attachments (invoices, documents)
- ✅ **Enhanced Session Management**: Configurable timeouts with secure cookie handling
- ✅ **Multi-layer Rate Limiting**: Endpoint-specific protection with adaptive limits
- ✅ **Advanced Input Sanitization**: DOMPurify-based XSS protection with validation middleware
- ✅ **CSRF Protection**: Token-based state change protection in all environments
- ✅ **Nonce-based CSP**: Cryptographically secure Content Security Policy implementation
- ✅ **XSS Prevention**: Complete elimination of unsafe inline scripts and event handlers
- ✅ **Database Security**: File locking mechanisms and atomic operations
- ✅ **Audit Logging**: Security events, state changes, and error tracking
- ✅ **Request/Response Logging**: Detailed HTTP transaction logging with performance metrics
- ✅ **Progress Indicators**: Real-time loading states for all email processing operations with spinner animations
- ✅ **Historical Email Sync**: "Sync Old" functionality to fetch emails from specific date ranges
- ✅ **Health Monitoring**: Comprehensive system health checks and performance metrics
- ✅ **Retry Logic**: Robust error handling with exponential backoff and circuit breaker patterns
- ✅ **Advanced Caching**: Client-side API response caching and resource optimization
- ✅ **Automated Backup System**: Scheduled backups with retention policies and integrity verification
- ✅ **AI Cost Control**: Usage tracking, daily limits, and intelligent batch processing
- ✅ **Memory Management**: Automatic cleanup, leak prevention, and resource optimization

## 💻 System Requirements

### Prerequisites
- **Node.js**: v14.0.0 or higher (v18.x recommended)
- **npm**: v6.0.0 or higher
- **Operating System**: Windows, macOS, or Linux
- **Memory**: Minimum 1+GB RAM
- **Storage**: 100+MB
- **Browser**: Chrome, Firefox, Safari, or Edge

### External Services
- **Gmail Account**: Required for email fetching
- **Google Cloud Console Account**: For OAuth2 credentials
- **OpenAI API Account**: For AI processing features

## 🏗️ Architecture Overview

### Backend Architecture
- **Server**: Node.js Express server
- **Database**: Modular JSON file storage system (single-user design)
- **Authentication**: Google OAuth2 for Gmail access, session-based app authentication
- **AI Processing**: OpenAI GPT-3.5-turbo with LangChain integration
- **PDF Processing**: pdf-parse library for extracting text content from PDF attachments
- **Task Scheduling**: node-cron for automated sync operations

### Frontend Architecture
- **Framework**: Vanilla HTML/CSS/JavaScript (no framework dependencies)
- **Design System**: Minimalist black/white theme with modern aesthetics
- **UI Components**: Custom components inspired by ShadCN design patterns
- **Layout**: Responsive design with cross-platform compatibility
- **Icons**: Font Awesome 6.0

### Data Storage Structure
```
data/
├── emails/
│   ├── fetched/        # Newly fetched emails
│   │   ├── customer-inquiries.json
│   │   ├── invoices.json
│   │   └── other.json
│   ├── review/         # Emails pending review
│   │   ├── customer-inquiries.json
│   │   ├── invoices.json
│   │   └── other.json
│   ├── managed/        # Processed emails
│   │   ├── customer-inquiries.json
│   │   ├── invoices.json
│   │   └── other.json
│   └── deleted/        # Soft-deleted emails
│       └── all.json
├── extracted-data/     # AI-extracted information
│   ├── customer-inquiries.json
│   └── invoices.json
├── attachments/        # Email attachments
│   └── all.json
├── notifications/      # System notifications
│   └── all.json
├── settings.json       # Application settings
└── users.json         # User authentication data
```

## 🚀 Installation

### Step 1: Clone the Repository
```bash
git clone https://github.com/your-username/aems-02.git
cd aems-02
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Set Up Environment Variables
```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your credentials
nano .env  # or use your preferred editor
```

### Step 4: Configure Google OAuth2

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API:
   - Navigate to "APIs & Services" → "Library"
   - Search for "Gmail API" and enable it
4. Create OAuth2 credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Choose "Web application"
   - Add authorized redirect URI: `http://localhost:3000/auth/google/callback`
5. Copy Client ID and Client Secret to `.env`

### Step 5: Configure OpenAI API

1. Sign up at [OpenAI Platform](https://platform.openai.com/)
2. Navigate to API Keys section
3. Create a new API key
4. Copy the key to `OPENAI_API_KEY` in `.env`

### Step 6: Start the Application
```bash
# Production mode
npm start

# Development mode with auto-reload
npm run dev
```

The application will be available at `http://localhost:3000`

## ⚙️ Configuration

### Essential Environment Variables

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here

# Google OAuth2
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URL=http://localhost:3000/auth/google/callback

# Server Settings
PORT=3000
SESSION_SECRET=generate-secure-random-string-at-least-32-characters
SESSION_TIMEOUT=3600000  # 1 hour in milliseconds

# Gmail API Settings
MAX_EMAILS_PER_SYNC=50
SYNC_INTERVAL_MINUTES=5

# AI Processing
AI_BATCH_SIZE=5
AI_BATCH_DELAY=1000
AI_DAILY_REQUEST_LIMIT=1000
AI_EXTRACTION_DAILY_LIMIT=500
AI_EXTRACTION_BATCH_SIZE=2
AI_EXTRACTION_BATCH_DELAY=3000

# Backup Configuration
MAX_BACKUPS=7
BACKUP_INTERVAL_HOURS=24

# Security Settings
NODE_ENV=production  # Use 'development' for local development
```

See `.env.example` for complete configuration options.

## 📖 Usage

### Core Workflow

### 1. Initial Setup & Authentication

1. **Connect Gmail Account**:
   - Click "Connect Gmail" button in the header
   - Authorize the application to access your Gmail
   - Profile icon appears when successfully connected

2. **Session Management**:
   - Sessions expire after configured timeout (default: 1 hour)
   - Automatic token refresh for Gmail access
   - Sign out via user dropdown menu

### 2. Email Fetching & AI Categorization

**Automatic Sync**:
- Configurable intervals (default: 5 minutes)
- Fetches up to 50 emails per sync
- Incremental sync (only new emails)

**Manual Sync**:
- Click the sync button (🔄) in header
- Real-time fetching on demand

**AI Categorization**:
- **Customer Inquiries**: Service requests, quotes, support
- **Invoices**: Bills, receipts, payment documents
- **Other**: Everything else (can be filtered)

**Technical Details**:
- Gmail quota usage: ~500 units per sync (limit: 15,000/minute)
- Duplicate prevention via Gmail message IDs
- Fallback to 'other' category on AI failure

### 3. Three-Stage Email Workflow

#### 📥 Stage 1: Automatic Fetching & Categorization + Process Button
- **Display**: Categorized emails in sortable table
- **Actions**:
  - ✅ Process → Move to Review stage
  - ❌ Decline → Move to Recycle Bin
  - 🔄 Change category manually
  - 📜 Sync Old → Fetch historical emails from date range

#### 🔍 Stage 2: Automatic Data Extraction + Edit/Approve Button
- **Enhanced AI Data Extraction**:
  - **Analysis**: Combines email content + PDF content for accurate extraction
  - Customer Info: Name, Email, Phone, Company, Service
  - Invoice Info: Number, Date, Customer, Amount, VAT (from PDF invoices)
- **Bilingual Support**: English and Greek text processing in both emails and PDFs
- **Actions**:
  - ✏️ Edit extracted data before approval
  - ✅ Approve → Move to Managed stage (with loading indicators)
  - ❌ Decline → Move to Recycle Bin

#### 📊 Stage 3: Managed Emails + Export Button
- **Final Storage**: Processed & approved emails
- **Operations**:
  - Export to XLSX or CSV
  - Delete (soft delete to Recycle Bin)
- **Search & Filter**:
  - Advanced filtering by category, date, sender
  - Full-text search across all fields
  - Sort by any column

## 🔌 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description | Security |
|--------|----------|-------------|----------|
| GET | `/auth/gmail` | Get Gmail OAuth URL | Rate limited |
| GET | `/auth/google` | Redirect to Google OAuth | Rate limited |
| GET | `/auth/google/callback` | OAuth callback handler | Rate limited |
| GET | `/api/user` | Get current user info | Session validated |
| POST | `/api/auth/signout` | Sign out user | CSRF protected |

### Email Management Endpoints

| Method | Endpoint | Description | Security |
|--------|----------|-------------|----------|
| POST | `/api/emails/sync` | Manual email sync | Auth required |
| POST | `/api/emails/sync-old` | Sync historical emails | Auth required |
| GET | `/api/emails/fetched` | Get fetched emails | Sanitized output |
| POST | `/api/emails/fetched/:id/approve` | Approve single email | Auth + validation |
| DELETE | `/api/emails/fetched/:id` | Decline single email | UUID validation |
| POST | `/api/emails/bulk-approve` | Bulk approve emails | Auth + bulk validation |
| POST | `/api/emails/bulk-decline` | Bulk decline emails | Auth + bulk validation |
| PUT | `/api/emails/fetched/:id/category` | Update email category | Auth + category validation |

### Review & Data Management Endpoints

| Method | Endpoint | Description | Security |
|--------|----------|-------------|----------|
| GET | `/api/emails/review` | Get emails in review | Sanitized output |
| POST | `/api/emails/review/:id/approve` | Approve reviewed email | UUID validation |
| PUT | `/api/emails/review/:id` | Update review data | Input sanitization |
| GET | `/api/emails/processed` | Get processed emails | Sanitized output |
| PUT | `/api/emails/processed/:id` | Update processed email | UUID validation |
| DELETE | `/api/emails/:id` | Soft delete email | UUID validation |
| POST | `/api/emails/:id/restore` | Restore from recycle bin | UUID validation |

### Export & Settings Endpoints

| Method | Endpoint | Description | Security |
|--------|----------|-------------|----------|
| GET | `/api/export/xlsx` | Export data as XLSX | File validation |
| GET | `/api/emails/export/managed` | Export managed emails | Auth required |
| GET | `/api/settings` | Get app settings | Sanitized output |
| PUT | `/api/settings` | Update settings | Input validation |

### Monitoring & Health Endpoints

| Method | Endpoint | Description | Security |
|--------|----------|-------------|----------|
| GET | `/health` | Basic health check | Public |
| GET | `/health/detailed` | Detailed health info | Auth required |
| GET | `/health/:check` | Specific health check | Public |
| GET | `/api/metrics` | System metrics | Auth required |
| GET | `/api/audit/recent` | Recent audit entries | Auth required |
| GET | `/api/audit/report` | Audit report | Auth required |

### Backup & AI Management Endpoints

| Method | Endpoint | Description | Security |
|--------|----------|-------------|----------|
| POST | `/api/backup/create` | Trigger manual backup | Strict rate limit + Auth |
| GET | `/api/backup/list` | List available backups | Auth required |
| GET | `/api/backup/stats` | Backup system statistics | Auth required |
| GET | `/api/ai/stats` | AI usage statistics | Auth required |
| POST | `/api/ai/reset-stats` | Reset AI daily statistics | Strict rate limit + Auth |

### Real-time Endpoints

| Method | Endpoint | Description | Security |
|--------|----------|-------------|----------|
| GET | `/api/notifications/stream` | Server-Sent Events | CORS configured |
| GET | `/api/stats` | Dashboard statistics | Sanitized output |

## 🔒 Security

### Implementation Details

#### Rate Limiting
- General API: 100 requests/15 minutes
- Authentication: 5 requests/15 minutes
- Sync operations: 10 requests/5 minutes
- Configurable per endpoint

#### Input Sanitization
- DOMPurify for HTML content
- Express-validator for API inputs
- Parameterized queries
- File type validation

#### Session Security
- HTTPOnly cookies
- Secure flag in production
- Configurable timeout
- CSRF token validation

#### Security Headers (Helmet.js)
- Content Security Policy
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security

## 🐛 Troubleshooting

### Common Issues

#### Gmail Connection Issues

**Problem**: "Authentication failed" error
- **Solution**:
  1. Verify OAuth2 credentials in `.env`
  2. Check redirect URI matches exactly
  3. Ensure Gmail API is enabled in Google Cloud Console
  4. Clear browser cookies and retry

**Problem**: "Quota exceeded" error
- **Solution**:
  1. Reduce `MAX_EMAILS_PER_SYNC` in `.env`
  2. Increase `SYNC_INTERVAL_MINUTES`
  3. Check daily quota in Google Cloud Console

#### OpenAI API Issues

**Problem**: Categorization failing
- **Solution**:
  1. Verify API key is valid
  2. Check API quota/credits
  3. Review error logs for specific issues
  4. Emails will default to 'other' category

**Problem**: Slow AI processing
- **Solution**:
  1. Check AI usage statistics via `/api/ai/stats`
  2. Adjust `AI_BATCH_SIZE` and `AI_EXTRACTION_BATCH_SIZE` (lower = faster)
  3. Increase `AI_BATCH_DELAY` and `AI_EXTRACTION_BATCH_DELAY`
  4. Monitor daily limits: `AI_DAILY_REQUEST_LIMIT` and `AI_EXTRACTION_DAILY_LIMIT`
  5. Consider upgrading to GPT-4 for better accuracy

**Problem**: AI daily limits exceeded
- **Solution**:
  1. Check current usage: `GET /api/ai/stats`
  2. Increase limits in environment variables
  3. Reset daily stats: `POST /api/ai/reset-stats` (admin only)
  4. Implement processing queues for high-volume periods

#### PDF Processing Issues

**Problem**: PDF content not being extracted
- **Solution**:
  1. Verify PDF file size is under 5MB
  2. Check if PDF contains extractable text (not image-based)
  3. Ensure Gmail OAuth2 is properly configured
  4. Review server logs for PDF processing errors
  5. Test with different PDF files

**Problem**: PDF processing is slow
- **Solution**:
  1. Check PDF file sizes (larger files take longer)
  2. Monitor memory usage during processing
  3. Consider increasing server memory allocation
  4. Process fewer emails simultaneously

**Problem**: "OAuth2 client not configured" error
- **Solution**:
  1. Ensure user is properly authenticated with Gmail
  2. Check server logs for OAuth2 setup messages
  3. Restart server after Gmail authentication
  4. Verify Gmail API permissions include attachment access

#### Data Issues

**Problem**: Missing emails after sync
- **Solution**:
  1. Check email filters in Gmail
  2. Verify sync date range
  3. Look in 'other' category
  4. Check recycle bin

**Problem**: Corrupted JSON files
- **Solution**:
  1. Stop the application
  2. Check available backups: `GET /api/backup/list`
  3. Restore from automated backups in `backups/` directory
  4. Verify backup integrity using manifest checksums
  5. Or reinitialize: delete file and restart

#### Backup & Recovery Issues

**Problem**: Backup creation failing
- **Solution**:
  1. Check disk space and permissions
  2. Review backup logs in console output
  3. Verify `MAX_BACKUPS` and `BACKUP_INTERVAL_HOURS` settings
  4. Manually trigger backup: `POST /api/backup/create`

**Problem**: Cannot restore from backup
- **Solution**:
  1. Stop the application
  2. Verify backup integrity using manifest.json
  3. Extract backup to temporary location first
  4. Copy verified files to data directory
  5. Restart application and verify functionality

#### Performance Issues

**Problem**: Slow UI with many emails
- **Solution**:
  1. Enable pagination in settings
  2. Archive old managed emails
  3. Increase Node.js memory: `node --max-old-space-size=4096 server.js`
  4. Clear browser cache

## 👨‍💻 Development

### Project Structure

```
aems-02/
├── server.js                    # Main Express server with security middleware
├── lib/                        # Core backend modules
│   ├── ai.js                   # OpenAI integration with cost control
│   ├── ai-extractor.js         # AI-powered data extraction with PDF processing
│   ├── pdf-processor.js        # PDF content extraction and text processing
│   ├── database.js             # Modular JSON database with file locking
│   ├── gmail.js                # Gmail API integration with enhanced error handling
│   ├── health-monitor.js       # System health monitoring & metrics
│   ├── audit-logger.js         # Security audit & activity logging
│   ├── retry-utils.js          # Robust retry logic with circuit breaker
│   ├── backup-manager.js       # Automated backup system with integrity checks
│   └── env-validator.js        # Environment configuration validation
├── public/                     # Frontend assets
│   ├── index.html              # Main SPA HTML file with nonce-based CSP
│   ├── css/
│   │   └── styles.css          # Modern dark theme styles
│   └── js/
│       ├── app.js              # Main frontend application with secure event handling
│       ├── security-utils.js   # XSS prevention and secure DOM manipulation
│       ├── performance-cache.js # Client-side caching with memory management
│       └── ui-enhancements.js  # Progressive UI improvements
├── data/                       # JSON data storage (modular structure)
│   ├── emails/                 # Email storage by status & category
│   ├── extracted-data/         # AI-extracted information
│   ├── notifications/          # System notifications
│   └── settings.json           # Application configuration
├── backups/                    # Automated backup storage
│   ├── backup-YYYY-MM-DD/      # Daily backup snapshots
│   └── manifest.json           # Backup metadata and checksums
├── logs/                       # System logs
│   ├── audit.log              # Security audit trail
│   ├── error.log              # Error logging
│   └── security.log           # Security events
├── package.json               # Dependencies & scripts
├── .env.example              # Environment template
└── README.md                 # Comprehensive documentation
```

### Key Technologies

#### Backend Stack
- **Runtime**: Node.js (v18+ recommended)
- **Framework**: Express.js v4.18.2 with comprehensive middleware stack
- **AI/ML**: OpenAI GPT-3.5-turbo (v4.28.4) with LangChain v0.1.30 integration
- **Document Processing**: pdf-parse v1.1.1 for PDF text extraction
- **Authentication**: Google OAuth2 (googleapis v128.0.0) with automatic token refresh
- **Data Storage**: Modular JSON file system with atomic writes (write-file-atomic v6.0.0)
- **Email API**: Gmail API v1 with quota management and attachment processing
- **Task Scheduling**: node-cron v3.0.3 for automated sync operations
- **File Upload**: multer v1.4.5-lts.1 for handling multipart/form-data
- **Data Export**: xlsx v0.18.5 for Excel file generation
- **Utilities**: uuid v9.0.1 for unique identifiers, dotenv v16.3.1 for environment management

#### Security & Monitoring
- **Security Framework**: Helmet.js v7.1.0 with nonce-based CSP, express-rate-limit v7.1.5, CSRF protection (csurf v1.11.0)
- **Input Validation**: express-validator v7.0.1 with DOMPurify v3.0.6 sanitization and XSS prevention
- **Session Management**: express-session v1.17.3 with secure cookie configuration
- **CORS**: cors v2.8.5 for cross-origin resource sharing
- **Database Security**: File locking mechanisms and atomic operations
- **Memory Management**: Automatic cleanup and leak prevention
- **Audit System**: Comprehensive logging with structured events and security tracking
- **Health Monitoring**: Real-time system health checks and performance metrics
- **Error Handling**: Retry logic with exponential backoff and circuit breaker
- **Backup System**: Automated backups with integrity verification and retention policies

#### Frontend Architecture
- **Core**: Vanilla JavaScript ES6+ (no framework dependencies)
- **Security**: Nonce-based CSP, XSS prevention, secure event handling
- **DOM Manipulation**: JSDOM v23.0.1 for server-side DOM operations
- **UI Components**: Modular component system with progressive enhancement and secure DOM manipulation
- **Memory Management**: Automatic event listener cleanup and resource optimization
- **Icons**: Font Awesome 6.0 for consistent iconography
- **Design System**: Custom white/black theme with modern minimalist aesthetics

### Development Commands

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run in production
npm start

# Check for vulnerabilities
npm audit

# Update dependencies
npm update
```

### Code Style Guidelines

- **JavaScript**: ES6+ syntax, async/await
- **Formatting**: 2 spaces indentation
- **Comments**: JSDoc for functions
- **Error Handling**: Try-catch blocks with logging
- **Security**: Input validation on all endpoints

### Testing

Currently, the project uses manual testing. Future improvements:
- Unit tests with Jest
- Integration tests for API endpoints
- E2E tests with Playwright

### Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📚 Additional Resources

### External Documentation

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [OpenAI API Reference](https://platform.openai.com/docs)
- [Google OAuth2 Guide](https://developers.google.com/identity/protocols/oauth2)
- [Express.js Guide](https://expressjs.com/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Docker Security Best Practices](https://docs.docker.com/develop/security-best-practices/)
- [Nginx Security Guide](https://nginx.org/en/docs/http/securing_http.html)

### Useful Tools

- [Google API Console](https://console.cloud.google.com/)
- [OpenAI Playground](https://platform.openai.com/playground)
- [JWT.io](https://jwt.io/) - Token debugging
- [Postman](https://www.postman.com/) - API testing
- [SSL Labs Test](https://www.ssllabs.com/ssltest/) - SSL configuration testing
- [Security Headers](https://securityheaders.com/) - Security header analysis

## 📝 Changelog

### Version 2.1.0 (Current) - Enhanced AI & User Experience
- ✅ **PDF Content Processing**: AI data extraction from PDF attachments
- ✅ **Progress Indicators**: Real-time loading states with spinner animations for all processing operations
- ✅ **Historical Email Sync**: "Sync Old" functionality to fetch emails from specific date ranges
- ✅ **Enhanced User Interface**: Improved visual feedback

### Version 2.0.0 - Production-Ready Release
- ✅ **Enhanced Security**: Nonce-based CSP, XSS prevention, secure event handling
- ✅ **AI Cost Control**: Usage tracking, daily limits, intelligent batch processing
- ✅ **Automated Backups**: Scheduled backups with integrity verification and retention policies
- ✅ **Database Security**: File locking mechanisms and atomic operations
- ✅ **Memory Management**: Automatic cleanup, leak prevention, and resource optimization
- ✅ **Environment Validation**: Startup configuration validation with sanitized logging
- ✅ **Process Management**: Graceful shutdown handling and comprehensive error recovery
- ✅ **Enhanced Monitoring**: Request/response logging, performance metrics, and health checks
- ✅ **Improved Error Handling**: Retry logic with exponential backoff and circuit breaker patterns
- ✅ **Frontend Security**: Secure DOM manipulation and event listener management

### Version 1.0.0 - Initial Release
- ✅ Gmail OAuth2 integration
- ✅ AI-powered email categorization and AI data extraction
- ✅ Three-stage workflow
- ✅ Export functionality
- ✅ Recycle bin implementation
- ✅ Real-time notifications
- ✅ Bulk operations
- ✅ Basic security implementation

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

---
