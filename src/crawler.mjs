import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

import {
  checkIsSended,
  checkTime,
  delay,
  readFileSync,
  writeFileSync,
  sendMessage,
  removeYTChannel,
} from '#src/functions';
import { logger } from '#src/logger';
import { CONSTANTS } from '#src/constants';
import config from '#src/config';
import { rootDir } from '#src/path';

const YT_domain = 'https://www.youtube.com';
const type = ['videos', 'streams', 'community'];
let DCclient;

async function execute(client) {
  DCclient = client;

  await logger.info('開始爬蟲任務');

  // 讀取頻道清單
  let videosChannels = readFileSync(`${rootDir}/${CONSTANTS.FILES.VIDEOS_CHANNELS}`).data || [];
  let streamsChannels = readFileSync(`${rootDir}/${CONSTANTS.FILES.STREAMS_CHANNELS}`).data || [];

  if (videosChannels.length === 0) {
    await sendMessage(client, config.VIDEO_CHANNEL_ID, CONSTANTS.INFO.EMPTY_VIDEOS_CHANNELS);
    return;
  }

  if (streamsChannels.length === 0) {
    await sendMessage(client, config.STREAM_CHANNEL_ID, CONSTANTS.INFO.EMPTY_STREAMS_CHANNELS);
  }

  // 判斷是否為新的一天
  const lastTime = readFileSync(`${rootDir}/${CONSTANTS.FILES.LAST_TIME}`);

  const now = new Date();
  const last = new Date(lastTime.time);

  // 新的一天則清空已發送清單
  if (now.getDate() !== last.getDate()) {
    writeFileSync(`${rootDir}/${CONSTANTS.FILES.SENDED_VIDEOS}`, JSON.stringify([]));
    writeFileSync(`${rootDir}/${CONSTANTS.FILES.SENDED_STREAMS}`, JSON.stringify([]));
    await logger.info('新的一天，已清空發送記錄');
  }

  // 更改最後更新時間
  writeFileSync(`${rootDir}/${CONSTANTS.FILES.LAST_TIME}`, JSON.stringify({ time: new Date().getTime() }));

  const sendedVideos = readFileSync(`${rootDir}/${CONSTANTS.FILES.SENDED_VIDEOS}`) || [];
  const sendedStreams = readFileSync(`${rootDir}/${CONSTANTS.FILES.SENDED_STREAMS}`) || [];

  let batchPromises = [];

  // 處理影片頻道
  videosChannels.forEach((item) => {
    const url = CONSTANTS.YOUTUBE.DOMAIN + '/' + item.channelId + '/';
    switch (config.CRAWLER_TYPE) {
      case 'puppeteer':
        batchPromises.push(puppeteerCrawler(url, item.channelId));
        break;
      case 'fetch':
        batchPromises.push(
          fetchCrawler(url, type[0], sendedVideos)
        );
        break;
    }
  });

  // 處理直播頻道
  streamsChannels.forEach((item) => {
    const url = CONSTANTS.YOUTUBE.DOMAIN + '/' + item.channelId + '/';
    switch (config.CRAWLER_TYPE) {
      case 'puppeteer':
        batchPromises.push(puppeteerCrawler(url, item.channelId));
        break;
      case 'fetch':
        batchPromises.push(
          fetchCrawler(url, type[1], sendedStreams)
        );
        break;
    }
  });

  // 處理所有Promise並整理結果
  let videosInfo = [];
  let streamsInfo = [];
  
  await Promise.all(batchPromises).then(async (results) => {
    results.forEach((result) => {
      if (!result) return; // 跳過失敗的請求
      
      switch (result.type) {
        case 'videos':
          videosInfo.push(...result.data);
          break;
        case 'streams':
          streamsInfo.push(...result.data);
          break;
      }
    });

    // 寫入發送清單
    writeFileSync(`${rootDir}/${CONSTANTS.FILES.VIDEOS}`, JSON.stringify(videosInfo));
    writeFileSync(`${rootDir}/${CONSTANTS.FILES.STREAMS}`, JSON.stringify(streamsInfo));

    await logger.info('爬蟲結果', { 
      videosCount: videosInfo.length, 
      streamsCount: streamsInfo.length 
    });

    // 更新頻道最後更新時間
    const now = new Date();
    const dateStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;

    // 重新讀取頻道清單以確保數據一致性
    videosChannels = readFileSync(`${rootDir}/${CONSTANTS.FILES.VIDEOS_CHANNELS}`).data || [];
    videosInfo.forEach(function (item1) {
      videosChannels.forEach(function (item2) {
        if (item1.channelId == item2.channelId) {
          item2.last_updated = dateStr;
        }
      });
    });

    streamsChannels = readFileSync(`${rootDir}/${CONSTANTS.FILES.STREAMS_CHANNELS}`).data || [];
    streamsInfo.forEach(function (item1) {
      streamsChannels.forEach(function (item2) {
        if (item1.channelId == item2.channelId) {
          item2.last_updated = dateStr;
        }
      });
    });

    writeFileSync(
      `${rootDir}/${CONSTANTS.FILES.VIDEOS_CHANNELS}`,
      JSON.stringify({ data: videosChannels })
    );

    writeFileSync(
      `${rootDir}/${CONSTANTS.FILES.STREAMS_CHANNELS}`,
      JSON.stringify({ data: streamsChannels })
    );

    // 更新已發送清單
    if (videosInfo.length > 0) {
      writeFileSync(
        `${rootDir}/${CONSTANTS.FILES.SENDED_VIDEOS}`,
        JSON.stringify(sendedVideos.concat(videosInfo))
      );
      await logger.info('新影片已儲存', { count: videosInfo.length });
      await sendMessage(client, config.VIDEO_CHANNEL_ID, CONSTANTS.SUCCESS.CRAWLER_SUCCESS_VIDEOS);
    } else {
      await sendMessage(client, config.VIDEO_CHANNEL_ID, CONSTANTS.INFO.NO_NEW_VIDEOS);
    }

    if (streamsInfo.length > 0) {
      writeFileSync(
        `${rootDir}/${CONSTANTS.FILES.SENDED_STREAMS}`,
        JSON.stringify(sendedStreams.concat(streamsInfo))
      );
      await logger.info('新直播已儲存', { count: streamsInfo.length });
      await sendMessage(client, config.STREAM_CHANNEL_ID, CONSTANTS.SUCCESS.CRAWLER_SUCCESS_STREAMS);
    } else {
      await sendMessage(client, config.STREAM_CHANNEL_ID, CONSTANTS.INFO.NO_NEW_STREAMS);
    }
  });

  await logger.info('爬蟲任務完成');
}

