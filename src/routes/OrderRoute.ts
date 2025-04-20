import express from "express";
import { jwtCheck, jwtParse } from "../middleware/auth";
import OrderController from "../controllers/OrderController";

const router = express.Router();

router.get("/", jwtCheck, jwtParse, OrderController.getMyOrders);

router.get("/:orderId/invoice", jwtCheck, jwtParse, OrderController.generateInvoice);

router.post("/checkout/create-session", jwtCheck, jwtParse, OrderController.createCheckoutSession);

router.patch("/:orderId/status", jwtCheck, jwtParse, OrderController.updateOrderStatus);

router.post("/checkout/webhook", express.raw({ type: 'application/json' }), OrderController.stripeWebhookHandler);

export default router;
