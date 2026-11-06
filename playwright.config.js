import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".ui-cache/browsers");
const baseline = process.env.UI_BASELINE === "1";
if (baseline && (!process.env.CI || process.env.RUNNER_OS !== "Windows")) {
  throw new Error("Baselines nur auf windows-latest erzeugen.");
}

export default defineConfig({
  testDir: "./tests/ui",
  testMatch: "**/*.pw.js",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  updateSnapshots: baseline ? "all" : "none",
  snapshotPathTemplate: resolve("ui-baselines/{projectName}/{arg}{ext}"),
  reporter: [["list"], ["html", { open: "never" }]],
  expect: {
    // Vorfilter: 1 % abweichende Pixel und großzügiger Farbabstand.
    // Die Freigabe erfolgt durch den Prüfer am Bild und Soll-Bild.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.3, animations: "disabled" },
  },
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:1420",
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    colorScheme: "dark",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
  },
  projects: [[1440, 900], [1280, 800], [1024, 700]].map(([width, height]) => ({
    name: `${width}x${height}`,
    use: { viewport: { width, height } },
  })),
  webServer: {
    command: `npm ${baseline ? "--prefix .visual-base " : ""}run dev -- --host 127.0.0.1`,
    url: "http://127.0.0.1:1420",
    reuseExistingServer: false,
  },
});
