# FPV Copilot GCS

Sistema de Control de Tierra (Ground Control Station) para Raspberry Pi Zero con interfaz estilo Android.

## 📋 Características

- **Backend**: Node.js + Express
- **Frontend**: React + Vite
- **Interfaz**: Diseño estilo Android con barra superior y área de contenido
- **Target**: Raspberry Pi Zero con salida HDMI fullscreen

## 🚀 Instalación

### Instalación de dependencias

```bash
# Instalar dependencias del backend y frontend
npm run install:all
```

## 💻 Desarrollo

Para ejecutar la aplicación en modo desarrollo:

```bash
# Iniciar backend y frontend simultáneamente
npm run dev
```

Esto iniciará:
- Backend en `http://localhost:3000`
- Frontend en `http://localhost:5173`

## 🏗️ Construcción para producción

```bash
# Construir el frontend
npm run build

# Iniciar el servidor en modo producción
NODE_ENV=production npm start
```

## 🥧 Configuración para Raspberry Pi Zero

### Requisitos previos

- Raspberry Pi Zero W/WH con Raspberry Pi OS
- Node.js 18 o superior instalado
- Conexión HDMI

### Instalación en Raspberry Pi

1. Clonar el repositorio:
```bash
git clone <repository-url>
cd FPVCopilotGCS
```

2. Instalar dependencias:
```bash
npm run install:all
```

3. Construir la aplicación:
```bash
npm run build
```

### Configuración de inicio automático

Para que la aplicación se inicie automáticamente en fullscreen al arrancar:

1. Crear un script de inicio:
```bash
sudo nano /etc/systemd/system/fpv-gcs.service
```

2. Agregar el siguiente contenido:
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

[Install]
WantedBy=multi-user.target
```

3. Habilitar y iniciar el servicio:
```bash
sudo systemctl enable fpv-gcs.service
sudo systemctl start fpv-gcs.service
```

### Configuración de Chromium en modo Kiosk

1. Editar el archivo de autostart:
```bash
sudo nano /etc/xdg/lxsession/LXDE-pi/autostart
```

2. Agregar estas líneas:
```bash
@xset s off
@xset -dpms
@xset s noblank
@chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble http://localhost:3000
```

## 📁 Estructura del proyecto

```
FPVCopilotGCS/
├── server/                 # Backend Node.js + Express
│   └── index.js           # Servidor principal
├── client/                # Frontend React + Vite
│   ├── src/
│   │   ├── components/    # Componentes React
│   │   │   ├── TopBar.jsx
│   │   │   └── MainContent.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
├── package.json           # Dependencias del backend
└── README.md
```

## 🎨 Interfaz

La aplicación cuenta con una interfaz inspirada en Android que incluye:

- **Barra superior**: Muestra el título de la aplicación, estado de conexión y hora actual
- **Área de contenido**: Panel con información del drone (estado, señal, batería, GPS)
- **Diseño responsivo**: Adaptable a diferentes tamaños de pantalla
- **Efectos visuales**: Glassmorphism y animaciones suaves

## 🛠️ Tecnologías utilizadas

- Node.js
- Express
- React 18
- Vite
- CSS3 (con efectos glassmorphism)

## 📝 Notas para desarrollo

- El backend sirve una API REST en `/api`
- El frontend se comunica con el backend a través de proxy en desarrollo
- En producción, Express sirve los archivos estáticos del build de React

## 🤝 Contribuir

Este proyecto está en desarrollo activo. Siéntete libre de sugerir mejoras o reportar issues.

## 📄 Licencia

MIT
