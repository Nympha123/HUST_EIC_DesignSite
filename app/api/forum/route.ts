import { NextResponse } from "next/server";
import {
  createLocalForumPost,
  createLocalForumReply,
  isLocalTestMode,
  listLocalForumPosts,
  listLocalForumReplies,
} from "@/lib/local-test-store";
import { insertRows, selectRows } from "@/lib/cloudbase-pg";

export const dynamic = "force-dynamic";

type ForumPost = {
  id: string;
  author_name: string;
  title: string;
  content: string;
  created_at: string;
};

type ForumReply = {
  id: string;
  post_id: string;
  author_name: string;
  content: string;
  created_at: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length <= maxLength ? text : "";
}

function requestBodyError(body: Record<string, unknown>) {
  const authorName = cleanText(body.authorName, 32);
  const content = cleanText(body.content, 4000);
  if (authorName.length < 2 || !authorName) return "昵称需填写 2 至 32 个字符";
  if (content.length < 2 || !content) return "内容需填写 2 至 4000 个字符";
  return "";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("postId");

  if (postId) {
    if (!uuidPattern.test(postId)) {
      return NextResponse.json({ ok: false, message: "主题编号无效" }, { status: 400 });
    }
    try {
      if (isLocalTestMode()) {
        const replies = await listLocalForumReplies(postId);
        const post = (await listLocalForumPosts()).find((item) => item.id === postId);
        if (!post) return NextResponse.json({ ok: false, message: "主题不存在" }, { status: 404 });
        return NextResponse.json({ ok: true, post, replies, localTestMode: true });
      }
      const posts = await selectRows<ForumPost>("forum_posts", {
        columns: "id,author_name,title,content,created_at",
        filters: [{ column: "id", operator: "eq", value: postId }],
        limit: 1,
      });
      if (!posts[0]) return NextResponse.json({ ok: false, message: "主题不存在" }, { status: 404 });
      const replies = await selectRows<ForumReply>("forum_replies", {
        columns: "id,post_id,author_name,content,created_at",
        filters: [{ column: "post_id", operator: "eq", value: postId }],
        order: { column: "created_at" },
        limit: 200,
      });
      return NextResponse.json({ ok: true, post: posts[0], replies });
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "读取主题失败" },
        { status: 500 },
      );
    }
  }

  try {
    if (isLocalTestMode()) {
      return NextResponse.json({ ok: true, posts: await listLocalForumPosts(), localTestMode: true });
    }
    const posts = await selectRows<ForumPost>("forum_posts", {
      columns: "id,author_name,title,content,created_at",
      order: { column: "created_at", ascending: false },
      limit: 50,
    });
    const ids = posts.map((post) => post.id);
    const replies = ids.length
      ? await selectRows<{ post_id: string }>("forum_replies", {
          columns: "post_id",
          filters: [{ column: "post_id", operator: "in", value: ids }],
          limit: 1000,
        })
      : [];
    const counts = new Map<string, number>();
    replies.forEach(({ post_id }) => counts.set(post_id, (counts.get(post_id) ?? 0) + 1));
    return NextResponse.json({
      ok: true,
      posts: posts.map((post) => ({ ...post, reply_count: counts.get(post.id) ?? 0 })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "读取论坛列表失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) {
    return NextResponse.json({ ok: false, message: "提交内容过长" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
  }

  const action = body.action === "reply" ? "reply" : "post";
  const authorName = cleanText(body.authorName, 32);
  const content = cleanText(body.content, 4000);
  const title = cleanText(body.title, 120);
  const postId = cleanText(body.postId, 64);
  const error = requestBodyError({ authorName, content });
  if (error) return NextResponse.json({ ok: false, message: error }, { status: 400 });
  if (action === "post" && (title.length < 2 || !title)) {
    return NextResponse.json({ ok: false, message: "标题需填写 2 至 120 个字符" }, { status: 400 });
  }
  if (action === "reply" && !uuidPattern.test(postId)) {
    return NextResponse.json({ ok: false, message: "主题编号无效" }, { status: 400 });
  }

  try {
    if (isLocalTestMode()) {
      if (action === "post") {
        const post = await createLocalForumPost({ authorName, title, content });
        return NextResponse.json({ ok: true, post, localTestMode: true }, { status: 201 });
      }
      const reply = await createLocalForumReply({ postId, authorName, content });
      if (!reply) return NextResponse.json({ ok: false, message: "主题不存在" }, { status: 404 });
      return NextResponse.json({ ok: true, reply, localTestMode: true }, { status: 201 });
    }

    if (action === "post") {
      const inserted = await insertRows<ForumPost>("forum_posts", { author_name: authorName, title, content });
      if (!inserted[0]) throw new Error("数据库未返回新主题");
      return NextResponse.json({ ok: true, post: inserted[0] }, { status: 201 });
    }
    const inserted = await insertRows<ForumReply>("forum_replies", {
      post_id: postId,
      author_name: authorName,
      content,
    });
    if (!inserted[0]) throw new Error("数据库未返回新回复");
    return NextResponse.json({ ok: true, reply: inserted[0] }, { status: 201 });
  } catch (caught) {
    return NextResponse.json(
      { ok: false, message: caught instanceof Error ? caught.message : "提交失败" },
      { status: 500 },
    );
  }
}
