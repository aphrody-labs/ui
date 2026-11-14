import { existsSync } from "fs"
import path from "path"

import { getAllBlockIds } from "../lib/blocks"

const REGISTRY_PATH = path.join(process.cwd(), "public/r")

// ----------------------------------------------------------------------------
// Capture screenshots with Bun.WebView (https://bun.com/docs/runtime/webview).
// Bun.WebView has no device scale factor: captures are 1x.
// ----------------------------------------------------------------------------
async function captureScreenshots() {
  const blockIds = await getAllBlockIds()
  const blocks = blockIds.filter((block) => {
    const lightPath = path.join(
      REGISTRY_PATH,
      `styles/new-york/${block}-light.png`
    )
    const darkPath = path.join(
      REGISTRY_PATH,
      `styles/new-york/${block}-dark.png`
    )
    return !existsSync(lightPath) || !existsSync(darkPath)
  })

  if (blocks.length === 0) {
    console.log("All screenshots exist, nothing to capture")
    return
  }

  await using view = new Bun.WebView({ width: 1440, height: 900 })

  for (const block of blocks) {
    const pageUrl = `http://localhost:4000/view/${block}`
    console.log(`- Capturing ${block}...`)

    for (const theme of ["light", "dark"]) {
      const screenshotPath = path.join(
        REGISTRY_PATH,
        `styles/new-york/${block}${theme === "dark" ? "-dark" : "-light"}.png`
      )

      if (existsSync(screenshotPath)) {
        continue
      }

      // Set theme and reload page.
      await view.navigate(pageUrl)
      await view.evaluate(
        `localStorage.setItem("theme", ${JSON.stringify(theme)})`
      )
      await view.navigate(pageUrl)

      // Wait for animations to complete.
      if (block.startsWith("chart") || block.startsWith("dashboard")) {
        await Bun.sleep(1000)
      }

      await view.evaluate(
        `document.querySelector("[data-tailwind-indicator]")?.remove()`
      )

      await Bun.write(screenshotPath, await view.screenshot())
    }
  }
}

try {
  console.log("Capturing screenshots...")

  await captureScreenshots()

  console.log("Done.")
} catch (error) {
  console.error(error)
  process.exit(1)
}
