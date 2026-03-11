//// Import required modules and libraries for file handling, path resolution
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

//Import environment variable support
import dotenv from "dotenv";

//Import database connection functions
import { connectDB, disconnectDB } from "./db/connection.js";

//Import MongoDB models for different careers
import { SoftwareEngineerQ, MLEngineerQ, DataScientistQ } from "./db/models/Question.js";

//Map each career to its corresponding database model
//This allows selecting the correct collection dynamically 
const MODEL_MAP = {
  SoftwareEngineer: SoftwareEngineerQ,
  MLEngineer: MLEngineerQ,
  DataScientist: DataScientistQ,
};

//Load environment variables from .env file
dotenv.config();

//Fix for ES module path handling (since __dirname is not available in ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//Path where genrated question JSON files are stored
const generatedDir = path.join(__dirname, "../output/generated");

// Validate question before saving - FIXED for MCQ
function validateQuestion(q) {
  if (!q.question || q.question.trim() === "") return false;
  if (q.type === "mcq") return !!(q.correctAnswer && q.correctAnswer.trim() !== "");
  if (q.type === "fill") return !!(q.answer && q.answer.trim() !== "");
  return false;
}

// Upload MCQ questions
async function uploadMCQ() {
  const files = fs.readdirSync(generatedDir).filter((f) =>
    f.endsWith(".json") && f.startsWith("mcq_")
  );

  let totalUploaded = 0;

  for (const file of files) {

    // Extract career name from filename (mcq_SoftwareEngineer.json → SoftwareEngineer)
    const career = file.replace("mcq_", "").replace(".json", "");

    //Get the corresponding databse model
    const Model = MODEL_MAP[career];
    if (!Model) {
      console.error(` No model found for career: ${career}`);
      continue;
    }

    const filePath = path.join(generatedDir, file);

    //Read question data from JSON file
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

    console.log(`\n📄 Processing: ${file} (${data.length} questions)`);

    //Validating and clean questions before inserting
    const validQuestions = data.filter(validateQuestion).map((q) => ({
      type: "mcq",
      question: q.question?.trim(),
      correctAnswer: q.correctAnswer?.trim() || q.answer?.trim(),
      wrongAnswers: q.wrongAnswers || [],
      options: q.options || [],
      difficulty: q.difficulty || "Easy",
      category: q.category || "General",
    }));

    console.log(`   Valid questions: ${validQuestions.length}`);

    // Insert or update questions (avoid duplicates using question text)
    for (const q of validQuestions) {
      await Model.updateOne(
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

  //Get files starting with fill_
  const files = fs.readdirSync(generatedDir).filter((f) =>
    f.endsWith(".json") && f.startsWith("fill_")
  );

  let totalUploaded = 0;

  for (const file of files) {
    // Extract career name
    const career = file.replace("fill_", "").replace(".json", "");
    const Model = MODEL_MAP[career];
    if (!Model) { console.warn(`⚠️ No model found for ${career}`); continue; }

    const filePath = path.join(generatedDir, file);
    // Read JSON question data
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));


    console.log(`\n📄 Processing: ${file} (${data.length} questions)`);

    // Validate and prepare questions
    const validQuestions = data.filter(validateQuestion).map((q) => ({
      type: "fill",
      question: q.question?.trim(),
      answer: q.answer?.trim(),
      difficulty: q.difficulty || "Easy",
      category: q.category || "General",
    }));

    // Insert or update questions
    for (const q of validQuestions) {
      await Model.updateOne(
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

// Clear all questions from all collections
async function clearCollections() {

  for (const [career, Model] of Object.entries(MODEL_MAP)) {
    const deleted = await Model.deleteMany({});
    console.log(`🗑 Cleared ${deleted.deletedCount} questions from ${career}`);
  }

}

// Display statistics about each collection
async function showStats() {
  console.log("\n📊 Database Statistics:\n");

  for (const [career, Model] of Object.entries(MODEL_MAP)) {
    const stats = await Model.getStats();
    console.log(`${career} :`, JSON.stringify(stats, null, 2));
  }
}

// Main function
// Controls which operation runs based on CLI command
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "all";

  try {
    //Connect to MongoDB
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
    //Handle any errors
    console.error("❌ Error:", err.message);
  } finally {
    //Always close the databse connection
    await disconnectDB();
  }
}

//Start the script
main();
