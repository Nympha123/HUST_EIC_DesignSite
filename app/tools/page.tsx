"use client";

import { useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";

type ToolCard = {
  id: string;
  label: string;
  title: string;
  description: string;
  href: string;
  labelColor: string;
};

type ToolDraft = {
  label: string;
  title: string;
  description: string;
  href: string;
};

const toolsStorageKey = "eic-tool-navigation-cards";
const toolsUpdatedEvent = "eic-tool-navigation-updated";
const defaultTools: ToolCard[] = [
  { id: "tencent-docs", href: "https://docs.qq.com/", label: "Tencent Docs", title: "腾讯文档", description: "在线编辑和协作处理部门文档、表格与收集表。", labelColor: "text-blue-600" },
  { id: "canva", href: "https://www.canva.cn/", label: "Canva", title: "Canva 可画", description: "制作活动海报、推文配图和宣传视觉素材。", labelColor: "text-cyan-600" },
  { id: "wps-cloud", href: "https://www.kdocs.cn/", label: "WPS Cloud", title: "WPS 云文档", description: "查看、编辑和共享常用办公文档。", labelColor: "text-red-500" },
  { id: "tinypng", href: "https://tinypng.com/", label: "TinyPNG", title: "图片压缩", description: "压缩 PNG、JPEG、WebP 图片，方便上传和发送。", labelColor: "text-emerald-600" },
  { id: "github", href: "https://github.com/", label: "GitHub", title: "GitHub", description: "管理项目代码、版本记录和协作仓库。", labelColor: "text-slate-700" },
];

const emptyDraft: ToolDraft = { label: "", title: "", description: "", href: "" };
let toolsSnapshot = defaultTools;
let toolsSnapshotRaw = "";

function isToolCard(value: unknown): value is ToolCard {
  return (
    typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "string" &&
    "label" in value && typeof value.label === "string" &&
    "title" in value && typeof value.title === "string" &&
    "description" in value && typeof value.description === "string" &&
    "href" in value && typeof value.href === "string" &&
    "labelColor" in value && typeof value.labelColor === "string"
  );
}

function readTools() {
  if (typeof window === "undefined") return defaultTools;
  const rawTools = window.localStorage.getItem(toolsStorageKey) ?? "";
  if (rawTools === toolsSnapshotRaw) return toolsSnapshot;
  toolsSnapshotRaw = rawTools;
  if (!rawTools) {
    toolsSnapshot = defaultTools;
    return toolsSnapshot;
  }
  try {
    const parsedTools = JSON.parse(rawTools) as unknown;
    toolsSnapshot = Array.isArray(parsedTools) && parsedTools.every(isToolCard) ? parsedTools : defaultTools;
  } catch {
    toolsSnapshot = defaultTools;
  }
  return toolsSnapshot;
}

function subscribeToTools(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(toolsUpdatedEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(toolsUpdatedEvent, onStoreChange);
  };
}

function saveTools(nextTools: ToolCard[]) {
  window.localStorage.setItem(toolsStorageKey, JSON.stringify(nextTools));
  window.dispatchEvent(new Event(toolsUpdatedEvent));
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function ToolsPage() {
  const tools = useSyncExternalStore(subscribeToTools, readTools, () => defaultTools);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<ToolDraft>(emptyDraft);
  const [formError, setFormError] = useState("");

  function openAddDialog() {
    setDraft(emptyDraft);
    setFormError("");
    setIsAddDialogOpen(true);
  }

  function closeAddDialog() {
    setIsAddDialogOpen(false);
    setFormError("");
  }

  function submitTool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = draft.label.trim();
    const title = draft.title.trim();
    const description = draft.description.trim();
    const href = draft.href.trim();
    if (!label || !title || !description || !href) {
      setFormError("请完整填写卡片信息");
      return;
    }
    if (!isValidHttpUrl(href)) {
      setFormError("跳转地址必须以 http:// 或 https:// 开头");
      return;
    }
    saveTools([...tools, {
      id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      title,
      description,
      href,
      labelColor: "text-cyan-600",
    }]);
    closeAddDialog();
  }

  function toggleDeleteMode() {
    setIsDeleteMode((current) => !current);
    setSelectedDeleteIds([]);
  }

  function toggleDeleteSelection(id: string) {
    setSelectedDeleteIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id]);
  }

  function deleteSelectedTools() {
    if (selectedDeleteIds.length === 0) return;
    saveTools(tools.filter((tool) => !selectedDeleteIds.includes(tool.id)));
    setSelectedDeleteIds([]);
    setIsDeleteMode(false);
  }

  const fields: Array<[keyof ToolDraft, string, string]> = [
    ["label", "英文标识", "例如：Department Tool"],
    ["title", "卡片名称", "例如：在线转换"],
    ["description", "卡片说明", "例如：用于处理常用文件格式"],
    ["href", "跳转地址", "https://example.com"],
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto max-w-6xl px-5 py-8 pb-28 sm:px-6 lg:py-10 lg:pb-32">
        <div className="mb-8">
          <p className="text-sm font-medium text-cyan-600">Tool Navigation</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">工具导航</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">常用辅助网站入口。</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const isMarkedForDelete = selectedDeleteIds.includes(tool.id);
            return (
              <div className="relative h-44 min-w-0" key={tool.id}>
                {isDeleteMode && (
                  <label className="absolute right-4 top-4 z-10 flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      className="h-4 w-4 accent-cyan-600"
                      type="checkbox"
                      checked={isMarkedForDelete}
                      onChange={() => toggleDeleteSelection(tool.id)}
                      aria-label={`选择删除${tool.title}`}
                    />
                    删除
                  </label>
                )}
                <a
                  className={`flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${isMarkedForDelete ? "border-red-300 ring-2 ring-red-100" : "border-slate-200"}`}
                  href={isDeleteMode ? undefined : tool.href}
                  onClick={(event) => {
                    if (isDeleteMode) {
                      event.preventDefault();
                      toggleDeleteSelection(tool.id);
                    }
                  }}
                  target={isDeleteMode ? undefined : "_blank"}
                  rel="noreferrer"
                >
                  <p className={`line-clamp-1 text-sm font-medium ${tool.labelColor}`} title={tool.label}>{tool.label}</p>
                  <h2 className="mt-3 line-clamp-1 text-xl font-semibold" title={tool.title}>{tool.title}</h2>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600" title={tool.description}>{tool.description}</p>
                </a>
              </div>
            );
          })}
        </div>
      </section>

      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2">
        {isDeleteMode && (
          <button className="h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-lg transition hover:bg-slate-50" type="button" onClick={toggleDeleteMode}>取消</button>
        )}
        <button
          className="h-11 rounded-md bg-cyan-600 px-4 text-sm font-semibold text-white shadow-lg transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={isDeleteMode ? deleteSelectedTools : openAddDialog}
          disabled={isDeleteMode && selectedDeleteIds.length === 0}
        >
          {isDeleteMode ? `删除${selectedDeleteIds.length > 0 ? `（${selectedDeleteIds.length}）` : ""}` : "添加"}
        </button>
        {!isDeleteMode && (
          <button className="h-11 rounded-md border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 shadow-lg transition hover:bg-red-50" type="button" onClick={toggleDeleteMode}>删除</button>
        )}
      </div>

      {isAddDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAddDialog(); }}>
          <form className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-950/10" onSubmit={submitTool}>
            <div className="flex h-14 items-center justify-between bg-[#159fda] px-6 text-white">
              <h2 className="text-base font-semibold">添加工具卡片</h2>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-2xl leading-none transition hover:bg-white/15" type="button" onClick={closeAddDialog} aria-label="关闭添加工具卡片弹窗">×</button>
            </div>
            <div className="space-y-4 px-6 py-6">
              {fields.map(([field, label, placeholder]) => (
                <label className="block" key={field}>
                  <span className="mb-1.5 block text-sm font-semibold text-slate-800">{label}</span>
                  <input
                    className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#159fda] focus:ring-2 focus:ring-sky-100"
                    value={draft[field]}
                    onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
                    placeholder={placeholder}
                  />
                </label>
              ))}
              {formError && <p className="text-sm font-medium text-red-600">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100" type="button" onClick={closeAddDialog}>取消</button>
              <button className="rounded-md bg-[#159fda] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#128ec3]" type="submit">保存</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
