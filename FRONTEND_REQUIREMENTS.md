# Frontend Implementation Requirements

## 🎨 UI Design Specification

### Theme: Dark Teal Military-Grade Futuristic
Based on user preferences overriding README's white/black specification.

## 🎯 Design Principles
- **Military-grade**: Clean, functional, purposeful
- **Futuristic**: Modern typography, subtle animations
- **Minimalist**: No clutter, focused on functionality
- **Dark Teal**: Primary color #0f766e with supporting palette
- **Mobile-first**: Responsive design starting from mobile

## 🌈 Color Palette

```css
:root {
  /* Primary Colors */
  --primary: #0f766e;           /* Dark Teal */
  --primary-dark: #0d5b52;     /* Darker Teal */
  --primary-light: #14b8a6;    /* Light Teal */
  --primary-foreground: #f0fdfa; /* Light text on primary */
  
  /* Background Colors */
  --background: #0a0a0a;        /* Deep Black */
  --background-alt: #111111;    /* Slightly lighter black */
  --surface: #1a1a1a;          /* Card/surface background */
  --surface-alt: #262626;      /* Elevated surface */
  
  /* Text Colors */
  --foreground: #fafafa;        /* Primary text */
  --foreground-muted: #a3a3a3;  /* Secondary text */
  --foreground-subtle: #737373; /* Subtle text */
  
  /* Border & Dividers */
  --border: #374151;            /* Border color */
  --border-light: #4b5563;     /* Lighter border */
  --divider: #1f2937;          /* Divider lines */
  
  /* Status Colors */
  --success: #10b981;           /* Green */
  --warning: #f59e0b;           /* Amber */
  --error: #ef4444;             /* Red */
  --info: #3b82f6;             /* Blue */
  
  /* Component Colors */
  --card: #1a1a1a;
  --card-foreground: #fafafa;
  --muted: #111827;
  --muted-foreground: #6b7280;
  --accent: #14b8a6;
  --accent-foreground: #0f172a;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
}
```

## 📱 Complete CSS Implementation

### Base Styles (`public/css/styles.css`)

