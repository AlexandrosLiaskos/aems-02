# Phase 1: Critical Fixes (Days 1-2)

## 🚨 CRITICAL ISSUES - SYSTEM BREAKING
These issues prevent the system from starting or functioning at all.

## 1. Database Method Alignment

### Problem
Server.js calls methods that don't exist in database.js, causing crashes:

**Missing Methods in lib/database.js:**
```javascript
// Called in server.js but don't exist:
- approveFetchedEmail(id)
- removeFetchedEmail(id)
- addMultipleFetchedEmails(emails)
- updateReviewEmail(id, data)
- approveReviewEmail(id)
- getProcessedEmails()
- updateProcessedEmail(id, updates)
- deleteProcessedEmail(id)
- getRecycleBin()
- restoreFromRecycleBin(id)
- permanentlyDeleteFromRecycleBin(id)
```

### Solution
Add these methods to `lib/database.js`:

```javascript
// WORKFLOW TRANSITION METHODS
async approveFetchedEmail(id) {
  const email = await this.getEmailById(id);
  if (!email || email.status !== this.EMAIL_STATUS.FETCHED) {
    return null;
  }
  return await this.moveEmailToReview(id);
}

async removeFetchedEmail(id) {
  const email = await this.getEmailById(id);
  if (!email || email.status !== this.EMAIL_STATUS.FETCHED) {
    return null;
  }
  return await this.softDeleteEmail(id);
}

async addMultipleFetchedEmails(emails) {
  const results = [];
  const existingEmails = await this.readFile('emails');
  const existingGmailIds = new Set(existingEmails.map(e => e.gmailId));
  
  for (const emailData of emails) {
    // Skip duplicates
    if (existingGmailIds.has(emailData.gmailId)) {
      continue;
    }
    
    const result = await this.createEmail({
      ...emailData,
      category: emailData.category || this.EMAIL_CATEGORY.OTHER,
      userId: 'single-user' // Single user system
    });
    results.push(result);
  }
  
  return results;
}

// REVIEW STAGE METHODS
async updateReviewEmail(id, extractedData) {
  const email = await this.getEmailById(id);
  if (!email || email.status !== this.EMAIL_STATUS.REVIEW) {
    return null;
  }
  
  // Update extracted data
  await this.createExtractedData({
    ...extractedData,
    emailId: id
  });
  
  return await this.updateEmail(id, {
    updatedAt: new Date().toISOString()
  });
}

async approveReviewEmail(id) {
  const email = await this.getEmailById(id);
  if (!email || email.status !== this.EMAIL_STATUS.REVIEW) {
    return null;
  }
  return await this.moveEmailToManaged(id);
}

// PROCESSED/MANAGED EMAIL METHODS
async getProcessedEmails(userId = null) {
  return await this.getManagedEmails(userId);
}

async updateProcessedEmail(id, updates) {
  const email = await this.getEmailById(id);
  if (!email || email.status !== this.EMAIL_STATUS.MANAGED) {
    return null;
  }
  
  // Update email
  await this.updateEmail(id, updates);
  
  // Update extracted data if provided
  if (updates.extractedData) {
    await this.updateExtractedData(id, updates.extractedData);
  }
  
  return await this.getEmailById(id);
}

async deleteProcessedEmail(id) {
  const email = await this.getEmailById(id);
  if (!email || email.status !== this.EMAIL_STATUS.MANAGED) {
    return null;
  }
  return await this.softDeleteEmail(id);
}

// RECYCLE BIN METHODS
async getRecycleBin(userId = null) {
  return await this.getDeletedEmails(userId);
}

async restoreFromRecycleBin(id) {
  const email = await this.getEmailById(id);
  if (!email || !email.isDeleted) {
    return null;
  }
  
  // Restore to MANAGED status
  return await this.updateEmail(id, {
    status: this.EMAIL_STATUS.MANAGED,
    isDeleted: false,
    deletedAt: null,
    restoredAt: new Date().toISOString()
  });
}

async permanentlyDeleteFromRecycleBin(id) {
  const emails = await this.readFile('emails');
  const email = emails.find(e => e.id === id && e.isDeleted);
  
  if (!email) {
    return false;
  }
  
  // Remove from all related tables
  const filtered = emails.filter(e => e.id !== id);
  await this.writeFile('emails', filtered);
  
  // Remove extracted data
  const extractedData = await this.readFile('extractedData');
  const filteredData = extractedData.filter(d => d.emailId !== id);
  await this.writeFile('extractedData', filteredData);
  
  // Remove attachments
  const attachments = await this.readFile('attachments');
  const filteredAttachments = attachments.filter(a => a.emailId !== id);
  await this.writeFile('attachments', filteredAttachments);
  
  return true;
}
```

## 2. Environment Configuration

### Problem
No .env file exists, server references undefined variables.

### Solution
Create `.env` file in project root:

