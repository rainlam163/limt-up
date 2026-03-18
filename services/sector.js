import axios from "axios"

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// 板块数据缓存
let sectorCache = {
  timestamp: 0,
  data: {}  // { 板块名: { pct, amount } }
}

// 热门板块平均涨幅缓存
let hotSectorAvgPct = 0

/**
 * 从同花顺解析行业板块涨幅（降级方案）
 */
async function fetchFrom10jqka() {
  try {
    const res = await axios.get('http://q.10jqka.com.cn/thshy/', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
    })

    const html = res.data
    const tableMatch = html.match(/<table[^>]*class="m-table[^"]*"[^>]*>([\s\S]*?)<\/table>/)
    
    if (!tableMatch) return {}

    const rows = tableMatch[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []
    const sectors = {}

    for (const row of rows) {
      const tds = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || []
      if (tds.length >= 3) {
        const nameMatch = tds[1]?.match(/<a[^>]*>([^<]+)<\/a>/)
        const pctMatch = tds[2]?.match(/>([+-]?\d+\.?\d*)<\//)
        
        if (nameMatch && pctMatch) {
          const name = nameMatch[1].trim()
          const pct = parseFloat(pctMatch[1]) || 0
          sectors[name] = { pct, amount: 0 }
        }
      }
    }

    console.log(`同花顺获取 ${Object.keys(sectors).length} 个行业板块`)
    return sectors
  } catch (err) {
    console.log("同花顺获取失败:", err.message)
    return {}
  }
}

/**
 * 从东方财富获取行业板块涨幅
 */
async function fetchFromEastmoney() {
  try {
    const url = "http://push2.eastmoney.com/api/qt/clist/get"
    const params = {
      pn: 1,
      pz: 200,
      po: 1,
      np: 1,
      fltt: 2,
      invt: 2,
      fid: 'f3',
      fs: 'm:90+t:2',
      fields: 'f12,f14,f3,f124'
    }

    const res = await axios.get(url, {
      params,
      timeout: 8000,
      headers: { 'Referer': 'http://data.eastmoney.com/' }
    })

    if (res.data?.data?.diff) {
      const sectors = {}
      for (const item of res.data.data.diff) {
        sectors[item.f14] = {
          pct: item.f3 || 0,
          amount: item.f124 || 0
        }
      }
      console.log(`东方财富获取 ${Object.keys(sectors).length} 个板块数据`)
      return sectors
    }
  } catch (err) {
    console.log("东方财富获取失败:", err.message)
  }
  return null
}

/**
 * 获取行业板块涨幅排行
 */
export async function fetchSectorRanking() {
  if (Date.now() - sectorCache.timestamp < 5 * 60 * 1000) {
    return sectorCache.data
  }

  let sectors = await fetchFromEastmoney()
  
  if (!sectors || Object.keys(sectors).length === 0) {
    console.log("降级到同花顺数据源...")
    sectors = await fetchFrom10jqka()
  }

  if (sectors && Object.keys(sectors).length > 0) {
    sectorCache = { timestamp: Date.now(), data: sectors }
    
    // 计算热门板块平均涨幅（前5名）
    const sorted = Object.values(sectors)
      .filter(s => s.pct > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5)
    
    if (sorted.length > 0) {
      hotSectorAvgPct = sorted.reduce((sum, s) => sum + s.pct, 0) / sorted.length
      console.log(`热门板块平均涨幅: ${hotSectorAvgPct.toFixed(2)}%`)
    }
  }

  return sectorCache.data
}

/**
 * 获取热门板块平均涨幅
 */
export function getHotSectorAvgPct() {
  return hotSectorAvgPct
}

/**
 * 批量获取股票所属板块（简化版，返回空）
 * 由于行业分类体系不统一，暂时不使用个股行业匹配
 */
export async function fetchStockSectorsBatch(codes) {
  console.log(`跳过个股行业映射（使用市场热度替代）`)
  return {}
}

/**
 * 获取股票板块涨幅（简化版，使用市场热度）
 */
export function getStockSectorPct(code, sectorRanking, stockSectorMap) {
  // 使用热门板块平均涨幅作为市场热度参考
  return hotSectorAvgPct
}