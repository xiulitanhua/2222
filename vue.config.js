const { defineConfig } = require('@vue/cli-service')
const webpack = require('webpack')

module.exports = defineConfig({
  transpileDependencies: true,
  configureWebpack: {
    resolve: {
      alias: {
        'ol': 'ol'
      }
    },
    plugins: [
      new webpack.DefinePlugin({
        __VUE_OPTIONS_API__: true,
        __VUE_PROD_DEVTOOLS__: false,
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false)
      })
    ]
  }
})
// 删除 vite.config.js，保留 vue.config.js

// vue.config.js 完整配置
const { defineConfig } = require('@vue/cli-service')
const webpack = require('webpack')

module.exports = defineConfig({
  transpileDependencies: true,
  configureWebpack: {
    resolve: {
      alias: {
        'ol': 'ol'
      }
    },
    plugins: [
      new webpack.DefinePlugin({
        __VUE_OPTIONS_API__: JSON.stringify(true),
        __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false)
      })
    ]
  },
  devServer: {
    proxy: {
      '/amap': {
        target: 'https://webrd01.is.autonavi.com',
        changeOrigin: true,
        pathRewrite: { '^/amap': '' },
        router: () => `https://webrd0${Math.floor(Math.random()*4)+1}.is.autonavi.com`,
        onProxyReq: (proxyReq) => {
          proxyReq.setHeader('Referer', 'https://lbs.amap.com')
        }
      }
    }
  }
})
