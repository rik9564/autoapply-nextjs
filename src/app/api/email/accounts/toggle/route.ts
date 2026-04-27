import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Toggle email account active status
export async function POST(request: NextRequest) {
  try {
    const { accountId, isActive } = await request.json();

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('email_accounts')
      .update({ 
        is_active: isActive,
        updated_at: new Date().toISOString() 
      })
      .eq('id', accountId);

    if (error) {
      console.error('Error toggling account:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, isActive });
  } catch (error) {
    console.error('Toggle account error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to toggle' },
      { status: 500 }
    );
  }
}
