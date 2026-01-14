# FPV Copilot GCS

Ground Control Station (GCS) para drones FPV con soporte MAVLink, diseñado para ejecutarse en Raspberry Pi Zero con interfaz táctil fullscreen.

## ✨ Características

### 🎯 Funcionalidades principales

- **Comunicación MAVLink**: Soporte completo para conexiones Serial, TCP y UDP
- **Telemetría en tiempo real**: Monitoreo de señal, batería, GPS, velocidad y más
- **Mapa interactivo**: 
  - Visualización con Leaflet (OpenStreetMap y vista satélite)
  - Seguimiento automático de vehículos
  - Marcadores direccionales con heading en tiempo real
  - Menú contextual para interacciones en el mapa
- **Control de vehículos**: Armado/desarmado con confirmaciones de seguridad
- **Gestión de parámetros**: Descarga, edición y carga de parámetros del vehículo
- **Interfaz táctil**: Teclado en pantalla para dispositivos touch
- **Multiidioma**: Soporte para Español e Inglés (i18n)
- **Auto-reconexión**: Conexión automática al iniciar la aplicación

### 🎨 Interfaz de usuario

- **Top Bar**: Badges con información de vehículo, estado armado, señal, batería, GPS y telemetría
- **Sidebar**: Panel deslizante con información del vehículo y controles de acción
- **Mapa**: Vista principal con vehículos, posición y controles de navegación
- **Configuración**: Panel de ajustes con conexiones, parámetros y configuración general

## 🔧 Requisitos del sistema

### Hardware
- Raspberry Pi Zero W/WH (o superior)
- Pantalla HDMI (opcional: táctil)
- Conexión a autopiloto vía Serial/USB o red (TCP/UDP)

### Software
- Node.js 18.x o superior
- npm 9.x o superior
- Sistema operativo Linux (Raspberry Pi OS recomendado)

## 🚀 Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/Amigache/FPVCopilotGCS.git
cd FPVCopilotGCS
```

### 2. Instalar dependencias

```bash
# Instalar todas las dependencias (backend + frontend)
npm run install:all
```

## 💻 Desarrollo

### Ejecutar en modo desarrollo

```bash
# Iniciar backend y frontend simultáneamente
npm run dev
```

Esto iniciará:
- **Backend**: `http://localhost:3000`
- **Frontend**: `http://localhost:5173` (con hot-reload)

### Scripts disponibles

```bash
npm run dev              # Ejecutar en modo desarrollo
npm run build            # Construir frontend para producción
npm start                # Iniciar servidor en producción
npm run install:all      # Instalar todas las dependencias
```

## 🏗️ Construcción para producción

```bash
# 1. Construir el frontend
npm run build

# 2. Iniciar el servidor en modo producción
NODE_ENV=production npm start
```

El servidor estará disponible en `http://localhost:3000`

## 🥧 Configuración para Raspberry Pi Zero

### Instalación en Raspberry Pi

1. **Preparar el sistema**:
```bash
# Actualizar el sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 18 (si no está instalado)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. **Clonar e instalar**:
```bash
cd ~
git clone https://github.com/Amigache/FPVCopilotGCS.git
cd FPVCopilotGCS
npm run install:all
npm run build
```

### Configuración de inicio automático

1. **Crear servicio systemd**:
```bash
sudo nano /etc/systemd/system/fpv-gcs.service
```

2. **Agregar configuración**:
```ini
[Unit]
Description=FPV Copilot GCS
After=network.target

[Service]
Environment=NODE_ENV=production
Type=simple
User=pi
WorkingDirectory=/home/pi/FPVCopilotGCS
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

3. **Habilitar servicio**:
```bash
sudo systemctl enable fpv-gcs.service
sudo systemctl start fpv-gcs.service
sudo systemctl status fpv-gcs.service
```

### Configuración de Chromium en modo Kiosk (Fullscreen)

1. **Editar autostart**:
```bash
sudo nano /etc/xdg/lxsession/LXDE-pi/autostart
```

2. **Agregar configuración**:
```bash
@xset s off
@xset -dpms
@xset s noblank
@chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disable-translate http://localhost:3000
```

3. **Reiniciar** para aplicar cambios:
```bash
sudo reboot
```

## 📡 Configuración de conexiones MAVLink

La aplicación soporta tres tipos de conexión:

### 1. Serial (USB/UART)
- **Puerto**: `/dev/ttyUSB0`, `/dev/ttyACM0`, `/dev/serial0`
- **Baudrate**: 57600, 115200, etc.

### 2. TCP
- **Modo Cliente**: Conectar a autopiloto como servidor
- **Modo Servidor**: Esperar conexión del autopiloto

