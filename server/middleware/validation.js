import { body, param, validationResult } from 'express-validator';

// Middleware para manejar errores de validación
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      message: 'Validation error',
      errors: errors.array() 
    });
  }
  next();
};

// Validación para conexión MAVLink
export const validateMavlinkConnect = [
  body('type')
    .isIn(['serial', 'tcp', 'udp'])
    .withMessage('Type must be serial, tcp, or udp'),
  
  body('config').isObject().withMessage('Config must be an object'),
  
  // Validación condicional para puerto serial
  body('config.port')
    .if(body('type').equals('serial'))
    .matches(/^\/dev\/tty[A-Z0-9]+$/)
    .withMessage('Invalid serial port format'),
  
  // Validación para baudrate
  body('config.baudrate')
    .if(body('type').equals('serial'))
    .isIn(['9600', '57600', '115200', '230400', '460800', '921600'])
    .withMessage('Invalid baudrate'),
  
  // Validación para TCP/UDP
  body('config.host')
    .if((value, { req }) => req.body.type === 'tcp' || req.body.type === 'udp')
    .optional()
    .matches(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^localhost$/)
    .withMessage('Invalid host format'),
  
  body('config.port')
    .if((value, { req }) => req.body.type === 'tcp' || req.body.type === 'udp')
    .optional()
    .isInt({ min: 1, max: 65535 })
    .withMessage('Port must be between 1 and 65535'),
  
  handleValidationErrors
];

// Validación para guardar conexiones
export const validateSaveConnections = [
  body('connections')
    .isArray()
    .withMessage('Connections must be an array'),
  
  body('connections.*.id')
    .isNumeric()
    .withMessage('Connection ID must be numeric'),
  
  body('connections.*.name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Connection name must be between 1 and 100 characters'),
  
  body('connections.*.type')
    .isIn(['serial', 'tcp', 'udp'])
    .withMessage('Invalid connection type'),
  
  body('activeConnectionId')
    .optional()
    .isNumeric()
    .withMessage('Active connection ID must be numeric'),
  
  handleValidationErrors
];

// Validación para actualizar conexión activa
export const validateActiveConnection = [
  body('activeConnectionId')
    .custom((value) => value === null || typeof value === 'number')
    .withMessage('Active connection ID must be null or numeric'),
  
  handleValidationErrors
];

// Validación para WiFi connect
export const validateWifiConnect = [
  body('ssid')
    .isString()
    .trim()
    .isLength({ min: 1, max: 32 })
    .withMessage('SSID must be between 1 and 32 characters'),
  
  body('password')
    .optional()
    .isString()
    .isLength({ min: 8, max: 63 })
    .withMessage('Password must be between 8 and 63 characters'),
  
  handleValidationErrors
];

// Validación para WiFi forget
export const validateWifiForget = [
  param('ssid')
    .isString()
    .trim()
    .isLength({ min: 1, max: 32 })
    .withMessage('SSID must be between 1 and 32 characters'),
  
  handleValidationErrors
];

// Validación para set parameter
export const validateSetParameter = [
  body('name')
    .isString()
    .trim()
    .matches(/^[A-Z0-9_]+$/)
    .withMessage('Parameter name must contain only uppercase letters, numbers, and underscores'),
  
  body('value')
    .isNumeric()
    .withMessage('Parameter value must be numeric'),
  
  handleValidationErrors
];

// Validación para cambio de modo de vuelo
export const validateFlightMode = [
  body('systemId')
    .isInt({ min: 1, max: 255 })
    .withMessage('System ID must be between 1 and 255'),
  
  body('customMode')
    .isInt({ min: 0 })
    .withMessage('Custom mode must be a valid integer'),
  
  handleValidationErrors
];

// Validación para comandos MAVLink
export const validateMavlinkCommand = [
  param('action')
    .isIn(['arm', 'disarm', 'takeoff', 'land', 'rtl'])
    .withMessage('Invalid MAVLink command action'),
  
  body('systemId')
    .optional()
    .isInt({ min: 1, max: 255 })
    .withMessage('System ID must be between 1 and 255'),
  
  handleValidationErrors
];
