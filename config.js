export const CONFIG = {

  TOP_N: 10,
  MIN_SCORE: 2.0,  // 最低推送分数阈值（动态权重体系调整）

  MIN_PRICE: 3,
  MAX_PRICE: 40,

  // 涨幅区间（收窄以提高稳定性）
  MIN_PCT: 4,    // 最低涨幅
  MAX_PCT: 8,    // 最高涨幅（排除涨停）

  MIN_TURNOVER: 2,

  LEADER_BONUS: 2,

  // K线配置
  KLINE_DAYS: 5,  // 获取K线天数（用于趋势和量价分析）

  // 稳定性阈值（适当放宽）
  MAX_AMPLITUDE: 12,      // 最大振幅阈值（超过此值可能不稳定）
  MAX_PULLBACK: 5,        // 最大回撤阈值（最高价与当前价差距）
  MIN_STABILITY_SCORE: 1, // 最低稳定性分数

  // PushPlus推送配置
  PUSHPLUS_TOKEN: "3360b5133fba4b12a70bf8357ec6a9b6",  // 填入你的token
  
  // 推送开关
  ENABLE_PUSH: true,

  // 推送群组
  PUSHPLUS_TOPIC: "AiStock",

}
