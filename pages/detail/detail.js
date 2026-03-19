// pages/detail/detail.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    id: '',
    stock: {},
    buyThreshold: '',
    sellThreshold: '',
    remark: ''
  },

  onLoad: function(options) {
    // 检查用户登录状态
    if (!app.checkLogin()) {
      wx.showModal({
        title: '提示',
        content: '请先登录',
        showCancel: false,
        success: function() {
          wx.switchTab({
            url: '/pages/index/index'
          })
        }
      })
      return
    }

    if (options.id) {
      this.setData({
        id: options.id
      })
      this.loadStockDetail()
    }
  },

  // 加载股票详情
  loadStockDetail: function() {
    const { id } = this.data

    wx.showLoading({
      title: '加载中...'
    })

    // 从云数据库获取股票详情
    db.collection('stocks').doc(id).get({
      success: res => {
        const stock = res.data
        this.setData({
          stock,
          buyThreshold: stock.buyThreshold || '',
          sellThreshold: stock.sellThreshold || '',
          remark: stock.remark || ''
        })

        // 获取股票实时行情
        this.getStockQuote(stock.code)
      },
      fail: err => {
        console.error('[数据库] [查询记录] 失败：', err)
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  // 获取股票实时行情
  getStockQuote: function(code) {
    // 构建腾讯股票API所需的代码格式
    let apiCode = code
    if (code.startsWith('6')) {
      // 上海股票代码格式
      apiCode = 'sh' + code
    } else {
      // 深圳股票代码格式
      apiCode = 'sz' + code
    }

    // 调用云函数获取实时行情，处理编码问题
    wx.cloud.callFunction({
      name: 'httpRequest',
      data: {
        url: `http://qt.gtimg.cn/q=${apiCode}`
      },
      success: res => {
        if (!res.result || !res.result.success) {
          console.error('[股票API] 获取行情失败：', res.result)
          return
        }
        
        const quotes = res.result.data
        const quotePattern = new RegExp(`v_${apiCode}="([^"]*)"`)
        const match = quotes.match(quotePattern)

        if (match && match[1]) {
          const data = match[1].split('~')
          if (data.length > 3) {
            const price = parseFloat(data[3])
            const yesterdayClose = parseFloat(data[4])
            const open = parseFloat(data[5])
            const high = parseFloat(data[33])
            const low = parseFloat(data[34])
            const change = price - yesterdayClose
            const changePercent = (change / yesterdayClose * 100).toFixed(2) + '%'

            this.setData({
              stock: {
                ...this.data.stock,
                price,
                yesterdayClose,
                open,
                high,
                low,
                change,
                changePercent
              }
            })
          }
        }
      },
      fail: err => {
        console.error('[股票API] 获取行情失败：', err)
      }
    })
  },

  // 输入买入阈值
  onBuyThresholdInput: function(e) {
    this.setData({
      buyThreshold: e.detail.value
    })
  },

  // 输入卖出阈值
  onSellThresholdInput: function(e) {
    this.setData({
      sellThreshold: e.detail.value
    })
  },

  // 输入备注
  onRemarkInput: function(e) {
    this.setData({
      remark: e.detail.value
    })
  },

  // 更新股票信息
  updateStock: function() {
    const { id, buyThreshold, sellThreshold, remark } = this.data

    wx.showLoading({
      title: '保存中...'
    })

    // 更新云数据库中的股票信息
    db.collection('stocks').doc(id).update({
      data: {
        buyThreshold: buyThreshold || '',
        sellThreshold: sellThreshold || '',
        remark: remark || '',
        updateTime: db.serverDate()
      },
      success: () => {
        wx.hideLoading()
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })

        // 返回上一页
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      },
      fail: err => {
        console.error('[数据库] [更新记录] 失败：', err)
        wx.hideLoading()
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        })
      }
    })
  }
})
