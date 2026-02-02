import net from 'net'
import dgram from 'dgram'
import { SerialPort } from 'serialport'
import MAVLinkParser from './mavlink-parser.js'

// Servicio MAVLink para gestionar la comunicación con Ardupilot
class MAVLinkService {
  constructor() {
    this.connection = null
    this.isConnected = false
    this.parameters = new Map()
    this.paramCount = 0
    this.receivedParams = 0
    this.paramDownloadComplete = false // Bandera para evitar logs repetitivos
    this.pendingParamSet = null // Para rastrear PARAM_SET pendientes
    this.listeners = []
    this.connectionType = null
    this.serialPort = null
    this.tcpClient = null
    this.tcpServer = null
    this.udpSocket = null
    this.remoteAddress = null
    this.remotePort = null
    this.io = null // Socket.IO instance
    
    // Throttling para WebSocket (evitar saturar con actualizaciones)
    this.lastEmit = {
      vehicles: 0,
      parameters: 0
    }
    this.emitInterval = {
      vehicles: 100, // Emitir vehículos máximo cada 100ms (10 Hz)
      parameters: 500 // Emitir parámetros máximo cada 500ms (2 Hz)
    }
    
    // Parser de mensajes MAVLink
    this.parser = new MAVLinkParser()
    
    // Telemetría de múltiples vehículos (por system_id)
    this.vehicles = new Map()
    
    // Mensajes del sistema (STATUSTEXT y eventos)
    this.messages = []
    this.maxMessages = 100 // Mantener últimos 100 mensajes
  }

  // Configurar Socket.IO para emitir eventos en tiempo real
  setSocketIO(io) {
    this.io = io
    console.log('✅ Socket.IO configurado en MAVLink Service')
  }

  // Emitir actualización de vehículos por WebSocket (con throttling)
  emitVehiclesUpdate() {
    if (!this.io) return
    
    const now = Date.now()
    if (now - this.lastEmit.vehicles < this.emitInterval.vehicles) {
      return // Throttle: demasiado pronto
    }
    
    this.lastEmit.vehicles = now
    const vehicles = this.getAllVehicles()
    this.io.emit('vehicles_update', vehicles)
  }

  // Emitir actualización de estado de conexión
  emitConnectionStatus() {
    if (this.io) {
      this.io.emit('connection_status', this.getStatus())
    }
  }

  // Emitir nuevo mensaje del sistema
  emitMessage(message) {
    if (this.io) {
      this.io.emit('system_message', message)
    }
  }

  // Emitir actualización de parámetros (con throttling)
  emitParametersUpdate() {
    if (!this.io) return
    
    const now = Date.now()
    if (now - this.lastEmit.parameters < this.emitInterval.parameters) {
      return // Throttle: demasiado pronto
    }
    
    this.lastEmit.parameters = now
    this.io.emit('parameters_update', {
      count: this.paramCount,
      received: this.receivedParams,
      complete: this.paramDownloadComplete,
      progress: this.paramCount > 0 ? (this.receivedParams / this.paramCount) * 100 : 0
    })
  }

  // Método centralizado para enviar datos por cualquier canal (Serial, TCP, UDP)
  sendData(buffer) {
    if (!this.isConnected) {
      throw new Error('No hay conexión activa')
    }

    if (this.tcpClient) {
      // Enviar por TCP
      this.tcpClient.write(buffer)
    } else if (this.serialPort) {
      // Enviar por Serial
      this.serialPort.write(buffer)
    } else if (this.udpSocket && this.remoteAddress && this.remotePort) {
      // Enviar por UDP
      this.udpSocket.send(buffer, this.remotePort, this.remoteAddress)
    } else {
      throw new Error('No hay canal de comunicación disponible')
    }
  }

  // Conectar a la telemetría
  async connect(type, config) {
    try {
      // Desconectar cualquier conexión existente
      if (this.isConnected) {
        this.disconnect()
      }

      this.connectionType = type
      let connectionInfo = {}

      switch (type) {
        case 'tcp':
          connectionInfo = await this.connectTCP(config)
          break
        case 'serial':
          await this.connectSerial(config)
          break
        case 'wifi':
        case 'udp':
          await this.connectUDP(config)
          break
        default:
          throw new Error(`Tipo de conexión no soportado: ${type}`)
      }
      
      this.isConnected = true
      
      // Emitir cambio de estado de conexión
      this.emitConnectionStatus()
      
      return { 
        success: true, 
        message: 'Conectado exitosamente',
        ...connectionInfo
      }
    } catch (error) {
      console.error('Error conectando MAVLink:', error)
      this.isConnected = false
      return { success: false, message: error.message }
    }
  }

