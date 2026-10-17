"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { MouseEvent, ReactNode } from "react";

type DirectoryNode = { id: string; title: string; kind: "directory" | "page"; children: DirectoryNode[] };
type DirectoryGroup = { id: string; title: string; children: DirectoryNode[] };
type DirectoryTarget = {
  type: "year" | "section";
  id: string;
  title: string;
  kind: "directory" | "page";
  parentGroupId?: string;
  parentSectionId?: string;
};
type DirectoryOption = { key: string; label: string; type: "root" | "year" | "section"; id?: string };
type EmptyDirectoryPageProps = { moduleTitle: string; moduleKey: "materials" | "works" | "rules"; localTestMode?: boolean };
type MaterialFile = {
  id: string;
  sectionId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  previewUrl: string;
};

function isDirectoryNodes(value: unknown): value is DirectoryNode[] {
  return Array.isArray(value) && value.every((node) =>
    typeof node === "object" && node !== null && "id" in node && typeof node.id === "string" &&
    "title" in node && typeof node.title === "string" && "kind" in node &&
    (node.kind === "directory" || node.kind === "page") && "children" in node &&
    isDirectoryNodes(node.children),
  );
}

function isDirectoryGroups(value: unknown): value is DirectoryGroup[] {
  return Array.isArray(value) && value.every((group) =>
    typeof group === "object" && group !== null && "id" in group && typeof group.id === "string" &&
    "title" in group && typeof group.title === "string" && "children" in group &&
    isDirectoryNodes(group.children),
  );
}

function getErrorMessage(error: unknown, fallback = "目录操作失败") {
  return error instanceof Error ? error.message : fallback;
}

function isMaterialFile(value: unknown): value is MaterialFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value && typeof value.id === "string" &&
    "fileName" in value && typeof value.fileName === "string" &&
    "mimeType" in value && typeof value.mimeType === "string" &&
    "previewUrl" in value && typeof value.previewUrl === "string"
  );
}

async function getDirectoryGroups(moduleKey: EmptyDirectoryPageProps["moduleKey"], signal?: AbortSignal) {
  const response = await fetch(`/api/content-directories?module=${moduleKey}`, { signal, cache: "no-store" });
  const data = (await response.json()) as { groups?: unknown; message?: string };
  if (!response.ok || !isDirectoryGroups(data.groups)) {
    throw new Error(data.message ?? "目录读取失败");
  }
  return data.groups;
}

