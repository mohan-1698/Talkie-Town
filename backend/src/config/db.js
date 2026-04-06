const mongoose = require('mongoose');

async function connectDB() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/talkie-town';

  if (!process.env.MONGO_URI) {
    console.warn('MONGO_URI not set. Falling back to local MongoDB at 127.0.0.1:27017');
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    console.error('Hint: ensure MongoDB is running locally or provide a valid MONGO_URI in backend/.env');
    throw error;
  }
}

module.exports = connectDB;
