const WebSocket = require('ws');
const ModbusRTU = require('modbus-serial');
const net = require('net');

class OCPPAdapter {
  constructor(serverPort, upstreamServerUrl, scadaConfig) {
    this.server = new WebSocket.Server({ port: serverPort });
    this.upstreamServerUrl = upstreamServerUrl;
    
    // Inisialisasi Modbus TCP Client
    this.modbusClient = new ModbusRTU();
    this.scadaConfig = scadaConfig;

    // Hubungkan ke SCADA Modbus
    this.connectToScada();
    this.setupServer();
  }

  async connectToScada() {
    try {
      // Untuk Modbus TCP
      await this.modbusClient.connectTCP(this.scadaConfig.host, {
        port: this.scadaConfig.port
      });
      console.log('[SCADA] Connected to Modbus TCP server');
      
      // Untuk Modbus RTU (jika menggunakan serial):
      // this.modbusClient.connectRTU("/dev/ttyUSB0", { baudRate: 9600 });
    } catch (error) {
      console.error('[SCADA] Connection error:', error);
    }
  }

  setupServer() {
    this.server.on('connection', (downstreamWs, req) => {
      const chargerId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('chargerId');
      console.log(`Charger connected: ${chargerId}`);
  
      const upstreamWs = new WebSocket(`${this.upstreamServerUrl}?chargerId=${chargerId}`);
      const messageQueue = []; // Antrian pesan sementara
  
      // Teruskan pesan hanya setelah upstream terbuka
      upstreamWs.on('open', () => {
        // Proses pesan yang tertahan
        messageQueue.forEach(data => upstreamWs.send(data));
        messageQueue.length = 0;
      });
  
      downstreamWs.on('message', (data) => {
        // Jika upstream belum terbuka, simpan di antrian
        if (upstreamWs.readyState !== WebSocket.OPEN) {
          messageQueue.push(data);
          return;
        }
  
        // Teruskan ke upstream server
        upstreamWs.send(data);
        
        // Kirim ke SCADA
        this.sendToScada(chargerId, data);
      });
    });
  }
}

// Konfigurasi
const adapter = new OCPPAdapter(
  9221, // Port adapter
  'ws://localhost:9220', // OCPP Server
  {
    host: '192.168.1.100', // Alamat SCADA
    port: 502 // Port Modbus TCP
  }
);