"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconCheck,
  IconCloud,
  IconDownload,
  IconChartBar,
} from "@tabler/icons-react";

const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ");

function useInView(ref: React.RefObject<HTMLElement | null>, once = true) {
  const [inView, setInView] = useState(false);
  const triggered = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || (once && triggered.current)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggered.current) {
          setInView(true);
          if (once) {
            triggered.current = true;
            observer.disconnect();
          }
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, once]);

  return inView;
}

const KEY_SOUNDS_DOWN: Record<string, [number, number]> = {
  A: [31542, 85],
  B: [40621, 107],
  C: [39632, 95],
  D: [32492, 85],
  E: [23317, 83],
  F: [32973, 87],
  G: [33453, 94],
  H: [33986, 93],
  I: [25795, 91],
  J: [34425, 88],
  K: [34932, 90],
  L: [35410, 95],
  M: [41610, 93],
  N: [41103, 90],
  O: [26309, 84],
  P: [26804, 83],
  Q: [22245, 95],
  R: [23817, 92],
  S: [32031, 88],
  T: [24297, 92],
  U: [25313, 95],
  V: [40136, 94],
  W: [22790, 89],
  X: [39148, 76],
  Y: [24811, 93],
  Z: [38694, 80],
  " ": [51541, 144],
  "-": [42594, 90],
  "@": [23317, 83],
  "/": [42594, 90],
  ".": [42594, 90],
  ":": [42594, 90],
  "0": [26309, 84],
  "1": [25313, 95],
  "2": [23317, 83],
  "3": [23817, 92],
  "4": [24297, 92],
  "5": [24811, 93],
  "6": [25313, 95],
  "7": [25795, 91],
  "8": [26309, 84],
  "9": [26804, 83],
  Enter: [19065, 110],
};

const KEY_SOUNDS_UP: Record<string, [number, number]> = {
  A: [31632, 80],
  B: [40736, 95],
  C: [39732, 85],
  D: [32577, 80],
  E: [23402, 80],
  F: [33063, 80],
  G: [33553, 85],
  H: [34081, 85],
  I: [25890, 85],
  J: [34515, 85],
  K: [35027, 85],
  L: [35510, 85],
  M: [41710, 85],
  N: [41198, 85],
  O: [26394, 80],
  P: [26889, 80],
  Q: [22345, 85],
  R: [23912, 85],
  S: [32121, 80],
  T: [24392, 85],
  U: [25413, 85],
  V: [40236, 85],
  W: [22880, 85],
  X: [39228, 70],
  Y: [24911, 85],
  Z: [38779, 75],
  " ": [51691, 130],
  "-": [42689, 85],
  "@": [23402, 80],
  "/": [42689, 85],
  ".": [42689, 85],
  ":": [42689, 85],
  "0": [26394, 80],
  "1": [25413, 85],
  "2": [23402, 80],
  "3": [23912, 85],
  "4": [24392, 85],
  "5": [24911, 85],
  "6": [25413, 85],
  "7": [25890, 85],
  "8": [26394, 80],
  "9": [26889, 80],
  Enter: [19180, 100],
};

function useAudio(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const init = async () => {
      try {
        ctxRef.current = new AudioContext();
        const res = await fetch("/sounds/sound.ogg");
        if (!res.ok) return;
        bufferRef.current = await ctxRef.current.decodeAudioData(
          await res.arrayBuffer(),
        );
        readyRef.current = true;
      } catch {}
    };
    init();
    return () => {
      ctxRef.current?.close();
    };
  }, [enabled]);

  const playSound = (sound: [number, number] | undefined) => {
    if (!readyRef.current || !ctxRef.current || !bufferRef.current || !sound)
      return;
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    const src = ctxRef.current.createBufferSource();
    src.buffer = bufferRef.current;
    src.connect(ctxRef.current.destination);
    src.start(0, sound[0] / 1000, sound[1] / 1000);
  };

  const down = (key: string) =>
    playSound(KEY_SOUNDS_DOWN[key.toUpperCase()] || KEY_SOUNDS_DOWN[key]);
  const up = (key: string) =>
    playSound(KEY_SOUNDS_UP[key.toUpperCase()] || KEY_SOUNDS_UP[key]);

  return { down, up };
}

type TokenType =
  | "command"
  | "flag"
  | "string"
  | "number"
  | "operator"
  | "path"
  | "variable"
  | "comment"
  | "default";

interface Token {
  type: TokenType;
  value: string;
}

