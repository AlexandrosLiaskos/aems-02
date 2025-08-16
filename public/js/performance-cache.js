/**
 * Performance Caching Module for AEMS
 * Implements client-side caching and optimizations
 */

class PerformanceCache {
    constructor() {
        this.cache = new Map();
        this.apiCache = new Map();
        this.imageCache = new Map();
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.config = {
            maxCacheSize: 10 * 1024 * 1024, // Reduced to 10MB to prevent memory issues
            maxCacheAge: 15 * 60 * 1000, // Reduced to 15 minutes
            maxApiCacheAge: 2 * 60 * 1000, // Reduced to 2 minutes for API responses
            enableCompression: true,
            enableDebounce: true,
            debounceDelay: 300,
            batchRequestDelay: 50,
            maxBatchSize: 10,
            maxCacheEntries: 1000 // Limit number of cache entries
        };
        this.debounceTimers = new Map();
        this.currentCacheSize = 0;
        this.cleanupInterval = null;
        this.init();
    }

    init() {
        // Set up performance observers
        if ('PerformanceObserver' in window) {
            this.setupPerformanceObserver();
        }

        // Set up cache cleanup interval
        setInterval(() => this.cleanupCache(), 60000); // Cleanup every minute

        // Set up localStorage sync
        this.syncWithLocalStorage();

        // Monitor memory usage
        this.monitorMemory();
    }

    /**
     * Cache API response
     */
    cacheApiResponse(url, data, options = {}) {
        const key = this.generateCacheKey(url, options);
        const ttl = options.ttl || this.config.maxApiCacheAge;

        const cacheEntry = {
            data: data,
            timestamp: Date.now(),
            expires: Date.now() + ttl,
            size: this.estimateSize(data)
        };

        // Check cache size limit
        if (this.currentCacheSize + cacheEntry.size > this.config.maxCacheSize) {
            this.evictOldestEntries(cacheEntry.size);
        }

        this.apiCache.set(key, cacheEntry);
        this.currentCacheSize += cacheEntry.size;

        // Store in localStorage if small enough
        if (cacheEntry.size < 1024 * 100) { // Less than 100KB
            try {
                localStorage.setItem(`cache_${key}`, JSON.stringify(cacheEntry));
            } catch (e) {
                console.warn('Failed to store in localStorage:', e);
            }
        }
    }

    /**
     * Get cached API response
     */
    getCachedApiResponse(url, options = {}) {
        const key = this.generateCacheKey(url, options);
        let cacheEntry = this.apiCache.get(key);

        // Try localStorage if not in memory
        if (!cacheEntry) {
            try {
                const stored = localStorage.getItem(`cache_${key}`);
                if (stored) {
                    cacheEntry = JSON.parse(stored);
                }
            } catch (e) {
                console.warn('Failed to read from localStorage:', e);
            }
        }

        if (!cacheEntry) return null;

        // Check if expired
        if (Date.now() > cacheEntry.expires) {
            this.removeCacheEntry(key);
            return null;
        }

        // Update access time for LRU
        cacheEntry.lastAccessed = Date.now();
        return cacheEntry.data;
    }

