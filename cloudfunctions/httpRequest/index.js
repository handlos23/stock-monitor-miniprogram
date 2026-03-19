// 云函数入口文件
const cloud = require('wx-server-sdk')
const request = require('request-promise')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const { url } = event

  try {
    const result = await request({
      uri: url,
      encoding: null,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    }).then(buffer => {
      const iconv = require('iconv-lite');
      console.log('[httpRequest] 原始数据长度：', buffer.length);
      
      // 尝试多种编码方式
      const encodings = ['gbk', 'gb18030', 'gb2312', 'utf8'];
      let decodedText = '';
      
      for (const encoding of encodings) {
        try {
          decodedText = iconv.decode(buffer, encoding);
          console.log(`[httpRequest] 尝试${encoding}解码：`, decodedText.substring(0, 100));
          
          // 检查是否包含中文字符
          if (/[\u4e00-\u9fa5]/.test(decodedText)) {
            console.log(`[httpRequest] 使用${encoding}解码成功`);
            return decodedText;
          }
        } catch (e) {
          console.log(`[httpRequest] ${encoding}解码失败：`, e.message);
        }
      }
      
      // 如果都失败，使用GBK作为默认
      console.log('[httpRequest] 使用GBK作为默认编码');
      return iconv.decode(buffer, 'gbk');
    })

    return {
      success: true,
      data: result
    }
  } catch (err) {
    console.error('HTTP请求失败：', err)
    return {
      success: false,
      error: err
    }
  }
}
