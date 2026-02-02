/**
 * API Response - Clase para estandarizar respuestas del backend
 * 
 * Proporciona un formato uniforme para todas las respuestas de la API,
 * facilitando el manejo de respuestas en el frontend.
 */

export class APIResponse {
  /**
   * Respuesta exitosa
   * @param {*} data - Datos de la respuesta
   * @param {string} message - Mensaje opcional
   * @returns {object} Respuesta formateada
   */
  static success(data = null, message = null) {
    const response = {
      success: true,
      timestamp: new Date().toISOString()
    };

    if (data !== null) {
      response.data = data;
    }

    if (message) {
      response.message = message;
    }

    return response;
  }

  /**
   * Respuesta de error
   * @param {string} message - Mensaje de error
   * @param {string} code - Código de error (opcional)
   * @param {*} details - Detalles adicionales del error (opcional)
   * @returns {object} Respuesta formateada
   */
  static error(message, code = 'INTERNAL_ERROR', details = null) {
    const response = {
      success: false,
      error: {
        message,
        code
      },
      timestamp: new Date().toISOString()
    };

    if (details !== null) {
      response.error.details = details;
    }

    return response;
  }

  /**
   * Respuesta con validación de errores
   * @param {array} errors - Array de errores de validación
   * @returns {object} Respuesta formateada
   */
  static validationError(errors) {
    return {
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: errors
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Respuesta no encontrada
   * @param {string} resource - Recurso no encontrado
   * @returns {object} Respuesta formateada
   */
  static notFound(resource = 'Resource') {
    return {
      success: false,
      error: {
        message: `${resource} not found`,
        code: 'NOT_FOUND'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Respuesta no autorizada
   * @param {string} message - Mensaje de error
   * @returns {object} Respuesta formateada
   */
  static unauthorized(message = 'Unauthorized') {
    return {
      success: false,
      error: {
        message,
        code: 'UNAUTHORIZED'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Respuesta de rate limiting excedido
   * @param {string} message - Mensaje de error
   * @returns {object} Respuesta formateada
   */
  static rateLimitExceeded(message = 'Too many requests') {
    return {
      success: false,
      error: {
        message,
        code: 'RATE_LIMIT_EXCEEDED'
      },
      timestamp: new Date().toISOString()
    };
  }
}

// Códigos de error comunes
export const ErrorCodes = {
  // Errores generales
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Errores de conexión
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  ALREADY_CONNECTED: 'ALREADY_CONNECTED',
  NOT_CONNECTED: 'NOT_CONNECTED',
  
  // Errores de archivo
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  
  // Errores de sistema
  COMMAND_FAILED: 'COMMAND_FAILED',
  COMMAND_TIMEOUT: 'COMMAND_TIMEOUT',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  
  // Errores de MAVLink
  MAVLINK_ERROR: 'MAVLINK_ERROR',
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  PARAMETER_NOT_FOUND: 'PARAMETER_NOT_FOUND'
};
