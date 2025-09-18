import { CONSTANTS } from '#src/constants';
import { logger } from '#src/logger';
import { delay, sendVideo } from '#src/functions';
import { sendMessage } from '#src/functions';
import crawler from '#src/crawler';
import config from '#src/config';

/**
 * 定時器管理器
 * 負責管理自動爬蟲的定時執行邏輯
 */
class SchedulerManager {
  constructor(client) {
    this.client = client;
    this.isRunning = false;
    this.currentTimer = null;
  }

  /**
   * 啟動定時器
   */
  async start() {
    if (this.isRunning) {
      logger.warn('定時器已在運行中');
      return;
    }

    this.isRunning = true;
    logger.info('啟動自動爬蟲定時器');

    // 計算到下一個執行時間的間隔
    const intervalTime = this.calculateNextInterval();
    await this.startTimer(intervalTime);
  }

  /**
   * 停止定時器
   */
  stop() {
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    this.isRunning = false;
    logger.info('定時器已停止');
  }

  /**
   * 計算到下一個整點或半點的時間間隔
   * @returns {number} 毫秒數
   */
  calculateNextInterval() {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();
    
    // 計算到下一個半點的時間
    const timeToNextHalfHour = (30 - (minutes % 30)) * 60 * 1000 - seconds * 1000 - milliseconds;
    
    // 計算到下一個整點的時間
    const timeToNextHour = (60 - minutes) * 60 * 1000 - seconds * 1000 - milliseconds;
    
    // 選擇較近的時間點
    return Math.min(timeToNextHalfHour, timeToNextHour);
  }

  /**
   * 計算下一次執行的時間間隔
   * @param {Date} executeTime - 當前執行時間
   * @returns {number} 毫秒數
   */
  calculateNextExecutionInterval(executeTime) {
    const executeHour = executeTime.getHours();
    const executeMinute = executeTime.getMinutes();
    
    // 基礎間隔時間（30分鐘）
    let timeInterval = CONSTANTS.CRAWLER.INTERVAL_MINUTES * 60 * 1000;

    // 特殊時間處理：避免午夜執行
    if (executeHour === 23 && executeMinute === 30) {
      // 午夜11:30，下一次間隔改為40分鐘（避開午夜12:00）
      timeInterval = 40 * 60 * 1000;
    } else if (executeHour === 23 && executeMinute === 50) {
      // 午夜11:50，下一次間隔改為40分鐘
      timeInterval = 40 * 60 * 1000;
    }

    // 計算執行時間偏差並調整
    const now = new Date();
    const currentMinutes = now.getMinutes();
    const currentSeconds = now.getSeconds();
    const currentMilliseconds = now.getMilliseconds();
    
    const timeDiff = (currentMinutes - executeMinute) * 60 * 1000 + 
                     (currentSeconds - 0) * 1000 + 
                     (currentMilliseconds - 0);

    // 扣除偏差時間
    return Math.max(timeInterval - timeDiff, 60000); // 最少等待1分鐘
  }

  /**
   * 啟動定時器
   * @param {number} intervalTime - 間隔時間（毫秒）
   */
  async startTimer(intervalTime) {
    logger.info('定時器配置', {
      nextExecutionIn: Math.round(intervalTime / 1000 / 60 * 10) / 10 + '分鐘',
      nextExecutionTime: new Date(Date.now() + intervalTime).toLocaleString()
    });

    this.currentTimer = setTimeout(async () => {
      if (!this.isRunning) {
        return; // 定時器已被停止
      }

      const executeTime = new Date();
      const executeHour = executeTime.getHours();
      const executeMinute = executeTime.getMinutes();

      logger.info('開始自動爬蟲執行', {
        time: executeTime.toLocaleString(),
        hour: executeHour,
        minute: executeMinute
      });

      // 午夜不執行爬蟲
      if (executeHour === 0 && executeMinute === 0) {
        logger.info('午夜時間，跳過爬蟲執行');
      } else {
        await this.executeCrawler();
      }

      // 計算下一次執行時間並重新啟動定時器
      if (this.isRunning) {
        const nextInterval = this.calculateNextExecutionInterval(executeTime);
        await this.startTimer(nextInterval);
      }
    }, intervalTime);
  }

  /**
   * 執行爬蟲任務
   */
  async executeCrawler() {
    try {
      logger.info('開始執行爬蟲任務');

      // 執行爬蟲
      await crawler(this.client);
      
      // 等待一小段時間確保文件寫入完成
      await delay(300);

      // 發送影片和直播
      await this.sendCrawledContent();

      logger.info('爬蟲任務執行完成');
    } catch (error) {
      logger.error('自動爬蟲執行失敗', { error: error.message });
      
      // 發送錯誤通知到相關頻道
      await this.sendErrorNotification();
    }
  }

  /**
   * 發送爬取到的內容
   */
  async sendCrawledContent() {
    try {
      // 並行發送影片和直播
      const sendPromises = [
        sendVideo(this.client, CONSTANTS.FILES.VIDEOS, config.VIDEO_CHANNEL_ID),
        sendVideo(this.client, CONSTANTS.FILES.STREAMS, config.STREAM_CHANNEL_ID)
      ];

      const [videoResult, streamResult] = await Promise.allSettled(sendPromises);

      // 記錄發送結果
      if (videoResult.status === 'fulfilled') {
        logger.info('影片發送完成', { success: videoResult.value });
      } else {
        logger.error('影片發送失敗', { error: videoResult.reason });
      }

      if (streamResult.status === 'fulfilled') {
        logger.info('直播發送完成', { success: streamResult.value });
      } else {
        logger.error('直播發送失敗', { error: streamResult.reason });
      }
    } catch (error) {
      logger.error('發送內容時發生錯誤', { error: error.message });
    }
  }

  /**
   * 發送錯誤通知
   */
  async sendErrorNotification() {
    try {
      const errorMessage = '自動爬蟲執行失敗，請檢查日誌或手動執行爬蟲。';
      
      // 並行發送錯誤通知到兩個頻道
      await Promise.allSettled([
        sendMessage(this.client, config.VIDEO_CHANNEL_ID, errorMessage),
        sendMessage(this.client, config.STREAM_CHANNEL_ID, errorMessage)
      ]);
    } catch (error) {
      logger.error('發送錯誤通知失敗', { error: error.message });
    }
  }

  /**
   * 獲取定時器狀態
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      hasActiveTimer: this.currentTimer !== null,
      nextExecutionTime: this.currentTimer ? 
        new Date(Date.now() + this.calculateNextInterval()).toLocaleString() : 
        null
    };
  }

  /**
   * 重啟定時器
   */
  async restart() {
    logger.info('重啟定時器');
    this.stop();
    await delay(1000); // 等待1秒確保清理完成
    await this.start();
  }
}

export { SchedulerManager };