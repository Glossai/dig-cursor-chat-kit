import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({ head: () => ({ meta: [{ title: "Reset password | Cursor Cloud Chat" }] }), component: ResetPassword });
function ResetPassword() { const navigate = useNavigate(); const [password, setPassword] = useState(""); const [error, setError] = useState(""); return <main className="grid min-h-svh place-items-center p-5"><form className="w-full max-w-sm space-y-4" onSubmit={async (event) => { event.preventDefault(); if (!window.location.hash.includes("type=recovery")) { setError("Open the recovery link from your email."); return; } const { error: updateError } = await supabase.auth.updateUser({ password }); if (updateError) setError(updateError.message); else await navigate({ to: "/chat" }); }}><h1 className="text-2xl font-semibold">Set a new password</h1><Input type="password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" required />{error && <p className="text-sm text-destructive">{error}</p>}<Button className="w-full">Update password</Button></form></main>; }