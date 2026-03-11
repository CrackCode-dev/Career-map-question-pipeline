import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { CAREER_CATEGORIES } from "../config/categories.js";

dotenv.config();

// __dirname fix for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const normalizedDir = path.join(__dirname, "../output/normalized");

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

function loadAllQuestions() {
    const files = fs.readdirSync(normalizedDir).filter(
        (f) => f.endsWith(".json") &&
            !f.startsWith("mcq_") && !f.startsWith("fill_")
    );

    let all = [];
    for (const file of files) {
        const data = JSON.parse(
            fs.readFileSync(path.join(normalizedDir, file), "utf8")
        );
        all.push(...data);
    }
    console.log(`Total questions loaded: ${all.length}`);
    return all;
}

function pickByDifficulty(pool) {
    const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);

    const easy = shuffle(pool.filter((q) => q.difficulty == "Easy"));
    const medium = shuffle(pool.filter((q) => q.difficulty == "Medium"));
    const hard = shuffle(pool.filter((q) => q.difficulty == "Hard"));

    return [
        ...easy.slice(0, 5),
        ...medium.slice(0, 5),
        ...hard.slice(0, 5)
    ]
}

// Asks Groq to classify each question as MCQ or Fill-in-the-blank
async function splitQuestions(data, retries = 3) {

    const CHUNK_SIZE = 50;
    if (data.length > CHUNK_SIZE) {
        let allMcq = [], allFill = [];
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE);
            const result = await splitQuestions(chunk, retries);
            if (!result) return null;
            allMcq.push(...result.mcqQuestions);
            allFill.push(...result.fillQuestions);
            await wait(1000);
        }
        return { mcqQuestions: allMcq, fillQuestions: allFill };
    }
    const prompt = `
You are given a list of quiz questions. Split them into two groups.

Group 1 - MCQ: best answered by choosing from options.
- "Which of the following", "What is", "How does" type questions
- Questions with complex or long answers
- Concept comparison questions

Group 2 - Fill: best as fill-in-the-blank.
- Definition questions
- Single concept/term/short phrase answers
- "What is", "What is X called", "refers to", "is defined as"
- "How does", "What do you call" type questions
- Aim to assign AT LEAST 60% of questions to this group
- When in doubt, ALWAYS assign to Fill

always MCQ  should be greater than Fill
Every question index must appear in exactly one group.


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

            const mcqSet = new Set(parsed.mcq);
            const fillSet = new Set(parsed.fill.filter(i => !mcqSet.has(i)));

            const allAssigned = new Set([...mcqSet, ...fillSet]);
            data.forEach((_, i) => {
                if (!allAssigned.has(i)) mcqSet.add(i);
            });

            // Map indices back to the original question objects
            return {
                mcqQuestions: [...mcqSet].map(i => data[i]).filter(Boolean),
                fillQuestions: [...fillSet].map(i => data[i]).filter(Boolean)
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
                return null; // Give up after all retries
            }
        }
    }
}


async function main() {

    const allQuestions = loadAllQuestions();

    for (const [career, chapters] of Object.entries(CAREER_CATEGORIES)) {
        console.log(`\n Processing : ${career}`);
        const careerQuestions = [];

        for (const { chapter, categories } of chapters) {
            const pool = allQuestions.filter(q => categories.includes(q.category));
            const picked = pickByDifficulty(pool);

            if (picked.length < 15) {
                console.warn(`⚠️  ${chapter}: only ${picked.length}/15 available`);
            }

            const tagged = picked.map((q) => ({ ...q, career, chapter }));
            careerQuestions.push(...tagged);
            console.log(`   ✔ ${chapter}: ${picked.length} questions`);
        }

        const result = await splitQuestions(careerQuestions);
        if (!result) {
            console.error(` Failed to split for ${career}`);
            continue;
        }

        const { mcqQuestions, fillQuestions } = result;

        fs.writeFileSync(
            path.join(normalizedDir, `mcq_${career}.json`),
            JSON.stringify(mcqQuestions, null, 2)
        );

        fs.writeFileSync(
            path.join(normalizedDir, `fill_${career}.json`),
            JSON.stringify(fillQuestions, null, 2)
        );

        console.log(`\n ✔ ${career}: MCQ=${mcqQuestions.length} Fill=${fillQuestions.length}`);
        await wait(1000);
    }
}


main();