import cron from "node-cron"

/**
 * 定时任务调度器 (基于 node-cron)
 * - 买入预警: 周一到周五 14:35 执行（初步筛选）
 * - 买入确认: 周一到周五 14:48 执行（最终确认）
 * - 卖出建议1: 周一到周五 09:32 执行（开盘初期）
 * - 卖出建议2: 周一到周五 09:50 执行（走势稳定后）
 */

/**
 * 启动定时任务
 * @param {Object} tasks - 任务配置对象
 * @param {Function} tasks.buyAlert - 买入预警任务 (14:35)
 * @param {Function} tasks.buyConfirm - 买入确认任务 (14:48)
 * @param {Function} tasks.sell1 - 卖出建议1 (09:32)
 * @param {Function} tasks.sell2 - 卖出建议2 (09:50)
 */
export function startScheduler(tasks = {}) {
  console.log("=== 定时任务调度器 ===")
  
  const { buyAlert, buyConfirm, sell1, sell2 } = tasks
  const jobs = []

  // 买入预警：周一至周五 14:35
  if (buyAlert) {
    const buyAlertCron = "00 35 14 * * 1-5"
    console.log(`买入预警: 周一至周五 14:35`)
    
    const buyAlertJob = cron.schedule(buyAlertCron, async () => {
      const now = new Date()
      console.log(`\n[${now.toLocaleString('zh-CN')}] 执行买入预警...`)
      
      try {
        await buyAlert()
      } catch (err) {
        console.error("买入预警执行失败:", err.message)
      }
    }, { timezone: "Asia/Shanghai" })
    
    jobs.push(buyAlertJob)
  }

  // 买入确认：周一至周五 14:48
  if (buyConfirm) {
    const buyConfirmCron = "00 48 14 * * 1-5"
    console.log(`买入确认: 周一至周五 14:48`)
    
    const buyConfirmJob = cron.schedule(buyConfirmCron, async () => {
      const now = new Date()
      console.log(`\n[${now.toLocaleString('zh-CN')}] 执行买入确认...`)
      
      try {
        await buyConfirm()
      } catch (err) {
        console.error("买入确认执行失败:", err.message)
      }
    }, { timezone: "Asia/Shanghai" })
    
    jobs.push(buyConfirmJob)
  }

  // 卖出建议1：周一至周五 09:32（开盘初期）
  if (sell1) {
    const sell1Cron = "00 32 09 * * 1-5"
    console.log(`卖出建议1: 周一至周五 09:32`)
    
    const sell1Job = cron.schedule(sell1Cron, async () => {
      const now = new Date()
      console.log(`\n[${now.toLocaleString('zh-CN')}] 执行卖出建议(第1次)...`)
      
      try {
        await sell1()
      } catch (err) {
        console.error("卖出建议1执行失败:", err.message)
      }
    }, { timezone: "Asia/Shanghai" })
    
    jobs.push(sell1Job)
  }

  // 卖出建议2：周一至周五 09:50（走势稳定后）
  if (sell2) {
    const sell2Cron = "00 50 09 * * 1-5"
    console.log(`卖出建议2: 周一至周五 09:50`)
    
    const sell2Job = cron.schedule(sell2Cron, async () => {
      const now = new Date()
      console.log(`\n[${now.toLocaleString('zh-CN')}] 执行卖出建议(第2次)...`)
      
      try {
        await sell2()
      } catch (err) {
        console.error("卖出建议2执行失败:", err.message)
      }
    }, { timezone: "Asia/Shanghai" })
    
    jobs.push(sell2Job)
  }

  if (jobs.length > 0) {
    console.log(`定时任务已启动，共 ${jobs.length} 个任务`)
  } else {
    console.log("未配置任何定时任务")
  }
  
  return jobs
}

/**
 * 停止所有定时任务
 */
export function stopScheduler(jobs) {
  if (Array.isArray(jobs)) {
    jobs.forEach(job => job?.stop())
    console.log("所有定时任务已停止")
  } else if (jobs) {
    jobs.stop()
    console.log("定时任务已停止")
  }
}
