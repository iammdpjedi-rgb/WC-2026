import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabaseClient";

const KO_ORDER = ["Round of 32", "Round of 16", "Quarter Final", "Semi Final", "Third Place", "Final"];

// ISO-2 country code -> Twemoji svg filename (England handled specially).
function isoCp(cc) {
  if (!cc) return "";
  const low = String(cc).toLowerCase();
  if (low === "gb-eng") return "1f3f4-e0067-e0062-e0065-e006e-e0067-e007f";
  const two = low.replace(/[^a-z]/g, "");
  if (two.length !== 2) return "";
  return two.toUpperCase().split("").map((ch) => (0x1f1e6 + ch.charCodeAt(0) - 65).toString(16)).join("-");
}
function teamAbbr(name) {
  return (name || "").replace(/[^A-Za-z ]/g, "").trim().slice(0, 3).toUpperCase();
}

function FlagBadge({ code, abbr, dim }) {
  const cp = isoCp(code);
  const url = cp ? `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${cp}.svg` : "";
  return (
    <span className={"pd-flag" + (dim ? " pd-dim" : "")}>
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
            const fb = e.currentTarget.nextSibling;
            if (fb) fb.style.display = "flex";
          }}
        />
      ) : null}
      <span className="pd-fb" style={{ display: url ? "none" : "flex" }}>{abbr}</span>
    </span>
  );
}

function MatchNode({ m }) {
  const finished = m.is_completed === true || !!m.result;
  const aLose = finished && m.result === "B";
  const bLose = finished && m.result === "A";
  const center = finished && m.score_a != null && m.score_b != null ? `${m.score_a}\u2013${m.score_b}` : "VS";
  const inner = (
    <div className="pd-match">
      <div className={"pd-team" + (aLose ? " pd-lose" : "")}>
        <FlagBadge code={m.team_a_code} abbr={teamAbbr(m.team_a)} dim={aLose} />
        <span className="pd-code">{teamAbbr(m.team_a)}</span>
      </div>
      <div className={"pd-vs" + (finished ? " pd-score" : "")}>{center}</div>
      <div className={"pd-team" + (bLose ? " pd-lose" : "")}>
        <FlagBadge code={m.team_b_code} abbr={teamAbbr(m.team_b)} dim={bLose} />
        <span className="pd-code">{teamAbbr(m.team_b)}</span>
      </div>
    </div>
  );
  return finished ? (
    <div className="pd-matchwrap">{inner}</div>
  ) : (
    <Link href={`/matches#match-${m.id}`} className="pd-matchwrap pd-link">{inner}</Link>
  );
}

const Trophy = (
  <svg className="pd-cup" viewBox="0 0 64 80" aria-hidden="true">
    <defs>
      <linearGradient id="pdg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f7dd92" />
        <stop offset="0.55" stopColor="#e4bf5e" />
        <stop offset="1" stopColor="#c79a2f" />
      </linearGradient>
    </defs>
    <path fill="url(#pdg)" d="M16 6h32v6c0 0 8 0 8 8s-8 12-12 12c-2 6-7 10-12 11v9h7c4 0 6 3 6 6H21c0-3 2-6 6-6h7v-9c-5-1-10-5-12-11C14 32 8 28 8 20s8-8 8-8z" />
    <path fill="url(#pdg)" d="M24 64h16v5H24z" />
    <rect x="20" y="71" width="24" height="6" rx="2" fill="url(#pdg)" />
  </svg>
);
const Crown = (
  <svg className="pd-crown" viewBox="0 0 46 34" aria-hidden="true">
    <path fill="#f7dd92" stroke="#c79a2f" strokeWidth="1" d="M3 30 L1 9 L13 18 L23 3 L33 18 L45 9 L43 30 Z" />
    <circle cx="1" cy="9" r="2.4" fill="#f7dd92" />
    <circle cx="23" cy="3" r="2.4" fill="#f7dd92" />
    <circle cx="45" cy="9" r="2.4" fill="#f7dd92" />
  </svg>
);

function pairs(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
}

function PodCol({ p, place }) {
  const c = { 1: "pd-c1", 2: "pd-c2", 3: "pd-c3" }[place];
  const b = { 1: "pd-b1", 2: "pd-b2", 3: "pd-b3" }[place];
  const r = { 1: "pd-r1", 2: "pd-r2", 3: "pd-r3" }[place];
  return (
    <div className={"pd-col " + c}>
      <div className={"pd-badge " + b}>
        {place === 1 ? Crown : null}
        {place}
      </div>
      <div className="pd-pname">{p ? p.display_name : "\u2014"}</div>
      <div className="pd-pts pd-gold" data-target={p ? p.points || 0 : 0}>0</div>
      <div className="pd-pmeta">{p ? `${p.correct || 0} correct` : "no players yet"}</div>
      <div className={"pd-riser " + r}><span className="pd-rank">{place}</span></div>
    </div>
  );
}

