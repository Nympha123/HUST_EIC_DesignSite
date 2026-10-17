"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type ForumPost = {
  id: string;
  author_name: string;
  title: string;
  content: string;
  created_at: string;
  reply_count?: number;
};

type ForumReply = {
  id: string;
  post_id: string;
  author_name: string;
  content: string;
  created_at: string;
};

type ApiResult = {
  ok?: boolean;
  message?: string;
  posts?: ForumPost[];
  post?: ForumPost;
  replies?: ForumReply[];
  reply?: ForumReply;
};

function displayTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getErrorMessage(payload: ApiResult, fallback: string) {
  return typeof payload.message === "string" ? payload.message : fallback;
}

export default function MailboxPage() {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [nickname, setNickname] = useState("");
  const [title, setTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [replyContent, setReplyContent] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadThread = useCallback(async (postId: string) => {
    try {
      const response = await fetch(`/api/forum?postId=${encodeURIComponent(postId)}`, { cache: "no-store" });
      const payload = (await response.json()) as ApiResult;
      if (!response.ok || !payload.post || !Array.isArray(payload.replies)) {
        throw new Error(getErrorMessage(payload, "读取讨论详情失败"));
      }
      setSelectedPost(payload.post);
      setReplies(payload.replies);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取讨论详情失败");
    }
  }, []);

  const loadPosts = useCallback(async (preferredId?: string) => {
    try {
      const response = await fetch("/api/forum", { cache: "no-store" });
      const payload = (await response.json()) as ApiResult;
      if (!response.ok || !Array.isArray(payload.posts)) {
        throw new Error(getErrorMessage(payload, "读取论坛失败"));
      }
      setPosts(payload.posts);
      const next = payload.posts.find((post) => post.id === preferredId) ?? payload.posts[0] ?? null;
      setSelectedPost(next);
      if (next) await loadThread(next.id);
      else setReplies([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取论坛失败");
    } finally {
      setIsLoading(false);
    }
  }, [loadThread]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadPosts(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadPosts]);

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorName: nickname, title, content: postContent }),
      });
      const payload = (await response.json()) as ApiResult;
      if (!response.ok || !payload.post) throw new Error(getErrorMessage(payload, "发布主题失败"));
      setTitle("");
      setPostContent("");
      setIsCreating(false);
      setNotice("主题已发布");
      await loadPosts(payload.post.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发布主题失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPost) return;
    setIsSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", postId: selectedPost.id, authorName: nickname, content: replyContent }),
      });
      const payload = (await response.json()) as ApiResult;
      if (!response.ok || !payload.reply) throw new Error(getErrorMessage(payload, "回复失败"));
      setReplyContent("");
      setNotice("回复已发布");
      await Promise.all([loadThread(selectedPost.id), loadPosts(selectedPost.id)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "回复失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-slate-50 px-4 py-7 sm:px-7">
      <section className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">部门论坛</h1>
            <p className="mt-2 text-sm text-slate-600">问题交流与讨论</p>
          </div>
          <button
            type="button"
            onClick={() => { setIsCreating((value) => !value); setError(""); setNotice(""); }}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            {isCreating ? "取消提问" : "发布问题"}
          </button>
        </div>

        {isCreating && (
          <form onSubmit={submitPost} className="mb-5 grid gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:px-5">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                昵称
                <input required minLength={2} maxLength={32} value={nickname} onChange={(event) => setNickname(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="填写显示昵称" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                问题标题
                <input required minLength={2} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="简要概括问题" />
              </label>
            </div>
            <div className="flex flex-col">
              <label className="flex-1 text-sm font-medium text-slate-700">
                问题描述
                <textarea required minLength={2} maxLength={4000} value={postContent} onChange={(event) => setPostContent(event.target.value)} className="mt-1.5 min-h-28 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="描述问题或补充背景" />
              </label>
              <div className="mt-3 flex justify-end">
                <button disabled={isSubmitting} className="h-9 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? "发布中..." : "发布问题"}</button>
              </div>
            </div>
          </form>
        )}

        {(error || notice) && (
          <div role={error ? "alert" : "status"} className={`mb-4 border-l-4 px-3 py-2 text-sm ${error ? "border-rose-500 bg-rose-50 text-rose-800" : "border-emerald-500 bg-emerald-50 text-emerald-800"}`}>
            {error || notice}
          </div>
        )}

        <div className="grid min-h-[62vh] overflow-hidden border border-slate-200 bg-white md:grid-cols-[minmax(250px,0.78fr)_minmax(0,1.6fr)]">
          <aside className="border-b border-slate-200 md:border-b-0 md:border-r">
            <div className="flex h-12 items-center justify-between border-b border-slate-200 px-4">
              <h2 className="text-sm font-semibold text-slate-800">问题列表</h2>
              <span className="text-xs text-slate-500">{posts.length} 个主题</span>
            </div>
            <div className="max-h-[62vh] overflow-y-auto">
              {isLoading ? (
                <p className="px-4 py-8 text-sm text-slate-500">正在读取...</p>
              ) : posts.length === 0 ? (
                <div className="px-4 py-9 text-sm text-slate-500">暂无问题</div>
              ) : posts.map((post) => (
                <button key={post.id} type="button" onClick={() => { setError(""); setNotice(""); void loadThread(post.id); }} className={`block w-full border-b border-slate-100 px-4 py-3.5 text-left transition hover:bg-sky-50 ${selectedPost?.id === post.id ? "bg-sky-50 ring-inset ring-2 ring-sky-200" : ""}`}>
                  <span className="block truncate text-sm font-semibold text-slate-900">{post.title}</span>
                  <span className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="truncate">{post.author_name} · {displayTime(post.created_at)}</span>
                    <span className="shrink-0 text-sky-700">{post.reply_count ?? 0} 条回复</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="flex min-h-[50vh] min-w-0 flex-col">
            {selectedPost ? (
              <>
                <article className="border-b border-slate-200 px-5 py-5 sm:px-7">
                  <h2 className="break-words text-xl font-bold text-slate-950">{selectedPost.title}</h2>
                  <p className="mt-2 text-xs text-slate-500">{selectedPost.author_name} · {displayTime(selectedPost.created_at)}</p>
                  <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{selectedPost.content}</p>
                </article>
                <div className="flex-1 px-5 py-4 sm:px-7">
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">回复（{replies.length}）</h3>
                  {replies.length === 0 ? (
                    <p className="border-t border-slate-100 py-4 text-sm text-slate-500">还没有回复</p>
                  ) : (
                    <div className="divide-y divide-slate-100 border-y border-slate-100">
                      {replies.map((reply) => (
                        <article key={reply.id} className="py-3.5">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-800">{reply.author_name}</span>
                            <time className="text-xs text-slate-500">{displayTime(reply.created_at)}</time>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{reply.content}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
                <form onSubmit={submitReply} className="border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-7">
                  <div className="grid gap-3 sm:grid-cols-[190px_minmax(0,1fr)_auto] sm:items-end">
                    <label className="text-sm font-medium text-slate-700">
                      昵称
                      <input required minLength={2} maxLength={32} value={nickname} onChange={(event) => setNickname(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="填写显示昵称" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      回复内容
                      <textarea required minLength={2} maxLength={4000} value={replyContent} onChange={(event) => setReplyContent(event.target.value)} className="mt-1.5 min-h-10 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" placeholder="写下回复" />
                    </label>
                    <button disabled={isSubmitting} className="h-10 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? "提交中..." : "回复"}</button>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center px-6 py-16 text-sm text-slate-500">
                {isLoading ? "" : "选择一个问题查看讨论"}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
