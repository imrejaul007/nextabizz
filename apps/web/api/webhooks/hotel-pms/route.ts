import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    console.log('Hotel PMS webhook received:', payload);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Hotel PMS webhook error:', error);
    return NextResponse.json({ success: false, error: 'Webhook processing failed' }, { status: 500 });
  }
}
