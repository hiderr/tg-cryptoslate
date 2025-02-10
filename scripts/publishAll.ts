import dotenv from "dotenv";
import mongoose from "mongoose";
import { TelegramPublisher } from "../src/services/TelegramPublisher";

dotenv.config();

async function publishAll() {
  let publisher: TelegramPublisher | null = null;

  try {
    console.log("Начало публикации всех статей...");

    const {
      MONGODB_USER,
      MONGODB_PASSWORD,
      MONGODB_PORT,
      MONGODB_DATABASE,
      NODE_ENV,
    } = process.env;

    const host = NODE_ENV === "production" ? "mongodb" : "localhost";
    const mongoUri = `mongodb://${MONGODB_USER}:${MONGODB_PASSWORD}@${host}:${MONGODB_PORT}/${MONGODB_DATABASE}?authSource=admin`;

    await mongoose.connect(mongoUri);
    console.log("✅ Подключено к MongoDB");

    publisher = new TelegramPublisher();
    await publisher.start();

    // Публикуем все статьи
    await publisher.publishAllPending();
  } finally {
    if (publisher) {
      await publisher.stop();
    }
    await mongoose.disconnect();
  }
}

publishAll().catch(console.error);
