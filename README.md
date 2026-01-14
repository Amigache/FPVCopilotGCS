# FPV Copilot GCS

Ground Control Station (GCS) para drones FPV con soporte MAVLink, diseñado para ejecutarse en Raspberry Pi Zero con pantalla HDMI fullscreen (modo kiosk).

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
- **Modo kiosk**: Ejecución en pantalla completa sin escritorio

### 🎨 Interfaz de usuario

- **Top Bar**: Badges con información de vehículo, estado armado, señal, batería, GPS y telemetría
- **Sidebar**: Panel deslizante con información del vehículo y controles de acción
- **Mapa**: Vista principal con vehículos, posición y controles de navegación
- **Configuración**: Panel de ajustes con conexiones, parámetros y configuración general

## 🔧 Requisitos del sistema

### Hardware
- **Raspberry Pi Zero W/WH** (ARMv6) o superior
- Pantalla HDMI
- Conexión a autopiloto vía Serial/USB o red (TCP/UDP)

### Software
- **Raspberry Pi OS Lite** (sin escritorio, recomendado)
- Node.js 18.x o superior
- npm 9.x o superior

### ⚠️ Limitación importante de Raspberry Pi Zero

La Raspberry Pi Zero tiene un procesador **ARMv6** que **NO puede ejecutar Vite** (servidor de desarrollo):

- ❌ **NO puedes** ejecutar `npm run dev` en la Pi Zero
- ✅ **SÍ puedes** ejecutar en modo producción
- 📦 El **build debe hacerse** en tu máquina de desarrollo (x64/ARM64)

**Flujo de trabajo recomendado:**
1. Desarrolla en tu máquina con `npm run dev`
2. Haz el build con `npm run build`
3. Copia los archivos a la Pi Zero
4. Ejecuta en modo producción

## 🚀 Instalación

### En tu máquina de desarrollo

```bash
# 1. Clonar el repositorio
git clone https://github.com/Amigache/FPVCopilotGCS.git
cd FPVCopilotGCS

# 2. Instalar dependencias
npm run install:all

# 3. Ejecutar en modo desarrollo
npm run dev
```

Esto iniciará:
- **Backend**: `http://localhost:3000`
- **Frontend**: `http://localhost:5173` (con hot-reload)

### En Raspberry Pi Zero

**Opción 1: Copiar archivos manualmente**

En tu máquina de desarrollo:
```bash
# Hacer el build
npm run build

# Copiar a la Pi (ajusta la IP)
scp -r server client/dist package*.json usuario@192.168.1.100:~/FPVCopilotGCS/
```

En la Raspberry Pi:
```bash
cd ~/FPVCopilotGCS
npm install --omit=dev
NODE_ENV=production npm start
```

**Opción 2: Clonar y hacer build en otra máquina, luego copiar**

```bash
# En la Pi, solo clonar (sin build)
git clone https://github.com/Amigache/FPVCopilotGCS.git
cd FPVCopilotGCS
npm install --omit=dev

# Luego copiar la carpeta client/dist desde tu máquina
```

## 🖥️ Configuración modo Kiosk (Fullscreen sin escritorio)

Para ejecutar la aplicación en fullscreen por HDMI sin entorno de escritorio:

### Configuración automática (recomendado)

En la Raspberry Pi:
```bash
# Copiar el script de configuración
# (desde tu máquina: scp scripts/setup-kiosk-mode.sh usuario@pi:~/)

# Ejecutar el script
bash ~/setup-kiosk-mode.sh

# Asegurarte de tener el build del frontend
# (desde tu máquina: scp -r client/dist usuario@pi:~/FPVCopilotGCS/client/)

# Reiniciar
sudo reboot
```

El script automáticamente:
- ✅ Instala X server, **Netsurf** (navegador ultra-ligero) y utilidades mínimas
- ✅ Configura `.xinitrc` para iniciar solo el navegador
- ✅ Configura inicio automático en `.bash_profile`
- ✅ **Configura autologin en tty1** (crítico para inicio automático)
- ✅ Desactiva screensaver y ahorro de energía
- ✅ Oculta el cursor del mouse

**Nota**: Se usa **Netsurf** porque es el navegador más ligero disponible para Raspberry Pi Zero (ARMv6, 512MB RAM). Chromium es demasiado pesado y no funciona correctamente.

### Configuración manual

1. **Instalar dependencias mínimas:**
```bash
sudo apt update
sudo apt install -y --no-install-recommends xserver-xorg x11-xserver-utils xinit netsurf-gtk unclutter
```

**Nota**: Se usa Netsurf porque es ultra-ligero y funciona en Pi Zero. Chromium/Midori son demasiado pesados.

2. **Crear archivo `.xinitrc`:**
```bash
nano ~/.xinitrc
```

