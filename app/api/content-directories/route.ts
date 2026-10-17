import { NextResponse } from "next/server";
import { hasValidMinisterSession } from "@/lib/admin-session";
import {
  deleteRows,
  insertRows,
  selectRows,
  updateRows,
} from "@/lib/cloudbase-pg";
import {
  createLocalDirectory,
  deleteLocalDirectories,
  getLocalDirectoryGroups,
  isLocalTestMode,
  moveLocalDirectory,
  reorderLocalDirectory,
  renameLocalDirectory,
} from "@/lib/local-test-store";

type DirectoryModule = "materials" | "works" | "rules";

type DirectoryYearRecord = {
  id: string;
  title: string;
  sort_order: number;
};

type DirectorySectionRecord = {
  id: string;
  year_id: string;
  parent_section_id: string | null;
  node_type: "directory" | "page";
  title: string;
  sort_order: number;
};

type DirectoryNode = {
  id: string;
  title: string;
  kind: "directory" | "page";
  children: DirectoryNode[];
};

type DirectoryGroup = {
  id: string;
  title: string;
  children: DirectoryNode[];
};

const moduleTables: Record<
  DirectoryModule,
  { years: string; sections: string }
> = {
  materials: {
    years: "materials_years",
    sections: "materials_sections",
  },
  works: {
    years: "works_years",
    sections: "works_sections",
  },
  rules: {
    years: "rules_years",
    sections: "rules_sections",
  },
};

function buildNodes(
  sections: DirectorySectionRecord[],
  parentSectionId: string | null,
): DirectoryNode[] {
  return sections
    .filter((section) => section.parent_section_id === parentSectionId)
    .sort((first, second) => first.sort_order - second.sort_order)
    .map((section) => ({
      id: section.id,
      title: section.title,
      kind: section.node_type,
      children:
        section.node_type === "directory"
          ? buildNodes(sections, section.id)
          : [],
    }));
}

async function loadModuleGroups(module: DirectoryModule) {
  const tables = moduleTables[module];
  const [years, sections] = await Promise.all([
    selectRows<DirectoryYearRecord>(tables.years, {
      columns: "id,title,sort_order",
      order: { column: "sort_order" },
    }),
    selectRows<DirectorySectionRecord>(tables.sections, {
      columns: "id,year_id,parent_section_id,node_type,title,sort_order",
      order: { column: "sort_order" },
    }),
  ]);

  return years.map(
    (year): DirectoryGroup => ({
      id: year.id,
      title: year.title,
      children: buildNodes(
        sections.filter((section) => section.year_id === year.id),
        null,
      ),
    }),
  );
}

function isMissingModuleTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /does not exist|not exist|PGRST205|relation .* missing/i.test(message);
}

function getTextValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getDirectoryTargetType(value: unknown) {
  return value === "year" || value === "section" ? value : null;
}

function getModule(value: unknown): DirectoryModule | null {
  return value === "materials" || value === "works" || value === "rules" ? value : null;
}

