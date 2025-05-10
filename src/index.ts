import { Morningstar } from './crawler/morningstar';

//import { chromium } from 'playwright';
import { chromium } from "playwright";


(async () => {
    const browser = await  chromium.launch({
        headless: false,
        slowMo: 1000,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
    });
    const context = await browser.newContext({
        viewport: null,
    });

    console.log('Started context, crawling...')
    const msciCrawler = new Morningstar(context);
    await msciCrawler.execute()
    console.log('Finished, closing browser')
    browser.close();
})();