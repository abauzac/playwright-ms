import { ChromiumBrowserContext, Page } from "playwright";
import fs from "fs";
import path from "path"
import { parse, unparse } from "papaparse"
import { ResponseProfitEfficiency } from "../types/ResponseProfitEfficiency";
import { BalanceSheetList, BalanceSheetListDataList, CashFlowList, CashFlowListDataList, IncomeStatementDataList, IncomeStatementList, ResponseKeyMetricsSummary } from "../types/ResponseKeyMetricsSummary";
import { ResponseFinancialHealth } from "../types/ResponseHealth";
import { ResponseCashFlow } from "../types/ResponseCashFlow";

const blankScore: StockInfosScore = {
    fcfShareIncrease: 0,
    fcfNetIncomeGood: 0,
    fcfNetIncomeGreat: 0,
    fcfSharePositive: 0,
    totalScore: 0,
    roeHistoryIncrease: 0,
    priceBookScore: 0,
    priceSalesScore: 0,
    priceEarningsScore: 0,
    priceCashFlowScore: 0,
    bookValueHistoryIncrease: 0,
    roicHistoryIncrease: 0,
    netMarginHistoryIncrease: 0,
    netMarginHistoryPositive: 0,
    netMarginHistoryGreat: 0,
    roicHistoryGreat: 0,
    roeHistoryGreat: 0,
    roeHistoryGood: 0,
    roeHistoryPositive: 0,
    roicHistoryPositive: 0,
    revenueGrowthHistoryGreat: 0,
    revenueGrowthHistoryPositive: 0,

    baseProfitTotal: 0,
    valueRatiosTotal: 0,
    profitabilityTotal: 0,
    greatProfitTotal: 0,
    sweetSpotValue: 0,
}
type CountryList = "be"|"de"|"es"|"fi"|"it"|"nl"|"no"|"se"|"xpar"|"pt";

export class Morningstar {
    static BASE_URL = "https://www.morningstar.com/stocks/$market/$code/valuation";

    COUNTRY: CountryList = "de"
    FILTER_SYMBOL_MARKET = "";
    FILTER_SYMBOL_CODE = "psg"; // AKE
    SYMBOL_STARTS_FROM = ""; // in case of bugs, starts crawling from this symbol 
    RESOURCE_EXCLUSTIONS: string[] = ['image'];//['image', 'stylesheet', 'media', 'font', 'other'];

    UPDATE = false;
    dirpath?: string;

    constructor(public context: ChromiumBrowserContext) {

        this.dirpath = path.join(__dirname, "../..", `results`);
        if (!fs.existsSync(this.dirpath))
            fs.mkdirSync(this.dirpath, { recursive: true })

    }

    async getPage() {

        const page = await this.context.newPage();

        // Create a set of excluded resource types.
        const excludedResources = new Set(this.RESOURCE_EXCLUSTIONS);

        // Add a route handler to abort requests for excluded resource types.
        await page.route('**/*', (route) => {
            if (excludedResources.has(route.request().resourceType())) {
                return route.abort();
            }
            return route.continue();
        });

        return page;
    }

