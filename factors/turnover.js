export function calcTurnover(stock) {
  const t = stock.turnover
  let score = 0

  // 离散分段评分（原设计）
  if (t < 3) score = 1
  else if (t < 6) score = 3
  else if (t < 10) score = 5
  else score = 6

  // 连续微调：换手率精确值作为小数部分
  score += Math.min(t * 0.01, 0.2)  // 每增加1%换手额外+0.01分（上限0.2）

  return Number(score.toFixed(2))
}

// 次级评分：用于同分排序
export function getTurnoverDetail(stock) {
  return stock.turnover
}
