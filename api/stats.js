export const config = {
  runtime: 'edge',
};

export default function handler(req) {
  const rawKeys = process.env.NVIDIA_API_KEYS || process.env.NVIDIA_API_KEY || '';
  const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
  
  return new Response(JSON.stringify({ keyCount: apiKeys.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
