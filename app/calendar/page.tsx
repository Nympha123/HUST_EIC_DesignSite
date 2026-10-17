"use client";

import { useState, useSyncExternalStore } from "react";
import type { FormEvent, MouseEvent } from "react";

const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
const monthNames = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
const calendarStartYear = 2026;
const calendarEndYear = 2050;
const solarTermNames = [
  "小寒",
  "大寒",
  "立春",
  "雨水",
  "惊蛰",
  "春分",
  "清明",
  "谷雨",
  "立夏",
  "小满",
  "芒种",
  "夏至",
  "小暑",
  "大暑",
  "立秋",
  "处暑",
  "白露",
  "秋分",
  "寒露",
  "霜降",
  "立冬",
  "小雪",
  "大雪",
  "冬至",
];
const solarTermInfo = [
  0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551,
  218072, 240693, 263343, 285989, 308563, 331033, 353350, 375494, 397447,
  419210, 440795, 462224, 483532, 504758,
];
const fixedFestivals: Record<string, string> = {
  "1-1": "元旦",
  "3-8": "妇女节",
  "3-12": "植树节",
  "5-1": "劳动节",
  "5-4": "青年节",
  "6-1": "儿童节",
  "7-1": "建党节",
  "8-1": "建军节",
  "9-10": "教师节",
  "10-1": "国庆节",
};
const calendarTasksStorageKey = "eic-work-calendar-tasks";

type CalendarTasks = Record<string, string[]>;
const emptyCalendarTasks: CalendarTasks = {};
let calendarTasksSnapshot = emptyCalendarTasks;
let calendarTasksSnapshotRaw = "";

function readCalendarTasks() {
  if (typeof window === "undefined") {
    return emptyCalendarTasks;
  }

  const rawTasks = window.localStorage.getItem(calendarTasksStorageKey) ?? "";
  if (rawTasks === calendarTasksSnapshotRaw) {
    return calendarTasksSnapshot;
  }

  calendarTasksSnapshotRaw = rawTasks;
  try {
    const parsedTasks = JSON.parse(rawTasks) as unknown;
    calendarTasksSnapshot =
      parsedTasks && typeof parsedTasks === "object" && !Array.isArray(parsedTasks)
        ? (parsedTasks as CalendarTasks)
        : emptyCalendarTasks;
  } catch {
    calendarTasksSnapshot = emptyCalendarTasks;
  }

  return calendarTasksSnapshot;
}

function subscribeToCalendarTasks(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("eic-calendar-tasks-updated", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("eic-calendar-tasks-updated", onStoreChange);
  };
}

function getDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function getUnassignedTaskKey(year: number, month: number) {
  return `${getMonthKey(year, month)}-unassigned`;
}

function getMonthTaskGroups(tasks: CalendarTasks, year: number, month: number) {
  const monthKey = getMonthKey(year, month);

  return Object.entries(tasks)
    .filter(([key, entries]) => {
      return (
        key.startsWith(`${monthKey}-`) &&
        key !== getUnassignedTaskKey(year, month) &&
        entries.length > 0
      );
    })
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
}

function getMonthTaskCount(tasks: CalendarTasks, year: number, month: number) {
  const datedTaskCount = getMonthTaskGroups(tasks, year, month).reduce(
    (total, [, entries]) => total + entries.length,
    0,
  );
  const unassignedTaskCount = tasks[getUnassignedTaskKey(year, month)]?.length ?? 0;

  return datedTaskCount + unassignedTaskCount;
}

function formatDateLabel(year: number, month: number, day: number) {
  return `${year}年${month + 1}月${day}日`;
}

function getSolarTermDay(year: number, termIndex: number) {
  const baseDate = Date.UTC(1900, 0, 6, 2, 5);
  const millisecondsPerYear = 31556925974.7;
  const timestamp =
    baseDate +
    millisecondsPerYear * (year - 1900) +
    solarTermInfo[termIndex] * 60 * 1000;

  const dateParts = new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    timeZone: "Asia/Shanghai",
  }).formatToParts(new Date(timestamp));
  return Number(dateParts.find((part) => part.type === "day")?.value ?? 0);
}

function getLunarParts(date: Date) {
  try {
    const formatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      month: "numeric",
      day: "numeric",
      timeZone: "Asia/Shanghai",
    });
    const parts = formatter.formatToParts(date);
    const monthPart = parts.find((part) => part.type === "month")?.value ?? "";
    const dayPart = parts.find((part) => part.type === "day")?.value ?? "";
    const month = Number.parseInt(monthPart, 10);
    const day = Number.parseInt(dayPart, 10);

    return Number.isNaN(month) || Number.isNaN(day) ? null : { month, day };
  } catch {
    return null;
  }
}

