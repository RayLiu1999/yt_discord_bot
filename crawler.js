// const puppeteer = require("puppeteer");
const fs = require("fs");
const YT_domain = "https://www.youtube.com";

let type = ["videos", "streams", "community"];
let crawlerTypes = ['puppeteer', 'fetch'];

let crawlerType = crawlerTypes[1]; // puppeteer or fetch(目前為fetch)


async function execute() {
  // 讀取頻道清單
  let videosChannels = readFile("./videosChannels.json").data;
  let streamsChannels = readFile("./streamsChannels.json").data;

  // 判斷是否為新的一天
  const lastTime = readFile("./lastTime.json");

  const now = new Date();
  const last = new Date(lastTime.time);

  // 新的一天則清空已發送清單
  if (now.getDate() !== last.getDate()) {
    writeFile("./sendedVideos.json", JSON.stringify([]));
    writeFile("./sendedStreams.json", JSON.stringify([]));
  }

  // 更改最後更新時間
  lastTime.time = new Date().getTime();
  writeFile("./lastTime.json", JSON.stringify(lastTime));

  const sendedVideos = readFile("./sendedVideos.json");
  const sendedStreams = readFile("./sendedStreams.json");

  let videosInfo = [];
  let streamsInfo = [];
  let batchPromises = [];

  videosChannels.forEach((item) => {
    let url = YT_domain + "/" + item.channelId + "/";
    switch (crawlerType) {
      case 'puppeteer':
        batchPromises.push(puppeteerCrawler(url, item.channelId));
        break;
      case 'fetch':
        batchPromises.push(fetchCrawler(url, type[0], videosInfo, sendedVideos));
        break;
    }
  });

  streamsChannels.forEach((item) => {
    let url = YT_domain + "/" + item.channelId + "/";
    switch (crawlerType) {
      case 'puppeteer':
        batchPromises.push(puppeteerCrawler(url, item.channelId));
        break;
      case 'fetch':
        batchPromises.push(fetchCrawler(url, type[1], streamsInfo, sendedStreams));
        break;
    }
  });

  await Promise.all(batchPromises)
  .then(() => {
    // 寫入發送清單
    writeFile("./videos.json", JSON.stringify(videosInfo));
    writeFile("./streams.json", JSON.stringify(streamsInfo));

    // region 更新烤肉man時間
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    videosInfo.forEach(function (item1) {
      videosChannels.forEach(function (item2) {
        if (item1.channelId == item2.channelId) {
          item2.last_updated = `${year}/${month}/${day}`;
        }
      });
    });

    streamsInfo.forEach(function (item1) {
      streamsChannels.forEach(function (item2) {
        if (item1.channelId == item2.channelId) {
          item2.last_updated = `${year}/${month}/${day}`;
        }
      });
    });

    writeFile("./videosChannels.json", JSON.stringify({ data: videosChannels }));
    writeFile("./streamsChannels.json", JSON.stringify({ data: streamsChannels }));
    // endregion


    // 寫入已發送清單
    if (videosInfo.length > 0) {
      writeFile("./sendedVideos.json", JSON.stringify(sendedVideos.concat(videosInfo)));
      console.log("本日影片已儲存！");
    }
    
    if (streamsInfo.length > 0) {
      writeFile("./sendedStreams.json", JSON.stringify(sendedStreams.concat(streamsInfo)));
      console.log("本日直播已儲存！");
    }
  })
}


function puppeteerCrawler(url, channel, sendedVideos, videosInfo) {
  return new Promise(async (resolve, reject) => {

    let browser = await puppeteer.launch({ headless: true });
    let page = await browser.newPage();

    await delay(500);

    await page.setDefaultNavigationTimeout(30000);
    let res = await page.goto(url);

    if (!res.ok()) {
      throw new Error(`${channel}找不到頻道`);
    }

    // wait for page loading
    await delay(300);

    // get channel title
    let channelTitleHandle = await page.$("#text-container");
    
    // fet channel id
    let channelIdHandle = await page.$("#channel-handle");

    // wait for page loading
    await delay(300);

    if (channelTitleHandle === null || channelTitleHandle === undefined) {
      throw new Error(`${channel}頻道找不到標題`);
    }

    let channelTitle = await channelTitleHandle.evaluate(
      (el) => el.textContent
    );

    let channelId = await channelIdHandle.evaluate(
      (el) => el.textContent
    );

    let elementHandle = await page.$("#contents:first-child");
    
    // wait for page loading
    await delay(300);

    if (elementHandle === null || elementHandle === undefined) {
      throw new Error("找不到影片");
    }

    let element = await elementHandle.asElement();

    // wait for page loading
    await delay(300);

    let videos = await page.evaluate(
      (element, channelTitle, sendedVideos, channelId) => {
        let videos = element.querySelectorAll(".style-scope.ytd-rich-grid-row");
        let info = [];

        for (let video of videos) {
          let metadataLine = video.querySelector("#metadata-line");

          if (metadataLine === null || metadataLine === undefined) {
            continue;
          }

          let domInfo = metadataLine.textContent.replace(/\n|\s/g, "").split("次");
          let views = domInfo[1].split("：")[1];
          let time = domInfo[2];

          // 判斷是否已發送過
          if (sendedVideos.length > 0) {
            let isSended = false;
            for (let sendedVideo of sendedVideos) {
              if (sendedVideo.title == video.querySelector("#video-title").textContent) {
                isSended = true;
                continue;
              }
            }

            if (isSended) {
              continue;
            }
          }

          if (!checkTime(videoPublishedTime)) continue; // 判斷影片是否今天發佈，不是則跳過

          // 加入清單
          info.push({
            title: video.querySelector("#video-title").textContent,
            link: video.querySelector("#video-title-link").href,
            pic: video.querySelector("yt-image img").src,
            time: video 
              .querySelector("#overlays")
              .textContent.replace(/\n|\s/g, ""),
            views: views,
            date: time,
            channel: channelTitle.replace(/\n|\s/g, ""),
            channelId: channelId
          });
        }
        return info;
      },
      element,
      channelTitle,
      sendedVideos,
      channelId
    );

    videosInfo.push(...videos);

    await browser.close();
    
    resolve();
  });
}


