/**
 * Retry utility with exponential backoff
 * Provides robust retry logic for network operations and API calls
 */

class RetryUtils {
  /**
   * Execute a function with retry logic and exponential backoff
   * @param {Function} fn - The async function to retry
   * @param {Object} options - Retry configuration options
   * @param {number} options.maxAttempts - Maximum number of retry attempts (default: 3)
   * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
   * @param {number} options.maxDelay - Maximum delay in ms (default: 30000)
   * @param {number} options.backoffMultiplier - Multiplier for exponential backoff (default: 2)
   * @param {Function} options.shouldRetry - Function to determine if should retry based on error
   * @param {Function} options.onRetry - Callback called before each retry
   * @returns {Promise} Result of the function
   */
  async withRetry(fn, options = {}) {
    const {
      maxAttempts = 3,
      initialDelay = 1000,
      maxDelay = 30000,
      backoffMultiplier = 2,
      shouldRetry = this.defaultShouldRetry,
      onRetry = null
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Try to execute the function
        const result = await fn();
        return result;
      } catch (error) {
        lastError = error;
        
        // Check if we should retry
        if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
          throw error;
        }

        // Call retry callback if provided
        if (onRetry) {
          onRetry(error, attempt, delay);
        }

        // Wait before retrying
        await this.delay(delay);

        // Calculate next delay with exponential backoff
        delay = Math.min(delay * backoffMultiplier, maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * Default function to determine if an error is retryable
   * @param {Error} error - The error that occurred
   * @param {number} attempt - Current attempt number
   * @returns {boolean} Whether to retry
   */
  defaultShouldRetry(error, attempt) {
    // Retry on network errors
    if (error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED') {
      return true;
    }

    // Retry on specific HTTP status codes
    if (error.response) {
      const status = error.response.status;
      // Retry on 429 (Too Many Requests), 502 (Bad Gateway), 503 (Service Unavailable), 504 (Gateway Timeout)
      if (status === 429 || status === 502 || status === 503 || status === 504) {
        return true;
      }
      // Retry on 500 (Internal Server Error) but limit attempts
      if (status === 500 && attempt <= 2) {
        return true;
      }
    }

    // Retry on rate limit errors
    if (error.message && (
      error.message.includes('rate limit') ||
      error.message.includes('quota exceeded') ||
      error.message.includes('too many requests')
    )) {
      return true;
    }

    // Don't retry on client errors (4xx except 429)
    if (error.response && error.response.status >= 400 && error.response.status < 500) {
      return false;
    }

    return false;
  }

  /**
   * Delay execution for specified milliseconds
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute multiple async operations with retry logic in parallel
   * @param {Array<Function>} fns - Array of async functions to execute
   * @param {Object} options - Retry configuration options
   * @returns {Promise<Array>} Array of results
   */
  async withRetryParallel(fns, options = {}) {
    const promises = fns.map(fn => this.withRetry(fn, options));
    return Promise.all(promises);
  }

  /**
   * Execute multiple async operations with retry logic in sequence
   * @param {Array<Function>} fns - Array of async functions to execute
   * @param {Object} options - Retry configuration options
   * @returns {Promise<Array>} Array of results
   */
  async withRetrySequential(fns, options = {}) {
    const results = [];
    for (const fn of fns) {
      const result = await this.withRetry(fn, options);
      results.push(result);
    }
    return results;
  }

  /**
   * Retry with circuit breaker pattern
   * @param {Function} fn - The async function to retry
   * @param {Object} options - Circuit breaker options
   * @returns {Promise} Result of the function
   */
  async withCircuitBreaker(fn, options = {}) {
    const {
      threshold = 5,        // Number of failures before opening circuit
      timeout = 60000,      // Time in ms before attempting to close circuit
      halfOpenAttempts = 3  // Number of successful attempts needed to close circuit
    } = options;

    // Initialize circuit state if not exists
    if (!this.circuits) {
      this.circuits = new Map();
    }

    const fnKey = fn.toString();
    let circuit = this.circuits.get(fnKey);

    if (!circuit) {
      circuit = {
        state: 'CLOSED',
        failures: 0,
        lastFailureTime: null,
        successCount: 0
      };
      this.circuits.set(fnKey, circuit);
    }

    // Check circuit state
    if (circuit.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - circuit.lastFailureTime;
      if (timeSinceLastFailure < timeout) {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
      // Try to half-open the circuit
      circuit.state = 'HALF_OPEN';
      circuit.successCount = 0;
    }

    try {
      const result = await fn();
      
      // Handle success
      if (circuit.state === 'HALF_OPEN') {
        circuit.successCount++;
        if (circuit.successCount >= halfOpenAttempts) {
          circuit.state = 'CLOSED';
          circuit.failures = 0;
        }
      } else if (circuit.state === 'CLOSED') {
        circuit.failures = 0;
      }
      
      return result;
    } catch (error) {
      // Handle failure
      circuit.failures++;
      circuit.lastFailureTime = Date.now();
      
      if (circuit.failures >= threshold) {
        circuit.state = 'OPEN';
      }
      
      throw error;
    }
  }
}

module.exports = new RetryUtils();
