// pages/add/add.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    code: '',
    name: '',
    buyThreshold: '',
    sellThreshold: '',
    remark: '',
    searchResult: null
  },

  onLoad: function (options) {
    // 不再强制登录，允许未登录用户搜索股票
  },

  // 输入股票代码
  onCodeInput: function(e) {
    this.setData({
      code: e.detail.value
    })
  },

  // 输入股票名称
  onNameInput: function(e) {
    this.setData({
      name: e.detail.value
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

  // 查询股票信息
  searchStock: function() {
    const { code } = this.data

    if (!code || code.length !== 6) {
      wx.showToast({
        title: '请输入6位股票代码',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: '查询中...'
    })

    // 构建腾讯股票API所需的代码格式
    let apiCode = code
    if (code.startsWith('6')) {
      // 上海股票代码格式
      apiCode = 'sh' + code
    } else {
      // 深圳股票代码格式
      apiCode = 'sz' + code
    }

    // 调用云函数获取股票信息，处理编码问题
    wx.cloud.callFunction({
      name: 'httpRequest',
      data: {
        url: `http://qt.gtimg.cn/q=${apiCode}`
      },
      success: res => {
        if (!res.result || !res.result.success) {
          wx.hideLoading()
          wx.showToast({
            title: '查询失败',
            icon: 'none'
          })
          return
        }
        
        let quotes = res.result.data
        const quotePattern = new RegExp(`v_${apiCode}="([^"]*)"`)
        const match = quotes.match(quotePattern)

        if (match && match[1]) {
          const data = match[1].split('~')
          if (data.length > 3) {
            const price = parseFloat(data[3])
            const yesterdayClose = parseFloat(data[4])
            const change = price - yesterdayClose
            const changePercent = (change / yesterdayClose * 100).toFixed(2) + '%'
            let name = data[1]
            // 清理可能的乱码字符
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

            this.setData({
              searchResult: {
                code,
                name,
                price,
                change,
                changePercent
              }
            })
          } else {
            wx.showToast({
              title: '未找到该股票',
              icon: 'none'
            })
          }
        } else {
          wx.showToast({
            title: '未找到该股票',
            icon: 'none'
          })
        }
      },
      fail: err => {
        console.error('[股票API] 查询失败：', err)
        wx.showToast({
          title: '查询失败',
          icon: 'none'
        })
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  // 使用搜索结果
  useSearchResult: function() {
    const { searchResult } = this.data
    if (searchResult) {
      this.setData({
        name: searchResult.name,
        code: searchResult.code
      })
    }
  },

  // 添加股票
  addStock: function() {
    // 检查用户登录状态
    if (!app.checkLogin()) {
      wx.showModal({
        title: '提示',
        content: '添加自选股需要登录',
        confirmText: '去登录',
        success: function(res) {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/login/login'
            })
          }
        }
      })
      return
    }

    const { code, buyThreshold, sellThreshold, remark } = this.data

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
    let apiCode = code
    if (code.startsWith('6')) {
      // 上海股票代码格式
      apiCode = 'sh' + code
    } else {
      // 深圳股票代码格式
      apiCode = 'sz' + code
    }

    // 调用云函数获取股票信息，处理编码问题
    wx.cloud.callFunction({
      name: 'httpRequest',
      data: {
        url: `http://qt.gtimg.cn/q=${apiCode}`
      },
      success: res => {
        if (!res.result || !res.result.success) {
          wx.hideLoading()
          wx.showToast({
            title: '未找到该股票',
            icon: 'none'
          })
          return
        }
        
        let quotes = res.result.data
        const quotePattern = new RegExp(`v_${apiCode}="([^"]*)"`)
        const match = quotes.match(quotePattern)

        if (!match || !match[1]) {
          wx.hideLoading()
          wx.showToast({
            title: '未找到该股票',
            icon: 'none'
          })
          return
        }

        const data = match[1].split('~')
        if (data.length <= 3) {
          wx.hideLoading()
          wx.showToast({
            title: '未找到该股票',
            icon: 'none'
          })
          return
        }

        // 处理股票名称编码问题
        let name = data[1]
        // 清理可能的乱码字符
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

        // 检查是否已添加该股票
        const openid = app.getOpenid()
        db.collection('stocks').where({
          code: code,
          _openid: openid
        }).count({
          success: res => {
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
                code,
                name,
                buyThreshold: buyThreshold || '',
                sellThreshold: sellThreshold || '',
                remark: remark || '',
                createTime: db.serverDate(),
                updateTime: db.serverDate()
              },
              success: () => {
                wx.hideLoading()
                wx.showToast({
                  title: '添加成功',
                  icon: 'success'
                })

                // 清空表单
                this.setData({
                  code: '',
                  name: '',
                  buyThreshold: '',
                  sellThreshold: '',
                  remark: '',
                  searchResult: null
                })

                // 返回首页
                setTimeout(() => {
                  wx.navigateBack()
                }, 1500)
              },
              fail: err => {
                console.error('[数据库] [添加记录] 失败：', err)
                wx.hideLoading()
                wx.showToast({
                  title: '添加失败',
                  icon: 'none'
                })
              }
            })
          },
          fail: err => {
            console.error('[数据库] [查询记录] 失败：', err)
            wx.hideLoading()
            wx.showToast({
              title: '添加失败',
              icon: 'none'
            })
          }
        })
      },
      fail: err => {
        console.error('[股票API] 查询失败：', err)
        wx.hideLoading()
        wx.showToast({
          title: '查询失败',
          icon: 'none'
        })
      }
    })
  }
})
