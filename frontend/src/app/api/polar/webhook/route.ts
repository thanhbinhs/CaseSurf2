import { NextRequest, NextResponse } from 'next/server';
import { Polar } from '@polar-sh/sdk';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

// Khởi tạo Firebase Admin (tương tự như trên)
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
    // Đọc raw body để verify signature
    const rawBody = await req.text();
    const signature = req.headers.get('polar-signature') as string;

    if (!signature) {
      return NextResponse.json({ message: 'Missing signature' }, { status: 400 });
    }

    // Verify webhook signature
    const webhookSecret = process.env.POLAR_WEBHOOK_SECRET!;
    const computedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (signature !== computedSignature) {
      return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
    }

    // Parse event
    const event = JSON.parse(rawBody);

    if (event.type === 'checkout.completed') {
      const checkout = event.data;
      const userId = checkout.metadata?.userId;

      if (!userId) {
        return NextResponse.json({ message: 'Missing userId in metadata' }, { status: 400 });
      }

      // Update Firebase: Upgrade plan và credits
      await db.doc(`users/${userId}`).update({
        plan: 'pro',
        credit: FieldValue.increment(Infinity), // Hoặc set giá trị unlimited nếu cần
      });

      console.log(`User ${userId} upgraded to pro via Polar webhook`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ message: 'Webhook handling failed' }, { status: 500 });
  }
}