/**
 * 诱多/诱空形态识别因子
 * 核心逻辑：识别主力诱多出货或诱空洗盘的形态
 */

/**
 * 计算诱多识别评分
 * @param {Object} stock - 股票数据
 * @param {Array} kline - K线数据（可选，用于更精确判断）
 * @returns {Object} { score, isTrapUp, isTrapDown, reasons }
 */
export function calcTrapScore(stock, kline = []) {
  const result = {
    score: 0,
    isTrapUp: false,    // 诱多
    isTrapDown: false,  // 诱空
    reasons: []
  }
  
  const { price, high, low, openPrice, prevClose, pct, volume, ratio, amplitude } = stock
  
  // 1. 冲高回落识别（诱多）
  if (high > 0 && price > 0) {
    const pullback = ((high - price) / high) * 100
    
    // 涨幅高但回撤大
    if (pct > 5 && pullback > 3) {
      result.score -= 1
      result.isTrapUp = true
      result.reasons.push('冲高回落')
    }
    
    // 涨幅接近涨停但大幅回落
    if (pct > 7 && pullback > 2) {
      result.score -= 1.5
      result.isTrapUp = true
      result.reasons.push('涨停板出货')
    }
  }
  
  // 2. 尾盘拉升识别（诱多）
  // 如果开盘价低于昨收，但现在是上涨的，可能是尾盘拉升
  if (openPrice > 0 && prevClose > 0) {
    const openPct = ((openPrice - prevClose) / prevClose) * 100
    const intraDayGain = pct - openPct
    
    // 低开高走，盘中涨幅超过5%
    if (openPct < -1 && intraDayGain > 5) {
      result.score -= 0.5
      result.reasons.push('低开急拉')
    }
    
    // 高开低走但仍是上涨（出货）
    if (openPct > 2 && intraDayGain < -1 && pct > 0) {
      result.score -= 1
      result.isTrapUp = true
      result.reasons.push('高开回落')
    }
  }
  
  // 3. 量价背离识别
  // 放量滞涨或缩量大涨
  if (ratio > 2.5 && pct < 3) {
    result.score -= 0.5
    result.reasons.push('放量滞涨')
  }
  
  if (ratio < 0.8 && pct > 6) {
    // 缩量大涨，可能是真突破也可能是诱多
    // 需要看前期走势，这里暂不加也不减
  }
  
  // 4. 振幅过大（不确定性高）
  if (amplitude > 10) {
    result.score -= 0.5
    result.reasons.push('振幅过大')
  }
  
  // 5. 诱空识别（洗盘，反而是机会）
  if (low > 0 && price > 0) {
    const bounce = ((price - low) / low) * 100
    
    // 盘中大跌但收盘回升
    if (low < prevClose * 0.97 && pct > 0) {
      result.score += 0.5
      result.isTrapDown = true
      result.reasons.push('探底回升')
    }
  }
  
  // 6. K线形态辅助判断
  if (kline && kline.length >= 3) {
    const last3 = kline.slice(-3)
    const today = last3[2]
    
    // 连续上涨后的放量滞涨
    if (last3[0].pct > 0 && last3[1].pct > 0 && pct > 0 && pct < 2 && ratio > 2) {
      result.score -= 0.5
      result.reasons.push('连涨后放量滞涨')
    }
  }
  
  result.score = Number(result.score.toFixed(2))
  
  return result
}

/**
 * 简化版诱多评分（仅返回分数）
 */
export function calcTrapDetect(stock, kline = []) {
  const result = calcTrapScore(stock, kline)
  return result.score
}

/**
 * 获取诱多形态详情
 */
export function getTrapDetail(stock, kline = []) {
  const result = calcTrapScore(stock, kline)
  return {
    isTrapUp: result.isTrapUp,
    isTrapDown: result.isTrapDown,
    reasons: result.reasons.join(',')
  }
}
