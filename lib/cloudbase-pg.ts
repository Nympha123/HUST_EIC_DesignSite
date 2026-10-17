import "server-only";

type JsonObject = Record<string, unknown>;
type Scalar = string | number | boolean;

export type PgFilter =
  | { column: string; operator: "eq"; value: Scalar }
  | { column: string; operator: "in"; value: readonly Scalar[] };

export type PgOrder = {
  column: string;
  ascending?: boolean;
};

type SelectOptions = {
  columns?: string;
  filters?: readonly PgFilter[];
  order?: PgOrder;
  limit?: number;
};

function getRequiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`缺少 ${name}`);
  }

  return value;
}

function getApiBaseUrl() {
  const configuredBaseUrl = process.env.CLOUDBASE_PG_API_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  const envId = getRequiredEnvironmentVariable("CLOUDBASE_ENV_ID");

  return `https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest`;
}

function assertSafeTableName(tableName: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
    throw new Error("CloudBase PG 表名不合法");
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatErrorPayload(payload: unknown, fallback: string) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  if (isJsonObject(payload)) {
    const messages = ["message", "error", "details", "hint", "code"]
      .map((key) => payload[key])
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
      .map((value) => value.trim());

    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  return fallback;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getRows<T>(payload: unknown): T[] {
  if (payload === null) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (isJsonObject(payload)) {
    const data = payload.data;

    if (Array.isArray(data)) {
      return data as T[];
    }

    if (isJsonObject(data)) {
      return [data as T];
    }

    if ("id" in payload) {
      return [payload as T];
    }
  }

  throw new Error("CloudBase PG 返回数据格式错误");
}

function addFilters(searchParams: URLSearchParams, filters: readonly PgFilter[]) {
  filters.forEach((filter) => {
    if (filter.operator === "eq") {
      searchParams.set(filter.column, `eq.${String(filter.value)}`);
      return;
    }

    if (filter.value.length === 0) {
      throw new Error("CloudBase PG in 查询不能为空");
    }

    searchParams.set(
      filter.column,
      `in.(${filter.value.map((value) => String(value)).join(",")})`,
    );
  });
}

async function requestTable(
  tableName: string,
  init: RequestInit,
  searchParams?: URLSearchParams,
) {
  assertSafeTableName(tableName);

  const url = new URL(`${getApiBaseUrl()}/${tableName}`);

  if (searchParams) {
    url.search = searchParams.toString();
  }

  const apiKey =
    process.env.CLOUDBASE_APIKEY?.trim() ??
    process.env.CLOUDBASE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("缺少 CLOUDBASE_APIKEY");
  }

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${apiKey}`);

  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers,
  });
  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw new Error(
      formatErrorPayload(
        payload,
        `CloudBase PG 请求失败（HTTP ${response.status}）`,
      ),
    );
  }

  return payload;
}

export async function selectRows<T>(
  tableName: string,
  options: SelectOptions = {},
): Promise<T[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("select", options.columns ?? "*");

  addFilters(searchParams, options.filters ?? []);

  if (options.order) {
    searchParams.set(
      "order",
      `${options.order.column}.${options.order.ascending === false ? "desc" : "asc"}`,
    );
  }

  if (options.limit !== undefined) {
    if (!Number.isInteger(options.limit) || options.limit < 1) {
      throw new Error("CloudBase PG 查询数量上限无效");
    }
    searchParams.set("limit", String(options.limit));
  }

  return getRows<T>(await requestTable(tableName, { method: "GET" }, searchParams));
}

export async function selectOne<T>(
  tableName: string,
  options: SelectOptions = {},
): Promise<T> {
  const rows = await selectRows<T>(tableName, options);

  if (rows.length !== 1) {
    throw new Error("CloudBase PG 未找到唯一记录");
  }

  return rows[0];
}

export async function insertRows<T>(
  tableName: string,
  rows: JsonObject | readonly JsonObject[],
): Promise<T[]> {
  const payload = await requestTable(tableName, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(rows),
  });

  return getRows<T>(payload);
}

export async function updateRows(
  tableName: string,
  values: JsonObject,
  filters: readonly PgFilter[],
) {
  const searchParams = new URLSearchParams();
  addFilters(searchParams, filters);

  await requestTable(
    tableName,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(values),
    },
    searchParams,
  );
}

export async function deleteRows(
  tableName: string,
  filters: readonly PgFilter[],
) {
  const searchParams = new URLSearchParams();
  addFilters(searchParams, filters);

  await requestTable(tableName, { method: "DELETE" }, searchParams);
}
