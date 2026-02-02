# Code Review y Mejoras - FPV Copilot GCS

**Fecha**: Febrero 2026  
**Versión**: 1.0  
**Alcance**: Análisis completo de arquitectura, seguridad y optimizaciones  
**Última actualización**: 2 de febrero de 2026

---

## 🎯 ESTADO ACTUAL: FASES 1 Y 2 COMPLETADAS ✅

### ✅ Fase 1: Seguridad Crítica - COMPLETADA
Ver detalles en: [PHASE1_IMPLEMENTATION.md](PHASE1_IMPLEMENTATION.md)
- URLs hardcodeadas → URLs relativas
- Validación de entrada con express-validator
- Rate limiting en endpoints críticos
- CORS mejorado con whitelist
- Permisos sudo verificados

### ✅ Fase 2: Refactorización - COMPLETADA
Ver detalles en: [PHASE2_IMPLEMENTATION.md](PHASE2_IMPLEMENTATION.md)

**Infraestructura nueva**:
- API Client centralizado (340 líneas, 28 métodos)
- ConnectionsContext (165 líneas, CRUD completo)
- APIResponse utility (140 líneas, respuestas estandarizadas)
- Funciones centralizadas connectToMavlink/disconnectFromMavlink

**Componentes refactorizados**:
- TopBar.jsx (-70 líneas duplicadas)
- Connections.jsx (-110 líneas duplicadas)
- SystemInfo.jsx (-50 líneas fetch boilerplate)

**Resultados**:
- 230 líneas eliminadas
- 23+ llamadas fetch() centralizadas
- 100% componentes críticos refactorizados
- Build exitoso sin errores

---

## 📊 Resumen Ejecutivo

### ✅ Fortalezas Actuales
- Arquitectura React + Node.js bien estructurada
- Separación clara entre frontend/backend
- Uso de contextos para estado global
- WebSocket para comunicación en tiempo real
- Persistencia en backend (connections.json)

### ⚠️ Áreas de Mejora Identificadas
1. **Seguridad**: URLs hardcodeadas, falta de validación de inputs
2. **Duplicación**: Lógica de conexión repetida en múltiples componentes
3. **Contextos**: Funcionalidad de conexión debería estar en contexto
4. **API**: Inconsistencia en manejo de errores y respuestas
5. **Sistema**: Comandos sudo sin validación adicional

---

## 🔍 Análisis Detallado

### 1. CONTEXTOS - Estado Global

#### 1.1 WebSocketContext ✅ BIEN
**Ubicación**: `client/src/contexts/WebSocketContext.jsx`

**Responsabilidades**:
- Gestión de conexión WebSocket
- Estado de vehículos
- Auto-reconnect
- Estado de conexión

**Problema Identificado**:
```javascript
// La lógica de CONECTAR a MAVLink NO está en el contexto
// Cada componente hace su propio fetch a /api/mavlink/connect
```

**Mejora Propuesta**: Mover lógica de conexión MAVLink al contexto

#### 1.2 ParametersContext ✅ BIEN
**Ubicación**: `client/src/contexts/ParametersContext.jsx`

**Responsabilidades**:
- Gestión de parámetros MAVLink
- Descarga de parámetros
- Modificación de parámetros
- Progreso de descarga

**Estado**: Bien diseñado, no requiere cambios

#### 1.3 NotificationContext ✅ BIEN
**Ubicación**: `client/src/contexts/NotificationContext.jsx`

**Responsabilidades**:
- Sistema de notificaciones toast
- Tipos: success, error, warning, info

**Estado**: Bien diseñado, no requiere cambios

---

### 2. DUPLICACIÓN DE CÓDIGO

#### 2.1 Lógica de Conexión MAVLink - ❌ DUPLICADA

**Ubicaciones duplicadas**:
1. `TopBar.jsx` - handleAutoConnect() ~60 líneas
2. `Connections.jsx` - handleConnect() ~70 líneas
3. `useWebSocket.js` - reconnect() ~50 líneas