export default function Podium() {
  const [top3, setTop3] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const confettiRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { data: lb } = await supabase.rpc("get_total_leaderboard");
      setTop3((lb || []).slice(0, 3));
      const { data: ms } = await supabase.from("matches").select("*").order("kickoff");
      setMatches(ms || []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!top3) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelectorAll(".pd-pts").forEach((el, i) => {
      const target = Number(el.getAttribute("data-target")) || 0;
      if (reduce) { el.textContent = String(target); return; }
      let start = null;
      const dur = 1100;
      setTimeout(() => {
        function step(t) {
          if (!start) start = t;
          const k = Math.min((t - start) / dur, 1);
          el.textContent = String(Math.round(k * target));
          if (k < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }, 700 + i * 120);
    });
    if (!reduce && confettiRef.current) {
      const layer = confettiRef.current;
      layer.innerHTML = "";
      const cols = ["#f7dd92", "#e4bf5e", "#ffffff", "#d2d7e0"];
      for (let i = 0; i < 46; i++) {
        const pc = document.createElement("div");
        pc.className = "pd-piece";
        pc.style.left = Math.random() * 100 + "%";
        pc.style.background = cols[i % cols.length];
        pc.style.animation = "pdFall " + (1.6 + Math.random() * 1.6) + "s " + Math.random() * 0.9 + "s ease-in forwards";
        pc.style.transform = "rotate(" + Math.random() * 360 + "deg)";
        layer.appendChild(pc);
      }
      const to = setTimeout(() => { if (layer) layer.innerHTML = ""; }, 4200);
      return () => clearTimeout(to);
    }
  }, [top3]);

  const ko = (matches || []).filter((m) => KO_ORDER.includes(m.stage));
  const byStage = {};
  KO_ORDER.forEach((s) => {
    const arr = ko.filter((m) => m.stage === s);
    if (arr.length) byStage[s] = arr;
  });
  const r32 = byStage["Round of 32"] || [];
  const laterStages = KO_ORDER.filter((s) => s !== "Round of 32" && byStage[s]);

  const renderSide = (list, prefix) =>
    pairs(list).map((pair, pi) => (
      <div className="pd-pair" key={prefix + pi}>
        {pair.map((m, idx) => (
          <div key={m.id} className="pd-anim" style={{ animationDelay: 0.4 + (pi * 2 + idx) * 0.08 + "s" }}>
            <MatchNode m={m} />
          </div>
        ))}
        <span className="pd-conn" style={{ animationDelay: 0.4 + pi * 0.16 + 0.4 + "s" }} />
      </div>
    ));

  return (
    <Layout>
      <div className="pd-head">
        <div className="pd-eyebrow">2026 FIFA World Cup &nbsp;&middot;&nbsp; Prediction League</div>
        <h1 className="pd-big pd-gold">PODIUM</h1>
        <div className="pd-sub pd-gold">League Leaders</div>
      </div>

      <div className="pd-podium">
        <div className="pd-confetti" ref={confettiRef} aria-hidden="true" />
        <PodCol p={top3 ? top3[1] : null} place={2} />
        <PodCol p={top3 ? top3[0] : null} place={1} />
        <PodCol p={top3 ? top3[2] : null} place={3} />
      </div>

      <div className="pd-divider"><span className="pd-ln" /><span className="pd-dot" /><span className="pd-ln" /></div>

      {loading ? (
        <p style={{ textAlign: "center", color: "rgba(255,255,255,.5)" }}>Loading bracket\u2026</p>
      ) : ko.length === 0 ? (
        <div className="pd-note">The knockout bracket appears here once you add knockout fixtures.</div>
      ) : (
        <>
          <div className="pd-head">
            <h2 className="pd-big pd-gold" style={{ fontSize: "clamp(34px,7vw,64px)" }}>KNOCKOUTS</h2>
            <div className="pd-sub pd-gold">{r32.length ? "Round of 32" : laterStages[0]}</div>
          </div>

          {r32.length > 0 && (
            <div className="pd-bracket">
              <div className="pd-side pd-left">{renderSide(r32.slice(0, Math.ceil(r32.length / 2)), "L")}</div>
              <div className="pd-center">
                {Trophy}
                <div className="pd-cuptag">Champion</div>
              </div>
              <div className="pd-side pd-right">{renderSide(r32.slice(Math.ceil(r32.length / 2)), "R")}</div>
            </div>
          )}

          {laterStages.map((stage) => (
            <div className="pd-laterwrap" key={stage}>
              <div className="pd-stagelabel pd-gold">{stage}</div>
              <div className="pd-laterrow">
                {byStage[stage].map((m, i) => (
                  <div key={m.id} className="pd-anim" style={{ animationDelay: 0.2 + i * 0.08 + "s" }}>
                    <MatchNode m={m} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <style jsx global>{`
        .pd-gold{background:linear-gradient(180deg,#f7dd92,#e4bf5e 55%,#c79a2f);-webkit-background-clip:text;background-clip:text;color:transparent}
        .pd-head{text-align:center;margin:6px 0 26px}
        .pd-eyebrow{font-weight:600;letter-spacing:.34em;font-size:12px;color:rgba(255,255,255,.55);text-transform:uppercase;padding-left:.34em;opacity:0;animation:pdFadeDown .7s .1s both}
        .pd-big{font-weight:800;text-transform:uppercase;font-size:clamp(44px,10vw,92px);line-height:.92;letter-spacing:.01em;position:relative;display:inline-block;opacity:0;animation:pdFadeUp .8s .2s both}
        .pd-big::after{content:"";position:absolute;top:0;left:-120%;width:55%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.5),transparent);transform:skewX(-18deg);animation:pdShine 3.6s 1s ease-in-out infinite}
        .pd-sub{font-weight:600;letter-spacing:.3em;font-size:clamp(13px,2.6vw,16px);text-transform:uppercase;margin-top:8px;padding-left:.3em;opacity:0;animation:pdFadeUp .8s .35s both}

        .pd-podium{display:flex;justify-content:center;align-items:flex-end;gap:clamp(8px,3vw,28px);min-height:320px;position:relative}
        .pd-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none}
        .pd-piece{position:absolute;top:-16px;width:8px;height:13px;border-radius:1px;opacity:.9;will-change:transform}
        .pd-col{display:flex;flex-direction:column;align-items:center;width:clamp(92px,27vw,176px)}
        .pd-badge{width:clamp(56px,15vw,80px);height:clamp(56px,15vw,80px);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:clamp(22px,6vw,32px);color:#0a0c11;position:relative;margin-bottom:12px}
        .pd-b1{background:linear-gradient(180deg,#f7dd92,#c79a2f);box-shadow:0 0 0 4px rgba(228,191,94,.18),0 12px 38px rgba(228,191,94,.42)}
        .pd-b2{background:linear-gradient(180deg,#eef1f6,#aab1bd);box-shadow:0 0 0 4px rgba(210,215,224,.16),0 10px 30px rgba(0,0,0,.45)}
        .pd-b3{background:linear-gradient(180deg,#e6a868,#b9702f);box-shadow:0 0 0 4px rgba(217,140,76,.16),0 10px 30px rgba(0,0,0,.45)}
        .pd-crown{position:absolute;top:-30px;left:50%;transform:translateX(-50%);width:46px;height:34px;opacity:0;animation:pdCrown .7s 1.05s cubic-bezier(.2,1.4,.4,1) both}
        .pd-pname{font-weight:700;font-size:clamp(14px,3.4vw,18px);margin-bottom:3px;text-align:center;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;color:#f4f5f8}
        .pd-pts{font-weight:800;font-size:clamp(20px,5.4vw,30px);line-height:1}
        .pd-pmeta{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-top:4px}
        .pd-riser{width:100%;margin-top:16px;border-radius:10px 10px 0 0;position:relative;transform-origin:bottom;transform:scaleY(0);border:1px solid rgba(255,255,255,.06);border-bottom:none}
        .pd-r1{height:clamp(120px,30vw,192px);background:linear-gradient(180deg,rgba(228,191,94,.30),rgba(228,191,94,.05));animation:pdRise .9s .55s cubic-bezier(.2,.9,.3,1) both}
        .pd-r2{height:clamp(86px,22vw,148px);background:linear-gradient(180deg,rgba(210,215,224,.22),rgba(210,215,224,.04));animation:pdRise .9s .35s cubic-bezier(.2,.9,.3,1) both}
        .pd-r3{height:clamp(66px,18vw,118px);background:linear-gradient(180deg,rgba(217,140,76,.22),rgba(217,140,76,.04));animation:pdRise .9s .75s cubic-bezier(.2,.9,.3,1) both}
        .pd-rank{position:absolute;bottom:12px;left:0;right:0;text-align:center;font-weight:800;font-size:clamp(34px,9vw,56px);color:rgba(255,255,255,.12)}

        .pd-divider{display:flex;align-items:center;gap:18px;margin:44px 0 28px}
        .pd-ln{flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.1),transparent)}
        .pd-dot{width:7px;height:7px;border-radius:50%;background:#e4bf5e;box-shadow:0 0 12px rgba(228,191,94,.7)}

        .pd-bracket{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:clamp(6px,2vw,22px)}
        .pd-side{display:flex;flex-direction:column;gap:clamp(14px,2.6vw,26px)}
        .pd-pair{display:flex;flex-direction:column;gap:10px;position:relative}
        .pd-anim{opacity:0;transform:scale(.82) translateY(8px);animation:pdPop .55s both}
        .pd-matchwrap{display:block;text-decoration:none}
        .pd-match{display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#111722,#0d1219);border:1px solid rgba(255,255,255,.08);border-radius:46px;padding:7px 12px;transition:border-color .15s,transform .15s}
        .pd-link{cursor:pointer}
        .pd-link:hover .pd-match{border-color:#e4bf5e;transform:translateY(-1px)}
        .pd-right .pd-match{flex-direction:row-reverse}
        .pd-team{display:flex;flex-direction:column;align-items:center;gap:3px;width:50px}
        .pd-flag{width:clamp(34px,8vw,42px);height:clamp(34px,8vw,42px);border-radius:50%;overflow:hidden;border:2px solid #e4bf5e;background:#1b212c;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.4)}
        .pd-flag img{width:100%;height:100%;object-fit:cover}
        .pd-flag.pd-dim{filter:grayscale(.7);opacity:.5;border-color:rgba(255,255,255,.18)}
        .pd-fb{font-weight:700;font-size:12px;color:#f7dd92}
        .pd-code{font-size:10px;letter-spacing:.04em;color:rgba(255,255,255,.55);font-weight:500}
        .pd-team.pd-lose .pd-code{color:rgba(255,255,255,.3)}
        .pd-vs{font-weight:800;font-size:11px;color:#0a0c11;background:linear-gradient(180deg,#f7dd92,#c79a2f);border-radius:20px;padding:3px 7px;flex:0 0 auto}
        .pd-vs.pd-score{font-size:13px;padding:4px 9px}
        .pd-conn{position:absolute;top:0;bottom:0;width:clamp(8px,1.6vw,18px);border:2px solid rgba(228,191,94,.45);border-left:none;right:calc(-1*clamp(8px,1.6vw,18px));border-radius:0 8px 8px 0;transform:scaleX(0);transform-origin:left;animation:pdDrawX .5s both}
        .pd-right .pd-conn{right:auto;left:calc(-1*clamp(8px,1.6vw,18px));border:2px solid rgba(228,191,94,.45);border-right:none;border-radius:8px 0 0 8px;transform-origin:right}
        .pd-center{display:flex;flex-direction:column;align-items:center;gap:8px;padding:0 2px}
        .pd-cup{width:clamp(54px,11vw,84px);height:auto;filter:drop-shadow(0 0 22px rgba(228,191,94,.55));animation:pdFloat 3.2s ease-in-out infinite}
        .pd-cuptag{font-weight:600;letter-spacing:.18em;font-size:11px;text-transform:uppercase;color:rgba(255,255,255,.5)}

        .pd-laterwrap{margin-top:30px}
        .pd-stagelabel{text-align:center;font-weight:700;letter-spacing:.22em;text-transform:uppercase;font-size:14px;margin-bottom:14px}
        .pd-laterrow{display:flex;flex-wrap:wrap;justify-content:center;gap:14px}
        .pd-note{text-align:center;color:rgba(255,255,255,.6);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:22px}

        @keyframes pdFadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
        @keyframes pdFadeDown{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}
        @keyframes pdRise{from{transform:scaleY(0)}to{transform:scaleY(1)}}
        @keyframes pdPop{to{opacity:1;transform:none}}
        @keyframes pdDrawX{to{transform:scaleX(1)}}
        @keyframes pdShine{0%{left:-120%}55%,100%{left:160%}}
        @keyframes pdFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
        @keyframes pdCrown{0%{opacity:0;transform:translateX(-50%) translateY(-22px) rotate(-12deg)}100%{opacity:1;transform:translateX(-50%) translateY(0) rotate(0)}}
        @keyframes pdFall{to{transform:translateY(360px) rotate(540deg);opacity:0}}

        @media (prefers-reduced-motion: reduce){
          .pd-eyebrow,.pd-big,.pd-sub,.pd-anim,.pd-crown{animation:none!important;opacity:1!important;transform:none!important}
          .pd-riser{transform:scaleY(1)!important;animation:none!important}
          .pd-conn{transform:scaleX(1)!important;animation:none!important}
          .pd-big::after{display:none}
          .pd-cup{animation:none!important}
        }
      `}</style>
    </Layout>
  );
}
