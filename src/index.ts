import mongoose from "mongoose";
import { TelegramPublisher } from "./services/TelegramPublisher";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const {
    MONGODB_USER,
    MONGODB_PASSWORD,
    MONGODB_PORT,
    MONGODB_DATABASE,
    NODE_ENV,
  } = process.env;

  const host = NODE_ENV === "production" ? "mongodb" : "localhost";
  const mongoUri = `mongodb://${MONGODB_USER}:${MONGODB_PASSWORD}@${host}:${MONGODB_PORT}/${MONGODB_DATABASE}?authSource=admin`;

  try {
    await mongoose.connect(mongoUri);
    console.log(`Connected to MongoDB at ${host}`);

    const telegramPublisher = new TelegramPublisher();
    await telegramPublisher.start();

    console.log("CryptoSlate parser and Telegram publisher started");
  } catch (error) {
    console.error("Error starting application:", error);
    process.exit(1);
  }
}

main().catch(console.error);
