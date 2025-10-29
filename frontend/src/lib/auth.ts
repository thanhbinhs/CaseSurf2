// lib/auth.ts (Đã sửa lỗi)

import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

// --- Đăng nhập với Google và lưu vào Firestore ---
export const signInWithGoogle = async (): Promise<User | null> => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider).catch(async (e) => {
      // Popup có thể bị chặn -> dùng redirect
      if (e && typeof window !== "undefined") {
        await signInWithPopup(auth, provider); // thử lại 1 lần nếu lỗi tạm
      }
      throw e;
    });
    const user = result.user;
    await ensureUserDoc(user);
    return user;
  } catch (error) {
    console.error("Lỗi khi đăng nhập bằng Google:", error);
    return null;
  }
};

const ensureUserDoc = async (user: User) => {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const base = {
    uid: user.uid,
    username: user.displayName || "",
    gmail: user.email || "",
  };

  if (!snap.exists()) {
    await setDoc(ref, {
      ...base,
      credit: 15,
      plan: 'starter',
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    }, { merge: true });
  } else {
    await setDoc(ref, { ...base, lastLoginAt: serverTimestamp() }, { merge: true });
  }
};

// --- Đăng xuất ---
export const signOutUser = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Lỗi khi đăng xuất:", error);
  }
};