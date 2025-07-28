import fs from 'fs';
import { exec, execSync } from 'node:child_process';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  VoiceConnectionStatus,
  AudioPlayerStatus,
} from '@discordjs/voice';
import ytdl from 'ytdl-core';

import { delay } from '#src/functions';
import { CONSTANTS } from '#src/constants';
import { logger } from '#src/logger';
import { validateYouTubeUrl } from '#src/validators';

/**
 * 音樂播放管理器
 * 處理所有音樂播放相關功能，包括隊列管理、語音頻道連接等
 */
class MusicManager {
  constructor() {
    this.player = createAudioPlayer();
    this.voiceConnection = null;
    this.audioStream = null;
    this.currentTrack = null;
    this.queue = [];
    this.isLooping = false;
    this.volume = CONSTANTS.MUSIC.VOLUME_DEFAULT;
    
    this.setupPlayerEvents();
  }

  setupPlayerEvents() {
    this.player.on(AudioPlayerStatus.Idle, () => {
      if (this.isLooping && this.currentTrack) {
        this.playCurrentTrack();
      } else if (this.queue.length > 0) {
        this.playNext();
      }
    });

    this.player.on('error', (error) => {
      logger.error('音樂播放錯誤', { error: error.message });
    });
  }

  /**
   * 加入語音頻道
   * @param {VoiceChannel} voiceChannel - Discord 語音頻道
   */
  joinVoiceChannel(voiceChannel) {
    try {
      if (this.voiceConnection) {
        this.voiceConnection.destroy();
      }

      this.voiceConnection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      this.voiceConnection.on(VoiceConnectionStatus.Disconnected, () => {
        logger.info('機器人已離開語音頻道');
        this.cleanup();
      });

      this.voiceConnection.on(VoiceConnectionStatus.Ready, () => {
        logger.info('機器人已成功連接到語音頻道');
      });

      logger.info(`機器人已加入語音頻道: ${voiceChannel.name}`);
      return true;
    } catch (error) {
      logger.error('加入語音頻道失敗', { error: error.message });
      return false;
    }
  }

  /**
   * 播放 YouTube 影片
   * @param {string} url - YouTube 影片 URL
   * @param {Object} message - Discord 訊息對象
   */
  async play(url, message) {
    try {
      // 驗證 URL
      if (!validateYouTubeUrl(url)) {
        await message.reply(CONSTANTS.ERRORS.INVALID_URL);
        return false;
      }

      // 檢查語音頻道
      const voiceChannel = message.member.voice.channel;
      if (!voiceChannel) {
        await message.reply(CONSTANTS.ERRORS.VOICE_CHANNEL_REQUIRED);
        return false;
      }

      // 加入語音頻道
      if (!this.voiceConnection) {
        const joined = this.joinVoiceChannel(voiceChannel);
        if (!joined) {
          await message.reply(CONSTANTS.ERRORS.PLAYBACK_ERROR);
          return false;
        }
      }

      // 停止當前播放
      if (this.isPlaying() || this.isPaused()) {
        this.stop();
        await delay(1000);
      }

      // 清理舊的音頻流
      this.cleanupAudioStream();

      // 下載音頻
      await this.downloadAudio(url);

      // 獲取影片標題
      const title = await this.getVideoTitle(url);

      // 播放音樂
      this.currentTrack = { url, title };
      await this.playCurrentTrack();

      await message.reply(`${CONSTANTS.SUCCESS.MUSIC_PLAYING}: ${title}`);
      return true;
    } catch (error) {
      logger.error('播放音樂失敗', { url, error: error.message });
      await message.reply(CONSTANTS.ERRORS.PLAYBACK_ERROR);
      return false;
    }
  }

  /**
   * 下載音頻文件
   * @param {string} url - YouTube 影片 URL
   */
  async downloadAudio(url) {
    // 刪除舊文件
    if (fs.existsSync('output.mp4')) {
      await this.waitForFileRelease('output.mp4');
    }

    logger.debug('開始下載音頻文件', { url });
    execSync(`yt-dlp -f "bestaudio[ext=mp4]" -o "output.mp4" "${url}"`);
    logger.debug('音頻文件下載完成');
  }

