const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = process.env.PORT || 8080;

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.static('public'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

app.post('/api/memo', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const data = await pdfParse(req.file.buffer);
    const text = data.text;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    const prompt = `Analyze this pitch deck text and generate a VC investment memo with the following sections: [THESIS], [MARKET], [TEAM], [TRACTION], [RISKS]. Each section should be clearly labeled and contain relevant analysis based on the pitch deck content.`;
    const result = await model.generateContent([prompt, text]);
    const response = await result.response;
    const memoText = response.text();

    // Parse the response
    const sections = {};
    const sectionLabels = ['THESIS', 'MARKET', 'TEAM', 'TRACTION', 'RISKS'];
    let currentSection = '';
    const lines = memoText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      for (const label of sectionLabels) {
        if (trimmed.startsWith(`[${label}]`)) {
          currentSection = label.toLowerCase();
          sections[currentSection] = trimmed.replace(`[${label}]`, '').trim();
          break;
        }
      }
      if (currentSection && !trimmed.startsWith('[')) {
        sections[currentSection] += '\n' + trimmed;
      }
    }

    res.json(sections);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    commit: process.env.COMMIT_SHA,
    time: new Date().toISOString()
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});