import { useState } from "react";
import { KeyRound } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { isValidUsername, normalizeUsername, usernameToEmail } from "../lib/username";

function extractMessage(err: any): string {
  // Supabase/PostgREST errors show up in different shapes depending on where they failed —
  // try every field before giving up, and log the raw thing so it's inspectable in devtools.
  console.error("auth error:", err);
  const msg = err?.message || err?.error_description || err?.msg || err?.error || "";
  if (msg) return String(msg);
  try {
    const s = JSON.stringify(err);
    return s && s !== "{}" ? s : "Неизвестная ошибка (см. консоль браузера, F12 → Console).";
  } catch {
    return "Неизвестная ошибка (см. консоль браузера, F12 → Console).";
  }
}

function friendlyError(message: string): string {
  if (message.includes("invalid_or_used_invite")) return "Код приглашения неверный или уже использован.";
  if (message.includes("invite_required")) return "Нужен код приглашения.";
  if (message.includes("Invalid login credentials")) return "Неверный ник или пароль.";
  if (message.includes("User already registered") || message.includes("already registered"))
    return "Такой ник уже занят — войдите вместо регистрации.";
  if (message.includes("Email not confirmed")) return "Аккаунт создан, но подтверждение email включено на сервере — отключите его в Supabase (Authentication → Sign In / Providers → Email → Confirm email = off) и попробуйте войти снова.";
  if (message.includes("Password should be")) return "Пароль слишком простой/короткий (минимум 6 символов).";
  return message;
}

export function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!isValidUsername(username)) {
      setError("Ник должен быть от 3 до 32 символов (латиница, цифры, _ . -).");
      return;
    }

    setLoading(true);
    const email = usernameToEmail(username);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { invite_code: inviteCode.trim(), username: normalizeUsername(username) } },
        });
        if (error) throw error;
        if (!data.session) {
          setInfo(
            "Аккаунт создан, но сессия не открылась автоматически — вероятно, на сервере ещё включено подтверждение email. Отключите его в Supabase (Authentication → Sign In / Providers → Email → Confirm email) и войдите вручную."
          );
        }
      }
    } catch (err: any) {
      setError(friendlyError(extractMessage(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center">
      <div className="glass rounded-lg p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound size={18} className="text-accent" />
          <div className="text-lg font-semibold">RPG Narrative Studio</div>
        </div>
        <div className="text-sm text-white/40 mb-6">{mode === "signin" ? "Войти в свой аккаунт" : "Регистрация по коду приглашения"}</div>

        <form onSubmit={submit} className="space-y-3">
          <input
            required
            placeholder="ник (например B3MOY)"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="пароль (мин. 6 символов)"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "signup" && (
            <input
              required
              placeholder="код приглашения"
              className="input mono"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
          )}

          {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{error}</div>}
          {info && <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">{info}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent/80 hover:bg-accent transition-colors rounded-md py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "…" : mode === "signin" ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          className="w-full text-center text-xs text-white/40 hover:text-white/70 mt-4"
        >
          {mode === "signin" ? "Нет аккаунта? Есть код приглашения — зарегистрироваться" : "Уже есть аккаунт? Войти"}
        </button>
      </div>
    </div>
  );
}