async function readJsonBody(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function getModuleFromRequest(request: Request, body?: Record<string, unknown> | null) {
  return getModule(
    body?.module ?? new URL(request.url).searchParams.get("module"),
  );
}

async function loadPerformanceGroupsForMigrationPreview() {
  const [years, sections] = await Promise.all([
    selectRows<DirectoryYearRecord>("performance_years", {
      columns: "id,title,sort_order",
      order: { column: "sort_order" },
    }),
    selectRows<DirectorySectionRecord>("performance_sections", {
      columns: "id,year_id,parent_section_id,node_type,title,sort_order",
      order: { column: "sort_order" },
    }),
  ]);

  return years.map(
    (year): DirectoryGroup => ({
      id: year.id,
      title: year.title,
      children: buildNodes(
        sections.filter((section) => section.year_id === year.id),
        null,
      ),
    }),
  );
}

export async function GET(request: Request) {
  const directoryModule = new URL(request.url).searchParams.get("module");

  if (directoryModule !== "materials" && directoryModule !== "works" && directoryModule !== "rules") {
    return NextResponse.json(
      { ok: false, message: "目录模块无效" },
      { status: 400 },
    );
  }

  if (isLocalTestMode()) {
    try {
      return NextResponse.json({
        ok: true,
        module: directoryModule,
        groups: await getLocalDirectoryGroups(directoryModule),
        localTestMode: true,
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "读取本地目录失败" },
        { status: 500 },
      );
    }
  }

  try {
    return NextResponse.json({
      ok: true,
      module: directoryModule,
      groups: await loadModuleGroups(directoryModule),
    });
  } catch (error) {
    if (isMissingModuleTableError(error) && directoryModule !== "rules") {
      return NextResponse.json({
        ok: true,
        module: directoryModule,
        groups: await loadPerformanceGroupsForMigrationPreview(),
        previewOnly: true,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "目录读取失败",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!hasValidMinisterSession(request)) {
    return NextResponse.json({ ok: false, message: "部长身份无效" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  const directoryModule = await getModuleFromRequest(request, body);
  const title = getTextValue(body?.title);
  const parentType =
    body?.parentType === "year" || body?.parentType === "section"
      ? body.parentType
      : "";
  const parentId = getTextValue(body?.parentId);
  const isPage = body?.isPage === true;

  if (!directoryModule || !title) {
    return NextResponse.json(
      { ok: false, message: "目录模块或名称无效" },
      { status: 400 },
    );
  }

  const tables = moduleTables[directoryModule];

  if (isLocalTestMode()) {
    try {
      const result = await createLocalDirectory(directoryModule, {
        title,
        parentType,
        parentId,
        isPage,
      });
      if ("error" in result) {
        return NextResponse.json({ ok: false, message: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, module: directoryModule, groups: result.groups, localTestMode: true });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "新增本地目录失败" },
        { status: 500 },
      );
    }
  }

  try {
    if (!parentType) {
      const years = await selectRows<DirectoryYearRecord>(tables.years, {
        columns: "id,sort_order",
      });
      await Promise.all(
        years.map((year) =>
          updateRows(
            tables.years,
            { sort_order: year.sort_order + 1, updated_at: new Date().toISOString() },
            [{ column: "id", operator: "eq", value: year.id }],
          ),
        ),
      );
      await insertRows(tables.years, { title, sort_order: 1 });
    } else {
      let yearId = "";
      let parentSectionId: string | null = null;

      if (parentType === "year") {
        const years = await selectRows<DirectoryYearRecord>(tables.years, {
          columns: "id",
          filters: [{ column: "id", operator: "eq", value: parentId }],
        });
        if (years.length !== 1) {
          return NextResponse.json({ ok: false, message: "新增位置不存在" }, { status: 400 });
        }
        yearId = parentId;
      } else {
        const parents = await selectRows<DirectorySectionRecord>(tables.sections, {
          columns: "id,year_id,parent_section_id,node_type,title,sort_order",
          filters: [{ column: "id", operator: "eq", value: parentId }],
        });
        const parent = parents[0];
        if (!parent || parent.node_type !== "directory") {
          return NextResponse.json(
            { ok: false, message: "新增位置必须是目录" },
            { status: 400 },
          );
        }
        yearId = parent.year_id;
        parentSectionId = parent.id;
      }

      const siblings = await selectRows<DirectorySectionRecord>(tables.sections, {
        columns: "id,year_id,parent_section_id,node_type,title,sort_order",
        filters: [{ column: "year_id", operator: "eq", value: yearId }],
      });
      const sortOrder =
        Math.max(
          0,
          ...siblings
            .filter((section) => section.parent_section_id === parentSectionId)
            .map((section) => section.sort_order),
        ) + 1;

      await insertRows(tables.sections, {
        year_id: yearId,
        parent_section_id: parentSectionId,
        node_type: isPage ? "page" : "directory",
        title,
        sort_order: sortOrder,
      });
    }

    return NextResponse.json({ ok: true, module: directoryModule, groups: await loadModuleGroups(directoryModule) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "新增目录失败" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!hasValidMinisterSession(request)) {
    return NextResponse.json({ ok: false, message: "部长身份无效" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  const directoryModule = await getModuleFromRequest(request, body);
  const action = getTextValue(body?.action);
  const targetType = getDirectoryTargetType(body?.targetType);
  const id = getTextValue(body?.id);
  const title = getTextValue(body?.title);
  const orderedIds = getStringArray(body?.orderedIds);

  if (!directoryModule || !targetType || !id) {
    return NextResponse.json({ ok: false, message: "目录参数无效" }, { status: 400 });
  }

  const tables = moduleTables[directoryModule];

  if (isLocalTestMode()) {
    try {
      let result: Awaited<ReturnType<typeof renameLocalDirectory>> | Awaited<ReturnType<typeof moveLocalDirectory>> | Awaited<ReturnType<typeof reorderLocalDirectory>>;
      if (action === "rename") {
        if (!title) return NextResponse.json({ ok: false, message: "请输入新的目录名称" }, { status: 400 });
        result = await renameLocalDirectory(directoryModule, targetType, id, title);
      } else if (action === "move") {
        if (targetType !== "section") return NextResponse.json({ ok: false, message: "年度目录不能移动" }, { status: 400 });
        const parentType = body?.parentType === "year" || body?.parentType === "section" ? body.parentType : "";
        const parentId = getTextValue(body?.parentId);
        if (!parentType || !parentId) return NextResponse.json({ ok: false, message: "移动位置无效" }, { status: 400 });
        result = await moveLocalDirectory(directoryModule, id, parentType, parentId);
      } else if (action === "reorder") {
        if (orderedIds.length === 0) return NextResponse.json({ ok: false, message: "缺少排序信息" }, { status: 400 });
        result = await reorderLocalDirectory(directoryModule, orderedIds);
      } else {
        return NextResponse.json({ ok: false, message: "未知操作" }, { status: 400 });
      }
      if ("error" in result) return NextResponse.json({ ok: false, message: result.error }, { status: 400 });
      return NextResponse.json({ ok: true, module: directoryModule, groups: result.groups, localTestMode: true });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "本地目录更新失败" },
        { status: 500 },
      );
    }
  }

  try {
    if (action === "rename") {
      if (!title) {
        return NextResponse.json({ ok: false, message: "请输入新的目录名称" }, { status: 400 });
      }
      await updateRows(
        targetType === "year" ? tables.years : tables.sections,
        { title, updated_at: new Date().toISOString() },
        [{ column: "id", operator: "eq", value: id }],
      );
    } else if (action === "move") {
      if (targetType !== "section") {
        return NextResponse.json({ ok: false, message: "年度目录不能移动" }, { status: 400 });
      }

      const parentType =
        body?.parentType === "year" || body?.parentType === "section"
          ? body.parentType
          : "";
      const parentId = getTextValue(body?.parentId);
      if (!parentType || !parentId) {
        return NextResponse.json({ ok: false, message: "移动位置无效" }, { status: 400 });
      }

      const [movingRows, allSections] = await Promise.all([
        selectRows<DirectorySectionRecord>(tables.sections, {
          columns: "id,year_id,parent_section_id,node_type,title,sort_order",
          filters: [{ column: "id", operator: "eq", value: id }],
        }),
        selectRows<DirectorySectionRecord>(tables.sections, {
          columns: "id,year_id,parent_section_id,node_type,title,sort_order",
        }),
      ]);
      const moving = movingRows[0];
      if (!moving) {
        return NextResponse.json({ ok: false, message: "移动项目不存在" }, { status: 404 });
      }

      let destinationYearId = "";
      let destinationSectionId: string | null = null;
      if (parentType === "year") {
        const years = await selectRows<DirectoryYearRecord>(tables.years, {
          columns: "id",
          filters: [{ column: "id", operator: "eq", value: parentId }],
        });
        if (years.length !== 1) {
          return NextResponse.json({ ok: false, message: "移动位置不存在" }, { status: 400 });
        }
        destinationYearId = parentId;
      } else {
        const destination = allSections.find((section) => section.id === parentId);
        if (!destination || destination.node_type !== "directory") {
          return NextResponse.json({ ok: false, message: "移动位置必须是目录" }, { status: 400 });
        }
        destinationYearId = destination.year_id;
        destinationSectionId = destination.id;
      }

      const subtreeIds = new Set([moving.id]);
      let foundDescendant = true;
      while (foundDescendant) {
        foundDescendant = false;
        allSections.forEach((section) => {
          if (
            section.parent_section_id &&
            subtreeIds.has(section.parent_section_id) &&
            !subtreeIds.has(section.id)
          ) {
            subtreeIds.add(section.id);
            foundDescendant = true;
          }
        });
      }

      if (destinationSectionId && subtreeIds.has(destinationSectionId)) {
        return NextResponse.json(
          { ok: false, message: "不能移动到自身或下级目录" },
          { status: 400 },
        );
      }

      const nextSortOrder =
        Math.max(
          0,
          ...allSections
            .filter(
              (section) =>
                section.year_id === destinationYearId &&
                section.parent_section_id === destinationSectionId,
            )
            .map((section) => section.sort_order),
        ) + 1;
      const descendants = [...subtreeIds].filter((sectionId) => sectionId !== moving.id);
      if (descendants.length > 0 && moving.year_id !== destinationYearId) {
        await updateRows(
          tables.sections,
          { year_id: destinationYearId, updated_at: new Date().toISOString() },
          [{ column: "id", operator: "in", value: descendants }],
        );
      }
      await updateRows(
        tables.sections,
        {
          year_id: destinationYearId,
          parent_section_id: destinationSectionId,
          sort_order: nextSortOrder,
          updated_at: new Date().toISOString(),
        },
        [{ column: "id", operator: "eq", value: moving.id }],
      );
    } else if (action === "reorder") {
      if (orderedIds.length === 0) {
        return NextResponse.json({ ok: false, message: "缺少排序信息" }, { status: 400 });
      }
      await Promise.all(
        orderedIds.map((orderedId, index) =>
          updateRows(
            targetType === "year" ? tables.years : tables.sections,
            { sort_order: index + 1, updated_at: new Date().toISOString() },
            [{ column: "id", operator: "eq", value: orderedId }],
          ),
        ),
      );
    } else {
      return NextResponse.json({ ok: false, message: "未知操作" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, module: directoryModule, groups: await loadModuleGroups(directoryModule) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "目录更新失败" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!hasValidMinisterSession(request)) {
    return NextResponse.json({ ok: false, message: "部长身份无效" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  const directoryModule = await getModuleFromRequest(request, body);
  const groupIds = getStringArray(body?.groupIds);
  const sectionIds = getStringArray(body?.sectionIds);

  if (!directoryModule) {
    return NextResponse.json({ ok: false, message: "目录模块无效" }, { status: 400 });
  }

  const tables = moduleTables[directoryModule];

  if (isLocalTestMode()) {
    try {
      const groups = await deleteLocalDirectories(directoryModule, groupIds, sectionIds);
      return NextResponse.json({ ok: true, module: directoryModule, groups, localTestMode: true });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "本地目录删除失败" },
        { status: 500 },
      );
    }
  }

  try {
    if (sectionIds.length > 0) {
      await deleteRows(tables.sections, [
        { column: "id", operator: "in", value: sectionIds },
      ]);
    }
    if (groupIds.length > 0) {
      await deleteRows(tables.years, [
        { column: "id", operator: "in", value: groupIds },
      ]);
    }
    return NextResponse.json({ ok: true, module: directoryModule, groups: await loadModuleGroups(directoryModule) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "目录删除失败" },
      { status: 500 },
    );
  }
}
