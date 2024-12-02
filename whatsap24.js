const express = require('express');
const axios = require('axios');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');

// Configuración de OpenAI
const openaiApiKey = 'OPENAI_API_KEY'; // Reemplaza con tu API Key de OpenAI

let pdfContents = {};

// Función para cargar y extraer contenido de todos los PDFs en la carpeta
async function loadPDFContents() {
    const files = fs.readdirSync(__dirname).filter(file => file.endsWith('.pdf'));

    for (const file of files) {
        try {
            const pdfBuffer = fs.readFileSync(path.join(__dirname, file));
            const data = await pdfParse(pdfBuffer);
            pdfContents[file] = data.text.replace(/\s+/g, ' ').toLowerCase();
            console.log(`Contenido del PDF "${file}" cargado y limpiado.`);
        } catch (error) {
            console.error(`Error al cargar el PDF "${file}":`, error);
        }
    }
}

// Función para obtener respuesta de ChatGPT basada en el contenido de los PDFs y la pregunta del usuario
async function getChatGPTResponse(question) {
    let contentFromPDFs = "";

    for (const [fileName, content] of Object.entries(pdfContents)) {
        contentFromPDFs += `Contenido de ${fileName}:\n${content}\n\n`;
    }

    const prompt = `
Pregunta: "${question}"\n\n
Contexto de los documentos:\n${contentFromPDFs}\n\n
Instrucciones: Responde a la pregunta usando solo la información relevante de los documentos.
    `;

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: "system", content: "Eres un asesor experto que responde a preguntas específicas usando contenido relevante de los documentos proporcionados." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 1000,
                temperature: 0.3
            },
            {
                headers: {
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error("Error al obtener respuesta de ChatGPT:", error.message);
        return "Lo siento, hubo un error al procesar tu solicitud.";
    }
}

// Configura el servidor Express para recibir mensajes
const app = express();
app.use(express.json());

// *** NUEVOS ENDPOINTS ***

// 1. Endpoint para inicialización (/start)
app.post('/start', (req, res) => {
    const threadId = `thread_${Date.now()}`; // Genera un thread_id único
    res.json({
        success: true,
        thread_id: threadId,
        message: '¡Bienvenido! El chat está listo para comenzar.',
    });
});

// 2. Endpoint para chat (/chat)
app.post('/chat', async (req, res) => {
    const { thread_id, question } = req.body;

    if (!thread_id || !question) {
        return res.status(400).json({ error: "Faltan parámetros: thread_id y/o pregunta." });
    }

    console.log(`Pregunta recibida para thread_id ${thread_id}: ${question}`);

    try {
        // Respuesta usando ChatGPT y PDFs
        const response = await getChatGPTResponse(question.trim());
        return res.status(200).send({ response });
    } catch (error) {
        console.error('Error al procesar el chat:', error);
        return res.status(500).send({ error: "Error interno del servidor." });
    }
});

// 3. Endpoint para verificar estado (/check)
app.get('/check', (req, res) => {
    res.json({
        success: true,
        message: 'El servidor está funcionando correctamente.',
        pdfs_loaded: Object.keys(pdfContents),
    });
});

// Inicia el servidor y carga el contenido de los PDFs
const PORT = process.env.PORT || 8080;
loadPDFContents().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor escuchando en el puerto ${PORT}`);
    });
}).catch(err => {
    console.error("Error al cargar los PDFs:", err);
});
