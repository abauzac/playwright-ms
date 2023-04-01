import { Morningstar } from './crawler/morningstar';

//import { chromium } from 'playwright';
import { chromium } from "playwright";


(async () => {
    const browser = await  chromium.launch({
        headless: false,
        slowMo: 1000
    });
    const context = await browser.newContext();
    
    console.log('Started context, crawling...')
    const msciCrawler = new Morningstar(context);
    await msciCrawler.execute()
    console.log('Finished, closing browser')
    browser.close();
})();