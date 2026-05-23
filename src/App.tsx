import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";

// --- Utility helpers ---
function range(n: number) {
  return Array.from({ length: n }, (_, i) => i);
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fairMultiplier(t: number, b: number, k: number): number {
  if (k <= 0) return 1;
  let m = 1;
  for (let i = 0; i < k; i++) {
    m *= (t - i) / (t - b - i);
  }
  return m;
}

function withHouseEdge(mult: number, edgePct: number) {
  const e = Math.min(Math.max(edgePct, 0), 10);
  return mult * (1 - e / 100);
}

// --- Tile component ---
function Tile({ index, isBomb, revealed, disabled, onClick, gridSize, justRevealed, wasBomb }: {
  index: number;
  isBomb: boolean;
  revealed: boolean;
  disabled: boolean;
  gridSize: number;
  justRevealed: boolean;
  wasBomb: boolean;
  onClick: (i: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [pop, setPop] = useState(false);

  // Ensure pressed never gets stuck if the mouse leaves quickly
  useEffect(() => {
    const onUp = () => setPressed(false);
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  // If the tile becomes unrevealed (e.g., grid change), clear transient flags
  useEffect(() => {
    if (!revealed) {
      setHovered(false);
      setPressed(false);
      setPop(false);
    }
  }, [revealed]);

  useEffect(() => {
    if (revealed && justRevealed) {
      setPop(true);
      const t = setTimeout(() => setPop(false), 180);
      return () => clearTimeout(t);
    }
  }, [revealed, justRevealed]);

  const baseBg = revealed ? (isBomb ? "#dc2626" : "#059669") : hovered ? "#273449" : "#1e293b";

  return (
    <button
      onClick={() => onClick(index)}
      disabled={disabled || revealed}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => !disabled && !revealed && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled && !revealed) setPressed(true); }}
      onKeyUp={() => setPressed(false)}
      onTransitionEnd={() => setPop(false)}
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: 12,
        fontSize: `${Math.max(16, 140 / Math.max(gridSize, gridSize))}px`,
        fontWeight: 700,
        cursor: disabled || revealed ? "not-allowed" : "pointer",
        background: baseBg,
        color: revealed ? "#fff" : "#e2e8f0",
        border: "1px solid #334155",
        transition: "transform 120ms ease, background 140ms ease",
        transform: pressed ? "scale(0.94)" : pop ? "scale(1.06)" : hovered ? "translateY(-2px)" : "none",
        boxShadow: revealed
          ? (justRevealed && wasBomb
              ? "0 0 0 2px rgba(239,68,68,0.6), 0 8px 16px rgba(0,0,0,0.35)"
              : "0 6px 12px rgba(0,0,0,0.35)")
          : "0 4px 10px rgba(0,0,0,0.3)",
        outline: "none",
      }}
    >
      {revealed ? (isBomb ? "💣" : "💎") : ""}
    </button>
  );
}

