import { createApp } from 'vue'
import App from './App.vue'
import '../node_modules/ol/ol.css'  // 使用相对路径导入 ol.css

const app = createApp(App)
app.mount('#app')
