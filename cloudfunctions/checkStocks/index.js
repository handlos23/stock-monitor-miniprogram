// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    // 检查当前时间是否在交易时间内
    const now = new Date()
    const dayOfWeek = now.getDay()
    const hour = now.getHours()
    const minute = now.getMinutes()

    // 只在工作日（周一到周五）执行
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log('[checkStocks] 周末不执行')
      return {
        success: true,
        message: '周末不执行'
      }
    }

    // 检查是否在交易时间内：9:30-11:30 或 13:00-15:00
    const currentTime = hour * 60 + minute
    const morningStart = 9 * 60 + 30  // 9:30
    const morningEnd = 11 * 60 + 30   // 11:30
    const afternoonStart = 13 * 60    // 13:00
    const afternoonEnd = 15 * 60      // 15:00

    const isTradingTime = (currentTime >= morningStart && currentTime < morningEnd) ||
                         (currentTime >= afternoonStart && currentTime < afternoonEnd)

    if (!isTradingTime) {
      console.log('[checkStocks] 非交易时间不执行，当前时间：', now.toLocaleString('zh-CN'))
      return {
        success: true,
        message: '非交易时间不执行'
      }
    }

    console.log('[checkStocks] 交易时间检查通过，当前时间：', now.toLocaleString('zh-CN'))

    // 获取所有设置了阈值的股票
    const stocksRes = await db.collection('stocks').where({
      $or: [
        { buyThreshold: _.neq('').and(_.neq(null)) },
        { sellThreshold: _.neq('').and(_.neq(null)) }
      ]
    }).get()

    const stocks = stocksRes.data
    const notifications = []

    console.log('[checkStocks] 需要检查的股票数量：', stocks.length)

    // 获取所有订阅了消息的用户
    const subscriptionsRes = await db.collection('subscriptions').where({
      status: 'active'
    }).get()

    console.log('[checkStocks] 订阅用户查询结果：', subscriptionsRes.data)

    const subscribedUsers = new Set()
    subscriptionsRes.data.forEach(sub => {
      subscribedUsers.add(sub.openid)
    })

    console.log('[checkStocks] 已订阅用户列表：', Array.from(subscribedUsers))

    // 检查每只股票是否达到阈值
    for (const stock of stocks) {
      console.log('[checkStocks] 检查股票：', stock.code, stock.name)

      // 获取股票实时行情
      const stockCode = stock.code
      let apiCode = stockCode
      if (stockCode.startsWith('6')) {
        apiCode = 'sh' + stockCode
      } else {
        apiCode = 'sz' + stockCode
      }

      console.log('[checkStocks] API代码：', apiCode)

      // 使用云函数HTTP请求获取股票数据
      const res = await cloud.callFunction({
        name: 'httpRequest',
        data: {
          url: `http://qt.gtimg.cn/q=${apiCode}`
        }
      })

      if (res.result && res.result.data) {
        const quotes = res.result.data
        console.log('[checkStocks] 股票数据：', quotes)

        const quotePattern = new RegExp(`v_${apiCode}="([^"]*)"`)
        const match = quotes.match(quotePattern)

        if (match && match[1]) {
          const data = match[1].split('~')
          if (data.length > 3) {
            const price = parseFloat(data[3])
            const yesterdayClose = parseFloat(data[4])
            const change = price - yesterdayClose
            const changePercent = (change / yesterdayClose * 100).toFixed(2) + '%'

            console.log('[checkStocks] 股票价格：', price, '昨收：', yesterdayClose, '涨跌：', changePercent)
            console.log('[checkStocks] 买入阈值：', stock.buyThreshold, '卖出阈值：', stock.sellThreshold)

            // 检查是否达到买入阈值
            if (stock.buyThreshold && price <= parseFloat(stock.buyThreshold)) {
              console.log('[checkStocks] 达到买入阈值！')
              notifications.push({
                openid: stock._openid,
                stockName: stock.name,
                stockCode: stock.code,
                price,
                type: 'buy',
                threshold: stock.buyThreshold,
                message: `${stock.name}(${stock.code}) 价格已低于买入阈值 ${stock.buyThreshold}，当前价格：${price}`
              })
            }

            // 检查是否达到卖出阈值
            if (stock.sellThreshold && price >= parseFloat(stock.sellThreshold)) {
              console.log('[checkStocks] 达到卖出阈值！')
              notifications.push({
                openid: stock._openid,
                stockName: stock.name,
                stockCode: stock.code,
                price,
                type: 'sell',
                threshold: stock.sellThreshold,
                message: `${stock.name}(${stock.code}) 价格已高于卖出阈值 ${stock.sellThreshold}，当前价格：${price}`
              })
            }
          }
        }
      }
    }

    console.log('[checkStocks] 需要发送的通知数量：', notifications.length)

    // 发送通知
    for (const notification of notifications) {
      console.log('[checkStocks] 准备发送通知：', notification)

      // 只向订阅了消息的用户发送通知
      if (!subscribedUsers.has(notification.openid)) {
        console.log('[checkStocks] 用户未订阅，跳过发送：', notification.openid)
        continue
      }

      try {
        // 准备消息数据
        const messageData = {
          touser: notification.openid,
          page: 'pages/index/index',
          templateId: 'Ur3vkjigWjD4Z_Yeb4048et1T-qIh20kPahAuxLp0dQ',
          data: {
            thing1: {
              value: `${notification.stockName}(${notification.stockCode})`
            },
            amount14: {
              value: notification.price.toFixed(2)
            },
            short_thing15: {
              value: notification.type === 'buy' ? '下跌' : '上涨'
            },
            thing13: {
              value: notification.type === 'buy' ? '买入提醒' : '卖出提醒'
            },
            time2: {
              value: new Date().toLocaleString('zh-CN', { 
                hour12: false,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
            }
          }
        }

        console.log('[checkStocks] 发送消息数据：', JSON.stringify(messageData, null, 2))

        // 发送订阅消息
        const sendResult = await cloud.openapi.subscribeMessage.send(messageData)
        console.log('[checkStocks] 消息发送成功：', sendResult)
      } catch (err) {
        console.error('[checkStocks] 发送订阅消息失败：', err)
        console.error('[checkStocks] 错误详情：', JSON.stringify(err, null, 2))

        // 打印更详细的错误信息
        if (err.errCode) {
          console.error('[checkStocks] 错误码：', err.errCode)
          console.error('[checkStocks] 错误信息：', err.errMsg)
        }
      }
    }

    console.log('[checkStocks] 消息发送完成')

    return {
      success: true,
      notifications: notifications.length
    }
  } catch (err) {
    console.error('检查股票失败：', err)
    return {
      success: false,
      error: err
    }
  }
}