    /**
     * Batch API requests
     */
    async batchRequest(requestFn, params, options = {}) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                fn: requestFn,
                params,
                options,
                resolve,
                reject
            });

            if (!this.isProcessingQueue) {
                setTimeout(() => this.processRequestQueue(), this.config.batchRequestDelay);
            }
        });
    }

    /**
     * Process batched requests
     */
    async processRequestQueue() {
        if (this.requestQueue.length === 0) {
            this.isProcessingQueue = false;
            return;
        }

        this.isProcessingQueue = true;
        const batch = this.requestQueue.splice(0, this.config.maxBatchSize);

        // Group by endpoint if possible
        const grouped = this.groupRequests(batch);

        for (const group of grouped) {
            try {
                if (group.length === 1) {
                    // Single request
                    const req = group[0];
                    const result = await req.fn(req.params);
                    req.resolve(result);
                } else {
                    // Multiple requests to same endpoint - attempt to batch
                    const results = await this.executeBatch(group);
                    group.forEach((req, index) => {
                        req.resolve(results[index]);
                    });
                }
            } catch (error) {
                group.forEach(req => req.reject(error));
            }
        }

        // Process remaining requests
        if (this.requestQueue.length > 0) {
            setTimeout(() => this.processRequestQueue(), this.config.batchRequestDelay);
        } else {
            this.isProcessingQueue = false;
        }
    }

    /**
     * Debounce function calls
     */
    debounce(fn, key, delay = null) {
        delay = delay || this.config.debounceDelay;

        return (...args) => {
            if (this.debounceTimers.has(key)) {
                clearTimeout(this.debounceTimers.get(key));
            }

            return new Promise((resolve) => {
                const timer = setTimeout(() => {
                    this.debounceTimers.delete(key);
                    resolve(fn.apply(this, args));
                }, delay);

                this.debounceTimers.set(key, timer);
            });
        };
    }

    /**
     * Throttle function calls
     */
    throttle(fn, key, limit = 1000) {
        let inThrottle = false;
        let lastResult = null;

        return (...args) => {
            if (!inThrottle) {
                inThrottle = true;
                lastResult = fn.apply(this, args);

                setTimeout(() => {
                    inThrottle = false;
                }, limit);
            }

            return lastResult;
        };
    }

    /**
     * Preload images
     */
    preloadImages(urls) {
        const promises = urls.map(url => {
            if (this.imageCache.has(url)) {
                return Promise.resolve(this.imageCache.get(url));
            }

            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    this.imageCache.set(url, img);
                    resolve(img);
                };
                img.onerror = reject;
                img.src = url;
            });
        });

        return Promise.all(promises);
    }

    /**
     * Lazy load content
     */
    setupLazyLoading(selector = '.lazy-load') {
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const element = entry.target;

                        if (element.dataset.src) {
                            // Image
                            element.src = element.dataset.src;
                            element.classList.remove('lazy-load');
                        } else if (element.dataset.load) {
                            // Dynamic content
                            this.loadDynamicContent(element);
                        }

                        observer.unobserve(element);
                    }
                });
            }, {
                rootMargin: '50px'
            });

            document.querySelectorAll(selector).forEach(element => {
                imageObserver.observe(element);
            });

            return imageObserver;
        }
    }

    /**
     * Optimize DOM updates
     */
    batchDOMUpdates(updates) {
        if (window.requestIdleCallback) {
            requestIdleCallback(() => {
                this.applyDOMUpdates(updates);
            });
        } else {
            requestAnimationFrame(() => {
                this.applyDOMUpdates(updates);
            });
        }
    }

    /**
     * Apply DOM updates efficiently
     */
    applyDOMUpdates(updates) {
        // Create document fragment for batch insertions
        const fragment = document.createDocumentFragment();

        updates.forEach(update => {
            switch (update.type) {
                case 'append':
                    if (update.parent && update.element) {
                        fragment.appendChild(update.element);
                        if (update.callback) update.callback();
                    }
                    break;

                case 'update':
                    if (update.element && update.property) {
                        update.element[update.property] = update.value;
                    }
                    break;

                case 'remove':
                    if (update.element && update.element.parentNode) {
                        update.element.parentNode.removeChild(update.element);
                    }
                    break;

                case 'class':
                    if (update.element) {
                        if (update.action === 'add') {
                            update.element.classList.add(update.className);
                        } else if (update.action === 'remove') {
                            update.element.classList.remove(update.className);
                        }
                    }
                    break;
            }
        });

        // Append fragment if there are additions
        if (fragment.childNodes.length > 0 && updates[0].parent) {
            updates[0].parent.appendChild(fragment);
        }
    }

    /**
     * Virtual scrolling for large lists
     */
    setupVirtualScroll(container, items, itemHeight, renderFn) {
        const scrollHandler = this.throttle(() => {
            const scrollTop = container.scrollTop;
            const containerHeight = container.clientHeight;

            const startIndex = Math.floor(scrollTop / itemHeight);
            const endIndex = Math.ceil((scrollTop + containerHeight) / itemHeight);

            const visibleItems = items.slice(startIndex, endIndex + 1);

            // Clear container
            container.innerHTML = '';

            // Add spacer for items above
            const spacerTop = document.createElement('div');
            spacerTop.style.height = `${startIndex * itemHeight}px`;
            container.appendChild(spacerTop);

            // Render visible items
            visibleItems.forEach(item => {
                const element = renderFn(item);
                container.appendChild(element);
            });

            // Add spacer for items below
            const spacerBottom = document.createElement('div');
            spacerBottom.style.height = `${(items.length - endIndex - 1) * itemHeight}px`;
            container.appendChild(spacerBottom);
        }, 'virtual-scroll', 100);

        container.addEventListener('scroll', scrollHandler);

        // Initial render
        scrollHandler();

        return () => {
            container.removeEventListener('scroll', scrollHandler);
        };
    }

    /**
     * Memory-efficient data storage
     */
    compressData(data) {
        if (!this.config.enableCompression) return data;

        try {
            // Simple compression using JSON string manipulation
            const jsonStr = JSON.stringify(data);

            // Remove unnecessary whitespace
            const compressed = jsonStr
                .replace(/\s+/g, ' ')
                .replace(/\s*:\s*/g, ':')
                .replace(/\s*,\s*/g, ',');

            return {
                compressed: true,
                data: compressed
            };
        } catch (e) {
            return data;
        }
    }

    /**
     * Decompress data
     */
    decompressData(data) {
        if (!data.compressed) return data;

        try {
            return JSON.parse(data.data);
        } catch (e) {
            return data;
        }
    }

    /**
     * Setup performance observer
     */
    setupPerformanceObserver() {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.entryType === 'measure') {
                    console.log(`Performance: ${entry.name} took ${entry.duration.toFixed(2)}ms`);

                    // Store performance metrics
                    this.cache.set(`perf_${entry.name}`, {
                        duration: entry.duration,
                        timestamp: Date.now()
                    });
                }
            }
        });

        observer.observe({ entryTypes: ['measure'] });
    }

    /**
     * Measure performance
     */
    measure(name, fn) {
        performance.mark(`${name}_start`);

        const result = fn();

        if (result instanceof Promise) {
            return result.finally(() => {
                performance.mark(`${name}_end`);
                performance.measure(name, `${name}_start`, `${name}_end`);
            });
        } else {
            performance.mark(`${name}_end`);
            performance.measure(name, `${name}_start`, `${name}_end`);
            return result;
        }
    }

    /**
     * Monitor memory usage
     */
    monitorMemory() {
        if (!performance.memory) return;

        setInterval(() => {
            const memory = performance.memory;
            const usedMemory = memory.usedJSHeapSize / 1048576; // Convert to MB
            const totalMemory = memory.totalJSHeapSize / 1048576;

            if (usedMemory > totalMemory * 0.9) {
                console.warn('High memory usage detected:', {
                    used: `${usedMemory.toFixed(2)}MB`,
                    total: `${totalMemory.toFixed(2)}MB`,
                    percentage: `${((usedMemory / totalMemory) * 100).toFixed(1)}%`
                });

                // Trigger aggressive cleanup
                this.aggressiveCleanup();
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Aggressive cleanup when memory is low
     */
    aggressiveCleanup() {
        // Clear old cache entries
        const now = Date.now();
        const maxAge = this.config.maxCacheAge / 2; // Half the normal max age

        for (const [key, entry] of this.apiCache.entries()) {
            if (now - entry.timestamp > maxAge) {
                this.removeCacheEntry(key);
            }
        }

        // Clear image cache
        if (this.imageCache.size > 50) {
            const toRemove = this.imageCache.size - 25;
            let removed = 0;

            for (const [key] of this.imageCache.entries()) {
                if (removed >= toRemove) break;
                this.imageCache.delete(key);
                removed++;
            }
        }

        // Removed unsafe window.gc() call - let browser handle GC naturally
    }

    /**
     * Generate cache key
     */
    generateCacheKey(url, options = {}) {
        const params = options.params || {};
        const sortedParams = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
        return `${url}${sortedParams ? '?' + sortedParams : ''}`;
    }

    /**
     * Estimate size of data
     */
    estimateSize(data) {
        const jsonStr = JSON.stringify(data);
        return new Blob([jsonStr]).size;
    }

    /**
     * Evict oldest cache entries
     */
    evictOldestEntries(requiredSpace) {
        const entries = Array.from(this.apiCache.entries())
            .sort((a, b) => (a[1].lastAccessed || a[1].timestamp) - (b[1].lastAccessed || b[1].timestamp));

        let freedSpace = 0;
        for (const [key, entry] of entries) {
            if (freedSpace >= requiredSpace) break;

            freedSpace += entry.size;
            this.removeCacheEntry(key);
        }
    }

    /**
     * Remove cache entry
     */
    removeCacheEntry(key) {
        const entry = this.apiCache.get(key);
        if (entry) {
            this.currentCacheSize -= entry.size;
            this.apiCache.delete(key);

            try {
                localStorage.removeItem(`cache_${key}`);
            } catch (e) {
                // Ignore localStorage errors
            }
        }
    }

    /**
     * Cleanup expired cache entries
     */
    cleanupCache() {
        const now = Date.now();

        for (const [key, entry] of this.apiCache.entries()) {
            if (now > entry.expires) {
                this.removeCacheEntry(key);
            }
        }
    }

    /**
     * Sync with localStorage
     */
    syncWithLocalStorage() {
        try {
            const keys = Object.keys(localStorage).filter(key => key.startsWith('cache_'));

            for (const key of keys) {
                const cacheKey = key.replace('cache_', '');
                if (!this.apiCache.has(cacheKey)) {
                    const entry = JSON.parse(localStorage.getItem(key));

                    if (entry && Date.now() < entry.expires) {
                        this.apiCache.set(cacheKey, entry);
                        this.currentCacheSize += entry.size;
                    } else {
                        localStorage.removeItem(key);
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to sync with localStorage:', e);
        }
    }

    /**
     * Group requests by endpoint
     */
    groupRequests(requests) {
        const groups = new Map();

        for (const req of requests) {
            const endpoint = req.params.url || req.params.endpoint || 'default';

            if (!groups.has(endpoint)) {
                groups.set(endpoint, []);
            }

            groups.get(endpoint).push(req);
        }

        return Array.from(groups.values());
    }

    /**
     * Execute batch of requests
     */
    async executeBatch(requests) {
        // This would need to be customized based on your API
        // For now, just execute individually
        return Promise.all(requests.map(req => req.fn(req.params)));
    }

    /**
     * Load dynamic content
     */
    async loadDynamicContent(element) {
        const loadUrl = element.dataset.load;

        if (loadUrl) {
            try {
                const cached = this.getCachedApiResponse(loadUrl);

                if (cached) {
                    element.innerHTML = cached;
                } else {
                    const response = await fetch(loadUrl);
                    const content = await response.text();

                    this.cacheApiResponse(loadUrl, content);
                    element.innerHTML = content;
                }

                element.classList.remove('lazy-load');
            } catch (error) {
                console.error('Failed to load dynamic content:', error);
            }
        }
    }

    /**
     * Get performance stats
     */
    getStats() {
        return {
            cacheSize: this.currentCacheSize,
            apiCacheEntries: this.apiCache.size,
            imageCacheEntries: this.imageCache.size,
            memoryUsage: performance.memory ? {
                used: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + 'MB',
                total: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + 'MB'
            } : 'N/A'
        };
    }

    /**
     * Enforce memory limits by removing oldest entries
     */
    enforceMemoryLimits() {
        // Check entry count limit
        if (this.apiCache.size > this.config.maxCacheEntries) {
            const entriesToRemove = this.apiCache.size - this.config.maxCacheEntries;
            const sortedEntries = Array.from(this.apiCache.entries())
                .sort((a, b) => (a[1].lastAccessed || a[1].timestamp) - (b[1].lastAccessed || b[1].timestamp));

            for (let i = 0; i < entriesToRemove; i++) {
                const [key, entry] = sortedEntries[i];
                this.currentCacheSize -= entry.size || 0;
                this.apiCache.delete(key);
            }
        }

        // Check size limit
        if (this.currentCacheSize > this.config.maxCacheSize) {
            this.evictOldestEntries(this.currentCacheSize - this.config.maxCacheSize);
        }
    }

    /**
     * Check memory usage and clear cache if needed
     */
    checkMemoryUsage() {
        if (!performance.memory) return;

        const usedMB = performance.memory.usedJSHeapSize / 1048576;
        const totalMB = performance.memory.totalJSHeapSize / 1048576;
        const usagePercent = (usedMB / totalMB) * 100;

        // If memory usage is high, aggressively clean cache
        if (usagePercent > 80) {
            console.warn('High memory usage detected, clearing cache');
            this.clearAll();
        } else if (usagePercent > 60) {
            // Reduce cache size
            this.config.maxCacheSize = Math.max(1024 * 1024, this.config.maxCacheSize * 0.5);
            this.enforceMemoryLimits();
        }
    }

    /**
     * Clean up resources
     */
    cleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        // Clear all timers
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();

        // Clear caches
        this.clearAll();
    }

    /**
     * Clear all caches
     */
    clearAll() {
        this.apiCache.clear();
        this.imageCache.clear();
        this.cache.clear();
        this.currentCacheSize = 0;

        // Clear localStorage cache
        try {
            const keys = Object.keys(localStorage).filter(key => key.startsWith('cache_'));
            keys.forEach(key => localStorage.removeItem(key));
        } catch (e) {
            console.warn('Failed to clear localStorage cache:', e);
        }

        console.log('All caches cleared');
    }
}

// Create global instance
window.performanceCache = new PerformanceCache();
