export function calcSectorHot(stock) {
  const pct = stock.pct
  let score = 0

  // 离散分段评分（原设计）
  if (pct > 5) score = 5
  else if (pct > 3) score = 3
  else score = 1

  // 连续微调：涨幅精确值作为小数部分
  score += Math.min(pct * 0.01, 0.1)  // 小幅调整

  return Number(score.toFixed(2))
}

// 次级评分：用于同分排序
export function getSectorDetail(stock) {
  return stock.sector === '涨停板' ? 100 : stock.pct
}
