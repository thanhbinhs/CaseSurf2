// lib/firebase.ts

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Cấu hình Firebase lấy từ biến môi trường
const firebaseConfig = {
  apiKey: "AIzaSyC3ULZidxlcefN1Ga_Jykyju9vRigfoxtQ",
  authDomain: "casesuf-e6004.firebaseapp.com",
  projectId: "casesuf-e6004",
  storageBucket: "casesuf-e6004.firebasestorage.app",
  messagingSenderId: "998526174670",
  appId: "1:998526174670:web:7f715d75d3099f1740179f",
  measurementId: "G-2CFN7CL7ZJ"
};

// Khởi tạo Firebase
// Kiểm tra nếu app chưa được khởi tạo để tránh lỗi trong môi trường dev
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Export các dịch vụ bạn cần
const auth = getAuth(app);
const db = getFirestore(app); // Thêm dòng này

export { app, auth, db };