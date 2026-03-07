import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { generateMissingAnswerMCQ } from "./utils.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const inputDir = path.join(__dirname, "../output/normalized");
const outputDir = path.join(__dirname, "../output/generated");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

async function generateWrongAnswers(question, answer, retries = 3) {
  const prompt = `
Generate 3 wrong answers for this quiz question.

Question: ${question}
Correct Answer: ${answer}

Return JSON only, no markdown, no backticks:

{
  "wrongAnswers": ["a", "b", "c"]
}
`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });

      const raw = res.choices[0].message.content.trim();

      // Strip markdown code fences just in case
      const cleaned = raw
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      return parsed.wrongAnswers;

    } catch (err) {
      const is429 =
        err.message?.includes("429") ||
        err.message?.includes("rate_limit") ||
        err.status === 429;

      if (is429 && attempt < retries) {
        const delay = 30000 * attempt; // 30s → 60s → 90s
        console.log(`⏳ Rate limited. Waiting ${delay / 1000}s before retry ${attempt}/${retries}...`);
        await wait(delay);
      } else {
        console.log("AI error, using fallback:", err.message);
        return ["None of the above", "All of the above", "Not applicable"];
      }
    }
  }
}

async function processFile(file) {
  const data = JSON.parse(
    fs.readFileSync(path.join(inputDir, file), "utf8")
  );

  const output = [];

  for (let i = 0; i < data.length; i++) {
    const q = data[i];

    console.log(`Generating ${i + 1}/${data.length}: ${q.question}`);

    let answer = q.answer?.trim();

    if (!answer) {
      answer = await generateMissingAnswerMCQ(q.question);
      await wait(1000);
    }

    if (!answer) {
      continue;
    }

    const wrongAnswers = await generateWrongAnswers(q.question, answer);

    const options = shuffle([answer, ...wrongAnswers]);

    output.push({
      question: q.question,
      correctAnswer: answer,
      wrongAnswers: wrongAnswers,
      options: options,
      difficulty: q.difficulty,
      category: q.category,
    });

    await wait(1000); // 1s delay — Groq is much faster and more generous than Gemini free tier
  }

  fs.writeFileSync(
    path.join(outputDir, file),
    JSON.stringify(output, null, 2)
  );

  console.log(`✔ Generated ${file}`);
}

async function main() {
  const files = fs.readdirSync(inputDir);

  for (const file of files) {
    if (file.endsWith(".json")) {
      await processFile(file);
    }
  }
}

main();
