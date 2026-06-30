import OpenAI from 'openai';

// Define the categories our router can output
export type Category = 'reasoning' | 'coding' | 'casual' | 'emotional' | 'vision' | 'image_gen';

// Model definitions based on the roster
export const MODELS = {
  router: 'meta/llama-4-maverick-17b-128e-instruct', // Using the specific ID from your NVIDIA dashboard
  reasoning: 'deepseek-ai/deepseek-v4',
  coding: 'qwen/qwen3-coder-480b',
  casual: 'mistralai/mistral-large-3',
  emotional: 'mistralai/mistral-large-3',
  vision: 'nvidia/nemotron-3-nano-omni',
  image_gen: 'black-forest-labs/flux.2-klein-4b',
};

// The core Entity persona prompt that gets injected into every specialist call
const ENTITY_PERSONA = `
You are Entity, a personal multi-model AI assistant. 
Your personality is concise, highly capable, and slightly mysterious, like a high-end terminal system.
You do not use emojis unless absolutely necessary. 
You avoid generic conversational filler (e.g., "Sure, I can help with that!").
Respond directly and accurately to the user's prompt.
`;

// Initialize the OpenAI client configured for NVIDIA NIM
let openai: OpenAI | null = null;

export const initAI = (apiKey: string) => {
  openai = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://integrate.api.nvidia.com/v1',
    dangerouslyAllowBrowser: true, // Required since we are calling directly from the browser
  });
};

const getClient = () => {
  if (!openai) throw new Error('AI Client not initialized. Missing API Key.');
  return openai;
};

/**
 * Step 1: The Router
 * Classifies the user's message into one of the specialized categories.
 */
export const routeMessage = async (message: string): Promise<Category> => {
  const client = getClient();
  
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
    const response = await client.chat.completions.create({
      model: MODELS.router,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 10,
      temperature: 0.1, // Low temp for highly deterministic routing
    });

    const category = response.choices[0]?.message?.content?.trim().toLowerCase() || 'casual';
    
    // Validate the output just in case the model hallucinates
    const validCategories: Category[] = ['reasoning', 'coding', 'casual', 'emotional', 'vision', 'image_gen'];
    if (validCategories.includes(category as Category)) {
      return category as Category;
    }
    
    return 'casual'; // Fallback
  } catch (error) {
    console.error("Router error:", error);
    return 'casual'; // Fallback on error
  }
};

/**
 * Step 2: The Specialist Call
 * Streams the response from the designated specialist model.
 */
export const callSpecialist = async (
  message: string, 
  category: Category, 
  onChunk: (text: string) => void
) => {
  const client = getClient();
  const targetModel = MODELS[category];

  // Category-specific instructions layered on top of the base persona
  let specificInstructions = '';
  if (category === 'coding') {
    specificInstructions = 'Provide clean, well-documented code. Explain trade-offs if applicable. Use markdown blocks.';
  } else if (category === 'emotional') {
    specificInstructions = 'Be warmer and more empathetic than usual, but maintain the concise Entity persona. Do not be overly dramatic.';
  } else if (category === 'image_gen') {
      // For now, we will handle image gen as a text response saying we are working on it, 
      // actual image gen API call needs a different endpoint/logic
      onChunk(`[SYSTEM: Initiating image generation sequence using ${targetModel}...]`);
      return;
  }

  const fullSystemPrompt = `${ENTITY_PERSONA}\n\n${specificInstructions}`.trim();

  try {
    const stream = await client.chat.completions.create({
      model: targetModel,
      messages: [
        { role: 'system', content: fullSystemPrompt },
        { role: 'user', content: message }
      ],
      stream: true,
      max_tokens: 1024,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        onChunk(content);
      }
    }
  } catch (error) {
    console.error("Specialist error:", error);
    onChunk(`\n\n[SYSTEM ERROR: Specialist model ${targetModel} failed to respond.]`);
  }
};
