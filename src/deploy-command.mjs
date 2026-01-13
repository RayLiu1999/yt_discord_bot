import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // 可選，留空代表全域
const token = process.env.TOKEN;
import fs from 'node:fs';

const commands = [];
// 取得專案根目錄 (src 上一層)
const rootDir = path.resolve(__dirname, '..');
const commandsDir = path.join(rootDir, 'commands');

if (!fs.existsSync(commandsDir)) {
  console.error(`找不到 commands 資料夾：${commandsDir}`);
  process.exit(1);
}

async function collectCommandFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectCommandFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
      files.push(fullPath);
    }
  }
  return files;
}

const commandFiles = await collectCommandFiles(commandsDir);

for (const filePath of commandFiles) {
  const mod = await import(filePath);
  const command = mod.default ?? mod;
  if (command && 'data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.log(`[警告] ${filePath} 的指令缺少必要的 "data" 或 "execute" 屬性，或匯出格式不正確。`);
  }
}

// 構建並準備REST模組的實例
const rest = new REST().setToken(token);

// 部署你的指令！
(async () => {
	try {
		console.log(`開始更新 ${commands.length} 個應用程式 (/) 指令。`);

		// put方法用於使用當前指令集完全刷新伺服器中的所有指令
		const data = await rest.put(
			Routes.applicationGuildCommands(clientId, guildId),
			{ body: commands },
		);

		console.log(`成功重新載入 ${data.length} 個應用程式 (/) 指令。`);
	} catch (error) {
		// 當然，確保你捕獲並記錄任何錯誤！
		console.error(error);
	}
})();