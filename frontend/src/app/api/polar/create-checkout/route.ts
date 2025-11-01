import { NextRequest, NextResponse } from 'next/server';
import { Polar } from '@polar-sh/sdk';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Khởi tạo Firebase Admin (nếu chưa)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = getFirestore();

// Khởi tạo Polar SDK
const polar = new Polar({
  accessToken: process.env.POLAR_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const { planId, customerEmail, userId } = await req.json();

    if (!planId || !customerEmail || !userId) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    // Giả sử bạn đã tạo product trên Polar dashboard (product có price one-time $30)
    let productId: string;
    if (planId === 'pro') {
      productId = '49f1861f-e657-4f06-bf6f-f2939448768c'; // Lấy product ID từ dashboard Polar (không phải price ID)
    } else {
      return NextResponse.json({ message: 'Invalid plan' }, { status: 400 });
    }

    // Tạo checkout session (sử dụng products là array product IDs)
    const checkout = await polar.checkouts.create({
      products: [productId], // Array các product ID, khách có thể switch nếu nhiều; dùng [productId] cho single
      customerEmail: customerEmail,
      successUrl: `${req.nextUrl.origin}/payment?success=true`,
      returnUrl: `${req.nextUrl.origin}/payment?cancel=true`,
      metadata: { userId },
    });

    return NextResponse.json({ checkoutUrl: checkout.url });
  } catch (error) {
    console.error('Error creating checkout:', error);
    return NextResponse.json({ message: 'Failed to create checkout session' }, { status: 500 });
  }
}