import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, readDir } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import "github-markdown-css/github-markdown.css";
import "./App.css";

type Theme = "light" | "dark" | "system";

interface FileEntry {
  name: string;
  path: string;
  content: string;
}

interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileTreeNode[];
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [treeRoot, setTreeRoot] = useState<string | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;
  const treeRootRef = useRef(treeRoot);
  treeRootRef.current = treeRoot;
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
      if (!path.endsWith(".md") && !path.endsWith(".markdown") && !path.endsWith(".mdx")) continue;
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

  const readDirRecursive = useCallback(async (dirPath: string): Promise<FileTreeNode[]> => {
    const entries = await readDir(dirPath);
    const result: FileTreeNode[] = [];

    for (const entry of entries) {
      if (entry.isSymlink) continue;

      if (entry.isDirectory) {
        const childPath = `${dirPath}/${entry.name}`;
        try {
          const children = await readDirRecursive(childPath);
          if (children.length > 0) {
            result.push({ name: entry.name, path: childPath, isDir: true, children });
          }
        } catch {
          // skip unreadable directories
        }
      } else if (entry.isFile) {
        const lower = entry.name.toLowerCase();
        if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx")) {
          result.push({ name: entry.name, path: `${dirPath}/${entry.name}`, isDir: false });
        }
      }
    }

    result.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return result;
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
            const mdFiles: string[] = [];
            for (const p of dropped) {
              try {
                await readDir(p);
                // It's a directory — open as tree
                setExpandedDirs(new Set([p]));
                const tree = await readDirRecursive(p);
                setFileTree(tree);
                setTreeRoot(p);
              } catch {
                // Not a directory, treat as file
                mdFiles.push(p);
              }
            }
            if (mdFiles.length > 0) await openPaths(mdFiles);
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
  }, [openPaths, readDirRecursive]);

  // Fetch files opened via OS file association (CLI args)
  // Pull-based: avoids race between Rust setup() emit and React mount.
  useEffect(() => {
    invoke<string[]>("get_pending_files")
      .then((paths) => {
        if (paths && paths.length > 0) openPaths(paths);
      })
      .catch(() => {});
  }, [openPaths]);

  // Auto-refresh active file and file tree when window gains focus
  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      const unlisten = await getCurrentWindow().onFocusChanged(async ({ payload: focused }) => {
        if (cancelled || !focused) return;
        const activePath = activePathRef.current;
        const root = treeRootRef.current;
        // Refresh active file
        if (activePath) {
          try {
            const content = await readTextFile(activePath);
            setFiles((prev) =>
              prev.map((f) => (f.path === activePath ? { ...f, content } : f))
            );
          } catch {
            // file may have been deleted, ignore
          }
        }
        // Refresh file tree
        if (root) {
          try {
            const tree = await readDirRecursive(root);
            setFileTree(tree);
          } catch {
            // folder may have been deleted, ignore
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
  }, [readDirRecursive]);

  const handleOpen = useCallback(async () => {
    setLoading(true);
    const selected = await open({
      multiple: true,
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdx"] }],
    });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      const currentFiles = filesRef.current;
      const newPaths = paths.filter((p) => !currentFiles.some((f) => f.path === p));
      if (newPaths.length === 0 && paths.length > 0) {
        setActivePath(paths[0]);
        setLoading(false);
        return;
      }
      await openPaths(newPaths);
      setLoading(false);
      return;
    }
    // User cancelled file dialog — try folder dialog
    const dirSelected = await open({ directory: true });
    if (dirSelected) {
      const dirPath = Array.isArray(dirSelected) ? dirSelected[0] : dirSelected;
      setExpandedDirs(new Set([dirPath]));
      const tree = await readDirRecursive(dirPath);
      setFileTree(tree);
      setTreeRoot(dirPath);
    }
    setLoading(false);
  }, [openPaths, readDirRecursive]);

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

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const activeFile = files.find((f) => f.path === activePath) || null;

  const displayNames = useMemo(() => {
    const map = new Map<string, string>();
    const byName = new Map<string, FileEntry[]>();
    for (const f of files) {
      const group = byName.get(f.name) || [];
      group.push(f);
      byName.set(f.name, group);
    }
    for (const [, group] of byName) {
      if (group.length === 1) {
        map.set(group[0].path, group[0].name);
        continue;
      }
      // Duplicate filenames: find minimal unique suffix from parent upward
      const segmentsList = group.map((f) => {
        const segs = f.path.split(/[/\\]/);
        return { entry: f, segs };
      });
      let depth = 0;
      const maxDepth = Math.min(...segmentsList.map((s) => s.segs.length)) - 1;
      while (depth < maxDepth) {
        const keys = segmentsList.map(
          (s) => s.segs.slice(s.segs.length - 2 - depth).join("/")
        );
        if (new Set(keys).size === group.length) break;
        depth++;
      }
      for (const { entry, segs } of segmentsList) {
        const used = segs.slice(segs.length - 1 - depth);
        if (depth < segs.length - 1 && segs.length - 1 - depth > 0) {
          map.set(entry.path, `.../${used.join("/")}`);
        } else {
          map.set(entry.path, used.join("/"));
        }
      }
    }
    return map;
  }, [files]);

  return (
    <div className={`app ${resolvedTheme === "dark" ? "dark" : ""}`}>
      <aside className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="sidebar-header">
          <button
            className="collapse-btn"
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              {sidebarCollapsed ? (
                <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z" />
              ) : (
                <path d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z" />
              )}
            </svg>
          </button>
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

        <div className="sidebar-actions">
          <button className="open-btn" onClick={handleOpen}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M.5 3.5A1.5 1.5 0 0 1 2 2h3.672a1.5 1.5 0 0 1 1.06.44l1.036 1.035a.5.5 0 0 0 .354.146H14A1.5 1.5 0 0 1 15.5 5v7.5a1.5 1.5 0 0 1-1.5 1.5H2a1.5 1.5 0 0 1-1.5-1.5v-9z" />
            </svg>
            <span>Open</span>
          </button>
        </div>

        {fileTree.length > 0 && (
          <div className="file-tree">
            {fileTree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                expandedDirs={expandedDirs}
                onToggle={toggleDir}
                onOpenFile={openPaths}
              />
            ))}
          </div>
        )}

        {files.length > 0 && (
          <>
            <div className="section-divider" />
            <div className="section-label">Open Files</div>
          </>
        )}

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
              <span className="file-name" title={f.path}>{displayNames.get(f.path) || f.name}</span>
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
            <p className="empty-hint">or use the "Open" button, or drag a folder</p>
          </div>
        )}
      </main>
    </div>
  );
}

