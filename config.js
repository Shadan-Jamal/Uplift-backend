import dotenv from 'dotenv';
dotenv.config();

// Environment-based configuration
const isDevelopment = process.env.NODE_ENV === 'development';

// Frontend URL configuration
const FRONTEND_URL = isDevelopment 
  ? process.env.FRONTEND_URL_DEV 
  : process.env.FRONTEND_URL_PROD;

// Server configuration
// In production, use the PORT provided by the hosting platform
// In development, use 3001
const PORT = (isDevelopment ? 3001 : 10000);

// MongoDB configuration
const MONGODB_URI = process.env.MONGODB_URI;

// CORS configuration
const CORS_OPTIONS = {
  origin: "*",
  methods: ['GET', 'POST'],
  credentials: true
};

export {FRONTEND_URL, PORT, MONGODB_URI, CORS_OPTIONS, isDevelopment};
