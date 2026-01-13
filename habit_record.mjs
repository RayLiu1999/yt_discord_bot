import { SlashCommandBuilder } from "discord.js";

/**
 * /habit_record 指令
 */
export const data = new SlashCommandBuilder()
  .setName("habit_record")
  .setDescription("習慣紀錄")
  .addSubcommand((sub) =>
    sub
      .setName("sleep")
      .setDescription("紀錄每日睡眠時間")
      .addStringOption((option) =>
        option
          .setName("wake_up")
          .setDescription("起床時間")
          .setRequired(true)
          .addChoices(
            { name: "6點", value: "6:00" },
            { name: "6點半", value: "6:30" },
            { name: "7點", value: "7:00" },
            { name: "7點半", value: "7:30" },
            { name: "8點", value: "8:00" },
            { name: "8點半", value: "8:30" },
            { name: "9點", value: "9:00" },
            { name: "9點半", value: "9:30" },
            { name: "10點", value: "10:00" },
            { name: "10點半", value: "10:30" }
          )
      )
      .addStringOption((option) =>
        option
          .setName("go_to_bed")
          .setDescription("上床時間")
          .setRequired(true)
          .addChoices(
            { name: "10點", value: "22:00" },
            { name: "10點半", value: "22:30" },
            { name: "11點", value: "23:00" },
            { name: "11點半", value: "23:30" },
            { name: "12點", value: "00:00" },
            { name: "12點半", value: "00:30" },
            { name: "1點", value: "01:00" },
            { name: "1點半", value: "01:30" },
            { name: "2點", value: "02:00" },
            { name: "2點半", value: "02:30" }
          )
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("晚睡原因")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("work")
      .setDescription("紀錄每日工作時間")
      .addStringOption((option) =>
        option
          .setName("work")
          .setDescription("紀錄每日工作時間")
          .setRequired(true)
          .addChoices(
            { name: "10小時", value: "10" },
            { name: "8小時", value: "8" },
            { name: "6小時", value: "6" },
            { name: "4小時", value: "4" },
            { name: "2小時", value: "2" },
            { name: "0小時", value: "0" }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("study")
      .setDescription("紀錄每日學習時間")
      .addStringOption((option) =>
        option
          .setName("study")
          .setDescription("紀錄每日學習時間")
          .setRequired(true)
          .addChoices(
            { name: "10小時", value: "10" },
            { name: "8小時", value: "8" },
            { name: "6小時", value: "6" },
            { name: "4小時", value: "4" },
            { name: "2小時", value: "2" },
            { name: "0小時", value: "0" }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("exercise")
      .setDescription("紀錄每日運動時間")
      .addStringOption((option) =>
        option
          .setName("exercise")
          .setDescription("紀錄每日運動時間")
          .setRequired(true)
          .addChoices(
            { name: "10小時", value: "10" },
            { name: "8小時", value: "8" },
            { name: "6小時", value: "6" },
            { name: "4小時", value: "4" },
            { name: "2小時", value: "2" },
            { name: "0小時", value: "0" }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("other")
      .setDescription("紀錄每日其他時間")
      .addStringOption((option) =>
        option
          .setName("other")
          .setDescription("紀錄每日其他時間")
          .setRequired(true)
          .addChoices(
            { name: "10小時", value: "10" },
            { name: "8小時", value: "8" },
            { name: "6小時", value: "6" },
            { name: "4小時", value: "4" },
            { name: "2小時", value: "2" },
            { name: "0小時", value: "0" }
          )
      )
  );

/**
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const habit_type = interaction.options.getSubcommand();

  switch (habit_type) {
    case "sleep": {
      const wake_up = interaction.options.getString("wake_up");
      const go_to_bed = interaction.options.getString("go_to_bed");
      const reason = interaction.options.getString("reason");
      await interaction.reply(`起床時間：${wake_up}\n上床時間：${go_to_bed}\n晚睡原因：${reason}`);
      break;
    }
    case "work": {
      await interaction.reply("8小時");
      break;
    }
    case "study": {
      await interaction.reply("10小時");
      break;
    }
    case "exercise": {
      await interaction.reply("10小時");
      break;
    }
    case "other": {
      await interaction.reply("10小時");
      break;
    }
    default:
      await interaction.reply({ content: "未知的動作", ephemeral: true });
  }
}
