/**
 * 综合评分计算
 * 
 * 新因子权重体系：
 * - 动量因子: 15% (原35%，降低单日涨幅权重)
 * - 换手率因子: 10% (原25%)
 * - 资金因子: 10% (原25%)
 * - 趋势延续: 25% (新增，连续上涨更有持续性)
 * - 量价健康: 20% (新增，缩量上涨更健康)
 * - 板块热度: 10% (原15%，降低)
 * 
 * 市场情绪：作为全市场加成单独计算
 */

// 因子权重配置
export const FACTOR_WEIGHTS = {
  momentum: 0.15,    // 动量因子
  turnover: 0.10,    // 换手率因子
  capital: 0.10,     // 资金因子
  trend: 0.25,       // 趋势延续因子
  volumePrice: 0.20, // 量价健康因子
  sector: 0.10       // 板块热度因子
}

/**
 * 计算加权综合评分
 * @param {Object} factors - 各因子分数
 * @returns {number} 综合评分
 */
export function calcScore(factors) {
  const score = 
    (factors.momentum || 0) * FACTOR_WEIGHTS.momentum +
    (factors.turnover || 0) * FACTOR_WEIGHTS.turnover +
    (factors.capital || 0) * FACTOR_WEIGHTS.capital +
    (factors.trend || 0) * FACTOR_WEIGHTS.trend +
    (factors.volumePrice || 0) * FACTOR_WEIGHTS.volumePrice +
    (factors.sector || 0) * FACTOR_WEIGHTS.sector

  return Number(score.toFixed(2))
}

/**
 * 计算最终评分（含龙头加分和市场情绪）
 * @param {number} baseScore - 基础加权评分
 * @param {number} leaderBonus - 龙头加分
 * @param {number} sentimentBonus - 市场情绪加成
 * @returns {number} 最终评分
 */
export function calcFinalScore(baseScore, leaderBonus = 0, sentimentBonus = 0) {
  const finalScore = baseScore + leaderBonus + sentimentBonus
  return Number(finalScore.toFixed(2))
}
