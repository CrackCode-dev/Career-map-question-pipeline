# Career Map Question Pipeline

A Node.js pipeline that reads CSV datasets, selects and classifies questions by career path, generates MCQ and fill-in-the-blank questions using Groq AI (LLaMA 3.3 70B), and uploads them to MongoDB.


---

## Overview

This pipeline processes raw quiz question datasets and transforms them into structured, AI-enhanced MCQ and fill-in-the-blank questions tailored for three career tracks:

- **Software Engineer**
- **ML Engineer**
- **Data Scientist**

Each career is divided into chapters, and questions are selected, classified, and enriched using Groq's LLaMA 3.3 70B model before being uploaded to MongoDB.

---

## Folder Structure

```
career-map-question-pipeline/
├── input/                  # Raw CSV datasets
├── output/
│   ├── normalized/         # Cleaned JSON files
│   └── generated/          # Final MCQ and fill questions
├── src/
│   ├── normalize.js
│   ├── selectQuestions.js
│   ├── generateMCQ.js
│   ├── generateFill.js
│   ├── upload.js
│   ├── utils.js
│   └── db/
│       ├── connection.js
│       └── models/
│           └── Question.js
├── config/
│   └── categories.js
├── logs/
├── .env
├── package.json
└── README.md
```

---

## Prerequisites