    async execute() {

        let page: Page | null = null;

        if (this.UPDATE) {
            console.log('Updating data...')
            await this.updateResults();
            return;
        }

        const arrayOfStocks: StockCodes[] = await this.getArrayOfStocks();

        console.log(`Crawling ${arrayOfStocks.length} stocks`)
        let idx = 0;
        for (const stock of arrayOfStocks) {
            if (idx % 20 == 0) {
                if (page != null) {
                    await page.close()
                }
                page = await this.getPage();
            }
            if(!stock){
                console.error("Stock not found")
                continue;
            }

            const filename = `${stock.market.toLowerCase()}_${stock.v.toLowerCase()}.json`
            const filepath = path.join(__dirname, "../..", `results/${filename}`);
            let infos: StockInfos | null = null;
            console.log(`Parsing File ${filename}`)
            if (fs.existsSync(filepath)) {
                console.log("already exists")
                const contentStr = (await fs.readFileSync(filepath)).toString();
                let parsedFile = {};
                if (contentStr !== null && contentStr !== "") {
                    if(contentStr === "{}"){
                        console.log("empty object file")
                        continue;
                    }
                    parsedFile = JSON.parse(contentStr);
                }
                // if (Object.keys(parsedFile).length == 0) {
                //     console.log("empty object file")
                //     continue;
                // }
                infos = parsedFile;
            }
            const result = await this.getStockInfos(page!, stock);
            if (result) {
                infos = result;
                infos.stock = stock;
            }
            if (!result && !infos) {
                infos = {};
            }

            if (infos && Object.keys(infos).length > 0) {
                infos = this.computeScores(infos!);
            }


            fs.writeFileSync(filepath, JSON.stringify(infos));
            idx++;
        }

        await this.writeCsvResults()

        //await page.waitForTimeout(20000)
    }
    async updateResults() {
        const arrayOfStocks: StockCodes[] = await this.getArrayOfStocksToUpdate();

        for (const stock of arrayOfStocks) {
            const filename = `${stock.market.toLowerCase()}_${stock.v.toLowerCase()}.json`
            const filepath = path.join(__dirname, "../..", `results/${filename}`);
            let infos: StockInfos | null = null;
            console.log(`Parsing File ${filename}`)
            if (fs.existsSync(filepath)) {
                const contentStr = (await fs.readFileSync(filepath)).toString();
                let parsedFile = {};
                if (contentStr !== null && contentStr !== "") {
                    parsedFile = JSON.parse(contentStr);
                }
                infos = parsedFile;
            }

            if (infos && Object.keys(infos).length > 0) {
                infos = this.computeScores(infos!);
            }

            fs.writeFileSync(filepath, JSON.stringify(infos));
        }

        await this.writeCsvResults()
    }

    private async getArrayOfStocksToUpdate(): Promise<StockCodes[]> {
        const stockCodes: StockCodes[] = []
        const filesList = fs.readdirSync(this.dirpath!)
        for (const fileName of filesList) {
            if (!fileName.endsWith(".json"))
                continue;
            const filePath = path.join(this.dirpath!, fileName)
            //console.log("Unpacking " + filePath)
            const parsedFile: StockInfos = JSON.parse((await fs.readFileSync(filePath)).toString());
            if (Object.keys(parsedFile).length == 0 || !parsedFile.stock)
                continue;

            stockCodes.push(parsedFile.stock);
        }

        if (this.FILTER_SYMBOL_CODE && this.FILTER_SYMBOL_CODE.length > 0) {
            return [stockCodes.find((s) => s.v === this.FILTER_SYMBOL_CODE)!];
        }
        if (this.FILTER_SYMBOL_MARKET) {
            return stockCodes.filter((s: StockCodes) => s.market == this.FILTER_SYMBOL_MARKET)
        }
        if (this.SYMBOL_STARTS_FROM) {
            const indexFound = stockCodes.findIndex(e => e.v.toLowerCase() === this.SYMBOL_STARTS_FROM.toLowerCase());
            if (indexFound > -1) {
                console.log("Starts at index " + indexFound)
                return stockCodes.slice(indexFound)
            }
        }


        return stockCodes;
    }

