import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputDir = path.join(__dirname, "../input");
const outputDir = path.join(__dirname, "../output/normalized");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function getValue(row, keys) {
  for (let key of keys) {
    if (row[key]) return row[key].trim();
  }
  return "";
}

function processFile(file) {
  const results = [];

  fs.createReadStream(path.join(inputDir, file))
    .pipe(csv())
    .on("data", (row) => {

      const question = getValue(row, ["Q", "Question", "question"]);
      const answer = getValue(row, ["Ans", "Answer", "answer"]);
      const difficulty = getValue(row, ["difficulty level", "Difficulty", "difficulty"]);
      const category = getValue(row, ["category of the Q", "Category", "category"]);

      if (!question) return;

      results.push({
        question,
        answer,
        difficulty: difficulty || "Easy",
        category: category || "general"
      });

    })
    .on("end", () => {

      const outputFile = file.replace(".csv", ".json");

      fs.writeFileSync(
        path.join(outputDir, outputFile),
        JSON.stringify(results, null, 2)
      );

      console.log(`✔ Normalized ${file}`);
    });
}

fs.readdirSync(inputDir).forEach(file => {
  if (file.endsWith(".csv")) {
    processFile(file);
  }
});