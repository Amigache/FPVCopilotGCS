#!/bin/bash

# Script para configurar Raspberry Pi Zero en modo kiosk (solo navegador)
# Ejecutar en la Raspberry Pi: bash setup-kiosk-mode.sh

set -e

echo "🚀 Configurando Raspberry Pi Zero en modo kiosk..."
echo ""

# Obtener el usuario actual
CURRENT_USER=$(whoami)
HOME_DIR="/home/$CURRENT_USER"

# 1. Instalar dependencias mínimas
echo "📦 Instalando dependencias (esto puede tardar varios minutos)..."
sudo apt update
sudo apt install -y --no-install-recommends \
    xserver-xorg \
    x11-xserver-utils \
    xinit \
    midori \
    unclutter

echo "✅ Dependencias instaladas"
echo ""

# 2. Crear .xinitrc
echo "📝 Creando archivo .xinitrc..."
cat > "$HOME_DIR/.xinitrc" << 'EOF'
#!/bin/bash

# Desactivar ahorro de energía y screensaver
xset -dpms
xset s off
xset s noblank

# Ocultar cursor del mouse
unclutter -idle 0 &

# Iniciar servidor Node.js
cd ~/FPVCopilotGCS
NODE_ENV=production npm start > ~/fpv-gcs.log 2>&1 &

# Esperar a que el servidor esté listo
echo "Esperando a que el servidor inicie..."
sleep 10

# Abrir Midori en modo fullscreen (más ligero y eficiente para Pi Zero)
midori -e Fullscreen -a http://localhost:3000
EOF

chmod +x "$HOME_DIR/.xinitrc"
echo "✅ Archivo .xinitrc creado"
echo ""

# 3. Configurar inicio automático
echo "⚙️  Configurando inicio automático..."

# Backup del .bash_profile si existe
if [ -f "$HOME_DIR/.bash_profile" ]; then
    cp "$HOME_DIR/.bash_profile" "$HOME_DIR/.bash_profile.backup"
fi

# Agregar inicio automático de X
if ! grep -q "startx" "$HOME_DIR/.bash_profile" 2>/dev/null; then
    cat >> "$HOME_DIR/.bash_profile" << 'EOF'

# Iniciar X automáticamente en tty1
if [[ -z $DISPLAY ]] && [[ $(tty) = /dev/tty1 ]]; then
    startx
fi
EOF
    echo "✅ Inicio automático configurado"
else
    echo "⚠️  Inicio automático ya estaba configurado"
fi

echo ""

# 4. Configurar autologin en tty1
echo "🔐 Configurando autologin en tty1..."
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d/

cat << EOF | sudo tee /etc/systemd/system/getty@tty1.service.d/autologin.conf > /dev/null
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $CURRENT_USER --noclear %I \$TERM
EOF

sudo systemctl daemon-reload
echo "✅ Autologin configurado para $CURRENT_USER"

echo ""

# 5. Verificar que la aplicación existe
if [ ! -d "$HOME_DIR/FPVCopilotGCS" ]; then
    echo "⚠️  ADVERTENCIA: No se encontró el directorio FPVCopilotGCS"
    echo "   Asegúrate de clonar el repositorio en $HOME_DIR/FPVCopilotGCS"
    echo "   y ejecutar 'npm install' antes de reiniciar"
fi

echo ""
echo "✅ Configuración completada!"
echo ""
echo "📋 Próximos pasos:"
echo "   1. Asegúrate de que FPVCopilotGCS esté en $HOME_DIR/FPVCopilotGCS"
echo "   2. Verifica que 'npm install --omit=dev' se haya ejecutado"
echo "   3. Copia la carpeta client/dist desde tu máquina de desarrollo:"
echo "      scp -r client/dist usuario@pi:~/FPVCopilotGCS/client/"
echo "   4. Reinicia la Raspberry Pi: sudo reboot"
echo ""
echo "🌐 Al reiniciar, la Pi hará autologin y verás la aplicación en fullscreen"
echo "🔌 Para acceder por SSH, usa otro terminal (la consola estará en X)"
echo ""
echo "📝 Logs del servidor en: ~/fpv-gcs.log"
echo "📝 Logs de X en: ~/.local/share/xorg/Xorg.0.log"
echo ""
