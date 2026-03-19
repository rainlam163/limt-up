import fs from "fs"

import { CONFIG } from "./config.js"

import { fetchAllStocks, fetchStocksLightweight } from "./services/market.js"
import { fetchKlineBatch } from "./services/kline.js"
import { fetchSectorRanking, fetchStockSectorsBatch, getStockSectorPct, getHotSectorAvgPct } from "./services/sector.js"
import { runSellAdvice1, runSellAdvice2 } from "./services/sellStrategy.js"

import { calcMomentum, getMomentumDetail } from "./factors/momentum.js"
import { calcTurnover, getTurnoverDetail } from "./factors/turnover.js"
import { calcCapitalFlow, getCapitalDetail } from "./factors/capitalFlow.js"
import { calcTrend, getTrendDetail } from "./factors/trend.js"
import { calcVolumePrice, getVolumePriceDetail } from "./factors/volumePrice.js"
import { calcSentiment, calcMarketSentiment, getSentimentDesc } from "./factors/sentiment.js"
import { calcStability, getStabilityDetail, isStableRising } from "./factors/stability.js"
import { calcTrapDetect, getTrapDetail } from "./factors/trapDetect.js"
import { calcSectorHot, getSectorDetail } from "./factors/sectorHot.js"

import { calcFullScore, getDynamicWeights, getPctRange } from "./utils/score.js"
import { sendStockResult, sendSellAdvice, sendBuyAlert } from "./utils/push.js"
import { startScheduler } from "./scheduler.js"


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

// 判断换手率是否过高
function isTurnoverTooHigh(turnover, pct) {
  if (turnover > 25) return true
  if (turnover > 20 && pct > 5) return true
  return false
}


