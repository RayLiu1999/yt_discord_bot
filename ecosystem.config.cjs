module.exports = {
  apps: [
    {
      name: "yt_dc_bot",
      script: "app.mjs",
      watch: ["src", "app.mjs"], // 監聽 src 和 app.mjs 文件變化
      cron_restart: "10 0 * * *", // 凌晨12:10重啟
    },
  ],
};
