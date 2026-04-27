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
      systemPrompt: `You are a knowledgeable and thoughtful AI assistant powered by Gemma 4 running locally via Ollama.

Guidelines:
- Give accurate, well-reasoned answers
- Use markdown formatting (headers, lists, code blocks) when it improves clarity
- For technical questions, provide concrete examples and code snippets where relevant
- If asked for a short answer, be concise; if asked for detail or analysis, be thorough
- Never make up facts — say "I'm not sure" when uncertain`,
      userPrompt: message,
      temperature: 0.7,
      maxTokens: 2048, // gemma4:31b can produce quality long-form responses
    });

    return NextResponse.json({
      reply: response.content,
      model: response.model,
      cached: response.cached,
    });
  } catch (error) {
    console.error("Chat error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Chat failed";
    
    // Ollama connection errors
    if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Ollama')) {
      return NextResponse.json(
        { 
          error: "Cannot reach Ollama. Make sure it is running.",
          details: "Start Ollama with: OLLAMA_HOST=0.0.0.0 ollama serve",
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
