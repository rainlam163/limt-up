import fs from "fs"

import { CONFIG } from "./config.js"

import { fetchAllStocks } from "./services/market.js"
import { fetchKlineBatch } from "./services/kline.js"

import { calcMomentum, getMomentumDetail } from "./factors/momentum.js"
import { calcTurnover, getTurnoverDetail } from "./factors/turnover.js"
import { calcCapitalFlow, getCapitalDetail } from "./factors/capitalFlow.js"
import { calcSectorHot, getSectorDetail } from "./factors/sectorHot.js"
import { calcTrend, getTrendDetail } from "./factors/trend.js"
import { calcVolumePrice, getVolumePriceDetail } from "./factors/volumePrice.js"
import { calcSentiment, calcMarketSentiment, getSentimentDesc } from "./factors/sentiment.js"
import { calcStability, getStabilityDetail, isStableRising } from "./factors/stability.js"
import { calcTrapDetect, getTrapDetail } from "./factors/trapDetect.js"

import { calcScore } from "./utils/score.js"
import { sendStockResult } from "./utils/push.js"
import { startScheduler } from "./scheduler.js"

import { detectLeaders } from "./strategy/leader.js"


// 判断是否主板股票
function isMainBoard(code) {
  if (/^(600|601|603|605)\d{3}$/.test(code)) return true
  if (/^(000|001)\d{3}$/.test(code)) return true
  return false
}

// 判断是否ST股票
function isST(name) {
  return /^ST|^\*ST|^SST|^S\*ST/i.test(name)
}


