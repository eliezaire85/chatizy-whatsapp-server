const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');

const app = express();

app.use(express.json());

let qrCodeData = null;
let isReady = false;

// =========================
// INITIALISATION WHATSAPP
// =========================

const client = new Client({
authStrategy: new LocalAuth({
clientId: 'chatizy'
}),
puppeteer: {
headless: true,
args: [
'--no-sandbox',
'--disable-setuid-sandbox',
'--disable-dev-shm-usage',
'--disable-gpu',
'--disable-extensions'
]
}
});

// =========================
// EVENEMENTS WHATSAPP
// =========================

client.on('qr', async (qr) => {
console.log('QR Code généré');
qrCodeData = await QRCode.toDataURL(qr);
});

client.on('ready', () => {
console.log('WhatsApp connecté');
isReady = true;
qrCodeData = null;
});

client.on('authenticated', () => {
console.log('Authentification réussie');
});

client.on('auth_failure', (msg) => {
console.log('Erreur authentification :', msg);
});

client.on('disconnected', (reason) => {
console.log('WhatsApp déconnecté :', reason);
isReady = false;
qrCodeData = null;
});

// =========================
// ROUTE STATUS
// =========================

app.get('/', (req, res) => {
res.json({
success: true,
service: 'Chatizy WhatsApp Server',
connected: isReady
});
});

// =========================
// ROUTE ETAT
// =========================

app.get('/status', (req, res) => {
res.json({
success: true,
connected: isReady
});
});

// =========================
// ROUTE QR CODE
// =========================

app.get('/qr', (req, res) => {

if (isReady) {
    return res.send(`
        <div style="text-align:center;font-family:Arial;padding:40px;">
            <h1>Chatizy AI</h1>
            <h2 style="color:green;">
                WhatsApp déjà connecté
            </h2>
        </div>
    `);
}

if (!qrCodeData) {
    return res.send(`
        <div style="text-align:center;font-family:Arial;padding:40px;">
            <h1>Chatizy AI</h1>
            <h2>Génération du QR Code...</h2>
            <script>
                setTimeout(() => {
                    location.reload();
                }, 3000);
            </script>
        </div>
    `);
}

res.send(`
    <div style="text-align:center;font-family:Arial;padding:40px;">
        <h1>Chatizy AI</h1>
        <h2>Connexion WhatsApp</h2>

        <img
            src="${qrCodeData}"
            width="320"
            alt="QR Code"
        />

        <p>
            Scannez ce QR Code depuis WhatsApp
        </p>

        <script>
            setTimeout(() => {
                location.reload();
            }, 5000);
        </script>
    </div>
`);

});

// =========================
// ENVOI MESSAGE
// =========================

app.get('/send', async (req, res) => {

try {

    if (!isReady) {
        return res.status(400).json({
            success: false,
            error: 'WhatsApp non connecté'
        });
    }

    let { number, message } = req.query;

    if (!number || !message) {
        return res.status(400).json({
            success: false,
            error: 'number et message obligatoires'
        });
    }

    number = number.replace(/\D/g, '');

    const chatId = `${number}@c.us`;

    await client.sendMessage(chatId, message);

    return res.json({
        success: true,
        message: 'Message envoyé',
        to: number
    });

} catch (error) {

    console.error(error);

    return res.status(500).json({
        success: false,
        error: error.message
    });

}

});

// =========================
// DEMARRAGE
// =========================

client.initialize();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
console.log(`Serveur démarré sur le port ${PORT}`);
});