import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';
import mavlinkService from './mavlink-service.js';
import { 
  apiLimiter, 
  systemCommandLimiter, 
  wifiScanLimiter, 
  mavlinkConnectLimiter 
} from './middleware/rateLimiter.js';
import {
  validateMavlinkConnect,
  validateSaveConnections,
  validateActiveConnection,
  validateWifiConnect,
  validateWifiForget,
  validateSetParameter,
  validateFlightMode,
  validateMavlinkCommand
} from './middleware/validation.js';

const execPromise = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Configurar orígenes permitidos para CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? (origin, callback) => {
          // En producción, solo permitir mismo origen o whitelist
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        }
      : allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, '../data');
const CONNECTIONS_FILE = path.join(DATA_DIR, 'connections.json');

// Asegurar que el directorio de datos existe
if (!existsSync(DATA_DIR)) {
  await mkdir(DATA_DIR, { recursive: true });
}

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
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      }
    : allowedOrigins,
  credentials: true
}));
app.use(express.json());

// API Routes (sin rate limiting general - solo específico por endpoint crítico)

// API Routes
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'online',
    timestamp: new Date().toISOString(),
    mavlink: mavlinkService.getStatus()
  });
});

// MAVLink Connection Routes
app.post('/api/mavlink/connect', mavlinkConnectLimiter, validateMavlinkConnect, async (req, res) => {
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

// System power Routes
app.post('/api/system/reboot', systemCommandLimiter, (req, res) => {
  console.log('🔄 Reboot requested')
  res.json({ success: true, message: 'Rebooting system...' })
  // Ejecutar el comando después de enviar la respuesta con timeout
  setTimeout(() => {
    exec('sudo reboot', { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Error rebooting:', error)
        console.error('stderr:', stderr)
      }
      if (stdout) console.log('stdout:', stdout)
    })
  }, 500)
});

app.post('/api/system/shutdown', systemCommandLimiter, (req, res) => {
  console.log('⏻ Shutdown requested')
  res.json({ success: true, message: 'Shutting down system...' })
  // Ejecutar el comando después de enviar la respuesta con timeout
  setTimeout(() => {
    exec('sudo poweroff', { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Error shutting down:', error)
        console.error('stderr:', stderr)
      }
      if (stdout) console.log('stdout:', stdout)
    })
  }, 500)
});

