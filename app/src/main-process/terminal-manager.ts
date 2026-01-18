import * as os from 'node:os'
import * as fs from 'node:fs'
import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'

interface IManagedTerminal {
  id: string
  pty: pty.IPty
  cwd: string
  scrollbackBuffer: string[]
  isAttached: boolean
}

const MAX_SCROLLBACK_LINES = 1000

class TerminalManager {
  private terminals = new Map<string, IManagedTerminal>()
  private window: BrowserWindow | null = null

  public setWindow(window: BrowserWindow) {
    this.window = window
  }

  /**
   * Get or create a terminal for a repository path.
   * If a terminal already exists for this repo, returns its ID.
   * Otherwise spawns a new one.
   *
   * @param cwd The working directory for the terminal
   * @param shellPath The path to the shell executable
   * @param shellArgs Optional arguments to pass to the shell
   */
  public getOrSpawn(
    cwd: string,
    shellPath: string,
    shellArgs?: ReadonlyArray<string>
  ): { terminalId: string; isNew: boolean; error?: string } {
    const existing = this.terminals.get(cwd)
    if (existing) {
      existing.isAttached = true
      return { terminalId: existing.id, isNew: false }
    }

    const id = uuid()
    const shell = shellPath || this.getDefaultShell()

    // Verify cwd exists, fall back to home directory
    let workingDir = cwd
    try {
      if (!fs.existsSync(cwd)) {
        console.warn(`Terminal cwd does not exist: ${cwd}, using home directory`)
        workingDir = os.homedir()
      }
    } catch {
      workingDir = os.homedir()
    }

    // Build environment - ensure PATH is set for packaged apps
    const env = this.getTerminalEnv()

    try {
      const args = shellArgs ? [...shellArgs] : []
      const ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: workingDir,
        env,
      })

      const terminal: IManagedTerminal = {
        id,
        pty: ptyProcess,
        cwd,
        scrollbackBuffer: [],
        isAttached: true,
      }

      ptyProcess.onData((data: string) => {
        this.appendToScrollback(cwd, data)

        if (terminal.isAttached) {
          this.window?.webContents.send('terminal-data', id, data)
        }
      })

      ptyProcess.onExit(({ exitCode }) => {
        this.window?.webContents.send('terminal-exit', id, exitCode)
        this.terminals.delete(cwd)
      })

      this.terminals.set(cwd, terminal)
      return { terminalId: id, isNew: true }
    } catch (error) {
      console.error('Failed to spawn terminal:', error)
      return {
        terminalId: '',
        isNew: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Detach from a terminal (when switching repos).
   * Terminal continues running in background.
   */
  public detach(cwd: string): void {
    const terminal = this.terminals.get(cwd)
    if (terminal) {
      terminal.isAttached = false
    }
  }

  /**
   * Get scrollback buffer for restoring terminal state.
   */
  public getScrollback(cwd: string): string[] {
    return this.terminals.get(cwd)?.scrollbackBuffer ?? []
  }

  /**
   * Check if a terminal exists for a given repo path.
   */
  public hasTerminal(cwd: string): boolean {
    return this.terminals.has(cwd)
  }

  private appendToScrollback(cwd: string, data: string): void {
    const terminal = this.terminals.get(cwd)
    if (!terminal) {
      return
    }

    // Add data to buffer (store raw data, not split by lines, to preserve ANSI codes)
    terminal.scrollbackBuffer.push(data)

    // Trim to max size (keep most recent entries)
    if (terminal.scrollbackBuffer.length > MAX_SCROLLBACK_LINES) {
      terminal.scrollbackBuffer = terminal.scrollbackBuffer.slice(
        terminal.scrollbackBuffer.length - MAX_SCROLLBACK_LINES
      )
    }
  }

  public write(cwd: string, data: string): void {
    this.terminals.get(cwd)?.pty.write(data)
  }

  public resize(cwd: string, cols: number, rows: number): void {
    this.terminals.get(cwd)?.pty.resize(cols, rows)
  }

  public kill(cwd: string): void {
    const terminal = this.terminals.get(cwd)
    if (terminal) {
      terminal.pty.kill()
      this.terminals.delete(cwd)
    }
  }

  public killAll(): void {
    for (const [cwd] of this.terminals) {
      this.kill(cwd)
    }
  }

  /**
   * Get environment variables for the terminal.
   * Ensures PATH and other essentials are set for packaged apps.
   */
  private getTerminalEnv(): { [key: string]: string } {
    const env = { ...process.env } as { [key: string]: string }

    // Ensure PATH includes common locations for packaged macOS apps
    if (os.platform() === 'darwin') {
      const defaultPaths = [
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
      ]
      const currentPath = env.PATH || ''
      const pathParts = currentPath.split(':')

      for (const p of defaultPaths) {
        if (!pathParts.includes(p)) {
          pathParts.push(p)
        }
      }
      env.PATH = pathParts.join(':')
    }

    // Set TERM if not set
    if (!env.TERM) {
      env.TERM = 'xterm-256color'
    }

    return env
  }

  /**
   * Get the default shell for the current platform.
   * Uses explicit paths for reliability in packaged apps.
   */
  private getDefaultShell(): string {
    if (os.platform() === 'win32') {
      return process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe'
    }

    // Try SHELL env var first
    const envShell = process.env.SHELL
    if (envShell && fs.existsSync(envShell)) {
      return envShell
    }

    // Fallback to common shell paths
    const shells = ['/bin/zsh', '/bin/bash', '/bin/sh']
    for (const shell of shells) {
      if (fs.existsSync(shell)) {
        return shell
      }
    }

    return '/bin/sh'
  }
}

export const terminalManager = new TerminalManager()