  /**
   * 獲取影片標題
   * @param {string} url - YouTube 影片 URL
   * @returns {Promise<string>} 影片標題
   */
  async getVideoTitle(url) {
    return new Promise((resolve, reject) => {
      exec(`yt-dlp -j "${url}"`, (error, stdout, stderr) => {
        if (error) {
          logger.error('獲取影片標題失敗', { error: error.message });
          reject(error);
          return;
        }

        try {
          const videoData = JSON.parse(stdout);
          resolve(videoData.title || '未知標題');
        } catch (parseErr) {
          logger.error('解析影片資訊失敗', { error: parseErr.message });
          reject(parseErr);
        }
      });
    });
  }

  /**
   * 播放當前曲目
   */
  async playCurrentTrack() {
    try {
      if (!this.voiceConnection || !this.currentTrack) {
        return false;
      }

      this.cleanupAudioStream();
      this.audioStream = fs.createReadStream('output.mp4');
      
      const resource = createAudioResource(this.audioStream);
      this.player.play(resource);
      this.voiceConnection.subscribe(this.player);

      logger.info('開始播放音樂', { title: this.currentTrack.title });
      return true;
    } catch (error) {
      logger.error('播放音樂失敗', { error: error.message });
      return false;
    }
  }

  /**
   * 暫停播放
   */
  pause() {
    if (this.isPlaying()) {
      this.player.pause();
      logger.info('音樂已暫停');
      return true;
    }
    return false;
  }

  /**
   * 恢復播放
   */
  resume() {
    if (this.isPaused()) {
      this.player.unpause();
      logger.info('音樂已恢復播放');
      return true;
    }
    return false;
  }

  /**
   * 停止播放
   */
  stop() {
    if (this.isPlaying() || this.isPaused()) {
      this.player.stop();
      this.cleanupAudioStream();
      logger.info('音樂已停止');
      return true;
    }
    return false;
  }

  /**
   * 重新播放當前曲目
   */
  async restart() {
    if (this.currentTrack && this.voiceConnection) {
      await this.playCurrentTrack();
      logger.info('音樂已重新播放');
      return true;
    }
    return false;
  }

  /**
   * 切換循環模式
   */
  toggleLoop() {
    this.isLooping = !this.isLooping;
    logger.info(`循環播放已${this.isLooping ? '開啟' : '關閉'}`);
    
    if (this.isLooping && this.currentTrack && !this.isPlaying()) {
      this.playCurrentTrack();
    }
    
    return this.isLooping;
  }

  /**
   * 離開語音頻道
   */
  leave() {
    this.stop();
    if (this.voiceConnection) {
      this.voiceConnection.destroy();
      this.voiceConnection = null;
    }
    this.cleanup();
    logger.info('機器人已離開語音頻道');
  }

  /**
   * 檢查是否正在播放
   */
  isPlaying() {
    return this.player.state.status === AudioPlayerStatus.Playing;
  }

  /**
   * 檢查是否暫停
   */
  isPaused() {
    return this.player.state.status === AudioPlayerStatus.Paused;
  }

  /**
   * 清理音頻流
   */
  cleanupAudioStream() {
    if (this.audioStream) {
      this.audioStream.destroy();
      this.audioStream = null;
    }
  }

  /**
   * 清理所有資源
   */
  cleanup() {
    this.cleanupAudioStream();
    this.currentTrack = null;
    this.queue = [];
    this.isLooping = false;
  }

  /**
   * 等待文件釋放
   * @param {string} filePath - 文件路徑
   */
  async waitForFileRelease(filePath) {
    let fileDeleted = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!fileDeleted && attempts < maxAttempts) {
      try {
        fs.unlinkSync(filePath);
        logger.debug('文件刪除成功', { filePath });
        fileDeleted = true;
      } catch (err) {
        if (err.code === 'EBUSY' || err.code === 'EPERM') {
          logger.debug('文件仍在使用中，重試中...', { filePath, attempt: attempts + 1 });
          await delay(500);
          attempts++;
        } else if (err.code === 'ENOENT') {
          logger.debug('文件不存在，視為已釋放', { filePath });
          fileDeleted = true;
        } else {
          logger.error('刪除文件時發生錯誤', { filePath, error: err.message });
          break;
        }
      }
    }

    if (!fileDeleted) {
      logger.warn('無法刪除文件，可能導致磁盤空間問題', { filePath });
    }
  }
}

export { MusicManager };