// Connections persistence Routes
app.get('/api/connections', async (req, res) => {
  try {
    if (!existsSync(CONNECTIONS_FILE)) {
      return res.json({ connections: [], activeConnectionId: null });
    }
    const data = await readFile(CONNECTIONS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    res.json(parsed);
  } catch (error) {
    console.error('Error leyendo conexiones:', error);
    res.json({ connections: [], activeConnectionId: null });
  }
});

app.post('/api/connections', validateSaveConnections, async (req, res) => {
  try {
    const { connections, activeConnectionId } = req.body;
    await writeFile(CONNECTIONS_FILE, JSON.stringify({ connections, activeConnectionId }, null, 2));
    res.json({ success: true, message: 'Conexiones guardadas' });
  } catch (error) {
    console.error('Error guardando conexiones:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update only activeConnectionId
app.patch('/api/connections/active', validateActiveConnection, async (req, res) => {
  try {
    const { activeConnectionId } = req.body;
    let data = { connections: [], activeConnectionId: null };
    
    if (existsSync(CONNECTIONS_FILE)) {
      const fileData = await readFile(CONNECTIONS_FILE, 'utf-8');
      data = JSON.parse(fileData);
    }
    
    data.activeConnectionId = activeConnectionId;
    await writeFile(CONNECTIONS_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true, message: 'Conexión activa actualizada' });
  } catch (error) {
    console.error('Error actualizando conexión activa:', error);
    res.status(500).json({ success: false, message: error.message });
  }
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

app.post('/api/mavlink/parameters/set', validateSetParameter, async (req, res) => {
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
app.post('/api/mavlink/command/:action', validateMavlinkCommand, async (req, res) => {
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
app.post('/api/mavlink/flightmode', validateFlightMode, async (req, res) => {
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
      const { stdout: serialPorts } = await execPromise('bash -c "ls -1 /dev/tty{USB,ACM,AMA}* 2>/dev/null || true"');
      const ports = serialPorts.trim().split('\n').filter(p => p && p.startsWith('/dev/'));
      
      if (ports.length > 0) {
        const portsWithInfo = await Promise.all(ports.map(async (port) => {
          try {
            const { stdout: info } = await execPromise(`udevadm info --name=${port} 2>/dev/null || true`);
            const vendor = (info.match(/ID_VENDOR=(.+)/) || [])[1] || '';
            const model = (info.match(/ID_MODEL=(.+)/) || [])[1] || '';
            const vendorId = (info.match(/ID_VENDOR_ID=(.+)/) || [])[1] || '';
            const modelId = (info.match(/ID_MODEL_ID=(.+)/) || [])[1] || '';
            
            if (vendor && model) {
              return `${port} (${vendor} ${model})`;
            } else if (vendorId && modelId) {
              return `${port} (USB ${vendorId}:${modelId})`;
            }
            return port;
          } catch {
            return port;
          }
        }));
        devices.serial = portsWithInfo;
      } else {
        devices.serial = [];
      }
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

// Serial Ports Detection Route
app.get('/api/serial/ports', async (req, res) => {
  try {
    const { stdout } = await execPromise('bash -c "ls -1 /dev/tty{USB,ACM,AMA}* 2>/dev/null || true"');
    const ports = stdout.trim().split('\n').filter(p => p && p.length > 0);
    
    const portsInfo = await Promise.all(ports.map(async (port) => {
      try {
        const { stdout: info } = await execPromise(`udevadm info --name=${port} 2>/dev/null || true`);
        const vendor = (info.match(/ID_VENDOR=(.+)/) || [])[1] || '';
        const model = (info.match(/ID_MODEL=(.+)/) || [])[1] || '';
        const serial = (info.match(/ID_SERIAL_SHORT=(.+)/) || [])[1] || '';
        const vendorId = (info.match(/ID_VENDOR_ID=(.+)/) || [])[1] || '';
        const modelId = (info.match(/ID_MODEL_ID=(.+)/) || [])[1] || '';
        
        let description = port;
        if (vendor && model) {
          description = `${port} (${vendor} ${model})`;
        } else if (vendorId && modelId) {
          description = `${port} (USB ${vendorId}:${modelId})`;
        }
        
        return {
          path: port,
          description,
          vendor,
          model,
          serial,
          vendorId,
          modelId
        };
      } catch (err) {
        return {
          path: port,
          description: port,
          vendor: '',
          model: '',
          serial: '',
          vendorId: '',
          modelId: ''
        };
      }
    }));
    
    res.json({ success: true, ports: portsInfo });
  } catch (error) {
    console.error('Error listando puertos seriales:', error);
    res.json({ success: true, ports: [] });
  }
});

// WiFi Management Routes
app.get('/api/wifi/scan', wifiScanLimiter, async (req, res) => {
  try {
    // Intentar con nmcli primero (NetworkManager)
    try {
      // Primero forzar un rescan (requiere sudo)
      try {
        await execPromise('sudo nmcli dev wifi rescan', { timeout: 10000 });
        // Esperar suficiente tiempo para que complete el escaneo
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (rescanError) {
        // Ignorar errores de rescan, a veces falla pero el list funciona igual
        console.error('Rescan error:', rescanError.message);
      }

      const { stdout } = await execPromise('nmcli -t -f SSID,SIGNAL,SECURITY,IN-USE dev wifi list', { timeout: 10000 });
      
      const lines = stdout.trim().split('\n');
      
      const networks = lines
        .filter(line => line && line.trim())
        .map((line, index) => {
          const parts = line.split(':');
          const [ssid, signal, security, inUse] = parts;
          return {
            ssid: ssid || 'Hidden Network',
            signal: parseInt(signal) || 0,
            security: security || 'Open',
            connected: inUse === '*'
          };
        })
        .filter(network => network.ssid && network.ssid !== '--' && network.ssid !== 'SSID')
        // Eliminar duplicados y ordenar por señal
        .reduce((acc, curr) => {
          const exists = acc.find(n => n.ssid === curr.ssid);
          if (!exists || curr.signal > exists.signal) {
            return [...acc.filter(n => n.ssid !== curr.ssid), curr];
          }
          return acc;
        }, [])
        .sort((a, b) => b.signal - a.signal);
      
      res.json({ networks, method: 'nmcli' });
      return;
    } catch (nmcliError) {
      // Si nmcli falla, intentar con iwlist
      try {
        const { stdout } = await execPromise('sudo iwlist wlan0 scan 2>/dev/null');
        const networks = [];
        const cells = stdout.split('Cell ').slice(1);
        
        for (const cell of cells) {
          const ssidMatch = cell.match(/ESSID:"(.+?)"/);
          const signalMatch = cell.match(/Quality=(\d+)\/(\d+)/);
          const encryptionMatch = cell.match(/Encryption key:(on|off)/);
          
          if (ssidMatch) {
            const signal = signalMatch ? Math.round((parseInt(signalMatch[1]) / parseInt(signalMatch[2])) * 100) : 0;
            networks.push({
              ssid: ssidMatch[1],
              signal: signal,
              security: encryptionMatch && encryptionMatch[1] === 'on' ? 'WPA/WPA2' : 'Open',
              connected: false
            });
          }
        }
        
        res.json({ networks: networks.sort((a, b) => b.signal - a.signal), method: 'iwlist' });
        return;
      } catch (iwlistError) {
        throw new Error('No se pudo escanear redes WiFi. Verifica que NetworkManager o wireless-tools estén instalados.');
      }
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wifi/status', async (req, res) => {
  try {
    // Obtener estado de conexión actual
    try {
      const { stdout } = await execPromise('nmcli -t -f ACTIVE,SSID,SIGNAL,SECURITY dev wifi list');
      const lines = stdout.trim().split('\n');
      const connected = lines.find(line => line.startsWith('yes:'));
      
      if (connected) {
        const [, ssid, signal, security] = connected.split(':');
        res.json({
          connected: true,
          ssid,
          signal: parseInt(signal),
          security
        });
      } else {
        res.json({ connected: false });
      }
    } catch {
      res.json({ connected: false, error: 'No se pudo obtener estado WiFi' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wifi/connect', validateWifiConnect, async (req, res) => {
  try {
    const { ssid, password } = req.body;

    // Intentar conectar con nmcli
    try {
      let command;
      if (password) {
        command = `nmcli dev wifi connect "${ssid}" password "${password}"`;
      } else {
        command = `nmcli dev wifi connect "${ssid}"`;
      }
      
      const { stdout, stderr } = await execPromise(command, { timeout: 30000 });
      
      if (stderr && !stdout) {
        throw new Error(stderr);
      }
      
      res.json({ 
        success: true, 
        message: `Conectado a ${ssid}`,
        output: stdout
      });
    } catch (error) {
      throw new Error(`Error al conectar: ${error.message}`);
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.post('/api/wifi/disconnect', async (req, res) => {
  try {
    const { stdout } = await execPromise('nmcli dev disconnect wlan0');
    res.json({ 
      success: true, 
      message: 'Desconectado de WiFi',
      output: stdout
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.delete('/api/wifi/forget/:ssid', validateWifiForget, async (req, res) => {
  try {
    const { ssid } = req.params;
    const { stdout } = await execPromise(`nmcli connection delete "${ssid}"`, { timeout: 10000 });
    res.json({ 
      success: true, 
      message: `Red ${ssid} olvidada`,
      output: stdout
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`🔌 WebSocket server ready`);
});
