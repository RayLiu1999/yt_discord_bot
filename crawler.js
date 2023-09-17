// const puppeteer = require("puppeteer");
const fs = require("fs");
const YT_domain = "https://www.youtube.com";

let type = ["videos", "streams", "community"];
let crawlerTypes = ['puppeteer', 'fetch'];

let crawlerType = crawlerTypes[1]; // puppeteer or fetch(目前為fetch)


async function execute() {
  // 讀取頻道清單
  delete require.cache[require.resolve("./channels.json")];
  let channels = require("./channels.json").data;
  let channelIds = [];

  channels.forEach(function (item) {
    channelIds.push(item.channelId);
  });

  // 判斷是否為新的一天
  delete require.cache[require.resolve("./lastTime.json")];
  const lastTime = require("./lastTime.json");

  const now = new Date();
  const last = new Date(lastTime.time);

  // 新的一天則清空已發送清單
  if (now.getDate() !== last.getDate()) {
    fs.writeFileSync("./sendedVideos.json", JSON.stringify([]));
  }

  // 更改最後更新時間
  lastTime.time = new Date().getTime();
  fs.writeFileSync("./lastTime.json", JSON.stringify(lastTime));

  delete require.cache[require.resolve("./sendedVideos.json")];
  const sendedVideos = require("./sendedVideos.json");

  let videosInfo = [];
  let batchPromises = [];

  channelIds.forEach((channel) => {
    let url = YT_domain + "/" + channel + "/" + type[0];

    switch (crawlerType) {
      case 'puppeteer':
        batchPromises.push(puppeteerCrawler(url, channel, sendedVideos, videosInfo));
        break;
      case 'fetch':
        batchPromises.push(fetchCrawler(url, videosInfo, sendedVideos));
        break;
    }
  });

  await Promise.all(batchPromises)
  .then(() => {
    // 寫入發送清單
    fs.writeFile("./videos.json", JSON.stringify(videosInfo), (err) => {
      if (err) throw err;
    });
    

    // 更新烤肉man時間
    let sendedBbqMans = [];
    for (let video of videosInfo) {
      if (!sendedBbqMans.includes(video.channelId)) {
        sendedBbqMans.push(video.channelId);
      }
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    channels.forEach(function (item) {
      if (sendedBbqMans.includes(item.channelId)) {
        item.last_updated = `${year}/${month}/${day}`;
      }
    });

    fs.writeFile("./channels.json", JSON.stringify({ data: channels }), (err) => {
      if (err) throw err;
    });


    // 寫入已發送清單
    if (videosInfo.length > 0) {
      fs.writeFile("./sendedVideos.json", JSON.stringify(sendedVideos.concat(videosInfo)), (err) => {
        if (err) throw err;
      });
      console.log("本日影片已儲存！");
    }
  })
}


function puppeteerCrawler(url, channel, sendedVideos, videosInfo)
{
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


function fetchCrawler(url, videosInfo, sendedVideos)
{
  return new Promise((resolve, reject) => {
    const cheerio = require('cheerio');

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
        const $ = cheerio.load(data);

        const scriptElement = $('script').filter(function() {
          return /var ytInitialData =/.test($(this).html());
        });

        let jsonData = scriptElement.html().replace(/var ytInitialData =/, '');
        jsonData = jsonData.replace(/;/g, '');
        jsonData = JSON.parse(jsonData);

        const videos = jsonData.contents.twoColumnBrowseResultsRenderer.tabs[1].tabRenderer.content.richGridRenderer.contents;
        const channelID = jsonData.metadata.channelMetadataRenderer.ownerUrls[0].split('/').pop();

        let index = 0;
        for (let item of videos) {
          index++;
          if (index == 3) break;

          if (item.richItemRenderer !== undefined) {
            let videoId = item.richItemRenderer.content.videoRenderer.videoId;
            let videoTitle = item.richItemRenderer.content.videoRenderer.title.runs[0].text;
            let videoThumbnail = item.richItemRenderer.content.videoRenderer.thumbnail.thumbnails[0].url;
            let videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            let videoPublishedTime = item.richItemRenderer.content.videoRenderer.publishedTimeText.simpleText;
            let videoDuration = item.richItemRenderer.content.videoRenderer.lengthText.simpleText;
            let videoViewCount = item.richItemRenderer.content.videoRenderer.viewCountText.simpleText;

            // 判斷是否已發送過
            if (sendedVideos.length > 0) {
              let isSended = false;
              for (let sendedVideo of sendedVideos) {
                if (sendedVideo.id == videoId) {
                  isSended = true;
                  continue;
                }
              }

              if (isSended) {
                continue;
              }
            }

            if (!checkTime(videoPublishedTime)) continue; // 判斷影片是否今天發佈，不是則跳過

            videosInfo.push({
              id: videoId,
              title: videoTitle,
              link: videoUrl,
              pic: videoThumbnail,
              time: videoPublishedTime,
              views: videoViewCount,
              date: videoDuration,
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
  let timeDiff;

  if (time.includes('hours')) {
    timeDiff = parseInt(time);
  }
  else if (time.includes('minutes')) {
    timeDiff = parseInt(time) / 60;
  }
  else if (time.includes('seconds')) {
    timeDiff = parseInt(time) / 3600;
  }

  const publishTime = new Date(now.getTime() - timeDiff * 60 * 60 * 1000);

  if (publishTime.getDate() !== now.getDate()) {
    return false;
  }

  return true;
}

module.exports = execute;