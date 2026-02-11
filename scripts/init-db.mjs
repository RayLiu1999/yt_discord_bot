/**
 * 資料庫初始化腳本
 * 建立 MongoDB 索引
 *
 * 用法：node scripts/init-db.mjs
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("請設定 MONGODB_URI 環境變數");
  process.exit(1);
}

try {
  await mongoose.connect(MONGODB_URI);
  console.log("MongoDB 連線成功");

  // 動態載入 Model 以觸發索引建立
  await import("../src/db.mjs");

  // 等待所有索引建立完成
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.createIndexes()),
  );

  console.log("所有索引建立完成");
  await mongoose.disconnect();
  console.log("完成，已斷開連線");
} catch (error) {
  console.error("初始化失敗：", error.message);
  process.exit(1);
}
