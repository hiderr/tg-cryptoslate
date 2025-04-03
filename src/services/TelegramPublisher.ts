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
import { Parser } from "../services/Parser";
import { ChatGPTService } from "../services/ChatGPTService";
import { SourceArticle } from "../models/SourceArticle";
import { TranslatedArticle } from "../models/TranslatedArticle";

dotenv.config();

export class TelegramPublisher {
  private bot: Telegraf;
  private channelId: string;
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
    this.tempDir = path.join(__dirname, "../../temp");

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    this.bot.catch((err: unknown, ctx) => {
      console.error("❌ Ошибка в боте:", err);
    });

    process.once("SIGINT", () => this.stop());
    process.once("SIGTERM", () => this.stop());
  }

  private async uploadToImgBB(imageUrl: string): Promise<string> {
    try {
      console.log("📤 Загрузка изображения в ImgBB...");

      // Скачиваем изображение
      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      // Конвертируем в base64
      const base64Image = Buffer.from(imageResponse.data).toString("base64");

      // Загружаем в ImgBB
      const formData = new FormData();
      formData.append("image", base64Image);

      const response = await axios.post(
        `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
        formData
      );

      if (response.data?.data?.url) {
        console.log("✅ Изображение успешно загружено в ImgBB");

        return response.data.data.url;
      }

      throw new Error("Не удалось получить URL загруженного изображения");
    } catch (error) {
      console.error("❌ Ошибка при загрузке изображения в ImgBB:", error);

      return imageUrl;
    }
  }

  private async processContent(content: string): Promise<{
    text: string;
    originalImageSrc?: string;
  }> {
    let $ = cheerio.load(content);
    let originalImageSrc: string | undefined;

    // Удаляем ненужные теги
    $("html, head, body").contents().unwrap();
    $("div").contents().unwrap();

    // Сохраняем src первого изображения
    const firstImg = $("img").first();
    if (firstImg.length) {
      originalImageSrc = firstImg.attr("src");
    }

    // Удаляем все изображения из текста
    $("img").remove();

    // Удаляем все переносы строк из HTML контента
    const cleanHtml = $.html().replace(/\n/g, "");
    $ = cheerio.load(cleanHtml);

    // Форматируем заголовки в <b>
    let isFirstHeading = true;
    $("h1, h2, h3, h4, h5, h6").each((_: number, el: any) => {
      const text = $(el).text().trim();
      if (isFirstHeading) {
        $(el).replaceWith(`<b>${text}</b>\n\n`);
        isFirstHeading = false;
      } else {
        $(el).replaceWith(`\n<b>${text}</b>\n`);
      }
    });

    // Остальное форматирование...
    $("p").each((_: number, el: any) => {
      const text = $(el).text().trim();
      $(el).replaceWith(`${text}\n`);
    });

    $("strong").each((_: number, el: any) => {
      const text = $(el).text().trim();
      $(el).replaceWith(`<b>${text}</b>`);
    });

    $("i, em").each((_: number, el: any) => {
      const text = $(el).text().trim();
      $(el).replaceWith(`<i>${text}</i>`);
    });

    let text = $.html().trim();

    text = text.replace(
      /<(?!\/?(b|strong|i|em|a|code|pre|s|strike|u|ins|del|tg-spoiler)\b)[^>]+>/gi,
      ""
    );
    // text = text.replace(/\n{3,}/g, "\n\n");

    return { text, originalImageSrc };
  }

  private async publishPost(article: ISummarizedArticle): Promise<void> {
    const subscriptionLink = `\n\n<a href="https://t.me/CryptoMindsetX">Криптомышление | Главные новости крипты</a>`;

    try {
      console.log("Начало публикации поста...");

      const { text, originalImageSrc } = await this.processContent(
        article.content
      );

      if (originalImageSrc) {
        const newSrc = await this.uploadToImgBB(originalImageSrc);

        if (newSrc) {
          const imageLink = `<a href="${newSrc}">&#8205;</a>`;
          const messageText = imageLink + text.trim() + subscriptionLink;

          await this.bot.telegram.sendMessage(this.channelId, messageText, {
            parse_mode: "HTML",
          });
        }
      } else {
        await this.bot.telegram.sendMessage(
          this.channelId,
          text + subscriptionLink,
          {
            parse_mode: "HTML",
          }
        );
      }

      console.log("✅ Пост успешно опубликован");
    } catch (error) {
      console.error("❌ Ошибка при публикации поста:", error);

      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      this.bot.launch();
      console.log("✅ Telegram бот успешно запущен");

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

      // Создаем функцию для проверки и обработки статей
      const checkAndProcessArticles = async (): Promise<void> => {
        try {
          console.log("\n🔄 Начало проверки");

          // Сначала проверяем есть ли неопубликованные статьи
          console.log("👀 Проверка наличия неопубликованных статей...");
          const pendingArticle = await SummarizedArticle.findOne({
            status: "pending",
          }).sort({ createdAt: 1 });

          if (pendingArticle) {
            console.log("📝 Найдена неопубликованная статья, публикуем...");
            await this.publishPost(pendingArticle);
            await SummarizedArticle.findByIdAndUpdate(pendingArticle._id, {
              status: "published",
            });
            console.log(`✅ Опубликована статья: ${pendingArticle._id}`);

            return;
          }

          console.log("🔍 Поиск новых статей...");
          const parser = new Parser();
          const chatGPT = new ChatGPTService();

          const newUrls = await parser.getNewArticles();
          console.log(`📊 Найдено ${newUrls.length} новых статей`);

          for (const url of newUrls) {
            try {
              console.log(`\n🌐 Обработка статьи: ${url}`);

              console.log("1️⃣ Парсинг статьи...");
              const { title, content } = await parser.parseArticle(url);

              console.log("2️⃣ Сохранение исходной статьи...");
              const sourceArticle = await SourceArticle.create({
                url,
                title,
                content,
                publishedAt: new Date(),
              });
              console.log(`✅ Исходная статья сохранена: ${sourceArticle._id}`);

              console.log("3️⃣ Перевод статьи...");
              const translatedContent = await chatGPT.translateContent(content);
              const translatedArticle = await TranslatedArticle.create({
                sourceArticleId: sourceArticle._id,
                title: title,
                content: translatedContent,
                language: "ru",
              });
              console.log(`✅ Перевод сохранен: ${translatedArticle._id}`);

              console.log("4️⃣ Генерация краткого содержания...");
              const summary = await chatGPT.summarizeForTelegram(
                translatedContent
              );
              const summarizedArticle = await SummarizedArticle.create({
                sourceArticleId: sourceArticle._id,
                content: summary,
                status: "pending",
              });
              console.log(
                `✅ Краткое содержание сохранено: ${summarizedArticle._id}`
              );

              console.log("5️⃣ Публикация в Telegram...");
              await this.publishPost(summarizedArticle);
              await SummarizedArticle.findByIdAndUpdate(summarizedArticle._id, {
                status: "published",
              });
              console.log(
                `🎉 Статья успешно обработана и опубликована: ${title}`
              );
            } catch (error) {
              console.error(`❌ Ошибка обработки статьи ${url}:`, error);
              console.log(
                "⏭️ Пропускаем статью, будет обработана в следующий раз"
              );
            }
          }

          console.log("\n✅ Проверка завершена");
        } catch (error) {
          console.error("❌ Ошибка в процессе обработки:", error);
        }
      };

      // Запускаем первую проверку сразу
      console.log("🚀 Запуск первичной проверки...");
      await checkAndProcessArticles();

      // Настраиваем периодический запуск каждые 5 минут
      const job = new CronJob("*/5 * * * *", checkAndProcessArticles);
      job.start();
      console.log(
        "⏰ Планировщик задач запущен (следующая проверка через 5 минут)"
      );
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

  async publishAllPending(): Promise<void> {
    try {
      const pendingArticles = await SummarizedArticle.find({
        status: "pending",
      }).sort({ createdAt: 1 });

      if (pendingArticles.length === 0) {
        console.log("Нет статей для публикации");

        return;
      }

      console.log(`Найдено ${pendingArticles.length} статей для публикации`);

      for (const article of pendingArticles) {
        await this.publishPost(article);
        await SummarizedArticle.findByIdAndUpdate(article._id, {
          status: "published",
        });
        console.log(`✅ Опубликована статья: ${article._id}`);
      }
    } catch (error) {
      console.error("❌ Ошибка при публикации статей:", error);

      throw error;
    }
  }
}
