<template>
  <div class="map-container">
    <div ref="mapElement" class="ol-map"></div>
    
    <!-- 控制面板 -->
    <div class="control-panel">
      <!-- 底图选择 -->
      <div class="base-layer-selector">
        <h3>底图选择</h3>
        <select v-model="selectedBaseLayer" @change="switchBaseLayer">
          <option v-for="(_, name) in baseLayers" :key="name" :value="name">
            {{ name }}
          </option>
        </select>
      </div>

      <!-- 图层控制 -->
      <div class="layer-control">
        <h3>图层控制</h3>
        <div v-for="(layer, index) in overlayLayers" 
             :key="index" 
             class="layer-item"
             :class="{ 'layer-error': layerStates[layer.name].error }">
          <input type="checkbox" 
                 v-model="layerStates[layer.name].visible" 
                 @change="toggleLayerVisibility(layer)">
          <label>{{ layer.name }}</label>
          <span v-if="layerStates[layer.name].loading" class="loading-dot"></span>
          <span v-if="layerStates[layer.name].error" class="error-icon" 
                title="图层加载失败">⚠️</span>
        </div>
      </div>

      <!-- 要素信息 -->
      <div class="feature-info" v-if="selectedFeature">
        <h3>要素属性</h3>
        <div class="property-grid">
          <div v-for="(value, key) in featureProperties" 
               :key="key" 
               class="property-item">
            <div class="property-key">{{ key }}</div>
            <div class="property-value">
              <template v-if="key === '_geometry'">
                <details>
                  <summary>几何数据 ({{ value.type }})</summary>
                  <pre>{{ formatGeometry(value) }}</pre>
                </details>
              </template>
              <template v-else>
                {{ value }}
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 工具按钮 -->
      <div class="map-toolbar">
        <button @click="exportMapImage" :disabled="globalLoading">
          {{ globalLoading ? '导出中...' : '导出图片' }}
        </button>
        <button @click="printCurrentExtent">打印范围</button>
      </div>
    </div>

    <!-- 加载指示器 -->
    <div v-if="globalLoading" class="loading-indicator">
      <div class="loading-spinner"></div>
      <div>地图加载中...</div>
    </div>

    <!-- 全局通知 -->
    <div v-if="notification.show" class="global-notification" 
         :class="notification.type">
      {{ notification.message }}
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import Map from 'ol/Map'
import View from 'ol/View'
import { Tile as TileLayer } from 'ol/layer'
import { XYZ, OSM, TileWMS } from 'ol/source'
import { transform, transformExtent, get as getProjection } from 'ol/proj'
import { defaults as defaultInteractions } from 'ol/interaction'
import { ScaleLine, FullScreen, ZoomSlider } from 'ol/control'
import { debounce } from 'lodash-es'

const mapElement = ref(null)
const selectedBaseLayer = ref('高德地图')
const overlayLayers = ref([])
const selectedFeature = ref(null)
const featureProperties = ref(null)
const globalLoading = ref(true)
const abortController = ref(new AbortController())

// 通知系统
const notification = reactive({
  show: false,
  type: 'info',
  message: '',
  timeout: null
})

// 显示通知
const showNotification = (message, type = 'info', duration = 3000) => {
  clearTimeout(notification.timeout)
  Object.assign(notification, {
    show: true,
    type,
    message,
    timeout: setTimeout(() => notification.show = false, duration)
  })
}

// 坐标转换工具
const coordinateUtils = {
  to3857: (coord) => transform(coord, 'EPSG:4326', 'EPSG:3857'),
  to4326: (coord) => transform(coord, 'EPSG:3857', 'EPSG:4326'),
  extentTo4326: (extent) => transformExtent(extent, 'EPSG:3857', 'EPSG:4326')
}

// 底图配置
const baseLayers = {
  '高德地图': new TileLayer({
    source: new XYZ({
      url: `https://wprd0{1-4}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scl=1&style=7`,
      tileSize: 256,
      crossOrigin: 'anonymous',
      cacheSize: 200
    })
  }),
  '天地图': new TileLayer({
    source: new XYZ({
      url: `https://t0.tianditu.gov.cn/DataServer?T=vec_w&x={x}&y={y}&l={z}&tk=${import.meta.env.VITE_TIANDITU_KEY}`,
      crossOrigin: 'anonymous'
    }),
    visible: false
  }),
  'OSM': new TileLayer({
    source: new OSM(),
    visible: false
  })
}

