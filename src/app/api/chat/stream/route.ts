import { NextRequest } from "next/server";
import { getProxyUrl, getCurrentModels } from "@/lib/ai-service";

const OLLAMA_URL = getProxyUrl();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Streaming chat API endpoint
 * Returns Server-Sent Events (SSE) for real-time streaming
 */
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  try {
    const { message, context } = await request.json();

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get current chat model from settings
    const { chatModel } = await getCurrentModels();
    const MODEL = chatModel;

    // Create a TransformStream for streaming response
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Helper to send SSE events
    const sendEvent = async (event: string, data: unknown) => {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };

    // Start the streaming response
    const responsePromise = (async () => {
      try {
        // Send thinking state
        await sendEvent('thinking', { status: 'start', message: 'Processing your request...' });

        // Make request to Ollama with streaming
        const proxyResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              {
                role: 'system',
                content: `You are a helpful AI assistant powered by ${MODEL} through Ollama.

Your responses should be:
- Clear and well-structured
- Use markdown formatting when helpful
- Be conversational but informative
- Show your reasoning process when solving problems

${context ? `Context:\n${context}` : ''}`
              },
              { role: 'user', content: message }
            ],
            stream: true,
          }),
        });

        if (!proxyResponse.ok) {
          const errorText = await proxyResponse.text();
          let errorMessage = 'AI request failed';
          
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }

          await sendEvent('error', { 
            type: 'api_error',
            message: errorMessage,
          });
          
          await writer.close();
          return;
        }

        // Send thinking complete
        await sendEvent('thinking', { status: 'complete', message: 'Generating response...' });
        await sendEvent('start', { model: MODEL });

        // Process streaming response
        const reader = proxyResponse.body?.getReader();
        if (!reader) {
          await sendEvent('error', { type: 'stream_error', message: 'No response stream' });
          await writer.close();
          return;
        }

        const decoder = new TextDecoder();
        let fullContent = '';

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              
              if (parsed.message?.content) {
                const text = parsed.message.content;
                fullContent += text;
                await sendEvent('content', { text, full: fullContent });
              }

              if (parsed.done) {
                await sendEvent('done', { 
                  content: fullContent,
                  model: MODEL,
                });
              }
            } catch {
              // Ignore parse errors for incomplete JSON
            }
          }
        }

        // Ensure done event is sent if the stream didn't include a done flag
        if (fullContent && !fullContent.endsWith('[DONE]')) {
          await sendEvent('done', { content: fullContent, model: MODEL });
        }

      } catch (error) {
        console.error('Streaming error:', error);
        await sendEvent('error', { 
          type: 'stream_error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        await writer.close();
      }
    })();

    // Don't await - let it run in background while streaming
    responsePromise.catch(console.error);

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (error) {
    console.error('Chat stream error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Stream failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}