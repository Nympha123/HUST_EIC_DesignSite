import { NextResponse } from "next/server";
import { hasValidMinisterSession } from "@/lib/admin-session";
import { defaultPerformanceTaskTitles } from "@/lib/performance-defaults";
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

type RulesYearRecord = {
  id: string;
  title: string;
  sort_order: number;
};

type RulesSectionRecord = {
  id: string;
  year_id: string;
  parent_section_id: string | null;
  node_type: "directory" | "page";
  title: string;
  sort_order: number;
};

type RulesNode = {
  id: string;
  title: string;
  kind: "directory" | "page";
  children: RulesNode[];
};

type RulesGroup = {
  id: string;
  title: string;
  children: RulesNode[];
};

const defaultGradeRows = [
  { grade: "23届", count: 5 },
  { grade: "24届", count: 5 },
  { grade: "25届", count: 5 },
  { grade: "26届", count: 5 },
];

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getTextValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getDirectoryTargetType(value: unknown) {
  return value === "year" || value === "section" ? value : null;
}

function buildNodes(
  sections: RulesSectionRecord[],
  parentSectionId: string | null,
): RulesNode[] {
  return sections
    .filter((section) => section.parent_section_id === parentSectionId)
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

async function loadRulesGroups() {
  const [years, sections] = await Promise.all([
    selectRows<RulesYearRecord>("rules_years", {
      columns: "id,title,sort_order",
      order: { column: "sort_order" },
    }),
    selectRows<RulesSectionRecord>("rules_sections", {
      columns: "id,year_id,parent_section_id,node_type,title,sort_order",
      order: { column: "sort_order" },
    }),
  ]);

  return years.map(
    (year): RulesGroup => ({
      id: year.id,
      title: year.title,
      children: buildNodes(
        sections.filter((section) => section.year_id === year.id),
        null,
      ),
    }),
  );
}

async function seedRulesSectionContent(sectionId: string) {
  const memberRows = defaultGradeRows.flatMap((group, groupIndex) =>
    Array.from({ length: group.count }).map((_, rowIndex) => ({
      section_id: sectionId,
      grade: group.grade,
      member_name: "",
      current_score: "",
      sort_order: groupIndex * group.count + rowIndex + 1,
    })),
  );

  const insertedMembers = await insertRows<{ id: string }>(
    "rules_members",
    memberRows,
  );

  const taskRows = insertedMembers.flatMap((member) =>
    defaultPerformanceTaskTitles.map((title, index) => ({
      member_id: member.id,
      title,
      sort_order: index + 1,
    })),
  );

  if (taskRows.length > 0) {
    await insertRows("rules_tasks", taskRows);
  }
}

export async function GET() {
  if (isLocalTestMode()) {
    try {
      return NextResponse.json({
        ok: true,
        groups: await getLocalDirectoryGroups("rules"),
        localTestMode: true,
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "读取本地规章目录失败" },
        { status: 500 },
      );
    }
  }

  try {
    return NextResponse.json({ ok: true, groups: await loadRulesGroups() });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "读取规章目录失败",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!hasValidMinisterSession(request)) {
    return NextResponse.json({ ok: false, message: "部长身份无效" }, { status: 401 });
  }

  let title = "";
  let parentType: "year" | "section" | "" = "";
  let parentId = "";
  let isRulesPage = false;

  try {
    const body = (await request.json()) as {
      title?: unknown;
      parentType?: unknown;
      parentId?: unknown;
      isRulesPage?: unknown;
    };
    title = getTextValue(body.title);
    parentType =
      body.parentType === "year" || body.parentType === "section"
        ? body.parentType
        : "";
    parentId = getTextValue(body.parentId);
    isRulesPage = body.isRulesPage === true;
  } catch {
    return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
  }

  if (!title) {
    return NextResponse.json({ ok: false, message: "请输入名称" }, { status: 400 });
  }

  if (!parentType && isRulesPage) {
    return NextResponse.json(
      { ok: false, message: "规章页面必须放在一个目录下" },
      { status: 400 },
    );
  }

  if (isLocalTestMode()) {
    try {
      const result = await createLocalDirectory("rules", {
        title,
        parentType,
        parentId,
        isPage: isRulesPage,
      });
      if ("error" in result) {
        return NextResponse.json({ ok: false, message: result.error }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        groups: result.groups,
        created: result.created,
        localTestMode: true,
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "新增本地规章目录失败" },
        { status: 500 },
      );
    }
  }

  try {
    if (!parentType) {
      const existingYears = await selectRows<RulesYearRecord>(
        "rules_years",
        { columns: "id,sort_order" },
      );

      await Promise.all(
        existingYears.map((year) =>
          updateRows(
            "rules_years",
            { sort_order: year.sort_order + 1 },
            [{ column: "id", operator: "eq", value: year.id }],
          ),
        ),
      );

      const insertedYears = await insertRows<{ id: string }>("rules_years", {
        title,
        sort_order: 1,
      });
      const createdYearId = insertedYears[0]?.id;

      if (!createdYearId) {
        throw new Error("CloudBase PG 未返回新建目录编号");
      }

      return NextResponse.json({
        ok: true,
        groups: await loadRulesGroups(),
        created: { type: "year", id: createdYearId, kind: "directory" },
      });
    }

    let yearId = "";
    let parentSectionId: string | null = null;

    if (parentType === "year") {
      const years = await selectRows<RulesYearRecord>(
        "rules_years",
        {
          columns: "id,title,sort_order",
          filters: [{ column: "id", operator: "eq", value: parentId }],
        },
      );

      if (years.length !== 1) {
        return NextResponse.json({ ok: false, message: "新增位置不存在" }, { status: 400 });
      }

      yearId = parentId;
    } else {
      const parentSections = await selectRows<RulesSectionRecord>(
        "rules_sections",
        {
          columns: "id,year_id,parent_section_id,node_type,title,sort_order",
          filters: [{ column: "id", operator: "eq", value: parentId }],
        },
      );
      const parentSection = parentSections[0];

      if (!parentSection || parentSection.node_type !== "directory") {
        return NextResponse.json(
          { ok: false, message: "规章页面不能作为新增位置" },
          { status: 400 },
        );
      }

      yearId = parentSection.year_id;
      parentSectionId = parentSection.id;
    }

    const siblingSections = await selectRows<RulesSectionRecord>(
      "rules_sections",
      {
        columns: "id,year_id,parent_section_id,node_type,title,sort_order",
        filters: [{ column: "year_id", operator: "eq", value: yearId }],
      },
    );
    const nextSortOrder =
      Math.max(
        0,
        ...siblingSections
          .filter((section) => section.parent_section_id === parentSectionId)
          .map((section) => section.sort_order),
      ) + 1;
    const insertedSections = await insertRows<{ id: string }>(
      "rules_sections",
      {
        year_id: yearId,
        parent_section_id: parentSectionId,
        node_type: isRulesPage ? "page" : "directory",
        title,
        sort_order: nextSortOrder,
      },
    );
    const createdSectionId = insertedSections[0]?.id;

    if (!createdSectionId) {
      throw new Error("CloudBase PG 未返回新建节点编号");
    }

    if (isRulesPage) {
      await seedRulesSectionContent(createdSectionId);
    }

    return NextResponse.json({
      ok: true,
      groups: await loadRulesGroups(),
      created: {
        type: "section",
        id: createdSectionId,
        parentGroupId: yearId,
        parentSectionId,
        kind: isRulesPage ? "page" : "directory",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "新增目录失败",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!hasValidMinisterSession(request)) {
    return NextResponse.json({ ok: false, message: "部长身份无效" }, { status: 401 });
  }

  let body: {
    action?: unknown;
    targetType?: unknown;
    id?: unknown;
    title?: unknown;
    orderedIds?: unknown;
    parentType?: unknown;
    parentId?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
  }

  const action = getTextValue(body.action);
  const targetType = getDirectoryTargetType(body.targetType);
  const id = getTextValue(body.id);
  const title = getTextValue(body.title);
  const orderedIds = getStringArray(body.orderedIds);
  const parentType =
    body.parentType === "year" || body.parentType === "section"
      ? body.parentType
      : "";
  const parentId = getTextValue(body.parentId);

  if (!targetType) {
    return NextResponse.json({ ok: false, message: "目录类型错误" }, { status: 400 });
  }

  if (isLocalTestMode()) {
    try {
      let result:
        | Awaited<ReturnType<typeof renameLocalDirectory>>
        | Awaited<ReturnType<typeof moveLocalDirectory>>
        | Awaited<ReturnType<typeof reorderLocalDirectory>>;
      if (action === "rename") {
        if (!id || !title) {
          return NextResponse.json({ ok: false, message: "请输入新的目录名称" }, { status: 400 });
        }
        result = await renameLocalDirectory("rules", targetType, id, title);
      } else if (action === "move") {
        if (targetType !== "section" || !id || !parentType || !parentId) {
          return NextResponse.json({ ok: false, message: "移动项目或目标位置无效" }, { status: 400 });
        }
        result = await moveLocalDirectory("rules", id, parentType, parentId);
      } else if (action === "reorder") {
        if (orderedIds.length === 0) {
          return NextResponse.json({ ok: false, message: "缺少目录排序信息" }, { status: 400 });
        }
        result = await reorderLocalDirectory("rules", orderedIds);
      } else {
        return NextResponse.json({ ok: false, message: "未知操作" }, { status: 400 });
      }

      if ("error" in result) {
        return NextResponse.json({ ok: false, message: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, groups: result.groups, localTestMode: true });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "更新本地规章目录失败" },
        { status: 500 },
      );
    }
  }

  try {
    if (action === "move") {
      if (targetType !== "section" || !id || !parentType || !parentId) {
        return NextResponse.json(
          { ok: false, message: "移动项目或目标位置无效" },
          { status: 400 },
        );
      }

      const [sectionRows, allSections] = await Promise.all([
        selectRows<RulesSectionRecord>("rules_sections", {
          columns: "id,year_id,parent_section_id,node_type,title,sort_order",
          filters: [{ column: "id", operator: "eq", value: id }],
        }),
        selectRows<RulesSectionRecord>("rules_sections", {
          columns: "id,year_id,parent_section_id,node_type,title,sort_order",
        }),
      ]);
      const movingSection = sectionRows[0];

      if (!movingSection) {
        return NextResponse.json(
          { ok: false, message: "移动项目不存在" },
          { status: 404 },
        );
      }

      let destinationYearId = "";
      let destinationSectionId: string | null = null;

      if (parentType === "year") {
        const destinationYears = await selectRows<RulesYearRecord>(
          "rules_years",
          {
            columns: "id",
            filters: [{ column: "id", operator: "eq", value: parentId }],
          },
        );

        if (destinationYears.length !== 1) {
          return NextResponse.json(
            { ok: false, message: "移动位置不存在" },
            { status: 400 },
          );
        }

        destinationYearId = parentId;
      } else {
        const destinationSection = allSections.find(
          (section) => section.id === parentId,
        );

        if (!destinationSection || destinationSection.node_type !== "directory") {
          return NextResponse.json(
            { ok: false, message: "移动位置必须是有效目录" },
            { status: 400 },
          );
        }

        destinationYearId = destinationSection.year_id;
        destinationSectionId = destinationSection.id;
      }

      const subtreeIds = new Set([movingSection.id]);
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
          { ok: false, message: "不能将目录移动到自身或下级目录" },
          { status: 400 },
        );
      }

      if (
        movingSection.year_id === destinationYearId &&
        movingSection.parent_section_id === destinationSectionId
      ) {
        return NextResponse.json({
          ok: true,
          groups: await loadRulesGroups(),
        });
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
      const descendantIds = [...subtreeIds].filter(
        (sectionId) => sectionId !== movingSection.id,
      );

      if (descendantIds.length > 0 && movingSection.year_id !== destinationYearId) {
        await updateRows(
          "rules_sections",
          { year_id: destinationYearId, updated_at: new Date().toISOString() },
          [{ column: "id", operator: "in", value: descendantIds }],
        );
      }

      try {
        await updateRows(
          "rules_sections",
          {
            year_id: destinationYearId,
            parent_section_id: destinationSectionId,
            sort_order: nextSortOrder,
            updated_at: new Date().toISOString(),
          },
          [{ column: "id", operator: "eq", value: movingSection.id }],
        );
      } catch (error) {
        if (descendantIds.length > 0 && movingSection.year_id !== destinationYearId) {
          await updateRows(
            "rules_sections",
            { year_id: movingSection.year_id, updated_at: new Date().toISOString() },
            [{ column: "id", operator: "in", value: descendantIds }],
          );
        }
        throw error;
      }

      return NextResponse.json({ ok: true, groups: await loadRulesGroups() });
    }

    if (action === "rename") {
      if (!id || !title) {
        return NextResponse.json(
          { ok: false, message: "请输入新的目录名称" },
          { status: 400 },
        );
      }

      await updateRows(
        targetType === "year" ? "rules_years" : "rules_sections",
        { title, updated_at: new Date().toISOString() },
        [{ column: "id", operator: "eq", value: id }],
      );

      return NextResponse.json({ ok: true, groups: await loadRulesGroups() });
    }

    if (action === "reorder") {
      if (orderedIds.length === 0) {
        return NextResponse.json(
          { ok: false, message: "缺少目录排序信息" },
          { status: 400 },
        );
      }

      await Promise.all(
        orderedIds.map((orderedId, index) =>
          updateRows(
            targetType === "year" ? "rules_years" : "rules_sections",
            { sort_order: index + 1, updated_at: new Date().toISOString() },
            [{ column: "id", operator: "eq", value: orderedId }],
          ),
        ),
      );

      return NextResponse.json({ ok: true, groups: await loadRulesGroups() });
    }

    return NextResponse.json({ ok: false, message: "未知操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "更新规章目录失败",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!hasValidMinisterSession(request)) {
    return NextResponse.json({ ok: false, message: "部长身份无效" }, { status: 401 });
  }

  let groupIds: string[] = [];
  let sectionIds: string[] = [];

  try {
    const body = (await request.json()) as {
      groupIds?: unknown;
      sectionIds?: unknown;
    };
    groupIds = getStringArray(body.groupIds);
    sectionIds = getStringArray(body.sectionIds);
  } catch {
    return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
  }

  if (isLocalTestMode()) {
    try {
      const groups = await deleteLocalDirectories("rules", groupIds, sectionIds);
      return NextResponse.json({ ok: true, groups, localTestMode: true });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "删除本地规章目录失败" },
        { status: 500 },
      );
    }
  }

  try {
    if (sectionIds.length > 0) {
      await deleteRows("rules_sections", [
        { column: "id", operator: "in", value: sectionIds },
      ]);
    }

    if (groupIds.length > 0) {
      await deleteRows("rules_years", [
        { column: "id", operator: "in", value: groupIds },
      ]);
    }

    return NextResponse.json({ ok: true, groups: await loadRulesGroups() });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "目录删除失败",
      },
      { status: 500 },
    );
  }
}

