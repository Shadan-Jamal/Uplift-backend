import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import Counselor from './models/Counselor.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Configure CORS and Socket.IO based on environment
// const isProduction = process.env.NODE_ENV === 'production';
const clientUrl = 'https://care-scc.vercel.app';

console.log('Client URL:', clientUrl);

const io = new Server(server, {
  cors: {
    origin: clientUrl,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: "*",
  credentials: true
}));
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Track online users
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

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
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Client URL: ${clientUrl}`);
}); 