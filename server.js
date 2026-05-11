import express from 'express';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25*1024*1024 } });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SAMPLE_DECK = `Company: Lumen Robotics\nStage: Seed, raising $4M on $20M post\nProblem: Warehouse picking is 60% of fulfillment cost and labor turnover is 130%/yr.\nSolution: Vision-language model on a $9k arm that learns SKUs in <5 min per item.\nTraction: 2 paid pilots (Gap, Chewy 3PL), $180k ARR, 14 LOIs.\nTeam: CEO ex-Boston Dynamics perception lead, CTO ex-Covariant, 4 engineers.\nMarket: $14B warehouse automation, growing 18% CAGR.\nAsk: $4M to deploy 30 arms across 6 customers, 18mo runway.\nGTM: Land via 3PLs, expand to brand-direct warehouses.\nCompetition: Covariant (enterprise-heavy), Symbotic (full system), Locus (AMR-only).`;

const SYSTEM_PROMPT = `You are a Series-A VC partner at a top-decile fund. Given a pitch deck or company summary, output a STRUCTURED investment scorecard. Be opinionated. Score each dimension 1-10. Identify at least 3 concrete red flags. Return ONLY valid JSON matching this schema:
{
  "company": string,
  "one_liner": string,
  "recommendation": "PASS" | "TRACK" | "DILIGENCE" | "TERM_SHEET",
  "conviction": number,
  "scorecard": {
    "market": {"score": number, "reasoning": string},
    "team": {"score": number, "reasoning": string},
    "product": {"score": number, "reasoning": string},
    "traction": {"score": number, "reasoning": string},
    "moat": {"score": number, "reasoning": string},
    "deal_terms": {"score": number, "reasoning": string}
  },
  "red_flags": [string],
  "diligence_questions": [string],
  "comparables": [{"name": string, "why": string}],
  "memo": string
}`;

async function analyze(text) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' }, systemInstruction: SYSTEM_PROMPT });
  const r = await model.generateContent(text);
  return JSON.parse(r.response.text());
}

app.get('/api/health', (_,res)=>res.json({ok:true}));
app.post('/api/analyze-sample', async (_,res)=>{
  try { res.json(await analyze(SAMPLE_DECK)); } catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/analyze', upload.single('pdf'), async (req,res)=>{
  try {
    if(!req.file) return res.status(400).json({error:'no file'});
    const model = genAI.getGenerativeModel({ model:'gemini-2.5-flash', generationConfig:{responseMimeType:'application/json'}, systemInstruction: SYSTEM_PROMPT });
    const r = await model.generateContent([{inlineData:{data:req.file.buffer.toString('base64'),mimeType:'application/pdf'}}, 'Analyze this pitch deck.']);
    res.json(JSON.parse(r.response.text()));
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.use(express.static(path.join(__dirname,'public')));
const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=>console.log('DealLens v2 on',PORT));
