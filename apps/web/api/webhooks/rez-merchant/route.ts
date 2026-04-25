import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    console.log('REZ Merchant webhook received:', payload);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('REZ Merchant webhook error:', error);
    return NextResponse.json({ success: false, error: 'Webhook processing failed' }, { status: 500 });
  }
}