  // Conectar vía TCP
  async connectTCP(config) {
    return new Promise((resolve, reject) => {
      const { mode, ip, port } = config

      if (mode === 'Cliente') {
        // Modo Cliente: Conectar a un servidor TCP
        console.log(`MAVLink TCP: Conectando a ${ip}:${port}...`)
        
        this.tcpClient = new net.Socket()
        
        this.tcpClient.connect(parseInt(port), ip, () => {
          console.log(`MAVLink TCP: Conectado exitosamente a ${ip}:${port}`)
          this.isConnected = true
          resolve({ mode: 'client', hasClient: true })
        })

        this.tcpClient.on('data', (data) => {
          this.processMAVLinkData(data)
        })

        this.tcpClient.on('error', (error) => {
          console.error('MAVLink TCP: Error:', error.message)
          this.isConnected = false
          reject(error)
        })

        this.tcpClient.on('close', () => {
          console.log('MAVLink TCP: Conexión cerrada')
          this.isConnected = false
          this.vehicles.clear()
          this.emitVehiclesUpdate()
          this.emitConnectionStatus()
        })

      } else {
        // Modo Servidor: Escuchar conexiones TCP
        console.log(`MAVLink TCP: Iniciando servidor en puerto ${port}...`)
        
        this.tcpServer = net.createServer((socket) => {
          console.log('MAVLink TCP: Cliente conectado')
          this.tcpClient = socket
          this.isConnected = true

          socket.on('data', (data) => {
            this.processMAVLinkData(data)
          })
          socket.on('error', (error) => {
            console.error('MAVLink TCP: Error en socket:', error.message)
          })

          socket.on('close', () => {
            console.log('MAVLink TCP: Cliente desconectado')
            this.isConnected = false
            this.vehicles.clear()
            this.emitVehiclesUpdate()
            this.emitConnectionStatus()
          })
        })

        this.tcpServer.listen(parseInt(port), '0.0.0.0', () => {
          console.log(`MAVLink TCP: Servidor escuchando en 0.0.0.0:${port}`)
          resolve({ mode: 'server', hasClient: false, waitingForClient: true })
        })

        this.tcpServer.on('error', (error) => {
          console.error('MAVLink TCP: Error en servidor:', error.message)
          this.isConnected = false
          reject(error)
        })
      }
    })
  }

  // Conectar vía Serial (placeholder)
  async connectSerial(config) {
    const { port, baudrate, webSerialPort } = config || {}
    const baudRate = parseInt(baudrate ?? 115200, 10)

    // Resolver el path real cuando llega desde Web Serial (solo VID/PID descriptivo)
    let resolvedPath = port

    if (webSerialPort) {
      // Intentar mapear VID/PID a un path real usando serialport.list()
      const match = /VID:\s*([0-9a-fA-F]+).*PID:\s*([0-9a-fA-F]+)/.exec(port || '')
      if (match) {
        const vid = match[1].toLowerCase()
        const pid = match[2].toLowerCase()
        const available = await SerialPort.list()
        const found = available.find((p) => p.vendorId?.toLowerCase() === vid && p.productId?.toLowerCase() === pid)
        if (found?.path) {
          resolvedPath = found.path
          console.log(`MAVLink Serial: mapeado Web Serial ${port} -> ${resolvedPath}`)
        }
      }
    }

    if (!resolvedPath) {
      throw new Error('No se pudo determinar el puerto serial. Ingresa la ruta /dev/ttyXXX manualmente.')
    }

    return new Promise((resolve, reject) => {
      try {
        console.log(`MAVLink Serial: conectando a ${resolvedPath} @ ${baudRate}`)

        this.serialPort = new SerialPort({ path: resolvedPath, baudRate, autoOpen: false })

        // Apertura del puerto
        this.serialPort.open((err) => {
          if (err) {
            console.error('MAVLink Serial: error al abrir puerto:', err.message)
            this.serialPort = null
            return reject(err)
          }

          console.log(`MAVLink Serial: puerto abierto (${resolvedPath})`)
          this.isConnected = true
          this.connectionType = 'serial'
          this.emitConnectionStatus()

          resolve({ port: resolvedPath, baudRate })
        })

        // Datos entrantes
        this.serialPort.on('data', (data) => {
          this.processMAVLinkData(data)
        })

        // Errores del puerto
        this.serialPort.on('error', (error) => {
          console.error('MAVLink Serial: error en puerto:', error.message)
          this.isConnected = false
          this.emitConnectionStatus()
        })

        // Cierre inesperado
        this.serialPort.on('close', () => {
          console.log('MAVLink Serial: puerto cerrado')
          this.isConnected = false
          this.serialPort = null
          this.vehicles.clear()
          this.emitVehiclesUpdate()
          this.emitConnectionStatus()
        })
      } catch (error) {
        console.error('MAVLink Serial: excepción al conectar:', error)
        this.serialPort = null
        reject(error)
      }
    })
  }

