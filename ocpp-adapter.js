const WebSocket = require('ws');
const ModbusRTU = require('modbus-serial');

class OCPPAdapter {
  constructor(serverPort, upstreamServerUrl, modbusConfig) {
    this.server = new WebSocket.Server({ port: serverPort });
    this.upstreamServerUrl = upstreamServerUrl;
    
    // Inisialisasi Modbus TCP SERVER (Slave)
    this.modbusServer = new ModbusRTU.ServerTCP({
      host: modbusConfig.host,
      port: modbusConfig.port,
      debug: true
    });

    // Data register untuk simulasi
    this.registers = {
      energy: 0,
      soc: 0,
      status: 0
    };

    this.setupModbusServer();
    this.setupOCPPServer();
    console.log(`OCPP Adapter running. Modbus TCP on ${modbusConfig.host}:${modbusConfig.port}`);
  }

  setupModbusServer() {
    // Handle koneksi Modbus
    this.modbusServer.on('socketError', (err) => {
      console.error('[Modbus] Socket Error:', err);
    });

    // Handle request read holding registers
    this.modbusServer.on('readHoldingRegisters', (from, to, reply) => {
      const values = [];
      for(let addr = from; addr <= to; addr++) {
        switch(addr) {
          case 0: values.push(this.registers.energy); break;
          case 1: values.push(this.registers.soc); break;
          case 2: values.push(this.registers.status); break;
          default: values.push(0);
        }
      }
      reply(null, values);
    });
  }

  setupOCPPServer() {
    this.server.on('connection', (downstreamWs, req) => {
      const chargerId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('chargerId');
      console.log(`[OCPP] Charger connected: ${chargerId}`);

      const upstreamWs = new WebSocket(this.upstreamServerUrl);
      const messageQueue = [];

      // Handle OCPP messages
      downstreamWs.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          const [_, __, action, payload] = message;

          // Update Modbus registers saat ada MeterValues
          if (action === 'MeterValues') {
            this.registers.energy = payload.meterValue[0].sampledValue[0].value;
            this.registers.soc = payload.meterValue[0].sampledValue[1]?.value || 0;
            console.log(`[Modbus] Registers updated - Energy: ${this.registers.energy}, SoC: ${this.registers.soc}`);
          }
        } catch (error) {
          console.error('[OCPP] Error processing message:', error);
        }

        if (upstreamWs.readyState === WebSocket.OPEN) {
          upstreamWs.send(data);
        } else {
          messageQueue.push(data);
        }
      });

      upstreamWs.on('open', () => {
        messageQueue.forEach(data => upstreamWs.send(data));
        messageQueue.length = 0;
      });

      upstreamWs.on('message', (data) => {
        downstreamWs.send(data);
      });
    });
  }
}

// Jalankan adapter
new OCPPAdapter(
  9221, // Port WebSocket OCPP
  'ws://localhost:9220', // OCPP Server
  {
    host: '0.0.0.0', // Dengarkan semua interface
    port: 502 // Port Modbus TCP standar
  }
);