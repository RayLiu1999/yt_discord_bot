import dotenv from 'dotenv';
import { validateConfig } from '#src/validators';
import { logger } from '#src/logger';

// 載入環境變數
dotenv.config();

/**
 * 增強的配置管理模組
 * 提供配置驗證、預設值設定和環境變數管理
 */
class ConfigManager {
  constructor() {
    this.config = this.loadConfig();
    this.validateConfiguration();
  }

  /**
   * 載入配置
   */
  loadConfig() {
    return {
      // Discord 設定
      TOKEN: process.env.TOKEN,
      CLIENT_ID: process.env.CLIENT_ID,
      GUILD_ID: process.env.GUILD_ID,
      VIDEO_CHANNEL_ID: process.env.VIDEO_CHANNEL_ID,
      STREAM_CHANNEL_ID: process.env.STREAM_CHANNEL_ID,
      
      // 爬蟲設定
      CRAWLER_TYPE: process.env.CRAWLER_TYPE || 'fetch',
      CRAWLER_INTERVAL: parseInt(process.env.CRAWLER_INTERVAL) || 30,
      CRAWLER_TIMEOUT: parseInt(process.env.CRAWLER_TIMEOUT) || 30000,
      CRAWLER_RETRY_ATTEMPTS: parseInt(process.env.CRAWLER_RETRY_ATTEMPTS) || 3,
      
      // 日誌設定
      LOG_LEVEL: process.env.LOG_LEVEL || 'INFO',
      LOG_DIR: process.env.LOG_DIR || './logs',
      
      // 音樂設定
      MUSIC_VOLUME: parseFloat(process.env.MUSIC_VOLUME) || 0.5,
      MUSIC_QUEUE_SIZE: parseInt(process.env.MUSIC_QUEUE_SIZE) || 50,
      
      // 性能設定
      MESSAGE_BATCH_SIZE: parseInt(process.env.MESSAGE_BATCH_SIZE) || 5,
      MESSAGE_DELAY: parseInt(process.env.MESSAGE_DELAY) || 1000,
      
      // 開發模式
      NODE_ENV: process.env.NODE_ENV || 'production',
      DEBUG: process.env.DEBUG === 'true',
      
      // API 設定
      USER_AGENT: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      
      // 安全設定
      ENABLE_SECURITY_CHECKS: process.env.ENABLE_SECURITY_CHECKS !== 'false',
      MAX_COMMAND_LENGTH: parseInt(process.env.MAX_COMMAND_LENGTH) || 500,
    };
  }

  /**
   * 驗證配置
   */
  validateConfiguration() {
    const validation = validateConfig(this.config);
    
    if (!validation.isValid) {
      logger.error('配置驗證失敗', { errors: validation.errors });
      
      // 在開發模式下顯示詳細錯誤
      if (this.config.NODE_ENV === 'development') {
        console.error('\n配置錯誤詳情:');
        validation.errors.forEach((error, index) => {
          console.error(`${index + 1}. ${error}`);
        });
        console.error('\n請檢查 .env 文件中的配置項目。\n');
      }
      
      throw new Error('配置驗證失敗，應用程式無法啟動');
    }
    
    logger.info('配置驗證通過');
  }

  /**
   * 獲取配置值
   * @param {string} key - 配置鍵名
   * @param {*} defaultValue - 預設值
   * @returns {*} 配置值
   */
  get(key, defaultValue = null) {
    return this.config[key] !== undefined ? this.config[key] : defaultValue;
  }

  /**
   * 設定配置值（僅限運行時）
   * @param {string} key - 配置鍵名
   * @param {*} value - 配置值
   */
  set(key, value) {
    this.config[key] = value;
    logger.debug('配置已更新', { key, value });
  }

  /**
   * 獲取所有配置（隱藏敏感資訊）
   */
  getAll(hideSensitive = true) {
    if (!hideSensitive) {
      return { ...this.config };
    }

    const sensitiveKeys = ['TOKEN', 'CLIENT_ID'];
    const safeConfig = { ...this.config };
    
    sensitiveKeys.forEach(key => {
      if (safeConfig[key]) {
        safeConfig[key] = '***';
      }
    });

    return safeConfig;
  }

  /**
   * 檢查是否為開發模式
   */
  isDevelopment() {
    return this.config.NODE_ENV === 'development';
  }

  /**
   * 檢查是否為生產模式
   */
  isProduction() {
    return this.config.NODE_ENV === 'production';
  }

  /**
   * 檢查是否啟用除錯模式
   */
  isDebug() {
    return this.config.DEBUG;
  }

  /**
   * 獲取 Discord 相關配置
   */
  getDiscordConfig() {
    return {
      TOKEN: this.config.TOKEN,
      CLIENT_ID: this.config.CLIENT_ID,
      GUILD_ID: this.config.GUILD_ID,
      VIDEO_CHANNEL_ID: this.config.VIDEO_CHANNEL_ID,
      STREAM_CHANNEL_ID: this.config.STREAM_CHANNEL_ID,
    };
  }

  /**
   * 獲取爬蟲相關配置
   */
  getCrawlerConfig() {
    return {
      CRAWLER_TYPE: this.config.CRAWLER_TYPE,
      CRAWLER_INTERVAL: this.config.CRAWLER_INTERVAL,
      CRAWLER_TIMEOUT: this.config.CRAWLER_TIMEOUT,
      CRAWLER_RETRY_ATTEMPTS: this.config.CRAWLER_RETRY_ATTEMPTS,
      USER_AGENT: this.config.USER_AGENT,
    };
  }

  /**
   * 獲取音樂相關配置
   */
  getMusicConfig() {
    return {
      MUSIC_VOLUME: this.config.MUSIC_VOLUME,
      MUSIC_QUEUE_SIZE: this.config.MUSIC_QUEUE_SIZE,
    };
  }

  /**
   * 動態重載配置（僅限非敏感配置）
   */
  reloadConfig() {
    const oldConfig = { ...this.config };
    
    // 重新載入環境變數
    dotenv.config();
    
    // 更新非敏感配置
    const nonSensitiveKeys = [
      'LOG_LEVEL', 'MUSIC_VOLUME', 'MESSAGE_BATCH_SIZE', 'MESSAGE_DELAY',
      'CRAWLER_INTERVAL', 'CRAWLER_TIMEOUT', 'DEBUG'
    ];
    
    nonSensitiveKeys.forEach(key => {
      if (process.env[key] !== undefined) {
        let value = process.env[key];
        
        // 根據類型轉換
        if (['MUSIC_VOLUME'].includes(key)) {
          value = parseFloat(value);
        } else if (['MESSAGE_BATCH_SIZE', 'MESSAGE_DELAY', 'CRAWLER_INTERVAL', 'CRAWLER_TIMEOUT'].includes(key)) {
          value = parseInt(value);
        } else if (key === 'DEBUG') {
          value = value === 'true';
        }
        
        this.config[key] = value;
      }
    });
    
    logger.info('配置已重載', { 
      changed: Object.keys(this.config).filter(key => 
        this.config[key] !== oldConfig[key]
      )
    });
  }
}

// 創建單例配置管理器
const configManager = new ConfigManager();

// 導出配置對象（向後兼容）
export default configManager.getDiscordConfig();

// 導出配置管理器
export { configManager };