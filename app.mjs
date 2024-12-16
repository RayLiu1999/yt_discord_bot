import fs from 'node:fs';
import path from 'node:path';
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';

import {
  delay,
  readFile,
  sendMessage,
  addErrorLog,
} from "#src/functions";
import crawler from '#src/crawler';
import config from '#src/config';
import { rootDir } from "#src/path";

// 建立 Discord 客戶端實例
const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();
const foldersPath = path.join('.', 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = await import(filePath);
    // 將指令名稱設為鍵值，導出的模組設為值，存入 Collection 中
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    } else {
      addErrorLog(
        `[警告] ${filePath} 指令缺少必要的 'data' 或 'execute' 屬性。`
      );
    }
  }
}

// 內建指令
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    addErrorLog(`找不到符合的指令：${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    addErrorLog(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: '執行指令時發生錯誤！',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '執行指令時發生錯誤！',
        ephemeral: true,
      });
    }
  }
});

// 自訂指令
client.on(Events.MessageCreate, async (message) => {
  const prefix = '!';
  // 讀取頻道列表和影片資料
  const videosChannels = readFile(`${rootDir}/videosChannels.json`).data || [];
  const streamsChannels = readFile(`${rootDir}/streamsChannels.json`).data || [];
  const videos = readFile(`${rootDir}/videos.json`) || [];
  const streams = readFile(`${rootDir}/streams.json`) || [];

  // 取影片連結
  switch (message.content) {
    // 爬影片
    case prefix + 'clr':
      try {
        await crawler(client);
      } catch (error) {
        console.log(error);
        await message.reply('影片抓取失敗！');
      }
      break;

    // 取影片
    case prefix + 'vd': {
      if (videos.length === 0) {
        message.channel.send('最新影片皆已發送！');
        return false;
      }

      // 每次發送5個
      let links = [];
      for (let i = 0; i < videos.length; i++) {
        if (links.includes(videos[i].link)) continue;

        links.push(videos[i].link);

        if (links.length === 5) {
          message.channel.send(links.join('\n'));
          links = []; // 清空
        }
      }

      // 發送剩餘的
      if (links.length > 0) {
        message.channel.send(links.join('\n'));
      }
      break;
    }

    // 取直播
    case prefix + 'st': {
      if (streams.length === 0) {
        message.channel.send('最新影片皆已發送！');
        return false;
      }

      // 每次發送5個
      let links = [];
      for (let i = 0; i < streams.length; i++) {
        if (links.includes(streams[i].link)) continue;

        links.push(streams[i].link);

        if (links.length === 5) {
          message.channel.send(links.join('\n'));
          links = []; // 清空
        }
      }

      // 發送剩餘的
      if (links.length > 0) {
        message.channel.send(links.join('\n'));
      }
      break;
    }

    // 取影片channelId清單
    case prefix + 'vd ls': {
      let sendStr = '';
      videosChannels.forEach(function (item) {
        if (item.last_updated == '') {
          item.last_updated = '無';
        }

        sendStr += `${item.channelId} - ${item.last_updated}\n`;
      });

      message.channel.send(sendStr);
      break;
    }

    // 取直播channelId清單
    case prefix + 'st ls': {
      let sendStr = '';
      streamsChannels.forEach(function (item) {
        if (item.last_updated == '') {
          item.last_updated = '無';
        }

        sendStr += `${item.channelId} - ${item.last_updated}\n`;
      });

      message.channel.send(sendStr);
      break;
    }
  }

  // 影片新增清單
  if (message.content.startsWith(prefix + 'vd add')) {
    let channelID = message.content.split(' ')[2];
    if (channelID === undefined || channelID === null || channelID === '') {
      message.channel.send('請輸入頻道ID！');
      return;
    }
    
    // 檢查是否已存在
    if (videosChannels.some((item) => item.channelId === channelID)) {
      message.channel.send('此頻道已存在！');
      return;
    }

    videosChannels.push({
      channelId: channelID,
      last_updated: '',
    });

    fs.writeFile('videosChannels.json', JSON.stringify({data: videosChannels}), (err) => {
      if (err) throw err;
      message.channel.send('新增成功！');
    });
  }

  // 直播新增清單
  if (message.content.startsWith(prefix + 'st add')) {
    let channelID = message.content.split(' ')[2];
    if (channelID === undefined || channelID === null || channelID === '') {
      message.channel.send('請輸入頻道ID！');
      return;
    }

    // 檢查是否已存在
    if (streamsChannels.some((item) => item.channelId === channelID)) {
      message.channel.send('此頻道已存在！');
      return;
    }

    streamsChannels.push({
      channelId: channelID,
      last_updated: '',
    });

    fs.writeFile('streamsChannels.json', JSON.stringify({data: streamsChannels}), (err) => {
      if (err) throw err;
      message.channel.send('新增成功！');
    });
  }

  // 影片刪除清單
  if (message.content.startsWith(prefix + 'vd del')) {
    let channelID = message.content.split(' ')[2];
    if (channelID === undefined || channelID === null || channelID === '') {
      message.channel.send('請輸入頻道ID！');
      return;
    }

    videosChannels = videosChannels.filter((item) => item.channelId !== channelID);

    fs.writeFile('videosChannels.json', JSON.stringify({data: videosChannels}), (err) => {
      if (err) throw err;
      message.channel.send('刪除成功！');
    });
  }

  // 直播刪除清單
  if (message.content.startsWith(prefix + 'vd del')) {
    let channelID = message.content.split(' ')[2];
    if (channelID === undefined || channelID === null || channelID === '') {
      message.channel.send('請輸入頻道ID！');
      return;
    }

    streamsChannels = streamsChannels.filter((item) => item.channelId !== channelID);

    fs.writeFile('streamsChannels.json', JSON.stringify({data: streamsChannels}), (err) => {
      if (err) throw err;
      message.channel.send('刪除成功！');
    });
  }
});

// 自動發送
client.on(Events.ClientReady, async (interaction) => {
  // 計算距離下一個整點或半點的時間
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const milliseconds = now.getMilliseconds();
  const timeToNextHalfHour = (30 - minutes % 30) * 60 * 1000 - seconds * 1000 - milliseconds;
  const timeToNextHour = (60 - minutes) * 60 * 1000 - seconds * 1000 - milliseconds;

  let intervalTime = timeToNextHalfHour > timeToNextHour ? timeToNextHour : timeToNextHalfHour
  async function startTimer() {
    console.log('啟動時間：' + new Date().toLocaleString());
    console.log('距離下一次執行時間：' + Math.round(intervalTime / 1000 / 60 * 10) / 10 + '分鐘');

    setTimeout(async () => {
      // 開始執行時間
      console.log('開始抓取時間：' + new Date().toLocaleString());

      let timeInterval = 30 * 60 * 1000; // 時間間隔(預設30分鐘)
      let executeHour = new Date().getHours();
      let executeMinute = new Date().getMinutes();

      // 午夜12點則不執行
      if (executeHour !== 0 || executeMinute !== 0) {
        await execute(client);
        console.log('結束抓取時間：' + new Date().toLocaleString());
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
      let diff = (curMinutes - executeMinute) * 60 * 1000 + (curSeconds - 0) * 1000 + (curMilliseconds - 0);

      // 重新計算時間(間隔 - 偏差)
      intervalTime = timeInterval - diff;

      // 重新啟動定時器
      await startTimer();
    }, intervalTime);
  }

  await startTimer();

  // 每天午夜11點59分59秒執行一次(確保資料有獲取)
  // const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  // const timeToTarget = target.getTime() - now.getTime();
  // setTimeout(() => {
  //   setInterval(async () => {
  //     await execute();
  //   }, 24 * 60 * 60 * 1000);
  // }, timeToTarget);

  async function execute() {
    try {
      // 執行爬蟲
      await crawler(client);

      await delay(300);

      // 獲取發送清單
      sendVideo('videos.json', config.VIDEO_CHANNEL_ID);
      sendVideo('streams.json', config.STREAM_CHANNEL_ID);
    } catch (error) {
      addErrorLog(error);
      await sendMessage(interaction, config.VIDEO_CHANNEL_ID, '影片抓取失敗！');
      await sendMessage(interaction, config.STREAM_CHANNEL_ID, '直播抓取失敗！');
    }
  }
});

// 發送影片
async function sendVideo(file, channelId) {
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

// 當機器人準備就緒時執行此代碼（僅執行一次）
// 我們使用 'c' 作為事件參數，以避免與已定義的 'client' 混淆
client.once(Events.ClientReady, (c) => {
  console.log(`準備完成！已登入為 ${c.user.tag}`); // 顯示機器人已準備就緒並輸出目前登入的使用者標籤
});

// 使用 Discord 客戶端 token 登入
client.login(config.TOKEN);
