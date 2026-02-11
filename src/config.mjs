import dotenv from "dotenv";
dotenv.config();

export default {
  TOKEN: process.env.TOKEN,
  CRAWLER_TYPE: process.env.CRAWLER_TYPE,
  VIDEO_CHANNEL_ID: process.env.VIDEO_CHANNEL_ID,
  STREAM_CHANNEL_ID: process.env.STREAM_CHANNEL_ID,
  MONGODB_URI: process.env.MONGODB_URI,
  WEBHOOK_URL: process.env.WEBHOOK_URL,
};
