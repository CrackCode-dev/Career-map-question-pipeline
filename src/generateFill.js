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
You are a quiz question designer. Convert this Q&A into a fill-in-the-blank question.

Question: ${question}
Answer: ${answer}

Rules:
- The answer MUST be 1, 2, or 3 words ONLY — never a full sentence
- Extract ONLY the key concept/term as the answer
- Replace ONLY that key term with ___
- Do NOT split a multi-word answer into multiple blanks
- Use a single ___ for the entire answer, even if it is multiple words
- The sentence must make sense when ___ is replaced with the answer
- Do NOT just replace the answer in the original question — rewrite it as a clear statement
- The sentence must be directly related to the topic of the question
- Give enough context in the sentence so the blank can be reasonably guessed

Good examples:
  Answer: "binary search tree"  → "A ___ is a hierarchical data structure with at most two children per node."
  Answer: "linked list"         → "A ___ uses nodes that point to the next element in the sequence."
  Answer: "LIFO"                → "A stack follows ___ order."
  Answer: "stack"               → "A ___ is a data structure that follows Last In First Out order."
  Answer: "backpropagation"     → "Neural networks use ___ to calculate gradients and update weights during training."
  Answer: "overfitting"         → "___ occurs when a model learns training data too well and fails on new data."

Bad examples (never do this):
  ❌ "A ___ ___ ___ is used for searching"   (split into multiple blanks)
  ❌ "A binary ___ tree is hierarchical"      (partial blank)
  ❌ "What is a ___?"                         (just replaced answer in original question)
  ❌ "The answer to this question is ___."    (no context)

Return JSON only, no markdown, no backticks:
{
  "fillQuestion": "your question with exactly one ___ here",
  "answer": "1-3 word key term only"
}
`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
      });

      const raw = res.choices[0].message.content.trim();
      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      let parsed;

      try {
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error("Invalid JSON returned from AI");
      }

      const blankCount = (parsed.fillQuestion.match(/___/g) || []).length;
      if (blankCount !== 1) {
        throw new Error(`Expected 1 blank, got ${blankCount}`);
      }

      return { fillQuestion: parsed.fillQuestion, answer: parsed.answer };

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
        return { fillQuestion: `${question.replace(/\?/, "").trim()} ___?`, answer: answer }; // Fallback: just add a blank at the end
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

    if (!q || !q.question) continue;

    console.log(`Generating ${i + 1}/${data.length}: ${q.question}`);

    let answer = q.answer?.trim();

    if (!answer) {
      answer = await generateMissingAnswer(q.question);
      await wait(1000);
    }

    if (!answer) {
      continue;
    }

    const result = await generateFillQuestion(q.question, answer);

    output.push({
      type: "fill",
      question: result.fillQuestion,
      answer: result.answer,
      difficulty: q.difficulty,
      category: q.category,
    });

    await wait(1000);
  }

  // Output filename - replace fill_ prefix if it exists, or add it
  const outputFileName = file.startsWith("fill_") ? file : `fill_${file}`;

  console.log(`✔ Generated ${outputFileName} with ${output.length} questions`);

  return output;
}

async function main() {
  const files = fs.readdirSync(inputDir);

  for (const file of files) {
    if (file.startsWith("fill_") && file.endsWith(".json")) {
      const questions = await processFile(file);

      if (questions.length > 0) {
        // Extract career name from file: "fill_DataScientist.json" → "DataScientist"
        const career = file.replace("fill_", "").replace(".json", "");
        const outputPath = path.join(outputDir, `fill_${career}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(questions, null, 2));
        console.log(`✔ Saved fill_${career}.json (${questions.length} questions)`);
      }
    }
  }
}

main();
