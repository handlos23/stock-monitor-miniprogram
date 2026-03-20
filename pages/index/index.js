// pages/index/index.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    stocks: [],
    loading: false,
    hasMore: true,
    pageSize: 20,
    currentPage: 1,
    userInfo: null,
    isSubscribed: false,
    isSubscribing: false,
    showMenu: false,
    showAddForm: false,
    code: '',
    name: '',
    buyThreshold: '',
    sellThreshold: '',
    remark: '',
    searchResult: null
  },

  onLoad: function (options) {
    // 检查用户登录状态
    if (app.checkLogin()) {
      this.setData({
        userInfo: app.globalData.userInfo
      })
      this.loadStocks()
      this.checkSubscriptionStatus()
    } else {
      // 未登录时跳转到登录页面
      wx.navigateTo({
        url: '/pages/login/login'
      })
    }
  },

  onShow: function () {
    // 页面显示时检查登录状态
    if (app.checkLogin()) {
      // 页面显示时刷新股票列表
      this.loadStocks()
    }
  },

  // 加载股票列表
  loadStocks: function(isLoadMore = false) {
    if (this.data.loading) return

    this.setData({ loading: true })

    // 从云数据库获取当前用户的自选股
    const openid = app.getOpenid()
    const { pageSize, currentPage } = this.data

    db.collection('stocks').where({
      _openid: openid // 获取当前用户的股票
    }).orderBy('createTime', 'desc')
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .get({
      success: res => {
        const newStocks = res.data
        const hasMore = newStocks.length === pageSize

        if (isLoadMore) {
          // 加载更多，追加数据
          this.setData({
            stocks: this.data.stocks.concat(newStocks),
            hasMore,
            loading: false
          })
        } else {
          // 首次加载或刷新，替换数据
          this.setData({
            stocks: newStocks,
            hasMore,
            currentPage: 1,
            loading: false
          })
        }

        // 获取股票实时行情
        this.getStockQuotes(newStocks, isLoadMore)
      },
      fail: err => {
        console.error('[数据库] [查询记录] 失败：', err)
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
        this.setData({ loading: false })
      }
    })
  },

  // 加载更多股票
  loadMoreStocks: function() {
    if (!this.data.hasMore || this.data.loading) return

    this.setData({
      currentPage: this.data.currentPage + 1
    })

    this.loadStocks(true)
  },

  // 获取股票实时行情
  getStockQuotes: function(newStocks, isLoadMore = false) {
    if (newStocks.length === 0) {
      if (!isLoadMore) {
        this.setData({ stocks: [], loading: false })
      }
      return
    }

    // 构建股票代码参数
    const stockCodes = newStocks.map(stock => {
      // 腾讯API需要特定格式的股票代码
      let code = stock.code
      if (code.startsWith('6')) {
        // 上海股票代码格式
        code = 'sh' + code
      } else {
        // 深圳股票代码格式
        code = 'sz' + code
      }
      return code
    }).join(',')

    // 调用云函数获取实时行情，处理编码问题
    wx.cloud.callFunction({
      name: 'httpRequest',
      data: {
        url: `http://qt.gtimg.cn/q=${stockCodes}`
      },
      success: res => {
        if (!res.result || !res.result.success) {
          console.error('[股票API] 获取行情失败：', res.result)
          this.setData({ loading: false })
          return
        }
        
        let quotes = res.result.data
        const updatedStocks = newStocks.map(stock => {
          // 构建股票代码
          let code = stock.code
          if (code.startsWith('6')) {
            code = 'sh' + code
          } else {
            code = 'sz' + code
          }

          // 解析行情数据
          const quotePattern = new RegExp(`v_${code}="([^"]*)"`)
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
              // 处理股票名称乱码
              let name = stock.name
              if (name) {
                // 手动清理乱码字符
                let cleanName = ''
                for (let i = 0; i < name.length; i++) {
                  const charCode = name.charCodeAt(i)
                  // ASCII字符或中文字符
                  if ((charCode >= 0 && charCode <= 127) || (charCode >= 0x4e00 && charCode <= 0x9fa5)) {
                    cleanName += name[i]
                  }
                }
                name = cleanName
              }

              // 检查是否达到阈值
              this.checkThreshold(stock, price)

              var newStock = {
                name: name,
                price: price,
                yesterdayClose: yesterdayClose,
                open: open,
                high: high,
                low: low,
                change: change,
                changePercent: changePercent
              }
              for (var key in stock) {
                if (newStock[key] === undefined) {
                  newStock[key] = stock[key]
                }
              }
              return newStock
            }
          }
          return stock
        })

        if (isLoadMore) {
          // 更新对应位置的股票数据
          var stocks = []
          for (var i = 0; i < this.data.stocks.length; i++) {
            stocks.push(this.data.stocks[i])
          }
          var startIndex = stocks.length - newStocks.length
          for (var j = 0; j < updatedStocks.length; j++) {
            stocks[startIndex + j] = updatedStocks[j]
          }
          this.setData({ stocks, loading: false })
        } else {
          this.setData({ stocks: updatedStocks, loading: false })
        }
      },
      fail: err => {
        console.error('[股票API] 获取行情失败：', err)
        wx.showToast({
          title: '获取行情失败',
          icon: 'none'
        })
        this.setData({ loading: false })
      }
    })
  },

  // 检查股票是否达到阈值
  checkThreshold: function(stock, currentPrice) {
    const { buyThreshold, sellThreshold } = stock
    let message = ''

    if (buyThreshold && currentPrice <= parseFloat(buyThreshold)) {
      message = `${stock.name}(${stock.code}) 价格已低于买入阈值 ${buyThreshold}，当前价格：${currentPrice}`
    } else if (sellThreshold && currentPrice >= parseFloat(sellThreshold)) {
      message = `${stock.name}(${stock.code}) 价格已高于卖出阈值 ${sellThreshold}，当前价格：${currentPrice}`
    }

    if (message) {
      // 发送订阅消息或显示通知
      wx.showToast({
        title: message,
        icon: 'none',
        duration: 3000
      })

      // 这里可以添加订阅消息的代码
      // wx.requestSubscribeMessage({...})
    }
  },

  // 切换菜单显示
  toggleMenu: function() {
    this.setData({
      showMenu: !this.data.showMenu
    })
  },

  // 切换添加表单显示
  toggleAddForm: function() {
    this.setData({
      showAddForm: !this.data.showAddForm
    })
  },

  // 输入股票代码
  onCodeInput: function(e) {
    this.setData({
      code: e.detail.value
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

  // 添加股票
  addStock: function() {
    var that = this
    var code = this.data.code
    var buyThreshold = this.data.buyThreshold
    var sellThreshold = this.data.sellThreshold
    var remark = this.data.remark

    // 表单验证 - 只校验股票代码必填
    if (!code || code.length !== 6) {
      wx.showToast({
        title: '请输入6位股票代码',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: '添加中...'
    })

    // 构建腾讯股票API所需的代码格式
    var apiCode = code
    if (code.startsWith('6')) {
      // 上海股票代码格式
      apiCode = 'sh' + code
    } else {
      // 深圳股票代码格式
      apiCode = 'sz' + code
    }

    // 调用云函数获取股票信息
    wx.cloud.callFunction({
      name: 'httpRequest',
      data: {
        url: 'http://qt.gtimg.cn/q=' + apiCode
      },
      success: function(res) {
        if (!res.result || !res.result.success) {
          wx.hideLoading()
          wx.showToast({
            title: '未找到该股票',
            icon: 'none'
          })
          return
        }

        var quotes = res.result.data
        var quotePattern = new RegExp('v_' + apiCode + '="([^"]*)"')
        var match = quotes.match(quotePattern)

        if (!match || !match[1]) {
          wx.hideLoading()
          wx.showToast({
            title: '未找到该股票',
            icon: 'none'
          })
          return
        }

        var data = match[1].split('~')
        if (data.length <= 3) {
          wx.hideLoading()
          wx.showToast({
            title: '未找到该股票',
            icon: 'none'
          })
          return
        }

        // 处理股票名称编码问题
        var name = data[1]
        // 清理可能的乱码字符
        if (name) {
          // 手动清理乱码字符
          var cleanName = ''
          for (var i = 0; i < name.length; i++) {
            var charCode = name.charCodeAt(i)
            // ASCII字符或中文字符
            if ((charCode >= 0 && charCode <= 127) || (charCode >= 0x4e00 && charCode <= 0x9fa5)) {
              cleanName += name[i]
            }
          }
          name = cleanName
        }

        // 检查是否已添加该股票
        var openid = app.getOpenid()
        db.collection('stocks').where({
          code: code,
          _openid: openid
        }).count({
          success: function(res) {
            if (res.total > 0) {
              wx.hideLoading()
              wx.showToast({
                title: '该股票已添加',
                icon: 'none'
              })
              return
            }

            // 添加股票到云数据库
            db.collection('stocks').add({
              data: {
                code: code,
                name: name,
                buyThreshold: buyThreshold || '',
                sellThreshold: sellThreshold || '',
                remark: remark || '',
                createTime: db.serverDate(),
                updateTime: db.serverDate()
              },
              success: function() {
                wx.hideLoading()
                wx.showToast({
                  title: '添加成功',
                  icon: 'success'
                })

                // 清空表单并关闭
                that.setData({
                  code: '',
                  name: '',
                  buyThreshold: '',
                  sellThreshold: '',
                  remark: '',
                  searchResult: null,
                  showAddForm: false
                })

                // 刷新股票列表
                that.loadStocks()
              },
              fail: function(err) {
                console.error('[数据库] [添加记录] 失败：', err)
                wx.hideLoading()
                wx.showToast({
                  title: '添加失败',
                  icon: 'none'
                })
              }
            })
          },
          fail: function(err) {
            console.error('[数据库] [查询记录] 失败：', err)
            wx.hideLoading()
            wx.showToast({
              title: '添加失败',
              icon: 'none'
            })
          }
        })
      },
      fail: function(err) {
        console.error('[股票API] 查询失败：', err)
        wx.hideLoading()
        wx.showToast({
          title: '查询失败',
          icon: 'none'
        })
      }
    })
  },

  // 显示用户信息
  showUserInfo: function() {
    // 关闭菜单
    this.setData({
      showMenu: false
    })
    // 跳转到登录页面
    wx.navigateTo({
      url: '/pages/login/login'
    })
  },

  // 退出登录
  logout: function() {
    // 关闭菜单
    this.setData({
      showMenu: false
    })
    const that = this
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: function(res) {
        if (res.confirm) {
          app.logout(function() {
            that.setData({
              userInfo: null,
              stocks: []
            })
          })
        }
      }
    })
  },

  // 刷新股票行情
  refreshStocks: function() {
    this.setData({
      currentPage: 1,
      hasMore: true
    })
    this.loadStocks()
    wx.showToast({
      title: '刷新成功',
      icon: 'success'
    })
  },

  // 编辑股票
  editStock: function(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    })
  },

  // 删除股票
  deleteStock: function(e) {
    const id = e.currentTarget.dataset.id

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这只股票吗？',
      success: res => {
        if (res.confirm) {
          db.collection('stocks').doc(id).remove({
            success: () => {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              })
              // 重新加载股票列表
              this.loadStocks()
            },
            fail: err => {
              console.error('[数据库] [删除记录] 失败：', err)
              wx.showToast({
                title: '删除失败',
                icon: 'none'
              })
            }
          })
        }
      }
    })
  },

  // 检查订阅状态
  checkSubscriptionStatus: function() {
    const openid = app.getOpenid()
    db.collection('subscriptions').doc(openid).get().then(res => {
      const currentStatus = res.data && res.data.status
      console.log('当前订阅状态：', currentStatus)
      this.setData({
        isSubscribed: currentStatus === 'active'
      })
    }).catch(err => {
      console.log('未找到订阅记录')
      this.setData({
        isSubscribed: false
      })
    })
  },

  // 订阅消息
  subscribeMessage: function() {
    // 关闭菜单
    this.setData({
      showMenu: false
    })

    // 防止重复点击
    if (this.data.isSubscribing) {
      console.log('订阅消息正在处理中，请稍候')
      return
    }

    const openid = app.getOpenid()
    const isSubscribed = this.data.isSubscribed

    console.log('当前订阅状态：', isSubscribed)

    if (isSubscribed) {
      // 如果已订阅，直接取消订阅
      this.setData({ isSubscribing: true })
      this.cancelSubscription(openid)
    } else {
      // 如果未订阅，则进行订阅
      this.setData({ isSubscribing: true })
      this.requestSubscription(openid)
    }
  },

  // 请求订阅
  requestSubscription: function(openid) {
    wx.requestSubscribeMessage({
      tmplIds: ['Ur3vkjigWjD4Z_Yeb4048et1T-qIh20kPahAuxLp0dQ'],
      success: (res) => {
        console.log('订阅消息结果：', res)
        if (res['Ur3vkjigWjD4Z_Yeb4048et1T-qIh20kPahAuxLp0dQ'] === 'accept') {
          wx.showToast({
            title: '订阅成功',
            icon: 'success'
          })
          // 将订阅状态保存到数据库
          this.saveSubscriptionStatus(openid)
          // 更新页面状态
          this.setData({ 
            isSubscribed: true,
            isSubscribing: false
          })
        } else if (res['Ur3vkjigWjD4Z_Yeb4048et1T-qIh20kPahAuxLp0dQ'] === 'reject') {
          wx.showToast({
            title: '已拒绝订阅',
            icon: 'none'
          })
          this.setData({ isSubscribing: false })
        } else {
          wx.showToast({
            title: '订阅已关闭',
            icon: 'none'
          })
          this.setData({ isSubscribing: false })
        }
      },
      fail: (err) => {
        console.error('订阅消息失败：', err)
        wx.showToast({
          title: '订阅失败',
          icon: 'none'
        })
        this.setData({ isSubscribing: false })
      }
    })
  },

  // 取消订阅
  cancelSubscription: function(openid) {
    db.collection('subscriptions').doc(openid).update({
      data: {
        status: 'inactive',
        unsubscribeTime: db.serverDate()
      }
    }).then(res => {
      console.log('取消订阅成功')
      wx.showToast({
        title: '已取消订阅',
        icon: 'success'
      })
      // 更新页面状态
      this.setData({ 
        isSubscribed: false,
        isSubscribing: false
      })
    }).catch(err => {
      console.error('取消订阅失败：', err)
      wx.showToast({
        title: '取消订阅失败',
        icon: 'none'
      })
      this.setData({ isSubscribing: false })
    })
  },

  // 保存订阅状态
  saveSubscriptionStatus: function(openid) {
    db.collection('subscriptions').doc(openid).set({
      data: {
        openid: openid,
        templateId: 'Ur3vkjigWjD4Z_Yeb4048et1T-qIh20kPahAuxLp0dQ',
        subscribeTime: db.serverDate(),
        status: 'active'
      }
    }).then(res => {
      console.log('保存订阅状态成功')
    }).catch(err => {
      console.error('保存订阅状态失败：', err)
    })
  }
})
