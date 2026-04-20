import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_BASE || "http://localhost:3001";
  return {
    plugins: [react()],
    server: { host: "0.0.0.0", port: 5173, proxy: { "/api": target, "/socket.io": { target, ws: true } } },
  };
});
