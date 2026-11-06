import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, '.', 'DECANT_');
  const gatewayTarget = environment.DECANT_GATEWAY_DEV_TARGET || 'http://127.0.0.1:8080';

  return {
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        '/v1': {
          target: gatewayTarget,
          changeOrigin: true,
        },
        '/health': {
          target: gatewayTarget,
          changeOrigin: true,
        },
        '/get': {
          target: gatewayTarget,
          changeOrigin: true,
        },
        '/post': {
          target: gatewayTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
