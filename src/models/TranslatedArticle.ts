import mongoose, { Document, Schema } from "mongoose";

export interface ITranslatedArticle extends Document {
  sourceArticleId: mongoose.Types.ObjectId;
  title: string;
  content: string;
  language: string;
  createdAt: Date;
}

const TranslatedArticleSchema = new Schema<ITranslatedArticle>({
  sourceArticleId: {
    type: Schema.Types.ObjectId,
    ref: "SourceArticle",
    required: true,
  },
  title: { type: String, required: true },
  content: { type: String, required: true },
  language: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const TranslatedArticle = mongoose.model<ITranslatedArticle>(
  "TranslatedArticle",
  TranslatedArticleSchema
);
