import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { connectDB, disconnectDB } from "./db/connection.js";
import { Question, MCQQuestion, FillQuestion } from "./db/models/Question.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generatedDir = path.join(__dirname, "../output/generated");

// Validate question before saving
function validateQuestion(q) {
  if (!q.question || q.question.trim() === "") return false;
  if (!q.answer || q.answer.trim() === "") return false;
  return true;
}

// Upload MCQ questions
async function uploadMCQ() {
  const files = fs.readdirSync(generatedDir).filter((f) =>
    f.endsWith(".json") && (f.startsWith("mcq_") || f === "mcq_dataset.json")
  );

  let totalUploaded = 0;

  for (const file of files) {
    const filePath = path.join(generatedDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

    console.log(`\n📄 Processing: ${file} (${data.length} questions)`);

    const validQuestions = data.filter(validateQuestion).map((q) => ({
      type: "mcq",
      question: q.question?.trim(),
      answer: q.answer?.trim() || q.correctAnswer?.trim(),
      correctAnswer: q.correctAnswer?.trim() || q.answer?.trim(),
      wrongAnswers: q.wrongAnswers || [],
      options: q.options || [],
      difficulty: q.difficulty || "Easy",
      category: q.category || "General",
    }));

    if (validQuestions.length > 0) {
      const result = await MCQQuestion.insertMany(validQuestions);
      console.log(`   ✔ Uploaded ${result.length} MCQ questions`);
      totalUploaded += result.length;
    }
  }

  return totalUploaded;
}

// Upload Fill questions
async function uploadFill() {
  const files = fs.readdirSync(generatedDir).filter((f) =>
    f.endsWith(".json") && (f.startsWith("fill_") || f === "fill_dataset.json")
  );

  let totalUploaded = 0;

  for (const file of files) {
    const filePath = path.join(generatedDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

    console.log(`\n📄 Processing: ${file} (${data.length} questions)`);

    const validQuestions = data.filter(validateQuestion).map((q) => ({
      type: "fill",
      question: q.question?.trim(),
      answer: q.answer?.trim(),
      correctAnswer: q.answer?.trim(),
      wrongAnswers: [],
      options: [],
      difficulty: q.difficulty || "Easy",
      category: q.category || "General",
    }));

    if (validQuestions.length > 0) {
      const result = await FillQuestion.insertMany(validQuestions);
      console.log(`   ✔ Uploaded ${result.length} Fill questions`);
      totalUploaded += result.length;
    }
  }

  return totalUploaded;
}

// Upload all to combined collection
async function uploadAll() {
  const files = fs.readdirSync(generatedDir).filter((f) => f.endsWith(".json"));

  const allQuestions = [];

  for (const file of files) {
    const filePath = path.join(generatedDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

    if (Array.isArray(data)) {
      allQuestions.push(
        ...data.filter(validateQuestion).map((q) => ({
          type: q.type || "mcq",
          question: q.question?.trim(),
          answer: q.answer?.trim() || q.correctAnswer?.trim(),
          correctAnswer: q.correctAnswer?.trim() || q.answer?.trim(),
          wrongAnswers: q.wrongAnswers || [],
          options: q.options || [],
          difficulty: q.difficulty || "Easy",
          category: q.category || "General",
        }))
      );
    }
  }

  if (allQuestions.length > 0) {
    console.log(`\n📄 Uploading ${allQuestions.length} questions to combined collection`);
    const result = await Question.insertMany(allQuestions);
    console.log(`   ✔ Uploaded ${result.length} questions`);
    return result.length;
  }

  return 0;
}

// Clear collections
async function clearCollections() {
  const mcqDeleted = await MCQQuestion.deleteMany({});
  console.log(`🗑 Cleared ${mcqDeleted.deletedCount} MCQ questions`);

  const fillDeleted = await FillQuestion.deleteMany({});
  console.log(`🗑 Cleared ${fillDeleted.deletedCount} Fill questions`);

  const allDeleted = await Question.deleteMany({});
  console.log(`🗑 Cleared ${allDeleted.deletedCount} from combined collection`);
}

// Show statistics
async function showStats() {
  console.log("\n📊 Database Statistics:\n");

  const mcqStats = await MCQQuestion.getStats();
  console.log("MCQ Questions:", JSON.stringify(mcqStats, null, 2));

  const fillStats = await FillQuestion.getStats();
  console.log("\nFill Questions:", JSON.stringify(fillStats, null, 2));

  const allStats = await Question.getStats();
  console.log("\nAll Questions:", JSON.stringify(allStats, null, 2));
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "all";

  try {
    await connectDB();

    switch (command) {
      case "mcq":
        console.log("\n📤 Uploading MCQ questions...");
        const mcqCount = await uploadMCQ();
        console.log(`\n✔ Total MCQ uploaded: ${mcqCount}`);
        break;

      case "fill":
        console.log("\n📤 Uploading Fill questions...");
        const fillCount = await uploadFill();
        console.log(`\n✔ Total Fill uploaded: ${fillCount}`);
        break;

      case "all":
        console.log("\n📤 Uploading all questions...");
        const mcq = await uploadMCQ();
        const fill = await uploadFill();
        const all = await uploadAll();
        console.log(`\n✔ Summary: MCQ=${mcq}, Fill=${fill}, Combined=${all}`);
        break;

      case "clear":
        console.log("\n🗑 Clearing all collections...");
        await clearCollections();
        break;

      case "stats":
        await showStats();
        break;

      default:
        console.log(`
Usage: node src/upload.js [command]

Commands:
  mcq     - Upload only MCQ questions
  fill    - Upload only Fill questions
  all     - Upload all questions (default)
  clear   - Clear all collections
  stats   - Show collection statistics
        `);
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await disconnectDB();
  }
}

main();
