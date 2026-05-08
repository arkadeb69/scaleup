const express = require("express");
const cors = require("cors");
const serverless = require("serverless-http");
const { GoogleGenAI } = require("@google/genai");

const app = express();

// Inside Netlify, env vars are injected from Netlify UI settings automatically.
// We only need dotenv for local testing via netlify dev if we are using it.
if (process.env.NODE_ENV !== 'production') {
  require("dotenv").config();
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json({ limit: "10mb" }));
app.use(cors({ origin: "*" }));

app.post("/.netlify/functions/api/analyze", async (req, res) => {
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

Identify the key skills required for this role. Then, compare them against the resume.
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

Make sure the output is pure JSON. Do not include markdown formatting like \`\`\`json.`;

    const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
        }
    });

    const resultText = response.text;
    const data = JSON.parse(resultText);
    
    res.json(data);
  } catch (error) {
    console.error("Error analyzing resume:", error);
    res.status(500).json({ error: "Failed to analyze resume" });
  }
});

module.exports.handler = serverless(app);
