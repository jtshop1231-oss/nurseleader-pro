export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, systemPrompt, password } = req.body;

    // Verify password
    const correctPassword = process.env.APP_PASSWORD;
    if (!correctPassword) return res.status(500).json({ error: 'App password not configured' });
    if (!password || password !== correctPassword) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(400).json({ error: 'API key not configured on server' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: `Today's date is: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}. ${systemPrompt}`,
        messages
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API Error' });
    return res.status(200).json({ text: data.content[0].text });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
