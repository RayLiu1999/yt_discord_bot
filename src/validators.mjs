import ytdl from 'ytdl-core';

/**
 * 輸入驗證模組
 * 提供各種輸入驗證功能，確保數據安全性
 */

/**
 * 驗證 YouTube 頻道 ID 格式
 * @param {string} channelId - 頻道 ID
 * @returns {boolean} 是否有效
 */
export function validateChannelId(channelId) {
  if (!channelId || typeof channelId !== 'string') {
    return false;
  }
  
  // YouTube 頻道 ID 格式：@channelname 或 UCxxxxxxxxxx 或頻道名稱
  const channelIdPattern = /^(@[a-zA-Z0-9_.-]+|UC[a-zA-Z0-9_-]{22}|[a-zA-Z0-9_.-]+)$/;
  return channelIdPattern.test(channelId.trim());
}

/**
 * 驗證 YouTube 影片 URL
 * @param {string} url - 影片 URL
 * @returns {boolean} 是否有效
 */
export function validateYouTubeUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    return ytdl.validateURL(url);
  } catch (error) {
    return false;
  }
}

/**
 * 驗證 Discord 頻道 ID
 * @param {string} channelId - Discord 頻道 ID
 * @returns {boolean} 是否有效
 */
export function validateDiscordChannelId(channelId) {
  if (!channelId || typeof channelId !== 'string') {
    return false;
  }
  
  // Discord 頻道 ID 是 17-19 位數字
  const discordIdPattern = /^\d{17,19}$/;
  return discordIdPattern.test(channelId);
}

/**
 * 清理和驗證指令參數
 * @param {string} input - 原始輸入
 * @returns {string} 清理後的輸入
 */
export function sanitizeInput(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // 移除多餘空格和潜在危險字符
  return input.trim().replace(/[<>]/g, '');
}

/**
 * 驗證環境變數配置
 * @param {object} config - 配置對象
 * @returns {object} 驗證結果
 */
export function validateConfig(config) {
  const errors = [];
  
  if (!config.TOKEN) {
    errors.push('缺少 Discord TOKEN');
  }
  
  if (!validateDiscordChannelId(config.VIDEO_CHANNEL_ID)) {
    errors.push('VIDEO_CHANNEL_ID 格式無效');
  }
  
  if (!validateDiscordChannelId(config.STREAM_CHANNEL_ID)) {
    errors.push('STREAM_CHANNEL_ID 格式無效');
  }
  
  if (config.CRAWLER_TYPE && !['fetch', 'puppeteer'].includes(config.CRAWLER_TYPE)) {
    errors.push('CRAWLER_TYPE 必須是 fetch 或 puppeteer');
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

/**
 * 驗證檔案路徑安全性
 * @param {string} filePath - 檔案路徑
 * @returns {boolean} 是否安全
 */
export function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }
  
  // 防止路徑穿越攻擊
  const normalizedPath = filePath.replace(/\\/g, '/');
  return !normalizedPath.includes('../') && !normalizedPath.includes('./');
}

/**
 * 驗證音量值
 * @param {number} volume - 音量值
 * @returns {boolean} 是否有效
 */
export function validateVolume(volume) {
  return typeof volume === 'number' && volume >= 0 && volume <= 1;
}