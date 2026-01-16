# Build Performance Improvements

This document provides detailed implementation instructions for four build performance optimizations. These changes are expected to reduce build times by 60-80%.

## Overview

| Optimization | Expected Impact | Risk Level |
|-------------|-----------------|------------|
| 1. Replace ts-loader with esbuild-loader | 50-70% faster TS compilation | Low |
| 2. Enable webpack filesystem caching | 80% faster incremental builds | Very Low |
| 3. Disable BundleAnalyzerPlugin by default | 5-10% faster prod builds | None |
| 4. Remove source maps for non-renderer bundles | 10-20% faster prod builds | Low |

---

## Optimization 1: Replace ts-loader with esbuild-loader

### Why
`ts-loader` transpiles TypeScript files one at a time using the full TypeScript compiler. `esbuild-loader` uses esbuild, which is 10-100x faster because it's written in Go and processes files in parallel.

### Trade-off
esbuild-loader only transpiles TypeScript - it does NOT perform type checking. You should run `tsc --noEmit` separately (in CI or as a pre-commit hook) to catch type errors.

### Installation

```bash
yarn add -D esbuild-loader
```

### File Changes

#### 1.1 Update `app/webpack.common.ts`

**Current code (lines 26-36):**
```typescript
module: {
  rules: [
    {
      test: /\.tsx?$/,
      include: path.resolve(__dirname, 'src'),
      use: [
        {
          loader: 'ts-loader',
        },
      ],
      exclude: /node_modules/,
    },
```

**Replace with:**
```typescript
module: {
  rules: [
    {
      test: /\.tsx?$/,
      include: path.resolve(__dirname, 'src'),
      use: [
        {
          loader: 'esbuild-loader',
          options: {
            target: 'es2022',
            tsx: true,
          },
        },
      ],
      exclude: /node_modules/,
    },
```

#### 1.2 Update `app/webpack.common.ts` - Highlighter config

**Current code (lines 184-198):**
```typescript
highlighter.module!.rules = [
  {
    test: /\.ts$/,
    include: path.resolve(__dirname, 'src/highlighter'),
    use: [
      {
        loader: 'ts-loader',
        options: {
          configFile: path.resolve(__dirname, 'src/highlighter/tsconfig.json'),
        },
      },
    ],
    exclude: /node_modules/,
  },
]
```

**Replace with:**
```typescript
highlighter.module!.rules = [
  {
    test: /\.ts$/,
    include: path.resolve(__dirname, 'src/highlighter'),
    use: [
      {
        loader: 'esbuild-loader',
        options: {
          target: 'es2021',
        },
      },
    ],
    exclude: /node_modules/,
  },
]
```

#### 1.3 Add type-checking script to `package.json`

Add this to the `scripts` section:
```json
"typecheck": "tsc --noEmit",
"typecheck:watch": "tsc --noEmit --watch",
```

Optionally update CI or pre-commit hooks to run `yarn typecheck`.

---

## Optimization 2: Enable Webpack Filesystem Caching

### Why
Webpack 5's persistent caching stores compilation results to disk. Subsequent builds only recompile changed files, making incremental builds nearly instant.

### File Changes

#### 2.1 Update `app/webpack.common.ts`

Add the `cache` configuration to `commonConfig` after line 14 (`emitOnErrors: false`):

**Add this inside `commonConfig`:**
```typescript
const commonConfig: webpack.Configuration = {
  optimization: {
    emitOnErrors: false,
  },
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],
    },
  },
  externals: externals,
  // ... rest of config
```

**Full updated `commonConfig` (lines 12-53):**
```typescript
const commonConfig: webpack.Configuration = {
  optimization: {
    emitOnErrors: false,
  },
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],
    },
  },
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
        test: /\.tsx?$/,
        include: path.resolve(__dirname, 'src'),
        use: [
          {
            loader: 'esbuild-loader',
            options: {
              target: 'es2022',
              tsx: true,
            },
          },
        ],
        exclude: /node_modules/,
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
```

#### 2.2 Update `clean-slate` script in `package.json`

Update the clean-slate script to also clear webpack cache:

**Current:**
```json
"clean-slate": "rimraf out node_modules app/node_modules && yarn",
```

