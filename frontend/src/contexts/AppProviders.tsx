'use client';

import {ReactNode} from "react";
import { AuthProvider } from "./AuthContext";

export default function AppProviders({ children }: { children: ReactNode }) {
    return (
        <div>
            <AuthProvider>{children}</AuthProvider>
        </div>
    );
}