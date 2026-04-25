import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    merchants: [],
    message: 'Merchants API endpoint',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Basic input validation
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    // Validate required fields for merchant creation
    if (!body.businessName || typeof body.businessName !== 'string' || body.businessName.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Business name is required' }, { status: 400 });
    }

    console.log('Create merchant:', { ...body, businessName: body.businessName }); // Log sanitized data

    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Create merchant error:', errorMessage);
    return NextResponse.json({ success: false, error: 'Failed to create merchant' }, { status: 500 });
  }
}
