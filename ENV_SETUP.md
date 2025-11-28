# Configuración de Variables de Entorno

## Archivo .env.local

Crea un archivo `.env.local` en la raíz del proyecto con las siguientes variables:

```bash
# ============================================
# PRIVY (Auth & Wallets)
# ============================================
# Obtener en: https://dashboard.privy.io
# 1. Crear nuevo proyecto
# 2. Copiar el App ID
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id

# ============================================
# CDP (Coinbase Developer Platform)
# ============================================
# Obtener en: https://portal.cdp.coinbase.com
# 1. Crear API Key
# 2. Descargar el archivo JSON con las credenciales
# 3. Copiar API Key y API Secret
CDP_API_KEY=your_cdp_api_key
CDP_API_SECRET=your_cdp_api_secret

# ============================================
# CDP AGENT ADDRESS (REQUERIDO)
# ============================================
# Address de la cuenta CDP que recibe pagos x402 y ejecuta bridges
# Esta wallet debe tener:
# - ETH para gas (~0.001 ETH en Base Mainnet)
# - USDC se recibe automáticamente de los pagos x402
#
# IMPORTANTE: Usa esta address específica para tu facilitator
CDP_AGENT_ADDRESS=0x308D03A537baAf5A7F54060d28718BEe77F700EF

# ============================================
# SOLANA SERVICE WALLET (AUTO-COMPLETION)
# ============================================
# Private key en formato base58 de una wallet Solana para auto-completar bridges
# Esta wallet paga las fees de Solana (~0.001 SOL por transacción)
#
# Para generar una nueva wallet:
# 1. Instala Solana CLI: https://docs.solana.com/cli/install-solana-cli-tools
# 2. Genera keypair: solana-keygen new
# 3. Exporta private key: solana-keygen pubkey ~/.config/solana/id.json && cat ~/.config/solana/id.json
# 4. Deposita ~0.1 SOL (~$10-20) para cubrir fees de ~100 bridges
#
# OPCIONAL: Si no se configura, el vendedor deberá reclamar manualmente en Solana
SOLANA_SERVICE_WALLET_PRIVATE_KEY=your_solana_private_key_base58

# ============================================
# APP URL (Producción)
# ============================================
# URL base de tu app para llamadas internas (auto-completion background jobs)
# En desarrollo: http://localhost:3000
# En producción: https://tu-dominio.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 🎉 Fondos Necesarios: ¡NINGUNO!

### Smart Account con Paymaster (Base Mainnet)

```bash
# ✅ NO necesitas ETH para gas (Paymaster lo cubre)
# ✅ NO necesitas USDC inicial (recibirá pagos x402)
# ✅ El gas es GRATIS con CDP Paymaster ($15k/mes incluido)

# La Smart Account se crea automáticamente al inicializar CDP
```

### Verificar tu Smart Account:

1. **Iniciar el servidor:**

   ```bash
   npm run dev

   # Verás en la consola:
   # [CDP] Smart Account: 0x...
   # [CDP] ✅ Using Paymaster - no ETH needed for gas!
   ```

2. **Verificar en Basescan:**
   - Basescan: https://basescan.org/address/YOUR_SMART_ACCOUNT_ADDRESS
   - Verás que NO tiene ETH (¡y no lo necesita!)

## Verificación

Después de configurar las variables, verifica que todo funcione:

```bash
# 1. Iniciar el servidor
npm run dev

# 2. Verificar que no hay errores de variables faltantes en la consola

# 3. El servidor debe mostrar:
[CDP] Using predefined agent address: 0x...
[CDP] Facilitator account address: 0x...
[x402] Facilitator: 0x...
```

## Troubleshooting

### Error: "CDP_API_KEY not found" o "CDP_API_SECRET not found"

- Verifica que el archivo `.env.local` existe
- Asegúrate de que las variables están definidas correctamente
- Descarga las credenciales desde https://portal.cdp.coinbase.com
- Reinicia el servidor Next.js

### Error: "Account not found" o error de CDP

- Verifica que CDP_API_KEY y CDP_API_SECRET son correctos
- Si especificaste CDP_AGENT_ADDRESS, verifica que la address existe en tu cuenta CDP
- Intenta sin CDP_AGENT_ADDRESS para que CDP cree una automáticamente

### Error: "Paymaster rejected" o "gas sponsorship failed"

- Verifica que el Paymaster esté configurado correctamente en CDP Portal
- Ve a https://portal.cdp.coinbase.com → Onchain Tools → Paymaster
- Asegúrate de tener Base Mainnet habilitado
- Verifica que los contratos USDC y TokenMessenger estén en la allowlist

### Error: "Smart Account not found"

- La Smart Account se crea automáticamente en el primer uso
- Verifica que CDP_API_KEY y CDP_API_SECRET sean correctos
- Revisa los logs para ver si hay errores de autenticación

### Nota: Con Paymaster NO necesitas ETH

- ✅ El gas es sponsoreado por CDP Paymaster
- ✅ Las transacciones son gas-free para ti
- ✅ Límite de $15k/mes (más que suficiente)

## Seguridad

⚠️ **IMPORTANTE:**

- NUNCA compartas tus private keys
- NUNCA las subas a GitHub
- Usa `.env.local` (ya está en .gitignore)
- En producción, usa servicios de gestión de secretos (AWS Secrets Manager, HashiCorp Vault, etc.)
