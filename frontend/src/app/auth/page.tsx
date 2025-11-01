// app/page.tsx (hoặc file bạn đang dùng)
// 'use client' bắt buộc
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { signInWithGoogle, signOutUser } from '@/lib/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Navbar from '@/components/Navbar';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
// import { Footer } from '@/components/Footer';
import { GoogleIcon } from '@/components/Icons';

type Plan = 'starter' | 'pro';

interface UserProfile {
    username: string;
    gmail: string;
    credit: number;
    plan: Plan;
}

export default function Home() {
    const router = useRouter();
    const { user, loading } = useAuth();

    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [signingIn, setSigningIn] = useState(false);

    // Subscribe hồ sơ người dùng realtime
    useEffect(() => {
        setProfileError(null);

        if (!user) {
            setUserProfile(null);
            return;
        }

        const userDocRef = doc(db, 'users', user.uid);
        const unsubscribe = onSnapshot(
            userDocRef,
            (snap) => {
                if (snap.exists()) {
                    setUserProfile(snap.data() as UserProfile);
                } else {
                    // Tài khoản mới, chưa có document
                    setUserProfile(null);
                }
            },
            (err) => {
                console.error('onSnapshot error:', err);
                setProfileError('Không thể tải hồ sơ. Vui lòng thử lại sau.');
            }
        );

        return () => unsubscribe();
    }, [user]);

    const planMeta: Record<Plan, { label: string; badge: string; ring: string }> = {
  starter: {
    label: 'Starter',
    // badge trung tính, viền tinh tế
    badge: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
    // viền avatar nhẹ nhàng
    ring: 'ring-slate-200',
  },
  pro: {
    label: 'Pro',
    // badge nổi bật với gradient, tông tím–indigo cho cảm giác premium
    badge: 'bg-gradient-to-r from-violet-100 to-indigo-100 text-indigo-700 ring-1 ring-inset ring-indigo-200',
    // viền avatar đậm hơn để “Pro” bật lên
    ring: 'ring-indigo-300',
  },
};

    const handleSignIn = async () => {
        try {
            setSigningIn(true);
            await signInWithGoogle();
        } catch (e) {
            console.error(e);
        } finally {
            setSigningIn(false);
        }
    };

    // SKELETON LOADING card
    const CardSkeleton = () => (
        <div className="w-full max-w-md mx-auto bg-white/80 backdrop-blur rounded-2xl shadow-lg border border-slate-200 p-8 animate-pulse">
            <div className="mx-auto mb-6 h-10 w-40 bg-slate-200 rounded" />
            <div className="mx-auto mb-4 h-24 w-24 rounded-full bg-slate-200" />
            <div className="h-6 w-48 bg-slate-200 mx-auto mb-2 rounded" />
            <div className="h-4 w-56 bg-slate-200 mx-auto mb-6 rounded" />
            <div className="h-12 w-full bg-slate-200 rounded mb-3" />
            <div className="h-10 w-full bg-slate-200 rounded" />
        </div>
    );

    const LoginContent = () => (
        <div className="w-full max-w-md mx-auto bg-white/90 backdrop-blur p-8 md:p-10 rounded-2xl shadow-xl border border-slate-200 text-center">
            <Image src="/images/logo.svg" alt="CaseSurf Logo" width={180} height={45} className="mx-auto mb-6" />
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Welcome back</h1>
            <p className="text-slate-500 mb-8">Sign in to continue your journey to viral success.</p>

            <button
                onClick={handleSignIn}
                disabled={signingIn}
                className="w-full inline-flex justify-center items-center gap-3 py-3 px-4 bg-white border border-slate-300 rounded-lg text-slate-800 font-semibold hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-60"
                aria-busy={signingIn}
            >
                <GoogleIcon />
                {signingIn ? 'Signing in…' : 'Sign in with Google'}
            </button>

            <div className="mt-6 text-xs text-slate-400">
                By continuing, you agree to our{' '}
                <a className="underline hover:text-slate-600" href="/terms">Terms</a> and{' '}
                <a className="underline hover:text-slate-600" href="/privacy">Privacy Policy</a>.
            </div>
        </div>
    );

    const UserProfileContent = () => {
        if (!user) return null;

        const plan = userProfile?.plan ?? 'starter';
        const meta = planMeta[plan];

        return (
            <div className="w-full max-w-md mx-auto bg-white/90 backdrop-blur p-8 rounded-2xl shadow-xl border border-slate-200 text-center">
                {/* Avatar */}
                <div className={`inline-block rounded-full p-1 ring-4 ${meta?.ring} mb-4`}>
                    {user.photoURL ? (
                        <Image
                            src={user.photoURL}
                            alt="User Avatar"
                            width={96}
                            height={96}
                            className="rounded-full"
                        />
                    ) : (
                        <Image
                            src="/images/avatar-fallback.png"
                            alt="User Avatar"
                            width={96}
                            height={96}
                            className="rounded-full"
                        />
                    )}
                </div>

                {/* Name + email */}
                <h1 className="text-2xl font-bold text-slate-800">Welcome, {user.displayName || 'Friend'}!</h1>
                <p className="text-slate-500">{user.email}</p>

                {/* Plan + Credit */}
                <div className="grid grid-cols-2 gap-3 my-6">
                    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                        <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Plan</div>
                        <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-sm font-semibold ${meta?.badge}`}>
                            <span className="inline-block w-2 h-2 rounded-full bg-current opacity-70" />
                            {meta?.label}
                        </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                        <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Credits</div>
                        <div className="text-xl font-semibold text-slate-800 tabular-nums">
                            {userProfile ? userProfile.credit : '…'}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="space-y-3">
                    <button
                        onClick={() => router.push('/personal')}
                        className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:opacity-95 active:opacity-90 transition"
                    >
                        Go to Your Library
                    </button>

                    <button
                        onClick={() => router.push('/')}
                        className="w-full py-3 px-4 bg-white border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition"
                    >
                        Start New Analysis
                    </button>

                    <button
                        onClick={signOutUser}
                        className="w-full py-2.5 px-4 text-slate-500 font-medium rounded-lg hover:bg-slate-100 transition"
                    >
                        Sign Out
                    </button>
                </div>

                {/* Error message (nếu có) */}
                {profileError && (
                    <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                        {profileError}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50">
            {/* Navbar */}
            <Navbar />

            {/* Hero background accent */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-[-8rem] -z-10 transform-gpu overflow-hidden blur-3xl"
            >
                <div
                    className="relative left-[max(50%,25rem)] aspect-[1155/678] w-[36rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-purple-300 to-blue-300 opacity-20"
                    style={{
                        clipPath:
                            'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
                    }}
                />
            </div>

            <main className="flex-grow flex items-center justify-center p-4">
                {loading ? (
                    <CardSkeleton />
                ) : user ? (
                    <UserProfileContent />
                ) : (
                    <LoginContent />
                )}
            </main>

            {/* <Footer /> */}
        </div>
    );
}
