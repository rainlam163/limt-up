/**
 * 走势稳定性因子
 * 核心逻辑：走势平稳的股票收盘前后一致性更好
 */

/**
 * 计算走势稳定性评分
 * @param {Object} stock - 股票数据
 * @returns {number} 评分 (最高5分，最低-2分)
 */
export function calcStability(stock) {
  let score = 0
  
  const { price, high, low, openPrice, prevClose, pct, amplitude } = stock
  
  // 1. 振幅评分（最高2分）
  // 振幅小说明波动小，收盘变化也小
  if (amplitude <= 5) {
    score += 2  // 振幅小，非常稳定
  } else if (amplitude <= 7) {
    score += 1  // 振幅适中
  } else if (amplitude > 10) {
    score -= 1  // 振幅过大，不稳定
  }
  
  // 2. 回撤评分（最高2分）
  // 当前价与最高价差距小说明没有冲高回落
  if (high > 0 && price > 0) {
    const pullback = ((high - price) / high) * 100
    
    if (pullback < 1) {
      score += 2  // 几乎没有回撤，在最高点附近
    } else if (pullback < 2) {
      score += 1  // 轻微回撤
    } else if (pullback > 4) {
      score -= 1  // 回撤过大，可能冲高回落
    }
  }
  
  // 3. 价格位置评分（最高1分）
  // 当前价接近最高价说明强势
  if (high > low) {
    const position = (price - low) / (high - low)  // 0~1之间，1表示在最高点
    
    if (position > 0.8) {
      score += 1  // 在高位区间
    } else if (position < 0.3) {
      score -= 1  // 在低位区间，可能走弱
    }
  }
  
  // 4. 开盘位置与涨幅关系（诱多识别补充）
  // 如果开盘跌幅大但现在是涨幅，可能是拉升出货
  if (openPrice > 0 && prevClose > 0) {
    const openPct = ((openPrice - prevClose) / prevClose) * 100
    const intraDayGain = pct - openPct  // 盘中涨幅
    
    // 如果开盘跌，盘中拉升超过4%，可能有诱多嫌疑
    if (openPct < 0 && intraDayGain > 4) {
      score -= 1
    }
  }
  
  return Number(score.toFixed(2))
}

/**
 * 获取稳定性详情（用于排序）
 */
export function getStabilityDetail(stock) {
  // 返回振幅，越小越好
  return stock.amplitude || 0
}

/**
 * 判断是否为稳定上涨（用于筛选）
 */
export function isStableRising(stock, config = {}) {
  const { MAX_AMPLITUDE = 8, MAX_PULLBACK = 3 } = config
  
  const { price, high, amplitude } = stock
  
  // 振幅检查
  if (amplitude > MAX_AMPLITUDE) return false
  
  // 回撤检查
  if (high > 0 && price > 0) {
    const pullback = ((high - price) / high) * 100
    if (pullback > MAX_PULLBACK) return false
  }
  
  return true
}
