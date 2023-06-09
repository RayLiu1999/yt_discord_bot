const fs = require("node:fs");
const path = require("node:path");

// Require the necessary discord.js classes
const { Client, Collection, Events, GatewayIntentBits } = require("discord.js");
const { token, channelId } = require("./config.json");

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
        await message.reply(error.message);
      }
      break;

    // 取影片
    case prefix + "vd":
      delete require.cache[require.resolve("./videos.json")];
      const videos = require("./videos.json");

      if (videos.length === 0) {
        message.channel.send("最新影片皆已發送！");
        return;
      }

      // let links = [];
      // for (video of videos) {
      //   links.push(video.link);
      // }

      // message.channel.send(links.join("\n"));
      
      try {
        for (video of videos) {
          await message.channel.send(video.link);
          await setTimeout(() => {}, 300);
        }
      } catch (error) {
        await message.reply(error.message);
      }
      break;

    // 抓清單
    case prefix + "ls":
      const bbq_mans = require("./bbq_mans.json");
      message.channel.send(bbq_mans.data.join("\n"));
      break;
  }

  // 新增清單
  if (message.content.startsWith(prefix + "add")) {
    let channelID = message.content.split(" ")[1];
    if (channelID === undefined || channelID === null || channelID === "") {
      message.channel.send("請輸入頻道ID！");
      return;
    }

    const bbq_mans = require("./bbq_mans.json");
    bbq_mans.data.push(channelID);
    fs.writeFile("bbq_mans.json", JSON.stringify(bbq_mans), (err) => {
      if (err) throw err;
      message.channel.send("新增成功！");
    });
  }

  // 刪除清單
  if (message.content.startsWith(prefix + "del")) {
    let channelID = message.content.split(" ")[1];
    if (channelID === undefined || channelID === null || channelID === "") {
      message.channel.send("請輸入頻道ID！");
      return;
    }

    const bbq_mans = require("./bbq_man.json");
    bbq_mans.data = bbq_mans.data.filter((item) => item !== channelID);
    fs.writeFile("bbq_man.json", JSON.stringify(bbq_mans), (err) => {
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

  // 每半小時執行一次
  setTimeout(() => {
    setInterval(async () => {
      // 午夜12點則不執行
      if (new Date().getHours() === 0 && new Date().getMinutes() === 0) return;

      await execute();
    }, 30 * 60 * 1000);
  }, timeToNextHalfHour > timeToNextHour ? timeToNextHour : timeToNextHalfHour);

  // 每天午夜11點59分59秒執行一次(確保資料有獲取)
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const timeToTarget = target.getTime() - now.getTime();
  setTimeout(() => {
    setInterval(async () => {
      await execute();
    }, 24 * 60 * 60 * 1000);
  }, timeToTarget);

  async function execute() {
    try {
      // 執行爬蟲
      await crawler();

      await setTimeout(() => {}, 300);

      // 獲取發送清單
      fs.readFile('./videos.json', 'utf8', (err, data) => {
        if (err) throw err;
        let videos;

        if (data === undefined || data === null || data === "") {
          videos = [];
        }
        else {
          videos = JSON.parse(data);
        }

        if (videos.length === 0) {
          c.channels.cache
          .get(channelId)
          .send("最新影片皆已發送！")
          return;
        }

        for (let video of videos) {
          c.channels.cache
          .get(channelId)
          .send(video.link)

          setTimeout(() => {}, 300);
        }

        c.channels.cache
        .get(channelId)
        .send("影片發送成功！")
      });

    } catch (error) {
      console.log(error);

      await c.channels.cache
      .get(channelId)
      .send(error.message)
    }
  }
});


// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
client.once(Events.ClientReady, (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
});

// Log in to Discord with your client's token
client.login(token);