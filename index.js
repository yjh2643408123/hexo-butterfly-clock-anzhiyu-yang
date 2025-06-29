'use strict'
// 全局声明插件代号
const pluginname = 'butterfly_clock_anzhiyu'
// 全局声明依赖
const pug = require('pug')
const path = require('path')
const fs = require('fs')
const urlFor = require('hexo-util').url_for.bind(hexo)
const util = require('hexo-util')

hexo.extend.filter.register('after_generate', function (locals) {
  // 首先获取整体的配置项名称
  const config = hexo.config.electric_clock ? hexo.config.electric_clock : hexo.theme.config.electric_clock
  // 如果配置开启
  if (!(config && config.enable)) return
  // 集体声明配置项
    const data = {
      enable_page: config.enable_page ? config.enable_page : "all",
      exclude: config.exclude,
      layout_type: config.layout.type,
      layout_name: config.layout.name,
      layout_index: config.layout.index ? config.layout.index : 0,
      loading: config.loading ? urlFor(config.loading) : urlFor('/images/loading.gif'),
      clock_css: config.clock_css ? urlFor(config.clock_css) : urlFor('/css/clock.min.css'),
      clock_js: config.clock_js ? urlFor(config.clock_js) : urlFor('/js/clock.js'),
      // 移除失效的IP API加载
      //ip_api: config.ip_api ? urlFor(config.ip_api) : "https://widget.qweather.net/simple/static/js/he-simple-common.js?v=2.0",
      qweather_key: config.qweather_key ? config.qweather_key : "b16a1fa0e63c46a4b8f28abfb06ae3fe",
      gaud_map_key: config.gaud_map_key ? config.gaud_map_key : "e2b04289e870b005374ee030148d64fd&s=rsv3",
      default_rectangle_enable: config.default_rectangle ? 'true' : 'false',
      rectangle: config.rectangle ? config.rectangle : "112.6534116,27.96920845",
    }
  
  // 复制clock.js文件到public/js目录
  const sourceClockJs = path.join(__dirname, './lib/clock.js')
  const targetDir = path.join(hexo.public_dir, 'js')
  const targetClockJs = path.join(targetDir, 'clock.js')
  
  // 确保目标目录存在
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }
  
  // 复制clock.js文件
  if (fs.existsSync(sourceClockJs)) {
    fs.copyFileSync(sourceClockJs, targetClockJs)
  }
  
  // 复制loading.gif文件
  const sourceLoadingGif = path.join(__dirname, './lib/loading.gif')
  const targetImagesDir = path.join(hexo.public_dir, 'images')
  const targetLoadingGif = path.join(targetImagesDir, 'loading.gif')
  
  if (!fs.existsSync(targetImagesDir)) {
    fs.mkdirSync(targetImagesDir, { recursive: true })
  }
  
  if (fs.existsSync(sourceLoadingGif)) {
    fs.copyFileSync(sourceLoadingGif, targetLoadingGif)
  }
  
  // 复制clock.min.css文件
  const sourceClockCss = path.join(__dirname, './lib/clock.min.css')
  const targetCssDir = path.join(hexo.public_dir, 'css')
  const targetClockCss = path.join(targetCssDir, 'clock.min.css')
  
  if (!fs.existsSync(targetCssDir)) {
    fs.mkdirSync(targetCssDir, { recursive: true })
  }
  
  if (fs.existsSync(sourceClockCss)) {
    fs.copyFileSync(sourceClockCss, targetClockCss)
  }
  
  // 复制字体文件到 public/css/fonts 目录
  const fontsSourceDir = path.join(__dirname, 'lib', 'fonts')
  const fontsDestDir = path.join(hexo.public_dir, 'css', 'fonts')
  if (!fs.existsSync(fontsDestDir)) {
    fs.mkdirSync(fontsDestDir, { recursive: true })
  }
  
  // 复制所有字体文件
  const fontFiles = ['qweather-icons.ttf', 'qweather-icons.woff', 'qweather-icons.woff2']
  fontFiles.forEach(fontFile => {
    const fontSourcePath = path.join(fontsSourceDir, fontFile)
    const fontDestPath = path.join(fontsDestDir, fontFile)
    if (fs.existsSync(fontSourcePath)) {
      fs.copyFileSync(fontSourcePath, fontDestPath)
    }
  })
  
  // 渲染页面
  const temple_html_text = config.temple_html ? config.temple_html : pug.renderFile(path.join(__dirname, './lib/html.pug'),data)
  //cdn资源声明
    //样式资源
  const css_text = `<link rel="stylesheet" href="${data.clock_css}" />`
    //脚本资源
  //const js_text = `<script src="${data.ip_api}"></script><script data-pjax src="${data.clock_js}"></script>`
  const js_text = `<script data-pjax src="${data.clock_js}"></script>` // 移除失效的JS加载
  //注入容器声明
  var get_layout
  //若指定为class类型的容器
  if (data.layout_type === 'class') {
    //则根据class类名及序列获取容器
    get_layout = `document.getElementsByClassName('${data.layout_name}')[${data.layout_index}]`
  }
  // 若指定为id类型的容器
  else if (data.layout_type === 'id') {
    // 直接根据id获取容器
    get_layout = `document.getElementById('${data.layout_name}')`
  }
  // 若未指定容器类型，默认使用id查询
  else {
    get_layout = `document.getElementById('${data.layout_name}')`
  }

  //挂载容器脚本
  var user_info_js = `<script data-pjax>
  function ${pluginname}_injector_config(){
    var parent_div_git = ${get_layout};
    var item_html = '${temple_html_text}';
    console.log('已挂载butterfly_clock_anzhiyu-yang修复版')
    if(parent_div_git) {
      parent_div_git.insertAdjacentHTML("afterbegin",item_html)
    }
  }
  var elist = '${data.exclude}'.split(',');
  var cpage = location.pathname;
  var epage = '${data.enable_page}';
  var qweather_key = '${data.qweather_key}';
  var gaud_map_key = '${data.gaud_map_key}';
  var baidu_ak_key = '${data.baidu_ak_key}';
  var flag = 0;
  var clock_rectangle = '${data.rectangle}';
  var clock_default_rectangle_enable = '${data.default_rectangle_enable}';

  for (var i=0;i<elist.length;i++){
    if (cpage.includes(elist[i])){
      flag++;
    }
  }

  if ((epage ==='all')&&(flag == 0)){
    ${pluginname}_injector_config();
  }
  else if (epage === cpage){
    ${pluginname}_injector_config();
  }
  </script>`
  
  // 注入用户脚本
  // 此处利用挂载容器实现了二级注入
  hexo.extend.injector.register('body_end', user_info_js, "default");
  // 注入样式资源
  hexo.extend.injector.register('body_end', js_text, "default");
  // 注入脚本资源
  hexo.extend.injector.register('head_end', css_text, "default");
},
hexo.extend.helper.register('priority', function(){
  // 过滤器优先级，priority 值越低，过滤器会越早执行，默认priority是10
  const pre_priority = hexo.config.electric_clock.priority ?  hexo.config.electric_clock.priority : hexo.theme.config.electric_clock.priority
  const priority = pre_priority ? pre_priority : 10
  return priority
})
)
