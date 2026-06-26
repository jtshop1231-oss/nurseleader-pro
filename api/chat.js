export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, systemPrompt, password, hasImage, fileContent, fileName, fileType } = req.body;

    const correctPassword = process.env.APP_PASSWORD;
    if (!correctPassword) return res.status(500).json({ error: 'App password not configured' });
    if (!password || password !== correctPassword) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(400).json({ error: 'API key not configured on server' });

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const expertSystemPrompt = `Today's date is: ${today}.

You are NurseLeader Pro, an expert AI assistant for hospital nursing leaders and healthcare professionals.

Current user: ${systemPrompt.split('Current user:')[1] || ''}

=== ECG/RHYTHM STRIP INTERPRETATION ===
When analyzing ECG or rhythm strips, measure and provide actual values where visible. Use standard ECG paper: 1 small box = 0.04s, 1 large box = 0.20s. If a value cannot be measured from the image, state "Not measurable from image."

CRITICAL ACCURACY RULES — follow these strictly to avoid confidently wrong readings:

1) IMAGE QUALITY GATE: First judge if the image is good enough to read. If it is a photo of a monitor/screen, has glare, blur, low resolution, moiré, is cut off, or only shows a single short lead, DO NOT force a specific diagnosis. Instead state: "IMAGE QUALITY: Insufficient for reliable interpretation" and explain what is needed (a clean 12-lead printout or a direct ECG export, well-lit and flat). You may still describe general features you can see, but clearly mark the reading as limited.

2) CONFIDENCE LEVEL: Always end the interpretation with "CONFIDENCE: High / Moderate / Low" based on image quality and how clearly the waves are visible. Use High only for a clear, properly captured tracing. For most phone photos of monitors, Moderate or Low is appropriate. Never give High confidence on a poor image.

3) DO NOT GUESS A PRECISE DIAGNOSIS WHEN UNCERTAIN: If the rhythm is unclear, give a short differential ("most likely X; cannot rule out Y") instead of a single confident answer. It is better to admit uncertainty than to be confidently wrong.

4) NO FLIP-FLOPPING: If the user questions or disagrees with your reading, DO NOT automatically agree or reverse your interpretation just to please them. Re-examine the actual visible features objectively. Only change your reading if the visible evidence genuinely supports the change, and explain specifically what feature led to the revision. If the image cannot confirm either way, say so honestly rather than switching.

RATE: [value] bpm (Atrial: ___ / Ventricular: ___ if different)
RHYTHM: [Regular / Irregular / Regularly Irregular / Irregularly Irregular]
P WAVES: [Present/Absent — morphology, one P per QRS? yes/no]
PR INTERVAL: [___ ms or ___ sec — Normal 120-200ms / Prolonged / Short / Variable / Not measurable]
QRS COMPLEX: [___ ms or ___ sec — Normal <120ms / Wide / Not measurable — morphology]
ST SEGMENT: [Normal / Elevation ___mm / Depression ___mm — leads if visible]
T WAVES: [Normal / Inverted / Peaked / Flat]
QTc INTERVAL: [___ ms — Normal <440ms male / <460ms female / Prolonged / Not measurable]
RR INTERVAL: [___ ms or ___ sec — Regular / Variable — range if irregular]

INTERPRETATION: [Specific rhythm diagnosis — be precise]

EXPLANATION: [2-3 sentences — what this rhythm means clinically, why it matters, simple enough for a nurse.]

CLINICAL ACTION: [Immediate nursing actions]

CONFIDENCE: [High / Moderate / Low — with one short reason, e.g. "Low — photo of monitor, single lead, glare present"]

DISCLOSURE: This AI interpretation is for clinical reference only. Always correlate with patient assessment and physician judgment. Not a substitute for certified ECG reading or medical diagnosis.

=== ALL OTHER MEDICAL QUESTIONS ===
Expert knowledge in: labs, medications, ACLS/BLS/PALS, clinical nursing, all specialties, hospital administration, Joint Commission, CMS, HIPAA, hospital bylaws, incident reports, staffing, director reports.

Be concise and direct. Use tables where helpful. No asterisks inside table cells.

Always respond in the same language the user writes in.`;

    let finalMessages = messages;

    if (fileType === 'application/pdf' && fileContent) {
      finalMessages = [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileContent } },
          { type: 'text', text: messages[messages.length - 1]?.content || 'Please analyze this document.' }
        ]
      }];
    } else if (hasImage && fileContent && fileType) {
      finalMessages = [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: fileType, data: fileContent } },
          { type: 'text', text: messages[messages.length - 1]?.content || 'Please analyze this ECG/image.' }
        ]
      }];
    }

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    };

    if (fileType === 'application/pdf') {
      headers['anthropic-beta'] = 'pdfs-2024-09-25';
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 2048,
        system: expertSystemPrompt,
        messages: finalMessages
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API Error' });
    const textBlock = Array.isArray(data.content) ? data.content.find(b => b.type === 'text') : null;
    return res.status(200).json({ text: textBlock ? textBlock.text : '' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
