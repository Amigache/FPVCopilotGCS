import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mavlinkService from './mavlink-service.js';

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
