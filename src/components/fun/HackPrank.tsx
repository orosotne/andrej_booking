"use client";

// ⚠️ DOČASNÝ ŽART — celé v jednom súbore, ľahko odstrániteľné.
// Odstránenie: zmaž tento súbor + jeden import/render riadok v
// src/app/(app)/layout.tsx. Fotka: public/bohdan.png

import { useEffect, useState } from "react";

const UNLOCK_SECONDS = 10;

const QUOTES = [
  "Ako mi ide deň? Lietam, takže super! 🧹",
  "Čo je nové? Práve som ti zašifroval obed. 😏",
  "Andrej ma vraj počúva na slovo… aha, klame. 😅",
  "Dnes som už preletel 3 ambulancie a jednu kofolu.",
  "Pozor, idem sprava doľava — ako správny hacker!",
  "Heslá máš slabučké, toto fakt nie je bezpečné. 🔒",
  "Andrej, daj si pauzu, makáš ako ja na metle.",
  "Backup? Ten som si zobral so sebou. 📦",
  "Keby ma chytíš, kúpim ti langoš. 🥯",
  "Wifi tu lieta lepšie ako ja, klobúk dole. 🎩",
];

// 🔕 VYPNUTÉ — prank je dočasne neaktívny. Znova zapneš nastavením ENABLED = true.
const ENABLED = false;

