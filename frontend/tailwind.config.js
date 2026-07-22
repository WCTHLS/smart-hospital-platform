/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { 50: "#F9FAFB", 100: "#CFEFEF", 500: "#37B5B1", 700: "#0B787A" },
        ink: "#1F2937",
        muted: "#6B7280",
        dim: "#6B7280",
        cyan: "#37B5B1",
        blue: "#0B787A",
        violet: "#5655A0",
        pink: "#f472b6",
        mint: "#4ade80",
        amber: "#fbbf24",
        danger: "#fb6f6f",
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "-apple-system", "Roboto", "Arial", "sans-serif"],
        mono: ["Cascadia Code", "Consolas", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