  // Conectar vía UDP (placeholder)
  async connectUDP(config) {
    return new Promise((resolve, reject) => {
      const { localIp = '0.0.0.0', localPort = 14550, remoteIp, remotePort } = config || {}

      try {
        console.log(`MAVLink UDP: vinculando en ${localIp}:${localPort}`)
        this.udpSocket = dgram.createSocket('udp4')

        // Guardar destino (puede ser opcional si solo escuchamos)
        this.remoteAddress = remoteIp || this.remoteAddress
        this.remotePort = remotePort ? parseInt(remotePort) : this.remotePort

        this.udpSocket.on('message', (msg, rinfo) => {
          // Si no teníamos destino remoto, usar el que acaba de hablar
          if (!this.remoteAddress || !this.remotePort) {
            this.remoteAddress = rinfo.address
            this.remotePort = rinfo.port
          }
          this.processMAVLinkData(msg)
        })

        this.udpSocket.on('error', (err) => {
          console.error('MAVLink UDP: error en socket:', err.message)
          this.isConnected = false
          this.emitConnectionStatus()
          this.udpSocket?.close()
        })

        this.udpSocket.on('close', () => {
          console.log('MAVLink UDP: socket cerrado')
          this.isConnected = false
          this.udpSocket = null
          this.emitConnectionStatus()
        })

        this.udpSocket.bind(parseInt(localPort), localIp, () => {
          console.log(`MAVLink UDP: escuchando en ${localIp}:${localPort}`)
          this.isConnected = true
          this.connectionType = 'udp'
          this.emitConnectionStatus()
          resolve({ mode: 'udp', localIp, localPort, remoteIp: this.remoteAddress, remotePort: this.remotePort })
        })
      } catch (error) {
        console.error('MAVLink UDP: excepción al conectar:', error)
        this.udpSocket = null
        reject(error)
      }
    })
  }

  // Procesar datos MAVLink recibidos
  processMAVLinkData(data) {
    try {
      const messages = this.parser.parse(data)
      
      for (const msg of messages) {
        this.handleMessage(msg)
      }
    } catch (error) {
      console.error('Error procesando datos MAVLink:', error)
    }
  }

  // Manejar un mensaje MAVLink parseado
  handleMessage(msg) {
    const { msgId, sysId, compId, data } = msg

    // Verificar si es un vehículo (no GCS)
    if (msgId === 0) { // HEARTBEAT
      const isVehicle = this.parser.isVehicle(data.type)
      
      if (!isVehicle) {
        // Es un GCS/Mission Planner, ignorar
        return
      }
      
      // Inicializar vehículo si no existe
      if (!this.vehicles.has(sysId)) {
        this.vehicles.set(sysId, {
          systemId: sysId,
          type: data.type,
          autopilot: data.autopilot,
          base_mode: data.base_mode,
          custom_mode: data.custom_mode,
          flightMode: this.getFlightModeName(data.custom_mode, data.type),
          lastUpdate: Date.now(),
          connected: true
        })
        
        // Añadir mensaje de conexión
        this.addMessage({
          systemId: sysId,
          type: 'info',
          severity: 6,
          text: `Vehicle #${sysId} connected - Type: ${this.getVehicleTypeName(data.type)}`,
          timestamp: Date.now()
        })
        
        // Emitir actualización de vehículos
        this.emitVehiclesUpdate()
      }
      
      // Actualizar última vez visto y base_mode
      const vehicle = this.vehicles.get(sysId)
      vehicle.lastUpdate = Date.now()
      vehicle.connected = true
      vehicle.base_mode = data.base_mode
      vehicle.custom_mode = data.custom_mode
      vehicle.flightMode = this.getFlightModeName(data.custom_mode, vehicle.type)
    }

    // Procesar telemetría solo de vehículos conocidos
    if (this.vehicles.has(sysId)) {
      const vehicle = this.vehicles.get(sysId)
      
      switch (msgId) {
        case 1: // SYS_STATUS
          vehicle.battery_voltage = data.voltage_battery
          vehicle.battery_remaining = data.battery_remaining
          vehicle.current_battery = data.current_battery
          break
        
        case 24: // GPS_RAW_INT
          if (data.fix_type !== undefined) {
            vehicle.gps_fix_type = data.fix_type
            vehicle.fix_type = data.fix_type // Alias para TopBar
          }
          if (data.satellites_visible !== undefined) {
            vehicle.gps_satellites = data.satellites_visible
            vehicle.satellites_visible = data.satellites_visible // Alias para TopBar
          }
          if (data.fix_type >= 3) { // 3D Fix
            if (data.lat !== undefined) vehicle.lat = data.lat
            if (data.lon !== undefined) vehicle.lon = data.lon
            if (data.alt !== undefined) vehicle.gps_alt = data.alt
          }
          if (data.eph !== undefined) vehicle.gps_hdop = data.eph / 100
          if (data.epv !== undefined) vehicle.gps_vdop = data.epv / 100
          break
        
        case 33: // GLOBAL_POSITION_INT
          if (data.lat !== undefined) vehicle.lat = data.lat
          if (data.lon !== undefined) vehicle.lon = data.lon
          if (data.relative_alt !== undefined) vehicle.alt = data.relative_alt
          if (data.hdg !== undefined) {
            // hdg ya viene en grados (0-360)
            vehicle.heading = Math.round(data.hdg)
          }
          if (data.vx !== undefined) vehicle.vx = data.vx
          if (data.vy !== undefined) vehicle.vy = data.vy
          if (data.vz !== undefined) vehicle.vz = data.vz
          // Log para diagnóstico (solo primeros 5 para no saturar)
          if (!vehicle._gpiLogCount) vehicle._gpiLogCount = 0
          if (vehicle._gpiLogCount < 5) {
            vehicle._gpiLogCount++
          }
          break
        
        case 74: // VFR_HUD
          if (data.airspeed !== undefined) vehicle.airspeed = data.airspeed
          if (data.groundspeed !== undefined) vehicle.groundspeed = data.groundspeed
          if (data.heading !== undefined) {
            // Solo usar heading si está en rango válido (0-360)
            if (data.heading >= 0 && data.heading <= 360) {
              vehicle.heading = Math.round(data.heading)
            }
          }
          if (data.throttle !== undefined) vehicle.throttle = data.throttle
          if (data.climb !== undefined) vehicle.climb = data.climb
          if (data.alt !== undefined && !vehicle.alt) {
            vehicle.alt = data.alt
          }
          break
        
        case 30: // ATTITUDE
          vehicle.roll = data.roll
          vehicle.pitch = data.pitch
          vehicle.yaw = data.yaw
          break
        
        case 22: // PARAM_VALUE
          // Manejar parámetros
          if (!data.param_id) {
            break
          }
          
          if (data.param_count > 0 && this.paramCount === 0) {
            this.paramCount = data.param_count
            this.paramDownloadComplete = false
          }
          
          this.parameters.set(data.param_id, data.param_value)
          this.receivedParams = this.parameters.size
          
          // Emitir actualización de parámetros (con throttling)
          this.emitParametersUpdate()
          
          // Solo mostrar logs durante la descarga inicial
          if (!this.paramDownloadComplete) {
            // Log más frecuente para diagnóstico
            if (this.receivedParams <= 10 || this.receivedParams % 50 === 0 || this.receivedParams === this.paramCount) {
            }
            
            if (this.receivedParams === this.paramCount) {
              this.paramDownloadComplete = true
              // Emitir actualización final
              this.emitParametersUpdate()
            }
          }
          break
        
        case 253: // STATUSTEXT
          // Mensajes de texto del vehículo
          if (data.text) {
            const severity = data.severity || 6 // 6 = INFO por defecto
            const text = data.text.replace(/\0/g, '').trim() // Limpiar caracteres nulos
            
            if (text) {
              this.addMessage({
                systemId: sysId,
                type: this.getSeverityType(severity),
                severity: severity,
                text: text,
                timestamp: Date.now()
              })
            }
          }
          break
      }
      
      vehicle.lastUpdate = Date.now()
      
      // Emitir actualización de vehículos (con throttling)
      this.emitVehiclesUpdate()
    }
  }

