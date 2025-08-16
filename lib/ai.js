const { OpenAI } = require('openai');
const { ChatOpenAI } = require('@langchain/openai');
const { PromptTemplate } = require('@langchain/core/prompts');
const { LLMChain } = require('langchain/chains');
const retryUtils = require('./retry-utils');

class AIService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        this.llm = new ChatOpenAI({
            openAIApiKey: process.env.OPENAI_API_KEY,
            modelName: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
            temperature: 0.1,
            maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000
        });

        // Cost tracking
        this.requestCount = 0;
        this.tokenUsage = {
            prompt: 0,
            completion: 0,
            total: 0
        };
        this.dailyLimit = parseInt(process.env.AI_DAILY_REQUEST_LIMIT) || 1000;
        this.lastResetDate = new Date().toDateString();

        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
            console.error('WARNING: OPENAI_API_KEY not found or not configured in environment variables');
            this.isConfigured = false;
        } else {
            console.log('OpenAI API key loaded successfully');
            this.isConfigured = true;
        }
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

    updateUsageStats(usage) {
        this.requestCount++;
        if (usage) {
            this.tokenUsage.prompt += usage.prompt_tokens || 0;
            this.tokenUsage.completion += usage.completion_tokens || 0;
            this.tokenUsage.total += usage.total_tokens || 0;
        }
    }

    getUsageStats() {
        return {
            requestCount: this.requestCount,
            tokenUsage: this.tokenUsage,
            dailyLimit: this.dailyLimit,
            remainingRequests: this.dailyLimit - this.requestCount
        };
    }

    async categorizeEmail(subject, body, attachments = []) {
        // Check if AI service is configured
        if (!this.isConfigured) {
            console.warn('AI service not configured, defaulting to "other" category');
            return 'other';
        }

        // Check daily limits
        if (!this.checkDailyLimit()) {
            console.warn('AI daily request limit exceeded, defaulting to "other" category');
            return 'other';
        }

        try {
            const categoryPrompt = new PromptTemplate({
                template: `Analyze this email and categorize it as either "customer_inquiry" or "invoice" or "other".

Email Subject: {subject}
Email Body: {body}
Attachments: {attachments}

Rules:
- "customer_inquiry": Emails asking for information, services, quotes, support, or any customer request
- "invoice": Emails containing invoices, bills, receipts, or payment-related documents
- "other": Everything else that doesn't fit the above categories

Examples of customer inquiries (in Greek or English):
- Θα θέλαμε να μάθουμε τις τιμές σας για...
- Could you please provide a quote for...
- Χρειαζόμαστε υπηρεσίες για...
- We are interested in your services...
- Παρακαλώ στείλτε μας περισσότερες πληροφορίες

Examples of invoices:
- Subject contains: τιμολόγιο, invoice, bill, receipt, payment
- Body contains: amount, total, payment due, invoice number
- PDF attachments with invoice-like names

Respond with ONLY one word: "customer_inquiry", "invoice", or "other"`,
                inputVariables: ['subject', 'body', 'attachments']
            });

            const chain = new LLMChain({ llm: this.llm, prompt: categoryPrompt });

            const attachmentInfo = attachments.map(att => `${att.filename} (${att.mimeType})`).join(', ') || 'None';

            const result = await retryUtils.withRetry(
                async () => await chain.call({
                    subject,
                    body: body.substring(0, 1000), // Limit body length
                    attachments: attachmentInfo
                }),
                {
                    maxAttempts: 3,
                    initialDelay: 2000,
                    onRetry: (error, attempt) => {
                        console.log(`AI categorization retry attempt ${attempt}: ${error.message}`);
                    },
                    shouldRetry: (error) => {
                        // Retry on rate limit or temporary API errors
                        if (error.message && (
                            error.message.includes('rate limit') ||
                            error.message.includes('429') ||
                            error.message.includes('timeout') ||
                            error.message.includes('ECONNRESET')
                        )) {
                            return true;
                        }
                        return false;
                    }
                }
            );

            const category = result.text.toLowerCase().trim();

            // Update usage statistics
            this.updateUsageStats(result.usage);

            // Validate response
            if (['customer_inquiry', 'invoice', 'other'].includes(category)) {
                return category;
            }

            console.warn('AI returned invalid category:', category, 'defaulting to "other"');
            return 'other';
        } catch (error) {
            console.error('Error categorizing email:', error);
            // Update request count even on error
            this.updateUsageStats(null);
            return 'other';
        }
    }

    async batchCategorizeEmails(emails) {
        const results = [];

        // Process emails in batches to avoid rate limits
        const batchSize = 5;
        for (let i = 0; i < emails.length; i += batchSize) {
            const batch = emails.slice(i, i + batchSize);
            const batchPromises = batch.map(email => this.categorizeEmail(
                email.subject,
                email.body,
                email.attachments
            ));

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            // Small delay between batches
            if (i + batchSize < emails.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return results;
    }
}

module.exports = new AIService();
