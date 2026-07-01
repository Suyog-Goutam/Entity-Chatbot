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

  const rawKeys = process.env.NVIDIA_API_KEYS || process.env.NVIDIA_API_KEY || '';
  const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
  
  if (apiKeys.length === 0) {
    return new Response(JSON.stringify({ error: 'API keys not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { model, messages, max_tokens = 1024, temperature, stream = false } = body;

    let nvidiaResponse = null;
    let errorText = '';

    // Loop through keys until one succeeds or all fail with 429
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      
      nvidiaResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
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

      if (nvidiaResponse.ok) {
        // Success! Break out of the loop
        break;
      }

      errorText = await nvidiaResponse.text();
      
      if (nvidiaResponse.status === 429) {
        console.warn(`[Key Rotation] Key ${i+1}/${apiKeys.length} rate limited (429).`);
        // If we have more keys to try, the loop continues to the next one
        continue;
      } else {
        // A different error occurred (e.g. 400 Bad Request), don't bother retrying, just break and return it
        break;
      }
    }

    if (!nvidiaResponse || !nvidiaResponse.ok) {
      console.error('NVIDIA API Error:', nvidiaResponse?.status, errorText);
      return new Response(JSON.stringify({ error: `NVIDIA API error: ${nvidiaResponse?.status}`, details: errorText }), {
        status: nvidiaResponse?.status || 500,
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
