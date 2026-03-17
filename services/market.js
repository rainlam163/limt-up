import axios from "axios"

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// GBK转UTF-8
function gbkToUtf8(buffer) {
  const decoder = new TextDecoder('gbk')
  return decoder.decode(buffer)
}

// 根据涨幅确定虚拟板块（热点概念）
function getSectorByPct(pct) {
  if (pct >= 9.5) return "涨停板"
  if (pct >= 7) return "强势股"
  if (pct >= 5) return "活跃股"
  if (pct >= 3) return "上涨股"
  return "普通股"
}

// 解析腾讯股票数据
function parseTencentData(buffer, prefix) {
  const stocks = []
  const data = gbkToUtf8(buffer)
  const regex = new RegExp(`v_${prefix}(\\w+)="(.+?)"`, 'g')
  let match

  while ((match = regex.exec(data)) !== null) {
    const code = match[1]
    const fields = match[2].split('~')

    if (fields.length < 40) continue

    const name = fields[1]
    const price = parseFloat(fields[3]) || 0
    const pct = parseFloat(fields[32]) || 0
    const volume = parseInt(fields[36]) || 0
    const amount = (parseFloat(fields[37]) || 0) * 10000 // 万转元
    const turnover = parseFloat(fields[38]) || 0  // 换手率
    const ratio = parseFloat(fields[47]) || 0  // 量比

    if (price > 0 && name) {
      stocks.push({
        code,
        name,
        price,
        pct,
        volume,
        amount,
        turnover,
        ratio,  // 量比
        sector: getSectorByPct(pct)  // 根据涨幅确定板块
      })
    }
  }

  return stocks
}

// 用腾讯API获取上交所股票
async function fetchSSEStocks() {
  const allStocks = []
  const batchSize = 700

  // 上交所主板股票代码范围
  const codeRanges = [
    { start: 600000, end: 600999 },
    { start: 601000, end: 601999 },
    { start: 603000, end: 603999 },
    { start: 605000, end: 605999 },
  ]

  const codes = []
  for (const range of codeRanges) {
    for (let i = range.start; i <= range.end; i++) {
      codes.push(`sh${i}`)
    }
  }

  const totalCodes = codes.length
  let processedCodes = 0

  try {
    for (let i = 0; i < codes.length; i += batchSize) {
      const batch = codes.slice(i, i + batchSize)
      const url = `http://qt.gtimg.cn/q=${batch.join(',')}`

      const res = await axios.get(url, {
        timeout: 30000,
        headers: { 'Referer': 'https://gu.qq.com/' },
        responseType: 'arraybuffer'
      })

      const stocks = parseTencentData(res.data, 'sh')
      allStocks.push(...stocks.filter(s => s.name && s.price > 0))

      processedCodes += batch.length

      if (i + batchSize < codes.length) {
        await sleep(200)
      }

      console.log(`已获取沪市股票 ${processedCodes}/${totalCodes}`)
    }

    return allStocks
  } catch (err) {
    console.log('腾讯沪市API失败:', err.message)
    return allStocks
  }
}

// 用腾讯API获取深交所股票
async function fetchSZStocks() {
  const allStocks = []
  const batchSize = 700

  // 深交所股票代码范围
  const codeRanges = [
    { prefix: 'sz', start: 1, end: 999 },      // 000001-000999
    { prefix: 'sz', start: 2001, end: 2999 },  // 002001-002999
    { prefix: 'sz', start: 3001, end: 3999 },  // 003001-003999
    { prefix: 'sz', start: 300001, end: 301000 }, // 创业板
  ]

  const codes = []
  for (const range of codeRanges) {
    for (let i = range.start; i <= range.end; i++) {
      codes.push(`${range.prefix}${String(i).padStart(6, '0')}`)
    }
  }

  try {
    for (let i = 0; i < codes.length; i += batchSize) {
      const batch = codes.slice(i, i + batchSize)
      const url = `http://qt.gtimg.cn/q=${batch.join(',')}`

      const res = await axios.get(url, {
        timeout: 30000,
        headers: { 'Referer': 'https://gu.qq.com/' },
        responseType: 'arraybuffer'
      })

      const stocks = parseTencentData(res.data, 'sz')
      allStocks.push(...stocks.filter(s => s.name && s.price > 0))

      if (i + batchSize < codes.length) {
        await sleep(200)
      }

      if ((i + batchSize) % 5000 === 0 || i + batchSize >= codes.length) {
        console.log(`已获取深市股票 ${Math.min(i + batchSize, codes.length)}/${codes.length}`)
      }
    }

    return allStocks
  } catch (err) {
    console.log('腾讯深市API失败:', err.message)
    return allStocks
  }
}

export async function fetchAllStocks() {
  console.log("正在获取市场数据...")

  // 并行获取沪深数据
  const [sseStocks, szStocks] = await Promise.all([
    fetchSSEStocks(),
    fetchSZStocks()
  ])

  const allStocks = [...sseStocks, ...szStocks]
  console.log(`成功获取 ${allStocks.length} 只股票`)

  return allStocks
}
