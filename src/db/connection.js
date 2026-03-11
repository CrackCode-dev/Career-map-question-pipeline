// MongoDB object modeling library
import mongoose from "mongoose";

////Import environment variable support
import dotenv from "dotenv";

//Load environment variables from .env file
dotenv.config();

const MONGODB_URI = process.env.MONGO_URI ;

let isConnected = false;

// Connect to MongoDB
export async function connectDB() {
  if (isConnected) {
    console.log("📦 Using existing MongoDB connection");
    return;
  }

  try {

    const db = await mongoose.connect(MONGODB_URI);

    isConnected = db.connections[0].readyState === 1;
    console.log("✔ Connected to MongoDB");
    
    return db;
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    throw err;
  }
}

// Disconnect from MongoDB
export async function disconnectDB() {
  if (!isConnected) return;

  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log("✔ Disconnected from MongoDB");
  } catch (err) {
    console.error("❌ Error disconnecting:", err.message);
  }
}

// Get connection status
export function getConnectionStatus() {
  return {
    isConnected,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name,
  };
}

export default { connectDB, disconnectDB, getConnectionStatus };
