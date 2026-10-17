"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

const showcaseItems = [
  {
    title: "校园活动策划展示",
    image: "/works/showcase-activity.svg",
  },
  {
    title: "部门宣传物料整理",
    image: "/works/showcase-design.svg",
  },
  {
    title: "任务协作成果归档",
    image: "/works/showcase-archive.svg",
  },
];

type NavigationCard = {
  label: string;
  labelColor: string;
  title: string;
  description: string;
  href: string;
};

const navigationCards: NavigationCard[] = [
  {
    href: "/rules",
    label: "Department Rules",
    labelColor: "text-emerald-600",
    title: "部门规章",
    description: "集中查看部门制度、值班规范、流程说明和常用要求。",
  },
  {
    href: "/performance",
    label: "Performance Notice",
    labelColor: "text-blue-600",
    title: "绩效公示",
    description: "公示部门成员绩效记录、完成情况和阶段性评价。",
  },
  {
    href: "/materials",
    label: "Material Library",
    labelColor: "text-orange-600",
    title: "素材管理",
    description: "整理图片、模板、推文素材和设计资源，便于统一调用。",
  },
  {
    href: "/works",
    label: "Past Works",
    labelColor: "text-rose-600",
    title: "往期作品",
    description: "展示部门历史活动成果、宣传作品和优秀案例归档。",
  },
  {
    href: "/calendar",
    label: "Work Calendar",
    labelColor: "text-teal-600",
    title: "工作年历",
    description: "按年度查看部门工作安排、重要节点和活动计划。",
  },
  {
    href: "/tools",
    label: "Tool Navigation",
    labelColor: "text-cyan-600",
    title: "工具导航",
    description: "集中访问部门常用工具和辅助功能。",
  },
];

export default function HomePage() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % showcaseItems.length);
    }, 4500);

    return () => window.clearInterval(timer);
  }, []);

  function showPrevious() {
    setActiveIndex((current) =>
      current === 0 ? showcaseItems.length - 1 : current - 1,
    );
  }

  function showNext() {
    setActiveIndex((current) => (current + 1) % showcaseItems.length);
  }

  function renderNavigationCard(card: NavigationCard) {
    const cardClassName =
      "flex h-full flex-col items-start justify-start rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md";

    const cardContent = (
      <>
        <p className={`text-sm font-medium ${card.labelColor}`}>
          {card.label}
        </p>
        <h2 className="mt-3 text-xl font-semibold">{card.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {card.description}
        </p>
      </>
    );

    return (
      <Link href={card.href} className={cardClassName} key={card.title}>
        {cardContent}
      </Link>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto max-w-6xl px-5 py-8 sm:px-6 lg:py-10">
        <div className="overflow-hidden rounded-3xl bg-slate-950 shadow-2xl ring-1 ring-slate-200">
          <div className="relative min-h-[520px]">
            {showcaseItems.map((item, index) => (
              <article
                className={`absolute inset-0 transition-opacity duration-700 ${
                  index === activeIndex ? "opacity-100" : "opacity-0"
                }`}
                key={item.title}
                aria-hidden={index !== activeIndex}
              >
                <Image
                  src={item.image}
                  alt={item.title}
                  fill
                  priority={index === 0}
                  sizes="(max-width: 768px) 100vw, 1152px"
                  className="object-cover"
                />
              </article>
            ))}

            <div className="absolute bottom-6 right-6 z-20 rounded-full border border-white/25 bg-white/12 px-3 py-1 text-sm font-medium text-blue-100 shadow-lg shadow-slate-950/20 backdrop-blur">
              新宣设计
            </div>

            <button
              className="absolute left-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-slate-950/35 text-2xl text-white backdrop-blur transition hover:bg-slate-950/55 sm:flex"
              type="button"
              onClick={showPrevious}
              aria-label="上一张作品"
            >
              ‹
            </button>

            <button
              className="absolute right-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-slate-950/35 text-2xl text-white backdrop-blur transition hover:bg-slate-950/55 sm:flex"
              type="button"
              onClick={showNext}
              aria-label="下一张作品"
            >
              ›
            </button>

            <div className="absolute bottom-6 left-6 z-20 flex gap-2 sm:left-10 lg:left-14">
              {showcaseItems.map((item, index) => (
                <button
                  className={`h-2.5 rounded-full transition-all ${
                    index === activeIndex
                      ? "w-9 bg-white"
                      : "w-2.5 bg-white/45 hover:bg-white/70"
                  }`}
                  key={item.title}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-label={`切换到第 ${index + 1} 张作品`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {navigationCards.map((card) => renderNavigationCard(card))}
        </div>
      </section>
    </main>
  );
}
