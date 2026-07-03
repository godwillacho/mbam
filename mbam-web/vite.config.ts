import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          name: "Mbam",
          short_name: "Mbam",
          description: "Sales recording for small businesses",
          theme_color: "#1B4332",
          background_color: "#FDFBF7",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        },
      }),
    ],
    build: {
      sourcemap: mode !== "production",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("i18next")) return "vendor-i18n";
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/react-router") ||
              id.includes("/react-i18next/")
            ) {
              return "vendor-react";
            }
            if (
              id.includes("/recharts/") ||
              id.includes("/d3-") ||
              id.includes("/victory-vendor/") ||
              id.includes("/@reduxjs/") ||
              id.includes("/react-redux/") ||
              id.includes("/redux/") ||
              id.includes("/reselect/")
            ) {
              return "vendor-charts";
            }
            return undefined;
          },
        },
      },
      chunkSizeWarningLimit: 400,
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://localhost:8080",
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
    },
  };
});