Agregar:
```bash
#!/bin/bash
xset -dpms
xset s off
xset s noblank
unclutter -idle 0 &

cd ~/FPVCopilotGCS
NODE_ENV=production npm start > ~/fpv-gcs.log 2>&1 &

sleep 15

netsurf-gtk -f http://localhost:3000
```

```bash
chmod +x ~/.xinitrc
```

3. **Configurar inicio automático:**
```bash
nano ~/.bash_profile
```

Agregar:
```bash
if [[ -z $DISPLAY ]] && [[ $(tty) = /dev/tty1 ]]; then
    startx
fi
```

4. **Configurar autologin en tty1:**
```bash
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d/
sudo nano /etc/systemd/system/getty@tty1.service.d/autologin.conf
```

Agregar:
```ini
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin tu_usuario --noclear %I $TERM
```

```bash
sudo systemctl daemon-reload
```

5. **Reiniciar:**
```bash
sudo reboot
```

Al reiniciar, verás **solo tu aplicación** en fullscreen. El SSH seguirá disponible.

## 🏗️ Scripts disponibles

```bash
npm run dev              # Desarrollo (solo en máquina de desarrollo)
npm run build            # Construir frontend para producción
npm start                # Iniciar servidor en producción
npm run install:all      # Instalar todas las dependencias
```

## 📡 Configuración de conexiones MAVLink

La aplicación soporta tres tipos de conexión:

### 1. Serial (USB/UART)
- **Puerto**: `/dev/ttyUSB0`, `/dev/ttyACM0`, `/dev/serial0`
- **Baudrate**: 57600, 115200, 921600

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
├── scripts/
│   └── setup-kiosk-mode.sh       # Script de configuración kiosk
├── server/
│   ├── index.js                  # Servidor Express
│   ├── mavlink-parser.js         # Parser MAVLink
│   └── mavlink-service.js        # Servicio MAVLink
├── client/
│   ├── src/
│   │   ├── components/           # Componentes React
│   │   ├── i18n/                 # Traducciones (en, es)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── dist/                     # Build de producción
│   └── package.json
├── package.json
└── README.md
```

## 🛠️ Stack tecnológico

### Backend
- Node.js + Express
- SerialPort (comunicación serial)
- net/dgram (TCP/UDP)

### Frontend
- React 18 + Vite
- react-leaflet (mapas)
- react-i18next (i18n)
- CSS3 con glassmorphism

### Protocolo
- MAVLink

## 🔍 Solución de problemas

### El servidor no inicia en la Pi
```bash
# Verificar logs
cat ~/fpv-gcs.log

# Verificar puerto 3000
sudo lsof -i :3000
```

### No se ven los cambios en la Pi
```bash
# Reconstruir en tu máquina
npm run build

# Copiar client/dist a la Pi
scp -r client/dist usuario@pi:~/FPVCopilotGCS/client/
```

### Pantalla en negro al iniciar
```bash
# Ver logs de X
cat ~/.local/share/xorg/Xorg.0.log

# Verificar que Netsurf esté instalado
which netsurf-gtk

# Verificar autologin
cat /etc/systemd/system/getty@tty1.service.d/autologin.conf

# Probar Netsurf manualmente desde SSH
DISPLAY=:0 netsurf-gtk http://localhost:3000 &
```

**Nota importante sobre Pi Zero**: La Raspberry Pi Zero tiene solo 512MB de RAM y un procesador ARMv6. Los navegadores modernos como Chromium pueden no funcionar correctamente. Si Netsurf tampoco funciona, considera usar una Raspberry Pi más potente (Pi 3/4/5) o acceder a la aplicación desde otro dispositivo.

### La aplicación no inicia automáticamente
```bash
# Verificar que estás en tty1 (no SSH)
tty

# Si no hay autologin configurado
sudo raspi-config
# System Options > Boot / Auto Login > Console Autologin

# O manualmente:
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d/
sudo nano /etc/systemd/system/getty@tty1.service.d/autologin.conf
# Agregar la configuración y reiniciar
```

### No se detectan puertos seriales
```bash
# Agregar usuario al grupo dialout
sudo usermod -a -G dialout $USER

# Reiniciar sesión o reboot
```

## 📝 Roadmap

- [ ] Implementar waypoints y misiones
- [ ] Comandos de vuelo (Takeoff, Land, RTL, Auto)
- [ ] Soporte para múltiples vehículos
- [ ] Grabación de telemetría
- [ ] Alertas visuales
- [ ] Temas personalizables

## 🤝 Contribuir

Las contribuciones son bienvenidas:

1. Fork el repositorio
2. Crea una rama (`git checkout -b feature/AmazingFeature`)
3. Commit (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

MIT License - ver [LICENSE](LICENSE)

## 👥 Autor

**Amigache** - [GitHub](https://github.com/Amigache)

---

**⚠️ Advertencia**: Proyecto en desarrollo. Prueba en simulador (SITL) antes de usar con hardware real.

