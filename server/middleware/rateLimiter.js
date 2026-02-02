import rateLimit from 'express-rate-limit';

// Rate limiter general para toda la API
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100, // 100 peticiones por minuto
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter estricto para comandos de sistema críticos
export const systemCommandLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 3, // Máximo 3 peticiones por minuto
  message: { success: false, message: 'Too many system commands, please wait before retrying' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Contar incluso requests exitosos
});

// Rate limiter para WiFi scanning (operación costosa)
export const wifiScanLimiter = rateLimit({
  windowMs: 30 * 1000, // 30 segundos
  max: 5, // Máximo 5 scans cada 30 segundos
  message: { success: false, message: 'Please wait before scanning WiFi networks again' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter para conexiones MAVLink
export const mavlinkConnectLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 segundos
  max: 10, // Máximo 10 intentos de conexión cada 10 segundos
  message: { success: false, message: 'Too many connection attempts, please wait' },
  standardHeaders: true,
  legacyHeaders: false,
});
