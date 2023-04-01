import { ChromiumBrowserContext, Page } from "playwright";
import fs from "fs";
import path from "path"
import { parse, unparse } from "papaparse"

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

    baseProfitTotal: 0,
    valueRatiosTotal: 0,
    profitabilityTotal: 0,
    greatProfitTotal: 0,
}

export class Morningstar {
    static BASE_URL = "https://www.morningstar.com/stocks/$market/$code/valuation";

    FILTER_SYMBOL_MARKET = "";
    FILTER_SYMBOL_CODE = ""; // AKE
    SYMBOL_STARTS_FROM = "MMM"; // in case of bugs, starts crawling from this symbol 
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
        await page.route('**/*', (route) => {
            return this.RESOURCE_EXCLUSTIONS.includes(route.request().resourceType())
                ? route.abort()
                : route.continue()
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

            const filename = `${stock.market.toLowerCase()}_${stock.v.toLowerCase()}.json`
            const filepath = path.join(__dirname, "../..", `results/${filename}`);
            let infos: StockInfos | null = null;
            console.log(`Parsing File ${filename}`)
            if (fs.existsSync(filepath)) {
                console.log("already exists")
                const contentStr = (await fs.readFileSync(filepath)).toString();
                let parsedFile = {};
                if (contentStr !== null && contentStr !== "") {
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

        await page.goto(`https://www.morningstar.com/stocks/${stock.market.toLowerCase()}/${stock.v.toLowerCase()}/valuation`);
        try {
            await page.waitForSelector("text=Key Statistics", { timeout: 10000 })
        } catch (ex) {
            console.error('waiting for selector Key Statistics failed');
            return null;
        }

        const outOfEurope = await this.checkIfCompanyIndexOutOfEurope(page);
        if (outOfEurope) {
            console.log(`Company ${stock.v} - ${stock.c} not in europe`)
            return null;
        }

        let overviewVisible = false;
        try {
            await page.waitForSelector("text=Growth (3-Year Annualized)", { timeout: 3000 })
            overviewVisible = true;
        } catch (error) {
            console.warn(`Company overview not visible`)
        }
        const infos: StockInfos = overviewVisible ? await this.getKeyStats(page) : await this.getKeyStatsFallback(page);

        try {
            await page.getByRole('button', { name: 'Operating and Efficiency' }).scrollIntoViewIfNeeded()
        } catch (ex) {
            console.error('button Operating and Efficiency not found');
            return null;
        }

        await page.getByRole('button', { name: 'Operating and Efficiency' }).click();
        await page.waitForSelector(".sal-component-key-stats-oper-efficiency", { timeout: 10000 });

        infos.netMarginHistory = await this.getHistoryStats(page, "Net Margin %");
        infos.roeHistory = await this.getHistoryStats(page, "Return on Equity %");
        infos.roicHistory = await this.getHistoryStats(page, "Return on Invested Capital %");

        await page.getByRole('button', { name: 'Financial Health' }).click();
        await page.waitForSelector(".sal-component-key-stats-financial-health", { timeout: 10000 });
        infos.currentRatioHistory = await this.getHistoryStats(page, "Current Ratio");
        // If a company's ROE is growing, its P/B ratio should be doing the same. 
        infos.bookValueHistory = await this.getHistoryStats(page, "Book Value/Share");

        await page.getByRole('button', { name: 'Cash Flow' }).click();
        await page.waitForSelector(".sal-component-key-stats-cash-flow", { timeout: 10000 });
        infos.cfNetIncomeHistory = await this.getHistoryStats(page, "Free Cash Flow/Net Income");
        infos.cfShareHistory = await this.getHistoryStats(page, "Free Cash Flow/Share");
        //infos.evHistory = await this.getHistoryStats(page, "Enterprise Value (Bil)")

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
            await page.waitForSelector(".sal-components-wrapper table.mds-table__sal", { timeout: 10000 });
        } catch {
            return defaultNotFound;
        }

        var listTh = await page.$$(".sal-components-wrapper table.mds-table__sal th");
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

        const priceSales = await this.getContentInTableForIndex(page, "Price/Sales", ".sal-components-wrapper table.mds-table__sal tr", indexOfCurrent);
        const priceEarnings = await this.getContentInTableForIndex(page, "Price/Earnings", ".sal-components-wrapper table.mds-table__sal tr", indexOfCurrent);
        const priceBook = await this.getContentInTableForIndex(page, "Price/Book", ".sal-components-wrapper table.mds-table__sal tr", indexOfCurrent);
        const priceCashFlow = await this.getContentInTableForIndex(page, "Price/Cash Flow", ".sal-components-wrapper table.mds-table__sal tr", indexOfCurrent);
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
        stocki.scores.roeHistoryPositive = this.getScoreHistoryGreaterThan(stocki.roeHistory!, 0, 2) ?? 0
        stocki.scores.fcfSharePositive = this.getScoreHistoryGreaterThan(stocki.cfShareHistory!, 0, 3) ?? 0
        stocki.scores.fcfNetIncomeGood = this.getScoreHistoryGreaterThan(stocki.cfNetIncomeHistory!, 0.5, 2) ?? 0
        stocki.scores.roeHistoryGood = this.getScoreHistoryGreaterThan(stocki.roeHistory!, 10, 2) ?? 0

        // is GREAT 
        stocki.scores.netMarginHistoryGreat = this.getScoreHistoryGreaterThan(stocki.netMarginHistory!, 7, 4)
        stocki.scores.roicHistoryGreat = this.getScoreHistoryGreaterThan(stocki.roicHistory!, 9, 4)
        stocki.scores.roeHistoryGreat = this.getScoreHistoryGreaterThan(stocki.roicHistory!, 20, 4)
        stocki.scores.fcfNetIncomeGreat = this.getScoreHistoryGreaterThan(stocki.cfNetIncomeHistory!, 0.8, 4)

        // increasing
        stocki.scores.roicHistoryIncrease = this.getScoreHistoryIsIncreasing(stocki.roicHistory!, 2) ?? 0
        stocki.scores.netMarginHistoryIncrease = this.getScoreHistoryIsIncreasing(stocki.netMarginHistory!, 2) ?? 0
        stocki.scores.bookValueHistoryIncrease = this.getScoreHistoryIsIncreasing(stocki.bookValueHistory!, 3) ?? 0
        stocki.scores.roeHistoryIncrease = this.getScoreHistoryIsIncreasing(stocki.roeHistory!, 2) ?? 0
        stocki.scores.fcfShareIncrease = this.getScoreHistoryIsIncreasing(stocki.cfShareHistory!, 3) ?? 0

        stocki.scores.priceBookScore = stocki.pbv! > 0 ? stocki.pbv! < 2 ? 2 : stocki.pbv! < 3 ? 1 : 0 : 0;
        stocki.scores.priceSalesScore = stocki.ps! > 0 ? stocki.ps! < 1.5 ? 2 : stocki.ps! < 2 ? 1 : 0 : 0;
        stocki.scores.priceCashFlowScore = stocki.pcf! > 0 ? stocki.pcf! < 8 ? 2 : stocki.ps! < 12 ? 1 : 0 : 0;
        stocki.scores.priceEarningsScore = stocki.per! > 0 ? stocki.per! < 13 ? 2 : stocki.per! < 17 ? 1 : 0 : 0;


        stocki.scores.totalScore = +Object.values(stocki.scores)
            .filter(s => s !== null && s !== undefined)
            .reduce((a, b) => a + b, 0)
            .toFixed(1)

        stocki.scores.valueRatiosTotal = stocki.scores.priceBookScore
            + stocki.scores.priceSalesScore
            + stocki.scores.priceCashFlowScore
            + stocki.scores.priceEarningsScore;

        stocki.scores.baseProfitTotal = stocki.scores.roicHistoryPositive
            + stocki.scores.netMarginHistoryPositive
            + stocki.scores.roeHistoryPositive
            + stocki.scores.fcfSharePositive;


        stocki.scores.greatProfitTotal = stocki.scores.roeHistoryGreat
            + stocki.scores.roicHistoryGreat
            + stocki.scores.netMarginHistoryGreat
            + stocki.scores.fcfNetIncomeGreat
            + stocki.scores.fcfShareIncrease
            + stocki.scores.bookValueHistoryIncrease;

        stocki.scores.profitabilityTotal = stocki.scores.totalScore - stocki.scores.valueRatiosTotal;

        return stocki;
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
        if (history.length === 0)
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

        let stocks = await this.getSourceFromGurufocus("de");
        if (this.FILTER_SYMBOL_CODE && this.FILTER_SYMBOL_CODE.length > 0) {
            return [stocks.find((s) => s.v === this.FILTER_SYMBOL_CODE)!];
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
    fcfSharePositive?: number;
    totalScore?: number;
    roeHistoryIncrease?: number;
    priceBookScore?: number;
    priceSalesScore?: number;
    priceEarningsScore?: number;
    priceCashFlowScore?: number;
    bookValueHistoryIncrease?: number;
    roicHistoryIncrease?: number;
    netMarginHistoryIncrease?: number;
    netMarginHistoryPositive?: number;
    netMarginHistoryGreat?: number;
    roicHistoryGreat?: number;
    roeHistoryGreat?: number;
    roeHistoryGood?: number;
    roeHistoryPositive?: number;
    roicHistoryPositive?: number;

    baseProfitTotal?: number;
    valueRatiosTotal?: number;
    profitabilityTotal?: number;
    greatProfitTotal?: number;
}

type StockCodes = { c: string; v: string; isin: string; market: string; }