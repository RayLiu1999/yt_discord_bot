module.exports = {
  apps: [{
    name: "yt_dc_bot",
    script: "app.mjs",
    watch: ["src", "app.mjs"], // 監聽 src 和 app.mjs 文件變化
    // watch: true, // 啟用監聽
    // watch_ignore: ["node_modules", "*.json"], // 忽略 node_modules 和 json 文件
    watch_delay: 1000, // 監聽延遲 1000ms
    cron_restart: "10 0 * * *", // 凌晨12:10重啟
    env: { // 環境變量
      NODE_ENV: "development",
    },
    env_production: { // 生產環境變量
      NODE_ENV: "production",
    }
  }]
}