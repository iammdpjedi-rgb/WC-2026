// Shared helpers for prediction windows, formatting, and status.
// All comparisons use real UTC time from the device clock vs the
// match kickoff (stored in UTC). Display uses the visitor's local zone.

export const HOUR = 60 * 60 * 1000;

export function windowFor(match) {
  const kickoff = new Date(match.kickoff).getTime();
  return {
    kickoff,
    opens: kickoff - 24 * HOUR,
    closes: kickoff - 2 * HOUR,
  };
}

// Returns one of: 'upcoming' | 'open' | 'closed' | 'completed'
export function predictionStatus(match, now = Date.now()) {
  if (match.is_completed) return "completed";
  const { opens, closes } = windowFor(match);
  if (now < opens) return "upcoming";
  if (now > closes) return "closed";
  return "open";
}

export function humanCountdown(ms) {
  if (ms <= 0) return "0h 0m";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Status label shown on cards, exactly per the rules.
export function statusLabel(match, now = Date.now()) {
  const s = predictionStatus(match, now);
  const { opens, closes } = windowFor(match);
  if (s === "completed") return "Match Completed";
  if (s === "upcoming") return `Predictions open in ${humanCountdown(opens - now)}`;
  if (s === "open") return `Open — closes in ${humanCountdown(closes - now)}`;
  return "Predictions Closed";
}

// Format a UTC timestamp in the visitor's local timezone.
export function formatLocal(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

// What the pick value 'A'/'B'/'D' means for a given match.
export function pickLabel(match, pick) {
  if (pick === "A") return match.team_a;
  if (pick === "B") return match.team_b;
  return "Draw";
}

// Knockout stages cannot end in a draw.
export function allowsDraw(match) {
  return match.stage === "Group Stage";
}