export default function EmptyDirectoryPage({ moduleTitle, moduleKey, localTestMode = false }: EmptyDirectoryPageProps) {
  const fileApiPath = moduleKey === "materials" ? "/api/material-files" : moduleKey === "works" ? "/api/work-files" : "/api/rule-files";
  const [groups, setGroups] = useState<DirectoryGroup[]>([]);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);
  const [expandedDirectoryIds, setExpandedDirectoryIds] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<DirectoryTarget | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMinisterMode, setIsMinisterMode] = useState(false);
  const [contextMenuTarget, setContextMenuTarget] = useState<DirectoryTarget | null>(null);
  const [renameTarget, setRenameTarget] = useState<DirectoryTarget | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameError, setRenameError] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createParentKey, setCreateParentKey] = useState("root");
  const [newNodeTitle, setNewNodeTitle] = useState("");
  const [createAsPage, setCreateAsPage] = useState(false);
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [moveTarget, setMoveTarget] = useState<DirectoryTarget | null>(null);
  const [moveParentKey, setMoveParentKey] = useState("");
  const [moveError, setMoveError] = useState("");
  const [isMoving, setIsMoving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DirectoryTarget | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [renameInteraction, setRenameInteraction] = useState<"save" | "cancel" | null>(null);
  const [materialFiles, setMaterialFiles] = useState<MaterialFile[]>([]);
  const [materialFilesSectionId, setMaterialFilesSectionId] = useState<string | null>(null);
  const [selectedMaterialFileId, setSelectedMaterialFileId] = useState<string | null>(null);
  const [materialFilesLoading, setMaterialFilesLoading] = useState(false);
  const [materialFilesError, setMaterialFilesError] = useState("");
  const [isUploadingMaterial, setIsUploadingMaterial] = useState(false);
  const [materialUploadProgress, setMaterialUploadProgress] = useState("");
  const [previewZoom, setPreviewZoom] = useState(1);
  const [ruleFilesBySection, setRuleFilesBySection] = useState<Record<string, MaterialFile[]>>({});
  const materialFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadDirectory() {
      setIsLoading(true);
      setError("");
      try {
        setGroups(await getDirectoryGroups(moduleKey, controller.signal));
      } catch (loadError) {
        if (!controller.signal.aborted) setError(getErrorMessage(loadError, "目录读取失败"));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    void loadDirectory();
    return () => controller.abort();
  }, [moduleKey]);

  useEffect(() => {
    if (moduleKey !== "rules" || groups.length === 0) return;

    const pageIds: string[] = [];
    const collectPageIds = (nodes: DirectoryNode[]) => {
      nodes.forEach((node) => {
        if (node.kind === "page") pageIds.push(node.id);
        if (node.kind === "directory") collectPageIds(node.children);
      });
    };
    groups.forEach((group) => collectPageIds(group.children));

    const controller = new AbortController();
    async function loadRuleFiles() {
      try {
        const entries = await Promise.all(pageIds.map(async (sectionId) => {
          const response = await fetch(`${fileApiPath}?sectionId=${encodeURIComponent(sectionId)}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          const data = (await response.json()) as { files?: unknown; message?: string };
          if (!response.ok || !Array.isArray(data.files)) {
            throw new Error(data.message ?? "读取规章文件失败");
          }
          return [sectionId, data.files.filter((file) => isMaterialFile(file) && (moduleKey !== "rules" || /\.pdf$/i.test(file.fileName)))] as const;
        }));
        setRuleFilesBySection(Object.fromEntries(entries));
      } catch (loadError) {
        if (!controller.signal.aborted) setMaterialFilesError(getErrorMessage(loadError, "读取规章文件失败"));
      }
    }

    void loadRuleFiles();
    return () => controller.abort();
  }, [fileApiPath, groups, moduleKey]);

  useEffect(() => {
    if (selectedItem?.type !== "section" || selectedItem.kind !== "page") {
      return;
    }

    const selectedSectionId = selectedItem.id;

    if (moduleKey === "rules") {
      return;
    }

    const controller = new AbortController();

    async function loadMaterialFiles() {
      setMaterialFilesLoading(true);
      setMaterialFilesError("");
      setMaterialFilesSectionId(selectedSectionId);
      setMaterialFiles([]);
      setSelectedMaterialFileId(null);
      setPreviewZoom(1);
      try {
        const response = await fetch(`${fileApiPath}?sectionId=${encodeURIComponent(selectedSectionId)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = (await response.json()) as { files?: unknown; message?: string };
        if (!response.ok || !Array.isArray(data.files)) {
          throw new Error(data.message ?? "读取素材文件失败");
        }
        setMaterialFiles(data.files as MaterialFile[]);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setMaterialFilesError(getErrorMessage(loadError, "读取文件失败"));
        }
      } finally {
        if (!controller.signal.aborted) {
          setMaterialFilesLoading(false);
        }
      }
    }

    void loadMaterialFiles();
    return () => controller.abort();
  }, [fileApiPath, moduleKey, ruleFilesBySection, selectedItem]);

  useEffect(() => {
    async function refreshRole() {
      try {
        const response = await fetch("/api/admin-auth", { cache: "no-store", credentials: "same-origin" });
        const data = (await response.json()) as { isMinister?: unknown };
        setIsMinisterMode(response.ok && data.isMinister === true);
      } catch {
        setIsMinisterMode(false);
      }
    }
    void refreshRole();
    window.addEventListener("eic-role-updated", refreshRole);
    return () => window.removeEventListener("eic-role-updated", refreshRole);
  }, []);

  useEffect(() => {
    if (!contextMenuTarget) return;
    const closeMenu = () => setContextMenuTarget(null);
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeMenu(); };
    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenuTarget]);

  function getCreateDirectoryOptions(): DirectoryOption[] {
    const options: DirectoryOption[] = [{ key: "root", label: "根目录（新增年度目录）", type: "root" }];
    function addNodes(nodes: DirectoryNode[], depth: number) {
      nodes.forEach((node) => {
        if (node.kind !== "directory") return;
        options.push({ key: `section:${node.id}`, label: `${"　".repeat(depth)}${node.title}`, type: "section", id: node.id });
        addNodes(node.children, depth + 1);
      });
    }
    groups.forEach((group) => {
      options.push({ key: `year:${group.id}`, label: group.title, type: "year", id: group.id });
      addNodes(group.children, 1);
    });
    return options;
  }

  function getMoveDirectoryOptions(target: DirectoryTarget): DirectoryOption[] {
    const excludedIds = new Set<string>([target.id]);
    function collect(nodes: DirectoryNode[]) {
      nodes.forEach((node) => {
        if (node.id === target.id) {
          excludedIds.add(node.id);
          collect(node.children);
        } else {
          collect(node.children);
        }
      });
    }
    groups.forEach((group) => collect(group.children));
    return getCreateDirectoryOptions().filter((option) => option.type !== "root" && !excludedIds.has(option.id ?? ""));
  }

  function getCreateParentKey(target: DirectoryTarget | null) {
    if (!target) return "root";
    if (target.type === "year") return `year:${target.id}`;
    if (target.kind === "directory") return `section:${target.id}`;
    return target.parentSectionId ? `section:${target.parentSectionId}` : `year:${target.parentGroupId ?? ""}`;
  }

  function openContextMenu(event: MouseEvent<HTMLButtonElement>, target: DirectoryTarget) {
    if (!isMinisterMode) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenuTarget(target);
  }

  function openRename(target: DirectoryTarget) {
    setContextMenuTarget(null);
    setRenameTarget(target);
    setRenameTitle(target.title);
    setRenameError("");
    setRenameInteraction(null);
  }

  function closeRename() {
    setRenameTarget(null);
    setRenameTitle("");
    setRenameError("");
    setRenameInteraction(null);
  }

  async function renameDirectory() {
    if (!renameTarget || isRenaming) return;
    if (!renameTitle.trim()) {
      setRenameError("请输入新的目录名称");
      return;
    }
    setIsRenaming(true);
    setRenameError("");
    try {
      const response = await fetch("/api/content-directories", {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: moduleKey, action: "rename", targetType: renameTarget.type, id: renameTarget.id, title: renameTitle.trim() }),
      });
      const data = (await response.json()) as { groups?: unknown; message?: string };
      if (!response.ok || !isDirectoryGroups(data.groups)) throw new Error(data.message ?? "重命名失败");
      setGroups(data.groups);
      setSelectedItem((current) => current?.id === renameTarget.id ? { ...current, title: renameTitle.trim() } : current);
      closeRename();
    } catch (requestError) {
      setRenameError(getErrorMessage(requestError, "重命名失败"));
    } finally {
      setIsRenaming(false);
    }
  }

  function renderDirectoryTitle(target: DirectoryTarget, title: string) {
    const editing = renameTarget?.type === target.type && renameTarget.id === target.id;
    if (!editing) return <span className="truncate">{title}</span>;
    return (
      <input
        autoFocus aria-label={`重命名${title}`} aria-invalid={Boolean(renameError)} title={renameError || undefined}
        className="min-w-0 flex-1 rounded border border-[#159fda] bg-white px-2 py-0.5 text-sm font-medium text-slate-900 outline-none ring-2 ring-sky-100"
        value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") { event.preventDefault(); setRenameInteraction("save"); event.currentTarget.blur(); }
          if (event.key === "Escape") { event.preventDefault(); setRenameInteraction("cancel"); closeRename(); }
        }}
        onBlur={() => { if (renameInteraction === "cancel") { setRenameInteraction(null); return; } void renameDirectory(); }}
      />
    );
  }

  function openCreate(target: DirectoryTarget | null) {
    setContextMenuTarget(null);
    setCreateParentKey(getCreateParentKey(target));
    setNewNodeTitle("");
    setCreateAsPage(false);
    setCreateError("");
    setIsCreateOpen(true);
  }

  function closeCreate() {
    setIsCreateOpen(false);
    setCreateError("");
  }

  async function createDirectory() {
    const title = newNodeTitle.trim();
    const option = getCreateDirectoryOptions().find((item) => item.key === createParentKey);
    if (isCreating) return;
    if (!title || !option) { setCreateError(!title ? "请输入名称" : "请选择新增位置"); return; }
    setIsCreating(true);
    setCreateError("");
    try {
      const response = await fetch("/api/content-directories", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: moduleKey, title, parentType: option.type === "root" ? "" : option.type, parentId: option.id ?? "", isPage: createAsPage }),
      });
      const data = (await response.json()) as { groups?: unknown; message?: string };
      if (!response.ok || !isDirectoryGroups(data.groups)) throw new Error(data.message ?? "新增目录失败");
      setGroups(data.groups);
      closeCreate();
    } catch (requestError) {
      setCreateError(getErrorMessage(requestError, "新增目录失败"));
    } finally {
      setIsCreating(false);
    }
  }

  function openMove(target: DirectoryTarget) {
    if (target.type !== "section") return;
    const options = getMoveDirectoryOptions(target);
    setContextMenuTarget(null);
    setMoveTarget(target);
    setMoveParentKey(options[0]?.key ?? "");
    setMoveError("");
  }

  function closeMove() {
    setMoveTarget(null);
    setMoveParentKey("");
    setMoveError("");
  }

  async function moveDirectory() {
    if (!moveTarget || isMoving) return;
    const option = getMoveDirectoryOptions(moveTarget).find((item) => item.key === moveParentKey);
    if (!option || option.type === "root") { setMoveError("请选择有效目录"); return; }
    setIsMoving(true);
    setMoveError("");
    try {
      const response = await fetch("/api/content-directories", {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: moduleKey, action: "move", targetType: "section", id: moveTarget.id, parentType: option.type, parentId: option.id }),
      });
      const data = (await response.json()) as { groups?: unknown; message?: string };
      if (!response.ok || !isDirectoryGroups(data.groups)) throw new Error(data.message ?? "移动失败");
      setGroups(data.groups);
      closeMove();
    } catch (requestError) {
      setMoveError(getErrorMessage(requestError, "移动失败"));
    } finally {
      setIsMoving(false);
    }
  }

  function openDelete(target: DirectoryTarget) {
    setContextMenuTarget(null);
    setDeleteTarget(target);
    setDeleteError("");
    setIsDeleteOpen(true);
  }

  function closeDelete() {
    setIsDeleteOpen(false);
    setDeleteTarget(null);
    setDeleteError("");
  }

  async function deleteDirectory() {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch("/api/content-directories", {
        method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: moduleKey, groupIds: deleteTarget.type === "year" ? [deleteTarget.id] : [], sectionIds: deleteTarget.type === "section" ? [deleteTarget.id] : [] }),
      });
      const data = (await response.json()) as { groups?: unknown; message?: string };
      if (!response.ok || !isDirectoryGroups(data.groups)) throw new Error(data.message ?? "删除失败");
      setGroups(data.groups);
      setSelectedItem((current) => current?.id === deleteTarget.id ? null : current);
      closeDelete();
    } catch (requestError) {
      setDeleteError(getErrorMessage(requestError, "删除失败"));
    } finally {
      setIsDeleting(false);
    }
  }

  function renderContextMenu(target: DirectoryTarget) {
    return (
      <div className="performance-directory-context-menu" role="menu" aria-label={`${target.title}目录操作`} onClick={(event) => event.stopPropagation()}>
        <button className="performance-directory-context-menu-item" type="button" role="menuitem" onClick={() => openRename(target)}>重命名</button>
        {target.type === "section" && <button className="performance-directory-context-menu-item" type="button" role="menuitem" onClick={() => openMove(target)}>移动</button>}
        <button className="performance-directory-context-menu-item" type="button" role="menuitem" onClick={() => openCreate(target)}>新增</button>
        <button className="performance-directory-context-menu-item performance-directory-context-menu-item-danger" type="button" role="menuitem" onClick={() => openDelete(target)}>删除</button>
      </div>
    );
  }

  function renderRuleFileEntry(file: MaterialFile, pageTarget: DirectoryTarget, depth: number) {
    const isSelected = selectedItem?.id === pageTarget.id && selectedMaterialFileId === file.id;
    return (
      <div className="relative" key={file.id} style={{ paddingLeft: `${depth * 16}px` }}>
        <button
          className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${isSelected ? "bg-[#a6dff1] text-slate-900 shadow-sm" : "text-slate-700 hover:bg-sky-100"}`}
          type="button"
          title={file.fileName}
          onClick={() => {
            setContextMenuTarget(null);
            setSelectedItem(pageTarget);
            setSelectedMaterialFileId(file.id);
            setPreviewZoom(1);
          }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="inline-flex h-5 w-7 shrink-0 items-center justify-center rounded border border-red-200 bg-red-50 text-[9px] font-bold text-red-600">PDF</span>
            <span className="truncate">{file.fileName}</span>
          </span>
        </button>
      </div>
    );
  }

  function renderNodes(nodes: DirectoryNode[], parentGroupId: string, parentSectionId?: string, depth = 0): ReactNode {
    return nodes.map((node) => {
      const target: DirectoryTarget = { type: "section", id: node.id, title: node.title, kind: node.kind, parentGroupId, parentSectionId };
      const isExpanded = expandedDirectoryIds.includes(node.id);
      const isSelected = selectedItem?.id === node.id && selectedItem.type === "section";
      const ruleFiles = moduleKey === "rules" && node.kind === "page"
        ? ruleFilesBySection[node.id] ?? []
        : [];
      if (moduleKey === "rules" && node.kind === "page" && ruleFiles.length > 0) {
        return (
          <Fragment key={node.id}>
            {ruleFiles.map((file) => renderRuleFileEntry(file, target, depth))}
          </Fragment>
        );
      }
      return (
        <Fragment key={node.id}>
          <div className="relative" style={{ paddingLeft: `${depth * 16}px` }}>
            <button
              className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${isSelected ? "bg-[#a6dff1] text-slate-900 shadow-sm" : "text-slate-700 hover:bg-sky-100"}`}
              type="button" onContextMenu={(event) => openContextMenu(event, target)}
              onClick={() => { setContextMenuTarget(null); setSelectedItem(target); if (node.kind === "directory") setExpandedDirectoryIds((current) => current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id]); }}
              aria-expanded={node.kind === "directory" ? isExpanded : undefined}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className={`inline-block text-[10px] text-slate-400 transition-transform ${node.kind === "directory" && isExpanded ? "rotate-90" : ""}`}>{node.kind === "directory" ? "▶" : "•"}</span>
                {renderDirectoryTitle(target, node.title)}
              </span>
            </button>
            {contextMenuTarget?.type === "section" && contextMenuTarget.id === node.id && renderContextMenu(target)}
          </div>
          {isExpanded && node.kind === "directory" && renderNodes(node.children, parentGroupId, node.id, depth + 1)}
        </Fragment>
      );
    });
  }

  function toggleGroup(group: DirectoryGroup) {
    setExpandedGroupIds((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id]);
    setSelectedItem({ type: "year", id: group.id, title: group.title, kind: "directory" });
  }

  function formatFileSize(sizeBytes: number) {
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
    if (sizeBytes < 1024 * 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function formatFileDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "--"
      : new Intl.DateTimeFormat("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(date);
  }

  function isImageFile(file: MaterialFile) {
    return file.mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.fileName);
  }

  function isPdfFile(file: MaterialFile) {
    return file.mimeType === "application/pdf" || /\.pdf$/i.test(file.fileName);
  }

  function getFileExtension(fileName: string) {
    const extension = fileName.split(".").pop()?.toUpperCase();
    return extension && extension.length <= 5 ? extension : "FILE";
  }

  async function uploadMaterialFiles(fileList: FileList | null) {
    if (!fileList || !selectedItem || selectedItem.type !== "section" || selectedItem.kind !== "page" || isUploadingMaterial) {
      return;
    }

    setIsUploadingMaterial(true);
    setMaterialFilesError("");
    const files = Array.from(fileList);

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setMaterialUploadProgress(`正在上传 ${index + 1}/${files.length}`);
        const formData = new FormData();
        formData.set("sectionId", selectedItem.id);
        formData.set("file", file);
        const response = await fetch(fileApiPath, {
          method: "POST",
          credentials: "same-origin",
          body: formData,
        });
        const data = (await response.json()) as { file?: unknown; message?: string };
        if (!response.ok || !isMaterialFile(data.file)) {
          throw new Error(data.message ?? "上传文件失败");
        }
        setMaterialFiles((current) => [data.file as MaterialFile, ...current]);
        if (moduleKey === "rules") {
          setRuleFilesBySection((current) => ({
            ...current,
            [selectedItem.id]: [data.file as MaterialFile, ...(current[selectedItem.id] ?? [])],
          }));
        }
        setSelectedMaterialFileId(data.file.id);
      }
    } catch (uploadError) {
      setMaterialFilesError(getErrorMessage(uploadError, "上传文件失败"));
    } finally {
      setMaterialUploadProgress("");
      setIsUploadingMaterial(false);
      if (materialFileInputRef.current) materialFileInputRef.current.value = "";
    }
  }

  async function deleteMaterialFile(file: MaterialFile) {
    if (!isMinisterMode || !window.confirm(`确定删除“${file.fileName}”吗？`)) return;

    try {
      const response = await fetch(fileApiPath, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: file.id }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "删除文件失败");
      setMaterialFiles((current) => current.filter((item) => item.id !== file.id));
      if (moduleKey === "rules") {
        setRuleFilesBySection((current) => ({
          ...current,
          [file.sectionId]: (current[file.sectionId] ?? []).filter((item) => item.id !== file.id),
        }));
      }
      setSelectedMaterialFileId((current) => (current === file.id ? null : current));
    } catch (deleteError) {
      setMaterialFilesError(getErrorMessage(deleteError, "删除文件失败"));
    }
  }

  function renderMaterialWorkspace() {
    const selectedPage = selectedItem?.type === "section" && selectedItem.kind === "page";
    const currentFiles = selectedPage && materialFilesSectionId === selectedItem.id ? materialFiles : [];
    const selectedFile = currentFiles.find((file) => file.id === selectedMaterialFileId) ?? null;

    if (!selectedPage) {
      return (
        <div className="mt-8 border-t border-slate-200 pt-6 text-sm text-slate-500">
          请选择左侧的{moduleKey === "rules" ? "规章" : "素材"}页面查看文件。
        </div>
      );
    }

    return (
      <div className="mt-6 grid min-h-[calc(100vh-11rem)] grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <section className="flex min-h-[540px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">文件库</h2>
              <p className="mt-0.5 text-xs text-slate-500">{currentFiles.length} 个文件</p>
            </div>
            {isMinisterMode && (
              <>
                <input
                  ref={materialFileInputRef}
                  className="sr-only"
                  type="file"
                  multiple
                  accept={moduleKey === "rules" ? ".pdf,application/pdf" : "image/*,.psd,.pdf"}
                  onChange={(event) => void uploadMaterialFiles(event.target.files)}
                />
                <button
                  className="inline-flex items-center gap-2 rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => materialFileInputRef.current?.click()}
                  disabled={isUploadingMaterial}
                >
                  <span aria-hidden="true" className="text-base leading-none">↑</span>
                  {isUploadingMaterial ? materialUploadProgress : "上传文件"}
                </button>
              </>
            )}
          </div>
          {materialFilesError && <p className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{materialFilesError}</p>}
          <div className="min-h-0 flex-1 overflow-auto">
            {materialFilesLoading ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">正在读取文件...</p>
            ) : currentFiles.length === 0 ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center px-5 text-center text-slate-500">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-sky-200 bg-sky-50 text-2xl text-sky-400" aria-hidden="true">+</div>
                <p className="text-sm font-medium text-slate-700">当前页面还没有{moduleKey === "rules" ? "规章" : "素材"}文件</p>
                <p className="mt-1 text-xs">{moduleKey === "rules" ? "上传 PDF 后会显示在左侧目录" : "上传图片、PSD 或 PDF 后会显示在这里"}</p>
              </div>
            ) : (
              <div className="min-w-[620px]">
                <div className="grid grid-cols-[minmax(230px,1fr)_130px_92px_44px] border-b border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <span>名称</span><span>修改日期</span><span>大小</span><span />
                </div>
                {currentFiles.map((file) => {
                  const isSelected = file.id === selectedMaterialFileId;
                  return (
                    <div
                      className={`grid grid-cols-[minmax(230px,1fr)_130px_92px_44px] items-center border-b border-slate-100 px-4 py-3 text-sm transition ${isSelected ? "bg-[#e7f7fc]" : "hover:bg-slate-50"}`}
                      key={file.id}
                      onClick={() => { setSelectedMaterialFileId(file.id); setPreviewZoom(1); }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedMaterialFileId(file.id); setPreviewZoom(1); } }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-8 w-10 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500">{getFileExtension(file.fileName)}</span>
                        <span className="truncate font-medium text-slate-800" title={file.fileName}>{file.fileName}</span>
                      </div>
                      <span className="text-xs text-slate-500">{formatFileDate(file.updatedAt || file.createdAt)}</span>
                      <span className="text-xs text-slate-500">{formatFileSize(file.sizeBytes)}</span>
                      <button className="text-slate-400 transition hover:text-red-600" type="button" aria-label={`删除${file.fileName}`} title="删除文件" onClick={(event) => { event.stopPropagation(); void deleteMaterialFile(file); }}>×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-[540px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">预览</h2>
              <p className="mt-0.5 max-w-[260px] truncate text-xs text-slate-500" title={selectedFile?.fileName}>{selectedFile?.fileName ?? "未选择文件"}</p>
            </div>
            {selectedFile && isImageFile(selectedFile) && <span className="text-xs font-medium text-slate-500">{Math.round(previewZoom * 100)}%</span>}
          </div>
          <div
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-white p-8"
            onWheel={(event) => {
              if (!selectedFile || !isImageFile(selectedFile)) return;
              event.preventDefault();
              setPreviewZoom((current) => Math.min(4, Math.max(0.2, current + (event.deltaY < 0 ? 0.1 : -0.1))));
            }}
          >
            {selectedFile && isImageFile(selectedFile) && (
              <div className="relative h-full w-full min-h-[320px]">
                <Image src={selectedFile.previewUrl} alt={selectedFile.fileName} fill unoptimized className="object-contain transition-transform duration-100" style={{ transform: `scale(${previewZoom})` }} />
              </div>
            )}
            {selectedFile && isPdfFile(selectedFile) && <iframe className="h-full min-h-[420px] w-full rounded border border-slate-200 bg-white" src={selectedFile.previewUrl} title={`预览${selectedFile.fileName}`} />}
            {selectedFile && !isImageFile(selectedFile) && !isPdfFile(selectedFile) && (
              <div className="max-w-sm text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-sky-200 bg-white text-lg font-bold text-sky-600">{getFileExtension(selectedFile.fileName)}</div><p className="mt-5 text-sm font-semibold text-slate-700">此文件格式暂不支持直接预览</p><p className="mt-2 break-all text-xs leading-5 text-slate-500">{selectedFile.fileName}</p><a className="mt-5 inline-flex rounded-md border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50" href={selectedFile.previewUrl} target="_blank" rel="noreferrer">打开或下载文件</a></div>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderRulesPreviewWorkspace() {
    const selectedPage = selectedItem?.type === "section" && selectedItem.kind === "page";
    const selectedFile = selectedPage
      ? (ruleFilesBySection[selectedItem.id] ?? []).find((file) => file.id === selectedMaterialFileId) ?? null
      : null;

    if (!selectedPage) {
      return <p className="mt-8 border-t border-slate-200 pt-6 text-sm text-slate-500">请选择左侧 PDF 文件查看预览。</p>;
    }

    return (
      <section className="mt-6 flex min-h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-900">{selectedFile?.fileName ?? "PDF 预览"}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{selectedFile ? formatFileSize(selectedFile.sizeBytes) : "请选择左侧文件"}</p>
          </div>
          {isMinisterMode && (
            <>
              <input
                ref={materialFileInputRef}
                className="sr-only"
                type="file"
                multiple
                accept=".pdf,application/pdf"
                onChange={(event) => void uploadMaterialFiles(event.target.files)}
              />
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex items-center gap-2 rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => materialFileInputRef.current?.click()}
                  disabled={isUploadingMaterial}
                >
                  <span aria-hidden="true" className="text-base leading-none">↑</span>
                  {isUploadingMaterial ? materialUploadProgress : "上传 PDF"}
                </button>
                {selectedFile && <button className="rounded-md px-2 py-2 text-sm text-slate-400 transition hover:bg-red-50 hover:text-red-600" type="button" aria-label={`删除${selectedFile.fileName}`} title="删除文件" onClick={() => void deleteMaterialFile(selectedFile)}>×</button>}
              </div>
            </>
          )}
        </div>
        {materialFilesError && <p className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{materialFilesError}</p>}
        <div className="min-h-0 flex-1 bg-white">
          {materialFilesLoading ? (
            <p className="flex min-h-[560px] items-center justify-center text-sm text-slate-500">正在读取 PDF...</p>
          ) : selectedFile ? (
            <iframe className="h-[calc(100vh-15rem)] min-h-[560px] w-full border-0 bg-white" src={selectedFile.previewUrl} title={`预览${selectedFile.fileName}`} />
          ) : (
            <div className="flex min-h-[560px] items-center justify-center text-sm text-slate-400">请选择左侧 PDF 文件预览</div>
          )}
        </div>
      </section>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] bg-slate-50 text-slate-950">
      <aside className="w-72 shrink-0 border-r border-slate-200 bg-[#eaf2fb] px-5 py-6 shadow-sm">
        <nav aria-label={`${moduleTitle}目录`} className="text-left">
          {isLoading && <p className="rounded-xl bg-white/70 px-4 py-3 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200/70">正在读取目录...</p>}
          {!isLoading && error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</p>}
          {!isLoading && !error && groups.length === 0 && <p className="rounded-xl bg-white/70 px-4 py-3 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200/70">暂无目录</p>}
          {!isLoading && !error && groups.length > 0 && <div className="space-y-2">
            {groups.map((group) => {
              const target: DirectoryTarget = { type: "year", id: group.id, title: group.title, kind: "directory" };
              const isExpanded = expandedGroupIds.includes(group.id);
              const isSelected = selectedItem?.id === group.id && selectedItem.type === "year";
              return (
                <div className="relative rounded-xl bg-white/70 px-4 py-3 shadow-sm ring-1 ring-slate-200/70" key={group.id}>
                  <button className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${isSelected ? "bg-[#a6dff1] text-slate-900 shadow-sm" : "text-slate-700 hover:bg-sky-100"}`} type="button" onContextMenu={(event) => openContextMenu(event, target)} onClick={() => { setContextMenuTarget(null); toggleGroup(group); }} aria-expanded={isExpanded}>
                    <span className="flex items-center gap-2"><span aria-hidden="true" className={`inline-block text-[10px] text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>{renderDirectoryTitle(target, group.title)}</span>
                  </button>
                  {contextMenuTarget?.type === "year" && contextMenuTarget.id === group.id && renderContextMenu(target)}
                  {isExpanded && <div className="mt-2 pl-4">{renderNodes(group.children, group.id)}</div>}
                </div>
              );
            })}
          </div>}
        </nav>
      </aside>

      <section className="flex-1 px-8 py-7">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">
            {selectedItem?.type === "section" && selectedItem.kind === "page"
              ? selectedItem.title
              : moduleTitle}
          </h1>
          {localTestMode && <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">本地测试模式</span>}
        </div>
        {moduleKey === "rules" ? (
          renderRulesPreviewWorkspace()
        ) : moduleKey === "materials" || moduleKey === "works" ? (
          selectedItem ? renderMaterialWorkspace() : <p className="mt-8 border-t border-slate-200 pt-6 text-sm text-slate-500">请选择左侧目录查看内容。</p>
        ) : (
          selectedItem ? <div className="mt-8 border-t border-slate-200 pt-6"><h2 className="text-lg font-semibold text-slate-800">{selectedItem.title}</h2><p className="mt-2 text-sm text-slate-500">该目录暂未添加具体内容。</p></div> : <p className="mt-8 border-t border-slate-200 pt-6 text-sm text-slate-500">请选择左侧目录查看内容。</p>
        )}
      </section>

      {isCreateOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm"><div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-950/10" role="dialog" aria-modal="true" aria-labelledby="content-create-title"><div className="flex h-14 items-center bg-[#159fda] px-6 text-white"><h2 id="content-create-title" className="text-base font-semibold">新增目录项目</h2></div><div className="space-y-5 px-6 py-6"><label className="grid gap-2 text-sm font-semibold text-slate-800">名称<input autoFocus className="h-11 rounded-md border border-slate-300 px-3 font-normal text-slate-900 outline-none focus:border-[#159fda] focus:ring-2 focus:ring-sky-100" value={newNodeTitle} onChange={(event) => setNewNodeTitle(event.target.value)} /></label><label className="grid gap-2 text-sm font-semibold text-slate-800">新增位置<select className="h-11 rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none focus:border-[#159fda] focus:ring-2 focus:ring-sky-100" value={createParentKey} onChange={(event) => setCreateParentKey(event.target.value)}>{getCreateDirectoryOptions().map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label><label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" className="h-4 w-4 accent-[#159fda]" checked={createAsPage} onChange={(event) => setCreateAsPage(event.target.checked)} />创建为页面</label>{createError && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</p>}</div><div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4"><button className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60" type="button" onClick={closeCreate} disabled={isCreating}>取消</button><button className="rounded-md bg-[#159fda] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#128ec3] disabled:opacity-60" type="button" onClick={() => void createDirectory()} disabled={isCreating}>{isCreating ? "新增中" : "确认"}</button></div></div></div>}

      {moveTarget && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm"><div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-950/10" role="dialog" aria-modal="true" aria-labelledby="content-move-title"><div className="flex h-14 items-center bg-[#159fda] px-6 text-white"><h2 id="content-move-title" className="text-base font-semibold">移动项目</h2></div><div className="space-y-4 px-6 py-6"><p className="text-sm text-slate-700">正在移动：<span className="font-semibold text-slate-900">{moveTarget.title}</span></p><label className="grid gap-2 text-sm font-semibold text-slate-800">移动位置<select className="h-11 rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none focus:border-[#159fda] focus:ring-2 focus:ring-sky-100" value={moveParentKey} onChange={(event) => setMoveParentKey(event.target.value)}>{getMoveDirectoryOptions(moveTarget).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>{moveError && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{moveError}</p>}</div><div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4"><button className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60" type="button" onClick={closeMove} disabled={isMoving}>取消</button><button className="rounded-md bg-[#159fda] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#128ec3] disabled:opacity-60" type="button" onClick={() => void moveDirectory()} disabled={isMoving}>{isMoving ? "移动中" : "确认"}</button></div></div></div>}

      {isDeleteOpen && deleteTarget && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm"><div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-950/10" role="dialog" aria-modal="true" aria-labelledby="content-delete-title"><div className="flex h-14 items-center bg-[#159fda] px-6 text-white"><h2 id="content-delete-title" className="text-base font-semibold">确认删除</h2></div><div className="px-6 py-6 text-sm leading-6 text-slate-700">确定删除“{deleteTarget.title}”吗？其下级目录也会一并删除。</div>{deleteError && <p className="mx-6 mb-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}<div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4"><button className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60" type="button" onClick={closeDelete} disabled={isDeleting}>取消</button><button className="rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60" type="button" onClick={() => void deleteDirectory()} disabled={isDeleting}>{isDeleting ? "删除中" : "确认删除"}</button></div></div></div>}
    </main>
  );
}
