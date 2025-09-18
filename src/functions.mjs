import fs from 'fs/promises';
import fsSync from 'fs';
import { rootDir } from '#src/path';
import { CONSTANTS } from '#src/constants';
import { logger, addErrorLog } from '#src/logger';

// 延遲函數
function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

// 判斷影片是否今天發佈，不是則跳過
function checkTime(time) {
  const now = new Date();
  let timeDiff = '';

  if (isNaN(time)) {
    if (time.includes('小時前') || time.includes('hour')) {
      time = time.replace(/[^0-9]/g, '');
      timeDiff = parseInt(time);
    } else if (time.includes('分鐘前') || time.includes('minute')) {
      time = time.replace(/[^0-9]/g, '');
      timeDiff = parseInt(time) / 60;
    } else if (time.includes('秒前') || time.includes('second')) {
      time = time.replace(/[^0-9]/g, '');
      timeDiff = parseInt(time) / 3600;
    } else {
      return false;
    }
  } else {
    const date = new Date(parseInt(time) * 1000);
    if (date.getDate() !== now.getDate()) {
      return false;
    }
  }

  if (timeDiff != '') {
    const publishTime = new Date(now.getTime() - timeDiff * 60 * 60 * 1000);
    if (publishTime.getDate() !== now.getDate()) {
      return false;
    }
  }

  return true;
}

// 讀取檔案（異步版本）
async function readFile(file) {
  try {
    // 檢查檔案是否存在
    if (!fsSync.existsSync(file)) {
      await logger.warn(`檔案不存在: ${file}`);
      return [];
    }

    const data = await fs.readFile(file, 'utf8');
    
    if (!data) {
      return [];
    }

    return JSON.parse(data);
  } catch (error) {
    await logger.error(`讀取檔案失敗: ${file}`, { error: error.message });
    return [];
  }
}

// 讀取檔案（同步版本，向後兼容）
function readFileSync(file) {
  try {
    // 檢查檔案是否存在
    if (!fsSync.existsSync(file)) {
      return [];
    }

    const data = fsSync.readFileSync(file, 'utf8');

    if (!data) {
      return [];
    }

    return JSON.parse(data);
  } catch (error) {
    addErrorLog(error, { file });
    return [];
  }
}

// 寫入檔案（異步版本）
async function writeFile(file, data) {
  try {
    await fs.writeFile(file, data);
    await logger.debug(`檔案寫入成功: ${file}`);
  } catch (error) {
    await logger.error(`檔案寫入失敗: ${file}`, { error: error.message });
    throw error;
  }
}

// 寫入檔案（同步版本，向後兼容）
function writeFileSync(file, data) {
  try {
    fsSync.writeFileSync(file, data);
  } catch (error) {
    addErrorLog(error, { file });
    throw error;
  }
}

// 檢查是否已發送過
function checkIsSended(sendedVideosOrStreams, videoId) {
  return sendedVideosOrStreams.some(item => item.id === videoId);
}

// 發送訊息
async function sendMessage(client, channelId, message) {
  try {
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      await logger.error(CONSTANTS.ERRORS.CHANNEL_NOT_FOUND, { channelId });
      return false;
    }
    
    await channel.send(message);
    await logger.info(`訊息已發送到頻道 ${channelId}: ${message}`);
    return true;
  } catch (error) {
    await logger.error(`訊息發送失敗`, { 
      channelId, 
      message, 
      error: error.message 
    });
    return false;
  }
}

// 發送影片（改進版本）
async function sendVideo(client, file, channelId) {
  try {
    const videos = await readFile(file);

    if (videos.length === 0) {
      await logger.info("最新影片皆已發送！");
      return false;
    }

    // 去重和批次發送
    const uniqueLinks = [...new Set(videos.map(video => video.link))];
    const batches = [];
    
    for (let i = 0; i < uniqueLinks.length; i += CONSTANTS.DISCORD.LINKS_PER_MESSAGE) {
      batches.push(uniqueLinks.slice(i, i + CONSTANTS.DISCORD.LINKS_PER_MESSAGE));
    }

    for (const batch of batches) {
      const success = await sendMessage(client, channelId, batch.join("\n"));
      if (!success) {
        break; // 如果發送失敗，停止發送剩餘批次
      }
      
      // 添加延遲避免觸發速率限制
      if (batches.indexOf(batch) < batches.length - 1) {
        await delay(CONSTANTS.DISCORD.MESSAGE_DELAY);
      }
    }
    
    return true;
  } catch (error) {
    await logger.error(`發送影片失敗`, { file, channelId, error: error.message });
    return false;
  }
}

// 移除Youtube頻道
async function removeYTChannel(type, YTchannelID) {
  try {
    let file = '';
    switch (type) {
      case 'videos':
        file = `${rootDir}/${CONSTANTS.FILES.VIDEOS_CHANNELS}`;
        break;
      case 'streams':
        file = `${rootDir}/${CONSTANTS.FILES.STREAMS_CHANNELS}`;
        break;
      default:
        await logger.error(`無效的頻道類型: ${type}`);
        return false;
    }

    const channels = await readFile(file);
    const newChannels = channels.data?.filter(channel => channel.channelId !== YTchannelID) || [];
    
    await writeFile(file, JSON.stringify({ data: newChannels }));
    await logger.info(`已移除頻道: ${YTchannelID}`, { type });
    
    return true;
  } catch (error) {
    await logger.error(`移除頻道失敗`, { type, YTchannelID, error: error.message });
    return false;
  }
}

export {
  delay,
  checkTime,
  readFileSync as readFile, // 主要導出，向後兼容
  readFileSync,
  writeFile,
  writeFileSync,
  checkIsSended,
  sendMessage,
  sendVideo,
  removeYTChannel
};
