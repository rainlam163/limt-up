/**
 * 综合评分计算
 * 支持根据市场情绪动态调整因子权重
 */

// 基础权重配置
const BASE_WEIGHTS = {
  trend: 0.30,        // 趋势延续
  volumePrice: 0.25,  // 量价健康
  stability: 0.10,    // 走势稳定性
  momentum: 0.10,     // 动量因子
  capital: 0.10,      // 资金因子
  sector: 0.10,       // 板块热度
  turnover: 0.05      // 换手率
}

// 情绪调整系数
const EMOTION_ADJUSTMENTS = {
  // 极好：追涨优先
  veryGood: {
    momentum: 1.5,      // 动量权重提升50%
    trend: 1.2,
    stability: 0.5,     // 稳定性权重降低
    volumePrice: 0.8,
    minPct: 4,          // 涨幅下限不变
    maxPct: 9.5         // 涨幅上限放宽
  },
  // 偏多：偏重趋势
  good: {
    momentum: 1.2,
    trend: 1.1,
    stability: 0.8,
    volumePrice: 0.9,
    minPct: 4,
    maxPct: 8
  },
  // 平稳：均衡
  neutral: {
    momentum: 1.0,
    trend: 1.0,
    stability: 1.0,
    volumePrice: 1.0,
    minPct: 4,
    maxPct: 8
  },
  // 偏空：保守
  poor: {
    momentum: 0.5,      // 动量权重降低
    trend: 1.0,
    stability: 1.5,     // 稳定性权重提升
    volumePrice: 1.2,
    minPct: 4,
    maxPct: 7           // 涨幅上限收窄
  },
  // 极差：极度保守
  veryPoor: {
    momentum: 0.3,
    trend: 0.8,
    stability: 2.0,     // 稳定性最重要
    volumePrice: 1.5,
    minPct: 4,
    maxPct: 6           // 涨幅上限更保守
  }
}

/**
 * 根据市场情绪获取调整系数
 */
function getEmotionLevel(sentiment) {
  if (sentiment >= 3) return 'veryGood'
  if (sentiment >= 1.5) return 'good'
  if (sentiment >= 0) return 'neutral'
  if (sentiment >= -1.5) return 'poor'
  return 'veryPoor'
}

/**
 * 计算动态权重
 * @param {number} marketSentiment - 市场情绪得分
 * @returns {Object} 调整后的权重
 */
export function getDynamicWeights(marketSentiment) {
  const level = getEmotionLevel(marketSentiment)
  const adjustment = EMOTION_ADJUSTMENTS[level]
  
  const weights = {}
  let totalWeight = 0

  for (const [key, baseWeight] of Object.entries(BASE_WEIGHTS)) {
    const adjFactor = adjustment[key] || 1
    weights[key] = baseWeight * adjFactor
    totalWeight += weights[key]
  }

  // 归一化权重
  for (const key of Object.keys(weights)) {
    weights[key] = weights[key] / totalWeight
  }

  return weights
}

/**
 * 获取涨幅筛选区间
 * @param {number} marketSentiment - 市场情绪得分
 * @returns {Object} { minPct, maxPct }
 */
export function getPctRange(marketSentiment) {
  const level = getEmotionLevel(marketSentiment)
  const adjustment = EMOTION_ADJUSTMENTS[level]
  return {
    minPct: adjustment.minPct,
    maxPct: adjustment.maxPct
  }
}

/**
 * 计算换手率风险
 * @param {number} turnover - 换手率
 * @param {number} pct - 涨幅
 * @returns {Object} { risk, penalty }
 */
export function calcTurnoverRisk(turnover, pct) {
  let risk = 'normal'
  let penalty = 0

  // 换手率过高风险
  if (turnover > 25) {
    risk = 'very_high'
    penalty = -1.5  // 换手率>25%，可能出货
  } else if (turnover > 20) {
    risk = 'high'
    penalty = -1   // 换手率>20%，警惕
  } else if (turnover > 15 && pct > 6) {
    risk = 'medium'
    penalty = -0.5  // 高换手+高涨幅，有风险
  }

  return { risk, penalty }
}

/**
 * 计算综合评分
 * @param {Object} scores - 各因子得分
 * @param {Object} options - 可选参数 { marketSentiment, turnoverRisk }
 * @returns {number} 综合评分
 */
export function calcScore(scores, options = {}) {
  const { marketSentiment = 0, turnoverRisk = 0 } = options
  const weights = getDynamicWeights(marketSentiment)

  let totalScore = 0

  // 加权求和
  for (const [key, score] of Object.entries(scores)) {
    const weight = weights[key] || 0
    totalScore += score * weight
  }

  // 加上换手率风险扣分
  totalScore += turnoverRisk

  return Number(totalScore.toFixed(2))
}

/**
 * 计算完整评分（包含所有调整）
 * @param {Object} params - 完整参数
 * @returns {Object} { baseScore, finalScore, weights, turnoverRisk }
 */
export function calcFullScore(params) {
  const {
    momentum, turnover, capital, trend, volumePrice, stability, sector,
    marketSentiment = 0,
    stockTurnover,
    stockPct,
    trapScore = 0,
    sentimentBonus = 0,
    sectorBonus = 0  // 真实板块热度加成
  } = params

  // 计算换手率风险
  const { risk: turnoverRiskLevel, penalty: turnoverRisk } = calcTurnoverRisk(stockTurnover, stockPct)

  // 计算动态权重
  const weights = getDynamicWeights(marketSentiment)

  // 基础评分
  const baseScore = calcScore(
    { momentum, turnover, capital, trend, volumePrice, stability, sector },
    { marketSentiment, turnoverRisk }
  )

  // 最终评分
  const finalScore = Number((baseScore + trapScore + sentimentBonus + sectorBonus).toFixed(2))

  return {
    baseScore,
    finalScore,
    weights,
    turnoverRisk,
    turnoverRiskLevel
  }
}
