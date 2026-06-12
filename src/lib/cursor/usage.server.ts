// Project wiring for the cursor_run_usage ledger. The pure upsert + idempotency
// logic lives in the kit; this file injects the project's Supabase admin client
// (loaded lazily so the service-role module never leaks into client bundles).

import {
  recordRunUsage as kitRecordRunUsage,
  type RecordRunUsageInput,
} from "../../../packages/cursor-chat-kit/src/server/usage";

export type { RecordRunUsageInput } from "../../../packages/cursor-chat-kit/src/server/usage";

export function recordRunUsage(input: RecordRunUsageInput) {
  return kitRecordRunUsage(
    {
      getAdminClient: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return supabaseAdmin as unknown as Parameters<typeof kitRecordRunUsage>[0]["getAdminClient"] extends () => Promise<infer T>
          ? T
          : never;
      },
    },
    input,
  );
}
