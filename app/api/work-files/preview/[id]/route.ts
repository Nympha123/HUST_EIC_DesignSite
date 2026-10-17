import { NextResponse } from "next/server";
import { selectRows } from "@/lib/cloudbase-pg";
import { getStorageObjectUrl } from "@/lib/cloudbase-storage";
import { getLocalFile, isLocalTestMode } from "@/lib/local-test-store";

type WorkFileRecord = {
  id: string;
  storage_key: string;
  file_name: string;
  mime_type: string;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (isLocalTestMode()) {
    try {
      const result = await getLocalFile("works", id);
      if (!result) return NextResponse.json({ ok: false, message: "文件不存在" }, { status: 404 });
      const headers = new Headers({
        "Content-Type": result.file.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(result.file.fileName)}`,
        "Cache-Control": "no-store",
      });
      return new Response(new Uint8Array(result.body), { status: 200, headers });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "本地文件预览读取失败" },
        { status: 500 },
      );
    }
  }

  try {
    const records = await selectRows<WorkFileRecord>("works_files", {
      columns: "id,storage_key,file_name,mime_type",
      filters: [{ column: "id", operator: "eq", value: id }],
    });
    const record = records[0];
    if (!record) {
      return NextResponse.json({ ok: false, message: "文件不存在" }, { status: 404 });
    }

    const apiKey = process.env.CLOUDBASE_APIKEY?.trim() ?? process.env.CLOUDBASE_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("缺少 CLOUDBASE_APIKEY");
    }
    const response = await fetch(getStorageObjectUrl("works", record.storage_key), {
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok || !response.body) {
      return NextResponse.json({ ok: false, message: "文件预览读取失败" }, { status: response.status || 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", record.mime_type || "application/octet-stream");
    headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(record.file_name)}`);
    headers.set("Cache-Control", "private, max-age=300");
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "文件预览读取失败" },
      { status: 500 },
    );
  }
}
