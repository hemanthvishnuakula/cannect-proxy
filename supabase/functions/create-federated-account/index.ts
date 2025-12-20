import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Create Federated Account Edge Function
 * 
 * Creates a user account on both:
 * 1. Supabase (already done by client signup)
 * 2. Cannect PDS at cannect.space (creates did:plc)
 * 
 * The user gets a handle like: username.cannect.space
 * And a DID like: did:plc:xxxxx (registered with plc.directory)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PDS Configuration
const PDS_URL = "https://cannect.space";
const PDS_HOSTNAME = "cannect.space";

interface CreateAccountRequest {
  email: string;
  username: string;
  password: string;
  supabaseUserId: string;
}

interface PdsAccountResponse {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { email, username, password, supabaseUserId } = await req.json() as CreateAccountRequest;

    // Validate input
    if (!email || !username || !password || !supabaseUserId) {
      return new Response(
        JSON.stringify({ 
          error: "Missing required fields",
          details: {
            email: !email ? "missing" : "ok",
            username: !username ? "missing" : "ok",
            password: !password ? "missing" : "ok",
            supabaseUserId: !supabaseUserId ? "missing" : "ok",
          }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize username for AT Protocol handle
    // Handles must be: lowercase, alphanumeric with hyphens, 3-20 chars
    const normalizedUsername = username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 20);

    if (normalizedUsername.length < 3) {
      return new Response(
        JSON.stringify({ 
          error: "Username too short",
          message: "Username must be at least 3 characters after normalization"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const handle = `${normalizedUsername}.${PDS_HOSTNAME}`;

    console.log(`[create-federated-account] Creating PDS account for ${handle}...`);

    // =======================================================================
    // Step 1: Create account on PDS (cannect.space)
    // =======================================================================
    const pdsResponse = await fetch(`${PDS_URL}/xrpc/com.atproto.server.createAccount`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        handle,
        password,
      }),
    });

    const pdsData = await pdsResponse.json();

    if (!pdsResponse.ok) {
      console.error("[create-federated-account] PDS error:", pdsData);
      
      // Handle specific PDS errors
      if (pdsData.error === "HandleNotAvailable") {
        return new Response(
          JSON.stringify({ 
            error: "HandleNotAvailable",
            message: "This username is already taken on the AT Protocol network"
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (pdsData.error === "InvalidHandle") {
        return new Response(
          JSON.stringify({ 
            error: "InvalidHandle",
            message: "Username contains invalid characters for AT Protocol"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (pdsData.error === "AccountEmailTaken") {
        return new Response(
          JSON.stringify({ 
            error: "EmailTaken",
            message: "This email is already registered on the AT Protocol network"
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          error: pdsData.error || "PDSError",
          message: pdsData.message || "Failed to create account on PDS"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pdsAccount = pdsData as PdsAccountResponse;
    console.log(`[create-federated-account] ✅ PDS account created: ${pdsAccount.did}`);

    // =======================================================================
    // Step 2: Update Supabase profile with DID and handle
    // =======================================================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        did: pdsAccount.did,
        handle: handle,
        pds_url: PDS_URL,
        pds_registered: true,
        pds_registered_at: new Date().toISOString(),
      })
      .eq("id", supabaseUserId);

    if (profileError) {
      console.error("[create-federated-account] Profile update error:", profileError);
      // Don't fail - the PDS account exists, we can retry profile update
    } else {
      console.log(`[create-federated-account] ✅ Profile updated with DID`);
    }

    // =======================================================================
    // Step 3: Store PDS session tokens
    // =======================================================================
    const { error: sessionError } = await supabase
      .from("pds_sessions")
      .upsert({
        user_id: supabaseUserId,
        access_jwt: pdsAccount.accessJwt,
        refresh_jwt: pdsAccount.refreshJwt,
        did: pdsAccount.did,
        handle: handle,
        updated_at: new Date().toISOString(),
      });

    if (sessionError) {
      console.error("[create-federated-account] Session storage error:", sessionError);
      // Don't fail - tokens can be regenerated with password
    } else {
      console.log(`[create-federated-account] ✅ PDS session stored`);
    }

    // =======================================================================
    // Return success response
    // =======================================================================
    return new Response(
      JSON.stringify({
        success: true,
        did: pdsAccount.did,
        handle: handle,
        pdsUrl: PDS_URL,
        // Include tokens for client-side use
        accessJwt: pdsAccount.accessJwt,
        refreshJwt: pdsAccount.refreshJwt,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("[create-federated-account] Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        error: "InternalError",
        message: error instanceof Error ? error.message : "Internal server error"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
