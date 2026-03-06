# Career-map-question-pipeline

Reads CSV datasets, generates MCQ and fill-in-the-blank questions for the career map feature using Gemini AI, and uploads them to MongoDB.

---

## Folder Structure
```
career-map-question-pipeline/
├── input/                        
│   ├── dataset1.csv     
│   ├── dataset2.csv           
│   └── dataset3.csv      
├── output/
│   ├── normalized/               
│   └── generated/                
├── src/
│   ├── normalize.js              
│   ├── generate.js               
│   └── upload.js                 
├── config/
│   └── categories.js             
├── logs/                         
├── .env                          
├── .gitignore
├── README.md
└── package.json
```

---

## Setup

1. Clone the repo and run `npm install`
2. Create a `.env` file in the root folder and add:
```
GEMINI_API_KEY=your_gemini_api_key_here
MONGO_URI=your_mongodb_connection_string_here
```

---

## How to Run
```bash
npm run normalize
npm run generate
npm run upload
```