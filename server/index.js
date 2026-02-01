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

// WiFi Management Routes
app.get('/api/wifi/scan', async (req, res) => {
  try {
    // Intentar con nmcli primero (NetworkManager)
    try {
      const { stdout } = await execPromise('nmcli -t -f SSID,SIGNAL,SECURITY,IN-USE dev wifi list');
      console.log('WiFi scan output:', stdout);
      
      const lines = stdout.trim().split('\n');
      console.log('Total lines:', lines.length);
      
      const networks = lines
        .filter(line => line && line.trim())
        .map((line, index) => {
          const parts = line.split(':');
          console.log(`Line ${index}:`, parts);
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
      
      console.log('Processed networks:', networks.length);
      res.json({ networks, method: 'nmcli', debug: { totalLines: lines.length, processedNetworks: networks.length } });
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

app.post('/api/wifi/connect', async (req, res) => {
  try {
    const { ssid, password } = req.body;
    
    if (!ssid) {
      return res.status(400).json({ success: false, message: 'SSID requerido' });
    }

    // Intentar conectar con nmcli
    try {
      let command;
      if (password) {
        command = `nmcli dev wifi connect "${ssid}" password "${password}"`;
      } else {
        command = `nmcli dev wifi connect "${ssid}"`;
      }
      
      const { stdout, stderr } = await execPromise(command);
      
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

app.delete('/api/wifi/forget/:ssid', async (req, res) => {
  try {
    const { ssid } = req.params;
    const { stdout } = await execPromise(`nmcli connection delete "${ssid}"`);
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

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server ready`);
});
