// ng serve: /api and /health go to the backend (frontend §10). PAN_API_URL overrides the default.
const target = process.env.PAN_API_URL ?? 'http://localhost:8090';

export default {
  '/api': { target, secure: false, changeOrigin: true },
  '/health': { target, secure: false, changeOrigin: true },
};
