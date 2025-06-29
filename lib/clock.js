// 调试开关变量 - 设置为 false 可关闭所有调试信息
const DEBUG_MODE = false;

// 调试日志函数
function debugLog(...args) {
  if (DEBUG_MODE) {
    console.log(...args);
  }
}

function clockUpdateTime(info, city) {
  debugLog('🔍 [调试] clockUpdateTime函数被调用')
  debugLog('🔍 [调试] 传入的城市参数:', city)
  debugLog('🔍 [调试] 传入的天气数据:', info)
  debugLog('🔍 [调试] 最终显示的城市名称:', city)
  debugLog('🔍 [调试] 温度:', info.now.temp, '°C')
  debugLog('🔍 [调试] 天气状况:', info.now.text)
  
  let currentColor = '#000'
  switch (info.now.icon) {
    case '100':
      currentColor = '#fdcc45'
      break
    case '101':
      currentColor = '#fe6976'
      break
    case '102':
    case '103':
      currentColor = '#fe7f5b'
      break
    case '104':
    case '150':
    case '151':
    case '152':
    case '153':
    case '154':
    case '800':
    case '801':
    case '802':
    case '803':
    case '804':
    case '805':
    case '806':
    case '807':
      currentColor = '#2152d1'
      break
    case '300':
    case '301':
    case '305':
    case '306':
    case '307':
    case '308':
    case '309':
    case '310':
    case '311':
    case '312':
    case '313':
    case '314':
    case '315':
    case '316':
    case '317':
    case '318':
    case '350':
    case '351':
    case '399':
      currentColor = '#49b1f5'
      break
    case '302':
    case '303':
    case '304':
      currentColor = '#fdcc46'
      break
    case '400':
    case '401':
    case '402':
    case '403':
    case '404':
    case '405':
    case '406':
    case '407':
    case '408':
    case '409':
    case '410':
    case '456':
    case '457':
    case '499':
      currentColor = '#a3c2dc'
      break
    case '500':
    case '501':
    case '502':
    case '503':
    case '504':
    case '507':
    case '508':
    case '509':
    case '510':
    case '511':
    case '512':
    case '513':
    case '514':
    case '515':
      currentColor = '#97acba'
      break
    case '900':
    case '999':
      currentColor = 'red'
      break
    case '901':
      currentColor = '#179fff;'
      break
    default:
      break
  }
  var clock_box = document.getElementById('hexo_electric_clock')
  
  clock_box_html = `
  <div class="clock-row">
    <span id="card-clock-clockdate" class="card-clock-clockdate"></span>
    <span class="card-clock-weather"><i class="qi-${info.now.icon}-fill" style="color: ${currentColor}"></i> ${info.now.text} <span>${info.now.temp}</span> ℃</span>
    <span class="card-clock-humidity">💧 ${info.now.humidity}%</span>
  </div>
  <div class="clock-row">
    <span id="card-clock-time" class="card-clock-time"></span>
  </div>
  <div class="clock-row">
    <span class="card-clock-windDir"> <i class="qi-gale"></i> ${info.now.windDir}</span>
    <span class="card-clock-location">${city}</span>
    <span id="card-clock-dackorlight" class="card-clock-dackorlight"></span>
  </div>
  `
  var week = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  var card_clock_loading_dom = document.getElementById('card-clock-loading')
  if (card_clock_loading_dom) {
    card_clock_loading_dom.innerHTML = ''
  }
  clock_box.innerHTML = clock_box_html
  function updateTime() {
    var cd = new Date()
    var card_clock_time =
      zeroPadding(cd.getHours(), 2) +
      ':' +
      zeroPadding(cd.getMinutes(), 2) +
      ':' +
      zeroPadding(cd.getSeconds(), 2)
    var card_clock_date =
      zeroPadding(cd.getFullYear(), 4) +
      '-' +
      zeroPadding(cd.getMonth() + 1, 2) +
      '-' +
      zeroPadding(cd.getDate(), 2) +
      ' ' +
      week[cd.getDay()]
    var card_clock_dackorlight = cd.getHours()
    var card_clock_dackorlight_str
    if (card_clock_dackorlight > 12) {
      card_clock_dackorlight -= 12
      card_clock_dackorlight_str = ' P M'
    } else {
      card_clock_dackorlight_str = ' A M'
    }
    if (document.getElementById('card-clock-time')) {
      var card_clock_time_dom = document.getElementById('card-clock-time')
      var card_clock_date_dom = document.getElementById('card-clock-clockdate')
      var card_clock_dackorlight_dom = document.getElementById('card-clock-dackorlight')
      card_clock_time_dom.innerHTML = card_clock_time
      card_clock_date_dom.innerHTML = card_clock_date
      card_clock_dackorlight_dom.innerHTML = card_clock_dackorlight_str
    }
  }
  function zeroPadding(num, digit) {
    var zero = ''
    for (var i = 0; i < digit; i++) {
      zero += '0'
    }
    return (zero + num).slice(-digit)
  }
  var timerID = setInterval(updateTime, 1000)
  updateTime()
}
function getIpInfo() {
  debugLog('🔍 [调试] 开始获取IP信息')
  debugLog('🔍 [调试] clock_default_rectangle_enable:', clock_default_rectangle_enable)
  debugLog('🔍 [调试] clock_rectangle:', clock_rectangle)
  debugLog('🔍 [调试] qweather_key:', qweather_key ? '已配置' : '未配置')
  debugLog('🔍 [调试] gaud_map_key:', gaud_map_key ? '已配置' : '未配置')
  
  let defaultInfo = {
    city: '',
    qweather_url: ''
  }
  
  // 动态获取默认城市（基于配置的rectangle坐标）
  function getDefaultCity() {
    debugLog('🔍 [调试] 开始获取默认城市，使用坐标:', clock_rectangle)
    return fetch(`https://restapi.amap.com/v3/geocode/regeo?key=${gaud_map_key}&location=${clock_rectangle}`)
      .then(regeo_res => regeo_res.json())
      .then(regeo_data => {
        debugLog('🔍 [调试] 逆地理编码响应:', regeo_data)
        if (regeo_data.status === "1") {
          const addressComponent = regeo_data.regeocode.addressComponent
          const city = Array.isArray(addressComponent.city) ? addressComponent.province : addressComponent.city
          debugLog('🔍 [调试] 获取到的默认城市:', city)
          defaultInfo.city = city
          return city
        }
        debugLog('🔍 [调试] 逆地理编码失败，返回未知城市')
        return '未知城市'
      })
      .catch((error) => {
        debugLog('🔍 [调试] 获取默认城市失败:', error)
        return '未知城市'
      })
  }
  
  if (clock_default_rectangle_enable === 'true' && defaultInfo) {
    debugLog('🔍 [调试] 使用固定坐标模式')
    // 固定位置模式保持不变
    fetch(`https://restapi.amap.com/v3/geocode/regeo?key=${gaud_map_key}&location=${clock_rectangle}`)
    .then(regeo_res => regeo_res.json())
    .then(regeo_data => {
      if (regeo_data.status === "1") {
        const addressComponent = regeo_data.regeocode.addressComponent
        return Array.isArray(addressComponent.city) ? addressComponent.province : addressComponent.city
      }
    })
    .then((rectangleCity) => {
      fetch(`https://devapi.qweather.com/v7/weather/now?location=${
        clock_rectangle
      }&key=${qweather_key}`)
      .then(res => res.json())
      .then(data => {
        if (document.getElementById('hexo_electric_clock')) {
          let city = Array.isArray(rectangleCity) ? defaultInfo.city : rectangleCity
          clockUpdateTime(data, city)
        }
      })
    })
  } else {
    debugLog('🔍 [调试] 开始动态IP定位流程')
    // 第一步：使用第三方API获取用户IP
    fetch('https://v.api.aa1.cn/api/myip/index.php?aa1=json')
    .then(res => res.json())
    .then(ipData => {
      // 获取到IP地址
      const userIP = ipData.myip
      debugLog('🔍 [调试] 获取到用户IP:', userIP)
      
      // 第二步：使用高德地图IP定位API，传入获取到的IP
      debugLog('🔍 [调试] 开始高德地图IP定位，IP:', userIP)
      return fetch(`https://restapi.amap.com/v3/ip?key=${gaud_map_key}&ip=${userIP}`)
    })
    .then(res => res.json())
    .then(data => {
      debugLog('🔍 [调试] 高德地图定位完整结果:', data)
      debugLog('🔍 [调试] 检测到的城市:', data.city)
      debugLog('🔍 [调试] 检测到的省份:', data.province)
      debugLog('🔍 [调试] rectangle字段:', data.rectangle)
      debugLog('🔍 [调试] rectangle是否为数组:', Array.isArray(data.rectangle))
      
      // 处理位置信息
      let qweather_url_location = Array.isArray(data.rectangle) ? clock_rectangle : data.rectangle.split(';')[0]
      
      defaultInfo.qweather_url = `https://devapi.qweather.com/v7/weather/now?location=${
        qweather_url_location
      }&key=${qweather_key}`
      
      if (Array.isArray(data.rectangle)) {
        debugLog('🔍 [调试] IP定位失败，rectangle为数组，使用备用坐标')
        // IP定位失败，使用备用坐标
        getDefaultCity().then(defaultCity => {
          debugLog('🔍 [调试] IP定位失败分支，获取到默认城市:', defaultCity)
          debugLog('🔍 [调试] IP定位失败分支，天气API URL:', defaultInfo.qweather_url)
          fetch(defaultInfo.qweather_url)
            .then(r => r.json())
            .then(resNotfindByIp => {
              debugLog('🔍 [调试] IP定位失败分支，天气数据:', resNotfindByIp)
              if (document.getElementById('hexo_electric_clock')) {
                debugLog('🔍 [调试] IP定位失败分支，最终显示城市:', defaultCity)
                clockUpdateTime(resNotfindByIp, defaultCity)
              }
            })
        })
      } else {
        debugLog('🔍 [调试] IP定位成功，rectangle不是数组')
        // IP定位成功，获取城市信息
        const cityFromIP = data.city || data.province
        debugLog('🔍 [调试] 从IP定位获取的城市信息:', cityFromIP)
        if (cityFromIP) {
          debugLog('🔍 [调试] IP定位成功分支，直接使用IP城市:', cityFromIP)
          debugLog('🔍 [调试] IP定位成功分支，天气API URL:', defaultInfo.qweather_url)
          // 如果IP定位成功获取到城市信息，直接使用
          fetch(defaultInfo.qweather_url)
            .then(res2 => res2.json())
            .then(data2 => {
              debugLog('🔍 [调试] IP定位成功分支，天气数据:', data2)
              if (document.getElementById('hexo_electric_clock')) {
                debugLog('🔍 [调试] IP定位成功分支，最终显示城市:', cityFromIP)
                clockUpdateTime(data2, cityFromIP)
              }
          })
        } else {
          debugLog('🔍 [调试] IP定位成功但无城市信息，使用默认城市')
          // 如果IP定位没有返回城市信息，使用默认城市
          getDefaultCity().then(defaultCity => {
            debugLog('🔍 [调试] IP定位无城市分支，获取到默认城市:', defaultCity)
            debugLog('🔍 [调试] IP定位无城市分支，天气API URL:', defaultInfo.qweather_url)
            fetch(defaultInfo.qweather_url)
              .then(res2 => res2.json())
              .then(data2 => {
                debugLog('🔍 [调试] IP定位无城市分支，天气数据:', data2)
                if (document.getElementById('hexo_electric_clock')) {
                  debugLog('🔍 [调试] IP定位无城市分支，最终显示城市:', defaultCity)
                  clockUpdateTime(data2, defaultCity)
                }
            })
          })
        }
      }
    })
    .catch(error => {
      debugLog('🔍 [调试] 第三方IP API失败，使用备用方案:', error)
      // 如果第三方IP API也失败，回退到原来的方案
      debugLog('🔍 [调试] 开始备用方案：直接使用高德地图IP定位')
      fetch(`https://restapi.amap.com/v3/ip?key=${gaud_map_key}`)
      .then(res => res.json())
      .then(data => {
        debugLog('🔍 [调试] 备用方案高德地图定位结果:', data)
        debugLog('🔍 [调试] 备用方案检测到的城市:', data.city)
        debugLog('🔍 [调试] 备用方案检测到的省份:', data.province)
        debugLog('🔍 [调试] 备用方案rectangle字段:', data.rectangle)
        debugLog('🔍 [调试] 备用方案rectangle是否为数组:', Array.isArray(data.rectangle))
        
        let qweather_url_location = Array.isArray(data.rectangle) ? clock_rectangle : data.rectangle.split(';')[0]
        defaultInfo.qweather_url = `https://devapi.qweather.com/v7/weather/now?location=${
          qweather_url_location
        }&key=${qweather_key}`
        debugLog('🔍 [调试] 备用方案天气API URL:', defaultInfo.qweather_url)
        
        // 继续原来的逻辑...
        if (Array.isArray(data.rectangle)) {
          debugLog('🔍 [调试] 备用方案IP定位失败，使用默认坐标')
          // IP定位失败，使用备用坐标
          getDefaultCity().then(defaultCity => {
            debugLog('🔍 [调试] 备用方案获取到默认城市:', defaultCity)
            fetch(defaultInfo.qweather_url)
              .then(r => r.json())
              .then(resNotfindByIp => {
                debugLog('🔍 [调试] 备用方案天气数据:', resNotfindByIp)
                if (document.getElementById('hexo_electric_clock')) {
                  debugLog('🔍 [调试] 备用方案最终显示城市:', defaultCity)
                  clockUpdateTime(resNotfindByIp, defaultCity)
                }
              })
          })
        } else {
          debugLog('🔍 [调试] 备用方案IP定位成功')
          // IP定位成功，获取城市信息
          const cityFromIP = data.city || data.province
          debugLog('🔍 [调试] 备用方案从IP获取的城市:', cityFromIP)
          if (cityFromIP) {
            debugLog('🔍 [调试] 备用方案直接使用IP城市:', cityFromIP)
            fetch(defaultInfo.qweather_url)
              .then(res2 => res2.json())
              .then(data2 => {
                debugLog('🔍 [调试] 备用方案天气数据:', data2)
                if (document.getElementById('hexo_electric_clock')) {
                  debugLog('🔍 [调试] 备用方案最终显示城市:', cityFromIP)
                  clockUpdateTime(data2, cityFromIP)
                }
            })
          } else {
            getDefaultCity().then(defaultCity => {
              fetch(defaultInfo.qweather_url)
                .then(res2 => res2.json())
                .then(data2 => {
                  if (document.getElementById('hexo_electric_clock')) {
                    clockUpdateTime(data2, defaultCity)
                  }
              })
            })
          }
        }
      })
    })
  }
}
getIpInfo()