// pages/guide/guide.js
const app = getApp()

Page({
  data: {
    stocks: []
  },

  onLoad: function (options) {
    this.loadSampleStocks()
  },

  // 加载示例股票数据
  loadSampleStocks: function() {
    const sampleStocks = [
      {
        _id: 'sample1',
        code: '600519',
        name: '贵州茅台',
        price: 1850.00,
        change: 20.00,
        changePercent: '+1.09%'
      },
      {
        _id: 'sample2',
        code: '000858',
        name: '五粮液',
        price: 165.50,
        change: -2.50,
        changePercent: '-1.49%'
      },
      {
        _id: 'sample3',
        code: '300750',
        name: '宁德时代',
        price: 220.80,
        change: 5.80,
        changePercent: '+2.70%'
      }
    ]

    this.setData({
      stocks: sampleStocks
    })
  },

  // 跳转到登录页面
  goToLogin: function() {
    wx.navigateTo({
      url: '/pages/login/login'
    })
  },

  // 跳转到首页
  goToIndex: function() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  }
})
