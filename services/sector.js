import axios from "axios"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.join(__dirname, "../output/sector_cache.json")
const STOCK_MAP_FILE = path.join(__dirname, "../output/stock_sector_map.json")

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// 板块数据缓存
let sectorCache = {
  timestamp: 0,
  data: {}  // { 板块名: { code, pct } }
}

// 股票-板块映射缓存 { 股票代码: 板块名 }
let stockSectorMap = {}

// 热门板块平均涨幅
let hotSectorAvgPct = 0

/**
 * 从同花顺爬取行业板块涨幅和代码
 */
async function crawlSectorList() {
  try {
    console.log("[爬虫] 正在爬取同花顺板块列表...")
    
    const res = await axios.get('https://q.10jqka.com.cn/thshy/', {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    })

    const html = new TextDecoder('gbk').decode(res.data)
    const sectors = {}
    
    // 提取板块信息：代码、名称、涨幅
    // 表格行格式：<tr><td>1</td><td><a href=".../code/881107/">油气开采及服务</a></td><td>4.69</td>...</tr>
    const trMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []
    
    for (const row of trMatches) {
      const tds = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || []
      if (tds.length >= 3) {
        // 第2列：板块链接，提取代码和名称
        const linkTd = tds[1] || ''
        const codeMatch = linkTd.match(/detail\/code\/(\d+)\//)
        const nameMatch = linkTd.match(/>([^<]+)<\/a>/)
        
        // 第3列：涨幅
        const pct = parseFloat(tds[2]?.replace(/<[^>]+>/g, '').trim()) || 0
        
        if (codeMatch && nameMatch) {
          const code = codeMatch[1]
          const name = nameMatch[1].trim()
          
          if (name && name.length > 0 && name.length < 20) {
            sectors[name] = { code, pct }
          }
        }
      }
    }

    console.log(`[爬虫] 获取 ${Object.keys(sectors).length} 个板块`)
    return sectors
  } catch (err) {
    console.log("[爬虫] 板块列表爬取失败:", err.message)
    return {}
  }
}

/**
 * 爬取单个板块的成分股
 */
async function crawlSectorStocks(sectorCode, sectorName) {
  try {
    const url = `https://q.10jqka.com.cn/thshy/detail/code/${sectorCode}/`
    
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
      }
    })
    
    const html = new TextDecoder('gbk').decode(res.data)
    
    // 提取股票代码: href="http://stockpage.10jqka.com.cn/600258/"
    const stockMatches = html.match(/stockpage\.10jqka\.com\.cn\/(\d{6})/g) || []
    const codes = [...new Set(stockMatches.map(m => m.match(/\d{6}/)?.[0]).filter(Boolean))]
    
    return codes
  } catch (err) {
    return []
  }
}

/**
 * 批量爬取所有板块的成分股，建立股票-板块映射
 */
async function buildStockSectorMap(sectors) {
  console.log("[爬虫] 开始爬取板块成分股...")
  
  const map = {}
  const entries = Object.entries(sectors)
  let count = 0
  
  for (const [sectorName, info] of entries) {
    const codes = await crawlSectorStocks(info.code, sectorName)
    
    for (const code of codes) {
      map[code] = sectorName
    }
    
    count++
    if (count % 10 === 0) {
      console.log(`[爬虫] 已处理 ${count}/${entries.length} 个板块`)
    }
    
    // 避免请求过快
    await sleep(100)
  }
  
  console.log(`[爬虫] 建立了 ${Object.keys(map).length} 个股票-板块映射`)
  return map
}

/**
 * 保存数据到文件
 */
function saveCache(data, file) {
  try {
    const dir = path.dirname(file)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.log("[爬虫] 缓存保存失败:", err.message)
  }
}

/**
 * 从文件读取缓存
 */
function loadCache(file, maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8')
      const cache = JSON.parse(content)
      if (Date.now() - cache.timestamp < maxAgeMs) {
        return cache
      }
    }
  } catch (err) {}
  return null
}

