const puppeteer = require("puppeteer");
const fs = require("fs");

delete require.cache[require.resolve("./channels.json")];
let channels = require("./channels.json").data;
let bbqChannelIds = [];
channels.forEach(function (item) {
  bbqChannelIds.push(item.channelId);
});

const YT_domain = "https://www.youtube.com";

let type = ["videos", "streams", "community"];


async function execute() {
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
  let promises = [];

  for (let i = 0; i < bbqChannelIds.length; i += 4) {
    let batch = bbqChannelIds.slice(i, i + 4);

    let batchPromises = [];

    for (let channel of batch) {
      let url = YT_domain + "/" + channel + "/" + type[0];
      let browser = await puppeteer.launch({ headless: true });
      let page = await browser.newPage();

      await delay(500);

      await page.setDefaultNavigationTimeout(30000);
      await page.goto(url);

      const status = await page.evaluate(() => document.readyState);
      if (status !== "complete") {
        throw new Error("找不到頻道");
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
        throw new Error("找不到頻道");
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

            // 判斷影片是否今天發佈，不是則跳過
            const now = new Date();
            let timeDiff;

            if (time.includes('時')) {
              timeDiff = parseInt(time);
            }
            else if (time.includes('分')) {
              timeDiff = parseInt(time) / 60;
            }
            else if (time.includes('秒')) {
              timeDiff = parseInt(time) / 3600;
            }

            const publishTime = new Date(now.getTime() - timeDiff * 60 * 60 * 1000);

            if (publishTime.getDate() !== now.getDate()) {
              continue;
            }

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

      await delay(300);

      batchPromises.push(Promise.resolve());
    }
    
    promises.push(Promise.all(batchPromises));
  }

  await Promise.all(promises)
  .then((results) => {
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
      return results.flat();
    })
}

function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

module.exports = execute;
