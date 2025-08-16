/**
 * Health Monitoring System for AEMS
 * Provides real-time health checks and system monitoring
 */

const os = require('os');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class HealthMonitor {
    constructor() {
        this.checks = new Map();
        this.lastResults = new Map();
        this.history = [];
        this.maxHistorySize = 100;
        this.alertThresholds = {
            memory: 80, // Alert if memory usage > 80%
            responseTime: 5000, // Alert if response time > 5s
            errorRate: 10 // Alert if error rate > 10%
        };
        this.metrics = {
            requests: 0,
            errors: 0,
            totalResponseTime: 0,
            lastReset: Date.now()
        };

        // Register default health checks
        this.registerDefaultChecks();
    }

    /**
     * Register a new health check
     */
    registerCheck(name, checkFn, options = {}) {
        this.checks.set(name, {
            fn: checkFn,
            critical: options.critical || false,
            timeout: options.timeout || 5000,
            interval: options.interval || 60000
        });
    }

    /**
     * Register default system health checks
     */
    registerDefaultChecks() {
        // Database health check
        this.registerCheck('database', async () => {
            const db = require('./database');
            const testId = 'health-check-' + Date.now();

            try {
                // Test write
                const email = await db.createEmail({
                    gmailId: testId,
                    subject: 'Health Check',
                    body: 'Test',
                    fromAddress: 'test@test.com',
                    date: new Date().toISOString(),
                    category: 'other',
                    userId: 'health-check'
                });

                // Test read
                const retrieved = await db.getEmailById(email.id);
                if (!retrieved) throw new Error('Read failed');

                // Clean up
                await db.softDeleteEmail(email.id);

                return {
                    status: 'healthy',
                    message: 'Database operations working',
                    latency: Date.now() - parseInt(testId.split('-')[2])
                };
            } catch (error) {
                return {
                    status: 'unhealthy',
                    message: `Database error: ${error.message}`,
                    error: error.message
                };
            }
        }, { critical: true });

        // File system health check
        this.registerCheck('filesystem', async () => {
            const testFile = path.join(__dirname, '../data/.health-check');

            try {
                // Test write
                await fs.writeFile(testFile, Date.now().toString());

                // Test read
                const content = await fs.readFile(testFile, 'utf8');

                // Clean up
                await fs.unlink(testFile);

                // Check available space
                const dataDir = path.join(__dirname, '../data');
                const stats = await fs.stat(dataDir);

                return {
                    status: 'healthy',
                    message: 'File system operations working',
                    availableSpace: this.getAvailableSpace()
                };
            } catch (error) {
                return {
                    status: 'unhealthy',
                    message: `File system error: ${error.message}`,
                    error: error.message
                };
            }
        }, { critical: true });

        // Memory health check
        this.registerCheck('memory', async () => {
            const used = process.memoryUsage();
            const total = os.totalmem();
            const free = os.freemem();
            const usagePercent = ((total - free) / total * 100).toFixed(2);

            const status = usagePercent > 90 ? 'unhealthy' :
                usagePercent > 75 ? 'degraded' : 'healthy';

            return {
                status,
                message: `Memory usage: ${usagePercent}%`,
                details: {
                    heapUsed: Math.round(used.heapUsed / 1024 / 1024) + ' MB',
                    heapTotal: Math.round(used.heapTotal / 1024 / 1024) + ' MB',
                    rss: Math.round(used.rss / 1024 / 1024) + ' MB',
                    systemFree: Math.round(free / 1024 / 1024) + ' MB',
                    systemTotal: Math.round(total / 1024 / 1024) + ' MB'
                }
            };
        });

        // API connectivity checks
        this.registerCheck('gmail_api', async () => {
            const gmailService = require('./gmail');

            try {
                const user = await gmailService.getConnectedUser();

                if (!user) {
                    return {
                        status: 'degraded',
                        message: 'Gmail not connected',
                        connected: false
                    };
                }

                return {
                    status: 'healthy',
                    message: 'Gmail API connected',
                    connected: true,
                    user: user.email
                };
            } catch (error) {
                return {
                    status: 'unhealthy',
                    message: `Gmail API error: ${error.message}`,
                    error: error.message
                };
            }
        });

        this.registerCheck('openai_api', async () => {
            const hasApiKey = !!process.env.OPENAI_API_KEY;

            if (!hasApiKey) {
                return {
                    status: 'unhealthy',
                    message: 'OpenAI API key not configured',
                    configured: false
                };
            }

            return {
                status: 'healthy',
                message: 'OpenAI API configured',
                configured: true
            };
        });

        // Audit system health
        this.registerCheck('audit_system', async () => {
            const auditLogger = require('./audit-logger');

            try {
                // Test logging
                await auditLogger.logEmailStateChange(
                    'health-check',
                    'TEST',
                    'TEST',
                    'health-monitor'
                );

                // Check if logs are accessible
                const entries = await auditLogger.getRecentAuditEntries(1);

                return {
                    status: 'healthy',
                    message: 'Audit system operational',
                    recentEntries: entries.length
                };
            } catch (error) {
                return {
                    status: 'degraded',
                    message: `Audit system warning: ${error.message}`,
                    error: error.message
                };
            }
        });

        // Process health
        this.registerCheck('process', async () => {
            const uptime = process.uptime();
            const cpuUsage = process.cpuUsage();

            return {
                status: 'healthy',
                message: `Process uptime: ${this.formatUptime(uptime)}`,
                details: {
                    uptime: Math.round(uptime),
                    pid: process.pid,
                    version: process.version,
                    cpuUser: Math.round(cpuUsage.user / 1000) + 'ms',
                    cpuSystem: Math.round(cpuUsage.system / 1000) + 'ms'
                }
            };
        });
    }

    /**
     * Run a specific health check
     */
    async runCheck(name) {
        const check = this.checks.get(name);
        if (!check) {
            return {
                status: 'unknown',
                message: `Check '${name}' not found`
            };
        }

        const startTime = Date.now();

        try {
            // Run check with timeout
            const result = await this.withTimeout(check.fn(), check.timeout);
            result.latency = Date.now() - startTime;
            result.timestamp = new Date().toISOString();
            result.name = name;

            // Store result
            this.lastResults.set(name, result);

            return result;
        } catch (error) {
            const result = {
                name,
                status: 'unhealthy',
                message: `Check failed: ${error.message}`,
                error: error.message,
                latency: Date.now() - startTime,
                timestamp: new Date().toISOString()
            };

            this.lastResults.set(name, result);
            return result;
        }
    }

    /**
     * Run all health checks
     */
    async runAllChecks() {
        const results = {};
        const promises = [];

        for (const [name, check] of this.checks) {
            promises.push(
                this.runCheck(name).then(result => {
                    results[name] = result;
                })
            );
        }

        await Promise.all(promises);

        // Calculate overall health
        const overall = this.calculateOverallHealth(results);

        // Store in history
        this.addToHistory({
            timestamp: new Date().toISOString(),
            overall,
            checks: results
        });

        return {
            status: overall,
            timestamp: new Date().toISOString(),
            checks: results,
            system: this.getSystemInfo()
        };
    }

    /**
     * Calculate overall system health
     */
    calculateOverallHealth(results) {
        let hasUnhealthy = false;
        let hasDegraded = false;
        let hasCriticalFailure = false;

        for (const [name, result] of Object.entries(results)) {
            const check = this.checks.get(name);

            if (result.status === 'unhealthy') {
                hasUnhealthy = true;
                if (check && check.critical) {
                    hasCriticalFailure = true;
                }
            } else if (result.status === 'degraded') {
                hasDegraded = true;
            }
        }

        if (hasCriticalFailure) return 'critical';
        if (hasUnhealthy) return 'unhealthy';
        if (hasDegraded) return 'degraded';
        return 'healthy';
    }

    /**
     * Get system information
     */
    getSystemInfo() {
        const loadAvg = os.loadavg();

        return {
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            loadAverage: {
                '1min': loadAvg[0].toFixed(2),
                '5min': loadAvg[1].toFixed(2),
                '15min': loadAvg[2].toFixed(2)
            },
            memory: {
                total: Math.round(os.totalmem() / 1024 / 1024) + ' MB',
                free: Math.round(os.freemem() / 1024 / 1024) + ' MB',
                used: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024) + ' MB'
            },
            uptime: this.formatUptime(os.uptime())
        };
    }

    /**
     * Get available disk space (simplified)
     */
    getAvailableSpace() {
        try {
            const dataDir = path.join(__dirname, '../data');
            const stats = fsSync.statSync(dataDir);

            // Get basic file system info
            const diskInfo = {
                path: dataDir,
                exists: true,
                isDirectory: stats.isDirectory(),
                size: this.formatBytes(stats.size || 0),
                modified: stats.mtime.toISOString()
            };

            // Try to get more detailed disk space info using statvfs (Unix-like systems)
            try {
                const { execSync } = require('child_process');
                const platform = os.platform();

                if (platform === 'linux' || platform === 'darwin') {
                    // Use df command to get disk usage
                    const dfOutput = execSync(`df -h "${dataDir}"`, { encoding: 'utf8' });
                    const lines = dfOutput.trim().split('\n');
                    if (lines.length >= 2) {
                        const parts = lines[1].split(/\s+/);
                        if (parts.length >= 4) {
                            diskInfo.totalSpace = parts[1];
                            diskInfo.usedSpace = parts[2];
                            diskInfo.availableSpace = parts[3];
                            diskInfo.usagePercentage = parts[4];
                        }
                    }
                } else if (platform === 'win32') {
                    // Use wmic for Windows
                    const drive = dataDir.charAt(0);
                    const wmicOutput = execSync(`wmic logicaldisk where caption="${drive}:" get size,freespace /value`, { encoding: 'utf8' });
                    const freeMatch = wmicOutput.match(/FreeSpace=(\d+)/);
                    const sizeMatch = wmicOutput.match(/Size=(\d+)/);

                    if (freeMatch && sizeMatch) {
                        const freeBytes = parseInt(freeMatch[1]);
                        const totalBytes = parseInt(sizeMatch[1]);
                        const usedBytes = totalBytes - freeBytes;

                        diskInfo.totalSpace = this.formatBytes(totalBytes);
                        diskInfo.usedSpace = this.formatBytes(usedBytes);
                        diskInfo.availableSpace = this.formatBytes(freeBytes);
                        diskInfo.usagePercentage = `${Math.round((usedBytes / totalBytes) * 100)}%`;
                    }
                }
            } catch (cmdError) {
                // If system commands fail, just return basic info
                diskInfo.note = 'Detailed disk space info unavailable';
            }

            return diskInfo;
        } catch (error) {
            return {
                error: 'Error checking disk space',
                message: error.message
            };
        }
    }

    /**
     * Format bytes into human readable format
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Format uptime in human-readable format
     */
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);

        return parts.join(' ') || '< 1m';
    }

    /**
     * Execute function with timeout
     */
    withTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Check timeout')), timeout)
            )
        ]);
    }

    /**
     * Add result to history
     */
    addToHistory(result) {
        this.history.unshift(result);

        // Trim history if too large
        if (this.history.length > this.maxHistorySize) {
            this.history = this.history.slice(0, this.maxHistorySize);
        }
    }

    /**
     * Get health history
     */
    getHistory(count = 10) {
        return this.history.slice(0, count);
    }

    /**
     * Get metrics for monitoring
     */
    async getMetrics() {
        const db = require('./database');
        const auditLogger = require('./audit-logger');

        // Get email statistics
        const stats = await db.getStats();

        // Get recent audit entries
        const recentAudits = await auditLogger.getRecentAuditEntries(10);

        // Get process metrics
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        return {
            emails: {
                fetched: stats.fetched,
                review: stats.review,
                managed: stats.managed,
                total: stats.total
            },
            system: {
                memory: {
                    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                    rss: Math.round(memUsage.rss / 1024 / 1024),
                    external: Math.round(memUsage.external / 1024 / 1024)
                },
                cpu: {
                    user: Math.round(cpuUsage.user / 1000000),
                    system: Math.round(cpuUsage.system / 1000000)
                },
                uptime: Math.round(process.uptime())
            },
            audit: {
                recentEvents: recentAudits.length,
                eventTypes: [...new Set(recentAudits.map(e => e.eventType))]
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Start periodic health checks
     */
    startPeriodicChecks(interval = 60000) {
        this.stopPeriodicChecks(); // Stop any existing interval

        this.checkInterval = setInterval(async () => {
            try {
                await this.runAllChecks();
            } catch (error) {
                console.error('Periodic health check failed:', error);
            }
        }, interval);

        // Run initial check
        this.runAllChecks();
    }

    /**
     * Stop periodic health checks
     */
    stopPeriodicChecks() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
}

module.exports = new HealthMonitor();
