import sharedConfig from "@nasti/eslint-config"

export default [
  ...sharedConfig,
  { ignores: ["dist"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
]
