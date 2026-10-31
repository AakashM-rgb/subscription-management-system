import { supabase, isSupabaseConfigured, supabaseUrl } from "./supabase";

export interface SupabaseConnectionStatus {
  isConfigured: boolean;
  projectUrl: string;
  authConnected: boolean;
  databaseConnected: boolean;
  activeSession: string | null;
  customerCount?: number;
  error?: string;
}

export async function testSupabaseConnection(): Promise<SupabaseConnectionStatus> {
  const status: SupabaseConnectionStatus = {
    isConfigured: isSupabaseConfigured,
    projectUrl: supabaseUrl,
    authConnected: false,
    databaseConnected: false,
    activeSession: null,
  };

  if (!isSupabaseConfigured || !supabase) {
    console.warn("⚠️ [Supabase] Not configured or placeholder credentials detected. Application running in mock store mode.");
    return status;
  }

  try {
    // 1. Check Auth service connectivity
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) {
      console.warn("⚠️ [Supabase Auth] Session lookup notice:", authError.message);
    } else {
      status.authConnected = true;
      status.activeSession = authData.session?.user?.email || null;
    }

    // 2. Check Database connectivity via lightweight query on 'customers' table
    const { count, error: dbError } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true });

    if (dbError) {
      console.warn("⚠️ [Supabase DB] Database query notice (RLS or table check):", dbError.message);
      status.error = dbError.message;
    } else {
      status.databaseConnected = true;
      status.customerCount = count ?? 0;
    }

    if (status.authConnected || status.databaseConnected) {
      console.log(
        `%c✅ [Supabase Connected] Host: ${new URL(supabaseUrl).host} | Database: ${status.databaseConnected ? 'Online (' + (status.customerCount ?? 0) + ' customers)' : 'Pending Schema'} | Auth: ${status.activeSession ? 'Logged in as ' + status.activeSession : 'Ready (No Active Session)'}`,
        'color: #10b981; font-weight: bold;'
      );
    }

    return status;
  } catch (err: any) {
    console.error("❌ [Supabase] Unexpected connection error:", err.message || err);
    status.error = err.message || String(err);
    return status;
  }
}
