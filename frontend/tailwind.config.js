/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F6F6F9",
        surface: "#FFFFFF",
        "surface-2": "#FBFBFD",
        line: "#E9E9EF",
        // brand crimson — channels come from src/lib/branding.ts via --brand
        primary: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          dark: "rgb(var(--brand-dark) / <alpha-value>)",
          tint: "#FFF1F3",
        },
        ink: "#17171F",
        body: "#3F3F49",
        muted: "#6B7280",
        success: "#15803D",
        warning: "#B45309",
        danger: "#DC2626",
        info: "#1D4ED8",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "14px",
        control: "9px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,17,33,0.04), 0 1px 3px rgba(16,17,33,0.06)",
        pop: "0 12px 40px rgba(16,17,33,0.14)",
        focus: "0 0 0 3px rgb(var(--brand) / 0.18)",
      },
      keyframes: {
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
        "slide-in": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: 0, transform: "translateY(4px) scale(0.98)" },
          to: { opacity: 1, transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "slide-in": "slide-in 0.22s cubic-bezier(0.16,1,0.3,1)",
        "scale-in": "scale-in 0.14s ease-out",
      },
    },
  },
  plugins: [],
};
