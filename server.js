import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import Counselor from './models/Counselor.js';
import { FRONTEND_URL, PORT, MONGODB_URI, CORS_OPTIONS, isDevelopment } from './config.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Configure CORS
app.use(cors(CORS_OPTIONS));

// Configure Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ['GET', 'POST'],
    credentials: true,
    transports: ['websocket', 'polling']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Track online users
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Handle user connection
  socket.on('user_connected', (userData) => {
    const { userId, userType, name } = userData;
    onlineUsers.set(userId, { socketId: socket.id, userType });
    
    // Emit status change based on user type
    if (userType === 'counselor') {
      io.emit('counselor_status_change', Array.from(onlineUsers.entries())
        .filter(([_, data]) => data.userType === 'counselor')
        .map(([userId]) => userId));
    } else {
      io.emit('student_status_change', Array.from(onlineUsers.entries())
        .filter(([_, data]) => data.userType === 'student')
        .map(([userId]) => userId));
    }
    
    console.log('User registered:', userId, userType, name);
  });

  // Handle new messages
  socket.on('send_message', async (data) => {
    console.log('Received message:', data);
    try {
      const { studentId, facultyId, text, senderId, timestamp, senderType, receiverType } = data;

      // If sender is a student and receiver is a counselor, check if it's their first message
      if (senderType === 'student' && receiverType === 'counselor') {
        try {
          console.log(facultyId)
          const counselor = await Counselor.findOne({ email: facultyId });
          if (counselor) {
            if (!counselor.studentsInConversation) {
              counselor.studentsInConversation = [];
            }

            const studentExists = counselor.studentsInConversation.some(
              s => s.studentId === studentId
            );

            if (!studentExists) {
              counselor.studentsInConversation.push({
                studentId: studentId,
                lastMessage: new Date()
              });
              await counselor.save();
              
              // Emit event to notify counselor about new student message
              console.log('Emitting new_student_message event');
              io.emit('new_student_message', {
                facultyId: facultyId,
                studentId: studentId
              });
            }
          }
        } catch (error) {
          console.error('Error handling counselor update:', error);
        }
      }

      // Emit message to both users
      io.emit('receive_message', {
        text,
        studentId,
        facultyId,
        senderId,
        timestamp: new Date(timestamp),
        senderType,
        receiverType
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    let userId;
    let userType;
    for (const [key, value] of onlineUsers.entries()) {
      if (value.socketId === socket.id) {
        userId = key;
        userType = value.userType;
        break;
      }
    }
    if (userId) {
      onlineUsers.delete(userId);
      // Emit status change based on user type
      if (userType === 'counselor') {
        io.emit('counselor_status_change', Array.from(onlineUsers.entries())
          .filter(([_, data]) => data.userType === 'counselor')
          .map(([userId]) => userId));
      } else {
        io.emit('student_status_change', Array.from(onlineUsers.entries())
          .filter(([_, data]) => data.userType === 'student')
          .map(([userId]) => userId));
      }
      console.log('User disconnected:', userId, userType);
    }
  });
});

// Start server
const port = PORT;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${isDevelopment ? 'development' : 'production'}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`MongoDB connected: ${MONGODB_URI ? 'yes' : 'no'}`);
}); 