import { useNavigate } from "react-router-dom";

function PreviewIcon({ kind, className = "w-5 h-5" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    className,
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  switch (kind) {
    case "room":
      return <svg {...common}><path d="M4 8.5 12 4l8 4.5v8L12 20l-8-3.5v-8Z" /><path d="M12 4v16" /><path d="M4 8.5 12 13l8-4.5" /></svg>;
    case "team":
      return <svg {...common}><circle cx="8" cy="9" r="2.5" /><circle cx="16" cy="9" r="2.5" /><path d="M3.5 18c0-2.5 2.2-4.5 4.5-4.5S12.5 15.5 12.5 18" /><path d="M11.5 18c0-2.5 2.2-4.5 4.5-4.5s4.5 2 4.5 4.5" /></svg>;
    case "fee":
      return <svg {...common}><ellipse cx="12" cy="7.5" rx="5" ry="2.5" /><path d="M7 7.5V12c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7.5" /><path d="M9.7 18h4.6" /><path d="M12 15.5v5" /></svg>;
    case "code":
      return <svg {...common}><path d="M8.5 8 5 11.5 8.5 15" /><path d="M15.5 8 19 11.5 15.5 15" /><path d="M13.5 6 10.5 18" /></svg>;
    case "share":
      return <svg {...common}><circle cx="6.5" cy="12" r="2.5" /><circle cx="17.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /><path d="m8.7 10.9 6.1-2.8" /><path d="m8.7 13.1 6.1 2.8" /></svg>;
    case "timer":
      return <svg {...common}><circle cx="12" cy="13" r="6.5" /><path d="M12 13V9.5" /><path d="M12 13l3 1.5" /><path d="M9.5 3.5h5" /><path d="M10.5 6.5V4" /><path d="M13.5 6.5V4" /></svg>;
    case "scan":
      return <svg {...common}><path d="M5 7V5h2" /><path d="M17 5h2v2" /><path d="M19 17v2h-2" /><path d="M7 19H5v-2" /><path d="M7 12h10" /><path d="M7 9h6" /><path d="M7 15h8" /></svg>;
    default:
      return null;
  }
}

function MetricCard({ label, value, icon }) {
  return (
    <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] px-4 py-3.5">
      <div className="flex items-center gap-2 text-fuchsia-200/80 mb-2">
        <PreviewIcon kind={icon} className="w-4.5 h-4.5" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">{label}</span>
      </div>
      <div className="text-[15px] sm:text-base font-bold text-white leading-tight">{value}</div>
    </div>
  );
}

function SeatNode({ filled, label }) {
  return (
    <div
      className={`h-14 rounded-[18px] border flex items-center justify-center text-xs font-semibold ${
        filled
          ? "border-fuchsia-400/25 bg-fuchsia-400/[0.09] text-fuchsia-100/90"
          : "border-white/[0.08] bg-white/[0.03] text-white/28"
      }`}
    >
      {label}
    </div>
  );
}

export default function CreateRoomPreview() {
  const nav = useNavigate();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <button
        onClick={() => nav("/create-room")}
        className="inline-flex items-center gap-2 text-white/30 hover:text-white/60 text-xs font-semibold uppercase tracking-[0.22em] mb-5 transition"
      >
        <span className="text-sm">←</span>
        Back To Create Room
      </button>

      <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr] items-start mb-4">
        <div className="space-y-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/18 bg-fuchsia-400/[0.08] px-3 py-1.5 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-300" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-fuchsia-100/85">UI Preview</span>
            </div>
            <h1 className="neon-title text-[2.1rem] sm:text-[2.8rem] lg:text-[3.4rem] leading-[1.04] uppercase max-w-[10ch] mb-3">
              Create Arena
            </h1>
            <p className="text-white/62 text-sm sm:text-base leading-7 max-w-2xl">
              A visual-only host console concept for room creation. No socket state, no payment flow, just card direction.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Room Size" value="4 Players" icon="team" />
            <MetricCard label="Entry Fee" value="1 USDC / Seat" icon="fee" />
            <MetricCard label="Access" value="Invite Only" icon="code" />
          </div>

          <div className="landing-story-card !p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-fuchsia-500/18 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-200/85 shrink-0">
                <PreviewIcon kind="scan" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42 mb-1">Host Flow</div>
                <div className="text-white text-lg font-bold">Configure · Generate · Share · Fill</div>
              </div>
            </div>
            <div className="grid gap-2.5">
              {[
                "Pick the room size first, then create a private arena.",
                "The invite code becomes the visual center of the host panel.",
                "Seats and countdown live in a dedicated monitor card.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/64 leading-6"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="landing-story-card !p-0 overflow-hidden">
          <div className="px-6 py-5 border-b border-white/[0.06] flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42 mb-2">Host Preview</div>
              <div className="text-white text-xl font-bold">Generated room card</div>
            </div>
            <div className="rounded-full border border-fuchsia-400/18 bg-fuchsia-400/[0.07] px-3 py-1 text-[11px] font-semibold text-fuchsia-100/80">
              Preview
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="rounded-[30px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(122,92,255,0.18),rgba(255,255,255,0.02)_58%)] px-5 py-6 mb-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="text-[10px] uppercase tracking-[0.26em] text-white/36">Arena Code</div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] font-semibold text-white/55">
                  <PreviewIcon kind="share" className="w-4 h-4" />
                  Share
                </div>
              </div>
              <div className="font-mono text-3xl sm:text-[3.2rem] tracking-[0.34em] text-gradient-fuchsia mb-2">X7P4Q9</div>
              <div className="text-[12px] text-white/45">Share this code to fill the room and trigger the payment step.</div>
            </div>

            <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.025] px-5 py-5 mb-4">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42">Seat Monitor</div>
                <div className="text-[12px] text-white/52">2 / 4 Ready</div>
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                <SeatNode filled label="Host" />
                <SeatNode filled label="P2" />
                <SeatNode label="Open" />
                <SeatNode label="Open" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Time To Fill" value="04:29" icon="timer" />
              <MetricCard label="Launch Rule" value="All seats must pay" icon="room" />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr] items-start">
        <div className="landing-story-card !p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42 mb-3">Configuration Card</div>
          <div className="text-white text-2xl font-bold mb-2">Select your room size</div>
          <p className="text-white/55 text-sm leading-7 mb-5">
            In the real page this would be the first interaction card. Here it is just a visual treatment for the selection state.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[2, 3, 4, 5].map((size) => (
              <button
                key={size}
                className={`rounded-[22px] px-4 py-4 border transition-all text-left ${
                  size === 4
                    ? "border-fuchsia-400/40 bg-gradient-to-br from-fuchsia-500/20 via-violet-500/16 to-indigo-500/10 shadow-[0_0_30px_rgba(168,85,247,0.18)] -translate-y-0.5"
                    : "border-white/[0.08] bg-white/[0.03] text-white/55"
                }`}
              >
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/38 mb-2">Team</div>
                <div className="text-2xl font-black text-white">{size}P</div>
              </button>
            ))}
          </div>
          <button className="btn-primary w-full !py-3.5 !text-sm">Create Arena</button>
        </div>

        <div className="landing-story-card !p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42 mb-3">Why this direction</div>
          <div className="grid gap-2.5">
            {[
              "One dominant room-code card instead of many equal-weight panels.",
              "A separate seat monitor card so status feels live and operational.",
              "Small metric cards for fee, timer, and access instead of long paragraphs.",
              "Hackathon-poster energy, but still usable as a real transaction screen.",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-white/64 leading-6"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
