// 云开发容器 - 每 10 秒执行一次股票检查
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

let timer = null

// 股票检查逻辑
async function checkStocks() {
  try {
    console.log('[checkStocks] 开始执行，当前时间：', new Date().toLocaleString('zh-CN'))

    // 获取所有设置了阈值的股票
    console.log('[股票查询] 开始查询设置了阈值的股票...')
    const allStocksRes = await db.collection('stocks').get()
    console.log('[股票查询] 获取所有股票，总数量：', allStocksRes.data.length)
    
    // 过滤出设置了阈值的股票
    const filteredStocks = allStocksRes.data.filter(stock => {
      const hasBuyThreshold = stock.buyThreshold !== '' && stock.buyThreshold != null && stock.buyThreshold !== undefined
      const hasSellThreshold = stock.sellThreshold !== '' && stock.sellThreshold != null && stock.sellThreshold !== undefined
      return hasBuyThreshold || hasSellThreshold
    })
    
    console.log('[股票查询] 过滤后设置了阈值的股票数量：', filteredStocks.length)
    
    const stocks = filteredStocks
    const notifications = []

    if (stocks.length === 0) {
      console.warn('[股票查询] 警告：没有找到设置阈值的股票')
    }

    // 获取所有订阅了消息的用户
    console.log('[检查订阅] 开始查询订阅用户...')
    const subscriptionsRes = await db.collection('subscriptions').where({
      status: 'active'
    }).get()

    console.log('[检查订阅] 订阅用户数量：', subscriptionsRes.data.length)

    const subscribedUsers = new Set()
    subscriptionsRes.data.forEach(sub => {
      subscribedUsers.add(sub.openid)
    })

    console.log('[检查订阅] 已订阅用户数量：', subscribedUsers.size)

    // 检查每只股票是否达到阈值
    console.log('[阈值检查] 开始检查股票，总数：', stocks.length)
    for (const stock of stocks) {
      const stockCode = stock.code
      let apiCode = stockCode
      if (stockCode.startsWith('6')) {
        apiCode = 'sh' + stockCode
      } else {
        apiCode = 'sz' + stockCode
      }

      // 使用云函数 HTTP 请求获取股票数据
      const res = await cloud.callFunction({
        name: 'httpRequest',
        data: {
          url: `http://qt.gtimg.cn/q=${apiCode}`
        }
      })

      if (res.result && res.result.data) {
        const quotes = res.result.data
        const quotePattern = new RegExp(`v_${apiCode}="([^"]*)"`)
        const match = quotes.match(quotePattern)

        if (match && match[1]) {
          const data = match[1].split('~')
          if (data.length > 3) {
            const price = parseFloat(data[3])
            
            // 检查是否达到买入阈值
            if (stock.buyThreshold && price <= parseFloat(stock.buyThreshold)) {
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
      if (!subscribedUsers.has(notification.openid)) {
        console.warn('[跳过发送] 用户未订阅，跳过发送：', notification.openid)
        continue
      }
      
      try {
        const stockName = notification.stockName.substring(0, 10)
        const stockCode = notification.stockCode
        const priceStr = notification.price.toFixed(2)
        const typeText = notification.type === 'buy' ? '下跌' : '上涨'
        const alertText = notification.type === 'buy' ? '买入提醒' : '卖出提醒'
        const timeStr = new Date().toLocaleString('zh-CN', {
          hour12: false,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }).replace(/\//g, '-')
        
        const messageData = {
          touser: notification.openid,
          page: 'pages/index/index',
          miniprogramState: 'formal',
          templateId: 'Ur3vkjigWjD4Z_Yeb4048et1T-qIh20kPahAuxLp0dQ',
          data: {
            thing1: {
              value: `${stockName}(${stockCode})`.substring(0, 20)
            },
            amount14: {
              value: priceStr.substring(0, 10)
            },
            short_thing15: {
              value: typeText.substring(0, 10)
            },
            thing13: {
              value: alertText.substring(0, 20)
            },
            time2: {
              value: timeStr.substring(0, 30)
            }
          }
        }

        const sendResult = await cloud.openapi.subscribeMessage.send(messageData)
        console.log('[checkStocks] 消息发送成功 - 用户：', notification.openid)
      } catch (err) {
        console.error('[checkStocks] 发送订阅消息失败 - 用户：', notification.openid)
        console.error('[checkStocks] 发送失败：', err)
      }
    }

    console.log('[checkStocks] 消息发送完成')

  } catch (err) {
    console.error('[checkStocks] 执行失败：', err)
  }
}

// 云函数入口
exports.main = async (event, context) => {
  // 如果是首次启动，启动定时器
  if (!timer) {
    console.log('[容器启动] 启动定时器，每 10 秒执行一次')
    
    // 立即执行一次
    await checkStocks()
    
    // 设置定时器
    timer = setInterval(async () => {
      await checkStocks()
    }, 10000) // 10 秒 = 10000 毫秒
  }
  
  return {
    success: true,
    message: '容器运行中，每 10 秒检查一次股票'
  }
}
