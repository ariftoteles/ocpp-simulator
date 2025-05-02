const WebSocket = require('ws');
const ModbusRTU = require('modbus-serial');

class OCPPAdapter {
  constructor(serverPort, upstreamServerUrl, scadaConfig) {
    this.server = new WebSocket.Server({ port: serverPort });
    this.upstreamServerUrl = upstreamServerUrl;
    this.scadaConfig = scadaConfig;
    this.modbusClient = new ModbusRTU();
    
    this.connectToScada(); // comment this section if you want to running service without connect to modbus
    this.setupServer();
  }

  async connectToScada() { 
    try {
      await this.modbusClient.connectTCP(this.scadaConfig.host, { port: this.scadaConfig.port });
      console.log('[SCADA] Modbus connected');
    } catch (error) {
      console.error('[SCADA] Modbus error:', error);
    }
  }

  setupServer() {
    this.server.on('connection', (downstreamWs, req) => {
      const chargerId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('chargerId');
      console.log(`[ADAPTER] Charger ${chargerId} connected`);

      // Koneksi ke upstream server
      const upstreamWs = new WebSocket(this.upstreamServerUrl);
      const messageQueue = [];

      // Teruskan pesan dari upstream (server) ke downstream (charger)
      upstreamWs.on('message', (data) => {
        if (downstreamWs.readyState === WebSocket.OPEN) {
          downstreamWs.send(data);
          console.log(`[ADAPTER] Forwarded server response to ${chargerId}:`, data.toString());
        }
      });

      // Teruskan pesan dari downstream (charger) ke upstream (server)
      downstreamWs.on('message', (data) => {
        if (upstreamWs.readyState === WebSocket.OPEN) {
          upstreamWs.send(data);
          console.log(`[ADAPTER] Forwarded client message to server:`, data.toString());
          this.sendToScada(chargerId, data); // comment this section if you want to running service without connect to modbus
        } else {
          messageQueue.push(data);
        }
      });

      // Handle koneksi upstream terbuka
      upstreamWs.on('open', () => {
        messageQueue.forEach(data => upstreamWs.send(data));
        messageQueue.length = 0;
        console.log(`[ADAPTER] Upstream connected for ${chargerId}`);
      });
    });
  }

  async sendToScada(chargerId, data) {
    try {
      const message = JSON.parse(data);
      const [_, __, action, payload] = message;

      if (action === 'MeterValues') {
        const energy = payload.meterValue[0].sampledValue[0].value;
        const soc = payload.meterValue[0].sampledValue[1]?.value || 0;
        
        await this.modbusClient.writeRegisters(0, [energy, soc]);
        console.log(`[SCADA] Charger ${chargerId} data sent: ${energy} Wh, ${soc}%`);
      }
    } catch (error) {
      console.error(`[SCADA] Error processing data from ${chargerId}:`, error);
    }
  }
}

// Jalankan adapter
new OCPPAdapter(
  9221, 
  'ws://localhost:9220', // OCPP Server
  { host: '127.0.0.1', port: 502 } // SCADA
);