/**
 * 获取板块涨幅排行
 */
export async function fetchSectorRanking() {
  // 内存缓存有效（5分钟内）
  if (Date.now() - sectorCache.timestamp < 5 * 60 * 1000 && Object.keys(sectorCache.data).length > 0) {
    return sectorCache.data
  }

  // 尝试从文件缓存读取
  const fileCache = loadCache(CACHE_FILE)
  if (fileCache && fileCache.data) {
    sectorCache = { timestamp: fileCache.timestamp, data: fileCache.data }
    
    // 计算热门板块平均涨幅
    const sorted = Object.values(fileCache.data)
      .filter(s => s.pct > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5)
    if (sorted.length > 0) {
      hotSectorAvgPct = sorted.reduce((sum, s) => sum + s.pct, 0) / sorted.length
    }
    
    // 读取股票映射
    const mapCache = loadCache(STOCK_MAP_FILE, 7 * 24 * 60 * 60 * 1000) // 映射缓存7天
    if (mapCache && mapCache.data) {
      stockSectorMap = mapCache.data
    }
    
    return sectorCache.data
  }

  // 爬取板块列表
  const sectors = await crawlSectorList()
  
  if (Object.keys(sectors).length > 0) {
    sectorCache = { timestamp: Date.now(), data: sectors }
    
    // 保存板块缓存
    saveCache({ timestamp: Date.now(), data: sectors }, CACHE_FILE)
    
    // 计算热门板块平均涨幅
    const sorted = Object.values(sectors)
      .filter(s => s.pct > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5)
    if (sorted.length > 0) {
      hotSectorAvgPct = sorted.reduce((sum, s) => sum + s.pct, 0) / sorted.length
      console.log(`[爬虫] 热门板块平均涨幅: ${hotSectorAvgPct.toFixed(2)}%`)
    }
    
    // 爬取股票-板块映射（耗时操作，可以跳过或异步执行）
    // stockSectorMap = await buildStockSectorMap(sectors)
    // saveCache({ timestamp: Date.now(), data: stockSectorMap }, STOCK_MAP_FILE)
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
 * 获取股票所属板块涨幅
 * @param {string} code 股票代码
 * @param {object} sectorRanking 板块数据
 * @param {object} _ 未使用
 * @returns {number} 板块涨幅，未匹配则返回热门板块平均涨幅
 */
export function getStockSectorPct(code, sectorRanking, _) {
  // 查找股票所属板块
  const sectorName = stockSectorMap[code]
  
  if (sectorName && sectorRanking[sectorName]) {
    return sectorRanking[sectorName].pct
  }
  
  // 未匹配到板块，使用热门板块平均涨幅
  return hotSectorAvgPct
}

/**
 * 批量获取股票所属板块（爬取成分股建立映射）
 */
export async function fetchStockSectorsBatch(codes) {
  // 如果已有映射缓存，直接返回
  if (Object.keys(stockSectorMap).length > 0) {
    return stockSectorMap
  }
  
  // 尝试读取文件缓存
  const mapCache = loadCache(STOCK_MAP_FILE, 7 * 24 * 60 * 60 * 1000)
  if (mapCache && mapCache.data) {
    stockSectorMap = mapCache.data
    console.log(`[爬虫] 从缓存读取 ${Object.keys(stockSectorMap).length} 个股票-板块映射`)
    return stockSectorMap
  }
  
  // 没有缓存，需要爬取
  if (Object.keys(sectorCache.data).length === 0) {
    await fetchSectorRanking()
  }
  
  if (Object.keys(sectorCache.data).length > 0) {
    stockSectorMap = await buildStockSectorMap(sectorCache.data)
    saveCache({ timestamp: Date.now(), data: stockSectorMap }, STOCK_MAP_FILE)
  }
  
  return stockSectorMap
}
