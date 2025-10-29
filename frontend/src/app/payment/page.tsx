'use client';

import React, { useState, useEffect, FC } from 'react';
import Navbar from '@/components/Navbar';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useAuth } from '@/contexts/AuthContext';
import { doc, increment, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CheckIcon, CloseIcon, ShoppingBagIcon } from '@/components/Icons';

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
        'relative w-full cursor-pointer max-w-sm rounded-2xl p-[1px] transition-transform duration-300 hover:scale-[1.01] h-full', // h-full để equal height
        isCurrentPlan ? 'bg-gradient-to-r from-emerald-400 to-emerald-200' :
        plan.popular   ? 'bg-gradient-to-r from-violet-500 to-indigo-400' :
                         'bg-slate-200'
      ].join(' ')}
    >
      <div className="rounded-2xl bg-white p-7 shadow-lg h-full flex flex-col"> {/* flex-col + h-full */}
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
        <ul className="mt-6 space-y-3 flex-1"> {/* flex-1 đẩy CTA xuống đáy */}
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
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentUserPlan, setCurrentUserPlan] = useState<PlanId>('starter');

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

  const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  if (!PAYPAL_CLIENT_ID) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="rounded-xl border border-red-200 bg-white p-8 text-center shadow">
          <h2 className="text-2xl font-bold text-red-600">Configuration Error</h2>
          <p className="mt-2 text-slate-600">PayPal Client ID is not configured.</p>
        </div>
      </div>
    );
  }

  // Quy tắc disable:
  // - Ở Starter: gói Starter = Unavailable (đã có), gói Pro = Có thể mua
  // - Ở Pro: cả 2 gói = Unavailable
  const isPlanUnavailable = (planId: PlanId) => {
    if (currentUserPlan === 'pro') return true;                // Pro user => cả 2 khoá
    if (currentUserPlan === 'starter' && planId === 'starter') return true; // Starter user => gói Starter khoá
    return false;                                              // Còn lại: cho mua
  };

  // Click "Purchase" / "Get Starter"
  const handlePurchaseClick = async (plan: Plan) => {
    if (!user) {
      setPaymentError('Please sign in to continue.');
      return;
    }
    if (isPlanUnavailable(plan.id)) return;

    setPaymentError(null);
    setPaymentSuccess(false);

    // Free plan về lý thuyết đang Unavailable ở Starter, nhưng giữ logic đề phòng trường hợp khác
    if (plan.price === 0) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          credit: increment(typeof plan.credits === 'number' ? plan.credits : 0),
          plan: plan.id
        });
        setPaymentSuccess(true);
        return;
      } catch (e) {
        console.error(e);
        setPaymentError('Failed to activate Starter. Please try again.');
        return;
      }
    }

    // Paid plan => open modal with PayPal
    setSelectedPlan(plan);
  };

  // After successful capture
  const handleSuccessfulPayment = async (plan: Plan) => {
    if (!user) {
      setPaymentError('You must be logged in to complete the purchase.');
      return;
    }
    try {
      const userDocRef = doc(db, 'users', user.uid);
      if (plan.id === 'pro') {
        await updateDoc(userDocRef, { isPro: true, plan: 'pro' });
      } else {
        await updateDoc(userDocRef, { credit: increment(typeof plan.credits === 'number' ? plan.credits : 0), plan: plan.id });
      }
      setPaymentSuccess(true);
    } catch (error) {
      console.error('Error updating user data:', error);
      setPaymentError('Failed to update your account. Please contact support.');
    }
  };

  // PayPal: create order
  const createOrder = (data: any, actions: any) => {
    if (!selectedPlan) return Promise.reject(new Error('No plan selected'));
    return actions.order.create({
      purchase_units: [
        {
          description: `Purchase of ${selectedPlan.name} plan`,
          amount: { value: selectedPlan.price.toString(), currency_code: 'USD' }
        }
      ],
      application_context: { shipping_preference: 'NO_SHIPPING' }
    });
  };

  // PayPal: approve
  const onApprove = async (data: any, actions: any) => {
    if (!user || !selectedPlan) {
      setPaymentError('User or selected plan is missing. Please try again.');
      return;
    }
    setIsProcessing(true);
    try {
      const res = await fetch('/api/paypal/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderID: data.orderID, userId: user.uid, planName: selectedPlan.name })
      });
      const orderData = await res.json();
      if (!res.ok) throw new Error(orderData.message || 'Server error during payment capture.');

      const txn = orderData?.purchase_units?.[0]?.payments?.captures?.[0];
      if (txn?.status === 'COMPLETED') {
        await handleSuccessfulPayment(selectedPlan);
      } else {
        setPaymentError(`Payment status: ${txn?.status || 'Unknown'}. Please contact support.`);
      }
    } catch (err: any) {
      setPaymentError(`Error finalizing payment: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
      setSelectedPlan(null);
    }
  };

  const onError = (err: any) => {
    console.error('PayPal Error:', err);
    setPaymentError('An error occurred with your payment. Please try again.');
    setIsProcessing(false);
  };

  const closeModal = () => {
    if (!isProcessing) setSelectedPlan(null);
  };

  return (
    <PayPalScriptProvider options={{ clientId: PAYPAL_CLIENT_ID, currency: 'USD', intent: 'capture' }}>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <Navbar />

        {/* Hero */}
        <section className="container mx-auto px-4 pt-12 sm:pt-16">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Choose Your Plan
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-600">
              Select a package that fits your needs. All payments are secure and one-time.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              7-Day Refund Policy on Pro
            </div>
          </div>
        </section>

        {/* Alerts */}
        <section className="container mx-auto px-4">
          <div className="mx-auto mt-8 max-w-md">
            {paymentSuccess && (
              <div role="status" aria-live="polite" className="rounded-lg border-l-4 border-emerald-500 bg-emerald-50 p-4 text-emerald-800">
                <p className="font-bold">Payment Successful!</p>
                <p>Your account has been upgraded. Enjoy your new features.</p>
              </div>
            )}
            {paymentError && (
              <div role="alert" aria-live="assertive" className="mt-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 text-red-800">
                <p className="font-bold">Payment Error</p>
                <p>{paymentError}</p>
              </div>
            )}
          </div>
        </section>

        {/* Pricing grid */}
        <main className="container mx-auto px-4 py-12 sm:py-16">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2 items-stretch"> {/* items-stretch để card bằng nhau */}
            {plans.map((plan) => (
              <PricingCard
                key={plan.id}
                plan={plan}
                onPurchase={handlePurchaseClick}
                isCurrentPlan={currentUserPlan === plan.id}
                isUpgradeDisabled={isPlanUnavailable(plan.id)}
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
              <span>Secure checkout via PayPal • No recurring charges</span>
            </div>
          </div>
        </main>

        {/* Modal */}
        {selectedPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/60" onClick={closeModal} />

            {/* Dialog */}
            <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <button
                onClick={closeModal}
                className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                disabled={isProcessing}
                aria-label="Close"
              >
                <CloseIcon />
              </button>

              {isProcessing ? (
                <div className="py-10 text-center">
                  <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
                  <h2 className="mt-6 text-2xl font-bold text-slate-900">Processing Payment…</h2>
                  <p className="mt-1 text-slate-600">This may take a moment. Please don’t close this window.</p>
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-100">
                      <ShoppingBagIcon className="h-8 w-8 text-violet-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Complete Your Purchase</h2>
                    <p className="mt-1 text-slate-600">
                      You’re about to purchase the <span className="font-semibold text-slate-800">{selectedPlan.name}</span> plan.
                    </p>
                  </div>

                  <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-lg">
                      <span className="font-medium text-slate-700">Total</span>
                      <span className="font-bold text-slate-900">{formatUSD(selectedPlan.price)}</span>
                    </div>
                  </div>

                  <div className="mt-6">
                    <PayPalButtons
                      style={{ layout: 'vertical', label: 'pay' }}
                      createOrder={createOrder}
                      onApprove={onApprove}
                      onError={onError}
                      onCancel={() => setSelectedPlan(null)}
                      className="w-full"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </PayPalScriptProvider>
  );
}
