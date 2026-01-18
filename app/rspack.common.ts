import * as path from 'path'
import { rspack, RspackOptions } from '@rspack/core'
import { getReplacements } from './app-info'

export const externals = ['7zip', 'node-pty', 'desktop-notifications']

const outputDir = 'out'
export const replacements = getReplacements()

const commonConfig: RspackOptions = {
  optimization: {
    emitOnErrors: false,
  },
  cache: true,
  externals: externals,
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, '..', outputDir),
    library: {
      name: '[name]',
      type: 'commonjs2',
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx$/,
        include: path.resolve(__dirname, 'src'),
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: { syntax: 'typescript', tsx: true },
            target: 'es2022',
            transform: { react: { runtime: 'classic' } },
          },
        },
        exclude: /node_modules/,
        type: 'javascript/auto',
      },
      {
        test: /\.ts$/,
        include: path.resolve(__dirname, 'src'),
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: { syntax: 'typescript', tsx: false },
            target: 'es2022',
          },
        },
        exclude: /node_modules/,
        type: 'javascript/auto',
      },
      {
        test: /\.node$/,
        loader: 'awesome-node-loader',
        options: {
          name: '[name].[ext]',
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
  },
  node: {
    __dirname: false,
    __filename: false,
  },
}

export const main: RspackOptions = {
  ...commonConfig,
  entry: { main: path.resolve(__dirname, 'src/main-process/main') },
  target: 'electron-main',
  plugins: [
    new rspack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('main'),
      })
    ),
  ],
}

export const renderer: RspackOptions = {
  ...commonConfig,
  entry: { renderer: path.resolve(__dirname, 'src/ui/index') },
  target: 'electron-renderer',
  module: {
    rules: [
      ...(commonConfig.module?.rules || []),
      {
        test: /\.(jpe?g|png|gif|ico)$/,
        type: 'asset/resource',
      },
      {
        test: /\.cmd$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new rspack.HtmlRspackPlugin({
      template: path.join(__dirname, 'static', 'index.html'),
      chunks: ['renderer'],
    }),
    new rspack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('ui'),
      })
    ),
  ],
}

export const crash: RspackOptions = {
  ...commonConfig,
  entry: { crash: path.resolve(__dirname, 'src/crash/index') },
  target: 'electron-renderer',
  plugins: [
    new rspack.HtmlRspackPlugin({
      title: 'GitHub Desktop',
      filename: 'crash.html',
      chunks: ['crash'],
    }),
    new rspack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('crash'),
      })
    ),
  ],
}

export const cli: RspackOptions = {
  ...commonConfig,
  entry: { cli: path.resolve(__dirname, 'src/cli/main') },
  target: 'node',
  plugins: [
    new rspack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('cli'),
      })
    ),
  ],
}

export const highlighter: RspackOptions = {
  ...commonConfig,
  entry: { highlighter: path.resolve(__dirname, 'src/highlighter/index') },
  output: {
    ...commonConfig.output,
    library: {
      name: '[name]',
      type: 'var',
    },
    chunkFilename: 'highlighter/[name].js',
  },
  optimization: {
    ...commonConfig.optimization,
    chunkIds: 'named',
    splitChunks: {
      cacheGroups: {
        codemirrorModes: {
          test: /[\\/]node_modules[\\/]codemirror[\\/]mode[\\/]/,
          name: 'codemirror-modes',
          chunks: 'all',
          enforce: true,
        },
        codemirrorExtModes: {
          test: /[\\/]node_modules[\\/]codemirror-mode-/,
          name: 'codemirror-ext-modes',
          chunks: 'all',
          enforce: true,
        },
      },
    },
  },
  target: 'webworker',
  module: {
    rules: [
      {
        test: /\.ts$/,
        include: path.resolve(__dirname, 'src/highlighter'),
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: { syntax: 'typescript', tsx: false },
            target: 'es2021',
          },
        },
        exclude: /node_modules/,
        type: 'javascript/auto',
      },
      {
        test: /\.node$/,
        loader: 'awesome-node-loader',
        options: {
          name: '[name].[ext]',
        },
      },
    ],
  },
  plugins: [
    new rspack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('highlighter'),
      })
    ),
  ],
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
    alias: {
      codemirror$: 'codemirror/addon/runmode/runmode.node.js',
      '../lib/codemirror$': '../addon/runmode/runmode.node.js',
      '../../lib/codemirror$': '../../addon/runmode/runmode.node.js',
      '../../addon/runmode/runmode$': '../../addon/runmode/runmode.node.js',
    },
  },
}
