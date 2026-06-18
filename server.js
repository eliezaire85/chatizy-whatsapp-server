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
        clientId: `session-${userNumber}` // Dossier de session par utilisateur
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--no-first-run',
            '--no-zygote',
            '--single-process' // Option cruciale pour économiser la RAM sur Railway
        ],
        protocolTimeout: 60000 // Force Puppeteer à attendre 60s (Régle votre erreur)
    },
    authTimeoutMs: 60000, // Laisse 60s à WhatsApp Web pour s'initialiser
    qrMaxRetries: 5
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
    
    client.on('message', async (msg) => {
        console.log(`[BOT ${userNumber}] Message reçu de ${msg.from} : ${msg.body}`);

        try {
            // Appelle ta fonction existante qui génère la réponse avec Gemini
            const responseIA = await genererReponseChatizy(msg.body); 
            await msg.reply(responseIA);
            console.log(`[BOT ${userNumber}] Réponse IA envoyée à ${msg.from}`);
        } catch (error) {
            console.error(`[BOT ${userNumber}] Erreur traitement message :`, error);
        }
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

// =======================================================
//   FONCTION DE GÉNÉRATION GEMINI DYNAMIQUE (CATALOGUE)
// =======================================================
async function genererReponseChatizy(messageClient, userNumber) {
    try {
        let catalogueTexte = "";

        try {
            // 1. Récupération des produits de l'entreprise dans Firestore
            // On cherche dans la collection 'products' où 'userId' (ou 'userNumber') correspond au numéro connecté
            // ET on filtre uniquement les produits disponibles (available == true)
            const productsSnapshot = await db.collection('products')
                .where('userNumber', '==', userNumber)
                .where('available', '==', true)
                .get();

            if (!productsSnapshot.empty) {
                catalogueTexte = "Voici les produits actuellement disponibles dans notre boutique :\n\n";
                
                productsSnapshot.forEach(doc => {
                    const data = doc.data();
                    // On extrait le nom et le prix saisis dans vos formulaires FlutterFlow
                    const nom = data.product_name || "Produit sans nom";
                    const prix = data.price || "Sur devis";
                    
                    catalogueTexte += `- **Nom exact :** ${nom}\n  **Prix exact :** ${prix} USD\n\n`;
                });
            } else {
                catalogueTexte = "Aucun produit n'est actuellement disponible dans le catalogue de cette entreprise.";
            }

        } catch (dbError) {
            console.error("Erreur lors de la lecture des produits Firestore :", dbError);
            catalogueTexte = "Le catalogue est momentanément indisponible. Reste poli.";
        }

        // 2. Appel à Gemini avec le catalogue généré en temps réel
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents: messageClient,
            config: {
                systemInstruction: `Tu es l’assistant IA professionnel de l’entreprise connectée à Chatizy.

Ta mission :
- Répondre aux clients de l’entreprise sur WhatsApp de manière naturelle, fluide et chaleureuse.
- Tu as deux rôles principaux :
  1. Si le client pose une question sur les produits, services, prix ou stocks, sers-toi STRICTEMENT de la liste fournie ci-dessous.
  2. Si le client pose une question générale (horaires, salutations, conseils, ou toute autre question de discussion), utilise tes connaissances générales pour lui répondre avec politesse et expertise, toujours au nom de l'entreprise.

=========================================
PRODUITS DISPONIBLES DANS L'ENTREPRISE :
=========================================
${catalogueTexte}
=========================================

Langues :
- Si le client écrit en français, réponds en français.
- Si le client écrit en anglais, réponds en anglais.
- Si le client écrit en espagnol, réponds en espagnol.
- Si le client écrit en créole haïtien, réponds en créole haïtien.

Règles importantes :
- Ne dis jamais que tu es Gemini ou ChatGPT.
- Dis que tu es l’assistant de l’entreprise connectée à Chatizy.
- Quand un produit est disponible, affiche TOUJOURS son nom exact, son prix exact et la devise USD (ex: 20 USD).
- Si le client demande un produit qui n'est pas listé ou indisponible, demande des détails ou propose une alternative.
- Réponds de façon courte, aérée et claire, adaptée à WhatsApp.
- Termine souvent par une question utile pour continuer la conversation.`,
                
                temperature: 0.2, // Température basse pour éviter toute invention de prix
                maxOutputTokens: 400
            }
        });

        return response.text;

    } catch (error) {
        console.error("Erreur globale dans la génération de réponse :", error);
        return "Désolé, je rencontre une petite perturbation technique. Pouvez-vous reformuler votre demande ?";
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log(`Serveur démarré sur le port ${PORT}`);
});