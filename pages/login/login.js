
// pages/login/login.js
const app = getApp()

Page({
  data: {
    userInfo: null,
    hasUserInfo: false
  },

  onLoad: function (options) {
    // 检查是否已登录
    if (app.checkLogin()) {
      this.setData({
        userInfo: app.globalData.userInfo
      })
    }
  },

  // 获取用户信息并登录
  getUserInfo: function() {
    app.login(function(res) {
      if (res.success) {
        wx.switchTab({
          url: '/pages/index/index'
        })
      }
    })
  },

  // 跳转到首页
  goToIndex: function() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  // 退出登录
  logout: function() {
    const that = this
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: function(res) {
        if (res.confirm) {
          app.logout(function() {
            that.setData({
              userInfo: null
            })
          })
        }
      }
    })
  },

  // 跳转到注册页面
  goToRegister: function() {
    wx.showToast({
      title: '暂不支持注册',
      icon: 'none'
    })
  }
})
