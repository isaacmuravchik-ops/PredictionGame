export interface PlacementSeries {
  userId: string
  teamName: string
  isBot: boolean
  color: string
}

export interface MatchTick {
  matchNumber: number
  kickoffUtc: string
  stage: string
  homeTeam: string
  awayTeam: string
}

// Recharts data array element: { matchNumber: number, [teamName]: number }
export type ChartDataPoint = { matchNumber: number } & Record<string, number>

export interface PlacementHistoryData {
  series: PlacementSeries[]
  ticks: MatchTick[]
  chartData: ChartDataPoint[]
}
