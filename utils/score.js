export function calcScore(f){

  const score =

      f.momentum * 0.35 +
      f.turnover * 0.25 +
      f.capital * 0.25 +
      f.sector * 0.15

  return Number(score.toFixed(2))

}