const { google } = require('googleapis');
const db = require('./database');
const aiService = require('./ai');
const retryUtils = require('./retry-utils');

class GmailService {
    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URL
        );
    }

    getAuthUrl() {
        const scopes = [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email'
        ];

        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent',
            include_granted_scopes: true
        });
    }

    async exchangeCodeForTokens(code) {
        return await retryUtils.withRetry(async () => {
            const response = await this.oauth2Client.getToken(code);
            const tokens = response.tokens;

            if (!tokens) {
                throw new Error('No tokens received from Google OAuth');
            }

            this.oauth2Client.setCredentials(tokens);

            const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
            const { data: userInfo } = await oauth2.userinfo.get();

            if (!userInfo || !userInfo.email) {
                throw new Error('Failed to retrieve user information');
            }

            const userData = {
                id: userInfo.id,
                email: userInfo.email,
                name: userInfo.name,
                picture: userInfo.picture,
                tokens: tokens,
                connectedAt: new Date().toISOString()
            };

            await db.saveUser(userData);
            return userData;
        }, {
            maxAttempts: 3,
            initialDelay: 1000,
            onRetry: (error, attempt) => {
                console.log(`OAuth token exchange retry attempt ${attempt}: ${error.message}`);
            }
        }).catch(error => {
            throw new Error(`OAuth token exchange failed: ${error.message}`);
        });
    }

    async initializeFromStoredTokens() {
        const user = await db.getUser();
        if (!user || !user.tokens) {
            return false;
        }

        this.oauth2Client.setCredentials(user.tokens);

        // Check if tokens need refresh
        if (this.oauth2Client.isTokenExpiring()) {
            try {
                const { credentials } = await this.oauth2Client.refreshAccessToken();
                user.tokens = credentials;
                await db.saveUser(user);
                this.oauth2Client.setCredentials(credentials);
            } catch (error) {
                return false;
            }
        }

        return true;
    }

    async fetchEmails(maxResults = 50, query = 'is:unread') {
        const isInitialized = await this.initializeFromStoredTokens();
        if (!isInitialized) {
            throw new Error('Gmail not connected or tokens expired');
        }

        try {
            const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

            // Get list of messages with retry logic
            const { data: messagesList } = await retryUtils.withRetry(
                async () => await gmail.users.messages.list({
                    userId: 'me',
                    maxResults,
                    q: query
                }),
                {
                    maxAttempts: 3,
                    initialDelay: 1000,
                    onRetry: (error, attempt) => {
                        console.log(`Gmail message list retry attempt ${attempt}: ${error.message}`);
                        // Log quota exceeded errors specifically
                        if (error.code === 429 || error.message.includes('quota')) {
                            console.error('Gmail API quota exceeded:', error.message);
                        }
                    },
                    shouldRetry: (error) => {
                        // Don't retry on authentication errors
                        if (error.code === 401 || error.code === 403) {
                            return false;
                        }
                        return true;
                    }
                }
            );

            if (!messagesList.messages) {
                return [];
            }

            // Get full message details with retry logic
            const emailPromises = messagesList.messages.map(async (message) => {
                const { data: fullMessage } = await retryUtils.withRetry(
                    async () => await gmail.users.messages.get({
                        userId: 'me',
                        id: message.id,
                        format: 'full'
                    }),
                    {
                        maxAttempts: 3,
                        initialDelay: 500,
                        onRetry: (error, attempt) => {
                            console.log(`Gmail message get retry for ${message.id}, attempt ${attempt}: ${error.message}`);
                        }
                    }
                );

                return this.parseGmailMessage(fullMessage);
            });

            const emails = await Promise.all(emailPromises);
            return emails.filter(email => email !== null);
        } catch (error) {
            throw error;
        }
    }

    async syncOldEmails(fromDate, toDate, maxResults = 100) {
        try {
            const startTime = Date.now();

            // Build Gmail search query for date range
            const fromFormatted = new Date(fromDate).toISOString().split('T')[0].replace(/-/g, '/');
            const toFormatted = new Date(toDate).toISOString().split('T')[0].replace(/-/g, '/');
            const query = `after:${fromFormatted} before:${toFormatted}`;

            // Fetch emails from Gmail
            const rawEmails = await this.fetchEmails(maxResults, query);

            if (rawEmails.length === 0) {
                return { count: 0, categorized: 0, errors: 0, skipped: 0 };
            }

            // AI Categorization Integration
            const categorizedEmails = [];
            const errors = [];
            let skipped = 0;

            // Process emails in batches to respect AI API limits
            const batchSize = parseInt(process.env.AI_BATCH_SIZE) || 5;
            const batchDelay = parseInt(process.env.AI_BATCH_DELAY) || 1000;

            for (let i = 0; i < rawEmails.length; i += batchSize) {
                const batch = rawEmails.slice(i, i + batchSize);

                try {
                    // Process batch with AI categorization
                    const batchResults = await Promise.allSettled(
                        batch.map(async (email) => {
                            try {
                                // AI Categorization
                                const category = await aiService.categorizeEmail(
                                    email.subject,
                                    email.body,
                                    email.attachments || []
                                );

                                return {
                                    ...email,
                                    category: category || 'other',
                                    fromAddress: this.extractEmailAddress(email.from),
                                    fromName: this.extractDisplayName(email.from),
                                    toAddress: this.extractEmailAddress(email.to),
                                    userId: 'single-user' // Single user system
                                };
                            } catch (error) {
                                return {
                                    ...email,
                                    category: 'other', // Fallback category
                                    fromAddress: this.extractEmailAddress(email.from),
                                    fromName: this.extractDisplayName(email.from),
                                    toAddress: this.extractEmailAddress(email.to),
                                    userId: 'single-user'
                                };
                            }
                        })
                    );

                    // Process results
                    batchResults.forEach((result, index) => {
                        if (result.status === 'fulfilled') {
                            categorizedEmails.push(result.value);
                        } else {
                            errors.push({
                                email: batch[index],
                                error: result.reason
                            });
                        }
                    });

                    // Delay between batches to respect rate limits
                    if (i + batchSize < rawEmails.length) {
                        await new Promise(resolve => setTimeout(resolve, batchDelay));
                    }

                } catch (error) {
                    // Add batch to errors and continue
                    batch.forEach(email => {
                        errors.push({ email, error });
                        // Add without categorization as fallback
                        categorizedEmails.push({
                            ...email,
                            category: 'other',
                            fromAddress: this.extractEmailAddress(email.from),
                            fromName: this.extractDisplayName(email.from),
                            toAddress: this.extractEmailAddress(email.to),
                            userId: 'single-user'
                        });
                    });
                }
            }

            // Save categorized emails to database with duplicate check
            const savedEmails = await db.addMultipleFetchedEmails(categorizedEmails);
            skipped = categorizedEmails.length - savedEmails.length;

            // Create notifications for successful sync
            if (savedEmails.length > 0) {
                await this.createOldEmailsSyncNotification(savedEmails, fromDate, toDate);
            }


            return {
                count: savedEmails.length,
                categorized: savedEmails.filter(e => e.category !== 'other').length,
                errors: errors.length,
                skipped,
                duration: Date.now() - startTime
            };

        } catch (error) {
            throw error;
        }
    }

    async createOldEmailsSyncNotification(savedEmails, fromDate, toDate) {
        const categoryStats = savedEmails.reduce((acc, email) => {
            acc[email.category] = (acc[email.category] || 0) + 1;
            return acc;
        }, {});

        let message = `${savedEmails.length} old emails fetched from ${fromDate} to ${toDate}`;
        if (categoryStats.customer_inquiry) {
            message += `, ${categoryStats.customer_inquiry} customer inquiries`;
        }
        if (categoryStats.invoice) {
            message += `, ${categoryStats.invoice} invoices`;
        }

        await db.createNotification({
            type: 'OLD_EMAILS_FETCHED',
            title: 'Old Emails Synced',
            message,
            payload: {
                count: savedEmails.length,
                categoryStats,
                emailIds: savedEmails.map(e => e.id),
                dateRange: { fromDate, toDate }
            },
            userId: 'single-user'
        });

        // Send real-time notification for old emails too
        global.notificationClients?.forEach(client => {
            if (client.response && !client.response.destroyed) {
                client.response.write(`data: ${JSON.stringify({
                    type: 'new_emails_fetched',
                    count: savedEmails.length,
                    categoryStats
                })}\n\n`);
            }
        });
    }

    parseGmailMessage(message) {
        try {
            const headers = message.payload.headers;
            const subject = this.getHeader(headers, 'Subject');
            const from = this.getHeader(headers, 'From');
            const to = this.getHeader(headers, 'To');
            const date = this.getHeader(headers, 'Date');

            // Extract body
            let body = '';
            let attachments = [];

            if (message.payload.body && message.payload.body.data) {
                body = this.decodeBase64(message.payload.body.data);
            } else if (message.payload.parts) {
                const textPart = this.findPart(message.payload.parts, 'text/plain') ||
                    this.findPart(message.payload.parts, 'text/html');

                if (textPart && textPart.body && textPart.body.data) {
                    body = this.decodeBase64(textPart.body.data);
                }

                // Extract attachments
                attachments = this.extractAttachments(message.payload.parts);
            }

            return {
                gmailId: message.id,
                threadId: message.threadId,
                subject: subject || 'No Subject',
                from: from || 'Unknown Sender',
                to: to || '',
                date: date ? new Date(date).toISOString() : new Date().toISOString(),
                body: this.cleanBody(body),
                attachments,
                labelIds: message.labelIds || [],
                snippet: message.snippet || ''
            };
        } catch (error) {
            return null;
        }
    }

    getHeader(headers, name) {
        const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        return header ? header.value : null;
    }

    findPart(parts, mimeType) {
        for (const part of parts) {
            if (part.mimeType === mimeType) {
                return part;
            }
            if (part.parts) {
                const found = this.findPart(part.parts, mimeType);
                if (found) return found;
            }
        }
        return null;
    }

    extractAttachments(parts) {
        const attachments = [];

        const extractFromParts = (partsList) => {
            for (const part of partsList) {
                if (part.filename && part.filename.length > 0) {
                    attachments.push({
                        filename: part.filename,
                        mimeType: part.mimeType,
                        size: part.body.size || 0,
                        attachmentId: part.body.attachmentId
                    });
                }

                if (part.parts) {
                    extractFromParts(part.parts);
                }
            }
        };

        extractFromParts(parts);
        return attachments;
    }

    decodeBase64(data) {
        const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
        return Buffer.from(base64, 'base64').toString('utf-8');
    }

    cleanBody(body) {
        let cleaned = body.replace(/<[^>]*>/g, '');
        cleaned = cleaned.replace(/&nbsp;/g, ' ');
        cleaned = cleaned.replace(/&lt;/g, '<');
        cleaned = cleaned.replace(/&gt;/g, '>');
        cleaned = cleaned.replace(/&amp;/g, '&');
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        return cleaned;
    }

    async disconnect() {
        await db.removeUser();
        this.oauth2Client.setCredentials({});
    }

    async getConnectedUser() {
        return await db.getUser();
    }

    async syncEmails() {
        try {
            const startTime = Date.now();

            // Initialize from stored tokens
            const isInitialized = await this.initializeFromStoredTokens();
            if (!isInitialized) {
                throw new Error('Gmail not connected or tokens expired');
            }

            // Build query to fetch emails since last sync
            let query = 'in:inbox';

            // Get last sync time to fetch only new emails
            const settings = await db.getSettings();
            if (settings.lastSync) {
                const lastSyncDate = new Date(settings.lastSync);
                const formattedDate = lastSyncDate.toISOString().split('T')[0].replace(/-/g, '/');
                query += ` after:${formattedDate}`;
            }

            // Fetch emails from Gmail
            const rawEmails = await this.fetchEmails(process.env.MAX_EMAILS_PER_SYNC || 50, query);

            if (rawEmails.length === 0) {
                await this.updateLastSync();
                return { count: 0, categorized: 0, errors: 0 };
            }

            // AI Categorization Integration
            const categorizedEmails = [];
            const errors = [];

            // Process emails in batches to respect AI API limits
            const batchSize = parseInt(process.env.AI_BATCH_SIZE) || 5;
            const batchDelay = parseInt(process.env.AI_BATCH_DELAY) || 1000;

            for (let i = 0; i < rawEmails.length; i += batchSize) {
                const batch = rawEmails.slice(i, i + batchSize);

                try {
                    // Process batch with AI categorization
                    const batchResults = await Promise.allSettled(
                        batch.map(async (email) => {
                            try {
                                // AI Categorization
                                const category = await aiService.categorizeEmail(
                                    email.subject,
                                    email.body,
                                    email.attachments || []
                                );

                                return {
                                    ...email,
                                    category: category || 'other',
                                    fromAddress: this.extractEmailAddress(email.from),
                                    fromName: this.extractDisplayName(email.from),
                                    toAddress: this.extractEmailAddress(email.to),
                                    userId: 'single-user' // Single user system
                                };
                            } catch (error) {
                                return {
                                    ...email,
                                    category: 'other', // Fallback category
                                    fromAddress: this.extractEmailAddress(email.from),
                                    fromName: this.extractDisplayName(email.from),
                                    toAddress: this.extractEmailAddress(email.to),
                                    userId: 'single-user'
                                };
                            }
                        })
                    );

                    // Process results
                    batchResults.forEach((result, index) => {
                        if (result.status === 'fulfilled') {
                            categorizedEmails.push(result.value);
                        } else {
                            errors.push({
                                email: batch[index],
                                error: result.reason
                            });
                        }
                    });

                    // Delay between batches to respect rate limits
                    if (i + batchSize < rawEmails.length) {
                        await new Promise(resolve => setTimeout(resolve, batchDelay));
                    }

                } catch (error) {
                    // Add batch to errors and continue
                    batch.forEach(email => {
                        errors.push({ email, error });
                        // Add without categorization as fallback
                        categorizedEmails.push({
                            ...email,
                            category: 'other',
                            fromAddress: this.extractEmailAddress(email.from),
                            fromName: this.extractDisplayName(email.from),
                            toAddress: this.extractEmailAddress(email.to),
                            userId: 'single-user'
                        });
                    });
                }
            }

            // Save categorized emails to database
            const savedEmails = await db.addMultipleFetchedEmails(categorizedEmails);

            // Create notifications for successful sync
            if (savedEmails.length > 0) {
                await this.createSyncNotification(savedEmails);
            }

            // Update sync statistics and last sync time
            await this.updateSyncStats(savedEmails.length, errors.length);
            await this.updateLastSync();

            return {
                count: savedEmails.length,
                categorized: savedEmails.filter(e => e.category !== 'other').length,
                errors: errors.length,
                duration: Date.now() - startTime
            };

        } catch (error) {
            throw error;
        }
    }

    async createSyncNotification(savedEmails) {
        const categoryStats = savedEmails.reduce((acc, email) => {
            acc[email.category] = (acc[email.category] || 0) + 1;
            return acc;
        }, {});

        let message = `${savedEmails.length} new emails fetched`;
        if (categoryStats.customer_inquiry) {
            message += `, ${categoryStats.customer_inquiry} customer inquiries`;
        }
        if (categoryStats.invoice) {
            message += `, ${categoryStats.invoice} invoices`;
        }

        await db.createNotification({
            type: 'NEW_EMAIL_FETCHED',
            title: 'New Emails Synced',
            message,
            payload: {
                count: savedEmails.length,
                categoryStats,
                emailIds: savedEmails.map(e => e.id)
            },
            userId: 'single-user'
        });

        // Send real-time notification
        global.notificationClients?.forEach(client => {
            if (client.response && !client.response.destroyed) {
                client.response.write(`data: ${JSON.stringify({
                    type: 'new_emails_fetched',
                    count: savedEmails.length,
                    categoryStats
                })}\n\n`);
            }
        });
    }

    async updateLastSync() {
        await db.updateSettings({
            lastSync: new Date().toISOString()
        });
    }

    async updateSyncStats(successful, failed) {
        const settings = await db.getSettings();
        const stats = settings.syncStats || { total: 0, successful: 0, failed: 0 };

        await db.updateSettings({
            syncStats: {
                total: stats.total + successful + failed,
                successful: stats.successful + successful,
                failed: stats.failed + failed,
                lastSync: new Date().toISOString()
            }
        });
    }

    extractEmailAddress(emailString) {
        if (!emailString) return '';
        const match = emailString.match(/<([^>]+)>/);
        return match ? match[1] : emailString.trim();
    }

    extractDisplayName(emailString) {
        if (!emailString) return null;
        const match = emailString.match(/^([^<]+)</);
        return match ? match[1].trim().replace(/"/g, '') : null;
    }
}

module.exports = new GmailService();
