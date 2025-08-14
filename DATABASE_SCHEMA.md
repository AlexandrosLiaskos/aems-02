# AEMS Database Schema - Multi-Stage Email Workflow

This document describes the database schema for the Agentic Email Management System (AEMS) with its multi-stage email workflow.

## Overview

The system uses a JSON-based database with the following core workflow:

**FETCHED** → **REVIEW** → **MANAGED** → **DELETED** (with soft delete)

## Tables/Models

### 1. Users (`users.json`)

Stores user authentication and profile information.

```json
{
  "id": "string (UUID)",
  "name": "string?",
  "email": "string (unique)",
  "authProvider": "string (default: 'google')",
  "profileImage": "string?",
  "accessToken": "string? (Gmail API)",
  "refreshToken": "string? (Gmail API)",
  "createdAt": "ISO string",
  "updatedAt": "ISO string",
  "isDeleted": "boolean (default: false)",
  "deletedAt": "ISO string?"
}
```

### 2. Emails (`emails.json`)

Core email storage with multi-stage workflow support.

```json
{
  "id": "string (UUID)",
  "gmailId": "string (unique Gmail message ID)",
  "threadId": "string? (Gmail thread ID)",
  "subject": "string",
  "body": "string",
  "htmlBody": "string?",
  "snippet": "string? (Gmail snippet)",
  "fromAddress": "string",
  "fromName": "string?",
  "toAddress": "string",
  "date": "ISO string",
  "category": "enum (CUSTOMER_INQUIRY|INVOICE|OTHER)",
  "status": "enum (FETCHED|REVIEW|MANAGED|DELETED)",
  "fetchedAt": "ISO string",
  "reviewedAt": "ISO string?",
  "managedAt": "ISO string?",
  "isDeleted": "boolean (default: false)",
  "deletedAt": "ISO string?",
  "userId": "string (foreign key)"
}
```

#### Email Status Flow:
- **FETCHED**: Newly fetched emails awaiting approval/decline
- **REVIEW**: Approved emails processed by AI, awaiting final review
- **MANAGED**: Final approved emails ready for export/management
- **DELETED**: Soft deleted emails (recycle bin)

#### Email Categories:
- **CUSTOMER_INQUIRY**: Customer information and service requests
- **INVOICE**: Invoice documents and billing information
- **OTHER**: Uncategorized or other types

### 3. Attachments (`attachments.json`)

File attachments linked to emails.

```json
{
  "id": "string (UUID)",
  "fileName": "string",
  "filePath": "string (local storage path)",
  "mimeType": "string",
  "size": "number (bytes)",
  "type": "enum (PDF|DOC|DOCX|XLS|XLSX|IMAGE|OTHER)",
  "parsedText": "string? (extracted text content)",
  "createdAt": "ISO string",
  "updatedAt": "ISO string",
  "isDeleted": "boolean (default: false)",
  "deletedAt": "ISO string?",
  "emailId": "string (foreign key)"
}
```

### 4. Extracted Data (`extracted-data.json`)

AI-processed data from emails (one-to-one with emails).

```json
{
  "id": "string (UUID)",
  "jsonBlob": "string (JSON of raw extracted data)",
  "greekFields": "string? (JSON of Greek-specific fields)",
  
  // Customer inquiry fields
  "customerName": "string? (Όνομα)",
  "customerEmail": "string?",
  "customerPhone": "string? (Τηλέφωνο)",
  "company": "string? (Εταιρεία)",
  "serviceInterest": "string? (Υπηρεσία ενδιαφέροντος)",
  
  // Invoice fields
  "invoiceNumber": "string? (Αριθμός τιμολογίου)",
  "invoiceDate": "ISO string? (Ημερομηνία)",
  "invoiceClient": "string? (Πελάτης)",
  "invoiceAmount": "number? (Ποσό)",
  "invoiceVAT": "number? (ΦΠΑ)",
  
  // Processing metadata
  "extractedAt": "ISO string",
  "confidence": "number? (AI confidence score)",
  "createdAt": "ISO string",
  "updatedAt": "ISO string",
  "isDeleted": "boolean (default: false)",
  "deletedAt": "ISO string?",
  "emailId": "string (foreign key, unique)"
}
```

