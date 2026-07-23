import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rextora: {
          bg: "#070b14",
          panel: "#0e1628",
          panel2: "#141e32",
          border: "#243149",
          purple: "#6366f1",
          accent: "#3b82f6",
          green: "#22c55e",
          red: "#ef4444",
          orange: "#f59e0b",
          cyan: "#22d3ee",
          text: "var(--text-primary)",
          "text-secondary": "var(--text-secondary)",
          "text-muted": "var(--text-muted)",
          "text-disabled": "var(--text-disabled)",
          positive: "var(--text-positive)",
          negative: "var(--text-negative)",
          warning: "var(--text-warning)",
        },
      },
      boxShadow: {
        glow: "0 0 28px rgba(59, 130, 246, 0.18)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Apple SD Gothic Neo", "Malgun Gothic", "sans-serif"],
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
