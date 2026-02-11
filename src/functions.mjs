import { Channel, SentItem, AppState } from "#src/db";

// 延遲函數
function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

// 判斷影片是否今天發佈，不是則跳過
function checkTime(time) {
  const now = new Date();
  let timeDiff = "";

  if (isNaN(time)) {
    if (time.includes("小時前") || time.includes("hour")) {
      time = time.replace(/[^0-9]/g, "");
      timeDiff = parseInt(time);
    } else if (time.includes("分鐘前") || time.includes("minute")) {
      time = time.replace(/[^0-9]/g, "");
      timeDiff = parseInt(time) / 60;
    } else if (time.includes("秒前") || time.includes("second")) {
      time = time.replace(/[^0-9]/g, "");
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

  if (timeDiff != "") {
    const publishTime = new Date(now.getTime() - timeDiff * 60 * 60 * 1000);
    if (publishTime.getDate() !== now.getDate()) {
      return false;
    }
  }

  return true;
}

// 檢查是否已發送過
function checkIsSended(sendedItems, videoId) {
  for (let item of sendedItems) {
    if (item.videoId == videoId) {
      return true;
    }
  }
  return false;
}

// 發送訊息
async function sendMessage(client, channelId, message) {
  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    addErrorLog("找不到頻道");
    return;
  }
  try {
    await channel.send(message);
    console.log("訊息已發送！-" + new Date().toLocaleString());
  } catch (error) {
    addErrorLog("訊息發送失敗：", error);
  }
}

// 發送影片（接收陣列參數，不再讀檔）
async function sendVideo(client, videos, channelId) {
  if (!videos || videos.length === 0) {
    console.log("最新影片皆已發送！-" + new Date().toLocaleString());
    return false;
  }

  let links = [];
  for (let i = 0; i < videos.length; i++) {
    if (links.includes(videos[i].link)) continue;

    links.push(videos[i].link);

    // 每次發送5個
    if (links.length === 5) {
      await sendMessage(client, channelId, links.join("\n"));
      links = [];
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
}

// ===== 資料庫操作函數 =====

// 取得頻道清單
async function getChannels(type) {
  return Channel.find({ type }).lean();
}

// 新增頻道
async function addChannel(channelId, type) {
  return Channel.create({ channelId, type });
}

// 移除頻道
async function removeChannel(channelId, type) {
  return Channel.deleteOne({ channelId, type });
}

// 更新頻道最後更新日期
async function updateChannelDate(channelId, type, date) {
  return Channel.updateOne(
    { channelId, type },
    { $set: { last_updated: date } },
  );
}

// 取得已發送項目
async function getSentItems(type) {
  // 只取今天的已發送項目
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return SentItem.find({ type, sentAt: { $gte: todayStart } }).lean();
}

// 批次新增已發送項目
async function addSentItems(items, type) {
  if (!items || items.length === 0) return;
  const docs = items.map((item) => ({
    videoId: item.id,
    type,
    title: item.title,
    link: item.link,
    thumbnail: item.pic,
    publishedTime: item.time,
    duration: item.duration,
    viewCount: item.views,
    channelId: item.channelId,
  }));
  return SentItem.insertMany(docs);
}

// 取得應用程式狀態
async function getAppState(key) {
  const doc = await AppState.findOne({ key }).lean();
  return doc ? doc.value : null;
}

// 設定應用程式狀態
async function setAppState(key, value) {
  return AppState.findOneAndUpdate(
    { key },
    { $set: { value, updatedAt: new Date() } },
    { upsert: true },
  );
}

export {
  delay,
  checkTime,
  checkIsSended,
  sendMessage,
  sendVideo,
  addErrorLog,
  getChannels,
  addChannel,
  removeChannel,
  updateChannelDate,
  getSentItems,
  addSentItems,
  getAppState,
  setAppState,
};
