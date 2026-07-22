/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#eef5fc",
        muted: "#b9cbe2",
        dim: "#82a0c2",
        cyan: "#2564cf",
        blue: "#14213d",
        violet: "#1a4fb4",
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
