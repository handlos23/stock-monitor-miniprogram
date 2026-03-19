// app.js
App({
  onLaunch: function () {
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: "cloudbase-4g7doj3715fc1478", 
        traceUser: true,
      })
    }

    this.globalData = {
      userInfo: null,
      openid: null,
      stocks: []
    }

    // 检查用户登录状态
    this.checkLoginStatus()
  },

  // 检查用户登录状态
  checkLoginStatus: function() {
    const that = this
    wx.getStorage({
      key: 'userInfo',
      success: function(res) {
        // 检查登录是否过期（24小时）
        const loginTime = res.data.loginTime || 0
        const currentTime = new Date().getTime()
        const oneDay = 24 * 60 * 60 * 1000 // 24小时的毫秒数
        
        if (currentTime - loginTime > oneDay) {
          // 登录已过期，清除本地存储
          wx.removeStorage({
            key: 'userInfo',
            success: function() {
              that.globalData.userInfo = null
              that.globalData.openid = null
              console.log('登录已过期，需要重新登录')
            }
          })
        } else {
          // 登录未过期，恢复用户信息
          that.globalData.userInfo = res.data.userInfo
          that.globalData.openid = res.data.openid
          console.log('用户已登录', that.globalData.userInfo)
        }
      },
      fail: function() {
        console.log('用户未登录')
      }
    })
  },

  // 用户登录
  login: function(callback) {
    const that = this

    // 获取用户信息
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: function(res) {
        const userInfo = res.userInfo

        // 调用登录云函数
        wx.cloud.callFunction({
          name: 'login',
          data: {
            userInfo: userInfo
          },
          success: function(loginRes) {
            if (loginRes.result.success) {
              // 保存用户信息到本地
              that.globalData.userInfo = loginRes.result.userInfo
              that.globalData.openid = loginRes.result.openid

              wx.setStorage({
                key: 'userInfo',
                data: {
                  userInfo: loginRes.result.userInfo,
                  openid: loginRes.result.openid,
                  loginTime: new Date().getTime() // 记录登录时间
                }
              })

              wx.showToast({
                title: '登录成功',
                icon: 'success'
              })

              if (callback && typeof callback === 'function') {
                callback(loginRes.result)
              }
            } else {
              wx.showToast({
                title: '登录失败',
                icon: 'none'
              })
            }
          },
          fail: function(err) {
            console.error('登录失败', err)
            wx.showToast({
              title: '登录失败',
              icon: 'none'
            })
          }
        })
      },
      fail: function(err) {
        console.error('获取用户信息失败', err)
        wx.showToast({
          title: '需要授权才能使用',
          icon: 'none'
        })
      }
    })
  },

  // 用户退出登录
  logout: function(callback) {
    const that = this

    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: function(res) {
        if (res.confirm) {
          // 清除本地存储
          wx.removeStorage({
            key: 'userInfo',
            success: function() {
              that.globalData.userInfo = null
              that.globalData.openid = null

              wx.showToast({
                title: '已退出登录',
                icon: 'success'
              })

              if (callback && typeof callback === 'function') {
                callback()
              }
            }
          })
        }
      }
    })
  },

  // 检查用户是否已登录
  checkLogin: function() {
    return !!this.globalData.userInfo && !!this.globalData.openid
  },

  // 获取当前用户openid
  getOpenid: function() {
    return this.globalData.openid
  }
})
