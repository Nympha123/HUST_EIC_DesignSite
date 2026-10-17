import "server-only";

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultPerformanceTaskTitles } from "@/lib/performance-defaults";

export type LocalDirectoryNode = {
  id: string;
  title: string;
  kind: "directory" | "page";
  children: LocalDirectoryNode[];
};

export type LocalDirectoryGroup = {
  id: string;
  title: string;
  children: LocalDirectoryNode[];
};

export type LocalContentModule = "materials" | "works" | "rules";
export type LocalDirectoryModule = LocalContentModule | "performance";

export type LocalPerformanceTask = {
  id: string;
  title: string;
};

export type LocalPerformanceRecord = {
  id: string;
  sectionId: string;
  grade: string;
  memberName: string;
  studentId: string;
  currentScore: string;
  sortOrder: number;
  tasks: LocalPerformanceTask[];
};

export type LocalFileRecord = {
  id: string;
  sectionId: string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type ForumPost = {
  id: string;
  author_name: string;
  title: string;
  content: string;
  created_at: string;
};

export type ForumReply = {
  id: string;
  post_id: string;
  author_name: string;
  content: string;
  created_at: string;
};

const localDataRoot = path.join(process.cwd(), "data", "local-test");
const maxLocalFileSize = 256 * 1024 * 1024;
const defaultGradeRows = [
  { grade: "23届", count: 5 },
  { grade: "24届", count: 5 },
  { grade: "25届", count: 5 },
  { grade: "26届", count: 5 },
];

export function isLocalTestMode() {
  return process.env.NODE_ENV !== "production" && (
    process.env.LOCAL_TEST_MODE === "true" || existsSync(path.join(process.cwd(), ".local-test-mode"))
  );
}

function getModuleFilePath(module: LocalDirectoryModule, type: "directories" | "files") {
  return path.join(localDataRoot, `${module}-${type}.json`);
}

function getPerformanceRecordsPath(module: "performance" | "rules" = "performance") {
  return path.join(localDataRoot, `${module}-records.json`);
}

async function writeJsonAtomically(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  await rename(temporaryPath, filePath);
}

async function getLocalForumData() {
  const filePath = path.join(localDataRoot, "forum.json");
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    if (
      typeof parsed === "object" && parsed !== null &&
      "posts" in parsed && Array.isArray(parsed.posts) &&
      "replies" in parsed && Array.isArray(parsed.replies)
    ) {
      return parsed as { posts: ForumPost[]; replies: ForumReply[] };
    }
    throw new Error("本地论坛数据格式错误");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const initialData = { posts: [], replies: [] };
    await writeJsonAtomically(filePath, initialData);
    return initialData;
  }
}

export async function listLocalForumPosts() {
  const { posts, replies } = await getLocalForumData();
  return posts
    .slice()
    .sort((first, second) => second.created_at.localeCompare(first.created_at))
    .slice(0, 50)
    .map((post) => ({
      ...post,
      reply_count: replies.filter((reply) => reply.post_id === post.id).length,
    }));
}

export async function listLocalForumReplies(postId: string) {
  const { replies } = await getLocalForumData();
  return replies
    .filter((reply) => reply.post_id === postId)
    .sort((first, second) => first.created_at.localeCompare(second.created_at))
    .slice(0, 200);
}

export async function createLocalForumPost(input: {
  authorName: string;
  title: string;
  content: string;
}) {
  const data = await getLocalForumData();
  const post: ForumPost = {
    id: randomUUID(),
    author_name: input.authorName,
    title: input.title,
    content: input.content,
    created_at: new Date().toISOString(),
  };
  data.posts.push(post);
  await writeJsonAtomically(path.join(localDataRoot, "forum.json"), data);
  return post;
}

export async function createLocalForumReply(input: {
  postId: string;
  authorName: string;
  content: string;
}) {
  const data = await getLocalForumData();
  if (!data.posts.some((post) => post.id === input.postId)) return null;
  const reply: ForumReply = {
    id: randomUUID(),
    post_id: input.postId,
    author_name: input.authorName,
    content: input.content,
    created_at: new Date().toISOString(),
  };
  data.replies.push(reply);
  await writeJsonAtomically(path.join(localDataRoot, "forum.json"), data);
  return reply;
}

