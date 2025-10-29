// contexts/AuthContext.tsx
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase'; // Đường dẫn tới file firebase

// Định nghĩa kiểu cho Context
interface AuthContextType {
  user: User | null;
  loading: boolean;
}

// Tạo Context
const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

// Tạo Provider Component
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Lắng nghe sự thay đổi trạng thái đăng nhập của người dùng
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    // Hủy lắng nghe khi component bị unmount
    return () => unsubscribe();
  }, []);

  const value = { user, loading };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Tạo custom hook để dễ dàng sử dụng Context
export const useAuth = () => {
  return useContext(AuthContext);
};