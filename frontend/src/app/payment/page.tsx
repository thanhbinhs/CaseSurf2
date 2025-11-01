'use client';

import React, { useState, useEffect, FC } from 'react';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/contexts/AuthContext';
import { doc, increment, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CheckIcon, ShoppingBagIcon } from '@/components/Icons';

type PlanId = 'starter' | 'pro';

interface Plan {
  id: PlanId;
  name: string;
  description: string;
  credits: number | typeof Infinity;
  price: number;
  features: string[];
  popular?: boolean;
}

interface PricingCardProps {
  plan: Plan;
  onPurchase: (plan: Plan) => void;
  isCurrentPlan: boolean;
  isUpgradeDisabled: boolean;
}

const formatUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);

const PricingCard: FC<PricingCardProps> = ({ plan, onPurchase, isCurrentPlan, isUpgradeDisabled }) => {
  const isFree = plan.price === 0;
  const disabled = isCurrentPlan || isUpgradeDisabled;

  return (
    <div
      className={[
        'relative w-full cursor-pointer max-w-sm rounded-2xl p-[1px] transition-transform duration-300 hover:scale-[1.01] h-full',
        isCurrentPlan ? 'bg-gradient-to-r from-emerald-400 to-emerald-200' :
        plan.popular   ? 'bg-gradient-to-r from-violet-500 to-indigo-400' :
                         'bg-slate-200'
      ].join(' ')}
    >
      <div className="rounded-2xl bg-white p-7 shadow-lg h-full flex flex-col">
        {/* Ribbons */}
        {plan.popular && !isCurrentPlan && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow">
              Most Popular
            </span>
          </div>
        )}
        {isCurrentPlan && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow">
              Your Plan
            </span>
          </div>
        )}

        {/* Header */}
        <h3 className="text-2xl font-bold text-slate-900">{plan.name}</h3>
        <p className="mt-1 text-slate-600">{plan.description}</p>

        {/* Price */}
        <div className="mt-6">
          <span className="text-5xl font-extrabold tracking-tight text-slate-900">
            {isFree ? '$0' : formatUSD(plan.price)}
          </span>
          {!isFree && <span className="ml-1 text-base font-medium text-slate-500">/ one-time</span>}
        </div>

        {/* Features */}
        <ul className="mt-6 space-y-3 flex-1">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-start">
              <CheckIcon className="mr-3 h-5 w-5 flex-shrink-0 text-violet-600" />
              <span className="text-slate-700">{f}</span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <button
          onClick={() => !disabled && onPurchase(plan)}
          disabled={disabled}
          className={[
            'mt-8 cursor-pointer w-full rounded-lg px-5 py-3 text-lg font-semibold transition-all',
            disabled
              ? 'cursor-not-allowed bg-slate-100 text-slate-400'
              : plan.popular
              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-95'
              : 'border-2 border-violet-600 text-violet-700 hover:bg-violet-50'
          ].join(' ')}
          aria-disabled={disabled}
        >
          {disabled ? 'Unavailable' : (isFree ? 'Get Starter' : 'Purchase Now')}
        </button>
      </div>
    </div>
  );
};

