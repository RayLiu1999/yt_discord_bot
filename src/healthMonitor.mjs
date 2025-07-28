import fs from 'fs/promises';
import { logger } from '#src/logger';
import { configManager } from '#src/configManager';

/**
 * 健康檢查和系統監控模組
 * 提供系統狀態監控、性能指標收集和健康檢查功能
 */
class HealthMonitor {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      commandsExecuted: 0,
      crawlerExecutions: 0,
      crawlerErrors: 0,
      musicPlayed: 0,
      messagesProcessed: 0,
      errors: 0,
      memoryUsage: [],
      lastCrawlerExecution: null,
      lastError: null,
    };
    
    this.isHealthy = true;
    this.startPeriodicChecks();
  }

  /**
   * 啟動定期健康檢查
   */
  startPeriodicChecks() {
    // 每分鐘記錄記憶體使用情況
    setInterval(() => {
      this.recordMemoryUsage();
    }, 60000);

    // 每10分鐘進行健康檢查
    setInterval(() => {
      this.performHealthCheck();
    }, 600000);
  }

  /**
   * 記錄記憶體使用情況
   */
  recordMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    this.metrics.memoryUsage.push({
      timestamp: Date.now(),
      rss: memoryUsage.rss,
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
    });

    // 只保留最近24小時的數據（1440個記錄點）
    if (this.metrics.memoryUsage.length > 1440) {
      this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-1440);
    }

    // 檢查記憶體洩漏
    this.checkMemoryLeak();
  }

  /**
   * 檢查記憶體洩漏
   */
  checkMemoryLeak() {
    if (this.metrics.memoryUsage.length < 60) return; // 需要至少1小時的數據

    const recent = this.metrics.memoryUsage.slice(-60); // 最近1小時
    const hour_ago = this.metrics.memoryUsage.slice(-120, -60); // 1-2小時前

    if (recent.length === 0 || hour_ago.length === 0) return;

    const recentAvg = recent.reduce((sum, m) => sum + m.heapUsed, 0) / recent.length;
    const olderAvg = hour_ago.reduce((sum, m) => sum + m.heapUsed, 0) / hour_ago.length;

    const growthRate = (recentAvg - olderAvg) / olderAvg;

    if (growthRate > 0.2) { // 記憶體增長超過20%
      logger.warn('偵測到可能的記憶體洩漏', {
        recentAverage: Math.round(recentAvg / 1024 / 1024) + 'MB',
        olderAverage: Math.round(olderAvg / 1024 / 1024) + 'MB',
        growthRate: Math.round(growthRate * 100) + '%'
      });
    }
  }

  /**
   * 執行健康檢查
   */
  async performHealthCheck() {
    const checks = [];

    // 檢查記憶體使用
    checks.push(this.checkMemoryHealth());

    // 檢查磁盤空間
    checks.push(await this.checkDiskSpace());

    // 檢查爬蟲狀態
    checks.push(this.checkCrawlerHealth());

    // 檢查錯誤率
    checks.push(this.checkErrorRate());

    const failedChecks = checks.filter(check => !check.healthy);
    this.isHealthy = failedChecks.length === 0;

    if (!this.isHealthy) {
      logger.warn('健康檢查失敗', { failedChecks });
    } else {
      logger.debug('健康檢查通過');
    }

    return {
      healthy: this.isHealthy,
      checks: checks,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 檢查記憶體健康狀況
   */
  checkMemoryHealth() {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
    const heapUsagePercentage = (heapUsedMB / heapTotalMB) * 100;

    const healthy = heapUsagePercentage < 90; // 堆疊使用率低於90%

    return {
      name: 'memory',
      healthy,
      details: {
        heapUsed: Math.round(heapUsedMB) + 'MB',
        heapTotal: Math.round(heapTotalMB) + 'MB',
        usage: Math.round(heapUsagePercentage) + '%'
      }
    };
  }

  /**
   * 檢查磁盤空間
   */
  async checkDiskSpace() {
    try {
      const stats = await fs.stat('.');
      // 簡單的磁盤檢查，實際應用中可能需要更詳細的實現
      return {
        name: 'disk',
        healthy: true,
        details: { status: 'accessible' }
      };
    } catch (error) {
      return {
        name: 'disk',
        healthy: false,
        details: { error: error.message }
      };
    }
  }

  /**
   * 檢查爬蟲健康狀況
   */
  checkCrawlerHealth() {
    const now = Date.now();
    const lastExecution = this.metrics.lastCrawlerExecution;
    const maxInterval = configManager.get('CRAWLER_INTERVAL', 30) * 60 * 1000 * 2; // 允許2倍間隔時間

    const healthy = !lastExecution || (now - lastExecution) < maxInterval;

    return {
      name: 'crawler',
      healthy,
      details: {
        lastExecution: lastExecution ? new Date(lastExecution).toISOString() : 'never',
        errors: this.metrics.crawlerErrors,
        executions: this.metrics.crawlerExecutions
      }
    };
  }

  /**
   * 檢查錯誤率
   */
  checkErrorRate() {
    const totalOperations = this.metrics.commandsExecuted + this.metrics.crawlerExecutions;
    const errorRate = totalOperations > 0 ? (this.metrics.errors / totalOperations) * 100 : 0;

    const healthy = errorRate < 10; // 錯誤率低於10%

    return {
      name: 'errorRate',
      healthy,
      details: {
        errorRate: Math.round(errorRate * 100) / 100 + '%',
        totalErrors: this.metrics.errors,
        totalOperations
      }
    };
  }

  /**
   * 記錄指令執行
   */
  recordCommandExecution() {
    this.metrics.commandsExecuted++;
  }

  /**
   * 記錄爬蟲執行
   */
  recordCrawlerExecution() {
    this.metrics.crawlerExecutions++;
    this.metrics.lastCrawlerExecution = Date.now();
  }

  /**
   * 記錄爬蟲錯誤
   */
  recordCrawlerError() {
    this.metrics.crawlerErrors++;
    this.recordError();
  }

  /**
   * 記錄音樂播放
   */
  recordMusicPlayed() {
    this.metrics.musicPlayed++;
  }

  /**
   * 記錄訊息處理
   */
  recordMessageProcessed() {
    this.metrics.messagesProcessed++;
  }

  /**
   * 記錄錯誤
   */
  recordError(error = null) {
    this.metrics.errors++;
    if (error) {
      this.metrics.lastError = {
        timestamp: Date.now(),
        message: error.message,
        stack: error.stack
      };
    }
  }

  /**
   * 獲取系統狀態
   */
  getStatus() {
    const uptime = Date.now() - this.metrics.startTime;
    const memoryUsage = process.memoryUsage();

    return {
      healthy: this.isHealthy,
      uptime: {
        milliseconds: uptime,
        human: this.formatUptime(uptime)
      },
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
      },
      metrics: {
        commandsExecuted: this.metrics.commandsExecuted,
        crawlerExecutions: this.metrics.crawlerExecutions,
        crawlerErrors: this.metrics.crawlerErrors,
        musicPlayed: this.metrics.musicPlayed,
        messagesProcessed: this.metrics.messagesProcessed,
        totalErrors: this.metrics.errors
      },
      lastCrawlerExecution: this.metrics.lastCrawlerExecution ? 
        new Date(this.metrics.lastCrawlerExecution).toISOString() : null,
      config: configManager.getAll(true)
    };
  }

  /**
   * 格式化運行時間
   */
  formatUptime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}天 ${hours % 24}小時 ${minutes % 60}分鐘`;
    } else if (hours > 0) {
      return `${hours}小時 ${minutes % 60}分鐘`;
    } else if (minutes > 0) {
      return `${minutes}分鐘 ${seconds % 60}秒`;
    } else {
      return `${seconds}秒`;
    }
  }

  /**
   * 導出指標數據
   */
  exportMetrics() {
    return {
      ...this.metrics,
      exportTime: Date.now()
    };
  }
}

// 創建全局健康監控實例
export const healthMonitor = new HealthMonitor();