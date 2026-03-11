"use client";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Progress,
  Switch,
  Textarea,
  Tooltip,
} from "@heroui/react";
import { animate, motion, useDragControls, useMotionValue } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "ready" | "sprint" | "rest" | "done";

type SessionLog = {
  id: number;
  date: string;
  effort: string;
  notes: string;
  rounds: number;
  targetRounds?: number;
};

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const STORAGE_KEY = "sprint-planner-v1";
const DEFAULT_ROUNDS = 5;
const SPRINT_SECONDS = 20;
const MIN_REST_SECONDS = 40;
const MAX_REST_SECONDS = 180;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 12;
const MIN_EFFORT = 1;
const MAX_EFFORT = 10;
const SWIPE_TRIGGER_PX = 70;
const SWIPE_MAX_LEFT_PX = -120;

function clampRounds(value: number) {
  return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(value)));
}

function prettyPhase(phase: Phase) {
  if (phase === "ready") return "ready";
  if (phase === "sprint") return "sprint";
  if (phase === "rest") return "rest";
  return "done";
}

function isSessionLog(value: unknown): value is SessionLog {
  if (!value || typeof value !== "object") return false;
  const v = value as SessionLog;
  return (
    typeof v.id === "number" &&
    typeof v.date === "string" &&
    typeof v.effort === "string" &&
    typeof v.notes === "string" &&
    typeof v.rounds === "number"
  );
}

function formatShortDate(date: Date) {
  // "3/10/26" (mm/dd/yy with no leading zeros)
  return date.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

function normalizeShortDate(input: string) {
  const value = input.trim();
  if (!value) return value;

  // already mm/dd/yy
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(value)) return value;

  // mm/dd/yyyy -> mm/dd/yy
  const mdy4 = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy4) return `${mdy4[1]}/${mdy4[2]}/${mdy4[3].slice(-2)}`;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return formatShortDate(parsed);

  // fallback: keep whatever we have
  return value;
}

