import mongoose from "mongoose";

const counselorSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    password: {
        type: String,
        required: true,
        minlength: [8, "Password must be at least 8 characters long"]
    },
    studentsInConversation: {
        type: [{
            studentId: {
                type: String,
                required: true
            },
            lastMessage: {
                type: Date,
                default: Date.now
            }
        }],
        default: []
    },
    resetCode: {
        type: String,
        default: null
    },
    resetCodeExpires: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { collection: "counselors" });

const Counselor = mongoose.models.Counselor || mongoose.model("Counselor", counselorSchema);

export default Counselor; 