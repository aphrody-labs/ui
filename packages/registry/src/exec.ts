import { execFile } from "node:child_process"

export interface ExecOptions {
  cwd?: string
  env?: Record<string, string | undefined>
  // false: do not merge process.env into env (execa default is true).
  extendEnv?: boolean
  timeout?: number
  maxBuffer?: number
  input?: string
  // false: resolve with the failure instead of throwing.
  reject?: boolean
  // false: keep the trailing newline (execa strips it by default).
  stripFinalNewline?: boolean
}

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number | undefined
  timedOut: boolean
}

export class ExecError extends Error {
  stdout = ""
  stderr = ""
  exitCode: number | undefined
  timedOut = false
  code?: string
}

function buildEnv(options: ExecOptions) {
  return options.extendEnv === false
    ? { ...options.env }
    : { ...process.env, ...options.env }
}

function finish(
  file: string,
  args: string[],
  options: ExecOptions,
  raw: {
    stdout: string
    stderr: string
    exitCode: number | undefined
    timedOut: boolean
    code?: string
  }
) {
  const strip = (value: string) =>
    options.stripFinalNewline === false ? value : value.replace(/\r?\n$/, "")
  const result: ExecResult = {
    stdout: strip(raw.stdout),
    stderr: strip(raw.stderr),
    exitCode: raw.exitCode,
    timedOut: raw.timedOut,
  }
  const failed = raw.timedOut || raw.code !== undefined || raw.exitCode !== 0
  if (!failed || options.reject === false) {
    return result
  }
  const error = new ExecError(
    `Command ${raw.timedOut ? "timed out" : "failed"}: ${[file, ...args].join(" ")}\n${result.stderr}`
  )
  error.stdout = result.stdout
  error.stderr = result.stderr
  error.exitCode = raw.exitCode
  error.timedOut = raw.timedOut
  error.code = raw.code
  throw error
}

// Runs a command without a shell. Bun.spawn under Bun, node:child_process
// elsewhere, so the published CLI keeps working on Node.
export async function exec(
  file: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  if (typeof Bun !== "undefined") {
    let child: ReturnType<typeof Bun.spawn>
    try {
      child = Bun.spawn([file, ...args], {
        cwd: options.cwd,
        env: buildEnv(options) as Record<string, string>,
        stdin:
          options.input === undefined ? "ignore" : new Blob([options.input]),
        stdout: "pipe",
        stderr: "pipe",
      })
    } catch (cause) {
      return finish(file, args, options, {
        stdout: "",
        stderr: String((cause as Error).message ?? cause),
        exitCode: undefined,
        timedOut: false,
        code: "ENOENT",
      })
    }
    let timedOut = false
    const timer = options.timeout
      ? setTimeout(() => {
          timedOut = true
          child.kill()
        }, options.timeout)
      : undefined
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout as ReadableStream).text(),
      new Response(child.stderr as ReadableStream).text(),
      child.exited,
    ])
    clearTimeout(timer)
    return finish(file, args, options, {
      stdout,
      stderr,
      exitCode: timedOut ? undefined : exitCode,
      timedOut,
    })
  }

  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      {
        cwd: options.cwd,
        env: buildEnv(options) as NodeJS.ProcessEnv,
        timeout: options.timeout,
        maxBuffer: options.maxBuffer ?? 100 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const failure = error as
          (NodeJS.ErrnoException & { killed?: boolean }) | null
        try {
          resolve(
            finish(file, args, options, {
              stdout,
              stderr,
              exitCode: failure
                ? typeof failure.code === "number"
                  ? failure.code
                  : undefined
                : 0,
              timedOut: Boolean(failure?.killed),
              code:
                failure && typeof failure.code === "string"
                  ? failure.code
                  : undefined,
            })
          )
        } catch (thrown) {
          reject(thrown)
        }
      }
    )
    if (options.input !== undefined) {
      child.stdin?.end(options.input)
    }
  })
}
