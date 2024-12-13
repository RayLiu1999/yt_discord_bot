import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('videos')
    .setDescription('Get the latest videos from a channel'),
    // .addStringOption((option) =>
      // option
        // .setName('channel')
        // .setDescription('The channel ID or URL')
        // .setRequired(true)
    // ),
  async execute(interaction) {
    // const videos = require('../../videos.json');

    // for (video of videos) {
    //   let button = new MessageButton()
    //     .setStyle('LINK')
    //     .setLabel('Watch')
    //     .setURL(video.link);
    //   // await interaction.reply(video.link);
    // }

    // 創建三個 MessageButton 對象
    const googleButton = new ButtonBuilder()
    .setLabel('Google')
    .setURL('https://www.google.com');

    const githubButton = new ButtonBuilder()
    .setLabel('GitHub')
    .setURL('https://github.com');

    const discordButton = new ButtonBuilder()
    .setLabel('Discord')
    .setURL('https://discord.com');

    // 創建一個 MessageActionRow 對象
    const actionRow = new ActionRowBuilder()
    .addComponents(googleButton, githubButton, discordButton);

    // 將 MessageActionRow 對象發送到 Discord 頻道中
    await interaction.reply({ content: 'Here are some useful links:', components: [actionRow] });




    // const channel = interaction.options.getString('channel');
    // const videos = await getVideos(channel);
    // const embed = new EmbedBuilder()
    //   // .setTitle('Multiple links')
    //   // .setDescription('Here are some links:')
    //   .addFields({
    //     name: 'Koyori初見洛克人X被各種卡普空的惡意虐到不斷哀號ww【博衣こより／博衣Koyori】【ホロライブ切り抜き】【hololive中文精華】',
    //     value: 'https://www.youtube.com/watch?v=V-3bT0jBPIk',
    //   })
    //   // .setImage('https://i.ytimg.com/an_webp/V-3bT0jBPIk/mqdefault_6s.webp?du=3000&sqp=CPnx16MG&rs=AOn4CLBlwub2eVpxxhHoV99plL5PptU1tA')
    //   .setImage(
    //     'https://i.ytimg.com/vi/V-3bT0jBPIk/hqdefault.jpg?sqp=-oaymwEcCNACELwBSFXyq4qpAw4IARUAAIhCGAFwAcABBg==&rs=AOn4CLDVQz8mE8zEEeL-5FU0RaLzyr7wUg'
    //   )
    //   .setTimestamp();
    // await interaction.reply({ embeds: [embed] });
  },
};
