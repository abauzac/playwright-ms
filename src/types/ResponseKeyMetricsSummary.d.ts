export interface ResponseKeyMetricsSummary {
    currency: string
    asOfDate: string
    reportType: string
    expectedFiscalYearEnd: string
    template: string
    incomeStatementList: IncomeStatementList
    balanceSheetList: BalanceSheetList
    cashFlowList: CashFlowList
    companyId: string
  }
  
  export interface IncomeStatementList {
    dataList: DataList[]
    footer: Footer
  }
  
  export interface IncomeStatementDataList {
    fiscalPeriodDate: string
    fiscalPeriodYearMonth: string
    revenue?: number
    revenueGrowthPer?: number
    grossProfit?: number
    grossProfitMarginPer?: number
    operIncome?: number
    operatingMarginPer?: number
    ebit?: number
    ebitMarginPer?: number
    ebitda?: number
    ebitdaMarginPer?: number
    netIncome?: number
    netIncomeMarginPer?: number
    basicEPS?: number
    dilutedEPS?: number
    normalizedEPS?: number
    dividentPerShare?: number
  }
  
  export interface Footer {
    currency: string
    orderOfMagnitude: string
    fiscalYearEndDate: string
  }
  
  export interface BalanceSheetList {
    dataList: DataList2[]
    footer: Footer2
  }
  
  export interface BalanceSheetListDataList {
    fiscalPeriodDate: string
    fiscalPeriodYearMonth: string
    totalAssets?: number
    totalLiabilities?: number
    totalDebt?: number
    totalEquity?: number
    cashAndCashEquivalents?: number
    workingCapital?: number
    sharesOutstanding?: number
    sharesOutstandingConverted?: number
    bookValuePerShare?: number
    debtToEquity?: number
  }
  
  export interface Footer2 {
    sharesOutstandingUnit: string
    currency: string
    orderOfMagnitude: string
    fiscalYearEndDate: string
  }
  
  export interface CashFlowList {
    dataList: DataList3[]
    footer: Footer3
  }
  
  export interface CashFlowListDataList {
    fiscalPeriodDate: string
    fiscalPeriodYearMonth: string
    cashFromOperActivities?: number
    cashFromInvActivities?: number
    cashFromFinActivities?: number
    capitalExpenditures?: number
    freeCashFlow?: number
    changeInCash?: number
  }
  
  export interface Footer3 {
    currency: string
    orderOfMagnitude: string
    fiscalYearEndDate: string
  }
  