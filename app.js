const fs = require("node:fs");
const path = require("node:path");
require('dotenv').config();

// Require the necessary discord.js classes
const { Client, Collection, Events, GatewayIntentBits } = require("discord.js");
const token = process.env.TOKEN;
const videoChannelId = process.env.VIDEO_CHANNELID;
const streamChannelId = process.env.STREAM_CHANNELID;

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();
const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
      );
    }
  }
}

// 內建指令
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
  }
});

// 自訂指令
client.on(Events.MessageCreate, async (message) => {
  const prefix = "!";
  delete require.cache[require.resolve("./videosChannels.json")];
  let videosChannels = require("./videosChannels.json").data;

  delete require.cache[require.resolve("./streamsChannels.json")];
  let streamsChannels = require("./streamsChannels.json").data;

  delete require.cache[require.resolve("./videos.json")];
  const videos = require("./videos.json");

  delete require.cache[require.resolve("./streams.json")];
  const streams = require("./streams.json");

  // 取影片連結
  switch (message.content) {
    // 爬影片
    case prefix + "clr":
      const execute = require("./crawler.js");

      try {
        await execute();
        message.channel.send("影片抓取成功！");
      } catch (error) {
        console.log(error);
        await message.reply("影片抓取失敗！");
      }
      break;

    // 取影片
    case prefix + "vd": {
      if (videos.length === 0) {
        message.channel.send("最新影片皆已發送！");
        return false;
      }

      // 每次發送5個
      let links = [];
      for (let i = 0; i < videos.length; i++) {
        if (links.includes(videos[i].link)) continue;

        links.push(videos[i].link);

        if (links.length === 5) {
          message.channel.send(links.join("\n"));
          links = []; // 清空
        }
      }

      // 發送剩餘的
      if (links.length > 0) {
        message.channel.send(links.join("\n"));
      }
      break;
    }

    // 取直播
    case prefix + "st": {
      if (streams.length === 0) {
        message.channel.send("最新影片皆已發送！");
        return false;
      }

      // 每次發送5個
      let links = [];
      for (let i = 0; i < streams.length; i++) {
        if (links.includes(streams[i].link)) continue;

        links.push(streams[i].link);

        if (links.length === 5) {
          message.channel.send(links.join("\n"));
          links = []; // 清空
        }
      }

      // 發送剩餘的
      if (links.length > 0) {
        message.channel.send(links.join("\n"));
      }
      break;
    }

    // 取影片channelId清單
    case prefix + "vd ls": {
      let sendStr = "";
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
    case prefix + "st ls": {
      let sendStr = "";
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
  if (message.content.startsWith(prefix + "vd add")) {
    let channelID = message.content.split(" ")[2];
    if (channelID === undefined || channelID === null || channelID === "") {
      message.channel.send("請輸入頻道ID！");
      return;
    }
    
    // 檢查是否已存在
    if (videosChannels.some((item) => item.channelId === channelID)) {
      message.channel.send("此頻道已存在！");
      return;
    }

    videosChannels.push({
      channelId: channelID,
      last_updated: "",
    });

    fs.writeFile("videosChannels.json", JSON.stringify({data: videosChannels}), (err) => {
      if (err) throw err;
      message.channel.send("新增成功！");
    });
  }

  // 直播新增清單
  if (message.content.startsWith(prefix + "st add")) {
    let channelID = message.content.split(" ")[2];
    if (channelID === undefined || channelID === null || channelID === "") {
      message.channel.send("請輸入頻道ID！");
      return;
    }
    
    // 檢查是否已存在
    if (streamsChannels.some((item) => item.channelId === channelID)) {
      message.channel.send("此頻道已存在！");
      return;
    }

    streamsChannels.push({
      channelId: channelID,
      last_updated: "",
    });

    fs.writeFile("streamsChannels.json", JSON.stringify({data: streamsChannels}), (err) => {
      if (err) throw err;
      message.channel.send("新增成功！");
    });
  }

  // 影片刪除清單
  if (message.content.startsWith(prefix + "vd del")) {
    let channelID = message.content.split(" ")[2];
    if (channelID === undefined || channelID === null || channelID === "") {
      message.channel.send("請輸入頻道ID！");
      return;
    }

    videosChannels = videosChannels.filter((item) => item.channelId !== channelID);

    fs.writeFile("videosChannels.json", JSON.stringify({data: videosChannels}), (err) => {
      if (err) throw err; 
      message.channel.send("刪除成功！");
    });
  }

  // 直播刪除清單
  if (message.content.startsWith(prefix + "vd del")) {
    let channelID = message.content.split(" ")[2];
    if (channelID === undefined || channelID === null || channelID === "") {
      message.channel.send("請輸入頻道ID！");
      return;
    }

    streamsChannels = streamsChannels.filter((item) => item.channelId !== channelID);

    fs.writeFile("streamsChannels.json", JSON.stringify({data: streamsChannels}), (err) => {
      if (err) throw err; 
      message.channel.send("刪除成功！");
    });
  }
});

// 自動發送
client.on(Events.ClientReady, async (c) => { 
  // 计算距离下一个整点或半点的时间
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const milliseconds = now.getMilliseconds();
  const timeToNextHalfHour = (30 - minutes % 30) * 60 * 1000 - seconds * 1000 - milliseconds;
  const timeToNextHour = (60 - minutes) * 60 * 1000 - seconds * 1000 - milliseconds;

  const fs = require('fs');
  const crawler = require("./crawler.js");

  let intervalTime = timeToNextHalfHour > timeToNextHour ? timeToNextHour : timeToNextHalfHour
  async function startTimer() {
    console.log('啟動時間：' + new Date().toLocaleString());
    console.log('距離下一次執行時間：' + Math.round(intervalTime / 1000 / 60 * 10) / 10 + '分鐘');

    setTimeout(async () => {
      // 開始執行時間
      console.log("開始抓取時間：" + new Date().toLocaleString());
      
      let timeInterval = 30 * 60 * 1000; // 時間間隔(預設30分鐘)
      let executeHour = new Date().getHours();
      let executeMinute = new Date().getMinutes();

      // 午夜12點則不執行
      if (executeHour !== 0 || executeMinute !== 0) {
        await execute();
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
      let diff = (curMinutes - executeMinute) * 60 * 1000 + (curSeconds - 0) * 1000 + (curMilliseconds - 0);

      // 重新計算時間(間隔 - 偏差)
      intervalTime = timeInterval - diff;
  
      // 重新启动定时器 
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
      await crawler();

      await delay(300);

      // 獲取發送清單
      sendMessage(c, videoChannelId, 'videos.json');
      sendMessage(c, streamChannelId, 'streams.json');

    } catch (error) {
      console.log(error);
      sendMessage(c, videoChannelId, '', '影片抓取失敗！');
      sendMessage(c, streamChannelId, '', '直播抓取失敗！');
    }
  }
});

function sendMessage(c, channelId, file = '', message = '') {
  // 發送檔案資料
  if (file != '') {
    fs.readFile(file, 'utf8', (err, data) => {
      if (err) throw err;
      let videos;
  
      if (data === undefined || data === null || data === "") {
        videos = [];
      }
      else {
        videos = JSON.parse(data);
      }
  
      if (videos.length === 0) {
        console.log('最新影片皆已發送！-' + new Date().toLocaleString());
        return false;
      }
  
      // 一次發送
      let links = [];
      for (let i = 0; i < videos.length; i++) {
        if (links.includes(videos[i].link)) continue;
  
        links.push(videos[i].link);
  
        // 每次發送5個
        if (links.length === 5) {
          c.channels.cache
          .get(channelId)
          .send(links.join("\n"));
  
          links = []; // 清空
        }
      }
  
      // 發送剩餘的
      if (links.length > 0) {
        c.channels.cache
        .get(channelId)
        .send(links.join("\n"));
      }
    });
  }

  // 發送訊息
  if (message != '') {
    c.channels.cache
    .get(channelId)
    .send(message);
  }
}

async function delay(time) {
  await new Promise((resolve) => setTimeout(resolve, time));
}

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
client.once(Events.ClientReady, (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
});

// Log in to Discord with your client's token
client.login(token);