  // Convertir severidad MAVLink a tipo de mensaje
  getSeverityType(severity) {
    // MAV_SEVERITY: 0=EMERGENCY, 1=ALERT, 2=CRITICAL, 3=ERROR, 4=WARNING, 5=NOTICE, 6=INFO, 7=DEBUG
    if (severity <= 2) return 'critical'
    if (severity === 3) return 'error'
    if (severity === 4) return 'warning'
    if (severity === 5) return 'notice'
    return 'info'
  }

  // Añadir mensaje al historial
  addMessage(message) {
    this.messages.unshift(message) // Añadir al principio
    
    // Limitar tamaño del array
    if (this.messages.length > this.maxMessages) {
      this.messages.pop()
    }
    
    console.log(`✅ [SysID ${message.systemId}] [${message.type.toUpperCase()}] ${message.text}`)
    
    // Emitir mensaje por WebSocket
    this.emitMessage(message)
  }

  // Obtener mensajes
  getMessages(systemId = null, limit = 50) {
    let messages = this.messages
    
    // Filtrar por systemId si se especifica
    if (systemId) {
      messages = messages.filter(m => m.systemId === systemId)
    }
    
    // Limitar cantidad
    return messages.slice(0, limit)
  }

  // Limpiar mensajes
  clearMessages(systemId = null) {
    if (systemId) {
      this.messages = this.messages.filter(m => m.systemId !== systemId)
    } else {
      this.messages = []
    }
  }

