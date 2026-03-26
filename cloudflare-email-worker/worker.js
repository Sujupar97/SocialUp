/**
 * Cloudflare Email Worker - SocialUp
 * Receives all emails sent to *@fullcontent.online
 * Extracts verification codes and saves them to Supabase.
 *
 * Deploy: Cloudflare Dashboard → Workers & Pages → Create → Paste this code
 * Then: Email Routing → Catch-All → Send to Worker → select this worker
 */

// Supabase config (set these as Worker environment variables, NOT hardcoded)
// SUPABASE_URL = https://nyxpkfjkgpjipejsrbac.supabase.co
// SUPABASE_ANON_KEY = your-anon-key

export default {
  async email(message, env) {
    try {
      const to = message.to;
      const from = message.from;
      const subject = message.headers.get("subject") || "";

      // Read the email body
      const rawBody = await readEmailBody(message);

      // Detect platform from sender
      const platform = detectPlatform(from);

      // Extract verification code (6 digits)
      const code = extractCode(subject, rawBody);

      if (!code) {
        console.log(`No code found in email to ${to} from ${from}: ${subject}`);
        return;
      }

      console.log(`Code ${code} found for ${to} (${platform}) from ${from}`);

      // Save to Supabase
      const response = await fetch(
        `${env.SUPABASE_URL}/rest/v1/email_verifications`,
        {
          method: "POST",
          headers: {
            "apikey": env.SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            email_address: to,
            platform: platform,
            verification_code: code,
            subject: subject.substring(0, 500),
            sender: from,
          }),
        }
      );

      if (!response.ok) {
        console.error(`Supabase error: ${response.status} ${await response.text()}`);
      } else {
        console.log(`Saved code ${code} for ${to}`);
      }
    } catch (err) {
      console.error(`Worker error: ${err.message}`);
    }
  },
};

// Read email body from the stream
async function readEmailBody(message) {
  try {
    const reader = message.raw.getReader();
    const decoder = new TextDecoder();
    let body = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
      // Limit body size to 50KB
      if (body.length > 50000) break;
    }

    return body;
  } catch {
    return "";
  }
}

// Detect which platform sent the email
function detectPlatform(from) {
  const f = from.toLowerCase();
  if (f.includes("tiktok")) return "tiktok";
  if (f.includes("instagram") || f.includes("facebook") || f.includes("meta")) return "instagram";
  if (f.includes("google") || f.includes("youtube")) return "youtube";
  return null;
}

// Extract 6-digit verification code from subject or body
function extractCode(subject, body) {
  // Try subject first (most platforms put it there)
  const subjectMatch = subject.match(/\b(\d{6})\b/);
  if (subjectMatch) return subjectMatch[1];

  // Try body - look for common patterns
  const patterns = [
    /verification code[:\s]*(\d{6})/i,
    /código de verificación[:\s]*(\d{6})/i,
    /your code is[:\s]*(\d{6})/i,
    /tu código es[:\s]*(\d{6})/i,
    /code[:\s]*(\d{6})/i,
    /código[:\s]*(\d{6})/i,
    /\b(\d{6})\b/,  // Last resort: any 6-digit number
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) return match[1];
  }

  return null;
}