function RecentSessionRow({
  log,
  isDark,
  subClass,
  sectionTitleClass,
  sessionItemClass,
  resetButtonClass,
  cancelButtonClass,
  ctaClass,
  deleteButtonClass,
  editingNoteId,
  editingNoteValue,
  noteSavedForId,
  openSwipeId,
  setOpenSwipeId,
  setEditingNoteValue,
  startEditingSessionNote,
  cancelEditingSessionNote,
  saveEditingSessionNote,
  deleteSession,
}: {
  log: SessionLog;
  isDark: boolean;
  subClass: string;
  sectionTitleClass: string;
  sessionItemClass: string;
  resetButtonClass: string;
  cancelButtonClass: string;
  ctaClass: string;
  deleteButtonClass: string;
  editingNoteId: number | null;
  editingNoteValue: string;
  noteSavedForId: number | null;
  openSwipeId: number | null;
  setOpenSwipeId: (value: number | null) => void;
  setEditingNoteValue: (value: string) => void;
  startEditingSessionNote: (id: number, currentNotes: string) => void;
  cancelEditingSessionNote: () => void;
  saveEditingSessionNote: () => void;
  deleteSession: (id: number) => void;
}) {
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const [revealed, setRevealed] = useState(false);
  const isEditing = editingNoteId === log.id;

  useEffect(() => {
    if (openSwipeId !== log.id && revealed) {
      setRevealed(false);
      animate(x, 0, { type: "spring", stiffness: 520, damping: 44 });
    }
  }, [openSwipeId, revealed, log.id, x]);

  useEffect(() => {
    if (isEditing && revealed) {
      setRevealed(false);
      setOpenSwipeId(null);
      animate(x, 0, { type: "spring", stiffness: 520, damping: 44 });
    }
  }, [isEditing, revealed, setOpenSwipeId, x]);

  const settleSwipe = () => {
    const current = x.get();
    if (current <= -SWIPE_TRIGGER_PX) {
      setRevealed(true);
      setOpenSwipeId(log.id);
      animate(x, SWIPE_MAX_LEFT_PX, { type: "spring", stiffness: 520, damping: 44 });
      return;
    }
    setRevealed(false);
    if (openSwipeId === log.id) setOpenSwipeId(null);
    animate(x, 0, { type: "spring", stiffness: 520, damping: 44 });
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* behind layer (revealed by swipe) */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end pr-2">
        <Button
          size="sm"
          className={`bg-rose-500 text-white hover:bg-rose-600 ${revealed ? "" : "opacity-0"}`}
          onPress={() => deleteSession(log.id)}
          aria-label={`remove session from ${log.date}`}
        >
          remove
        </Button>
      </div>

      {/* front layer */}
      <motion.div
        className={`rounded-xl p-3 will-change-transform ${sessionItemClass}`}
        style={{ x, touchAction: "pan-y" }}
        drag={isEditing ? false : "x"}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ left: SWIPE_MAX_LEFT_PX, right: 0 }}
        dragElastic={0.06}
        dragMomentum
        dragDirectionLock
        dragTransition={{ bounceStiffness: 700, bounceDamping: 42 }}
        onDragStart={() => setOpenSwipeId(log.id)}
        onDragEnd={settleSwipe}
      >
        <div
          className="select-none"
          onPointerDown={(event) => {
            if (isEditing) return;
            dragControls.start(event as unknown as PointerEvent);
          }}
        >
          <p className={`text-sm font-medium ${sectionTitleClass}`}>
            {normalizeShortDate(log.date)}
          </p>
          <p className={`text-xs ${subClass}`}>
            rounds: {log.rounds}/{log.targetRounds || DEFAULT_ROUNDS} • effort:{" "}
            {log.effort || "n/a"}
          </p>
        </div>

        <Textarea
          aria-label={`notes for session ${log.date}`}
          value={isEditing ? editingNoteValue : log.notes}
          onValueChange={(value) => {
            if (isEditing) setEditingNoteValue(value);
          }}
          isReadOnly={!isEditing}
          minRows={2}
          className="mt-2"
          classNames={{
            inputWrapper: isDark
              ? "border border-zinc-400/80 bg-zinc-700/45 hover:bg-zinc-700/55 data-[hover=true]:bg-zinc-700/55 data-[focus=true]:bg-zinc-700/55"
              : "border border-zinc-300 bg-zinc-100/70",
            input: isDark ? "!text-zinc-100 !placeholder:text-zinc-300" : "text-zinc-800",
          }}
        />

        <div className="mt-2 flex items-center justify-end gap-2">
          <div className="flex items-center gap-2 sm:hidden">
            {isEditing ? (
              <>
                <Button
                  size="sm"
                  variant="flat"
                  className={cancelButtonClass}
                  onPress={cancelEditingSessionNote}
                >
                  cancel
                </Button>
                <Button size="sm" className={ctaClass} onPress={saveEditingSessionNote}>
                  save
                </Button>
              </>
            ) : (
              <Tooltip content="edit note">
                <Button
                  isIconOnly
                  size="sm"
                  variant="flat"
                  className={`${resetButtonClass} text-base`}
                  aria-label={`edit session note from ${log.date}`}
                  onPress={() => startEditingSessionNote(log.id, log.notes)}
                >
                  ✎
                </Button>
              </Tooltip>
            )}
          </div>
        </div>

        {noteSavedForId === log.id ? (
          <motion.div
            className="mt-2 flex justify-end"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <Chip
              size="sm"
              variant="flat"
              className={
                isDark
                  ? "bg-emerald-400/15 text-emerald-100 border border-emerald-300/40"
                  : "bg-emerald-500/15 text-emerald-800 border border-emerald-500/30"
              }
            >
              note saved
            </Chip>
          </motion.div>
        ) : null}

        <div className="mt-2 hidden items-center justify-end gap-2 sm:flex">
          {isEditing ? (
            <>
              <Button
                size="sm"
                variant="flat"
                className={cancelButtonClass}
                onPress={cancelEditingSessionNote}
              >
                cancel
              </Button>
              <Button size="sm" className={ctaClass} onPress={saveEditingSessionNote}>
                save
              </Button>
            </>
          ) : (
            <Tooltip content="edit note">
              <Button
                isIconOnly
                size="sm"
                variant="flat"
                className={`${resetButtonClass} text-base`}
                aria-label={`edit session note from ${log.date}`}
                onPress={() => startEditingSessionNote(log.id, log.notes)}
              >
                ✎
              </Button>
            </Tooltip>
          )}
          <Tooltip content="remove session">
            <Button
              isIconOnly
              size="sm"
              color="danger"
              variant="flat"
              className={deleteButtonClass}
              aria-label={`remove session from ${log.date}`}
              onPress={() => deleteSession(log.id)}
            >
              🗑
            </Button>
          </Tooltip>
        </div>
      </motion.div>
    </div>
  );
}

