/**
 * 综合评分计算
 * 
 * 优化后的因子权重体系（提高收盘一致性）：
 * - 趋势延续: 30% (连续上涨更有持续性，权重提升)
 * - 量价健康: 25% (缩量上涨更健康，权重提升)
 * - 走势稳定性: 10% (新增，预测收盘一致性)
 * - 动量因子: 10% (原15%，降低盘中涨幅权重)
 * - 换手率因子: 5% (原10%，收盘前会变化)
 * - 资金因子: 10% (不变)
 * - 板块热度: 10% (不变)
 * 
 * 额外因子（独立计算）：
 * - 诱多识别: 减分项
 * - 市场情绪: 加成项
 */

// 因子权重配置
export const FACTOR_WEIGHTS = {
  trend: 0.30,       // 趋势延续因子（权重最高）
  volumePrice: 0.25, // 量价健康因子
  stability: 0.10,   // 走势稳定性因子
  momentum: 0.10,    // 动量因子（降低）
  turnover: 0.05,    // 换手率因子（降低）
  capital: 0.10,     // 资金因子
  sector: 0.10       // 板块热度因子
}

/**
 * 计算加权综合评分
 * @param {Object} factors - 各因子分数
 * @returns {number} 综合评分
 */
export function calcScore(factors) {
  const score = 
    (factors.trend || 0) * FACTOR_WEIGHTS.trend +
    (factors.volumePrice || 0) * FACTOR_WEIGHTS.volumePrice +
    (factors.stability || 0) * FACTOR_WEIGHTS.stability +
    (factors.momentum || 0) * FACTOR_WEIGHTS.momentum +
    (factors.turnover || 0) * FACTOR_WEIGHTS.turnover +
    (factors.capital || 0) * FACTOR_WEIGHTS.capital +
    (factors.sector || 0) * FACTOR_WEIGHTS.sector

  return Number(score.toFixed(2))
}

/**
 * 计算最终评分（含诱多扣分、龙头加分和市场情绪）
 * @param {number} baseScore - 基础加权评分
 * @param {number} trapScore - 诱多识别扣分（负数）
 * @param {number} leaderBonus - 龙头加分
 * @param {number} sentimentBonus - 市场情绪加成
 * @returns {number} 最终评分
 */
export function calcFinalScore(baseScore, trapScore = 0, leaderBonus = 0, sentimentBonus = 0) {
  const finalScore = baseScore + trapScore + leaderBonus + sentimentBonus
  return Number(finalScore.toFixed(2))
}