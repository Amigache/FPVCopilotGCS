#!/bin/bash

# Script para inicializar touchscreen con reintentos
# Se ejecuta desde .xinitrc

echo "[TOUCH] Inicializando touchscreen..." >> /home/kiosk/touchscreen.log

# Esperar a que X esté completamente listo
sleep 3

# Intentar hasta 15 veces (30 segundos)
MAX_RETRIES=15
RETRY_COUNT=0
SUCCESS=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    echo "[TOUCH] Intento $((RETRY_COUNT + 1))/$MAX_RETRIES" >> /home/kiosk/touchscreen.log
    
    # Buscar todos los dispositivos táctiles (pueden haber múltiples IDs)
    TOUCH_IDS=$(xinput list 2>/dev/null | grep -i "touch" | grep -v "Virtual" | sed 's/.*id=\([0-9]*\).*/\1/')
    
    if [ -n "$TOUCH_IDS" ]; then
        echo "[TOUCH] Dispositivos encontrados: $TOUCH_IDS" >> /home/kiosk/touchscreen.log
        
        # Aplicar calibración a todos los dispositivos táctiles
        for TOUCH_ID in $TOUCH_IDS; do
            echo "[TOUCH] Configurando dispositivo ID $TOUCH_ID" >> /home/kiosk/touchscreen.log
            
            # Reattach si es necesario
            xinput reattach $TOUCH_ID 2 2>/dev/null
            
            # Habilitar el dispositivo
            xinput enable $TOUCH_ID 2>/dev/null
            
            # Aplicar calibración: X=6% (1.06), Y=15% (1.15)
            xinput set-prop $TOUCH_ID "libinput Calibration Matrix" 1.06 0 -0.03 0 1.15 -0.075 0 0 1 2>/dev/null
            
            if [ $? -eq 0 ]; then
                echo "[TOUCH] ✓ Calibración aplicada a ID $TOUCH_ID" >> /home/kiosk/touchscreen.log
                SUCCESS=1
            else
                echo "[TOUCH] ✗ Error aplicando calibración a ID $TOUCH_ID" >> /home/kiosk/touchscreen.log
            fi
        done
        
        if [ $SUCCESS -eq 1 ]; then
            break
        fi
    else
        echo "[TOUCH] ⏳ Dispositivos no detectados aún" >> /home/kiosk/touchscreen.log
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 2
done

if [ $SUCCESS -eq 1 ]; then
    echo "[TOUCH] ✓ Touchscreen inicializado correctamente" >> /home/kiosk/touchscreen.log
    exit 0
else
    echo "[TOUCH] ✗ No se pudo inicializar el touchscreen después de $MAX_RETRIES intentos" >> /home/kiosk/touchscreen.log
    exit 1
fi
