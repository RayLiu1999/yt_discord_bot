import fs from 'fs';
import { rootDir } from '#src/path';
import { CONSTANTS } from '#src/constants';
import { logger } from '#src/logger';
import { validateChannelId, sanitizeInput } from '#src/validators';
import { readFileSync, writeFileSync, sendMessage, delay } from '#src/functions';
import { MusicManager } from '#src/musicManager';
import crawler from '#src/crawler';

/**
 * Discord 指令處理器
 * 統一管理所有自定義指令的處理邏輯
 */
class CommandHandler {
  constructor(client) {
    this.client = client;
    this.musicManager = new MusicManager();
    this.PREFIX = CONSTANTS.PREFIX;
  }

  /**
   * 處理訊息指令
   * @param {Message} message - Discord 訊息對象
   */
  async handleMessage(message) {
    if (!message.content.startsWith(this.PREFIX) || message.author.bot) {
      return;
    }

    const args = message.content.slice(this.PREFIX.length).trim().split(' ');
    const command = args[0].toLowerCase();

    try {
      switch (command) {
        case 'clr':
          await this.handleCrawler(message);
          break;
        case 'vd':
          await this.handleVideos(message, args);
          break;
        case 'st':
          await this.handleStreams(message, args);
          break;
        case 'join':
          await this.handleJoinVoice(message);
          break;
        case 'play':
          await this.handlePlay(message, args);
          break;
        case 'pause':
          await this.handlePause(message);
          break;
        case 'resume':
          await this.handleResume(message);
          break;
        case 'stop':
          await this.handleStop(message);
          break;
        case 'restart':
          await this.handleRestart(message);
          break;
        case 'loop':
          await this.handleLoop(message);
          break;
        case 'leave':
          await this.handleLeave(message);
          break;
        default:
          // 未知指令，忽略
          break;
      }
    } catch (error) {
      logger.error('處理指令時發生錯誤', { 
        command, 
        error: error.message,
        userId: message.author.id 
      });
      await message.reply('處理指令時發生錯誤，請稍後再試。');
    }
  }

  /**
   * 處理爬蟲指令
   */
  async handleCrawler(message) {
    try {
      await message.reply('開始爬取影片和直播資料...');
      await crawler(this.client);
      await message.reply('爬取完成！');
    } catch (error) {
      logger.error('手動爬蟲失敗', { error: error.message });
      await message.reply(CONSTANTS.ERRORS.CRAWLER_FAILED);
    }
  }

  /**
   * 處理影片相關指令
   */
  async handleVideos(message, args) {
    const subCommand = args[1];
    
    switch (subCommand) {
      case 'ls':
        await this.listChannels(message, 'videos');
        break;
      case 'add':
        await this.addChannel(message, args[2], 'videos');
        break;
      case 'del':
        await this.deleteChannel(message, args[2], 'videos');
        break;
      default:
        await this.sendVideoLinks(message);
        break;
    }
  }

  /**
   * 處理直播相關指令
   */
  async handleStreams(message, args) {
    const subCommand = args[1];
    
    switch (subCommand) {
      case 'ls':
        await this.listChannels(message, 'streams');
        break;
      case 'add':
        await this.addChannel(message, args[2], 'streams');
        break;
      case 'del':
        await this.deleteChannel(message, args[2], 'streams');
        break;
      default:
        await this.sendStreamLinks(message);
        break;
    }
  }

  /**
   * 列出頻道清單
   */
  async listChannels(message, type) {
    try {
      const fileName = type === 'videos' ? CONSTANTS.FILES.VIDEOS_CHANNELS : CONSTANTS.FILES.STREAMS_CHANNELS;
      const channels = readFileSync(`${rootDir}/${fileName}`).data || [];
      
      if (channels.length === 0) {
        const emptyMessage = type === 'videos' ? 
          CONSTANTS.INFO.EMPTY_VIDEOS_CHANNELS : 
          CONSTANTS.INFO.EMPTY_STREAMS_CHANNELS;
        await message.reply(emptyMessage);
        return;
      }

      let sendStr = `${type === 'videos' ? '影片' : '直播'}頻道清單：\n`;
      channels.forEach(item => {
        const lastUpdated = item.last_updated || '無';
        sendStr += `${item.channelId} - ${lastUpdated}\n`;
      });

      await message.reply(sendStr);
    } catch (error) {
      logger.error(`列出${type}頻道失敗`, { error: error.message });
      await message.reply('獲取頻道清單失敗');
    }
  }

  /**
   * 添加頻道
   */
  async addChannel(message, channelId, type) {
    if (!channelId) {
      await message.reply(CONSTANTS.ERRORS.INVALID_CHANNEL_ID);
      return;
    }

    const sanitizedChannelId = sanitizeInput(channelId);
    if (!validateChannelId(sanitizedChannelId)) {
      await message.reply(CONSTANTS.ERRORS.INVALID_CHANNEL_ID);
      return;
    }

    try {
      const fileName = type === 'videos' ? CONSTANTS.FILES.VIDEOS_CHANNELS : CONSTANTS.FILES.STREAMS_CHANNELS;
      const filePath = `${rootDir}/${fileName}`;
      const channels = readFileSync(filePath).data || [];

      // 檢查是否已存在
      if (channels.some(item => item.channelId === sanitizedChannelId)) {
        await message.reply(CONSTANTS.ERRORS.CHANNEL_EXISTS);
        return;
      }

      channels.push({
        channelId: sanitizedChannelId,
        last_updated: "",
      });

      writeFileSync(filePath, JSON.stringify({ data: channels }));
      await message.reply(CONSTANTS.SUCCESS.CHANNEL_ADDED);
      
      logger.info(`新增${type}頻道`, { channelId: sanitizedChannelId });
    } catch (error) {
      logger.error(`新增${type}頻道失敗`, { channelId, error: error.message });
      await message.reply('新增頻道失敗');
    }
  }