function tokenizeBash(text: string): Token[] {
  const tokens: Token[] = [];
  const words = text.split(/(\s+)/);

  let isFirstWord = true;

  for (const word of words) {
    if (/^\s+$/.test(word)) {
      tokens.push({ type: "default", value: word });
      continue;
    }

    if (word.startsWith("#")) {
      tokens.push({ type: "comment", value: word });
      continue;
    }

    if (word.startsWith("$")) {
      tokens.push({ type: "variable", value: word });
      isFirstWord = false;
      continue;
    }

    if (word.startsWith("--") || word.startsWith("-")) {
      tokens.push({ type: "flag", value: word });
      isFirstWord = false;
      continue;
    }

    if (/^["'].*["']$/.test(word)) {
      tokens.push({ type: "string", value: word });
      isFirstWord = false;
      continue;
    }

    if (/^\d+$/.test(word)) {
      tokens.push({ type: "number", value: word });
      isFirstWord = false;
      continue;
    }

    if (/^[|>&<]+$/.test(word)) {
      tokens.push({ type: "operator", value: word });
      isFirstWord = true;
      continue;
    }

    if (word.includes("/") || word.startsWith(".") || word.startsWith("~")) {
      tokens.push({ type: "path", value: word });
      isFirstWord = false;
      continue;
    }

    if (isFirstWord) {
      tokens.push({ type: "command", value: word });
      isFirstWord = false;
      continue;
    }

    tokens.push({ type: "default", value: word });
  }

  return tokens;
}

const tokenColors: Record<TokenType, string> = {
  command: "text-emerald-400",
  flag: "text-sky-400",
  string: "text-amber-300",
  number: "text-purple-400",
  operator: "text-red-400",
  path: "text-cyan-300",
  variable: "text-pink-400",
  comment: "text-neutral-500",
  default: "text-neutral-300",
};

function SyntaxHighlightedText({ text }: { text: string }) {
  const tokens = tokenizeBash(text);

  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} className={tokenColors[token.type]}>
          {token.value}
        </span>
      ))}
    </>
  );
}

interface TerminalLine {
  type: "command" | "output";
  content: string;
}

interface TerminalProps {
  commands: string[];
  outputs?: Record<number, string[]>;
  username?: string;
  className?: string;
  typingSpeed?: number;
  delayBetweenCommands?: number;
  initialDelay?: number;
  enableSound?: boolean;
  resetKey?: number;
}

