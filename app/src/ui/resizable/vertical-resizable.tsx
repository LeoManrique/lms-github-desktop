import * as React from 'react'
import { clamp } from '../../lib/clamp'
import { AriaLiveContainer } from '../accessibility/aria-live-container'

export const DefaultMaxHeight = 500
export const DefaultMinHeight = 150

/** This class is assigned to the containing div of the element and used in
 * determining whether the resizable is focused. */
export const verticalResizableComponentClass = 'vertical-resizable-component'

export enum VerticalResizeDirection {
  Increase = 'Increase',
  Decrease = 'Decrease',
}

export interface IVerticalResizableState {
  /** The message that is announced to screen reader users to inform them of
   * resizable panel state */
  readonly resizeMessage: string
}

/**
 * Component abstracting a vertically resizable panel.
 *
 * Note: this component is pure, consumers must subscribe to the
 * onResize and onReset event and update the height prop accordingly.
 */
export class VerticalResizable extends React.Component<
  IVerticalResizableProps,
  IVerticalResizableState
> {
  private resizeContainer: HTMLDivElement | null = null
  private startHeight: number | null = null
  private startY: number | null = null

  public constructor(props: IVerticalResizableProps) {
    super(props)
    this.state = { resizeMessage: '' }
  }

  /**
   * Returns the current height as determined by props.
   *
   * This value will be constrained by the maximum and minimum
   * height props and might not be identical to that of props.height.
   */
  private getCurrentHeight() {
    return this.clampHeight(this.props.height)
  }

  /**
   * Constrains the provided height to lie within the minimum and
   * maximum heights as determined by props
   */
  private clampHeight(height: number) {
    const { minimumHeight: min, maximumHeight: max } = this.props
    return clamp(height, min ?? DefaultMinHeight, max ?? DefaultMaxHeight)
  }

  /**
   * Handler for when the user presses the mouse button over the resize
   * handle.
   */
  private handleDragStart = (e: React.MouseEvent<any>) => {
    this.startY = e.clientY
    this.startHeight = this.getCurrentHeight()

    document.addEventListener('mousemove', this.handleDragMove)
    document.addEventListener('mouseup', this.handleDragStop)

    e.preventDefault()
  }

  /**
   * Handler for when the user moves the mouse while dragging
   */
  private handleDragMove = (e: MouseEvent) => {
    if (this.startHeight === null || this.startY === null) {
      return
    }

    // Note: dragging UP (negative deltaY) should INCREASE the height
    // because the resize handle is at the top of the commit section
    const deltaY = this.startY - e.clientY
    const newHeight = this.startHeight + deltaY

    this.updateResizeMessage(
      deltaY > 0
        ? VerticalResizeDirection.Increase
        : VerticalResizeDirection.Decrease
    )
    this.props.onResize(this.clampHeight(newHeight))
    e.preventDefault()
  }

  private unsubscribeFromGlobalEvents() {
    document.removeEventListener('mousemove', this.handleDragMove)
    document.removeEventListener('mouseup', this.handleDragStop)
  }

  /**
   * Handler for when the user lets go of the mouse button during
   * a resize operation.
   */
  private handleDragStop = (e: MouseEvent) => {
    this.unsubscribeFromGlobalEvents()
    e.preventDefault()
  }

  /**
   * Handler for when a user uses keyboard shortcuts to increase the size the
   * active resizable
   */
  private handleMenuResizeEventIncrease = (
    ev?: Event | React.SyntheticEvent<unknown>
  ) => {
    this.handleMenuResizeEvent(VerticalResizeDirection.Increase)
    ev?.preventDefault()
  }

  /**
   * Handler for when a user uses keyboard shortcuts to decrease the size the
   * active resizable
   */
  private handleMenuResizeEventDecrease = (
    ev?: Event | React.SyntheticEvent<unknown>
  ) => {
    this.handleMenuResizeEvent(VerticalResizeDirection.Decrease)
    ev?.preventDefault()
  }

  /**
   * Handler for when a user uses keyboard shortcuts to resize the size the
   * active resizable
   */
  private handleMenuResizeEvent(resizeDirection: VerticalResizeDirection) {
    const { height } = this.props
    const changedHeight =
      resizeDirection === VerticalResizeDirection.Decrease
        ? height - 5
        : height + 5

    const newHeight = this.clampHeight(changedHeight)

    this.updateResizeMessage(resizeDirection)
    this.props.onResize(this.clampHeight(newHeight))
  }

  /**
   * Adds and removes listeners for custom events fired when user users keyboard
   * to resize the active resizable
   */
  private onResizableRef = (ref: HTMLDivElement | null) => {
    if (ref === null) {
      this.resizeContainer?.removeEventListener(
        'increase-active-resizable-height',
        this.handleMenuResizeEventIncrease
      )
      this.resizeContainer?.removeEventListener(
        'decrease-active-resizable-height',
        this.handleMenuResizeEventDecrease
      )
    } else {
      ref.addEventListener(
        'increase-active-resizable-height',
        this.handleMenuResizeEventIncrease
      )
      ref.addEventListener(
        'decrease-active-resizable-height',
        this.handleMenuResizeEventDecrease
      )
    }
    this.resizeContainer = ref
  }

  private getResizePercentage() {
    const minHeight = this.props.minimumHeight ?? 0
    const maxHeight = this.props.maximumHeight ?? DefaultMaxHeight
    return Math.round(
      ((this.getCurrentHeight() - minHeight) / (maxHeight - minHeight)) * 100
    )
  }

  private updateResizeMessage(direction: VerticalResizeDirection) {
    const directionMessage =
      direction === VerticalResizeDirection.Increase ? 'increased' : 'decreased'
    this.setState({
      resizeMessage: `${
        this.props.description
      } height ${directionMessage}. Set to ${this.getResizePercentage()}%`,
    })
  }

  public render() {
    const style: React.CSSProperties = {
      height: this.getCurrentHeight(),
      maxHeight:
        this.props.maximumHeight === Infinity
          ? undefined
          : this.props.maximumHeight,
      minHeight: this.props.minimumHeight,
    }

    return (
      <div
        id={this.props.id}
        className={verticalResizableComponentClass}
        style={style}
        ref={this.onResizableRef}
      >
        <button
          // Prevent form submission with this button
          type="button"
          tabIndex={-1}
          onMouseDown={this.handleDragStart}
          onDoubleClick={this.props.onReset}
          className="vertical-resize-handle"
          aria-label="Resize handle"
        />
        {this.props.children}
        <AriaLiveContainer
          message={this.state.resizeMessage}
          trackedUserInput={this.state.resizeMessage}
        />
      </div>
    )
  }
}

export interface IVerticalResizableProps {
  readonly height: number

  /** The maximum height the panel can be resized to.
   *
   * @default 500
   */
  readonly maximumHeight?: number

  /**
   * The minimum height the panel can be resized to.
   *
   * @default 150
   */
  readonly minimumHeight?: number

  /** The optional ID for the root element. */
  readonly id?: string

  /** Used to describe which resizable was updated to screen reader users */
  readonly description: string

  /**
   * Handler called when the height of the component has changed
   * through an explicit resize event (dragging the handle).
   */
  readonly onResize: (newHeight: number) => void

  /**
   * Handler called when the resizable component has been
   * reset (ie restored to its original height by double clicking
   * on the resize handle).
   */
  readonly onReset: () => void
}
