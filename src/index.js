import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY manquante");

const app = express();
const PORT = process.env.PORT || 3000;
const ai = new GoogleGenAI({ apiKey });

app.use(express.json());
app.use(express.static('public'));

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message obligatoire" });

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: message,
    });

    res.json({ reply: response.text });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la génération" });
  }
});

app.listen(PORT, () => console.log(`Serveur démarré sur http://localhost:${PORT}`));