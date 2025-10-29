// src/app/api/paypal/webhook/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID!;
    const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID!;
    const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET!;
    const PAYPAL_API_BASE = 'https://api-m.paypal.com'; // đổi sang sandbox nếu test

    // 1. Lấy raw body từ request
    const rawBodyBuffer = Buffer.from(await req.arrayBuffer());
    const rawBodyString = rawBodyBuffer.toString();

    // 2. Gọi PayPal API để xác thực chữ ký
    const basicAuth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
    const verifyRes = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify({
        auth_algo: req.headers.get('paypal-auth-algo'),
        cert_url: req.headers.get('paypal-cert-url'),
        transmission_id: req.headers.get('paypal-transmission-id'),
        transmission_sig: req.headers.get('paypal-transmission-sig'),
        transmission_time: req.headers.get('paypal-transmission-time'),
        webhook_id: PAYPAL_WEBHOOK_ID,
        webhook_event: JSON.parse(rawBodyString),
      }),
    });

    const verifyData = await verifyRes.json();
    if (verifyData.verification_status !== 'SUCCESS') {
      console.error('PayPal Webhook verification failed:', verifyData);
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
    }

    // 3. Parse event
    const event = JSON.parse(rawBodyString);
    console.log('PayPal Webhook Event:', event.event_type);

    // 4. Xử lý tùy event
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const captureId = event.resource.id;
      const amount = event.resource.amount.value;
      console.log(`Thanh toán thành công: ${captureId} - ${amount} ${event.resource.amount.currency_code}`);

      // TODO: Lưu vào DB
    }

    if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
      console.log(`Hoàn tiền: ${event.resource.id}`);
      // TODO: Cập nhật DB
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
