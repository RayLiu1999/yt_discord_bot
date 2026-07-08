import fetch from "node-fetch";
import * as cheerio from "cheerio";

import {
  checkIsSended,
  checkTime,
  delay,
  addErrorLog,
  sendMessage,
  sendVideo,
  getChannels,
  getSentItems,
  addSentItems,
  updateChannelDate,
  getAppState,
  setAppState,
  removeChannel,
  checkAndRemoveInactiveChannels,
  addLiveSchedule,
} from "#src/functions";
import { parsePageVideos } from "#src/youtube-parser";
import config from "#src/config";

const YT_domain = "https://www.youtube.com";
const type = ["videos", "streams", "community"];
let DCclient;

async function execute(client) {
  DCclient = client;

  console.log("開始爬蟲...");

  // 清理過期頻道
  await checkAndRemoveInactiveChannels(client);

  // 從 MongoDB 讀取頻道清單
  const videosChannels = await getChannels("videos");
  const streamsChannels = await getChannels("streams");

  if (videosChannels.length === 0) {
    await sendMessage(client, config.VIDEO_CHANNEL_ID, "影片頻道清單為空");
    return;
  }

  if (streamsChannels.length === 0) {
    await sendMessage(client, config.STREAM_CHANNEL_ID, "直播頻道清單為空");
  }

  // 取得今天的已發送清單（getSentItems 已內建今日過濾）
  const sendedVideos = await getSentItems("videos");
  const sendedStreams = await getSentItems("streams");

  let videosInfo = [];
  let streamsInfo = [];
  let batchPromises = [];

  videosChannels.forEach((item) => {
    const url = YT_domain + "/" + item.channelId + "/";
    batchPromises.push(fetchCrawler(url, type[0], sendedVideos));
  });

  streamsChannels.forEach((item) => {
    const url = YT_domain + "/" + item.channelId + "/";
    batchPromises.push(fetchCrawler(url, type[1], sendedStreams));
  });

  // 處理所有 Promise
  const results = await Promise.all(batchPromises);
  let failedChannels = [];

  results.forEach((result) => {
    if (!result) return;
    if (result.error) {
      // 記錄失敗的類型與 URL，方便排查
      const typeLabel = result.type === "streams" ? "直播" : "影片";
      failedChannels.push(`[${typeLabel}] ${result.url}`);
      return;
    }

    switch (result.type) {
      case "videos":
        videosInfo.push(...result.data);
        break;
      case "streams":
        streamsInfo.push(...result.data);
        break;
    }
  });

  if (failedChannels.length > 0) {
    console.error(`抓取失敗的頻道：\n${failedChannels.join("\n")}`);
    const errorMsg = `以下頻道抓取失敗：\n${failedChannels.join("\n")}`;
    await sendMessage(client, config.VIDEO_CHANNEL_ID, errorMsg);
  }

  // 更新頻道最後更新日期
  const now = new Date();
  const dateStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;

  for (const item of videosInfo) {
    await updateChannelDate(item.channelId, "videos", dateStr);
  }

  for (const item of streamsInfo) {
    await updateChannelDate(item.channelId, "streams", dateStr);
  }

  // 發送影片並寫入已發送紀錄（僅在確實發送成功時才標記，避免發送失敗卻被當成已完成）
  if (videosInfo.length > 0) {
    const sent = await sendVideo(client, videosInfo, config.VIDEO_CHANNEL_ID);
    if (sent) {
      await addSentItems(videosInfo, "videos");
      console.log("本日影片已儲存！");
    } else {
      addErrorLog("本日影片發送失敗，暫不標記為已發送，下次將重試");
    }
  } else {
    console.log("爬蟲結束，無新影片");
  }

  if (streamsInfo.length > 0) {
    const sent = await sendVideo(client, streamsInfo, config.STREAM_CHANNEL_ID);
    if (sent) {
      await addSentItems(streamsInfo, "streams");
      console.log("本日直播已儲存！");
    } else {
      addErrorLog("本日直播發送失敗，暫不標記為已發送，下次將重試");
    }
  } else {
    console.log("爬蟲結束，無新直播");
  }

  // 更新最後爬蟲時間
  await setAppState("lastCrawlTime", String(new Date().getTime()));

  console.log("爬蟲結束！");
}

async function fetchCrawler(url, type, sendedVideosOrStreams) {
  const fetchUrl = `${url}${type}`;
  let crawlerResults = [];

  return fetch(fetchUrl, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      "Accept-Language": "zh-TW,zh;q=0.9",
    },
  })
    .then(async (response) => {
      if (response.ok) {
        return response.text();
      } else {
        // 記錄 HTTP 錯誤狀態碼
        addErrorLog(`[HTTP 錯誤] ${fetchUrl} 回應狀態碼：${response.status}`);

        // 網址為404則移除該頻道
        if (response.status == 404) {
          const YTchannelID = new URL(url).pathname.replaceAll("/", "");
          await removeChannel(YTchannelID, type);
          await sendMessage(
            DCclient,
            config.VIDEO_CHANNEL_ID,
            `移除頻道: ${fetchUrl}`,
          );
        }
        return { type: type, error: true, url: fetchUrl };
      }
    })
    .then(async (data) => {
      if (data?.error) return data;
      const $ = cheerio.load(data);
      const scriptElement = $("script").filter(function () {
        return /var ytInitialData =/.test($(this).html());
      });
      let jsonData = scriptElement.html().replace(/var ytInitialData =/, "");
      jsonData = jsonData.replace(/;/g, "");
      jsonData = JSON.parse(jsonData);

      const { channelID, items } = parsePageVideos(jsonData, type);

      for (const parsed of items) {
        const {
          videoId,
          title: videoTitle,
          thumbnail: videoThumbnail,
          publishedTimeText: videoPublishedTime,
          duration: videoDuration,
          viewCount: videoViewCount,
          streamType,
          scheduledStartTime,
        } = parsed;
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        if (streamType === "upcoming") {
          // 將即將開始的直播存入排程，到時間時自動發送 Discord 通知
          try {
            await addLiveSchedule({
              videoId,
              channelId: channelID,
              title: videoTitle,
              discordChannelId: config.STREAM_CHANNEL_ID,
              scheduledStartTime,
            });
            console.log(
              `[直播排程] 已新增/更新：${videoTitle} (${videoId})`,
            );
          } catch (scheduleErr) {
            addErrorLog(`[直播排程] 儲存失敗：${scheduleErr.message}`);
          }
        }

        // 檢查是否已發送（使用 videoId 欄位比對）
        if (checkIsSended(sendedVideosOrStreams, videoId)) {
          continue;
        }

        if (!checkTime(videoPublishedTime || new Date() / 1000)) continue;

        crawlerResults.push({
          id: videoId,
          title: videoTitle,
          link: videoUrl,
          pic: videoThumbnail,
          time: videoPublishedTime || "直播中",
          duration: videoDuration || "無",
          views: videoViewCount,
          channelId: channelID,
        });
      }

      return {
        type: type,
        data: crawlerResults,
      };
    })
    .catch((error) => {
      addErrorLog(`[爬蟲錯誤] ${fetchUrl} 抓取失敗：`);
      addErrorLog(error);
      return { type: type, error: true, url: fetchUrl };
    });
}

// 匯出 execute 函數
export default execute;