**Replace with:**
```json
"clean-slate": "rimraf out node_modules app/node_modules node_modules/.cache && yarn",
```

---

## Optimization 3: Disable BundleAnalyzerPlugin by Default

### Why
BundleAnalyzerPlugin generates a static HTML report on every production build. This adds overhead when you don't need to analyze bundle sizes.

### File Changes

#### 3.1 Update `app/webpack.production.ts`

**Current code (lines 29-42):**
```typescript
plugins: [
  // Necessary to be able to use MiniCssExtractPlugin as a loader.
  new MiniCssExtractPlugin({ filename: 'renderer.css' }),
  new BundleAnalyzerPlugin({
    // this generates the static HTML file to view afterwards, rather
    // than disrupting the user
    analyzerMode: 'static',
    openAnalyzer: false,
    // we can't emit this directly to the dist directory because the
    // build script immediately blows away dist after webpack is done
    // compiling the source into bundles
    reportFilename: 'renderer.report.html',
  }),
],
```

**Replace with:**
```typescript
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
```

#### 3.2 Add analyze script to `package.json`

Add this to the `scripts` section:
```json
"analyze": "cross-env ANALYZE=true yarn compile:prod",
```

### Usage
- Normal build: `yarn compile:prod` (no analyzer overhead)
- Analyze bundles: `yarn analyze` (generates renderer.report.html)

---

## Optimization 4: Remove Source Maps for Non-Renderer Bundles in Production

### Why
Generating source maps is expensive. The renderer bundle benefits most from source maps (for debugging UI issues). Main process, CLI, crash handler, and highlighter rarely need production source maps.

### File Changes

#### 4.1 Update `app/webpack.production.ts`

**Current code (lines 8-15):**
```typescript
const config: webpack.Configuration = {
  mode: 'production',
  devtool: 'source-map',
}

const mainConfig = merge({}, common.main, config)
const cliConfig = merge({}, common.cli, config)
const highlighterConfig = merge({}, common.highlighter, config)
```

**Replace with:**
```typescript
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
```

#### 4.2 Update renderer and crash configs

**Current code (lines 17 and 45):**
```typescript
const rendererConfig = merge({}, common.renderer, config, {
// ...
const crashConfig = merge({}, common.crash, config, {
```

**Replace with:**
```typescript
const rendererConfig = merge({}, common.renderer, configWithSourceMaps, {
// ...
const crashConfig = merge({}, common.crash, configWithSourceMaps, {
```

---

## Complete Modified Files

### `app/webpack.common.ts` (full file after changes)

