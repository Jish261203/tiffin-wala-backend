import Stripe from "stripe";
import { Request, Response } from "express";
import Restaurant, { MenuItemType } from "../models/restaurant";
import Order from "../models/order";

const STRIPE = new Stripe(process.env.STRIPE_API_KEY as string);
const FRONTEND_URL = process.env.FRONTEND_URL as string;
const STRIPE_ENDPOINT_SECRET = process.env.STRIPE_WEBHOOK_SECRET as string;

const getMyOrders = async (req: Request, res: Response) => {
  try {
    const orders = await Order.find({ user: req.userId })
      .populate({
        path: "restaurant",
        populate: {
          path: "menuItems"
        }
      })
      .populate("user");

    // Ensure prices are properly formatted in the response
    const formattedOrders = orders.map(order => {
      // Calculate total if not set
      const totalAmount = order.totalAmount || order.cartItems.reduce(
        (total, item) => total + (item.price || 0) * (parseInt(item.quantity) || 1), 
        0
      );

      return {
        ...order.toObject(),
        totalAmount,
        cartItems: order.cartItems.map(item => ({
          ...item,
          price: item.price || 0,
          quantity: item.quantity || "1"
        }))
      };
    });

    res.json(formattedOrders);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "something went wrong" });
  }
};

type CheckoutSessionRequest = {
  cartItems: {
    menuItemId: string;
    name: string;
    quantity: string;
    price: number;
  }[];
  deliveryDetails: {
    email: string;
    name: string;
    addressLine1: string;
    city: string;
    country: string;
  };
  restaurantId: string;
  totalAmount: number;
};

