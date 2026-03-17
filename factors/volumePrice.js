/**
 * 量价健康因子
 * 核心逻辑：缩量上涨比放量上涨更健康（抛压轻）
 */

/**
 * 计算量价健康评分
 * @param {Object} stock - 股票数据（包含 ratio 量比, pct 涨幅）
 * @param {Array} kline - K线数据 [{date, open, close, high, low, volume, pct}]
 * @returns {number} 评分 (最高5分)
 */
export function calcVolumePrice(stock, kline = []) {
  let score = 0
  
  const ratio = stock.ratio || 0
  const pct = stock.pct || 0
  
  // 1. 量比评分 (最高3分)
  // 缩量上涨（量比<1）最健康，放量适中（1-2）次之，巨量（>3）风险大
  if (pct > 0) {  // 上涨时
    if (ratio < 1) {
      score += 3  // 缩量上涨，抛压轻，后续有空间
    } else if (ratio < 1.5) {
      score += 2  // 温和放量，健康
    } else if (ratio < 2.5) {
      score += 1  // 放量适中
    } else if (ratio > 3 && pct > 7) {
      score -= 1  // 巨量+大涨，可能是主力出货
    }
  }
  
  // 2. 量价配合度（使用K线数据）
  if (kline && kline.length >= 2) {
    const today = kline[kline.length - 1]
    const yesterday = kline[kline.length - 2]
    
    // 量增价涨：健康
    if (today.pct > 0 && yesterday.pct > 0) {
      // 连续两天上涨，检查量能变化
      const volChange = today.volume / yesterday.volume
      
      if (volChange < 1) {
        // 缩量连续上涨，非常健康
        score += 2
      } else if (volChange >= 1 && volChange < 1.5) {
        // 温和放量上涨
        score += 1
      } else if (volChange > 2.5 && today.pct > 6) {
        // 巨量拉升，可能见顶
        score -= 1
      }
    }
  }
  
  // 3. 涨幅与量比匹配度（最高0分，最低-1分）
  // 涨幅小但量比大，说明买盘不坚决
  if (pct >= 3 && pct < 5 && ratio > 2) {
    score -= 1  // 小涨但放量，资金分歧大
  }
  
  return Number(score.toFixed(2))
}

/**
 * 获取量价详情（用于排序）
 */
export function getVolumePriceDetail(stock) {
  // 返回量比，越小越好（缩量上涨）
  return stock.ratio || 0
}
