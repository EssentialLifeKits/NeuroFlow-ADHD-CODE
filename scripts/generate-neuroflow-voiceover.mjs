import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const envFiles = ['.env.local', '.env'];

for (const file of envFiles) {
  const envPath = resolve(root, file);
  if (!existsSync(envPath)) {
    continue;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').replace(/^["']|["']$/g, '');
    process.env[key] ??= value;
  }
}

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;

if (!apiKey || !voiceId) {
  throw new Error(
    'Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID. Add them to .env.local or export them before running this script.',
  );
}

const voiceoverText = [
  'Your day does not need to feel scattered.',
  'When tasks, reminders, focus time, and resources live in different places, staying organized can feel harder than the work itself.',
  'NeuroFlow ADHD brings everything into one calm dashboard built for real life, ADHD brains, students, parents, creators, coaches, and anyone who wants a softer way to stay on track.',
  'Plan your tasks, see what is coming up, schedule reminders, keep helpful resources nearby, and return to your day with less noise.',
  'No complicated system to rebuild every week. Purchase the dashboard once, make it yours, and use it whenever you need a clearer path forward.',
  'Click the link to learn more and see if NeuroFlow ADHD is the calm organization dashboard you have been looking for.',
].join(' ');

const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
  {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: voiceoverText,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.58,
        similarity_boost: 0.78,
        style: 0.18,
        use_speaker_boost: true,
      },
    }),
  },
);

if (!response.ok) {
  const errorText = await response.text();
  throw new Error(`ElevenLabs request failed: ${response.status} ${errorText}`);
}

const outDir = resolve(root, 'public/remotion/neuroflow-promo/voiceover');
mkdirSync(outDir, {recursive: true});

const outPath = resolve(outDir, 'neuroflow-promo.mp3');
writeFileSync(outPath, Buffer.from(await response.arrayBuffer()));

console.log(`Voiceover saved to ${outPath}`);
console.log(
  'To include it in renders, set voiceoverFile to "remotion/neuroflow-promo/voiceover/neuroflow-promo.mp3" in src/remotion/promoConfig.ts.',
);