export default function PaymentPage() {
  const { user } = useAuth();
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentUserPlan, setCurrentUserPlan] = useState<PlanId>('starter');

  // Lắng nghe thay đổi plan của user
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        setCurrentUserPlan((data.plan as PlanId) || 'starter');
      }
    });
    return () => unsub();
  }, [user]);

  // Kiểm tra URL params khi trang tải để hiển thị thông báo khi được redirect về từ Polar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setPaymentSuccess(true);
      // Xóa param khỏi URL để không hiển thị lại khi refresh
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (params.get('cancel') === 'true') {
      setPaymentError('Your payment was canceled.');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const plans: Plan[] = [
    {
      id: 'starter',
      name: 'Starter',
      description: 'Perfect for getting started.',
      credits: 5,
      price: 0,
      features: ['5 video credits', 'Standard support']
    },
    {
      id: 'pro',
      name: 'Lifetime Pro',
      description: 'Best value for creators.',
      credits: Infinity,
      price: 30,
      features: [
        'Unlimited video analysis',
        'Priority email support',
        'Access to new features',
        '7-Day Refund Policy'
      ],
      popular: true
    }
  ];

  const isPlanUnavailable = (planId: PlanId) => {
    if (currentUserPlan === 'pro') return true;
    if (currentUserPlan === 'starter' && planId === 'starter') return true;
    return false;
  };

  const handlePurchaseClick = async (plan: Plan) => {
    if (!user) {
      setPaymentError('Please sign in to continue.');
      return;
    }
    if (isPlanUnavailable(plan.id)) return;

    setPaymentError(null);
    setPaymentSuccess(false);
    setIsProcessing(true); // Bắt đầu loading

    // Logic gói miễn phí
    if (plan.price === 0) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          credit: increment(typeof plan.credits === 'number' ? plan.credits : 0),
          plan: plan.id
        });
        setPaymentSuccess(true);
      } catch (e) {
        console.error(e);
        setPaymentError('Failed to activate Starter. Please try again.');
      }
      setIsProcessing(false); // Kết thúc loading
      return;
    }

    // Logic gói trả phí với Polar
    try {
      const res = await fetch('/api/polar/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          customerEmail: user.email, // Gửi email user
          userId: user.uid,        // Gửi ID user để webhook liên kết
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to create checkout session.');
      }

      // Chuyển hướng đến trang thanh toán của Polar
      window.location.href = data.checkoutUrl;
      // Không cần setIsProcessing(false) vì trang sẽ được chuyển hướng đi

    } catch (err: any) {
      console.error(err);
      setPaymentError(`Error: ${err.message}`);
      setIsProcessing(false); // Kết thúc loading nếu có lỗi
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <Navbar />

      {/* Hero */}
      <section className="container mx-auto px-4 pt-12 sm:pt-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Choose Your Plan</h1>
          <p className="mt-4 max-w-xl mx-auto text-lg text-slate-600">
            Unlock the full potential of our platform with a one-time purchase.
          </p>
        </div>
      </section>

      {/* Alerts */}
      <section className="container mx-auto px-4">
        {paymentSuccess && (
          <div className="mx-auto max-w-3xl rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            Payment successful! Your plan has been upgraded.
          </div>
        )}
        {paymentError && (
          <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
            {paymentError}
          </div>
        )}
      </section>

      {/* Pricing grid */}
      <main className="container mx-auto px-4 py-12 sm:py-16">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2 items-stretch">
          {plans.map((plan) => (
            <PricingCard
              key={plan.id}
              plan={plan}
              onPurchase={handlePurchaseClick}
              isCurrentPlan={currentUserPlan === plan.id}
              isUpgradeDisabled={isPlanUnavailable(plan.id) || isProcessing}
            />
          ))}
        </div>

        {/* Trust row */}
        <div className="mx-auto mt-12 max-w-xl rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
          <div className="flex items-center justify-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M12 1a5 5 0 00-5 5v3H6a3 3 0 00-3 3v6a3 3 0 003 3h12a3 3 0 003-3v-6a3 3 0 00-3-3h-1V6a5 5 0 00-5-5zm-3 8V6a3 3 0 116 0v3H9z"/>
              </svg>
            </span>
            <span>Secure checkout • No recurring charges</span>
          </div>
        </div>
      </main>

      {/* Modal loading khi processing */}
      {isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/60" />

          {/* Dialog */}
          <div className="relative z-10 w-full max-w-xs rounded-2xl bg-white p-6 shadow-2xl">
            <div className="py-8 text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
              <h2 className="mt-6 text-2xl font-bold text-slate-900">Processing…</h2>
              <p className="mt-1 text-slate-600">Please wait a moment.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}