interface TreeNodeProps {
  node: FileTreeNode;
  expandedDirs: Set<string>;
  onToggle: (path: string) => void;
  onOpenFile: (paths: string[]) => void;
  depth?: number;
}

function TreeNode({ node, expandedDirs, onToggle, onOpenFile, depth = 0 }: TreeNodeProps) {
  const isExpanded = expandedDirs.has(node.path);
  const padLeft = 8 + depth * 16;

  if (node.isDir) {
    return (
      <div className="tree-node-wrapper">
        <div
          className="tree-node dir"
          style={{ paddingLeft: padLeft }}
          onClick={() => onToggle(node.path)}
        >
          <svg
            className={`tree-chevron ${isExpanded ? "expanded" : ""}`}
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z" />
          </svg>
          <span className="tree-icon">
            {isExpanded ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M.5 3.5A1.5 1.5 0 0 1 2 2h12a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.415 1.5H1.915A1.5 1.5 0 0 1 .5 12.5v-9z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M.5 3.5A1.5 1.5 0 0 1 2 2h4.672a1.5 1.5 0 0 1 1.06.44l1.036 1.035a.5.5 0 0 0 .354.146H14A1.5 1.5 0 0 1 15.5 5v7.5a1.5 1.5 0 0 1-1.5 1.5H2a1.5 1.5 0 0 1-1.5-1.5v-9z" />
              </svg>
            )}
          </span>
          <span className="tree-name">{node.name}</span>
        </div>
        {isExpanded && node.children && (
          <div className="tree-children">
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                expandedDirs={expandedDirs}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="tree-node file"
      style={{ paddingLeft: padLeft + 18 }}
      onClick={() => onOpenFile([node.path])}
    >
      <span className="tree-icon">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 2.5a.5.5 0 0 1 .5-.5h4.5l.5.5H14a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H2.5a.5.5 0 0 1-.5-.5v-10z" />
        </svg>
      </span>
      <span className="tree-name">{node.name}</span>
    </div>
  );
}
