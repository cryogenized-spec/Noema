export interface AgentGenerateInput {
  prompt: string;
  messageContext?: string;
}

export interface AgentProvider {
  generate(input: AgentGenerateInput): Promise<string>;
}

class MockProvider implements AgentProvider {
  async generate(input: AgentGenerateInput): Promise<string> {
    const context = input.messageContext?.trim();
    const intro = context
      ? `You asked me to expand this message:\n> ${context.slice(0, 280)}\n\n`
      : '';

    return `${intro}### Noema Agent (Mock)\n\nHere’s a practical next step for your workflow:\n\n1. Capture the core intent in one sentence.\n2. Identify one action you can complete in under 10 minutes.\n3. Save the outcome as a reusable note.\n\n\`\`\`tsx\n// Small helper pattern\nexport function nextAction(goal: string) {\n  return \`Do one concrete step now: \${goal}\`;\n}\n\`\`\`\n\nPrompt echo: **${input.prompt.slice(0, 160)}**`;
  }
}

class OpenAIProvider implements AgentProvider {
  async generate(): Promise<string> {
    throw new Error('OpenAI provider is not configured yet.');
  }
}

export function createAgentProvider(): AgentProvider {
  const provider = process.env.AGENT_PROVIDER ?? 'mock';

  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    return new OpenAIProvider();
  }

  return new MockProvider();
}
