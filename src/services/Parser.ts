import axios from "axios";
import * as cheerio from "cheerio";
import { SourceArticle } from "../models/SourceArticle";

export class Parser {
  async getNewArticles(): Promise<string[]> {
    const response = await axios.get("https://cryptoslate.com/news/");
    const $ = cheerio.load(response.data);
    const links: string[] = [];

    $(".news-feed .list-feed.slate a").each((_, el) => {
      if ($(el).find(".alpha").length === 0) {
        const href = $(el).attr("href");
        if (href) links.push(href);
      }
    });

    const existingUrls = new Set(
      (await SourceArticle.find().select("url")).map((a) => a.url)
    );

    return links.filter((url) => !existingUrls.has(url));
  }

  async parseArticle(url: string): Promise<{
    title: string;
    content: string;
  }> {
    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);

    const articleTitleText = $("h1").text().trim();
    const articleTitle = $("<h1>").text(articleTitleText);

    const article = $(".post article").first();

    if (!article.length) {
      throw new Error("Article not found");
    }

    const headingImageDiv = $(".post-container div.cover");
    const headingImage = headingImageDiv.find("img").first();
    if (headingImage.length) {
      const newImg = $("<img>")
        .attr("src", headingImage.attr("data-src"))
        .attr("alt", headingImage.attr("alt"));
      article.prepend(newImg);
    }

    const metaDescription = $('meta[name="description"]').attr("content");
    if (metaDescription) {
      const descriptionParagraph = $("<p>")
        .addClass("description")
        .text(metaDescription);
      article.prepend(descriptionParagraph);
    }

    // Находим заголовок "Mentioned in this article"
    const mentionedHeader = article.find(
      'h6:contains("Mentioned in this article")'
    );

    // Удаляем все содержимое после этого заголовка
    if (mentionedHeader.length) {
      mentionedHeader.nextAll().remove();
      mentionedHeader.remove();
    }

    article.prepend(articleTitle);

    article.find("a").each((i, el) => {
      $(el).replaceWith($(el).text());
    });

    // Удаляем рекламные блоки
    article.find(".hypelab-container").remove();
    article.find(".code-block").remove();

    const seenTexts = new Set<string>();
    const content = article
      .find("p, img, h1, h2, h3, h4, h5, h6, blockquote")
      .map((i, el) => {
        const $el = $(el);
        const text = $el.text().trim();

        // Для изображений используем src как уникальный идентификатор
        if (el.tagName === "img") {
          const src = $el.attr("src") || "";
          if (seenTexts.has(src)) {
            return null;
          }
          seenTexts.add(src);
          return $.html(el);
        }

        // Для текстовых элементов используем их содержимое
        if (!text || seenTexts.has(text)) {
          return null;
        }
        seenTexts.add(text);

        return $.html(el);
      })
      .get()
      .filter(Boolean)
      .join("");

    if (!content) {
      throw new Error("Content not found");
    }

    return { title: articleTitleText, content };
  }
}
