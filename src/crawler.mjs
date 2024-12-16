import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

import {
  checkIsSended,
  checkTime,
  delay,
  readFile,
  writeFile,
  addErrorLog,
  sendMessage,
  removeYTChannel,
} from '#src/functions';
import config from '#src/config';
import { rootDir } from '#src/path';

const YT_domain = 'https://www.youtube.com';
const type = ['videos', 'streams', 'community'];
let DCclient;

async function execute(client) {
  DCclient = client;

  console.log('開始爬蟲...');

  // 讀取頻道清單
  let videosChannels = readFile(`${rootDir}/videosChannels.json`).data || [];
  let streamsChannels = readFile(`${rootDir}/streamsChannels.json`).data || [];

  if (videosChannels.length === 0) {
    await sendMessage(client, config.VIDEO_CHANNEL_ID, '影片頻道清單為空');
    return;
  }

  if (streamsChannels.length === 0) {
    await sendMessage(client, config.STREAM_CHANNEL_ID, '直播頻道清單為空');
  }

  // 判斷是否為新的一天
  const lastTime = readFile(`${rootDir}/lastTime.json`);

  const now = new Date();
  const last = new Date(lastTime.time);

  // 新的一天則清空已發送清單
  if (now.getDate() !== last.getDate()) {
    writeFile(`${rootDir}/sendedVideos.json`, JSON.stringify([]));
    writeFile(`${rootDir}/sendedStreams.json`, JSON.stringify([]));
  }

  // 更改最後更新時間
  writeFile(`${rootDir}/lastTime.json`, JSON.stringify({ time: new Date().getTime() }));

  const sendedVideos = readFile(`${rootDir}/sendedVideos.json`) || [];
  const sendedStreams = readFile(`${rootDir}/sendedStreams.json`) || [];

  let videosInfo = [];
  let streamsInfo = [];
  let batchPromises = [];

  videosChannels.forEach((item) => {
    const url = YT_domain + '/' + item.channelId + '/';
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

  streamsChannels.forEach((item) => {
    const url = YT_domain + '/' + item.channelId + '/';
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

  // 處理所有Promise
  await Promise.all(batchPromises).then(async (results) => {
    results.forEach((result) => {
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
    writeFile(`${rootDir}/videos.json`, JSON.stringify(videosInfo));
    writeFile(`${rootDir}/streams.json`, JSON.stringify(streamsInfo));

    // #region 更新YT頻道更新時間
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    videosChannels = readFile(`${rootDir}/videosChannels.json`).data || []; // 重撈清單
    videosInfo.forEach(function (item1) {
      videosChannels.forEach(function (item2) {
        if (item1.channelId == item2.channelId) {
          item2.last_updated = `${year}/${month}/${day}`;
        }
      });
    });

    streamsChannels = readFile(`${rootDir}/streamsChannels.json`).data || []; // 重撈清單
    streamsInfo.forEach(function (item1) {
      streamsChannels.forEach(function (item2) {
        if (item1.channelId == item2.channelId) {
          item2.last_updated = `${year}/${month}/${day}`;
        }
      });
    });

    writeFile(
      `${rootDir}/videosChannels.json`,
      JSON.stringify({ data: videosChannels })
    );

    writeFile(
      `${rootDir}/streamsChannels.json`,
      JSON.stringify({ data: streamsChannels })
    );
    // #endregion

    // 寫入已發送清單
    if (videosInfo.length > 0) {
      writeFile(
        `${rootDir}/sendedVideos.json`,
        JSON.stringify(sendedVideos.concat(videosInfo))
      );
      console.log('本日影片已儲存！');
      await sendMessage(client, config.VIDEO_CHANNEL_ID, '本日新影片已成功抓取！');
    }
    else {
      await sendMessage(client, config.VIDEO_CHANNEL_ID, '爬蟲結束，無新影片');
    }

    if (streamsInfo.length > 0) {
      writeFile(
        `${rootDir}/sendedStreams.json`,
        JSON.stringify(sendedStreams.concat(streamsInfo))
      );
      console.log('本日直播已儲存！');
      await sendMessage(client, config.STREAM_CHANNEL_ID, '本日新直播已成功抓取！');
    }
    else {
      await sendMessage(client, config.STREAM_CHANNEL_ID, '爬蟲結束，無新直播');
    }
  });

  console.log('爬蟲結束！');
}

async function fetchCrawler(url, type, sendedVideosOrStreams) {
  const fetchUrl = `${url}${type}`;
  let crawlerResults = [];

  return fetch(fetchUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-TW,zh;q=0.9'
  }
  })
    .then(async (response) => {
      if (response.ok) {
        return response.text();
      } else {
        // 網址為404則移除該頻道
        if (response.status == 404) {
          const YTchannelID = new URL(url).pathname.replaceAll('/', '');
          removeYTChannel(type, YTchannelID);
          await sendMessage(DCclient, config.VIDEO_CHANNEL_ID, `移除頻道: ${fetchUrl}`);
          return;
        }
      }
    })
    .then((data) => {
      const $ = cheerio.load(data); // 載入 body
      const scriptElement = $('script').filter(function () {
        return /var ytInitialData =/.test($(this).html());
      }); // 取得ytInitialData
      let jsonData = scriptElement.html().replace(/var ytInitialData =/, ''); // 取得ytInitialData的json資料
      jsonData = jsonData.replace(/;/g, '');
      jsonData = JSON.parse(jsonData);

      let tabNums; // 影片或直播的tab位置
      switch (type) {
        case 'videos':
          tabNums = 1;
          break;
        case 'streams':
          tabNums = 3;
          break;
      }
      const channelID = jsonData.metadata.channelMetadataRenderer.ownerUrls[0]
        .split('/')
        .pop();
      const videos =
        jsonData.contents.twoColumnBrowseResultsRenderer.tabs[tabNums]
          .tabRenderer.content.richGridRenderer.contents;
      const streamTypes = ['upcoming', 'live', 'ended']; // 直播類型：upcoming: 預定發布直播，live: 直播中，ended: 直播結束
      const catchNums = 5; // 每次抓影片數量

      let index = 0;
      for (let item of videos) {
        if (index == catchNums) break;
        index++;

        if (item.richItemRenderer !== undefined) {
          const videoJson = item.richItemRenderer.content.videoRenderer;
          const videoId = videoJson.videoId;
          const videoTitle = videoJson.title.runs[0].text;
          const videoThumbnail = videoJson.thumbnail.thumbnails[0].fetchUrl;
          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          const peopleObj = videoJson.viewCountText; // 人數資料暫存

          let videoPublishedTime = ''; // 發佈時間(影片或是直播結束才有)
          let videoDuration = ''; // 影片長度
          let videoViewCount = ''; // 觀看人數
          let streamType = ''; // 直播類型

          try {
            switch (type) {
              // 影片
              case 'videos':
                videoPublishedTime = videoJson.publishedTimeText.simpleText;
                videoDuration = videoJson.lengthText.simpleText;
                videoViewCount = peopleObj.simpleText;
                break;

              // 直播
              case 'streams':
                // 判斷直播類型
                switch (
                  videoJson.thumbnailOverlays[0]
                    .thumbnailOverlayTimeStatusRenderer.style
                ) {
                  // 預定發布直播
                  case 'UPCOMING':
                    let startTime = videoJson.upcomingEventData.startTime;
                    videoPublishedTime = parseInt(startTime);
                    streamType = streamTypes[0];
                    break;
                  // 直播中
                  case 'LIVE':
                    streamType = streamTypes[1];
                    videoViewCount = videoJson.shortViewCountText.runs[0].text;
                    break;
                  // 直播結束
                  case 'DEFAULT':
                    videoPublishedTime = videoJson.publishedTimeText.simpleText;
                    videoDuration = videoJson.lengthText.simpleText;
                    videoViewCount = peopleObj.simpleText;
                    streamType = streamTypes[2];
                    break;
                }
            }
          } catch (error) {
            addErrorLog(error);
          }

          // 判斷是否已發送過
          if (checkIsSended(sendedVideosOrStreams, videoId)) {
            continue;
          }

          if (!checkTime(videoPublishedTime || new Date() / 1000)) continue; // 判斷影片是否今天發佈，不是則跳過

          crawlerResults.push({
            id: videoId,
            title: videoTitle,
            link: videoUrl,
            pic: videoThumbnail,
            time: videoPublishedTime || '直播中',
            duration: videoDuration || '無',
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
    .catch((error) => addErrorLog(error));
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
