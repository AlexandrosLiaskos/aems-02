/**
 * Backup Manager for AEMS
 * Handles automated backups of JSON data files
 */

const fs = require('fs').promises;
const path = require('path');
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');

class BackupManager {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.backupDir = path.join(__dirname, '../backups');
    this.maxBackups = parseInt(process.env.MAX_BACKUPS) || 7; // Keep 7 days of backups
    this.backupInterval = parseInt(process.env.BACKUP_INTERVAL_HOURS) || 24; // Backup every 24 hours
    this.isRunning = false;
    this.init();
  }

  async init() {
    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });
      
      // Start automatic backup schedule
      this.startBackupSchedule();
      
      console.log('Backup manager initialized');
    } catch (error) {
      console.error('Failed to initialize backup manager:', error);
    }
  }

  /**
   * Start automatic backup schedule
   */
  startBackupSchedule() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Run backup immediately on startup
    setTimeout(() => this.performBackup(), 5000);
    
    // Schedule regular backups
    this.backupTimer = setInterval(() => {
      this.performBackup();
    }, this.backupInterval * 60 * 60 * 1000);
    
    console.log(`Backup schedule started: every ${this.backupInterval} hours`);
  }

  /**
   * Stop backup schedule
   */
  stopBackupSchedule() {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
    this.isRunning = false;
    console.log('Backup schedule stopped');
  }

  /**
   * Perform a complete backup
   */
  async performBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `backup-${timestamp}`;
      const backupPath = path.join(this.backupDir, backupName);
      
      console.log(`Starting backup: ${backupName}`);
      
      // Create backup directory
      await fs.mkdir(backupPath, { recursive: true });
      
      // Backup all data files
      await this.backupDirectory(this.dataDir, backupPath);
      
      // Create backup manifest
      await this.createBackupManifest(backupPath, timestamp);
      
      // Clean up old backups
      await this.cleanupOldBackups();
      
      console.log(`Backup completed: ${backupName}`);
      return { success: true, backupName, path: backupPath };
      
    } catch (error) {
      console.error('Backup failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Recursively backup a directory
   */
  async backupDirectory(sourceDir, targetDir) {
    const items = await fs.readdir(sourceDir, { withFileTypes: true });
    
    for (const item of items) {
      const sourcePath = path.join(sourceDir, item.name);
      const targetPath = path.join(targetDir, item.name);
      
      if (item.isDirectory()) {
        await fs.mkdir(targetPath, { recursive: true });
        await this.backupDirectory(sourcePath, targetPath);
      } else if (item.isFile()) {
        await this.copyFile(sourcePath, targetPath);
      }
    }
  }

  /**
   * Copy a file with error handling
   */
  async copyFile(source, target) {
    try {
      await pipeline(
        createReadStream(source),
        createWriteStream(target)
      );
    } catch (error) {
      console.error(`Failed to copy ${source} to ${target}:`, error);
      throw error;
    }
  }

  /**
   * Create backup manifest with metadata
   */
  async createBackupManifest(backupPath, timestamp) {
    const manifest = {
      timestamp,
      version: '1.0',
      created: new Date().toISOString(),
      files: await this.getFileList(backupPath),
      checksum: await this.calculateChecksum(backupPath)
    };
    
    const manifestPath = path.join(backupPath, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Get list of files in backup
   */
  async getFileList(dir, relativePath = '') {
    const files = [];
    const items = await fs.readdir(dir, { withFileTypes: true });
    
    for (const item of items) {
      const itemPath = path.join(dir, item.name);
      const relativeItemPath = path.join(relativePath, item.name);
      
      if (item.isDirectory()) {
        const subFiles = await this.getFileList(itemPath, relativeItemPath);
        files.push(...subFiles);
      } else if (item.isFile() && item.name !== 'manifest.json') {
        const stats = await fs.stat(itemPath);
        files.push({
          path: relativeItemPath,
          size: stats.size,
          modified: stats.mtime.toISOString()
        });
      }
    }
    
    return files;
  }

  /**
   * Calculate simple checksum for backup verification
   */
  async calculateChecksum(backupPath) {
    const files = await this.getFileList(backupPath);
    const crypto = require('crypto');
    const hash = crypto.createHash('md5');
    
    // Create checksum based on file paths and sizes
    const checksumData = files
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(f => `${f.path}:${f.size}:${f.modified}`)
      .join('|');
    
    hash.update(checksumData);
    return hash.digest('hex');
  }

  /**
   * Clean up old backups
   */
  async cleanupOldBackups() {
    try {
      const backups = await fs.readdir(this.backupDir, { withFileTypes: true });
      const backupDirs = backups
        .filter(item => item.isDirectory() && item.name.startsWith('backup-'))
        .map(item => ({
          name: item.name,
          path: path.join(this.backupDir, item.name),
          created: this.extractTimestampFromBackupName(item.name)
        }))
        .sort((a, b) => b.created - a.created); // Sort by newest first
      
      // Remove old backups beyond the limit
      if (backupDirs.length > this.maxBackups) {
        const toDelete = backupDirs.slice(this.maxBackups);
        
        for (const backup of toDelete) {
          await this.deleteDirectory(backup.path);
          console.log(`Deleted old backup: ${backup.name}`);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old backups:', error);
    }
  }

  /**
   * Extract timestamp from backup directory name
   */
  extractTimestampFromBackupName(name) {
    try {
      const timestamp = name.replace('backup-', '').replace(/-/g, ':');
      return new Date(timestamp.replace(/T(\d{2}):(\d{2}):(\d{2})/, 'T$1:$2:$3'));
    } catch (error) {
      return new Date(0); // Return epoch if parsing fails
    }
  }

  /**
   * Recursively delete a directory
   */
  async deleteDirectory(dirPath) {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);
      
      if (item.isDirectory()) {
        await this.deleteDirectory(itemPath);
      } else {
        await fs.unlink(itemPath);
      }
    }
    
    await fs.rmdir(dirPath);
  }

  /**
   * List available backups
   */
  async listBackups() {
    try {
      const backups = await fs.readdir(this.backupDir, { withFileTypes: true });
      const backupList = [];
      
      for (const item of backups) {
        if (item.isDirectory() && item.name.startsWith('backup-')) {
          const backupPath = path.join(this.backupDir, item.name);
          const manifestPath = path.join(backupPath, 'manifest.json');
          
          try {
            const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
            backupList.push({
              name: item.name,
              path: backupPath,
              created: manifest.created,
              fileCount: manifest.files.length,
              checksum: manifest.checksum
            });
          } catch (error) {
            // Backup without manifest or corrupted
            backupList.push({
              name: item.name,
              path: backupPath,
              created: this.extractTimestampFromBackupName(item.name).toISOString(),
              fileCount: 'unknown',
              checksum: 'unknown'
            });
          }
        }
      }
      
      return backupList.sort((a, b) => new Date(b.created) - new Date(a.created));
    } catch (error) {
      console.error('Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Get backup statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      backupInterval: this.backupInterval,
      maxBackups: this.maxBackups,
      backupDir: this.backupDir,
      nextBackup: this.backupTimer ? 'Scheduled' : 'Not scheduled'
    };
  }
}

module.exports = new BackupManager();
