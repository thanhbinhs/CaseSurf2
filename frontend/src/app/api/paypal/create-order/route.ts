import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { amount } = await req.json();

    const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID!;
    const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET!;
    const PAYPAL_API_BASE = 'https://api-m.paypal.com';

    // 1. Lấy access token từ PayPal
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body: 'grant_type=client_credentials',
    });
    const tokenData = await tokenRes.json();

    // 2. Gọi API tạo order
    const orderRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: amount,
            },
          },
        ],
      }),
    });

    const orderData = await orderRes.json();
    return NextResponse.json(orderData);
  } catch (error) {
    console.error('PayPal Create Order Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