  // Iniciar simulación de telemetría (para desarrollo)
  startTelemetrySimulation() {
    // SITL por defecto se inicia en Canberra, Australia (-35.363261, 149.165230)
    const sitlHomeLat = -35.363261
    const sitlHomeLon = 149.165230
    
    setInterval(() => {
      if (this.isConnected) {
        // Simular telemetría del vehículo principal (solo 1 vehículo)
        this.updateVehicleTelemetry(1, {
          lat: sitlHomeLat + (Math.random() - 0.5) * 0.001,
          lon: sitlHomeLon + (Math.random() - 0.5) * 0.001,
          alt: 50 + Math.random() * 20,
          battery_voltage: 11.8 + Math.random() * 0.4,
          battery_remaining: 75 + Math.random() * 10,
          gps_satellites: 12 + Math.floor(Math.random() * 3),
          gps_fix_type: 3, // 3D Fix
          signal_strength: 85 + Math.random() * 10,
          groundspeed: 5 + Math.random() * 3,
          heading: Math.random() * 360
        })
      }
    }, 1000) // Actualizar cada segundo
  }

  // Actualizar telemetría de un vehículo
  updateVehicleTelemetry(systemId, telemetry) {
    const vehicle = this.vehicles.get(systemId) || {
      systemId,
      lastUpdate: Date.now(),
      connected: true
    }
    
    this.vehicles.set(systemId, {
      ...vehicle,
      ...telemetry,
      lastUpdate: Date.now()
    })
  }

  // Obtener telemetría de todos los vehículos
  getAllVehicles() {
    const now = Date.now()
    const vehicles = []
    
    this.vehicles.forEach((vehicle, systemId) => {
      // Marcar como desconectado si no hay datos en 5 segundos
      const connected = (now - vehicle.lastUpdate) < 5000
      vehicles.push({
        ...vehicle,
        connected
      })
    })
    
    return vehicles
  }

  // Obtener telemetría de un vehículo específico
  getVehicle(systemId) {
    return this.vehicles.get(systemId) || null
  }

  // Desconectar
  disconnect() {
    if (this.tcpClient) {
      this.tcpClient.destroy()
      this.tcpClient = null
    }

    if (this.serialPort) {
      try {
        this.serialPort.close()
      } catch (err) {
        console.error('MAVLink Serial: error cerrando puerto:', err.message)
      }
      this.serialPort = null
    }
    
    if (this.tcpServer) {
      this.tcpServer.close()
      this.tcpServer = null
    }
    
    if (this.udpSocket) {
      this.udpSocket.close()
      this.udpSocket = null
    }

    this.remoteAddress = null
    this.remotePort = null
    
    this.isConnected = false
    this.connection = null
    this.connectionType = null
    this.parameters.clear()
    this.vehicles.clear()
    
    // Resetear estado de parámetros
    this.paramCount = 0
    this.receivedParams = 0
    this.paramDownloadComplete = false
    
    // Limpiar mensajes del sistema
    this.messages = []
    
    // Emitir cambio de estado de conexión y vehículos vacíos
    this.emitConnectionStatus()
    this.emitVehiclesUpdate()
    
    console.log('🔌 MAVLink desconectado - estado resetado')
  }

  // Solicitar todos los parámetros del vehículo
  async requestParameters() {
    try {
      // Verificar que haya vehículos conectados o conexión TCP/UDP abierta
      const hasVehicles = this.vehicles.size > 0
      const hasConnection = this.tcpClient || this.udpSocket || this.serialPort
      
      if (!hasConnection) {
        throw new Error('No hay conexión activa con el vehículo. Establece una conexión en la sección de Conexiones.')
      }

      // Si no hay vehículos conectados, intentar de todas formas (el vehículo podría estar conectándose)
      if (!hasVehicles && !this.isConnected) {
        console.log('⏳ Esperando heartbeat del vehículo... retentando solicitud de parámetros')
        // Intentar de todas formas - el heartbeat podría llegar en breve
      }

      this.parameters.clear()
      this.receivedParams = 0
      this.paramCount = 0
      this.paramDownloadComplete = false
      
      // Construir y enviar mensaje PARAM_REQUEST_LIST
      const message = this.parser.buildParamRequestList(1, 1) // target_system=1, target_component=1
      
      this.sendData(message)
      console.log('MAVLink: Solicitando lista de parámetros')
      
      return { success: true, message: 'Esperando parámetros del vehículo...' }
    } catch (error) {
      console.error('Error solicitando parámetros:', error)
      return { success: false, message: error.message }
    }
  }

  // Cancelar descarga de parámetros (sin desconectar)
  cancelParameterDownload() {
    console.log('🛑 Cancelando descarga de parámetros (conexión mantiene activa)')
    this.paramDownloadComplete = true // Marcar como completo para detener procesamiento
    
    // Emitir estado final cancelado
    this.emitParametersUpdate()
    
    return { success: true, message: 'Descarga de parámetros cancelada' }
  }

  // Obtener todos los parámetros
  getParameters() {
    const params = {
      parameters: Array.from(this.parameters.entries()).map(([name, value]) => ({
        name,
        value,
        type: this.getParamType(value)
      })),
      total: this.paramCount,
      received: this.receivedParams,
      complete: this.paramCount > 0 && this.receivedParams === this.paramCount
    }
    // Log para diagnóstico
    if (params.parameters.length <= 5) {
      console.log(`📤 [getParameters] Devolviendo ${params.parameters.length} parámetros:`, params.parameters)
    }
    return params
  }

