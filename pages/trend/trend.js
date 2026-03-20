// pages/trend/trend.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    stocks: [],
    loading: false,
    userInfo: null,
    isSubscribed: false,
    showMenu: false
  },

  onLoad: function (options) {
    this.checkLogin()
    this.loadStocks()
  },

  onShow: function() {
    if (this.data.userInfo) {
      this.loadStocks()
    }
  },

  // 检查登录状态
  checkLogin: function() {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.setData({
        userInfo: userInfo
      })
      this.checkSubscription()
    }
  },

  // 检查订阅状态
  checkSubscription: function() {
    const that = this
    wx.getSetting({
      withSubscriptions: true,
      success: function(res) {
        if (res.subscriptionsSetting && res.subscriptionsSetting.itemSettings) {
          const itemSettings = res.subscriptionsSetting.itemSettings
          const templateId = 'your_template_id' // 替换为实际的模板ID
          if (itemSettings[templateId] === 'accept') {
            that.setData({
              isSubscribed: true
            })
          }
        }
      }
    })
  },

  // 切换菜单显示
  toggleMenu: function() {
    this.setData({
      showMenu: !this.data.showMenu
    })
  },

  // 显示用户信息
  showUserInfo: function() {
    this.setData({
      showMenu: false
    })
    wx.showToast({
      title: '用户信息',
      icon: 'none'
    })
  },

  // 订阅消息
  subscribeMessage: function() {
    this.setData({
      showMenu: false
    })
    wx.showToast({
      title: '订阅功能',
      icon: 'none'
    })
  },

  // 退出登录
  logout: function() {
    this.setData({
      showMenu: false
    })
    wx.removeStorageSync('userInfo')
    this.setData({
      userInfo: null
    })
    wx.showToast({
      title: '已退出登录',
      icon: 'success'
    })
  },

  // 加载股票列表
  loadStocks: function() {
    const that = this
    const openid = app.getOpenid()

    if (!openid) {
      return
    }

    wx.showLoading({
      title: '加载中...'
    })

    db.collection('stocks')
      .where({
        _openid: openid
      })
      .orderBy('createTime', 'desc')
      .get({
        success: function(res) {
          const stocks = res.data

          if (stocks.length === 0) {
            that.setData({
              stocks: []
            })
            wx.hideLoading()
            return
          }

          // 获取每个股票的实时数据
          that.loadStockDetails(stocks)
        },
        fail: function(err) {
          console.error('[数据库] [查询记录] 失败：', err)
          wx.hideLoading()
          wx.showToast({
            title: '加载失败',
            icon: 'none'
          })
        }
      })
  },

  // 加载股票详细信息
  loadStockDetails: function(stocks) {
    const that = this
    let completed = 0
    const total = stocks.length

    stocks.forEach((stock, index) => {
      const apiCode = stock.code.startsWith('6') ? 'sh' + stock.code : 'sz' + stock.code
      console.log('股票', stock.code, 'apiCode:', apiCode)

      // 获取实时行情数据
      wx.cloud.callFunction({
        name: 'httpRequest',
        data: {
          url: 'http://qt.gtimg.cn/q=' + apiCode
        },
        success: function(res) {
          if (res.result && res.result.success) {
            const quotes = res.result.data
            const quotePattern = new RegExp('v_' + apiCode + '="([^"]*)"')
            const match = quotes.match(quotePattern)

            if (match && match[1]) {
              const data = match[1].split('~')
              if (data.length > 3) {
                const price = parseFloat(data[3])
                const yesterdayClose = parseFloat(data[4])
                const change = price - yesterdayClose
                const changePercent = (change / yesterdayClose * 100).toFixed(2) + '%'

                stocks[index].price = price
                stocks[index].yesterdayClose = yesterdayClose
                stocks[index].change = change
                stocks[index].changePercent = changePercent
                stocks[index].open = parseFloat(data[5])
                stocks[index].high = parseFloat(data[33])
                stocks[index].low = parseFloat(data[34])
              }
            }
          }
        }
      })

      // 获取历史K线数据
      // 计算5天前的日期
      const now = new Date()
      const startDate = new Date(now)
      startDate.setDate(now.getDate() - 10) // 多取几天以确保有足够的交易日

      const startYear = startDate.getFullYear()
      const startMonth = (startDate.getMonth() + 1).toString().padStart(2, '0')
      const startDay = startDate.getDate().toString().padStart(2, '0')
      const startDateStr = `${startYear}-${startMonth}-${startDay}`

      const klineUrl = 'http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' + apiCode + ',day,' + startDateStr + ',,5,qfq'
      console.log('股票', stock.code, '准备获取K线数据, URL:', klineUrl)

      wx.cloud.callFunction({
        name: 'httpRequest',
        data: {
          url: klineUrl
        },
        success: function(res) {
          console.log('股票', stock.code, 'K线数据请求成功回调触发, res:', res)
          console.log('股票', stock.code, 'res.result:', res.result)
          console.log('股票', stock.code, 'res.result.success:', res.result ? res.result.success : 'undefined')

          if (res.result && res.result.success) {
            try {
              console.log('股票', stock.code, '开始解析K线数据')
              const data = JSON.parse(res.result.data)
              console.log('股票', stock.code, '原始K线数据:', data)
              if (data && data.data) {
                console.log('股票', stock.code, 'data.data的键:', Object.keys(data.data))
                if (data.data[apiCode]) {
                  const klineData = data.data[apiCode].day
                  console.log('股票', stock.code, 'K线数据类型:', typeof klineData, '是否为数组:', Array.isArray(klineData))
                  if (klineData && Array.isArray(klineData) && klineData.length > 0) {
                    stocks[index].historyData = klineData
                    console.log('股票', stock.code, '历史数据:', klineData)
                  } else {
                    console.warn('股票', stock.code, 'K线数据格式不正确, klineData:', klineData)
                  }
                } else {
                  console.warn('股票', stock.code, '未找到K线数据, data.data:', data.data)
                }
              } else {
                console.warn('股票', stock.code, '未找到data.data')
              }
            } catch (e) {
              console.error('解析K线数据失败', e)
            }
          } else {
            console.warn('获取K线数据失败, res:', res)
          }
        },
        fail: function(err) {
          console.error('股票', stock.code, '获取K线数据请求失败:', err)
        },
        complete: function() {
          completed++
          if (completed === total) {
            that.setData({
              stocks: stocks
            })
            wx.hideLoading()
            // 绘制走势图
            that.drawCharts()
          }
        }
      })
    })
  },

  // 绘制走势图
  drawCharts: function() {
    const that = this
    const stocks = this.data.stocks

    stocks.forEach((stock, index) => {
      that.drawTrendChart(index, stock)
    })
  },

  // 绘制单个股票走势图
  drawTrendChart: function(index, stock) {
    const ctx = wx.createCanvasContext('trendChart' + index, this)
    const canvasId = 'trendChart' + index
    const that = this

    // 获取画布尺寸
    const query = wx.createSelectorQuery()
    query.select('#' + canvasId).boundingClientRect()
    query.exec(function(res) {
      if (!res || !res[0]) {
        return
      }

      const width = res[0].width
      const height = res[0].height
      const padding = 40
      const chartWidth = width - padding * 2
      const chartHeight = height - padding * 2

      // 清空画布
      ctx.clearRect(0, 0, width, height)

      // 使用真实的历史数据或生成模拟数据
      let prices = []
      let dates = []

      console.log('股票', stock.code, '开始绘制走势图, historyData:', stock.historyData)

      if (stock.historyData && stock.historyData.length > 0) {
        // 使用真实的历史K线数据
        stock.historyData.slice(-5).forEach(item => {
          if (item && item.length >= 4) {
            // 第4个参数（索引3）是收盘价
            const closePrice = parseFloat(item[3])
            if (!isNaN(closePrice)) {
              prices.push(closePrice)
              const date = new Date(item[0])
              if (!isNaN(date.getTime())) {
                const month = date.getMonth() + 1
                const day = date.getDate()
                dates.push(`${month}/${day}`)
              }
            }
          }
        })

        console.log('股票', stock.code, '解析后的价格:', prices)

        // 如果解析后没有有效数据，使用模拟数据
        if (prices.length === 0) {
          console.warn('股票', stock.code, '没有有效的价格数据，使用模拟数据')
          const data = that.generateTrendData(stock.price, 5)
          prices = data.prices
          dates = data.dates
        }
      } else {
        // 如果没有历史数据，使用模拟数据
        console.warn('股票', stock.code, '没有历史数据，使用模拟数据')
        const data = that.generateTrendData(stock.price, 5)
        prices = data.prices
        dates = data.dates
      }

      // 计算价格范围
      const maxPrice = Math.max(...prices)
      const minPrice = Math.min(...prices)
      const priceRange = maxPrice - minPrice || 1

      console.log('股票', stock.code, '价格范围:', minPrice, '-', maxPrice)

      // 绘制网格线
      ctx.setStrokeStyle('#e8e8e8')
      ctx.setLineWidth(1)

      // 绘制水平网格线和Y轴标签
      for (let i = 0; i <= 4; i++) {
        const y = padding + (i / 4) * chartHeight
        const price = maxPrice - (i / 4) * priceRange

        ctx.beginPath()
        ctx.moveTo(padding, y)
        ctx.lineTo(width - padding, y)
        ctx.stroke()

        // 绘制Y轴标签
        ctx.setFontSize(10)
        ctx.setFillStyle('#8c8c8c')
        ctx.setTextAlign('right')
        ctx.fillText(price.toFixed(2), padding - 5, y + 4)
      }

      // 绘制走势线
      ctx.beginPath()
      ctx.setStrokeStyle(stock.change >= 0 ? '#ff4d4f' : '#52c41a')
      ctx.setLineWidth(2)

      prices.forEach((price, i) => {
        const x = padding + (i / (prices.length - 1)) * chartWidth
        const y = padding + chartHeight - ((price - minPrice) / priceRange) * chartHeight

        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      })

      ctx.stroke()

      // 绘制数据点和价格标签
      prices.forEach((price, i) => {
        const x = padding + (i / (prices.length - 1)) * chartWidth
        const y = padding + chartHeight - ((price - minPrice) / priceRange) * chartHeight

        // 绘制数据点
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, 2 * Math.PI)
        ctx.setFillStyle(stock.change >= 0 ? '#ff4d4f' : '#52c41a')
        ctx.fill()

        // 绘制价格标签
        ctx.setFontSize(10)
        ctx.setFillStyle('#1a1a1a')
        ctx.setTextAlign('center')
        ctx.fillText(price.toFixed(2), x, y - 10)
      })

      // 绘制X轴标签（日期）
      dates.forEach((date, i) => {
        const x = padding + (i / (dates.length - 1)) * chartWidth
        const y = height - padding + 20

        ctx.setFontSize(10)
        ctx.setFillStyle('#8c8c8c')
        ctx.setTextAlign('center')
        ctx.fillText(date, x, y)
      })

      ctx.draw()
    })
  },

  // 生成模拟的走势数据
  generateTrendData: function(currentPrice, days) {
    const prices = []
    const dates = []
    let price = currentPrice
    const now = new Date()

    // 从5天前开始生成数据
    for (let i = days - 1; i >= 0; i--) {
      // 随机波动，范围在-3%到+3%之间
      const change = (Math.random() - 0.5) * 0.06
      price = price * (1 + change)
      prices.push(price)

      // 生成日期
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const month = date.getMonth() + 1
      const day = date.getDate()
      dates.push(`${month}/${day}`)
    }

    // 最后一个价格使用当前价格
    prices[days - 1] = currentPrice

    return {
      prices: prices,
      dates: dates
    }
  },

  // 刷新走势
  refreshTrends: function() {
    this.loadStocks()
  }
})
