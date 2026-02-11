/**
 * 資料遷移腳本
 * 從現有 JSON 檔案匯入資料到 MongoDB
 *
 * 用法：node scripts/seed.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("請設定 MONGODB_URI 環境變數");
  process.exit(1);
}

// 讀取 JSON 檔案（不存在則回傳預設值）
function readJsonFile(filePath, defaultValue = []) {
  if (!fs.existsSync(filePath)) {
    console.log(`檔案不存在，跳過：${filePath}`);
    return defaultValue;
  }
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`讀取失敗：${filePath}`, error.message);
    return defaultValue;
  }
}

try {
  await mongoose.connect(MONGODB_URI);
  console.log("MongoDB 連線成功");

  // 載入 Model
  const { Channel, SentItem, AppState } = await import("../src/db.mjs");

  // ===== 匯入頻道清單 =====
  const videosChannelsData = readJsonFile(
    path.join(rootDir, "videosChannels.json"),
    { data: [] },
  );
  const streamsChannelsData = readJsonFile(
    path.join(rootDir, "streamsChannels.json"),
    { data: [] },
  );

  const videosChannels = videosChannelsData.data || [];
  const streamsChannels = streamsChannelsData.data || [];

  if (videosChannels.length > 0) {
    const docs = videosChannels.map((ch) => ({
      channelId: ch.channelId,
      type: "videos",
      last_updated: ch.last_updated || "",
    }));
    // 使用 upsert 避免重複
    for (const doc of docs) {
      await Channel.updateOne(
        { channelId: doc.channelId, type: doc.type },
        { $set: doc },
        { upsert: true },
      );
    }
    console.log(`已匯入 ${videosChannels.length} 個影片頻道`);
  }

  if (streamsChannels.length > 0) {
    const docs = streamsChannels.map((ch) => ({
      channelId: ch.channelId,
      type: "streams",
      last_updated: ch.last_updated || "",
    }));
    for (const doc of docs) {
      await Channel.updateOne(
        { channelId: doc.channelId, type: doc.type },
        { $set: doc },
        { upsert: true },
      );
    }
    console.log(`已匯入 ${streamsChannels.length} 個直播頻道`);
  }

  // ===== 匯入已發送紀錄 =====
  const sendedVideos = readJsonFile(path.join(rootDir, "sendedVideos.json"));
  const sendedStreams = readJsonFile(path.join(rootDir, "sendedStreams.json"));

  if (sendedVideos.length > 0) {
    const docs = sendedVideos.map((item) => ({
      videoId: item.id,
      type: "videos",
      title: item.title,
      link: item.link,
      thumbnail: item.pic,
      publishedTime: item.time,
      duration: item.duration,
      viewCount: item.views,
      channelId: item.channelId,
    }));
    await SentItem.insertMany(docs);
    console.log(`已匯入 ${sendedVideos.length} 筆已發送影片`);
  }

  if (sendedStreams.length > 0) {
    const docs = sendedStreams.map((item) => ({
      videoId: item.id,
      type: "streams",
      title: item.title,
      link: item.link,
      thumbnail: item.pic,
      publishedTime: item.time,
      duration: item.duration,
      viewCount: item.views,
      channelId: item.channelId,
    }));
    await SentItem.insertMany(docs);
    console.log(`已匯入 ${sendedStreams.length} 筆已發送直播`);
  }

  // ===== 匯入最後爬蟲時間 =====
  const lastTime = readJsonFile(path.join(rootDir, "lastTime.json"), {});
  if (lastTime.time) {
    await AppState.updateOne(
      { key: "lastCrawlTime" },
      { $set: { value: String(lastTime.time), updatedAt: new Date() } },
      { upsert: true },
    );
    console.log(`已匯入最後爬蟲時間：${lastTime.time}`);
  }

  await mongoose.disconnect();
  console.log("資料遷移完成！");
} catch (error) {
  console.error("遷移失敗：", error.message);
  process.exit(1);
}