function createSeedGroups(module: LocalDirectoryModule): LocalDirectoryGroup[] {
  const directoryId = randomUUID();
  if (module === "performance") {
    return [{
      id: randomUUID(),
      title: "本地测试年度",
      children: [{
        id: directoryId,
        title: "测试目录",
        kind: "directory",
        children: [{ id: randomUUID(), title: "示例绩效", kind: "page", children: [] }],
      }],
    }];
  }

  if (module === "materials") {
    return [{
      id: randomUUID(),
      title: "2026 年度",
      children: [{
        id: directoryId,
        title: "宣传材料",
        kind: "directory",
        children: [
          { id: randomUUID(), title: "活动海报", kind: "page", children: [] },
          { id: randomUUID(), title: "新闻配图", kind: "page", children: [] },
        ],
      }],
    }];
  }

  if (module === "rules") {
    return [{
      id: randomUUID(),
      title: "部门规章",
      children: [{
        id: directoryId,
        title: "规章分类",
        kind: "directory",
        children: [{ id: randomUUID(), title: "示例规章文件", kind: "page", children: [] }],
      }],
    }];
  }

  return [{
    id: randomUUID(),
    title: "2025 年度",
    children: [{
      id: directoryId,
      title: "优秀作品",
      kind: "directory",
      children: [
        { id: randomUUID(), title: "海报设计", kind: "page", children: [] },
        { id: randomUUID(), title: "视频作品", kind: "page", children: [] },
      ],
    }],
  }];
}

function createDefaultPerformanceRecords(sectionId: string): LocalPerformanceRecord[] {
  return defaultGradeRows.flatMap((group, groupIndex) =>
    Array.from({ length: group.count }, (_, rowIndex) => ({
      id: randomUUID(),
      sectionId,
      grade: group.grade,
      memberName: "",
      studentId: "",
      currentScore: "",
      sortOrder: groupIndex * group.count + rowIndex + 1,
      tasks: defaultPerformanceTaskTitles.map((title) => ({ id: randomUUID(), title })),
    })),
  );
}

