import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Auth request:', body);
    return NextResponse.json({ success: true, message: 'Auth endpoint' });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 500 });
  }
}
