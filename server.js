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
    console.log('User connected - Current online users:', Array.from(onlineUsers.entries()));
    
    // Emit status change based on user type
    if (userType === 'counselor') {
      const onlineCounselors = Array.from(onlineUsers.entries())
        .filter(([_, data]) => data.userType === 'counselor')
        .map(([userId]) => userId);
      console.log('Online counselors:', onlineCounselors);
      io.emit('counselor_status_change', onlineCounselors);
    } else {
      const onlineStudents = Array.from(onlineUsers.entries())
        .filter(([_, data]) => data.userType === 'student')
        .map(([userId]) => userId);
      console.log('Online students:', onlineStudents);
      io.emit('student_status_change', onlineStudents);
    }
    
    console.log('User registered:', { userId, userType, name, socketId: socket.id });
  });

  // Handle new messages
  socket.on('send_message', async (data) => {
    console.log('Received message data:', data);
    try {
      const { studentId, facultyId, text, senderId, timestamp, senderType, receiverType } = data;
      console.log('Processing message:', {
        studentId,
        facultyId,
        senderType,
        receiverType,
        onlineUsers: Array.from(onlineUsers.entries())
      });

      // If sender is a student and receiver is a counselor, check if it's their first message
      if (senderType === 'student' && receiverType === 'counselor') {
        try {
          console.log('Checking counselor:', facultyId);
          const counselor = await Counselor.findOne({ email: facultyId });
          console.log('Found counselor:', counselor ? 'yes' : 'no');
          
          if (counselor) {
            if (!counselor.studentsInConversation) {
              counselor.studentsInConversation = [];
            }

            const studentExists = counselor.studentsInConversation.some(
              s => s.studentId === studentId
            );
            console.log('Student exists in conversation:', studentExists);

            if (!studentExists) {
              counselor.studentsInConversation.push({
                studentId: studentId,
                lastMessage: new Date()
              });
              await counselor.save();
              
              console.log('Emitting new_student_message event to counselor:', facultyId);
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
      console.log('Emitting receive_message to all users');
      io.emit('receive_message', {
        text,
        studentId,
        facultyId,
        senderId,
        timestamp: new Date(timestamp),
        senderType,
        receiverType
      });

      // Emit notification to receiver
      const receiverId = receiverType === 'student' ? studentId : facultyId;
      const senderIdForNotification = receiverType === 'student' ? facultyId : studentId;
      
      console.log('Sending notification:', {
        receiverId,
        senderId: senderIdForNotification,
        receiverType,
        receiverSocket: onlineUsers.get(receiverId)?.socketId
      });

      io.emit('new_message_notification', {
        receiverId: receiverId,
        senderId: senderIdForNotification,
        message: text,
        senderType: senderType,
        receiverType: receiverType
      });

    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  // Handle report submissions
  socket.on('report_submitted', async (data) => {
    console.log('Report submitted:', data);
    try {
      const { studentId, counselorEmail, reason } = data;
      
      // Get the counselor's socket ID
      const counselorSocket = Array.from(onlineUsers.entries())
        .find(([userId]) => userId === counselorEmail)?.[1]?.socketId;

      if (counselorSocket) {
        // Emit report notification to the counselor
        io.to(counselorSocket).emit('report_notification', {
          type: 'report',
          studentId,
          counselorEmail,
          reason,
          timestamp: new Date()
        });
      }

      // Also emit to all online counselors for awareness
      const onlineCounselors = Array.from(onlineUsers.entries())
        .filter(([_, data]) => data.userType === 'counselor')
        .map(([_, data]) => data.socketId);

      onlineCounselors.forEach(socketId => {
        if (socketId !== counselorSocket) {
          io.to(socketId).emit('counselor_report_notification', {
            type: 'counselor_report',
            studentId,
            reportedBy: counselorEmail,
            timestamp: new Date()
          });
        }
      });

    } catch (error) {
      console.error('Error handling report:', error);
    }
  });

  // Handle new event notifications
  socket.on('new_event', (eventData) => {
    io.emit('new_event_notification', {
      eventName: eventData.name,
      eventId: eventData.id
    });
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