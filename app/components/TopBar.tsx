"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const roleStorageKey = "eic-current-role";

async function getVerifiedRole() {
  const response = await fetch("/api/admin-auth", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = (await response.json()) as { isMinister?: unknown };

  return response.ok && data.isMinister === true ? "部长" : "部员";
}

export default function TopBar() {
  const [role, setRole] = useState("部员");
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [adminModalMode, setAdminModalMode] = useState<"auth" | "exit" | null>(
    null,
  );
  const [permissionCode, setPermissionCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [isCheckingCode, setIsCheckingCode] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function refreshRole() {
      try {
        const verifiedRole = await getVerifiedRole();

        if (!isMounted) {
          return;
        }

        setRole(verifiedRole);

        if (verifiedRole === "部长") {
          window.localStorage.setItem(roleStorageKey, "minister");
        } else {
          window.localStorage.removeItem(roleStorageKey);
        }
      } catch {
        if (!isMounted) {
          return;
        }

        setRole("部员");
        window.localStorage.removeItem(roleStorageKey);
      }
    }

    function handleRoleChange() {
      void refreshRole();
    }

    void refreshRole();
    window.addEventListener("storage", handleRoleChange);
    window.addEventListener("eic-role-updated", handleRoleChange);

    return () => {
      isMounted = false;
      window.removeEventListener("storage", handleRoleChange);
      window.removeEventListener("eic-role-updated", handleRoleChange);
    };
  }, []);

  function closeAdminModal() {
    setAdminModalMode(null);
    setPermissionCode("");
    setAuthError("");
  }

  async function confirmPermissionCode() {
    setAuthError("");
    setIsCheckingCode(true);

    try {
      const response = await fetch("/api/admin-auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: permissionCode }),
      });

      if (!response.ok) {
        throw new Error("invalid permission code");
      }

      window.localStorage.setItem(roleStorageKey, "minister");
      window.dispatchEvent(new Event("eic-role-updated"));
      closeAdminModal();
    } catch {
      setPermissionCode("");
      setAuthError("输入错误");
    } finally {
      setIsCheckingCode(false);
    }
  }

  async function exitMinisterMode() {
    await fetch("/api/admin-auth", { method: "DELETE" });
    window.localStorage.removeItem(roleStorageKey);
    window.dispatchEvent(new Event("eic-role-updated"));
    closeAdminModal();
  }

  return (
    <>
      <header
        className="sticky top-0 z-50 min-h-14 shadow-sm"
        style={{
          background:
            "linear-gradient(90deg, #78c7e8 0%, #2aaee3 55%, #159fda 100%)",
        }}
      >
        <nav className="flex min-h-14 items-center gap-3 overflow-hidden px-3 text-white sm:justify-between sm:px-6">
          <div className="flex min-w-0 shrink-0 items-center justify-start gap-2 sm:gap-8">
            <button
              className="text-lg font-bold tracking-wide text-white transition hover:text-white/85 sm:text-xl"
              type="button"
              onClick={() => setIsSupportModalOpen(true)}
            >
              EIC
            </button>

            <Link
              href="/"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-white/15"
              aria-label="返回首页"
              title="返回首页"
            >
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 10.5 12 3l8 7.5"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.75 9.5v9.25c0 .69.56 1.25 1.25 1.25h8c.69 0 1.25-.56 1.25-1.25V9.5"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 20v-5.25c0-.41.34-.75.75-.75h2.5c.41 0 .75.34.75.75V20"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>

            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-white/15"
              type="button"
              onClick={() =>
                setAdminModalMode(role === "部长" ? "exit" : "auth")
              }
              aria-label="部长管理"
              title="部长管理"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M8 7.5V6a4 4 0 0 1 8 0v1.5M5.5 7.5h13a1.5 1.5 0 0 1 1.5 1.5v9.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a1.5 1.5 0 0 1 1.5-1.5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8.5 12h7M12 9.5v5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <Link
              href="/mailbox"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-white/15"
              aria-label="部门论坛"
              title="部门论坛"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M20.25 11.4a7.5 7.5 0 0 1-7.5 7.5H7l-3.25 2v-5.1a7.5 7.5 0 1 1 16.5-4.4Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="8.5" cy="11.5" r=".75" fill="currentColor" />
                <circle cx="12.75" cy="11.5" r=".75" fill="currentColor" />
                <circle cx="17" cy="11.5" r=".75" fill="currentColor" />
              </svg>
            </Link>

          </div>

          <div className="shrink-0 rounded-full bg-white/14 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm ring-1 ring-white/22 backdrop-blur sm:px-4 sm:text-sm">
            <span className="hidden sm:inline">当前访问身份：</span>
            {role}
          </div>
        </nav>
      </header>

      {isSupportModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm">
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-950/10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-modal-title"
          >
            <div
              className="flex h-14 items-center justify-between px-6 text-white"
              style={{
                background:
                  "linear-gradient(90deg, #78c7e8 0%, #2aaee3 55%, #159fda 100%)",
              }}
            >
              <h2 id="support-modal-title" className="text-base font-semibold">
                故障查询与联系
              </h2>
              <button
                aria-label="关闭"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white transition hover:bg-white/15"
                type="button"
                onClick={() => setIsSupportModalOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="px-6 py-6 text-sm leading-7 text-slate-700">
              <p className="mb-4 font-medium text-slate-900">
                若网页出现故障，可通过下示途径查询原始工程或联系开发者：
              </p>
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p>
                  <span className="font-semibold text-slate-900">
                    1. github源工程文件：
                  </span>
                  <span className="text-slate-500">留空</span>
                </p>
                <p>
                  <span className="font-semibold text-slate-900">2. 邮箱：</span>
                  <span className="text-slate-700">3068553359@qq.com</span>
                </p>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                className="rounded-lg bg-[#159fda] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#128ec3]"
                type="button"
                onClick={() => setIsSupportModalOpen(false)}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {adminModalMode && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm">
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-950/10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-auth-title"
          >
            <div
              className="flex h-14 items-center justify-between px-6 text-white"
              style={{
                background:
                  "linear-gradient(90deg, #78c7e8 0%, #2aaee3 55%, #159fda 100%)",
              }}
            >
              <h2 id="admin-auth-title" className="text-base font-semibold">
                {adminModalMode === "auth" ? "部长权限认证" : "部长模式"}
              </h2>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-2xl leading-none text-white transition hover:bg-white/15"
                type="button"
                onClick={closeAdminModal}
                aria-label="关闭弹窗"
              >
                ×
              </button>
            </div>

            {adminModalMode === "auth" ? (
              <>
                <div className="px-6 py-7">
                  <label
                    className="block text-sm font-semibold text-slate-800"
                    htmlFor="permission-code"
                  >
                    请输入权限码
                  </label>
                  <input
                    id="permission-code"
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    type="password"
                    value={permissionCode}
                    onChange={(event) => {
                      setPermissionCode(event.target.value);
                      setAuthError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void confirmPermissionCode();
                      }
                    }}
                    placeholder="输入部长权限码"
                    autoFocus
                  />
                  {authError && (
                    <p className="mt-3 text-sm font-medium text-red-600">
                      {authError}
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                  <button
                    className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                    type="button"
                    onClick={closeAdminModal}
                  >
                    取消
                  </button>
                  <button
                    className="rounded-lg bg-[#78c7e8] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5db7df] disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => void confirmPermissionCode()}
                    disabled={isCheckingCode}
                  >
                    {isCheckingCode ? "确认中" : "确认"}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex justify-end gap-3 bg-slate-50 px-6 py-6">
                <button
                  className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                  type="button"
                  onClick={closeAdminModal}
                >
                  取消
                </button>
                <button
                  className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                  type="button"
                  onClick={() => void exitMinisterMode()}
                >
                  退出部长模式
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
