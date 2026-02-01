import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import mavlinkService from './mavlink-service.js';

const execPromise = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Configurar Socket.IO en mavlink-service
mavlinkService.setSocketIO(io);

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('🔌 Cliente WebSocket conectado:', socket.id);
  
  // Enviar estado actual al conectarse
  socket.emit('connection_status', mavlinkService.getStatus());
  socket.emit('vehicles_update', mavlinkService.getAllVehicles());
  
  socket.on('disconnect', () => {
    console.log('🔌 Cliente WebSocket desconectado:', socket.id);
  });
});

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'online',
    timestamp: new Date().toISOString(),
    mavlink: mavlinkService.getStatus()
  });
});

// MAVLink Connection Routes
app.post('/api/mavlink/connect', async (req, res) => {
  const { type, config } = req.body;
  const result = await mavlinkService.connect(type, config);
  res.json(result);
});

app.post('/api/mavlink/disconnect', (req, res) => {
  mavlinkService.disconnect();
  res.json({ success: true, message: 'Desconectado' });
});

// MAVLink Status Route - Estado actual de conexión
app.get('/api/mavlink/status', (req, res) => {
  const status = mavlinkService.getStatus()
  res.json(status)
});

// MAVLink Parameters Routes
app.get('/api/mavlink/parameters', (req, res) => {
  const params = mavlinkService.getParameters();
  res.json(params);
});

app.post('/api/mavlink/parameters/request', async (req, res) => {
  const result = await mavlinkService.requestParameters();
  res.json(result);
});

// Obtener estado de descarga de parámetros (para modal de progreso)
app.get('/api/mavlink/parameters/status', (req, res) => {
  const status = mavlinkService.getStatus()
  res.json(status)
})

app.post('/api/mavlink/parameters/set', async (req, res) => {
  const { name, value } = req.body;
  const result = await mavlinkService.setParameter(name, value);
  res.json(result);
});

// MAVLink Telemetry Routes
app.get('/api/mavlink/vehicles', (req, res) => {
  const vehicles = mavlinkService.getAllVehicles();
  res.json(vehicles);
});

app.get('/api/mavlink/vehicles/:systemId', (req, res) => {
  const systemId = parseInt(req.params.systemId);
  const vehicle = mavlinkService.getVehicle(systemId);
  
  if (vehicle) {
    res.json(vehicle);
  } else {
    res.status(404).json({ error: 'Vehículo no encontrado' });
  }
});

// MAVLink Command Routes
app.post('/api/mavlink/command/:action', async (req, res) => {
  const { action } = req.params;
  const { systemId } = req.body;
  
  try {
    const result = await mavlinkService.sendCommand(action, systemId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error ejecutando comando' 
    });
  }
});

// Cambiar modo de vuelo
app.post('/api/mavlink/flightmode', async (req, res) => {
  const { systemId, customMode } = req.body;
  
  try {
    const result = await mavlinkService.setFlightMode(systemId, customMode);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error cambiando modo de vuelo' 
    });
  }
});

// MAVLink Messages Routes
app.get('/api/mavlink/messages', (req, res) => {
  const { systemId, limit } = req.query;
  const messages = mavlinkService.getMessages(
    systemId ? parseInt(systemId) : null,
    limit ? parseInt(limit) : 50
  );
  res.json(messages);
});

app.delete('/api/mavlink/messages', (req, res) => {
  const { systemId } = req.query;
  mavlinkService.clearMessages(systemId ? parseInt(systemId) : null);
  res.json({ success: true, message: 'Mensajes eliminados' });
});

// System Information Routes
app.get('/api/system/info', async (req, res) => {
  try {
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime: os.uptime(),
      totalmem: os.totalmem(),
      freemem: os.freemem(),
      cpus: os.cpus(),
      loadavg: os.loadavg(),
      nodeVersion: process.version
    };

    // Obtener información adicional de Ubuntu
    try {
      const { stdout: osRelease } = await execPromise('cat /etc/os-release');
      const osInfo = {};
      osRelease.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          osInfo[key] = value.replace(/"/g, '');
        }
      });
      systemInfo.osRelease = osInfo;
    } catch (error) {
      systemInfo.osRelease = null;
    }

    res.json(systemInfo);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo información del sistema' });
  }
});