    private async getStockInfos(page: Page, stock: StockCodes) {
        await page.waitForTimeout(5000);
        console.log(`Crawling https://www.morningstar.com/stocks/${stock.market.toLowerCase()}/${stock.v.toLowerCase()}/valuation`)
        await page.goto(`https://www.morningstar.com/stocks/${stock.market.toLowerCase()}/${stock.v.toLowerCase()}/valuation`);
        try {
            await page.waitForSelector(".sal-component-expand", { timeout: 10000 })
            await page.click(".sal-component-expand")
        } catch (ex) {
            console.error('waiting for selector Key Statistics failed');
            return null;
        }

        const outOfEurope = await this.checkIfCompanyIndexOutOfEurope(page);
        if (outOfEurope) {
            console.log(`Company ${stock.v} - ${stock.c} not in europe`)
            return null;
        }


        // const infos: StockInfos = overviewVisible ? await this.getKeyStats(page) : await this.getKeyStatsFallback(page);
        const infos: StockInfos = await this.getKeyStatsFallback(page);




        console.log("Clicking Key Metrics")
        // await page.click("a.mdc-link__mdc.mds-button__mdc");
        const responseKeyMetricsPromise = page.waitForResponse(response => response.url().includes("keyMetrics/summary") && response.status() === 200, { timeout: 10000 });
        await page.getByRole('link', { name: 'Key Metrics' }).click();
        const responseKM = await responseKeyMetricsPromise;
        if (!responseKM) {
            console.error('responseKM not found');
            return null;
        }
        const respKeyMetricsJson:ResponseKeyMetricsSummary = await responseKM.json();

        infos.revenueGrowthHistory =  this.getHistoryStatsGrowthResponse(respKeyMetricsJson,'incomeStatementList', 'revenueGrowthPer');
        infos.netMarginHistory =  this.getHistoryStatsGrowthResponse(respKeyMetricsJson,'incomeStatementList', 'netIncomeMarginPer');
        infos.bookValueHistory = this.getHistoryStatsGrowthResponse(respKeyMetricsJson,'balanceSheetList', "bookValuePerShare");

        



        console.log("Clicking Profitability and Efficiency tab")
        const responseProfitPromise = page.waitForResponse(response => response.url().includes("profitabilityAndEfficiency") && response.status() === 200, { timeout: 10000 });
        await page.locator('.segment-band__tabs .mds-button-group__item__sal' ).filter({ hasText: /Profitability and Efficiency/i }).click();
        const responseProfit = await responseProfitPromise;
        if (!responseProfit) {
            console.error('responseProfit not found');
            return null;
        }
        const respProfitJson = await responseProfit.json();
        infos.roeHistory =  this.getHistoryStatsResponse(respProfitJson, "roe");
        infos.roicHistory =  this.getHistoryStatsResponse(respProfitJson,  "roic");
        // infos.roicHistory = await this.getHistoryStatsResponse(respProfitJson, "roa");




        console.log("Clicking Financial Health tab")
        const responseHealthPromise = page.waitForResponse(response => response.url().includes("keyMetrics/financialHealth") && response.status() === 200, { timeout: 10000 });
        await page.locator('.segment-band__tabs .mds-button-group__item__sal' ).filter({ hasText: /Financial Health/i }).click();
        const responseHealth = await responseHealthPromise;
        if (!responseHealth) {
            console.error('responseHealth not found');
            return null;
        }
        const responseHealthJson: ResponseFinancialHealth = await responseHealth.json();

        infos.currentRatioHistory = this.getHistoryStatsHealthResponse(responseHealthJson, "currentRatio");
        infos.bookValueHistory = this.getHistoryStatsHealthResponse(responseHealthJson, "bookValuePerShare") ;
        // If a company's ROE is growing, its P/B ratio should be doing the same. 


        console.log("Clicking Cash Flow tab")
        const responseCashFlowPromise = page.waitForResponse(response => response.url().includes("cashFlow") && response.status() === 200, { timeout: 10000 });
        await page.locator('.segment-band__tabs .mds-button-group__item__sal' ).filter({ hasText: /Cash Flow/i }).click();
        const responseCashFlow = await responseCashFlowPromise;
        if (!responseCashFlow) {
            console.error('responseCashFlow not found');
            return null;
        }
        const responseCashFlowJson: ResponseCashFlow = await responseCashFlow.json();
        
        infos.cfNetIncomeHistory = this.getHistoryStatsCashFlowResponse(responseCashFlowJson, "freeCashFlowPerNetIncome");
        infos.cfShareHistory = this.getHistoryStatsCashFlowResponse(responseCashFlowJson, "freeCashFlowPerShare");

        
        return infos;
    }
    private async getKeyStatsFallback(page: Page): Promise<StockInfos> {
        const defaultNotFound = {
            pbv: 0,
            per: 0,
            ps: 0,
            pcf: 0,
            ratioAvailable: false,
        };
        try {
            await page.waitForSelector("sal-components-stocks-valuation .mds-table__sal", { timeout: 10000 });
        } catch {
            return defaultNotFound;
        }

        var listTh = await page.$$("sal-components-stocks-valuation th.mds-th__sal");
        let indexOfCurrent = -1;
        for (let index = 0; index < listTh.length; index++) {
            const th = listTh[index];
            if (await th.innerText() === 'Current') {
                indexOfCurrent = index;
                break;
            }
        }
        if (indexOfCurrent == -1)
            return defaultNotFound;

        const priceSales = await this.getContentInTableForIndex(page, "Price/Sales", "sal-components-stocks-valuation .mds-tr__sal ", indexOfCurrent);
        const priceEarnings = await this.getContentInTableForIndex(page, "Price/Earnings", "sal-components-stocks-valuation .mds-tr__sal ", indexOfCurrent);
        const priceBook = await this.getContentInTableForIndex(page, "Price/Book", "sal-components-stocks-valuation .mds-tr__sal ", indexOfCurrent);
        const priceCashFlow = await this.getContentInTableForIndex(page, "Price/Cash Flow", "sal-components-stocks-valuation .mds-tr__sal ", indexOfCurrent);
        return {
            pbv: priceBook,
            per: priceEarnings,
            ps: priceSales,
            pcf: priceCashFlow,
        };
    }

