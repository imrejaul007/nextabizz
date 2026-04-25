import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    products: [],
    message: 'Catalog API endpoint',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Basic input validation
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    // Validate required fields for product creation
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Product name is required' }, { status: 400 });
    }

    console.log('Create product:', { ...body, name: body.name }); // Log sanitized data

    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Create product error:', errorMessage);
    return NextResponse.json({ success: false, error: 'Failed to create product' }, { status: 500 });
  }
}
