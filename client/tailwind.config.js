export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: { btc: "#f7931a", up: "#00c853", down: "#ff1744", dark: { 800: "#1a1a2e", 900: "#0f0f23", 950: "#0a0a1a" } },
      animation: { "bounce-in": "bounceIn 0.5s ease-out" },
      keyframes: { bounceIn: { "0%": { transform: "scale(0.3)", opacity: "0" }, "50%": { transform: "scale(1.05)" }, "100%": { transform: "scale(1)", opacity: "1" } } },
    },
  },
  plugins: [],
};
