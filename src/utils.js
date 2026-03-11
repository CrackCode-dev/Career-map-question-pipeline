//Import Groq AI SDK
import Groq from "groq-sdk";

//Import environment variable support
import dotenv from "dotenv";

//load environment variables from .env file
dotenv.config();

// Create a Groq client using the API key from environment variables
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Utility function to pause execution for a given number of milliseconds
// Used when retrying after rate limit errors
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

//Function to generate a missing answer for MCQ questions.
export async function generateMissingAnswerMCQ(question, retries = 3) {

  //Prompt sent to the Ai model to generate the answer for the MCQ question.
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

  //Retry loop in case of errors(like rate limits)
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {

      //Send rquest to Groq AI model
      const res = await groq.chat.completions.create({
        //AI model used
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      });

      //Get the raw text response from the AI
      const raw = res.choices[0].message.content.trim();
      //Remove markdown formatting if the AI accidentally returns it.
      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();

      let parsed;

      try {
        //Convert  JSON strinng into a JavaScript object
        parsed = JSON.parse(cleaned);
      } catch (e) {
        //If JSON parsing fails, throw an error
        throw new Error("Invalid JSON returned from AI");
      }

      //Validate that an answer exists
      if (!parsed.answer || parsed.answer.trim() === "") {
        throw new Error("Empty answer returned");
      }
      //Return the cleaned answer
      return parsed.answer.trim();

      //Detect if the error is due to rate limiting (HTTP 429)
    } catch (err) {
      const is429 =
        err.message?.includes("429") ||
        err.message?.includes("rate_limit") ||
        err.status === 429;

      //If rate limit and retries still available
      if (is429 && attempt < retries) {
        const delay = 30000 * attempt;
        await wait(delay);
      } else {
        //IF another error or retries finished - return null
        return null;
      }
    }
  }
}

//Function to genrate short answers for fill-in questions
export async function generateMissingAnswer(question, retries = 3) {
  //Prompt designed apecifically for fill-in blank answers 
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

  //Retry loop in case of errors(like rate limits)
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      //Send rquest to Groq AI model
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      });

      //Extract AI response
      const raw = res.choices[0].message.content.trim();

      //Remove markdown if present
      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      let parsed;

      try {
        //Convert JSON text to object
        parsed = JSON.parse(cleaned);
      } catch (e) {
        throw new Error("Invalid JSON returned from AI");
      }

      //Handles cases where AI returns "Answer" instead of "answer"
      const answer = parsed.answer || parsed.Answer;

      //Validate answer
      if (!answer || answer.trim() === "") {
        throw new Error("Empty answer returned");
      }

      //Return the final trimmed answer
      return answer.trim();

      //Check if error is rate limit or other error
    } catch (err) {
      const is429 =
        err.message?.includes("429") ||
        err.message?.includes("rate_limit") ||
        err.status === 429;

      //Retry if rate limit occurred
      if (is429 && attempt < retries) {

        //Exponential wait time before retry
        const delay = 30000 * attempt;
        await wait(delay);
      } else {

        //If retries exhausted or different error return null
        return null;
      }
    }
  }
}