// --- Main Game component ---
export default function App() {
  const [gridSize, setGridSize] = useState(5); // allowed: 3,4,5,6
  const [bombs, setBombs] = useState(3);
  const [bombsInput, setBombsInput] = useState("3");

  const [bet, setBet] = useState(1);
  const [betInput, setBetInput] = useState("1");
  const [edge, setEdge] = useState(0);
  const [edgeInput, setEdgeInput] = useState("0");
  const [started, setStarted] = useState(false);


  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [bombSet, setBombSet] = useState<Set<number>>(new Set());
  const [lost, setLost] = useState(false);
  const [cashedOut, setCashedOut] = useState(false);
  const [balance, setBalance] = useState(100);
  const [lastPayout, setLastPayout] = useState<number | null>(null);
  const [lastRevealIndex, setLastRevealIndex] = useState<number | null>(null);
  const [lastWasBomb, setLastWasBomb] = useState(false);
  const [roundCount, setRoundCount] = useState(0);
  const [cashOutCount, setCashOutCount] = useState(0);
  const [bestCashOut, setBestCashOut] = useState<number | null>(null);
  const [bestSafeStreak, setBestSafeStreak] = useState(0);
  const [showResultModal, setShowResultModal] = useState(false);

  const [volume, setVolume] = useState<number>(70); // 0–100 (%)
  const audioCtxRef = useRef<any>(null);

  function ensureCtx() {
    if (volume === 0) return null;
    const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === "suspended") {
      try { audioCtxRef.current.resume?.(); } catch {}
    }
    return audioCtxRef.current;
  }

  function playTone(freq: number, duration = 0.15, type: OscillatorType = "sine", gain = 0.03) {
    const ctx = ensureCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const level = Math.max(0, Math.min(1, volume / 100)) * gain; // master volume 0..1
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function playSafe() {
    // quick two-note up
    playTone(740, 0.12, "sine");
    setTimeout(() => playTone(880, 0.12, "sine"), 90);
  }
  function playBomb() {
    // descending growl
    playTone(180, 0.18, "square", 0.04);
    setTimeout(() => playTone(120, 0.22, "sawtooth", 0.05), 120);
  }
  function playCash() {
    // pleasant triad up
    playTone(659, 0.12, "sine"); // E5
    setTimeout(() => playTone(784, 0.12, "sine"), 100); // G5
    setTimeout(() => playTone(988, 0.16, "sine"), 200); // B5
  }

  const rows = gridSize;
  const cols = gridSize;
  const total = rows * cols;
  const safeCount = total - bombs;

  const activeRound = started && !lost && !cashedOut;

  const resetBoard = useCallback(() => {
    setStarted(false);
    setRevealed(new Set());
    setBombSet(new Set());
    setLost(false);
    setCashedOut(false);
    setLastPayout(null);
    setLastRevealIndex(null);
    setLastWasBomb(false);
  }, []);

  const commitBombsInput = () => {
    const parsed = parseInt(bombsInput, 10);
    const maxBombs = gridSize * gridSize - 1;
    if (Number.isNaN(parsed)) {
      setBombsInput(String(bombs));
      return;
    }
    const nextBombs = Math.max(1, Math.min(parsed, maxBombs));
    setBombs(nextBombs);
    setBombsInput(String(nextBombs));
  };

  const commitBetInput = () => {
    const parsed = parseFloat(betInput);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setBetInput(String(bet));
      return;
    }
    const nextBet = Math.round(parsed * 100) / 100;
    setBet(nextBet);
    setBetInput(String(nextBet));
  };

  const commitEdgeInput = () => {
    const parsed = parseFloat(edgeInput);
    if (Number.isNaN(parsed)) {
      setEdgeInput(String(edge));
      return;
    }
    const nextEdge = Math.max(0, Math.min(parsed, 10));
    setEdge(nextEdge);
    setEdgeInput(String(nextEdge));
  };

  useEffect(() => {
    const maxBombs = gridSize * gridSize - 1;
    setBombs((b) => {
      const nextBombs = Math.max(1, Math.min(b, maxBombs));
      setBombsInput(String(nextBombs));
      return nextBombs;
    });
  }, [gridSize]);

  useEffect(() => {
    if (!started) {
      resetBoard();
    }
  }, [bombs, gridSize, resetBoard, started]);

  useEffect(() => {
    setBombsInput(String(bombs));
  }, [bombs]);

  useEffect(() => {
    setBetInput(String(bet));
  }, [bet]);

  useEffect(() => {
    setEdgeInput(String(edge));
  }, [edge]);

  const startGame = () => {
    const t = rows * cols;
    if (rows < 1 || cols < 1) return alert("Rows and columns must be ≥ 1");
    if (bombs < 1 || bombs >= t) return alert("Bombs must be between 1 and total tiles - 1");
    if (bet <= 0) return alert("Bet must be > 0");
    if (balance < bet) return alert("Insufficient balance for this bet.");

    setBalance((b) => b - bet);

    const all = range(t);
    const shuffled = shuffle(all);
    const bombsIdx = new Set(shuffled.slice(0, bombs));
    setRoundCount((count) => count + 1);
    setBombSet(bombsIdx);
    setRevealed(new Set());
    setLost(false);
    setCashedOut(false);
    setLastPayout(null);
    setStarted(true);
  };

  const safePicks = useMemo(() => {
    if (!started) return 0;
    let s = 0;
    for (const i of revealed) if (!bombSet.has(i)) s++;
    return s;
  }, [revealed, bombSet, started]);

  const currentFairMult = useMemo(() => fairMultiplier(total, bombs, safePicks), [total, bombs, safePicks]);
  const displayedMult = useMemo(() => withHouseEdge(currentFairMult, edge), [currentFairMult, edge]);
  const potentialPayout = useMemo(() => (lost || cashedOut || safePicks === 0 ? 0 : bet * displayedMult), [bet, displayedMult, lost, cashedOut, safePicks]);

  const unrevealedCount = total - revealed.size;
  const nextSafeProb = activeRound && unrevealedCount > 0 ? (unrevealedCount - bombs) / unrevealedCount : 0;
  const nextBustProb = activeRound ? 1 - nextSafeProb : 0;
  const nextFairMult = useMemo(() => fairMultiplier(total, bombs, safePicks + 1), [total, bombs, safePicks]);
  const nextDisplayedMult = useMemo(() => withHouseEdge(nextFairMult, edge), [nextFairMult, edge]);
  const evIfCashNow = safePicks > 0 && activeRound ? bet * displayedMult : 0;
  const evIfOneMoreThenCash = activeRound ? nextSafeProb * (bet * nextDisplayedMult) : 0;
  const nextHitPayout = activeRound ? bet * nextDisplayedMult : 0;
  const bombDensity = total > 0 ? bombs / total : 0;
  const surviveTwoMoreProb = activeRound && unrevealedCount > 1
    ? nextSafeProb * ((unrevealedCount - bombs - 1) / (unrevealedCount - 1))
    : 0;
  const riskLabel = !activeRound
    ? "Waiting"
    : nextSafeProb >= 0.8
      ? "Low risk"
      : nextSafeProb >= 0.55
        ? "Medium risk"
        : "High risk";
  const roundsLost = Math.max(0, roundCount - cashOutCount);
  const cashOutRate = roundCount > 0 ? (cashOutCount / roundCount) * 100 : 0;
  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: `${5 + ((i * 17) % 90)}%`,
        delay: `${(i % 6) * 0.12}s`,
        duration: `${2.1 + (i % 4) * 0.25}s`,
        rotate: `${(i % 5) * 18}deg`,
        color: ["#f59e0b", "#22c55e", "#38bdf8", "#f472b6", "#facc15", "#a78bfa"][i % 6],
      })),
    []
  );

  const handleClick = (i: number) => {
    if (!started || lost || cashedOut) return;
    if (revealed.has(i)) return;

    const newRev = new Set(revealed);
    newRev.add(i);

    if (bombSet.has(i)) {
      setRevealed(newRev);
      setLost(true);
      setLastPayout(0);
      setLastRevealIndex(i);
      setLastWasBomb(true);
      setShowResultModal(true);
      playBomb();
      return;
    }

    setRevealed(newRev);
    setLastRevealIndex(i);
    setLastWasBomb(false);
    playSafe();
  };

  const handleCashOut = () => {
    if (!started || lost || cashedOut) return;
    if (safePicks === 0) return; // no payout until at least one safe pick
    const payout = bet * displayedMult;
    setBalance((b) => b + payout);
    setLastPayout(payout);
    setCashOutCount((count) => count + 1);
    setBestCashOut((best) => best === null || payout > best ? payout : best);
    setBestSafeStreak((best) => Math.max(best, safePicks));
    setShowResultModal(true);
    playCash();
    setCashedOut(true);
  };

  useEffect(() => {
    if (lost) {
      setBestSafeStreak((best) => Math.max(best, safePicks));
    }
  }, [lost, safePicks]);

  useEffect(() => {
    if (!lost && !cashedOut) {
      setShowResultModal(false);
    }
  }, [lost, cashedOut]);

  const tiles = range(total);

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#f8fafc", padding: 24 }}>
      <style>{`
        @keyframes modalPop {
          0% { opacity: 0; transform: translateY(10px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes confettiFall {
          0% { transform: translateY(-18px) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(210px) rotate(540deg); opacity: 0; }
        }
      `}</style>
      <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 2fr", gap: 24 }}>
        {/* Controls Panel */}
        <div style={{ background: "#1e293b", padding: 20, borderRadius: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Mines & Bombs</h1>
          <p style={{ color: "#cbd5e1", marginBottom: 16 }}>Customize the grid, choose bomb count, and click safe tiles to grow your multiplier.</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <label style={{ gridColumn: "1 / span 2" }}>
              <span>Grid size</span>
              <select
                value={gridSize}
                onChange={(e) => {
                  if (activeRound) { alert("Finish or Reset the round before changing grid size."); return; }
                  setGridSize(parseInt(e.target.value, 10));
                }}
                disabled={activeRound}
                style={{ width: "100%", padding: 8, borderRadius: 8, background: activeRound ? "#475569" : "#334155", border: "none", color: "#fff", opacity: activeRound ? 0.7 : 1 }}
              >
                <option value={3}>3 × 3</option>
                <option value={4}>4 × 4</option>
                <option value={5}>5 × 5</option>
                <option value={6}>6 × 6</option>
              </select>
            </label>

            <label style={{ gridColumn: "1 / span 2" }}>
              <span>Bombs</span>
              <input
                type="number"
                min={1}
                value={bombsInput}
                onChange={(e) => {
                  if (activeRound) { alert("Finish or Reset the round before changing bombs."); return; }
                  setBombsInput(e.target.value);
                }}
                onBlur={commitBombsInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitBombsInput();
                  }
                }}
                disabled={activeRound}
                style={{ width: "100%", padding: 8, borderRadius: 8, background: activeRound ? "#475569" : "#334155", border: "none", color: "#fff", opacity: activeRound ? 0.7 : 1 }}
              />
            </label>

            <label>
              <span>Bet</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={betInput}
                onChange={(e) => {
                  if (activeRound) { alert("Finish or Reset the round before changing bet."); return; }
                  setBetInput(e.target.value);
                }}
                onBlur={commitBetInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitBetInput();
                  }
                }}
                disabled={activeRound}
                style={{ width: "100%", padding: 8, borderRadius: 8, background: activeRound ? "#475569" : "#334155", border: "none", color: "#fff", opacity: activeRound ? 0.7 : 1 }}
              />
            </label>

            <label>
              <span>House Edge (%)</span>
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={edgeInput}
                onChange={(e) => {
                  if (activeRound) { alert("Finish or Reset the round before changing house edge."); return; }
                  setEdgeInput(e.target.value);
                }}
                onBlur={commitEdgeInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitEdgeInput();
                  }
                }}
                disabled={activeRound}
                style={{ width: "100%", padding: 8, borderRadius: 8, background: activeRound ? "#475569" : "#334155", border: "none", color: "#fff", opacity: activeRound ? 0.7 : 1 }}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {!started ? (
              <button onClick={startGame} style={{ padding: "8px 16px", borderRadius: 8, background: "#059669", border: "none", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Start</button>
            ) : activeRound ? (
              <button onClick={handleCashOut} disabled={safePicks === 0} style={{ padding: "8px 16px", borderRadius: 8, background: "#f59e0b", border: "none", color: "#000", fontWeight: 600, cursor: safePicks === 0 ? "not-allowed" : "pointer" }}>Cash Out</button>
            ) : (
              <button onClick={startGame} style={{ padding: "8px 16px", borderRadius: 8, background: "#3b82f6", border: "none", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Play Again</button>
            )}
            {!activeRound && (started || revealed.size > 0 || lost || cashedOut) && (
              <button onClick={resetBoard} style={{ padding: "8px 16px", borderRadius: 8, background: "#475569", border: "none", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Reset</button>
            )}
          </div>

          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <label htmlFor="volume-slider" style={{ whiteSpace: "nowrap" }}>Volume</label>
            <input
              id="volume-slider"
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(parseInt(e.target.value, 10))}
              style={{ width: "100%" }}
            />
            <span style={{ width: 36, textAlign: "right" }}>{volume}%</span>
          </div>

          <div style={{ marginTop: 16, fontSize: 14 }}>
            <p>Balance: {balance.toFixed(2)}</p>
            <p>Tiles: {total}</p>
            <p>Bombs: {bombs}</p>
            <p>Safes remaining: {safeCount - safePicks}</p>
            <p>Safe picks: {safePicks}</p>
            <p>Multiplier: {displayedMult.toFixed(4)}×</p>
            <p>Potential payout: {potentialPayout.toFixed(2)}</p>
          </div>

          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#0b1220", border: "1px solid #23314d" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong>Risk Meter</strong>
              <span>{(nextSafeProb * 100).toFixed(1)}% safe</span>
            </div>
            <div style={{ height: 8, background: "#162238", borderRadius: 9999, overflow: "hidden" }}>
              <div style={{ width: `${Math.max(0, Math.min(100, nextSafeProb * 100))}%`, height: "100%", background: nextSafeProb > 0.66 ? "#10b981" : nextSafeProb > 0.33 ? "#f59e0b" : "#ef4444" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginTop: 10, fontSize: 14 }}>
              <div style={{ padding: 8, borderRadius: 8, background: "#111827", border: "1px solid #2a364e" }}>
                <div style={{ opacity: 0.7 }}>Cash out now (EV)</div>
                <div style={{ fontWeight: 700 }}>{evIfCashNow.toFixed(2)}</div>
              </div>
              <div style={{ padding: 8, borderRadius: 8, background: "#111827", border: "1px solid #2a364e" }}>
                <div style={{ opacity: 0.7 }}>Take one more then cash (EV)</div>
                <div style={{ fontWeight: 700 }}>{evIfOneMoreThenCash.toFixed(2)}</div>
              </div>
              <div style={{ padding: 8, borderRadius: 8, background: "#111827", border: "1px solid #2a364e" }}>
                <div style={{ opacity: 0.7 }}>Next pick outcomes</div>
                <div style={{ fontWeight: 700 }}>
                  {activeRound ? `${(nextSafeProb * 100).toFixed(1)}% for ${nextHitPayout.toFixed(2)}` : "No active round"}
                </div>
                <div style={{ marginTop: 4, opacity: 0.7 }}>
                  {activeRound ? `${(nextBustProb * 100).toFixed(1)}% to bust to 0` : "Start a round to compare"}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Grid Panel */}
        <div style={{ background: "#1e293b", padding: 20, borderRadius: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, gap: 8 }}>
            {tiles.map((i) => (
              <Tile
                key={i}
                index={i}
                isBomb={bombSet.has(i)}
                revealed={revealed.has(i) || lost || cashedOut}
                disabled={!started || lost || cashedOut}
                gridSize={gridSize}
                justRevealed={lastRevealIndex === i}
                wasBomb={lastWasBomb}
                onClick={handleClick}
              />
            ))}
          </div>

          <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <div style={{ padding: 16, borderRadius: 14, background: "#111827", border: "1px solid #2a364e" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <strong>Round Insights</strong>
                <span style={{ color: activeRound ? "#34d399" : "#94a3b8" }}>{riskLabel}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, fontSize: 14 }}>
                <div>
                  <div style={{ opacity: 0.7 }}>Safe tiles left</div>
                  <div style={{ fontWeight: 700 }}>{safeCount - safePicks}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>Bomb density</div>
                  <div style={{ fontWeight: 700 }}>{(bombDensity * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>Bust chance next click</div>
                  <div style={{ fontWeight: 700 }}>{activeRound ? `${(nextBustProb * 100).toFixed(1)}%` : "No active round"}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>Projected payout if safe</div>
                  <div style={{ fontWeight: 700 }}>{activeRound ? nextHitPayout.toFixed(2) : "0.00"}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>Survive 2 more clicks</div>
                  <div style={{ fontWeight: 700 }}>{activeRound ? `${(surviveTwoMoreProb * 100).toFixed(1)}%` : "No active round"}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.7 }}>Current safe streak</div>
                  <div style={{ fontWeight: 700 }}>{safePicks}</div>
                </div>
              </div>
            </div>

            <div style={{ padding: 16, borderRadius: 14, background: "#111827", border: "1px solid #2a364e" }}>
              <div style={{ marginBottom: 12 }}>
                <strong>Session Stats</strong>
              </div>
              <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ opacity: 0.7 }}>Rounds played</span>
                  <strong>{roundCount}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ opacity: 0.7 }}>Cash-outs</span>
                  <strong>{cashOutCount}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ opacity: 0.7 }}>Rounds lost</span>
                  <strong>{roundsLost}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ opacity: 0.7 }}>Cash-out rate</span>
                  <strong>{cashOutRate.toFixed(0)}%</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ opacity: 0.7 }}>Best cash-out</span>
                  <strong>{bestCashOut !== null ? bestCashOut.toFixed(2) : "--"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ opacity: 0.7 }}>Best safe streak</span>
                  <strong>{bestSafeStreak}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showResultModal && (lost || cashedOut) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.72)",
            display: "grid",
            placeItems: "center",
            padding: 24,
            zIndex: 50,
          }}
        >
          <div
            style={{
              position: "relative",
              width: "min(440px, 100%)",
              overflow: "hidden",
              borderRadius: 22,
              padding: "28px 24px 22px",
              background: lost
                ? "linear-gradient(180deg, #1f2937 0%, #111827 100%)"
                : "linear-gradient(180deg, #11243a 0%, #111827 100%)",
              border: `1px solid ${lost ? "#7f1d1d" : "#1d4ed8"}`,
              boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
              animation: "modalPop 180ms ease-out",
              textAlign: "center",
            }}
          >
            {cashedOut &&
              confettiPieces.map((piece) => (
                <span
                  key={piece.id}
                  style={{
                    position: "absolute",
                    top: -8,
                    left: piece.left,
                    width: 10,
                    height: 18,
                    borderRadius: 999,
                    background: piece.color,
                    transform: `rotate(${piece.rotate})`,
                    animation: `confettiFall ${piece.duration} ease-in forwards`,
                    animationDelay: piece.delay,
                  }}
                />
              ))}

            <div
              style={{
                width: 72,
                height: 72,
                margin: "0 auto 16px",
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                fontSize: 34,
                background: lost ? "rgba(239,68,68,0.14)" : "rgba(34,197,94,0.16)",
                border: `1px solid ${lost ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.35)"}`,
              }}
            >
              {lost ? "💥" : "🎉"}
            </div>

            <h2 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 800 }}>
              {lost ? "Round Over" : "Cash Out Successful"}
            </h2>
            <p style={{ margin: "0 0 20px", color: "#cbd5e1", lineHeight: 1.5 }}>
              {lost
                ? "You hit a bomb and lost the round. The revealed board is still visible so you can review how it played out."
                : `You cashed out for ${lastPayout !== null ? lastPayout.toFixed(2) : "0.00"} and brought your balance to ${balance.toFixed(2)}.`}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 20, textAlign: "left" }}>
              <div style={{ padding: 12, borderRadius: 12, background: "rgba(15,23,42,0.55)", border: "1px solid #23314d" }}>
                <div style={{ opacity: 0.7, fontSize: 13 }}>Safe picks</div>
                <div style={{ fontWeight: 800, fontSize: 22 }}>{safePicks}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 12, background: "rgba(15,23,42,0.55)", border: "1px solid #23314d" }}>
                <div style={{ opacity: 0.7, fontSize: 13 }}>{lost ? "Bombs on board" : "Final multiplier"}</div>
                <div style={{ fontWeight: 800, fontSize: 22 }}>{lost ? bombs : `${displayedMult.toFixed(4)}x`}</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={() => setShowResultModal(false)}
                style={{ padding: "10px 16px", borderRadius: 10, background: "#334155", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowResultModal(false);
                  startGame();
                }}
                style={{ padding: "10px 16px", borderRadius: 10, background: lost ? "#ef4444" : "#10b981", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