app.get('/api/system/display', async (req, res) => {
  try {
    const displayInfo = {};

    // Información de pantalla (DISPLAY, resolución)
    try {
      const { stdout: xrandr } = await execPromise('DISPLAY=:0 xrandr --query 2>/dev/null || echo "No display"');
      
      if (!xrandr.includes('No display')) {
        // Extraer información de resolución
        const resolutionMatch = xrandr.match(/(\d+)x(\d+)\s+\d+\.\d+\*?/);
        if (resolutionMatch) {
          displayInfo.resolution = {
            width: parseInt(resolutionMatch[1]),
            height: parseInt(resolutionMatch[2])
          };
        }
        
        // Extraer displays conectados
        const displays = [];
        const displayMatches = xrandr.matchAll(/^(\S+)\s+connected/gm);
        for (const match of displayMatches) {
          displays.push(match[1]);
        }
        displayInfo.connectedDisplays = displays;
      } else {
        displayInfo.error = 'No display available';
      }
    } catch (error) {
      displayInfo.error = error.message;
    }

    // Variables de entorno de display
    displayInfo.displayEnv = process.env.DISPLAY || 'Not set';

    res.json(displayInfo);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo información de pantalla' });
  }
});

app.get('/api/system/devices', async (req, res) => {
  try {
    const devices = {
      usb: [],
      serial: [],
      video: [],
      audio: []
    };

    // Dispositivos USB
    try {
      const { stdout: lsusb } = await execPromise('lsusb');
      devices.usb = lsusb.trim().split('\n').filter(line => line);
    } catch (error) {
      devices.usb = ['Error: ' + error.message];
    }

    // Puertos seriales
    try {
      const { stdout: serialPorts } = await execPromise('ls -1 /dev/tty{USB,ACM,S}* 2>/dev/null || echo "No serial devices"');
      devices.serial = serialPorts.trim().split('\n').filter(line => line && !line.includes('No serial'));
    } catch (error) {
      devices.serial = [];
    }

    // Dispositivos de video
    try {
      const { stdout: videoPorts } = await execPromise('ls -1 /dev/video* 2>/dev/null || echo "No video devices"');
      devices.video = videoPorts.trim().split('\n').filter(line => line && !line.includes('No video'));
    } catch (error) {
      devices.video = [];
    }

    // Dispositivos de audio
    try {
      const { stdout: audioPorts } = await execPromise('aplay -l 2>/dev/null || echo "No audio devices"');
      if (!audioPorts.includes('No audio')) {
        const audioLines = audioPorts.split('\n').filter(line => line.startsWith('card'));
        devices.audio = audioLines;
      }
    } catch (error) {
      devices.audio = [];
    }

    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo dispositivos' });
  }
});

app.get('/api/system/network', async (req, res) => {
  try {
    const networkInfo = {
      interfaces: {},
      hostname: os.hostname()
    };

    const interfaces = os.networkInterfaces();
    for (const [name, addrs] of Object.entries(interfaces)) {
      networkInfo.interfaces[name] = addrs.map(addr => ({
        family: addr.family,
        address: addr.address,
        netmask: addr.netmask,
        mac: addr.mac,
        internal: addr.internal
      }));
    }

    res.json(networkInfo);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo información de red' });
  }
});

