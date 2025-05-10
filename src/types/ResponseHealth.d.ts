export interface ResponseFinancialHealth {
    currency: string
    asOfDate: string
    expectedFiscalYearEnd: string
    dataList: DataList[]
  }
  
  export interface HealthDataList {
    fiscalPeriodYearMonth: string
    morningstarEndingDate: string
    currentRatio?: number
    quickRatio?: number
    interestCoverage?: number
    financialLeverage?: number
    debtEquityRatio?: number
    bookValuePerShare?: number
    capExAsPerOfSales?: number
  }
  