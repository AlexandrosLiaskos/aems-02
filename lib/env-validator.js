/**
 * Environment Variable Validation Module
 * Validates required environment variables on startup
 */

class EnvironmentValidator {
  constructor() {
    this.requiredVars = [
      'SESSION_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REDIRECT_URL'
    ];

    this.optionalVars = [
      'OPENAI_API_KEY',
      'PORT',
      'NODE_ENV',
      'SESSION_TIMEOUT',
      'MAX_EMAILS_PER_SYNC',
      'AI_BATCH_SIZE',
      'AI_BATCH_DELAY'
    ];

    this.validationRules = {
      'SESSION_SECRET': {
        minLength: 32,
        validator: (value) => value.length >= 32,
        message: 'SESSION_SECRET must be at least 32 characters long'
      },
      'GOOGLE_CLIENT_ID': {
        pattern: /^[0-9]+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com$/,
        validator: (value) => /^[0-9]+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com$/.test(value),
        message: 'GOOGLE_CLIENT_ID must be a valid Google OAuth client ID'
      },
      'GOOGLE_CLIENT_SECRET': {
        pattern: /^GOCSPX-[a-zA-Z0-9_-]+$/,
        validator: (value) => /^GOCSPX-[a-zA-Z0-9_-]+$/.test(value),
        message: 'GOOGLE_CLIENT_SECRET must be a valid Google OAuth client secret'
      },
      'GOOGLE_REDIRECT_URL': {
        validator: (value) => {
          try {
            new URL(value);
            return value.includes('/auth/google/callback');
          } catch {
            return false;
          }
        },
        message: 'GOOGLE_REDIRECT_URL must be a valid URL ending with /auth/google/callback'
      },
      'OPENAI_API_KEY': {
        validator: (value) => {
          if (!value || value === 'your_openai_api_key_here') {
            return false;
          }
          return value.startsWith('sk-') && value.length > 20;
        },
        message: 'OPENAI_API_KEY must be a valid OpenAI API key starting with sk-',
        optional: true
      },
      'PORT': {
        validator: (value) => {
          const port = parseInt(value);
          return !isNaN(port) && port > 0 && port < 65536;
        },
        message: 'PORT must be a valid port number (1-65535)',
        default: '3000'
      },
      'SESSION_TIMEOUT': {
        validator: (value) => {
          const timeout = parseInt(value);
          return !isNaN(timeout) && timeout > 0;
        },
        message: 'SESSION_TIMEOUT must be a positive number',
        default: '3600000'
      }
    };
  }

  /**
   * Validate all environment variables
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Check required variables
    for (const varName of this.requiredVars) {
      const value = process.env[varName];
      
      if (!value) {
        errors.push(`Missing required environment variable: ${varName}`);
        continue;
      }

      // Apply validation rules
      const rule = this.validationRules[varName];
      if (rule && !rule.validator(value)) {
        errors.push(`Invalid ${varName}: ${rule.message}`);
      }
    }

    // Check optional variables
    for (const varName of this.optionalVars) {
      const value = process.env[varName];
      const rule = this.validationRules[varName];
      
      if (!value) {
        if (rule && rule.default) {
          process.env[varName] = rule.default;
          warnings.push(`Using default value for ${varName}: ${rule.default}`);
        } else if (rule && rule.optional) {
          warnings.push(`Optional environment variable ${varName} not set`);
        }
        continue;
      }

      // Apply validation rules
      if (rule && !rule.validator(value)) {
        if (rule.optional) {
          warnings.push(`Invalid ${varName}: ${rule.message}`);
        } else {
          errors.push(`Invalid ${varName}: ${rule.message}`);
        }
      }
    }

    // Check for placeholder values
    this.checkPlaceholderValues(warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check for placeholder values that should be replaced
   */
  checkPlaceholderValues(warnings) {
    const placeholders = {
      'GOOGLE_CLIENT_ID': 'your_google_client_id_here',
      'GOOGLE_CLIENT_SECRET': 'your_google_client_secret_here',
      'OPENAI_API_KEY': 'your_openai_api_key_here',
      'SESSION_SECRET': 'fallback-secret-key'
    };

    for (const [varName, placeholder] of Object.entries(placeholders)) {
      const value = process.env[varName];
      if (value && value.includes(placeholder)) {
        warnings.push(`${varName} appears to contain placeholder value. Please update with actual credentials.`);
      }
    }
  }

  /**
   * Validate and exit if critical errors found
   */
  validateOrExit() {
    const result = this.validate();

    // Log warnings
    if (result.warnings.length > 0) {
      console.warn('Environment Configuration Warnings:');
      result.warnings.forEach(warning => console.warn(`  ⚠️  ${warning}`));
      console.warn('');
    }

    // Handle errors
    if (!result.isValid) {
      console.error('Environment Configuration Errors:');
      result.errors.forEach(error => console.error(`  ❌ ${error}`));
      console.error('');
      console.error('Please fix the above configuration errors and restart the application.');
      process.exit(1);
    }

    console.log('✅ Environment configuration validated successfully');
    return result;
  }

  /**
   * Get sanitized environment info for logging
   */
  getSanitizedEnvInfo() {
    const info = {};
    
    // Safe to log
    const safeVars = ['NODE_ENV', 'PORT', 'AI_BATCH_SIZE', 'MAX_EMAILS_PER_SYNC'];
    
    for (const varName of safeVars) {
      info[varName] = process.env[varName] || 'not set';
    }

    // Partially masked sensitive vars
    const sensitiveVars = ['SESSION_SECRET', 'OPENAI_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
    
    for (const varName of sensitiveVars) {
      const value = process.env[varName];
      if (value) {
        if (value.length > 8) {
          info[varName] = value.substring(0, 4) + '***' + value.substring(value.length - 4);
        } else {
          info[varName] = '***';
        }
      } else {
        info[varName] = 'not set';
      }
    }

    return info;
  }
}

module.exports = new EnvironmentValidator();