function getCalendarAnnotations(year: number, month: number, day: number) {
  const annotations: string[] = [];
  const fixedFestival = fixedFestivals[`${month + 1}-${day}`];

  if (fixedFestival) {
    annotations.push(fixedFestival);
  }

  for (let termIndex = 0; termIndex < solarTermNames.length; termIndex += 1) {
    const termMonth = Math.floor(termIndex / 2);
    if (termMonth === month && getSolarTermDay(year, termIndex) === day) {
      annotations.push(solarTermNames[termIndex]);
    }
  }

  const date = new Date(year, month, day);
  const lunar = getLunarParts(date);
  if (lunar) {
    const lunarFestivals: Record<string, string> = {
      "1-1": "春节",
      "1-15": "元宵节",
      "5-5": "端午节",
      "7-7": "七夕",
      "7-15": "中元节",
      "8-15": "中秋节",
      "9-9": "重阳节",
      "12-8": "腊八节",
    };
    const lunarFestival = lunarFestivals[`${lunar.month}-${lunar.day}`];
    if (lunarFestival) {
      annotations.push(lunarFestival);
    }

    const nextDayLunar = getLunarParts(new Date(year, month, day + 1));
    if (lunar.month === 12 && nextDayLunar?.month === 1 && nextDayLunar.day === 1) {
      annotations.push("除夕");
    }
  }

  return annotations;
}

function getMonthCells(year: number, month: number) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
}