async function ensurePerformanceRecords(
  groups: LocalDirectoryGroup[],
  module: "performance" | "rules" = "performance",
) {
  const filePath = getPerformanceRecordsPath(module);
  try {
    await readFile(filePath, "utf8");
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const pageIds: string[] = [];
  for (const group of groups) {
    visitNodes(group.children, (node) => {
      if (node.kind === "page") pageIds.push(node.id);
    });
  }
  await writeJsonAtomically(
    filePath,
    pageIds.flatMap((sectionId) => createDefaultPerformanceRecords(sectionId)),
  );
}

export async function getLocalDirectoryGroups(module: LocalDirectoryModule) {
  const filePath = getModuleFilePath(module, "directories");
  let groups: LocalDirectoryGroup[];
  try {
    groups = JSON.parse(await readFile(filePath, "utf8")) as LocalDirectoryGroup[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    groups = createSeedGroups(module);
    await writeJsonAtomically(filePath, groups);
  }
  if (module === "performance") await ensurePerformanceRecords(groups);
  return groups;
}

function getNodeLocation(groups: LocalDirectoryGroup[], id: string) {
  for (const group of groups) {
    const search = (nodes: LocalDirectoryNode[]): { node: LocalDirectoryNode; siblings: LocalDirectoryNode[] } | null => {
      for (const node of nodes) {
        if (node.id === id) return { node, siblings: nodes };
        const childMatch = search(node.children);
        if (childMatch) return childMatch;
      }
      return null;
    };
    const match = search(group.children);
    if (match) return { ...match, group };
  }
  return null;
}

function getGroup(groups: LocalDirectoryGroup[], id: string) {
  return groups.find((group) => group.id === id) ?? null;
}

function visitNodes(nodes: LocalDirectoryNode[], callback: (node: LocalDirectoryNode) => void) {
  for (const node of nodes) {
    callback(node);
    visitNodes(node.children, callback);
  }
}

export async function createLocalDirectory(
  module: LocalDirectoryModule,
  input: { title: string; parentType: "" | "year" | "section"; parentId: string; isPage: boolean },
) {
  const groups = await getLocalDirectoryGroups(module);
  const node: LocalDirectoryNode = {
    id: randomUUID(),
    title: input.title,
    kind: input.isPage ? "page" : "directory",
    children: [],
  };
  let created:
    | { type: "year"; id: string; kind: "directory" }
    | { type: "section"; id: string; parentGroupId: string; parentSectionId: string | null; kind: "directory" | "page" };

  if (!input.parentType) {
    if (input.isPage) return { error: "绩效页面必须放在一个目录下" as const };
    const groupId = randomUUID();
    groups.unshift({ id: groupId, title: input.title, children: [] });
    created = { type: "year", id: groupId, kind: "directory" };
  } else if (input.parentType === "year") {
    const group = getGroup(groups, input.parentId);
    if (!group) return { error: "新增位置不存在" as const };
    group.children.push(node);
    created = {
      type: "section",
      id: node.id,
      parentGroupId: group.id,
      parentSectionId: null,
      kind: node.kind,
    };
  } else {
    const parentLocation = getNodeLocation(groups, input.parentId);
    const parent = parentLocation?.node;
    if (!parent || parent.kind !== "directory") return { error: "新增位置必须是目录" as const };
    parent.children.push(node);
    created = {
      type: "section",
      id: node.id,
      parentGroupId: parentLocation.group.id,
      parentSectionId: parent.id,
      kind: node.kind,
    };
  }

  await writeJsonAtomically(getModuleFilePath(module, "directories"), groups);
  if (module === "performance" && node.kind === "page") {
    const records = await getLocalPerformanceRecordData();
    records.push(...createDefaultPerformanceRecords(node.id));
    await writeJsonAtomically(getPerformanceRecordsPath(), records);
  }
  return { groups, created };
}

export async function renameLocalDirectory(
  module: LocalDirectoryModule,
  targetType: "year" | "section",
  id: string,
  title: string,
) {
  const groups = await getLocalDirectoryGroups(module);
  if (targetType === "year") {
    const group = getGroup(groups, id);
    if (!group) return { error: "目录项目不存在" as const };
    group.title = title;
  } else {
    const target = getNodeLocation(groups, id)?.node;
    if (!target) return { error: "目录项目不存在" as const };
    target.title = title;
  }
  await writeJsonAtomically(getModuleFilePath(module, "directories"), groups);
  return { groups };
}

export async function moveLocalDirectory(
  module: LocalDirectoryModule,
  id: string,
  parentType: "year" | "section",
  parentId: string,
) {
  const groups = await getLocalDirectoryGroups(module);
  const source = getNodeLocation(groups, id);
  if (!source) return { error: "移动项目不存在" as const };

  let destinationSiblings: LocalDirectoryNode[];
  if (parentType === "year") {
    const destination = getGroup(groups, parentId);
    if (!destination) return { error: "移动位置不存在" as const };
    destinationSiblings = destination.children;
  } else {
    const destination = getNodeLocation(groups, parentId)?.node;
    if (!destination || destination.kind !== "directory") return { error: "移动位置必须是目录" as const };
    let containsSource = false;
    visitNodes([source.node], (node) => { if (node.id === destination.id) containsSource = true; });
    if (containsSource) return { error: "不能移动到自身或下级目录" as const };
    destinationSiblings = destination.children;
  }

  source.siblings.splice(source.siblings.indexOf(source.node), 1);
  destinationSiblings.push(source.node);
  await writeJsonAtomically(getModuleFilePath(module, "directories"), groups);
  return { groups };
}

function reorderNodesInGroups(groups: LocalDirectoryGroup[], orderedIds: string[]) {
  const reorder = <T extends { id: string }>(items: T[]) => {
    if (items.length !== orderedIds.length || !orderedIds.every((id) => items.some((item) => item.id === id))) return false;
    const byId = new Map(items.map((item) => [item.id, item]));
    items.splice(0, items.length, ...orderedIds.map((id) => byId.get(id)!));
    return true;
  };

  if (reorder(groups)) return true;
  let changed = false;
  for (const group of groups) {
    const search = (nodes: LocalDirectoryNode[]): boolean => {
      if (reorder(nodes)) return true;
      return nodes.some((node) => search(node.children));
    };
    if (search(group.children)) changed = true;
  }
  return changed;
}

export async function reorderLocalDirectory(module: LocalDirectoryModule, orderedIds: string[]) {
  const groups = await getLocalDirectoryGroups(module);
  if (!reorderNodesInGroups(groups, orderedIds)) return { error: "排序项目无效" as const };
  await writeJsonAtomically(getModuleFilePath(module, "directories"), groups);
  return { groups };
}

export async function deleteLocalDirectories(
  module: LocalDirectoryModule,
  groupIds: string[],
  sectionIds: string[],
) {
  const originalGroups = await getLocalDirectoryGroups(module);
  const deletedSectionIds = new Set<string>();

  for (const group of originalGroups) {
    if (groupIds.includes(group.id)) {
      visitNodes(group.children, (node) => deletedSectionIds.add(node.id));
    }
  }

  const removeSections = (nodes: LocalDirectoryNode[]): LocalDirectoryNode[] =>
    nodes.flatMap((node) => {
      if (sectionIds.includes(node.id)) {
        visitNodes([node], (descendant) => deletedSectionIds.add(descendant.id));
        return [];
      }
      return [{ ...node, children: removeSections(node.children) }];
    });

  const groups = originalGroups
    .filter((group) => !groupIds.includes(group.id))
    .map((group) => ({ ...group, children: removeSections(group.children) }));
  let deletedFiles: LocalFileRecord[] = [];
  let remainingFiles: LocalFileRecord[] | null = null;
  let remainingPerformanceRecords: LocalPerformanceRecord[] | null = null;
  if (module === "performance") {
    const records = await getLocalPerformanceRecordData();
    remainingPerformanceRecords = records.filter((record) => !deletedSectionIds.has(record.sectionId));
  } else {
    const files = await getLocalFileRecords(module);
    deletedFiles = files.filter((file) => deletedSectionIds.has(file.sectionId));
    remainingFiles = files.filter((file) => !deletedSectionIds.has(file.sectionId));
  }

  const directoriesPath = getModuleFilePath(module, "directories");

  await writeJsonAtomically(directoriesPath, groups);
  try {
    if (remainingPerformanceRecords) {
      await writeJsonAtomically(
        getPerformanceRecordsPath(),
        remainingPerformanceRecords,
      );
    } else if (remainingFiles) {
      await writeJsonAtomically(getModuleFilePath(module as LocalContentModule, "files"), remainingFiles);
    }
  } catch (error) {
    await writeJsonAtomically(directoriesPath, originalGroups).catch(() => undefined);
    throw error;
  }

  if (module !== "performance") {
    await Promise.all(deletedFiles.map(async (file) => {
      await unlink(getStorageFilePath(module, file.storageKey)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }));
  }

  return groups;
}

function getStorageFilePath(module: LocalContentModule, storageKey: string) {
  const basePath = path.resolve(localDataRoot, "storage", module);
  const filePath = path.resolve(basePath, ...storageKey.split(/[\\/]/));
  if (!filePath.startsWith(`${basePath}${path.sep}`)) throw new Error("本地文件路径无效");
  return filePath;
}

async function getLocalFileRecords(module: LocalContentModule) {
  const filePath = getModuleFilePath(module, "files");
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as LocalFileRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeJsonAtomically(filePath, []);
    return [];
  }
}

async function getLocalPerformanceRecordData(module: "performance" | "rules" = "performance") {
  const filePath = getPerformanceRecordsPath(module);
  try {
    const records = JSON.parse(await readFile(filePath, "utf8")) as Array<
      LocalPerformanceRecord & { studentId?: unknown }
    >;
    return records.map((record) => ({
      ...record,
      studentId: typeof record.studentId === "string" ? record.studentId : "",
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeJsonAtomically(filePath, []);
    return [];
  }
}

function toClientPerformanceRecord(record: LocalPerformanceRecord) {
  return {
    id: record.id,
    grade: record.grade,
    memberName: record.memberName,
    studentId: record.studentId,
    currentScore: record.currentScore,
    tasks: record.tasks.map(({ id, title }) => ({ id, title })),
  };
}

export async function listLocalPerformanceRecords(
  sectionId: string,
  module: "performance" | "rules" = "performance",
) {
  const records = await getLocalPerformanceRecordData(module);
  return records
    .filter((record) => record.sectionId === sectionId)
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map(toClientPerformanceRecord);
}

async function isLocalPerformancePage(
  sectionId: string,
  module: "performance" | "rules" = "performance",
) {
  const groups = await getLocalDirectoryGroups(module);
  let isPage = false;
  for (const group of groups) {
    visitNodes(group.children, (node) => {
      if (node.id === sectionId && node.kind === "page") isPage = true;
    });
  }
  return isPage;
}

export async function createLocalPerformanceMember(
  sectionId: string,
  grade: string,
  beforeMemberId: string,
  afterMemberId: string,
  module: "performance" | "rules" = "performance",
) {
  if (!(await isLocalPerformancePage(sectionId, module))) {
    return { error: "只能在绩效页面中添加成员" as const };
  }

  const allRecords = await getLocalPerformanceRecordData(module);
  const sectionRecords = allRecords
    .filter((record) => record.sectionId === sectionId)
    .sort((first, second) => first.sortOrder - second.sortOrder);
  let insertIndex = sectionRecords.length;

  if (beforeMemberId || afterMemberId) {
    const anchorId = beforeMemberId || afterMemberId;
    const anchorIndex = sectionRecords.findIndex((record) => record.id === anchorId);
    if (anchorIndex < 0 || sectionRecords[anchorIndex].grade !== grade) {
      return { error: "插入位置不属于所选年级" as const };
    }
    insertIndex = anchorIndex + (afterMemberId ? 1 : 0);
  } else {
    const lastGradeIndex = sectionRecords.reduce(
      (lastIndex, record, index) => record.grade === grade ? index : lastIndex,
      -1,
    );
    if (lastGradeIndex >= 0) insertIndex = lastGradeIndex + 1;
  }

  const member: LocalPerformanceRecord = {
    id: randomUUID(),
    sectionId,
    grade,
    memberName: "",
    studentId: "",
    currentScore: "",
    sortOrder: 0,
    tasks: defaultPerformanceTaskTitles.map((title) => ({ id: randomUUID(), title })),
  };
  sectionRecords.splice(insertIndex, 0, member);
  const orderedRecords = sectionRecords.map((record, index) => ({ ...record, sortOrder: index + 1 }));
  const otherRecords = allRecords.filter((record) => record.sectionId !== sectionId);
  await writeJsonAtomically(getPerformanceRecordsPath(module), [...otherRecords, ...orderedRecords]);

  return {
    memberId: member.id,
    records: orderedRecords.map(toClientPerformanceRecord),
  };
}

export async function updateLocalPerformanceGrades(
  memberIds: string[],
  grade: string,
  module: "performance" | "rules" = "performance",
) {
  const allRecords = await getLocalPerformanceRecordData(module);
  const selectedRecords = allRecords.filter((record) => memberIds.includes(record.id));
  const sectionId = selectedRecords[0]?.sectionId;
  if (
    selectedRecords.length !== memberIds.length ||
    !sectionId ||
    selectedRecords.some((record) => record.sectionId !== sectionId)
  ) {
    return { error: "年级对应的成员范围无效" as const };
  }

  const selectedIds = new Set(memberIds);
  const updatedRecords = allRecords.map((record) =>
    selectedIds.has(record.id) ? { ...record, grade } : record,
  );
  await writeJsonAtomically(getPerformanceRecordsPath(module), updatedRecords);
  return { sectionId, records: await listLocalPerformanceRecords(sectionId, module) };
}

export async function updateLocalPerformanceMember(
  memberId: string,
  input: {
    memberName?: string;
    studentId?: string;
    currentScore?: string;
    tasks?: string[];
  },
  module: "performance" | "rules" = "performance",
) {
  const allRecords = await getLocalPerformanceRecordData(module);
  const member = allRecords.find((record) => record.id === memberId);
  if (!member) return null;

  const updatedMember: LocalPerformanceRecord = {
    ...member,
    ...(input.memberName !== undefined ? { memberName: input.memberName } : {}),
    ...(input.studentId !== undefined ? { studentId: input.studentId } : {}),
    ...(input.currentScore !== undefined ? { currentScore: input.currentScore } : {}),
    ...(input.tasks !== undefined
      ? { tasks: input.tasks.map((title) => ({ id: randomUUID(), title })) }
      : {}),
  };
  await writeJsonAtomically(
    getPerformanceRecordsPath(module),
    allRecords.map((record) => record.id === memberId ? updatedMember : record),
  );
  return {
    sectionId: member.sectionId,
    record: toClientPerformanceRecord(updatedMember),
  };
}

export async function deleteLocalPerformanceMember(
  memberId: string,
  module: "performance" | "rules" = "performance",
) {
  const allRecords = await getLocalPerformanceRecordData(module);
  const member = allRecords.find((record) => record.id === memberId);
  if (!member) return null;

  const orderedRecords = allRecords
    .filter((record) => record.sectionId === member.sectionId && record.id !== memberId)
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map((record, index) => ({ ...record, sortOrder: index + 1 }));
  const otherRecords = allRecords.filter((record) => record.sectionId !== member.sectionId);
  await writeJsonAtomically(getPerformanceRecordsPath(module), [...otherRecords, ...orderedRecords]);
  return {
    sectionId: member.sectionId,
    records: orderedRecords.map(toClientPerformanceRecord),
  };
}

export async function listLocalFiles(module: LocalContentModule, sectionId: string) {
  const files = await getLocalFileRecords(module);
  return files
    .filter((file) => file.sectionId === sectionId)
    .filter((file) => module !== "rules" || /\.pdf$/i.test(file.fileName))
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .map((file) => ({
      id: file.id,
      sectionId: file.sectionId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      previewUrl: `/api/${module === "materials" ? "material-files" : module === "works" ? "work-files" : "rule-files"}/preview/${file.id}`,
    }));
}

export async function saveLocalFile(module: LocalContentModule, sectionId: string, uploaded: File) {
  if (uploaded.size <= 0 || uploaded.size > maxLocalFileSize) {
    throw new Error("本地测试文件大小必须大于 0 且不超过 256 MB");
  }

  const groups = await getLocalDirectoryGroups(module);
  let isPage = false;
  for (const group of groups) {
    visitNodes(group.children, (node) => { if (node.id === sectionId && node.kind === "page") isPage = true; });
  }
  if (!isPage) throw new Error("请选择有效的页面后再上传文件");

  const fileName = uploaded.name.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 180) || "未命名文件";
  const storageName = `${randomUUID()}-${fileName.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_") || "file"}`;
  const storageKey = `${sectionId}/${storageName}`;
  const filePath = getStorageFilePath(module, storageKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, new Uint8Array(await uploaded.arrayBuffer()));

  const now = new Date().toISOString();
  const record: LocalFileRecord = {
    id: randomUUID(),
    sectionId,
    fileName,
    storageKey,
    mimeType: uploaded.type || "application/octet-stream",
    sizeBytes: uploaded.size,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const files = await getLocalFileRecords(module);
    files.unshift(record);
    await writeJsonAtomically(getModuleFilePath(module, "files"), files);
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }

  return {
    id: record.id,
    sectionId: record.sectionId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    previewUrl: `/api/${module === "materials" ? "material-files" : module === "works" ? "work-files" : "rule-files"}/preview/${record.id}`,
  };
}

export async function getLocalFile(module: LocalContentModule, id: string) {
  const files = await getLocalFileRecords(module);
  const file = files.find((item) => item.id === id);
  if (!file) return null;
  try {
    const body = await readFile(getStorageFilePath(module, file.storageKey));
    return { file, body };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteLocalFile(module: LocalContentModule, id: string) {
  const files = await getLocalFileRecords(module);
  const file = files.find((item) => item.id === id);
  if (!file) return false;
  await unlink(getStorageFilePath(module, file.storageKey)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  await writeJsonAtomically(
    getModuleFilePath(module, "files"),
    files.filter((item) => item.id !== id),
  );
  return true;
}
