import fs from "fs"

import { CONFIG } from "./config.js"

import { fetchAllStocks } from "./services/market.js"

import { calcMomentum, getMomentumDetail } from "./factors/momentum.js"
import { calcTurnover, getTurnoverDetail } from "./factors/turnover.js"
import { calcCapitalFlow, getCapitalDetail } from "./factors/capitalFlow.js"
import { calcSectorHot, getSectorDetail } from "./factors/sectorHot.js"

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

  const filtered = stocks.filter(s =>
    isMainBoard(s.code) &&
    !isST(s.name) &&
    s.pct >= 3 &&
    s.pct < 9.5 &&
    s.price > CONFIG.MIN_PRICE &&
    s.price < CONFIG.MAX_PRICE &&
    s.turnover > CONFIG.MIN_TURNOVER
  )

  console.log("过滤后股票数量:", filtered.length)

  // 计算基础评分
  for (const stock of filtered) {

    const momentum = calcMomentum(stock)
    const turnover = calcTurnover(stock)
    const capital = calcCapitalFlow(stock)
    const sector = calcSectorHot(stock)

    stock.score = calcScore({
      momentum,
      turnover,
      capital,
      sector
    })

    stock._momentumDetail = getMomentumDetail(stock)
    stock._turnoverDetail = getTurnoverDetail(stock)
    stock._capitalDetail = getCapitalDetail(stock)
    stock._sectorDetail = getSectorDetail(stock)

  }

  // 识别龙头
  const leaders = detectLeaders(filtered)

  // 龙头加分
  filtered.forEach(s => {
    if (leaders.includes(s.code)) {
      s.score += CONFIG.LEADER_BONUS
    }
  })

  // 多级排序
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b._momentumDetail !== a._momentumDetail) return b._momentumDetail - a._momentumDetail
    if (b._capitalDetail !== a._capitalDetail) return b._capitalDetail - a._capitalDetail
    return b._turnoverDetail - a._turnoverDetail
  })

  const top = filtered.slice(0, CONFIG.TOP_N)

  console.table(top.map(s => ({
    code: s.code,
    name: s.name,
    price: s.price,
    pct: s.pct.toFixed(1) + '%',
    turnover: s.turnover.toFixed(1) + '%',
    amount: (s.amount / 1e8).toFixed(0) + '亿',
    sector: s.sector,
    score: s.score
  })))

  fs.writeFileSync(
    "./output/result.json",
    JSON.stringify(top, null, 2)
  )

  // 推送到微信
  console.log("\n推送到微信...")
  await sendStockResult(top.map(s => ({
    code: s.code,
    name: s.name,
    price: s.price,
    pct: s.pct.toFixed(1),
    turnover: s.turnover.toFixed(1),
    amount: (s.amount / 1e8).toFixed(0) + '亿',
    score: s.score
  })))

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