```css
/* ================================
   AEMS DARK TEAL THEME
   Military-Grade Futuristic Design
   ================================ */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

/* CSS Variables (as defined above) */
:root {
  /* ... color palette ... */
  
  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
  
  /* Spacing */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --spacing-2xl: 3rem;
  
  /* Border Radius */
  --radius-sm: 0.25rem;
  --radius: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  
  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 200ms ease;
  --transition-slow: 300ms ease;
}

/* ================================
   RESET & BASE
   ================================ */

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  font-size: 16px;
  scroll-behavior: smooth;
}

body {
  font-family: var(--font-sans);
  background-color: var(--background);
  color: var(--foreground);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ================================
   TYPOGRAPHY
   ================================ */

h1, h2, h3, h4, h5, h6 {
  font-weight: 600;
  line-height: 1.2;
  margin-bottom: var(--spacing-sm);
}

h1 { font-size: 2.5rem; }
h2 { font-size: 2rem; }
h3 { font-size: 1.5rem; }
h4 { font-size: 1.25rem; }
h5 { font-size: 1.125rem; }
h6 { font-size: 1rem; }

p {
  margin-bottom: var(--spacing-md);
}

.text-muted {
  color: var(--foreground-muted);
}

.text-subtle {
  color: var(--foreground-subtle);
}

.text-primary {
  color: var(--primary);
}

.text-success {
  color: var(--success);
}

.text-warning {
  color: var(--warning);
}

.text-error {
  color: var(--error);
}

/* ================================
   LAYOUT
   ================================ */

.container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-md);
}

@media (min-width: 768px) {
  .container {
    padding: 0 var(--spacing-lg);
  }
}

.grid {
  display: grid;
  gap: var(--spacing-md);
}

.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }

@media (max-width: 767px) {
  .grid-cols-2, .grid-cols-3, .grid-cols-4 {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
}

.flex {
  display: flex;
}

.flex-col {
  flex-direction: column;
}

.items-center {
  align-items: center;
}

.justify-center {
  justify-content: center;
}

.justify-between {
  justify-content: space-between;
}

.gap-2 { gap: var(--spacing-sm); }
.gap-4 { gap: var(--spacing-md); }
.gap-6 { gap: var(--spacing-lg); }

/* ================================
   COMPONENTS
   ================================ */

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid transparent;
  border-radius: var(--radius);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: all var(--transition-fast);
  text-decoration: none;
  outline: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background-color: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--primary-dark);
  border-color: var(--primary-dark);
}

.btn-secondary {
  background-color: var(--surface);
  color: var(--foreground);
  border-color: var(--border);
}

.btn-secondary:hover:not(:disabled) {
  background-color: var(--surface-alt);
}

.btn-outline {
  background-color: transparent;
  color: var(--foreground);
  border-color: var(--border);
}

.btn-outline:hover:not(:disabled) {
  background-color: var(--surface);
}

.btn-ghost {
  background-color: transparent;
  color: var(--foreground);
  border-color: transparent;
}

.btn-ghost:hover:not(:disabled) {
  background-color: var(--surface);
}

.btn-sm {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 0.75rem;
}

.btn-lg {
  padding: var(--spacing-md) var(--spacing-lg);
  font-size: 1rem;
}

/* Cards */
.card {
  background-color: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-sm);
}

.card-header {
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.card-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: var(--spacing-xs);
}

.card-description {
  color: var(--foreground-muted);
  font-size: 0.875rem;
}

/* Forms */
.form-group {
  margin-bottom: var(--spacing-md);
}

.form-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: var(--spacing-xs);
  color: var(--foreground);
}

.form-input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background-color: var(--surface);
  color: var(--foreground);
  font-size: 0.875rem;
  transition: all var(--transition-fast);
}

.form-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

/* Tables */
.table-container {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.table th,
.table td {
  padding: var(--spacing-md);
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.table th {
  background-color: var(--surface);
  font-weight: 600;
  color: var(--foreground);
}

.table td {
  background-color: var(--card);
}

.table tbody tr:hover {
  background-color: var(--surface-alt);
}

/* Badges */
.badge {
  display: inline-flex;
  align-items: center;
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.badge-primary {
  background-color: var(--primary);
  color: var(--primary-foreground);
}

.badge-success {
  background-color: var(--success);
  color: white;
}

.badge-warning {
  background-color: var(--warning);
  color: white;
}

.badge-error {
  background-color: var(--error);
  color: white;
}

.badge-secondary {
  background-color: var(--surface);
  color: var(--foreground-muted);
  border: 1px solid var(--border);
}

/* Loading Spinner */
.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top: 2px solid var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Progress Bar */
.progress {
  width: 100%;
  height: 8px;
  background-color: var(--surface);
  border-radius: var(--radius);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background-color: var(--primary);
  border-radius: var(--radius);
  transition: width var(--transition-normal);
}

/* Modals */
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--spacing-md);
}

.modal {
  background-color: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  color: var(--foreground-muted);
  cursor: pointer;
  padding: var(--spacing-xs);
}

.modal-content {
  padding: var(--spacing-lg);
}

.modal-footer {
  padding: var(--spacing-lg);
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

/* Dropdowns */
.dropdown {
  position: relative;
  display: inline-block;
}

.dropdown-content {
  position: absolute;
  top: 100%;
  right: 0;
  background-color: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  min-width: 200px;
  z-index: 100;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-10px);
  transition: all var(--transition-fast);
}

.dropdown.open .dropdown-content {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.dropdown-item {
  display: block;
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  text-decoration: none;
  color: var(--foreground);
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.875rem;
  text-align: left;
}

.dropdown-item:hover {
  background-color: var(--surface);
}

.dropdown-divider {
  height: 1px;
  background-color: var(--border);
  margin: var(--spacing-xs) 0;
}

/* Notifications */
.notification {
  position: fixed;
  top: var(--spacing-lg);
  right: var(--spacing-lg);
  background-color: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  box-shadow: var(--shadow-lg);
  max-width: 400px;
  z-index: 1000;
  transform: translateX(100%);
  transition: transform var(--transition-normal);
}

.notification.show {
  transform: translateX(0);
}

.notification-success {
  border-left: 4px solid var(--success);
}

.notification-warning {
  border-left: 4px solid var(--warning);
}

.notification-error {
  border-left: 4px solid var(--error);
}

.notification-info {
  border-left: 4px solid var(--info);
}

/* ================================
   SPECIFIC COMPONENTS
   ================================ */

/* Header */
.header {
  background-color: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: var(--spacing-md) 0;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header h1 {
  color: var(--primary);
  font-size: 1.5rem;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-2xl);
}

.stat-card {
  background-color: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.stat-icon {
  width: 50px;
  height: 50px;
  background-color: var(--primary);
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-foreground);
  font-size: 1.5rem;
}

.stat-content h3 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--primary);
  margin-bottom: var(--spacing-xs);
}

.stat-content p {
  color: var(--foreground-muted);
  font-size: 0.875rem;
  margin: 0;
}

/* Welcome Screen */
.welcome-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.welcome-content {
  text-align: center;
  max-width: 500px;
}

.welcome-icon {
  font-size: 4rem;
  color: var(--primary);
  margin-bottom: var(--spacing-lg);
}

.welcome-description {
  color: var(--foreground-muted);
  margin-bottom: var(--spacing-xl);
}

/* Dashboard */
.dashboard {
  padding: var(--spacing-lg) 0;
}

/* Responsive Design */
@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    gap: var(--spacing-md);
  }
  
  .header-actions {
    width: 100%;
    justify-content: center;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .modal {
    margin: var(--spacing-sm);
    max-width: calc(100% - 2rem);
  }
  
  .notification {
    right: var(--spacing-sm);
    left: var(--spacing-sm);
    max-width: none;
  }
}

/* ================================
   UTILITY CLASSES
   ================================ */

.hidden { display: none !important; }
.visible { display: block !important; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.text-center { text-align: center; }
.text-right { text-align: right; }
.text-left { text-align: left; }

.font-bold { font-weight: 700; }
.font-semibold { font-weight: 600; }
.font-medium { font-weight: 500; }

.uppercase { text-transform: uppercase; }
.lowercase { text-transform: lowercase; }
.capitalize { text-transform: capitalize; }

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cursor-pointer { cursor: pointer; }
.cursor-not-allowed { cursor: not-allowed; }

.select-none { user-select: none; }

.w-full { width: 100%; }
.h-full { height: 100%; }

.relative { position: relative; }
.absolute { position: absolute; }
.fixed { position: fixed; }

/* Focus styles for accessibility */
.btn:focus-visible,
.form-input:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* Smooth transitions for interactions */
* {
  transition: color var(--transition-fast), 
              background-color var(--transition-fast), 
              border-color var(--transition-fast), 
              box-shadow var(--transition-fast);
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  :root {
    --border: #ffffff;
    --foreground-muted: #ffffff;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## 🔧 JavaScript Components Required

### Main Application (`public/js/app.js`)

```javascript
// AEMS Main Application
class AEMS {
  constructor() {
    this.user = null;
    this.notifications = [];
    this.currentView = 'welcome';
    this.init();
  }

