import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai-service";

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const response = await callAI({
      type: 'chat',
      systemPrompt: `You are a helpful AI assistant. Be concise and friendly. 
You are running through Ollama.
Keep responses brief (2-3 sentences max) unless asked for detail.`,
      userPrompt: message,
      temperature: 0.7,
      maxTokens: 500,
    });

    return NextResponse.json({
      reply: response.content,
      model: response.model,
      cached: response.cached,
    });
  } catch (error) {
    console.error("Chat error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Chat failed";
    
    // Check for quota exhaustion errors
    if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
      return NextResponse.json(
        { 
          error: "Gemini API quota exhausted. The models have hit their free tier limit.",
          details: "Quota typically resets hourly. You can wait or run ollama locally.",
          quotaExhausted: true,
        },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
