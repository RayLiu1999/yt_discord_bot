import fs from "fs";

// 延遲函數
function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

// 判斷影片是否今天發佈，不是則跳過
function checkTime(time) {
  const now = new Date();
  let timeDiff = "";

  if (isNaN(time)) {
    // if (time.includes('天前') || time.includes('day')) {
    //   return false;
    // }
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

// 讀取檔案
async function readFile(file) {
  if (!fs.existsSync(file)) {
    // 建立檔案
    writeFile(file, "[]");
    return [];
  }

  let data = fs.readFileSync(file, "utf8");

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
function checkIsSended(sendedVideos, videoId) {
  for (let sendedVideo of sendedVideos) {
    if (sendedVideo.id == videoId) {
      return true;
    }
  }

  return false;
}

// 發送訊息
async function sendMessage(client, channelId, message = "") {
  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    addErrorLog("找不到頻道");
    return;
  }
  try {
    await channel.send(msg);
    console.log("訊息已發送！-" + new Date().toLocaleString());
  } catch (error) {
    addErrorLog("訊息發送失敗：", error)
  }

  // 發送檔案資料
  if (file != "") {
  }

  // 發送訊息
  if (message != "") {
    client.channels.cache.get(channelId).send(message);
  }
}

// 新增錯誤log
function addErrorLog(error) {
  console.error(error);

  const now = new Date();
  const log = `${now.toLocaleString()} - ${error}\n`;

  fs.appendFile("error.log", log, (err) => {
    if (err) throw err;
  });
}

export {
  delay,
  checkTime,
  readFile,
  writeFile,
  checkIsSended,
  sendMessage,
  addErrorLog,
};
