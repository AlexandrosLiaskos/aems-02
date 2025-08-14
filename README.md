# Agentic Email Management System (AEMS)

## System Architecture Overview

### Backend Architecture
- **Server**: Node.js Express server with session management and session timeout
- **Database**: Local JSON files for secure data storage (single-user system)
- **Authentication**: Google OAuth2 for initial Gmail connection only
- **AI Processing**: OpenAI GPT-3.5-turbo with LangChain for email categorization and data extraction
- **Offline/Online Mode**: System works offline with stored data, syncs when online

### UI Architecture  
- **Framework**: Vanilla HTML/CSS/JS with ShadCN components
- **Design**: Minimalist white/black UI
- **Components**: ShadCN data tables, dropdowns, dialogs, and comprehensive ShadCN component library
- **Layout**: Compact, responsive design, mobile-first cross-platform

## Core Workflow

### 1. Authentication Flow
- User clicks Gmail connection button
- OAuth2 authentication with Google (one-time setup only)
- Profile icon displayed in top-right corner when connected
- Sign-out option available via dropdown menu
- **Session timeout**: Implemented for security
- **Offline/Online Operation**: System works offline with stored data, OAuth only for initial setup
- **Single-user system**: Supports one user per installation, but codebase can be cloned for multiple users

### 2. Real-time Email Fetching & Categorization
- **Auto-sync**: Configurable intervals (default: 5 minutes)
- **Manual sync**: Real-time fetching on demand
- **AI Categorization**: Automatic classification before display
  - Customer inquiries (info requests)
  - Invoices
  - Other (filtered out)
- **Gmail API Limits**: 50 emails per sync (conservative approach)
  - messages.list: 5 quota units, messages.get: 5 quota units
  - Total: ~500 quota units per sync (well under 15,000/minute limit)
- **Sync Strategy**: Incremental sync only (fetch new emails since last sync)
- **AI Categorization**: No fallback if categorization fails (emails marked as 'other')
- **Duplicate Prevention**: Use Gmail message ID as unique identifier throughout system

### 3. Email Processing Stages

#### Stage 1: Fetched Emails List
- Display categorized emails in ShadCN data table
- **Sorting**: Others category sorted last (Customer Inquiries → Invoices → Others)
- User actions: Approve, Decline
- **Declined emails**: Moved to recycle bin of fetched emails
- Pagination for large email volumes
- **Bulk operations**: Select multiple emails for bulk approve/decline

#### Stage 2: Review List  
- Approved fetched emails processed with AI extraction
- **Language Support**: English and Greek data extraction
- **Customer Data**: Name, Email, Phone, Company, Service Interest
- **Invoice Data**: Invoice Number, Date, Customer, Amount, VAT
- User can edit extracted information before approval
- **Bulk operations**: Select multiple emails for bulk processing/approval

#### Stage 3: Data Management
- Final storage of approved emails and extracted data
- **CRUD operations**: Edit, Delete (soft delete to recycle bin)
- **Export functionality**: XLSX (separate Customer/Invoice tabs) or CSV
- **No size limits**: Export all approved data regardless of file size
- **Import functionality**: Import previously exported data (with no duplicate security check)
- Advanced filtering, searching, sorting capabilities
- **Duplicate Prevention**: Gmail message ID ensures unique emails throughout workflow (both db and ui;meaning thaqt ui shows what db has of course)
- **Data Validation**: No validation rules applied to extracted data

### 4. Notification System
- Real-time notifications for new fetched emails
- Dropdown in top-right corner
- **Persistent notifications**: Saved in database with seen/unseen state
- **Display limit**: Show only 5 recent notifications
- **Overflow handling**: "See all" button leading to dedicated notifications page
- **Management options**: Clear all notifications or selective clearing
- Configurable notification preferences

### 5. Data Export & Backup
- **XLSX export**: Separate Customer and Invoice tabs
- **CSV export**: Alternative format option
- **No size limits**: Export unlimited approved data
- **Scheduled backups**: Automated backup functionality
- **Data import**: Import previously exported data
- Local JSON storage for data persistence

## Technical Implementation Details

### Database Schema (lib/database.js)
- **emails.json**: Core email data with workflow status and unique Gmail message IDs
- **users.json**: Single-user authentication data (OAuth setup only)
- **extractedData.json**: AI-processed information (English/Greek support)
- **settings.json**: System configuration including session timeout
- **notifications.json**: Persistent notifications with seen/unseen state
- **audit.json**: Comprehensive audit logging
- **recycleBin.json**: Soft-deleted emails by stage

### AI Processing (lib/ai.js)
- **Email categorization**: GPT-3.5-turbo with structured prompts
- **Information extraction**: Greek and English text support
- **No confidence scoring**: Simple binary classification
- **Mixed-language handling**: Unified prompts supporting both languages
- **Prompt optimization strategy**:
  - Few-shot examples for better accuracy
  - Minimized token usage for cost efficiency
  - Cached common categorizations
  - Optimized for Greek/English mixed content
- **Batch processing**: Manage API rate limits with conservative approach

### Gmail Integration (lib/gmail.js)
- **OAuth2 authentication**: One-time setup only
- **Email fetching**: 50 emails per sync (conservative quota usage)
- **Attachment handling**: Only process PDF attachments, skip others
- **MIME type parsing**: Basic text/plain and text/html support
- **Quota management strategy**:
  - 50 emails/sync = ~500 quota units (well under 15,000/minute limit)
  - Exponential backoff for rate limit errors
  - Quota usage tracking and adaptive sync frequency
  - Incremental sync to minimize API calls
- **Duplicate prevention**: Use Gmail message ID as unique identifier

## Security Considerations
- **Local data storage**: No cloud dependencies for data security
- **Secure token management**: OAuth tokens stored securely
- **Session-based authentication**: With configurable timeout
- **Input validation and sanitization**: All user inputs sanitized
- **No data encryption**: Plain JSON storage for now
- **Audit logging strategy**:
  - Log all user actions (approve, decline, edit, delete)
  - Log system events (sync, AI processing, exports)
  - Store in audit.json with timestamps and email IDs
  - Track quota usage and system performance
- **XSS/CSRF protection**:
  - Content Security Policy (CSP) headers
  - HTML entity encoding for email content display
  - CSRF tokens for state-changing operations
  - Input sanitization for all user data

## Environment Configuration

```env
# OpenAI API Configuration
OPENAI_API_KEY=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

# Google OAuth2 Configuration for Gmail Integration  
GOOGLE_CLIENT_ID=831021626163-nag3aqk345l1aknoieoeaiol45m92gpd.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-Ii21xSXyUEv
GOOGLE_REDIRECT_URL=http://localhost:3000/auth/google/callback

# Server Configuration
PORT=3000
SESSION_SECRET=your-secure-secret-key-here
SESSION_TIMEOUT=3600000

# Gmail API Configuration
MAX_EMAILS_PER_SYNC=50
SYNC_INTERVAL_MINUTES=5
QUOTA_UNITS_PER_SYNC_LIMIT=500

# AI Configuration
AI_BATCH_SIZE=5
AI_BATCH_DELAY=1000

# Security Configuration
ENABLE_AUDIT_LOGGING=true
ENABLE_CSRF_PROTECTION=true
```
