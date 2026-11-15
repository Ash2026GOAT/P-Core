import type { ModelOption } from '../types/chat';

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'P-core v1.0',
    shortName: 'P-core v1.0',
    speedLabel: 'Fast · Cloud',
    specialty: 'General & Code',
    description: 'Balanced P-Core engine with zero local RAM or GPU usage',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'P-core v1.0 Lite',
    shortName: 'P-core v1.0 Lite',
    speedLabel: 'Ultra-Fast · Cloud',
    specialty: 'Instant Q&A',
    description: 'Low-latency P-Core tier tuned for rapid responses',
  },
];

export const DEFAULT_MODEL_ID = 'gemini-4-hydrogen';

export function isSupportedModelId(modelId: string): boolean {
  return AVAILABLE_MODELS.some((m) => m.id === modelId);
}

export function getModelOption(modelId: string): ModelOption {
  return (
    AVAILABLE_MODELS.find((m) => m.id === modelId) ?? {
      id: modelId,
      label: AVAILABLE_MODELS[0].label,
      shortName: modelId.includes('lite') ? 'P-core v1.0 Lite' : 'P-core v1.0',
      speedLabel: 'Cloud',
      specialty: 'P-Core Engine',
      description: 'Cloud inference via P-Core',
    }
  );
}

export const STARTER_PROMPTS = [
  {
    title: 'Code Architecture',
    prompt:
      'Design a modular TypeScript architecture for an async task queue with exponential backoff and clean error handling.',
  },
  {
    title: 'Performance Tuning',
    prompt:
      'Explain practical ways to keep a React web app fast and lightweight on older laptops with limited RAM.',
  },
  {
    title: 'SQL Query Optimization',
    prompt:
      'Write a PostgreSQL query using a CTE and window function to rank the top 3 orders per customer by revenue.',
  },
  {
    title: 'Refactor Async Logic',
    prompt:
      'Show how to refactor a nested Python `asyncio` workflow using `TaskGroup` and a semaphore for rate limiting.',
  },
];
