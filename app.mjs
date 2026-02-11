import fs from "node:fs";
import path from "node:path";
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";

import { sendMessage, addErrorLog } from "#src/functions";
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

// 機器人準備就緒
client.on(Events.ClientReady, async (interaction) => {
  // 計算距離下一個整點或半點的時間
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const milliseconds = now.getMilliseconds();
  const timeToNextHalfHour =
    (30 - (minutes % 30)) * 60 * 1000 - seconds * 1000 - milliseconds;
  const timeToNextHour =
    (60 - minutes) * 60 * 1000 - seconds * 1000 - milliseconds;

  let intervalTime =
    timeToNextHalfHour > timeToNextHour ? timeToNextHour : timeToNextHalfHour;
  async function startTimer() {
    console.log("啟動時間：" + new Date().toLocaleString());
    console.log(
      "距離下一次執行時間：" +
        Math.round((intervalTime / 1000 / 60) * 10) / 10 +
        "分鐘",
    );

    setTimeout(async () => {
      // 開始執行時間
      console.log("開始抓取時間：" + new Date().toLocaleString());

      let timeInterval = 30 * 60 * 1000; // 時間間隔(預設30分鐘)
      let executeHour = new Date().getHours();
      let executeMinute = new Date().getMinutes();

      // 午夜12點則不執行
      if (executeHour !== 0 || executeMinute !== 0) {
        try {
          // 執行爬蟲（crawler 內部已處理發送與儲存）
          await crawler(client);
        } catch (error) {
          addErrorLog(error);
          sendMessage(client, config.VIDEO_CHANNEL_ID, "影片抓取失敗！");
          sendMessage(client, config.STREAM_CHANNEL_ID, "直播抓取失敗！");
        }
        console.log("結束抓取時間：" + new Date().toLocaleString());
      }

      // 假設現在為午夜11:30，下一次間隔改為20分鐘
      if (executeHour === 23 && executeMinute === 30) {
        timeInterval = 20 * 60 * 1000;
      }

      // 假設現在為午夜11:50，下一次間隔改為40分鐘
      if (executeHour === 23 && executeMinute === 50) {
        timeInterval = 40 * 60 * 1000;
      }

      // 判斷當下時間偏差
      let curMinutes = new Date().getMinutes();
      let curSeconds = new Date().getSeconds();
      let curMilliseconds = new Date().getMilliseconds();
      let diff =
        (curMinutes - executeMinute) * 60 * 1000 +
        (curSeconds - 0) * 1000 +
        (curMilliseconds - 0);

      // 重新計算時間(間隔 - 偏差)
      intervalTime = timeInterval - diff;

      // 重新啟動定時器
      await startTimer();
    }, intervalTime);
  }

  await startTimer();
});

// 當機器人準備就緒時執行此代碼（僅執行一次）
client.once(Events.ClientReady, (c) => {
  console.log(`準備完成！已登入為 ${c.user.tag}`);
});

// 使用 Discord 客戶端 token 登入
client.login(config.TOKEN);
