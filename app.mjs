import fs from "node:fs";
import path from "node:path";
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";

import {
  sendMessage,
  addErrorLog,
  getAppState,
  getPendingLiveSchedules,
  markLiveScheduleNotified,
  sendLiveNotification,
} from "#src/functions";
import crawler from "#src/crawler";
import config from "#src/config";
import { connectDB } from "#src/db";

// 連線 MongoDB
await connectDB();

// 建立 Discord 客戶端實例
const client = new Client({
  intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.Guilds],
});

client.commands = new Collection();
const foldersPath = path.join(".", "commands");

for (const entry of fs.readdirSync(foldersPath, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    // 子資料夾內的指令
    const commandsPath = path.join(foldersPath, entry.name);
    const files = fs
      .readdirSync(commandsPath)
      .filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));

    // 如果資料夾中有 index 文件，則僅載入 index (避免把子指令當成頂層指令載入)
    const indexFile = files.find((f) => f === "index.mjs" || f === "index.js");
    if (indexFile) {
      await loadCommand(path.join(commandsPath, indexFile));
    } else {
      for (const file of files) {
        const filePath = path.join(commandsPath, file);
        await loadCommand(filePath);
      }
    }
  } else if (
    entry.isFile() &&
    (entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))
  ) {
    // 直接位於 commands 目錄下的指令檔
    const filePath = path.join(foldersPath, entry.name);
    await loadCommand(filePath);
  }
}

async function loadCommand(filePath) {
  try {
    const mod = await import(path.resolve(filePath));
    const command = mod.default ?? mod;
    if (command && command.data && command.execute) {
      client.commands.set(command.data.name, command);
    } else {
      addErrorLog(
        `[警告] ${filePath} 指令缺少必要的 'data' 或 'execute' 屬性。`,
      );
    }
  } catch (err) {
    addErrorLog(`[錯誤] 載入指令 ${filePath} 失敗：${err.message}`);
  }
}

// 指令頻道限制映射：指令名稱 → 允許的 Discord 頻道 ID 列表
const commandChannelMap = {
  crawl: [config.VIDEO_CHANNEL_ID, config.STREAM_CHANNEL_ID],
  video: [config.VIDEO_CHANNEL_ID],
  stream: [config.STREAM_CHANNEL_ID],
  notify_live: [config.STREAM_CHANNEL_ID],
};

// 斜線指令處理
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    addErrorLog(`找不到符合的指令：${interaction.commandName}`);
    return;
  }

  // 頻道限制檢查
  const allowedChannels = commandChannelMap[interaction.commandName];
  if (allowedChannels && !allowedChannels.includes(interaction.channelId)) {
    await interaction.reply({
      content: "此指令無法在這個頻道使用！",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    addErrorLog(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "執行指令時發生錯誤！",
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: "執行指令時發生錯誤！",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

// 計算距離下一個 :00 或 :30 的毫秒數
function getDelayToNextHalfHour() {
  const now = new Date();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ms = now.getMilliseconds();
  const minutesToNext = 30 - (m % 30);
  return minutesToNext * 60 * 1000 - s * 1000 - ms;
}

// 最小執行間隔（15 分鐘），防止連續觸發導致重複發送
const MIN_CRAWL_INTERVAL = 15 * 60 * 1000;

// 機器人準備就緒後啟動排程
client.on(Events.ClientReady, async () => {
  scheduleNextCrawl();
  startLiveScheduleChecker();
});

function scheduleNextCrawl() {
  const delay = getDelayToNextHalfHour();
  console.log(`排程時間：${new Date().toLocaleString()}`);
  console.log(
    `距離下一次執行時間：${Math.round((delay / 1000 / 60) * 10) / 10} 分鐘`,
  );

  setTimeout(async () => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    console.log(`開始抓取時間：${now.toLocaleString()}`);

    // 午夜 00:00 不執行
    if (hour === 0 && minute === 0) {
      console.log("午夜時段，跳過本次抓取");
      scheduleNextCrawl();
      return;
    }

    // 檢查距離上次爬蟲是否不足 15 分鐘（防止重複觸發）
    const lastCrawlTime = await getAppState("lastCrawlTime");
    if (
      lastCrawlTime &&
      Date.now() - parseInt(lastCrawlTime) < MIN_CRAWL_INTERVAL
    ) {
      console.log("距離上次爬蟲不足 15 分鐘，跳過本次執行");
      scheduleNextCrawl();
      return;
    }

    try {
      await crawler(client);
    } catch (error) {
      addErrorLog(error);
    }

    console.log(`結束抓取時間：${new Date().toLocaleString()}`);

    // 排程下一次執行（從當前時間重新計算，無偏差累積）
    scheduleNextCrawl();
  }, delay);
}

// 當機器人準備就緒時執行此代碼（僅執行一次）
client.once(Events.ClientReady, (c) => {
  console.log(`準備完成！已登入為 ${c.user.tag}`);
});

// ===== 直播排程通知檢查器 =====

// 每分鐘檢查一次是否有到時間的直播排程
const LIVE_CHECK_INTERVAL = 60 * 1000; // 1 分鐘

function startLiveScheduleChecker() {
  console.log("[直播排程] 通知檢查器已啟動（每分鐘檢查一次）");

  setInterval(async () => {
    try {
      const pendingSchedules = await getPendingLiveSchedules();

      if (pendingSchedules.length === 0) return;

      console.log(`[直播排程] 發現 ${pendingSchedules.length} 筆待通知的直播`);

      for (const schedule of pendingSchedules) {
        try {
          await sendLiveNotification(client, schedule);
          await markLiveScheduleNotified(schedule.videoId);
          console.log(
            `[直播排程] 已通知：${schedule.title} (${schedule.videoId})`,
          );
        } catch (notifyErr) {
          addErrorLog(`[直播排程] 通知失敗：${notifyErr.message}`);
        }
      }
    } catch (error) {
      addErrorLog(`[直播排程] 檢查排程時發生錯誤：${error.message}`);
    }
  }, LIVE_CHECK_INTERVAL);
}

// 使用 Discord 客戶端 token 登入
client.login(config.TOKEN);
