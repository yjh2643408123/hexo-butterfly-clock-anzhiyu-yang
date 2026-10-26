# hexo-butterfly-clock-anzhiyu-yang

为 Hexo 的 Butterfly、Anzhiyu、Solitude 主题添加侧栏日期、电子钟与天气卡片。兼容 Hexo 7 和 Hexo 8，支持整页加载、PJAX，以及 Solitude 4 的导航生命周期。

基于 [anzhiyu-c/hexo-butterfly-clock-anzhiyu](https://github.com/anzhiyu-c/hexo-butterfly-clock-anzhiyu) 修改，采用 Apache-2.0 许可证。天气图标来自 [QWeather Icons](https://icons.qweather.com/)，图标授权为 CC BY 4.0，字体样式代码为 MIT。

## 安装

在博客根目录执行：

```sh
npm install hexo-butterfly-clock-anzhiyu-yang
```

如果已安装其他版本的侧栏时钟插件，先卸载对应插件，避免重复卡片。已经将时钟脚本单独写入博客的用户，请在切换到本插件后移除那份单独注入的脚本。

## 配置

将以下配置加入博客根目录的 `_config.yml`，也可放在主题配置中。站点配置优先；未填写的字段沿用主题配置。

```yaml
electric_clock:
  enable: true
  enable_page: all
  exclude: []
  layout:
    type: auto
  # 不填写密钥时只显示日期、时间和“天气未配置”，不会请求定位或天气接口。
  qweather_key: ""
  gaud_map_key: ""
  # 在自己的站点配置中填写和风天气控制台分配的 API Host。
  qweather_host: ""
  # 兼容原插件的城市实时天气 v7 返回格式。
  qweather_path: /v7/weather/now
  default_rectangle: false
  # 可选，经度,纬度；作为固定位置或 IP 定位失败时的备用位置。
  rectangle: ""
```

插件、示例和 npm 包均不提供公共或私人 API key，也不提供默认地理坐标。只需时钟时无需申请任何天气服务。

使用天气功能时，在自己的站点中填写和风天气 API key；自动定位另需高德 Web 服务 key。也可仅填写 `rectangle` 与和风 key，跳过高德定位，城市显示“默认位置”。`default_rectangle: true` 始终使用配置坐标。

新账户应使用控制台分配的 `qweather_host`，支持纯主机名或完整 HTTPS 地址。该字段留空时，为兼容旧配置仍使用原官方共享域名；旧共享域名正在停用，具体可用性取决于天气服务账户。参见 [API Host](https://dev.qweather.com/docs/configuration/api-host/)、[身份认证](https://dev.qweather.com/docs/configuration/authentication/) 和 [城市实时天气 v7](https://dev.qweather.com/docs/api/weather/weather-now-webapi-v7/)。本插件的返回数据适配器目前使用 v7 格式，不能仅把路径替换成不同格式的 v1 接口。

站点配置的浏览器 API key 会随页面发送给访问者。不要把服务端私钥或 JWT 签名私钥填入此处，也不要把自己的密钥提交到公开仓库。需要保密凭据时应由自己的服务端代理请求。

## 主题与页面切换

`layout.type: auto` 优先挂载到 `#aside-content .sticky_layout`，再回退到 `#aside-content`，适用于 Butterfly、Anzhiyu 与 Solitude。无需修改主题源码。

`aside: false` 或主题未生成侧栏的页面不会添加卡片。主题自己的移动端侧栏显示规则继续生效，例如 Solitude 在窄屏下会隐藏部分卡片。

脚本重复执行和连续导航不会增加卡片、事件监听或计时器。天气结果缓存 10 分钟，切页时复用进行中的请求；每个请求最多等待 8 秒。接口失败或超时时仍显示本地日期与时间。

## 原有配置兼容

以下字段继续支持：

| 配置 | 含义 |
| --- | --- |
| `enable` | 插件开关，默认关闭。 |
| `priority` | HTML 过滤器优先级，默认 10。 |
| `enable_page` | `all` 表示所有页面；单个字符串保持旧版精确路径匹配。新增数组形式按各目录前缀匹配。 |
| `exclude` | 字符串或数组，保持旧版非空子串排除规则；优先于启用规则。 |
| `layout.type` | `auto`、`id`、`class`，或新增的 `selector`。有 name 但未填 type 时沿用旧版 id 查找。 |
| `layout.name` | 元素 ID、类名或 CSS 选择器。 |
| `layout.index` | `class` / `selector` 匹配的索引，从 0 开始。 |
| `clock_js` / `clock_css` | 自定义脚本、样式 URL；留空使用包内本地资源。 |
| `loading` | 供旧版自定义模板使用的加载图地址；默认模板直接显示占位时钟。 |
| `temple_html` | 保留原拼写的自定义卡片 HTML，须包含 `#hexo_electric_clock`。 |
| `qweather_key` / `gaud_map_key` | 用户自行配置的服务 key，默认空。 |
| `default_rectangle` / `rectangle` | 固定坐标开关及备用坐标，默认无坐标。 |
| `qweather_host` / `qweather_path` | 新增，天气主机及返回 v7 格式的路径。 |

部署在子目录（如 `root: /blog/`）时，包内资源自动带上站点前缀；页面规则既可写站点相对路径，也可写包含 root 的完整路径。

旧配置可原样保留：

```yaml
layout:
  type: class
  name: sticky_layout
  index: 0
```

自定义 `clock_js` 会替换包内运行脚本，其自身的 PJAX 兼容性由该脚本负责。包内仍暴露原有天气配置全局变量，以便旧自定义脚本读取。

## 开发与验证

开发测试需要 Node.js 20.19 或更高版本，以运行 Hexo 8；插件运行时仍兼容 Hexo 7 的 Node.js 要求。

```sh
npm ci
npm run build:assets
npm test
npm run test:integration
npm run test:package
npm pack --dry-run
```

集成测试使用独立临时站点启动 Hexo server，不调用部署命令。测试矩阵覆盖 Hexo 7.3.0 / 8.1.2 与 Anzhiyu 1.7.0 / Solitude 4.0.0；检查首页、文章、资源路由、子目录和 watch 更新。临时站点和服务由测试结束清理。

npm 包只包含运行所需的 `index.js`、`lib/`、包信息、README 与许可证；不包含测试站点、测试配置、日志或开发依赖。
