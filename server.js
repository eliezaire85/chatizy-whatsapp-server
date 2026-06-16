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
    const userNumber = req.query.number; // Récupère le numéro (?number=...) envoyé par FlutterFlow

    if (!userNumber) {
        return res.status(400).send(`
            <div style="font-family:sans-serif; text-align:center; margin-top:50px;">
                <h2 style="color:#D32F2F;">Erreur de configuration</h2>
                <p>Le paramètre de numéro (number) est manquant dans l'URL.</p>
            </div>
        `);
    }

    // On récupère ou crée la session WhatsApp dédiée à ce numéro spécifique
    const userClient = getWhatsAppClient(userNumber);

    // CAS 1 : WhatsApp est déjà connecté pour ce numéro
    if (userClient.isUserReady) {
        return res.send(`
            <div style="font-family:sans-serif; text-align:center; margin-top:50px; padding: 20px;">
                <div style="font-size: 60px;">✅</div>
                <h1 style="font-family:sans-serif; color:#333;">Chatizy AI</h1>
                <h2 style="color:green; margin-bottom: 10px;">WhatsApp déjà connecté</h2>
                <p style="font-size: 18px; color: #555;">
                    Le compte associé au numéro <strong>+${userNumber}</strong> est actuellement actif.
                </p>
                <p style="color:#666; font-size:14px; margin-top: 20px;">
                    Vous pouvez fermer cette page en toute sécurité et retourner sur votre application.
                </p>
            </div>
        `);
    }

    // CAS 2 : Le QR Code est généré et attend d'être scanné
    if (userClient.qrData) {
        // NOTE : Si vous utilisez une fonction spécifique (comme 'qrcode') pour afficher l'image, 
        // remplacez la ligne ci-dessous par votre balise <img src="..."> habituelle basée sur userClient.qrData
        return res.send(`
            <div style="font-family:sans-serif; text-align:center; margin-top:50px;">
                <h1>Chatizy AI</h1>
                <h2>Scanner le QR Code</h2>
                <p style="font-size: 16px;">Associez votre appareil pour le numéro : <strong>+${userNumber}</strong></p>
                
                <div style="margin: 30px auto; padding: 10px; border: 1px solid #ccc; display: inline-block;">
                    <p style="color:#888; font-size:12px;">[Insérez ici votre logique d'affichage d'image QR Code basées sur userClient.qrData]</p>
                </div>

                <p style="color:#777; font-size:13px;">Le code se rafraîchit automatiquement.</p>
            </div>
        `);
    }

    // CAS 3 : Initialisation de la session de l'utilisateur en arrière-plan
    return res.send(`
        <div style="font-family:sans-serif; text-align:center; margin-top:50px;">
            <h1>Chatizy AI</h1>
            <h2>Génération de votre session en cours...</h2>
            <p>Préparation du module WhatsApp pour le numéro : <strong>+${userNumber}</strong></p>
            <p style="color:#999; font-size:14px;">La page va s'actualiser automatiquement dans quelques secondes.</p>
            <script>setTimeout(() => { location.reload(); }, 4000);</script>
        </div>
    `);
});

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
console.log(`Serveur démarré sur le port ${PORT}`);
});