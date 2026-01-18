/* eslint-disable no-sync */

import * as cp from 'child_process'
import * as path from 'path'
import * as electronInstaller from 'electron-winstaller'
import { getProductName, getCompanyName } from '../app/package-info'
import {
  getDistPath,
  getOSXZipPath,
  getWindowsIdentifierName,
  getWindowsStandaloneName,
  getWindowsInstallerName,
  shouldMakeDelta,
  getUpdatesURL,
  getIconFileName,
  isPublishable,
  getBundleSizes,
  getDistRoot,
  getDistArchitecture,
  getLinuxIdentifierName,
  getLinuxDebPath,
  getLinuxRpmPath,
  getLinuxTarGzPath,
} from './dist-info'
import { isGitHubActions } from './build-platforms'
import { existsSync, rmSync, writeFileSync } from 'fs'
import { getVersion } from '../app/package-info'
import { rename } from 'fs/promises'
import { join } from 'path'
import { assertNonNullable } from '../app/src/lib/fatal-error'

const distPath = getDistPath()
const productName = getProductName()
const outputDir = getDistRoot()

const assertExistsSync = (path: string) => {
  if (!existsSync(path)) {
    throw new Error(`Expected ${path} to exist`)
  }
}

async function main() {
  if (process.platform === 'darwin') {
    packageOSX()
  } else if (process.platform === 'win32') {
    packageWindows()
  } else if (process.platform === 'linux') {
    await packageLinux()
  } else {
    console.error(`I don't know how to package for ${process.platform} :(`)
    process.exit(1)
  }

  console.log('Writing bundle size info…')
  writeFileSync(
    path.join(getDistRoot(), 'bundle-size.json'),
    JSON.stringify(getBundleSizes())
  )
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

function packageOSX() {
  const dest = getOSXZipPath()
  rmSync(dest, { recursive: true, force: true })

  console.log('Packaging for macOS…')
  cp.execSync(
    `ditto -ck --keepParent "${distPath}/${productName}.app" "${dest}"`
  )
  console.log(`Created ${dest}`)
}

function packageWindows() {
  const iconSource = path.join(
    __dirname,
    '..',
    'app',
    'static',
    'logos',
    `${getIconFileName()}.ico`
  )

  if (!existsSync(iconSource)) {
    console.error(`expected setup icon not found at location: ${iconSource}`)
    process.exit(1)
  }

  const splashScreenPath = path.resolve(
    __dirname,
    '../app/static/logos/win32-installer-splash.gif'
  )

  if (!existsSync(splashScreenPath)) {
    console.error(
      `expected setup splash screen gif not found at location: ${splashScreenPath}`
    )
    process.exit(1)
  }

  const iconUrl = 'https://desktop.githubusercontent.com/app-icon.ico'

  const nugetPkgName = getWindowsIdentifierName()
  const options: electronInstaller.Options = {
    name: nugetPkgName,
    appDirectory: distPath,
    outputDirectory: outputDir,
    authors: getCompanyName(),
    iconUrl: iconUrl,
    setupIcon: iconSource,
    loadingGif: splashScreenPath,
    exe: `${nugetPkgName}.exe`,
    title: productName,
    setupExe: getWindowsStandaloneName(),
    setupMsi: getWindowsInstallerName(),
  }

  if (shouldMakeDelta()) {
    const url = new URL(getUpdatesURL())
    // Make sure Squirrel.Windows isn't affected by partially or completely
    // disabled releases.
    url.searchParams.set('bypassStaggeredRelease', '1')
    options.remoteReleases = url.toString()
  }

  if (isGitHubActions() && isPublishable()) {
    assertNonNullable(process.env.RUNNER_TEMP, 'Missing RUNNER_TEMP env var')

    const acsPath = join(process.env.RUNNER_TEMP, 'acs')
    const dlibPath = join(acsPath, 'bin', 'x64', 'Azure.CodeSigning.Dlib.dll')

    assertExistsSync(dlibPath)

    const metadataPath = join(acsPath, 'metadata.json')
    const acsMetadata = {
      Endpoint: 'https://wus.codesigning.azure.net/',
      CodeSigningAccountName: 'GitHubInc',
      CertificateProfileName: 'GitHubInc',
      CorrelationId: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    }
    writeFileSync(metadataPath, JSON.stringify(acsMetadata))

    options.signWithParams = `/v /fd SHA256 /tr "http://timestamp.acs.microsoft.com" /td SHA256 /dlib "${dlibPath}" /dmdf "${metadataPath}"`
  }

  console.log('Packaging for Windows…')
  electronInstaller
    .createWindowsInstaller(options)
    .then(() => console.log(`Installers created in ${outputDir}`))
    .then(async () => {
      // electron-winstaller (more specifically Squirrel.Windows) doesn't let
      // us control the name of the nuget packages but we want them to include
      // the architecture similar to how the setup exe and msi do so we'll just
      // have to rename them here after the fact.
      const arch = getDistArchitecture()
      const prefix = `${getWindowsIdentifierName()}-${getVersion()}`

      for (const kind of shouldMakeDelta() ? ['full', 'delta'] : ['full']) {
        const from = join(outputDir, `${prefix}-${kind}.nupkg`)
        const to = join(outputDir, `${prefix}-${arch}-${kind}.nupkg`)

        console.log(`Renaming ${from} to ${to}`)
        await rename(from, to)
      }
    })
    .catch(e => {
      console.error(`Error packaging: ${e}`)
      process.exit(1)
    })
}

async function packageLinux() {
  const arch = getDistArchitecture()
  const debArch = arch === 'x64' ? 'amd64' : 'arm64'
  const rpmArch = arch === 'x64' ? 'x86_64' : 'aarch64'

  console.log('Packaging for Linux…')

  // Create tar.gz archive (always available, no extra dependencies)
  const tarGzPath = getLinuxTarGzPath()
  console.log(`Creating tar.gz archive at ${tarGzPath}…`)
  cp.execSync(
    `tar -czf "${tarGzPath}" -C "${path.dirname(distPath)}" "${path.basename(distPath)}"`
  )
  console.log(`Created ${tarGzPath}`)

  // Try to create .deb package if electron-installer-debian is available
  await tryCreateDebPackage(debArch)

  // Try to create .rpm package if electron-installer-redhat is available
  await tryCreateRpmPackage(rpmArch)

  console.log(`\nLinux packaging complete. Output directory: ${outputDir}`)
}

async function tryCreateDebPackage(arch: string): Promise<void> {
  try {
    // Check if dpkg is available (required for .deb creation)
    cp.execSync('which dpkg', { stdio: 'ignore' })
  } catch {
    console.log('Skipping .deb package creation (dpkg not found)')
    return
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('electron-installer-debian')

    const options = {
      src: distPath,
      dest: outputDir,
      arch: arch,
      name: getLinuxIdentifierName(),
      productName: productName,
      genericName: 'Git Client',
      description: 'LMS GitHub Desktop is a seamless way to contribute to projects on GitHub.',
      productDescription:
        'LMS GitHub Desktop is a free and open source Git client. It supports collaboration ' +
        'with GitHub and GitHub Enterprise, working with Git repositories locally, ' +
        'and is optimized for team collaboration.',
      section: 'devel',
      priority: 'optional',
      categories: ['Development', 'RevisionControl'],
      mimeType: [
        'x-scheme-handler/x-github-client',
        'x-scheme-handler/github-mac',
        'x-scheme-handler/x-github-desktop-auth',
        'x-scheme-handler/x-github-desktop-dev-auth',
      ],
      icon: {
        '256x256': path.join(__dirname, '..', 'app', 'static', 'logos', '256x256.png'),
        '512x512': path.join(__dirname, '..', 'app', 'static', 'logos', '512x512.png'),
        '1024x1024': path.join(__dirname, '..', 'app', 'static', 'logos', '1024x1024.png'),
      },
      bin: 'desktop',
      depends: ['libsecret-1-0', 'libxss1', 'libnss3'],
      maintainer: 'Leonardo Manrique <leomanrique0502@gmail.com>',
      homepage: 'https://github.com/LeoManrique/lms-github-desktop',
    }

    console.log('Creating .deb package…')
    await installer(options)
    console.log(`Created ${getLinuxDebPath()}`)
  } catch (err) {
    if (err instanceof Error && err.message.includes('Cannot find module')) {
      console.log('Skipping .deb package creation (electron-installer-debian not installed)')
      console.log('  Install with: yarn add --dev electron-installer-debian')
    } else {
      console.error('Error creating .deb package:', err instanceof Error ? err.message : err)
    }
  }
}

async function tryCreateRpmPackage(arch: string): Promise<void> {
  try {
    // Check if rpmbuild is available (required for .rpm creation)
    cp.execSync('which rpmbuild', { stdio: 'ignore' })
  } catch {
    console.log('Skipping .rpm package creation (rpmbuild not found)')
    return
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('electron-installer-redhat')

    const options = {
      src: distPath,
      dest: outputDir,
      arch: arch,
      name: getLinuxIdentifierName(),
      productName: productName,
      genericName: 'Git Client',
      description: 'LMS GitHub Desktop is a seamless way to contribute to projects on GitHub.',
      productDescription:
        'LMS GitHub Desktop is a free and open source Git client. It supports collaboration ' +
        'with GitHub and GitHub Enterprise, working with Git repositories locally, ' +
        'and is optimized for team collaboration.',
      categories: ['Development', 'RevisionControl'],
      mimeType: [
        'x-scheme-handler/x-github-client',
        'x-scheme-handler/github-mac',
        'x-scheme-handler/x-github-desktop-auth',
        'x-scheme-handler/x-github-desktop-dev-auth',
      ],
      icon: {
        '256x256': path.join(__dirname, '..', 'app', 'static', 'logos', '256x256.png'),
        '512x512': path.join(__dirname, '..', 'app', 'static', 'logos', '512x512.png'),
        '1024x1024': path.join(__dirname, '..', 'app', 'static', 'logos', '1024x1024.png'),
      },
      bin: 'desktop',
      requires: ['libsecret', 'libXScrnSaver', 'nss'],
      maintainer: 'Leonardo Manrique <leomanrique0502@gmail.com>',
      homepage: 'https://github.com/LeoManrique/lms-github-desktop',
      license: 'MIT',
    }

    console.log('Creating .rpm package…')
    await installer(options)
    console.log(`Created ${getLinuxRpmPath()}`)
  } catch (err) {
    if (err instanceof Error && err.message.includes('Cannot find module')) {
      console.log('Skipping .rpm package creation (electron-installer-redhat not installed)')
      console.log('  Install with: yarn add --dev electron-installer-redhat')
    } else {
      console.error('Error creating .rpm package:', err instanceof Error ? err.message : err)
    }
  }
}