// Touch Calibration Routes
app.get('/api/system/touch/devices', async (req, res) => {
  try {
    const devices = [];
    
    // Listar dispositivos de entrada
    try {
      const { stdout } = await execPromise('xinput list --short');
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        // Buscar dispositivos táctiles/pointer
        if (line.toLowerCase().includes('touch') || 
            line.toLowerCase().includes('touchscreen') ||
            line.toLowerCase().includes('pointer')) {
          // Extraer ID y nombre
          const idMatch = line.match(/id=(\d+)/);
          const nameMatch = line.match(/↳?\s*(.+?)\s+id=/);
          
          if (idMatch && nameMatch) {
            const id = idMatch[1];
            const name = nameMatch[1].trim();
            
            // Obtener propiedades del dispositivo
            try {
              const { stdout: props } = await execPromise(`xinput list-props ${id}`);
              const hasMatrix = props.includes('Coordinate Transformation Matrix');
              
              if (hasMatrix) {
                // Extraer matriz actual
                const matrixMatch = props.match(/Coordinate Transformation Matrix[^:]*:\s*([\d\.\-\s,]+)/);
                let matrix = null;
                if (matrixMatch) {
                  matrix = matrixMatch[1].trim().split(/[,\s]+/).map(parseFloat);
                }
                
                devices.push({ id, name, matrix });
              }
            } catch (propError) {
              console.error(`Error getting props for device ${id}:`, propError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error listing input devices:', error);
    }
    
    res.json({ devices });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo dispositivos táctiles' });
  }
});

app.post('/api/system/touch/calibrate', async (req, res) => {
  try {
    const { deviceId, matrix } = req.body;
    
    if (!deviceId || !matrix || !Array.isArray(matrix) || matrix.length !== 9) {
      return res.status(400).json({ 
        success: false, 
        error: 'Parámetros inválidos. Se requiere deviceId y matriz de 9 elementos' 
      });
    }
    
    // Aplicar la matriz de transformación
    const matrixStr = matrix.join(' ');
    const command = `DISPLAY=${process.env.DISPLAY || ':0'} xinput set-prop ${deviceId} "Coordinate Transformation Matrix" ${matrixStr}`;
    
    await execPromise(command);
    
    res.json({ 
      success: true, 
      message: 'Calibración aplicada correctamente',
      matrix 
    });
  } catch (error) {
    console.error('Error applying calibration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error aplicando calibración: ' + error.message 
    });
  }
});

app.post('/api/system/touch/save', async (req, res) => {
  try {
    const { deviceId, deviceName, matrix, disableId, reattachId, masterId } = req.body;
    
    if (!deviceId || !matrix || !Array.isArray(matrix) || matrix.length !== 9) {
      return res.status(400).json({ 
        success: false, 
        error: 'Parámetros inválidos' 
      });
    }
    
    const homeDir = os.homedir();
    const xinitrcPath = path.join(homeDir, '.xinitrc');
    
    // Leer archivo actual o crear uno nuevo
    let content = '';
    try {
      const { stdout } = await execPromise(`cat "${xinitrcPath}"`);
      content = stdout;
    } catch (error) {
      // Archivo no existe, crear uno nuevo
      content = '#!/bin/sh\n\n';
    }
    
    // Buscar y reemplazar/añadir sección de calibración táctil
    const calibrationComment = '# Touch calibration - Auto-generated by FPV Copilot GCS';
    const calibrationStartMarker = '# === START TOUCH CALIBRATION ===';
    const calibrationEndMarker = '# === END TOUCH CALIBRATION ===';
    
    // Construir nueva sección de calibración
    let calibrationSection = `${calibrationStartMarker}\n${calibrationComment}\n`;
    
    if (disableId) {
      calibrationSection += `xinput disable ${disableId}\n`;
    }
    
    if (reattachId && masterId) {
      calibrationSection += `xinput reattach ${reattachId} ${masterId}\n\n`;
    }
    
    // Formatear matriz en 3 líneas
    calibrationSection += `xinput set-prop ${deviceId} "Coordinate Transformation Matrix" \\\n`;
    calibrationSection += `  ${matrix[0].toFixed(2)} ${matrix[1].toFixed(2)} ${matrix[2].toFixed(2)} \\\n`;
    calibrationSection += `  ${matrix[3].toFixed(2)} ${matrix[4].toFixed(2)} ${matrix[5].toFixed(2)} \\\n`;
    calibrationSection += `  ${matrix[6].toFixed(2)} ${matrix[7].toFixed(2)} ${matrix[8].toFixed(2)}\n`;
    calibrationSection += `${calibrationEndMarker}\n`;
    
    // Verificar si ya existe una sección de calibración
    const startIdx = content.indexOf(calibrationStartMarker);
    const endIdx = content.indexOf(calibrationEndMarker);
    
    if (startIdx !== -1 && endIdx !== -1) {
      // Reemplazar sección existente
      content = content.substring(0, startIdx) + 
                calibrationSection + 
                content.substring(endIdx + calibrationEndMarker.length + 1);
    } else {
      // Añadir al final
      if (!content.endsWith('\n')) {
        content += '\n';
      }
      content += '\n' + calibrationSection;
    }
    
    // Guardar archivo
    const tmpFile = `/tmp/xinitrc-${Date.now()}`;
    await execPromise(`echo "${content.replace(/"/g, '\\"')}" > "${tmpFile}"`);
    await execPromise(`mv "${tmpFile}" "${xinitrcPath}"`);
    await execPromise(`chmod +x "${xinitrcPath}"`);
    
    res.json({ 
      success: true, 
      message: 'Calibración guardada en .xinitrc',
      path: xinitrcPath
    });
  } catch (error) {
    console.error('Error saving calibration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error guardando calibración: ' + error.message 
    });
  }
});

app.get('/api/system/touch/current', async (req, res) => {
  try {
    const homeDir = os.homedir();
    const xinitrcPath = path.join(homeDir, '.xinitrc');
    
    try {
      const { stdout } = await execPromise(`cat "${xinitrcPath}"`);
      
      // Extraer configuración actual
      const startMarker = '# === START TOUCH CALIBRATION ===';
      const endMarker = '# === END TOUCH CALIBRATION ===';
      const startIdx = stdout.indexOf(startMarker);
      const endIdx = stdout.indexOf(endMarker);
      
      if (startIdx !== -1 && endIdx !== -1) {
        const calibSection = stdout.substring(startIdx, endIdx + endMarker.length);
        res.json({ 
          exists: true, 
          content: calibSection,
          path: xinitrcPath
        });
      } else {
        res.json({ exists: false, path: xinitrcPath });
      }
    } catch (error) {
      res.json({ exists: false, path: xinitrcPath, error: 'Archivo no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error leyendo configuración' });
  }
});

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server ready`);
});