  /**
   * 刪除頻道
   */
  async deleteChannel(message, channelId, type) {
    if (!channelId) {
      await message.reply(CONSTANTS.ERRORS.INVALID_CHANNEL_ID);
      return;
    }

    const sanitizedChannelId = sanitizeInput(channelId);

    try {
      const fileName = type === 'videos' ? CONSTANTS.FILES.VIDEOS_CHANNELS : CONSTANTS.FILES.STREAMS_CHANNELS;
      const filePath = `${rootDir}/${fileName}`;
      const channels = readFileSync(filePath).data || [];

      const filteredChannels = channels.filter(item => item.channelId !== sanitizedChannelId);
      
      if (filteredChannels.length === channels.length) {
        await message.reply('找不到指定的頻道');
        return;
      }

      writeFileSync(filePath, JSON.stringify({ data: filteredChannels }));
      await message.reply(CONSTANTS.SUCCESS.CHANNEL_DELETED);
      
      logger.info(`刪除${type}頻道`, { channelId: sanitizedChannelId });
    } catch (error) {
      logger.error(`刪除${type}頻道失敗`, { channelId, error: error.message });
      await message.reply('刪除頻道失敗');
    }
  }

  /**
   * 發送影片連結
   */
  async sendVideoLinks(message) {
    try {
      const videos = readFileSync(`${rootDir}/${CONSTANTS.FILES.VIDEOS}`);
      await this.sendLinks(message, videos, '影片');
    } catch (error) {
      logger.error('發送影片連結失敗', { error: error.message });
      await message.reply('獲取影片清單失敗');
    }
  }

  /**
   * 發送直播連結
   */
  async sendStreamLinks(message) {
    try {
      const streams = readFileSync(`${rootDir}/${CONSTANTS.FILES.STREAMS}`);
      await this.sendLinks(message, streams, '直播');
    } catch (error) {
      logger.error('發送直播連結失敗', { error: error.message });
      await message.reply('獲取直播清單失敗');
    }
  }

  /**
   * 批次發送連結
   */
  async sendLinks(message, items, type) {
    if (!items || items.length === 0) {
      await message.reply(`最新${type}皆已發送！`);
      return;
    }

    // 去重
    const uniqueLinks = [...new Set(items.map(item => item.link))];
    
    // 分批發送
    for (let i = 0; i < uniqueLinks.length; i += CONSTANTS.DISCORD.LINKS_PER_MESSAGE) {
      const batch = uniqueLinks.slice(i, i + CONSTANTS.DISCORD.LINKS_PER_MESSAGE);
      await message.channel.send(batch.join('\n'));
      
      // 避免速率限制
      if (i + CONSTANTS.DISCORD.LINKS_PER_MESSAGE < uniqueLinks.length) {
        await new Promise(resolve => setTimeout(resolve, CONSTANTS.DISCORD.MESSAGE_DELAY));
      }
    }
  }

  // 音樂指令處理方法

  async handleJoinVoice(message) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      await message.reply(CONSTANTS.ERRORS.VOICE_CHANNEL_REQUIRED);
      return;
    }

    const success = this.musicManager.joinVoiceChannel(voiceChannel);
    if (success) {
      await message.reply(`已加入語音頻道：${voiceChannel.name}`);
    } else {
      await message.reply('加入語音頻道失敗');
    }
  }

  async handlePlay(message, args) {
    if (args.length < 2) {
      await message.reply(CONSTANTS.ERRORS.NO_URL_PROVIDED);
      return;
    }

    const url = args[1];
    await this.musicManager.play(url, message);
  }

  async handlePause(message) {
    if (this.musicManager.pause()) {
      await message.reply(CONSTANTS.SUCCESS.MUSIC_PAUSED);
    } else {
      await message.reply(CONSTANTS.INFO.NO_PLAYING_MUSIC);
    }
  }

  async handleResume(message) {
    if (this.musicManager.resume()) {
      await message.reply(CONSTANTS.SUCCESS.MUSIC_RESUMED);
    } else {
      await message.reply(CONSTANTS.INFO.NO_PAUSED_MUSIC);
    }
  }

  async handleStop(message) {
    if (this.musicManager.stop()) {
      await message.reply('音樂已停止');
    } else {
      await message.reply(CONSTANTS.INFO.NO_PLAYING_MUSIC);
    }
  }

  async handleRestart(message) {
    if (await this.musicManager.restart()) {
      await message.reply(CONSTANTS.SUCCESS.MUSIC_RESTARTED);
    } else {
      await message.reply('無法重新播放，請先播放一首歌曲');
    }
  }

  async handleLoop(message) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel && !this.musicManager.voiceConnection) {
      await message.reply(CONSTANTS.INFO.BOT_JOIN_VOICE_FIRST);
      return;
    }

    const isLooping = this.musicManager.toggleLoop();
    await message.reply(isLooping ? CONSTANTS.SUCCESS.MUSIC_LOOPING : '循環播放已關閉');
  }

  async handleLeave(message) {
    this.musicManager.leave();
    await message.reply('已離開語音頻道');
  }
}

export { CommandHandler };