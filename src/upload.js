import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { connectDB, disconnectDB } from "./db/connection.js";
import { careermapMCQ, careermapFillQ } from "./db/models/Question.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generatedDir = path.join(__dirname, "../output/generated");

// Validate question before saving - FIXED for MCQ
function validateQuestion(q) {
  if (!q.question || q.question.trim() === "") return false;
  // Check for answer OR correctAnswer (MCQ uses correctAnswer)
  const hasAnswer = (q.answer && q.answer.trim() !== "") ||
    (q.correctAnswer && q.correctAnswer.trim() !== "");
  return hasAnswer;
}

// Upload MCQ questions
async function uploadMCQ() {
  const files = fs.readdirSync(generatedDir).filter((f) =>
    f.endsWith(".json") && f.startsWith("mcq_")
  );

  let totalUploaded = 0;

  for (const file of files) {
    const filePath = path.join(generatedDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

    console.log(`\n📄 Processing: ${file} (${data.length} questions)`);

    const validQuestions = data.filter(validateQuestion).map((q) => ({
      type: "mcq",
      question: q.question?.trim(),
      answer: q.correctAnswer?.trim() || q.answer?.trim(),
      correctAnswer: q.correctAnswer?.trim() || q.answer?.trim(),
      wrongAnswers: q.wrongAnswers || [],
      options: q.options || [],
      difficulty: q.difficulty || "Easy",
      category: q.category || "General",
    }));

    console.log(`   Valid questions: ${validQuestions.length}`);

    for (const q of validQuestions) {
      await careermapMCQ.updateOne(
        { question: q.question },
        { $set: q },
        { upsert: true }
      );
    }
    console.log(`   ✔ Upserted ${validQuestions.length} MCQ questions`);
    totalUploaded += validQuestions.length;

  }

  return totalUploaded;
}

// Upload Fill questions
async function uploadFill() {
  const files = fs.readdirSync(generatedDir).filter((f) =>
    f.endsWith(".json") && f.startsWith("fill_")
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

    for (const q of validQuestions) {
      await careermapFillQ.updateOne(
        { question: q.question },
        { $set: q },
        { upsert: true }
      );
    }
    console.log(`   ✔ Upserted ${validQuestions.length} Fill questions`);
    totalUploaded += validQuestions.length;
  }

  return totalUploaded;
}

// Clear collections
async function clearCollections() {
  const mcqDeleted = await careermapMCQ.deleteMany({});
  console.log(`🗑 Cleared ${mcqDeleted.deletedCount} MCQ questions`);

  const fillDeleted = await careermapFillQ.deleteMany({});
  console.log(`🗑 Cleared ${fillDeleted.deletedCount} Fill questions`);

}

// Show statistics
async function showStats() {
  console.log("\n📊 Database Statistics:\n");

  const mcqStats = await careermapMCQ.getStats();
  console.log("MCQ Questions:", JSON.stringify(mcqStats, null, 2));

  const fillStats = await careermapFillQ.getStats();
  console.log("\nFill Questions:", JSON.stringify(fillStats, null, 2));

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
        console.log(`\n✔ Summary: MCQ=${mcq}, Fill=${fill}`);
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
