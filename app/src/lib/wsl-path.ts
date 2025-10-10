/**
 * Checks if a given path is a WSL path (UNC path to WSL filesystem)
 * WSL paths can be in the format:
 * - \\wsl$\<distro>\...
 * - \\wsl.localhost\<distro>\...
 */
export function isWSLPath(path: string): boolean {
  const normalizedPath = path.toLowerCase().replace(/\//g, '\\')
  return (
    normalizedPath.startsWith('\\\\wsl$\\') ||
    normalizedPath.startsWith('\\\\wsl.localhost\\')
  )
}

/**
 * Converts a Windows WSL UNC path to a Linux path that can be used within WSL
 * For example:
 * - \\wsl.localhost\Ubuntu\home\user\project -> /home/user/project
 * - \\wsl$\Ubuntu\home\user\project -> /home/user/project
 */
export function convertWSLPathToLinux(windowsPath: string): string {
  const normalizedPath = windowsPath.replace(/\//g, '\\')

  // Match \\wsl$\<distro>\<path> or \\wsl.localhost\<distro>\<path>
  const wslMatch = normalizedPath.match(
    /^\\\\wsl(?:\$|\.localhost)\\[^\\]+\\(.*)$/i
  )

  if (!wslMatch || !wslMatch[1]) {
    throw new Error(`Invalid WSL path format: ${windowsPath}`)
  }

  // Extract the Linux path portion and convert backslashes to forward slashes
  const linuxPath = wslMatch[1].replace(/\\/g, '/')

  // Ensure the path starts with /
  return linuxPath.startsWith('/') ? linuxPath : `/${linuxPath}`
}

/**
 * Extracts the WSL distribution name from a WSL UNC path
 * For example:
 * - \\wsl.localhost\Ubuntu\home\user -> Ubuntu
 * - \\wsl$\Debian\home\user -> Debian
 */
export function getWSLDistro(path: string): string | null {
  const normalizedPath = path.replace(/\//g, '\\')

  // Match \\wsl$\<distro>\ or \\wsl.localhost\<distro>\
  const wslMatch = normalizedPath.match(
    /^\\\\wsl(?:\$|\.localhost)\\([^\\]+)\\/i
  )

  if (wslMatch && wslMatch[1]) {
    return wslMatch[1]
  }

  return null
}
