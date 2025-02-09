import axios from "axios";
import * as dotenv from "dotenv";
import { ChatMessage } from "./types";

dotenv.config();

export class ChatGPTService {
  private apiKey: string;
  private apiUrl: string;
  private defaultSystemPrompt =
    "You are a professional native Russian translator and copywriter with 30 years of experience.";

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || "";
    this.apiUrl = "https://api.openai.com/v1/chat/completions";
  }

  private async makeRequest(messages: ChatMessage[]) {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: "gpt-4o-mini",
          messages,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error("Error making request to ChatGPT:", error);
      throw new Error("Failed to get response from ChatGPT");
    }
  }

  async sendMessage(
    userPrompt: string,
    systemPrompt: string = this.defaultSystemPrompt
  ): Promise<string> {
    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ];

    return this.makeRequest(messages);
  }

  async translateContent(content: string): Promise<string> {
    const systemPrompt =
      "You are a professional native Russian translator and copywriter with 30 years of experience. You perfectly understand the nuances of the Russian language, tone and style, and you are able to translate any text into Russian, keeping the original meaning and structure and rewrite it in a simple and understandable way for a Russian audience.";
    const userPrompt = `First, understand the meaning of the provided text in English, and then rewrite it in your own words as a native speaker of Russian. Try to keep the original HTML structure as close as possible, but you should completely rewrite the text make it different from the original and in your own words, keeping the meaning of the original text. Ensure that the translation is contextually accurate and of high quality, aiming for a human-like expression. Retain any placeholder content, attributes, or variables within the text as is. Remove from the text any mention of the source sites, editorial staff, or any other information about the creators of the source text. If the article contains units of measurement, which are not typical for Russia, convert them to the units used in Russia: kilograms, grams, meters, degrees Celsius, and so on. If a word or phrase should not be translated due to its specific meaning, leave it in its original form. Ensure that the narrative is consistently in the first-person masculine form. Preserve the original HTML structure: ${content}`;

    try {
      console.log("Translating content...");
      const translatedContent = await this.sendMessage(
        userPrompt,
        systemPrompt
      );

      // Удаляем обертку ```html и ```
      const cleanedContent = translatedContent
        .replace(/^```html\n/, "")
        .replace(/\n```$/, "");

      console.log("Translation successful.");
      return cleanedContent;
    } catch (error) {
      console.error("Error translating content:", error);
      throw new Error("Translation failed");
    }
  }

  async improveTranslation(translatedContent: string): Promise<string> {
    try {
      const systemPrompt =
        "Вы - опытный русскоязычный редактор и писатель с 20-летним стажем. " +
        "Ваша задача - улучшить текст, переведенный нейросетью, сделав его более естественным " +
        "и приятным для чтения, сохраняя при этом исходный смысл и структуру HTML.";

      const userPrompt = `
        Перед вами текст, переведенный нейросетью с английского на русский. 
        Пожалуйста:
        1. Исправьте все неестественные обороты речи
        2. Замените канцеляризмы на более живой язык
        3. Сделайте текст более плавным и читабельным
        4. Сохраните все HTML теги в их исходном виде
        5. Не меняйте структуру и смысл текста
        6. Убедитесь, что текст звучит как написанный человеком, а не машиной

        Текст для обработки:
        ${translatedContent}
      `;

      const improvedContent = await this.sendMessage(userPrompt, systemPrompt);

      return improvedContent;
    } catch (error) {
      console.error("Error improving translation:", error);
      throw new Error("Failed to improve translation");
    }
  }

  async summarizeForTelegram(content: string): Promise<string> {
    const systemPrompt =
      "You are a professional writer and editor, a native Russian speaker with a good understanding of the nuances of the Russian language, tone and style, specializing in creating short summaries of long texts while preserving the key points and the main idea of the original text. Your task is to make the text generated by artificial intelligence sound natural and human while preserving the main idea of the text";

    const userPrompt = `
      Перед тобой текст, сгенерированный нейросетью. Твоя задача:
      1. Переписать его, чтобы он звучал естественно и по-человечески
      2. Исправить все языковые неточности и стилистические ошибки
      3. Сократить до формата Telegram-поста (максимум 1000 символов)
      4. Сохранить ключевые мысли и основной посыл
      5. Вернуть текст в формате HTML. Если в исходном тексте есть изображения, то сохрание его в результате. Используй только теги <h1-6>, <p>, <b>, <i>, <em>, <strong>, <img>.
      
      Текст для обработки:
      ${content}
    `;

    const translatedContent = await this.sendMessage(userPrompt, systemPrompt);

    // Удаляем обертку ```html и ```
    const cleanedContent = translatedContent
      .replace(/^```html\n/, "")
      .replace(/\n```$/, "");

    return cleanedContent;
  }
}
