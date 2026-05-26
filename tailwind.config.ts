import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        yimei: {
          sidebar: "#1f5ea8",
          sidebarActive: "#2d74c8",
          shell: "#eef3f8",
          border: "#d8e2ee"
        }
      },
      boxShadow: {
        panel: "0 8px 30px rgba(18, 54, 96, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
