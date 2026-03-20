
// pages/login/login.js
const app = getApp()

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    agreed: false
  },

  onLoad: function (options) {
    // 检查是否已登录
    if (app.checkLogin()) {
      this.setData({
        userInfo: app.globalData.userInfo
      })
    }
  },

  // 处理登录
  handleLogin: function() {
    // 检查是否同意协议
    if (!this.data.agreed) {
      wx.showToast({
        title: '请先阅读并同意用户协议和隐私政策',
        icon: 'none',
        duration: 2000
      })
      return
    }

    // 调用app的登录方法
    app.login((res) => {
      if (res.success) {
        // 更新页面状态
        this.setData({
          userInfo: res.userInfo
        })

        wx.showToast({
          title: '登录成功',
          icon: 'success',
          duration: 1500
        })

        setTimeout(() => {
          wx.switchTab({
            url: '/pages/index/index'
          })
        }, 1500)
      }
    })
  },

  // 切换勾选状态
  toggleAgree: function() {
    this.setData({
      agreed: !this.data.agreed
    })
  },

  // 显示用户协议
  showUserAgreement: function() {
    wx.navigateTo({
      url: '/pages/agreement/agreement?type=user'
    })
  },

  // 显示隐私政策
  showPrivacyPolicy: function() {
    wx.navigateTo({
      url: '/pages/agreement/agreement?type=privacy'
    })
  },

  // 跳转到首页
  goToIndex: function() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  }
})
