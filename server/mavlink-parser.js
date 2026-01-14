// Parser manual de mensajes MAVLink v1.0 y v2.0
// Documentación: https://mavlink.io/en/guide/serialization.html

// Constantes MAVLink
const MAVLINK_STX_V1 = 0xFE
const MAVLINK_STX_V2 = 0xFD

// IDs de mensajes MAVLink importantes
const MAV_MSG = {
  HEARTBEAT: 0,
  SYS_STATUS: 1,
  GPS_RAW_INT: 24,
  ATTITUDE: 30,
  GLOBAL_POSITION_INT: 33,
  RC_CHANNELS: 65,
  VFR_HUD: 74,
  PARAM_VALUE: 22,
  PARAM_REQUEST_LIST: 21,
  PARAM_REQUEST_READ: 20,
  PARAM_SET: 23
}

// Tipos de vehículos MAVLink
const MAV_TYPE = {
  MAV_TYPE_GENERIC: 0,
  MAV_TYPE_FIXED_WING: 1,
  MAV_TYPE_QUADROTOR: 2,
  MAV_TYPE_COAXIAL: 3,
  MAV_TYPE_HELICOPTER: 4,
  MAV_TYPE_ANTENNA_TRACKER: 5,
  MAV_TYPE_GCS: 6, // Ground Control Station
  MAV_TYPE_AIRSHIP: 7,
  MAV_TYPE_FREE_BALLOON: 8,
  MAV_TYPE_ROCKET: 9,
  MAV_TYPE_GROUND_ROVER: 10,
  MAV_TYPE_SURFACE_BOAT: 11,
  MAV_TYPE_SUBMARINE: 12,
  MAV_TYPE_HEXAROTOR: 13,
  MAV_TYPE_OCTOROTOR: 14,
  MAV_TYPE_TRICOPTER: 15,
  MAV_TYPE_FLAPPING_WING: 16,
  MAV_TYPE_KITE: 17,
  MAV_TYPE_ONBOARD_CONTROLLER: 18,
  MAV_TYPE_VTOL_DUOROTOR: 19,
  MAV_TYPE_VTOL_QUADROTOR: 20,
  MAV_TYPE_VTOL_TILTROTOR: 21
}

class MAVLinkParser {
  constructor() {
    this.buffer = Buffer.alloc(0)
    this.messages = []
    this.seq = 0 // Sequence number para mensajes salientes
  }

  // Construir mensaje PARAM_REQUEST_LIST (msgid=21)
  buildParamRequestList(targetSystem = 1, targetComponent = 1) {
    const payload = Buffer.alloc(2)
    payload.writeUInt8(targetSystem, 0)
    payload.writeUInt8(targetComponent, 1)
    
    return this.buildMessage(21, payload)
  }

  // Construir mensaje MAVLink v1
  buildMessage(msgId, payload, sysId = 255, compId = 190) {
    const payloadLen = payload.length
    const header = Buffer.alloc(6)
    
    header.writeUInt8(MAVLINK_STX_V1, 0) // STX
    header.writeUInt8(payloadLen, 1) // Payload length
    header.writeUInt8(this.seq++, 2) // Sequence
    if (this.seq > 255) this.seq = 0
    header.writeUInt8(sysId, 3) // System ID (255 = GCS)
    header.writeUInt8(compId, 4) // Component ID (190 = Ground Control)
    header.writeUInt8(msgId, 5) // Message ID
    
    // Calcular checksum
    const crc = this.calculateCRC(header.slice(1), payload, msgId)
    const checksum = Buffer.alloc(2)
    checksum.writeUInt16LE(crc, 0)
    
    return Buffer.concat([header, payload, checksum])
  }

  // Calcular CRC para MAVLink v1
  calculateCRC(header, payload, msgId) {
    // CRC-16/MCRF4XX inicial
    let crc = 0xFFFF
    
    // CRC del header (sin STX)
    for (let i = 0; i < header.length; i++) {
      this.crcAccumulate(header[i], crc)
      crc = this.crcResult
    }
    
    // CRC del payload
    for (let i = 0; i < payload.length; i++) {
      this.crcAccumulate(payload[i], crc)
      crc = this.crcResult
    }
    
    // CRC extra (CRC_EXTRA) - valores específicos por mensaje
    // Para PARAM_REQUEST_LIST (21) el CRC_EXTRA es 159
    const crcExtra = this.getCRCExtra(msgId)
    this.crcAccumulate(crcExtra, crc)
    
    return this.crcResult
  }

