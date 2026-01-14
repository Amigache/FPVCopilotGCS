import net from 'net'
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
    this.listeners = []
    this.connectionType = null
    this.tcpClient = null
    this.tcpServer = null
    this.udpSocket = null
    
    // Parser de mensajes MAVLink
    this.parser = new MAVLinkParser()
    
    // Telemetría de múltiples vehículos (por system_id)
    this.vehicles = new Map()
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
    // Aquí iría la implementación con serialport
    throw new Error('Conexión Serial en desarrollo')
  }

  // Conectar vía UDP (placeholder)
  async connectUDP(config) {
    // Aquí iría la implementación con dgram
    throw new Error('Conexión UDP en desarrollo')
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
          lastUpdate: Date.now(),
          connected: true
        })
      }
      
      // Actualizar última vez visto y base_mode
      const vehicle = this.vehicles.get(sysId)
      vehicle.lastUpdate = Date.now()
      vehicle.connected = true
      vehicle.base_mode = data.base_mode
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
          
          // Solo mostrar logs durante la descarga inicial
          if (!this.paramDownloadComplete) {
            // Log más frecuente para diagnóstico
            if (this.receivedParams <= 10 || this.receivedParams % 50 === 0 || this.receivedParams === this.paramCount) {
            }
            
            if (this.receivedParams === this.paramCount) {
              this.paramDownloadComplete = true
            }
          }
          break
      }
      
      vehicle.lastUpdate = Date.now()
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
    
    if (this.tcpServer) {
      this.tcpServer.close()
      this.tcpServer = null
    }
    
    if (this.udpSocket) {
      this.udpSocket.close()
      this.udpSocket = null
    }
    
    this.isConnected = false
    this.connection = null
    this.connectionType = null
    this.parameters.clear()
  }

  // Solicitar todos los parámetros del vehículo
  async requestParameters() {
    try {
      if (!this.isConnected) {
        throw new Error('No hay conexión activa')
      }

      // Verificar que haya un cliente para enviar datos
      const canSend = this.tcpClient || this.udpSocket
      if (!canSend) {
        throw new Error('No hay cliente de comunicación activo')
      }

      this.parameters.clear()
      this.receivedParams = 0
      this.paramCount = 0
      this.paramDownloadComplete = false
      
      // Construir y enviar mensaje PARAM_REQUEST_LIST
      const message = this.parser.buildParamRequestList(1, 1) // target_system=1, target_component=1
      
      if (this.tcpClient) {
        this.tcpClient.write(message)
        console.log('MAVLink: Solicitando lista de parámetros vía TCP')
      } else if (this.udpSocket) {
        // Para UDP se enviará más adelante
        throw new Error('Solicitud de parámetros vía UDP no implementada aún')
      }
      
      return { success: true, message: 'Esperando parámetros del vehículo...' }
    } catch (error) {
      console.error('Error solicitando parámetros:', error)
      return { success: false, message: error.message }
    }
  }

  // Obtener todos los parámetros
  getParameters() {
    return {
      parameters: Array.from(this.parameters.entries()).map(([name, value]) => ({
        name,
        value,
        type: this.getParamType(value)
      })),
      total: this.paramCount,
      received: this.receivedParams,
      complete: this.paramCount > 0 && this.receivedParams === this.paramCount
    }
  }

  // Actualizar un parámetro
  async setParameter(name, value) {
    try {
      if (!this.isConnected) {
        throw new Error('No hay conexión activa')
      }

      // TODO: Enviar PARAM_SET (msgid=23) al vehículo
      this.parameters.set(name, parseFloat(value))
      
      return { success: true, message: 'Parámetro actualizado' }
    } catch (error) {
      console.error('Error actualizando parámetro:', error)
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
      if (this.tcpClient) {
        this.tcpClient.write(buffer)
      } else if (this.udpSocket && this.remoteAddress) {
        this.udpSocket.send(buffer, this.remotePort, this.remoteAddress)
      } else {
        return { success: false, message: 'No hay canal de comunicación disponible' }
      }

      return { success: true, message: 'Comando enviado correctamente' }
    } catch (error) {
      console.error('Error enviando comando:', error)
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
      hasClient: !!(this.tcpClient || this.udpSocket),
      connectionType: this.connectionType,
      total: this.paramCount,
      received: this.receivedParams,
      complete: this.paramDownloadComplete && this.receivedParams === this.paramCount
    }
  }
}

// Exportar instancia única
export default new MAVLinkService()
