import fs from "node:fs";
import path from "node:path";
import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  entersState,
  generateDependencyReport,
} from "@discordjs/voice";

import { delay, readFile, sendMessage, sendVideo, addErrorLog } from "#src/functions";
import crawler from "#src/crawler";
import config from "#src/config";
import { rootDir } from "#src/path";
import ytdl from "ytdl-core";
import { exec, execSync } from "node:child_process";

// 建立 Discord 客戶端實例
const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();
const foldersPath = path.join(".", "commands");
const commandFolders = fs.readdirSync(foldersPath);

// 建立音頻播放器
const player = createAudioPlayer();
let audioStream;
let voiceChannelConnection;

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = await import(filePath);
    // 將指令名稱設為鍵值，導出的模組設為值，存入 Collection 中
    if ("data" in command && "execute" in command) {
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
        content: "執行指令時發生錯誤！",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "執行指令時發生錯誤！",
        ephemeral: true,
      });
    }
  }
});

// 自訂指令
client.on(Events.MessageCreate, async (message) => {
  const PREFIX = "!";
  // 讀取頻道列表和影片資料
  const videosChannels = readFile(`${rootDir}/videosChannels.json`).data || [];
  const streamsChannels = readFile(`${rootDir}/streamsChannels.json`).data || [];
  const videos = readFile(`${rootDir}/videos.json`) || [];
  const streams = readFile(`${rootDir}/streams.json`) || [];

  // 取影片連結
  switch (message.content) {
    // 爬影片
    case PREFIX + "clr":
      try {
        await crawler(client);
      } catch (error) {
        console.log(error);
        await message.reply("影片抓取失敗！");
      }
      break;

    // 取影片
    case PREFIX + "vd": {
      if (videos.length === 0) {
        // message.channel.send("最新影片皆已發送！");
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
    case PREFIX + "st": {
      if (streams.length === 0) {
        // message.channel.send("最新影片皆已發送！");
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
    case PREFIX + "vd ls": {
      let sendStr = "";
      videosChannels.forEach(function (item) {
        if (item.last_updated == "") {
          item.last_updated = "無";
        }

        sendStr += `${item.channelId} - ${item.last_updated}\n`;
      });

      message.channel.send(sendStr);
      break;
    }

    // 取直播channelId清單
    case PREFIX + "st ls": {
      let sendStr = "";
      streamsChannels.forEach(function (item) {
        if (item.last_updated == "") {
          item.last_updated = "無";
        }

        sendStr += `${item.channelId} - ${item.last_updated}\n`;
      });

      message.channel.send(sendStr);
      break;
    }
  }

  // 影片新增清單
  if (message.content.startsWith(PREFIX + "vd add")) {
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

    fs.writeFile(
      "videosChannels.json",
      JSON.stringify({ data: videosChannels }),
      (err) => {
        if (err) throw err;
        message.channel.send("新增成功！");
      }
    );
  }

  // 直播新增清單
  if (message.content.startsWith(PREFIX + "st add")) {
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

    fs.writeFile(
      "streamsChannels.json",
      JSON.stringify({ data: streamsChannels }),
      (err) => {
        if (err) throw err;
        message.channel.send("新增成功！");
      }
    );
  }

  // 影片刪除清單
  if (message.content.startsWith(PREFIX + "vd del")) {
    let channelID = message.content.split(" ")[2];
    if (channelID === undefined || channelID === null || channelID === "") {
      message.channel.send("請輸入頻道ID！");
      return;
    }

    videosChannels = videosChannels.filter(
      (item) => item.channelId !== channelID
    );

    fs.writeFile(
      "videosChannels.json",
      JSON.stringify({ data: videosChannels }),
      (err) => {
        if (err) throw err;
        message.channel.send("刪除成功！");
      }
    );
  }

  // 直播刪除清單
  if (message.content.startsWith(PREFIX + "vd del")) {
    let channelID = message.content.split(" ")[2];
    if (channelID === undefined || channelID === null || channelID === "") {
      message.channel.send("請輸入頻道ID！");
      return;
    }

    streamsChannels = streamsChannels.filter(
      (item) => item.channelId !== channelID
    );

    fs.writeFile(
      "streamsChannels.json",
      JSON.stringify({ data: streamsChannels }),
      (err) => {
        if (err) throw err;
        message.channel.send("刪除成功！");
      }
    );
  }

  // 加入語音頻道
  if (message.content.startsWith(PREFIX + "join")) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply("你需要先加入語音頻道");
    }

    botJoinVoiceChannel(voiceChannel);
  }

  // 查YT音樂，並播放
  if (message.content.startsWith(PREFIX + "play")) {
    const args = message.content
      .slice(PREFIX + "play".length)
      .trim()
      .split(" ");
    if (!args.length) {
      return message.reply("請提供要播放的 YouTube 影片 URL！");
    }

    const url = args[1];
    console.log(url);
    if (!ytdl.validateURL(url)) {
      return message.reply("請提供有效的 YouTube 影片 URL！");
    }

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply("你需要先加入語音頻道！");
    }

    try {
      // 加入語音頻道
      botJoinVoiceChannel(voiceChannel);

      // 判斷機器人狀態
      voiceChannelConnection.on(VoiceConnectionStatus.Disconnected, () => {
        console.log("離開語音頻道");
        // voiceChannelConnection.destroy();
        voiceChannelConnection = null;
      });

      // 如果播放中,則停止直接切歌
      if (
        (player && player.state.status === AudioPlayerStatus.Playing) ||
        player.state.status === AudioPlayerStatus.Paused
      ) {
        console.log("停止");
        player.stop();
        voiceChannelConnection.subscribe(player);

        await delay(1000);
      }

      // 清空音樂流
      if (audioStream) {
        audioStream.close();
        audioStream = null;
      }

      console.log("刪除檔案");
      if (fs.existsSync("output.mp4")) {
        await waitForFileReleaseSync("output.mp4");
        console.log("檔案已刪除");
      }

      console.log("下載檔案");
      execSync(`yt-dlp -f "bestaudio[ext=mp4]" -o "output.mp4" ${url}`);

      console.log("取得標題");
      const title = await getYTTitle(url);

      // execSync("ffmpeg -i output.mp4 -q:a 2 output.mp3");

      console.log("創建音樂流");
      audioStream = fs.createReadStream("output.mp4");

      console.log("播放音樂");
      playMusic(voiceChannelConnection, player, audioStream);

      message.reply(`正在播放: ${title}`);
    } catch (error) {
      console.error(error);
      message.reply("播放時發生錯誤！");
    }
  }

  // 開始音樂
  if (message.content.startsWith(PREFIX + "resume")) {
    if (player && player.state.status === AudioPlayerStatus.Paused) {
      player.unpause();
      message.reply("音樂已繼續播放");
    } else {
      message.reply("目前沒有暫停中的音樂");
    }
  }

  // 暫停音樂
  if (message.content.startsWith(PREFIX + "pause")) {
    if (player && player.state.status === AudioPlayerStatus.Playing) {
      player.pause();
      message.reply("音樂已暫停");
    } else {
      message.reply("目前沒有播放中的音樂");
    }
  }

  // 播放剛剛播放的音樂
  if (message.content.startsWith(PREFIX + "restart")) {
    if (voiceChannelConnection && player && player.state.status !== AudioPlayerStatus.Paused && player.state.status !== AudioPlayerStatus.Playing) {
      audioStream = fs.createReadStream("output.mp4");
      playMusic(voiceChannelConnection, player, audioStream);
      message.reply("音樂已重新播放");
    }
  }

  // 單曲循環播放
  if (message.content.startsWith(PREFIX + "loop")) {
    if (voiceChannelConnection) {
      if (!player) {
        player = createAudioPlayer();
      }
      audioStream = fs.createReadStream("output.mp4");

      // 開啟播放
      if (player.state.status === AudioPlayerStatus.Idle) {
        playMusic(voiceChannelConnection, player, audioStream);
      }

      // 重新播放
      if (player.state.status !== AudioPlayerStatus.Paused) {
        player.unpause();
      }

      player.on(AudioPlayerStatus.Idle, () => {
        playMusic(voiceChannelConnection, player, audioStream);
      });

      message.reply("音樂開始循環播放");
    }
    else {
      message.reply("請先將機器人加入語音頻道");
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
        try {
          // 執行爬蟲
          await crawler(client);
    
          await delay(300);
    
          // 獲取發送清單
          sendVideo(client, 'videos.json', config.VIDEO_CHANNEL_ID);
          sendVideo(client, 'streams.json', config.STREAM_CHANNEL_ID);
        } catch (error) {
          addErrorLog(error);
          sendMessage(client, config.VIDEO_CHANNEL_ID, '影片抓取失敗！');
          sendMessage(client, config.STREAM_CHANNEL_ID, '直播抓取失敗！');
        }
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
});

// 加入語音頻道
function botJoinVoiceChannel(voiceChannel) {
  if (voiceChannelConnection !== null || voiceChannelConnection !== undefined) {    
    voiceChannelConnection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    // 判斷機器人狀態
    voiceChannelConnection.on(VoiceConnectionStatus.Disconnected, () => {
      console.log("離開語音頻道");
      // voiceChannelConnection.destroy();
      voiceChannelConnection = null;
    });
  }
}

// 播放音樂
function playMusic(connection, player, audioStream) {
  const resource = createAudioResource(audioStream);
  player.play(resource);
  connection.subscribe(player);
}

// 取得影片標題
function getYTTitle(url) {
  return new Promise((resolve, reject) => {
    exec(`yt-dlp -j ${url}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${err.message}`);
        return;
      }

      try {
        const videoData = JSON.parse(stdout);
        console.log(`Title: ${videoData.title}`);
        resolve(videoData.title);
      } catch (parseErr) {
        console.error(`Failed to parse JSON: ${parseErr.message}`);
        reject(parseErr);
      }
    });
  });
}

// 等待文件释放，直到文件成功删除
async function waitForFileReleaseSync(filePath) {
  let fileDeleted = false;

  while (!fileDeleted) {
    try {
      // 尝试删除文件
      fs.unlinkSync(filePath);
      console.log("File deleted successfully");
      fileDeleted = true; // 文件成功删除，退出循环
    } catch (err) {
      if (err.code === "EBUSY" || err.code === "EPERM") {
        // 如果文件被占用，等待一段时间再重试
        console.log("File is still in use, retrying...");
        await delay(500); // 延迟1秒再尝试
      } else if (err.code === "ENOENT") {
        // 文件不存在，认为文件已被释放
        console.log("File not found, assuming it is released.");
        fileDeleted = true;
      } else {
        throw err; // 其他错误直接抛出
      }
    }
  }
}

// 當機器人準備就緒時執行此代碼（僅執行一次）
// 我們使用 'c' 作為事件參數，以避免與已定義的 'client' 混淆
client.once(Events.ClientReady, (c) => {
  console.log(`準備完成！已登入為 ${c.user.tag}`); // 顯示機器人已準備就緒並輸出目前登入的使用者標籤
});

// 使用 Discord 客戶端 token 登入
client.login(config.TOKEN);
