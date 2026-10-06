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

const sessions = new Map();

// --- ETAPE RAG : Chargement de la base de connaissances ---
function getKnowledgeContext(userQuery) {
  const filePath = path.join(process.cwd(), 'data', 'test.txt');
  
  if (!fs.existsSync(filePath)) {
    return "";
  }

  const rawData = fs.readFileSync(filePath, 'utf-8');
  const lines = rawData.split('\n').filter(line => line.trim() !== '');

  // Recherche simple par mots-clés présents dans la question
  const words = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const relevantLines = lines.filter(line => 
    words.some(word => line.toLowerCase().includes(word))
  );

  // Si aucun mot clé ne matche, on passe l'ensemble du fichier (si petit) ou un extrait
  const contextToUse = relevantLines.length > 0 ? relevantLines.join('\n') : rawData;

  return `
--- BASE DE CONNAISSANCES INTERNE ---
${contextToUse}
--- FIN DE LA BASE ---
`;
}

app.get('/health', (req, res) => {
  res.json({ status: "ok", message: "Le serveur fonctionne !" });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Le champ 'message' est obligatoire." });
    }

    // RAG : Recherche des connaissances liées à la question
    const knowledgeContext = getKnowledgeContext(message);

    if (!sessions.has(sessionId)) {
      const chat = ai.chats.create({
        model: 'gemini-3.5-flash',
        config: {
          systemInstruction: `
            Tu es NWS-Bot, un assistant d'assistance.
            Utilise PRIORITAIREMENT la base de connaissances fournie pour répondre aux questions.
            Si la réponse se trouve dans la base de connaissances, réponds précisément d'après celle-ci.
          `.trim(),
        },
      });
      sessions.set(sessionId, chat);
    }

    const chatSession = sessions.get(sessionId);

    // Injection du contexte RAG directement avec le message
    const promptWithRag = `
Contexte d'information disponible :
${knowledgeContext}

Question de l'utilisateur :
${message}
`.trim();

    const response = await chatSession.sendMessage({
      message: promptWithRag,
    });

    res.json({
      sessionId,
      reply: response.text,
    });
  } catch (error) {
    console.error("Erreur RAG Gemini :", error);
    res.status(500).json({
      error: "Erreur lors de la génération RAG.",
      details: error.message || String(error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur démarré avec RAG sur http://localhost:${PORT}`);
});