import { SlashCommandBuilder, MessageFlags } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const data = new SlashCommandBuilder()
  .setName("habit_record")
  .setDescription("習慣紀錄");

const subcommands = new Map(); // name → execute

// 讀取同資料夾內所有 *.mjs（排除 index）
for (const file of fs.readdirSync(__dirname)) {
  if (file === "index.mjs" || !file.endsWith(".mjs")) continue;
  const mod = await import(`./${file}`);
  if (!mod.name || !mod.build || !mod.execute) continue;

  // 組合進 SlashCommandBuilder
  data.addSubcommand((sub) =>
    mod.build(sub.setName(mod.name).setDescription(mod.description)),
  );

  subcommands.set(mod.name, mod.execute);
}

export async function execute(interaction) {
  const subName = interaction.options.getSubcommand();
  const handler = subcommands.get(subName);
  if (handler) return handler(interaction);
  await interaction.reply({
    content: "未知的子指令",
    flags: MessageFlags.Ephemeral,
  });
}
