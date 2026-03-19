import axios from "axios"
import { CONFIG } from "../config.js"

/**
 * 推送消息到微信（通过PushPlus）
 */
export async function pushToWechat(title, content, template = "html", isDev = false) {
  const token = CONFIG.PUSHPLUS_TOKEN
  
  if (!token) {
    console.log("PushPlus token未配置，跳过推送")
    return { success: false, message: "token未配置" }
  }
  
  if (!CONFIG.ENABLE_PUSH) {
    console.log("推送已禁用，跳过")
    return { success: false, message: "推送已禁用" }
  }

  const url = "http://www.pushplus.plus/send"
  
  try {
    const res = await axios.post(url, {
      token,
      title,
      content,
      template,
      topic: isDev ? undefined : CONFIG.PUSHPLUS_TOPIC
    }, {
      timeout: 10000,
      headers: { "Content-Type": "application/json" }
    })

    if (res.data.code === 200) {
      console.log("✓ 推送成功")
      return { success: true }
    } else {
      console.log("✗ 推送失败:", res.data.msg)
      return { success: false, message: res.data.msg }
    }
  } catch (err) {
    console.log("✗ 推送异常:", err.message)
    return { success: false, message: err.message }
  }
}

/**
 * 格式化选股结果 - 增强版模板（含市场情绪和决策指标）
 */
