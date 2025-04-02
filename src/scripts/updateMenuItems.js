const mongoose = require('mongoose');
const Restaurant = require('../models/restaurant');

async function updateMenuItems() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);

    // Update all restaurants' menu items
    const result = await Restaurant.updateMany(
      { 'menuItems.day': { $exists: false } },
      { $set: { 'menuItems.$[].day': 'Monday' } }
    );

    console.log(`Updated ${result.modifiedCount} restaurants' menu items`);
    
    // Close the connection
    await mongoose.connection.close();
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

updateMenuItems(); 