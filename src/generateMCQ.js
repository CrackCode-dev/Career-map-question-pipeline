// Import required modules and libraries for file handling, path resolution
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

//Import environment variable support
import dotenv from "dotenv";

//Import Groq AI SDK
import Groq from "groq-sdk";

//Import utility function to generate missing answer for MCQ questions
import { generateMissingAnswerMCQ } from "./utils.js";

// Load environment variables from .env file
dotenv.config();

//Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

//Input folder containing normalized MCQ question files
const inputDir = path.join(__dirname, "../output/normalized");
//Output folder for generated MCQ question files
const outputDir = path.join(__dirname, "../output/generated");

//Create output folder if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Utility function to pause execution (helps avoid API rate limits)
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

//Shuffle option so the correct answer is not always first
function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

//Genrate 3 wrong answers using AI
async function generateWrongAnswers(question, answer, retries = 3) {
  //Prompt sent AI to generate plausible wrong answers
  const prompt = `
You are a quiz question designer. Generate 3 wrong answers for this multiple choice question.

Question: ${question}
Correct Answer: ${answer}

Rules:
- If the correct answer is longer than 15 words, first rephrase it into a concise version (max 15 words) keeping the core meaning, then use that rephrased version as the correctAnswer in your response.the response should not be short also like 1-4 words
- Wrong answers MUST be about the SAME topic and concept as the question
- Wrong answers MUST be the same type as the correct answer (if answer is a term, wrong answers are terms; if answer is a sentence, wrong answers are sentences)
- Wrong answers MUST be similar in length to the correct answer (within 3-5 words difference)
- Wrong answers must be plausible — something a student who hasn't studied might choose
- Wrong answers must be clearly wrong to someone who knows the topic
- NEVER use "None of the above", "All of the above", "Not applicable"
- NEVER use answers from unrelated topics
- NEVER make one answer obviously longer or shorter than the others

Example 1:
Question: "What data structure follows LIFO order?"
Correct: "Stack"
Wrong: ["Queue", "Heap", "Linked List"]

Example 2:
Question: "What is overfitting in machine learning?"
Correct: "When a model learns training data too well and performs poorly on new data"
Wrong: ["When a model fails to learn patterns from the training data",
        "When a model performs equally well on training and test data",
        "When a model is trained on insufficient data samples"]

Return JSON only, no markdown, no backticks:
{
  "correctAnswer": "rephrased or original correct answer here",
  "wrongAnswers": ["a", "b", "c"]
}
`;

  // Retry loop in case of rate limit or API errors
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
      return { correctAnswer: parsed.correctAnswer, wrongAnswers: parsed.wrongAnswers };

    } catch (err) {
      // Detect rate limit errors
      const is429 =
        err.message?.includes("429") ||
        err.message?.includes("rate_limit") ||
        err.status === 429;

      if (is429 && attempt < retries) {
        // Wait longer before retrying
        const delay = 30000 * attempt; // 30s → 60s → 90s
        console.log(`⏳ Rate limited. Waiting ${delay / 1000}s before retry ${attempt}/${retries}...`);
        await wait(delay);

      } else {
        // Fallback answers if AI fails
        console.log("AI error, using fallback:", err.message);
        return { correctAnswer: answer, wrongAnswers: ["None of the above", "All of the above", "Not applicable"] };
      }
    }
  }
}

//Process one MCQ file and genrate options
async function processFile(file) {
  // Read questions from input JSON
  const data = JSON.parse(
    fs.readFileSync(path.join(inputDir, file), "utf8")
  );

  const output = [];

  for (let i = 0; i < data.length; i++) {
    const q = data[i];

    if (!q || !q.question) continue;

    console.log(`Generating ${i + 1}/${data.length}: ${q.question}`);

    // Get correct answer if available
    let answer = q.answer?.trim();

    // If answer is missing, generate using AI
    if (!answer) {
      answer = await generateMissingAnswerMCQ(q.question);
      await wait(1000);
    }

    // Skip if still no answer
    if (!answer) {
      continue;
    }

    //Generate wrong answers
    const result = await generateWrongAnswers(q.question, answer);

    //Combine correct and wrong answers, then shuffle
    const options = shuffle([result.correctAnswer || answer, ...result.wrongAnswers]);

    //Create final MCQ object
    output.push({
      type: "mcq",
      question: q.question,
      correctAnswer: result.correctAnswer || answer,
      wrongAnswers: result.wrongAnswers,
      options: options,
      difficulty: q.difficulty,
      category: q.category,
    });

    await wait(1000); // 1s delay — Groq is much faster and more generous than Gemini free tier
  }

  console.log(`✔ Processed ${file}(${output.length} questions)`);
  return output;
}

//Main pipeline function
async function main() {

  // Read all files from normalized folder
  const files = fs.readdirSync(inputDir);

  for (const file of files) {
    // Only process MCQ files
    if (file.startsWith("mcq_") && file.endsWith(".json")) {
      const questions = await processFile(file);

      if (questions.length > 0) {
        // Extract career name from filename
        // Example: mcq_DataScientist.json → DataScientist
        const career = file.replace("mcq_", "").replace(".json", "");
        const outputPath = path.join(outputDir, `mcq_${career}.json`);

        // Save generated MCQ questions
        fs.writeFileSync(outputPath, JSON.stringify(questions, null, 2));
        console.log(`✔ Saved mcq_${career}.json (${questions.length} questions)`);
      }
    }
  }
}
// Start the script
main();