async function run() {

  console.log("获取市场数据...")

  const stocks = await fetchAllStocks()

  // 计算市场情绪
  console.log("计算市场情绪...")
  const marketSentiment = calcMarketSentiment(stocks)
  console.log(`市场情绪: ${getSentimentDesc(marketSentiment)}`)

  // 第一轮筛选：基础条件
  const baseFiltered = stocks.filter(s =>
    isMainBoard(s.code) &&
    !isST(s.name) &&
    s.pct >= CONFIG.MIN_PCT &&
    s.pct < CONFIG.MAX_PCT &&
    s.price > CONFIG.MIN_PRICE &&
    s.price < CONFIG.MAX_PRICE &&
    s.turnover > CONFIG.MIN_TURNOVER
  )

  console.log(`基础筛选后: ${baseFiltered.length} 只`)

  // 第二轮筛选：稳定性过滤
  const stableFiltered = baseFiltered.filter(s => isStableRising(s, CONFIG))
  console.log(`稳定性过滤后: ${stableFiltered.length} 只`)

  // 如果稳定性过滤后太少，放宽条件
  const filtered = stableFiltered.length >= 5 ? stableFiltered : baseFiltered
  console.log(`最终候选: ${filtered.length} 只`)

  // 获取K线数据（用于趋势和量价分析）
  console.log("获取K线数据...")
  const codes = filtered.map(s => s.code.startsWith('sh') || s.code.startsWith('sz') 
    ? s.code 
    : (s.code.startsWith('6') ? `sh${s.code}` : `sz${s.code}`))
  const klineData = await fetchKlineBatch(codes, CONFIG.KLINE_DAYS)

  // 计算各因子评分
  for (const stock of filtered) {
    const fullCode = stock.code.startsWith('sh') || stock.code.startsWith('sz') 
      ? stock.code 
      : (stock.code.startsWith('6') ? `sh${stock.code}` : `sz${stock.code}`)
    const kline = klineData[fullCode] || []

    // 原有因子
    const momentum = calcMomentum(stock)
    const turnover = calcTurnover(stock)
    const capital = calcCapitalFlow(stock)
    const sector = calcSectorHot(stock)

    // 新增因子
    const trend = calcTrend(stock, kline)
    const volumePrice = calcVolumePrice(stock, kline)
    const stability = calcStability(stock)
    const trapScore = calcTrapDetect(stock, kline)
    const sentiment = calcSentiment(stock, marketSentiment)

    // 基础加权评分
    stock.score = calcScore({
      momentum,
      turnover,
      capital,
      trend,
      volumePrice,
      stability,
      sector
    })

    // 保存额外评分
    stock._trapScore = trapScore
    stock._sentimentBonus = sentiment

    // 保存详情用于排序和调试
    stock._momentumDetail = getMomentumDetail(stock)
    stock._turnoverDetail = getTurnoverDetail(stock)
    stock._capitalDetail = getCapitalDetail(stock)
    stock._sectorDetail = getSectorDetail(stock)
    stock._trendDetail = getTrendDetail(stock, kline)
    stock._volumePriceDetail = getVolumePriceDetail(stock)
    stock._stabilityDetail = getStabilityDetail(stock)
    stock._trapDetail = getTrapDetail(stock, kline)
    stock._kline = kline
  }

  // 识别龙头
  const leaders = detectLeaders(filtered)

  // 计算最终评分
  filtered.forEach(s => {
    const leaderBonus = leaders.includes(s.code) ? CONFIG.LEADER_BONUS : 0
    const sentimentBonus = s._sentimentBonus || 0
    const trapScore = s._trapScore || 0
    
    // 最终评分 = 基础分 + 诱多扣分 + 龙头加分 + 情绪加成
    s.score = Number((s.score + trapScore + leaderBonus + sentimentBonus).toFixed(2))
    s._leaderBonus = leaderBonus
    s._sentimentBonus = sentimentBonus
    s._trapScoreFinal = trapScore
  })

  // 多级排序
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b._trendDetail !== a._trendDetail) return b._trendDetail - a._trendDetail
    if (b._stabilityDetail !== a._stabilityDetail) return a._stabilityDetail - b._stabilityDetail  // 振幅小优先
    return b._capitalDetail - a._capitalDetail
  })

  // 过滤低于分数阈值的股票
  const qualified = filtered.filter(s => s.score >= CONFIG.MIN_SCORE)
  const top = qualified.slice(0, CONFIG.TOP_N)

  console.log(`达标股票数量: ${qualified.length} (分数 >= ${CONFIG.MIN_SCORE})`)

  console.table(top.map(s => ({
    code: s.code,
    name: s.name,
    price: s.price,
    pct: s.pct.toFixed(1) + '%',
    amplitude: s.amplitude.toFixed(1) + '%',
    turnover: s.turnover.toFixed(1) + '%',
    score: s.score,
    trap: s._trapScoreFinal
  })))

  const outputDir = "./output"
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // 保存完整结果
  fs.writeFileSync(
    "./output/result.json",
    JSON.stringify({
      timestamp: new Date().toISOString(),
      marketSentiment: {
        ...marketSentiment,
        desc: getSentimentDesc(marketSentiment)
      },
      filterStats: {
        baseFiltered: baseFiltered.length,
        stableFiltered: stableFiltered.length,
        final: filtered.length,
        qualified: qualified.length
      },
      stocks: top.map(s => ({
        code: s.code,
        name: s.name,
        price: s.price,
        pct: s.pct,
        high: s.high,
        low: s.low,
        amplitude: s.amplitude,
        turnover: s.turnover,
        ratio: s.ratio,
        amount: s.amount,
        sector: s.sector,
        score: s.score,
        details: {
          leaderBonus: s._leaderBonus,
          sentimentBonus: s._sentimentBonus,
          trapScore: s._trapScoreFinal,
          trapReasons: s._trapDetail?.reasons || '',
          trendDays: s._trendDetail,
          stability: s._stabilityDetail
        }
      }))
    }, null, 2)
  )

  // 推送到微信
  console.log("\n推送到微信...")
  await sendStockResult(
    top.map(s => ({
      code: s.code,
      name: s.name,
      price: s.price,
      pct: s.pct.toFixed(1),
      turnover: s.turnover.toFixed(1),
      amount: (s.amount / 1e8).toFixed(0) + '亿',
      score: s.score,
      sector: s.sector,
      trapReason: s._trapDetail?.reasons || '',
      trendDays: s._trendDetail || 0,
      amplitude: s.amplitude.toFixed(1),
      ratio: s.ratio.toFixed(2)
    })),
    {
      ...marketSentiment,
      desc: getSentimentDesc(marketSentiment)
    }
  )

}

// 启动模式
const args = process.argv.slice(2)
const mode = args[0] || 'now'

if (mode === 'schedule') {
  // 定时模式：周一至周五 14:48 执行
  startScheduler(run)
} else {
  // 立即执行模式（默认）
  run().catch(console.error)
}