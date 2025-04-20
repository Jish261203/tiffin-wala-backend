import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true,
  },
  deliveryDetails: {
    email: { type: String, required: true },
    name: { type: String, required: true },
    addressLine1: { type: String, required: true },
    city: { type: String, required: true },
    country: { type: String, required: true },
  },
  cartItems: [{
    menuItemId: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: String, required: true },
    price: { type: Number, required: true },
  }],
  totalAmount: { type: Number, required: true },
  status: { type: String, required: true },
  createdAt: { type: Date, required: true },
});

const Order = mongoose.model("Order", orderSchema);
export default Order;
