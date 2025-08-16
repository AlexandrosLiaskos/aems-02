const pdf = require('pdf-parse');
const { google } = require('googleapis');

/**
 * PDF Processing Module for Data Extraction Phase Only
 * Downloads and extracts text content from PDF attachments during AI data extraction
 * NOT used during initial email categorization (keeps that fast)
 */
class PDFProcessor {
    constructor() {
        this.oauth2Client = null;
    }

    /**
     * Set OAuth2 client for Gmail API access
     * @param {Object} oauth2Client - Configured OAuth2 client
     */
    setOAuth2Client(oauth2Client) {
        this.oauth2Client = oauth2Client;
    }

    /**
     * Process PDF attachments for data extraction (invoices, documents)
     * @param {Array} attachments - Array of attachment objects with attachmentId
     * @param {string} gmailId - Gmail message ID
     * @returns {Promise<string>} - Combined text content from all PDFs
     */
    async extractPDFContent(attachments, gmailId) {
        if (!attachments || attachments.length === 0) {
            return '';
        }

        if (!this.oauth2Client) {
            console.warn('📄 OAuth2 client not set, cannot process PDF attachments');
            return '';
        }

        // Filter for PDF attachments only
        const pdfAttachments = attachments.filter(att =>
            att.mimeType === 'application/pdf' && att.attachmentId
        );

        if (pdfAttachments.length === 0) {
            return '';
        }

        console.log(`📄 Processing ${pdfAttachments.length} PDF attachment(s) for data extraction`);

        const extractedTexts = [];

        for (const attachment of pdfAttachments) {
            try {
                // Skip very large files (> 5MB) to avoid memory issues
                if (attachment.size > 5 * 1024 * 1024) {
                    console.warn(`📄 Skipping large PDF: ${attachment.filename} (${attachment.size} bytes)`);
                    continue;
                }

                console.log(`📄 Extracting text from: ${attachment.filename}`);

                // Download and extract text
                const textContent = await this.processSinglePDF(gmailId, attachment);

                if (textContent) {
                    extractedTexts.push(`--- ${attachment.filename} ---\n${textContent}`);
                    console.log(`✅ Extracted ${textContent.length} characters from ${attachment.filename}`);
                } else {
                    console.warn(`⚠️ No text extracted from ${attachment.filename}`);
                }

            } catch (error) {
                console.error(`❌ Error processing PDF ${attachment.filename}:`, error.message);
                // Continue with other attachments even if one fails
            }
        }

        const combinedText = extractedTexts.join('\n\n');

        if (combinedText) {
            console.log(`📄 PDF processing complete: ${extractedTexts.length} files, ${combinedText.length} total characters`);
        }

        return combinedText;
    }

    /**
     * Process a single PDF attachment
     * @param {string} gmailId - Gmail message ID
     * @param {Object} attachment - Attachment object
     * @returns {Promise<string>} - Extracted text content
     */
    async processSinglePDF(gmailId, attachment) {
        try {
            // Download PDF content
            const pdfBuffer = await this.downloadAttachment(gmailId, attachment.attachmentId);

            if (!pdfBuffer) {
                throw new Error('Failed to download PDF content');
            }

            // Extract text from PDF
            const textContent = await this.extractTextFromPDF(pdfBuffer);
            return textContent;

        } catch (error) {
            console.error(`Error processing PDF ${attachment.filename}:`, error);
            return null;
        }
    }

    /**
     * Download attachment from Gmail
     * @param {string} gmailId - Gmail message ID
     * @param {string} attachmentId - Gmail attachment ID
     * @returns {Promise<Buffer>} - PDF file buffer
     */
    async downloadAttachment(gmailId, attachmentId) {
        try {
            const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

            const response = await gmail.users.messages.attachments.get({
                userId: 'me',
                messageId: gmailId,
                id: attachmentId
            });

            if (!response.data || !response.data.data) {
                throw new Error('No attachment data received from Gmail API');
            }

            // Decode Gmail's base64url format
            const base64Data = response.data.data.replace(/-/g, '+').replace(/_/g, '/');
            return Buffer.from(base64Data, 'base64');

        } catch (error) {
            console.error('Gmail attachment download error:', error);
            throw error;
        }
    }

    /**
     * Extract text content from PDF buffer using pdf-parse
     * @param {Buffer} pdfBuffer - PDF file buffer
     * @returns {Promise<string>} - Extracted and cleaned text content
     */
    async extractTextFromPDF(pdfBuffer) {
        try {
            const data = await pdf(pdfBuffer);

            if (!data.text || data.text.trim().length === 0) {
                console.warn('PDF contains no extractable text (might be image-based)');
                return null;
            }

            // Clean up the extracted text
            let cleanText = data.text
                .replace(/\s+/g, ' ')           // Replace multiple whitespace with single space
                .replace(/\n\s*\n/g, '\n')      // Remove empty lines
                .replace(/[^\x20-\x7E\n]/g, '') // Remove non-printable characters except newlines
                .trim();

            // Limit text length for AI processing (max ~2500 chars to leave room for email content)
            if (cleanText.length > 2500) {
                cleanText = cleanText.substring(0, 2500) + '\n... [PDF content truncated for AI processing]';
                console.log('📄 PDF text truncated to 2500 characters for AI token limits');
            }

            return cleanText;

        } catch (error) {
            console.error('PDF text extraction error:', error);
            throw new Error(`PDF parsing failed: ${error.message}`);
        }
    }

    /**
     * Check if email has PDF attachments that could contain data
     * @param {Array} attachments - Array of attachment objects
     * @returns {boolean} - True if has processable PDF attachments
     */
    hasPDFAttachments(attachments) {
        if (!attachments || attachments.length === 0) {
            return false;
        }

        return attachments.some(att =>
            att.mimeType === 'application/pdf' &&
            att.attachmentId &&
            att.size < 5 * 1024 * 1024 // Under 5MB
        );
    }
}

module.exports = new PDFProcessor();
