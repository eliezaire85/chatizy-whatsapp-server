const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
client.on('qr', async (qr) => {
    console.log(`Nouveau QR Code généré pour le client.`);
    try {
        // Transforme le texte brut en image Base64 affichable
        const QRCode = require('qrcode');
        client.qrData = await QRCode.toDataURL(qr);
    } catch (err) {
        console.error("Erreur de conversion du QR Code en image:", err);
    }
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
        multiTenant: true
    });
});

// =========================
// ROUTE ETAT
// =========================

app.get('/status', (req, res) => {
    const userNumber = req.query.number;
    
    if (!userNumber) {
        return res.status(400).json({ success: false, error: "Le paramètre 'number' est requis." });
    }

    const userClient = clients[userNumber];
    res.json({
        success: true,
        service: 'Chatizy WhatsApp Server',
        connected: userClient ? userClient.isUserReady : false
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
        return res.send(`
            <div style="text-align:center; font-family:Arial; padding:40px;">
                <h1>Chatizy AI</h1>
                <h2>Connexion WhatsApp</h2>
                <p style="font-size: 16px;">Associez votre appareil pour le numéro : <strong>+${userNumber}</strong></p>

                <img
                    src="${userClient.qrData}"
                    width="320"
                    alt="QR Code"
                    style="margin: 20px auto; border: 1px solid #ccc; padding: 10px;"
                />

                <p>Scannez ce QR Code depuis WhatsApp sur votre téléphone.</p>

                <script>
                    setTimeout(() => {
                        location.reload();
                    }, 5000);
                </script>
            </div>
        `);
    }

    // CAS 3 : Initialisation de la session de l'utilisateur en arrière-plan (Pas encore de QR dispo)
    return res.send(`
        <div style="font-family:sans-serif; text-align:center; margin-top:50px; padding:40px;">
            <h1>Chatizy AI</h1>
            <h2>Génération du QR Code...</h2>
            <p>Préparation du module WhatsApp pour le numéro : <strong>+${userNumber}</strong></p>
            <p style="color:#999; font-size:14px;">La page va s'actualiser automatiquement dans quelques secondes.</p>
            <script>
                setTimeout(() => {
                    location.reload();
                }, 3000);
            </script>
        </div>
    `);
});


// =========================
// ENVOI MESSAGE
// =========================

app.post('/send', async (req, res) => {
    // Récupération du numéro de l'expéditeur, du destinataire et du texte
    const { number, to, message } = req.body;

    if (!number || !to || !message) {
        return res.status(400).json({ 
            success: false, 
            error: "Paramètres manquants (number, to, et message sont requis)." 
        });
    }

    try {
        // Récupération de la session WhatsApp spécifique à ce numéro
        const userClient = getWhatsAppClient(number);

        // On vérifie si CET utilisateur précis est connecté
        if (!userClient || !userClient.isUserReady) {
            return res.status(400).json({ 
                success: false, 
                error: `La session WhatsApp pour le numéro +${number} n'est pas connectée.` 
            });
        }

        // Formatage du numéro de destination pour l'API WhatsApp
        const formattedTo = to.includes('@c.us') ? to : `${to}@c.us`;
        
        // Envoi via l'instance isolée de l'utilisateur
        await userClient.sendMessage(formattedTo, message);

        res.json({ 
            success: true, 
            message: `Message envoyé avec succès depuis le numéro +${number}` 
        });
    } catch (error) {
        console.error(`Erreur d'envoi pour le numéro +${number}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =========================
// DEMARRAGE
// =========================
async function genererReponseChatizy(messageClient, userNumber) {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents: messageClient,
            config: {
                systemInstruction: `Tu es l’assistant IA professionnel de l’entreprise connectée à Chatizy.

Ta mission :
- Répondre aux clients de l’entreprise sur WhatsApp.
- Aider le client avec les produits, services, prix, horaires, disponibilité, livraison, conseils et informations générales.
- Répondre aussi aux questions générales, même si elles ne concernent pas directement les produits ou services.
- Toujours rester utile, poli, naturel et professionnel.

Langues :
- Si le client écrit en français, réponds en français.
- Si le client écrit en anglais, réponds en anglais.
- Si le client écrit en espagnol, réponds en espagnol.
- Si le client écrit en créole haïtien, réponds en créole haïtien.
- Ne mélange pas les langues sauf si le client le fait.

Règles importantes :
- Ne dis jamais que tu es Gemini.
- Ne dis jamais que tu es ChatGPT.
- Quand des produits sont disponibles, affiche TOUJOURS le nom exact, le prix exact et la devise USD.
- Termine souvent par une question utile pour continuer la conversation
- Dis que tu es l’assistant de l’entreprise connectée à Chatizy.
- Ne donne pas de fausses informations.
- Si tu ne connais pas une information, demande une précision.
- Réponds de façon courte et claire, adaptée à WhatsApp.
- Si le client demande un produit, utilise les produits disponibles ci-dessous.
- Si aucun produit ne correspond, demande plus de détails.
- Ne crée pas de faux prix, faux stock ou faux service.`,
                temperature: 0.3,
                maxOutputTokens: 400
            }
        });

        return response.text;

    } catch (error) {
        console.error("Erreur d'appel à l'API Gemini Lite :", error);
        return "Désolé, je rencontre une petite perturbation technique. Pouvez-vous reformuler votre demande ?";
    }
}
app.listen(PORT, () => {
console.log(`Serveur démarré sur le port ${PORT}`);
});