  crcAccumulate(byte, crcIn) {
    let tmp = byte ^ (crcIn & 0xFF)
    tmp = (tmp ^ (tmp << 4)) & 0xFF
    this.crcResult = ((crcIn >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF
  }

  getCRCExtra(msgId) {
    // Tabla de CRC_EXTRA para mensajes comunes
    const crcExtras = {
      0: 50,   // HEARTBEAT
      1: 124,  // SYS_STATUS
      21: 159, // PARAM_REQUEST_LIST
      22: 220, // PARAM_VALUE
      23: 168, // PARAM_SET
      24: 24,  // GPS_RAW_INT
      30: 39,  // ATTITUDE
      33: 104, // GLOBAL_POSITION_INT
      74: 20   // VFR_HUD
    }
    return crcExtras[msgId] || 0
  }

  // Determinar si un systemId es un vehículo (no GCS)
  isVehicle(mavType) {
    return mavType !== MAV_TYPE.MAV_TYPE_GCS && 
           mavType !== MAV_TYPE.MAV_TYPE_ONBOARD_CONTROLLER &&
           mavType !== MAV_TYPE.MAV_TYPE_ANTENNA_TRACKER
  }

  // Parsear buffer de datos
  parse(data) {
    // Agregar nuevos datos al buffer
    this.buffer = Buffer.concat([this.buffer, data])
    
    const messages = []
    
    // Intentar extraer mensajes completos
    while (this.buffer.length > 0) {
      const message = this.extractMessage()
      if (message) {
        messages.push(message)
      } else {
        break
      }
    }
    
    return messages
  }

  // Extraer un mensaje del buffer
  extractMessage() {
    if (this.buffer.length < 8) {
      return null // No hay suficientes datos
    }

    // Buscar STX (inicio de mensaje)
    let stxIndex = -1
    let version = 1
    
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i] === MAVLINK_STX_V1) {
        stxIndex = i
        version = 1
        break
      } else if (this.buffer[i] === MAVLINK_STX_V2) {
        stxIndex = i
        version = 2
        break
      }
    }

    if (stxIndex === -1) {
      // No se encontró STX, limpiar buffer
      this.buffer = Buffer.alloc(0)
      return null
    }

    // Descartar datos antes del STX
    if (stxIndex > 0) {
      this.buffer = this.buffer.slice(stxIndex)
    }

    // Verificar longitud mínima para el header
    if (this.buffer.length < (version === 1 ? 6 : 10)) {
      return null
    }

    // Parsear header
    let headerSize, payloadLength, msgId, sysId, compId
    
    if (version === 1) {
      // MAVLink v1: STX + len + seq + sysid + compid + msgid
      payloadLength = this.buffer[1]
      const seq = this.buffer[2]
      sysId = this.buffer[3]
      compId = this.buffer[4]
      msgId = this.buffer[5]
      headerSize = 6
    } else {
      // MAVLink v2: STX + len + incompat + compat + seq + sysid + compid + msgid(24bits)
      payloadLength = this.buffer[1]
      const incompatFlags = this.buffer[2]
      const compatFlags = this.buffer[3]
      const seq = this.buffer[4]
      sysId = this.buffer[5]
      compId = this.buffer[6]
      msgId = this.buffer[7] | (this.buffer[8] << 8) | (this.buffer[9] << 16)
      headerSize = 10
    }

    const messageLength = headerSize + payloadLength + (version === 1 ? 2 : 2) // +2 para checksum
    
    if (this.buffer.length < messageLength) {
      return null // Mensaje incompleto
    }

    // Extraer payload
    const payload = this.buffer.slice(headerSize, headerSize + payloadLength)
    
    // Avanzar el buffer
    this.buffer = this.buffer.slice(messageLength)

    // Parsear el mensaje según su ID
    const parsedMessage = this.parseMessage(msgId, sysId, compId, payload)
    
