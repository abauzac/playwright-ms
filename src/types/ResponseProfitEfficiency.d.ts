export interface ResponseProfitEfficiency {
    currency: any
    asOfDate: string
    expectedFiscalYearEnd: string
    dataList: DataList[]
  }
  
  export interface ProfitEfficiencyDataList {
    fiscalPeriodYear: string
    morningstarEndingDate?: string
    roa?: number
    roe?: number
    roic?: number
    daysInSales?: number
    daysInInventory?: number
    daysInPayment?: number
    cashConversionCycle?: number
    receivableTurnover?: number
    inventoryTurnover?: number
    fixedAssetsTurnover?: number
    assetsTurnover?: number
  }
  