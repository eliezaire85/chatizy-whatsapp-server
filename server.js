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

// 1. On remplace le client unique par un objet vide qui stockera les sessions de chaque utilisateur
const clients = {}; 

// 2. Fonction dynamique pour initialiser un client WhatsApp spécifique à un numéro
function getWhatsAppClient(userNumber) {
    // Si le client pour ce numéro existe déjà, on le retourne directement
    if (clients[userNumber]) {
        return clients[userNumber];
    }

    console.log(`Initialisation d'une nouvelle session pour le numéro : ${userNumber}`);

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: `session-${userNumber}` // Dossier unique par utilisateur sur Railway
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

    // Initialisation des variables d'état propres à ce client
    client.qrData = null;
    client.isUserReady = false;

    // Gestion des événements pour ce numéro spécifique
    client.on('qr', (qr) => {
        console.log(`Nouveau QR Code généré pour ${userNumber}`);
        client.qrData = qr;
    });

    client.on('ready', () => {
        console.log(`WhatsApp prêt pour le numéro : ${userNumber}`);
        client.isUserReady = true;
        client.qrData = null;
    });

    client.on('disconnected', async (reason) => {
        console.log(`Numéro ${userNumber} déconnecté :`, reason);
        try {
            await client.destroy();
        } catch (error) {
            console.error('Erreur lors du destroy :', error);
        }
        delete clients[userNumber]; // Supprime la session pour pouvoir recommencer à zéro
    });

    client.initialize();
    clients[userNumber] = client; // Sauvegarde du client dans notre liste globale
    return client;
}

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

app.post('/send', async (req, res) => {

try {

    if (!isReady) {
        return res.status(400).json({
            success: false,
            error: 'WhatsApp non connecté'
        });
    }

    let { number, message } = req.body;

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