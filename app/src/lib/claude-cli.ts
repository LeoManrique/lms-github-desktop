import { spawn as spawnProcess } from 'child_process'

export interface IClaudeCommitMessage {
  title: string
  description: string
}

/**
 * Simple helper to spawn a process and capture output.
 */
async function spawn(
  command: string,
  args: string[],
  options?: { stdin?: string; timeout?: number }
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawnProcess(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'], // Always pipe stdin, stdout, stderr
    })

    let stdout = ''
    let stderr = ''

    if (proc.stdout) {
      proc.stdout.on('data', data => {
        stdout += data.toString()
      })
    }

    if (proc.stderr) {
      proc.stderr.on('data', data => {
        stderr += data.toString()
      })
    }

    // Handle timeout
    let timeoutId: NodeJS.Timeout | undefined
    if (options?.timeout) {
      timeoutId = setTimeout(() => {
        proc.kill()
        reject(new Error('Process timeout'))
      }, options.timeout)
    }

    proc.on('error', err => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      reject(err)
    })

    proc.on('close', code => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      resolve({ exitCode: code ?? -1, stdout, stderr })
    })

    // Write stdin if provided
    if (options?.stdin && proc.stdin) {
      proc.stdin.write(options.stdin)
      proc.stdin.end()
    }
  })
}

/**
 * Builds a simple commit message prompt for Claude.
 */
function buildCommitMessagePrompt(diff: string): string {
  return `You are a Git commit message generator. Analyze the following git diff and generate a commit message.

Return ONLY valid JSON in this exact format:
{
  "title": "A 50 character or less summary in imperative mood",
  "description": "A detailed description of what changed and why"
}

Git diff:
\`\`\`diff
${diff}
\`\`\`

Generate the commit message as JSON:`
}

/**
 * Invokes Claude Code CLI to generate commit message from diff.
 * Phase 1 MVP version - basic functionality only.
 *
 * On Windows, Claude CLI runs through WSL or Git Bash.
 * We'll try WSL first since that's the recommended approach.
 */
export async function invokeClaude(
  diff: string
): Promise<IClaudeCommitMessage> {
  const prompt = buildCommitMessagePrompt(diff)

  console.log('[Claude CLI] Starting commit message generation...')
  console.log('[Claude CLI] Diff size:', diff.length, 'characters')
  console.log('[Claude CLI] Prompt size:', prompt.length, 'characters')

  try {
    // On Windows, Claude CLI needs to run through WSL with an interactive shell
    // The -i flag makes bash load .bashrc, which sets up NVM and adds Claude to PATH
    const isWindows = process.platform === 'win32'

    let command: string
    let args: string[]

    if (isWindows) {
      command = 'wsl'
      args = ['bash', '-i', '-c', 'claude --print --output-format json --model haiku']
    } else {
      command = 'claude'
      args = ['--print', '--output-format', 'json', '--model', 'haiku']
    }

    console.log('[Claude CLI] Command:', command)
    console.log('[Claude CLI] Args:', args.join(' '))
    console.log('[Claude CLI] Platform:', process.platform)
    console.log('[Claude CLI] Executing command...')

    const startTime = Date.now()
    const result = await spawn(command, args, {
      stdin: prompt,
      timeout: 120000, // 2 minutes - Claude can take a while to respond
    })
    const duration = Date.now() - startTime

    console.log('[Claude CLI] Command completed in', duration, 'ms')
    console.log('[Claude CLI] Exit code:', result.exitCode)
    console.log('[Claude CLI] Stdout length:', result.stdout.length)
    console.log('[Claude CLI] Stderr length:', result.stderr.length)

    if (result.stderr) {
      console.log('[Claude CLI] Stderr:', result.stderr)
    }

    if (result.exitCode !== 0) {
      console.error('[Claude CLI] Command failed with exit code:', result.exitCode)
      throw new Error(
        `Claude CLI exited with code ${result.exitCode}: ${result.stderr}`
      )
    }

    // Parse response
    const output = result.stdout.trim()
    console.log('[Claude CLI] Raw output (first 500 chars):', output.substring(0, 500))

    // Claude CLI with --output-format json returns a wrapper object
    // Structure: { "type": "result", "result": "```json\n{actual data}\n```" }
    const wrapper = JSON.parse(output)
    console.log('[Claude CLI] Wrapper type:', wrapper.type)
    console.log('[Claude CLI] Wrapper result (first 300 chars):', wrapper.result?.substring(0, 300))

    // Extract the result field which contains the actual JSON in markdown code blocks
    let resultText = wrapper.result || output

    // Remove markdown code blocks if present (```json ... ```)
    resultText = resultText.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '')
    console.log('[Claude CLI] Cleaned result (first 300 chars):', resultText.substring(0, 300))

    // Parse the actual commit message JSON
    const parsed = JSON.parse(resultText) as IClaudeCommitMessage
    console.log('[Claude CLI] Parsed response - Title:', parsed.title)
    console.log('[Claude CLI] Parsed response - Description length:', parsed.description?.length || 0)

    if (!parsed.title || !parsed.description) {
      console.error('[Claude CLI] Invalid response format - missing title or description')
      throw new Error('Invalid response format from Claude CLI')
    }

    console.log('[Claude CLI] ✓ Commit message generated successfully!')
    return parsed
  } catch (e) {
    console.error('[Claude CLI] ✗ Failed to invoke Claude CLI:', e)
    if (e instanceof Error) {
      console.error('[Claude CLI] Error message:', e.message)
      console.error('[Claude CLI] Error stack:', e.stack)
    }
    throw e
  }
}