**Código repetido**:
```javascript
// Se repite en 3 lugares diferentes
const response = await fetch('/api/mavlink/connect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: connection.type, config: connection.config })
})
const result = await response.json()
if (result.success) {
  await fetch('/api/connections/active', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activeConnectionId: connection.id })
  })
  // Solicitar parámetros...
}
```

**Solución**: Crear función centralizada en WebSocketContext

#### 2.2 Lógica de Desconexión MAVLink - ❌ DUPLICADA

**Ubicaciones duplicadas**:
1. `TopBar.jsx` - handleDisconnect()
2. `Connections.jsx` - handleDisconnect()
3. `ParameterDownloadModal.jsx` - handleCancel()

**Solución**: Centralizar en WebSocketContext

#### 2.3 Gestión de Conexiones Persistentes - ⚠️ PARCIALMENTE DUPLICADA

**Problema**:
- `Connections.jsx` tiene `saveConnectionsToBackend()`
- Otros componentes llaman directamente a endpoints

**Solución**: Crear ConnectionsContext para gestión CRUD de conexiones

---

### 3. SEGURIDAD

#### 3.1 URLs Hardcodeadas - ❌ INSEGURO

**Problema**:
```javascript
// En SystemInfo.jsx - URLs absolutas hardcodeadas
fetch('http://localhost:3000/api/system/info')
fetch('http://localhost:3000/api/wifi/status')
```

**Riesgo**: No funciona en producción con dominio diferente

**Solución**:
```javascript
// Usar URLs relativas (Vite proxy en dev, mismo origen en prod)
fetch('/api/system/info')
fetch('/api/wifi/status')
```

#### 3.2 Validación de Inputs - ⚠️ INSUFICIENTE

**Backend - Sin validación de tipos**:
```javascript
// server/index.js - No valida inputs
app.post('/api/mavlink/connect', async (req, res) => {
  const { type, config } = req.body; // Sin validación
  const result = await mavlinkService.connect(type, config);
  res.json(result);
});
```

**Solución**: Añadir middleware de validación

**Backend - Comandos de sistema sin rate limiting**:
```javascript
app.post('/api/system/reboot', (req, res) => {
  // Sin validación de origen, rate limiting, o confirmación adicional
  exec('sudo reboot');
});
```

**Riesgo**: Ataque de denegación de servicio (DoS)

**Solución**: Añadir rate limiting y validación de sesión

#### 3.3 Exposición de Información del Sistema - ⚠️ SENSIBLE

**Endpoints que exponen info del sistema**:
- `/api/system/info` - Kernel, OS, arquitectura
- `/api/system/network` - IPs, MACs
- `/api/wifi/status` - Redes WiFi

**Riesgo**: Fingerprinting del sistema

**Solución**: Limitar información expuesta o añadir autenticación

#### 3.4 CORS - ⚠️ DEMASIADO PERMISIVO

```javascript
cors: {
  origin: process.env.NODE_ENV === 'production' ? '*' : [...]
}
```

**Riesgo**: Cualquier origen puede hacer peticiones en producción

**Solución**: Whitelist de orígenes permitidos

---

### 4. BACKEND - API

#### 4.1 Manejo de Errores - ⚠️ INCONSISTENTE

**Problema**: Algunos endpoints devuelven errores diferentes

```javascript
// Algunos usan:
res.json({ success: false, message: 'Error' })

// Otros usan:
res.status(500).json({ success: false, message: error.message })

// Otros simplemente:
res.json({ error: 'Error' })
```

**Solución**: Estandarizar respuestas de error

#### 4.2 Estructura de Respuestas - ⚠️ INCONSISTENTE

**Problema**:
```javascript
// Algunos endpoints:
{ success: true, ports: [...] }

// Otros:
{ connections: [...], activeConnectionId: null }

// Otros:
{ data: {...}, success: true }
```

**Solución**: Formato estándar para todas las respuestas

