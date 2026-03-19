import axios from "axios"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULT_FILE = path.join(__dirname, "../output/result.json")

// GBK转UTF-8
function gbkToUtf8(buffer) {
  const decoder = new TextDecoder('gbk')
  return decoder.decode(buffer)
}

/**
 * 从腾讯获取实时行情
 */
async function fetchRealtimeQuotes(codes) {
  const quotes = {}
  
  // 批量请求（每次最多50只）
  const batchSize = 50
  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize)
    const query = batch.map(c => {
      const prefix = c.startsWith('6') ? 'sh' : 'sz'
      return prefix + c
    }).join(',')
    
    try {
      const res = await axios.get(`http://qt.gtimg.cn/q=${query}`, {
        responseType: 'arraybuffer',
        timeout: 10000
      })
      
      const data = gbkToUtf8(res.data)
      const lines = data.split('\n').filter(l => l.trim())
      
      for (const line of lines) {
        const match = line.match(/v_(sh|sz)(\d+)="(.+)"/)
        if (match) {
          const code = match[2]
          const fields = match[3].split('~')
          
          quotes[code] = {
            name: fields[1],
            price: parseFloat(fields[3]),      // 当前价
            prevClose: parseFloat(fields[4]),  // 昨收
            open: parseFloat(fields[5]),       // 开盘价
            high: parseFloat(fields[33]),      // 今日最高
            low: parseFloat(fields[34]),       // 今日最低
            pct: parseFloat(fields[32]),       // 今日涨幅
            volume: parseInt(fields[36]),      // 成交量
            amount: parseFloat(fields[37]),    // 成交额
            time: fields[30]                   // 更新时间
          }
        }
      }
    } catch (e) {
      console.log(`[卖出] 获取行情失败: ${e.message}`)
    }
    
    if (i + batchSize < codes.length) {
      await new Promise(r => setTimeout(r, 200))
    }
  }
  
  return quotes
}

/**
 * 计算卖出建议
 * @param {Object} stock - 昨日选股数据
 * @param {Object} quote - 实时行情
 * @param {Object} marketSentiment - 市场情绪
 * @param {boolean} isFirst - 是否第一次推送(9:32)
 */
