import fs from "node:fs";
import path from "node:path";
import { Client, Collection, Events, GatewayIntentBits } from "discord.js";

import { logger, addErrorLog } from "#src/logger";
import { CONSTANTS } from "#src/constants";
import { validateConfig } from "#src/validators";
import { CommandHandler } from "#src/commandHandler";
import { SchedulerManager } from "#src/schedulerManager";
import config from "#src/config";

/**
 * YouTube Discord Bot 主應用程式
 * 重構後的主文件，使用模組化設計提升可維護性
 */

// 驗證配置
const configValidation = validateConfig(config);
if (!configValidation.isValid) {
  logger.error('配置驗證失敗', { errors: configValidation.errors });
  process.exit(1);
}

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

// 初始化指令處理器和定時器管理器
const commandHandler = new CommandHandler(client);
const schedulerManager = new SchedulerManager(client);

// 載入 slash 指令
client.commands = new Collection();
await loadSlashCommands();

/**
 * 載入 slash 指令
 */
async function loadSlashCommands() {
  try {
    const foldersPath = path.join(".", "commands");
    
    if (!fs.existsSync(foldersPath)) {
      logger.warn('指令資料夾不存在', { path: foldersPath });
      return;
    }

    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
      const commandsPath = path.join(foldersPath, folder);
      
      if (!fs.statSync(commandsPath).isDirectory()) {
        continue;
      }

      const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".js") || file.endsWith(".mjs"));

      for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        
        try {
          const command = await import(filePath);
          
          if ("data" in command && "execute" in command) {
            client.commands.set(command.data.name, command);
            logger.debug('載入指令', { name: command.data.name, file: filePath });
          } else {
            logger.warn('指令文件缺少必要屬性', { 
              file: filePath,
              hasData: "data" in command,
              hasExecute: "execute" in command
            });
          }
        } catch (error) {
          logger.error('載入指令失敗', { file: filePath, error: error.message });
        }
      }
    }

    logger.info('Slash 指令載入完成', { count: client.commands.size });
  } catch (error) {
    logger.error('載入指令時發生錯誤', { error: error.message });
  }
}

// Slash 指令互動處理
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    logger.warn('找不到指令', { commandName: interaction.commandName });
    return;
  }

  try {
    await command.execute(interaction);
    logger.debug('指令執行成功', { 
      commandName: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guildId
    });
  } catch (error) {
    logger.error('執行指令時發生錯誤', { 
      commandName: interaction.commandName,
      error: error.message,
      userId: interaction.user.id
    });

    const errorMessage = "執行指令時發生錯誤！";
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: errorMessage,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true,
        });
      }
    } catch (replyError) {
      logger.error('回覆指令錯誤訊息失敗', { error: replyError.message });
    }
  }
});

// 自定義文字指令處理
client.on(Events.MessageCreate, async (message) => {
  // 忽略機器人訊息
  if (message.author.bot) return;

  // 只處理以前綴開始的訊息
  if (!message.content.startsWith(CONSTANTS.PREFIX)) return;

  try {
    await commandHandler.handleMessage(message);
  } catch (error) {
    logger.error('處理文字指令時發生錯誤', { 
      content: message.content,
      error: error.message,
      userId: message.author.id
    });
    
    try {
      await message.reply('處理指令時發生錯誤，請稍後再試。');
    } catch (replyError) {
      logger.error('回覆錯誤訊息失敗', { error: replyError.message });
    }
  }
});

// 機器人準備就緒事件
client.once(Events.ClientReady, async (c) => {
  logger.info('機器人已準備就緒', { 
    botTag: c.user.tag,
    guildCount: c.guilds.cache.size,
    userCount: c.users.cache.size
  });

  // 啟動定時器
  try {
    await schedulerManager.start();
    logger.info('自動爬蟲定時器已啟動');
  } catch (error) {
    logger.error('啟動定時器失敗', { error: error.message });
  }
});

// 錯誤處理
client.on(Events.Error, (error) => {
  logger.error('Discord 客戶端錯誤', { error: error.message });
});

client.on(Events.Warn, (warning) => {
  logger.warn('Discord 客戶端警告', { warning });
});

// 處理未捕獲的錯誤
process.on('unhandledRejection', (reason, promise) => {
  logger.error('未處理的 Promise 拒絕', { 
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined
  });
});

process.on('uncaughtException', (error) => {
  logger.error('未捕獲的異常', { 
    error: error.message,
    stack: error.stack
  });
  
  // 優雅關閉
  gracefulShutdown();
});

// 優雅關閉處理
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

/**
 * 優雅關閉應用程式
 */
async function gracefulShutdown() {
  logger.info('開始優雅關閉應用程式');
  
  try {
    // 停止定時器
    schedulerManager.stop();
    
    // 清理音樂資源
    if (commandHandler.musicManager) {
      commandHandler.musicManager.cleanup();
    }
    
    // 關閉 Discord 連接
    if (client) {
      await client.destroy();
    }
    
    logger.info('應用程式已成功關閉');
    process.exit(0);
  } catch (error) {
    logger.error('關閉應用程式時發生錯誤', { error: error.message });
    process.exit(1);
  }
}

// 登入機器人
try {
  await client.login(config.TOKEN);
} catch (error) {
  logger.error('機器人登入失敗', { error: error.message });
  process.exit(1);
}