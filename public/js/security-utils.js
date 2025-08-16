/**
 * Security Utilities for AEMS Frontend
 * Provides secure HTML rendering and input sanitization
 */

class SecurityUtils {
  constructor() {
    this.allowedTags = [
      'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'em', 'i', 'b', 'u', 'br', 'hr',
      'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'button', 'input', 'select', 'option', 'textarea', 'label',
      'form', 'fieldset', 'legend'
    ];
    
    this.allowedAttributes = {
      '*': ['class', 'id', 'data-*'],
      'button': ['type', 'disabled', 'onclick'],
      'input': ['type', 'name', 'value', 'placeholder', 'required', 'disabled'],
      'select': ['name', 'required', 'disabled'],
      'option': ['value', 'selected'],
      'textarea': ['name', 'placeholder', 'required', 'disabled', 'rows', 'cols'],
      'label': ['for'],
      'form': ['action', 'method'],
      'table': ['border', 'cellpadding', 'cellspacing'],
      'td': ['colspan', 'rowspan'],
      'th': ['colspan', 'rowspan']
    };
  }

  /**
   * Safely set HTML content with sanitization
   */
  setSecureHTML(element, htmlContent) {
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }
    
    if (!element) {
      console.error('Element not found for secure HTML setting');
      return;
    }

    // Create a temporary container
    const temp = document.createElement('div');
    temp.innerHTML = htmlContent;
    
    // Sanitize the content
    const sanitized = this.sanitizeElement(temp);
    
    // Clear and set the content
    element.innerHTML = '';
    element.appendChild(sanitized);
  }

  /**
   * Sanitize a DOM element recursively
   */
  sanitizeElement(element) {
    const sanitized = document.createDocumentFragment();
    
    Array.from(element.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        // Text nodes are safe
        sanitized.appendChild(node.cloneNode(true));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        
        if (this.allowedTags.includes(tagName)) {
          const newElement = document.createElement(tagName);
          
          // Copy allowed attributes
          this.copyAllowedAttributes(node, newElement, tagName);
          
          // Recursively sanitize children
          const sanitizedChildren = this.sanitizeElement(node);
          newElement.appendChild(sanitizedChildren);
          
          sanitized.appendChild(newElement);
        } else {
          // For disallowed tags, just process their children
          const sanitizedChildren = this.sanitizeElement(node);
          sanitized.appendChild(sanitizedChildren);
        }
      }
    });
    
    return sanitized;
  }

  /**
   * Copy allowed attributes from source to target element
   */
  copyAllowedAttributes(source, target, tagName) {
    const allowedForTag = this.allowedAttributes[tagName] || [];
    const allowedForAll = this.allowedAttributes['*'] || [];
    const allAllowed = [...allowedForTag, ...allowedForAll];
    
    Array.from(source.attributes).forEach(attr => {
      const attrName = attr.name.toLowerCase();
      
      // Check if attribute is allowed
      const isAllowed = allAllowed.some(allowed => {
        if (allowed.endsWith('*')) {
          return attrName.startsWith(allowed.slice(0, -1));
        }
        return attrName === allowed;
      });
      
      if (isAllowed) {
        // Additional validation for specific attributes
        if (this.isAttributeValueSafe(attrName, attr.value)) {
          target.setAttribute(attrName, attr.value);
        }
      }
    });
  }

  /**
   * Validate attribute values for security
   */
  isAttributeValueSafe(attrName, attrValue) {
    // Prevent javascript: URLs
    if (attrName === 'href' || attrName === 'src') {
      const value = attrValue.toLowerCase().trim();
      if (value.startsWith('javascript:') || value.startsWith('data:') || value.startsWith('vbscript:')) {
        return false;
      }
    }
    
    // Prevent event handlers
    if (attrName.startsWith('on')) {
      return attrName === 'onclick' && this.isSafeOnClickHandler(attrValue);
    }
    
    // Prevent style attribute (can contain expressions)
    if (attrName === 'style') {
      return false;
    }
    
    return true;
  }

  /**
   * Validate onclick handlers (only allow specific safe patterns)
   */
  isSafeOnClickHandler(handler) {
    // Only allow specific safe patterns like window.app.methodName()
    const safePatterns = [
      /^window\.app\.\w+\(\)$/,
      /^window\.app\.\w+\(['"]\w+['"]\)$/,
      /^this\.[\w.]+\(\)$/
    ];
    
    return safePatterns.some(pattern => pattern.test(handler.trim()));
  }

  /**
   * Escape HTML entities in text content
   */
  escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Sanitize user input for display
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }
    
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Create secure template literals
   */
  html(strings, ...values) {
    let result = strings[0];
    
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      const sanitizedValue = typeof value === 'string' ? this.sanitizeInput(value) : value;
      result += sanitizedValue + strings[i + 1];
    }
    
    return result;
  }

  /**
   * Validate and sanitize URLs
   */
  sanitizeURL(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      
      // Only allow http, https, and relative URLs
      if (!['http:', 'https:', ''].includes(parsed.protocol)) {
        return '#';
      }
      
      return parsed.toString();
    } catch (e) {
      return '#';
    }
  }

  /**
   * Create a secure event handler
   */
  createSecureEventHandler(handler) {
    return function(event) {
      try {
        // Prevent default if needed
        if (event.type === 'submit') {
          event.preventDefault();
        }
        
        // Call the handler with proper context
        return handler.call(this, event);
      } catch (error) {
        console.error('Event handler error:', error);
        return false;
      }
    };
  }
}

// Create global instance
window.securityUtils = new SecurityUtils();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityUtils;
}
