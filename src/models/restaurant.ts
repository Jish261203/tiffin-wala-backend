import mongoose, { InferSchemaType } from "mongoose";

export interface MenuItemType {
  _id: string;
  name: string;
  price: number;
  description: string;
  imageUrl: string;
}

const menuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String, required: true },
  imageUrl: { type: String, required: true },
});

// Create an index on the day field for efficient querying
menuItemSchema.index({ day: 1 });

const restaurantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  restaurantName: { type: String, required: true },
  city: { type: String, required: true },
  country: { type: String, required: true },
  deliveryPrice: { type: Number, required: true },
  estimatedDeliveryTime: { type: Number, required: true },
  cuisines: [{ type: String, required: true }],
  menuItems: [menuItemSchema],
  imageUrl: { type: String, required: true },
  lastUpdated: { type: Date, required: true },
  address: { type: String, required: true },
});

const Restaurant = mongoose.model("Restaurant", restaurantSchema);
export default Restaurant;