async function run(isDev = false) {

  console.log("获取市场数据...")
  const stocks = await fetchAllStocks()

  // 计算市场情绪
  console.log("计算市场情绪...")
  const marketSentiment = calcMarketSentiment(stocks)
  console.log(`市场情绪: ${getSentimentDesc(marketSentiment)}`)

  // 根据情绪获取动态涨幅区间
  const pctRange = getPctRange(marketSentiment.sentiment)
  const minPct = Math.max(CONFIG.MIN_PCT, pctRange.minPct)
  const maxPct = Math.min(CONFIG.MAX_PCT, pctRange.maxPct)
  console.log(`涨幅区间: ${minPct}% ~ ${maxPct}%`)

  // 第一轮筛选：基础条件
  const baseFiltered = stocks.filter(s =>
    isMainBoard(s.code) &&
    !isST(s.name) &&
    s.pct >= minPct &&
    s.pct < maxPct &&
    s.price > CONFIG.MIN_PRICE &&
    s.price < CONFIG.MAX_PRICE &&
    s.turnover > CONFIG.MIN_TURNOVER &&
    !isTurnoverTooHigh(s.turnover, s.pct)
  )

  console.log(`基础筛选后: ${baseFiltered.length} 只`)

  // 第二轮筛选：稳定性过滤
  const stabilityThreshold = marketSentiment.sentiment < 0 ? 10 : CONFIG.MAX_AMPLITUDE
  const stableFiltered = baseFiltered.filter(s => s.amplitude < stabilityThreshold)
  console.log(`稳定性过滤后: ${stableFiltered.length} 只`)

  const filtered = stableFiltered.length >= 5 ? stableFiltered : baseFiltered
  console.log(`最终候选: ${filtered.length} 只`)

  if (filtered.length === 0) {
    console.log("没有符合条件的股票")
    return
  }

  // 获取K线数据
  console.log("获取K线数据...")
  const codes = filtered.map(s => s.code.startsWith('sh') || s.code.startsWith('sz') 
    ? s.code 
    : (s.code.startsWith('6') ? `sh${s.code}` : `sz${s.code}`))
  const klineData = await fetchKlineBatch(codes, CONFIG.KLINE_DAYS)

  // 获取板块数据（市场热度）
  console.log("获取板块数据...")
  const sectorRanking = await fetchSectorRanking()
  const hotSectorPct = getHotSectorAvgPct()
  console.log(`热门板块平均涨幅: ${hotSectorPct.toFixed(2)}%`)

  // 爬取板块成分股，建立股票-板块映射
  console.log("爬取板块成分股映射...")
  const stockSectorMap = await fetchStockSectorsBatch(codes)
  console.log(`股票-板块映射: ${Object.keys(stockSectorMap).length} 条`)

  // 获取动态权重
  const dynamicWeights = getDynamicWeights(marketSentiment.sentiment)
  console.log(`动态权重: 趋势${(dynamicWeights.trend*100).toFixed(0)}% 量价${(dynamicWeights.volumePrice*100).toFixed(0)}% 稳定${(dynamicWeights.stability*100).toFixed(0)}% 动量${(dynamicWeights.momentum*100).toFixed(0)}%`)

  // 计算各因子评分
  for (const stock of filtered) {
    const fullCode = stock.code.startsWith('sh') || stock.code.startsWith('sz') 
      ? stock.code 
      : (stock.code.startsWith('6') ? `sh${stock.code}` : `sz${stock.code}`)
    const kline = klineData[fullCode] || []

    // 计算各因子得分
    const momentum = calcMomentum(stock)
    const turnover = calcTurnover(stock)
    const capital = calcCapitalFlow(stock)
    const trend = calcTrend(stock, kline)
    const volumePrice = calcVolumePrice(stock, kline)
    const stability = calcStability(stock)
    const trapScore = calcTrapDetect(stock, kline)
    const sentimentBonus = calcSentiment(stock, marketSentiment)

    // 获取个股对应板块的真实涨幅
    const stockCode = stock.code.startsWith('sh') || stock.code.startsWith('sz') 
      ? stock.code.substring(2) 
      : stock.code
    const sectorPct = getStockSectorPct(stockCode, sectorRanking, stockSectorMap)
    const sectorScore = calcSectorHot({ pct: sectorPct })

    // 板块热度加成
    let sectorBonus = 0
    if (sectorPct > 3) sectorBonus = 0.5
    if (sectorPct > 5) sectorBonus = 1

    // 计算完整评分
    const scoreResult = calcFullScore({
      momentum,
      turnover,
      capital,
      trend,
      volumePrice,
      stability,
      sector: sectorScore,
      marketSentiment: marketSentiment.sentiment,
      stockTurnover: stock.turnover,
      stockPct: stock.pct,
      trapScore,
      sentimentBonus,
      sectorBonus
    })

    stock.score = scoreResult.finalScore
    stock._baseScore = scoreResult.baseScore
    stock._weights = scoreResult.weights
    stock._turnoverRisk = scoreResult.turnoverRisk
    stock._turnoverRiskLevel = scoreResult.turnoverRiskLevel
    stock._sectorPct = sectorPct
    stock._sectorBonus = sectorBonus
    stock._trapScore = trapScore
    stock._sentimentBonus = sentimentBonus

    // 保存详情
    stock._trendDetail = getTrendDetail(stock, kline)
    stock._stabilityDetail = getStabilityDetail(stock)
    stock._trapDetail = getTrapDetail(stock, kline)
    stock._kline = kline
  }

  // 多级排序
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b._sectorPct !== a._sectorPct) return b._sectorPct - a._sectorPct
    if (b._trendDetail !== a._trendDetail) return b._trendDetail - a._trendDetail
    if (a._stabilityDetail !== b._stabilityDetail) return a._stabilityDetail - b._stabilityDetail
    return b.amount - a.amount
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
    sectorPct: (s._sectorPct || 0).toFixed(1) + '%',
    score: s.score,
    trap: s._trapScore
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
      weights: dynamicWeights,
      pctRange: { minPct, maxPct },
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
        sectorPct: s._sectorPct,
        score: s.score,
        baseScore: s._baseScore,
        details: {
          sentimentBonus: s._sentimentBonus,
          sectorBonus: s._sectorBonus,
          trapScore: s._trapScore,
          trapReasons: s._trapDetail?.reasons || '',
          turnoverRisk: s._turnoverRisk,
          turnoverRiskLevel: s._turnoverRiskLevel,
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
      sectorPct: (s._sectorPct || 0).toFixed(1),
      trapReason: s._trapDetail?.reasons || '',
      trendDays: s._trendDetail || 0,
      amplitude: s.amplitude.toFixed(1),
      ratio: s.ratio.toFixed(2)
    })),
    {
      ...marketSentiment,
      desc: getSentimentDesc(marketSentiment)
    },
    isDev
  )

}

/**
 * 执行买入预警（14:35轻量级筛选）
 */
