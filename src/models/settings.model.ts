import { Schema, model, Document, Model } from "mongoose";

export interface ISettings extends Document {
  freeGiftEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ISettingsModel extends Model<ISettings> {
  getSettings(): Promise<ISettings>;
}

const settingsSchema = new Schema<ISettings, ISettingsModel>(
  {
    freeGiftEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

settingsSchema.static("getSettings", async function (): Promise<ISettings> {
  const settings = await this.findOne();
  if (settings) return settings;
  return this.create({ freeGiftEnabled: false });
});

export const Settings = model<ISettings, ISettingsModel>("Settings", settingsSchema);
