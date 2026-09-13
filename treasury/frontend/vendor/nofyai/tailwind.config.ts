import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // CoinMarketCap Light Theme
        background: {
          DEFAULT: "#FFFFFF",
          secondary: "#F7F8FA",
          tertiary: "#FAFAFA",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          hover: "#F7F8FA",
          active: "#EFF2F5",
        },
        border: {
          DEFAULT: "#EFF2F5",
          light: "#E6E8EB",
          dark: "#D1D4DC",
        },
        text: {
          primary: "#1E2329",
          secondary: "#58667E",
          tertiary: "#A0A9B8",
        },
        primary: {
          DEFAULT: "#3861FB",
          hover: "#2952F4",
          light: "#5B7EFD",
        },
        success: {
          DEFAULT: "#16C784",
          light: "#26D394",
          dark: "#06B574",
          bg: "#F0FDF9",
        },
        danger: {
          DEFAULT: "#EA3943",
          light: "#FA4953",
          dark: "#DA2933",
          bg: "#FEF2F2",
        },
        warning: {
          DEFAULT: "#F59E0B",
          light: "#FBBF24",
          dark: "#D97706",
          bg: "#FFF9F0",
        },
        accent: {
          blue: "#3861FB",
          purple: "#8B5CF6",
          cyan: "#06B6D4",
          orange: "#F59E0B",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'Roboto Mono'", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0, 0, 0, 0.05)",
        "card-hover": "0 4px 12px rgba(0, 0, 0, 0.1)",
        glow: "0 0 20px rgba(56, 97, 251, 0.15)",
      },
      borderRadius: {
        card: "12px",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in",
        "slide-in": "slideIn 0.4s ease-out",
        "scale-in": "scaleIn 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};

export default config;
