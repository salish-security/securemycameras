import { useState, useRef } from "react";

interface Question {
  id: number;
  question: string;
  options: string[];
  safe: number;
  weight: number;
  context: string;
}

interface Answer {
  qIndex: number;
  answer: number;
  points: number;
}

interface RiskLevel {
  level: string;
  color: string;
  bg: string;
  label: string;
  emoji: string;
}

const QUESTIONS: Question[] = [
  {
    id: 1,
    question: "Did you change the default password on your camera during setup?",
    options: ["Yes", "No", "Not sure"],
    safe: 0,
    weight: 15,
    context: "Default passwords are the #1 way cameras get hacked.",
  },
  {
    id: 2,
    question: "Is two-factor authentication (2FA) enabled on your camera account?",
    options: ["Yes", "No", "What's 2FA?"],
    safe: 0,
    weight: 15,
    context: "Without 2FA, a stolen password is all an attacker needs.",
  },
  {
    id: 3,
    question:
      "Do you use the same password for your camera app that you use on other websites?",
    options: ["No, it's unique", "Yes, I reuse it", "I'm not sure"],
    safe: 0,
    weight: 14,
    context:
      "Reused passwords let hackers from one breach access your cameras.",
  },
  {
    id: 4,
    question:
      "Is your camera on a separate WiFi network from your personal devices?",
    options: ["Yes, separate network", "No, same network", "I don't know how"],
    safe: 0,
    weight: 12,
    context:
      "A compromised camera on your main WiFi exposes every device.",
  },
  {
    id: 5,
    question: "When was the last time you updated your camera's firmware?",
    options: [
      "Within 3 months",
      "More than 3 months / never",
      "I didn't know that was a thing",
    ],
    safe: 0,
    weight: 10,
    context: "Unpatched firmware leaves known vulnerabilities wide open.",
  },
  {
    id: 6,
    question:
      "Have you changed your home router's admin password from the default?",
    options: ["Yes", "No", "I don't know what that means"],
    safe: 0,
    weight: 10,
    context:
      "Router admin defaults like 'admin/admin' let anyone reconfigure your network.",
  },
  {
    id: 7,
    question:
      "Is two-way audio enabled on cameras where you don't need it?",
    options: ["No, I disabled it", "Yes, it's on", "I haven't checked"],
    safe: 0,
    weight: 8,
    context:
      "Every enabled feature is an attack surface an intruder can exploit.",
  },
  {
    id: 8,
    question:
      "Do you know how many people currently have shared access to your camera?",
    options: [
      "Yes, I've reviewed it",
      "No, I've never checked",
      "I didn't know you could share",
    ],
    safe: 0,
    weight: 8,
    context:
      "Old shared access grants can give forgotten accounts a live view into your home.",
  },
  {
    id: 9,
    question: "What WiFi encryption does your router use?",
    options: ["WPA3 or WPA2", "WPA or WEP", "No idea"],
    safe: 0,
    weight: 8,
    context:
      "WEP and WPA encryption can be cracked in minutes with free tools.",
  },
];

const TOTAL_WEIGHT = QUESTIONS.reduce((sum, q) => sum + q.weight, 0);

function getRiskLevel(score: number): RiskLevel {
  const pct = (score / TOTAL_WEIGHT) * 100;
  if (pct >= 80)
    return {
      level: "LOW",
      color: "#10B981",
      bg: "#064E3B",
      label: "Your cameras are well-secured.",
      emoji: "\u{1F7E2}",
    };
  if (pct >= 55)
    return {
      level: "MODERATE",
      color: "#F59E0B",
      bg: "#78350F",
      label: "You have gaps that attackers commonly exploit.",
      emoji: "\u{1F7E1}",
    };
  if (pct >= 30)
    return {
      level: "HIGH",
      color: "#F97316",
      bg: "#7C2D12",
      label: "Your cameras have serious security weaknesses.",
      emoji: "\u{1F7E0}",
    };
  return {
    level: "CRITICAL",
    color: "#EF4444",
    bg: "#7F1D1D",
    label: "Your cameras are highly vulnerable to attack.",
    emoji: "\u{1F534}",
  };
}

function ScanLine({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "2px",
        background:
          "linear-gradient(90deg, transparent, #EF4444, transparent)",
        animation: "scanDown 2s ease-in-out infinite",
      }}
    />
  );
}