- **Node.js** v16.20.1 or higher
- **npm** v8+
- A **Groq API key** — [Get one free at console.groq.com](https://console.groq.com)
- A **MongoDB** instance (local or Atlas)

---

## Setup

**1. Clone the repository**
```bash
git clone https://github.com/CrackCode-dev/Career-map-question-pipeline.git
cd Career-map-question-pipeline
```

**2. Install dependencies**
```bash
npm install
```

**3. Create a `.env` file** in the root folder (see below)

**4. Place your CSV files** inside the `input/` folder

---

## Environment Variables

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
MONGO_URI=your_mongodb_connection_string_here
```

> ⚠️ Never commit `.env` to version control. It is already excluded via `.gitignore`.

---

## How to Run

You can run each stage individually or run the full pipeline in one command.

### Full Pipeline (all steps in sequence)
```bash
npm run pipeline
```

### Individual Steps

| Step | Command | Description |
|------|---------|-------------|
| 1 | `npm run normalize` | Parse CSVs → clean JSON in `output/normalized/` |
| 2 | `npm run select` | Select 15 questions/chapter, split MCQ vs Fill |
| 3 | `npm run generateMCQ` | Generate 3 wrong answers per MCQ question |
| 4 | `npm run generateFill` | Convert Q&A into fill-in-the-blank format |
| 5 | `npm run upload` | Upload all generated questions to MongoDB |

---

## Pipeline Stages

### Stage 1 — `normalize.js`
- Reads all `.csv` files from `input/`
- Extracts `question`, `answer`, `difficulty`, and `category` fields using flexible column name matching
- Saves a corresponding `.json` file in `output/normalized/`

### Stage 2 — `selectQuestions.js`
- Loads all normalized JSON files
- For each career (SoftwareEngineer, MLEngineer, DataScientist):
  - Iterates over chapters defined in `config/categories.js`
  - Picks **5 Easy + 5 Medium + 5 Hard** questions per chapter
  - Sends the chapter's questions to Groq AI for MCQ vs Fill classification
  - Saves `mcq_<Career>.json` and `fill_<Career>.json` to `output/normalized/`

### Stage 3 — `generateMCQ.js`
- Reads `mcq_*.json` files from `output/normalized/`
- For each question:
  - Generates a missing answer via AI if none exists
  - Generates 3 plausible wrong answers using AI
  - Shuffles all 4 options randomly
- Saves final MCQ data to `output/generated/mcq_<Career>.json`

### Stage 4 — `generateFill.js`
- Reads `fill_*.json` files from `output/normalized/`
- For each question:
  - Generates a missing short answer via AI if none exists
  - Rewrites the Q&A as a fill-in-the-blank sentence with exactly one `___`
  - Enforces that the answer is 1–3 words (a key term or concept)
- Saves final fill data to `output/generated/fill_<Career>.json`

### Stage 5 — `upload.js`
- Connects to MongoDB
- Reads all `mcq_*.json` and `fill_*.json` from `output/generated/`
- Validates each question before insertion
- Uses **upsert** (insert or update) to avoid duplicates based on question text
- Routes each file to the correct MongoDB collection via `MODEL_MAP`

---

## Input CSV Format

Place CSV files inside `input/`. The normalizer accepts multiple column name variants:

| Field | Accepted Column Names |
|-------|-----------------------|
| Question | `Q`, `question`, `Question` |
| Answer | `Ans`, `answer`, `Answer`, `correct_answer` |
| Difficulty | `difficulty level`, `difficulty`, `Difficulty`, `level` |
| Category | `category of the Q`, `category`, `Category`, `topic` |

**Example row (dataset1.csv style):**
```
Question Number,Question,Answer,Category,Difficulty
1,What is a variable in programming?,A variable is a named storage location...,General Programming,Easy
```

**Example row (dataset2.csv style — no answers):**
```
id,question,difficulty,category,date
1,What is the bias-variance tradeoff?,Hard,Machine Learning,2025-05-01
```

> If a dataset has no answers, Groq AI will generate them automatically during the generate stages.

---

## Career & Category Mapping

Defined in `config/categories.js`:

```
SoftwareEngineer
├── Object Oriented Programming       → General Programming, Languages and Frameworks
├── Data Structures and Algorithms    → Data Structures, Algorithms
├── Web Development & Security        → Web Development, Security
└── DevOps & System Design            → System Design, DevOps

MLEngineer
├── Machine Learning Fundamentals     → Machine Learning
├── Deep Learning & Neural Networks   → Deep Learning
├── MLOps & Deployment                → DevOps, Version Control, Data Engineering
└── ML System Design                  → Algorithms, System Design

DataScientist
├── Data Science & Statistics         → Data Science
├── Machine Learning for Data Science → Machine Learning
├── Database & Data Management        → Database and SQL, Database Systems
└── Data Engineering & Infrastructure → Data Engineering, Distributed Systems
```

Each chapter selects **15 questions** (5 Easy, 5 Medium, 5 Hard) from its assigned categories.

---

## Database Schema

All questions share a single Mongoose schema stored across three collections:

```js
{
  type:          String,   // "mcq" or "fill"
  question:      String,   // Unique question text
  answer:        String,   // Fill-in-the-blank answer (fill only)
  correctAnswer: String,   // Correct option (mcq only)
  wrongAnswers:  [String], // 3 wrong options (mcq only)
  options:       [String], // All 4 shuffled options (mcq only)
  difficulty:    String,   // "Easy" | "Medium" | "Hard"
  category:      String,   // e.g. "Machine Learning"
  createdAt:     Date,
  updatedAt:     Date
}
```

**Indexes** are applied on `type`, `category`, `difficulty`, and a compound index on all three for fast querying.

**Static methods available on each model:**

| Method | Description |
|--------|-------------|
| `getRandom(count, filters)` | Get random questions with optional type/category/difficulty filters |
| `getByCategory(category, limit)` | Get questions for a specific category |
| `getStats()` | Get counts broken down by type, category, and difficulty |

---

## MongoDB Collections

Data is uploaded to the `careermap_quiz` database (or whichever DB is in your `MONGO_URI`):

| Collection | Career | Description |
|------------|--------|-------------|
| `SoftwareEngineerQ` | Software Engineer | DSA, OOP, Web Dev, Security, DevOps |
| `MLEngineerQ` | ML Engineer | ML, Deep Learning, MLOps, System Design |
| `DataScientistQ` | Data Scientist | Data Science, ML, Databases, Data Engineering |

---

## Upload Commands

The `upload.js` script supports CLI arguments for selective operations:

```bash
# Upload everything (default)
npm run upload

# Upload only MCQ questions
node src/upload.js mcq

# Upload only fill-in-the-blank questions
node src/upload.js fill

# Clear all collections
node src/upload.js clear

# Show collection statistics
node src/upload.js stats
```

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `groq-sdk` | ^0.5.0 | Groq AI API client (LLaMA 3.3 70B) |
| `mongoose` | ^8.0.0 | MongoDB ODM / schema management |
| `mongodb` | ^7.1.0 | MongoDB native driver |
| `csv-parser` | ^3.0.0 | Streaming CSV file parsing |
| `dotenv` | ^16.3.1 | Environment variable loading |

---

## Notes

- The pipeline retries up to 3 times on Groq `429` rate limit errors with exponential backoff (30s, 60s, 90s).
- Re-running the pipeline is safe — questions are upserted, so no duplicates are created.
- Questions that fail AI generation are skipped without crashing the pipeline.
- If you hit rate limits, swap `GROQ_API_KEY` in `.env` with a different key and re-run the generate script to continue from where it left off.