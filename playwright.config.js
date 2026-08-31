"use strict";

const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    timeout: 30000,
    expect: {
        timeout: 7000
    },
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI
        ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
        : "list",
    use: {
        baseURL: "http://127.0.0.1:4173",
        serviceWorkers: "block",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure"
    },
    webServer: {
        command: "node scripts/serve-static.js",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 15000
    },
    projects: [
        {
            name: "chromium-desktop",
            use: { ...devices["Desktop Chrome"] }
        },
        {
            name: "chromium-mobile",
            use: { ...devices["Pixel 7"] }
        }
    ]
});