    async getContentInTableForIndex(page: Page, textToFind: string, elementToFindInto: string, indexOfContentToGet: number) {
        const found = page.locator(elementToFindInto, { hasText: textToFind });
        const count = await found.count()
        if (count == 0)
            return 0;

        const td = found.locator("td").nth(indexOfContentToGet)
        if (await td.count() == 0)
            return 0;

        const content = await td.innerText();
        const value = parseFloat(content);
        if (isNaN(value))
            return 0;
        return value;
    }

    private async checkIfCompanyIndexOutOfEurope(page: Page): Promise<boolean> {
        try {
            const elem = await page.getByText(/Morningstar US Market|Morningstar China/).elementHandle({
                timeout: 2000,
            })
            return elem != null;
        }
        catch (ex) {
            return false
        }
    }


    private async getKeyStats(page: Page) {
        const priceBookCurrentValue = await this.getDpValue(page, 'Price/Book');
        const priceCashFlowCurrentValue = await this.getDpValue(page, 'Price/Cash Flow');
        const priceSalesCurrentValue = await this.getDpValue(page, 'Price/Sales');
        const priceEarningsCurrentValue = await this.getDpValue(page, 'Price/Earnings');
        return {
            pbv: priceBookCurrentValue ?? 0,
            pcf: priceCashFlowCurrentValue ?? 0,
            ps: priceSalesCurrentValue ?? 0,
            per: priceEarningsCurrentValue ?? 0,
            ratioAvailable: true,
        }
    }

