const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");
const rateLimit = require("express-rate-limit");

const app = express();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json({ limit: "10mb" }));

const allowedOrigins = [
  'https://resumexai.online', 
  'https://www.resumexai.online', 
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like server-to-server)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: { error: "Too many requests from this IP, please try again after 15 minutes" }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/v1/analyze", analyzeLimiter, async (req, res) => {
  let { resume, role } = req.body;

  if (!resume || !role) {
    return res.status(400).json({ error: "Missing data" });
  }

  try {
    const prompt = `You are an expert career coach AI.
Analyze the following resume against the target role.
Target Role: ${role}

Resume:
${resume}

Identify the key skills required for this role. Then, compare them against the resume. Be extremely concise.
Return ONLY a JSON object with the following structure:
{
  "matched": ["skill1", "skill2", ...],
  "missing": ["skill3", "skill4", ...],
  "roadmap": [
    { "week": 1, "content": "Learn X by building Y" },
    { "week": 2, "content": "Master Z" }
  ],
  "total": <number_of_total_skills_required_for_this_role>
}

Limit the roadmap to a maximum of 3 weeks. Keep the content very brief.
Make sure the output is pure JSON. Do not include markdown formatting like \`\`\`json.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    matched: { type: "ARRAY", items: { type: "STRING" } },
                    missing: { type: "ARRAY", items: { type: "STRING" } },
                    roadmap: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                week: { type: "INTEGER" },
                                content: { type: "STRING" }
                            }
                        }
                    },
                    total: { type: "INTEGER" }
                },
                required: ["matched", "missing", "roadmap", "total"]
            }
        }
    });

    let resultText = response.text;
    resultText = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const data = JSON.parse(resultText);
    
    res.json(data);
  } catch (error) {
    console.error("Error analyzing resume:", error);
    res.status(500).json({ error: "Failed to analyze resume" });
  }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log("Server running on http://localhost:" + PORT));
}
module.exports = app;
