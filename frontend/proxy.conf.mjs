// Proxy del servidor de desarrollo (`npm start`) hacia la API.
// Por defecto apunta a http://localhost:8090; en otro equipo define SGO_API_URL
// (por ejemplo `SGO_API_URL=http://localhost:8080 npm start`).
const target = process.env.SGO_API_URL ?? 'http://localhost:8090';

export default {
  '/api': { target, secure: false, changeOrigin: false },
  '/health': { target, secure: false, changeOrigin: false },
};
