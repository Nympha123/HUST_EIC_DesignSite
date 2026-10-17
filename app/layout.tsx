import type { Metadata } from "next";
import TopBar from "./components/TopBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "部门任务记录与文件中心",
  description: "部门作品展示、任务记录、文件下载与部长管理入口",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <TopBar />
        {children}
      </body>
    </html>
  );
}