#### 4.3 Logging - ❌ INSUFICIENTE

**Problema**: Solo console.log() sin niveles ni timestamps estructurados

```javascript
console.log('🔄 Reboot requested')
console.error('Error guardando conexiones:', error)
```

**Solución**: Usar librería de logging (winston, pino)

#### 4.4 Rate Limiting - ❌ NO EXISTE

**Problema**: No hay protección contra spam de peticiones

**Endpoints críticos sin protección**:
- `/api/system/reboot`
- `/api/system/shutdown`
- `/api/wifi/scan`
- `/api/mavlink/connect`

**Solución**: Implementar express-rate-limit

---

### 5. COMUNICACIÓN CON EL SISTEMA HOST

#### 5.1 Ejecución de Comandos - ⚠️ RIESGOSA

**Problema**: Uso directo de exec() con sudo

```javascript
require('child_process').exec('sudo reboot')
require('child_process').exec('sudo poweroff')
```

**Riesgos**:
- No captura errores correctamente
- No valida si el comando se ejecutó
- No hay timeout

**Solución**: Usar execPromise con manejo de errores y timeout

#### 5.2 Detección de Puertos Seriales - ⚠️ MEJORABLE

**Problema**: Usa bash -c con grep/sed

```javascript
await execPromise('bash -c "ls -1 /dev/tty{USB,ACM,AMA}* 2>/dev/null || true"');
```

**Solución**: Usar librería nativa (serialport) para detección más confiable

#### 5.3 Gestión de WiFi - ⚠️ DEPENDENCIA DE NETWORKMANAGER

**Problema**: Asume NetworkManager está instalado

```javascript
await execPromise('nmcli dev wifi list');
```

**Solución**: Detectar disponibilidad de nmcli antes de usarlo

#### 5.4 Permisos Sudo - ⚠️ DEMASIADO AMPLIOS

**Configuración actual**: `kiosk ALL=(ALL) NOPASSWD: ALL`

**Riesgo**: Usuario tiene permisos completos de sudo

**Solución**: Limitar solo a comandos específicos:
```
kiosk ALL=(ALL) NOPASSWD: /sbin/reboot, /sbin/poweroff, /usr/bin/nmcli
```

---

### 6. FRONTEND - COMPONENTES

#### 6.1 Componentes Grandes - ⚠️ REFACTOR RECOMENDADO

**Archivos con >500 líneas**:
- `SystemInfo.jsx` - 725 líneas
- `Connections.jsx` - 688 líneas
- `TopBar.jsx` - 485 líneas

**Solución**: Dividir en subcomponentes más pequeños

#### 6.2 Lógica de Negocio en Componentes - ⚠️ MOVER A SERVICIOS

**Problema**: Componentes tienen lógica de API directamente

**Solución**: Crear capa de servicios/API client

```javascript
// Actual:
const response = await fetch('/api/mavlink/connect', {...})

// Propuesto:
import mavlinkAPI from '@/services/mavlink'
const result = await mavlinkAPI.connect(connection)
```

---

### 7. WEBSOCKET - COMUNICACIÓN TIEMPO REAL

#### 7.1 Reconexión - ✅ BIEN IMPLEMENTADA

**Estado**: Auto-reconnect funciona correctamente

#### 7.2 Manejo de Desconexión - ✅ MEJORADO RECIENTEMENTE

**Estado**: markManualDisconnect() limpia estado correctamente

#### 7.3 Eventos - ⚠️ SIN VERSIONADO

**Problema**: No hay versionado de eventos WebSocket

**Solución**: Añadir versión a eventos:
```javascript
socket.emit('vehicles_update', { version: 1, data: vehicles })
```

---

## 🚀 PLAN DE MEJORAS PRIORITARIAS

### Fase 1: SEGURIDAD CRÍTICA (Alta Prioridad) ✅ COMPLETADA

