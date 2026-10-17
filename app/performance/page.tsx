"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, MouseEvent, ReactNode } from "react";

const roleStorageKey = "eic-current-role";

type PerformanceChild = {
  id: string;
  title: string;
  kind: "directory" | "page";
  children: PerformanceChild[];
};

type PerformanceGroup = {
  id: string;
  title: string;
  children: PerformanceChild[];
};

type SelectedItem = {
  id: string;
  title: string;
  level: "group" | "child";
  kind: "directory" | "page";
};

type PerformanceTask = {
  id: string;
  title: string;
};

type PerformanceRecord = {
  id: string;
  grade: string;
  memberName: string;
  studentId: string;
  currentScore: string;
  tasks: PerformanceTask[];
};

type TaskModal = {
  memberId: string;
  sectionId: string;
  tasks: string[];
  isSaving: boolean;
  error: string;
};

type DirectoryTarget = {
  type: "year" | "section";
  id: string;
  title: string;
  kind: "directory" | "page";
  parentGroupId?: string;
  parentSectionId?: string;
};

type DirectoryDropZone = {
  type: "year" | "section";
  parentGroupId?: string;
  parentSectionId?: string;
  index: number;
};

function isPerformanceGroups(value: unknown): value is PerformanceGroup[] {
  return (
    Array.isArray(value) &&
    value.every(
      (group) =>
        typeof group === "object" &&
        group !== null &&
        "id" in group &&
        typeof group.id === "string" &&
        "title" in group &&
        typeof group.title === "string" &&
        "children" in group &&
        Array.isArray(group.children) &&
        group.children.every(
          (child: unknown) =>
            typeof child === "object" &&
            child !== null &&
            "id" in child &&
            typeof child.id === "string" &&
            "title" in child &&
            typeof child.title === "string" &&
            "kind" in child &&
            (child.kind === "directory" || child.kind === "page") &&
            "children" in child &&
            Array.isArray(child.children),
        ),
    )
  );
}

function isPerformanceRecords(value: unknown): value is PerformanceRecord[] {
  return (
    Array.isArray(value) &&
    value.every(
      (record) =>
        typeof record === "object" &&
        record !== null &&
        "id" in record &&
        typeof record.id === "string" &&
        "grade" in record &&
        typeof record.grade === "string" &&
        "memberName" in record &&
        typeof record.memberName === "string" &&
        "studentId" in record &&
        typeof record.studentId === "string" &&
        "currentScore" in record &&
        typeof record.currentScore === "string" &&
        "tasks" in record &&
        Array.isArray(record.tasks) &&
        record.tasks.every(
          (task: unknown) =>
            typeof task === "object" &&
            task !== null &&
            "id" in task &&
            typeof task.id === "string" &&
            "title" in task &&
            typeof task.title === "string",
        ),
    )
  );
}

