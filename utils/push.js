import axios from "axios"
import { CONFIG } from "../config.js"

/**
 * 推送消息到微信（通过PushPlus）
 */
export async function pushToWechat(title, content, template = "html") {
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
      topic: CONFIG.PUSHPLUS_TOPIC
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
 * 格式化选股结果 - 极简卡片式模板（无背景）
 */
export function formatResultHtml(stocks, date) {
  const cards = stocks.map((s, i) => {
    const pct = parseFloat(s.pct)
    const pctColor = pct >= 0 ? '#ef4444' : '#22c55e'
    const isHot = pct >= 7
    
    return `
    <div style="margin-bottom:10px;border-radius:10px;padding:12px 14px;border:1px solid var(--border,#e5e7eb)">
      <div style="display:flex;align-items:center">
        <div style="width:22px;height:22px;border-radius:6px;background:${i < 3 ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#9ca3af'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:12px;flex-shrink:0">${i + 1}</div>
        <div style="margin-left:10px;flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:5px">
            <span style="font-weight:600;font-size:15px;color:var(--text,#1f2937)">${s.name}</span>
            <span style="font-size:11px;color:var(--muted,#9ca3af)">${s.code}</span>
            ${isHot ? '<span style="background:#fef2f2;color:#ef4444;font-size:9px;padding:1px 4px;border-radius:3px;font-weight:500">热</span>' : ''}
          </div>
          <div style="margin-top:2px;font-size:11px;color:var(--muted,#9ca3af)">
            ¥${s.price} · 换手${s.turnover}% · ${s.amount}
          </div>
        </div>
        <div style="margin-left:10px;text-align:right;flex-shrink:0">
          <div style="font-size:16px;font-weight:700;color:${pctColor}">${pct >= 0 ? '+' : ''}${pct}%</div>
          <div style="font-size:10px;color:var(--muted,#9ca3af)">评分 ${s.score}</div>
        </div>
      </div>
    </div>`
  }).join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root { color-scheme: light dark }
    @media (prefers-color-scheme: dark) {
      :root { --text: #f3f4f6; --muted: #9ca3af; --border: #374151 }
    }
  </style>
</head>
<body style="margin:0;padding:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:380px;margin:0 auto">
    <div style="text-align:center;margin-bottom:14px">
      <div style="font-size:17px;font-weight:700;color:var(--text,#1f2937)">📊 涨停策略</div>
      <div style="font-size:10px;color:var(--muted,#9ca3af);margin-top:2px">${date} · Top${stocks.length}</div>
    </div>
    ${cards}
    <div style="text-align:center;margin-top:12px;font-size:9px;color:var(--muted,#9ca3af)">
      ⚠️ 仅供参考，不构成投资建议
    </div>
  </div>
</body>
</html>`
}

/**
 * 发送选股结果到微信
 */
export async function sendStockResult(stocks) {
  const date = new Date().toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })

  const title = `涨停策略 Top${stocks.length}`
  const content = formatResultHtml(stocks, date)
  
  return await pushToWechat(title, content, "html")
}