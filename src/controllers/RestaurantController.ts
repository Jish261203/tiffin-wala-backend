import { Request, Response } from "express";
import Restaurant from "../models/restaurant";

const getRestaurants = async (req: Request, res: Response) => {
  try {
    const restaurants = await Restaurant.find();
    res.json(restaurants);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching restaurants" });
  }
};

const getRestaurant = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.restaurantId;
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    res.json(restaurant);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching restaurant" });
  }
};

const searchRestaurants = async (req: Request, res: Response) => {
  try {
    const searchQuery = (req.query.searchQuery as string) || "";
    const selectedCuisines = (req.query.selectedCuisines as string) || "";
    const sortOption = (req.query.sortOption as string) || "lastUpdated";
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = 10;

    const query: any = {};

    if (searchQuery) {
      query.$or = [
        { restaurantName: { $regex: searchQuery, $options: "i" } },
        { cuisines: { $regex: searchQuery, $options: "i" } },
      ];
    }

    if (selectedCuisines) {
      const cuisinesArray = selectedCuisines.split(",");
      if (cuisinesArray.length > 0) {
        query.cuisines = { $in: cuisinesArray };
      }
    }

    const sortOptions: { [key: string]: any } = {
      lastUpdated: { lastUpdated: -1 },
      deliveryPrice: { deliveryPrice: 1 },
      estimatedDeliveryTime: { estimatedDeliveryTime: 1 },
    };

    const restaurants = await Restaurant.find(query)
      .sort(sortOptions[sortOption])
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    const total = await Restaurant.countDocuments(query);

    const response = {
      data: restaurants,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / pageSize),
      },
    };

    res.json(response);
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "Something went wrong" });
  }
};

export default {
  getRestaurants,
  getRestaurant,
  searchRestaurants,
};
