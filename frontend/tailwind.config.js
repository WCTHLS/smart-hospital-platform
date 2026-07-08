/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#e8eefc",
        muted: "#98abcf",
        dim: "#6f80a3",
        cyan: "#34e1e8",
        blue: "#4f8dff",
        violet: "#a78bfa",
        pink: "#f472b6",
        mint: "#4ade80",
        amber: "#fbbf24",
        danger: "#fb6f6f",
      },
      fontFamily: {
        sans: ["Segoe UI", "system-ui", "-apple-system", "Roboto", "Arial", "sans-serif"],
        mono: ["Cascadia Code", "Consolas", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