async function fetchCrawler(url, type, sendedVideosOrStreams) {
  const fetchUrl = `${url}${type}`;
  let crawlerResults = [];

  try {
    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': CONSTANTS.YOUTUBE.USER_AGENT,
        'Accept-Language': CONSTANTS.YOUTUBE.ACCEPT_LANGUAGE
      }
    });

    if (!response.ok) {
      // 網址為404則移除該頻道
      if (response.status === 404) {
        const YTchannelID = new URL(url).pathname.replaceAll('/', '');
        await removeYTChannel(type, YTchannelID);
        await sendMessage(DCclient, config.VIDEO_CHANNEL_ID, `移除無效頻道: ${fetchUrl}`);
        await logger.warn('移除無效頻道', { channelId: YTchannelID, url: fetchUrl, status: response.status });
        return null;
      }
      
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.text();
    const $ = cheerio.load(data);
    
    // 尋找包含 ytInitialData 的 script 標籤
    const scriptElement = $('script').filter(function () {
      return /var ytInitialData =/.test($(this).html());
    });

    if (scriptElement.length === 0) {
      throw new Error('找不到 ytInitialData 腳本');
    }

    let jsonData = scriptElement.html().replace(/var ytInitialData =/, '');
    jsonData = jsonData.replace(/;/g, '');
    jsonData = JSON.parse(jsonData);

    // 確定影片或直播的tab位置
    let tabNums;
    switch (type) {
      case 'videos':
        tabNums = 1;
        break;
      case 'streams':
        tabNums = 3;
        break;
      default:
        throw new Error(`不支援的內容類型: ${type}`);
    }

    // 獲取頻道資訊
    const channelID = jsonData.metadata?.channelMetadataRenderer?.ownerUrls?.[0]?.split('/').pop();
    if (!channelID) {
      throw new Error('無法獲取頻道ID');
    }

    // 獲取影片/直播列表
    const videos = jsonData.contents?.twoColumnBrowseResultsRenderer?.tabs?.[tabNums]
      ?.tabRenderer?.content?.richGridRenderer?.contents;
    
    if (!videos) {
      throw new Error('無法獲取影片列表');
    }

    const streamTypes = ['upcoming', 'live', 'ended'];
    let index = 0;

    for (let item of videos) {
      if (index >= CONSTANTS.CRAWLER.VIDEOS_PER_BATCH) break;
      index++;

      if (!item.richItemRenderer) continue;

      const videoJson = item.richItemRenderer.content.videoRenderer;
      if (!videoJson) continue;

      const videoId = videoJson.videoId;
      const videoTitle = videoJson.title?.runs?.[0]?.text;
      const videoThumbnail = videoJson.thumbnail?.thumbnails?.[0]?.url;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      if (!videoId || !videoTitle) continue;

      // 檢查是否已發送過
      if (checkIsSended(sendedVideosOrStreams, videoId)) {
        continue;
      }

      let videoPublishedTime = '';
      let videoDuration = '';
      let videoViewCount = '';
      let streamType = '';

      try {
        switch (type) {
          case 'videos':
            videoPublishedTime = videoJson.publishedTimeText?.simpleText || '';
            videoDuration = videoJson.lengthText?.simpleText || '';
            videoViewCount = videoJson.viewCountText?.simpleText || '';
            break;

          case 'streams':
            const overlayStyle = videoJson.thumbnailOverlays?.[0]
              ?.thumbnailOverlayTimeStatusRenderer?.style;
            
            switch (overlayStyle) {
              case 'UPCOMING':
                videoPublishedTime = parseInt(videoJson.upcomingEventData?.startTime || 0);
                streamType = streamTypes[0];
                break;
              case 'LIVE':
                streamType = streamTypes[1];
                videoViewCount = videoJson.shortViewCountText?.runs?.[0]?.text || '';
                break;
              case 'DEFAULT':
                videoPublishedTime = videoJson.publishedTimeText?.simpleText || '';
                videoDuration = videoJson.lengthText?.simpleText || '';
                videoViewCount = videoJson.viewCountText?.simpleText || '';
                streamType = streamTypes[2];
                break;
            }
            break;
        }
      } catch (parseError) {
        await logger.warn('解析影片資訊時發生錯誤', { 
          videoId, 
          error: parseError.message 
        });
      }

      // 檢查影片是否為今天發布
      if (!checkTime(videoPublishedTime || new Date() / 1000)) {
        continue;
      }

      crawlerResults.push({
        id: videoId,
        title: videoTitle,
        link: videoUrl,
        pic: videoThumbnail,
        time: videoPublishedTime || (streamType === 'live' ? '直播中' : ''),
        duration: videoDuration || '無',
        views: videoViewCount || '',
        channelId: channelID,
        streamType: streamType
      });
    }

    await logger.debug('爬蟲完成', { 
      type, 
      channelId: channelID, 
      resultCount: crawlerResults.length 
    });

    return {
      type: type,
      data: crawlerResults,
    };

  } catch (error) {
    await logger.error('爬蟲失敗', { 
      url: fetchUrl, 
      type, 
      error: error.message 
    });
    return null;
  }
}