### 5. Notifications (`notifications.json`)

System notifications for users.

```json
{
  "id": "string (UUID)",
  "type": "enum (NEW_EMAIL_FETCHED|EMAIL_PROCESSED|SYSTEM_ALERT|SYNC_COMPLETED|SYNC_ERROR)",
  "title": "string",
  "message": "string",
  "payload": "string? (JSON additional data)",
  "isRead": "boolean (default: false)",
  "readAt": "ISO string?",
  "createdAt": "ISO string",
  "isDeleted": "boolean (default: false)",
  "deletedAt": "ISO string?",
  "userId": "string (foreign key)"
}
```

### 6. Settings (`settings.json`)

System configuration (single object, not array).

```json
{
  "syncInterval": "number (minutes, default: 5)",
  "autoSync": "boolean (default: true)",
  "emailCategories": "array of strings",
  "language": "string (greek|english|both, default: both)",
  "notifications": "boolean (default: true)",
  "lastSync": "ISO string?"
}
```

## Database API Methods

### Email Management

```javascript
// Create new email
await db.createEmail({
  gmailId: 'gmail_message_id',
  subject: 'Email subject',
  body: 'Email content',
  fromAddress: 'sender@example.com',
  toAddress: 'recipient@example.com',
  userId: 'user_id'
});

// Get emails with filters
await db.getEmails({
  status: 'FETCHED',
  category: 'CUSTOMER_INQUIRY', 
  userId: 'user_id'
});

// Move through workflow
await db.moveEmailToReview(emailId);
await db.moveEmailToManaged(emailId);
await db.softDeleteEmail(emailId);
await db.restoreEmail(emailId);
```

### Convenience Methods

```javascript
// Get emails by status
await db.getFetchedEmails(userId);
await db.getReviewEmails(userId); 
await db.getManagedEmails(userId);
await db.getDeletedEmails(userId);

// Statistics
await db.getStats(userId);
// Returns: { fetched, review, managed, deleted, total }
```

### Attachments

```javascript
await db.createAttachment({
  fileName: 'document.pdf',
  filePath: '/uploads/document.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  type: 'PDF',
  emailId: 'email_id'
});

await db.getAttachmentsByEmailId(emailId);
```

### Extracted Data

```javascript
await db.createExtractedData({
  rawData: { /* full AI extraction */ },
  customerName: 'John Doe',
  customerEmail: 'john@example.com',
  emailId: 'email_id'
});

await db.getExtractedDataByEmailId(emailId);
await db.updateExtractedData(emailId, updates);
```

### Notifications

```javascript
await db.createNotification({
  type: 'NEW_EMAIL_FETCHED',
  title: 'New Email',
  message: 'New customer inquiry received',
  userId: 'user_id'
});

await db.getNotifications(userId, onlyUnread=false);
await db.markNotificationAsRead(notificationId);
await db.markAllNotificationsAsRead(userId);
```

## Migration from Old Schema

If you have data in the old format, run the migration script:

```bash
node scripts/migrate-to-new-schema.js
```

This will:
1. Create a backup of existing data
2. Convert old format to new schema
3. Maintain all existing data integrity
4. Clean up old files

## Indices and Performance

For optimal performance, consider these access patterns:

### Frequent Queries:
- Emails by userId + status
- Emails by userId + category  
- Emails by date range
- Notifications by userId + read status
- Extracted data by email fields

### Search and Filtering:
The system supports filtering emails by:
- Status (workflow stage)
- Category (customer inquiry vs invoice)
- Date ranges
- Customer information
- Invoice data

## Soft Delete Strategy

All tables implement soft delete with:
- `isDeleted: boolean` flag
- `deletedAt: ISO string` timestamp

This ensures data integrity and allows for recovery operations while maintaining referential relationships.

## Greek/English Dual Language Support

The system supports both Greek and English content:
- All text fields accept Unicode characters
- Greek field names in comments for clarity
- `greekFields` JSON blob for language-specific extractions
- Dual language AI processing capability
