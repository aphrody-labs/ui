// Bun-only replacement for `start-server-and-test v4:dev http://localhost:4000 test:dev`.
import path from "node:path"

const root = path.join(import.meta.dir, "..")
const port = process.env.E2E_PORT ?? "4000"
const url = "http://localhost:" + port

// Needs generated styles: run registry:build --style all and --registry all first, otherwise
// next.config.mjs throws and the dev server never answers GET /.
const server = Bun.spawn(["bun", "x", "next", "dev", "--turbopack", "--port", port], {
  cwd: path.join(root, "apps/v4"),
  stdout: "inherit",
  stderr: "inherit",
})

async function waitForServer(timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("v4 dev server exited early")
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
  const tests = Bun.spawn(["bun", "test", "--timeout", "120000"], {
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