export default function CameraSecurityQuiz() {
  const [phase, setPhase] = useState<"intro" | "quiz" | "gate" | "results">(
    "intro"
  );
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [email, setEmail] = useState("");
  const [score, setScore] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [emailError, setEmailError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const gateHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultsHeadingRef = useRef<HTMLDivElement>(null);

  const handleAnswer = (optionIndex: number) => {
    if (animating) return;
    setAnimating(true);
    const q = QUESTIONS[currentQ];
    const pts = optionIndex === q.safe ? q.weight : 0;
    const newAnswers = [
      ...answers,
      { qIndex: currentQ, answer: optionIndex, points: pts },
    ];
    setAnswers(newAnswers);

    setTimeout(() => {
      if (currentQ < QUESTIONS.length - 1) {
        setCurrentQ(currentQ + 1);
      } else {
        const total = newAnswers.reduce((s, a) => s + a.points, 0);
        setScore(total);
        setPhase("gate");
        setTimeout(() => gateHeadingRef.current?.focus(), 50);
      }
      setAnimating(false);
    }, 400);
  };

  const handleEmailSubmit = async () => {
    if (submitting) return;
    if (!email || !email.includes("@")) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          firstName: "",
          score,
          tier: getRiskLevel(score).level,
        }),
      });
      if (res.ok) {
        // Fire Meta Pixel Lead event only on successful subscribe
        if (typeof window !== "undefined" && (window as any).fbq) {
          (window as any).fbq("track", "Lead");
        }
      }
    } catch {
      // Silent fail — don't block the user from seeing results
    }
    setSubmitting(false);
    setPhase("results");
    setTimeout(() => { resultsHeadingRef.current?.focus(); setShowResult(true); }, 300);
  };

  // Skip removed — email is required to see results

  const restart = () => {
    setPhase("intro");
    setCurrentQ(0);
    setAnswers([]);
    setEmail("");
    setScore(0);
    setShowResult(false);
  };

  const risk = getRiskLevel(score);
  const pct = Math.round((score / TOTAL_WEIGHT) * 100);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0C0F14",
        fontFamily:
          "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
        color: "#E5E7EB",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <style>{`
        @keyframes scanDown {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(500px); opacity: 0; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        * { box-sizing: border-box; }
        button:focus-visible {
          outline: 2px solid #EF4444;
          outline-offset: 2px;
        }
      `}</style>

      <div ref={containerRef} style={{ width: "100%", maxWidth: 520, position: "relative" }}>
        {/* INTRO */}
        {phase === "intro" && (
          <div style={{ animation: "fadeUp 0.5s ease" }}>
            <div
              style={{
                background: "#161A22",
                border: "1px solid #1E2330",
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  background: "#1A1F2B",
                  padding: "14px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderBottom: "1px solid #1E2330",
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#EF4444",
                    animation: "pulse 2s infinite",
                  }}
                />
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    color: "#6B7280",
                    letterSpacing: "0.05em",
                  }}
                >
                  SECURITY_SCAN
                </span>
              </div>

              <div style={{ padding: "40px 32px 44px" }}>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: "#EF4444",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase" as const,
                    marginBottom: 12,
                    fontWeight: 700,
                  }}
                >
                  &#9888; Vulnerability Assessment
                </div>

                <h1
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: 32,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    marginBottom: 16,
                    color: "#F9FAFB",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Is Your Smart Camera
                  <br />
                  <span style={{ color: "#EF4444" }}>Hackable?</span>
                </h1>

                <p
                  style={{
                    fontSize: 16,
                    color: "#9CA3AF",
                    lineHeight: 1.6,
                    marginBottom: 32,
                    maxWidth: 420,
                  }}
                >
                  Answer 9 quick questions about your camera setup. Get an
                  instant risk score &mdash; and find out if your home security
                  system is actually secure.
                </p>

                <button
                  onClick={() => {
                    setPhase("quiz");
                    if (typeof window !== "undefined" && (window as any).fbq) {
                      (window as any).fbq("track", "ViewContent", { content_name: "Camera Security Quiz" });
                    }
                  }}
                  style={{
                    background: "#EF4444",
                    color: "white",
                    border: "none",
                    padding: "14px 32px",
                    borderRadius: 10,
                    fontSize: 16,
                    fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    transition: "all 0.2s",
                    boxShadow: "0 4px 20px rgba(239, 68, 68, 0.3)",
                  }}
                >
                  Run Security Scan
                  <span style={{ fontSize: 18 }}>&#8594;</span>
                </button>

                <p
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: "#4B5563",
                    marginTop: 16,
                  }}
                >
                  Takes about 60 seconds. No signup required.
                </p>
              </div>
            </div>

            <p
              style={{
                textAlign: "center" as const,
                fontSize: 11,
                color: "#374151",
                marginTop: 16,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              securemycameras.com &middot; Salish AI Security Lab
            </p>
          </div>
        )}

        {/* QUIZ */}
        {phase === "quiz" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div
              style={{
                background: "#161A22",
                border: "1px solid #1E2330",
                borderRadius: 16,
                overflow: "hidden",
                position: "relative" as const,
              }}
            >
              <ScanLine active={animating} />

              <div
                style={{
                  background: "#1A1F2B",
                  padding: "14px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid #1E2330",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#10B981",
                      animation: "pulse 1.5s infinite",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      color: "#6B7280",
                    }}
                  >
                    SCANNING...
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    color: "#9CA3AF",
                    fontWeight: 500,
                  }}
                >
                  {currentQ + 1} / {QUESTIONS.length}
                </span>
              </div>

              <div style={{ height: 3, background: "#1E2330" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${(currentQ / QUESTIONS.length) * 100}%`,
                    background:
                      "linear-gradient(90deg, #EF4444, #F97316)",
                    transition: "width 0.4s ease",
                    borderRadius: "0 2px 2px 0",
                  }}
                />
              </div>

              <div style={{ padding: "36px 32px 40px" }}>
                <div
                  key={currentQ}
                  style={{
                    animation: animating ? "none" : "fadeUp 0.35s ease",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      color: "#6B7280",
                      marginBottom: 12,
                      letterSpacing: "0.04em",
                    }}
                  >
                    CHECK_{String(currentQ + 1).padStart(2, "0")}
                  </p>

                  <h2
                    style={{
                      fontFamily: "'Outfit', sans-serif",
                      fontSize: 20,
                      fontWeight: 600,
                      lineHeight: 1.4,
                      marginBottom: 28,
                      color: "#F3F4F6",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {QUESTIONS[currentQ].question}
                  </h2>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column" as const,
                      gap: 10,
                    }}
                  >
                    {QUESTIONS[currentQ].options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => handleAnswer(i)}
                        disabled={animating}
                        style={{
                          background: "#1A1F2B",
                          border: "1px solid #2D3348",
                          borderRadius: 10,
                          padding: "14px 18px",
                          color: "#D1D5DB",
                          fontSize: 15,
                          fontFamily: "'Outfit', sans-serif",
                          fontWeight: 500,
                          cursor: "pointer",
                          textAlign: "left" as const,
                          transition: "all 0.15s",
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 7,
                            background: "#0C0F14",
                            border: "1px solid #2D3348",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 11,
                            color: "#6B7280",
                            flexShrink: 0,
                          }}
                        >
                          {String.fromCharCode(65 + i)}
                        </span>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EMAIL GATE */}
        {phase === "gate" && (
          <div style={{ animation: "fadeUp 0.5s ease" }}>
            <div
              style={{
                background: "#161A22",
                border: "1px solid #1E2330",
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  background: "#1A1F2B",
                  padding: "14px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderBottom: "1px solid #1E2330",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#F59E0B",
                  }}
                />
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: "#6B7280",
                  }}
                >
                  SCAN_COMPLETE &mdash; RESULTS_READY
                </span>
              </div>

              <div style={{ padding: "40px 32px" }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: risk.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 28,
                    marginBottom: 20,
                  }}
                >
                  {risk.emoji}
                </div>

                <h2
                  ref={gateHeadingRef}
                  tabIndex={-1}
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: 24,
                    fontWeight: 700,
                    marginBottom: 8,
                    color: "#F9FAFB",
                    outline: "none",
                  }}
                >
                  {(() => {
                    const failCount = answers.filter((a) => a.points === 0).length;
                    return (risk.level === "CRITICAL" || risk.level === "HIGH")
                      ? `You Failed ${failCount} of ${QUESTIONS.length} Security Checks`
                      : `${failCount} Security Gaps Found in Your Setup`;
                  })()}
                </h2>

                <p
                  style={{
                    fontSize: 15,
                    color: "#9CA3AF",
                    lineHeight: 1.6,
                    marginBottom: 28,
                  }}
                >
                  Enter your email to get your full vulnerability report &mdash; including which gaps attackers exploit first and how to close each one.
                </p>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginBottom: 12,
                    flexWrap: "wrap" as const,
                  }}
                >
                  <input
                    type="email"
                    id="email-gate"
                    placeholder="you@email.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(""); }}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleEmailSubmit()
                    }
                    aria-label="Email address"
                    aria-describedby={emailError ? "email-error" : undefined}
                    aria-invalid={!!emailError}
                    autoComplete="email"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: "#0C0F14",
                      border: "1px solid #2D3348",
                      borderRadius: 10,
                      padding: "12px 16px",
                      fontSize: 16,
                      fontFamily: "'Outfit', sans-serif",
                      color: "#E5E7EB",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={handleEmailSubmit}
                    disabled={submitting}
                    aria-busy={submitting}
                    aria-label={submitting ? "Sending, please wait" : "See my security score"}
                    style={{
                      background: submitting ? "#9CA3AF" : "#EF4444",
                      color: "white",
                      border: "none",
                      padding: "12px 24px",
                      borderRadius: 10,
                      fontSize: 15,
                      fontWeight: 600,
                      fontFamily: "'Outfit', sans-serif",
                      cursor: submitting ? "wait" : "pointer",
                      whiteSpace: "nowrap" as const,
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    {submitting ? "Sending\u2026" : "Show My Vulnerabilities \u2192"}
                  </button>
                </div>
                {emailError && (
                  <p
                    id="email-error"
                    role="alert"
                    style={{
                      fontSize: 13,
                      color: "#EF4444",
                      marginTop: 6,
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    {emailError}
                  </p>
                )}

                <p
                  style={{
                    fontSize: 11,
                    color: "#6B7280",
                    marginTop: 16,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  You'll get 5 targeted fix emails over the next week. Unsubscribe anytime.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* RESULTS */}
        {phase === "results" && (
          <div style={{ animation: "fadeUp 0.5s ease" }}>
            <div
              style={{
                background: "#161A22",
                border: "1px solid #1E2330",
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  background: "#1A1F2B",
                  padding: "14px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderBottom: "1px solid #1E2330",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: risk.color,
                  }}
                />
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: "#6B7280",
                  }}
                >
                  VULNERABILITY_REPORT
                </span>
              </div>

              <div style={{ padding: "32px 28px" }}>
                {/* Score display */}
                <div
                  ref={resultsHeadingRef}
                  tabIndex={-1}
                  style={{
                    outline: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                    marginBottom: 24,
                    padding: "20px 24px",
                    background: risk.bg,
                    borderRadius: 12,
                    border: `1px solid ${risk.color}33`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 40,
                      fontWeight: 700,
                      color: risk.color,
                      lineHeight: 1,
                    }}
                  >
                    {pct}
                    <span style={{ fontSize: 20 }}>%</span>
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 12,
                        fontWeight: 700,
                        color: risk.color,
                        letterSpacing: "0.06em",
                        marginBottom: 4,
                      }}
                    >
                      RISK LEVEL: {risk.level}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: "#D1D5DB",
                        lineHeight: 1.4,
                        fontFamily: "'Outfit', sans-serif",
                      }}
                    >
                      {risk.label}
                    </div>
                  </div>
                </div>

                {/* Score bar */}
                <div style={{ marginBottom: 28 }}>
                  <div
                    style={{
                      height: 8,
                      background: "#1E2330",
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: showResult ? `${pct}%` : "0%",
                        background: `linear-gradient(90deg, #EF4444, ${risk.color})`,
                        borderRadius: 4,
                        transition: "width 1s ease",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 6,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10,
                      color: "#4B5563",
                    }}
                  >
                    <span>CRITICAL</span>
                    <span>HIGH</span>
                    <span>MODERATE</span>
                    <span>LOW</span>
                  </div>
                </div>

                {/* Findings */}
                <h3
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: "#6B7280",
                    letterSpacing: "0.06em",
                    marginBottom: 14,
                  }}
                >
                  FINDINGS
                </h3>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column" as const,
                    gap: 8,
                    marginBottom: 28,
                  }}
                >
                  {answers.map((a, i) => {
                    const q = QUESTIONS[a.qIndex];
                    const passed = a.points > 0;
                    return (
                      <div
                        key={i}
                        style={{
                          background: "#1A1F2B",
                          borderRadius: 8,
                          padding: "12px 16px",
                          borderLeft: `3px solid ${passed ? "#10B981" : "#EF4444"}`,
                          animation: showResult
                            ? `fadeUp 0.3s ease ${i * 0.06}s both`
                            : "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 12,
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <p
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "#D1D5DB",
                                fontFamily: "'Outfit', sans-serif",
                                marginBottom: 2,
                                lineHeight: 1.4,
                              }}
                            >
                              {q.question}
                            </p>
                            {!passed && (
                              <p
                                style={{
                                  fontSize: 12,
                                  color: "#9CA3AF",
                                  fontFamily: "'Outfit', sans-serif",
                                  lineHeight: 1.4,
                                  marginTop: 4,
                                }}
                              >
                                {q.context}
                              </p>
                            )}
                          </div>
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 10,
                              fontWeight: 700,
                              color: passed ? "#10B981" : "#EF4444",
                              background: passed
                                ? "#10B98118"
                                : "#EF444418",
                              padding: "3px 8px",
                              borderRadius: 4,
                              whiteSpace: "nowrap" as const,
                              flexShrink: 0,
                            }}
                          >
                            {passed ? "PASS" : "FAIL"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* CTA */}
                {(() => {
                  const failCount = answers.filter((a) => a.points === 0).length;
                  return (
                <div
                  style={{
                    background: "#0C0F14",
                    borderRadius: 12,
                    padding: "24px",
                    textAlign: "center" as const,
                    border: `1px solid ${risk.color}44`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 12,
                      fontWeight: 700,
                      color: risk.color,
                      letterSpacing: "0.06em",
                      marginBottom: 10,
                    }}
                  >
                    YOUR RISK LEVEL: {risk.level}
                  </div>
                  <p
                    style={{
                      fontSize: 15,
                      color: "#D1D5DB",
                      marginBottom: 8,
                      lineHeight: 1.5,
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    You have{" "}
                    <span style={{ color: risk.color, fontWeight: 700 }}>
                      {failCount} open vulnerabilities
                    </span>{" "}
                    in your camera setup.
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#9CA3AF",
                      marginBottom: 16,
                      lineHeight: 1.5,
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    These vulnerabilities are exploitable right now. The guide closes all of them &mdash; step by step, in one afternoon.
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: "#6B7280",
                      marginBottom: 16,
                      lineHeight: 1.5,
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    A 22-page PDF with a 10-step checklist covering Ring, Nest, Arlo, Wyze, Eufy, and Reolink.
                  </p>
                  <button
                    onClick={() => {
                      if (typeof window !== "undefined" && (window as any).Paddle) {
                        (window as any).Paddle.Checkout.open({
                          items: [{ priceId: "pri_01km3xxxxj43c9q84yeyn3k642", quantity: 1 }],
                        });
                      }
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      background: "#EF4444",
                      color: "white",
                      border: "none",
                      padding: "14px 28px",
                      borderRadius: 10,
                      fontSize: 16,
                      fontWeight: 600,
                      fontFamily: "'Outfit', sans-serif",
                      boxShadow: "0 4px 20px rgba(239, 68, 68, 0.3)",
                      cursor: "pointer",
                    }}
                  >
                    {failCount > 0 ? `Fix All ${failCount} Vulnerabilities` : "Get the Guide"} &mdash; $29
                  </button>
                  <p
                    style={{
                      fontSize: 12,
                      color: "#6B7280",
                      marginTop: 10,
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    Not useful? Full refund within 30 days.
                  </p>
                  <p
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      color: "#4B5563",
                      marginTop: 8,
                    }}
                  >
                    Instant PDF download. No subscription.
                  </p>
                </div>
                  );
                })()}

                {/* Restart */}
                <div style={{ textAlign: "center" as const, marginTop: 20 }}>
                  <button
                    onClick={restart}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#4B5563",
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                      cursor: "pointer",
                    }}
                  >
                    &#8634; Retake quiz
                  </button>
                </div>
              </div>
            </div>

            <p
              style={{
                textAlign: "center" as const,
                fontSize: 11,
                color: "#374151",
                marginTop: 16,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              securemycameras.com &middot; Salish AI Security Lab
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