  // Actualizar un parámetro
  async setParameter(name, value) {
    try {
      if (!this.isConnected) {
        throw new Error('No hay conexión activa')
      }

      // Obtener el primer vehículo disponible
      const vehicle = Array.from(this.vehicles.values())[0]
      if (!vehicle) {
        throw new Error('No hay vehículos conectados')
      }

      console.log(`[${vehicle.systemId}] → PARAM_SET: ${name} = ${value}`)
      
      // Guardar el valor esperado para validación
      this.pendingParamSet = {
        name: name,
        expectedValue: parseFloat(value),
        timestamp: Date.now()
      }
      
      // Construir y enviar mensaje PARAM_SET (targetComponent=1 = autopilot)
      const paramSetMsg = this.parser.buildParamSet(name, parseFloat(value), vehicle.systemId, 1)
      this.sendData(paramSetMsg)
      
      // Esperar respuesta del vehículo
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Verificar si el parámetro fue actualizado
      const updatedValue = this.parameters.get(name)
      const expectedValue = parseFloat(value)
      
      // Limpiar pendingParamSet
      this.pendingParamSet = null
      
      // Para INT32, comparar valores enteros
      const isInt = Number.isInteger(expectedValue)
      const valuesMatch = isInt 
        ? Math.round(updatedValue) === Math.round(expectedValue)
        : Math.abs(updatedValue - expectedValue) < 0.01
      
      if (updatedValue !== undefined && valuesMatch) {
        console.log(`[${vehicle.systemId}] ← Confirmado: ${name} = ${updatedValue}`)
        return { success: true, message: 'Parámetro actualizado', value: updatedValue }
      } else {
        console.warn(`[${vehicle.systemId}] ✗ Rechazado: ${name} (esperado: ${expectedValue}, recibido: ${updatedValue})`)
        return { 
          success: false, 
          message: 'El vehículo rechazó el cambio. El puerto puede no estar disponible o el valor no es válido.',
          rejectedValue: expectedValue,
          actualValue: updatedValue
        }
      }
    } catch (error) {
      console.error('Error actualizando parámetro:', error)
      this.pendingParamSet = null
      return { success: false, message: error.message }
    }
  }

  // Calcular "signal strength" simulado basado en la calidad de la conexión
  calculateSignalStrength(vehicle) {
    // Basado en GPS fix type y satélites
    let strength = 0
    
    if (vehicle.gps_fix_type >= 3 && vehicle.gps_satellites) {
      strength = Math.min(100, (vehicle.gps_satellites / 15) * 100)
    }
    
    // Si tenemos datos recientes, buena señal
    const now = Date.now()
    const timeSinceUpdate = now - vehicle.lastUpdate
    if (timeSinceUpdate < 1000) {
      strength = Math.max(strength, 85)
    } else if (timeSinceUpdate < 3000) {
      strength = Math.max(strength, 60)
    }
    
    return Math.round(strength)
  }

  // ELIMINADO: simulateParameterDownload()
  // Ahora los parámetros vienen del vehículo real via PARAM_VALUE

  // Obtener telemetría de todos los vehículos
  getAllVehicles() {
    const now = Date.now()
    const vehicles = []
    
    this.vehicles.forEach((vehicle, systemId) => {
      // Marcar como desconectado si no hay datos en 5 segundos
      const connected = (now - vehicle.lastUpdate) < 5000
      
      // Calcular signal strength
      const signal_strength = this.calculateSignalStrength(vehicle)
      
      vehicles.push({
        ...vehicle,
        connected,
        signal_strength
      })
    })
    
    return vehicles
  }

  // Obtener telemetría de un vehículo específico
  getVehicle(systemId) {
    const vehicle = this.vehicles.get(systemId)
    if (!vehicle) return null
    
    const now = Date.now()
    const connected = (now - vehicle.lastUpdate) < 5000
    const signal_strength = this.calculateSignalStrength(vehicle)
    
    return {
      ...vehicle,
      connected,
      signal_strength
    }
  }

  // Determinar tipo de parámetro
  getParamType(value) {
    if (Number.isInteger(value)) {
      return 'INT'
    }
    return 'FLOAT'
  }