function isPerformanceRecord(value: unknown): value is PerformanceRecord {
  return isPerformanceRecords([value]);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function getVerifiedMinisterMode() {
  const response = await fetch("/api/admin-auth", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = (await response.json()) as { isMinister?: unknown };

  return response.ok && data.isMinister === true;
}

function syncStoredMinisterMode(isMinister: boolean) {
  if (isMinister) {
    window.localStorage.setItem(roleStorageKey, "minister");
  } else {
    window.localStorage.removeItem(roleStorageKey);
  }
}

export default function PerformancePage() {
  const [performanceGroups, setPerformanceGroups] = useState<
    PerformanceGroup[]
  >([]);
  const [recordsBySection, setRecordsBySection] = useState<
    Record<string, PerformanceRecord[]>
  >({});
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({});
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isMemberAddOpen, setIsMemberAddOpen] = useState(false);
  const [memberAddError, setMemberAddError] = useState("");
  const [focusMemberId, setFocusMemberId] = useState<string | null>(null);
  const [emptyPageGrade, setEmptyPageGrade] = useState("");
  const [isMemberDeleteOpen, setIsMemberDeleteOpen] = useState(false);
  const [memberDeleteTarget, setMemberDeleteTarget] = useState<{
    sectionId: string;
    record: PerformanceRecord;
  } | null>(null);
  const [memberDeleteError, setMemberDeleteError] = useState("");
  const [isDeletingMember, setIsDeletingMember] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedDirectoryIds, setExpandedDirectoryIds] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [taskModal, setTaskModal] = useState<TaskModal | null>(null);
  const [isMinisterMode, setIsMinisterMode] = useState(false);
  const [isLocalTestMode, setIsLocalTestMode] = useState(false);
  const [contextMenuTarget, setContextMenuTarget] =
    useState<DirectoryTarget | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createParentKey, setCreateParentKey] = useState("root");
  const [newNodeTitle, setNewNodeTitle] = useState("");
  const [createNodeAsPage, setCreateNodeAsPage] = useState(true);
  const [createNodeError, setCreateNodeError] = useState("");
  const [moveTarget, setMoveTarget] = useState<DirectoryTarget | null>(null);
  const [moveParentKey, setMoveParentKey] = useState("");
  const [moveNodeError, setMoveNodeError] = useState("");
  const [renameTarget, setRenameTarget] = useState<DirectoryTarget | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameError, setRenameError] = useState("");
  const [draggingDirectory, setDraggingDirectory] =
    useState<DirectoryTarget | null>(null);
  const [dragOverDropZone, setDragOverDropZone] =
    useState<DirectoryDropZone | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DirectoryTarget | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [directoryError, setDirectoryError] = useState("");
  const [recordsError, setRecordsError] = useState("");
  const [loadingSectionId, setLoadingSectionId] = useState<string | null>(null);
  const [savingRecordIds, setSavingRecordIds] = useState<string[]>([]);
  const [isCreatingNode, setIsCreatingNode] = useState(false);
  const [isMovingNode, setIsMovingNode] = useState(false);
  const [isRenamingDirectory, setIsRenamingDirectory] = useState(false);
  const [isDeletingDirectories, setIsDeletingDirectories] = useState(false);
  const ignoreClickAfterDrag = useRef(false);
  const memberNameInputRefs = useRef(new Map<string, HTMLInputElement>());
  const renameInteraction = useRef<"save" | "cancel" | null>(null);

  const selectedSectionId =
    selectedItem?.level === "child" && selectedItem.kind === "page"
      ? selectedItem.id
      : null;

  const selectedRecords = useMemo(() => {
    return selectedSectionId ? recordsBySection[selectedSectionId] ?? [] : [];
  }, [recordsBySection, selectedSectionId]);

  useEffect(() => {
    if (!focusMemberId) {
      return;
    }

    const input = memberNameInputRefs.current.get(focusMemberId);

    if (input) {
      input.focus();
      setFocusMemberId(null);
    }
  }, [focusMemberId, recordsBySection]);

  useEffect(() => {
    async function loadPerformanceGroups() {
      setIsLoadingGroups(true);
      setDirectoryError("");

      try {
        const response = await fetch("/api/performance-groups");
        const data = (await response.json()) as {
          groups?: unknown;
          message?: string;
          localTestMode?: unknown;
        };

        if (!response.ok || !isPerformanceGroups(data.groups)) {
          throw new Error(data.message ?? "绩效目录读取失败");
        }

        setPerformanceGroups(data.groups);
        setIsLocalTestMode(data.localTestMode === true);
      } catch (error) {
        setDirectoryError(getErrorMessage(error, "绩效目录读取失败"));
      } finally {
        setIsLoadingGroups(false);
      }
    }

    void loadPerformanceGroups();
  }, []);

  useEffect(() => {
    const sectionId = selectedSectionId;

    if (!sectionId || recordsBySection[sectionId]) {
      return;
    }

    const controller = new AbortController();

    async function loadPerformanceRecords(sectionIdToLoad: string) {
      setLoadingSectionId(sectionIdToLoad);
      setRecordsError("");

      try {
        const response = await fetch(
          `/api/performance-records?sectionId=${encodeURIComponent(
            sectionIdToLoad,
          )}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as {
          records?: unknown;
          message?: string;
        };

        const records = data.records;

        if (!response.ok || !isPerformanceRecords(records)) {
          throw new Error(data.message ?? "绩效页面内容读取失败");
        }

        setRecordsBySection((current) => ({
          ...current,
          [sectionIdToLoad]: records,
        }));
      } catch (error) {
        if (!controller.signal.aborted) {
          setRecordsError(getErrorMessage(error, "绩效页面内容读取失败"));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSectionId(null);
        }
      }
    }

    void loadPerformanceRecords(sectionId);

    return () => controller.abort();
  }, [recordsBySection, selectedSectionId]);

  useEffect(() => {
    if (!contextMenuTarget) {
      return;
    }

    function closeContextMenu() {
      setContextMenuTarget(null);
    }

    function handleContextMenuKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    }

    document.addEventListener("click", closeContextMenu);
    document.addEventListener("keydown", handleContextMenuKeyDown);

    return () => {
      document.removeEventListener("click", closeContextMenu);
      document.removeEventListener("keydown", handleContextMenuKeyDown);
    };
  }, [contextMenuTarget]);

  useEffect(() => {
    let isMounted = true;

    async function refreshMinisterMode() {
      try {
        const verifiedMinisterMode = await getVerifiedMinisterMode();

        if (!isMounted) {
          return;
        }

        setIsMinisterMode(verifiedMinisterMode);
        syncStoredMinisterMode(verifiedMinisterMode);

        if (!verifiedMinisterMode) {
          setContextMenuTarget(null);
          setIsCreateModalOpen(false);
          setIsMemberAddOpen(false);
          setIsMemberDeleteOpen(false);
          setMemberDeleteTarget(null);
          setDeleteTarget(null);
          setIsDeleteConfirmOpen(false);
          setRenameTarget(null);
          setDraggingDirectory(null);
          setDragOverDropZone(null);
        }
      } catch {
        if (!isMounted) {
          return;
        }

        setIsMinisterMode(false);
        syncStoredMinisterMode(false);
        setContextMenuTarget(null);
        setIsCreateModalOpen(false);
        setIsMemberAddOpen(false);
        setIsMemberDeleteOpen(false);
        setMemberDeleteTarget(null);
        setDeleteTarget(null);
        setIsDeleteConfirmOpen(false);
        setRenameTarget(null);
        setDraggingDirectory(null);
        setDragOverDropZone(null);
      }
    }

    function handleRoleChange() {
      void refreshMinisterMode();
    }

    void refreshMinisterMode();
    window.addEventListener("storage", handleRoleChange);
    window.addEventListener("eic-role-updated", handleRoleChange);

    return () => {
      isMounted = false;
      window.removeEventListener("storage", handleRoleChange);
      window.removeEventListener("eic-role-updated", handleRoleChange);
    };
  }, []);

  function getItemClassName(isSelected: boolean) {
    return `w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
      isSelected
        ? "bg-[#a6dff1] text-slate-900 shadow-sm"
        : "text-slate-700 hover:bg-sky-100"
    }`;
  }

  function getDirectoryItemClassName(
    isSelected: boolean,
    target: DirectoryTarget,
  ) {
    const canDrag = isMinisterMode && (target.type === "year" || !target.parentSectionId);
    const isDragging =
      draggingDirectory?.type === target.type && draggingDirectory.id === target.id;

    return `${getItemClassName(isSelected)} ${
      canDrag ? "cursor-grab active:cursor-grabbing" : ""
    } ${isDragging ? "opacity-60" : ""}`;
  }

  function toggleGroup(group: PerformanceGroup) {
    setExpandedGroup((current) => (current === group.id ? null : group.id));
    setSelectedItem({
      id: group.id,
      title: group.title,
      level: "group",
      kind: "directory",
    });
  }

  function openDirectoryContextMenu(
    event: MouseEvent<HTMLButtonElement>,
    target: DirectoryTarget,
  ) {
    if (!isMinisterMode) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setContextMenuTarget(target);
  }

  function openRenameModal(target: DirectoryTarget) {
    setContextMenuTarget(null);
    setRenameTarget(target);
    setRenameTitle(target.title);
    setRenameError("");
    renameInteraction.current = null;
  }

  function renderDirectoryTitle(target: DirectoryTarget, title: string) {
    const isEditing =
      renameTarget?.type === target.type && renameTarget.id === target.id;

    if (!isEditing) {
      return <span>{title}</span>;
    }

    return (
      <input
        autoFocus
        aria-label={`重命名${title}`}
        aria-invalid={Boolean(renameError)}
        title={renameError || undefined}
        className="min-w-0 flex-1 rounded border border-[#159fda] bg-white px-2 py-0.5 text-sm font-medium text-slate-900 outline-none ring-2 ring-sky-100"
        value={renameTitle}
        onChange={(event) => setRenameTitle(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            renameInteraction.current = "save";
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            renameInteraction.current = "cancel";
            closeRenameModal();
          }
        }}
        onBlur={() => {
          if (renameInteraction.current === "cancel") {
            renameInteraction.current = null;
            return;
          }

          if (!isRenamingDirectory) {
            renameInteraction.current = "save";
            void renameDirectory();
          }
        }}
      />
    );
  }

  function getCreateParentKey(target: DirectoryTarget | null) {
    if (!target) {
      return "root";
    }

    if (target.type === "year") {
      return `year:${target.id}`;
    }

    if (target.kind === "directory") {
      return `section:${target.id}`;
    }

    return target.parentSectionId
      ? `section:${target.parentSectionId}`
      : `year:${target.parentGroupId ?? ""}`;
  }

  function openCreateModal(target: DirectoryTarget | null) {
    const parentKey = getCreateParentKey(target);

    setContextMenuTarget(null);
    setIsCreateModalOpen(true);
    setCreateParentKey(parentKey);
    setNewNodeTitle("");
    setCreateNodeAsPage(parentKey !== "root");
    setCreateNodeError("");
  }

  function getMoveDirectoryOptions(target: DirectoryTarget) {
    const excludedIds = new Set<string>([target.id]);
    const collectDescendantIds = (nodes: PerformanceChild[]) => {
      nodes.forEach((node) => {
        excludedIds.add(node.id);
        collectDescendantIds(node.children);
      });
    };

    if (target.kind === "directory") {
      const collectTargetDescendants = (nodes: PerformanceChild[]): boolean => {
        for (const node of nodes) {
          if (node.id === target.id) {
            collectDescendantIds(node.children);
            return true;
          }
          if (node.kind === "directory" && collectTargetDescendants(node.children)) {
            return true;
          }
        }
        return false;
      };

      performanceGroups.some((group) => collectTargetDescendants(group.children));
    }

    return getCreateDirectoryOptions().filter(
      (option) =>
        option.type !== "root" &&
        (option.type === "year" || !excludedIds.has(option.id ?? "")),
    );
  }

  function openMoveModal(target: DirectoryTarget) {
    if (target.type !== "section") {
      return;
    }

    const parentKey = target.parentSectionId
      ? `section:${target.parentSectionId}`
      : `year:${target.parentGroupId ?? ""}`;
    const options = getMoveDirectoryOptions(target);

    setContextMenuTarget(null);
    setMoveTarget(target);
    setMoveParentKey(
      options.some((option) => option.key === parentKey)
        ? parentKey
        : options[0]?.key ?? "",
    );
    setMoveNodeError("");
  }

  function closeMoveModal() {
    if (isMovingNode) {
      return;
    }

    setMoveTarget(null);
    setMoveParentKey("");
    setMoveNodeError("");
  }

  function closeCreateModal() {
    if (isCreatingNode) {
      return;
    }

    setIsCreateModalOpen(false);
    setNewNodeTitle("");
    setCreateNodeError("");
  }

  function openDeleteConfirmation(target: DirectoryTarget) {
    setContextMenuTarget(null);
    setDeleteTarget(target);
    setIsDeleteConfirmOpen(true);
    setDirectoryError("");
    setRecordsError("");
  }

  function closeRenameModal() {
    if (isRenamingDirectory) {
      return;
    }

    setRenameTarget(null);
    setRenameTitle("");
    setRenameError("");
  }

  function closeDeleteConfirmation() {
    setIsDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  function updateRecordInState(sectionId: string, updatedRecord: PerformanceRecord) {
    setRecordsBySection((current) => ({
      ...current,
      [sectionId]: (current[sectionId] ?? []).map((record) =>
        record.id === updatedRecord.id ? updatedRecord : record,
      ),
    }));
  }

  function updateRecordField(
    sectionId: string,
    memberId: string,
    field: "memberName" | "studentId" | "currentScore",
    value: string,
  ) {
    setRecordsBySection((current) => ({
      ...current,
      [sectionId]: (current[sectionId] ?? []).map((record) =>
        record.id === memberId ? { ...record, [field]: value } : record,
      ),
    }));
  }

  function getGradeDraftKey(sectionId: string, grade: string) {
    return `${sectionId}:${grade}`;
  }

  async function saveGradeGroup(
    sectionId: string,
    grade: string,
    memberIds: string[],
  ) {
    const draftKey = getGradeDraftKey(sectionId, grade);
    const nextGrade = (gradeDrafts[draftKey] ?? grade).trim();

    if (!memberIds.length || nextGrade === grade) {
      setGradeDrafts((current) => {
        const next = { ...current };
        delete next[draftKey];
        return next;
      });
      return;
    }

    if (!nextGrade) {
      setGradeDrafts((current) => ({ ...current, [draftKey]: grade }));
      return;
    }

    setSavingRecordIds((current) => [...new Set([...current, ...memberIds])]);
    setRecordsError("");

    try {
      const response = await fetch("/api/performance-records", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds, grade: nextGrade }),
      });
      const data = (await response.json()) as {
        records?: unknown;
        message?: string;
      };
      const updatedRecords = data.records;

      if (response.status === 401) {
        clearMinisterModeAfterAuthFailure();
      }

      if (!response.ok || !isPerformanceRecords(updatedRecords)) {
        throw new Error(
          response.status === 401
            ? "部长身份已失效，请回到首页重新输入权限码"
            : data.message ?? "年级保存失败",
        );
      }

      setRecordsBySection((current) => ({
        ...current,
        [sectionId]: updatedRecords,
      }));
      setGradeDrafts((current) => {
        const next = { ...current };
        delete next[draftKey];
        return next;
      });
    } catch (error) {
      setRecordsError(getErrorMessage(error, "年级保存失败"));
    } finally {
      setSavingRecordIds((current) =>
        current.filter((memberId) => !memberIds.includes(memberId)),
      );
    }
  }

  function clearMinisterModeAfterAuthFailure() {
    setIsMinisterMode(false);
    setContextMenuTarget(null);
    setIsCreateModalOpen(false);
    setIsMemberAddOpen(false);
    setIsMemberDeleteOpen(false);
    setMemberDeleteTarget(null);
    setDeleteTarget(null);
    setIsDeleteConfirmOpen(false);
    setRenameTarget(null);
    setDraggingDirectory(null);
    setDragOverDropZone(null);
    syncStoredMinisterMode(false);
    window.dispatchEvent(new Event("eic-role-updated"));
  }

  function isSameDropZone(
    firstZone: DirectoryDropZone | null,
    secondZone: DirectoryDropZone,
  ) {
    return (
      !!firstZone &&
      firstZone.type === secondZone.type &&
      firstZone.parentGroupId === secondZone.parentGroupId &&
      firstZone.index === secondZone.index
    );
  }

  function canDropOnZone(
    source: DirectoryTarget | null,
    zone: DirectoryDropZone,
  ) {
    if (!source || source.type !== zone.type) {
      return false;
    }

    if (source.type === "year") {
      return true;
    }

    return source.parentGroupId === zone.parentGroupId;
  }

  function reorderIds(
    ids: string[],
    draggedId: string,
    dropIndex: number,
  ) {
    const draggedIndex = ids.indexOf(draggedId);

    if (draggedIndex === -1) {
      return ids;
    }

    const filteredIds = ids.filter((id) => id !== draggedId);
    const adjustedIndex = draggedIndex < dropIndex ? dropIndex - 1 : dropIndex;
    const insertIndex = Math.min(Math.max(adjustedIndex, 0), filteredIds.length);

    return [
      ...filteredIds.slice(0, insertIndex),
      draggedId,
      ...filteredIds.slice(insertIndex),
    ];
  }

  function areIdsEqual(firstIds: string[], secondIds: string[]) {
    return (
      firstIds.length === secondIds.length &&
      firstIds.every((id, index) => id === secondIds[index])
    );
  }

  function getReorderedGroups(
    source: DirectoryTarget,
    dropZone: DirectoryDropZone,
  ) {
    if (!canDropOnZone(source, dropZone)) {
      return null;
    }

    if (source.type === "year") {
      const currentIds = performanceGroups.map((group) => group.id);
      const orderedIds = reorderIds(
        currentIds,
        source.id,
        dropZone.index,
      );

      if (areIdsEqual(currentIds, orderedIds)) {
        return null;
      }

      const reorderedGroups = orderedIds
        .map((id) => performanceGroups.find((group) => group.id === id))
        .filter((group): group is PerformanceGroup => Boolean(group));

      return { groups: reorderedGroups, orderedIds };
    }

    let orderedIds: string[] = [];
    const reorderedGroups = performanceGroups.map((group) => {
      if (group.id !== source.parentGroupId) {
        return group;
      }

      const currentIds = group.children.map((child) => child.id);
      orderedIds = reorderIds(
        currentIds,
        source.id,
        dropZone.index,
      );

      if (areIdsEqual(currentIds, orderedIds)) {
        return group;
      }

      return {
        ...group,
        children: orderedIds
          .map((id) => group.children.find((child) => child.id === id))
          .filter((child): child is PerformanceChild => Boolean(child)),
      };
    });

    if (orderedIds.length === 0) {
      return null;
    }

    return { groups: reorderedGroups, orderedIds };
  }

  function handleDirectoryDragStart(
    event: DragEvent<HTMLButtonElement>,
    target: DirectoryTarget,
  ) {
    if (!isMinisterMode) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", target.id);
    setDraggingDirectory(target);
    setDragOverDropZone(null);
  }

  function handleDropZoneDragOver(
    event: DragEvent<HTMLElement>,
    dropZone: DirectoryDropZone,
  ) {
    if (!canDropOnZone(draggingDirectory, dropZone)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverDropZone((current) =>
      isSameDropZone(current, dropZone) ? current : dropZone,
    );
  }

  function handleDirectoryRowDragOver(
    event: DragEvent<HTMLButtonElement>,
    target: DirectoryTarget,
    index: number,
  ) {
    const row = event.currentTarget.getBoundingClientRect();
    const dropZone: DirectoryDropZone =
      target.type === "year"
        ? {
            type: "year",
            index: index + (event.clientY >= row.top + row.height / 2 ? 1 : 0),
          }
        : {
            type: "section",
            parentGroupId: target.parentGroupId,
            index: index + (event.clientY >= row.top + row.height / 2 ? 1 : 0),
          };

    handleDropZoneDragOver(event, dropZone);
  }

  function handleDirectoryRowDrop(
    event: DragEvent<HTMLButtonElement>,
    target: DirectoryTarget,
    index: number,
  ) {
    const row = event.currentTarget.getBoundingClientRect();
    const dropZone: DirectoryDropZone =
      target.type === "year"
        ? {
            type: "year",
            index: index + (event.clientY >= row.top + row.height / 2 ? 1 : 0),
          }
        : {
            type: "section",
            parentGroupId: target.parentGroupId,
            index: index + (event.clientY >= row.top + row.height / 2 ? 1 : 0),
          };

    handleDirectoryDrop(event, dropZone);
  }

  function finishDirectoryDrag() {
    ignoreClickAfterDrag.current = true;
    setDraggingDirectory(null);
    setDragOverDropZone(null);
  }

  function shouldIgnoreClickAfterDrag() {
    if (!ignoreClickAfterDrag.current) {
      return false;
    }

    ignoreClickAfterDrag.current = false;
    return true;
  }

  async function renameDirectory() {
    const target = renameTarget;
    const title = renameTitle.trim();

    if (!target) {
      return;
    }

    if (!title) {
      setRenameError("请输入新的目录名称");
      return;
    }

    setIsRenamingDirectory(true);
    setRenameError("");
    setDirectoryError("");

    try {
      const response = await fetch("/api/performance-groups", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "rename",
          targetType: target.type,
          id: target.id,
          title,
        }),
      });
      const data = (await response.json()) as {
        groups?: unknown;
        message?: string;
      };

      if (response.status === 401) {
        clearMinisterModeAfterAuthFailure();
      }

      if (!response.ok || !isPerformanceGroups(data.groups)) {
        throw new Error(
          response.status === 401
            ? "部长身份已失效，请回到首页重新输入权限码"
            : data.message ?? "重命名失败",
        );
      }

      setPerformanceGroups(data.groups);

      if (selectedItem?.id === target.id) {
        setSelectedItem({
          ...selectedItem,
          title,
        });
      }

      setRenameTarget(null);
      setRenameTitle("");
    } catch (error) {
      setRenameError(getErrorMessage(error, "重命名失败"));
    } finally {
      setIsRenamingDirectory(false);
    }
  }

  async function reorderDirectory(
    source: DirectoryTarget,
    dropZone: DirectoryDropZone,
  ) {
    const reordered = getReorderedGroups(source, dropZone);

    if (!reordered) {
      finishDirectoryDrag();
      return;
    }

    const previousGroups = performanceGroups;

    setPerformanceGroups(reordered.groups);
    setDirectoryError("");

    try {
      const response = await fetch("/api/performance-groups", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "reorder",
          targetType: source.type,
          parentGroupId: source.parentGroupId,
          orderedIds: reordered.orderedIds,
        }),
      });
      const data = (await response.json()) as {
        groups?: unknown;
        message?: string;
      };

      if (response.status === 401) {
        clearMinisterModeAfterAuthFailure();
      }

      if (!response.ok || !isPerformanceGroups(data.groups)) {
        throw new Error(
          response.status === 401
            ? "部长身份已失效，请回到首页重新输入权限码"
            : data.message ?? "排序保存失败",
        );
      }

      setPerformanceGroups(data.groups);
    } catch (error) {
      setPerformanceGroups(previousGroups);
      setDirectoryError(getErrorMessage(error, "排序保存失败"));
    } finally {
      finishDirectoryDrag();
    }
  }

  function handleDirectoryDrop(
    event: DragEvent<HTMLElement>,
    dropZone: DirectoryDropZone,
  ) {
    const source = draggingDirectory;

    if (!source || !canDropOnZone(source, dropZone)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    void reorderDirectory(source, dropZone);
  }

  function findDirectoryTarget(
    groups: PerformanceGroup[],
    targetId: string,
  ): DirectoryTarget | null {
    for (const group of groups) {
      if (group.id === targetId) {
        return {
          type: "year",
          id: group.id,
          title: group.title,
          kind: "directory",
        };
      }

      const findNode = (
        nodes: PerformanceChild[],
        parentGroupId: string,
        parentSectionId?: string,
      ): DirectoryTarget | null => {
        for (const node of nodes) {
          if (node.id === targetId) {
            return {
              type: "section",
              id: node.id,
              title: node.title,
              kind: node.kind,
              parentGroupId,
              parentSectionId,
            };
          }

          if (node.kind === "directory") {
            const result = findNode(node.children, parentGroupId, node.id);

            if (result) {
              return result;
            }
          }
        }

        return null;
      };

      const result = findNode(group.children, group.id);

      if (result) {
        return result;
      }
    }

    return null;
  }

  function getDirectoryAncestorPath(
    groups: PerformanceGroup[],
    targetId: string,
  ) {
    for (const group of groups) {
      const findPath = (
        nodes: PerformanceChild[],
        ancestors: string[],
      ): string[] | null => {
        for (const node of nodes) {
          if (node.id === targetId) {
            return ancestors;
          }

          if (node.kind === "directory") {
            const path = findPath(node.children, [...ancestors, node.id]);

            if (path) {
              return path;
            }
          }
        }

        return null;
      };

      const path = findPath(group.children, []);

      if (path) {
        return { yearId: group.id, directoryIds: path };
      }
    }

    return null;
  }

  function getCreateDirectoryOptions() {
    const options: Array<{
      key: string;
      label: string;
      type: "year" | "section" | "root";
      id?: string;
      depth: number;
    }> = [{ key: "root", label: "根目录（新增年度目录）", type: "root", depth: 0 }];

    const addNodes = (nodes: PerformanceChild[], depth: number) => {
      nodes.forEach((node) => {
        if (node.kind !== "directory") {
          return;
        }

        options.push({
          key: `section:${node.id}`,
          label: node.title,
          type: "section",
          id: node.id,
          depth,
        });
        addNodes(node.children, depth + 1);
      });
    };

    performanceGroups.forEach((group) => {
      options.push({
        key: `year:${group.id}`,
        label: group.title,
        type: "year",
        id: group.id,
        depth: 0,
      });
      addNodes(group.children, 1);
    });

    return options;
  }

  async function createDirectoryNode() {
    const title = newNodeTitle.trim();
    const selectedOption = getCreateDirectoryOptions().find(
      (option) => option.key === createParentKey,
    );

    if (!title) {
      setCreateNodeError("请输入名称");
      return;
    }

    if (!selectedOption) {
      setCreateNodeError("请选择新增位置");
      return;
    }

    if (selectedOption.type === "root" && createNodeAsPage) {
      setCreateNodeError("绩效页面必须放在一个目录下");
      return;
    }

    setIsCreatingNode(true);
    setCreateNodeError("");
    setDirectoryError("");

    try {
      const response = await fetch("/api/performance-groups", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          parentType: selectedOption.type === "root" ? "" : selectedOption.type,
          parentId: selectedOption.id ?? "",
          isPerformancePage: createNodeAsPage,
        }),
      });
      const data = (await response.json()) as {
        groups?: unknown;
        created?: { id?: unknown; kind?: unknown; parentGroupId?: unknown };
        message?: string;
      };

      if (response.status === 401) {
        clearMinisterModeAfterAuthFailure();
      }

      if (!response.ok || !isPerformanceGroups(data.groups)) {
        throw new Error(
          response.status === 401
            ? "部长身份已失效，请回到首页重新输入权限码"
            : data.message ?? "新增目录失败",
        );
      }

      setPerformanceGroups(data.groups);
      setRecordsBySection({});

      const createdId = typeof data.created?.id === "string" ? data.created.id : "";
      const createdTarget = createdId
        ? findDirectoryTarget(data.groups, createdId)
        : null;

      if (createdTarget) {
        if (createdTarget.type === "year") {
          setExpandedGroup(createdTarget.id);
        } else {
          const path = getDirectoryAncestorPath(
            data.groups,
            createdTarget.id,
          );
          const newDirectoryIds = [
            ...(path?.directoryIds ?? []),
            ...(createdTarget.kind === "directory" ? [createdTarget.id] : []),
          ];

          if (path) {
            setExpandedGroup(path.yearId);
          }
          setExpandedDirectoryIds((current) =>
            [...new Set([...current, ...newDirectoryIds])],
          );
        }

        setSelectedItem({
          id: createdTarget.id,
          title: createdTarget.title,
          level: createdTarget.type === "year" ? "group" : "child",
          kind: createdTarget.kind,
        });
      }

      closeCreateModal();
    } catch (error) {
      setCreateNodeError(getErrorMessage(error, "新增目录失败"));
    } finally {
      setIsCreatingNode(false);
    }
  }

  async function moveDirectoryNode() {
    if (!moveTarget || moveTarget.type !== "section") {
      return;
    }

    const selectedOption = getMoveDirectoryOptions(moveTarget).find(
      (option) => option.key === moveParentKey,
    );

    if (!selectedOption) {
      setMoveNodeError("请选择移动位置");
      return;
    }

    setIsMovingNode(true);
    setMoveNodeError("");
    setDirectoryError("");

    try {
      const response = await fetch("/api/performance-groups", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move",
          targetType: "section",
          id: moveTarget.id,
          parentType: selectedOption.type,
          parentId: selectedOption.id,
        }),
      });
      const data = (await response.json()) as {
        groups?: unknown;
        message?: string;
      };

      if (response.status === 401) {
        clearMinisterModeAfterAuthFailure();
      }

      if (!response.ok || !isPerformanceGroups(data.groups)) {
        throw new Error(
          response.status === 401
            ? "部长身份已失效，请回到首页重新输入权限码"
            : data.message ?? "移动失败",
        );
      }

      setPerformanceGroups(data.groups);
      const movedTarget = findDirectoryTarget(data.groups, moveTarget.id);
      const movedPath = getDirectoryAncestorPath(data.groups, moveTarget.id);

      if (movedPath) {
        setExpandedGroup(movedPath.yearId);
        setExpandedDirectoryIds((current) =>
          [...new Set([...current, ...movedPath.directoryIds])],
        );
      }

      if (movedTarget) {
        setSelectedItem({
          id: movedTarget.id,
          title: movedTarget.title,
          level: "child",
          kind: movedTarget.kind,
        });
      }

      closeMoveModal();
    } catch (error) {
      setMoveNodeError(getErrorMessage(error, "移动失败"));
    } finally {
      setIsMovingNode(false);
    }
  }

  async function addMemberRecord(
    sectionId: string,
    grade: string,
  ) {
    const normalizedGrade = grade.trim();

    if (!normalizedGrade) {
      setMemberAddError("请输入年级");
      return;
    }

    if (isAddingMember) {
      return;
    }

    setIsAddingMember(true);
    setRecordsError("");

    try {
      const response = await fetch("/api/performance-records", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          grade: normalizedGrade,
        }),
      });
      const data = (await response.json()) as {
        memberId?: unknown;
        records?: unknown;
        message?: string;
      };

      if (response.status === 401) {
        clearMinisterModeAfterAuthFailure();
      }

      if (
        !response.ok ||
        typeof data.memberId !== "string" ||
        !isPerformanceRecords(data.records)
      ) {
        throw new Error(
          response.status === 401
            ? "部长身份已失效，请回到首页重新输入权限码"
            : data.message ?? "添加成员失败",
        );
      }

      setRecordsBySection((current) => ({
        ...current,
        [sectionId]: data.records as PerformanceRecord[],
      }));
      setFocusMemberId(data.memberId);
      setEmptyPageGrade("");
      setIsMemberAddOpen(false);
    } catch (error) {
      setMemberAddError(getErrorMessage(error, "添加成员失败"));
    } finally {
      setIsAddingMember(false);
    }
  }

  function getMemberGrades() {
    return [...new Set(selectedRecords.map((record) => record.grade.trim()).filter(Boolean))];
  }

  function openMemberAddDialog() {
    const grades = getMemberGrades();
    setEmptyPageGrade((current) =>
      grades.includes(current) ? current : grades[0] ?? current,
    );
    setMemberAddError("");
    setIsMemberAddOpen(true);
  }

  function confirmAddMember() {
    if (!selectedSectionId) {
      return;
    }

    void addMemberRecord(selectedSectionId, emptyPageGrade);
  }

  function openMemberDeleteDialog() {
    if (!selectedSectionId || selectedRecords.length === 0) {
      return;
    }

    setMemberDeleteTarget({
      sectionId: selectedSectionId,
      record: selectedRecords[0],
    });
    setMemberDeleteError("");
    setIsMemberDeleteOpen(true);
  }

  async function deleteMemberRecord() {
    if (!memberDeleteTarget) {
      return;
    }

    const { sectionId, record } = memberDeleteTarget;
    setIsDeletingMember(true);
    setMemberDeleteError("");

    try {
      const response = await fetch("/api/performance-records", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: record.id }),
      });
      const data = (await response.json()) as {
        records?: unknown;
        message?: string;
      };

      if (response.status === 401) {
        clearMinisterModeAfterAuthFailure();
      }

      if (!response.ok || !isPerformanceRecords(data.records)) {
        throw new Error(
          response.status === 401
            ? "部长身份已失效，请回到首页重新输入权限码"
            : data.message ?? "删除成员失败",
        );
      }

      setRecordsBySection((current) => ({
        ...current,
        [sectionId]: data.records as PerformanceRecord[],
      }));
      if (data.records.length === 0) {
        setEmptyPageGrade(record.grade);
      }
      setMemberDeleteTarget(null);
      setIsMemberDeleteOpen(false);
    } catch (error) {
      setMemberDeleteError(getErrorMessage(error, "删除成员失败"));
    } finally {
      setIsDeletingMember(false);
    }
  }

  async function saveMemberRecord(sectionId: string, memberId: string) {
    const record = recordsBySection[sectionId]?.find(
      (item) => item.id === memberId,
    );

    if (!record || savingRecordIds.includes(memberId)) {
      return;
    }

    setSavingRecordIds((current) => [...current, memberId]);
    setRecordsError("");

    try {
      const response = await fetch("/api/performance-records", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memberId,
          memberName: record.memberName,
          studentId: record.studentId,
          currentScore: record.currentScore,
        }),
      });
      const data = (await response.json()) as {
        record?: unknown;
        message?: string;
      };

      if (response.status === 401) {
        clearMinisterModeAfterAuthFailure();
      }

      if (!response.ok || !isPerformanceRecord(data.record)) {
        throw new Error(
          response.status === 401
            ? "部长身份已失效，请回到首页重新输入权限码"
            : data.message ?? "保存失败",
        );
      }

      updateRecordInState(sectionId, data.record);
    } catch (error) {
      setRecordsError(getErrorMessage(error, "保存失败"));
    } finally {
      setSavingRecordIds((current) => current.filter((id) => id !== memberId));
    }
  }

  async function saveTaskModal() {
    if (!taskModal) {
      return;
    }

    const currentModal = taskModal;

    setTaskModal({ ...currentModal, isSaving: true, error: "" });

    try {
      const response = await fetch("/api/performance-records", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memberId: currentModal.memberId,
          tasks: currentModal.tasks,
        }),
      });
      const data = (await response.json()) as {
        record?: unknown;
        message?: string;
      };

      if (response.status === 401) {
        clearMinisterModeAfterAuthFailure();
      }

      if (!response.ok || !isPerformanceRecord(data.record)) {
        throw new Error(
          response.status === 401
            ? "部长身份已失效，请回到首页重新输入权限码"
            : data.message ?? "任务保存失败",
        );
      }

      updateRecordInState(currentModal.sectionId, data.record);
      setTaskModal({
        ...currentModal,
        tasks: data.record.tasks.map((task) => task.title),
        isSaving: false,
        error: "",
      });
    } catch (error) {
      setTaskModal({
        ...currentModal,
        isSaving: false,
        error: getErrorMessage(error, "任务保存失败"),
      });
    }
  }

  async function confirmDeleteDirectories() {
    const target = deleteTarget;

    if (!target) {
      return;
    }

    const groupIds = target.type === "year" ? [target.id] : [];
    const sectionIds = target.type === "section" ? [target.id] : [];

    const deletedItemIds = new Set<string>(groupIds);
    const deletedSectionIds = new Set<string>();
    const collectDeletedNodes = (nodes: PerformanceChild[]) => {
      nodes.forEach((node) => {
        deletedItemIds.add(node.id);
        deletedSectionIds.add(node.id);
        collectDeletedNodes(node.children);
      });
    };

    performanceGroups.forEach((group) => {
      if (groupIds.includes(group.id)) {
        collectDeletedNodes(group.children);
        return;
      }

      const findAndCollect = (nodes: PerformanceChild[]): boolean => {
        for (const node of nodes) {
          if (sectionIds.includes(node.id)) {
            collectDeletedNodes([node]);
            return true;
          }
          if (findAndCollect(node.children)) {
            return true;
          }
        }
        return false;
      };

      findAndCollect(group.children);
    });

    setIsDeletingDirectories(true);
    setDirectoryError("");

    try {
      const response = await fetch("/api/performance-groups", {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ groupIds, sectionIds }),
      });
      const data = (await response.json()) as {
        groups?: unknown;
        message?: string;
      };

      if (response.status === 401) {
        clearMinisterModeAfterAuthFailure();
      }

      if (!response.ok || !isPerformanceGroups(data.groups)) {
        throw new Error(
          response.status === 401
            ? "部长身份已失效，请回到首页重新输入权限码"
            : data.message ?? "目录删除失败",
        );
      }

      setPerformanceGroups(data.groups);
      setRecordsBySection((current) => {
        const nextRecords = { ...current };
        deletedSectionIds.forEach((sectionId) => {
          delete nextRecords[sectionId];
        });
        return nextRecords;
      });

      if (selectedItem && deletedItemIds.has(selectedItem.id)) {
        setSelectedItem(null);
      }

      if (expandedGroup && groupIds.includes(expandedGroup)) {
        setExpandedGroup(null);
      }
      setExpandedDirectoryIds((current) =>
        current.filter((id) => !deletedSectionIds.has(id)),
      );

      closeDeleteConfirmation();
    } catch (error) {
      setDirectoryError(getErrorMessage(error, "目录删除失败"));
      setIsDeleteConfirmOpen(false);
    } finally {
      setIsDeletingDirectories(false);
    }
  }

  function renderDirectoryContextMenu(target: DirectoryTarget) {
    return (
      <div
        className="performance-directory-context-menu"
        role="menu"
        aria-label={`${target.title}目录操作`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="performance-directory-context-menu-item"
          type="button"
          role="menuitem"
          onClick={() => openRenameModal(target)}
        >
          重命名
        </button>
        {target.type === "section" && (
          <button
            className="performance-directory-context-menu-item"
            type="button"
            role="menuitem"
            onClick={() => openMoveModal(target)}
          >
            移动
          </button>
        )}
        <button
          className="performance-directory-context-menu-item"
          type="button"
          role="menuitem"
          onClick={() => openCreateModal(target)}
        >
          新增
        </button>
        <button
          className="performance-directory-context-menu-item performance-directory-context-menu-item-danger"
          type="button"
          role="menuitem"
          onClick={() => openDeleteConfirmation(target)}
        >
          删除
        </button>
      </div>
    );
  }

  function renderDirectoryDropZone(dropZone: DirectoryDropZone) {
    const canDrop = canDropOnZone(draggingDirectory, dropZone);
    const isActive = canDrop && isSameDropZone(dragOverDropZone, dropZone);

    return (
      <div
        aria-hidden="true"
        className={`flex items-center transition-[height] duration-150 ease-out ${
          isActive ? "h-12" : canDrop ? "h-5" : "h-2"
        }`}
        onDragOver={(event) => handleDropZoneDragOver(event, dropZone)}
        onDragLeave={() => {
          if (isSameDropZone(dragOverDropZone, dropZone)) {
            setDragOverDropZone(null);
          }
        }}
        onDrop={(event) => handleDirectoryDrop(event, dropZone)}
      >
        {isActive ? (
          <div className="flex h-10 w-full items-center gap-2 rounded-lg border border-dashed border-[#159fda]/60 bg-sky-100/70 px-3 text-sm font-medium text-sky-800 opacity-75 shadow-[0_0_0_3px_rgba(21,159,218,0.08)]">
            <span aria-hidden="true" className="text-xs">
              {draggingDirectory?.kind === "directory" ? "▶" : "•"}
            </span>
            <span className="truncate">{draggingDirectory?.title}</span>
          </div>
        ) : (
          <div
            className={`h-0.5 w-full rounded-full transition ${
              canDrop
                ? "bg-sky-200 opacity-70"
                : "bg-transparent opacity-0"
            }`}
          />
        )}
      </div>
    );
  }

  function openTaskModal(record: PerformanceRecord, sectionId: string) {
    setTaskModal({
      memberId: record.id,
      sectionId,
      tasks:
        record.tasks.length > 0
          ? record.tasks.map((task) => task.title)
          : [""],
      isSaving: false,
      error: "",
    });
  }

  function getTaskModalOwner(modal: TaskModal) {
    const record = recordsBySection[modal.sectionId]?.find(
      (item) => item.id === modal.memberId,
    );

    if (!record) {
      return "成员";
    }

    return record.memberName.trim() || `${record.grade}成员`;
  }

  function renderEditableCell(
    sectionId: string,
    record: PerformanceRecord,
    field: "memberName" | "studentId" | "currentScore",
    label: string,
  ) {
    if (!isMinisterMode) {
      return record[field] || <span className="text-slate-300">待填写</span>;
    }

    return (
      <input
        ref={
          field === "memberName"
            ? (element) => {
                if (element) {
                  memberNameInputRefs.current.set(record.id, element);
                } else {
                  memberNameInputRefs.current.delete(record.id);
                }
              }
            : undefined
        }
        aria-label={label}
        className="h-full w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-center outline-none transition focus:border-[#159fda] focus:bg-white focus:ring-2 focus:ring-sky-100"
        value={record[field]}
        onChange={(event) =>
          updateRecordField(sectionId, record.id, field, event.target.value)
        }
        onBlur={() => void saveMemberRecord(sectionId, record.id)}
      />
    );
  }

  function renderEditableGrade(
    sectionId: string,
    gradeGroup: { grade: string; records: PerformanceRecord[] },
  ) {
    if (!isMinisterMode) {
      return gradeGroup.grade;
    }

    const draftKey = getGradeDraftKey(sectionId, gradeGroup.grade);

    return (
      <input
        aria-label="年级"
        className="h-full w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-center font-medium outline-none transition focus:border-[#159fda] focus:bg-white focus:ring-2 focus:ring-sky-100"
        value={gradeDrafts[draftKey] ?? gradeGroup.grade}
        onChange={(event) =>
          setGradeDrafts((current) => ({
            ...current,
            [draftKey]: event.target.value,
          }))
        }
        onBlur={() =>
          void saveGradeGroup(
            sectionId,
            gradeGroup.grade,
            gradeGroup.records.map((record) => record.id),
          )
        }
      />
    );
  }

  function renderPerformanceTable() {
    if (!selectedSectionId) {
      return null;
    }

    if (loadingSectionId === selectedSectionId) {
      return (
        <p className="mt-6 rounded-xl bg-white px-5 py-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
          正在读取当前页面内容...
        </p>
      );
    }

    if (recordsError) {
      return (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-600">
          {recordsError}
        </p>
      );
    }

    const recordsByGrade = selectedRecords.reduce<
      Array<{ grade: string; records: PerformanceRecord[] }>
    >((groups, record) => {
      const currentGroup = groups.find((group) => group.grade === record.grade);

      if (currentGroup) {
        currentGroup.records.push(record);
        return groups;
      }

      return [...groups, { grade: record.grade, records: [record] }];
    }, []);

    return (
      <div className="mt-6 overflow-hidden rounded-sm border border-slate-200 bg-white">
        <table className="w-full table-fixed border-collapse text-sm text-slate-950">
          <thead>
            <tr className="h-10 bg-white">
              <th className="border border-slate-200 px-4 text-center font-medium">
                年级
              </th>
              <th className="border border-slate-200 px-4 text-center font-medium">
                姓名
              </th>
              <th className="border border-slate-200 px-4 text-center font-medium">
                学号
              </th>
              <th className="border border-slate-200 px-4 text-center font-medium">
                当期绩效
              </th>
              <th className="border border-slate-200 px-4 text-center font-medium">
                任务一览
              </th>
            </tr>
          </thead>
          <tbody>
            {recordsByGrade.length === 0 && (
              <tr>
                <td colSpan={5} className="h-16 border border-slate-200 text-center text-sm text-slate-500">
                  当前页面暂无成员记录
                </td>
              </tr>
            )}
            {recordsByGrade.map((gradeGroup) => (
              <Fragment key={gradeGroup.grade}>
                {gradeGroup.records.map((record, rowIndex) => {
                  const isSaving = savingRecordIds.includes(record.id);

                  return (
                    <tr className="h-9" key={record.id}>
                      {rowIndex === 0 && (
                        <td
                          className="border border-slate-200 px-4 text-center align-middle font-medium"
                          rowSpan={gradeGroup.records.length}
                        >
                          {renderEditableGrade(selectedSectionId, gradeGroup)}
                        </td>
                      )}
                      <td className="border border-slate-200 text-center">
                        {renderEditableCell(
                          selectedSectionId,
                          record,
                          "memberName",
                          "姓名",
                        )}
                      </td>
                      <td className="border border-slate-200 text-center">
                        {renderEditableCell(
                          selectedSectionId,
                          record,
                          "studentId",
                          "学号",
                        )}
                      </td>
                      <td className="border border-slate-200 text-center">
                        {renderEditableCell(
                          selectedSectionId,
                          record,
                          "currentScore",
                          "当期绩效",
                        )}
                      </td>
                      <td className="border border-slate-200 px-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            className="px-2 py-1 text-sm font-medium text-[#087fb5] underline decoration-[#8fd3ef] underline-offset-2 transition hover:text-[#075f89] hover:decoration-[#075f89] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#159fda]"
                            type="button"
                            onClick={() => openTaskModal(record, selectedSectionId)}
                          >
                            查看
                          </button>
                          {isSaving && (
                            <span className="text-xs text-slate-400">保存中</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
        {isMinisterMode && (
          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
            <button
              className="rounded-md border border-sky-200 bg-white px-4 py-1.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={openMemberAddDialog}
              disabled={isAddingMember || isDeletingMember}
            >
              {isAddingMember ? "添加中" : "添加"}
            </button>
            <button
              className="rounded-md border border-red-200 bg-white px-4 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={openMemberDeleteDialog}
              disabled={isDeletingMember || selectedRecords.length === 0}
            >
              删除
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderSectionNodes(
    nodes: PerformanceChild[],
    parentGroupId: string,
    parentSectionId?: string,
    depth = 0,
  ): ReactNode {
    return nodes.map((node, nodeIndex) => {
      const target: DirectoryTarget = {
        type: "section",
        id: node.id,
        title: node.title,
        kind: node.kind,
        parentGroupId,
        parentSectionId,
      };
      const isExpanded =
        node.kind === "directory" && expandedDirectoryIds.includes(node.id);

      return (
        <Fragment key={node.id}>
          <div className="relative" style={{ paddingLeft: `${depth * 16}px` }}>
            <button
              className={getDirectoryItemClassName(
                selectedItem?.id === node.id && selectedItem.level === "child",
                target,
              )}
              type="button"
              draggable={isMinisterMode && !parentSectionId}
              onDragOver={(event) => {
                if (!parentSectionId) {
                  handleDirectoryRowDragOver(event, target, nodeIndex);
                }
              }}
              onDrop={(event) => {
                if (!parentSectionId) {
                  handleDirectoryRowDrop(event, target, nodeIndex);
                }
              }}
              onContextMenu={(event) =>
                openDirectoryContextMenu(event, target)
              }
              onDragStart={(event) => handleDirectoryDragStart(event, target)}
              onDragEnd={finishDirectoryDrag}
              onClick={() => {
                if (shouldIgnoreClickAfterDrag()) {
                  return;
                }

                setContextMenuTarget(null);

                if (node.kind === "directory") {
                  setExpandedDirectoryIds((current) =>
                    current.includes(node.id)
                      ? current.filter((id) => id !== node.id)
                      : [...current, node.id],
                  );
                  setSelectedItem({
                    id: node.id,
                    title: node.title,
                    level: "child",
                    kind: node.kind,
                  });
                  return;
                }

                setSelectedItem({
                  id: node.id,
                  title: node.title,
                  level: "child",
                  kind: node.kind,
                });
              }}
              aria-expanded={node.kind === "directory" ? isExpanded : undefined}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`inline-block text-[10px] text-slate-400 transition-transform ${
                    node.kind === "directory" && isExpanded ? "rotate-90" : ""
                  }`}
                >
                  {node.kind === "directory" ? "▶" : "•"}
                </span>
                          {renderDirectoryTitle(target, node.title)}
              </span>
            </button>
            {contextMenuTarget?.type === "section" &&
              contextMenuTarget.id === node.id &&
              renderDirectoryContextMenu(target)}
          </div>
          {!parentSectionId &&
            renderDirectoryDropZone({
              type: "section",
              parentGroupId,
              index: nodeIndex + 1,
            })}
          {isExpanded &&
            renderSectionNodes(node.children, parentGroupId, node.id, depth + 1)}
        </Fragment>
      );
    });
  }

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] bg-slate-50 text-slate-950">
      <aside className="w-72 shrink-0 border-r border-slate-200 bg-[#eaf2fb] px-5 py-6 shadow-sm">
        {isLocalTestMode && (
          <div className="mb-4">
            <span className="inline-flex rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
              本地测试模式
            </span>
          </div>
        )}
        <nav aria-label="绩效公示目录" className="text-left">
          {isLoadingGroups && (
            <p className="rounded-xl bg-white/70 px-4 py-3 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200/70">
              正在读取绩效目录...
            </p>
          )}

          {!isLoadingGroups && (
            <div>
              {renderDirectoryDropZone({ type: "year", index: 0 })}
              {performanceGroups.map((group, groupIndex) => {
                const isExpanded = expandedGroup === group.id;
                const groupTarget: DirectoryTarget = {
                  type: "year",
                  id: group.id,
                  title: group.title,
                  kind: "directory",
                };

                return (
                  <Fragment key={group.id}>
                    <div className="relative rounded-xl bg-white/70 px-4 py-3 shadow-sm ring-1 ring-slate-200/70">
                      <button
                        className={getDirectoryItemClassName(
                          selectedItem?.id === group.id &&
                            selectedItem.level === "group",
                          groupTarget,
                        )}
                        type="button"
                        draggable={isMinisterMode}
                        onDragOver={(event) =>
                          handleDirectoryRowDragOver(
                            event,
                            groupTarget,
                            groupIndex,
                          )
                        }
                        onDrop={(event) =>
                          handleDirectoryRowDrop(event, groupTarget, groupIndex)
                        }
                        onContextMenu={(event) =>
                          openDirectoryContextMenu(event, groupTarget)
                        }
                        onDragStart={(event) =>
                          handleDirectoryDragStart(event, groupTarget)
                        }
                        onDragEnd={finishDirectoryDrag}
                        onClick={() => {
                          if (shouldIgnoreClickAfterDrag()) {
                            return;
                          }

                          setContextMenuTarget(null);
                          toggleGroup(group);
                        }}
                        aria-expanded={isExpanded}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={`inline-block text-[10px] text-slate-400 transition-transform ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          >
                            ▶
                          </span>
                          {renderDirectoryTitle(groupTarget, group.title)}
                        </span>
                      </button>
                      {contextMenuTarget?.type === "year" &&
                        contextMenuTarget.id === group.id &&
                        renderDirectoryContextMenu(groupTarget)}

                      {isExpanded && (
                        <div className="mt-2 pl-4">
                          {renderDirectoryDropZone({
                            type: "section",
                            parentGroupId: group.id,
                            index: 0,
                          })}
                          {renderSectionNodes(group.children, group.id)}
                        </div>
                      )}
                    </div>
                    {renderDirectoryDropZone({
                      type: "year",
                      index: groupIndex + 1,
                    })}
                  </Fragment>
                );
              })}
            </div>
          )}
        </nav>

        {directoryError && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {directoryError}
          </p>
        )}

      </aside>

      <section className="flex-1 px-8 py-7">
        {selectedItem?.level === "child" && selectedItem.kind === "page" && (
          <>
            <h1 className="text-2xl font-bold text-slate-900">
              {selectedItem.title}
            </h1>
            {isMinisterMode && (
              <p className="mt-2 text-sm text-slate-500">
                部长模式下可直接修改姓名、绩效；离开输入框后自动保存。
              </p>
            )}
            {renderPerformanceTable()}
          </>
        )}
        {selectedItem?.level === "child" && selectedItem.kind === "directory" && (
          <h1 className="text-2xl font-bold text-slate-900">{selectedItem.title}</h1>
        )}
      </section>

      {taskModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm">
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-950/10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-modal-title"
          >
            <div
              className="flex h-14 items-center px-6 text-white"
              style={{ background: "#159fda" }}
            >
              <h2 id="task-modal-title" className="text-base font-semibold">
                负责任务
              </h2>
            </div>

            <div className="px-6 py-6">
              <p className="mb-4 text-sm font-semibold text-slate-800">
                {getTaskModalOwner(taskModal)}
              </p>

              {isMinisterMode ? (
                <div className="space-y-3">
                  {taskModal.tasks.map((task, index) => (
                    <div
                      className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                      key={`${taskModal.memberId}-${index}`}
                    >
                      <span className="font-semibold">{index + 1}</span>
                      <input
                        className="min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 outline-none transition focus:border-[#159fda] focus:ring-2 focus:ring-sky-100"
                        value={task}
                        onChange={(event) =>
                          setTaskModal((current) =>
                            current
                              ? {
                                  ...current,
                                  tasks: current.tasks.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? event.target.value
                                      : item,
                                  ),
                                }
                              : current,
                          )
                        }
                      />
                      <button
                        className="rounded-md bg-red-100 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-200"
                        type="button"
                        onClick={() =>
                          setTaskModal((current) =>
                            current
                              ? {
                                  ...current,
                                  tasks:
                                    current.tasks.length > 1
                                      ? current.tasks.filter(
                                          (_, itemIndex) => itemIndex !== index,
                                        )
                                      : [""],
                                }
                              : current,
                          )
                        }
                      >
                        删除
                      </button>
                    </div>
                  ))}
                  <button
                    className="w-full rounded-xl border border-dashed border-sky-300 bg-sky-50 px-4 py-3 text-sm font-semibold text-[#159fda] transition hover:bg-sky-100"
                    type="button"
                    onClick={() =>
                      setTaskModal((current) =>
                        current
                          ? { ...current, tasks: [...current.tasks, ""] }
                          : current,
                      )
                    }
                  >
                    新增任务
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {taskModal.tasks.filter(Boolean).length > 0 ? (
                    taskModal.tasks.filter(Boolean).map((task, index) => (
                      <div
                        className="grid grid-cols-[2rem_1fr] items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                        key={task}
                      >
                        <span className="font-semibold">{index + 1}</span>
                        <span>{task}</span>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      暂无任务
                    </p>
                  )}
                </div>
              )}

              {taskModal.error && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                  {taskModal.error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              {isMinisterMode && (
                <button
                  className="rounded-lg bg-[#159fda] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#128ec3] disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={() => void saveTaskModal()}
                  disabled={taskModal.isSaving}
                >
                  {taskModal.isSaving ? "保存中" : "保存"}
                </button>
              )}
              <button
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => setTaskModal(null)}
                disabled={taskModal.isSaving}
              >
                退出
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm">
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-950/10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
          >
            <div
              className="flex h-14 items-center px-6 text-white"
              style={{ background: "#159fda" }}
            >
              <h2 id="delete-confirm-title" className="text-base font-semibold">
                确认删除
              </h2>
            </div>

            <div className="px-6 py-6 text-sm leading-6 text-slate-700">
              确定删除“{deleteTarget?.title ?? ""}”吗？其下级目录、绩效数据和任务内容也会一并删除。
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={closeDeleteConfirmation}
                disabled={isDeletingDirectories}
              >
                取消
              </button>
              <button
                className="rounded-lg bg-[#159fda] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#128ec3] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void confirmDeleteDirectories()}
                disabled={isDeletingDirectories}
              >
                {isDeletingDirectories ? "删除中" : "确认"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isMemberAddOpen && selectedSectionId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm">
          <div
            className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-950/10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-member-title"
          >
            <div className="flex h-14 items-center bg-[#159fda] px-6 text-white">
              <h2 id="add-member-title" className="text-base font-semibold">
                添加人员
              </h2>
            </div>
            <div className="space-y-4 px-6 py-6">
              {getMemberGrades().length > 0 ? (
                <label className="grid gap-2 text-sm font-semibold text-slate-800">
                  年级
                  <select
                    autoFocus
                    className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none focus:border-[#159fda] focus:ring-2 focus:ring-sky-100"
                    value={emptyPageGrade}
                    onChange={(event) => setEmptyPageGrade(event.target.value)}
                  >
                    {getMemberGrades().map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="grid gap-2 text-sm font-semibold text-slate-800">
                  年级
                  <input
                    autoFocus
                    className="h-11 w-full rounded-md border border-slate-300 px-3 font-normal text-slate-900 outline-none focus:border-[#159fda] focus:ring-2 focus:ring-sky-100"
                    value={emptyPageGrade}
                    onChange={(event) => setEmptyPageGrade(event.target.value)}
                    placeholder="例如：26届"
                  />
                </label>
              )}
              {memberAddError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {memberAddError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60"
                type="button"
                onClick={() => {
                  if (!isAddingMember) {
                    setIsMemberAddOpen(false);
                    setMemberAddError("");
                  }
                }}
                disabled={isAddingMember}
              >
                取消
              </button>
              <button
                className="rounded-md bg-[#159fda] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#128ec3] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={confirmAddMember}
                disabled={isAddingMember}
              >
                {isAddingMember ? "添加中" : "确认添加"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isMemberDeleteOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm">
          <div
            className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-950/10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-member-title"
          >
            <div className="flex h-14 items-center bg-[#159fda] px-6 text-white">
              <h2 id="delete-member-title" className="text-base font-semibold">
                删除成员
              </h2>
            </div>
            <div className="space-y-3 px-6 py-6 text-sm leading-6 text-slate-700">
              <label className="grid gap-2 font-semibold text-slate-800">
                删除对象
                <select
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none focus:border-[#159fda] focus:ring-2 focus:ring-sky-100"
                  value={memberDeleteTarget?.record.id ?? ""}
                  onChange={(event) => {
                    const record = selectedRecords.find(
                      (item) => item.id === event.target.value,
                    );
                    if (record && selectedSectionId) {
                      setMemberDeleteTarget({ sectionId: selectedSectionId, record });
                    }
                  }}
                  disabled={isDeletingMember || selectedRecords.length === 0}
                >
                  {selectedRecords.map((record, index) => (
                    <option key={record.id} value={record.id}>
                      {`${record.grade} · ${record.memberName.trim() || "未填写姓名"}（第${index + 1}行）`}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                删除后，该成员及其任务记录将一并移除。
              </p>
              {memberDeleteError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {memberDeleteError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60"
                type="button"
                onClick={() => {
                  if (!isDeletingMember) {
                    setIsMemberDeleteOpen(false);
                    setMemberDeleteTarget(null);
                    setMemberDeleteError("");
                  }
                }}
                disabled={isDeletingMember}
              >
                取消
              </button>
              <button
                className="rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void deleteMemberRecord()}
                disabled={isDeletingMember || !memberDeleteTarget}
              >
                {isDeletingMember ? "删除中" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm">
          <div
            className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-950/10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-directory-title"
          >
            <div
              className="flex h-14 items-center px-6 text-white"
              style={{ background: "#159fda" }}
            >
              <h2 id="create-directory-title" className="text-base font-semibold">
                新增目录项目
              </h2>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div>
                <label
                  className="mb-2 block text-sm font-semibold text-slate-800"
                  htmlFor="create-directory-parent"
                >
                  新增位置
                </label>
                <select
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#159fda] focus:ring-2 focus:ring-sky-100"
                  id="create-directory-parent"
                  value={createParentKey}
                  onChange={(event) => {
                    setCreateParentKey(event.target.value);
                    if (event.target.value === "root") {
                      setCreateNodeAsPage(false);
                    }
                  }}
                >
                  {getCreateDirectoryOptions().map((option) => (
                    <option key={option.key} value={option.key}>
                      {`${"　".repeat(option.depth)}${option.label}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
              <label
                className="mb-2 block text-sm font-semibold text-slate-800"
                htmlFor="new-directory-title"
              >
                  名称
              </label>
              <input
                autoFocus
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#159fda] focus:ring-2 focus:ring-sky-100"
                  id="new-directory-title"
                  placeholder={createNodeAsPage ? "例如：九月绩效" : "例如：活动宣传"}
                  value={newNodeTitle}
                  onChange={(event) => setNewNodeTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                      void createDirectoryNode();
                  }
                }}
              />
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  className="mt-0.5 h-4 w-4 accent-[#159fda]"
                  type="checkbox"
                  checked={createNodeAsPage}
                  onChange={(event) => setCreateNodeAsPage(event.target.checked)}
                  disabled={createParentKey === "root"}
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">
                    是否为绩效页面
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    勾选后会创建可填写成员绩效和任务的页面；不勾选则创建可继续放置子项目的目录。
                  </span>
                </span>
              </label>

              {createNodeError && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                  {createNodeError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={closeCreateModal}
                disabled={isCreatingNode}
              >
                取消
              </button>
              <button
                className="rounded-lg bg-[#159fda] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#128ec3] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void createDirectoryNode()}
                disabled={isCreatingNode}
              >
                {isCreatingNode ? "新增中" : "确认"}
              </button>
            </div>
          </div>
        </div>
      )}

      {moveTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm">
          <div
            className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-950/10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-directory-title"
          >
            <div
              className="flex h-14 items-center px-6 text-white"
              style={{ background: "#159fda" }}
            >
              <h2 id="move-directory-title" className="text-base font-semibold">
                移动项目
              </h2>
            </div>

            <div className="space-y-5 px-6 py-6">
              <p className="text-sm text-slate-600">
                正在移动：<span className="font-semibold text-slate-900">{moveTarget.title}</span>
              </p>
              <div>
                <label
                  className="mb-2 block text-sm font-semibold text-slate-800"
                  htmlFor="move-directory-parent"
                >
                  移动位置
                </label>
                <select
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#159fda] focus:ring-2 focus:ring-sky-100"
                  id="move-directory-parent"
                  value={moveParentKey}
                  onChange={(event) => setMoveParentKey(event.target.value)}
                >
                  {getMoveDirectoryOptions(moveTarget).map((option) => (
                    <option key={option.key} value={option.key}>
                      {`${"　".repeat(option.depth)}${option.label}`}
                    </option>
                  ))}
                </select>
              </div>
              {moveNodeError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                  {moveNodeError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={closeMoveModal}
                disabled={isMovingNode}
              >
                取消
              </button>
              <button
                className="rounded-lg bg-[#159fda] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#128ec3] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void moveDirectoryNode()}
                disabled={isMovingNode || !moveParentKey}
              >
                {isMovingNode ? "移动中" : "确认"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
