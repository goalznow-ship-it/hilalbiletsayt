import { defineConfig, devices } from "@playwright/test";

// Runs against an already running stack (docker compose or local servers):
//   BASE_URL      web origin; the API is reached through its /api proxy
//   ADMIN_EMAIL / ADMIN_PASSWORD   the bootstrap SUPER_ADMIN
export default defineConfig({
  testDir: "./smoke",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    locale: "az-AZ",
    timezoneId: "Asia/Baku",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /(?:a11y|omr-camera)\.spec\.mjs/ },
  ],
});