  // Enviar comandos MAVLink al vehículo
  async sendCommand(action, systemId) {
    if (!this.isConnected) {
      return { success: false, message: 'No hay conexión activa con el vehículo' }
    }

    const vehicle = this.vehicles.get(systemId)
    if (!vehicle) {
      return { success: false, message: `Vehículo ${systemId} no encontrado` }
    }

    // Verificar que el vehículo esté conectado
    const now = Date.now()
    const connected = (now - vehicle.lastUpdate) < 5000
    if (!connected) {
      return { success: false, message: 'El vehículo no está respondiendo' }
    }

    try {
      let buffer
      const targetSystem = systemId
      const targetComponent = 1 // MAV_COMP_ID_AUTOPILOT1

      switch (action) {
        case 'arm':
          // MAV_CMD_COMPONENT_ARM_DISARM (400)
          // Param1: 1 = arm, 0 = disarm
          // Param2: 21196 = forced arming (0 for normal checks)
          buffer = this.createCommandLong(
            targetSystem,
            targetComponent,
            400, // MAV_CMD_COMPONENT_ARM_DISARM
            1,   // arm
            0,   // no force (dejar que ArduPilot haga sus checks)
            0, 0, 0, 0, 0
          )
          break

        case 'disarm':
          // MAV_CMD_COMPONENT_ARM_DISARM (400)
          buffer = this.createCommandLong(
            targetSystem,
            targetComponent,
            400, // MAV_CMD_COMPONENT_ARM_DISARM
            0,   // disarm
            0,   // no force
            0, 0, 0, 0, 0
          )
          break

        default:
          return { success: false, message: `Comando no soportado: ${action}` }
      }

      // Enviar comando
      this.sendData(buffer)

      // Añadir mensaje del comando
      this.addMessage({
        systemId: systemId,
        type: 'notice',
        severity: 5,
        text: `Command sent: ${action.toUpperCase()}`,
        timestamp: Date.now()
      })

      return { success: true, message: 'Comando enviado correctamente' }
    } catch (error) {
      console.error('Error enviando comando:', error)
      return { success: false, message: error.message }
    }
  }

  // Cambiar modo de vuelo
  async setFlightMode(systemId, customMode) {
    if (!this.isConnected) {
      return { success: false, message: 'No hay conexión activa con el vehículo' }
    }

    const vehicle = this.vehicles.get(systemId)
    if (!vehicle) {
      return { success: false, message: `Vehículo ${systemId} no encontrado` }
    }

    // Verificar que el vehículo esté conectado
    const now = Date.now()
    const connected = (now - vehicle.lastUpdate) < 5000
    if (!connected) {
      return { success: false, message: 'El vehículo no está respondiendo' }
    }

    try {
      // MAV_CMD_DO_SET_MODE (176)
      // Param1: Mode (MAV_MODE)
      // Param2: Custom mode
      const buffer = this.createCommandLong(
        systemId,
        1, // MAV_COMP_ID_AUTOPILOT1
        176, // MAV_CMD_DO_SET_MODE
        1, // MAV_MODE_FLAG_CUSTOM_MODE_ENABLED
        customMode, // Custom mode number
        0, 0, 0, 0, 0
      )

      this.sendData(buffer)

      // Añadir mensaje
      const modeName = this.getFlightModeName(customMode, vehicle.type)
      this.addMessage({
        systemId: systemId,
        type: 'notice',
        severity: 5,
        text: `Flight mode changed to: ${modeName}`,
        timestamp: Date.now()
      })

      return { success: true, message: `Modo cambiado a ${modeName}` }
    } catch (error) {
      console.error('Error cambiando modo de vuelo:', error)
      return { success: false, message: error.message }
    }
  }

  // Crear mensaje COMMAND_LONG (MAVLink message ID 76)
  createCommandLong(targetSystem, targetComponent, command, param1, param2, param3, param4, param5, param6, param7) {
    const msgId = 76 // COMMAND_LONG
    const payload = Buffer.alloc(33)
    
    // Escribir parámetros (floats - 4 bytes cada uno)
    payload.writeFloatLE(param1, 0)
    payload.writeFloatLE(param2, 4)
    payload.writeFloatLE(param3, 8)
    payload.writeFloatLE(param4, 12)
    payload.writeFloatLE(param5, 16)
    payload.writeFloatLE(param6, 20)
    payload.writeFloatLE(param7, 24)
    
    // Escribir command (uint16 - 2 bytes)
    payload.writeUInt16LE(command, 28)
    
    // Escribir target_system (uint8 - 1 byte)
    payload.writeUInt8(targetSystem, 30)
    
    // Escribir target_component (uint8 - 1 byte)
    payload.writeUInt8(targetComponent, 31)
    
    // Escribir confirmation (uint8 - 1 byte)
    payload.writeUInt8(0, 32)
    
    // Crear header MAVLink v1
    const header = Buffer.alloc(6)
    header.writeUInt8(0xFE, 0) // STX (start byte)
    header.writeUInt8(payload.length, 1) // Length
    header.writeUInt8(0, 2) // Sequence
    header.writeUInt8(255, 3) // System ID (GCS)
    header.writeUInt8(190, 4) // Component ID (MAV_COMP_ID_MISSIONPLANNER)
    header.writeUInt8(msgId, 5) // Message ID
    
    // Calcular checksum
    const message = Buffer.concat([header, payload])
    const checksum = this.calculateChecksum(message.slice(1))
    
    // Mensaje completo
    return Buffer.concat([message, checksum])
  }

