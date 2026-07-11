/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0b0d12",
          secondary: "#12151c",
        },
        surface: {
          DEFAULT: "rgba(255,255,255,0.04)",
          hover: "rgba(255,255,255,0.07)",
        },
        // Driven by --accent-rgb (set at runtime by src/lib/theme.ts), so bg-accent/80 etc.
        // keep working with Tailwind opacity modifiers while being fully theme-able.
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "20px",
        xl: "32px",
      },
    },
  },
  plugins: [],
};
