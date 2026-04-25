import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    merchants: [],
    message: 'Merchants API endpoint',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Create merchant:', body);
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    console.error('Create merchant error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create merchant' }, { status: 500 });
  }
}
