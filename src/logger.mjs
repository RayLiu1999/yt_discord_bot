import fs from 'fs/promises';
import path from 'path';
import { rootDir } from './path.mjs';

/**
 * 改進的日誌系統
 * 提供結構化日誌記錄，支援不同日誌級別和文件輪轉
 */

// 日誌級別
export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class Logger {
  constructor(options = {}) {
    this.logLevel = options.logLevel || LOG_LEVELS.INFO;
    this.logDir = options.logDir || path.join(rootDir, 'logs');
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    
    this.ensureLogDir();
  }

  async ensureLogDir() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('無法創建日誌目錄:', error);
    }
  }

  formatMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level);
    
    return {
      timestamp,
      level: levelName,
      message,
      metadata,
      pid: process.pid
    };
  }

  async writeToFile(filename, content) {
    const filePath = path.join(this.logDir, filename);
    
    try {
      // 檢查文件大小，如需要則輪轉
      await this.rotateFileIfNeeded(filePath);
      
      const logEntry = JSON.stringify(content) + '\n';
      await fs.appendFile(filePath, logEntry);
    } catch (error) {
      console.error('寫入日誌文件失敗:', error);
    }
  }

  async rotateFileIfNeeded(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > this.maxFileSize) {
        await this.rotateLogFile(filePath);
      }
    } catch (error) {
      // 文件不存在或其他錯誤，忽略
    }
  }

  async rotateLogFile(filePath) {
    const basename = path.basename(filePath, '.log');
    const dirname = path.dirname(filePath);
    
    try {
      // 輪轉現有文件
      for (let i = this.maxFiles - 1; i > 0; i--) {
        const oldFile = path.join(dirname, `${basename}.${i}.log`);
        const newFile = path.join(dirname, `${basename}.${i + 1}.log`);
        
        try {
          await fs.rename(oldFile, newFile);
        } catch (error) {
          // 文件不存在，繼續
        }
      }
      
      // 移動當前文件到 .1.log
      const rotatedFile = path.join(dirname, `${basename}.1.log`);
      await fs.rename(filePath, rotatedFile);
      
      // 刪除超過保留數量的文件
      const excessFile = path.join(dirname, `${basename}.${this.maxFiles + 1}.log`);
      try {
        await fs.unlink(excessFile);
      } catch (error) {
        // 文件不存在，忽略
      }
    } catch (error) {
      console.error('日誌輪轉失敗:', error);
    }
  }

  async log(level, message, metadata = {}) {
    if (level > this.logLevel) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, metadata);
    
    // 輸出到控制台
    const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level);
    const consoleMessage = `[${formattedMessage.timestamp}] ${levelName}: ${message}`;
    
    switch (level) {
      case LOG_LEVELS.ERROR:
        console.error(consoleMessage, metadata);
        break;
      case LOG_LEVELS.WARN:
        console.warn(consoleMessage, metadata);
        break;
      case LOG_LEVELS.DEBUG:
        console.debug(consoleMessage, metadata);
        break;
      default:
        console.log(consoleMessage, metadata);
    }
    
    // 寫入文件
    const filename = level === LOG_LEVELS.ERROR ? 'error.log' : 'app.log';
    await this.writeToFile(filename, formattedMessage);
  }

  async error(message, metadata = {}) {
    await this.log(LOG_LEVELS.ERROR, message, metadata);
  }

  async warn(message, metadata = {}) {
    await this.log(LOG_LEVELS.WARN, message, metadata);
  }

  async info(message, metadata = {}) {
    await this.log(LOG_LEVELS.INFO, message, metadata);
  }

  async debug(message, metadata = {}) {
    await this.log(LOG_LEVELS.DEBUG, message, metadata);
  }
}

// 創建全局日誌實例
export const logger = new Logger({
  logLevel: process.env.LOG_LEVEL ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] : LOG_LEVELS.INFO
});

// 兼容舊的 addErrorLog 函數
export function addErrorLog(error, metadata = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const errorMetadata = error instanceof Error ? { 
    stack: error.stack, 
    ...metadata 
  } : metadata;
  
  logger.error(message, errorMetadata);
}