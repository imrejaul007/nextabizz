import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    rfqs: [],
    message: 'RFQs API endpoint',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Create RFQ:', body);
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    console.error('Create RFQ error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create RFQ' }, { status: 500 });
  }
}