    return parsedMessage
  }

  // Parsear mensaje según su tipo
  parseMessage(msgId, sysId, compId, payload) {
    const message = {
      msgId,
      sysId,
      compId,
      data: {}
    }

    try {
      switch (msgId) {
        case MAV_MSG.HEARTBEAT:
          message.data = this.parseHeartbeat(payload)
          break
        
        case MAV_MSG.SYS_STATUS:
          message.data = this.parseSysStatus(payload)
          break
        
        case MAV_MSG.GPS_RAW_INT:
          message.data = this.parseGpsRawInt(payload)
          break
        
        case MAV_MSG.GLOBAL_POSITION_INT:
          message.data = this.parseGlobalPositionInt(payload)
          break
        
        case MAV_MSG.VFR_HUD:
          message.data = this.parseVfrHud(payload)
          break
        
        case MAV_MSG.ATTITUDE:
          message.data = this.parseAttitude(payload)
          break
        
        case MAV_MSG.PARAM_VALUE:
          message.data = this.parseParamValue(payload)
          break
        
        default:
          // Mensaje no soportado, solo devolvemos el ID
          message.data = { raw: payload }
      }
    } catch (error) {
      console.error(`Error parseando mensaje ${msgId}:`, error)
      message.data = { error: error.message }
    }

    return message
  }

  // HEARTBEAT (msgid=0)
  parseHeartbeat(payload) {
    if (payload.length < 9) return {}
    return {
      type: payload.readUInt8(4), // MAV_TYPE
      autopilot: payload.readUInt8(5),
      base_mode: payload.readUInt8(6),
      custom_mode: payload.readUInt32LE(0),
      system_status: payload.readUInt8(7),
      mavlink_version: payload.readUInt8(8)
    }
  }

  // SYS_STATUS (msgid=1)
  parseSysStatus(payload) {
    if (payload.length < 31) return {}
    return {
      voltage_battery: payload.readUInt16LE(18) / 1000.0, // mV a V
      current_battery: payload.readInt16LE(20) / 100.0, // cA a A
      battery_remaining: payload.readInt8(30) // %
    }
  }

  // GPS_RAW_INT (msgid=24)
  // Estructura MAVLink:
  // uint64 time_usec (offset 0, 8 bytes)
  // int32 lat (offset 8, 4 bytes) - grados * 1e7
  // int32 lon (offset 12, 4 bytes) - grados * 1e7
  // int32 alt (offset 16, 4 bytes) - mm sobre MSL
  // uint16 eph (offset 20, 2 bytes)
  // uint16 epv (offset 22, 2 bytes)
  // uint16 vel (offset 24, 2 bytes)
  // uint16 cog (offset 26, 2 bytes)
  // uint8 fix_type (offset 28, 1 byte)
  // uint8 satellites_visible (offset 29, 1 byte)
  // Total: 30 bytes
  parseGpsRawInt(payload) {
    if (payload.length < 30) return {}
    return {
      fix_type: payload.readUInt8(28),
      lat: payload.readInt32LE(8) / 1e7, // grados
      lon: payload.readInt32LE(12) / 1e7, // grados
      alt: payload.readInt32LE(16) / 1000.0, // mm a m
      satellites_visible: payload.readUInt8(29)
    }
  }

  // GLOBAL_POSITION_INT (msgid=33)
  // Estructura MAVLink:
  // uint32 time_boot_ms (offset 0, 4 bytes)
  // int32 lat (offset 4, 4 bytes) - grados * 1e7
  // int32 lon (offset 8, 4 bytes) - grados * 1e7
  // int32 alt (offset 12, 4 bytes) - mm sobre MSL
  // int32 relative_alt (offset 16, 4 bytes) - mm sobre terreno
  // int16 vx (offset 20, 2 bytes) - cm/s
  // int16 vy (offset 22, 2 bytes) - cm/s
  // int16 vz (offset 24, 2 bytes) - cm/s
  // uint16 hdg (offset 26, 2 bytes) - centidegrees
  // Total: 28 bytes
  parseGlobalPositionInt(payload) {
    if (payload.length < 28) return {}
    return {
      lat: payload.readInt32LE(4) / 1e7, // grados
      lon: payload.readInt32LE(8) / 1e7, // grados
      alt: payload.readInt32LE(12) / 1000.0, // mm a m
      relative_alt: payload.readInt32LE(16) / 1000.0, // mm a m
      vx: payload.readInt16LE(20) / 100.0, // cm/s a m/s
      vy: payload.readInt16LE(22) / 100.0,
      vz: payload.readInt16LE(24) / 100.0,
      hdg: payload.readUInt16LE(26) / 100.0 // centidegrees a degrees
    }
  }

  // VFR_HUD (msgid=74)
  parseVfrHud(payload) {
    if (payload.length < 20) {
      // Versión corta del mensaje - solo campos básicos
      if (payload.length >= 12) {
        return {
          airspeed: payload.readFloatLE(0),
          groundspeed: payload.readFloatLE(4),
          heading: payload.readInt16LE(8),
          throttle: payload.readUInt16LE(10)
        }
      }
      return {}
    }
    return {
      airspeed: payload.readFloatLE(0),
      groundspeed: payload.readFloatLE(4),
      heading: payload.readInt16LE(8),
      throttle: payload.readUInt16LE(10),
      alt: payload.readFloatLE(12),
      climb: payload.readFloatLE(16)
    }
  }

  // ATTITUDE (msgid=30)
  parseAttitude(payload) {
    if (payload.length < 28) return {}
    return {
      roll: payload.readFloatLE(4),
      pitch: payload.readFloatLE(8),
      yaw: payload.readFloatLE(12),
      rollspeed: payload.readFloatLE(16),
      pitchspeed: payload.readFloatLE(20),
      yawspeed: payload.readFloatLE(24)
    }
  }

  // PARAM_VALUE (msgid=22)
  // Estructura MAVLink:
  // float param_value (offset 0, 4 bytes)
  // uint16 param_count (offset 4, 2 bytes) 
  // uint16 param_index (offset 6, 2 bytes)
  // char[16] param_id (offset 8, 16 bytes)
  // uint8 param_type (offset 24, 1 byte)
  // Total: 25 bytes (pero puede ser 24 en algunas implementaciones)
  parseParamValue(payload) {
    if (payload.length < 24) {
      return {}
    }
    
    // Extraer el nombre del parámetro (16 bytes, null-terminated, offset 8-23)
    let paramId = ''
    for (let i = 8; i < 24; i++) {
      const char = payload.readUInt8(i)
      if (char === 0) break
      paramId += String.fromCharCode(char)
    }

    const result = {
      param_value: payload.readFloatLE(0),
      param_count: payload.readUInt16LE(4),
      param_index: payload.readUInt16LE(6),
      param_id: paramId
    }
    
    // param_type es opcional (solo si hay 25 bytes)
    if (payload.length >= 25) {
      result.param_type = payload.readUInt8(24)
    }
    
    return result
  }
}

export default MAVLinkParser
