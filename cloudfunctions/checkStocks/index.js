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
      console.log('[checkStocks] 周末不执行，星期：', dayOfWeek)
      return {
        success: true,
        message: '周末不执行'
      }
    }

    // 【临时禁用交易时间检查】用于调试
    // 注释掉交易时间检查，让云函数在任何时间都执行
    // 生产环境时请取消下面的注释
    
    /*
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
    */
    
    console.log('[checkStocks] 开始执行，当前时间：', now.toLocaleString('zh-CN'), '星期:', dayOfWeek)

    // 获取所有设置了阈值的股票
    console.log('[股票查询] 开始查询设置了阈值的股票...')
    let stocksRes
    try {
      // 先获取所有股票
      const allStocksRes = await db.collection('stocks').get()
      console.log('[股票查询] 获取所有股票，总数量：', allStocksRes.data.length)
      
      // 过滤出设置了阈值的股票（阈值不为空字符串且不为 null/undefined）
      const filteredStocks = allStocksRes.data.filter(stock => {
        const hasBuyThreshold = stock.buyThreshold !== '' && stock.buyThreshold != null && stock.buyThreshold !== undefined
        const hasSellThreshold = stock.sellThreshold !== '' && stock.sellThreshold != null && stock.sellThreshold !== undefined
        return hasBuyThreshold || hasSellThreshold
      })
      
      console.log('[股票查询] 过滤后设置了阈值的股票数量：', filteredStocks.length)
      console.log('[股票查询] 股票详情：', JSON.stringify(filteredStocks, null, 2))
      
      // 手动构造返回结果
      stocksRes = {
        data: filteredStocks
      }
    } catch (err) {
      console.error('[股票查询] 查询失败：', err)
      throw err
    }

    const stocks = stocksRes.data
    const notifications = []

    if (stocks.length === 0) {
      console.warn('[股票查询] 警告：没有找到设置阈值的股票，请先在小程序中添加股票并设置阈值')
    }

    // 获取所有订阅了消息的用户
    console.log('[检查订阅] 开始查询订阅用户...')
    const subscriptionsRes = await db.collection('subscriptions').where({
      status: 'active'
    }).get()

    console.log('[检查订阅] 订阅用户查询结果数量：', subscriptionsRes.data.length)
    console.log('[检查订阅] 订阅用户查询结果：', JSON.stringify(subscriptionsRes.data, null, 2))

    const subscribedUsers = new Set()
    subscriptionsRes.data.forEach(sub => {
      console.log('[检查订阅] 添加订阅用户：', sub.openid)
      subscribedUsers.add(sub.openid)
    })

    console.log('[检查订阅] 已订阅用户列表：', Array.from(subscribedUsers))
    console.log('[检查订阅] 已订阅用户数量：', subscribedUsers.size)

    // 检查每只股票是否达到阈值
    console.log('[阈值检查] 开始检查股票，总数：', stocks.length)
    for (const stock of stocks) {
      console.log('[阈值检查] 检查股票：', stock.code, stock.name, '买入阈:', stock.buyThreshold, '卖出阈:', stock.sellThreshold)

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
                changePercent,
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
                changePercent,
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
    console.log('[发送通知] 开始发送通知，总通知数：', notifications.length)
    console.log('[发送通知] 已订阅用户列表：', Array.from(subscribedUsers))
    
    if (notifications.length === 0) {
      console.warn('[警告] 没有需要发送的通知，可能是因为：')
      console.warn('[警告] 1. 没有任何股票达到阈值')
      console.warn('[警告] 2. 股票设置了阈值但价格未达到')
      console.warn('[警告] 3. 数据库中没有股票数据')
    }
    
    for (const notification of notifications) {
      console.log('[发送通知] 准备发送通知：', JSON.stringify(notification))
      console.log('[发送通知] 检查用户订阅状态：', notification.openid, '- 是否已订阅：', subscribedUsers.has(notification.openid))

      // 只向订阅了消息的用户发送通知
      if (!subscribedUsers.has(notification.openid)) {
        console.warn('[跳过发送] 用户未订阅，跳过发送：', notification.openid)
        continue
      }
      
      console.log('[允许发送] 用户已订阅，继续发送：', notification.openid)

      // 准备消息数据 - 移到 try 块外部，以便在 catch 块中也能访问
      const stockName = notification.stockName.substring(0, 10) // 限制长度
      const stockCode = notification.stockCode
      const priceStr = notification.price.toFixed(2)
            
      // 提取涨跌幅数字（去掉%符号），判断正负
      const changePercentNum = parseFloat(notification.changePercent)
      console.log('[消息数据] 原始涨跌幅：', notification.changePercent, '解析后：', changePercentNum)
            
      // 修复 short_thing15 字段格式
      // short_thing 类型最多 10 个字符，不能包含 % 符号
      // 格式：+12.34 或 -12.34
      const changePercentText = changePercentNum.toFixed(2)
      const safeTypeText = changePercentText.substring(0, 10)
      console.log('[消息数据] typeText 最终值：', safeTypeText, '长度：', safeTypeText.length)
            
      const alertText = notification.type === 'buy' ? '买入提醒' : '卖出提醒'
        const timeStr = new Date().toLocaleString('zh-CN', {
          hour12: false,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }).replace(/\//g, '-') // 替换斜杠为横杠
        
        const messageData = {
          touser: notification.openid,
          page: 'pages/index/index',
          miniprogramState: 'formal', // 添加小程序状态参数
          templateId: 'Ur3vkjigWjD4Z_Yeb4048et1T-qIh20kPahAuxLp0dQ',
          data: {
            thing1: {
              value: `${stockName}(${stockCode})`.substring(0, 20) // 提醒内容，最多 20 字符
            },
            amount14: {
              value: priceStr.substring(0, 10) // 当前价格，amount 类型最多 10 字符
            },
            short_thing15: {
              value: safeTypeText // 涨跌幅，格式：+3.56% 或 -2.34%，最多 10 字符
            },
            thing13: {
              value: alertText.substring(0, 20) // 预警类型，thing 类型最多 20 字符
            },
            time2: {
              value: timeStr.substring(0, 30) // 提醒时间，time 类型最多 30 字符
            }
          }
        }

      try {
        console.log('[checkStocks] 发送消息数据：', JSON.stringify(messageData, null, 2))
        console.log('[checkStocks] 准备发送订阅消息给用户：', notification.openid)

        // 发送订阅消息
        const sendResult = await cloud.openapi.subscribeMessage.send(messageData)
        console.log('[checkStocks] 消息发送成功：', sendResult)
        console.log('[checkStocks] 消息发送成功 - 用户：', notification.openid, '消息 ID:', sendResult.msgid)
      } catch (err) {
        console.error('[checkStocks] 发送订阅消息失败 - 用户：', notification.openid)
        console.error('[checkStocks] 发送订阅消息失败：', err)
        console.error('[checkStocks] 错误详情：', JSON.stringify(err, null, 2))

        // 打印更详细的错误信息
        if (err.errCode) {
          console.error('[checkStocks] 错误码：', err.errCode)
          console.error('[checkStocks] 错误信息：', err.errMsg)
          
          // 常见错误码说明
          const errorMessages = {
            40037: 'template_id 不正确',
            41030: 'page 路径不正确',
            43101: '用户拒绝接受消息，如果用户之前曾经订阅过，则表示用户取消了订阅关系',
            47003: '模板参数不准确，可能为空或者不满足规则，errmsg 会提示具体是哪个字段出错',
            41029: '模板数量已达上限',
            41043: '模板已被删除',
            45009: '接口调用超过限额'
          }
          
          console.error('[checkStocks] 错误说明：', errorMessages[err.errCode] || '未知错误')
        }
        
        console.error('[checkStocks] 消息数据：', JSON.stringify(messageData, null, 2))
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
