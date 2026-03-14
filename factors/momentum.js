export function calcMomentum(stock) {
  const pct = stock.pct
  let score = 0

  // 离散分段评分（原设计）
  if (pct > 2) score += 2
  if (pct > 4) score += 2
  if (pct > 6) score += 3

  // 连续微调：涨幅精确值作为小数部分
  // 例如：7.5% 比 6.1% 多0.14分
  score += (pct % 2) * 0.1  // 每增加1%额外+0.1分（上限0.2）

  return Number(score.toFixed(2))
}

// 次级评分：用于同分排序
export function getMomentumDetail(stock) {
  return stock.pct  // 返回精确涨幅用于排序
}
