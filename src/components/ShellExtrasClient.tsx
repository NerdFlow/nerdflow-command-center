"use client";

import { useEffect } from "react";
import { useReportShellExtras, type ShellExtrasData } from "@/components/AppShell";

export function ShellExtrasClient(data: ShellExtrasData) {
  const report = useReportShellExtras();
  const { dueNowCount, openReplies, repliesUrgent, streak, assistantName } = data;

  useEffect(() => {
    report({ dueNowCount, openReplies, repliesUrgent, streak, assistantName });
  }, [report, dueNowCount, openReplies, repliesUrgent, streak, assistantName]);

  return null;
}