    computeScores(stocki: StockInfos) {
        stocki.scores = {};
        // is positive
        stocki.scores.roicHistoryPositive = this.getScoreHistoryGreaterThan(stocki.roicHistory!, 0, 2) ?? 0
        stocki.scores.netMarginHistoryPositive = this.getScoreHistoryGreaterThan(stocki.netMarginHistory!, 0, 2) ?? 0
        stocki.scores.revenueGrowthHistoryPositive = this.getScoreHistoryGreaterThan(stocki.revenueGrowthHistory!, 0, 2) ?? 0
        stocki.scores.roeHistoryPositive = this.getScoreHistoryGreaterThan(stocki.roeHistory!, 0, 2) ?? 0
        stocki.scores.fcfSharePositive = this.getScoreHistoryGreaterThan(stocki.cfShareHistory!, 0, 3) ?? 0
        stocki.scores.fcfNetIncomeGood = this.getScoreHistoryGreaterThan(stocki.cfNetIncomeHistory!, 0.5, 2) ?? 0
        stocki.scores.roeHistoryGood = this.getScoreHistoryGreaterThan(stocki.roeHistory!, 10, 2) ?? 0

        // is GREAT 
        stocki.scores.netMarginHistoryGreat = this.getScoreHistoryGreaterThan(stocki.netMarginHistory!, 7, 4)
        stocki.scores.roicHistoryGreat = this.getScoreHistoryGreaterThan(stocki.roicHistory!, 15, 4)
        stocki.scores.roeHistoryGreat = this.getScoreHistoryGreaterThan(stocki.roeHistory!, 20, 4)
        stocki.scores.fcfNetIncomeGreat = this.getScoreHistoryGreaterThan(stocki.cfNetIncomeHistory!, 0.8, 4)
        stocki.scores.revenueGrowthHistoryGreat = this.getScoreHistoryGreaterThan(stocki.revenueGrowthHistory!, 5, 4) ?? 0

        // increasing
        stocki.scores.roicHistoryIncrease = this.getScoreHistoryIsIncreasing(stocki.roicHistory!, 2) ?? 0
        stocki.scores.netMarginHistoryIncrease = this.getScoreHistoryIsIncreasing(stocki.netMarginHistory!, 2) ?? 0
        stocki.scores.bookValueHistoryIncrease = this.getScoreHistoryIsIncreasing(stocki.bookValueHistory!, 3) ?? 0
        stocki.scores.roeHistoryIncrease = this.getScoreHistoryIsIncreasing(stocki.roeHistory!, 2) ?? 0
        stocki.scores.fcfShareIncrease = this.getScoreHistoryIsIncreasing(stocki.cfShareHistory!, 3) ?? 0

        stocki.scores.priceBookScore = stocki.pbv! > 0 ? stocki.pbv! < 2 ? 2 : stocki.pbv! < 3 ? 1 : 0 : 0;
        // y = -15x + 24
        stocki.scores.priceSalesScore = this.getScorePriceToSales(stocki.ps);
        // (! cf yield!, donc 1/pcf ) y = 2.11x - 3.24
        stocki.scores.priceCashFlowScore = this.getScorePriceToCashFlow(stocki.pcf);
        stocki.scores.priceEarningsScore = this.getScorePriceToEarnings(stocki.per);


        stocki.scores.totalScore = +Object.values(stocki.scores)
            .filter(s => s !== null && s !== undefined)
            .reduce((a, b) => a + b, 0)
            .toFixed(1)

        stocki.scores.valueRatiosTotal = +(stocki.scores.priceBookScore
            + stocki.scores.priceSalesScore
            + stocki.scores.priceCashFlowScore
            + stocki.scores.priceEarningsScore).toFixed(1);

        stocki.scores.baseProfitTotal = +(stocki.scores.roicHistoryPositive
            + stocki.scores.netMarginHistoryPositive
            + stocki.scores.revenueGrowthHistoryPositive
            + stocki.scores.roeHistoryPositive
            + stocki.scores.fcfSharePositive).toFixed(1);

        

        stocki.scores.greatProfitTotal = +(stocki.scores.roeHistoryGreat
            + stocki.scores.roicHistoryGreat
            + stocki.scores.netMarginHistoryGreat
            + stocki.scores.fcfNetIncomeGreat
            + stocki.scores.revenueGrowthHistoryGreat
            + stocki.scores.fcfShareIncrease
            + stocki.scores.bookValueHistoryIncrease).toFixed(1);

        stocki.scores.sweetSpotValue = +(stocki.scores.valueRatiosTotal + stocki.scores.greatProfitTotal).toFixed(1);


        stocki.scores.profitabilityTotal = +(stocki.scores.totalScore - stocki.scores.valueRatiosTotal).toFixed(1)

        return stocki;
    }
    getScorePriceToCashFlow(fcfratio: number | undefined): number {
        // max : 2 points

        if (!fcfratio || fcfratio < 0)
            return 0;

        // linear equation 10yr return : -0.7x + 25
        const result = -0.7 * fcfratio + 25;

        if (result < 0)
            return 0;

        return +Math.fround(result * 2 / 25).toFixed(1);
    }
    getScorePriceToEarnings(per: number | undefined): number {
        // max : 2 points

        if (!per)
            return 0;

        // linear equation 10yr return : -0.5x + 14
        const result = -0.5 * per + 14;

        if (result < 0)
            return 0;

        return +Math.fround(result * 2 / 14).toFixed(1);
    }
    getScorePriceToSales(ps: number | undefined) {
        // max : 2 points

        if (!ps)
            return 0;

        // linear equation 10yr return : -15 + 24
        const result = -15 * ps + 24;

        if (result < 0)
            return 0;

        return +Math.fround(result * 2 / 24).toFixed(1);
    }


    async writeCsvResults() {

        console.log("writing csv results")
        const arrayOfScoresAndInfos = [];
        const filesList = fs.readdirSync(this.dirpath!)
        for (const fileName of filesList) {
            if (!fileName.endsWith(".json"))
                continue;
            const filePath = path.join(this.dirpath!, fileName)
            //console.log("Unpacking " + filePath)
            const parsedFile: StockInfos = JSON.parse((await fs.readFileSync(filePath)).toString());
            if (Object.keys(parsedFile).length == 0)
                continue;

            const obj = {
                ...blankScore,
                ...parsedFile.stock,
                ...parsedFile.scores,
            }
            arrayOfScoresAndInfos.push(obj);
        }

        const csv = unparse(arrayOfScoresAndInfos)
        const csvPath = path.join(this.dirpath!, "_results.csv")
        fs.writeFileSync(csvPath, csv)
    }

