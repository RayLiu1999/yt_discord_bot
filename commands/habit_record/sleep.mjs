// commands/habit_record/sleep.mjs
import fetch from 'node-fetch';

const WEBHOOK_URL = process.env.WEBHOOK_URL;

export const name = "sleep";
export const description = "紀錄每日睡眠時間";

export function build(sub) {
  return sub // 回傳處理後的 SlashCommandSubcommandBuilder
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
      option.setName("reason").setDescription("晚睡原因").setRequired(true)
    );
}

export async function execute(interaction) {
  const wake = interaction.options.getString("wake_up");
  const go_to_bed = interaction.options.getString("go_to_bed");
  const reason = interaction.options.getString("reason");

  const res = await fetch(`${WEBHOOK_URL}?type=sleep&wake=${wake}&go_to_bed=${go_to_bed}&reason=${reason}`);
  await interaction.reply(`起床時間：${wake}\n上床時間：${go_to_bed}\n晚睡原因：${reason}`);
}
