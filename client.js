const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class EVCharger {
  constructor(chargerId, serverUrl) {
    this.chargerId = chargerId;
    this.ws = new WebSocket(`${serverUrl}?chargerId=${chargerId}`);
    this.transactionId = null;
    this.meterInterval = null;
    this.pendingRequests = new Map();

    this.ws.on('open', () => this.onConnect());
    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('close', () => console.log('Disconnected from server'));
  }

  onConnect() {
    // Langkah 1: Kirim BootNotification saat konek
    this.sendMessage('BootNotification', {
      chargePointVendor: 'Tesla',
      chargePointModel: 'Supercharger V3'
    });
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      const [messageType] = message;

      if (messageType === 4) { // Handle error
        const [_, messageId, errorCode, errorDesc] = message;
        console.error(`[CLIENT ${this.chargerId}] ERROR: ${errorCode} - ${errorDesc}`);
        return;
      }

      if (messageType === 3) { // Handle CALLRESULT
        const [_, messageId, payload] = message;
        const request = this.pendingRequests.get(messageId);
        
        if (!request) return;

        this.pendingRequests.delete(messageId);

        // Langkah 2: Setelah BootNotification diterima, kirim Authorize
        if (request.action === 'BootNotification') {
          this.sendMessage('Authorize', { idTag: 'TAG_123' });
        }

        // Langkah 3: Setelah Authorize sukses, kirim StartTransaction
        if (request.action === 'Authorize' && payload.idTagInfo?.status === 'Accepted') {
          this.sendMessage('StartTransaction', {
            connectorId: 1,
            idTag: 'TAG_123',
            meterStart: 0,
            timestamp: new Date().toISOString()
          });
        }

        // Langkah 4: Setelah StartTransaction sukses, mulai kirim MeterValues
        if (request.action === 'StartTransaction') {
          this.transactionId = payload.transactionId;
          console.log(`[CLIENT ${this.chargerId}] Transaction started: ${this.transactionId}`);

          // Kirim MeterValues setiap 5 detik
          this.meterInterval = setInterval(() => {
            this.sendMessage('MeterValues', {
              connectorId: 1,
              transactionId: this.transactionId,
              meterValue: [{
                timestamp: new Date().toISOString(),
                sampledValue: [{
                  value: Math.floor(Math.random() * 1000),
                  unit: 'Wh'
                }]
              }]
            });
          }, 5000);

          // Hentikan setelah 30 detik
          setTimeout(() => {
            clearInterval(this.meterInterval);
            this.sendMessage('StopTransaction', {
              transactionId: this.transactionId,
              idTag: 'TAG_123',
              meterStop: 5000,
              timestamp: new Date().toISOString()
            });
          }, 30000);
        }
      }
    } catch (error) {
      console.error(`[CLIENT ${this.chargerId}] Error:`, error);
    }
  }

  sendMessage(action, payload) {
    const messageId = uuidv4();
    const message = [2, messageId, action, payload];
    this.ws.send(JSON.stringify(message));
    this.pendingRequests.set(messageId, { action, payload });
    console.log(`[CLIENT ${this.chargerId}] Sent ${action}:`, JSON.stringify(message));
  }
}

// Jalankan charger
const charger = new EVCharger('CHARGER_001', 'ws://localhost:9220');

/**
 * Standard request for ocpp v1.6
 * [<MessageType>, <UniqueID>, <Action>, <Payload>]
 * 3 types messages: CALL(2), CALLRESULT(3), CALLERROR(4)
 * 
 */