    // HELPERS

    getScoreHistoryIsIncreasing(array: number[], maxScore: number): number {
        if (array.length <= 1)
            return 0;

        let score = 0;
        array.forEach((v, i, arr) => {
            if (i == 0)
                return;
            const prev = arr[i - 1];
            score += (v === prev || v > prev) ? 1 : 0;
        })
        const res = +(score / (array.length - 1) * maxScore).toFixed(1)
        if (res === null) {
            throw new Error("getScoreHistoryGreaterThan null")
        }

        return res;
    }

    getScoreHistoryGreaterThan(history: number[], compareTo = 0, maxScore = 5): number {
        if (!history || history.length === 0)
            return 0;
        const res = +(history.filter(h => h > compareTo).length / history.length * maxScore).toFixed(1);
        if (res === null) {
            throw new Error("getScoreHistoryGreaterThan null")
        }
        return res;
    }

    async getHistoryStats(page: Page, rowHeader: string) {
        const elements = await page.getByRole('cell', { name: rowHeader })
            .locator("..")
            .locator("td:not(:first-child)")
            .elementHandles();
        const allValues = await Promise.all(elements.map(async (e) => await e.innerText()));
        // remove last column as it is the "5yr average"
        allValues.pop();
        return allValues.filter(v => !isNaN(parseFloat(v))).map(v => parseFloat(v))
    }

    getHistoryStatsResponse(response: ResponseProfitEfficiency, keyStats:"roa"|"roe"|"roic"): number[] {
        if(response?.dataList.length > 0){
            return response.dataList.map((d) => d[keyStats]).filter(v => typeof v === "number").map(v => +v.toFixed(1)) as number[]
        }
        return []
    }

    getHistoryStatsHealthResponse(response: ResponseFinancialHealth, keyStats:"bookValuePerShare"|"currentRatio"|"debtEquityRatio"): number[] {
        if(response?.dataList.length > 0){
            return response.dataList.map((d) => d[keyStats]).filter(v => typeof v === "number").map(v => +v.toFixed(1)) as number[]
        }
        return []
    }

    getHistoryStatsCashFlowResponse(response: ResponseCashFlow, keyStats:"freeCashFlowPerShare"|"freeCashFlowPerNetIncome"|"freeCFPerSales"): number[] {
        if(response?.dataList.length > 0){
            return response.dataList.map((d) => d[keyStats])
            .filter(v => typeof v === "number")
            // @ts-ignore
            .map(v => +v.toFixed(1)) as number[]
        }
        return []
    }

    async getHistoryStatsGrowth(page: Page, section: string, rowHeader: string) {
        
        const elements = await page
        .locator("tr:below(tr:has(td:text('Revenue %')))")
        .locator("nth=0")
        .locator("td:not(:first-child)")
            .elementHandles();
        const allValues = await Promise.all(elements.map(async (e) => await e.innerText()));
        // remove last column as it is the "5yr average"
        allValues.pop();
        return allValues.filter(v => !isNaN(parseFloat(v))).map(v => parseFloat(v))
    }

    //IncomeStatementDataList | BalanceSheetListDataList | CashFlowListDataList
    getHistoryStatsGrowthResponse(resp: ResponseKeyMetricsSummary, dataListKey: keyof ResponseKeyMetricsSummary, keyString: keyof IncomeStatementDataList | keyof BalanceSheetListDataList | keyof CashFlowListDataList) {
        const listData = resp[dataListKey] as IncomeStatementList | BalanceSheetList | CashFlowList;
        if (listData.dataList.length > 0) {
            // @ts-ignore
            return listData.dataList.map((d) => (d[keyString])).filter(v => v !== null && v !== undefined).map(v => +v.toFixed(1))
        }
        return []

    }

    async getDpValue(page: Page, textLabel: string) {
        const loc = await page.$(`div.dp-value:below(:text('${textLabel}'))`);
        const txt = await loc?.innerText();
        if (txt && !isNaN(parseFloat(txt))) {
            return parseFloat(txt);
        }
        return undefined;
    }

    // data sources

