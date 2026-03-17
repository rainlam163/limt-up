export const CONFIG = {

  TOP_N: 10,
  MIN_SCORE: 4,  // 最低推送分数阈值（新因子体系调整后降低）

  MIN_PRICE: 3,
  MAX_PRICE: 40,

  MIN_TURNOVER: 2,

  LEADER_BONUS: 2,

  // K线配置
  KLINE_DAYS: 5,  // 获取K线天数（用于趋势和量价分析）

  // PushPlus推送配置
  // 获取token: 关注微信公众号"PushPlus推送"，回复"token"获取
  PUSHPLUS_TOKEN: "3360b5133fba4b12a70bf8357ec6a9b6",  // 填入你的token
  
  // 推送开关
  ENABLE_PUSH: true,

  // 推送群组
  PUSHPLUS_TOPIC: "AiStock",

}
