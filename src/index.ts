import * as playwright from 'playwright';

async function main() {
    const{chromium, webkit, firefox} = playwright;
    for(const browserType of [chromium, webkit, firefox]){

        // Launch browser
        const browser = await browserType.launch({
            headless: true
        });
        // Create context
        const context = await browser.newContext(); 

        // Open new page
        const page = await context.newPage();
        // await page.setViewportSize({
        //     width: 1440,
        //     height:900,
        // })

        await page.goto('http://paperhelp.org');

        // await page.click('[data-ph-tst="hdr-ordr_now"]');
        await page.click('css=[data-ph-tst=hdr-sgn_in]');
        
        await page.waitForTimeout(5000);

        let today = new Date();
        let hh = String(today.getHours());
        let mm = String(today.getMinutes()); 
        let sec = String(today.getSeconds()); 
        let currentTime = hh + ':' + mm + ':' + sec;

        await page.screenshot({
            path: `screenshot/ ${browserType.name()} ${currentTime}.png`
        });

        // Close the browser
        await browser.close();
    }
    
    
}
main();