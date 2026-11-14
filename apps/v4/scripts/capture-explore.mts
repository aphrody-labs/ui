import { existsSync, mkdirSync } from "fs"
import path from "path"
import { decodePreset } from "shadcn/preset"

import { EXPLORE_PRESETS } from "../lib/explore"

const PRESETS_PATH = path.join(process.cwd(), "public/presets")
const force = process.argv.includes("--force")

// ----------------------------------------------------------------------------
// Capture explore preset screenshots with Bun.WebView
// (https://bun.com/docs/runtime/webview). Bun.WebView has no device scale
// factor: captures are 1x, and the viewport is resized to the target element.
// ----------------------------------------------------------------------------
async function captureScreenshots() {
  if (!existsSync(PRESETS_PATH)) {
    mkdirSync(PRESETS_PATH, { recursive: true })
  }

  const presets = force
    ? EXPLORE_PRESETS
    : EXPLORE_PRESETS.filter((code) => {
        const lightPath = path.join(PRESETS_PATH, `${code}-light.png`)
        const darkPath = path.join(PRESETS_PATH, `${code}-dark.png`)
        return !existsSync(lightPath) || !existsSync(darkPath)
      })

  if (presets.length === 0) {
    console.log("All screenshots exist, nothing to capture")
    return
  }

  await using view = new Bun.WebView({ width: 1280, height: 720 })

  for (const code of presets) {
    const decoded = decodePreset(code)
    if (!decoded) {
      console.warn(`Skipping invalid preset code: ${code}`)
      continue
    }

    const pageUrl = `http://localhost:4000/preview/radix/preview?preset=${code}`
    console.log(`- Capturing ${code}...`)

    for (const theme of ["light", "dark"] as const) {
      const screenshotPath = path.join(PRESETS_PATH, `${code}-${theme}.png`)

      if (!force && existsSync(screenshotPath)) {
        continue
      }

      await view.resize(1280, 720)
      await view.navigate(pageUrl)
      await view.evaluate(
        `localStorage.setItem("theme", ${JSON.stringify(theme)})`
      )
      await view.navigate(pageUrl)

      // Wait for animations to complete.
      await Bun.sleep(1000)

      // Hide Tailwind indicator and measure the capture target.
      const rect = (await view.evaluate(`(() => {
        document.querySelector("[data-tailwind-indicator]")?.remove()
        const el = document.querySelector('[data-slot="capture-target"]')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { width: Math.ceil(r.width), height: Math.ceil(r.height) }
      })()`)) as { width: number; height: number } | null

      if (rect) {
        await view.resize(
          Math.min(Math.max(rect.width, 1), 16384),
          Math.min(Math.max(rect.height, 1), 16384)
        )
        await view.scrollTo('[data-slot="capture-target"]')
      } else {
        console.warn(
          `No [data-slot="capture-target"] found for ${code} (${theme}), capturing full page`
        )
      }

      await Bun.write(screenshotPath, await view.screenshot())
    }
  }
}

try {
  console.log("Capturing explore preset screenshots...")

  await captureScreenshots()

  console.log("Done.")
} catch (error) {
  console.error(error)
  process.exit(1)
}
