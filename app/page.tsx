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
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";

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
const DEFAULT_ROUNDS = 5;
const SPRINT_SECONDS = 20;
const MIN_REST_SECONDS = 40;
const MAX_REST_SECONDS = 180;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 12;
const MIN_EFFORT = 1;
const MAX_EFFORT = 10;

function clampRounds(value: number) {
  return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(value)));
}

function prettyPhase(phase: Phase) {
  if (phase === "ready") return "ready";
  if (phase === "sprint") return "sprint";
  if (phase === "rest") return "rest";
  return "done";
}

export default function Home() {
  const initialPrefs = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        isDark: false,
        restSeconds: "90",
        totalRounds: DEFAULT_ROUNDS,
        plannedDays: ["tue", "thu"],
        logs: [] as SessionLog[],
      };
    }
    const saved = localStorage.getItem("sprint-planner-v1");
    if (!saved) {
      return {
        isDark: false,
        restSeconds: "90",
        totalRounds: DEFAULT_ROUNDS,
        plannedDays: ["tue", "thu"],
        logs: [] as SessionLog[],
      };
    }
    try {
      const parsed = JSON.parse(saved) as {
        isDark?: boolean;
        restSeconds?: string;
        totalRounds?: number;
        plannedDays?: string[];
        logs?: SessionLog[];
      };
      return {
        isDark: Boolean(parsed.isDark),
        restSeconds: parsed.restSeconds || "90",
        totalRounds: clampRounds(parsed.totalRounds || DEFAULT_ROUNDS),
        plannedDays: parsed.plannedDays?.length ? parsed.plannedDays : ["tue", "thu"],
        logs: parsed.logs?.length ? parsed.logs : [],
      };
    } catch {
      return {
        isDark: false,
        restSeconds: "90",
        totalRounds: DEFAULT_ROUNDS,
        plannedDays: ["tue", "thu"],
        logs: [] as SessionLog[],
      };
    }
  }, []);

  const [isDark, setIsDark] = useState(initialPrefs.isDark);
  const [restSeconds, setRestSeconds] = useState(initialPrefs.restSeconds);
  const [totalRounds, setTotalRounds] = useState(initialPrefs.totalRounds);
  const [plannedDays, setPlannedDays] = useState<string[]>(initialPrefs.plannedDays);
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(SPRINT_SECONDS);
  const [running, setRunning] = useState(false);
  const [effort, setEffort] = useState("");
  const [notes, setNotes] = useState("");
  const [logs, setLogs] = useState<SessionLog[]>(initialPrefs.logs);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState("");
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [swipeOffsets, setSwipeOffsets] = useState<Record<number, number>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const roundsDone = phase === "done" ? totalRounds : Math.max(0, round - 1);
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
    localStorage.setItem(
      "sprint-planner-v1",
      JSON.stringify({ isDark, restSeconds, totalRounds, plannedDays, logs }),
    );
  }, [isDark, restSeconds, totalRounds, plannedDays, logs]);

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
  }, [running, phase, round, currentRest, totalRounds, playCountdownCue, playTimeUpCue]);

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
    const next: SessionLog = {
      id: Date.now(),
      date: new Date().toLocaleDateString(),
      effort,
      notes,
      rounds: roundsDone,
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
    setLogs((prev) =>
      prev.map((log) => (log.id === editingNoteId ? { ...log, notes: editingNoteValue } : log)),
    );
    setEditingNoteId(null);
    setEditingNoteValue("");
  };

  const deleteSession = (id: number) => {
    setLogs((prev) => prev.filter((log) => log.id !== id));
    if (editingNoteId === id) {
      setEditingNoteId(null);
      setEditingNoteValue("");
    }
    setPendingDeleteId((prev) => (prev === id ? null : prev));
  };

  const startSwipe = (id: number, clientX: number) => {
    setTouchStartX(clientX);
    setSwipeOffsets((prev) => ({ ...prev, [id]: 0 }));
  };

  const moveSwipe = (id: number, clientX: number) => {
    if (touchStartX === null) return;
    const delta = clientX - touchStartX;
    const offset = Math.max(-120, Math.min(0, delta));
    setSwipeOffsets((prev) => ({ ...prev, [id]: offset }));
  };

  const endSwipe = (id: number) => {
    const offset = swipeOffsets[id] ?? 0;
    if (offset <= -70) {
      setPendingDeleteId(id);
    }
    setSwipeOffsets((prev) => ({ ...prev, [id]: 0 }));
    setTouchStartX(null);
  };

  const adjustRestSeconds = (delta: number) => {
    const current = Number(restSeconds) || 90;
    const next = Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, current + delta));
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

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }, []);

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
                ? "border border-zinc-400/80 bg-zinc-700 group-data-[selected=true]:bg-[#7ef55a]"
                : "border border-zinc-500 bg-white group-data-[selected=true]:bg-[#7ef55a]",
              thumb: "bg-zinc-900 w-4 h-4 min-w-4 min-h-4 rounded-full shadow-none",
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
            for non-lifting days. 20s sprint + rest, 5+ rounds.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card shadow="sm" className={cardClass}>
            <CardHeader className={`pb-0 ${sectionTitleClass}`}>weekly off-day plan</CardHeader>
            <CardBody className="gap-3">
              <p className={`text-sm ${subClass}`}>
                pick the days you want sprint sessions.
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
                  setRestSeconds(String(Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, parsed))));
                }}
                inputMode="numeric"
                classNames={{
                  inputWrapper: isDark ? "" : "border border-zinc-300 bg-white/80",
                }}
                endContent={
                  <div className="flex items-center gap-1">
                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      className={resetButtonClass}
                      aria-label="decrease rest seconds"
                      onPress={() => adjustRestSeconds(-5)}
                    >
                      -
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      className={resetButtonClass}
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
                  inputWrapper: isDark ? "" : "border border-zinc-300 bg-white/80",
                }}
                endContent={
                  <div className="flex items-center gap-1">
                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      className={resetButtonClass}
                      aria-label="decrease total rounds"
                      onPress={() => adjustTotalRounds(-1)}
                    >
                      -
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      className={resetButtonClass}
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
            <CardHeader className={`pb-0 ${sectionTitleClass}`}>interval timer</CardHeader>
            <CardBody className="gap-4">
              <div className="flex items-center justify-between">
                <Chip variant="flat" className={phaseChipClass}>
                  {prettyPhase(phase)}
                </Chip>
                <p className={`text-sm ${subClass}`}>
                  round {Math.min(round, totalRounds)} / {totalRounds}
                </p>
              </div>
              <p className={`text-center text-6xl font-semibold ${headerClass}`}>
                {secondsLeft}s
              </p>
              <Progress
                color={timerProgressColor}
                value={intervalProgressValue}
                aria-label="round progress"
                classNames={{ indicator: timerProgressClass, track: timerTrackClass }}
              />
              <div className="flex gap-2">
                {phase === "ready" || phase === "done" ? (
                  <Button className={`w-full ${ctaClass}`} onPress={startSession}>
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
            <CardHeader className={`pb-0 ${sectionTitleClass}`}>session notes</CardHeader>
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
                  setEffort(String(Math.min(MAX_EFFORT, Math.max(MIN_EFFORT, parsed))));
                }}
                type="text"
                inputMode="numeric"
                classNames={{
                  inputWrapper: isDark ? "" : "border border-zinc-300 bg-white/80",
                }}
                endContent={
                  <div className="flex items-center gap-1">
                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      className={resetButtonClass}
                      aria-label="decrease effort"
                      onPress={() => adjustEffort(-1)}
                    >
                      -
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      className={resetButtonClass}
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
                  inputWrapper: isDark ? "" : "border border-zinc-300 bg-white/80",
                }}
              />
              <Button className={ctaClass} onPress={saveSession}>
                save session
              </Button>
            </CardBody>
          </Card>
        </div>

        <Card shadow="sm" className={cardClass}>
          <CardHeader className={`pb-0 ${sectionTitleClass}`}>recent sessions</CardHeader>
          <CardBody className="gap-2">
            {logs.length === 0 ? (
              <p className={`text-sm ${subClass}`}>
                your saved treadmill sessions will show up here.
              </p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`rounded-xl p-3 transition-transform ${sessionItemClass}`}
                  style={{ transform: `translateX(${swipeOffsets[log.id] ?? 0}px)` }}
                  onTouchStart={(event) => startSwipe(log.id, event.touches[0].clientX)}
                  onTouchMove={(event) => moveSwipe(log.id, event.touches[0].clientX)}
                  onTouchEnd={() => endSwipe(log.id)}
                >
                  <p className={`text-sm font-medium ${sectionTitleClass}`}>
                    {log.date} • rounds: {log.rounds}/{log.targetRounds || DEFAULT_ROUNDS} • effort: {log.effort || "n/a"}
                  </p>
                  <Textarea
                    aria-label={`notes for session ${log.date}`}
                    value={editingNoteId === log.id ? editingNoteValue : log.notes}
                    onValueChange={(value) => {
                      if (editingNoteId === log.id) {
                        setEditingNoteValue(value);
                      }
                    }}
                    isReadOnly={editingNoteId !== log.id}
                    minRows={2}
                    className="mt-2"
                    classNames={{
                      inputWrapper: isDark
                        ? "border border-zinc-400/80 bg-zinc-700/45 hover:bg-zinc-700/55 data-[hover=true]:bg-zinc-700/55 data-[focus=true]:bg-zinc-700/55"
                        : "border border-zinc-300 bg-zinc-100/70",
                      input: isDark
                        ? "!text-zinc-100 !placeholder:text-zinc-300"
                        : "text-zinc-800",
                    }}
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className={`text-xs sm:hidden ${subClass}`}>swipe left to remove</p>
                    <div className="flex items-center gap-2 sm:hidden">
                      {editingNoteId === log.id ? (
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
                  {pendingDeleteId === log.id ? (
                    <div className="mt-2 flex items-center justify-end gap-2 sm:hidden">
                      <span className={`text-xs ${subClass}`}>remove note?</span>
                      <Button
                        size="sm"
                        color="danger"
                        variant="flat"
                        onPress={() => deleteSession(log.id)}
                      >
                        yes
                      </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        className={cancelButtonClass}
                        onPress={() => setPendingDeleteId(null)}
                      >
                        no
                      </Button>
                    </div>
                  ) : null}
                  <div className="mt-2 hidden items-center justify-end gap-2 sm:flex">
                    {editingNoteId === log.id ? (
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
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </motion.div>
    </div>
  );
}
