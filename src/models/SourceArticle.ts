import mongoose, { Document, Schema } from 'mongoose';

export interface ISourceArticle extends Document {
  url: string;
  title: string;
  content: string;
  publishedAt: Date;
  createdAt: Date;
}

const SourceArticleSchema = new Schema<ISourceArticle>({
  url: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  publishedAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const SourceArticle = mongoose.model<ISourceArticle>(
  'SourceArticle',
  SourceArticleSchema,
);
