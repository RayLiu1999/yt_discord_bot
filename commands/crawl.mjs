import { SlashCommandBuilder } from "discord.js";
import crawler from "#src/crawler";
import { addErrorLog } from "#src/functions";

export const data = new SlashCommandBuilder()
  .setName("crawl")
  .setDescription("手動觸發 YouTube 影片 / 直播爬蟲");

export async function execute(interaction) {
  // 先回應使用者，避免 3 秒 interaction 逾時
  await interaction.reply("開始抓取影片與直播...");

  try {
    await crawler(interaction.client);
    await interaction.followUp("爬蟲執行完畢！");
  } catch (error) {
    addErrorLog(error);
    await interaction.followUp("爬蟲執行失敗！");
  }
}
