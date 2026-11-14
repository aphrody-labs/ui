import type { Config } from "@/src/get-config"
import { getFixturesDir } from "@/src/test-helpers"
import { afterEach, describe, expect, it, vi } from "bun:test"
import prompts from "prompts"

import { exec } from "../exec"
import {
  assertSafeDependencies,
  installDependencies,
  removeDependencies,
  updateDependencies,
} from "./update-dependencies"

vi.mock("../exec")
vi.mock("prompts")

describe("updateDependencies", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    {
      description:
        "npm without react-day-picker v8 includes no additional flags",
      options: { silent: true },
      dependencies: ["first", "second", "third"],
      devDependencies: ["fourth"],
      config: {
        resolvedPaths: {
          cwd: getFixturesDir("project-npm"),
        },
      },
      expectedPackageManager: "npm",
      expectedArgs: [
        "install",
        "--no-audit",
        "--no-fund",
        "--",
        "first",
        "second",
        "third",
      ],
      expectedDevArgs: [
        "install",
        "--no-audit",
        "--no-fund",
        "-D",
        "--",
        "fourth",
      ],
    },
    {
      description:
        "npm with react-day-picker v8 applies force prompt when silent",
      options: { silent: true },
      dependencies: ["first", "second", "third"],
      devDependencies: ["fourth"],
      config: {
        resolvedPaths: {
          cwd: getFixturesDir("project-npm-react19"),
        },
      },
      expectedPackageManager: "npm",
      expectedArgs: [
        "install",
        "--no-audit",
        "--no-fund",
        "--force",
        "--",
        "first",
        "second",
        "third",
      ],
      expectedDevArgs: [
        "install",
        "--no-audit",
        "--no-fund",
        "--force",
        "-D",
        "--",
        "fourth",
      ],
    },
    {
      description:
        "npm with react-day-picker v8 applies force when non-interactive",
      options: { interactive: false },
      dependencies: ["first", "second", "third"],
      devDependencies: ["fourth"],
      config: {
        resolvedPaths: {
          cwd: getFixturesDir("project-npm-react19"),
        },
      },
      expectedPackageManager: "npm",
      expectedArgs: [
        "install",
        "--no-audit",
        "--no-fund",
        "--force",
        "--",
        "first",
        "second",
        "third",
      ],
      expectedDevArgs: [
        "install",
        "--no-audit",
        "--no-fund",
        "--force",
        "-D",
        "--",
        "fourth",
      ],
    },
    {
      description:
        "npm with react-day-picker v8 prompts for flag when not silent",
      flagPrompt: "legacy-peer-deps",
      dependencies: ["first", "second", "third"],
      devDependencies: ["fourth"],
      config: {
        resolvedPaths: {
          cwd: getFixturesDir("project-npm-react19"),
        },
      },
      expectedPackageManager: "npm",
      expectedArgs: [
        "install",
        "--no-audit",
        "--no-fund",
        "--legacy-peer-deps",
        "--",
        "first",
        "second",
        "third",
      ],
      expectedDevArgs: [
        "install",
        "--no-audit",
        "--no-fund",
        "--legacy-peer-deps",
        "-D",
        "--",
        "fourth",
      ],
    },
    {
      description: "deno uses npm: package prefix",
      dependencies: ["first", "second", "third"],
      devDependencies: ["fourth"],
      config: {
        resolvedPaths: {
          cwd: getFixturesDir("project-deno"),
        },
      },
      expectedPackageManager: "deno",
      expectedArgs: ["add", "npm:first", "npm:second", "npm:third"],
      expectedDevArgs: ["add", "-D", "npm:fourth"],
    },
    {
      description: "bun uses bun",
      dependencies: ["first", "second", "third"],
      devDependencies: ["fourth"],
      config: {
        resolvedPaths: {
          cwd: getFixturesDir("project-bun"),
        },
      },
      expectedPackageManager: "bun",
      expectedArgs: ["add", "--", "first", "second", "third"],
      expectedDevArgs: ["add", "-D", "--", "fourth"],
    },
    {
      description: "pnpm uses pnpm",
      dependencies: ["first", "second", "third"],
      devDependencies: ["fourth"],
      config: {
        resolvedPaths: {
          cwd: getFixturesDir("project-pnpm"),
        },
      },
      expectedPackageManager: "pnpm",
      expectedArgs: ["add", "--", "first", "second", "third"],
      expectedDevArgs: ["add", "-D", "--", "fourth"],
    },
    {
      description: "deduplicates input dependencies",
      options: { silent: true },
      dependencies: ["first", "first"],
      devDependencies: ["second", "second"],
      config: {
        resolvedPaths: {
          cwd: getFixturesDir("project-npm"),
        },
      },
      expectedPackageManager: "npm",
      expectedArgs: ["install", "--no-audit", "--no-fund", "--", "first"],
      expectedDevArgs: [
        "install",
        "--no-audit",
        "--no-fund",
        "-D",
        "--",
        "second",
      ],
    },
  ])(
    "$description",
    async ({
      options,
      flagPrompt,
      config,
      dependencies,
      devDependencies,
      expectedPackageManager,
      expectedArgs,
      expectedDevArgs,
    }) => {
      vi.mocked(prompts).mockResolvedValue({ flag: flagPrompt })

      await updateDependencies(
        dependencies,
        devDependencies,
        config as Config,
        options ?? {}
      )

      if (flagPrompt) {
        expect(prompts).toHaveBeenCalled()
      } else {
        expect(prompts).not.toHaveBeenCalled()
      }

      expect(exec).toHaveBeenCalledWith(expectedPackageManager, expectedArgs, {
        cwd: config?.resolvedPaths.cwd,
      })

      expect(exec).toHaveBeenCalledWith(
        expectedPackageManager,
        expectedDevArgs,
        { cwd: config?.resolvedPaths.cwd }
      )
    }
  )

  it("skips bare dependencies already declared in package.json (#10525)", async () => {
    const cwd = getFixturesDir("project-pnpm-existing-deps")

    await updateDependencies(
      // @base-ui/react, class-variance-authority and recharts are already
      // declared in the fixture; only react-is and the explicit recharts@3.8.0
      // spec should reach the package manager.
      [
        "@base-ui/react",
        "class-variance-authority",
        "react-is",
        "recharts@3.8.0",
      ],
      ["@tailwindcss/postcss", "typescript"],
      { resolvedPaths: { cwd } } as any,
      { silent: true }
    )

    expect(exec).toHaveBeenCalledTimes(2)
    expect(exec).toHaveBeenCalledWith(
      "pnpm",
      ["add", "--", "react-is", "recharts@3.8.0"],
      { cwd }
    )
    expect(exec).toHaveBeenCalledWith(
      "pnpm",
      ["add", "-D", "--", "typescript"],
      {
        cwd,
      }
    )
  })

  it("prefers explicit specs over duplicate bare requests", async () => {
    const cwd = getFixturesDir("project-pnpm")

    await updateDependencies(
      ["recharts", "recharts@3.8.0", "@base-ui/react", "@base-ui/react@1.4.1"],
      [],
      { resolvedPaths: { cwd } } as any,
      { silent: true }
    )

    expect(exec).toHaveBeenCalledTimes(1)
    expect(exec).toHaveBeenCalledWith(
      "pnpm",
      ["add", "--", "recharts@3.8.0", "@base-ui/react@1.4.1"],
      { cwd }
    )
  })

  it("does not skip already declared deps for expo projects", async () => {
    const cwd = getFixturesDir("project-expo-existing-deps")

    // recharts is already declared, but `expo install` must still see it so it
    // can align the version with the installed SDK. Duplicates are still deduped.
    await updateDependencies(
      ["recharts", "recharts", "react-is"],
      [],
      { resolvedPaths: { cwd } } as any,
      { silent: true }
    )

    expect(exec).toHaveBeenCalledWith(
      "npx",
      ["expo", "install", "--", "recharts", "react-is"],
      { cwd }
    )
  })

  it("rejects registry dependencies that begin with a dash (flag injection)", async () => {
    const cwd = getFixturesDir("project-pnpm")

    await expect(
      updateDependencies(
        ["--registry=http://malicious"],
        [],
        { resolvedPaths: { cwd } } as any,
        { silent: true }
      )
    ).rejects.toThrow(/cannot start with/)

    expect(exec).not.toHaveBeenCalledWith(
      "pnpm",
      expect.arrayContaining(["--registry=http://malicious"]),
      expect.anything()
    )
  })
})

