import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY est manquante dans le fichier .env");
}

const app = express();
const PORT = process.env.PORT || 3000;
const ai = new GoogleGenAI({ apiKey });

app.use(express.json());
app.use(express.static('public'));

// Stockage en mémoire des sessions
const sessions = new Map();

// Fonction pour charger la base de connaissances (fichier test.txt dans data/)
function gettestContext() {
  const filePath = path.join(process.cwd(), 'data', 'test.txt');
  
  if (!fs.existsSync(filePath)) {
    console.warn("Fichier test.txt introuvable dans le dossier data/");
    return "Aucune base de connaissances disponible pour le moment.";
  }

  return fs.readFileSync(filePath, 'utf-8');
}

// Fonction pour déterminer la date, l'heure et le statut d'ouverture (Fuseau Europe/Paris)
function getCurrentTimeInfo() {
  const now = new Date();

  // Conversion explicite sur le fuseau horaire français
  const parisTimeString = now.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  const parisDate = new Date(parisTimeString);

  const hour = parisDate.getHours();
  const day = parisDate.getDay(); // 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi

  // Ouvert du Lundi (1) au Vendredi (5), de 08h00 à 18h00
  const isWeekday = day >= 1 && day <= 5;
  const isBusinessHours = isWeekday && hour >= 8 && hour < 18;

  return {
    formattedDate: now.toLocaleDateString('fr-FR', {
      timeZone: 'Europe/Paris',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }),
    isBusinessHours
  };
}

app.get('/health', (req, res) => {
  res.json({ status: "ok", message: "Le serveur Express fonctionne !" });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Le champ 'message' est obligatoire." });
    }

    const timeInfo = getCurrentTimeInfo();

    // 1. Initialisation de la session si elle n'existe pas encore
    if (!sessions.has(sessionId)) {
      const knowledgeBase = gettestContext();

      const chat = ai.chats.create({
        model: 'gemini-3.5-flash-lite',
        config: {
          systemInstruction: `
Tu es le chatbot officiel de l'agence web "Depitcho".

INFORMATIONS CONTEXTUELLES :
- Date et heure actuelles : ${timeInfo.formattedDate}.
- Statut de l'agence : ${timeInfo.isBusinessHours ? "OUVERT (Horaires : Lundi-Vendredi 08h00-18h00)" : "FERMÉ (Hors horaires d'ouverture)"}.

BASE DE CONNAISSANCES DE L'ENTREPRISE :
${knowledgeBase}

CONSIGNES STRICTES DE COMPORTEMENT :
1. SALUTATIONS : Salue l'utilisateur UNIQUEMENT lors de ton tout premier message. Ne réitère JAMAIS "Bonjour" ou "Bienvenue" par la suite.
2. DISPONIBILITÉ / FERMETURE :
   - Si l'agence est FERMÉE : Ne réponds PAS aux questions sur les tarifs ou les services. Affiche UNIQUEMENT la phrase suivante et rien d'autre :
     "L'agence est actuellement fermée. Veuillez laisser votre message, nous vous répondrons le plus tôt possible."
   - Si l'agence est OUVERTE : Réponds normalement en utilisant la base de connaissances.
3. SOURCE : Utilise EXCLUSIVEMENT la base de connaissances ci-dessus pour répondre aux demandes. Si une information n'y figure pas, indique poliment que tu ne la possèdes pas.
4. PRÉCISION ET CIBLAGE : Réponds STRICTEMENT à la question posée sans tout regrouper :
   - Si l'utilisateur demande la liste des catégories, donne UNIQUEMENT la liste des catégories (sans inclure les prix).
   - Si l'utilisateur demande le prix d'une catégorie spécifique, donne UNIQUEMENT le prix et les détails de cette catégorie.
5. TON : Sois concis, professionnel, clair et accueillant.
          `.trim(),
        },
      });

      sessions.set(sessionId, chat);
      console.log(`[Session créée] ID: ${sessionId} | Statut: ${timeInfo.isBusinessHours ? "OUVERT" : "FERMÉ"}`);
    }

    // 2. Récupération de la session
    const chatSession = sessions.get(sessionId);

    // 3. Envoi du message utilisateur
    const response = await chatSession.sendMessage({
      message: message,
    });

    res.json({
      sessionId,
      reply: response.text,
    });

  } catch (error) {
    console.error("Erreur Gemini RAG :", error);
    res.status(500).json({
      error: "Erreur lors de la génération de la réponse.",
      details: error.message || String(error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur Depitcho RAG démarré sur http://localhost:${PORT}`);
});