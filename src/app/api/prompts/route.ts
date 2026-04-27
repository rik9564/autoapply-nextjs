import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET - Fetch saved prompt by name
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name') || 'job_parser';

    const { data, error } = await supabase
      .from('saved_prompts')
      .select('*')
      .eq('name', name)
      .single();

    if (error) {
      // If not found, return empty
      if (error.code === 'PGRST116') {
        return NextResponse.json({ prompt: null });
      }
      throw error;
    }

    return NextResponse.json({
      id: data.id,
      name: data.name,
      prompt: data.prompt,
      description: data.description,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    console.error('Error fetching prompt:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prompt' },
      { status: 500 }
    );
  }
}

// PUT - Update saved prompt
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { name = 'job_parser', prompt } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt text is required' },
        { status: 400 }
      );
    }

    // Upsert - insert or update
    const { data, error } = await supabase
      .from('saved_prompts')
      .upsert({
        name,
        prompt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'name' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      id: data.id,
      name: data.name,
      prompt: data.prompt,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    console.error('Error updating prompt:', error);
    return NextResponse.json(
      { error: 'Failed to update prompt' },
      { status: 500 }
    );
  }
}
