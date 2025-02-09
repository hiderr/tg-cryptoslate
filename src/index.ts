import { CronJob } from "cron";
import mongoose from "mongoose";
import { Parser } from "./services/Parser";
import { ChatGPTService } from "./services/ChatGPT";
import dotenv from "dotenv";
import { SourceArticle } from "./models/SourceArticle";
import { SummarizedArticle } from "./models/SummarizedArticle";
import { TranslatedArticle } from "./models/TranslatedArticle";

dotenv.config();

async function processNewArticles() {
  try {
    const parser = new Parser();
    const chatGPT = new ChatGPTService();

    const newUrls = await parser.getNewArticles();
    console.log(`Найдено ${newUrls.length} новых статей`);

    for (const url of newUrls) {
      try {
        const { title, content } = await parser.parseArticle(url);

        // Сохраняем исходную статью
        const sourceArticle = await SourceArticle.create({
          url,
          title,
          content,
          publishedAt: new Date(),
        });
        console.log(`✅ Статья спаршена: ${title}`);

        // Переводим статью
        const translatedContent = await chatGPT.translateContent(content);

        // Сохраняем переведенную версию
        await TranslatedArticle.create({
          sourceArticleId: sourceArticle._id,
          title: title, // Здесь можно также перевести заголовок при необходимости
          content: translatedContent,
          language: "ru",
        });
        console.log(`✅ Статья переведена: ${title}`);

        // Генерируем и сохраняем краткое содержание
        const summary = await chatGPT.summarizeForTelegram(translatedContent);

        await SummarizedArticle.create({
          sourceArticleId: sourceArticle._id,
          title: title,
          content: summary,
          language: "ru",
          status: "pending",
        });
        console.log(`✅ Статья сокращена: ${title}`);
      } catch (error) {
        console.error(`❌ Ошибка обработки статьи ${url}:`, error);
      }
    }
  } catch (error) {
    console.error("Ошибка в processNewArticles:", error);
  }
}

async function main() {
  const {
    MONGODB_USER,
    MONGODB_PASSWORD,
    MONGODB_PORT,
    MONGODB_DATABASE,
    NODE_ENV,
  } = process.env;

  // Определяем хост в зависимости от окружения
  const host = NODE_ENV === "production" ? "mongodb" : "localhost";
  const mongoUri = `mongodb://${MONGODB_USER}:${MONGODB_PASSWORD}@${host}:${MONGODB_PORT}/${MONGODB_DATABASE}?authSource=admin`;

  try {
    await mongoose.connect(mongoUri);
    console.log(`Connected to MongoDB at ${host}`);

    // Немедленный запуск
    await processNewArticles();

    // Настройка крона для последующих запусков
    const job = new CronJob("*/30 * * * *", processNewArticles);
    job.start();

    console.log("CryptoSlate parser started");
  } catch (error) {
    console.error("Error starting application:", error);
    process.exit(1);
  }
}

// Запускаем main() и обрабатываем ошибки
main().catch(console.error);
