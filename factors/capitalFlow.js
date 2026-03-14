export function calcCapitalFlow(stock) {
  const amount = stock.amount || 0
  const amountYi = amount / 1e8  // 转为亿
  let score = 0

  // 离散分段评分（原设计）
  if (amount > 100e8) score = 6
  else if (amount > 50e8) score = 4
  else if (amount > 10e8) score = 2
  else score = 1

  // 连续微调：成交额精确值作为小数部分
  score += Math.min(amountYi * 0.002, 0.2)  // 每增加10亿额外+0.02分（上限0.2）

  return Number(score.toFixed(2))
}

// 次级评分：用于同分排序
export function getCapitalDetail(stock) {
  return stock.amount
}
