import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema({
  // Question type: "mcq" or "fill"
  type: {
    type: String,
    enum: ["mcq", "fill"],
    required: true,
  },

  // The question text
  question: {
    type: String,
    required: true,
    trim: true,
    unique: true, // Ensure no duplicate questions
  },

  // For Fill: the answer to fill in the blank
  // For MCQ: the correct answer
  answer: {
    type: String,
    required: true,
    trim: true,
  },

  // For MCQ: same as answer (for consistency)
  correctAnswer: {
    type: String,
    trim: true,
  },

  // For MCQ: array of wrong answers
  wrongAnswers: {
    type: [String],
    default: [],
  },

  // For MCQ: shuffled options (correct + wrong)
  options: {
    type: [String],
    default: [],
  },

  // Difficulty level
  difficulty: {
    type: String,
    enum: ["Easy", "Medium", "Hard"],
    default: "Easy",
  },

  // Category
  category: {
    type: String,
    default: "General",
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update timestamp on save
QuestionSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for faster queries
QuestionSchema.index({ type: 1 });
QuestionSchema.index({ category: 1 });
QuestionSchema.index({ difficulty: 1 });
QuestionSchema.index({ type: 1, category: 1, difficulty: 1 });

// Static method: Get random questions
QuestionSchema.statics.getRandom = async function (count = 10, filters = {}) {
  const query = {};
  
  if (filters.type) query.type = filters.type;
  if (filters.category) query.category = filters.category;
  if (filters.difficulty) query.difficulty = filters.difficulty;

  return this.aggregate([
    { $match: query },
    { $sample: { size: count } },
  ]);
};

// Static method: Get questions by category
QuestionSchema.statics.getByCategory = async function (category, limit = 50) {
  return this.find({ category }).limit(limit);
};

// Static method: Get statistics
QuestionSchema.statics.getStats = async function () {
  const totalCount = await this.countDocuments();
  
  const byType = await this.aggregate([
    { $group: { _id: "$type", count: { $sum: 1 } } },
  ]);
  
  const byCategory = await this.aggregate([
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  
  const byDifficulty = await this.aggregate([
    { $group: { _id: "$difficulty", count: { $sum: 1 } } },
  ]);

  return {
    total: totalCount,
    byType: Object.fromEntries(byType.map((x) => [x._id, x.count])),
    byCategory: Object.fromEntries(byCategory.map((x) => [x._id, x.count])),
    byDifficulty: Object.fromEntries(byDifficulty.map((x) => [x._id, x.count])),
  };
};

// Create models for different collections
export const careermapMCQ = mongoose.model("careermapMCQ", QuestionSchema,"careermapMCQ");
export const careermapFillQ = mongoose.model("careermapFillQ", QuestionSchema,"careermapFillQ");
