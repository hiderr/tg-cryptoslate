import mongoose, { Document, Schema } from "mongoose";

export interface ISummarizedArticle extends Document {
  sourceArticleId: mongoose.Types.ObjectId;
  content: string;
  status: "pending" | "published";
  createdAt: Date;
}

const SummarizedArticleSchema = new Schema<ISummarizedArticle>({
  sourceArticleId: {
    type: Schema.Types.ObjectId,
    ref: "SourceArticle",
    required: true,
  },
  content: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "published"],
    default: "pending",
  },
  createdAt: { type: Date, default: Date.now },
});

export const SummarizedArticle = mongoose.model<ISummarizedArticle>(
  "SummarizedArticle",
  SummarizedArticleSchema
);
