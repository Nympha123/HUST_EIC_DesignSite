import { NextResponse } from "next/server";
import { hasValidMinisterSession } from "@/lib/admin-session";
import { defaultPerformanceTaskTitles } from "@/lib/performance-defaults";
import {
  deleteRows,
  insertRows,
  selectOne,
  selectRows,
  updateRows,
} from "@/lib/cloudbase-pg";
import {
  createLocalPerformanceMember,
  deleteLocalPerformanceMember,
  isLocalTestMode,
  listLocalPerformanceRecords,
  updateLocalPerformanceGrades,
  updateLocalPerformanceMember,
} from "@/lib/local-test-store";

type RulesMemberRecord = {
  id: string;
  section_id: string;
  grade: string;
  member_name: string;
  current_score: string;
  sort_order: number;
};

type RulesTaskRecord = {
  id: string;
  member_id: string;
  title: string;
  sort_order: number;
};

type RulesTask = {
  id: string;
  title: string;
};

type RulesRecord = {
  id: string;
  grade: string;
  memberName: string;
  currentScore: string;
  tasks: RulesTask[];
};

type RulesRecordPatchBody = {
  memberId?: unknown;
  memberIds?: unknown;
  grade?: unknown;
  memberName?: unknown;
  currentScore?: unknown;
  tasks?: unknown;
};

type RulesRecordCreateBody = {
  sectionId?: unknown;
  grade?: unknown;
  beforeMemberId?: unknown;
  afterMemberId?: unknown;
};