    async getArrayOfStocks(): Promise<StockCodes[]> {

        let stocks = await this.getSourceFromGurufocus(this.COUNTRY);
        if (this.FILTER_SYMBOL_CODE && this.FILTER_SYMBOL_CODE.length > 0) {
            return [stocks.find((s) => s.v.toLowerCase() === this.FILTER_SYMBOL_CODE.toLowerCase())!];
        }
        if (this.FILTER_SYMBOL_MARKET) {
            stocks = stocks.filter((s: StockCodes) => s.market == this.FILTER_SYMBOL_MARKET)
        }
        if (this.SYMBOL_STARTS_FROM) {
            const indexFound = stocks.findIndex(e => e.v.toLowerCase() === this.SYMBOL_STARTS_FROM.toLowerCase());
            if (indexFound > -1) {
                console.log("Starts at index " + indexFound)
                stocks = stocks.slice(indexFound)
            }
        }

        return stocks;
    }

    async getSourceFromGurufocus(country: string): Promise<StockCodes[]> {
        const filepath = path.join(__dirname, "..", `data/gurufocus_${country}.csv`);
        if (!fs.existsSync(filepath))
            throw new Error(`file path does not exist ${filepath}`)

        const contentFile = (await fs.readFileSync(filepath)).toString()
        const parsed = parse<any>(contentFile, {
            delimiter: ";",
            header: true,
            skipEmptyLines: true,
        })

        const mappedResult: StockCodes[] = parsed.data.map((o: any) => {
            return {
                c: o.c,
                v: o.v,
                isin: "", // no isin in gurufocus lists
                market: o.market,
            }
        })

        return mappedResult;
    }


    async getSourceFromEuronextJson(): Promise<StockCodes[]> {
        const filepath = path.join(__dirname, "..", `data/euronext.json`);
        if (!fs.existsSync(filepath))
            throw new Error(`file path does not exist ${filepath}`)

        const parsedFile = JSON.parse((await fs.readFileSync(filepath)).toString());

        return parsedFile.tickets;
    }
    async getSourceFromEuronextCsv(): Promise<StockCodes[]> {
        const filepath = path.join(__dirname, "..", `data/Euronext.csv`);
        if (!fs.existsSync(filepath))
            throw new Error(`file path does not exist ${filepath}`)

        const contentFile = (await fs.readFileSync(filepath)).toString()
        const parsed = parse<any>(contentFile, {
            delimiter: ",",
            header: true,
            skipEmptyLines: true,

        })

        const mappedResult: StockCodes[] = parsed.data.map((o: any) => {
            return {
                c: o.Company,
                v: (o.Ticker as string).split(".")[0],
                isin: "",
                market: this.getMarketFromMarketPlaceName(o.Exchange),
            }
        })

        return mappedResult.filter((s: StockCodes) => s.market == this.FILTER_SYMBOL_MARKET);
    }

    async getSourceFromGermanyStocksCsv(): Promise<StockCodes[]> {
        const filepath = path.join(__dirname, "..", `data/Germany_Stocks.csv`);
        if (!fs.existsSync(filepath))
            throw new Error(`file path does not exist ${filepath}`)

        const contentFile = (await fs.readFileSync(filepath)).toString()
        const parsed = parse<any>(contentFile, {
            delimiter: ",",
            header: true,
            skipEmptyLines: true,
        })

        const mappedResult: StockCodes[] = parsed.data.map((o: any) => {
            return {
                c: o.Name,
                v: (o.Ticker as string).split(":")[1],
                isin: "",
                market: "XETR",
            }
        })

        return mappedResult.filter((s: StockCodes) => s.market == this.FILTER_SYMBOL_MARKET);
    }

    async getSourceFromDeJson(): Promise<StockCodes[]> {
        const filepath = path.join(__dirname, "..", `data/DE.json`);
        if (!fs.existsSync(filepath))
            throw new Error(`file path does not exist ${filepath}`)

        const parsedFile: any[] = JSON.parse((await fs.readFileSync(filepath)).toString());

        const mappedResult = parsedFile
            .filter((o: any) => o.type == "Common Stock")
            .map((o: any) => {
                return {
                    c: o.description,
                    v: (o.ticker as string).split(".")[0],
                    isin: "",
                    market: o.exchange,
                } as StockCodes
            })

        return mappedResult.filter((s: StockCodes) => s.market == this.FILTER_SYMBOL_MARKET);
    }

