const { OpenAI } = require('openai');
const { ChatOpenAI } = require('@langchain/openai');
const { PromptTemplate } = require('@langchain/core/prompts');
const { LLMChain } = require('langchain/chains');
const pdfProcessor = require('./pdf-processor');

/**
 * Dedicated AI Data Extraction Agent
 * This agent is specifically designed to extract structured data from approved emails
 * Separate from categorization - this runs AFTER an email has been approved for processing
 */
class AIExtractionAgent {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        this.llm = new ChatOpenAI({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
            temperature: 0.1,
            maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1500 // Higher limit for extraction
        });

        // Cost tracking for extraction operations
        this.requestCount = 0;
        this.tokenUsage = {
            prompt: 0,
            completion: 0,
            total: 0
        };

        // OAuth2 client for PDF processing
        this.oauth2Client = null;
        this.dailyLimit = parseInt(process.env.AI_EXTRACTION_DAILY_LIMIT) || 500; // Lower limit for extraction
        this.lastResetDate = new Date().toDateString();
        this.extractionStats = {
            successful: 0,
            failed: 0,
            byCategory: {}
        };

        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
            console.error('WARNING: OPENAI_API_KEY not found or not configured in environment variables');
            this.isConfigured = false;
        } else {
            console.log('AI Extraction Agent: OpenAI API key loaded successfully');
            this.isConfigured = true;
        }
    }

    /**
     * Set OAuth2 client for PDF processing
     * @param {Object} oauth2Client - Configured OAuth2 client
     */
    setOAuth2Client(oauth2Client) {
        this.oauth2Client = oauth2Client;
        pdfProcessor.setOAuth2Client(oauth2Client);
    }

    checkDailyLimit() {
        const today = new Date().toDateString();
        if (this.lastResetDate !== today) {
            this.requestCount = 0;
            this.tokenUsage = { prompt: 0, completion: 0, total: 0 };
            this.lastResetDate = today;
        }

        return this.requestCount < this.dailyLimit;
    }

    updateUsageStats(usage, success = true, category = 'unknown') {
        this.requestCount++;
        if (usage) {
            this.tokenUsage.prompt += usage.prompt_tokens || 0;
            this.tokenUsage.completion += usage.completion_tokens || 0;
            this.tokenUsage.total += usage.total_tokens || 0;
        }

        // Update extraction stats
        if (success) {
            this.extractionStats.successful++;
        } else {
            this.extractionStats.failed++;
        }

        this.extractionStats.byCategory[category] = (this.extractionStats.byCategory[category] || 0) + 1;
    }

    getUsageStats() {
        return {
            requestCount: this.requestCount,
            tokenUsage: this.tokenUsage,
            dailyLimit: this.dailyLimit,
            remainingRequests: this.dailyLimit - this.requestCount,
            extractionStats: this.extractionStats
        };
    }

    /**
     * Main extraction method - determines type and extracts appropriate data
     * @param {Object} email - Email object with subject, body, category
     * @returns {Object} - Extracted data structure
     */
    async extractData(email) {
        const category = email.category?.toLowerCase() || 'unknown';

        // Check if AI service is configured
        if (!this.isConfigured) {
            console.warn('AI Extraction Agent not configured, skipping extraction');
            this.updateUsageStats(null, false, category);
            return {
                success: false,
                category,
                extractedData: null,
                error: 'AI service not configured'
            };
        }

        // Check daily limits
        if (!this.checkDailyLimit()) {
            console.warn('AI extraction daily limit exceeded, skipping extraction');
            this.updateUsageStats(null, false, category);
            return {
                success: false,
                category,
                extractedData: null,
                error: 'Daily extraction limit exceeded'
            };
        }

        try {
            // Route to appropriate extraction method based on category
            let extractedData = null;
            let usage = null;

            if (category === 'customer_inquiry') {
                const result = await this.extractCustomerInquiryData(email.subject, email.body);
                extractedData = result.data;
                usage = result.usage;
            } else if (category === 'invoice') {
                const result = await this.extractInvoiceData(email.subject, email.body, email.attachments || [], email.gmailId);
                extractedData = result.data;
                usage = result.usage;
            } else {
                console.log(`❌ Unsupported category for extraction: ${category}`);
                this.updateUsageStats(null, false, category);
                return {
                    success: false,
                    category,
                    extractedData: null,
                    error: 'Unsupported category for data extraction'
                };
            }

            // Update usage statistics
            this.updateUsageStats(usage, true, category);

            return {
                success: true,
                category,
                extractedData,
                extractedAt: new Date().toISOString(),
                agent: 'ai-extractor-v2'
            };

        } catch (error) {
            console.error('❌ AI Extraction Agent error:', error);
            this.updateUsageStats(null, false, category);
            return {
                success: false,
                category,
                extractedData: null,
                error: error.message,
                extractedAt: new Date().toISOString()
            };
        }
    }

    /**
     * Extract customer inquiry data (name, email, phone, company, service interest)
     */
    async extractCustomerInquiryData(subject, body) {
        const retryUtils = require('./retry-utils');

        try {
            const extractionPrompt = new PromptTemplate({
                template: `You are a specialized AI data extraction agent. Your task is to extract customer information from business inquiry emails.

Email Subject: {subject}
Email Body: {body}

Extract the following customer information and return as valid JSON:
{{
  "customerName": "Full customer name (Όνομα/Name) or null",
  "customerEmail": "Customer email address or null",
  "customerPhone": "Customer phone number (Τηλέφωνο/Phone) or null",
  "company": "Company name (Εταιρεία/Company) or null",
  "serviceInterest": "Service or product they're interested in (Υπηρεσία/Service) or null",
  "location": "Customer location/address if mentioned or null",
  "budget": "Budget mentioned if any or null",
  "timeline": "Timeline/deadline mentioned if any or null",
  "additionalNotes": "Any other relevant business details or null"
}}

EXTRACTION RULES:
1. Support both Greek and English text
2. Look for contact information in signatures, email body, or headers
3. For Greek text, look for: Όνομα, Επωνυμία, Τηλ, Κιν, Email, Εταιρεία, Διεύθυνση
4. For English text, look for: Name, Tel, Phone, Email, Company, Address
5. Phone patterns: +30, 210, 694, 69X, etc.
6. If information is clearly not found, use null (not empty string)
7. Return ONLY valid JSON, no additional text
8. Extract service interest from email content context

Examples to look for:
- "Με εκτίμηση, [Name]" / "Best regards, [Name]"
- Email signatures with contact details
- "Ονομάζομαι..." / "My name is..."
- "Εταιρεία μας..." / "Our company..."
- Service requests like "website development", "e-commerce", etc.`,
                inputVariables: ['subject', 'body']
            });

            const chain = new LLMChain({ llm: this.llm, prompt: extractionPrompt });

            const result = await retryUtils.withRetry(
                async () => await chain.call({
                    subject,
                    body: body.substring(0, 2000) // Limit body length for processing
                }),
                {
                    maxAttempts: 2, // Fewer retries for extraction to save costs
                    initialDelay: 1500,
                    onRetry: (error, attempt) => {
                        console.log(`AI extraction retry attempt ${attempt}: ${error.message}`);
                    },
                    shouldRetry: (error) => {
                        // Retry on rate limit or temporary API errors
                        if (error.message && (
                            error.message.includes('rate limit') ||
                            error.message.includes('429') ||
                            error.message.includes('timeout')
                        )) {
                            return true;
                        }
                        return false;
                    }
                }
            );

            try {
                const parsed = JSON.parse(result.text.trim());
                return {
                    data: parsed,
                    usage: result.usage
                };
            } catch (parseError) {
                console.error('❌ Failed to parse customer data JSON:', parseError);
                console.error('Raw text was:', result.text);
                return {
                    data: {
                        customerName: null,
                        customerEmail: null,
                        customerPhone: null,
                        company: null,
                        serviceInterest: null,
                        location: null,
                        budget: null,
                        timeline: null,
                        additionalNotes: null
                    },
                    usage: result.usage
                };
            }
        } catch (error) {
            console.error('❌ Customer inquiry extraction error:', error);
            throw error;
        }
    }

    /**
     * Extract invoice data (invoice number, date, customer, amount, VAT)
     * Now includes PDF content processing for better accuracy
     */
    async extractInvoiceData(subject, body, attachments = [], gmailId = null) {
        const retryUtils = require('./retry-utils');

        try {
            // Process PDF attachments to extract their content
            let pdfContent = '';
            if (attachments && attachments.length > 0 && gmailId && this.oauth2Client) {
                console.log('📄 Processing PDF attachments for invoice data extraction...');
                pdfContent = await pdfProcessor.extractPDFContent(attachments, gmailId);
            }

            const extractionPrompt = new PromptTemplate({
                template: `You are a specialized AI invoice data extraction agent. Your task is to extract invoice information from emails and PDF attachments.

Email Subject: {subject}
Email Body: {body}
Attachments: {attachments}
PDF Content: {pdfContent}

Extract the following invoice information and return as valid JSON:
{{
  "invoiceNumber": "Invoice number (Αριθμός τιμολογίου/Invoice #) or null",
  "invoiceDate": "Invoice date in YYYY-MM-DD format (Ημερομηνία) or null",
  "customerName": "Customer/client name (Πελάτης/Client) or null",
  "totalAmount": "Total amount as number without currency (Συνολικό ποσό) or null",
  "vatAmount": "VAT amount as number (ΦΠΑ/VAT) or null",
  "currency": "Currency (EUR, USD, etc.) or null",
  "dueDate": "Payment due date in YYYY-MM-DD format or null",
  "paymentStatus": "Payment status if mentioned (paid, pending, overdue) or null",
  "description": "Invoice description or services provided or null"
}}

EXTRACTION RULES:
1. Support both Greek and English text
2. Look for invoice numbers, dates, amounts in email content, attachment names, AND PDF content
3. PRIORITIZE PDF content over email body when both are available (PDFs usually contain the actual invoice)
4. For Greek text, look for: Αριθμός, Ημερομηνία, Πελάτης, Ποσό, ΦΠΑ, Σύνολο, Τιμολόγιο
5. For English text, look for: Invoice #, Number, Date, Amount, Total, VAT, Tax, Customer
6. Convert dates to ISO format (YYYY-MM-DD) if found
7. Extract amounts as numbers without currency symbols (e.g., 1500.00, not €1,500.00)
8. If information is not found, use null
9. Return ONLY valid JSON, no additional text

Common patterns:
- "Invoice #12345" / "Τιμολόγιο Αρ. 12345"
- "Date: 2024-01-15" / "Ημερομηνία: 15/01/2024"
- "Total: €1,500.00" / "Σύνολο: 1.500,00€"
- "VAT: €360.00" / "ΦΠΑ: 360,00€"
- PDF attachments: "invoice_123.pdf", "bill_456.pdf"

IMPORTANT: If PDF content is provided, use it as the primary source for invoice data extraction.`,
                inputVariables: ['subject', 'body', 'attachments', 'pdfContent']
            });

            const chain = new LLMChain({ llm: this.llm, prompt: extractionPrompt });

            const attachmentInfo = attachments.map(att => `${att.filename} (${att.mimeType})`).join(', ') || 'None';

            // Log PDF processing results
            if (pdfContent) {
                console.log(`📄 Including ${pdfContent.length} characters of PDF content in invoice extraction`);
            }

            const result = await retryUtils.withRetry(
                async () => await chain.call({
                    subject,
                    body: body.substring(0, 2000),
                    attachments: attachmentInfo,
                    pdfContent: pdfContent || 'No PDF content available'
                }),
                {
                    maxAttempts: 2,
                    initialDelay: 1500,
                    onRetry: (error, attempt) => {
                        console.log(`AI invoice extraction retry attempt ${attempt}: ${error.message}`);
                    },
                    shouldRetry: (error) => {
                        if (error.message && (
                            error.message.includes('rate limit') ||
                            error.message.includes('429') ||
                            error.message.includes('timeout')
                        )) {
                            return true;
                        }
                        return false;
                    }
                }
            );

            try {
                const parsed = JSON.parse(result.text.trim());
                return {
                    data: parsed,
                    usage: result.usage
                };
            } catch (parseError) {
                console.error('❌ Failed to parse invoice data JSON:', parseError);
                console.error('Raw text was:', result.text);
                return {
                    data: {
                        invoiceNumber: null,
                        invoiceDate: null,
                        customerName: null,
                        totalAmount: null,
                        vatAmount: null,
                        currency: null,
                        dueDate: null,
                        paymentStatus: null,
                        description: null
                    },
                    usage: result.usage
                };
            }
        } catch (error) {
            console.error('❌ Invoice extraction error:', error);
            throw error;
        }
    }

    /**
     * Batch extract data from multiple emails
     * @param {Array} emails - Array of email objects
     * @returns {Array} - Array of extraction results
     */
    async batchExtractData(emails) {
        const results = [];

        // Check if we have enough quota for the batch
        const remainingRequests = this.dailyLimit - this.requestCount;
        if (emails.length > remainingRequests) {
            console.warn(`Batch size (${emails.length}) exceeds remaining quota (${remainingRequests}). Processing only ${remainingRequests} emails.`);
            emails = emails.slice(0, remainingRequests);
        }

        // Process emails in smaller batches to avoid rate limits and manage costs
        const batchSize = parseInt(process.env.AI_EXTRACTION_BATCH_SIZE) || 2; // Even smaller for extraction
        const batchDelay = parseInt(process.env.AI_EXTRACTION_BATCH_DELAY) || 3000; // Longer delay

        console.log(`Starting batch extraction of ${emails.length} emails in batches of ${batchSize}`);

        for (let i = 0; i < emails.length; i += batchSize) {
            // Check quota before each batch
            if (!this.checkDailyLimit()) {
                console.warn('Daily limit reached during batch processing. Stopping.');
                break;
            }

            const batch = emails.slice(i, i + batchSize);
            console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(emails.length / batchSize)}`);

            const batchPromises = batch.map(email => this.extractData(email));
            const batchResults = await Promise.all(batchPromises);

            results.push(...batchResults);

            // Delay between batches (except for the last batch)
            if (i + batchSize < emails.length) {
                console.log(`Waiting ${batchDelay}ms before next batch...`);
                await new Promise(resolve => setTimeout(resolve, batchDelay));
            }
        }

        console.log(`Batch extraction completed. Processed ${results.length} emails.`);
        return results;
    }

    /**
     * Get extraction statistics
     */
    getExtractionStats(results = []) {
        const total = results.length;
        const successful = results.filter(r => r.success).length;
        const failed = total - successful;

        const byCategory = results.reduce((acc, result) => {
            const category = result.category || 'unknown';
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {});

        return {
            total,
            successful,
            failed,
            successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
            byCategory,
            // Include usage statistics
            usage: this.getUsageStats(),
            isConfigured: this.isConfigured,
            dailyLimitStatus: {
                used: this.requestCount,
                limit: this.dailyLimit,
                remaining: this.dailyLimit - this.requestCount,
                percentage: Math.round((this.requestCount / this.dailyLimit) * 100)
            }
        };
    }

    /**
     * Reset daily statistics (for testing or manual reset)
     */
    resetDailyStats() {
        this.requestCount = 0;
        this.tokenUsage = { prompt: 0, completion: 0, total: 0 };
        this.extractionStats = { successful: 0, failed: 0, byCategory: {} };
        this.lastResetDate = new Date().toDateString();
        console.log('AI Extraction Agent daily stats reset');
    }
}

module.exports = new AIExtractionAgent();
