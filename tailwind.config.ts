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
          950: "#050508", // Nền chính sâu thẳm chuẩn OLED/macOS Dark
          900: "#0A0A10", // Nền khung cửa sổ phụ
          800: "#12121C", // Nền card khi chưa hover
        },
        neon: {
          cyan: "#00F0FF",    // Điểm nhấn tần số cao & trạng thái đồng bộ
          violet: "#A855F7",  // Mảng màu ambient trung tâm (Retro Neon Violet)
          amber: "#F59E0B",   // Đèn tín hiệu Warm Analog / VU Amber
          emerald: "#10B981", // Tín hiệu phòng nghe trực tuyến (Spotify vibe)
          rose: "#FF2A85",    // Điểm nhấn nhịp bass & nút yêu thích
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
        acrylic: "48px", // Độ mờ kính sâu chuẩn macOS Sonoma/Sequoia
      },
      boxShadow: {
        "glass-panel":
          "0 20px 50px rgba(0, 0, 0, 0.6), inset 0 1px 0 0 rgba(255, 255, 255, 0.12)",
        "glass-dock":
          "0 24px 64px -12px rgba(0, 0, 0, 0.85), inset 0 1px 1px 0 rgba(255, 255, 255, 0.18)",
        "neon-cyan": "0 0 24px -4px rgba(0, 240, 255, 0.45)",
        "neon-violet": "0 0 32px -4px rgba(168, 85, 247, 0.45)",
        "neon-amber": "0 0 24px -4px rgba(245, 158, 11, 0.45)",
        "neon-glow-cyan": "0 0 16px -2px rgba(0, 240, 255, 0.35), 0 0 4px -1px rgba(0, 240, 255, 0.2)",
        "neon-glow-violet": "0 0 16px -2px rgba(168, 85, 247, 0.35), 0 0 4px -1px rgba(168, 85, 247, 0.2)",
        "neon-glow-amber": "0 0 16px -2px rgba(245, 158, 11, 0.3), 0 0 4px -1px rgba(245, 158, 11, 0.2)",
        "metallic-inset": "inset 0 1px 0 0 rgba(255,255,255,0.12), inset 0 -1px 0 0 rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.4)",
      },
      keyframes: {
        "ambient-drift": {
          "0%, 100%": { transform: "translate3d(0px, 0px, 0) scale(1)" },
          "33%": { transform: "translate3d(40px, -30px, 0) scale(1.08)" },
          "66%": { transform: "translate3d(-25px, 25px, 0) scale(0.95)" },
        },
        "spring-pop": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.28)" },
          "75%": { transform: "scale(0.92)" },
          "100%": { transform: "scale(1)" },
        },
        "toast-slide-in": {
          "0%": { transform: "translate3d(100%, 0, 0)", opacity: "0" },
          "100%": { transform: "translate3d(0, 0, 0)", opacity: "1" },
        },
      },
      animation: {
        "ambient-slow": "ambient-drift 18s ease-in-out infinite",
        "ambient-reverse": "ambient-drift 24s ease-in-out infinite reverse",
        "spring-pop": "spring-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "toast-in": "toast-slide-in 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
};

export default config;