1. ✅ **URLs Hardcodeadas** → URLs relativas implementadas en SystemInfo.jsx
2. ✅ **Validación de Inputs** → Middleware de validación implementado (server/middleware/validation.js)
3. ✅ **Rate Limiting** → express-rate-limit implementado para endpoints críticos (server/middleware/rateLimiter.js)
4. ✅ **CORS** → Whitelist de orígenes implementada con allowedOrigins
5. ✅ **Permisos Sudo** → Ya estaban correctamente limitados (/sbin/reboot, /sbin/poweroff, /usr/bin/nmcli, /usr/bin/systemctl)

**Fecha de completación**: 2 de febrero de 2026

### Fase 2: REFACTORIZACIÓN (Prioridad Media)

1. **Centralizar Conexión MAVLink** → Mover a WebSocketContext
2. **Crear ConnectionsContext** → CRUD de conexiones centralizado
3. **Capa de Servicios** → API client abstracto
4. **Dividir Componentes Grandes** → Subcomponentes
5. **Estandarizar Respuestas API** → Formato uniforme

### Fase 3: OPTIMIZACIÓN (Prioridad Baja)

1. **Logging Estructurado** → Winston/Pino
2. **Detección de Puertos** → Usar serialport library
3. **Caché** → Implementar para endpoints frecuentes
4. **Compresión** → Gzip para responses
5. **Tests** → Unit tests y E2E

---

## 📝 EJEMPLOS DE IMPLEMENTACIÓN

### Ejemplo 1: Middleware de Validación

```javascript
// server/middleware/validation.js
import { body, validationResult } from 'express-validator';

export const validateMavlinkConnect = [
  body('type').isIn(['serial', 'tcp', 'udp']),
  body('config.port').optional().matches(/^\/dev\/tty[A-Z0-9]+$/),
  body('config.baudrate').optional().isIn(['9600', '57600', '115200', '921600']),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
  }
];

// Uso:
app.post('/api/mavlink/connect', validateMavlinkConnect, async (req, res) => {
  // Inputs ya validados
});
```

### Ejemplo 2: Rate Limiting

```javascript
// server/middleware/rateLimiter.js
import rateLimit from 'express-rate-limit';

export const systemCommandLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 3, // Máximo 3 peticiones por minuto
  message: { success: false, message: 'Too many requests, please try again later' }
});

// Uso:
app.post('/api/system/reboot', systemCommandLimiter, (req, res) => {
  // Protected
});
```

### Ejemplo 3: Centralizar Conexión en Contexto

```javascript
// client/src/contexts/WebSocketContext.jsx

export const useWebSocketContext = () => {
  // ... estado existente ...

  const connectToMavlink = async (connection, options = {}) => {
    const { isAutoConnect = false, silent = false } = options;
    
    try {
      setConnecting(true);
      
      const response = await fetch('/api/mavlink/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: connection.type, config: connection.config })
      });
      const result = await response.json();
      
      if (result.success) {
        // Actualizar conexión activa en backend
        await fetch('/api/connections/active', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activeConnectionId: connection.id })
        });
        
        if (!silent) notify.success(t('connected'));
        
        // Solicitar parámetros si no es servidor TCP
        const isTcpServer = connection.type === 'tcp' && connection.config.mode === 'Servidor';
        if (!isTcpServer) {
          await fetch('/api/mavlink/parameters/request', { method: 'POST' });
        }
        
        return { success: true };
      } else {
        if (!silent) notify.error(result.message);
        return { success: false, message: result.message };
      }
    } catch (error) {
      if (!silent) notify.error(t('connectionError'));
      return { success: false, error: error.message };
    } finally {
      setConnecting(false);
    }
  };

  return {
    // ... exports existentes ...
    connectToMavlink,  // Nueva función centralizada
  };
};
```

### Ejemplo 4: API Client Layer