type RulesMemberDeleteBody = {
  memberId?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getTextValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function loadRecordsBySection(sectionId: string) {
  const memberRecords = await selectRows<RulesMemberRecord>(
    "rules_members",
    {
      columns: "id,section_id,grade,member_name,current_score,sort_order",
      filters: [{ column: "section_id", operator: "eq", value: sectionId }],
      order: { column: "sort_order" },
    },
  );
  const memberIds = memberRecords.map((member) => member.id);
  let taskRecords: RulesTaskRecord[] = [];

  if (memberIds.length > 0) {
    taskRecords = await selectRows<RulesTaskRecord>("rules_tasks", {
      columns: "id,member_id,title,sort_order",
      filters: [{ column: "member_id", operator: "in", value: memberIds }],
      order: { column: "sort_order" },
    });
  }

  const tasksByMember = new Map<string, RulesTask[]>();

  taskRecords.forEach((task) => {
    const tasks = tasksByMember.get(task.member_id) ?? [];
    tasks.push({ id: task.id, title: task.title });
    tasksByMember.set(task.member_id, tasks);
  });

  return memberRecords.map((member): RulesRecord => ({
    id: member.id,
    grade: member.grade,
    memberName: member.member_name,
    currentScore: member.current_score,
    tasks: tasksByMember.get(member.id) ?? [],
  }));
}

async function loadRecordById(memberId: string) {
  const member = await selectOne<RulesMemberRecord>("rules_members", {
    columns: "id,section_id,grade,member_name,current_score,sort_order",
    filters: [{ column: "id", operator: "eq", value: memberId }],
  });
  const tasks = await selectRows<RulesTaskRecord>("rules_tasks", {
    columns: "id,member_id,title,sort_order",
    filters: [{ column: "member_id", operator: "eq", value: memberId }],
    order: { column: "sort_order" },
  });

  return {
    id: member.id,
    grade: member.grade,
    memberName: member.member_name,
    currentScore: member.current_score,
    tasks: tasks.map((task) => ({ id: task.id, title: task.title })),
  } satisfies RulesRecord;
}

function getTaskTitles(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((task) => {
      if (typeof task === "string") {
        return task.trim();
      }

      if (task && typeof task === "object" && "title" in task) {
        return getTextValue(task.title);
      }

      return "";
    })
    .filter(Boolean);
}

export async function GET(request: Request) {
  const sectionId = new URL(request.url).searchParams.get("sectionId");

  if (!isNonEmptyString(sectionId)) {
    return NextResponse.json(
      { ok: false, message: "缺少规章页面编号" },
      { status: 400 },
    );
  }

  if (isLocalTestMode()) {
    try {
      return NextResponse.json({
        ok: true,
        records: await listLocalPerformanceRecords(sectionId, "rules"),
        localTestMode: true,
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "读取本地规章页面内容失败" },
        { status: 500 },
      );
    }
  }

  try {
    return NextResponse.json({
      ok: true,
      records: await loadRecordsBySection(sectionId),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "读取规章页面内容失败",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!hasValidMinisterSession(request)) {
    return NextResponse.json({ ok: false, message: "部长身份无效" }, { status: 401 });
  }

  let body: RulesRecordCreateBody;

  try {
    body = (await request.json()) as RulesRecordCreateBody;
  } catch {
    return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
  }

  const sectionId = getTextValue(body.sectionId);
  const grade = getTextValue(body.grade);
  const beforeMemberId = getTextValue(body.beforeMemberId);
  const afterMemberId = getTextValue(body.afterMemberId);

  if (!sectionId || !grade || (beforeMemberId && afterMemberId)) {
    return NextResponse.json(
      { ok: false, message: "规章页面、年级或插入位置无效" },
      { status: 400 },
    );
  }

  if (isLocalTestMode()) {
    try {
      const result = await createLocalPerformanceMember(
        sectionId,
        grade,
        beforeMemberId,
        afterMemberId,
        "rules",
      );
      if ("error" in result) {
        return NextResponse.json({ ok: false, message: result.error }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        memberId: result.memberId,
        records: result.records,
        localTestMode: true,
      });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "本地添加成员失败" },
        { status: 500 },
      );
    }
  }

  try {
    const sections = await selectRows<{ id: string; node_type: string }>(
      "rules_sections",
      {
        columns: "id,node_type",
        filters: [{ column: "id", operator: "eq", value: sectionId }],
      },
    );

    if (sections[0]?.node_type !== "page") {
      return NextResponse.json(
        { ok: false, message: "只能在规章页面中添加成员" },
        { status: 400 },
      );
    }

    const members = await selectRows<RulesMemberRecord>(
      "rules_members",
      {
        columns: "id,section_id,grade,member_name,current_score,sort_order",
        filters: [{ column: "section_id", operator: "eq", value: sectionId }],
        order: { column: "sort_order" },
      },
    );

    let insertIndex = members.length;

    if (beforeMemberId || afterMemberId) {
      const anchorId = beforeMemberId || afterMemberId;
      const anchorIndex = members.findIndex((member) => member.id === anchorId);

      if (anchorIndex < 0 || members[anchorIndex].grade !== grade) {
        return NextResponse.json(
          { ok: false, message: "插入位置不属于所选年级" },
          { status: 400 },
        );
      }

      insertIndex = anchorIndex + (afterMemberId ? 1 : 0);
    } else {
      const lastGradeMemberIndex = members.reduce(
        (lastIndex, member, index) => (member.grade === grade ? index : lastIndex),
        -1,
      );

      if (lastGradeMemberIndex >= 0) {
        insertIndex = lastGradeMemberIndex + 1;
      }
    }

    const insertedMembers = await insertRows<{ id: string }>(
      "rules_members",
      {
        section_id: sectionId,
        grade,
        member_name: "",
        current_score: "",
        sort_order: Math.max(0, ...members.map((member) => member.sort_order)) + 1,
      },
    );
    const newMemberId = insertedMembers[0]?.id;

    if (!newMemberId) {
      throw new Error("CloudBase PG 未返回新成员编号");
    }

    try {
      await insertRows(
        "rules_tasks",
        defaultPerformanceTaskTitles.map((title, index) => ({
          member_id: newMemberId,
          title,
          sort_order: index + 1,
        })),
      );

      const orderedIds = members.map((member) => member.id);
      orderedIds.splice(insertIndex, 0, newMemberId);
      await Promise.all(
        orderedIds.map((id, index) =>
          updateRows(
            "rules_members",
            { sort_order: index + 1 },
            [{ column: "id", operator: "eq", value: id }],
          ),
        ),
      );
    } catch (error) {
      await deleteRows("rules_members", [
        { column: "id", operator: "eq", value: newMemberId },
      ]);
      throw error;
    }

    return NextResponse.json({
      ok: true,
      memberId: newMemberId,
      records: await loadRecordsBySection(sectionId),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "添加成员失败",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!hasValidMinisterSession(request)) {
    return NextResponse.json({ ok: false, message: "部长身份无效" }, { status: 401 });
  }

  let body: RulesRecordPatchBody;

  try {
    body = (await request.json()) as RulesRecordPatchBody;
  } catch {
    return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
  }

  const memberId = getTextValue(body.memberId);
  const memberIds = Array.isArray(body.memberIds)
    ? [...new Set(body.memberIds.filter(isNonEmptyString).map((id) => id.trim()))]
    : [];

  if (!memberId && memberIds.length === 0) {
    return NextResponse.json({ ok: false, message: "缺少成员编号" }, { status: 400 });
  }

  if (isLocalTestMode()) {
    try {
      if (memberIds.length > 0) {
        const grade = getTextValue(body.grade);
        if (!grade) {
          return NextResponse.json({ ok: false, message: "年级不能为空" }, { status: 400 });
        }
        const result = await updateLocalPerformanceGrades(memberIds, grade, "rules");
        if ("error" in result) {
          return NextResponse.json({ ok: false, message: result.error }, { status: 400 });
        }
        return NextResponse.json({ ok: true, records: result.records, localTestMode: true });
      }

      const taskTitles = getTaskTitles(body.tasks);
      const result = await updateLocalPerformanceMember(memberId, {
        ...(typeof body.memberName === "string" ? { memberName: body.memberName.trim() } : {}),
        ...(typeof body.currentScore === "string" ? { currentScore: body.currentScore.trim() } : {}),
        ...(taskTitles !== null ? { tasks: taskTitles } : {}),
      }, "rules");
      if (!result) {
        return NextResponse.json({ ok: false, message: "成员记录不存在" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, record: result.record, localTestMode: true });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "保存本地规章内容失败" },
        { status: 500 },
      );
    }
  }

  try {
    if (memberIds.length > 0) {
      const grade = getTextValue(body.grade);

      if (!grade) {
        return NextResponse.json({ ok: false, message: "年级不能为空" }, { status: 400 });
      }

      const members = await selectRows<Pick<RulesMemberRecord, "id" | "section_id">>(
        "rules_members",
        {
          columns: "id,section_id",
          filters: [{ column: "id", operator: "in", value: memberIds }],
        },
      );
      const sectionId = members[0]?.section_id;

      if (
        members.length !== memberIds.length ||
        !sectionId ||
        members.some((member) => member.section_id !== sectionId)
      ) {
        return NextResponse.json(
          { ok: false, message: "年级对应的成员范围无效" },
          { status: 400 },
        );
      }

      await updateRows(
        "rules_members",
        { grade, updated_at: new Date().toISOString() },
        [{ column: "id", operator: "in", value: memberIds }],
      );

      return NextResponse.json({
        ok: true,
        records: await loadRecordsBySection(sectionId),
      });
    }

    const memberUpdates: Record<string, unknown> = {};

    if (typeof body.memberName === "string") {
      memberUpdates.member_name = body.memberName.trim();
    }

    if (typeof body.currentScore === "string") {
      memberUpdates.current_score = body.currentScore.trim();
    }

    if (Object.keys(memberUpdates).length > 0) {
      memberUpdates.updated_at = new Date().toISOString();
      await updateRows("rules_members", memberUpdates, [
        { column: "id", operator: "eq", value: memberId },
      ]);
    }

    const taskTitles = getTaskTitles(body.tasks);

    if (taskTitles) {
      await deleteRows("rules_tasks", [
        { column: "member_id", operator: "eq", value: memberId },
      ]);

      if (taskTitles.length > 0) {
        await insertRows(
          "rules_tasks",
          taskTitles.map((title, index) => ({
            member_id: memberId,
            title,
            sort_order: index + 1,
          })),
        );
      }
    }

    return NextResponse.json({ ok: true, record: await loadRecordById(memberId) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "保存规章页面内容失败",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!hasValidMinisterSession(request)) {
    return NextResponse.json({ ok: false, message: "部长身份无效" }, { status: 401 });
  }

  let body: RulesMemberDeleteBody;

  try {
    body = (await request.json()) as RulesMemberDeleteBody;
  } catch {
    return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
  }

  const memberId = getTextValue(body.memberId);

  if (!memberId) {
    return NextResponse.json({ ok: false, message: "缺少成员编号" }, { status: 400 });
  }

  if (isLocalTestMode()) {
    try {
      const result = await deleteLocalPerformanceMember(memberId, "rules");
      return result
        ? NextResponse.json({ ok: true, records: result.records, localTestMode: true })
        : NextResponse.json({ ok: false, message: "成员记录不存在" }, { status: 404 });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "删除本地成员失败" },
        { status: 500 },
      );
    }
  }

  try {
    const members = await selectRows<Pick<RulesMemberRecord, "id" | "section_id">>(
      "rules_members",
      {
        columns: "id,section_id",
        filters: [{ column: "id", operator: "eq", value: memberId }],
      },
    );
    const sectionId = members[0]?.section_id;

    if (!sectionId) {
      return NextResponse.json({ ok: false, message: "成员记录不存在" }, { status: 404 });
    }

    await deleteRows("rules_members", [
      { column: "id", operator: "eq", value: memberId },
    ]);

    return NextResponse.json({
      ok: true,
      records: await loadRecordsBySection(sectionId),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "删除成员失败",
      },
      { status: 500 },
    );
  }
}