export function HackPrank() {
  const [open, setOpen] = useState(true);
  const [flying, setFlying] = useState(false);
  const [remaining, setRemaining] = useState(UNLOCK_SECONDS);
  const [imgOk, setImgOk] = useState(true);
  const [quote, setQuote] = useState(QUOTES[0]);

  useEffect(() => {
    if (!open) return;
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [open, remaining]);

  // Náhodná hláška pri každom prelete (mení sa každých ~6 s).
  useEffect(() => {
    if (!flying) return;
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
    const i = setInterval(() => {
      setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
    }, 6000);
    return () => clearInterval(i);
  }, [flying]);

  function close() {
    if (remaining > 0) return;
    setOpen(false);
    setFlying(true);
  }

  if (!ENABLED) return null;

  return (
    <>
      <style>{keyframes}</style>

      {open && (
        <div
          role="alertdialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            display: "grid",
            placeItems: "center",
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(2px)",
            animation: "hp-bgblink 0.7s steps(1) infinite",
            padding: 16,
          }}
        >
          <div
            style={{
              position: "relative",
              maxWidth: 460,
              width: "100%",
              borderRadius: 18,
              padding: "28px 24px 24px",
              textAlign: "center",
              color: "#fff",
              background: "linear-gradient(180deg,#1a0000,#000)",
              boxShadow: "0 0 0 3px #f00, 0 0 40px 6px rgba(255,0,0,0.7)",
              animation: "hp-shake 0.5s ease-in-out infinite",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: 3,
                color: "#ff2d2d",
                animation: "hp-blink 0.5s steps(1) infinite",
              }}
            >
              ⚠️ VAROVANIE ⚠️ VAROVANIE ⚠️
            </div>

            <h1
              style={{
                margin: "14px 0 6px",
                fontSize: 26,
                fontWeight: 900,
                lineHeight: 1.15,
                textShadow: "0 0 12px #f00",
              }}
            >
              TENTO SYSTÉM BOL HACKNUTÝ
            </h1>

            <p style={{ margin: "0 0 14px", fontSize: 15 }}>
              Meno Hackera:{" "}
              <span
                style={{
                  color: "#39ff14",
                  fontWeight: 900,
                  textShadow: "0 0 10px #39ff14",
                }}
              >
                „Shelever Bohdan“
              </span>
            </p>

            {imgOk ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/bohdan.png"
                alt="Hacker Bohdan na metle"
                onError={() => setImgOk(false)}
                style={{
                  width: 180,
                  height: "auto",
                  margin: "0 auto 14px",
                  display: "block",
                  filter: "drop-shadow(0 0 14px rgba(255,0,0,0.8))",
                  animation: "hp-float 2s ease-in-out infinite",
                }}
              />
            ) : (
              <div
                style={{
                  fontSize: 90,
                  margin: "0 0 14px",
                  animation: "hp-float 2s ease-in-out infinite",
                }}
              >
                🧙‍♂️🧹
              </div>
            )}

            <p
              style={{
                margin: "0 0 18px",
                fontSize: 13,
                lineHeight: 1.5,
                color: "#ffd6d6",
              }}
            >
              Všetky tvoje dáta boli zašifrované jeho čarovnou metlou. 🧹✨
              <br />
              Výkupné: <b>3 langoše a jedna kofola</b>. Platba do polnoci, inak
              ti Bohdan preletí celým systémom a popráši ti všetky tabuľky.
              <br />
              <i>(žart — neboj sa, nič sa nestalo 😄)</i>
            </p>

            <button
              onClick={close}
              disabled={remaining > 0}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 12,
                border: "none",
                fontWeight: 800,
                fontSize: 15,
                cursor: remaining > 0 ? "not-allowed" : "pointer",
                color: remaining > 0 ? "#777" : "#000",
                background: remaining > 0 ? "#3a0000" : "#39ff14",
                transition: "all 0.2s",
                boxShadow: remaining > 0 ? "none" : "0 0 16px #39ff14",
              }}
            >
              {remaining > 0
                ? `Zavrieť možné o ${remaining} s…`
                : "Zaplatiť výkupné a zavrieť 🧹"}
            </button>
          </div>
        </div>
      )}

      {flying && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99998,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          {/* horizontálny pohyb sprava doľava */}
          <div
            style={{
              position: "absolute",
              left: 0,
              animation: "hp-fly-x 9s linear infinite",
            }}
          >
            {/* vertikálne blúdenie po celej výške */}
            <div style={{ position: "relative", animation: "hp-fly-y 5s ease-in-out infinite" }}>
              {/* komiksová bublina z úst */}
              <div className="hp-bubble">
                {quote}
                <span className="hp-bubble-tail" />
              </div>

              {/* iskry za Bohdanom (vpravo, keďže letí doľava) */}
              {SPARKS.map((s, i) => (
                <span
                  key={i}
                  style={{
                    position: "absolute",
                    top: s.top,
                    left: s.left,
                    fontSize: s.size,
                    animation: `hp-spark 0.8s ease-out ${s.delay}s infinite`,
                  }}
                >
                  ✨
                </span>
              ))}
              {imgOk ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/bohdan.png"
                  alt=""
                  style={{
                    position: "relative",
                    width: 130,
                    height: "auto",
                    filter: "drop-shadow(0 0 10px rgba(255,180,0,0.9))",
                  }}
                />
              ) : (
                <div style={{ position: "relative", fontSize: 64 }}>🧙‍♂️🧹</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// iskry sa ťahajú vpravo (za ním, keďže letí doľava)
const SPARKS = [
  { top: 20, left: 130, size: 18, delay: 0 },
  { top: 55, left: 145, size: 14, delay: 0.15 },
  { top: 90, left: 132, size: 20, delay: 0.3 },
  { top: 35, left: 165, size: 12, delay: 0.45 },
  { top: 75, left: 175, size: 16, delay: 0.6 },
  { top: 50, left: 195, size: 12, delay: 0.75 },
];

const keyframes = `
@keyframes hp-blink { 50% { opacity: 0; } }
@keyframes hp-bgblink {
  0%, 100% { background: rgba(0,0,0,0.85); }
  50% { background: rgba(60,0,0,0.9); }
}
@keyframes hp-shake {
  0%, 100% { transform: translate(0,0) rotate(0deg); }
  25% { transform: translate(-3px,2px) rotate(-0.6deg); }
  75% { transform: translate(3px,-2px) rotate(0.6deg); }
}
@keyframes hp-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
/* sprava doľava cez celú šírku */
@keyframes hp-fly-x {
  0%   { transform: translateX(100vw); }
  100% { transform: translateX(-260px); }
}
/* blúdenie po celej výške + mierne kývanie */
@keyframes hp-fly-y {
  0%   { transform: translateY(4vh) rotate(-4deg); }
  25%  { transform: translateY(55vh) rotate(3deg); }
  50%  { transform: translateY(78vh) rotate(-3deg); }
  75%  { transform: translateY(30vh) rotate(4deg); }
  100% { transform: translateY(4vh) rotate(-4deg); }
}
@keyframes hp-spark {
  0% { opacity: 1; transform: translateX(0) scale(1); }
  100% { opacity: 0; transform: translateX(30px) scale(0.4); }
}
.hp-bubble {
  position: absolute;
  left: 8px;
  top: -14px;
  transform: translateY(-100%);
  max-width: 220px;
  width: max-content;
  background: #fff;
  color: #111;
  border: 3px solid #111;
  border-radius: 16px;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  text-align: center;
  box-shadow: 3px 3px 0 rgba(0,0,0,0.25);
  font-family: ui-rounded, "Comic Sans MS", system-ui, sans-serif;
}
.hp-bubble-tail {
  position: absolute;
  left: 26px;
  bottom: -14px;
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 16px solid #111;
}
.hp-bubble-tail::after {
  content: "";
  position: absolute;
  left: -7px;
  top: -16px;
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 11px solid #fff;
}
`;
