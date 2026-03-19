# 股票监测微信小程序

这是一个基于微信云开发的股票监测小程序，可以添加自选股，设置买入和卖出阈值，并在达到阈值时接收提醒。

## 功能特点

1. 股票列表展示：展示已添加的自选股及其实时行情
2. 添加股票：通过股票代码添加自选股，并设置买入和卖出阈值
3. 股票详情：查看股票详细信息和修改阈值设置
4. 价格提醒：当股票价格达到设定的买入或卖出阈值时，发送提醒通知

## 技术栈

- 前端：微信小程序原生框架
- 后端：微信云开发
- 数据源：腾讯股票API (http://qt.gtimg.cn/q=)

## 项目结构

```
stock-monitor-miniprogram/
├── app.js                 # 小程序入口文件
├── app.json               # 小程序全局配置
├── app.wxss               # 小程序全局样式
├── sitemap.json           # 站点地图配置
├── project.config.json    # 项目配置文件
├── pages/                 # 页面目录
│   ├── index/             # 首页（股票列表）
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   ├── add/               # 添加股票页面
│   │   ├── add.js
│   │   ├── add.json
│   │   ├── add.wxml
│   │   └── add.wxss
│   └── detail/            # 股票详情页面
│       ├── detail.js
│       ├── detail.json
│       ├── detail.wxml
│       └── detail.wxss
└── cloudfunctions/        # 云函数目录
    ├── checkStocks/       # 检查股票价格并发送提醒的云函数
    │   ├── index.js
    │   └── package.json
    └── httpRequest/       # 发送HTTP请求的云函数
        ├── index.js
        └── package.json
```

## 使用说明

### 前置条件

1. 注册微信小程序账号，获取AppID
2. 开通微信云开发服务，获取环境ID
3. 创建云数据库集合：stocks

### 配置步骤

1. 修改 `app.js` 文件，将 `your-env-id` 替换为你的云开发环境ID

2. 修改 `project.config.json` 文件，将 `your-appid` 替换为你的小程序AppID

3. 在云数据库中创建 `stocks` 集合，用于存储股票信息

4. 部署云函数：
   - 在微信开发者工具中，右键点击 `cloudfunctions/checkStocks` 文件夹，选择"上传并部署：云端安装依赖"
   - 同样方式部署 `cloudfunctions/httpRequest` 云函数

5. 配置订阅消息：
   - 在微信公众平台创建订阅消息模板
   - 修改 `cloudfunctions/checkStocks/index.js` 文件，将 `YOUR_TEMPLATE_ID` 替换为你的订阅消息模板ID

### 运行项目

1. 使用微信开发者工具打开项目
2. 点击"编译"按钮运行项目
3. 在模拟器或真机预览中测试功能

### 设置定时任务

为了定期检查股票价格并发送提醒，需要设置云函数的定时触发器：

1. 在微信开发者工具中，右键点击 `cloudfunctions/checkStocks` 文件夹
2. 选择"云函数触发器" -> "新建触发器"
3. 设置触发规则，例如每10分钟执行一次：`0 */10 * * * * *`

## 注意事项

1. 腾讯股票API是第三方接口，可能会发生变化，需要及时更新代码以适应接口变化
2. 订阅消息需要用户授权，确保在合适的位置请求用户授权
3. 云函数有免费额度限制，注意控制调用频率
4. 股票数据仅供参考，不构成投资建议

## 后续优化方向

1. 添加更多股票技术指标
2. 支持自定义提醒频率
3. 添加K线图等图表展示
4. 支持股票分组管理
5. 添加自选股导入/导出功能
