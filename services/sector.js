import axios from "axios"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.join(__dirname, "../output/sector_cache.json")
const STOCK_MAP_FILE = path.join(__dirname, "../output/stock_sector_map.json")

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// 东方财富行业名 -> 同花顺板块名 映射表
const INDUSTRY_NAME_MAP = {
  // 东方财富行业名: 同花顺板块名
  '酿酒行业': '白酒',
  '石油行业': '油气开采及服务',
  '煤炭行业': '煤炭开采加工',
  '煤炭采选': '煤炭开采加工',
  '电力行业': '电力',
  '钢铁行业': '钢铁',
  '有色金属': '工业金属',
  '化工行业': '化学制品',
  '水泥行业': '水泥',
  '房地产行业': '房地产开发',
  '建筑装饰': '装修装饰',
  '家电行业': '白色家电',
  '汽车行业': '汽车整车',
  '医药行业': '化学制药',
  '中药行业': '中药',
  '生物制品': '生物制品',
  '医疗器械': '医疗器械',
  '电子元件': '半导体',
  '电子信息': '软件开发',
  '软件服务': '软件开发',
  '通信行业': '通信服务',
  '传媒娱乐': '传媒',
  '旅游酒店': '酒店及旅游',
  '商业百货': '零售',
  '纺织服装': '纺织制造',
  '食品饮料': '食品加工',
  '农药化肥': '农化制品',
  '机械行业': '通用设备',
  '仪器仪表': '仪器仪表',
  '环保行业': '环保',
  '环保工程': '环保',
  '新能源电池': '电池',
  '光伏行业': '光伏设备',
  '风电行业': '风电设备',
  '储能行业': '储能',
  '航天军工': '国防军工',
  '船舶制造': '航海装备',
  '机场港口': '港口航运',
  '高速公路': '高速公路',
  '物流行业': '物流',
  '交运物流': '物流',
  '采掘行业': '油气开采及服务',
  '采掘服务': '油气开采及服务',
  '电源设备': '电池',
  '塑胶制品': '塑料',
  '计算机设备': '计算机设备',
  '石油加工贸易': '石油加工贸易',
  '燃气': '燃气',
  '风电设备': '风电设备',
}

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
    
    // 提取板块信息
    const trMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []
    
    for (const row of trMatches) {
      const tds = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || []
      if (tds.length >= 3) {
        const linkTd = tds[1] || ''
        const codeMatch = linkTd.match(/detail\/code\/(\d+)\//)
        const nameMatch = linkTd.match(/>([^<]+)<\/a>/)
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
 * 从东方财富获取单只股票的行业
 */
async function fetchStockIndustry(code) {
  try {
    const prefix = code.startsWith('6') ? 'SH' : 'SZ'
    const url = `http://emweb.eastmoney.com/PC_HSF10/CompanySurvey/CompanySurveyAjax?code=${prefix}${code}`
    
    const res = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        'Referer': 'http://emweb.eastmoney.com/'
      },
      timeout: 5000
    })
    
    if (res.data?.jbzl?.sshy) {
      return res.data.jbzl.sshy
    }
  } catch (e) {
    // 忽略错误
  }
  return null
}

/**
 * 批量获取股票行业（从东方财富）
 * 只获取传入的候选股票的行业信息
 */
async function fetchStockIndustryBatch(codes) {
  console.log(`[爬虫] 从东方财富获取 ${codes.length} 只股票行业...`)
  
  const results = {}
  let count = 0
  
  for (const code of codes) {
    // 移除前缀
    const pureCode = code.replace(/^(sh|sz)/i, '')
    
    // 跳过已有缓存的
    if (stockSectorMap[pureCode]) {
      results[pureCode] = stockSectorMap[pureCode]
      continue
    }
    
    const industry = await fetchStockIndustry(pureCode)
    if (industry) {
      results[pureCode] = industry
      stockSectorMap[pureCode] = industry
    }
    
    count++
    if (count % 10 === 0) {
      console.log(`[爬虫] 已获取 ${count}/${codes.length} 只股票行业`)
    }
    
    // 控制请求频率
    await sleep(50)
  }
  
  console.log(`[爬虫] 获取到 ${Object.keys(results).length} 个股票行业`)
  return results
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
    
    // 读取股票映射缓存
    const mapCache = loadCache(STOCK_MAP_FILE, 7 * 24 * 60 * 60 * 1000)
    if (mapCache && mapCache.data) {
      stockSectorMap = mapCache.data
    }
    
    return sectorCache.data
  }

  // 爬取板块列表
  const sectors = await crawlSectorList()
  
  if (Object.keys(sectors).length > 0) {
    sectorCache = { timestamp: Date.now(), data: sectors }
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
 * 匹配板块名称（支持模糊匹配）
 */
function matchSectorName(industryName, sectorRanking) {
  // 1. 精确匹配
  if (sectorRanking[industryName]) {
    return industryName
  }
  
  // 2. 查映射表
  if (INDUSTRY_NAME_MAP[industryName] && sectorRanking[INDUSTRY_NAME_MAP[industryName]]) {
    return INDUSTRY_NAME_MAP[industryName]
  }
  
  // 3. 模糊匹配（去除"行业"后缀）
  const shortName = industryName.replace(/行业$/, '')
  for (const sectorName of Object.keys(sectorRanking)) {
    if (sectorName.includes(shortName) || shortName.includes(sectorName)) {
      return sectorName
    }
  }
  
  return null
}

/**
 * 获取股票所属板块涨幅
 */
export function getStockSectorPct(code, sectorRanking, _) {
  // 移除前缀
  const pureCode = code.replace(/^(sh|sz)/i, '')
  
  // 查找股票所属板块
  const industryName = stockSectorMap[pureCode]
  
  if (industryName) {
    // 匹配板块名称
    const sectorName = matchSectorName(industryName, sectorRanking)
    if (sectorName && sectorRanking[sectorName]) {
      return sectorRanking[sectorName].pct
    }
  }
  
  // 未匹配到板块，使用热门板块平均涨幅
  return hotSectorAvgPct
}

/**
 * 批量获取股票所属行业
 * 从东方财富API获取，只获取候选股票
 */
export async function fetchStockSectorsBatch(codes) {
  // 先读取缓存
  const mapCache = loadCache(STOCK_MAP_FILE, 7 * 24 * 60 * 60 * 1000)
  if (mapCache && mapCache.data) {
    stockSectorMap = { ...stockSectorMap, ...mapCache.data }
  }
  
  // 获取缺少行业信息的股票
  const needFetch = codes.filter(code => {
    const pureCode = code.replace(/^(sh|sz)/i, '')
    return !stockSectorMap[pureCode]
  })
  
  if (needFetch.length > 0) {
    await fetchStockIndustryBatch(needFetch)
    
    // 保存映射缓存
    saveCache({ timestamp: Date.now(), data: stockSectorMap }, STOCK_MAP_FILE)
  }
  
  return stockSectorMap
}