import * as common from './rspack.common'
import { rspack, RspackOptions } from '@rspack/core'

const config: Partial<RspackOptions> = {
  mode: 'development',
  devtool: 'source-map',
}

const mainConfig: RspackOptions = {
  ...common.main,
  ...config,
}

const cliConfig: RspackOptions = {
  ...common.cli,
  ...config,
}

const highlighterConfig: RspackOptions = {
  ...common.highlighter,
  ...config,
}

const getRendererEntryPoint = () => {
  const entry = common.renderer.entry as Record<string, string>
  if (entry == null) {
    throw new Error(
      `Unable to resolve entry point. Check rspack.common.ts and try again`
    )
  }

  return entry.renderer as string
}

const getPortOrDefault = () => {
  const port = process.env.PORT
  if (port != null) {
    const result = parseInt(port)
    if (isNaN(result)) {
      throw new Error(`Unable to parse '${port}' into valid number`)
    }
    return result
  }

  return 3000
}

const port = getPortOrDefault()
const rspackHotModuleReloadUrl = `webpack-hot-middleware/client?path=http://localhost:${port}/__webpack_hmr`
const publicPath = `http://localhost:${port}/build/`

const rendererConfig: RspackOptions = {
  ...common.renderer,
  ...config,
  entry: {
    renderer: [rspackHotModuleReloadUrl, getRendererEntryPoint()],
  },
  output: {
    ...common.renderer.output,
    publicPath,
  },
  module: {
    rules: [
      ...(common.renderer.module?.rules || []),
      {
        test: /\.scss$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { sourceMap: true } },
          { loader: 'sass-loader', options: { sourceMap: true } },
        ],
        type: 'javascript/auto',
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { sourceMap: true } },
        ],
        type: 'javascript/auto',
      },
    ],
  },
  infrastructureLogging: {
    level: 'error',
  },
  plugins: [
    ...(common.renderer.plugins || []),
    new rspack.HotModuleReplacementPlugin(),
  ],
}

const crashConfig: RspackOptions = {
  ...common.crash,
  ...config,
  module: {
    rules: [
      ...(common.crash.module?.rules || []),
      {
        test: /\.scss$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { sourceMap: true } },
          { loader: 'sass-loader', options: { sourceMap: true } },
        ],
        type: 'javascript/auto',
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { sourceMap: true } },
        ],
        type: 'javascript/auto',
      },
    ],
  },
}

// eslint-disable-next-line no-restricted-syntax
export default [
  mainConfig,
  rendererConfig,
  crashConfig,
  cliConfig,
  highlighterConfig,
]
