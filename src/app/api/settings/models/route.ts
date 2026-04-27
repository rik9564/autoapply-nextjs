import { NextRequest, NextResponse } from 'next/server';
import { 
  getAvailableModels, 
  getCurrentModels, 
  setChatModel, 
  setStructuredModel,
  getModelDefaults,
} from '@/lib/ai-service';

export async function GET() {
  try {
    const availableModels = getAvailableModels();
    const currentModels = await getCurrentModels();
    const defaults = getModelDefaults();
    
    return NextResponse.json({
      available: availableModels,
      current: currentModels,
      defaults,
    });
  } catch (error) {
    console.error('Error fetching model settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch model settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chatModel, structuredModel } = body;
    
    const results: { chatModel?: string; structuredModel?: string } = {};
    
    if (chatModel) {
      const success = await setChatModel(chatModel);
      if (success) {
        results.chatModel = chatModel;
      } else {
        return NextResponse.json(
          { error: `Invalid chat model: ${chatModel}` },
          { status: 400 }
        );
      }
    }
    
    if (structuredModel) {
      const success = await setStructuredModel(structuredModel);
      if (success) {
        results.structuredModel = structuredModel;
      } else {
        return NextResponse.json(
          { error: `Invalid structured model: ${structuredModel}` },
          { status: 400 }
        );
      }
    }
    
    const currentModels = await getCurrentModels();
    
    return NextResponse.json({
      success: true,
      updated: results,
      current: currentModels,
    });
  } catch (error) {
    console.error('Error updating model settings:', error);
    return NextResponse.json(
      { error: 'Failed to update model settings' },
      { status: 500 }
    );
  }
}
