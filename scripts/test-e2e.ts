// Bun-only replacement for `start-server-and-test v4:dev http://localhost:4000 test:dev`.
import path from "node:path"

const root = path.join(import.meta.dir, "..")
const url = "http://localhost:4000"

const server = Bun.spawn(["bun", "run", "--filter", "v4", "dev"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
})

async function waitForServer(timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).status < 500) return
    } catch {}
    await Bun.sleep(1000)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

let code = 1
try {
  await waitForServer()
  const tests = Bun.spawn(["bun", "test"], {
    cwd: path.join(root, "packages/tests"),
    env: {
      ...process.env,
      REGISTRY_URL: `${url}/r`,
      SHADCN_TEMPLATE_DIR: path.join(root, "templates"),
    },
    stdout: "inherit",
    stderr: "inherit",
  })
  code = await tests.exited
} finally {
  server.kill()
}
process.exit(code)
