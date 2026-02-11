import mongoose from "mongoose";
import config from "#src/config";

// 連線至 MongoDB
export async function connectDB() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log("MongoDB 連線成功");
  } catch (error) {
    console.error("MongoDB 連線失敗：", error.message);
    process.exit(1);
  }
}

// ===== Schema 定義 =====

// 追蹤的 YouTube 頻道（合併 videosChannels.json + streamsChannels.json）
const channelSchema = new mongoose.Schema(
  {
    channelId: { type: String, required: true },
    type: { type: String, required: true, enum: ["videos", "streams"] },
    last_updated: { type: String, default: "" },
  },
  { timestamps: true },
);

channelSchema.index({ channelId: 1, type: 1 }, { unique: true });

// 已發送的影片/直播紀錄（合併 sendedVideos.json + sendedStreams.json）
const sentItemSchema = new mongoose.Schema({
  videoId: { type: String, required: true },
  type: { type: String, required: true, enum: ["videos", "streams"] },
  title: String,
  link: String,
  thumbnail: String,
  publishedTime: String,
  duration: String,
  viewCount: String,
  channelId: String,
  sentAt: { type: Date, default: Date.now },
});

sentItemSchema.index({ videoId: 1, type: 1 });
sentItemSchema.index({ sentAt: 1 });

// 應用程式狀態（取代 lastTime.json）
const appStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
});

// ===== Model 匯出 =====

export const Channel = mongoose.model("Channel", channelSchema);
export const SentItem = mongoose.model("SentItem", sentItemSchema);
export const AppState = mongoose.model("AppState", appStateSchema);
