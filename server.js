const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class OCPPServer {
  constructor(port) {
    this.server = new WebSocket.Server({ port });
    this.chargers = new Map();

    this.server.on('listening', () => {
      console.log(`OCPP Server running on port ${port}`);
    });

    this.server.on('connection', (ws, req) => {
      const chargerId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('chargerId');
      console.log(`Charger connected: ${chargerId}`);
      
      this.chargers.set(chargerId, ws);
      
      ws.on('message', (data) => this.handleMessage(chargerId, data));
      ws.on('close', () => this.handleDisconnect(chargerId));
    });
  }

  handleMessage(chargerId, data) {
    try {
      const message = JSON.parse(data);
      const [messageType, messageId, action] = message;

      if (messageType !== 2) {
        this.sendError(chargerId, messageId, 'ProtocolError', 'Invalid message type');
        return;
      }

      console.log(`[SERVER] Received from ${chargerId}:`, JSON.stringify(message));

      switch(action) {
        case 'BootNotification':
          this.sendResponse(chargerId, messageId, {
            status: 'Accepted',
            interval: 300,
            currentTime: new Date().toISOString()
          });
          break;

        case 'Authorize':
          this.sendResponse(chargerId, messageId, {
            idTagInfo: { status: 'Accepted' }
          });
          break;

        case 'StartTransaction':
          this.sendResponse(chargerId, messageId, {
            transactionId: Math.floor(Math.random() * 1000),
            idTagInfo: { status: 'Accepted' }
          });
          break;

        case 'StopTransaction':
          this.sendResponse(chargerId, messageId, { 
            idTagInfo: { status: 'Accepted' } 
          });
          break;
        case 'MeterValues':
            this.sendResponse(chargerId, messageId, { 
              idTagInfo: { status: 'Accepted' } 
            });
            break;

        default:
          this.sendError(chargerId, messageId, 'NotSupported', 'Action tidak didukung');
      }
    } catch (error) {
      const messageId = (message && message[1]) || 'unknown';
      this.sendError(chargerId, messageId, 'FormationViolation', error.message);
    }
  }

  sendResponse(chargerId, messageId, payload) {
    const response = [3, messageId, payload];
    this.chargers.get(chargerId).send(JSON.stringify(response));
    console.log(`[SERVER] Sent to ${chargerId}:`, JSON.stringify(response));
  }

  sendError(chargerId, messageId, errorCode, errorDescription) {
    const errorMessage = [4, messageId, errorCode, errorDescription, {}];
    this.chargers.get(chargerId).send(JSON.stringify(errorMessage));
    console.log(`[SERVER] Sent ERROR to ${chargerId}:`, JSON.stringify(errorMessage));
  }

  handleDisconnect(chargerId) {
    console.log(`Charger disconnected: ${chargerId}`);
    this.chargers.delete(chargerId);
  }
}

const server = new OCPPServer(9220);