  async init() {
    console.log('🚀 AEMS Initializing...');
    
    // Initialize components
    this.initializeComponents();
    
    // Check authentication
    await this.checkAuth();
    
    // Bind global events
    this.bindEvents();
    
    // Start real-time updates
    this.startRealTimeUpdates();
  }

  initializeComponents() {
    // Initialize all UI components
    this.modal = new ModalManager();
    this.notifications = new NotificationManager();
    this.tables = new DataTableManager();
    this.forms = new FormManager();
    this.search = new SearchManager();
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
      console.error('❌ Auth check failed:', error);
      this.showWelcome();
    }
  }

  bindEvents() {
    // Global keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
    
    // Handle modal close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.modal.closeAll();
      }
    });
  }

  // ... Additional methods will be implemented in phases
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.aems = new AEMS();
});
```

## 📊 ShadCN Data Table Implementation

### Data Table Component (`public/js/components/datatable.js`)

```javascript
class DataTableManager {
  constructor() {
    this.tables = new Map();
  }

  create(containerId, options = {}) {
    const table = new DataTable(containerId, options);
    this.tables.set(containerId, table);
    return table;
  }

  get(containerId) {
    return this.tables.get(containerId);
  }
}

class DataTable {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      sortable: true,
      filterable: true,
      paginated: true,
      pageSize: 50,
      selectable: false,
      bulkActions: false,
      ...options
    };
    
    this.data = [];
    this.filteredData = [];
    this.currentPage = 1;
    this.sortColumn = null;
    this.sortDirection = 'asc';
    this.selectedRows = new Set();
    
    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="datatable">
        ${this.options.filterable ? this.renderFilters() : ''}
        ${this.options.bulkActions ? this.renderBulkActions() : ''}
        <div class="table-container">
          <table class="table">
            <thead>
              ${this.renderHeader()}
            </thead>
            <tbody>
              ${this.renderBody()}
            </tbody>
          </table>
        </div>
        ${this.options.paginated ? this.renderPagination() : ''}
      </div>
    `;
  }

  // Implementation continues...
}
```

