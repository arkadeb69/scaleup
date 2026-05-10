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

app.post("/api/v1/feedback", async (req, res) => {
  const { name, email, device, browser, issues, description, severity, refreshFix, contact, suggestions } = req.body;

  if (!name || !email || !description) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error("Missing RESEND_API_KEY");
    return res.status(500).json({ error: "Email configuration error" });
  }

  // 1. Email to the user
  const userEmailHtml = `<p>Hi ${name},</p>
<p>Thank you for taking the time to share your feedback with Resume X AI.</p>
<p>We've successfully received your report and our team will review the issue carefully. Your input helps us improve the accuracy, reliability, and overall experience of the platform.</p>
<p>If additional details are required, we may contact you through this email address.</p>
<p>We appreciate your support and patience while we continue improving Resume X AI for everyone.</p>
<br>
<p>Best regards,<br>Arkadeb Thokdar</p>`;

  // 2. Email to the admin
  const adminEmailHtml = `<h2>New Feedback Received</h2>
<p><strong>Name:</strong> ${name}</p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>Device:</strong> ${device}</p>
<p><strong>Browser:</strong> ${browser}</p>
<p><strong>Issues:</strong> ${Array.isArray(issues) ? issues.join(", ") : issues}</p>
<p><strong>Severity:</strong> ${severity}/5</p>
<p><strong>Refresh Fixed It:</strong> ${refreshFix}</p>
<p><strong>Contact Allowed:</strong> ${contact}</p>
<hr>
<h3>Description:</h3>
<p>${description}</p>
<hr>
<h3>Suggestions:</h3>
<p>${suggestions || "None"}</p>`;

  try {
    // Send to User
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Resume X AI <contact@resumexai.online>',
        to: [email],
        subject: "We've Received Your Feedback — Resume X AI",
        html: userEmailHtml
      })
    });

    // Send to Admin
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Resume X AI System <contact@resumexai.online>',
        to: ['contact@resumexai.online'],
        subject: `New Issue Report: ${severity}/5 Severity`,
        html: adminEmailHtml
      })
    });

    res.json({ success: true, message: "Feedback submitted successfully" });
  } catch (error) {
    console.error("Error sending feedback email:", error);
    res.status(500).json({ error: "Failed to send feedback" });
  }
});


const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log("Server running on http://localhost:" + PORT));
}
module.exports = app;