// 图层状态管理
const layerStates = reactive({})
let olMap = null

onMounted(() => {
  if (mapElement.value) {
    initializeMap()
    initOverlayLayers()
    setupMapInteractions()
  }
})

function initializeMap() {
  try {
    olMap = new Map({
      target: mapElement.value,
      layers: Object.values(baseLayers),
      view: new View({
        center: [11583429, 3587395], // 成都的 EPSG:3857 坐标
        zoom: 10,
        extent: coordinateUtils.to3857([103.5, 30.2, 104.8, 31.0]),
        constrainResolution: true // 禁用模糊缩放
      }),
      interactions: defaultInteractions({
        altShiftDragRotate: false,
        pinchRotate: false
      })
    })

    // 添加控件
    olMap.addControl(new ScaleLine({ units: 'metric' }))
    olMap.addControl(new FullScreen())
    olMap.addControl(new ZoomSlider())

    // 监听全局状态
    olMap.on('loadstart', () => globalLoading.value = true)
    olMap.on('loadend', () => globalLoading.value = false)
    olMap.on('error', (e) => {
      showNotification('地图加载失败，请刷新页面', 'error', 5000)
      console.error('Map error:', e)
    })

  } catch (error) {
    showNotification('地图初始化失败', 'error', 5000)
    console.error('Map initialization failed:', error)
  }
}

function initOverlayLayers() {
  const layersConfig = [
    {
      name: '道路网络',
      type: 'WMS',
      url: 'https://demo.boundlessgeo.com/geoserver/wms',
      params: { LAYERS: 'ne:ne_10m_roads' },
      visible: true
    },
    {
      name: '行政区划',
      type: 'WMS',
      url: 'https://demo.boundlessgeo.com/geoserver/wms',
      params: { LAYERS: 'ne:ne_10m_admin_0_countries' },
      visible: false
    }
  ]

  overlayLayers.value = layersConfig.map(config => {
    const layer = new TileLayer({
      source: new TileWMS({
        url: config.url,
        params: config.params,
        crossOrigin: 'anonymous',
        transition: 300,
        hidpi: true,
        ratio: 2
      }),
      visible: config.visible,
      zIndex: 10
    })

    // 初始化图层状态
    layerStates[config.name] = reactive({
      visible: config.visible,
      loading: false,
      error: false
    })

    // 监听加载状态
    layer.getSource().on('tileloadstart', () => {
      layerStates[config.name].loading = true
      layerStates[config.name].error = false
    })

    layer.getSource().on('tileloadend', () => {
      layerStates[config.name].loading = false
    })

    layer.getSource().on('tileloaderror', () => {
      layerStates[config.name].loading = false
      layerStates[config.name].error = true
      showNotification(`${config.name} 图层加载失败`, 'warning')
    })

    olMap.addLayer(layer)
    return { ...config, layer }
  })
}

function switchBaseLayer() {
  Object.entries(baseLayers).forEach(([name, layer]) => {
    layer.setVisible(name === selectedBaseLayer.value)
  })
}

function toggleLayerVisibility(layerConfig) {
  layerConfig.layer.setVisible(layerStates[layerConfig.name].visible)
}

function setupMapInteractions() {
  // 智能要素查询（防抖+取消机制）
  olMap.on('singleclick', debounce(async (evt) => {
    try {
      abortController.value.abort()
      abortController.value = new AbortController()

      const view = olMap.getView()
      const viewResolution = view.getResolution()
      const visibleLayers = overlayLayers.value
        .filter(l => layerStates[l.name].visible)

      // 优先查询最上层图层
      const topLayer = visibleLayers[visibleLayers.length - 1]
      if (!topLayer) {
        selectedFeature.value = null
        return
      }

      const url = topLayer.layer.getSource().getFeatureInfoUrl(
        evt.coordinate,
        viewResolution,
        view.getProjection(),
        { 'INFO_FORMAT': 'application/json' }
      )

      const response = await fetch(url, {
        signal: abortController.value.signal
      })
      
      if (!response.ok) throw new Error('查询失败')
      const data = await response.json()

      if (data.features?.length > 0) {
        selectFeature(data.features[0])
      } else {
        selectedFeature.value = null
        featureProperties.value = null
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        showNotification('要素查询失败', 'warning')
      }
    }
  }, 300))
}

