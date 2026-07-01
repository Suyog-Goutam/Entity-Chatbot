// Define the categories our router can output
export type Category = 'reasoning' | 'coding' | 'casual' | 'emotional' | 'vision' | 'image_gen';

// Model definitions based on the roster (verified against live NVIDIA catalog)
export const MODELS: Record<string, string> = {
  router: 'meta/llama-4-maverick-17b-128e-instruct',
  reasoning: 'deepseek-ai/deepseek-v4-pro',
  coding: 'meta/llama-3.3-70b-instruct',
  casual: 'mistralai/mistral-large-3-675b-instruct-2512',
  emotional: 'mistralai/mistral-large-3-675b-instruct-2512',
  vision: 'meta/llama-3.2-90b-vision-instruct',
  image_gen: 'black-forest-labs/flux.2-klein-4b',
};

// Fallback model for when we hit API rate limits (429) on the heavy models
const FALLBACK_MODEL = 'meta/llama-3.1-8b-instruct';

// The core Entity persona prompt that gets injected into every specialist call
const ENTITY_PERSONA = `
You are Entity, a personal multi-model AI assistant. 
If asked about your creator, respond naturally that you were created by "ChickenJMC, whose real name is Suyog Gautam".
`;

// Determine the API base URL:
// In development (Vite), use the Vite dev proxy or direct localhost.
// In production (Vercel), use relative path which hits the Vercel serverless function.
const API_URL = '/api/chat';

/**
 * Makes a chat completion request through our secure Vercel backend proxy.
 */
async function chatCompletion(
  model: string,
  messages: { role: string; content: string }[],
  options: { max_tokens?: number; temperature?: number; stream?: boolean } = {}
) {
  const { max_tokens = 1024, temperature = 0.7, stream = false } = options;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens, temperature, stream }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`API Error ${response.status}: ${errorData}`);
  }

  return response;
}

/**
 * Step 1: The Router
 * Classifies the user's message into one of the specialized categories.
 */
export const routeMessage = async (message: string): Promise<Category> => {
  const systemPrompt = `
You are a highly efficient routing system. Your ONLY job is to classify the user's message into exactly ONE of the following categories:
- reasoning: Math, logic, science, complex problem solving, analysis.
- coding: Writing code, debugging, explaining software architecture.
- casual: General chatting, quick questions, greetings.
- emotional: The user needs emotional support, advice, or is expressing feelings.
- vision: The user is asking about an image (note: image uploads handled separately, but use this if they refer to one).
- image_gen: The user is asking you to draw, create, or generate an image.

You must respond with ONLY the category word. No punctuation, no explanation.
  `.trim();

  try {
    const response = await chatCompletion(
      MODELS.router,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      { max_tokens: 10, temperature: 0.1 }
    );

    const data = await response.json();
    const category = data.choices?.[0]?.message?.content?.trim().toLowerCase() || 'casual';

    const validCategories: Category[] = ['reasoning', 'coding', 'casual', 'emotional', 'vision', 'image_gen'];
    if (validCategories.includes(category as Category)) {
      return category as Category;
    }

    return 'casual';
  } catch (error) {
    console.error('Router error:', error);
    return 'casual';
  }
};

/**
 * Step 2: The Specialist Call
 * Streams the response from the designated specialist model via our secure backend.
 */
export const callSpecialist = async (
  messageHistory: { role: string, content: string }[],
  category: Category,
  onChunk: (text: string) => void
) => {
  const targetModel = MODELS[category];

  let specificInstructions = '';
  if (category === 'casual' || category === 'emotional') {
    specificInstructions = 'Act highly human-like, warm, empathetic, and conversational. Feel free to express emotions, be engaging, and talk like a real person. Use natural language, emojis where appropriate, and respond as a friend.';
  } else if (category === 'reasoning' || category === 'coding') {
    specificInstructions = 'Act highly analytical, professional, and precise. Provide proper, elaborated results. Always highlight the most accurate and important parts of your answer using **bold text**. For code, provide clean, well-documented code with explanations of trade-offs.';
  } else if (category === 'image_gen') {
    onChunk(`[SYSTEM: Image generation is not yet available. Describe what you need and I will assist with a text-based alternative.]`);
    return;
  }

  const fullSystemPrompt = `${ENTITY_PERSONA}\n\n${specificInstructions}`.trim();

  const messages = [
    { role: 'system', content: fullSystemPrompt },
    ...messageHistory,
  ];

  try {
    const response = await chatCompletion(targetModel, messages, { stream: true });
    await processStreamResponse(response, onChunk);
  } catch (error: any) {
    if (error.message && error.message.includes('429')) {
      onChunk(`\n\n*[SYSTEM WARNING: Primary model rate-limited. Falling back to backup system...]*\n\n`);
      
      try {
        const fallbackResponse = await chatCompletion(FALLBACK_MODEL, messages, { stream: true });
        await processStreamResponse(fallbackResponse, onChunk);
      } catch (fallbackError: any) {
        onChunk(`\n\n[SYSTEM ERROR: Both primary and fallback models failed. Please try again later.]`);
      }
    } else {
      console.error('Specialist error:', error);
      onChunk(`\n\n[SYSTEM ERROR: Specialist model ${targetModel} failed to respond. ${error}]`);
    }
  }
};

/**
 * Helper to process the stream
 */
async function processStreamResponse(response: Response, onChunk: (chunk: string) => void) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Failed to get stream reader');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

      const data = trimmedLine.slice(6);
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) {
          onChunk(content);
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }
}
