import sharedConfig from "@nasti/eslint-config"

export default [
  ...sharedConfig,
  // Add any app-specific configurations here
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // App-specific rule overrides
    },
  },
]