```env
# OpenAI API Configuration
OPENAI_API_KEY=your-openai-api-key-here

# Google OAuth2 Configuration for Gmail Integration
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
GOOGLE_REDIRECT_URL=http://localhost:3000/auth/google/callback

# Server Configuration
PORT=3000
SESSION_SECRET=generate-secure-random-key-minimum-32-characters-long
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

### Security Note
⚠️ **CRITICAL**: The README.md contains exposed API keys. These must be replaced with your own keys.

## 3. Data Directory Initialization

### Problem
Data directory is empty, database operations will fail.

### Solution
Initialize required JSON files:

```bash
# Create data directory structure
mkdir -p data uploads backups

# Initialize empty database files
echo '[]' > data/emails.json
echo '[]' > data/users.json
echo '[]' > data/extractedData.json
echo '[]' > data/attachments.json
echo '[]' > data/notifications.json
echo '[]' > data/audit.json
echo '[]' > data/recycleBin.json

# Initialize settings with defaults
echo '{
  "syncInterval": 5,
  "autoSync": true,
  "emailCategories": ["customer_inquiry", "invoice", "other"],
  "language": "both",
  "notifications": true,
  "lastSync": null,
  "sessionTimeout": 3600000
}' > data/settings.json
```

## 4. Basic Frontend Structure

### Problem
CSS and JS folders are empty, causing broken UI.

### Solution
Create basic file structure:

```bash
# Create basic CSS file
cat > public/css/styles.css << 'EOF'
/* AEMS Basic Styles - Dark Teal Theme */
:root {
  --primary: #0f766e;
  --primary-foreground: #f0fdfa;
  --background: #0a0a0a;
  --foreground: #fafafa;
  --card: #1a1a1a;
  --card-foreground: #fafafa;
  --border: #374151;
  --muted: #111827;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: var(--background);
  color: var(--foreground);
  line-height: 1.6;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-primary {
  background-color: var(--primary);
  color: var(--primary-foreground);
}

.btn-primary:hover {
  background-color: #0d5b52;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

/* More styles will be added in Phase 2 */
EOF

# Create basic JavaScript file
cat > public/js/app.js << 'EOF'
// AEMS Basic Application Logic
class AEMS {
  constructor() {
    this.init();
  }

  async init() {
    console.log('AEMS Initializing...');
    await this.checkAuth();
    this.bindEvents();
  }

  async checkAuth() {
    try {
      const response = await fetch('/api/user');
      const data = await response.json();
      
      if (data.connected) {
        this.showDashboard(data.user);
      } else {
        this.showWelcome();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      this.showWelcome();
    }
  }

  showDashboard(user) {
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    this.updateUserButton(user);
    this.loadStats();
  }

  showWelcome() {
    document.getElementById('welcomeScreen').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
  }

  bindEvents() {
    // Basic event binding - will be expanded in Phase 2
  }

  async loadStats() {
    // Basic stats loading - will be implemented in Phase 2
  }

  updateUserButton(user) {
    const userButton = document.getElementById('userButton');
    const userInfo = document.getElementById('userInfo');
    
    if (userButton && user) {
      userButton.innerHTML = `<i class="fas fa-user"></i> ${user.name || user.email}`;
      document.getElementById('signOutBtn').style.display = 'block';
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.aems = new AEMS();
});

// Basic functions referenced in HTML
async function connectGmail() {
  try {
    const response = await fetch('/auth/gmail');
    const data = await response.json();
    window.location.href = data.authUrl;
  } catch (error) {
    console.error('Gmail connection failed:', error);
  }
}

async function signOut() {
  try {
    await fetch('/api/auth/signout', { method: 'POST' });
    location.reload();
  } catch (error) {
    console.error('Sign out failed:', error);
  }
}

function toggleNotifications() {
  // Will be implemented in Phase 2
}

function toggleUserMenu() {
  // Will be implemented in Phase 2
}
EOF
```

## 5. Update HTML to Include CSS/JS

### Solution
Update `public/index.html` to include the CSS and JS files:

```html
<!-- Add after existing CSS links -->
<link rel="stylesheet" href="/css/styles.css">

<!-- Add before closing body tag -->
<script src="/js/app.js"></script>
```

## ✅ Phase 1 Completion Checklist

- [ ] Add all missing database methods to `lib/database.js`
- [ ] Create `.env` file with proper configuration
- [ ] Initialize data directory with empty JSON files
- [ ] Create basic CSS file with dark teal theme
- [ ] Create basic JavaScript file with core functionality
- [ ] Update HTML to include CSS/JS files
- [ ] Test server startup (should start without errors)
- [ ] Test database initialization (no crashes)
- [ ] Test basic authentication flow

## 🔧 Testing Phase 1

After implementing all fixes:

```bash
# 1. Install dependencies
npm install

# 2. Start server
npm start

# 3. Verify startup
# - Server should start on port 3000
# - No database method errors
# - Basic UI should load

# 4. Test database
# - JSON files should be created in data/
# - No crashes when accessing database methods
```

## 🚀 Next Steps
Once Phase 1 is complete, proceed to [PHASE_2_WORKFLOW.md](./PHASE_2_WORKFLOW.md) for core functionality implementation.