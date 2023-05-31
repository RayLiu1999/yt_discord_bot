const puppeteer = require('puppeteer');
const fs = require('fs');

let YT_domain = 'https://www.youtube.com';

let YT_channels = [
  '@hololive4579',
  '@LittleKumaTranslation',
  '@idolgun',
  '@holocooking4649',
  '@KOBA-Traslation',
  '@WhiteVegetable',
  '@oojimateru'
  // '@ShirakamiFubuki',
  // '@MurasakiShion',
  // '@NakiriAyame',
];

let type = [
  'videos',
  'streams',
  'community'
];

let url = YT_domain + '/' + YT_channels[0] + '/' + type[0];
// let url = 'https://google.com';

(async () => {
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();

  await page.goto(url);

  //const element = await page.waitForSelector('#contents:first-child');

  // const element = await page.evaluate(() => {
  //   const element = document.querySelector('#contents:first-child');
  //   return element;
  // });
  
  // get channel title
  const channelTitleHandle = await page.$('#text-container');
  const channelTitle = await channelTitleHandle.evaluate((el) => el.textContent);

  const elementHandle = await page.$('#contents:first-child');
  const element = await elementHandle.asElement();
  let videosInfo = await page.evaluate((element) => {
    let info = [];
    const videos = element.querySelectorAll('.style-scope.ytd-rich-grid-row');
    
    videos.forEach((video) => {
      info.push({
        title: video.querySelector('#video-title').textContent,
        link: video.querySelector('#video-title-link').href,
        pic: video.querySelector('yt-image').querySelector('img').src,
        time: video.querySelector('#overlays').textContent.replace(/\n|\s/g, ''),
        views: video.querySelector('#metadata-line').textContent.replace(/\n|\s/g, ''),
        channel: channelTitle,
      });
    });
    return info;
  }, element);
  

  // console.log(element.tagName);

  // const textContent = await element.getProperty('textContent');

  // const text = await textContent.jsonValue();

  // console.log(text);

  // console.log(await element.waitForSelector('#content'));


  // const latestVideo = await page.evaluate(() => {
  //   // get body
    
  //   return body;


  //   const videoElement = document.querySelector('#video-title-link');
  //   return videoElement;
  //   const title = videoElement.querySelector('#video-title').textContent;
  //   const link = videoElement.querySelector('#video-title').href;
  //   return { title, link };
  // });

  // console.log(url);
  // console.log(latestVideo);

  await browser.close();

  await fs.writeFile('test.json', JSON.stringify(videosInfo), (err) => {
    if (err) throw err;
    console.log('The file has been saved!');
  }
  );
  exports.videosInfo = videosInfo;
})();