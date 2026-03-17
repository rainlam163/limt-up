import axios from "axios"

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * 获取单只股票的日K线数据（前复权）
 * @param {string} code - 股票代码（如 sh600519 或 600519）
 * @param {number} days - 获取天数
 * @returns {Array} K线数据数组 [{date, open, close, high, low, volume, pct}]
 */
export async function fetchKline(code, days = 10) {
  // 标准化代码格式
  const fullCode = code.startsWith('sh') || code.startsWith('sz') ? code : 
                   (code.startsWith('6') ? `sh${code}` : `sz${code}`)
  
  // 计算日期范围
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days - 10) // 多取几天防止非交易日
  
  const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?_var=kline_dayqfq&param=${fullCode},day,${formatDate(startDate)},${formatDate(endDate)},${days + 10},qfq`
  
  try {
    const res = await axios.get(url, {
      timeout: 10000,
      headers: { 'Referer': 'https://gu.qq.com/' }
    })
    
    // 解析JSONP响应
    const text = res.data
    const jsonStr = text.replace(/^kline_dayqfq=/, '')
    const data = JSON.parse(jsonStr)
    
    if (data.code !== 0 || !data.data || !data.data[fullCode]) {
      return []
    }
    
    const klineData = data.data[fullCode].qfqday || []
    
    // 转换为结构化数据，计算涨幅
    const result = klineData.map((item, index, arr) => {
      const [date, open, close, high, low, volume] = item
      const openPrice = parseFloat(open)
      const closePrice = parseFloat(close)
      
      // 计算涨幅（相对于前一天收盘价）
      let pct = 0
      if (index > 0) {
        const prevClose = parseFloat(arr[index - 1][2])
        pct = ((closePrice - prevClose) / prevClose) * 100
      }
      
      return {
        date,
        open: openPrice,
        close: closePrice,
        high: parseFloat(high),
        low: parseFloat(low),
        volume: parseInt(volume) || 0,
        pct: Number(pct.toFixed(2))
      }
    })
    
    // 返回最近N天
    return result.slice(-days)
  } catch (err) {
    console.log(`获取K线失败 ${code}:`, err.message)
    return []
  }
}

/**
 * 批量获取多只股票的K线数据
 * @param {Array<string>} codes - 股票代码数组
 * @param {number} days - 获取天数
 * @param {number} batchSize - 并发数量
 * @returns {Object} {code: klineData}
 */
export async function fetchKlineBatch(codes, days = 10, batchSize = 5) {
  const result = {}
  
  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize)
    
    const promises = batch.map(async code => {
      const kline = await fetchKline(code, days)
      return { code, kline }
    })
    
    const results = await Promise.all(promises)
    results.forEach(({ code, kline }) => {
      result[code] = kline
    })
    
    // 批次间延迟，避免限流
    if (i + batchSize < codes.length) {
      await sleep(100)
    }
    
    console.log(`获取K线进度: ${Math.min(i + batchSize, codes.length)}/${codes.length}`)
  }
  
  return result
}