function fetchCrawler(url, type, videosInfo, sendedVideos) {
  return new Promise((resolve, reject) => {
    const cheerio = require('cheerio');
    url = `${url}${type}`;

    fetch(url, {
      method: "GET",
    })
      .then((response) => {
        if (response.ok) {
          return response.text();
        } else {
          throw new Error("Something went wrong ...");
        }
      })
      .then((data) => {
        const $ = cheerio.load(data); // 載入 body
        const scriptElement = $('script').filter(function() {
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
        const channelID = jsonData.metadata.channelMetadataRenderer.ownerUrls[0].split('/').pop();
        const videos = jsonData.contents.twoColumnBrowseResultsRenderer.tabs[tabNums].tabRenderer.content.richGridRenderer.contents;
        const stremTypes = ['upcoming','live', 'ended']; // 直播類型：upcoming: 預定發布直播，live: 直播中，ended: 直播結束
        const catchNums = 5; // 每次抓影片數量

        let index = 0;
        for (let item of videos) {
          if (index == catchNums) break;
          index++;

          if (item.richItemRenderer !== undefined) {
            const videoJson = item.richItemRenderer.content.videoRenderer;
            const videoId = videoJson.videoId;
            const videoTitle = videoJson.title.runs[0].text;
            const videoThumbnail = videoJson.thumbnail.thumbnails[0].url;
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
                  switch (videoJson.thumbnailOverlays[0].thumbnailOverlayTimeStatusRenderer.style) {
                    // 預定發布直播
                    case 'UPCOMING':
                      let startTime = videoJson.upcomingEventData.startTime;
                      videoPublishedTime = parseInt(startTime);
                      streamType = stremTypes[0];
                      break;
                    // 直播中
                    case 'LIVE':
                      streamType = stremTypes[1];
                      videoViewCount = videoJson.shortViewCountText.runs[0].text;
                      break;
                    // 直播結束
                    case 'DEFAULT':
                      videoPublishedTime = videoJson.publishedTimeText.simpleText;
                      videoDuration = videoJson.lengthText.simpleText;
                      videoViewCount = peopleObj.simpleText;
                      streamType = stremTypes[2];
                      break;
                  }
              }

            }
            catch (error) {
              console.error(error);
              writeFile('error.json', JSON.stringify(videoJson));
            }

            // 判斷是否已發送過
            if (checkIsSended(sendedVideos, videoId)) {
              continue;
            }

            if (!checkTime(videoPublishedTime || (new Date() / 1000))) continue; // 判斷影片是否今天發佈，不是則跳過
            
            videosInfo.push({
              id: videoId,
              title: videoTitle,
              link: videoUrl,
              pic: videoThumbnail,
              time: videoPublishedTime || '直播中',
              duration: videoDuration || '無',
              views: videoViewCount,
              channelId: channelID
            });
          }
        };

        resolve();
    })
    .catch((error) => console.error(error));
  });
}

function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

// 判斷影片是否今天發佈，不是則跳過
function checkTime(time) {
  const now = new Date();
  let timeDiff = '';

  if (isNaN(time)) {
    // if (time.includes('天前') || time.includes('day')) {
    //   return false;
    // }
    if (time.includes('小時前') || time.includes('hour')) {
      time = time.replace(/[^0-9]/g, '');
      timeDiff = parseInt(time);
    }
    else if (time.includes('分鐘前') || time.includes('minute')) {
      time = time.replace(/[^0-9]/g, '');
      timeDiff = parseInt(time) / 60;
    }
    else if (time.includes('秒前') || time.includes('second')) {
      time = time.replace(/[^0-9]/g, '');
      timeDiff = parseInt(time) / 3600;
    }
    else {
      return false;
    }
  }
  else {
    date = new Date(parseInt(time) * 1000);
    if (date.getDate() !== now.getDate()) {
      return false;
    }
  }

  if (timeDiff != '') {
    const publishTime = new Date(now.getTime() - timeDiff * 60 * 60 * 1000);
    if (publishTime.getDate() !== now.getDate()) {
      return false;
    }
  }

  return true;
}

function readFile(file) {
  delete require.cache[require.resolve(file)];

  if (!fs.existsSync(file)) {
    return [];
  }

  let data = fs.readFileSync(file, 'utf8');

  if (!data) {
    return [];
  }

  try {
    return JSON.parse(data);
  } catch (error) {
    console.error(error);
    return [];
  }
}

function writeFile(file, data) {
  fs.writeFile(file, data, (err) => {
    if (err) throw err;
  });
}

function checkIsSended(sendedVideos, videoId) {
  for (let sendedVideo of sendedVideos) {
    if (sendedVideo.id == videoId) {
      return true;
    }
  }

  return false;
}

module.exports = execute;