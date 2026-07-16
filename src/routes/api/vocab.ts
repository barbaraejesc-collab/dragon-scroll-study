import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

let cached: string[] | null = null;

export const Route = createFileRoute("/api/vocab")({
  server: {
    handlers: {
      GET: async () => {
        if (!cached) {
          const { data } = await supabaseAdmin.from("cards").select("hanzi");
          cached = (data ?? []).map((c) => c.hanzi as string).filter(Boolean);
        }
        return new Response(JSON.stringify({ hanzi: cached }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
