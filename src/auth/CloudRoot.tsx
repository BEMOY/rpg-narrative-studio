import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { AuthScreen } from "./AuthScreen";
import { ProjectsHome } from "./ProjectsHome";
import App from "../App";
import { useProjectStore } from "../store/useProjectStore";
import type { ProjectRow } from "../cloud/projects";

export function CloudRoot() {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = still checking
  const projectId = useProjectStore((s) => s.projectId);
  const loadProject = useProjectStore((s) => s.loadProject);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="h-full grid place-items-center text-[var(--op-30)] text-sm">Загрузка…</div>;
  }

  if (!session) return <AuthScreen />;

  if (!projectId) {
    return <ProjectsHome onOpen={(row: ProjectRow) => loadProject(row.id, row.data)} />;
  }

  return <App />;
}
