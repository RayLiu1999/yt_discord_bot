import { SlashCommandBuilder } from "discord.js";
import {
  getChannels,
  addChannel,
  removeChannel,
  addErrorLog,
  getSentItems,
} from "#src/functions";

export const data = new SlashCommandBuilder()
  .setName("video")
  .setDescription("管理 YouTube 影片頻道追蹤清單")
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("列出目前追蹤的影片頻道"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("新增影片頻道到追蹤清單")
      .addStringOption((opt) =>
        opt
          .setName("channel_id")
          .setDescription("YouTube 頻道 ID（例如 @channelname）")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("del")
      .setDescription("從追蹤清單移除影片頻道")
      .addStringOption((opt) =>
        opt
          .setName("channel_id")
          .setDescription("YouTube 頻道 ID（例如 @channelname）")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("sent").setDescription("列出今日已抓取的影片"),
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "list": {
      const channels = await getChannels("videos");
      if (channels.length === 0) {
        await interaction.reply("影片頻道清單為空");
        return;
      }

      let sendStr = "";
      channels.forEach((item) => {
        const lastUpdated = item.last_updated || "無";
        sendStr += `${item.channelId} - ${lastUpdated}\n`;
      });
      await interaction.reply(sendStr);
      break;
    }

    case "add": {
      const channelId = interaction.options.getString("channel_id");

      // 檢查是否已存在
      const existing = await getChannels("videos");
      if (existing.some((item) => item.channelId === channelId)) {
        await interaction.reply("此頻道已存在！");
        return;
      }

      try {
        await addChannel(channelId, "videos");
        await interaction.reply("新增成功！");
      } catch (error) {
        addErrorLog(error);
        await interaction.reply("新增失敗！");
      }
      break;
    }

    case "del": {
      const channelId = interaction.options.getString("channel_id");

      try {
        await removeChannel(channelId, "videos");
        await interaction.reply("刪除成功！");
      } catch (error) {
        addErrorLog(error);
        await interaction.reply("刪除失敗！");
      }
      break;
    }

    case "sent": {
      const items = await getSentItems("videos");
      if (items.length === 0) {
        await interaction.reply("今日尚無已抓取的影片");
        return;
      }

      const lines = items.map((item) => `${item.title}\n${item.link}`);
      // Discord 訊息上限 2000 字元，超過則截斷
      let msg = lines.join("\n\n");
      if (msg.length > 1900) {
        msg = msg.slice(0, 1900) + "\n\n...（已截斷）";
      }
      await interaction.reply(msg);
      break;
    }
  }
}