```javascript
// client/src/services/api.js

class APIClient {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Request failed');
      }
      
      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // MAVLink
  async connectMAVLink(type, config) {
    return this.request('/api/mavlink/connect', {
      method: 'POST',
      body: JSON.stringify({ type, config })
    });
  }

  async disconnectMAVLink() {
    return this.request('/api/mavlink/disconnect', { method: 'POST' });
  }

  // Connections
  async getConnections() {
    return this.request('/api/connections');
  }

  async saveConnections(connections, activeConnectionId) {
    return this.request('/api/connections', {
      method: 'POST',
      body: JSON.stringify({ connections, activeConnectionId })
    });
  }

  async updateActiveConnection(activeConnectionId) {
    return this.request('/api/connections/active', {
      method: 'PATCH',
      body: JSON.stringify({ activeConnectionId })
    });
  }

  // System
  async rebootSystem() {
    return this.request('/api/system/reboot', { method: 'POST' });
  }

  async shutdownSystem() {
    return this.request('/api/system/shutdown', { method: 'POST' });
  }
}

export default new APIClient();
```

### Ejemplo 5: Respuestas Estandarizadas

```javascript
// server/utils/response.js

export class APIResponse {
  static success(data = null, message = null) {
    return {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString()
    };
  }

  static error(message, code = 'INTERNAL_ERROR', details = null) {
    return {
      success: false,
      error: {
        message,
        code,
        details
      },
      timestamp: new Date().toISOString()
    };
  }
}

// Uso:
app.get('/api/connections', async (req, res) => {
  try {
    const data = await readConnectionsFile();
    res.json(APIResponse.success(data));
  } catch (error) {
    res.status(500).json(APIResponse.error(
      'Failed to load connections',
      'FILE_READ_ERROR',
      error.message
    ));
  }
});
```

---

## 📊 MÉTRICAS DE CALIDAD

### Antes de Mejoras
- ❌ Duplicación de código: ~180 líneas repetidas
- ⚠️ URLs hardcodeadas: 9 ocurrencias
- ❌ Sin validación de inputs: 15 endpoints
- ❌ Sin rate limiting: 20 endpoints
- ⚠️ Componentes >500 líneas: 3 archivos
- ❌ Sin tests: 0% cobertura

### Después de Mejoras (Objetivo)
- ✅ Duplicación de código: <10 líneas
- ✅ URLs hardcodeadas: 0
- ✅ Validación de inputs: 100% endpoints críticos
- ✅ Rate limiting: 100% endpoints críticos
- ✅ Componentes <300 líneas: Refactorizado
- ✅ Tests: >60% cobertura

---

## ⚡ QUICK WINS (Cambios Rápidos con Alto Impacto)

### 1. Cambiar URLs Hardcodeadas (15 min)
**Archivos**: `SystemInfo.jsx`  
**Impacto**: Seguridad + Portabilidad

### 2. Añadir Rate Limiting (30 min)
**Archivos**: `server/index.js`  
**Impacto**: Seguridad contra DoS

### 3. Limitar Permisos Sudo (10 min)
**Archivo**: `/etc/sudoers.d/kiosk`  
**Impacto**: Seguridad del sistema

### 4. Estandarizar CORS (5 min)
**Archivo**: `server/index.js`  
**Impacto**: Seguridad contra CSRF

### 5. Timeout en exec() (20 min)
**Archivo**: `server/index.js`  
**Impacto**: Estabilidad del sistema

---

## 🎯 CONCLUSIONES

### Puntos Fuertes
- Arquitectura bien separada (frontend/backend)
- Uso correcto de WebSocket para tiempo real
- Contextos bien implementados (Notifications, Parameters)
- Persistencia funcional en backend

### Áreas Críticas de Mejora
1. **Seguridad**: Prioridad máxima - validación y rate limiting
2. **Duplicación**: Centralizar lógica de conexión
3. **Estandarización**: API responses y error handling
4. **Permisos**: Limitar sudoers a comandos específicos

### Recomendación
**Implementar Fase 1 (Seguridad) de inmediato**, luego evaluar recursos para Fase 2 y 3.

---

**Documento generado**: Febrero 2026  
**Próxima revisión**: Después de implementar Fase 1