export default function WorkCalendarPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [taskDate, setTaskDate] = useState<{
    year: number;
    month: number;
    day: number;
  } | null>(null);
  const [taskDraft, setTaskDraft] = useState("");
  const [isMonthTaskDialogOpen, setIsMonthTaskDialogOpen] = useState(false);
  const [monthTaskDraft, setMonthTaskDraft] = useState("");
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const today = new Date();
  const calendarCells = getMonthCells(year, month);
  const yearOptions = Array.from(
    { length: calendarEndYear - calendarStartYear + 1 },
    (_, index) => calendarStartYear + index,
  );
  const calendarTasks = useSyncExternalStore(
    subscribeToCalendarTasks,
    readCalendarTasks,
    () => emptyCalendarTasks,
  );
  const monthTaskCount = getMonthTaskCount(calendarTasks, year, month);
  const monthTaskGroups = getMonthTaskGroups(calendarTasks, year, month);
  const unassignedTaskKey = getUnassignedTaskKey(year, month);

  function changeMonth(nextMonth: number) {
    setSelectedDate(new Date(year, nextMonth, 1));
    setSelectedDayKey(null);
  }

  function changeYear(nextYear: number) {
    setSelectedDate(new Date(nextYear, month, 1));
    setSelectedDayKey(null);
  }

  function openTaskDialog(day: number) {
    setSelectedDayKey(getDateKey(year, month, day));
    setTaskDate({ year, month, day });
    setTaskDraft("");
  }

  function closeTaskDialog() {
    setTaskDate(null);
    setTaskDraft("");
  }

  function openMonthTaskDialog() {
    setIsMonthTaskDialogOpen(true);
    setMonthTaskDraft("");
  }

  function closeMonthTaskDialog() {
    setIsMonthTaskDialogOpen(false);
    setMonthTaskDraft("");
  }

  function saveTasks(nextTasks: CalendarTasks) {
    window.localStorage.setItem(calendarTasksStorageKey, JSON.stringify(nextTasks));
    window.dispatchEvent(new Event("eic-calendar-tasks-updated"));
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskDate || !taskDraft.trim()) {
      return;
    }

    const dateKey = getDateKey(taskDate.year, taskDate.month, taskDate.day);
    const nextTasks = {
      ...calendarTasks,
      [dateKey]: [...(calendarTasks[dateKey] ?? []), taskDraft.trim()],
    };
    saveTasks(nextTasks);
    setTaskDraft("");
  }

  function addUnassignedTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!monthTaskDraft.trim()) {
      return;
    }

    const taskKey = getUnassignedTaskKey(year, month);
    const nextTasks = {
      ...calendarTasks,
      [taskKey]: [...(calendarTasks[taskKey] ?? []), monthTaskDraft.trim()],
    };
    saveTasks(nextTasks);
    setMonthTaskDraft("");
  }

  function removeTask(dateKey: string, taskIndex: number) {
    const remainingTasks = (calendarTasks[dateKey] ?? []).filter(
      (_, index) => index !== taskIndex,
    );
    const nextTasks = { ...calendarTasks };

    if (remainingTasks.length === 0) {
      delete nextTasks[dateKey];
    } else {
      nextTasks[dateKey] = remainingTasks;
    }

    saveTasks(nextTasks);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto max-w-6xl px-5 py-8 sm:px-6 lg:py-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {year}年{month + 1}月
            </h1>
            <button
              className="mt-2 text-sm font-medium text-red-600 transition hover:text-red-700 hover:underline"
              type="button"
              onClick={openMonthTaskDialog}
            >
              {monthTaskCount}项任务
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="calendar-year">
              年份
            </label>
            <select
              id="calendar-year"
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              value={year}
              onChange={(event) => changeYear(Number(event.target.value))}
            >
              {yearOptions.map((option) => (
                <option key={option} value={option}>
                  {option}年
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="calendar-month">
              月份
            </label>
            <select
              id="calendar-month"
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              value={month}
              onChange={(event) => changeMonth(Number(event.target.value))}
            >
              {monthNames.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {weekdays.map((weekday, index) => (
              <div
                className={`py-3 text-center text-base font-semibold ${
                  index === 0 || index === 6 ? "text-teal-700" : "text-slate-600"
                }`}
                key={weekday}
              >
                周{weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarCells.map((day, index) => {
              const isToday =
                day === today.getDate() &&
                month === today.getMonth() &&
                year === today.getFullYear();
              const annotations = day
                ? getCalendarAnnotations(year, month, day)
                : [];
              const dateKey = day ? getDateKey(year, month, day) : null;
              const taskCount = dateKey ? calendarTasks[dateKey]?.length ?? 0 : 0;
              const isSelected = dateKey === selectedDayKey;

              return (
                <button
                  className={`min-h-20 border-b border-r border-slate-200 p-2 text-left transition focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 sm:min-h-28 sm:p-3 ${
                    index % 7 === 0 || index % 7 === 6 ? "bg-slate-50/60" : "bg-white"
                  } ${
                    isSelected ? "bg-teal-50" : "hover:bg-teal-50/60"
                  } ${day ? "cursor-pointer" : "cursor-default"}`}
                  key={`${index}-${day ?? "empty"}`}
                  type="button"
                  disabled={!day}
                  onClick={() => day && setSelectedDayKey(dateKey)}
                  onContextMenu={(event: MouseEvent<HTMLButtonElement>) => {
                    event.preventDefault();
                    if (day) {
                      openTaskDialog(day);
                    }
                  }}
                  aria-label={day ? `${year}年${month + 1}月${day}日` : undefined}
                >
                  {day && (
                    <>
                      <span
                        className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-base font-semibold ${
                          isToday
                            ? "bg-teal-600 font-semibold text-white"
                            : isSelected
                              ? "border-2 border-teal-600 bg-transparent text-teal-700"
                            : "text-slate-700"
                        }`}
                      >
                        {day}
                      </span>
                      {annotations.length > 0 && (
                        <div className="mt-1 space-y-0.5 text-sm leading-5 text-blue-600">
                          {annotations.map((annotation) => (
                            <div key={annotation}>{annotation}</div>
                          ))}
                        </div>
                      )}
                      {taskCount > 0 && (
                        <div className="mt-1 text-sm font-medium leading-5 text-red-600">
                          {taskCount}项任务
                        </div>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {isMonthTaskDialogOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeMonthTaskDialog();
            }
          }}
        >
          <div
            className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-950/10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-month-task-title"
          >
            <div className="flex h-14 shrink-0 items-center justify-between bg-[#159fda] px-6 text-white">
              <h2 id="calendar-month-task-title" className="text-base font-semibold">
                {year}年{month + 1}月任务
              </h2>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-2xl leading-none transition hover:bg-white/15"
                type="button"
                onClick={closeMonthTaskDialog}
                aria-label="关闭月度任务弹窗"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 space-y-6 overflow-y-auto px-6 py-6">
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">月内全部安排</h3>
                  <span className="text-xs text-slate-400">
                    {monthTaskGroups.reduce((total, [, tasks]) => total + tasks.length, 0)}项
                  </span>
                </div>
                {monthTaskGroups.length > 0 ? (
                  <div className="space-y-3">
                    {monthTaskGroups.map(([dateKey, tasks]) => {
                      const day = Number(dateKey.split("-")[2]);

                      return (
                        <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3" key={dateKey}>
                          <p className="mb-2 text-sm font-semibold text-slate-700">
                            {formatDateLabel(year, month, day)}
                          </p>
                          <ul className="space-y-2">
                            {tasks.map((task, index) => (
                              <li
                                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                key={`${task}-${index}`}
                              >
                                <span className="min-w-0 break-words">{task}</span>
                                <button
                                  className="shrink-0 text-slate-400 transition hover:text-red-600"
                                  type="button"
                                  onClick={() => removeTask(dateKey, index)}
                                  aria-label={`删除任务：${task}`}
                                  title="删除任务"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    aria-hidden="true"
                                  >
                                    <path
                                      d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-400">
                    本月暂无已安排日期的任务
                  </p>
                )}
              </section>

              <section className="border-t border-slate-200 pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">未分配日期</h3>
                  <span className="text-xs text-slate-400">
                    {calendarTasks[unassignedTaskKey]?.length ?? 0}项
                  </span>
                </div>
                {(calendarTasks[unassignedTaskKey]?.length ?? 0) > 0 ? (
                  <ul className="space-y-2">
                    {(calendarTasks[unassignedTaskKey] ?? []).map((task, index) => (
                      <li
                        className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                        key={`${task}-${index}`}
                      >
                        <span className="min-w-0 break-words">{task}</span>
                        <button
                          className="shrink-0 text-slate-400 transition hover:text-red-600"
                          type="button"
                          onClick={() => removeTask(unassignedTaskKey, index)}
                          aria-label={`删除未分配任务：${task}`}
                          title="删除任务"
                        >
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-400">
                    暂无未分配日期的任务
                  </p>
                )}

                <form className="mt-4 flex gap-2" onSubmit={addUnassignedTask}>
                  <label className="sr-only" htmlFor="calendar-month-task-input">
                    添加未分配日期任务
                  </label>
                  <input
                    id="calendar-month-task-input"
                    className="h-11 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#159fda] focus:ring-2 focus:ring-sky-100"
                    value={monthTaskDraft}
                    onChange={(event) => setMonthTaskDraft(event.target.value)}
                    placeholder="输入暂未确定日期的工作任务"
                  />
                  <button
                    className="h-11 rounded-md bg-[#159fda] px-4 text-sm font-semibold text-white transition hover:bg-[#128ec3] disabled:cursor-not-allowed disabled:opacity-50"
                    type="submit"
                    disabled={!monthTaskDraft.trim()}
                  >
                    添加
                  </button>
                </form>
              </section>
            </div>

            <div className="flex shrink-0 justify-end border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
                type="button"
                onClick={closeMonthTaskDialog}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {taskDate && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeTaskDialog();
            }
          }}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-950/10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-task-title"
          >
            <div className="flex h-14 items-center justify-between bg-[#159fda] px-6 text-white">
              <h2 id="calendar-task-title" className="text-base font-semibold">
                {formatDateLabel(taskDate.year, taskDate.month, taskDate.day)}任务
              </h2>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-2xl leading-none transition hover:bg-white/15"
                type="button"
                onClick={closeTaskDialog}
                aria-label="关闭任务弹窗"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              {(() => {
                const dateKey = getDateKey(taskDate.year, taskDate.month, taskDate.day);
                const tasks = calendarTasks[dateKey] ?? [];

                return (
                  <>
                    <div>
                      <p className="mb-2 text-sm font-semibold text-slate-800">已有任务</p>
                      {tasks.length > 0 ? (
                        <ul className="space-y-2">
                          {tasks.map((task, index) => (
                            <li
                              className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                              key={`${task}-${index}`}
                            >
                              <span className="min-w-0 break-words">{task}</span>
                              <button
                                className="shrink-0 text-slate-400 transition hover:text-red-600"
                                type="button"
                                onClick={() => removeTask(dateKey, index)}
                                aria-label={`删除任务：${task}`}
                                title="删除任务"
                              >
                                <svg
                                  className="h-4 w-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-400">
                          当天暂无任务
                        </p>
                      )}
                    </div>

                    <form className="border-t border-slate-200 pt-5" onSubmit={addTask}>
                      <label
                        className="mb-2 block text-sm font-semibold text-slate-800"
                        htmlFor="calendar-task-input"
                      >
                        添加任务
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="calendar-task-input"
                          className="h-11 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#159fda] focus:ring-2 focus:ring-sky-100"
                          value={taskDraft}
                          onChange={(event) => setTaskDraft(event.target.value)}
                          placeholder="输入当天工作任务"
                          autoFocus
                        />
                        <button
                          className="h-11 rounded-md bg-[#159fda] px-4 text-sm font-semibold text-white transition hover:bg-[#128ec3] disabled:cursor-not-allowed disabled:opacity-50"
                          type="submit"
                          disabled={!taskDraft.trim()}
                        >
                          添加
                        </button>
                      </div>
                    </form>
                  </>
                );
              })()}
            </div>

            <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
                type="button"
                onClick={closeTaskDialog}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
