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
    MONGODB_HOST,
  } = process.env;

  // Проверяем наличие всех необходимых переменных
  if (!MONGODB_USER || !MONGODB_PASSWORD || !MONGODB_DATABASE) {
    throw new Error("Не все переменные окружения для MongoDB установлены");
  }

  // Формируем URI для подключения
  const mongoUri = `mongodb://${MONGODB_USER}:${MONGODB_PASSWORD}@${MONGODB_HOST}:${MONGODB_PORT}/${MONGODB_DATABASE}?authSource=admin`;

  console.log(`🔄 Подключение к MongoDB на хосте: ${MONGODB_HOST}`);

  try {
    console.log("📡 Попытка подключения к MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Подключено к MongoDB");

    const telegramPublisher = new TelegramPublisher();
    await telegramPublisher.start();

    console.log("🚀 CryptoSlate парсер и Telegram паблишер запущены");
  } catch (error) {
    console.error("❌ Ошибка при запуске приложения:", error);

    if (error instanceof Error) {
      console.error("Детали ошибки:", {
        message: error.message,
        stack: error.stack,
        cause: (error as any).cause,
      });
    }

    process.exit(1);
  }
}

// Добавляем обработку необработанных ошибок
process.on("unhandledRejection", (error) => {
  console.error("❌ Необработанная ошибка:", error);
  process.exit(1);
});

main().catch((error) => {
  console.error("❌ Ошибка в основном процессе:", error);
  process.exit(1);
});
