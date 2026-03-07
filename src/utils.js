import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

export async function generateMissingAnswerMCQ(question, retries = 3) {
  const prompt = `
Answer this quiz question.

Question: ${question}

Rules:
- Give the correct answer as you would see it in a multiple choice quiz
- Can be a word, phrase or short sentence
- No explanations, just the answer

Return JSON only, no markdown, no backticks:
{
  "answer": "your answer here"
}
`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      });

      const raw     = res.choices[0].message.content.trim();
      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed  = JSON.parse(cleaned);

      if (!parsed.answer || parsed.answer.trim() === "") {
        throw new Error("Empty answer returned");
      }

      return parsed.answer.trim();

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

export async function generateMissingAnswer(question, retries = 3) {
  const prompt = `
Answer this quiz question with a short answer suitable for a fill-in-the-blank question.

Question: ${question}

Rules:
- Answer must be 1 to 3 words only
- It will be used to fill a blank in a sentence, so keep it as a key term or concept
- No full sentences, no explanations

Return JSON only, no markdown, no backticks:
{
  "answer": "your short answer here"
}
`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      });

      const raw     = res.choices[0].message.content.trim();
      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed  = JSON.parse(cleaned);

      if (!parsed.answer || parsed.answer.trim() === "") {
        throw new Error("Empty answer returned");
      }

      return parsed.answer.trim();

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