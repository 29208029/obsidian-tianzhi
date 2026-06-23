/** @type {import('tailwindcss').Config} */
export default {
  prefix: "tw-",
  content: ["./src/**/*.{ts,tsx,html}"],
  // 禁用 preflight:Obsidian 自带全局样式,避免 reset 干扰
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        // 参照 tianzhi AuthGate 的色板
        primary: {
          DEFAULT: "#2563eb",
          hover: "#1d4ed8",
        },
        accent: {
          DEFAULT: "#3b82f6",
        },
        muted: {
          DEFAULT: "#6b7280",
          fg: "#9ca3af",
        },
        success: "#10b981",
        danger: "#ef4444",
        surface: {
          DEFAULT: "var(--background-secondary)",
          alt: "var(--background-primary)",
          border: "var(--background-modifier-border)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-interface)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
