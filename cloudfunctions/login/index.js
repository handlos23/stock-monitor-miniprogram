
// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { userInfo } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 检查用户是否已存在
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get()

    let userId

    if (userRes.data.length === 0) {
      // 创建新用户
      const createRes = await db.collection('users').add({
        data: {
          nickName: userInfo.nickName || '用户',
          avatarUrl: userInfo.avatarUrl || '',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
      userId = createRes._id
    } else {
      userId = userRes.data[0]._id
      // 更新用户信息
      await db.collection('users').doc(userId).update({
        data: {
          nickName: userInfo.nickName || userRes.data[0].nickName,
          avatarUrl: userInfo.avatarUrl || userRes.data[0].avatarUrl,
          updateTime: db.serverDate()
        }
      })
    }

    // 获取用户完整信息
    const finalUserRes = await db.collection('users').doc(userId).get()

    return {
      success: true,
      openid: openid,
      userInfo: finalUserRes.data
    }
  } catch (err) {
    console.error('用户登录失败：', err)
    return {
      success: false,
      error: err
    }
  }
}
