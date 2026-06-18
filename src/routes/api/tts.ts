import { createFileRoute } from "@tanstack/react-router";

// Server-side cache: same text → same bytes. Cards are short, so this stays small.
const cache = new Map<string, ArrayBuffer>();

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { text, voice } = (await request.json()) as { text?: string; voice?: string };
        if (!text || typeof text !== "string") {
          return new Response("Missing text", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const v = voice || "shimmer";
        const cacheKey = `${v}::${text}`;
        const cached = cache.get(cacheKey);
        if (cached) {
          return new Response(cached, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input: text,
            voice: v,
            response_format: "mp3",
            // Slow down a touch so the four mandarin tones come through clearly.
            speed: 0.85,
            instructions:
              "Speak Mandarin Chinese (Standard Mandarin / Putonghua) with clear, distinct four-tone pronunciation. Pronounce each syllable carefully so tones 1, 2, 3 and 4 are clearly distinguishable. Warm, friendly female teacher tone.",
          }),
        });

        if (!upstream.ok) {
          const msg = await upstream.text().catch(() => "");
          return new Response(`TTS failed: ${upstream.status} ${msg}`, { status: upstream.status });
        }

        const bytes = await upstream.arrayBuffer();
        if (cache.size > 500) {
          // crude LRU: drop oldest
          const firstKey = cache.keys().next().value;
          if (firstKey) cache.delete(firstKey);
        }
        cache.set(cacheKey, bytes);

        return new Response(bytes, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