const stripeWebhookHandler = async (req: Request, res: Response) => {
  let event;

  try {
    const sig = req.headers["stripe-signature"];
    event = STRIPE.webhooks.constructEvent(
      req.body,
      sig as string,
      STRIPE_ENDPOINT_SECRET
    );
  } catch (error: any) {
    console.log(error);
    return res.status(400).send(`Webhook error: ${error.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const order = await Order.findById(event.data.object.metadata?.orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.totalAmount = event.data.object.amount_total || 0;
    order.status = "paid";

    await order.save();
  }

  res.status(200).send();
};

const createCheckoutSession = async (req: Request, res: Response) => {
  try {
    const checkoutSessionRequest: CheckoutSessionRequest = req.body;

    if (!checkoutSessionRequest.restaurantId) {
      return res.status(400).json({ message: "Restaurant ID is required" });
    }

    const restaurant = await Restaurant.findById(
      checkoutSessionRequest.restaurantId
    ).populate('menuItems');

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Validate delivery details
    const { deliveryDetails } = checkoutSessionRequest;
    if (!deliveryDetails.email || !deliveryDetails.name || !deliveryDetails.addressLine1 || !deliveryDetails.city) {
      return res.status(400).json({ message: "All delivery details are required" });
    }

    // Validate cart items
    if (!checkoutSessionRequest.cartItems || checkoutSessionRequest.cartItems.length === 0) {
      return res.status(400).json({ message: "Cart items are required" });
    }

    try {
      const menuItems = restaurant.menuItems.map(item => ({
        _id: item._id?.toString() || item.id?.toString() || '',
        name: item.name,
        price: item.price,
        description: item.description,
        imageUrl: item.imageUrl
      }));

      const lineItems = createLineItems(
        checkoutSessionRequest,
        menuItems
      );

      const newOrder = new Order({
        restaurant: restaurant._id,
        user: req.userId,
        status: "placed",
        deliveryDetails: checkoutSessionRequest.deliveryDetails,
        cartItems: checkoutSessionRequest.cartItems,
        totalAmount: checkoutSessionRequest.totalAmount,
        createdAt: new Date(),
      });

      const session = await createSession(
        lineItems,
        newOrder._id.toString(),
        restaurant.deliveryPrice,
        restaurant._id.toString()
      );

      if (!session.url) {
        return res.status(500).json({ message: "Error creating stripe session" });
      }

      await newOrder.save();
      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Stripe session creation error:", error);
      return res.status(500).json({ 
        message: error.message || "Error creating checkout session",
        details: error.raw?.message
      });
    }
  } catch (error: any) {
    console.error("Checkout error:", error);
    res.status(500).json({ 
      message: "Failed to process checkout",
      details: error.message 
    });
  }
};

const createLineItems = (
  checkoutSessionRequest: CheckoutSessionRequest,
  menuItems: MenuItemType[]
) => {
  console.log("Creating line items with menu items:", menuItems.map(item => ({ id: item._id, name: item.name, price: item.price })));
  console.log("Cart items received:", checkoutSessionRequest.cartItems);

  const lineItems = checkoutSessionRequest.cartItems.map((cartItem) => {
    const menuItem = menuItems.find(
      (item) => item._id.toString() === cartItem.menuItemId.toString()
    );

    if (!menuItem) {
      console.error("Menu item lookup failed:");
      console.error("Looking for ID:", cartItem.menuItemId);
      console.error("Available menu item IDs:", menuItems.map(item => item._id.toString()));
      throw new Error(`Menu item not found: ${cartItem.menuItemId}. Available items: ${menuItems.map(item => item.name).join(', ')}`);
    }

    // Use price directly without conversion
    const line_item: Stripe.Checkout.SessionCreateParams.LineItem = {
      price_data: {
        currency: "inr",
        unit_amount: menuItem.price,
        product_data: {
          name: menuItem.name,
        },
      },
      quantity: parseInt(cartItem.quantity),
    };

    return line_item;
  });

  return lineItems;
};

const createSession = async (
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[],
  orderId: string,
  deliveryPrice: number,
  restaurantId: string
) => {
  // Delivery price is already in paise
  const sessionData = await STRIPE.checkout.sessions.create({
    line_items: lineItems,
    shipping_options: [
      {
        shipping_rate_data: {
          display_name: "Delivery",
          type: "fixed_amount",
          fixed_amount: {
            amount: deliveryPrice,
            currency: "inr",
          },
        },
      },
    ],
    mode: "payment",
    metadata: {
      orderId,
      restaurantId,
    },
    success_url: `${FRONTEND_URL}/order-status?success=true`,
    cancel_url: `${FRONTEND_URL}/detail/${restaurantId}?cancelled=true`,
  });

  return sessionData;
};

const generateInvoice = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    // Fetch the order with populated restaurant data including menu items
    const order = await Order.findById(orderId)
      .populate({
        path: "restaurant",
        populate: {
          path: "menuItems"
        }
      })
      .populate("user");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify that the user requesting the invoice is the order owner
    if (order.user._id.toString() !== req.userId) {
      return res.status(403).json({ message: "Not authorized to access this order" });
    }

    // Ensure all required data is present
    if (!order.restaurant || !order.cartItems || !order.deliveryDetails) {
      return res.status(500).json({ 
        message: "Order data is incomplete",
        details: {
          hasRestaurant: !!order.restaurant,
          hasCartItems: !!order.cartItems,
          hasDeliveryDetails: !!order.deliveryDetails
        }
      });
    }

    const restaurant = await Restaurant.findById(order.restaurant);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Get the menu items to retrieve the actual prices
    const menuItems = (restaurant.menuItems || []);
    
    // Process items with correct prices
    const processedItems = order.cartItems.map(item => {
      // Try to find the original menu item to get the correct price
      const menuItem = menuItems.find(mi => mi && mi._id && mi._id.toString() === item.menuItemId);
      const itemPrice = (menuItem && menuItem.price) || item.price || 0;
      
      // Convert price from paise to rupees if it's a large number divisible by 100
      const finalPrice = itemPrice > 1000 && itemPrice % 100 === 0 ? itemPrice / 100 : itemPrice;
      
      const quantity = parseInt(item.quantity) || 1;
      const total = finalPrice * quantity;
      
      return {
        name: item.name,
        quantity: quantity,
        price: finalPrice,
        total: total
      };
    });

    // Calculate the subtotal
    const subtotal = processedItems.reduce((acc, item) => acc + item.total, 0);
    
    // Get delivery fee (convert from paise if needed)
    const deliveryFee = restaurant.deliveryPrice ? 
      (restaurant.deliveryPrice > 1000 && restaurant.deliveryPrice % 100 === 0 ? 
        restaurant.deliveryPrice / 100 : restaurant.deliveryPrice) : 0;
    
    // Calculate total amount
    const totalAmount = order.totalAmount ? 
      (order.totalAmount > 1000 && order.totalAmount % 100 === 0 ? 
        order.totalAmount / 100 : order.totalAmount) : subtotal + deliveryFee;

    const invoiceData = {
      orderNumber: order._id,
      date: order.createdAt,
      customerDetails: {
        name: order.deliveryDetails.name,
        email: order.deliveryDetails.email,
        address: {
          line1: order.deliveryDetails.addressLine1,
          city: order.deliveryDetails.city,
          country: order.deliveryDetails.country,
        },
      },
      restaurantDetails: {
        name: restaurant.restaurantName,
        address: restaurant.address || "Not provided",
      },
      items: processedItems,
      deliveryFee: deliveryFee,
      totalAmount: totalAmount,
      status: order.status,
      paymentStatus: order.status === 'paid' ? 'Paid' : 'Pending'
    };

    res.json(invoiceData);
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).json({ 
      message: "Failed to generate invoice",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify that the user owns this order
    if (order.user.toString() !== req.userId) {
      return res.status(403).json({ message: "Not authorized to update this order" });
    }

    order.status = status;
    await order.save();

    res.status(200).json(order);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Unable to update order status" });
  }
};

export default {
  getMyOrders,
  createCheckoutSession,
  stripeWebhookHandler,
  updateOrderStatus,
  generateInvoice,
};
