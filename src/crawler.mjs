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
} from "#src/functions";
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
      failedChannels.push(result.url);
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

  // 發送影片並寫入已發送紀錄
  if (videosInfo.length > 0) {
    await sendVideo(client, videosInfo, config.VIDEO_CHANNEL_ID);
    await addSentItems(videosInfo, "videos");
    console.log("本日影片已儲存！");
    await sendMessage(
      client,
      config.VIDEO_CHANNEL_ID,
      "本日新影片已成功抓取！",
    );
  } else {
    await sendMessage(client, config.VIDEO_CHANNEL_ID, "爬蟲結束，無新影片");
  }

  if (streamsInfo.length > 0) {
    await sendVideo(client, streamsInfo, config.STREAM_CHANNEL_ID);
    await addSentItems(streamsInfo, "streams");
    console.log("本日直播已儲存！");
    await sendMessage(
      client,
      config.STREAM_CHANNEL_ID,
      "本日新直播已成功抓取！",
    );
  } else {
    await sendMessage(client, config.STREAM_CHANNEL_ID, "爬蟲結束，無新直播");
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
        // 網址為404則移除該頻道
        if (response.status == 404) {
          const YTchannelID = new URL(url).pathname.replaceAll("/", "");
          await removeChannel(YTchannelID, type);
          await sendMessage(
            DCclient,
            config.VIDEO_CHANNEL_ID,
            `移除頻道: ${fetchUrl}`,
          );
          return { type: type, error: true, url: fetchUrl };
        }
        return { type: type, error: true, url: fetchUrl };
      }
    })
    .then((data) => {
      if (data?.error) return data;
      const $ = cheerio.load(data);
      const scriptElement = $("script").filter(function () {
        return /var ytInitialData =/.test($(this).html());
      });
      let jsonData = scriptElement.html().replace(/var ytInitialData =/, "");
      jsonData = jsonData.replace(/;/g, "");
      jsonData = JSON.parse(jsonData);

      let tabNums;
      switch (type) {
        case "videos":
          tabNums = 1;
          break;
        case "streams":
          tabNums = 3;
          break;
      }
      const channelID = jsonData.metadata.channelMetadataRenderer.ownerUrls[0]
        .split("/")
        .pop();
      const videos =
        jsonData.contents.twoColumnBrowseResultsRenderer.tabs[tabNums]
          .tabRenderer.content.richGridRenderer.contents;
      const streamTypes = ["upcoming", "live", "ended"];
      const catchNums = 5;

      let index = 0;
      for (let item of videos) {
        if (index == catchNums) break;
        index++;

        if (item.richItemRenderer !== undefined) {
          const videoJson = item.richItemRenderer.content.videoRenderer;
          if (!videoJson) continue;
          const videoId = videoJson.videoId;
          const videoTitle = videoJson.title.runs[0].text;
          const videoThumbnail = videoJson.thumbnail.thumbnails[0].fetchUrl;
          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          const peopleObj = videoJson.viewCountText;

          let videoPublishedTime = "";
          let videoDuration = "";
          let videoViewCount = "";
          let streamType = "";

          try {
            switch (type) {
              case "videos":
                videoPublishedTime =
                  videoJson.publishedTimeText?.simpleText || "";
                videoDuration = videoJson.lengthText?.simpleText || "";
                videoViewCount = peopleObj?.simpleText || "";
                break;

              case "streams":
                switch (
                  videoJson.thumbnailOverlays[0]
                    .thumbnailOverlayTimeStatusRenderer.style
                ) {
                  case "UPCOMING":
                    let startTime = videoJson.upcomingEventData.startTime;
                    videoPublishedTime = parseInt(startTime);
                    streamType = streamTypes[0];
                    break;
                  case "LIVE":
                    streamType = streamTypes[1];
                    videoViewCount =
                      videoJson.shortViewCountText?.runs?.[0]?.text ||
                      videoJson.shortViewCountText?.simpleText ||
                      "";
                    break;
                  case "DEFAULT":
                    videoPublishedTime =
                      videoJson.publishedTimeText?.simpleText || "";
                    videoDuration = videoJson.lengthText?.simpleText || "";
                    videoViewCount = peopleObj?.simpleText || "";
                    streamType = streamTypes[2];
                    break;
                }
            }
          } catch (error) {
            addErrorLog(error);
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
      }

      return {
        type: type,
        data: crawlerResults,
      };
    })
    .catch((error) => {
      addErrorLog(error);
      return { type: type, error: true, url: fetchUrl };
    });
}

// 匯出 execute 函數
export default execute;