function Terminal({
  commands = ["npx shadcn@latest init"],
  outputs = {},
  username = "user",
  className,
  typingSpeed = 50,
  delayBetweenCommands = 800,
  initialDelay = 300,
  enableSound = true,
  resetKey = 0,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef);
  const { down, up } = useAudio(enableSound);

  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [commandIdx, setCommandIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [outputIdx, setOutputIdx] = useState(-1);
  const [phase, setPhase] = useState<
    "idle" | "typing" | "executing" | "outputting" | "pausing" | "done"
  >("idle");
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    setLines([]);
    setCurrentText("");
    setCommandIdx(0);
    setCharIdx(0);
    setOutputIdx(-1);
    setPhase("idle");
  }, [resetKey, commands]);

  const currentCommand = commands[commandIdx] || "";
  const currentOutputs = useMemo(
    () => outputs[commandIdx] || [],
    [outputs, commandIdx],
  );
  const isLastCommand = commandIdx === commands.length - 1;

  useEffect(() => {
    if (!inView || phase !== "idle") return;
    const t = setTimeout(() => setPhase("typing"), initialDelay);
    return () => clearTimeout(t);
  }, [inView, phase, initialDelay]);

  useEffect(() => {
    if (phase !== "typing") return;

    if (charIdx < currentCommand.length) {
      const char = currentCommand[charIdx];
      down(char);
      const t = setTimeout(
        () => {
          up(char);
          setCurrentText(currentCommand.slice(0, charIdx + 1));
          setCharIdx((c) => c + 1);
        },
        typingSpeed + Math.random() * 30,
      );
      return () => clearTimeout(t);
    } else {
      down("Enter");
      const t = setTimeout(() => {
        up("Enter");
        setPhase("executing");
      }, 80);
      return () => clearTimeout(t);
    }
  }, [phase, charIdx, currentCommand, typingSpeed, down, up]);

  useEffect(() => {
    if (phase !== "executing") return;

    setLines((prev) => [...prev, { type: "command", content: currentCommand }]);
    setCurrentText("");

    if (currentOutputs.length > 0) {
      setOutputIdx(0);
      setPhase("outputting");
    } else if (isLastCommand) {
      setPhase("done");
    } else {
      setPhase("pausing");
    }
  }, [phase, currentCommand, currentOutputs.length, isLastCommand]);

  useEffect(() => {
    if (phase !== "outputting") return;

    if (outputIdx >= 0 && outputIdx < currentOutputs.length) {
      const t = setTimeout(() => {
        setLines((prev) => [
          ...prev,
          { type: "output", content: currentOutputs[outputIdx] },
        ]);
        setOutputIdx((i) => i + 1);
      }, 150);
      return () => clearTimeout(t);
    } else if (outputIdx >= currentOutputs.length) {
      const t = setTimeout(() => {
        if (isLastCommand) {
          setPhase("done");
        } else {
          setPhase("pausing");
        }
      }, 300);
      return () => clearTimeout(t);
    }
  }, [phase, outputIdx, currentOutputs, isLastCommand]);

  useEffect(() => {
    if (phase !== "pausing") return;
    const t = setTimeout(() => {
      setCharIdx(0);
      setOutputIdx(-1);
      setCommandIdx((c) => c + 1);
      setPhase("typing");
    }, delayBetweenCommands);
    return () => clearTimeout(t);
  }, [phase, delayBetweenCommands]);

  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [lines, phase]);

  const prompt = (
    <span className="text-neutral-500">
      <span className="text-sky-500">{username}</span>
      <span className="text-emerald-600">:</span>
      <span className="text-sky-400">~</span>
      <span className="text-neutral-500">$</span>{" "}
    </span>
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative z-20 mx-auto h-full min-h-80 w-full font-mono text-xs",
        className,
      )}
    >
      <div className="h-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl">
        <div className="flex items-center gap-2 bg-neutral-800 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500 transition-colors hover:bg-red-600" />
            <div className="h-3 w-3 rounded-full bg-yellow-500 transition-colors hover:bg-yellow-600" />
            <div className="h-3 w-3 rounded-full bg-green-500 transition-colors hover:bg-green-600" />
          </div>
          <div className="flex-1 text-center">
            <span className="truncate text-xs text-neutral-400">
              Manus-Macbook — bash
            </span>
          </div>
          <div className="w-[52px]" />
        </div>

        <div
          ref={contentRef}
          className="no-visible-scrollbar h-full overflow-y-auto p-4 font-mono"
        >
          {lines.map((line, i) => (
            <div key={i} className="leading-relaxed whitespace-pre-wrap">
              {line.type === "command" ? (
                <span>
                  {prompt}
                  <SyntaxHighlightedText text={line.content} />
                </span>
              ) : (
                <span className="text-neutral-400">{line.content}</span>
              )}
            </div>
          ))}

          {phase === "typing" && (
            <div className="leading-relaxed whitespace-pre-wrap">
              {prompt}
              <SyntaxHighlightedText text={currentText} />
              <span className="ml-0.5 inline-block h-4 w-2 bg-neutral-300 align-middle" />
            </div>
          )}

          {(phase === "done" ||
            phase === "pausing" ||
            phase === "outputting") && (
            <div className="leading-relaxed whitespace-pre-wrap">
              {prompt}
              <span
                className={cn(
                  "inline-block h-4 w-2 bg-neutral-300 align-middle transition-opacity duration-100",
                  !cursorVisible && "opacity-0",
                )}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  checkpoints: string[];
  commands: string[];
  outputs: Record<number, string[]>;
}

const features: Feature[] = [
  {
    id: "installation",
    title: "Installation",
    description:
      "Get started in seconds with our CLI. One command to initialize your project with all the configuration you need.",
    icon: <IconDownload className="h-5 w-5" />,
    checkpoints: [
      "Interactive setup wizard",
      "Automatic Tailwind configuration",
      "TypeScript support out of the box",
    ],
    commands: ["npx shadcn@latest init"],
    outputs: {
      0: [
        "✔ Preflight checks passed.",
        "✔ Verifying framework. Found Next.js.",
        "✔ Validating Tailwind CSS config.",
        "✔ Created components.json",
        "✔ Initialized project successfully.",
        "You may now add components.",
      ],
    },
  },
  {
    id: "list",
    title: "List Components",
    description:
      "Browse all available components from any registry. See what's available before you add, with detailed descriptions.",
    icon: <IconChartBar className="h-5 w-5" />,
    checkpoints: [
      "View all available components",
      "Check component dependencies",
      "Browse multiple registries",
    ],
    commands: ["npx shadcn@latest list"],
    outputs: {
      0: [
        "┌─────────────────┬────────────────────────────────┐",
        "│ Component       │ Description                    │",
        "├─────────────────┼────────────────────────────────┤",
        "│ accordion       │ Collapsible content panels     │",
        "│ alert           │ Displays important messages    │",
        "│ avatar          │ User profile images            │",
        "│ button          │ Interactive button element     │",
        "│ input           │ Text input field               │",
        "│ ...             │ and 45 more components         │",
        "└─────────────────┴────────────────────────────────┘",
      ],
    },
  },
  {
    id: "add",
    title: "Add Components",
    description:
      "Add any component to your project with a single command. Dependencies are resolved automatically.",
    icon: <IconCheck className="h-5 w-5" />,
    checkpoints: [
      "One command installation",
      "Automatic dependency resolution",
      "Customizable output paths",
    ],
    commands: [
      "npx shadcn@latest add button",
      "npx shadcn@latest add card dialog",
    ],
    outputs: {
      0: [
        "✔ Checking registry.",
        "✔ Installing dependencies.",
        "✔ Created src/components/ui/button.tsx",
        "Success! Component installed.",
      ],
      1: [
        "✔ Checking registry.",
        "✔ Installing dependencies.",
        "✔ Created src/components/ui/card.tsx",
        "✔ Created src/components/ui/dialog.tsx",
        "Success! 2 components installed.",
      ],
    },
  },
  {
    id: "ai",
    title: "AI Assistant",
    description:
      "Let AI help you discover and add components. Describe what you need and get intelligent suggestions.",
    icon: <IconCloud className="h-5 w-5" />,
    checkpoints: [
      "Natural language queries",
      "Smart component recommendations",
      "Context-aware suggestions",
    ],
    commands: ["npx shadcn@latest ask fetch latest components"],
    outputs: {
      0: [
        "🤖 Analyzing your request...",
        "",
        "Based on your project, I recommend:",
        "",
        "  → button (core interactive element)",
        "  → card (content containers)",
        "  → dialog (modal interactions)",
        "  → dropdown-menu (navigation)",
        "  → input (form handling)",
        "",
        "Run: npx shadcn@latest add button card dialog",
        "",
        "✔ Would you like me to install these? (y/n)",
      ],
    },
  },
];

export default function FeatureSectionWithTerminal() {
  const [activeFeature, setActiveFeature] = useState<string>("installation");
  const [resetKey, setResetKey] = useState(0);

  const currentFeature = features.find((f) => f.id === activeFeature)!;

  const handleFeatureClick = (featureId: string) => {
    if (featureId !== activeFeature) {
      setActiveFeature(featureId);
      setResetKey((k) => k + 1);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-6xl px-4 py-20 md:px-8">
      <div className="mb-12 w-full text-left">
        <h2 className="text-3xl font-bold tracking-tight text-neutral-700 md:text-4xl dark:text-white">
          Build your component library
        </h2>
        <p className="mt-4 max-w-lg text-neutral-500 dark:text-neutral-400">
          A powerful CLI to add beautifully designed components to your
          projects. Copy, paste, and customize. No lock-in.
        </p>
      </div>

      <div className="grid overflow-hidden rounded-3xl bg-gray-100 shadow-sm ring-1 shadow-black/10 ring-black/10 lg:grid-cols-2 dark:bg-neutral-900">
        <div className="relative order-2 flex h-full items-center justify-center bg-gray-100 p-4 md:p-8 lg:order-1 dark:bg-neutral-900">
          <motion.img
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            src="https://assets.aceternity.com/components/clouds.webp"
            alt="clouds"
            className="absolute inset-0 z-0 h-full w-full select-none"
          />
          <Terminal
            commands={currentFeature.commands}
            outputs={currentFeature.outputs}
            resetKey={resetKey}
            enableSound={true}
            typingSpeed={40}
            delayBetweenCommands={600}
          />
        </div>

        <div className="order-1 space-y-3 p-4 md:p-8 lg:order-2">
          {features.map((feature) => (
            <FeatureCard
              key={feature.id}
              feature={feature}
              isActive={activeFeature === feature.id}
              onClick={() => handleFeatureClick(feature.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  feature,
  isActive,
  onClick,
}: {
  feature: Feature;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <motion.div
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-xl font-mono transition-all duration-200",
        isActive &&
          "bg-white shadow-sm ring-1 shadow-black/10 ring-black/10 dark:bg-neutral-800",
      )}
      layout
    >
      <div className="flex items-center gap-4 p-4">
        <div className="flex-1">
          <h3
            className={cn(
              "font-semibold text-neutral-700 transition-colors dark:text-neutral-200",
            )}
          >
            {feature.title}
          </h3>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isActive && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              <p className="mb-4 text-sm text-neutral-400">
                {feature.description}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