describe("assertSafeDependencies", () => {
  it("does not throw for normal names and specifiers", () => {
    expect(() =>
      assertSafeDependencies(["zod", "recharts@3.8.0", "@base-ui/react"])
    ).not.toThrow()
  })

  it("throws for a specifier starting with a dash", () => {
    expect(() => assertSafeDependencies(["--registry=http://x"])).toThrow(
      /cannot start with/
    )
  })

  it("throws when a dash follows leading whitespace", () => {
    expect(() => assertSafeDependencies(["  -D"])).toThrow(/cannot start with/)
  })
})

describe("dependency commands", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("installs dependencies from a cwd without a shadcn config", async () => {
    const cwd = getFixturesDir("project-pnpm")

    await installDependencies(cwd, ["cn"])

    expect(exec).toHaveBeenCalledWith("pnpm", ["add", "--", "cn"], {
      cwd,
    })
  })

  it("removes only dependencies declared by the project", async () => {
    const cwd = getFixturesDir("project-pnpm-existing-deps")

    await removeDependencies(cwd, ["recharts", "not-installed"])

    expect(exec).toHaveBeenCalledWith("pnpm", ["remove", "--", "recharts"], {
      cwd,
    })
  })

  it("uninstalls with npm without running audit or fund", async () => {
    const cwd = getFixturesDir("project-npm-react19")

    await removeDependencies(cwd, ["react-day-picker"])

    expect(exec).toHaveBeenCalledWith(
      "npm",
      ["uninstall", "--no-audit", "--no-fund", "--", "react-day-picker"],
      { cwd }
    )
  })
})
