/// <reference types="@capacitor/status-bar" />

import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.fwl.seedscout",
  appName: "Seed Scout",
  webDir: "dist",
  server: {
    hostname: "localhost",
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
    },
  },
}

export default config