### 3. UDP
- **Puerto local**: Puerto de escucha
- **Puerto remoto**: Puerto del autopiloto

Las conexiones se configuran en `Settings > Connections`

## 📁 Estructura del proyecto

```
FPVCopilotGCS/
├── .github/
│   └── copilot-instructions.md    # Instrucciones para GitHub Copilot
├── server/
│   ├── index.js                   # Servidor Express principal
│   ├── mavlink-parser.js          # Parser de mensajes MAVLink
│   └── mavlink-service.js         # Servicio de comunicación MAVLink
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── TopBar.jsx         # Barra superior con telemetría
│   │   │   ├── MainContent.jsx    # Mapa y controles principales
│   │   │   ├── Settings.jsx       # Panel de configuración
│   │   │   ├── Modal.jsx          # Modales de confirmación
│   │   │   ├── OnScreenKeyboard.jsx # Teclado en pantalla
│   │   │   └── settings/
│   │   │       ├── General.jsx    # Configuración general
│   │   │       ├── Connections.jsx # Gestión de conexiones
│   │   │       ├── Parameters.jsx # Gestión de parámetros
│   │   │       └── AboutUs.jsx    # Información del proyecto
│   │   ├── i18n/
│   │   │   ├── config.js          # Configuración i18next
│   │   │   └── locales/           # Traducciones (en, es)
│   │   ├── App.jsx                # Componente principal
│   │   └── main.jsx               # Punto de entrada
│   ├── index.html
│   ├── package.json
│   └── vite.config.js             # Configuración de Vite
├── package.json                   # Dependencias del backend
├── .gitignore
├── LICENSE
└── README.md
```

## 🛠️ Tecnologías utilizadas

### Backend
- **Node.js** - Runtime de JavaScript
- **Express** - Framework web
- **SerialPort** - Comunicación serial
- **net/dgram** - Sockets TCP/UDP

### Frontend
- **React 18** - Librería de UI
- **Vite** - Build tool y dev server
- **react-leaflet** - Integración de Leaflet en React
- **react-i18next** - Internacionalización
- **CSS3** - Estilos con glassmorphism

### Protocolo
- **MAVLink** - Protocolo de comunicación con autopiloto

## 🎮 Uso de la aplicación

### 1. Conectar al vehículo

1. Abrir `Settings` (⚙️)
2. Ir a `Connections`
3. Agregar nueva conexión o seleccionar una existente
4. Click en `Connect`

### 2. Visualizar telemetría

- **Top Bar**: Ver estado en tiempo real (señal, batería, GPS)
- **Mapa**: Seguir vehículo con marcador direccional
- **Sidebar**: Ver información detallada del vehículo

### 3. Controlar vehículo

En el sidebar:
- **Arm**: Armar motores (requiere confirmación)
- **Disarm**: Desarmar motores
- Más acciones próximamente (Takeoff, Land, RTL, etc.)

### 4. Gestionar parámetros

1. `Settings > Parameters`
2. `Download Parameters` para obtener del vehículo
3. Editar valores
4. `Upload Parameters` para cargar al vehículo

### 5. Menú contextual del mapa

- **Click derecho** en el mapa para:
  - Centrar mapa en ubicación
  - Agregar waypoint (próximamente)
  - Copiar coordenadas

## 🔍 Solución de problemas

### El servidor no inicia
```bash
# Verificar que el puerto 3000 esté libre
sudo lsof -i :3000

# Verificar permisos del puerto serial
sudo usermod -a -G dialout $USER
```

### No se detectan puertos seriales
```bash
# Listar puertos disponibles
ls -l /dev/tty*

# Verificar permisos
sudo chmod 666 /dev/ttyUSB0  # Reemplazar con tu puerto
```

### La interfaz no carga
```bash
# Reconstruir el frontend
cd client
npm run build
```

## 🤝 Contribuir

Las contribuciones son bienvenidas. Para contribuir:

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Roadmap

- [ ] Implementar waypoints y misiones
- [ ] Agregar modo Auto y comandos de vuelo (Takeoff, Land, RTL)
- [ ] Soporte para múltiples vehículos simultáneos
- [ ] Grabación y reproducción de telemetría
- [ ] Alertas y notificaciones visuales
- [ ] Mejoras en la interfaz táctil
- [ ] Temas personalizables

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## 👥 Autores

- **Amigache** - [GitHub](https://github.com/Amigache)

## 🙏 Agradecimientos

- Comunidad ArduPilot por la documentación de MAVLink
- Leaflet por el excelente sistema de mapas
- Comunidad open-source de FPV y drones

---

**⚠️ Advertencia**: Esta aplicación está en desarrollo activo. Siempre verifica los comandos antes de ejecutarlos en un vehículo real. Prueba primero en simulador (SITL).

