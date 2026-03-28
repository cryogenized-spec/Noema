import { NextResponse } from 'next/server';
import { createAgentProvider } from '@/lib/ai/providers';

interface AgentRequestBody {
  prompt?: string;
  messageContext?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AgentRequestBody;
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
    }

    const provider = createAgentProvider();
    const content = await provider.generate({ prompt, messageContext: body.messageContext });

    return NextResponse.json({ content });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Agent request failed.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
