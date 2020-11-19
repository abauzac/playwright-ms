import * as playwright from 'playwright';

async function main() {
    // Launch browser
    const browser = await playwright.chromium.launch();
    // Create context
    const context = await browser.newContext(); 
    // Open new page
    const page = await context.newPage();

    await page.goto('https://paperhelp.org');
    await page.screenshot({
        path: `screenshot/ ${playwright.chromium.name()}.png`
    });
    
    // Close th browser
    await browser.close();    
}
main();