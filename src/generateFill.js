// // Import required modules and libraries for file handling, path resolution
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

//Import environment variable support
import dotenv from "dotenv";

//Import Groq AI SDK
import Groq from "groq-sdk";

//Import utility function to generate missing answer 
import { generateMissingAnswer } from "./utils.js";

// Load environment variables from .env file
dotenv.config();

//Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//Create Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Folder containing normalized question files
const inputDir = path.join(__dirname, "../output/normalized");

// Folder where generated fill questions will be saved
const outputDir = path.join(__dirname, "../output/generated");

//Create output folder if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

//Utility delay function (helps prevent API rate limits)
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

//Convert a question + answer into a fill-in-the-blank format using AI
async function generateFillQuestion(question, answer, retries = 3) {
  //Prompt sent to Ai to rewrite the question
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
  // Retry loop to handle API errors or rate limits
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
      });

      // Extract AI response
      const raw = res.choices[0].message.content.trim();

      // Remove markdown formatting if present
      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      let parsed;

      try {
        // Convert JSON string to object
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error("Invalid JSON returned from AI");
      }

      // Ensure exactly one blank exists
      const blankCount = (parsed.fillQuestion.match(/___/g) || []).length;
      if (blankCount !== 1) {
        throw new Error(`Expected 1 blank, got ${blankCount}`);
      }

      // Return formatted fill question
      return { fillQuestion: parsed.fillQuestion, answer: parsed.answer };

    } catch (err) {
      // Detect API rate limit errors
      const is429 =
        err.message?.includes("429") ||
        err.message?.includes("rate_limit") ||
        err.status === 429;

      if (is429 && attempt < retries) {
        // Wait before retrying
        const delay = 30000 * attempt;
        console.log(`⏳ Rate limited. Waiting ${delay / 1000}s before retry ${attempt}/${retries}...`);
        await wait(delay);
      } else {
        // Fallback if AI fails
        return { fillQuestion: `${question.replace(/\?/, "").trim()} ___?`, answer: answer }; // Fallback: just add a blank at the end
      }
    }
  }
}

//Process one file and generate fil-in blank questions
async function processFile(file) {

  // Read questions from JSON file
  const data = JSON.parse(
    fs.readFileSync(path.join(inputDir, file), "utf8")
  );

  const output = [];

  for (let i = 0; i < data.length; i++) {
    const q = data[i];

    // Skip invalid questions
    if (!q || !q.question) continue;

    console.log(`Generating ${i + 1}/${data.length}: ${q.question}`);

    let answer = q.answer?.trim();

    // Get answer if available
    if (!answer) {
      answer = await generateMissingAnswer(q.question);
      await wait(1000);
    }

    // Skip if still no answer
    if (!answer) {
      continue;
    }

    // Generate fill-in-the-blank version
    const result = await generateFillQuestion(q.question, answer);

    // Save formatted question
    output.push({
      type: "fill",
      question: result.fillQuestion,
      answer: result.answer,
      difficulty: q.difficulty,
      category: q.category,
    });

    await wait(1000);// Small delay to prevent API rate limits
  }

  // Output filename - replace fill_ prefix if it exists, or add it
  // Ensure output filename has fill_ prefix
  const outputFileName = file.startsWith("fill_") ? file : `fill_${file}`;

  console.log(`✔ Generated ${outputFileName} with ${output.length} questions`);

  return output;
}

//Main pipeline function
async function main() {
  // Read all files from normalized directory
  const files = fs.readdirSync(inputDir);

  for (const file of files) {
    // Only process fill question files
    if (file.startsWith("fill_") && file.endsWith(".json")) {
      const questions = await processFile(file);

      if (questions.length > 0) {

        // Extract career name from filename
        // Example: fill_DataScientist.json → DataScientis
        const career = file.replace("fill_", "").replace(".json", "");
        const outputPath = path.join(outputDir, `fill_${career}.json`);

        // Save generated questions
        fs.writeFileSync(outputPath, JSON.stringify(questions, null, 2));
        console.log(`✔ Saved fill_${career}.json (${questions.length} questions)`);
      }
    }
  }
}
// Start the script
main();
