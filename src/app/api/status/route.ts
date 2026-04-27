import { NextResponse } from "next/server";
import { checkProxyHealth, getProxyUrl, getCurrentModels } from "@/lib/ai-service";
import { supabase } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

interface ServiceStatus {
  name: string;
  status: 'online' | 'offline' | 'degraded' | 'checking';
  message: string;
  details?: Record<string, unknown>;
}

interface SystemStatus {
  timestamp: string;
  overall: 'healthy' | 'degraded' | 'offline';
  services: {
    server: ServiceStatus;
    ollama: ServiceStatus;
    database: ServiceStatus;
  };
  config: {
    proxyUrl: string;
    models: {
      chat: string;
      structured: string;
    };
  };
}

export async function GET() {
  const timestamp = new Date().toISOString();
  
  // Check all services in parallel
  const [ollamaHealth, databaseHealth] = await Promise.all([
    checkProxyHealth(),
    checkDatabaseHealth(),
  ]);

  const services = {
    server: {
      name: 'Next.js Server',
      status: 'online' as const,
      message: 'Server is running',
      details: {
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
      },
    },
    ollama: {
      name: 'Ollama Claude Proxy',
      status: ollamaHealth.ok ? 'online' as const : 'offline' as const,
      message: ollamaHealth.message,
      details: {
        url: getProxyUrl(),
      },
    },
    database: {
      name: 'Supabase Database',
      status: databaseHealth.ok ? 'online' as const : 'offline' as const,
      message: databaseHealth.message,
      details: databaseHealth.details,
    },
  };

  // Determine overall health
  const allOnline = Object.values(services).every(s => s.status === 'online');
  const allOffline = Object.values(services).every(s => s.status === 'offline');
  const overall = allOnline ? 'healthy' : allOffline ? 'offline' : 'degraded';

  // Get current model settings
  const currentModels = await getCurrentModels();

  const response: SystemStatus = {
    timestamp,
    overall,
    services,
    config: {
      proxyUrl: getProxyUrl(),
      models: {
        chat: currentModels.chatModel,
        structured: currentModels.structuredModel,
      },
    },
  };

  return NextResponse.json(response);
}

async function checkDatabaseHealth(): Promise<{ ok: boolean; message: string; details?: Record<string, unknown> }> {
  try {
    // Simple query to check database connectivity
    const startTime = Date.now();
    const { error } = await supabase
      .from('settings')
      .select('key')
      .limit(1);
    
    const latency = Date.now() - startTime;

    if (error) {
      return {
        ok: false,
        message: `Database error: ${error.message}`,
      };
    }

    return {
      ok: true,
      message: `Connected (${latency}ms latency)`,
      details: {
        latency,
        connected: true,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}
