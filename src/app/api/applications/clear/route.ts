import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Clear all applications (for testing/development only)
export async function POST(request: NextRequest) {
  try {
    // Delete all from applications table
    const { error: appError } = await supabase
      .from('applications')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (neq trick)

    if (appError) {
      console.error('Error clearing applications:', appError);
      return NextResponse.json({ error: appError.message }, { status: 500 });
    }

    // Also clear email_queue if it exists
    await supabase
      .from('email_queue')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    return NextResponse.json({
      success: true,
      message: 'All applications and email queue cleared',
    });
  } catch (error) {
    console.error('Clear applications error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clear' },
      { status: 500 }
    );
  }
}
