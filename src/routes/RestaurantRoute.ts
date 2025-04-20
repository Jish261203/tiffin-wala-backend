import express from "express";
import RestaurantController from "../controllers/RestaurantController";

const router = express.Router();

router.get("/", RestaurantController.getRestaurants);
router.get("/search", RestaurantController.searchRestaurants);
router.get("/:restaurantId", RestaurantController.getRestaurant);

export default router;