  // Calcular checksum MAVLink
  calculateChecksum(buffer) {
    let crc = 0xFFFF
    
    for (let i = 0; i < buffer.length; i++) {
      const tmp = buffer[i] ^ (crc & 0xFF)
      const tmp2 = (tmp ^ (tmp << 4)) & 0xFF
      crc = (crc >> 8) ^ (tmp2 << 8) ^ (tmp2 << 3) ^ (tmp2 >> 4)
      crc = crc & 0xFFFF
    }
    
    // CRC_EXTRA para COMMAND_LONG (msgId 76) = 152
    const crcExtra = 152
    const tmp = crcExtra ^ (crc & 0xFF)
    const tmp2 = (tmp ^ (tmp << 4)) & 0xFF
    crc = (crc >> 8) ^ (tmp2 << 8) ^ (tmp2 << 3) ^ (tmp2 >> 4)
    crc = crc & 0xFFFF
    
    const checksumBuffer = Buffer.alloc(2)
    checksumBuffer.writeUInt16LE(crc, 0)
    return checksumBuffer
  }

  // Estado de la conexión y descarga de parámetros
  getStatus() {
    return {
      connected: this.isConnected,
      hasClient: !!(this.tcpClient || this.udpSocket || this.serialPort),
      connectionType: this.connectionType,
      total: this.paramCount,
      received: this.receivedParams,
      complete: this.paramDownloadComplete && this.receivedParams === this.paramCount
    }
  }

  // Obtener nombre del tipo de vehículo
  getVehicleTypeName(type) {
    const types = {
      0: 'Generic',
      1: 'Fixed Wing',
      2: 'Quadrotor',
      3: 'Coaxial',
      4: 'Helicopter',
      5: 'Antenna Tracker',
      6: 'GCS',
      10: 'Ground Rover',
      11: 'Surface Boat',
      12: 'Submarine',
      13: 'Hexarotor',
      14: 'Octorotor',
      15: 'Tricopter',
      19: 'VTOL Duo Rotor',
      20: 'VTOL Quad Rotor',
      21: 'VTOL Tiltrotor'
    }
    return types[type] || `Unknown (${type})`
  }

  // Obtener nombre del modo de vuelo basado en custom_mode y tipo de vehículo
  // Enums de ArduPilot: https://mavlink.io/en/messages/ardupilotmega.html
  getFlightModeName(customMode, vehicleType) {
    // ArduPlane modes (MAV_TYPE_FIXED_WING = 1)
    if (vehicleType === 1) {
      const planeModes = {
        0: 'Manual',
        1: 'Circle',
        2: 'Stabilize',
        3: 'Training',
        4: 'Acro',
        5: 'FlyByWireA',
        6: 'FlyByWireB',
        7: 'Cruise',
        8: 'Autotune',
        10: 'Auto',
        11: 'RTL',
        12: 'Loiter',
        13: 'Takeoff',
        14: 'Avoid_ADSB',
        15: 'Guided',
        17: 'QStabilize',
        18: 'QHover',
        19: 'QLoiter',
        20: 'QLand',
        21: 'QRTL',
        22: 'QAutotune',
        23: 'QAcro',
        24: 'Thermal'
      }
      return planeModes[customMode] || `Unknown (${customMode})`
    }
    
    // ArduCopter modes (MAV_TYPE_QUADROTOR = 2, MAV_TYPE_HELICOPTER = 4, etc.)
    if ([2, 3, 4, 13, 14, 15].includes(vehicleType)) {
      const copterModes = {
        0: 'Stabilize',
        1: 'Acro',
        2: 'AltHold',
        3: 'Auto',
        4: 'Guided',
        5: 'Loiter',
        6: 'RTL',
        7: 'Circle',
        8: 'Position',
        9: 'Land',
        10: 'OF_Loiter',
        11: 'Drift',
        13: 'Sport',
        14: 'Flip',
        15: 'AutoTune',
        16: 'PosHold',
        17: 'Brake',
        18: 'Throw',
        19: 'Avoid_ADSB',
        20: 'Guided_NoGPS',
        21: 'Smart_RTL',
        22: 'FlowHold',
        23: 'Follow',
        24: 'ZigZag',
        25: 'SystemID',
        26: 'Heli_Autorotate',
        27: 'Auto_RTL'
      }
      return copterModes[customMode] || `Unknown (${customMode})`
    }
    
    // ArduRover modes (MAV_TYPE_GROUND_ROVER = 10)
    if (vehicleType === 10) {
      const roverModes = {
        0: 'Manual',
        1: 'Acro',
        2: 'Learning',
        3: 'Steering',
        4: 'Hold',
        5: 'Loiter',
        6: 'Follow',
        7: 'Simple',
        10: 'Auto',
        11: 'RTL',
        12: 'SmartRTL',
        15: 'Guided'
      }
      return roverModes[customMode] || `Unknown (${customMode})`
    }
    
    // Fallback para tipos desconocidos
    return `Mode ${customMode}`
  }
}

// Exportar instancia única
export default new MAVLinkService()
