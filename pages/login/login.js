
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
      wx.switchTab({
        url: '/pages/index/index'
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

  // 跳转到注册页面
  goToRegister: function() {
    wx.showToast({
      title: '暂不支持注册',
      icon: 'none'
    })
  }
})
