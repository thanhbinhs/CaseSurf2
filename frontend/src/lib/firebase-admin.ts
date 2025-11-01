// lib/firebase-admin.ts
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

// Đường dẫn đến file JSON service account (thay bằng đường dẫn thực tế của bạn)
// Ví dụ: './credentials/firebase-service-account.json' hoặc '/path/to/your/serviceAccountKey.json'
const serviceAccountPath = "./casesuf-e6004-firebase-adminsdk-fbsvc-aa7096c017.json"; // Hardcode cho dev, nhưng khuyến nghị dùng env cho production

let adminApp: App;
let adminDb: Firestore;

// Kiểm tra để tránh khởi tạo lại app (Next.js hot-reload)
if (!getApps().length) {
  // Load service account từ file JSON trực tiếp
  const serviceAccount = require(serviceAccountPath);

  adminApp = initializeApp({
    credential: cert(serviceAccount),
  });
} else {
  adminApp = getApps()[0];
}

adminDb = getFirestore(adminApp);

export { adminDb };