## 📱 Mobile-First Responsive Breakpoints

```css
/* Mobile First Breakpoints */
/* Extra small devices (phones, 0px and up) */
@media (min-width: 0px) { /* Default styles */ }

/* Small devices (landscape phones, 576px and up) */
@media (min-width: 576px) {
  .container { max-width: 540px; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}

/* Medium devices (tablets, 768px and up) */
@media (min-width: 768px) {
  .container { max-width: 720px; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* Large devices (desktops, 992px and up) */
@media (min-width: 992px) {
  .container { max-width: 960px; }
  .stats-grid { grid-template-columns: repeat(4, 1fr); }
  .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

/* Extra large devices (large desktops, 1200px and up) */
@media (min-width: 1200px) {
  .container { max-width: 1140px; }
}

/* 2X Large devices (larger desktops, 1400px and up) */
@media (min-width: 1400px) {
  .container { max-width: 1320px; }
}
```

## ✅ Implementation Checklist

### Phase 2 Frontend Requirements
- [ ] **Complete CSS Framework** - Dark teal theme with ShadCN components
- [ ] **JavaScript Architecture** - Modular component system
- [ ] **Data Tables** - Sortable, filterable, with bulk actions
- [ ] **Modal System** - For email details and editing
- [ ] **Notification System** - Toast notifications and dropdown
- [ ] **Form Components** - Validation and submission
- [ ] **Mobile Optimization** - Touch-friendly controls
- [ ] **Accessibility** - ARIA labels, keyboard navigation
- [ ] **Loading States** - Spinners and skeleton screens
- [ ] **Error Handling** - User-friendly error messages

### Phase 3 Advanced Features
- [ ] **Real-time Updates** - Server-sent events
- [ ] **Advanced Search** - Filters and date ranges
- [ ] **Import/Export UI** - File upload and download
- [ ] **Settings Panel** - Configuration interface
- [ ] **Keyboard Shortcuts** - Power user features
- [ ] **Print Styles** - Print-friendly layouts
- [ ] **Offline Mode** - Service worker implementation

This comprehensive frontend specification provides everything needed to implement the military-grade dark teal UI according to user requirements and README specifications.