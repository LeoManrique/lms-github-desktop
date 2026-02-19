import * as React from 'react'
import { DialogContent } from '../dialog'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'

interface IAIPreferencesProps {
  readonly claudeModel: string
  readonly ollamaModel: string
  readonly ollamaServerUrl: string
  readonly onClaudeModelChanged: (model: string) => void
  readonly onOllamaModelChanged: (model: string) => void
  readonly onOllamaServerUrlChanged: (url: string) => void
}

export class AI extends React.Component<IAIPreferencesProps> {
  public render() {
    return (
      <DialogContent>
        <fieldset>
          <legend>
            <h2>Claude</h2>
          </legend>
          <Row>
            <TextBox
              label="Model"
              value={this.props.claudeModel}
              onValueChanged={this.props.onClaudeModelChanged}
              placeholder="Model name"
            />
          </Row>
        </fieldset>

        <fieldset>
          <legend>
            <h2>Ollama</h2>
          </legend>
          <Row>
            <TextBox
              label="Model"
              value={this.props.ollamaModel}
              onValueChanged={this.props.onOllamaModelChanged}
              placeholder="Model identifier"
            />
          </Row>
          <Row>
            <TextBox
              label="Server URL"
              value={this.props.ollamaServerUrl}
              onValueChanged={this.props.onOllamaServerUrlChanged}
              placeholder="Server address"
            />
          </Row>
        </fieldset>
      </DialogContent>
    )
  }
}
