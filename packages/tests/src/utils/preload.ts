import { afterAll } from "bun:test"

import setup from "./setup"

// Replaces vitest globalSetup: wait for the dev server and the builds, then
// remove the temp directory once the run ends.
const cleanup = await setup()
afterAll(async () => {
  await cleanup()
})
