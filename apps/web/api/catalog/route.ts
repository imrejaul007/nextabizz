import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    products: [],
    message: 'Catalog API endpoint',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Create product:', body);
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    console.error('Create product error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create product' }, { status: 500 });
  }
}
