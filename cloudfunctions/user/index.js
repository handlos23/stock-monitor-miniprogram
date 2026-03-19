
// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, data } = event

  try {
    // 检查用户是否存在
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get()

    if (userRes.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      }
    }

    const userId = userRes.data[0]._id

    // 根据不同的action执行不同的操作
    switch (action) {
      case 'update':
        // 更新用户信息
        await db.collection('users').doc(userId).update({
          data: {
            ...data,
            updateTime: db.serverDate()
          }
        })
        // 获取更新后的用户信息
        const updatedUserRes = await db.collection('users').doc(userId).get()
        return {
          success: true,
          userInfo: updatedUserRes.data
        }

      case 'get':
        // 获取用户信息
        return {
          success: true,
          userInfo: userRes.data[0]
        }

      case 'delete':
        // 删除用户及其所有数据
        // 删除用户的股票数据
        const stocksRes = await db.collection('stocks').where({
          _openid: openid
        }).get()

        for (const stock of stocksRes.data) {
          await db.collection('stocks').doc(stock._id).remove()
        }

        // 删除用户
        await db.collection('users').doc(userId).remove()

        return {
          success: true,
          message: '用户及数据已删除'
        }

      default:
        return {
          success: false,
          error: '未知的操作类型'
        }
    }
  } catch (err) {
    console.error('用户信息操作失败：', err)
    return {
      success: false,
      error: err
    }
  }
}
