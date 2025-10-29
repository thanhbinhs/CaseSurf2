// src/app/api/paypal/capture-order/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { orderID } = await req.json();

    if (!orderID || typeof orderID !== 'string') {
      return NextResponse.json(
        { error: 'orderID is required' },
        { status: 400 }
      );
    }

    const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
    const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'PayPal credentials are missing' },
        { status: 500 }
      );
    }

    const PAYPAL_API_BASE = 'https://api-m.paypal.com'; // Đổi sang sandbox nếu test

    // ==== 1. Lấy Access Token ====
    const tokenRes = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('PayPal Token Error:', err);
      return NextResponse.json(
        { error: 'Failed to get PayPal token' },
        { status: 500 }
      );
    }

    const { access_token } = await tokenRes.json();

    // ==== 2. Capture Order ====
    const captureRes = await fetch(
      `${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const captureData = await captureRes.json();

    if (!captureRes.ok) {
      console.error('PayPal Capture Error:', captureData);
      return NextResponse.json(
        { error: 'Failed to capture PayPal order', details: captureData },
        { status: 500 }
      );
    }

    return NextResponse.json(captureData);
  } catch (error) {
    console.error('Capture Order API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
