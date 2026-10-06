import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY est manquante dans le fichier .env");
}

const app = express();
const PORT = process.env.PORT || 3000;
const ai = new GoogleGenAI({ apiKey });

app.use(express.json());
app.use(express.static('public'));

// Stockage des sessions
const sessions = new Map();

// Fonction pour construire le contexte enrichi
function buildSystemInstruction(userName = 'Utilisateur') {
  const currentDate = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
    Tu es "NWS-Bot", un assistant virtuel expert en développement informatique et pédagogie.
    
    CONSIGNES STRICTES :
    - Tu t'adresses à l'utilisateur nommé "${userName}".
    - Nous sommes le : ${currentDate}.
    - Tes réponses doivent être structurées, claires et rédigées en Markdown.
    - Utilise un ton professionnel mais dynamique et encourageant.
    - Si l'utilisateur te demande la date ou l'heure, utilise l'information fournie ci-dessus.
  `.trim();
}

app.get('/health', (req, res) => {
  res.json({ status: "ok", message: "Le serveur fonctionne !" });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default', userName = 'Alex' } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Le champ 'message' est obligatoire." });
    }

    // Si la session n'existe pas encore, on la crée avec le CONTEXTE ENRICHI
    if (!sessions.has(sessionId)) {
      const systemInstruction = buildSystemInstruction(userName);

      const chat = ai.chats.create({
        model: 'gemini-3.5-flash',
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7, // Contrôle la créativité (0 = très strict, 1 = créatif)
        },
      });

      sessions.set(sessionId, chat);
      console.log(`[Session créée] ID: ${sessionId} pour ${userName}`);
    }

    const chatSession = sessions.get(sessionId);

    const response = await chatSession.sendMessage({
      message: message,
    });

    res.json({
      sessionId,
      reply: response.text,
    });
  } catch (error) {
    console.error("Erreur Gemini :", error);
    res.status(500).json({
      error: "Erreur lors de la génération de la réponse.",
      details: error.message || String(error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});