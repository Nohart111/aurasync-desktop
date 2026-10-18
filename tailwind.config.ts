// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        mono: ["var(--font-roboto-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        obsidian: {
          950: "#050508", // Ná»n chÃ­nh sÃ¢u tháº³m chuáº©n OLED/macOS Dark
          900: "#0A0A10", // Ná»n khung cá»­a sá»• phá»¥
          800: "#12121C", // Ná»n card khi chÆ°a hover
        },
        neon: {
          cyan: "#00F0FF",    // Äiá»ƒm nháº¥n táº§n sá»‘ cao & tráº¡ng thÃ¡i Ä‘á»“ng bá»™
          violet: "#8A2BE2",  // Máº£ng mÃ u ambient trung tÃ¢m
          emerald: "#10B981", // TÃ­n hiá»‡u phÃ²ng nghe trá»±c tuyáº¿n (Spotify vibe)
          rose: "#FF2A85",    // Äiá»ƒm nháº¥n nhá»‹p bass & nÃºt yÃªu thÃ­ch
        },
        glass: {
          surface: "rgba(18, 18, 28, 0.55)",
          elevated: "rgba(30, 30, 46, 0.65)",
          border: "rgba(255, 255, 255, 0.08)",
          highlight: "rgba(255, 255, 255, 0.16)",
        },
      },
      backdropBlur: {
        xs: "4px",
        glass: "24px",
        acrylic: "48px", // Äá»™ má» kÃ­nh sÃ¢u chuáº©n macOS Sonoma/Sequoia
      },
      boxShadow: {
        "glass-panel":
          "0 20px 50px rgba(0, 0, 0, 0.6), inset 0 1px 0 0 rgba(255, 255, 255, 0.12)",
        "glass-dock":
          "0 24px 64px -12px rgba(0, 0, 0, 0.85), inset 0 1px 1px 0 rgba(255, 255, 255, 0.18)",
        "neon-cyan": "0 0 24px -4px rgba(0, 240, 255, 0.45)",
        "neon-violet": "0 0 32px -4px rgba(138, 43, 226, 0.5)",
      },
      keyframes: {
        "ambient-drift": {
          "0%, 100%": { transform: "translate3d(0px, 0px, 0) scale(1)" },
          "33%": { transform: "translate3d(40px, -30px, 0) scale(1.08)" },
          "66%": { transform: "translate3d(-25px, 25px, 0) scale(0.95)" },
        },
      },
      animation: {
        "ambient-slow": "ambient-drift 18s ease-in-out infinite",
        "ambient-reverse": "ambient-drift 24s ease-in-out infinite reverse",
      },
    },
  },
};

export default config;
