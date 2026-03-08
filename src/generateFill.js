import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { generateMissingAnswer } from "./utils.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const inputDir = path.join(__dirname, "../output/normalized");
const outputDir = path.join(__dirname, "../output/generated");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

async function generateFillQuestion(question, answer, retries = 3) {
  const prompt = `
Convert this quiz Q&A into a fill-in-the-blank question.

Question: ${question}
Answer: ${answer}

Rules:
- The answer can be 1, 2, or 3 words — use whatever fits naturally
- Replace ONLY the key concept (the answer) with ___
- Do NOT split a multi-word answer into multiple blanks
- Use a single ___ for the entire answer, even if it is multiple words
- The sentence must make sense when ___ is replaced with the answer

Good examples:
  Answer: "binary search tree"  → "A ___ is a hierarchical data structure with at most two children per node."
  Answer: "linked list"         → "A ___ uses nodes that point to the next element in the sequence."
  Answer: "LIFO"                → "A stack follows ___ order."
  Answer: "stack"               → "A ___ is a data structure that follows Last In First Out order."

Bad examples (never do this):
  ❌ "A ___ ___ ___ is used for searching"   (split into multiple blanks)
  ❌ "A binary ___ tree is hierarchical"      (partial blank)
  ❌ "What is a ___?"                         (just replaced answer in original question)

Return JSON only, no markdown, no backticks:
{
  "fillQuestion": "your question with exactly one ___ here"
}
`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
      });

      const raw     = res.choices[0].message.content.trim();
      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed  = JSON.parse(cleaned);

      const blankCount = (parsed.fillQuestion.match(/___/g) || []).length;
      if (blankCount !== 1) {
        throw new Error(`Expected 1 blank, got ${blankCount}`);
      }

      return parsed.fillQuestion;

    } catch (err) {
      const is429 =
        err.message?.includes("429") ||
        err.message?.includes("rate_limit") ||
        err.status === 429;

      if (is429 && attempt < retries) {
        const delay = 30000 * attempt;
        console.log(`⏳ Rate limited. Waiting ${delay / 1000}s before retry ${attempt}/${retries}...`);
        await wait(delay);
      } else {
        return `${question.replace(/\?$/, "").trim()}: ___`;
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
      answer = await generateMissingAnswer(q.question);
      await wait(1000);
    }

    if (!answer) {
      continue;
    }

    const fillQuestion = await generateFillQuestion(q.question, answer);

    output.push({
      type:       "fill",
      question:   fillQuestion,
      answer:     answer,
      difficulty: q.difficulty,
      category:   q.category,
    });

    await wait(1000);
  }

  // Output filename - replace fill_ prefix if it exists, or add it
  const outputFileName = file.startsWith("fill_") ? file : `fill_${file}`;

  fs.writeFileSync(
    path.join(outputDir, outputFileName),
    JSON.stringify(output, null, 2)
  );

  console.log(`✔ Generated ${outputFileName} with ${output.length} questions`);
  
  return output;
}

async function main() {
  const files = fs.readdirSync(inputDir);
  const allQuestions = [];

  for (const file of files) {
    // Process files that start with fill_ (from selectQuestions.js)
    if (file.startsWith("fill_") && file.endsWith(".json")) {
      const questions = await processFile(file);
      allQuestions.push(...questions);
    }
  }

  // Create a combined dataset file
  if (allQuestions.length > 0) {
    const combinedPath = path.join(outputDir, "fill_dataset.json");
    fs.writeFileSync(combinedPath, JSON.stringify(allQuestions, null, 2));
    console.log(`\n✔ Combined dataset saved: fill_dataset.json (${allQuestions.length} questions)`);
  }
}

main();
