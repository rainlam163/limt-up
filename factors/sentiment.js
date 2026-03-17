/**
 * 市场情绪因子
 * 核心逻辑：大盘好时个股更容易表现，情绪高涨时机会多
 */

// 大盘指数代码
const INDEX_CODES = {
  sh: 'sh000001',   // 上证指数
  sz: 'sz399001'    // 深证成指
}

/**
 * 计算市场整体情绪
 * @param {Array} allStocks - 全市场股票数据
 * @returns {Object} 情绪指标 { limitUpCount, limitDownCount, avgPct, sentiment }
 */
export function calcMarketSentiment(allStocks) {
  if (!allStocks || allStocks.length === 0) {
    return { limitUpCount: 0, limitDownCount: 0, avgPct: 0, sentiment: 0 }
  }
  
  // 统计涨停家数（涨幅>=9.5%）
  const limitUpCount = allStocks.filter(s => s.pct >= 9.5).length
  
  // 统计跌停家数（涨幅<=-9.5%）
  const limitDownCount = allStocks.filter(s => s.pct <= -9.5).length
  
  // 计算市场平均涨幅（排除极端值）
  const validPcts = allStocks.filter(s => Math.abs(s.pct) < 15).map(s => s.pct)
  const avgPct = validPcts.length > 0 
    ? validPcts.reduce((a, b) => a + b, 0) / validPcts.length 
    : 0
  
  // 计算涨跌比
  const upCount = allStocks.filter(s => s.pct > 0).length
  const downCount = allStocks.filter(s => s.pct < 0).length
  const upDownRatio = downCount > 0 ? upCount / downCount : upCount
  
  // 综合情绪得分 (-5 到 5)
  let sentiment = 0
  
  // 涨停家数贡献
  if (limitUpCount >= 100) sentiment += 2
  else if (limitUpCount >= 50) sentiment += 1
  else if (limitUpCount >= 20) sentiment += 0.5
  
  // 跌停家数影响
  if (limitDownCount >= 50) sentiment -= 2
  else if (limitDownCount >= 20) sentiment -= 1
  else if (limitDownCount >= 10) sentiment -= 0.5
  
  // 涨跌比影响
  if (upDownRatio >= 3) sentiment += 1
  else if (upDownRatio <= 0.33) sentiment -= 1
  
  // 平均涨幅影响
  if (avgPct > 1) sentiment += 1
  else if (avgPct < -1) sentiment -= 1
  
  return {
    limitUpCount,
    limitDownCount,
    avgPct: Number(avgPct.toFixed(2)),
    upDownRatio: Number(upDownRatio.toFixed(2)),
    sentiment: Number(sentiment.toFixed(2))
  }
}

/**
 * 根据市场情绪计算个股的情绪加成
 * @param {Object} marketSentiment - 市场情绪数据
 * @returns {number} 加成分数 (-2 到 2)
 */
export function calcSentimentBonus(marketSentiment) {
  const { sentiment, limitUpCount, limitDownCount } = marketSentiment
  
  let bonus = 0
  
  // 基于情绪得分
  if (sentiment >= 3) bonus = 2      // 极好
  else if (sentiment >= 1.5) bonus = 1  // 好
  else if (sentiment >= 0) bonus = 0.5  // 一般偏多
  else if (sentiment >= -1.5) bonus = 0 // 一般偏空
  else bonus = -1  // 差
  
  // 极端情况调整
  if (limitDownCount > 50) {
    bonus = Math.min(bonus, 0)  // 跌停过多，不加分
  }
  
  return Number(bonus.toFixed(2))
}

/**
 * 个股情绪评分（考虑市场情绪后的个股评分调整）
 * @param {Object} stock - 股票数据
 * @param {Object} marketSentiment - 市场情绪数据
 * @returns {number} 评分 (最高2分，最低-1分)
 */
export function calcSentiment(stock, marketSentiment) {
  if (!marketSentiment) {
    return 0
  }
  
  return calcSentimentBonus(marketSentiment)
}

/**
 * 获取市场情绪描述
 */
export function getSentimentDesc(marketSentiment) {
  const { sentiment, limitUpCount, limitDownCount, upDownRatio } = marketSentiment
  
  if (sentiment >= 3) return `极好`
  if (sentiment >= 1.5) return `偏多`
  if (sentiment >= 0) return `平稳`
  if (sentiment >= -1.5) return `偏空`
  return `极差`
}
