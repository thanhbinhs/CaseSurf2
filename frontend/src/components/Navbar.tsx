// components/Navbar.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { signOutUser } from '@/lib/auth';

// Firebase
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

// ---------- Icons ----------
const CoinIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={className || 'w-5 h-5'}>
    <path d="M10 18a8 8 0 100-16 8 8 0 000 16z" />
    <path fill="#FBBE24" stroke="#FBBF24" strokeWidth="0.5" d="M10 16.5a6.5 6.5 0 100-13 6.5 6.5 0 000 13z" />
    <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#A16207">C</text>
  </svg>
);
const LibraryIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className || 'w-5 h-5'}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);
const LogoutIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className || 'w-5 h-5'}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" x2="9" y1="12" y2="12"/>
  </svg>
);
const ProfileIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className || 'w-5 h-5'}>
    <circle cx="12" cy="7" r="4" />
    <path d="M5.5 21a8.38 8.38 0 0 1 13 0" />
  </svg>
);
const MenuIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className || 'w-6 h-6'}>
    <line x1="4" y1="12" x2="20" y2="12"></line>
    <line x1="4" y1="6" x2="20" y2="6"></line>
    <line x1="4" y1="18" x2="20" y2="18"></line>
  </svg>
);
const CloseIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className || 'w-6 h-6'}>
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

// ---------- Types ----------
interface UserProfile {
  credit: number;
}

// ---------- Helpers ----------
const cx = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ');

// Active link styles
const NavLink = ({
  href, label, active
}: { href: string; label: string; active: boolean }) => (
  <Link
    href={href}
    className={cx(
      'relative px-1.5 py-1 text-sm font-semibold transition-colors',
      active ? 'text-slate-900' : 'text-slate-600 hover:text-purple-600'
    )}
  >
    {label}
    {/* Active underline */}
    <span
      className={cx(
        'absolute left-0 -bottom-1 h-[2px] w-full rounded bg-gradient-to-r from-purple-600 to-blue-600 transition-all',
        active ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'
      )}
    />
  </Link>
);

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);

  // Firestore subscription
  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) setUserProfile(snap.data() as UserProfile);
    });
    return () => unsub();
  }, [user]);

  // Close on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(t)) setIsDropdownOpen(false);
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(t)) setIsMobileMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Close on Esc + focus first item when opening dropdown
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false);
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (isDropdownOpen) {
      // small delay to ensure element mounted
      setTimeout(() => firstMenuItemRef.current?.focus(), 0);
    }
  }, [isDropdownOpen]);

  // Lock body scroll when mobile menu open
  useEffect(() => {
    if (isMobileMenuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [isMobileMenuOpen]);

  const handleNavigation = (path: string) => {
    router.push(path);
    setIsDropdownOpen(false);
    setIsMobileMenuOpen(false);
  };

  const renderUserSection = () => {
    if (loading) {
      return <div className="w-28 h-10 bg-slate-200 rounded-full animate-pulse" />;
    }

    if (user) {
      return (
        <div className="flex items-center gap-3">
          {/* Credit pill */}
          <button
            onClick={() => handleNavigation('/payment')}
            className="flex cursor-pointer items-center gap-2 px-3 py-2 rounded-full bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
            aria-label="Go to payment / credits"
          >
            <CoinIcon className="w-5 h-5 text-yellow-500" />
            <span className="tabular-nums">{userProfile ? userProfile.credit : '…'}</span>
          </button>

          {/* Avatar + dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={isDropdownOpen}
              className="cursor-pointer block rounded-full overflow-hidden border-2 border-transparent hover:border-purple-500 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
            >
              <Image
                src={user.photoURL || '/images/default_avatar.jpg'}
                alt="User"
                width={40}
                height={40}
                className="object-cover"
              />
            </button>

            {isDropdownOpen && (
              <div
                role="menu"
                aria-label="User menu"
                className="absolute right-0 mt-3 w-64 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="font-semibold text-slate-800 truncate">{user.displayName}</p>
                  <p className="text-sm text-slate-500 truncate">{user.email}</p>
                </div>

                <div className="p-1">
                  <button
                    ref={firstMenuItemRef}
                    onClick={() => handleNavigation('/personal')}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                  >
                    <LibraryIcon className="w-5 h-5 text-slate-500" />
                    <span>My Library</span>
                  </button>

                  <button
                    onClick={() => handleNavigation('/auth')}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                  >
                    <ProfileIcon className="w-5 h-5 text-slate-500" />
                    <span>Profile</span>
                  </button>
                </div>

                <div className="border-t border-slate-100 p-1">
                  <button
                    onClick={() => { signOutUser(); setIsDropdownOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none"
                  >
                    <LogoutIcon className="w-5 h-5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Not signed in
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/auth"
          className="inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition"
        >
          Sign In
        </Link>
      </div>
    );
  };

  return (
    <nav className="sticky top-0 z-40 h-16 border-b border-slate-200 bg-white/70 backdrop-blur-md">
      <div className="mx-auto h-full max-w-7xl px-4 flex items-center justify-between">
        {/* Left: brand + desktop nav */}
        <div className="flex items-center gap-8">
          <button
            onClick={() => handleNavigation('/')}
            className="cursor-pointer"
            aria-label="Go to home"
          >
            <Image src="/images/logo.svg" alt="Logo" width={140} height={35} className="h-8 w-auto" />
          </button>

          <div className="hidden md:flex items-center gap-6 group">
            <NavLink href="/library"  label="TikTok Library" active={pathname === '/library'} />
            <NavLink href="/research" label="Research"       active={pathname?.startsWith('/research') ?? false} />
            <NavLink href="/payment"  label="Payment"        active={pathname === '/payment'} />
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-3">
          {/* Desktop user area */}
          <div className="hidden md:block">{renderUserSection()}</div>

          {/* Mobile burger */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden text-slate-600 hover:text-purple-600 transition-colors"
            aria-label="Open menu"
          >
            <MenuIcon />
          </button>
        </div>
      </div>

      {/* Mobile drawer + overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden">
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden
          />

          {/* Drawer */}
          <div
            ref={mobileMenuRef}
            className="fixed right-0 top-0 z-50 h-full w-80 max-w-[85%] bg-white shadow-xl border-l border-slate-200 p-4 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile menu"
          >
            <div className="flex items-center justify-between mb-6">
              <Image src="/images/logo.svg" alt="Logo" width={120} height={30} className="h-7 w-auto" />
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
                aria-label="Close menu"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <button
                className={cx(
                  'text-left py-2 px-3 rounded-md transition-colors',
                  pathname === '/library' ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-100'
                )}
                onClick={() => handleNavigation('/library')}
              >
                TikTok Library
              </button>
              <button
                className={cx(
                  'text-left py-2 px-3 rounded-md transition-colors',
                  pathname?.startsWith('/research') ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-100'
                )}
                onClick={() => handleNavigation('/research')}
              >
                Research
              </button>
              <button
                className={cx(
                  'text-left py-2 px-3 rounded-md transition-colors',
                  pathname === '/payment' ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-100'
                )}
                onClick={() => handleNavigation('/payment')}
              >
                Payment
              </button>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-4">
              {renderUserSection()}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
