import dotenv from "dotenv";
import mongoose from "mongoose";
import { TelegramPublisher } from "../src/services/TelegramPublisher";

dotenv.config();

async function testPost() {
  let publisher: TelegramPublisher | null = null;

  try {
    console.log("Начало теста...");

    console.log("Подключение к MongoDB...");
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

    console.log("Инициализация TelegramPublisher...");
    publisher = new TelegramPublisher();

    await publisher.start();
    await publisher.testPost();
  } catch (error) {
    console.error("❌ Ошибка при выполнении теста:", error);
    process.exit(1);
  } finally {
    try {
      if (publisher) {
        console.log("Завершение работы бота...");
        await publisher.stop();
      }
      await mongoose.disconnect();
      console.log("✅ Тест завершен");
      process.exit(0);
    } catch (error) {
      console.error("❌ Ошибка при завершении:", error);
      process.exit(1);
    }
  }
}

// Добавляем обработку необработанных ошибок
process.on("unhandledRejection", (error) => {
  console.error("❌ Необработанная ошибка:", error);
  process.exit(1);
});

testPost().catch((error) => {
  console.error("❌ Ошибка в основном процессе:", error);
  process.exit(1);
});
