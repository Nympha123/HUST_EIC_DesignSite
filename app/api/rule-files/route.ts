import { NextResponse } from "next/server";
import { hasValidMinisterSession } from "@/lib/admin-session";
import { deleteRows, insertRows, selectRows } from "@/lib/cloudbase-pg";
import { getStorageObjectUrl } from "@/lib/cloudbase-storage";
import { deleteLocalFile, isLocalTestMode, listLocalFiles, saveLocalFile } from "@/lib/local-test-store";

const storageBucket = "rules";
const maxFileSize = 1024 * 1024 * 1024;

type RuleFileRecord = {
  id: string;
  section_id: string;
  file_name: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
};

function getCloudBaseApiKey() {
  const apiKey =
    process.env.CLOUDBASE_APIKEY?.trim() ?? process.env.CLOUDBASE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("缺少 CLOUDBASE_APIKEY");
  }
  return apiKey;
}

function getTextValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isAllowedRuleFile(file: File) {
  return /\.pdf$/i.test(file.name);
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName.replace(/[\\/\u0000-\u001f]/g, "_").trim();
  return normalized.slice(0, 180) || "未命名文件";
}

function sanitizeStorageFileName(fileName: string) {
  const normalized = fileName
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return normalized.slice(0, 180) || "file";
}

async function storageRequest(storageKey: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${getCloudBaseApiKey()}`);
  return fetch(getStorageObjectUrl(storageBucket, storageKey), {
    ...init,
    cache: "no-store",
    headers,
  });
}

function toClientFile(record: RuleFileRecord) {
  return {
    id: record.id,
    sectionId: record.section_id,
    fileName: record.file_name,
    mimeType: record.mime_type,
    sizeBytes: Number(record.size_bytes),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    previewUrl: `/api/rule-files/preview/${record.id}`,
  };
}

export async function GET(request: Request) {
  const sectionId = getTextValue(new URL(request.url).searchParams.get("sectionId"));
  if (!sectionId) {
    return NextResponse.json({ ok: false, message: "缺少规章页面编号" }, { status: 400 });
  }

  if (isLocalTestMode()) {
    try {
      return NextResponse.json({ ok: true, files: await listLocalFiles("rules", sectionId), localTestMode: true });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "读取本地规章文件失败" },
        { status: 500 },
      );
    }
  }

  try {
    const records = await selectRows<RuleFileRecord>("rules_files", {
      columns: "id,section_id,file_name,storage_key,mime_type,size_bytes,created_at,updated_at",
      filters: [{ column: "section_id", operator: "eq", value: sectionId }],
      order: { column: "created_at", ascending: false },
    });
    return NextResponse.json({
      ok: true,
      files: records.filter((record) => /\.pdf$/i.test(record.file_name)).map(toClientFile),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "读取规章文件失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!hasValidMinisterSession(request)) {
    return NextResponse.json({ ok: false, message: "部长身份无效" }, { status: 401 });
  }

  const formData = await request.formData();
  const sectionId = getTextValue(formData.get("sectionId"));
  const uploaded = formData.get("file");

  if (!sectionId || !(uploaded instanceof File)) {
    return NextResponse.json({ ok: false, message: "请选择要上传的文件" }, { status: 400 });
  }

  if (!isAllowedRuleFile(uploaded)) {
    return NextResponse.json({ ok: false, message: "部门规章仅支持 PDF 文件" }, { status: 400 });
  }

  if (isLocalTestMode()) {
    try {
      return NextResponse.json({ ok: true, file: await saveLocalFile("rules", sectionId, uploaded), localTestMode: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "本地规章文件上传失败";
      const status = /大小|有效的页面/.test(message) ? 400 : 500;
      return NextResponse.json({ ok: false, message }, { status });
    }
  }

  if (uploaded.size <= 0 || uploaded.size > maxFileSize) {
    return NextResponse.json({ ok: false, message: "文件大小必须大于 0 且不超过 1 GB" }, { status: 400 });
  }

  const fileName = sanitizeFileName(uploaded.name);
  const storageKey = `${sectionId}/${crypto.randomUUID()}-${sanitizeStorageFileName(fileName)}`;

  try {
    const uploadResponse = await storageRequest(storageKey, {
      method: "POST",
      headers: {
        "Content-Type": uploaded.type || "application/octet-stream",
        "Content-Length": String(uploaded.size),
      },
      body: await uploaded.arrayBuffer(),
    });

    if (!uploadResponse.ok) {
      const message = await uploadResponse.text();
      throw new Error(message || `CloudBase 存储上传失败（HTTP ${uploadResponse.status}）`);
    }

    const inserted = await insertRows<RuleFileRecord>("rules_files", {
      section_id: sectionId,
      file_name: fileName,
      storage_key: storageKey,
      mime_type: uploaded.type || "application/octet-stream",
      size_bytes: uploaded.size,
    });
    const record = inserted[0];

    if (!record) {
      await storageRequest(storageKey, { method: "DELETE" });
      throw new Error("规章文件记录创建失败");
    }

    return NextResponse.json({ ok: true, file: toClientFile(record) });
  } catch (error) {
    try {
      await storageRequest(storageKey, { method: "DELETE" });
    } catch {
      // Keep the original upload/database error visible to the caller.
    }
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "上传规章文件失败" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!hasValidMinisterSession(request)) {
    return NextResponse.json({ ok: false, message: "部长身份无效" }, { status: 401 });
  }

  const body = (await request.json()) as { id?: unknown };
  const id = getTextValue(body.id);
  if (!id) {
    return NextResponse.json({ ok: false, message: "缺少文件编号" }, { status: 400 });
  }

  if (isLocalTestMode()) {
    try {
      const deleted = await deleteLocalFile("rules", id);
      return deleted
        ? NextResponse.json({ ok: true, localTestMode: true })
        : NextResponse.json({ ok: false, message: "文件不存在" }, { status: 404 });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "删除本地规章文件失败" },
        { status: 500 },
      );
    }
  }

  try {
    const records = await selectRows<RuleFileRecord>("rules_files", {
      columns: "id,section_id,file_name,storage_key,mime_type,size_bytes,created_at,updated_at",
      filters: [{ column: "id", operator: "eq", value: id }],
    });
    const record = records[0];
    if (!record) {
      return NextResponse.json({ ok: false, message: "文件不存在" }, { status: 404 });
    }

    const storageResponse = await storageRequest(record.storage_key, { method: "DELETE" });
    if (!storageResponse.ok && storageResponse.status !== 404) {
      throw new Error(`CloudBase 存储删除失败（HTTP ${storageResponse.status}）`);
    }

    await deleteRows("rules_files", [{ column: "id", operator: "eq", value: id }]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "删除规章文件失败" },
      { status: 500 },
    );
  }
}


