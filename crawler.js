const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({headless: false});
  const page = await browser.newPage();

  await page.goto('https://developer.chrome.com/');

  // Set screen size
  await page.setViewport({width: 1080, height: 1024});

  setTimeout(async () => {
    await page.screenshot({path: 'screenshot.png'});
    await browser.close();
  }, 5000);
})();