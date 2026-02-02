/**
 * API Client - Capa de servicios para comunicación con el backend
 * 
 * Centraliza todas las llamadas HTTP al backend para evitar duplicación
 * y facilitar el mantenimiento de endpoints.
 */

class APIClient {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
  }

  /**
   * Método base para realizar peticiones HTTP
   */
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
        // Log validation errors for debugging
        if (data.errors) {
          console.error(`Validation errors for ${endpoint}:`, data.errors);
        }
        throw new Error(data.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // ==================== MAVLink Endpoints ====================

  /**
   * Conectar a MAVLink
   * @param {string} type - Tipo de conexión: 'serial', 'tcp', 'udp'
   * @param {object} config - Configuración de conexión
   */
  async connectMAVLink(type, config) {
    return this.request('/api/mavlink/connect', {
      method: 'POST',
      body: JSON.stringify({ type, config })
    });
  }

  /**
   * Desconectar de MAVLink
   */
  async disconnectMAVLink() {
    return this.request('/api/mavlink/disconnect', {
      method: 'POST'
    });
  }

  /**
   * Obtener estado de conexión MAVLink
   */
  async getMAVLinkStatus() {
    return this.request('/api/mavlink/status');
  }

  /**
   * Obtener todos los vehículos detectados
   */
  async getVehicles() {
    return this.request('/api/mavlink/vehicles');
  }

  /**
   * Obtener información de un vehículo específico
   * @param {number} systemId - ID del sistema del vehículo
   */
  async getVehicle(systemId) {
    return this.request(`/api/mavlink/vehicles/${systemId}`);
  }

  /**
   * Enviar comando a vehículo
   * @param {string} action - Acción: 'arm', 'disarm', 'takeoff', 'land', 'rtl'
   * @param {number} systemId - ID del sistema (opcional)
   */
  async sendMAVLinkCommand(action, systemId = null) {
    return this.request(`/api/mavlink/command/${action}`, {
      method: 'POST',
      body: JSON.stringify({ systemId })
    });
  }

  /**
   * Cambiar modo de vuelo
   * @param {number} systemId - ID del sistema
   * @param {number} customMode - Modo de vuelo
   */
  async setFlightMode(systemId, customMode) {
    return this.request('/api/mavlink/flightmode', {
      method: 'POST',
      body: JSON.stringify({ systemId, customMode })
    });
  }

  // ==================== Parameters Endpoints ====================

  /**
   * Obtener parámetros del vehículo
   */
  async getParameters() {
    return this.request('/api/mavlink/parameters');
  }

  /**
   * Solicitar descarga de parámetros
   */
  async requestParameters() {
    return this.request('/api/mavlink/parameters/request', {
      method: 'POST'
    });
  }

  /**
   * Obtener estado de descarga de parámetros
   */
  async getParametersStatus() {
    return this.request('/api/mavlink/parameters/status');
  }

  /**
   * Establecer valor de un parámetro
   * @param {string} name - Nombre del parámetro
   * @param {number} value - Valor del parámetro
   */
  async setParameter(name, value) {
    return this.request('/api/mavlink/parameters/set', {
      method: 'POST',
      body: JSON.stringify({ name, value })
    });
  }

  // ==================== Messages Endpoints ====================

  /**
   * Obtener mensajes MAVLink
   * @param {number} systemId - ID del sistema (opcional)
   * @param {number} limit - Límite de mensajes (default: 50)
   */
  async getMessages(systemId = null, limit = 50) {
    const params = new URLSearchParams();
    if (systemId) params.append('systemId', systemId);
    if (limit) params.append('limit', limit);
    
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/mavlink/messages${query}`);
  }

  /**
   * Limpiar mensajes MAVLink
   * @param {number} systemId - ID del sistema (opcional)
   */
  async clearMessages(systemId = null) {
    const params = new URLSearchParams();
    if (systemId) params.append('systemId', systemId);
    
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/mavlink/messages${query}`, {
      method: 'DELETE'
    });
  }

  // ==================== Connections Endpoints ====================

  /**
   * Obtener todas las conexiones guardadas
   */
  async getConnections() {
    return this.request('/api/connections');
  }

  /**
   * Guardar conexiones
   * @param {array} connections - Lista de conexiones
   * @param {number} activeConnectionId - ID de conexión activa
   */
  async saveConnections(connections, activeConnectionId) {
    return this.request('/api/connections', {
      method: 'POST',
      body: JSON.stringify({ connections, activeConnectionId })
    });
  }

  /**
   * Actualizar solo la conexión activa
   * @param {number} activeConnectionId - ID de conexión activa
   */
  async updateActiveConnection(activeConnectionId) {
    return this.request('/api/connections/active', {
      method: 'PATCH',
      body: JSON.stringify({ activeConnectionId })
    });
  }

  // ==================== Serial Ports Endpoints ====================

  /**
   * Obtener puertos seriales disponibles
   */
  async getSerialPorts() {
    return this.request('/api/serial/ports');
  }

  // ==================== System Endpoints ====================

  /**
   * Obtener estado general del sistema
   */
  async getStatus() {
    return this.request('/api/status');
  }

  /**
   * Obtener información del sistema
   */
  async getSystemInfo() {
    return this.request('/api/system/info');
  }

  /**
   * Obtener información de pantalla
   */
  async getDisplayInfo() {
    return this.request('/api/system/display');
  }

  /**
   * Obtener dispositivos conectados
   */
  async getDevices() {
    return this.request('/api/system/devices');
  }

  /**
   * Obtener información de red
   */
  async getNetworkInfo() {
    return this.request('/api/system/network');
  }

  /**
   * Reiniciar el sistema
   */
  async rebootSystem() {
    return this.request('/api/system/reboot', {
      method: 'POST'
    });
  }

  /**
   * Apagar el sistema
   */
  async shutdownSystem() {
    return this.request('/api/system/shutdown', {
      method: 'POST'
    });
  }

  // ==================== WiFi Endpoints ====================

  /**
   * Escanear redes WiFi
   */
  async scanWiFi() {
    return this.request('/api/wifi/scan');
  }

  /**
   * Obtener estado de WiFi actual
   */
  async getWiFiStatus() {
    return this.request('/api/wifi/status');
  }

  /**
   * Conectar a red WiFi
   * @param {string} ssid - SSID de la red
   * @param {string} password - Contraseña (opcional para redes abiertas)
   */
  async connectWiFi(ssid, password = null) {
    const body = { ssid };
    if (password) body.password = password;
    
    return this.request('/api/wifi/connect', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  /**
   * Desconectar de WiFi
   */
  async disconnectWiFi() {
    return this.request('/api/wifi/disconnect', {
      method: 'POST'
    });
  }

  /**
   * Olvidar red WiFi
   * @param {string} ssid - SSID de la red a olvidar
   */
  async forgetWiFi(ssid) {
    return this.request(`/api/wifi/forget/${encodeURIComponent(ssid)}`, {
      method: 'DELETE'
    });
  }
}

// Exportar instancia única (singleton)
const apiClient = new APIClient();
export default apiClient;