// 棄用
// function puppeteerCrawler(url, channel, sendedVideos, videosInfo) {
//   return new Promise(async (resolve, reject) => {
//     let browser = await puppeteer.launch({ headless: true });
//     let page = await browser.newPage();

//     await delay(500);

//     await page.setDefaultNavigationTimeout(30000);
//     let res = await page.goto(url);

//     if (!res.ok()) {
//       throw new Error(`${channel}找不到頻道`);
//     }

//     // wait for page loading
//     await delay(300);

//     // get channel title
//     let channelTitleHandle = await page.$('#text-container');

//     // fet channel id
//     let channelIdHandle = await page.$('#channel-handle');

//     // wait for page loading
//     await delay(300);

//     if (channelTitleHandle === null || channelTitleHandle === undefined) {
//       throw new Error(`${channel}頻道找不到標題`);
//     }

//     let channelTitle = await channelTitleHandle.evaluate(
//       (el) => el.textContent
//     );

//     let channelId = await channelIdHandle.evaluate((el) => el.textContent);

//     let elementHandle = await page.$('#contents:first-child');

//     // wait for page loading
//     await delay(300);

//     if (elementHandle === null || elementHandle === undefined) {
//       throw new Error('找不到影片');
//     }

//     let element = await elementHandle.asElement();

//     // wait for page loading
//     await delay(300);

//     let videos = await page.evaluate(
//       (element, channelTitle, sendedVideos, channelId) => {
//         let videos = element.querySelectorAll('.style-scope.ytd-rich-grid-row');
//         let info = [];

//         for (let video of videos) {
//           let metadataLine = video.querySelector('#metadata-line');

//           if (metadataLine === null || metadataLine === undefined) {
//             continue;
//           }

//           let domInfo = metadataLine.textContent
//             .replace(/\n|\s/g, '')
//             .split('次');
//           let views = domInfo[1].split('：')[1];
//           let time = domInfo[2];

//           // 判斷是否已發送過
//           if (sendedVideos.length > 0) {
//             let isSended = false;
//             for (let sendedVideo of sendedVideos) {
//               if (
//                 sendedVideo.title ==
//                 video.querySelector('#video-title').textContent
//               ) {
//                 isSended = true;
//                 continue;
//               }
//             }

//             if (isSended) {
//               continue;
//             }
//           }

//           if (!checkTime(videoPublishedTime)) continue; // 判斷影片是否今天發佈，不是則跳過

//           // 加入清單
//           info.push({
//             title: video.querySelector('#video-title').textContent,
//             link: video.querySelector('#video-title-link').href,
//             pic: video.querySelector('yt-image img').src,
//             time: video
//               .querySelector('#overlays')
//               .textContent.replace(/\n|\s/g, ''),
//             views: views,
//             date: time,
//             channel: channelTitle.replace(/\n|\s/g, ''),
//             channelId: channelId,
//           });
//         }
//         return info;
//       },
//       element,
//       channelTitle,
//       sendedVideos,
//       channelId
//     );

//     videosInfo.push(...videos);

//     await browser.close();

//     resolve();
//   });
// }

// 匯出 execute 函數
export default execute;
