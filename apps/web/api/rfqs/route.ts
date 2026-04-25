import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    rfqs: [],
    message: 'RFQs API endpoint',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Basic input validation
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    // Validate required fields for RFQ creation
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'RFQ title is required' }, { status: 400 });
    }

    if (!body.quantity || typeof body.quantity !== 'number' || body.quantity <= 0) {
      return NextResponse.json({ success: false, error: 'Valid quantity is required' }, { status: 400 });
    }

    console.log('Create RFQ:', { ...body, title: body.title }); // Log sanitized data

    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Create RFQ error:', errorMessage);
    return NextResponse.json({ success: false, error: 'Failed to create RFQ' }, { status: 500 });
  }
}
