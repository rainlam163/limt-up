/**
 * 趋势延续因子
 * 核心逻辑：连续上涨的股票比单日大涨更有持续性
 */

/**
 * 计算趋势延续评分
 * @param {Object} stock - 股票数据
 * @param {Array} kline - K线数据 [{date, open, close, high, low, volume, pct}]
 * @returns {number} 评分 (最高6分)
 */
export function calcTrend(stock, kline = []) {
  if (!kline || kline.length < 3) {
    return 0
  }
  
  let score = 0
  
  // 1. 连续上涨天数评分 (最高3分)
  let upDays = 0
  for (let i = kline.length - 1; i >= 0; i--) {
    if (kline[i].pct > 0) {
      upDays++
    } else {
      break
    }
  }
  
  if (upDays >= 3) score += 3
  else if (upDays >= 2) score += 2
  else if (upDays >= 1) score += 1
  
  // 2. 3日累计涨幅评分 (最高2分)
  // 适中涨幅加分，过高减分（可能已经涨太多了）
  if (kline.length >= 3) {
    const last3 = kline.slice(-3)
    const cumulativePct = last3.reduce((sum, d) => sum + d.pct, 0)
    
    if (cumulativePct >= 5 && cumulativePct <= 15) {
      score += 2  // 适中涨幅，有延续性
    } else if (cumulativePct > 15 && cumulativePct <= 20) {
      score += 1  // 涨幅较大，可能调整
    } else if (cumulativePct > 20) {
      score -= 1  // 涨幅过大，风险较高
    }
  }
  
  // 3. 均线多头排列 (最高1分)
  // 简化：用最近收盘价与前几天收盘价比较
  if (kline.length >= 5) {
    const closes = kline.slice(-5).map(d => d.close)
    const ma5 = closes.reduce((a, b) => a + b, 0) / 5
    
    // 当前价格高于5日均价
    if (stock.price > ma5) {
      score += 1
    }
  }
  
  return Number(score.toFixed(2))
}

/**
 * 获取趋势详情（用于排序）
 */
export function getTrendDetail(stock, kline = []) {
  if (!kline || kline.length < 1) return 0
  
  // 计算连续上涨天数
  let upDays = 0
  for (let i = kline.length - 1; i >= 0; i--) {
    if (kline[i].pct > 0) {
      upDays++
    } else {
      break
    }
  }
  
  return upDays
}
