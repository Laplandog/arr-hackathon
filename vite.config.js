import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

const BUILD_VERSION = Date.now().toString(36);

// 构建时额外输出 version.json：页面启动时不走缓存读取它，
// 所以美术上传新图、重新部署后，刷新就能看到新图（不会被浏览器缓存的旧图挡住）。
const versionJson = {
  name: 'version-json',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: BUILD_VERSION }) });
  },
};

// `npm run dev`       → HTTPS（Quest 进 VR 必须 HTTPS）
// `npm run dev:http`  → 纯 HTTP（只在电脑浏览器调试用）
export default defineConfig(({ mode }) => ({
  plugins: [...(mode === 'http' ? [] : [basicSsl()]), versionJson],
  // 'mpa'：缺失的素材返回 404，而不是回退到 index.html（否则缺图检测会失效）
  appType: 'mpa',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  define: {
    // 素材 URL 的 ?v= 版本号：每次构建一个新时间戳，避免 Quest 浏览器缓存旧图
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
}));
