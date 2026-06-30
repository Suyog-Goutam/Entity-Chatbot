export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { model, messages, max_tokens = 1024, temperature, stream = false } = body;

    const nvidiaResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens,
        temperature,
        stream,
      }),
    });

    if (!nvidiaResponse.ok) {
      const errorText = await nvidiaResponse.text();
      console.error('NVIDIA API Error:', nvidiaResponse.status, errorText);
      return new Response(JSON.stringify({ error: `NVIDIA API error: ${nvidiaResponse.status}`, details: errorText }), {
        status: nvidiaResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // If streaming, pipe the response directly back to the client
    if (stream) {
      return new Response(nvidiaResponse.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming: return JSON
    const data = await nvidiaResponse.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(JSON.stringify({ error: 'Internal proxy error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