export function formatResultHtml(stocks, date, marketSentiment = null) {
  // 市场情绪区块
  let sentimentBlock = ''
  if (marketSentiment) {
    const { limitUpCount, limitDownCount, upDownRatio, sentiment, desc } = marketSentiment
    const sentimentColor = sentiment >= 1.5 ? '#22c55e' : sentiment >= 0 ? '#3b82f6' : sentiment >= -1.5 ? '#f59e0b' : '#ef4444'
    const sentimentIcon = sentiment >= 1.5 ? '🟢' : sentiment >= 0 ? '🔵' : sentiment >= -1.5 ? '🟡' : '🔴'
    
    sentimentBlock = `
    <div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:var(--card,#f9fafb);border:1px solid var(--border,#e5e7eb)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:14px;font-weight:600;color:var(--text,#1f2937)">📊 市场情绪</span>
        <span style="font-size:12px;color:${sentimentColor};font-weight:500">${sentimentIcon} ${desc}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted,#9ca3af)">
        <span>涨停 <b style="color:#ef4444">${limitUpCount}</b></span>
        <span>跌停 <b style="color:#22c55e">${limitDownCount}</b></span>
        <span>涨跌比 <b>${upDownRatio}</b></span>
      </div>
    </div>`
  }

  // 股票卡片
  const cards = stocks.map((s, i) => {
    const pct = parseFloat(s.pct)
    const pctColor = pct >= 0 ? '#ef4444' : '#22c55e'
    const isHot = pct >= 7
    const trapReason = s.trapReason || ''
    const sector = s.sector || ''
    const sectorPct = s.sectorPct ? parseFloat(s.sectorPct) : 0
    const trendDays = s.trendDays || 0
    const amplitude = s.amplitude || 0
    const ratio = s.ratio || 0
    
    // 决策辅助标签
    const tags = []
    if (trendDays >= 3) tags.push(`<span style="background:#dcfce7;color:#16a34a;font-size:9px;padding:1px 3px;border-radius:2px;height:18px;line-height:18px;">${trendDays}连涨</span>`)
    if (amplitude > 0 && amplitude < 6) tags.push(`<span style="background:#fef3c7;color:#d97706;font-size:9px;padding:1px 3px;border-radius:2px;height:18px;line-height:18px;">稳</span>`)
    if (ratio > 0 && ratio < 1.5) tags.push(`<span style="background:#dbeafe;color:#2563eb;font-size:9px;padding:1px 3px;border-radius:2px;height:18px;line-height:18px;">缩量</span>`)
    if (sectorPct > 3) tags.push(`<span style="background:#fce7f3;color:#db2777;font-size:9px;padding:1px 3px;border-radius:2px;height:18px;line-height:18px;">板块+${sectorPct.toFixed(1)}%</span>`)
    
    return `
    <div style="margin-bottom:10px;border-radius:10px;padding:12px 14px;border:1px solid var(--border,#e5e7eb)">
      <div style="display:flex;align-items:flex-start">
        <div style="width:22px;height:22px;border-radius:6px;background:${i < 3 ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#9ca3af'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:12px;flex-shrink:0">${i + 1}</div>
        <div style="margin-left:10px;flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <span style="font-weight:600;font-size:15px;color:var(--text,#1f2937)">${s.name}</span>
            <span style="font-size:12px;color:var(--muted,#9ca3af)">${s.code}</span>
            ${isHot ? '<span style="background:#fef2f2;color:#ef4444;font-size:9px;padding:1px 4px;border-radius:3px;font-weight:500;height:18px;line-height:18px;">热</span>' : ''}
            ${sector ? `<span style="background:#eff6ff;color:#3b82f6;font-size:9px;padding:1px 4px;border-radius:3px;height:18px;line-height:18px;">${sector}</span>` : ''}
          </div>
          <div style="margin-top:2px;font-size:12px;color:var(--muted,#9ca3af)">
            ¥${s.price} · 换手${s.turnover}% · ${s.amount}
          </div>
          <div style="margin-top:3px;display:flex;gap:3px;flex-wrap:wrap">
            ${tags.join('')}
          </div>
          ${trapReason ? `<div style="margin-top:3px;font-size:12px;color:#ef4444">⚠️ 诱多: ${trapReason}</div>` : ''}
        </div>
        <div style="margin-left:10px;text-align:right;flex-shrink:0">
          <div style="font-size:16px;font-weight:700;color:${pctColor}">${pct >= 0 ? '+' : ''}${pct}%</div>
          <div style="font-size:12px;color:var(--muted,#9ca3af)">评分 ${s.score}</div>
          <div style="font-size:12px;color:var(--muted,#9ca3af)">振幅${amplitude}%</div>
        </div>
      </div>
    </div>`
  }).join('')

  // 动态权重说明
  const weightHint = marketSentiment?.sentiment >= 1.5 ? '追涨优先' 
    : marketSentiment?.sentiment >= 0 ? '均衡配置' 
    : '保守为主'

  // 决策参考区块
  const decisionBlock = `
    <div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:var(--card,#f9fafb);border:1px solid var(--border,#e5e7eb)">
      <div style="font-size:12px;font-weight:600;color:var(--text,#1f2937);margin-bottom:6px">💡 决策参考</div>
      <div style="font-size:12px;color:var(--muted,#9ca3af);line-height:1.6">
        • <b>连涨</b>: 连续上涨天数，越多趋势越强<br>
        • <b>稳</b>: 振幅小于6%，走势平稳<br>
        • <b>缩量</b>: 量比小于1.5，抛压较轻<br>
        • <b>板块</b>: 所属板块涨幅>3%为强势<br>
        • <b>诱多</b>: 冲高回落等风险信号<br>
        • 当前策略: <span style="color:#3b82f6">${weightHint}</span>
      </div>
    </div>`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root { color-scheme: light dark }
    @media (prefers-color-scheme: dark) {
      :root { --text: #f3f4f6; --muted: #9ca3af; --border: #374151; --card: #1f2937 }
    }
  </style>
</head>
<body style="margin:0;padding:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:380px;margin:0 auto">
    ${sentimentBlock}
    ${cards}
    ${decisionBlock}
    <div style="text-align:center;margin-top:10px;font-size:9px;color:var(--muted,#9ca3af)">
      ⚠️ 仅供参考，不构成投资建议
    </div>
  </div>
</body>
</html>`
}

/**
 * 发送选股结果到微信
 */
export async function sendStockResult(stocks, marketSentiment = null, isDev = false) {
  const date = new Date().toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })

  const title = `📊 LimitUp 买入确认`
  const content = formatResultHtml(stocks, date, marketSentiment)
  
  return await pushToWechat(title, content, "html", isDev)
}

/**
 * 格式化买入预警HTML
 */
export function formatBuyAlertHtml(stocks, marketSentiment = null) {
  // 市场情绪区块
  let sentimentBlock = ''
  if (marketSentiment) {
    const { limitUpCount, limitDownCount, upDownRatio, sentiment, desc } = marketSentiment
    const sentimentColor = sentiment >= 1.5 ? '#22c55e' : sentiment >= 0 ? '#3b82f6' : sentiment >= -1.5 ? '#f59e0b' : '#ef4444'
    const sentimentIcon = sentiment >= 1.5 ? '🟢' : sentiment >= 0 ? '🔵' : sentiment >= -1.5 ? '🟡' : '🔴'
    
    sentimentBlock = `
    <div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:var(--card,#f9fafb);border:1px solid var(--border,#e5e7eb)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:14px;font-weight:600;color:var(--text,#1f2937)">📊 市场情绪</span>
        <span style="font-size:12px;color:${sentimentColor};font-weight:500">${sentimentIcon} ${desc}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted,#9ca3af)">
        <span>涨停 <b style="color:#ef4444">${limitUpCount}</b></span>
        <span>跌停 <b style="color:#22c55e">${limitDownCount}</b></span>
        <span>涨跌比 <b>${upDownRatio}</b></span>
      </div>
    </div>`
  }

  // 股票卡片（简化版）
  const cards = stocks.map((s, i) => {
    const pct = parseFloat(s.pct)
    const pctColor = pct >= 0 ? '#ef4444' : '#22c55e'
    
    return `
    <div style="margin-bottom:8px;border-radius:8px;padding:10px 12px;border:1px solid var(--border,#e5e7eb)">
      <div style="display:flex;align-items:center">
        <div style="width:20px;height:20px;border-radius:5px;background:${i < 3 ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#9ca3af'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:11px;flex-shrink:0">${i + 1}</div>
        <div style="margin-left:8px;flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:4px">
            <span style="font-weight:600;font-size:14px;color:var(--text,#1f2937)">${s.name}</span>
            <span style="font-size:11px;color:var(--muted,#9ca3af)">${s.code}</span>
          </div>
          <div style="margin-top:2px;font-size:11px;color:var(--muted,#9ca3af)">
            ¥${s.price} · 换手${s.turnover}% · ${s.amount}
          </div>
        </div>
        <div style="margin-left:8px;text-align:right;flex-shrink:0">
          <div style="font-size:15px;font-weight:700;color:${pctColor}">${pct >= 0 ? '+' : ''}${pct}%</div>
        </div>
      </div>
    </div>`
  }).join('')

  // 提示区块
  const hintBlock = `
    <div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:#fef3c7;border:1px solid #fcd34d">
      <div style="font-size:12px;color:#92400e">
        💡 <b>14:48</b> 将推送最终确认名单，请留意
      </div>
    </div>`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root { color-scheme: light dark }
    @media (prefers-color-scheme: dark) {
      :root { --text: #f3f4f6; --muted: #9ca3af; --border: #374151; --card: #1f2937 }
    }
  </style>
</head>
<body style="margin:0;padding:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:380px;margin:0 auto">
    ${sentimentBlock}
    ${cards}
    ${hintBlock}
    <div style="text-align:center;margin-top:10px;font-size:9px;color:var(--muted,#9ca3af)">
      ⚠️ 仅供参考，不构成投资建议
    </div>
  </div>
</body>
</html>`
}

/**
 * 发送买入预警到微信
 */
export async function sendBuyAlert(stocks, marketSentiment = null, isDev = false) {
  const title = `⚡ LimitUp 买入预警`
  const content = formatBuyAlertHtml(stocks, marketSentiment)
  
  return await pushToWechat(title, content, "html", isDev)
}

/**
 * 格式化卖出建议HTML
 */
export function formatSellHtml(stocks, marketSentiment = null) {
  // 市场情绪区块
  let sentimentBlock = ''
  if (marketSentiment) {
    const { sentiment, desc } = marketSentiment
    const sentimentColor = sentiment >= 1.5 ? '#22c55e' : sentiment >= 0 ? '#3b82f6' : sentiment >= -1.5 ? '#f59e0b' : '#ef4444'
    const sentimentIcon = sentiment >= 1.5 ? '🟢' : sentiment >= 0 ? '🔵' : sentiment >= -1.5 ? '🟡' : '🔴'
    
    sentimentBlock = `
    <div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:var(--card,#f9fafb);border:1px solid var(--border,#e5e7eb)">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:14px;font-weight:600;color:var(--text,#1f2937)">📊 昨日市场情绪</span>
        <span style="font-size:12px;color:${sentimentColor};font-weight:500">${sentimentIcon} ${desc}</span>
      </div>
    </div>`
  }

  // 股票卡片
  const cards = stocks.map((s, i) => {
    const pnlPct = parseFloat(s.pnlPct)
    const pnlColor = pnlPct >= 0 ? '#ef4444' : '#22c55e'
    const actionColor = s.action.includes('止盈') || s.action.includes('涨停') ? '#22c55e' 
      : s.action.includes('止损') || s.action.includes('卖出') ? '#ef4444' 
      : '#3b82f6'
    
    return `
    <div style="margin-bottom:10px;border-radius:10px;padding:12px 14px;border:1px solid var(--border,#e5e7eb)">
      <div style="display:flex;align-items:flex-start">
        <div style="width:22px;height:22px;border-radius:6px;background:${i < 3 ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#9ca3af'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:12px;flex-shrink:0">${i + 1}</div>
        <div style="margin-left:10px;flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <span style="font-weight:600;font-size:15px;color:var(--text,#1f2937)">${s.name}</span>
            <span style="font-size:12px;color:var(--muted,#9ca3af)">${s.code}</span>
          </div>
          <div style="margin-top:4px;font-size:12px;color:var(--muted,#9ca3af)">
            买入价 ¥${s.buyPrice} → 现价 ¥${s.currentPrice}
          </div>
          <div style="margin-top:6px;font-size:13px;color:${actionColor};font-weight:500">
            ${s.action}
          </div>
          <div style="margin-top:2px;font-size:12px;color:var(--muted,#9ca3af)">
            ${s.reason}
          </div>
          ${s.targetPrice ? `<div style="margin-top:4px;font-size:12px;color:#22c55e">🎯 目标价: ¥${s.targetPrice}</div>` : ''}
          ${s.stopPrice ? `<div style="margin-top:4px;font-size:12px;color:#ef4444">🛡️ 止损价: ¥${s.stopPrice}</div>` : ''}
        </div>
        <div style="margin-left:10px;text-align:right;flex-shrink:0">
          <div style="font-size:16px;font-weight:700;color:${pnlColor}">${pnlPct >= 0 ? '+' : ''}${pnlPct}%</div>
          <div style="font-size:11px;color:var(--muted,#9ca3af)">盈亏</div>
          <div style="margin-top:4px;font-size:11px;color:var(--muted,#9ca3af)">昨收+${s.yesterdayPct}%</div>
        </div>
      </div>
    </div>`
  }).join('')

  // 统计区块
  const profitCount = stocks.filter(s => parseFloat(s.pnlPct) > 0).length
  const lossCount = stocks.filter(s => parseFloat(s.pnlPct) < 0).length
  const avgPnl = (stocks.reduce((sum, s) => sum + parseFloat(s.pnlPct), 0) / stocks.length).toFixed(2)
  
  const statsBlock = `
    <div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:var(--card,#f9fafb);border:1px solid var(--border,#e5e7eb)">
      <div style="display:flex;justify-content:space-around;font-size:12px">
        <div style="text-align:center">
          <div style="font-weight:600;color:#22c55e">${profitCount}</div>
          <div style="color:var(--muted,#9ca3af)">盈利</div>
        </div>
        <div style="text-align:center">
          <div style="font-weight:600;color:#ef4444">${lossCount}</div>
          <div style="color:var(--muted,#9ca3af)">亏损</div>
        </div>
        <div style="text-align:center">
          <div style="font-weight:600;color:${parseFloat(avgPnl) >= 0 ? '#22c55e' : '#ef4444'}">${avgPnl}%</div>
          <div style="color:var(--muted,#9ca3af)">平均</div>
        </div>
      </div>
    </div>`

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root { color-scheme: light dark }
    @media (prefers-color-scheme: dark) {
      :root { --text: #f3f4f6; --muted: #9ca3af; --border: #374151; --card: #1f2937 }
    }
  </style>
</head>
<body style="margin:0;padding:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:380px;margin:0 auto">
    ${sentimentBlock}
    ${cards}
    ${statsBlock}
    <div style="text-align:center;margin-top:10px;font-size:9px;color:var(--muted,#9ca3af)">
      ⚠️ 仅供参考，不构成投资建议
    </div>
  </div>
</body>
</html>`
}

/**
 * 发送卖出建议到微信
 */
export async function sendSellAdvice(sellResult, isDev = false) {
  // 根据isFirst决定标题
  const title = sellResult.isFirst 
    ? `💰 LimitUp 卖出建议(第1次)` 
    : `💰 LimitUp 卖出建议(第2次)`
  const content = formatSellHtml(sellResult.stocks, sellResult.marketSentiment)
  
  return await pushToWechat(title, content, "html", isDev)
}