const { OpenAI } = require('openai');
const { ChatOpenAI } = require('@langchain/openai');
const { PromptTemplate } = require('@langchain/core/prompts');
const { LLMChain } = require('langchain/chains');

class AIService {
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
      console.log('OpenAI API key loaded successfully');
    }
  }

  async categorizeEmail(subject, body, attachments = []) {
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
      
      const result = await chain.call({
        subject,
        body: body.substring(0, 1000), // Limit body length
        attachments: attachmentInfo
      });

      const category = result.text.toLowerCase().trim();
      
      // Validate response
      if (['customer_inquiry', 'invoice', 'other'].includes(category)) {
        return category;
      }
      
      return 'other';
    } catch (error) {
      console.error('Error categorizing email:', error);
      return 'other';
    }
  }

  async extractCustomerInfo(subject, body) {
    try {
      console.log('=== EXTRACTING CUSTOMER INFO ===');
      console.log('Subject:', subject);
      console.log('Body preview:', body.substring(0, 300));
      
      const extractionPrompt = new PromptTemplate({
        template: `Extract customer information from this email. Support both Greek and English text.

Email Subject: {subject}
Email Body: {body}

Extract the following information and return as JSON:
{{
  "name": "Customer name (Όνομα) or null",
  "email": "Customer email or null", 
  "phone": "Customer phone (Τηλέφωνο) or null",
  "company": "Customer company (Εταιρεία) or null",
  "service": "Service of interest (Υπηρεσία ενδιαφέροντος) or null"
}}

Rules:
- Look for contact information in signatures, email content, or headers
- For Greek text, look for: Όνομα, Επωνυμία, Τηλ, Κιν, Email, Εταιρεία
- For English text, look for: Name, Tel, Phone, Email, Company
- If information is not found, use null
- Return valid JSON only

Example patterns to look for:
- Email signatures
- "Με εκτίμηση, [Name]"
- "Best regards, [Name]"
- Phone patterns: +30, 210, 694, etc.
- Company information in signatures`,
        inputVariables: ['subject', 'body']
      });

      const chain = new LLMChain({ llm: this.llm, prompt: extractionPrompt });
      
      const result = await chain.call({
        subject,
        body: body.substring(0, 2000)
      });

      console.log('Raw extraction result:', result.text);

      try {
        const parsed = JSON.parse(result.text.trim());
        console.log('Parsed customer info:', parsed);
        return parsed;
      } catch (parseError) {
        console.error('Failed to parse customer info JSON:', parseError);
        console.error('Raw text was:', result.text);
        return {
          name: null,
          email: null,
          phone: null,
          company: null,
          service: null
        };
      }
    } catch (error) {
      console.error('Error extracting customer info:', error);
      console.error('Error stack:', error.stack);
      return {
        name: null,
        email: null,
        phone: null,
        company: null,
        service: null
      };
    }
  }

  async extractInvoiceInfo(subject, body, attachments = []) {
    try {
      console.log('=== EXTRACTING INVOICE INFO ===');
      console.log('Subject:', subject);
      console.log('Body preview:', body.substring(0, 300));
      
      const extractionPrompt = new PromptTemplate({
        template: `Extract invoice information from this email. Support both Greek and English text.

Email Subject: {subject}
Email Body: {body}
Attachments: {attachments}

Extract the following information and return as JSON:
{{
  "invoiceNumber": "Invoice number (Αριθμός τιμολογίου) or null",
  "date": "Invoice date (Ημερομηνία) or null",
  "customer": "Customer name (Πελάτης) or null", 
  "amount": "Total amount (Ποσό) or null",
  "vat": "VAT amount (ΦΠΑ) or null"
}}

Rules:
- Look for invoice numbers, dates, amounts in the email content
- For Greek text, look for: Αριθμός, Ημερομηνία, Πελάτης, Ποσό, ΦΠΑ, Σύνολο
- For English text, look for: Invoice #, Number, Date, Amount, Total, VAT, Tax
- Dates should be in ISO format (YYYY-MM-DD) if found
- Amounts should be numeric values without currency symbols
- If information is not found, use null
- Return valid JSON only

Common patterns:
- "Invoice #12345" or "Τιμολόγιο Αρ. 12345"
- "Date: 2024-01-15" or "Ημερομηνία: 15/01/2024"
- "Total: €1,500.00" or "Σύνολο: 1.500,00€"
- "VAT: €360.00" or "ΦΠΑ: 360,00€"`,
        inputVariables: ['subject', 'body', 'attachments']
      });

      const chain = new LLMChain({ llm: this.llm, prompt: extractionPrompt });
      
      const attachmentInfo = attachments.map(att => att.filename).join(', ') || 'None';
      
      const result = await chain.call({
        subject,
        body: body.substring(0, 2000),
        attachments: attachmentInfo
      });

      console.log('Raw invoice extraction result:', result.text);

      try {
        const parsed = JSON.parse(result.text.trim());
        console.log('Parsed invoice info:', parsed);
        return parsed;
      } catch (parseError) {
        console.error('Failed to parse invoice info JSON:', parseError);
        console.error('Raw text was:', result.text);
        return {
          invoiceNumber: null,
          date: null,
          customer: null,
          amount: null,
          vat: null
        };
      }
    } catch (error) {
      console.error('Error extracting invoice info:', error);
      console.error('Error stack:', error.stack);
      return {
        invoiceNumber: null,
        date: null,
        customer: null,
        amount: null,
        vat: null
      };
    }
  }

  // processEmail method removed - now handled by dedicated AI extraction agent (ai-extractor.js)
  // This service now only handles email categorization during fetch

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
