import * as React from 'react'
import { Terminal as XTerm, ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import * as ipcRenderer from '../../lib/ipc-renderer'
import { Shell, findShellOrDefault } from '../../lib/shells'
import { ICustomIntegration } from '../../lib/custom-integration'

// Import xterm CSS
import '@xterm/xterm/css/xterm.css'

interface ITerminalProps {
  /** The working directory for the terminal (repository path) */
  readonly cwd: string
  /** Called when a command finishes execution */
  readonly onCommandComplete: () => void
  /** The user's selected shell preference */
  readonly selectedShell: Shell
  /** Whether to use a custom shell instead of the selected one */
  readonly useCustomShell: boolean
  /** The custom shell configuration, if useCustomShell is true */
  readonly customShell: ICustomIntegration | null
}

interface ITerminalState {
  readonly terminalId: string | null
}

/**
 * Gets a CSS variable value from the document
 */
function getCSSVariable(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
}

/**
 * Creates an xterm.js theme from CSS variables
 */
function getTerminalThemeFromCSS(): ITheme {
  // Use app's background-color (same as text inputs) for consistency
  const bgColor = getCSSVariable('--background-color') || '#0d1117'
  return {
    background: bgColor,
    foreground: getCSSVariable('--text-color') || '#c9d1d9',
    cursor: getCSSVariable('--focus-color') || '#2f81f7',
    cursorAccent: bgColor,
    selectionBackground:
      getCSSVariable('--terminal-selection-background-color') ||
      'rgba(56, 139, 253, 0.4)',
    black: getCSSVariable('--terminal-black-color') || '#484f58',
    red: getCSSVariable('--terminal-red-color') || '#ff7b72',
    green: getCSSVariable('--terminal-green-color') || '#3fb950',
    yellow: getCSSVariable('--terminal-yellow-color') || '#d29922',
    blue: getCSSVariable('--terminal-blue-color') || '#58a6ff',
    magenta: getCSSVariable('--terminal-magenta-color') || '#bc8cff',
    cyan: getCSSVariable('--terminal-cyan-color') || '#39c5cf',
    white: getCSSVariable('--terminal-white-color') || '#b1bac4',
    brightBlack: getCSSVariable('--terminal-bright-black-color') || '#6e7681',
    brightRed: getCSSVariable('--terminal-bright-red-color') || '#ffa198',
    brightGreen: getCSSVariable('--terminal-bright-green-color') || '#56d364',
    brightYellow: getCSSVariable('--terminal-bright-yellow-color') || '#e3b341',
    brightBlue: getCSSVariable('--terminal-bright-blue-color') || '#79c0ff',
    brightMagenta:
      getCSSVariable('--terminal-bright-magenta-color') || '#d2a8ff',
    brightCyan: getCSSVariable('--terminal-bright-cyan-color') || '#56d4dd',
    brightWhite: getCSSVariable('--terminal-bright-white-color') || '#f0f6fc',
  }
}

/**
 * Terminal component using xterm.js
 */
export class Terminal extends React.Component<ITerminalProps, ITerminalState> {
  private terminalRef = React.createRef<HTMLDivElement>()
  private xterm: XTerm | null = null
  private fitAddon: FitAddon | null = null
  private resizeObserver: ResizeObserver | null = null
  private themeObserver: MutationObserver | null = null
  private previousCwd: string | null = null

  public constructor(props: ITerminalProps) {
    super(props)
    this.state = { terminalId: null }
  }

  public async componentDidMount() {
    await this.attachToTerminal()
    this.setupThemeObserver()
  }

  public componentWillUnmount() {
    this.cleanup()
  }

  public async componentDidUpdate(prevProps: ITerminalProps) {
    // Repository changed - detach from old, attach to new
    if (prevProps.cwd !== this.props.cwd) {
      // Detach from previous terminal (keeps it running in background)
      this.detachFromTerminal()

      // Clear xterm display for new terminal
      this.xterm?.clear()

      // Attach to new/existing terminal for new repo
      await this.attachToTerminal()
    }
  }

  /**
   * Sets up a MutationObserver to watch for theme changes on the body element
   */
  private setupThemeObserver() {
    this.themeObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class'
        ) {
          // Theme class changed, update terminal colors
          this.updateTerminalTheme()
        }
      }
    })

    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    })
  }

  /**
   * Updates the terminal theme based on current CSS variables
   */
  private updateTerminalTheme() {
    if (this.xterm) {
      this.xterm.options.theme = getTerminalThemeFromCSS()
    }
  }

  /**
   * Resolves the shell path and arguments based on user preferences.
   * Uses custom shell if configured, otherwise resolves the selected shell.
   */
  private async resolveShell(): Promise<{
    shellPath: string
    shellArgs: ReadonlyArray<string>
  }> {
    const { useCustomShell, customShell, selectedShell } = this.props

    if (useCustomShell && customShell) {
      // Parse custom shell arguments
      const args = customShell.arguments
        ? customShell.arguments.split(' ').filter(arg => arg.length > 0)
        : []
      return {
        shellPath: customShell.path,
        shellArgs: args,
      }
    }

    // Resolve the selected shell using the shell finder
    const foundShell = await findShellOrDefault(selectedShell)
    return {
      shellPath: foundShell.path,
      shellArgs: foundShell.extraArgs || [],
    }
  }

  /**
   * Attach to a terminal for the current repository.
   * If one exists, restore its scrollback. Otherwise create new.
   */
  private async attachToTerminal() {
    if (!this.terminalRef.current) {
      return
    }

    // Create xterm instance if needed
    if (!this.xterm) {
      this.xterm = new XTerm({
        rows: 24,
        cols: 80,
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 13,
        fontFamily:
          'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
        theme: getTerminalThemeFromCSS(),
        scrollback: 1000,
        allowProposedApi: true,
      })

      // Load FitAddon for auto-sizing
      this.fitAddon = new FitAddon()
      this.xterm.loadAddon(this.fitAddon)

      // Attach to DOM
      this.xterm.open(this.terminalRef.current)

      // Handle user input - send to PTY via IPC
      this.xterm.onData(data => {
        ipcRenderer.send('terminal-input', this.props.cwd, data)
      })

      // Listen for terminal resize events
      this.xterm.onResize(({ cols, rows }) => {
        ipcRenderer.send('terminal-resize', this.props.cwd, cols, rows)
      })

      // Set up IPC listeners for PTY output
      ipcRenderer.on('terminal-data', this.handleTerminalData)
      ipcRenderer.on('terminal-exit', this.handleTerminalExit)

      // Auto-fit on container resize using ResizeObserver
      this.resizeObserver = new ResizeObserver(() => {
        this.fitAddon?.fit()
      })
      this.resizeObserver.observe(this.terminalRef.current)
    }

    // Fit terminal to container
    this.fitAddon?.fit()

    // Resolve the shell path based on user preferences
    const { shellPath, shellArgs } = await this.resolveShell()

    // Get or spawn terminal for this repository
    try {
      const { terminalId, isNew, error } = await ipcRenderer.invoke(
        'terminal-get-or-spawn',
        this.props.cwd,
        shellPath,
        shellArgs
      )

      if (error) {
        console.error('Terminal spawn error:', error)
        return
      }

      this.setState({ terminalId })
      this.previousCwd = this.props.cwd

      // If existing terminal, restore scrollback buffer
      if (!isNew) {
        const scrollback = await ipcRenderer.invoke(
          'terminal-get-scrollback',
          this.props.cwd
        )
        // Write scrollback to restore visual state
        if (scrollback.length > 0) {
          for (const data of scrollback) {
            this.xterm.write(data)
          }
        }
      }

      // Send initial resize to PTY
      this.sendResize()
    } catch (err) {
      console.error('Terminal attach error:', err)
    }
  }

  /**
   * Detach from current terminal without killing it.
   * Terminal continues running in main process.
   */
  private detachFromTerminal() {
    if (this.previousCwd) {
      // Tell main process to detach (terminal keeps running)
      ipcRenderer.send('terminal-detach', this.previousCwd)
    }
  }

  private handleTerminalData = (
    _: unknown,
    terminalId: string,
    data: string
  ) => {
    if (terminalId === this.state.terminalId && this.xterm) {
      this.xterm.write(data)
    }
  }

  private handleTerminalExit = (
    _: unknown,
    terminalId: string,
    _exitCode: number
  ) => {
    if (terminalId === this.state.terminalId) {
      // Shell exited, trigger refresh
      this.props.onCommandComplete()

      // Restart shell for this repo
      this.restartTerminal()
    }
  }

  private async restartTerminal() {
    // Kill existing terminal for this repo (it already exited, but clean up)
    await ipcRenderer.invoke('terminal-kill', this.props.cwd)

    // Clear display
    this.xterm?.clear()

    // Resolve shell preferences
    const { shellPath, shellArgs } = await this.resolveShell()

    // Spawn fresh terminal
    const { terminalId } = await ipcRenderer.invoke(
      'terminal-get-or-spawn',
      this.props.cwd,
      shellPath,
      shellArgs
    )
    this.setState({ terminalId })
    this.sendResize()
  }

  /**
   * Send current terminal dimensions to PTY.
   * Called after attaching to ensure PTY has correct size.
   */
  private sendResize() {
    if (this.xterm) {
      const { cols, rows } = this.xterm
      ipcRenderer.send('terminal-resize', this.props.cwd, cols, rows)
    }
  }

  /**
   * Full cleanup - only called on component unmount.
   * Note: This does NOT kill the terminal, just detaches (preserves for session).
   */
  private cleanup() {
    // Remove IPC listeners
    ipcRenderer.removeListener('terminal-data', this.handleTerminalData)
    ipcRenderer.removeListener('terminal-exit', this.handleTerminalExit)

    // Detach, don't kill (preserve terminal for session)
    this.detachFromTerminal()

    // Dispose xterm instance
    this.xterm?.dispose()
    this.xterm = null

    // Disconnect resize observer
    this.resizeObserver?.disconnect()
    this.resizeObserver = null

    // Disconnect theme observer
    this.themeObserver?.disconnect()
    this.themeObserver = null
  }

  public render() {
    return (
      <div
        className="terminal-container"
        ref={this.terminalRef}
        style={{ width: '100%', height: '100%' }}
      />
    )
  }
}
