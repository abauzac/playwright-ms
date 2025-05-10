export interface ResponseCashFlow {
    currency: string
    asOfDate: string
    expectedFiscalYearEnd: string
    dataList: CashFlowDataList[]
  }
  
  export interface CashFlowDataList {
    fiscalPeriodDate: string
    fiscalPeriodYearMonth?: string
    operatingCFGrowthPer?: number
    freeCashFlowGrowthPer?: number
    freeCFPerSales?: number
    freeCashFlowPerNetIncome?: number
    freeCashFlowPerShare?: number
  }
  