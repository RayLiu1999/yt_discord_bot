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
sentItemSchema.index({ sentAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }); // 7 天後自動清除

// 應用程式狀態（取代 lastTime.json）
const appStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
});

// 直播追蹤排程
const liveScheduleSchema = new mongoose.Schema({
  videoId: { type: String, required: true, unique: true }, // YouTube 影片 ID
  channelId: { type: String, required: true }, // YouTube 頻道 ID
  title: String, // 直播標題
  discordChannelId: { type: String, required: true }, // 發送通知的 Discord 頻道 ID
  requestUserId: String, // 要求追蹤的 Discord 使用者 ID，可選，用於 Tag
  scheduledStartTime: { type: Number, required: true }, // 預計開播的 Unix Timestamp（秒）
  isNotified: { type: Boolean, default: false }, // 是否已通知
  createdAt: { type: Date, default: Date.now },
});

liveScheduleSchema.index({ isNotified: 1, scheduledStartTime: 1 }); // 查詢效能優化
liveScheduleSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 },
); // 30 天後自動清除

// 直播通知訂閱使用者
const liveNotificationUserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, // Discord 使用者 ID
  createdAt: { type: Date, default: Date.now },
});

// ===== Model 匯出 =====

export const Channel = mongoose.model("Channel", channelSchema);
export const SentItem = mongoose.model("SentItem", sentItemSchema);
export const AppState = mongoose.model("AppState", appStateSchema);
export const LiveSchedule = mongoose.model("LiveSchedule", liveScheduleSchema);
export const LiveNotificationUser = mongoose.model(
  "LiveNotificationUser",
  liveNotificationUserSchema,
);
