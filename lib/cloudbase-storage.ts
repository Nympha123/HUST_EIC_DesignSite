import "server-only";

export function getStorageObjectUrl(bucket: string, storageKey: string) {
  const configuredBaseUrl = process.env.CLOUDBASE_PG_API_BASE_URL?.trim();
  const envId = process.env.CLOUDBASE_ENV_ID?.trim();
  const baseUrl = configuredBaseUrl
    ? configuredBaseUrl.replace(/\/+$/, "")
    : envId
      ? `https://${envId}.api.tcloudbasegateway.com`
      : null;

  if (!baseUrl) {
    throw new Error("缺少 CLOUDBASE_ENV_ID");
  }

  return `${baseUrl}/v1/storages/object/${encodeURIComponent(bucket)}/${storageKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}
