import { Telegraf } from "telegraf";
import {
  ISummarizedArticle,
  SummarizedArticle,
} from "../models/SummarizedArticle";
import * as dotenv from "dotenv";
import { CronJob } from "cron/dist/job";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";

dotenv.config();

export class TelegramPublisher {
  private bot: Telegraf;
  private channelId: string;
  private postsPerDay: number;
  private publishingHours: number[];
  private tempDir: string;

  constructor() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN не указан в .env");
    }

    if (!process.env.TELEGRAM_CHANNEL_ID) {
      throw new Error("TELEGRAM_CHANNEL_ID не указан в .env");
    }

    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.channelId = process.env.TELEGRAM_CHANNEL_ID;
    this.postsPerDay = Number(process.env.POSTS_PER_DAY) || 6;
    this.publishingHours = this.calculatePublishingHours();
    this.tempDir = path.join(__dirname, "../../temp");

    // Создаем временную директорию, если её нет
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Добавляем обработчики ошибок
    this.bot.catch((err) => {
      console.error("❌ Ошибка в боте:", err);
    });

    process.once("SIGINT", () => this.stop());
    process.once("SIGTERM", () => this.stop());
  }

  private calculatePublishingHours(): number[] {
    // Распределяем посты равномерно в промежутке с 9:00 до 21:00
    const startHour = 9;
    const endHour = 21;
    const interval = (endHour - startHour) / (this.postsPerDay - 1);

    return Array.from({ length: this.postsPerDay }, (_, i) => {
      return Math.round(startHour + i * interval);
    });
  }

  private async downloadImage(url: string): Promise<string> {
    console.log(`Скачивание изображения: ${url}`);
    try {
      const response = await axios.get(url, { responseType: "arraybuffer" });
      const extension = path.extname(url) || ".jpg";
      const fileName = `${uuidv4()}${extension}`;
      const filePath = path.join(this.tempDir, fileName);

      await fs.promises.writeFile(filePath, response.data);
      console.log(`✅ Изображение сохранено: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error(`❌ Ошибка при скачивании изображения ${url}:`, error);
      throw error;
    }
  }

  private async processContent(content: string): Promise<{
    text: string;
    images: string[];
  }> {
    const $ = cheerio.load(content);
    const images: string[] = [];
    const imagePromises: Promise<void>[] = [];

    // Удаляем ненужные теги
    $("html, head, body").contents().unwrap();
    $("div").contents().unwrap();

    // Удаляем все атрибуты кроме src у img
    $("*").each((_, el) => {
      if (el.type === "tag" && el.tagName !== "img") {
        $(el).removeAttr("class").removeAttr("id").removeAttr("style");
      }
    });

    // Обрабатываем все изображения
    $("img").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        const promise = this.downloadImage(src).then((localPath) => {
          images.push(localPath);
          $(el).remove();
        });
        imagePromises.push(promise);
      }
    });

    await Promise.all(imagePromises);

    // Форматируем заголовки
    $("h1, h2, h3, h4, h5, h6").each((_, el) => {
      $(el).replaceWith(`\n<b>${$(el).text().trim()}</b>\n`);
    });

    // Форматируем параграфы
    $("p").each((_, el) => {
      $(el).replaceWith(`${$(el).text().trim()}\n`);
    });

    // Получаем текст и очищаем от лишних переносов
    let text = $.text()
      .replace(/\n{3,}/g, "\n\n") // Заменяем 3 и более переносов на 2
      .trim();

    return { text, images };
  }

  private async cleanupImages(images: string[]): Promise<void> {
    for (const image of images) {
      try {
        await fs.promises.unlink(image);
      } catch (error) {
        console.error(`Ошибка при удалении файла ${image}:`, error);
      }
    }
  }

  private async publishPost(article: ISummarizedArticle): Promise<void> {
    let downloadedImages: string[] = [];
    try {
      console.log("Начало публикации поста...");

      // Обрабатываем контент и скачиваем изображения
      console.log("Обработка контента...");
      const { text, images } = await this.processContent(article.content);
      downloadedImages = images;
      console.log(`Найдено изображений: ${images.length}`);

      if (images.length > 0) {
        // Используем sendPhoto с правильной типизацией
        await this.bot.telegram.sendPhoto(
          this.channelId,
          { source: fs.createReadStream(images[0]) },
          {
            caption: text,
            parse_mode: "HTML",
          }
        );
      } else {
        // Если изображений нет, отправляем только текст
        await this.bot.telegram.sendMessage(this.channelId, text, {
          parse_mode: "HTML",
        });
      }

      console.log("✅ Пост успешно опубликован");
    } catch (error) {
      console.error("❌ Ошибка при публикации поста:", error);
      throw error;
    } finally {
      if (downloadedImages.length > 0) {
        console.log("Очистка временных файлов...");
        await this.cleanupImages(downloadedImages);
      }
    }
  }

  async schedulePosts(): Promise<void> {
    try {
      // Получаем все неопубликованные статьи
      const pendingArticles = await SummarizedArticle.find({
        status: "pending",
      }).sort({ createdAt: 1 });

      if (pendingArticles.length === 0) {
        console.log("Нет статей для планирования публикации");
        return;
      }

      console.log(`Найдено ${pendingArticles.length} статей для публикации`);

      // Получаем текущее время
      const now = new Date();
      let currentDate = new Date(now);
      let articleIndex = 0;

      // Планируем публикации на ближайшие дни
      while (articleIndex < pendingArticles.length) {
        for (const hour of this.publishingHours) {
          if (articleIndex >= pendingArticles.length) break;

          const publishDate = new Date(currentDate);
          publishDate.setHours(hour, 0, 0, 0);

          // Пропускаем время, которое уже прошло
          if (publishDate <= now) continue;

          const article = pendingArticles[articleIndex];
          const timeoutMs = publishDate.getTime() - now.getTime();

          // Планируем публикацию
          setTimeout(() => {
            this.publishPost(article).catch(console.error);
          }, timeoutMs);

          console.log(
            `Запланирована публикация статьи ${article._id} на ${publishDate}`
          );
          articleIndex++;
        }
        // Переходим к следующему дню
        currentDate.setDate(currentDate.getDate() + 1);
      }
    } catch (error) {
      console.error("Ошибка при планировании постов:", error);
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      console.log("Запуск бота...");

      // Проверяем подключение к Telegram API
      try {
        const botInfo = await this.bot.telegram.getMe();
        console.log(`Бот @${botInfo.username} подключен к Telegram API`);
      } catch (error) {
        console.error("❌ Ошибка подключения к Telegram API:", error);
        if (error instanceof Error) {
          throw new Error(`Проверьте токен бота: ${error.message}`);
        }
        throw new Error("Проверьте токен бота");
      }

      // Запускаем бота
      this.bot.launch();
      console.log("✅ Telegram бот успешно запущен");

      // Проверяем доступ к каналу
      try {
        await this.bot.telegram.sendChatAction(this.channelId, "typing");
        console.log("✅ Доступ к каналу подтвержден");
      } catch (error) {
        console.error("❌ Ошибка проверки доступа к каналу:", error);
        if (error instanceof Error) {
          throw new Error(`Проверьте права бота и ID канала: ${error.message}`);
        }
        throw new Error("Проверьте права бота и ID канала");
      }

      // Планируем посты каждый час
      const job = new CronJob("0 * * * *", () => {
        this.schedulePosts().catch(console.error);
      });
      job.start();

      // Первый запуск планирования
      await this.schedulePosts();
    } catch (error) {
      console.error("❌ Критическая ошибка при запуске бота:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      console.log("Остановка бота...");
      await this.bot.stop();
      console.log("✅ Бот остановлен");
    } catch (error) {
      console.error("❌ Ошибка при остановке бота:", error);
      throw error;
    }
  }

  async testPost(): Promise<void> {
    try {
      console.log("Поиск неопубликованной статьи...");

      const article = await SummarizedArticle.findOne({
        status: "pending",
      }).sort({ createdAt: 1 });

      if (!article) {
        console.log("❌ Нет неопубликованных статей в базе данных");
        return;
      }

      console.log(`Найдена статья для публикации: ${article._id}`);
      console.log("Публикация статьи...");

      await this.publishPost(article);

      // Обновляем статус статьи
      await SummarizedArticle.findByIdAndUpdate(article._id, {
        status: "published",
      });

      console.log("✅ Статья успешно опубликована");
    } catch (error) {
      console.error("❌ Ошибка при публикации статьи:", error);
      throw error;
    }
  }
}
