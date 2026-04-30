import { useState, useCallback, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import "github-markdown-css/github-markdown-light.css";
import "github-markdown-css/github-markdown-dark.css";
import "./App.css";

type Theme = "light" | "dark" | "system";

interface FileEntry {
  name: string;
  path: string;
  content: string;
}

function resolveTheme(t: Theme): "light" | "dark" {
  if (t === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return t;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("md-reader-theme") as Theme) || "system";
  });
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const filesRef = useRef(files);
  filesRef.current = files;
  const resolvedTheme = resolveTheme(theme);

  // Persist theme preference
  useEffect(() => {
    localStorage.setItem("md-reader-theme", theme);
  }, [theme]);

  // Listen for system theme changes in system mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  const openPaths = useCallback(async (paths: string[]) => {
    setLoading(true);
    const currentFiles = filesRef.current;
    for (const path of paths) {
      if (!path.endsWith(".md")) continue;
      if (currentFiles.some((f) => f.path === path)) {
        setActivePath(path);
        continue;
      }
      try {
        const content = await readTextFile(path);
        const name = path.split(/[/\\]/).pop() || path;
        setFiles((prev) => [...prev, { name, path, content }]);
        setActivePath(path);
      } catch {
        // Ignore unreadable files
      }
    }
    setLoading(false);
  }, []);

  // Tauri native drag-and-drop
  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      const unlisten = await getCurrentWindow().onDragDropEvent(async (event) => {
        if (cancelled) return;
        if (event.payload.type === "drop") {
          const dropped = event.payload.paths;
          if (dropped && dropped.length > 0) {
            await openPaths(dropped);
          }
        }
      });
      return unlisten;
    };
    const promise = setup();
    return () => {
      cancelled = true;
      promise.then((fn) => fn());
    };
  }, [openPaths]);

  const handleOpenFile = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      const currentFiles = filesRef.current;
      const newPaths = paths.filter((p) => !currentFiles.some((f) => f.path === p));
      if (newPaths.length === 0 && paths.length > 0) {
        setActivePath(paths[0]);
        return;
      }
      await openPaths(newPaths);
    }
  }, [openPaths]);

  const handleCloseFile = useCallback((path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFiles((prev) => {
      const next = prev.filter((f) => f.path !== path);
      if (activePath === path) {
        setActivePath(next.length > 0 ? next[next.length - 1].path : null);
      }
      return next;
    });
  }, [activePath]);

  const activeFile = files.find((f) => f.path === activePath) || null;

  return (
    <div className={`app ${resolvedTheme === "dark" ? "dark" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="logo">MD Reader</span>
          <div className="theme-toggle">
            <button
              className={`theme-btn ${theme === "light" ? "active" : ""}`}
              onClick={() => setTheme("light")}
              title="Light"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1A.5.5 0 0 1 8 1zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm6.5-2.5a.5.5 0 0 1 0 1h-1a.5.5 0 0 1 0-1h1zM8 13a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1A.5.5 0 0 1 8 13zm-6.5-4.5a.5.5 0 0 1 0 1h-1a.5.5 0 0 1 0-1h1z" />
              </svg>
            </button>
            <button
              className={`theme-btn ${theme === "dark" ? "active" : ""}`}
              onClick={() => setTheme("dark")}
              title="Dark"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z" />
              </svg>
            </button>
            <button
              className={`theme-btn ${theme === "system" ? "active" : ""}`}
              onClick={() => setTheme("system")}
              title="System"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 2.5A1.5 1.5 0 0 1 1.5 1h13A1.5 1.5 0 0 1 16 2.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 0 10.5v-8zM1.5 2a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5h-13z" />
              </svg>
            </button>
          </div>
        </div>

        <button className="open-btn" onClick={handleOpenFile}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z" />
          </svg>
          Open File
        </button>

        <div className="file-list">
          {files.map((f) => (
            <div
              key={f.path}
              className={`file-tab ${f.path === activePath ? "active" : ""}`}
              onClick={() => setActivePath(f.path)}
            >
              <span className="file-icon">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 2.5a.5.5 0 0 1 .5-.5h4.5l.5.5H14a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H2.5a.5.5 0 0 1-.5-.5v-10z" />
                </svg>
              </span>
              <span className="file-name">{f.name}</span>
              <button className="close-tab" onClick={(e) => handleCloseFile(f.path, e)}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </aside>

      <main className="content">
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : activeFile ? (
          <div className={`markdown-body ${resolvedTheme === "dark" ? "markdown-dark" : ""}`}>
            <Markdown remarkPlugins={[remarkGfm]}>
              {activeFile.content}
            </Markdown>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <p>Drop a Markdown file here</p>
            <p className="empty-hint">or use the "Open File" button in the sidebar</p>
          </div>
        )}
      </main>
    </div>
  );
}
