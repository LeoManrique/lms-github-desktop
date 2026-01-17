import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface ITerminalHeaderProps {
  /** Whether the terminal is minimized/collapsed */
  readonly isMinimized: boolean
  /** Whether there is an active terminal session */
  readonly hasSession: boolean
  /** Called when the user clicks the new session button (+) */
  readonly onNewSession: () => void
  /** Called when the user clicks the minimize/maximize button */
  readonly onToggleMinimize: () => void
  /** Called when the user clicks the kill session button (x) */
  readonly onKillSession: () => void
}

/**
 * Header component for the terminal section with control buttons.
 *
 * Buttons:
 * - Plus (+): Start new session (kills existing if any)
 * - Minimize/Maximize (-/↑): Toggle collapsed state
 * - Close (x): Kill session and collapse
 */
export class TerminalHeader extends React.Component<ITerminalHeaderProps> {
  private onNewSessionClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    this.props.onNewSession()
  }

  private onToggleMinimizeClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    this.props.onToggleMinimize()
  }

  private onKillSessionClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    this.props.onKillSession()
  }

  public render() {
    const { isMinimized } = this.props

    return (
      <div className="terminal-header">
        <div className="terminal-controls">
          <button
            className="terminal-control-button new-session-button"
            onClick={this.onNewSessionClick}
            title="New terminal session"
            aria-label="New terminal session"
          >
            <Octicon symbol={octicons.plus} />
          </button>
          <button
            className="terminal-control-button minimize-button"
            onClick={this.onToggleMinimizeClick}
            title={isMinimized ? 'Expand terminal' : 'Minimize terminal'}
            aria-label={isMinimized ? 'Expand terminal' : 'Minimize terminal'}
          >
            <Octicon symbol={isMinimized ? octicons.chevronUp : octicons.dash} />
          </button>
          <button
            className="terminal-control-button close-button"
            onClick={this.onKillSessionClick}
            title="Close terminal"
            aria-label="Close terminal"
          >
            <Octicon symbol={octicons.x} />
          </button>
        </div>
      </div>
    )
  }
}