export default function Home() {
  // keep the first render deterministic to avoid hydration mismatches
  // (server HTML must match the browser's first render).
  const [hydrated, setHydrated] = useState(false);

  const [isDark, setIsDark] = useState(false);
  const [restSeconds, setRestSeconds] = useState("90");
  const [totalRounds, setTotalRounds] = useState(DEFAULT_ROUNDS);
  const [plannedDays, setPlannedDays] = useState<string[]>(["tue", "thu"]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(SPRINT_SECONDS);
  const [running, setRunning] = useState(false);
  const [effort, setEffort] = useState("");
  const [notes, setNotes] = useState("");
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState("");
  const [noteSavedForId, setNoteSavedForId] = useState<number | null>(null);
  const [recentToast, setRecentToast] = useState<string>("");
  const [todayLabel, setTodayLabel] = useState("");
  const [openSwipeId, setOpenSwipeId] = useState<number | null>(null);
  const noteSavedTimerRef = useRef<number | null>(null);
  const recentToastTimerRef = useRef<number | null>(null);

  const currentRest = Number(restSeconds) || 90;
  const intervalTotalSeconds = phase === "rest" ? currentRest : SPRINT_SECONDS;
  const intervalProgressValue =
    phase === "ready"
      ? 100
      : phase === "done"
        ? 0
        : (secondsLeft / intervalTotalSeconds) * 100;
  const playCountdownCue = useCallback((frequency = 880) => {
    if (typeof window === "undefined") return;
    const context = new window.AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.1, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    oscillator.onended = () => {
      context.close().catch(() => undefined);
    };
  }, []);
  const playTimeUpCue = useCallback(() => {
    if (typeof window === "undefined") return;
    const context = new window.AudioContext();
    const now = context.currentTime;
    const duration = 0.52;
    const buzz = context.createOscillator();
    const mod = context.createOscillator();
    const modGain = context.createGain();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    buzz.type = "square";
    buzz.frequency.setValueAtTime(200, now);
    buzz.frequency.linearRampToValueAtTime(170, now + duration);

    mod.type = "square";
    mod.frequency.setValueAtTime(14, now);
    modGain.gain.setValueAtTime(36, now);
    mod.connect(modGain);
    modGain.connect(buzz.frequency);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1700, now);
    filter.Q.setValueAtTime(1.2, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.13, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    buzz.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    buzz.start(now);
    mod.start(now);
    buzz.stop(now + duration);
    mod.stop(now + duration);

    window.setTimeout(() => {
      context.close().catch(() => undefined);
    }, 700);
  }, []);

  useEffect(() => {
    // hydrate prefs from localStorage after mount (keeps server/client first render identical)
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          isDark?: unknown;
          restSeconds?: unknown;
          totalRounds?: unknown;
          plannedDays?: unknown;
          logs?: unknown;
        };

        if (typeof parsed.isDark !== "undefined")
          setIsDark(Boolean(parsed.isDark));

        const rawRest =
          typeof parsed.restSeconds === "string"
            ? parsed.restSeconds
            : String(parsed.restSeconds ?? "");
        const digits = rawRest.replace(/[^\d]/g, "");
        if (digits) {
          const n = Number(digits);
          if (!Number.isNaN(n)) {
            setRestSeconds(
              String(Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, n))),
            );
          }
        }

        const rounds = Number(parsed.totalRounds);
        if (!Number.isNaN(rounds) && rounds > 0) {
          setTotalRounds(clampRounds(rounds));
        }

        if (Array.isArray(parsed.plannedDays)) {
          const next = parsed.plannedDays
            .filter((d): d is string => typeof d === "string")
            .map((d) => d.toLowerCase().trim())
            .filter((d) => DAYS.includes(d));
          if (next.length) setPlannedDays(Array.from(new Set(next)));
        }

        if (Array.isArray(parsed.logs)) {
          setLogs(
            parsed.logs
              .filter(isSessionLog)
              .slice(0, 8)
              .map((log) => ({ ...log, date: normalizeShortDate(log.date) })),
          );
        }
      }
    } catch {
      // ignore corrupt storage
    } finally {
      setHydrated(true);
    }

    setTodayLabel(
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
    );
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ isDark, restSeconds, totalRounds, plannedDays, logs }),
    );
  }, [hydrated, isDark, restSeconds, totalRounds, plannedDays, logs]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev > 1) {
          if (phase === "rest" && prev <= 6) {
            playCountdownCue(880);
          }
          if (phase === "sprint" && prev <= 6) {
            playCountdownCue(660);
          }
          return prev - 1;
        }
        if (phase === "sprint") {
          playTimeUpCue();
          if (round === totalRounds) {
            setRunning(false);
            setPhase("done");
            return 0;
          }
          setPhase("rest");
          return currentRest;
        }
        if (phase === "rest") {
          playTimeUpCue();
          setRound((prevRound) => prevRound + 1);
          setPhase("sprint");
          return SPRINT_SECONDS;
        }
        return 0;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [
    running,
    phase,
    round,
    currentRest,
    totalRounds,
    playCountdownCue,
    playTimeUpCue,
  ]);

  const headerClass = isDark ? "text-zinc-100" : "text-zinc-800";
  const subClass = isDark ? "text-zinc-300" : "text-zinc-600";
  const sectionTitleClass = isDark ? "text-zinc-100" : "text-zinc-800";
  const dateClass = isDark ? "text-zinc-50" : "text-zinc-700";
  const topBarClass = isDark
    ? "border border-zinc-500/70 bg-zinc-800/75"
    : "border border-zinc-300 bg-white/80";
  const surfaceClass = isDark
    ? "bg-[linear-gradient(to_bottom,oklch(0.5088_0.0345_273.18),oklch(0.42_0.022_273.18),oklch(0.3_0.014_273.18))] text-zinc-100"
    : "bg-[linear-gradient(to_bottom,oklch(0.72_0.0814_265.76),oklch(0.82_0.055_258),oklch(0.96_0.02_248))] text-zinc-900";
  const cardClass = isDark ? "bg-zinc-800/90" : "bg-white/90";
  const ctaClass =
    "bg-[#7ef55a] text-zinc-900 font-semibold shadow-[0_3px_10px_rgba(126,245,90,0.14)] hover:bg-[#6ee04e]";
  const deleteButtonClass = isDark
    ? "bg-rose-400/25 text-rose-100 border border-rose-300/60 hover:bg-rose-400/35"
    : "";
  const sessionItemClass = isDark
    ? "border border-zinc-400/80"
    : "border border-zinc-500";
  const unselectedDayClass = isDark
    ? "bg-zinc-600/70 text-zinc-100 hover:bg-zinc-500/80"
    : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300";
  const resetButtonClass = isDark
    ? "bg-zinc-600/70 text-zinc-100 hover:bg-zinc-500"
    : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300";
  const cancelButtonClass = isDark
    ? "bg-zinc-600/70 !text-zinc-100 hover:bg-zinc-500"
    : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300";
  const timerProgressColor = "default";
  const timerProgressClass = isDark ? "bg-zinc-300" : "bg-zinc-500";
  const timerTrackClass = isDark ? "bg-zinc-700/70" : "";
  const phaseChipClass =
    phase === "done"
      ? isDark
        ? "bg-zinc-700 text-zinc-100 border border-zinc-500/80"
        : "bg-zinc-200 text-zinc-700 border border-zinc-500/80"
      : phase === "rest" || phase === "sprint"
        ? isDark
          ? "bg-[oklch(0.8467_0.1011_58.24/0.24)] text-[oklch(0.95_0.03_58.24)] border border-[oklch(0.8467_0.1011_58.24/0.5)]"
          : "bg-[oklch(0.8467_0.1011_58.24/0.3)] text-zinc-900 border border-[oklch(0.72_0.09_58.24/0.6)]"
        : isDark
          ? "bg-zinc-600/55 text-zinc-100 border border-zinc-300/50"
          : "bg-zinc-200 text-zinc-800 border border-zinc-400/80";

  const canSaveSession = effort.trim().length > 0 || notes.trim().length > 0;

  const startSession = () => {
    setPhase("sprint");
    setRound(1);
    setSecondsLeft(SPRINT_SECONDS);
    setRunning(true);
  };

  const resetSession = () => {
    setPhase("ready");
    setRound(1);
    setSecondsLeft(SPRINT_SECONDS);
    setRunning(false);
  };

  const saveSession = () => {
    const nextEffort = effort.trim();
    const nextNotes = notes.trim();

    // don't create empty entries in recent sessions
    if (nextEffort.length === 0 && nextNotes.length === 0) return;

    const roundSnapshot =
      phase === "done"
        ? totalRounds
        : Math.min(Math.max(round, 1), totalRounds);

    const next: SessionLog = {
      id: Date.now(),
      date: formatShortDate(new Date()),
      effort: nextEffort,
      notes: nextNotes,
      rounds: roundSnapshot,
      targetRounds: totalRounds,
    };
    setLogs((prev) => [next, ...prev].slice(0, 8));
    setEffort("");
    setNotes("");
  };

  const startEditingSessionNote = (id: number, currentNotes: string) => {
    setEditingNoteId(id);
    setEditingNoteValue(currentNotes);
  };

  const cancelEditingSessionNote = () => {
    setEditingNoteId(null);
    setEditingNoteValue("");
  };

  const saveEditingSessionNote = () => {
    if (editingNoteId === null) return;
    const savedId = editingNoteId;

    setLogs((prev) =>
      prev.map((log) =>
        log.id === editingNoteId ? { ...log, notes: editingNoteValue } : log,
      ),
    );
    setEditingNoteId(null);
    setEditingNoteValue("");

    setNoteSavedForId(savedId);
    if (noteSavedTimerRef.current !== null) {
      window.clearTimeout(noteSavedTimerRef.current);
    }
    noteSavedTimerRef.current = window.setTimeout(() => {
      setNoteSavedForId(null);
      noteSavedTimerRef.current = null;
    }, 1600);
  };

  const deleteSession = (id: number) => {
    setLogs((prev) => prev.filter((log) => log.id !== id));
    if (editingNoteId === id) {
      setEditingNoteId(null);
      setEditingNoteValue("");
    }
    setOpenSwipeId((prev) => (prev === id ? null : prev));

    setRecentToast("note removed");
    if (recentToastTimerRef.current !== null) {
      window.clearTimeout(recentToastTimerRef.current);
    }
    recentToastTimerRef.current = window.setTimeout(() => {
      setRecentToast("");
      recentToastTimerRef.current = null;
    }, 1600);
  };

  const adjustRestSeconds = (delta: number) => {
    const current = Number(restSeconds) || 90;
    const next = Math.min(
      MAX_REST_SECONDS,
      Math.max(MIN_REST_SECONDS, current + delta),
    );
    setRestSeconds(String(next));
  };

  const adjustTotalRounds = (delta: number) => {
    setTotalRounds((prev) => clampRounds(prev + delta));
  };

  const adjustEffort = (delta: number) => {
    const current = Number(effort) || MIN_EFFORT;
    const next = Math.min(MAX_EFFORT, Math.max(MIN_EFFORT, current + delta));
    setEffort(String(next));
  };

  return (
    <div
      className={`min-h-screen p-4 sm:p-8 ${surfaceClass} font-[family-name:var(--font-space-grotesk)] transition-colors`}
    >
      <motion.div
        className="mx-auto flex w-full max-w-5xl flex-col gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div
          className={`flex items-center justify-between rounded-2xl px-4 py-3 shadow-sm backdrop-blur ${topBarClass}`}
        >
          <p className={`text-sm font-medium ${dateClass}`}>{todayLabel}</p>
          <Switch
            isSelected={isDark}
            onValueChange={setIsDark}
            color="warning"
            size="sm"
            classNames={{
              wrapper: isDark
                ? "border border-zinc-200/80 bg-white group-data-[selected=true]:bg-white"
                : "border border-zinc-500 bg-white group-data-[selected=true]:bg-[#7ef55a]",
              thumb:
                "bg-zinc-900 w-4 h-4 min-w-4 min-h-4 rounded-full shadow-none",
              label: `text-xs ${isDark ? "text-zinc-100" : "text-zinc-800"}`,
            }}
          >
            dark mode
          </Switch>
        </div>

        <div className="pt-4 sm:pt-6">
          <h1
            className={`font-[family-name:var(--font-manrope)] text-3xl font-bold tracking-tight sm:text-5xl ${headerClass}`}
          >
            treadmill sprint planner
          </h1>
          <p className={`mt-2 text-base sm:text-lg ${subClass}`}>
            for non-lifting days. 20s sprint + rest, 5+ rounds
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card shadow="sm" className={cardClass}>
            <CardHeader className={`pb-0 ${sectionTitleClass}`}>
              weekly off-day plan
            </CardHeader>
            <CardBody className="gap-3">
              <p className={`text-sm ${subClass}`}>
                pick the days you want sprint sessions
              </p>
              <div className="flex flex-wrap gap-2 overflow-x-hidden">
                {DAYS.map((day) => {
                  const selected = plannedDays.includes(day);
                  return (
                    <Button
                      key={day}
                      size="sm"
                      className={`min-w-12 ${
                        selected
                          ? "bg-[#7ef55a] text-zinc-900 font-semibold hover:bg-[#6ee04e]"
                          : unselectedDayClass
                      }`}
                      variant={selected ? "solid" : "flat"}
                      onPress={() =>
                        setPlannedDays((prev) =>
                          prev.includes(day)
                            ? prev.filter((d) => d !== day)
                            : [...prev, day],
                        )
                      }
                    >
                      {day}
                    </Button>
                  );
                })}
              </div>
              <Input
                type="text"
                label="rest seconds between sprints"
                value={restSeconds}
                onValueChange={(value) => {
                  const digitsOnly = value.replace(/[^\d]/g, "");
                  if (digitsOnly === "") {
                    setRestSeconds("");
                    return;
                  }
                  const parsed = Number(digitsOnly);
                  if (Number.isNaN(parsed)) return;
                  setRestSeconds(
                    String(
                      Math.min(
                        MAX_REST_SECONDS,
                        Math.max(MIN_REST_SECONDS, parsed),
                      ),
                    ),
                  );
                }}
                inputMode="numeric"
                classNames={{
                  inputWrapper: isDark
                    ? ""
                    : "border border-zinc-300 bg-white/80",
                }}
                endContent={
                  <div className="flex items-center gap-1">
                    <Button
                      isIconOnly
                      size="md"
                      variant="flat"
                      className={`${resetButtonClass} w-10 min-w-10 h-10 text-lg`}
                      aria-label="decrease rest seconds"
                      onPress={() => adjustRestSeconds(-5)}
                    >
                      -
                    </Button>
                    <Button
                      isIconOnly
                      size="md"
                      variant="flat"
                      className={`${resetButtonClass} w-10 min-w-10 h-10 text-lg`}
                      aria-label="increase rest seconds"
                      onPress={() => adjustRestSeconds(5)}
                    >
                      +
                    </Button>
                  </div>
                }
              />
              <Input
                type="text"
                label="total rounds per session"
                value={String(totalRounds)}
                onValueChange={(value) => {
                  const digitsOnly = value.replace(/[^\d]/g, "");
                  if (digitsOnly === "") return;
                  const parsed = Number(digitsOnly);
                  if (Number.isNaN(parsed)) return;
                  setTotalRounds(clampRounds(parsed));
                }}
                inputMode="numeric"
                classNames={{
                  inputWrapper: isDark
                    ? ""
                    : "border border-zinc-300 bg-white/80",
                }}
                endContent={
                  <div className="flex items-center gap-1">
                    <Button
                      isIconOnly
                      size="md"
                      variant="flat"
                      className={`${resetButtonClass} w-10 min-w-10 h-10 text-lg`}
                      aria-label="decrease total rounds"
                      onPress={() => adjustTotalRounds(-1)}
                    >
                      -
                    </Button>
                    <Button
                      isIconOnly
                      size="md"
                      variant="flat"
                      className={`${resetButtonClass} w-10 min-w-10 h-10 text-lg`}
                      aria-label="increase total rounds"
                      onPress={() => adjustTotalRounds(1)}
                    >
                      +
                    </Button>
                  </div>
                }
              />
            </CardBody>
          </Card>

          <Card shadow="sm" className={cardClass}>
            <CardHeader className={`pb-0 ${sectionTitleClass}`}>
              interval timer
            </CardHeader>
            <CardBody className="gap-4">
              <div className="flex items-center justify-between">
                <Chip variant="flat" className={phaseChipClass}>
                  {prettyPhase(phase)}
                </Chip>
                <p className={`text-sm ${subClass}`}>
                  round {Math.min(round, totalRounds)} / {totalRounds}
                </p>
              </div>
              <p
                className={`text-center text-6xl font-semibold ${headerClass}`}
              >
                {secondsLeft}s
              </p>
              <Progress
                color={timerProgressColor}
                value={intervalProgressValue}
                aria-label="round progress"
                classNames={{
                  indicator: timerProgressClass,
                  track: timerTrackClass,
                }}
              />
              <div className="flex gap-2">
                {phase === "ready" || phase === "done" ? (
                  <Button
                    className={`w-full ${ctaClass}`}
                    onPress={startSession}
                  >
                    start session
                  </Button>
                ) : (
                  <Button
                    className={`w-full ${ctaClass}`}
                    onPress={() => setRunning((prev) => !prev)}
                  >
                    {running ? "pause" : "resume"}
                  </Button>
                )}
                <Button
                  variant="flat"
                  className={`w-full ${resetButtonClass}`}
                  onPress={resetSession}
                >
                  reset
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card shadow="sm" className={cardClass}>
            <CardHeader className={`pb-0 ${sectionTitleClass}`}>
              session notes
            </CardHeader>
            <CardBody className="gap-3">
              <Input
                label="effort (1-10)"
                value={effort}
                onValueChange={(value) => {
                  const digitsOnly = value.replace(/[^\d]/g, "");
                  if (digitsOnly === "") {
                    setEffort("");
                    return;
                  }
                  const parsed = Number(digitsOnly);
                  if (Number.isNaN(parsed)) return;
                  setEffort(
                    String(Math.min(MAX_EFFORT, Math.max(MIN_EFFORT, parsed))),
                  );
                }}
                type="text"
                inputMode="numeric"
                classNames={{
                  inputWrapper: isDark
                    ? ""
                    : "border border-zinc-300 bg-white/80",
                }}
                endContent={
                  <div className="flex items-center gap-1">
                    <Button
                      isIconOnly
                      size="md"
                      variant="flat"
                      className={`${resetButtonClass} w-10 min-w-10 h-10 text-lg`}
                      aria-label="decrease effort"
                      onPress={() => adjustEffort(-1)}
                    >
                      -
                    </Button>
                    <Button
                      isIconOnly
                      size="md"
                      variant="flat"
                      className={`${resetButtonClass} w-10 min-w-10 h-10 text-lg`}
                      aria-label="increase effort"
                      onPress={() => adjustEffort(1)}
                    >
                      +
                    </Button>
                  </div>
                }
              />
              <Textarea
                label="how did this feel?"
                value={notes}
                onValueChange={setNotes}
                minRows={3}
                classNames={{
                  inputWrapper: isDark
                    ? ""
                    : "border border-zinc-300 bg-white/80",
                }}
              />
              <Button
                className={ctaClass}
                onPress={saveSession}
                isDisabled={!canSaveSession}
              >
                save session
              </Button>
            </CardBody>
          </Card>
        </div>

          <Card shadow="sm" className={cardClass}>
            <CardHeader className={`pb-0 ${sectionTitleClass}`}>
              recent sessions
            </CardHeader>
            <CardBody className="gap-2">
              {recentToast ? (
                <motion.div
                  className="flex justify-end"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <Chip
                    size="sm"
                    variant="flat"
                    className={
                      isDark
                        ? "bg-rose-400/15 text-rose-100 border border-rose-300/40"
                        : "bg-rose-500/15 text-rose-800 border border-rose-500/30"
                    }
                  >
                    {recentToast}
                  </Chip>
                </motion.div>
              ) : null}
	              {logs.length === 0 ? (
	                <p className={`text-sm ${subClass}`}>
	                  your saved treadmill sessions will show up here.
	                </p>
	              ) : (
	                logs.map((log) => (
	                  <RecentSessionRow
	                    key={log.id}
	                    log={log}
	                    isDark={isDark}
	                    subClass={subClass}
	                    sectionTitleClass={sectionTitleClass}
	                    sessionItemClass={sessionItemClass}
	                    resetButtonClass={resetButtonClass}
	                    cancelButtonClass={cancelButtonClass}
	                    ctaClass={ctaClass}
	                    deleteButtonClass={deleteButtonClass}
	                    editingNoteId={editingNoteId}
	                    editingNoteValue={editingNoteValue}
	                    noteSavedForId={noteSavedForId}
	                    openSwipeId={openSwipeId}
	                    setOpenSwipeId={setOpenSwipeId}
	                    setEditingNoteValue={setEditingNoteValue}
	                    startEditingSessionNote={startEditingSessionNote}
	                    cancelEditingSessionNote={cancelEditingSessionNote}
	                    saveEditingSessionNote={saveEditingSessionNote}
	                    deleteSession={deleteSession}
	                  />
	                ))
	              )}
	            </CardBody>
	          </Card>
	        </motion.div>
    </div>
  );
}