function selectFeature(feature) {
  selectedFeature.value = feature
  const props = feature.properties
  
  if (feature.geometry) {
    const geom = feature.geometry
    props._geometry = {
      type: geom.type,
      coordinates: coordinateUtils.to4326(geom.coordinates),
      formatted: `类型：${geom.type}\n坐标数：${geom.coordinates.length}`
    }
  }
  
  featureProperties.value = props
}

function formatGeometry(geometry) {
  try {
    return JSON.stringify(geometry.coordinates, null, 2)
  } catch {
    return '几何数据解析失败'
  }
}

// 地图工具方法
const exportMapImage = async () => {
  try {
    globalLoading.value = true
    const pixelRatio = window.devicePixelRatio || 1
    const canvas = await olMap.renderToCanvas({ pixelRatio })
    
    canvas.toBlob(blob => {
      const link = document.createElement('a')
      link.download = `map_export_${Date.now()}.png`
      link.href = URL.createObjectURL(blob)
      link.click()
      URL.revokeObjectURL(link.href)
    }, 'image/png', 0.9)

  } catch (error) {
    showNotification('图片导出失败', 'error')
    console.error('Export failed:', error)
  } finally {
    globalLoading.value = false
  }
}

const printCurrentExtent = () => {
  try {
    const extent = olMap.getView().calculateExtent()
    const wgs84Extent = coordinateUtils.extentTo4326(extent)
    console.log('当前范围:', wgs84Extent)
    showNotification('范围已输出到控制台', 'info')
  } catch (error) {
    showNotification('范围获取失败', 'error')
  }
}

onUnmounted(() => {
  if (olMap) {
    olMap.dispose()
    olMap = null
  }
  abortController.value.abort()
})
</script>

<style scoped>
.map-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row-reverse;
}

.ol-map {
  flex: 1;
  min-height: 400px;
  background: #f0f0f0;
}

.control-panel {
  width: 320px;
  height: 100vh;
  padding: 16px;
  background: white;
  box-shadow: -2px 0 12px rgba(0,0,0,0.1);
  overflow-y: auto;
  position: relative;
  z-index: 100;
}

@media (max-width: 768px) {
  .map-container {
    flex-direction: column;
  }
  
  .control-panel {
    width: 100%;
    height: 40vh;
    box-shadow: 0 -2px 12px rgba(0,0,0,0.1);
  }
}

.layer-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 4px;
  margin: 4px 0;
  transition: background 0.2s;
}

.layer-item:hover {
  background: #f5f5f5;
}

.layer-error {
  background: #fff0f0;
  border-left: 3px solid #ff4444;
}

.loading-dot {
  width: 8px;
  height: 8px;
  margin-left: 8px;
  background: #0078d4;
  border-radius: 50%;
  animation: pulse 1.2s infinite;
}

.error-icon {
  margin-left: 8px;
  color: #ff4444;
  cursor: help;
}

.property-grid {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 8px;
  font-size: 0.9em;
  max-height: 300px;
  overflow-y: auto;
}

.property-key {
  font-weight: 500;
  color: #2c3e50;
}

.property-value pre {
  white-space: pre-wrap;
  font-size: 0.85em;
  background: #f8f8f8;
  padding: 8px;
  border-radius: 4px;
}

.global-notification {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 8px;
  background: #0078d4;
  color: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  animation: slideUp 0.3s ease-out;
}

.global-notification.error {
  background: #ff4444;
}

.global-notification.warning {
  background: #ff9800;
}

@keyframes slideUp {
  from { bottom: -50px; }
  to { bottom: 20px; }
}

@keyframes pulse {
  0% { opacity: 0.5; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1); }
  100% { opacity: 0.5; transform: scale(0.9); }
}
</style>
