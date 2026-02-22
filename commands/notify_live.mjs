import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { toggleLiveNotification, addErrorLog } from "#src/functions";

export const data = new SlashCommandBuilder()
  .setName("notify_live")
  .setDescription("切換是否要收到 YouTube 直播預告的 @提及通知");

export async function execute(interaction) {
  try {
    const userId = interaction.user.id;
    const isNowEnabled = await toggleLiveNotification(userId);

    if (isNowEnabled) {
      await interaction.reply(
        "✅ 已**開啟**直播預告通知！未來有新直播時我會 Tag 你。",
      );
    } else {
      await interaction.reply(
        "🔇 已**關閉**直播預告通知！你將不再收到直播的專屬 Tag 提醒。",
      );
    }
  } catch (error) {
    addErrorLog(`[/notify_live 指令錯誤] ${error.message}`);
    await interaction.reply({
      content: "切換通知狀態失敗，請稍後再試！",
      flags: MessageFlags.Ephemeral,
    });
  }
}
