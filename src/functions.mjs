import fs from 'fs';
import { rootDir } from '#src/path';

// 延遲函數
function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

// 判斷影片是否今天發佈，不是則跳過
function checkTime(time) {
  const now = new Date();
  let timeDiff = '';

  if (isNaN(time)) {
    // if (time.includes('天前') || time.includes('day')) {
    //   return false;
    // }
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

// 讀取檔案
function readFile(file) {
  // 檢查檔案是否存在
  if (!fs.existsSync(file)) {
    return [];
  }

  let data = fs.readFileSync(file, 'utf8');

  if (!data) {
    return [];
  }

  try {
    return JSON.parse(data);
  } catch (error) {
    console.error(error);
    return [];
  }
}

// 寫入檔案
function writeFile(file, data) {
  fs.writeFile(file, data, (err) => {
    if (err) throw err;
  });
}

// 檢查是否已發送過
function checkIsSended(sendedVideosOrStreams, videoId) {
  for (let sendedVideosOrStream of sendedVideosOrStreams) {
    if (sendedVideosOrStream.id == videoId) {
      return true;
    }
  }

  return false;
}

// 發送訊息
async function sendMessage(client, channelId, message) {
  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    addErrorLog('找不到頻道');
    return;
  }
  try {
    await channel.send(message);
    console.log('訊息已發送！-' + new Date().toLocaleString());
  } catch (error) {
    addErrorLog('訊息發送失敗：', error)
  }
}

// 發送影片
async function sendVideo(client, file, channelId) {
  const videos = await readFile(file);

  if (videos.length === 0) {
    console.log("最新影片皆已發送！-" + new Date().toLocaleString());
    return false;
  }

  // 一次發送
  let links = [];
  for (let i = 0; i < videos.length; i++) {
    if (links.includes(videos[i].link)) continue;

    links.push(videos[i].link);

    // 每次發送5個
    if (links.length === 5) {
      await sendMessage(client, channelId, links.join("\n"));

      links = []; // 清空
    }
  }

  // 發送剩餘的
  if (links.length > 0) {
    await sendMessage(client, channelId, links.join("\n"));
  }
}

// 新增錯誤log
function addErrorLog(error) {
  console.error(error);

  // const now = new Date();
  // const log = `${now.toLocaleString()} - ${error}\n`;

  // fs.appendFile('error.log', log, (err) => {
  //   if (err) throw err;
  // });
}

// 移除Youtube頻道
function removeYTChannel(type, YTchannelID) {
  let file = '';
  switch (type) {
    case 'videos':
      file = `${rootDir}/videosChannels.json`;
      break;
    case 'steams':
      file = `${rootDir}/streamsChannels.json`;
      break;
  }

  const channels = readFile(file);
  const newChannels = channels.data.filter((channel) => channel.channelId !== YTchannelID);
  writeFile(file, JSON.stringify({data: newChannels}));
  console.log('已移除頻道：' + YTchannelID);
}

export {
  delay,
  checkTime,
  readFile,
  writeFile,
  checkIsSended,
  sendMessage,
  sendVideo,
  addErrorLog,
  removeYTChannel
};
