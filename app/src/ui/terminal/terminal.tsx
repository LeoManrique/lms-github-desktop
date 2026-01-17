import * as React from 'react'
import { Terminal as XTerm, ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import * as ipcRenderer from '../../lib/ipc-renderer'
import { ICustomIntegration } from '../../lib/custom-integration'
import { Shell } from '../../lib/shells'

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
  /** Called when the session status changes (has session or not) */
  readonly onSessionChange?: (hasSession: boolean) => void
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

/** Debounce delay after terminal output to trigger refresh (ms) */
const COMMAND_COMPLETE_DEBOUNCE_MS = 500

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
  /** Timer for debounced command completion detection */
  private commandCompleteTimer: number | null = null
  /** Track if we've received meaningful output (not just initial prompt) */
  private hasReceivedOutput = false

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
      // Cancel any pending refresh for the old repo
      if (this.commandCompleteTimer !== null) {
        window.clearTimeout(this.commandCompleteTimer)
        this.commandCompleteTimer = null
      }
      this.hasReceivedOutput = false

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
   * Uses custom shell if configured, otherwise lets the main process use the default shell.
   *
   * Note: findShellOrDefault returns terminal APP paths (like Terminal.app), not shell
   * executables. For the embedded PTY, we need actual shell executables like /bin/zsh.
   */
  private async resolveShell(): Promise<{
    shellPath: string
    shellArgs: ReadonlyArray<string>
  }> {
    const { useCustomShell, customShell } = this.props

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

    // Let the main process determine the default shell executable
    // (uses SHELL env var or falls back to /bin/zsh, /bin/bash, /bin/sh)
    return {
      shellPath: '',
      shellArgs: [],
    }
  }

  /**
   * Attach to a terminal for the current repository.
   * If one exists, restore its scrollback. Otherwise create new.
   */
  private async attachToTerminal() {
    console.log('[Terminal] attachToTerminal called, ref:', !!this.terminalRef.current)
    if (!this.terminalRef.current) {
      console.log('[Terminal] No terminal ref, returning')
      return
    }

    // Create xterm instance if needed
    if (!this.xterm) {
      console.log('[Terminal] Creating new xterm instance')
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

      // Listen for terminal resize events - only send if terminal is attached
      this.xterm.onResize(({ cols, rows }) => {
        if (this.state.terminalId) {
          ipcRenderer.send('terminal-resize', this.props.cwd, cols, rows)
        }
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
    console.log('[Terminal] Fitted terminal to container')

    // Resolve the shell path based on user preferences
    console.log('[Terminal] Resolving shell, props:', {
      selectedShell: this.props.selectedShell,
      useCustomShell: this.props.useCustomShell,
      customShell: this.props.customShell,
    })
    let shellPath: string
    let shellArgs: ReadonlyArray<string>
    try {
      const resolved = await this.resolveShell()
      shellPath = resolved.shellPath
      shellArgs = resolved.shellArgs
      console.log('[Terminal] Resolved shell:', shellPath, shellArgs)
    } catch (err) {
      console.error('[Terminal] Shell resolution failed:', err)
      return
    }

    // Get or spawn terminal for this repository
    try {
      console.log('[Terminal] Invoking terminal-get-or-spawn for cwd:', this.props.cwd)
      const { terminalId, isNew, error } = await ipcRenderer.invoke(
        'terminal-get-or-spawn',
        this.props.cwd,
        shellPath,
        shellArgs
      )

      if (error) {
        console.error('[Terminal] spawn error:', error)
        return
      }
      console.log('[Terminal] Got terminalId:', terminalId, 'isNew:', isNew)

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

      // Mark that we've received output
      this.hasReceivedOutput = true

      // Reset the debounce timer - when output stops for a bit,
      // a command likely finished and we should refresh
      this.scheduleCommandCompleteRefresh()
    }
  }

  /**
   * Schedule a debounced refresh after terminal activity.
   * When there's output followed by inactivity, a command likely finished.
   */
  private scheduleCommandCompleteRefresh() {
    // Clear any existing timer
    if (this.commandCompleteTimer !== null) {
      window.clearTimeout(this.commandCompleteTimer)
    }

    // Schedule refresh after period of inactivity
    this.commandCompleteTimer = window.setTimeout(() => {
      this.commandCompleteTimer = null
      if (this.hasReceivedOutput) {
        this.props.onCommandComplete()
      }
    }, COMMAND_COMPLETE_DEBOUNCE_MS)
  }

  private handleTerminalExit = (
    _: unknown,
    terminalId: string,
    _exitCode: number
  ) => {
    if (terminalId === this.state.terminalId) {
      // Cancel any pending debounced refresh
      if (this.commandCompleteTimer !== null) {
        window.clearTimeout(this.commandCompleteTimer)
        this.commandCompleteTimer = null
      }

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

    // Cancel any pending command complete timer
    if (this.commandCompleteTimer !== null) {
      window.clearTimeout(this.commandCompleteTimer)
      this.commandCompleteTimer = null
    }

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

  /**
   * Check if there is an active terminal session.
   */
  public hasSession(): boolean {
    return this.state.terminalId !== null
  }

  /**
   * Kill the current terminal session.
   */
  public async killSession(): Promise<void> {
    if (this.state.terminalId) {
      await ipcRenderer.invoke('terminal-kill', this.props.cwd)
      this.setState({ terminalId: null })
      this.xterm?.clear()
      this.props.onSessionChange?.(false)
    }
  }

  /**
   * Start a new terminal session.
   * If a session already exists, it will be killed first.
   */
  public async newSession(): Promise<void> {
    // Kill existing session if any
    if (this.state.terminalId) {
      await ipcRenderer.invoke('terminal-kill', this.props.cwd)
      this.xterm?.clear()
    }

    // Resolve shell preferences
    const { shellPath, shellArgs } = await this.resolveShell()

    // Spawn fresh terminal
    const { terminalId, error } = await ipcRenderer.invoke(
      'terminal-get-or-spawn',
      this.props.cwd,
      shellPath,
      shellArgs
    )

    if (error) {
      console.error('[Terminal] newSession error:', error)
      this.setState({ terminalId: null })
      this.props.onSessionChange?.(false)
      return
    }

    this.setState({ terminalId })
    this.sendResize()
    this.props.onSessionChange?.(true)
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
