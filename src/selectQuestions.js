import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, });

const normalizedDir = path.join(__dirname, "../output/normalized");

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

async function splitQuestions(data, retries = 3) {
    const prompt = `
You are given a list of quiz questions. Split them into two groups.

Group 1 - MCQ: best answered by choosing from options.
- "Which of the following", "What is", "How does" type questions
- Questions with complex or long answers
- Concept comparison questions

Group 2 - Fill: best as fill-in-the-blank.
- Definition questions with a single key term as the answer
- "What is called", "refers to" type questions
- Questions where the answer is 1 to 3 words

Every question index must appear in exactly one group.
Assign approximately 60% to MCQ and 40% to Fill.

Questions:
${data.map((q, i) => `${i}: ${q.question}`).join("\n")}

Return JSON only, no markdown, no backticks:
{
  "mcq": [0, 1, 3],
  "fill": [2, 4, 5]
}
`;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2,
            });
            const raw = res.choices[0].message.content.trim();
            const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleaned);

            return{
                mcqQuestions: parsed.mcq.map(i => data[i]).filter(Boolean),
                fillQuestions: parsed.fill.map(i => data[i]).filter(Boolean)
            };

        } catch (err) {
            const is429 =
                err.message?.includes("429") ||
                err.message?.includes("rate_limit") ||
                err.status === 429; 

            if (is429 && attempt < retries) {
                const delay = 30000 * attempt;
                await wait(delay);
            } else {
                return null;
            }
        }
    }
}

async function processFile(file) {
    const data = JSON.parse(    fs.readFileSync(path.join(normalizedDir, file), "utf8") );

    const result = await splitQuestions(data);

    if (!result) return ;

    const { mcqQuestions, fillQuestions } = result;

    fs.writeFileSync(
        path.join(normalizedDir, `mcq_${file}`),
    JSON.stringify(mcqQuestions, null, 2)
  );

  fs.writeFileSync(
    path.join(normalizedDir, `fill_${file}`),
    JSON.stringify(fillQuestions, null, 2)
  );

  console.log(`✔ ${file} → mcq_${file} (${mcqQuestions.length}) + fill_${file} (${fillQuestions.length})`);
}

async function main() {
  const files = fs.readdirSync(normalizedDir);

  for (const file of files) {
    if (file.endsWith(".json") && !file.startsWith("mcq_") && !file.startsWith("fill_")) {
      await processFile(file);
      await wait(1000);
    }
  }
}

main();
