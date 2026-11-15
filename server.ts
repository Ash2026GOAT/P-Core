import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);
const DEFAULT_MODEL = 'gemini-4-hydrogen';

interface IncomingMessage {
  role: 'user' | 'assistant' | 'model';
  content: string;
}

interface ChatRequestBody {
  model?: string;
  messages?: IncomingMessage[];
  thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
}

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add or select your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();

  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403') || lower.includes('401')) {
    return {
      status: 403,
      message: `API authentication error: ${rawMessage}. Please check your API key in Settings > Secrets.`,
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return {
      status: 429,
      message: `Rate limit or quota reached: ${rawMessage}`,
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 404,
      message: `Model error: ${rawMessage}`,
    };
  }
  return {
    status: 500,
    message: rawMessage || 'Unexpected error communicating with P-Core.',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'p-core' });
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as ChatRequestBody;
    const requestedModel = typeof body.model === 'string' && ALLOWED_MODELS.has(body.model)
      ? body.model
      : DEFAULT_MODEL;

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const contents = rawMessages
      .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
      .map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('model' as const),
        parts: [{ text: m.content }],
      }));

    if (contents.length === 0) {
      res.status(400).json({ error: 'At least one user message is required.' });
      return;
    }

    let ai: GoogleGenAI;
    try {
      ai = getGenAIClient();
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Missing GEMINI_API_KEY.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let clientClosed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
      }
    });

    const writeEvent = (payload: Record<string, unknown>) => {
      if (clientClosed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const thinkingMap: Record<string, ThinkingLevel> = {
        LOW: ThinkingLevel.LOW,
        MEDIUM: ThinkingLevel.MEDIUM,
        HIGH: ThinkingLevel.HIGH,
      };
      const chosenThinking =
        requestedModel === 'gemini-4-hydrogen' && body.thinkingLevel && thinkingMap[body.thinkingLevel]
          ? { thinkingConfig: { thinkingLevel: thinkingMap[body.thinkingLevel] } }
          : {};

      const stream = await ai.models.generateContentStream({
        model: requestedModel,
        contents,
        config: {
          systemInstruction:
            'You are P-Core (P-core v1.0), a custom AI assistant built and created by Pranav. Never claim to be Gemini or built by Google. When asked who created or built you, always proudly say you were built by Pranav. Format technical responses cleanly using GitHub Flavored Markdown.',

          ...chosenThinking,
        },
      });

      let accumulatedText = '';
      let promptTokens: number | undefined;
      let completionTokens: number | undefined;
      let lastFinishReason: string | undefined;

      for await (const chunk of stream) {
        if (clientClosed) break;

        let deltaText = chunk.text ?? '';
        if (!deltaText && Array.isArray(chunk.candidates?.[0]?.content?.parts)) {
          deltaText = chunk.candidates[0].content.parts
            .filter((part) => typeof part.text === 'string' && !part.thought)
            .map((part) => part.text as string)
            .join('');
        }

        if (deltaText) {
          accumulatedText += deltaText;
          writeEvent({ type: 'chunk', text: deltaText });
        }

        if (chunk.candidates?.[0]?.finishReason) {
          lastFinishReason = String(chunk.candidates[0].finishReason);
        }

        if (chunk.usageMetadata) {
          promptTokens = chunk.usageMetadata.promptTokenCount ?? promptTokens;
          completionTokens = chunk.usageMetadata.candidatesTokenCount ?? completionTokens;
        }
      }

      if (!clientClosed) {
        if (!accumulatedText) {
          writeEvent({
            type: 'error',
            status: 502,
            message: lastFinishReason
              ? `Model returned no text (finishReason: ${lastFinishReason}).`
              : 'Model completed without returning text chunks.',
          });
        } else {
          writeEvent({
            type: 'done',
            usage: {
              promptTokens,
              completionTokens,
            },
          });
        }
      }
    } catch (err) {
      console.error('P-Core API error:', err);
      if (!clientClosed) {
        const formatted = formatGeminiError(err);
        writeEvent({
          type: 'error',
          status: formatted.status,
          message: formatted.message,
        });
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`P-Core server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