function calcSellAdvice(stock, quote, marketSentiment, isFirst = false) {
  if (!quote) {
    return { action: '数据异常', reason: '无法获取实时行情' }
  }
  
  const buyPrice = stock.price
  const currentPrice = quote.price
  const openPrice = quote.open
  const highPrice = quote.high
  const lowPrice = quote.low
  
  // 计算各项指标
  const pnlPct = ((currentPrice - buyPrice) / buyPrice) * 100
  const openPct = ((openPrice - buyPrice) / buyPrice) * 100
  const maxPnlPct = ((highPrice - buyPrice) / buyPrice) * 100
  const maxLossPct = ((lowPrice - buyPrice) / buyPrice) * 100
  
  // 市场情绪
  const sentimentFactor = marketSentiment?.sentiment || 0
  const isBullish = sentimentFactor >= 1
  
  let action = '持有观察'
  let reason = ''
  let targetPrice = null
  let stopPrice = null
  
  // 第一次推送(9:32)：侧重开盘情况
  if (isFirst) {
    // 高开超过5%
    if (openPct >= 5) {
      action = '高开止盈'
      reason = `高开${openPct.toFixed(1)}%，建议开盘即卖`
      targetPrice = currentPrice.toFixed(2)
    }
    // 高开2-5%
    else if (openPct >= 2) {
      action = '高开观察'
      reason = `高开${openPct.toFixed(1)}%，关注是否回落`
      stopPrice = (buyPrice * 1.01).toFixed(2)
    }
    // 低开超过3%
    else if (openPct < -3) {
      action = '低开止损'
      reason = `低开${Math.abs(openPct).toFixed(1)}%，建议止损`
      targetPrice = currentPrice.toFixed(2)
    }
    // 低开1-3%
    else if (openPct < -1) {
      action = '低开观望'
      reason = `低开${Math.abs(openPct).toFixed(1)}%，观察反弹力度`
      stopPrice = (buyPrice * 0.97).toFixed(2)
    }
    // 正常开盘
    else {
      action = '持有观察'
      reason = `平开，观察走势`
      stopPrice = (buyPrice * 0.95).toFixed(2)
    }
    
    // 回落预警
    if (openPct > 1 && pnlPct < openPct * 0.7) {
      action = '高开回落'
      reason = `高开${openPct.toFixed(1)}%后回落至${pnlPct.toFixed(1)}%，建议卖出`
      targetPrice = currentPrice.toFixed(2)
    }
  }
  // 第二次推送(9:50)：综合判断
  else {
    // 涨停或接近涨停
    if (quote.pct >= 9.5) {
      action = '涨停持有'
      reason = '封板可持有，开板即卖'
      targetPrice = currentPrice.toFixed(2)
    }
    // 大幅高开回落
    else if (openPct > 5 && pnlPct < openPct * 0.5) {
      action = '高开回落，卖出'
      reason = `高开${openPct.toFixed(1)}%后回落，获利盘出逃`
      targetPrice = currentPrice.toFixed(2)
    }
    // 盈利超过5%
    else if (pnlPct >= 5) {
      action = '止盈卖出'
      reason = `盈利${pnlPct.toFixed(1)}%，建议止盈`
      targetPrice = currentPrice.toFixed(2)
    }
    // 盈利3-5%
    else if (pnlPct >= 3) {
      action = '逢高减仓'
      reason = `盈利${pnlPct.toFixed(1)}%，可逢高减半仓`
      targetPrice = (buyPrice * 1.05).toFixed(2)
      stopPrice = (buyPrice * 1.02).toFixed(2)
    }
    // 小幅盈利
    else if (pnlPct >= 1) {
      action = '持有观察'
      reason = `盈利${pnlPct.toFixed(1)}%，设止损保护`
      stopPrice = (buyPrice * 0.98).toFixed(2)
    }
    // 微盈微亏
    else if (pnlPct >= -2) {
      action = '持有观察'
      reason = `浮亏${Math.abs(pnlPct).toFixed(1)}%，观察走势`
      stopPrice = (buyPrice * 0.95).toFixed(2)
    }
    // 亏损超过止损线
    else if (pnlPct < -3) {
      action = '止损卖出'
      reason = `亏损${Math.abs(pnlPct).toFixed(1)}%，触发止损`
      targetPrice = currentPrice.toFixed(2)
    }
    // 亏损2-3%
    else {
      action = '考虑止损'
      reason = `亏损${Math.abs(pnlPct).toFixed(1)}%，接近止损线`
      stopPrice = (buyPrice * 0.97).toFixed(2)
    }
    
    // 市场情绪调整
    if (!isBullish && pnlPct > 0) {
      reason += '（市场偏弱，建议提前止盈）'
    }
  }
  
  return {
    action,
    reason,
    pnlPct: pnlPct.toFixed(2),
    openPct: openPct.toFixed(2),
    maxPnlPct: maxPnlPct.toFixed(2),
    maxLossPct: maxLossPct.toFixed(2),
    targetPrice,
    stopPrice,
    currentPrice: currentPrice.toFixed(2),
    buyPrice: buyPrice.toFixed(2)
  }
}

/**
 * 执行卖出策略（通用）
 */
async function runSell(isFirst = false) {
  const title = isFirst ? "卖出建议(第1次)" : "卖出建议(第2次)"
  console.log(`\n=== ${title} ===`)
  
  if (!fs.existsSync(RESULT_FILE)) {
    console.log("[卖出] 没有找到昨天的选股结果")
    return null
  }
  
  const result = JSON.parse(fs.readFileSync(RESULT_FILE, 'utf-8'))
  const yesterdayStocks = result.stocks || []
  
  if (yesterdayStocks.length === 0) {
    console.log("[卖出] 昨天没有选出股票")
    return null
  }
  
  console.log(`[卖出] 昨天选出 ${yesterdayStocks.length} 只股票`)
  
  // 获取实时行情
  const codes = yesterdayStocks.map(s => s.code)
  const quotes = await fetchRealtimeQuotes(codes)
  
  // 分析每只股票
  const adviceList = []
  for (const stock of yesterdayStocks) {
    const quote = quotes[stock.code]
    const advice = calcSellAdvice(stock, quote, result.marketSentiment, isFirst)
    
    adviceList.push({
      code: stock.code,
      name: stock.name || quote?.name,
      ...advice,
      yesterdayPct: stock.pct.toFixed(2),
      yesterdayScore: stock.score
    })
  }
  
  // 按盈亏排序
  adviceList.sort((a, b) => parseFloat(b.pnlPct) - parseFloat(a.pnlPct))
  
  console.log(`[卖出] 分析完成，${adviceList.length} 只股票`)
  
  return {
    timestamp: new Date().toISOString(),
    isFirst,
    yesterdayDate: result.timestamp,
    marketSentiment: result.marketSentiment,
    stocks: adviceList
  }
}

/**
 * 第一次卖出建议 (09:32)
 */
export async function runSellAdvice1() {
  return await runSell(true)
}

/**
 * 第二次卖出建议 (09:50)
 */
export async function runSellAdvice2() {
  return await runSell(false)
}

// 兼容旧接口
export const runSellStrategy = runSellAdvice2
