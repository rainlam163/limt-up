import cron from "node-cron"

/**
 * 定时任务调度器 (基于 node-cron)
 * 每周一到周五 14:48 执行
 */

// 判断是否是工作日
function isWeekday(date) {
  const day = date.getDay()
  return day >= 1 && day <= 5 // 周一到周五
}

/**
 * 启动定时任务
 * @param {Function} task - 要执行的任务函数
 * @param {string} cronExpression - cron表达式，默认周一至周五14:48
 */
export function startScheduler(task, cronExpression = "48 14 * * 1-5") {
  console.log("=== 定时任务调度器 ===")
  console.log(`执行时间: 周一至周五 14:48`)
  console.log(`Cron表达式: ${cronExpression}`)
  
  // 验证cron表达式
  if (!cron.validate(cronExpression)) {
    console.error("无效的Cron表达式:", cronExpression)
    return
  }

  // 创建定时任务
  const job = cron.schedule(cronExpression, async () => {
    const now = new Date()
    console.log(`\n[${now.toLocaleString('zh-CN')}] 开始执行任务...`)
    
    try {
      await task()
    } catch (err) {
      console.error("任务执行失败:", err.message)
    }
  }, {
    timezone: "Asia/Shanghai"
  })

  console.log(`定时任务已启动，下次执行: 周一至周五 14:48`)
  
  // 返回job实例，可用于停止任务
  return job
}

/**
 * 停止定时任务
 */
export function stopScheduler(job) {
  if (job) {
    job.stop()
    console.log("定时任务已停止")
  }
}