    getMarketFromMarketPlaceName(arg0: string): string {
        switch (arg0) {
            case "Euronext Paris":
            case "Euronext Growth Paris":
            case "Euronext Access Paris":
                return "XPAR"
            case "Euronext Lisbon":
                return "XLIS"
            case "Euronext Amsterdam":
                return "XAMS"
            case "Euronext Brussels":
                return "XBRU"
            case "Euronext Expand Oslo":
            case "Euronext Growth Oslo":
            case "Oslo Bors":
                return "XOSL"
            default:
                return "UNK"
        }
    }
    async getSourceFromFranceActionsJson(): Promise<StockCodes[]> {
        const filepath = path.join(__dirname, "..", `data/france_actions.json`);
        if (!fs.existsSync(filepath))
            throw new Error(`file path does not exist ${filepath}`)

        const parsedFile = JSON.parse((await fs.readFileSync(filepath)).toString());

        const mappedResult = parsedFile.map((o: any) => {
            return {
                c: o.name,
                v: (o.symbol as string).split(".")[0],
                isin: null,
                market: this.getMarketFromShortSymbolSuffix((o.symbol as string).split(".")[1]),
            }
        })

        return mappedResult.filter((s: StockCodes) => s.market == this.FILTER_SYMBOL_MARKET);
    }
    async getSourceFromPeaEquitiesJson(): Promise<StockCodes[]> {
        const filepath = path.join(__dirname, "..", `data/pea-equities_20200602.json`);
        if (!fs.existsSync(filepath))
            throw new Error(`file path does not exist ${filepath}`)

        const parsedFile = JSON.parse((await fs.readFileSync(filepath)).toString());

        const mappedResult = parsedFile
            .filter((o: any) => !(o.symbol as string).match(/[A-Z]{2}\d+/))
            .map((o: any) => {
                return {
                    c: o.name,
                    v: o.symbol,
                    isin: o.isincode,
                    market: o.marketIdentificationCode,
                }
            })

        return mappedResult.filter((s: StockCodes) => s.market == this.FILTER_SYMBOL_MARKET);
    }

    getMarketFromShortSymbolSuffix(arg0: string) {
        switch (arg0) {
            case "PA":
                return "XPAR"
            case "BR":
                return "XBRU"
            case "LS":
                return "XLIS"
            case "AS":
                return "XAMS"
            default:
                return arg0;
        }
    }
}

type StockInfos = {
    scores?: StockInfosScore;
    roeHistory?: number[];
    stock?: StockCodes;
    cfNetIncomeHistory?: number[];
    cfShareHistory?: number[];
    currentRatioHistory?: number[];
    bookValueHistory?: number[];
    roicHistory?: number[];
    netMarginHistory?: number[];
    revenueGrowthHistory?: number[];

    ratioAvailable?: boolean;
    pbv?: number;
    pcf?: number;
    ps?: number;
    per?: number;

}

type StockInfosScore = {
    fcfShareIncrease?: number;
    fcfNetIncomeGood?: number;
    fcfNetIncomeGreat?: number;
    /** max 3 */
    fcfSharePositive?: number;
    totalScore?: number;
    roeHistoryIncrease?: number;
    
    /** max 2 */
    priceBookScore?: number;
    /** max 2 */
    priceSalesScore?: number;
    /** max 2 */
    priceEarningsScore?: number;
    /** max 2 */
    priceCashFlowScore?: number;

    bookValueHistoryIncrease?: number;
    roicHistoryIncrease?: number;
    netMarginHistoryIncrease?: number;
    /** max 2 */
    netMarginHistoryPositive?: number;
    revenueGrowthHistoryPositive?: number;
    netMarginHistoryGreat?: number;
    revenueGrowthHistoryGreat?: number;
    roicHistoryGreat?: number;
    roeHistoryGreat?: number;
    roeHistoryGood?: number;
    /** max 2 */
    roeHistoryPositive?: number;
    /** max 2 */
    roicHistoryPositive?: number;

    /** max 9 */
    baseProfitTotal?: number;
    /** max 8 */
    valueRatiosTotal?: number;
    profitabilityTotal?: number;
    greatProfitTotal?: number;
    sweetSpotValue?: number;
}

type StockCodes = { c: string; v: string; isin: string; market: string; }