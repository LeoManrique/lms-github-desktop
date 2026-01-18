import * as common from './rspack.common'
import { rspack, RspackOptions } from '@rspack/core'
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer'

const configWithSourceMaps: Partial<RspackOptions> = {
  mode: 'production',
  devtool: 'source-map',
}

const configWithoutSourceMaps: Partial<RspackOptions> = {
  mode: 'production',
  devtool: false,
}

// Main, CLI, and highlighter don't need source maps in production
const mainConfig: RspackOptions = {
  ...common.main,
  ...configWithoutSourceMaps,
}

const cliConfig: RspackOptions = {
  ...common.cli,
  ...configWithoutSourceMaps,
}

const highlighterConfig: RspackOptions = {
  ...common.highlighter,
  ...configWithoutSourceMaps,
}

const rendererConfig: RspackOptions = {
  ...common.renderer,
  ...configWithSourceMaps,
  module: {
    rules: [
      ...(common.renderer.module?.rules || []),
      {
        test: /\.(scss|css)$/,
        use: [
          rspack.CssExtractRspackPlugin.loader,
          'css-loader',
          'sass-loader',
        ],
        type: 'javascript/auto',
      },
    ],
  },
  plugins: [
    ...(common.renderer.plugins || []),
    new rspack.CssExtractRspackPlugin({ filename: 'renderer.css' }),
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
}

const crashConfig: RspackOptions = {
  ...common.crash,
  ...configWithSourceMaps,
  module: {
    rules: [
      ...(common.crash.module?.rules || []),
      {
        test: /\.(scss|css)$/,
        use: [rspack.CssExtractRspackPlugin.loader, 'css-loader', 'sass-loader'],
        type: 'javascript/auto',
      },
    ],
  },
  plugins: [
    ...(common.crash.plugins || []),
    new rspack.CssExtractRspackPlugin({ filename: 'crash.css' }),
  ],
}

// eslint-disable-next-line no-restricted-syntax
export default [
  mainConfig,
  rendererConfig,
  crashConfig,
  cliConfig,
  highlighterConfig,
]
