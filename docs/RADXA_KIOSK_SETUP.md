# Configuración de FPV Copilot GCS en Radxa Zero - Modo Kiosko

Guía completa para configurar la aplicación FPV Copilot GCS en una Radxa Zero con Ubuntu en modo kiosko fullscreen.

## 📋 Tabla de Contenidos

- [Requisitos del Sistema](#requisitos-del-sistema)
- [Instalación de Paquetes](#instalación-de-paquetes)
- [Configuración de Usuario Kiosk](#configuración-de-usuario-kiosk)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Instalación de la Aplicación](#instalación-de-la-aplicación)
- [Configuración del Modo Kiosko](#configuración-del-modo-kiosko)
- [Servicios Systemd](#servicios-systemd)
- [Configuración de Red](#configuración-de-red)
- [Calibración del Touchscreen](#calibración-del-touchscreen)
- [Permisos y Accesos](#permisos-y-accesos)
- [Comandos Útiles](#comandos-útiles)
- [Solución de Problemas](#solución-de-problemas)

---

## 🖥️ Requisitos del Sistema

### Hardware
- **Placa**: Radxa Zero o similar SBC
- **RAM**: Mínimo 2GB
- **Almacenamiento**: 8GB+ (recomendado 16GB+)
- **Display**: HDMI, resolución mínima 1024x600
- **Touchscreen** (opcional): Compatible USB (ej. eGalax TouchController)

### Software Base
- **OS**: Ubuntu 22.04+ (ARM64)
- **Kernel**: Linux 5.10+
- **Arquitectura**: ARM64/aarch64

---

## 📦 Instalación de Paquetes

### 1. Actualizar el Sistema

```bash
sudo apt update
sudo apt upgrade -y
```

### 2. Instalar Servidor X y Window Manager

```bash
sudo apt install -y \
  xorg \
  openbox \
  xinit \
  x11-xserver-utils \
  xinput
```

### 3. Instalar Chromium Browser

```bash
sudo snap install chromium
```

### 4. Instalar Node.js y npm

```bash
# Node.js 20.x (recomendado)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar instalación
node --version  # v20.x.x
npm --version   # 10.x.x
```

### 5. Instalar Dependencias del Sistema

```bash
sudo apt install -y \
  git \
  curl \
  wget \
  udev \
  udevadm \
  network-manager \
  build-essential
```

### 6. Instalar Herramientas Adicionales

```bash
# Para depuración y monitoreo
sudo apt install -y \
  htop \
  net-tools \
  lsof \
  jq
```

---

## 👤 Configuración de Usuario Kiosk

### 1. Crear Usuario Kiosk

```bash
sudo adduser kiosk
# Establecer contraseña cuando se solicite
```

### 2. Configurar Auto-login

Editar `/etc/systemd/system/getty@tty1.service.d/autologin.conf`:

```bash
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
sudo nano /etc/systemd/system/getty@tty1.service.d/autologin.conf
```

Contenido:

```ini
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin kiosk --noclear %I $TERM
```

### 3. Configurar Permisos Sudo (sin contraseña)

```bash
sudo visudo -f /etc/sudoers.d/kiosk
```

Añadir:

```
kiosk ALL=(ALL) NOPASSWD: ALL
```

### 4. Añadir Usuario a Grupos Necesarios

```bash
sudo usermod -aG dialout kiosk    # Acceso a puertos seriales
sudo usermod -aG video kiosk      # Acceso a dispositivos de video
sudo usermod -aG audio kiosk      # Acceso a audio
sudo usermod -aG input kiosk      # Acceso a dispositivos de entrada
```

---

## 📁 Estructura del Proyecto

```
/opt/FPVCopilotGCS/
├── server/
│   ├── index.js              # Backend Express + Socket.IO
│   ├── mavlink-service.js    # Servicio MAVLink
│   └── mavlink-parser.js     # Parser de mensajes MAVLink
├── client/
│   ├── src/                  # Código fuente React
│   ├── dist/                 # Build de producción (servido por backend)
│   ├── package.json
│   └── vite.config.js
├── scripts/
│   ├── init-touchscreen.sh   # Inicialización del touchscreen
│   └── setup-kiosk-mode.sh   # Script de configuración inicial
├── data/
│   └── connections.json      # Persistencia de conexiones MAVLink
├── docs/
│   └── RADXA_KIOSK_SETUP.md # Este documento
├── package.json              # Dependencias del backend
└── README.md
```

---

## 🚀 Instalación de la Aplicación

### 1. Clonar/Copiar el Repositorio

```bash
sudo mkdir -p /opt/FPVCopilotGCS
sudo chown kiosk:kiosk /opt/FPVCopilotGCS
cd /opt/FPVCopilotGCS
# Copiar archivos del proyecto aquí
```

### 2. Instalar Dependencias del Backend

```bash
cd /opt/FPVCopilotGCS
npm install
```

### 3. Instalar Dependencias del Frontend

```bash
cd /opt/FPVCopilotGCS/client
npm install
```

### 4. Construir el Frontend

```bash
cd /opt/FPVCopilotGCS/client
npm run build
```

Los archivos de producción se generarán en `client/dist/` y serán servidos por el backend.

---

## 🖼️ Configuración del Modo Kiosko

### 1. Configurar .xinitrc

Crear `/home/kiosk/.xinitrc`:

```bash
#!/bin/bash

# Inicializar touchscreen con calibración
/opt/FPVCopilotGCS/scripts/init-touchscreen.sh &

# Desactivar protector de pantalla y power management
xset s off
xset -dpms
xset s noblank

# Iniciar Openbox (window manager)
openbox &

# Esperar a que Openbox esté listo
sleep 2

# Iniciar Chromium en modo kiosko
exec chromium-browser \
  --kiosk \
  --start-fullscreen \
  --no-first-run \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-translate \
  http://localhost:3000
```

Dar permisos de ejecución:

```bash
chmod +x /home/kiosk/.xinitrc
```

### 2. Configurar Auto-start de X

Editar `/home/kiosk/.bash_profile`:

```bash
# Auto-start X si estamos en tty1
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  exec startx
fi
```

### 3. Script de Inicialización del Touchscreen

El archivo `/opt/FPVCopilotGCS/scripts/init-touchscreen.sh` ya debe estar presente con la calibración correcta:

```bash
#!/bin/bash
# Detecta y calibra automáticamente todos los dispositivos táctiles
# Matriz de calibración: 1.06 0 -0.03 0 1.15 -0.075 0 0 1
```

Dar permisos:

```bash
chmod +x /opt/FPVCopilotGCS/scripts/init-touchscreen.sh
```

---

## ⚙️ Servicios Systemd

### 1. Servicio del Backend

Crear `/etc/systemd/system/fpv-gcs.service`:

```ini
[Unit]
Description=FPV Copilot GCS Backend
After=network.target

[Service]
Type=simple
User=kiosk
WorkingDirectory=/opt/FPVCopilotGCS
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 2. Habilitar e Iniciar el Servicio

```bash
sudo systemctl daemon-reload
sudo systemctl enable fpv-gcs.service
sudo systemctl start fpv-gcs.service
```

### 3. Verificar Estado del Servicio

```bash
sudo systemctl status fpv-gcs.service
journalctl -u fpv-gcs.service -f  # Ver logs en tiempo real
```

---

## 🌐 Configuración de Red

### 1. Usar NetworkManager

Editar `/etc/netplan/30-wifis-dhcp.yaml`:

```yaml
network:
  version: 2
  renderer: NetworkManager
  wifis:
    wlan0:
      dhcp4: true
      optional: true
```

### 2. Configurar NetworkManager

Editar `/etc/NetworkManager/NetworkManager.conf`:

```ini
[main]
plugins=ifupdown,keyfile

[ifupdown]
managed=true

[device]
wifi.scan-rand-mac-address=no
```

### 3. Aplicar Cambios

```bash
sudo netplan apply
sudo systemctl restart NetworkManager
```

### 4. Verificar WiFi

```bash
nmcli dev wifi list
nmcli dev status
```

---

## 🖱️ Calibración del Touchscreen

### 1. Verificar Dispositivos Táctiles

```bash
DISPLAY=:0 xinput list | grep -i touch
```

Resultado esperado:
```
⎜   ↳ eGalax Inc. USB TouchController UNKNOWN   id=6    [slave  pointer  (2)]
⎜   ↳ eGalax Inc. USB TouchController           id=7    [slave  pointer  (2)]
```

### 2. Calibración Actual

La calibración óptima ya está configurada en `init-touchscreen.sh`:

```bash
# Matriz de calibración: X=6% expansion, Y=15% expansion
xinput set-prop <ID> "libinput Calibration Matrix" 1.06 0 -0.03 0 1.15 -0.075 0 0 1
```

### 3. Recalibrar Manualmente (si es necesario)

```bash
# Aplicar a ambos dispositivos (ID 6 y 7)
DISPLAY=:0 xinput set-prop 6 "libinput Calibration Matrix" 1.06 0 -0.03 0 1.15 -0.075 0 0 1
DISPLAY=:0 xinput set-prop 7 "libinput Calibration Matrix" 1.06 0 -0.03 0 1.15 -0.075 0 0 1
```

### 4. Verificar Calibración

```bash
DISPLAY=:0 xinput list-props 6 | grep "Calibration Matrix"
```

---

## 🔐 Permisos y Accesos

### 1. Puertos Seriales

El usuario `kiosk` debe estar en el grupo `dialout`:

```bash
sudo usermod -aG dialout kiosk
# Cerrar sesión y volver a iniciar para aplicar
```

Verificar acceso:

```bash
ls -la /dev/ttyACM0
# Debe mostrar: crw-rw---- 1 root dialout
```

### 2. Persistencia de Datos

El directorio `/opt/FPVCopilotGCS/data/` almacena:
- `connections.json`: Conexiones MAVLink guardadas

Verificar permisos:

```bash
sudo chown -R kiosk:kiosk /opt/FPVCopilotGCS/data/
chmod 755 /opt/FPVCopilotGCS/data/
```

### 3. Acceso a Comandos de Sistema

El archivo `/etc/sudoers.d/kiosk` permite al usuario ejecutar:
- `sudo reboot`
- `sudo poweroff`
- `nmcli` (NetworkManager sin sudo)

---

## 🛠️ Comandos Útiles

### Backend

```bash
# Ver logs del backend
journalctl -u fpv-gcs.service -f

# Reiniciar backend
sudo systemctl restart fpv-gcs.service

# Estado del backend
sudo systemctl status fpv-gcs.service
```

### Frontend

```bash
# Reconstruir frontend después de cambios
cd /opt/FPVCopilotGCS/client
npm run build

# Backend recarga automáticamente los archivos del dist/
```

### Sistema

```bash
# Reiniciar X (desde terminal remoto)
sudo systemctl restart getty@tty1

# Ver procesos de Chromium
ps aux | grep chromium

# Matar sesión X
DISPLAY=:0 killall Xorg

# Ver información del sistema
cat /etc/os-release
uname -a
```

### Touchscreen

```bash
# Reinicializar touchscreen
DISPLAY=:0 /opt/FPVCopilotGCS/scripts/init-touchscreen.sh

# Ver log del touchscreen
tail -f /home/kiosk/touchscreen.log
```

### Red

```bash
# Escanear WiFi
nmcli dev wifi list

# Conectar a WiFi
sudo nmcli dev wifi connect "SSID" password "PASSWORD"

# Ver conexiones guardadas
nmcli connection show

# Estado de NetworkManager
systemctl status NetworkManager
```

---

## 🔍 Solución de Problemas

### Problema: Pantalla en negro al iniciar

**Causa**: X no inicia correctamente

**Solución**:
```bash
# Ver logs de X
cat /home/kiosk/.local/share/xorg/Xorg.0.log

# Verificar .xinitrc
cat /home/kiosk/.xinitrc

# Probar iniciar X manualmente
startx
```

### Problema: Touchscreen no funciona

**Causa**: Dispositivo no detectado o calibración incorrecta

**Solución**:
```bash
# Verificar dispositivos
DISPLAY=:0 xinput list

# Ver log de inicialización
cat /home/kiosk/touchscreen.log

# Reinicializar touchscreen
DISPLAY=:0 /opt/FPVCopilotGCS/scripts/init-touchscreen.sh
```

### Problema: Backend no inicia

**Causa**: Puertos en uso, dependencias faltantes

**Solución**:
```bash
# Ver logs
journalctl -u fpv-gcs.service -n 50

# Verificar puerto 3000
sudo lsof -i :3000

# Verificar dependencias
cd /opt/FPVCopilotGCS
npm install
```

### Problema: No se detectan puertos seriales

**Causa**: Permisos insuficientes

**Solución**:
```bash
# Verificar grupos del usuario
groups kiosk

# Añadir a dialout si falta
sudo usermod -aG dialout kiosk

# Listar dispositivos
ls -la /dev/ttyACM* /dev/ttyUSB*
```

### Problema: WiFi no funciona

**Causa**: NetworkManager no gestiona wlan0

**Solución**:
```bash
# Verificar NetworkManager
nmcli dev status

# Editar netplan
sudo nano /etc/netplan/30-wifis-dhcp.yaml
# Asegurar: renderer: NetworkManager

# Aplicar cambios
sudo netplan apply
sudo systemctl restart NetworkManager
```

### Problema: Conexiones no persisten tras reinicio

**Causa**: Archivo connections.json no accesible

**Solución**:
```bash
# Verificar archivo
cat /opt/FPVCopilotGCS/data/connections.json

# Verificar permisos
ls -la /opt/FPVCopilotGCS/data/

# Corregir permisos
sudo chown kiosk:kiosk /opt/FPVCopilotGCS/data/connections.json
```

---

## 📝 Notas Adicionales

### Actualizar la Aplicación

```bash
cd /opt/FPVCopilotGCS

# Backend
npm install
sudo systemctl restart fpv-gcs.service

# Frontend
cd client
npm install
npm run build
# El backend recarga automáticamente
```

### Backup de Configuración

```bash
# Backup de conexiones
cp /opt/FPVCopilotGCS/data/connections.json ~/connections_backup.json

# Backup de configuración completa
tar -czf ~/fpv-gcs-backup.tar.gz \
  /opt/FPVCopilotGCS/data/ \
  /home/kiosk/.xinitrc \
  /home/kiosk/.bash_profile
```

### Acceso Remoto (SSH)

```bash
# Instalar SSH si no está
sudo apt install openssh-server

# Conectar remotamente
ssh kiosk@<IP_RADXA>
```

### Logs Importantes

- **Backend**: `journalctl -u fpv-gcs.service -f`
- **X Server**: `/home/kiosk/.local/share/xorg/Xorg.0.log`
- **Touchscreen**: `/home/kiosk/touchscreen.log`
- **Sistema**: `journalctl -f`

---

## ✅ Checklist de Instalación Completa

- [ ] Ubuntu instalado y actualizado
- [ ] Paquetes del sistema instalados (X, Openbox, Node.js, Chromium)
- [ ] Usuario `kiosk` creado con auto-login
- [ ] Permisos sudo configurados
- [ ] Usuario añadido a grupos (dialout, video, audio, input)
- [ ] Proyecto copiado a `/opt/FPVCopilotGCS/`
- [ ] Dependencias instaladas (backend y frontend)
- [ ] Frontend construido (`npm run build`)
- [ ] Servicio systemd creado y habilitado
- [ ] `.xinitrc` configurado
- [ ] `.bash_profile` configurado con auto-start X
- [ ] NetworkManager configurado
- [ ] Touchscreen calibrado
- [ ] Conexión de prueba funcionando
- [ ] Sistema reiniciado y verificado

---

**Versión**: 1.0  
**Fecha**: Febrero 2026  
**Plataforma**: Radxa Zero / Ubuntu 22.04 ARM64
