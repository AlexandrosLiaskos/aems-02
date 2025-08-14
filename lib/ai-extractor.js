const { OpenAI } = require('openai');
const { ChatOpenAI } = require('@langchain/openai');
const { PromptTemplate } = require('@langchain/core/prompts');
const { LLMChain } = require('langchain/chains');

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
      modelName: 'gpt-3.5-turbo',
      temperature: 0.1
    });
    
    if (!process.env.OPENAI_API_KEY) {
      console.error('WARNING: OPENAI_API_KEY not found in environment variables');
    } else {
      console.log('AI Extraction Agent: OpenAI API key loaded successfully');
    }
  }

  /**
   * Main extraction method - determines type and extracts appropriate data
   * @param {Object} email - Email object with subject, body, category
   * @returns {Object} - Extracted data structure
   */
  async extractData(email) {
    try {
      console.log('=== AI EXTRACTION AGENT ACTIVATED ===');
      console.log(`Processing email: "${email.subject}"`);
      console.log(`Category: ${email.category}`);
      
      const category = email.category.toLowerCase();
      
      // Route to appropriate extraction method based on category
      let extractedData = null;
      
      if (category === 'customer_inquiry') {
        console.log('🔍 Extracting customer inquiry data...');
        extractedData = await this.extractCustomerInquiryData(email.subject, email.body);
      } else if (category === 'invoice') {
        console.log('🧾 Extracting invoice data...');
        extractedData = await this.extractInvoiceData(email.subject, email.body, email.attachments || []);
      } else {
        console.log(`❌ Unsupported category for extraction: ${category}`);
        return {
          success: false,
          category,
          extractedData: null,
          error: 'Unsupported category for data extraction'
        };
      }

      console.log('✅ AI extraction completed successfully');
      return {
        success: true,
        category,
        extractedData,
        extractedAt: new Date().toISOString(),
        agent: 'ai-extractor-v1'
      };

    } catch (error) {
      console.error('❌ AI Extraction Agent error:', error);
      return {
        success: false,
        category: email.category,
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
    try {
      console.log('📋 Customer Inquiry Extraction - Analyzing content...');
      console.log(`Subject: ${subject}`);
      console.log(`Body preview: ${body.substring(0, 200)}...`);
      
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
      
      const result = await chain.call({
        subject,
        body: body.substring(0, 2000) // Limit body length for processing
      });

      console.log('🔍 Raw extraction result:', result.text);

      try {
        const parsed = JSON.parse(result.text.trim());
        console.log('✅ Customer data extracted successfully:', JSON.stringify(parsed, null, 2));
        return parsed;
      } catch (parseError) {
        console.error('❌ Failed to parse customer data JSON:', parseError);
        console.error('Raw text was:', result.text);
        return {
          customerName: null,
          customerEmail: null,
          customerPhone: null,
          company: null,
          serviceInterest: null,
          location: null,
          budget: null,
          timeline: null,
          additionalNotes: null
        };
      }
    } catch (error) {
      console.error('❌ Customer inquiry extraction error:', error);
      throw error;
    }
  }

  /**
   * Extract invoice data (invoice number, date, customer, amount, VAT)
   */
  async extractInvoiceData(subject, body, attachments = []) {
    try {
      console.log('💰 Invoice Extraction - Analyzing content...');
      console.log(`Subject: ${subject}`);
      console.log(`Body preview: ${body.substring(0, 200)}...`);
      console.log(`Attachments: ${attachments.map(a => a.filename).join(', ') || 'None'}`);
      
      const extractionPrompt = new PromptTemplate({
        template: `You are a specialized AI invoice data extraction agent. Your task is to extract invoice information from emails.

Email Subject: {subject}
Email Body: {body}
Attachments: {attachments}

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
2. Look for invoice numbers, dates, amounts in email content and attachment names
3. For Greek text, look for: Αριθμός, Ημερομηνία, Πελάτης, Ποσό, ΦΠΑ, Σύνολο, Τιμολόγιο
4. For English text, look for: Invoice #, Number, Date, Amount, Total, VAT, Tax, Customer
5. Convert dates to ISO format (YYYY-MM-DD) if found
6. Extract amounts as numbers without currency symbols (e.g., 1500.00, not €1,500.00)
7. If information is not found, use null
8. Return ONLY valid JSON, no additional text

Common patterns:
- "Invoice #12345" / "Τιμολόγιο Αρ. 12345"
- "Date: 2024-01-15" / "Ημερομηνία: 15/01/2024"
- "Total: €1,500.00" / "Σύνολο: 1.500,00€"
- "VAT: €360.00" / "ΦΠΑ: 360,00€"
- PDF attachments: "invoice_123.pdf", "bill_456.pdf"`,
        inputVariables: ['subject', 'body', 'attachments']
      });

      const chain = new LLMChain({ llm: this.llm, prompt: extractionPrompt });
      
      const attachmentInfo = attachments.map(att => `${att.filename} (${att.mimeType})`).join(', ') || 'None';
      
      const result = await chain.call({
        subject,
        body: body.substring(0, 2000),
        attachments: attachmentInfo
      });

      console.log('🔍 Raw extraction result:', result.text);

      try {
        const parsed = JSON.parse(result.text.trim());
        console.log('✅ Invoice data extracted successfully:', JSON.stringify(parsed, null, 2));
        return parsed;
      } catch (parseError) {
        console.error('❌ Failed to parse invoice data JSON:', parseError);
        console.error('Raw text was:', result.text);
        return {
          invoiceNumber: null,
          invoiceDate: null,
          customerName: null,
          totalAmount: null,
          vatAmount: null,
          currency: null,
          dueDate: null,
          paymentStatus: null,
          description: null
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
    console.log(`🚀 AI Extraction Agent: Processing ${emails.length} emails in batch`);
    const results = [];
    
    // Process emails in batches to avoid rate limits
    const batchSize = 3; // Smaller batch size for extraction (more complex processing)
    const batchDelay = 2000; // Longer delay between batches
    
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(emails.length/batchSize)}`);
      
      const batchPromises = batch.map(email => this.extractData(email));
      const batchResults = await Promise.all(batchPromises);
      
      results.push(...batchResults);
      
      // Delay between batches
      if (i + batchSize < emails.length) {
        console.log(`⏳ Waiting ${batchDelay}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Batch extraction completed: ${successCount}/${emails.length} successful`);
    
    return results;
  }

  /**
   * Get extraction statistics
   */
  getExtractionStats(results) {
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
      byCategory
    };
  }
}

module.exports = new AIExtractionAgent();