```typescript
import * as path from 'path'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import webpack from 'webpack'
import merge from 'webpack-merge'
import { getReplacements } from './app-info'

export const externals = ['7zip']

const outputDir = 'out'
export const replacements = getReplacements()

const commonConfig: webpack.Configuration = {
  optimization: {
    emitOnErrors: false,
  },
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],
    },
  },
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
        test: /\.tsx?$/,
        include: path.resolve(__dirname, 'src'),
        use: [
          {
            loader: 'esbuild-loader',
            options: {
              target: 'es2022',
              tsx: true,
            },
          },
        ],
        exclude: /node_modules/,
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

export const main = merge({}, commonConfig, {
  entry: { main: path.resolve(__dirname, 'src/main-process/main') },
  target: 'electron-main',
  plugins: [
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('main'),
      })
    ),
  ],
})

export const renderer = merge({}, commonConfig, {
  entry: { renderer: path.resolve(__dirname, 'src/ui/index') },
  target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /\.(jpe?g|png|gif|ico)$/,
        use: ['file?name=[path][name].[ext]'],
      },
      {
        test: /\.cmd$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'static', 'index.html'),
      chunks: ['renderer'],
    }),
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('ui'),
      })
    ),
  ],
})

export const crash = merge({}, commonConfig, {
  entry: { crash: path.resolve(__dirname, 'src/crash/index') },
  target: 'electron-renderer',
  plugins: [
    new HtmlWebpackPlugin({
      title: 'GitHub Desktop',
      filename: 'crash.html',
      chunks: ['crash'],
    }),
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('crash'),
      })
    ),
  ],
})

export const cli = merge({}, commonConfig, {
  entry: { cli: path.resolve(__dirname, 'src/cli/main') },
  target: 'node',
  plugins: [
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('cli'),
      })
    ),
  ],
})

export const highlighter = merge({}, commonConfig, {
  entry: { highlighter: path.resolve(__dirname, 'src/highlighter/index') },
  output: {
    library: {
      name: '[name]',
      type: 'var',
    },
    chunkFilename: 'highlighter/[name].js',
  },
  optimization: {
    chunkIds: 'named',
    splitChunks: {
      cacheGroups: {
        modes: {
          enforce: true,
          name: (mod: any) => {
            const builtInMode =
              /node_modules[\\\/]codemirror[\\\/]mode[\\\/](\w+)[\\\/]/i.exec(
                mod.resource
              )
            if (builtInMode) {
              return `mode/${builtInMode[1]}`
            }
            const external =
              /node_modules[\\\/]codemirror-mode-(\w+)[\\\/]/i.exec(
                mod.resource
              )
            if (external) {
              return `ext/${external[1]}`
            }
            return 'common'
          },
        },
      },
    },
  },
  target: 'webworker',
  plugins: [
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('highlighter'),
      })
    ),
  ],
  resolve: {
    alias: {
      codemirror$: 'codemirror/addon/runmode/runmode.node.js',
      '../lib/codemirror$': '../addon/runmode/runmode.node.js',
      '../../lib/codemirror$': '../../addon/runmode/runmode.node.js',
      '../../addon/runmode/runmode$': '../../addon/runmode/runmode.node.js',
    },
  },
})

highlighter.module!.rules = [
  {
    test: /\.ts$/,
    include: path.resolve(__dirname, 'src/highlighter'),
    use: [
      {
        loader: 'esbuild-loader',
        options: {
          target: 'es2021',
        },
      },
    ],
    exclude: /node_modules/,
  },
]
```

### `app/webpack.production.ts` (full file after changes)

```typescript
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
      {
        test: /\.(scss|css)$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({ filename: 'renderer.css' }),
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
      {
        test: /\.(scss|css)$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
    ],
  },
  plugins: [
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
```

### `package.json` script additions

Add these to the `scripts` section:
```json
"typecheck": "tsc --noEmit",
"typecheck:watch": "tsc --noEmit --watch",
"analyze": "cross-env ANALYZE=true yarn compile:prod",
```

Update the `clean-slate` script:
```json
"clean-slate": "rimraf out node_modules app/node_modules node_modules/.cache && yarn",
```

---

## Testing the Changes

### Step 1: Install esbuild-loader
```bash
yarn add -D esbuild-loader
```

### Step 2: Apply all file changes listed above

### Step 3: Clear cache and test dev build
```bash
rimraf node_modules/.cache
yarn compile:dev
```

### Step 4: Test incremental build (run again)
```bash
yarn compile:dev
```
The second build should be significantly faster due to caching.

### Step 5: Test production build
```bash
yarn compile:prod
```

### Step 6: Test bundle analyzer (optional)
```bash
yarn analyze
```
Open `out/renderer.report.html` to view the bundle analysis.

### Step 7: Run type checking
```bash
yarn typecheck
```

### Step 8: Run the application
```bash
yarn start
```
Verify the application works correctly.

---

## Rollback Instructions

If issues arise, revert as follows:

1. **Remove esbuild-loader**: `yarn remove esbuild-loader`
2. **Restore ts-loader config**: Revert `app/webpack.common.ts` to use `ts-loader` instead of `esbuild-loader`
3. **Remove cache config**: Remove the `cache` block from `commonConfig`
4. **Restore BundleAnalyzerPlugin**: Remove the conditional spread and restore direct plugin instantiation
5. **Restore source maps**: Change `configWithoutSourceMaps` usages back to `config` with `devtool: 'source-map'`

---

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| First dev build | ~60-90s | ~15-25s |
| Incremental dev build | ~60-90s | ~2-5s |
| Production build | ~90-120s | ~20-40s |
| Bundle analyzer | Always runs | On-demand only |

Note: Actual times depend on hardware. The relative improvement (60-80% faster) should be consistent.