async function runBuyAlert(isDev = false) {
  console.log("\n=== 买入预警 ===")
  
  // 轻量级获取股票数据
  const stocks = await fetchStocksLightweight()
  
  // 计算市场情绪
  const marketSentiment = calcMarketSentiment(stocks)
  console.log(`市场情绪: ${getSentimentDesc(marketSentiment)}`)
  
  // 根据情绪获取动态涨幅区间
  const pctRange = getPctRange(marketSentiment.sentiment)
  const minPct = Math.max(CONFIG.MIN_PCT, pctRange.minPct)
  const maxPct = Math.min(CONFIG.MAX_PCT, pctRange.maxPct)
  
  // 基础筛选
  const filtered = stocks.filter(s =>
    isMainBoard(s.code) &&
    !isST(s.name) &&
    s.pct >= minPct &&
    s.pct < maxPct &&
    s.price > CONFIG.MIN_PRICE &&
    s.price < CONFIG.MAX_PRICE &&
    s.turnover > CONFIG.MIN_TURNOVER &&
    !isTurnoverTooHigh(s.turnover, s.pct) &&
    s.amplitude < CONFIG.MAX_AMPLITUDE
  )
  
  console.log(`候选股票: ${filtered.length} 只`)
  
  if (filtered.length === 0) {
    console.log("没有符合条件的股票")
    return
  }
  
  // 简单评分排序（不用K线）
  const scored = filtered.map(s => {
    let score = 0
    // 涨幅得分
    score += s.pct * 0.3
    // 换手率得分
    if (s.turnover > 5 && s.turnover < 15) score += 2
    else if (s.turnover > 3) score += 1
    // 成交额得分
    if (s.amount > 5e8) score += 1
    if (s.amount > 10e8) score += 1
    
    return { ...s, score }
  })
  
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.amount - a.amount
  })
  
  const top = scored.slice(0, 10)
  
  console.log("\n预警候选:")
  console.table(top.map(s => ({
    code: s.code,
    name: s.name,
    price: s.price,
    pct: s.pct.toFixed(1) + '%',
    turnover: s.turnover.toFixed(1) + '%',
    amplitude: s.amplitude.toFixed(1) + '%',
    score: s.score.toFixed(1)
  })))
  
  // 推送预警
  console.log("\n推送买入预警...")
  await sendBuyAlert(
    top.map(s => ({
      code: s.code,
      name: s.name,
      price: s.price,
      pct: s.pct.toFixed(1),
      turnover: s.turnover.toFixed(1),
      amount: (s.amount / 1e8).toFixed(0) + '亿',
      score: s.score.toFixed(1),
      amplitude: s.amplitude.toFixed(1)
    })),
    {
      ...marketSentiment,
      desc: getSentimentDesc(marketSentiment)
    },
    isDev
  )
}

/**
 * 执行卖出建议（第1次/第2次通用）
 */
async function runSell(isFirst = false, isDev = false) {
  const sellResult = isFirst 
    ? await runSellAdvice1() 
    : await runSellAdvice2()
  
  if (!sellResult || sellResult.stocks.length === 0) {
    console.log("没有需要分析的持仓")
    return
  }
  
  console.log("\n持仓分析结果:")
  console.table(sellResult.stocks.map(s => ({
    code: s.code,
    name: s.name,
    pnlPct: s.pnlPct + '%',
    action: s.action
  })))
  
  // 推送到微信
  console.log("\n推送卖出建议...")
  await sendSellAdvice(sellResult, isDev)
}

// 启动模式
const args = process.argv.slice(2)
const mode = args[0] || 'now'

if (mode === 'schedule') {
  // 定时模式：启动四个定时任务
  startScheduler({
    buyAlert: () => runBuyAlert().catch(console.error),    // 14:35 买入预警
    buyConfirm: () => run().catch(console.error),          // 14:48 买入确认
    sell1: () => runSell(true).catch(console.error),       // 09:32 卖出建议1
    sell2: () => runSell(false).catch(console.error)       // 09:50 卖出建议2
  })
} else if (mode === 'dev') {
  run(true).catch(console.error)
} else if (mode === 'alert') {
  // 单独执行买入预警
  runBuyAlert(true).catch(console.error)
} else if (mode === 'sell1') {
  // 单独执行卖出建议1
  runSell(true, true).catch(console.error)
} else if (mode === 'sell2') {
  // 单独执行卖出建议2
  runSell(false, true).catch(console.error)
} else if (mode === 'sell') {
  // 默认执行卖出建议2（详细版）
  runSell(false, true).catch(console.error)
} else {
  run().catch(console.error)
}