import * as common from './webpack.common'

import * as webpack from 'webpack'
import merge from 'webpack-merge'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer'

const configWithSourceMaps: webpack.Configuration = {
  mode: 'production',
  devtool: 'source-map',
}

const configWithoutSourceMaps: webpack.Configuration = {
  mode: 'production',
  devtool: false,
}

// Main, CLI, and highlighter don't need source maps in production
const mainConfig = merge({}, common.main, configWithoutSourceMaps)
const cliConfig = merge({}, common.cli, configWithoutSourceMaps)
const highlighterConfig = merge({}, common.highlighter, configWithoutSourceMaps)

const rendererConfig = merge({}, common.renderer, configWithSourceMaps, {
  module: {
    rules: [
      // This will cause the compiled CSS to be output to a
      // styles.css and a <link rel="stylesheet"> tag to be
      // appended to the index.html HEAD at compile time
      {
        test: /\.(scss|css)$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
    ],
  },
  plugins: [
    // Necessary to be able to use MiniCssExtractPlugin as a loader.
    new MiniCssExtractPlugin({ filename: 'renderer.css' }),
    // Only run bundle analyzer when ANALYZE=true
    ...(process.env.ANALYZE === 'true'
      ? [
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            openAnalyzer: false,
            reportFilename: 'renderer.report.html',
          }),
        ]
      : []),
  ],
})

const crashConfig = merge({}, common.crash, configWithSourceMaps, {
  module: {
    rules: [
      // This will cause the compiled CSS to be output to a
      // styles.css and a <link rel="stylesheet"> tag to be
      // appended to the index.html HEAD at compile time
      {
        test: /\.(scss|css)$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
    ],
  },
  plugins: [
    // Necessary to be able to use MiniCssExtractPlugin as a loader.
    new MiniCssExtractPlugin({ filename: 'crash.css' }),
  ],
})

// eslint-disable-next-line no-restricted-syntax
export default [
  mainConfig,
  rendererConfig,
  crashConfig,
  cliConfig,
  highlighterConfig,
]
