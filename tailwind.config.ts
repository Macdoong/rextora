import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rextora: {
          bg: "#050914",
          panel: "#0b1220",
          panel2: "#111827",
          border: "#1f2a44",
          purple: "#7c3aed",
          green: "#22c55e",
          red: "#ef4444",
          orange: "#f97316",
          cyan: "#38bdf8"
        }
      },
      boxShadow: {
        glow: "0 0 32px rgba(124, 58, 237, 0.22)"
      }
    }
  },
  plugins: []
};

export default config;
