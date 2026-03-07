# Career-map-question-pipeline

Reads CSV datasets, generates MCQ and fill-in-the-blank questions for the career map feature using Gemini AI, and uploads them to MongoDB.

---

## Folder Structure
```
career-map-question-pipeline/
├── input/                        
│   ├── dataset1.csv              # Raw quiz dataset 1
│   ├── dataset2.csv              # Raw quiz dataset 2
│   └── dataset3.csv              # Raw quiz dataset 3
├── output/
│   ├── normalized/               # Cleaned and standardized JSON files
│   └── generated/                # Final MCQ and fill-in-the-blank questions
├── src/
│   ├── normalize.js              # Reads CSVs, cleans data, saves to output/normalized
│   ├── generate.js               # Calls Gemini AI, generates questions, saves to output/generated
│   └── upload.js                 # Reads generated questions and uploads to MongoDB
├── config/
│   └── categories.js             # Defines category names used across all scripts
├── logs/                         # Stores error and run logs
├── .env                          # Secret API keys (never push to GitHub)
├── .gitignore                    # Files and folders ignored by Git
├── README.md                     # Project setup and usage instructions
└── package.json                  # Project dependencies and run scripts
```

---

## Setup

1. Clone the repo
```bash
git clone https://github.com/CrackCode-dev/Career-map-question-pipeline.git
cd Career-map-question-pipeline
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` file in the root folder and add:
```
GEMINI_API_KEY=your_gemini_api_key_here
MONGO_URI=your_mongodb_connection_string_here
```

---

## How to Run

**Step 1** — Reads all CSV files from `input/`, cleans and standardizes the data, saves as JSON to `output/normalized/`
```bash
npm run normalize
```

**Step 2** — Reads from `output/normalized/`, calls Gemini AI to generate MCQ and fill-in-the-blank questions, saves to `output/generated/`
```bash
npm run generate
```

**Step 3** — Reads from `output/generated/` and uploads all questions to MongoDB under their category collections
```bash
npm run upload
```

---

## Input CSV Format

Place your CSV files inside the `input/` folder. Supported column names:

| Data | Accepted Column Names |
|---|---|
| Question | `Q`, `question`, `Question` |
| Answer | `Ans`, `answer`, `Answer`, `correct_answer` |
| Difficulty | `difficulty level`, `difficulty`, `Difficulty`, `level` |
| Category | `category of the Q`, `category`, `Category`, `topic` |

> If a dataset has no answers, Gemini AI will generate them automatically.

---

## MongoDB Collections

Data is uploaded into the `careermap_quiz` database with one collection per category:

| Collection | Description |
|---|---|
| `software_engineer` | Software engineering questions |
| `ml_engineer` | Machine learning questions |
| `python_developer` | Python specific questions |