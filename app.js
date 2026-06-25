/* ========= CONFIG ========= */
// Replace with your deployed Cloud Function URL
const VISION_FN_URL =
  "https://us-central1-api-project-684372428277.cloudfunctions.net/ocrHttp";

/* ========= ELEMENTS ========= */
const ta = document.getElementById("cardInput");
const renderBtn = document.getElementById("renderBtn");
const examplesBtn = document.getElementById("examplesBtn");
const scanBtn = document.getElementById("scanBtn");
const CANVAS = document.getElementById("cardCanvas");

// Render at the device's pixel density so the card isn't upscaled and blurry
// on high-DPI (retina / phone) screens. CSS still controls the display size;
// only the backing store gets sharper. All drawing uses W/H/SCALE below, so it
// scales automatically - no other code needs to change. Capped at 3x.
const DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
CANVAS.width = 360 * DPR;
CANVAS.height = 528 * DPR;

/* ========= RENDERING ENGINE (unchanged logic that already works well) ========= */
const W = CANVAS.width; // 360 * DPR
const H = CANVAS.height; // 528 * DPR

const suitChar = (s) =>
  ({ clubs: "♣", spades: "♠", hearts: "♥", diamonds: "♦", poo: "💩" }[
    (s || "").toLowerCase()
  ] || "?");

const isBrown = (s) => (s || "").toLowerCase() === "poo";

const isRed = (s) =>
  (s || "").toLowerCase() === "hearts" ||
  (s || "").toLowerCase() === "diamonds";

const suitColor = (s) => {
  if (isBrown(s)) return "#6B3410";
  if (isRed(s)) return "red";
  return "black";
};

/* Poo pip - drawn as a canvas path instead of text character */
/* Shape based on classic poo silhouette - three stacked blobs with swirl */
function drawPooPip(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  const sc = size / 50;
  ctx.scale(sc, sc);
  ctx.translate(-50, -50);
  ctx.beginPath();
  ctx.moveTo(20.684, 100);
  ctx.bezierCurveTo(-6.617, 100, -8.639, 62, 19.673, 60);
  ctx.bezierCurveTo(10.573, 51, 15.629, 34, 29.784, 34);
  ctx.bezierCurveTo(14.617, 11, 47.986, 32, 47.986, 0);
  ctx.bezierCurveTo(63.153, 9, 76.298, 23, 69.22, 34);
  ctx.bezierCurveTo(83.376, 34, 89.444, 51, 79.332, 60);
  ctx.bezierCurveTo(106.633, 62, 105.621, 100, 78.32, 100);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* Base 240x336 grid → scale up to canvas */
const BASE_W = 240,
  BASE_H = 336;
const SCALE = Math.min(W / BASE_W, H / BASE_H);
const S = (x) => x * SCALE;
const layoutScaled = (list) => list.map(([x, y]) => [S(x), S(y)]);

const LAYOUTS = (() => {
  const B = {
    2: [
      [120, 70],
      [120, 266],
    ],
    3: [
      [120, 70],
      [120, 168],
      [120, 266],
    ],
    4: [
      [72, 86],
      [168, 86],
      [72, 250],
      [168, 250],
    ],
    5: [
      [72, 86],
      [168, 86],
      [120, 168],
      [72, 250],
      [168, 250],
    ],
    6: [
      [72, 86],
      [168, 86],
      [72, 168],
      [168, 168],
      [72, 250],
      [168, 250],
    ],
    7: [
      [72, 86],
      [168, 86],
      [72, 168],
      [168, 168],
      [72, 250],
      [168, 250],
      [120, 140],
    ],
    8: [
      [72, 86],
      [168, 86],
      [72, 168],
      [168, 168],
      [72, 250],
      [168, 250],
      [120, 115],
      [120, 221],
    ],
    9: [
      [72, 86],
      [168, 86],
      [72, 168],
      [168, 168],
      [72, 250],
      [168, 250],
      [120, 115],
      [120, 168],
      [120, 221],
    ],
    10: [
      [72, 70],
      [168, 70],
      [72, 130],
      [168, 130],
      [72, 206],
      [168, 206],
      [72, 266],
      [168, 266],
      [120, 95],
      [120, 240],
    ],
    ace: [[120, 168]],
  };
  return Object.fromEntries(
    Object.entries(B).map(([k, v]) => [k, layoutScaled(v)])
  );
})();

const CARD_SCALE = {
  corner: 26,
  cornerSuit: 24,
  pips: 48,
  faceCenter: 104, // bigger centre letter
  cornerPad: 14,
};

/* Face card SVG images - CC0 Public Domain by Adrian Kennard (RevK) */
/* Court card artwork based on 19th Century Goodall & Son designs    */
/* Source: me.uk/cards | github.com/revk/SVG-playing-cards           */
const FACE_FILE = (rank, suit) => {
  const r = ({ jack: "J", queen: "Q", king: "K" })[rank.toLowerCase()] || "?";
  const s = ({ clubs: "C", diamonds: "D", hearts: "H", spades: "S" })[suit.toLowerCase()] || "?";
  return `faces/${r}${s}.svg`;
};
const faceCache = {};
function loadFaceImage(rank, suit) {
  const key = `${rank}-${suit}`;
  if (faceCache[key]) return Promise.resolve(faceCache[key]);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { faceCache[key] = img; resolve(img); };
    img.onerror = () => reject(new Error("Face image not found"));
    img.src = FACE_FILE(rank, suit);
  });
}

/* Examples (file removed, per your decision) */
const EXAMPLES = {
  "Number (8♣)": { rank: "8", suit: "clubs", type: "number" },
  "Face (K♠)": { rank: "king", suit: "spades", type: "face" },
  "Ace (♦)": { rank: "ace", suit: "diamonds", type: "number" },
  Back: {
    type: "back",
    pattern: [
      "· x · x · x · x · x · x",
      "x · x · x · x · x · x ·",
      "· x · x · x · x · x · x",
      "x · x · x · x · x · x ·",
      "· x · x · x · x · x · x",
      "x · x · x · x · x · x ·",
      "· x · x · x · x · x · x",
      "x · x · x · x · x · x ·",
      "· x · x · x · x · x · x",
      "x · x · x · x · x · x ·",
      "· x · x · x · x · x · x",
      "x · x · x · x · x · x ·",
    ],
  },
  Joker: {
    rank: "ERROR",
    suit: "HACKED",
    payload: "<script>alert(JOKER!)</script>",
    type: "joker1",
  },
};

/* --- helpers for text placement --- */
function drawCornerPair(ctx, rankText, suit, color, pad, cornerFont, suitFont) {
  // top-left
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = cornerFont;
  ctx.fillText(rankText, pad, pad);
  const rankW = ctx.measureText(rankText).width;
  if (isBrown(suit)) {
    drawPooPip(ctx, pad + rankW / 2, pad + parseInt(cornerFont, 10) * 1.3, S(CARD_SCALE.cornerSuit) * 0.5);
  } else {
    ctx.font = suitFont;
    ctx.textAlign = "center";
    ctx.fillText(
      suitChar(suit),
      pad + rankW / 2,
      pad + parseInt(cornerFont, 10) * 0.95
    );
  }
  ctx.restore();

  // bottom-right (rotated)
  ctx.save();
  ctx.translate(W - pad, H - pad);
  ctx.rotate(Math.PI);
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = cornerFont;
  ctx.fillText(rankText, 0, 0);
  const rankW2 = ctx.measureText(rankText).width;
  if (isBrown(suit)) {
    drawPooPip(ctx, rankW2 / 2, parseInt(cornerFont, 10) * 1.3, S(CARD_SCALE.cornerSuit) * 0.5);
  } else {
    ctx.font = suitFont;
    ctx.textAlign = "center";
    ctx.fillText(suitChar(suit), rankW2 / 2, parseInt(cornerFont, 10) * 0.95);
  }
  ctx.restore();
}

function drawPipsCentered(ctx, layout, suit, color, pipFont) {
  if (!layout || !layout.length) return;
  const xs = layout.map(([x]) => x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const dx = W / 2 - mid;
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = pipFont;
  layout.forEach(([x, y]) => ctx.fillText(suitChar(suit), x + dx, y));
  ctx.restore();
}

function drawPooPipsCentered(ctx, layout, color, pipSize) {
  if (!layout || !layout.length) return;
  const xs = layout.map(([x]) => x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const dx = W / 2 - mid;
  ctx.save();
  ctx.fillStyle = color;
  const size = pipSize || S(CARD_SCALE.pips) * 0.5;
  layout.forEach(([x, y]) => drawPooPip(ctx, x + dx, y, size));
  ctx.restore();
}

/* ========= CREDITS ========= */
const DIGITAL_SUPPORTERS = [
  "Oly Ritchie", "Fabian Wiberg", "Uglen", "Caroline F.", "Thalie",
  "GodVars", "Rayvn M.", "Lordviper33", "David J Scott", "AlNapp",
  "RhysWynne", "Paul Browning", "Pat Reaney", "DavidAult", "Iris Aurora",
  "JustGini", "SootMonkey", "Jetarullah", "FukaclawRyu", "Stephen Short",
  "Jsbaseplayer", "John L", "JelleJT", "Mark Alford", "Callmesalticidae",
];

function drawCredits(ctx) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  const green = "#46e285";
  const orange = "#ff8800";
  const dim = "#6fb98a";
  const punc = "#828a82";
  const mono = (px) => `${Math.round(S(px))}px ui-monospace, monospace`;

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // header
  ctx.fillStyle = orange;
  ctx.font = mono(13);
  ctx.fillText("// CREDITS", S(20), S(36));

  // digital supporters label
  ctx.fillStyle = dim;
  ctx.font = mono(9);
  ctx.fillText('"digital_supporters": [', S(20), S(58));

  // names in two columns
  ctx.font = mono(9);
  const names = DIGITAL_SUPPORTERS;
  const half = Math.ceil(names.length / 2);
  const colX = [S(26), S(126)];
  const startY = S(76);
  const rowH = S(13);
  names.forEach((n, i) => {
    const col = i < half ? 0 : 1;
    const row = col === 0 ? i : i - half;
    const x = colX[col];
    const y = startY + row * rowH;
    const txt = `"${n}"`;
    ctx.fillStyle = green;
    ctx.fillText(txt, x, y);
    ctx.fillStyle = punc;
    ctx.fillText(",", x + ctx.measureText(txt).width, y);
  });

  let y = startY + half * rowH;
  ctx.fillStyle = dim;
  ctx.font = mono(9);
  ctx.fillText("]", S(20), y);

  // face card art credit (compact)
  y += S(26);
  ctx.fillStyle = dim;
  ctx.font = mono(9);
  ctx.fillText('"face_card_art": [', S(20), y);
  y += S(13);
  ctx.fillStyle = green;
  ctx.fillText('  "Adrian Kennard (RevK)",', S(20), y);
  y += S(12);
  ctx.fillText('  "CC0 Public Domain",', S(20), y);
  y += S(12);
  ctx.fillText('  "me.uk/cards"', S(20), y);
  y += S(13);
  ctx.fillStyle = dim;
  ctx.fillText("]", S(20), y);

  // footer
  ctx.fillStyle = dim;
  ctx.font = mono(9);
  ctx.textAlign = "center";
  ctx.fillText("// Dan Berg 2026", W / 2, H - S(18));
}

/* ========= SYSTEM PATCH ========= */
let patchActivated = false;

function runGlitchEffect(ctx, callback) {
  // Create fullscreen overlay for dramatic glitch
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:#000;pointer-events:none;";
  const glitchCanvas = document.createElement("canvas");
  glitchCanvas.width = window.innerWidth;
  glitchCanvas.height = window.innerHeight;
  glitchCanvas.style.cssText = "width:100%;height:100%;";
  overlay.appendChild(glitchCanvas);
  document.body.appendChild(overlay);
  const gCtx = glitchCanvas.getContext("2d");
  const gW = glitchCanvas.width;
  const gH = glitchCanvas.height;

  let frame = 0;
  const totalFrames = 40;
  const glitch = () => {
    if (frame >= totalFrames) {
      // Fade out overlay
      overlay.style.transition = "opacity 0.4s";
      overlay.style.opacity = "0";
      setTimeout(() => { overlay.remove(); callback(); }, 400);
      return;
    }

    // Black base with green tint
    gCtx.fillStyle = `rgba(0,0,0,0.3)`;
    gCtx.fillRect(0, 0, gW, gH);

    // Horizontal slice displacement
    for (let i = 0; i < 8 + frame; i++) {
      const y = Math.floor(Math.random() * gH);
      const h = Math.floor(Math.random() * 30) + 5;
      const shift = Math.floor(Math.random() * 80) - 40;
      gCtx.fillStyle = `rgba(0,${100 + Math.random() * 155},0,${0.1 + Math.random() * 0.4})`;
      gCtx.fillRect(shift, y, gW, h);
    }

    // Bright green flash bars
    for (let i = 0; i < 3; i++) {
      gCtx.fillStyle = `rgba(0,255,0,${Math.random() * 0.5})`;
      gCtx.fillRect(0, Math.random() * gH, gW, Math.random() * 3 + 1);
    }

    // Garbled text
    gCtx.fillStyle = `rgba(0,200,80,${0.3 + Math.random() * 0.5})`;
    gCtx.font = `${12 + Math.floor(Math.random() * 16)}px ui-monospace`;
    gCtx.textAlign = "left";
    for (let i = 0; i < 3 + Math.floor(frame / 5); i++) {
      const chars = "01{}:\"system_patchPATCH-001featureunlockhiddenchecksum4fva9dc";
      let garble = "";
      for (let c = 0; c < Math.floor(Math.random() * 30) + 10; c++) {
        garble += chars[Math.floor(Math.random() * chars.length)];
      }
      gCtx.fillText(garble, Math.random() * gW * 0.8, Math.random() * gH);
    }

    // Big flash in the middle frames
    if (frame > 15 && frame < 25 && Math.random() > 0.5) {
      gCtx.fillStyle = `rgba(0,255,0,${0.1 + Math.random() * 0.2})`;
      gCtx.fillRect(0, 0, gW, gH);
    }

    frame++;
    requestAnimationFrame(glitch);
  };
  glitch();
}

/* The patch card, drawn in the deck's own visual grammar: a syntax-
   coloured JSON object (orange keys, green values) on black. */
function drawPatchCard(ctx) {
  const green = "#00cc55";
  const orange = "#ff8800";
  const punc = "#5a615a";
  const dim = "rgba(0,204,85,0.45)";
  const ink = "rgba(255,255,255,0.88)";

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  // dashed frame
  ctx.strokeStyle = "rgba(0,204,85,0.30)";
  ctx.lineWidth = 1;
  ctx.setLineDash([S(4), S(4)]);
  ctx.strokeRect(S(12), S(12), W - S(24), H - S(24));
  ctx.setLineDash([]);

  const xL = S(28);
  const mono = (px) => `${Math.round(S(px))}px ui-monospace, monospace`;

  // header row: comment left, version right
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = mono(11);
  ctx.fillStyle = dim;
  ctx.fillText("// SYSTEM PATCH", xL, S(42));
  ctx.textAlign = "right";
  ctx.fillStyle = orange;
  ctx.fillText("v1.1", W - xL, S(42));

  // helper: draw a key/value JSON line with aligned colons
  ctx.textAlign = "left";
  const lh = S(24);
  function line(k, v, y, last) {
    let x = S(34);
    ctx.font = mono(13);
    ctx.fillStyle = orange;
    const keyText = `"${k}"`.padEnd(10);
    ctx.fillText(keyText, x, y);
    x += ctx.measureText(keyText).width;
    ctx.fillStyle = punc;
    ctx.fillText(": ", x, y);
    x += ctx.measureText(": ").width;
    ctx.fillStyle = green;
    ctx.fillText(`"${v}"`, x, y);
    x += ctx.measureText(`"${v}"`).width;
    if (!last) {
      ctx.fillStyle = punc;
      ctx.fillText(",", x, y);
    }
  }

  let y = S(92);
  ctx.font = mono(14);
  ctx.fillStyle = punc;
  ctx.fillText("{", xL, y);
  y += lh;
  line("status", "applied", y);
  y += lh;
  line("checksum", "ok", y);
  y += lh;
  line("unlocked", "plinko", y, true);
  y += lh;
  ctx.font = mono(14);
  ctx.fillStyle = punc;
  ctx.fillText("}", xL, y);

  // status check
  y += lh * 2.2;
  ctx.font = mono(12);
  ctx.fillStyle = green;
  ctx.textAlign = "center";
  ctx.fillText("\u2713 patch applied", W / 2, y);

  // call to action - centred so it can't run off an edge
  y += lh * 1.7;
  ctx.font = mono(13);
  ctx.fillStyle = orange;
  ctx.fillText("\u203a flip Plinko on to play", W / 2, y);

  // footer flavour
  ctx.font = mono(9);
  ctx.fillStyle = dim;
  ctx.fillText("4fva9dc2b8e19a", W / 2, H - S(24));
}

function drawPatchActivation(ctx) {
  if (!patchActivated) {
    patchActivated = true;
    // First time: glitch, then drop straight into Plinko. No switch to flip
    // on - players turn it OFF to stop.
    runGlitchEffect(ctx, () => {
      enablePlinkoMode();
    });
  } else {
    // Already unlocked: just show the patch card. Don't auto-restart Plinko,
    // or turning the toggle off (which re-renders this card) would bounce it
    // straight back on.
    drawPatchCard(ctx);
    showToyButtons();
  }
}

/* ========= TOY BUTTONS (appear after patch) ========= */
let toyBtnsAdded = false;
let plinkoMode = false;

function showToyButtons() {
  if (toyBtnsAdded) return;
  toyBtnsAdded = true;

  const renderRow = renderBtn.parentElement;

  const plinkoToggle = document.createElement("div");
  plinkoToggle.id = "plinkoToggle";
  plinkoToggle.className = "toggle-switch";
  plinkoToggle.setAttribute("role", "switch");
  plinkoToggle.setAttribute("aria-checked", "false");
  plinkoToggle.setAttribute("tabindex", "0");
  plinkoToggle.innerHTML =
    '<span class="toggle-label">Plinko</span>' +
    '<span class="toggle-track"><span class="toggle-knob"></span></span>' +
    '<span class="toggle-state">OFF</span>';
  const togglePlinko = () => {
    plinkoMode = !plinkoMode;
    plinkoToggle.classList.toggle("on", plinkoMode);
    plinkoToggle.setAttribute("aria-checked", plinkoMode ? "true" : "false");
    plinkoToggle.querySelector(".toggle-state").textContent = plinkoMode ? "ON" : "OFF";
    if (plinkoMode) {
      startPlinkoFromCurrentCard();
    } else {
      stopPlinko();
      try {
        const json = ta.value.trim();
        if (json) renderCard(json);
      } catch {}
    }
  };
  plinkoToggle.addEventListener("click", togglePlinko);
  plinkoToggle.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); togglePlinko(); }
  });
  renderRow.appendChild(plinkoToggle);
}

/* ========= TOYS ========= */

/* --- ASCII MODE --- */
function runAsciiMode(ctx) {
  let card;
  const raw = ta.value.trim();
  try {
    card = JSON.parse(raw);
  } catch {
    card = { rank: "7", suit: "clubs", type: "number" };
  }

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  const rank = String(card.rank || "?").toUpperCase().replace(/^ACE$/, "A");
  const suit = String(card.suit || "?").toLowerCase();
  const sChar = ({ clubs: "C", spades: "S", hearts: "H", diamonds: "D", poo: "P" })[suit] || "?";
  const pip = ({ clubs: "%", spades: "^", hearts: "v", diamonds: "<>", poo: "@" })[suit] || "?";

  // Card dimensions in characters - wider to fill canvas
  const cols = 21;
  const rows = 29;

  // Calculate font size to fill the canvas
  const fontSize = Math.floor(Math.min(W / (cols * 0.6), H / (rows * 1.3)));
  const lineHeight = fontSize * 1.15;

  // Build grid
  const grid = [];
  // Top border
  grid.push("+" + "-".repeat(cols - 2) + "+");
  // Rank line
  grid.push("| " + rank.padEnd(2) + " ".repeat(cols - 7) + sChar + " |");
  // Empty line
  grid.push("|" + " ".repeat(cols - 2) + "|");

  if (card.type === "face") {
    const faceArt = {
      jack:  ["     _____     ", "    |     |    ", "    | o o |    ", "    |  -  |    ", "    |_____|    ", "      | |      ", "     _| |_     ", "    |_____|    "],
      queen: ["     _____     ", "    |     |    ", "    | o o |    ", "    |  v  |    ", "    |_____|    ", "     /| |\\     ", "    / | | \\    ", "   /__|_|__\\   "],
      king:  ["     _____     ", "    |     |    ", "    | o o |    ", "    |  =  |    ", "    |_____|    ", "    /|   |\\    ", "   / |   | \\   ", "  /__|___|__\\  "],
    };
    const art = faceArt[card.rank?.toLowerCase()] || faceArt.jack;
    const padTop = Math.floor((rows - 6 - art.length) / 2);
    for (let i = 0; i < padTop; i++) grid.push("|" + " ".repeat(cols - 2) + "|");
    art.forEach((l) => {
      const padded = l.length < cols - 2 ? l.padStart(Math.floor((cols - 2 + l.length) / 2)).padEnd(cols - 2) : l.substring(0, cols - 2);
      grid.push("|" + padded + "|");
    });
    const remaining = rows - grid.length - 3;
    for (let i = 0; i < remaining; i++) grid.push("|" + " ".repeat(cols - 2) + "|");
  } else if (card.type === "back") {
    const patternRows = rows - 6;
    for (let i = 0; i < patternRows; i++) {
      const row = i % 2 === 0
        ? " x . x . x . x . x . x . "
        : " . x . x . x . x . x . x ";
      const trimmed = row.substring(0, cols - 2).padEnd(cols - 2);
      grid.push("|" + trimmed + "|");
    }
  } else {
    // Number card with pips
    const innerRows = rows - 6;
    const innerCols = cols - 4;
    const inner = [];
    for (let i = 0; i < innerRows; i++) inner.push(" ".repeat(innerCols).split(""));

    const count = card.rank?.toLowerCase() === "ace" ? 1 : (parseInt(card.rank) || 1);
    const midR = Math.floor(innerRows / 2);
    const midC = Math.floor(innerCols / 2);
    const topR = Math.floor(innerRows * 0.15);
    const botR = Math.floor(innerRows * 0.85);
    const upR = Math.floor(innerRows * 0.33);
    const loR = Math.floor(innerRows * 0.67);
    const leftC = Math.floor(innerCols * 0.25);
    const rightC = Math.floor(innerCols * 0.75);

    const layouts = {
      1: [[midR, midC]],
      2: [[topR, midC], [botR, midC]],
      3: [[topR, midC], [midR, midC], [botR, midC]],
      4: [[topR, leftC], [topR, rightC], [botR, leftC], [botR, rightC]],
      5: [[topR, leftC], [topR, rightC], [midR, midC], [botR, leftC], [botR, rightC]],
      6: [[topR, leftC], [topR, rightC], [midR, leftC], [midR, rightC], [botR, leftC], [botR, rightC]],
      7: [[topR, leftC], [topR, rightC], [upR, midC], [midR, leftC], [midR, rightC], [botR, leftC], [botR, rightC]],
      8: [[topR, leftC], [topR, rightC], [upR, midC], [midR, leftC], [midR, rightC], [loR, midC], [botR, leftC], [botR, rightC]],
      9: [[topR, leftC], [topR, rightC], [upR, leftC], [upR, rightC], [midR, midC], [loR, leftC], [loR, rightC], [botR, leftC], [botR, rightC]],
      10: [[topR, leftC], [topR, rightC], [upR, leftC], [upR, rightC], [Math.floor(innerRows * 0.25), midC], [loR, leftC], [loR, rightC], [botR, leftC], [botR, rightC], [Math.floor(innerRows * 0.75), midC]],
    };

    const pos = layouts[count] || layouts[1];
    pos.forEach(([r, c]) => {
      if (r >= 0 && r < innerRows && c >= 0 && c < innerCols) {
        inner[r][c] = pip[0];
        if (pip.length > 1 && c + 1 < innerCols) inner[r][c + 1] = pip[1];
      }
    });

    inner.forEach((row) => grid.push("|  " + row.join("") + "  |"));
  }

  // Empty line before bottom
  grid.push("|" + " ".repeat(cols - 2) + "|");
  // Bottom rank
  grid.push("| " + sChar + " ".repeat(cols - 7) + rank.padStart(2) + " |");
  // Bottom border
  grid.push("+" + "-".repeat(cols - 2) + "+");

  // Draw the ASCII art
  const totalHeight = grid.length * lineHeight;
  const startY = (H - totalHeight) / 2 + fontSize;

  ctx.fillStyle = "#00cc55";
  ctx.font = `${fontSize}px ui-monospace`;
  ctx.textAlign = "center";

  grid.forEach((line, i) => {
    ctx.fillText(line, W / 2, startY + i * lineHeight);
  });
}

/* --- CORRUPT MODE --- */
function runCorruptMode(ctx) {
  // Get current card from textarea
  let json = ta.value.trim();
  try {
    JSON.parse(json);
  } catch {
    json = JSON.stringify({ rank: "7", suit: "clubs", type: "number" });
  }

  // First render the card normally
  renderCard(json);

  // Then progressively corrupt it
  let step = 0;
  const maxSteps = 60;
  const corrupt = () => {
    if (step >= maxSteps) return;

    const imgData = ctx.getImageData(0, 0, W, H);
    const d = imgData.data;

    // Increasing corruption per step
    const intensity = Math.floor(step * 3);

    // Pixel corruption
    for (let i = 0; i < intensity * 10; i++) {
      const px = Math.floor(Math.random() * d.length / 4) * 4;
      const ch = Math.floor(Math.random() * 3);
      d[px + ch] = (d[px + ch] + Math.floor(Math.random() * 80) - 40) & 255;
    }

    // Block displacement
    for (let i = 0; i < Math.floor(intensity / 5); i++) {
      const sy = Math.floor(Math.random() * H);
      const sh = Math.floor(Math.random() * 10) + 2;
      const shift = Math.floor(Math.random() * intensity) - intensity / 2;
      const slice = ctx.getImageData(0, sy, W, Math.min(sh, H - sy));
      ctx.putImageData(imgData, 0, 0);
      ctx.putImageData(slice, shift, sy);
    }

    ctx.putImageData(imgData, 0, 0);

    // Scan lines
    if (step > 20) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
      for (let y = 0; y < H; y += 4) {
        ctx.fillRect(0, y, W, 1);
      }
    }

    // Data overlay - corrupted text appears
    if (step > 30) {
      ctx.fillStyle = `rgba(0,200,80,${Math.random() * 0.6})`;
      ctx.font = `${Math.round(S(8))}px ui-monospace`;
      ctx.textAlign = "left";
      for (let i = 0; i < Math.floor(step / 10); i++) {
        const chars = "0123456789abcdef{}:\",.nullundefined";
        let garble = "";
        for (let c = 0; c < Math.floor(Math.random() * 20) + 5; c++) {
          garble += chars[Math.floor(Math.random() * chars.length)];
        }
        ctx.fillText(garble, Math.random() * W * 0.8, Math.random() * H);
      }
    }

    step++;
    setTimeout(corrupt, 80);
  };

  // Start corruption after a brief pause so the card renders first
  setTimeout(corrupt, 500);
}

/* --- PLINKO MODE --- */
let plinkoHighScore = 0;
let plinkoAnimId = null;
let plinkoDropBtn = null;
let plinkoState = null;

function stopPlinko() {
  if (plinkoAnimId) { cancelAnimationFrame(plinkoAnimId); plinkoAnimId = null; }
  if (plinkoDropBtn) { plinkoDropBtn.style.display = "none"; }
  const scores = document.getElementById("plinkoScores");
  if (scores) scores.hidden = true;
  const dropRow = document.getElementById("plinkoDropRow");
  if (dropRow) dropRow.hidden = true;
  plinkoState = null;
}

function isPlayableNumber(card) {
  if (!card || typeof card !== "object") return false;
  if (String(card.type).toLowerCase() !== "number") return false;
  const r = String(card.rank || "").toLowerCase();
  return r === "ace" || /^\d+$/.test(r);
}

function randomNumberCard() {
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10"];
  const suits = ["clubs", "spades", "hearts", "diamonds"];
  return {
    rank: ranks[Math.floor(Math.random() * ranks.length)],
    suit: suits[Math.floor(Math.random() * suits.length)],
    type: "number",
  };
}

function startPlinkoFromCurrentCard() {
  let card;
  try {
    card = JSON.parse(ta.value.trim());
  } catch {
    card = null;
  }
  // Plinko needs a number card. If the current card is a face, back, words,
  // or anything non-numeric, play over a random number card instead.
  if (!isPlayableNumber(card)) card = randomNumberCard();
  runPlinkoMode(CANVAS.getContext("2d"), card);
}

// Turn Plinko on automatically (used when the System Patch is applied).
function enablePlinkoMode() {
  showToyButtons();
  plinkoMode = true;
  const tgl = document.getElementById("plinkoToggle");
  if (tgl) {
    tgl.classList.add("on");
    tgl.setAttribute("aria-checked", "true");
    const st = tgl.querySelector(".toggle-state");
    if (st) st.textContent = "ON";
  }
  startPlinkoFromCurrentCard();
}

function runPlinkoMode(ctx, card) {
  // Stop any existing game
  if (plinkoAnimId) { cancelAnimationFrame(plinkoAnimId); plinkoAnimId = null; }

  // Make sure the card is currently rendered on the canvas, then snapshot it
  // so we can show it behind the Plinko playfield each frame.
  try { renderCard(JSON.stringify(card)); } catch {}
  const cardSnapshot = document.createElement("canvas");
  cardSnapshot.width = CANVAS.width;
  cardSnapshot.height = CANVAS.height;
  cardSnapshot.getContext("2d").drawImage(CANVAS, 0, 0);

  const rank = String(card.rank || "7").toLowerCase();
  const suit = String(card.suit || "clubs").toLowerCase();
  const color = suitColor(suit);

  // Get pip positions for this card
  const layout = LAYOUTS[rank] || LAYOUTS["7"];
  if (!layout || !layout.length) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#00cc55";
    ctx.font = `${Math.round(S(12))}px ui-monospace`;
    ctx.fillText("need a number card for plinko", W / 2, H / 2);
    return;
  }

  // Centre pegs
  const xs = layout.map(([x]) => x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const ddx = W / 2 - mid;
  const pegs = layout.map(([x, y]) => [x + ddx, y]);

  // Physics
  const pegRadius = S(12);
  const ballRadius = S(7);
  const gravity = 0.18;
  const bounceFactor = 0.55;
  const friction = 0.995;

  // Slots — shifted up so suit-colored score labels can sit BENEATH the buckets
  const slotCount = 7;
  const slotWidth = W / slotCount;
  const slotY = H - S(60);
  const slotScores = [10, 25, 50, 100, 50, 25, 10];
  const slotFloor = H - S(28);

  // Launcher - moves left/right
  let launcherX = W / 2;
  let launcherDir = 1.5;
  const launcherY = S(18);

  // Game state
  plinkoState = {
    balls: [],
    landed: [],
    ballsRemaining: 3,
    score: 0,
    popups: [],
    roundOver: false,
  };
  const st = plinkoState;

  // Show score chips + drop row
  const scoresEl = document.getElementById("plinkoScores");
  const dropRow = document.getElementById("plinkoDropRow");
  if (scoresEl) scoresEl.hidden = false;
  if (dropRow) dropRow.hidden = false;

  // Create or reuse drop button (in its own row below the canvas)
  if (!plinkoDropBtn) {
    plinkoDropBtn = document.createElement("button");
    plinkoDropBtn.id = "plinkoDropBtn";
    plinkoDropBtn.className = "btn primary";
    plinkoDropBtn.style.background = "#ff8800";
    plinkoDropBtn.style.borderColor = "#ff8800";
    plinkoDropBtn.style.color = "#000";
    plinkoDropBtn.style.fontWeight = "600";
    plinkoDropBtn.style.letterSpacing = "1px";
    plinkoDropBtn.style.padding = "12px 28px";
  }
  if (dropRow && plinkoDropBtn.parentNode !== dropRow) {
    dropRow.appendChild(plinkoDropBtn);
  }
  plinkoDropBtn.textContent = `DROP BALL (${st.ballsRemaining})`;
  plinkoDropBtn.disabled = false;
  plinkoDropBtn.style.display = "inline-block";

  // Fresh click handler
  const newBtn = plinkoDropBtn.cloneNode(true);
  plinkoDropBtn.parentNode.replaceChild(newBtn, plinkoDropBtn);
  plinkoDropBtn = newBtn;

  plinkoDropBtn.addEventListener("click", () => {
    if (st.roundOver) {
      // Reset
      st.balls = [];
      st.landed = [];
      st.ballsRemaining = 3;
      st.score = 0;
      st.popups = [];
      st.roundOver = false;
      plinkoDropBtn.textContent = `DROP BALL (${st.ballsRemaining})`;
      plinkoDropBtn.disabled = false;
      return;
    }
    if (st.ballsRemaining <= 0) return;
    st.ballsRemaining--;
    plinkoDropBtn.textContent = `DROP BALL (${st.ballsRemaining})`;
    if (st.ballsRemaining <= 0) plinkoDropBtn.disabled = true;

    // Drop from current launcher position
    st.balls.push({
      x: launcherX,
      y: launcherY + S(10),
      vx: (Math.random() - 0.5) * 0.5,
      vy: 0,
      active: true,
      trail: [],
    });
  });

  function draw() {
    // Draw the card snapshot as the background — no tint, card shows normally
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(cardSnapshot, 0, 0, W, H);

    // Move launcher
    launcherX += launcherDir;
    if (launcherX > W - S(30)) launcherDir = -Math.abs(launcherDir);
    if (launcherX < S(30)) launcherDir = Math.abs(launcherDir);

    // Draw launcher — suit-colored
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    // Rail
    ctx.beginPath();
    ctx.moveTo(S(20), launcherY);
    ctx.lineTo(W - S(20), launcherY);
    ctx.stroke();
    // Carriage
    ctx.fillStyle = color;
    ctx.fillRect(launcherX - S(12), launcherY - S(4), S(24), S(8));
    // Nozzle
    ctx.fillStyle = color;
    ctx.fillRect(launcherX - S(3), launcherY + S(2), S(6), S(10));
    // Indicator dot (white so it stands out against the carriage)
    ctx.beginPath();
    ctx.arc(launcherX, launcherY, S(3), 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw pegs as suit symbols
    pegs.forEach(([px, py]) => {
      ctx.fillStyle = color;
      if (isBrown(suit)) {
        drawPooPip(ctx, px, py, pegRadius * 1.8);
      } else {
        ctx.font = `${Math.round(pegRadius * 2)}px ui-monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(suitChar(suit), px, py);
      }
    });

    // Draw slot dividers — stop at the floor so score labels beneath sit clean
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= slotCount; i++) {
      const sx = i * slotWidth;
      ctx.beginPath();
      ctx.moveTo(sx, slotY);
      ctx.lineTo(sx, slotFloor);
      ctx.stroke();
    }
    // Slot floor
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, slotFloor);
    ctx.lineTo(W, slotFloor);
    ctx.stroke();
    // Slot labels — large, BENEATH the buckets, suit-colored
    ctx.font = `bold ${Math.round(S(14))}px ui-monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i < slotCount; i++) {
      ctx.fillStyle = color;
      ctx.fillText(String(slotScores[i]), i * slotWidth + slotWidth / 2, slotFloor + S(4));
    }

    // Draw walls — only down to the bucket floor so suit-colored labels below sit clean
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, launcherY);
    ctx.lineTo(0, slotFloor);
    ctx.moveTo(W, launcherY);
    ctx.lineTo(W, slotFloor);
    ctx.stroke();

    // Draw landed balls (sitting in slots) — suit-colored
    st.landed.forEach((lb) => {
      ctx.beginPath();
      ctx.arc(lb.x, lb.y, ballRadius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Update active balls
    st.balls.forEach((ball) => {
      if (!ball.active) return;

      ball.vy += gravity;
      ball.vx *= friction;
      ball.x += ball.vx;
      ball.y += ball.vy;

      // Trail
      ball.trail.push([ball.x, ball.y]);
      if (ball.trail.length > 15) ball.trail.shift();

      // Peg collision
      pegs.forEach(([px, py]) => {
        const bx = ball.x - px;
        const by = ball.y - py;
        const dist = Math.sqrt(bx * bx + by * by);
        const minDist = pegRadius + ballRadius;
        if (dist < minDist && dist > 0) {
          const nx = bx / dist;
          const ny = by / dist;
          ball.x = px + nx * minDist;
          ball.y = py + ny * minDist;
          const dot = ball.vx * nx + ball.vy * ny;
          ball.vx -= 2 * dot * nx;
          ball.vy -= 2 * dot * ny;
          ball.vx *= bounceFactor;
          ball.vy *= bounceFactor;
          ball.vx += (Math.random() - 0.5) * 1.2;
        }
      });

      // Wall bounce
      if (ball.x < ballRadius) { ball.x = ballRadius; ball.vx = Math.abs(ball.vx) * bounceFactor; }
      if (ball.x > W - ballRadius) { ball.x = W - ballRadius; ball.vx = -Math.abs(ball.vx) * bounceFactor; }

      // Landed in slot - ball stays
      if (ball.y >= slotFloor - ballRadius) {
        ball.active = false;
        const slotIdx = Math.min(slotCount - 1, Math.max(0, Math.floor(ball.x / slotWidth)));
        const pts = slotScores[slotIdx];
        st.score += pts;

        // Stack balls in the slot
        const slotCenterX = slotIdx * slotWidth + slotWidth / 2;
        const existingInSlot = st.landed.filter(
          (lb) => Math.floor(lb.x / slotWidth) === slotIdx || Math.abs(lb.x - slotCenterX) < slotWidth / 2
        ).length;
        const landY = slotFloor - ballRadius - existingInSlot * (ballRadius * 2);

        st.landed.push({ x: slotCenterX, y: landY });
        st.popups.push({ x: slotCenterX, y: slotY - S(10), pts, fade: 40 });
      }

      // Draw trail
      if (ball.trail.length > 1) {
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = ballRadius * 0.8;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ball.trail[0][0], ball.trail[0][1]);
        ball.trail.forEach(([tx, ty]) => ctx.lineTo(tx, ty));
        ctx.stroke();
      }

      // Draw ball — suit-colored
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Score popups — suit-colored
    st.popups = st.popups.filter((p) => {
      p.fade--;
      if (p.fade <= 0) return false;
      ctx.globalAlpha = p.fade / 40;
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.round(S(12))}px ui-monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`+${p.pts}`, p.x, p.y - (40 - p.fade) * 1.2);
      ctx.globalAlpha = 1;
      return true;
    });

    // Update score display in the DOM (outside the canvas)
    const scoreEl = document.getElementById("plinkoScoreVal");
    const highEl = document.getElementById("plinkoHighVal");
    if (scoreEl) scoreEl.textContent = st.score;
    if (highEl) highEl.textContent = plinkoHighScore;

    // Round over check
    const allDone = st.ballsRemaining <= 0 && st.balls.length > 0 && st.balls.every((b) => !b.active);
    if (allDone && !st.roundOver) {
      st.roundOver = true;
      if (st.score > plinkoHighScore) plinkoHighScore = st.score;
      plinkoDropBtn.textContent = "AGAIN";
      plinkoDropBtn.disabled = false;
    }

    if (st.roundOver) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(W / 2 - S(80), H / 2 - S(30), S(160), S(60));
      ctx.fillStyle = "#ff8800";
      ctx.font = `${Math.round(S(16))}px ui-monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${st.score} PTS`, W / 2, H / 2 - S(6));
      if (st.score >= plinkoHighScore && st.score > 0) {
        ctx.fillStyle = "#00cc55";
        ctx.font = `${Math.round(S(9))}px ui-monospace`;
        ctx.fillText("NEW HIGH SCORE!", W / 2, H / 2 + S(16));
      }
    }

    plinkoAnimId = requestAnimationFrame(draw);
  }

  draw();
}

/* Main render */
function renderCard(json) {
  const card = JSON.parse(json);
  const ctx = CANVAS.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  if (card.type === "back" && Array.isArray(card.pattern)) {
    drawBackPattern(ctx, card.pattern, {
      mode: "cover",
      inset: S(10),
      color: "#0b2f66",
    });
    return;
  }
  if (String(card.type).toLowerCase() === "system_patch") {
    drawPatchActivation(ctx);
    return;
  }
  if (card.type && String(card.type).toLowerCase().startsWith("joker")) {
    drawJoker(ctx, card);
    return;
  }
  if (String(card.type).toLowerCase() === "face") {
    drawFace(ctx, card.rank, card.suit);
    return;
  }
  if (String(card.type).toLowerCase() === "number") {
    drawNumber(ctx, card.rank, card.suit);
    return;
  }

  // Sandbox fallback: a card with a rank and suit but no recognised type
  // still renders as a number card, so experiments like {"rank":"12",
  // "suit":"diamonds"} just work.
  if (card.rank != null && card.suit) {
    drawNumber(ctx, card.rank, card.suit);
    return;
  }

  ctx.fillStyle = "#333";
  ctx.font = `${Math.round(S(22))}px ui-monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Invalid card", W / 2, H / 2);
}

/* Sandbox: build a centred grid of pip positions for any count (e.g. 12, 38).
   Standard 1-10 use the hand-tuned LAYOUTS; anything else gets a grid so the
   pips actually render in the middle of the card, not just the corners. */
const PIP_AREA = { x0: 46, x1: 194, y0: 64, y1: 272 }; // base 240x336 coords
function gridLayout(n) {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const { x0, x1, y0, y1 } = PIP_AREA;
  const cw = (x1 - x0) / cols;
  const ch = (y1 - y0) / rows;
  const cx = (x0 + x1) / 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const rowCount = r === rows - 1 ? n - r * cols : cols;
    const rowStartX = cx - (rowCount * cw) / 2 + cw / 2;
    pts.push([rowStartX + c * cw, y0 + ch / 2 + r * ch]);
  }
  return { layout: layoutScaled(pts), cellBase: Math.min(cw, ch) };
}

function drawNumber(ctx, rank, suit) {
  const color = suitColor(suit);
  const cornerFont = `${Math.round(S(CARD_SCALE.corner))}px ui-monospace`;
  const suitSmall = `${Math.round(S(CARD_SCALE.cornerSuit))}px ui-monospace`;
  const pad = S(CARD_SCALE.cornerPad);

  const rankText = String(rank).toUpperCase().replace(/^ACE$/, "A");
  drawCornerPair(ctx, rankText, suit, color, pad, cornerFont, suitSmall);

  // Standard ranks use the tuned layouts; any other positive number gets a
  // generated grid, with pip size shrinking to fit the count.
  const key = String(rank).toLowerCase();
  let layout, pipPx;
  if (LAYOUTS[key]) {
    layout = LAYOUTS[key];
    pipPx = S(CARD_SCALE.pips);
  } else {
    const n = parseInt(rank, 10);
    if (Number.isFinite(n) && n > 0) {
      const g = gridLayout(Math.min(n, 200)); // cap silly inputs
      layout = g.layout;
      pipPx = Math.min(S(CARD_SCALE.pips), S(g.cellBase * 0.62));
    } else {
      layout = [];
      pipPx = S(CARD_SCALE.pips);
    }
  }

  if (isBrown(suit)) {
    drawPooPipsCentered(ctx, layout, color, pipPx * 0.5);
  } else {
    drawPipsCentered(ctx, layout, suit, color, `${Math.round(pipPx)}px ui-monospace`);
  }
}

function drawFace(ctx, rank, suit) {
  const color = suitColor(suit);
  const cornerFont = `${Math.round(S(CARD_SCALE.corner))}px ui-monospace`;
  const suitSmall = `${Math.round(S(CARD_SCALE.cornerSuit))}px ui-monospace`;
  const centerFont = `${Math.round(S(CARD_SCALE.faceCenter))}px ui-monospace`;
  const pad = S(CARD_SCALE.cornerPad);
  const letter = (rank || "?")[0].toUpperCase().replace("A", "A");

  // Try loading the traditional face card image
  loadFaceImage(rank, suit)
    .then((img) => {
      // Draw the full traditional card onto the canvas
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
    })
    .catch(() => {
      // Fallback: draw the letter if SVG not available
      drawCornerPair(ctx, letter, suit, color, pad, cornerFont, suitSmall);
      ctx.fillStyle = color;
      ctx.font = centerFont;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(letter, W / 2, H / 2);
    });
}

function drawJoker(ctx, card) {
  ctx.fillStyle = "#900";
  ctx.font = `${Math.round(S(40))}px ui-monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("JOKER", W / 2, H / 2);
  ctx.font = `${Math.round(S(12))}px ui-monospace`;
  if (card.payload) {
    const line = String(card.payload).replace(/\n/g, " ");
    ctx.fillText(line, W / 2, H / 2 + S(34));
  }
}

function drawBackPattern(
  ctx,
  pattern,
  { mode = "cover", inset = S(14), color = "#08326a" } = {}
) {
  const rows = pattern.map((r) => r.trim().split(/\s+/));
  const R = rows.length,
    C = Math.max(...rows.map((r) => r.length));
  const left = inset,
    top = inset,
    right = W - inset,
    bottom = H - inset;
  const Wd = right - left,
    Hd = bottom - top;
  const cell =
    mode === "cover" ? Math.max(Wd / C, Hd / R) : Math.min(Wd / C, Hd / R);
  const totalW = cell * C,
    totalH = cell * R;
  const ox = left + (Wd - totalW) / 2,
    oy = top + (Hd - totalH) / 2;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, cell * 0.08);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const t = rows[r][c];
      const cx = ox + c * cell + cell / 2;
      const cy = oy + r * cell + cell / 2;
      drawToken(ctx, t, cx, cy, cell * 0.5);
    }
  }
  ctx.restore();
}
function drawToken(ctx, t, cx, cy, s) {
  if (t === "x" || t === "X") {
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s);
    ctx.lineTo(cx + s, cy + s);
    ctx.moveTo(cx + s, cy - s);
    ctx.lineTo(cx - s, cy + s);
    ctx.stroke();
  } else if (t === "·" || t === ".") {
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (t === "o" || t === "O") {
    ctx.beginPath();
    ctx.lineWidth = Math.max(1, s * 0.1);
    ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
    ctx.stroke();
  } else if (t === "-") {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.4, cy);
    ctx.lineTo(cx + s * 0.4, cy);
    ctx.stroke();
  }
}

/* ========= CAMERA OVERLAY ========= */
let overlayEl = null,
  videoEl = null,
  stream = null,
  facing = "environment";

function buildOverlay() {
  if (overlayEl) return overlayEl;

  overlayEl = document.createElement("div");
  overlayEl.id = "camOverlay";
  overlayEl.innerHTML = `
    <div id="camBox">
      <video id="video" playsinline autoplay muted></video>
      <div id="camButtons">
        <button id="flipBtn" class="btn">Flip Camera</button>
        <button id="captureBtn" class="btn primary">Capture</button>
        <button id="cancelBtn" class="btn">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);

  videoEl = overlayEl.querySelector("#video");
  const flipBtn = overlayEl.querySelector("#flipBtn");
  const captureBtn = overlayEl.querySelector("#captureBtn");
  const cancelBtn = overlayEl.querySelector("#cancelBtn");

  flipBtn.addEventListener("click", async () => {
    facing = facing === "environment" ? "user" : "environment";
    await startStream();
  });

  cancelBtn.addEventListener("click", stopCameraOverlay);

  captureBtn.addEventListener("click", async () => {
    try {
      if (!videoEl || !videoEl.videoWidth || videoEl.readyState < 2) {
        alert("Camera still loading - give it a second, then try again.");
        return;
      }
      const b64 = snapshotToBase64();
      await processImageBase64(b64);
      stopCameraOverlay();
    } catch (e) {
      console.error("Capture/OCR error:", e);
      alert("Capture failed: " + (e && e.message ? e.message : "unknown error"));
      // leave the camera open so they can retry without reopening
    }
  });

  return overlayEl;
}

async function openCamera() {
  buildOverlay();
  overlayEl.style.display = "flex";
  await startStream();
}
function stopCameraOverlay() {
  overlayEl.style.display = "none";
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

/* Stream helpers */
function snapshotToBase64() {
  const c = document.createElement("canvas");
  const w = videoEl.videoWidth,
    h = videoEl.videoHeight;
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(videoEl, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.92);
}

async function startStream() {
  // Stop existing tracks
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  const constraints = { video: { facingMode: facing } };
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    // Safari sometimes needs plain true
    stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
  }
  videoEl.srcObject = stream;
}

/* ========= OCR + SNAPPING ========= */
function normalizeScanned(s) {
  return s
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/—|–/g, "-")
    .replace(/[™©®]/g, '"') // common confusion → quote
    .replace(/[{(]\s*/g, "{")
    .replace(/\s*[)}]/g, "}")
    .replace(/\u00A0/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/(\r\n|\r)/g, "\n")
    .trim();
}

function trySnapToDeck(text) {
  // We only ever allow the 53 possibilities when the source is camera.
  // Very tolerant: look for tokens anywhere.
  const t = text.toLowerCase();

  const ranks = [
    "ace",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "jack",
    "queen",
    "king",
  ];
  const suits = ["clubs", "spades", "hearts", "diamonds"];

  // quick find
  const rank = ranks.find(
    (r) => t.includes(`"${r}"`) || t.includes(`:${r}`) || t.includes(` ${r}`)
  );
  const suit = suits.find(
    (s) => t.includes(`"${s}"`) || t.includes(`:${s}`) || t.includes(` ${s}`)
  );

  // System Patch card detection (fuzzy - ~10% OCR tolerance)
  // Key tokens from the printed card that OCR should pick up
  const patchTokens = [
    "system_patch", "system patch",
    "patch-001", "patch 001",
    "feature-unlock", "feature unlock",
    "hidden_mode", "hidden mode",
    "secret_payload", "secret payload",
    "4fva9dc2b8e19a",
    "rel-chan", "rel chan",
    "first-edition", "first edition",
    "r-override", "r override",
  ];
  // Count how many tokens appear in the scanned text
  const patchHits = patchTokens.filter((tok) => t.includes(tok)).length;
  // If 3+ tokens match (~20% of the list), it's the patch card
  if (patchHits >= 3 || t.includes("system_patch") || t.includes("system patch")) {
    return JSON.stringify({
      type: "system_patch",
      version: "1.1",
      card_id: "PATCH-001",
      "rel-chan": "first-edition",
      applies_to: "renderer",
      scope: "feature-unlock",
      features: {
        hidden_mode: true,
        "r-override": "experiment",
        secret_payload: "unlock",
      },
      checksum: "4fva9dc2b8e19a",
    }, null, 2);
  }

  // Joker / Back shortcuts
  if (t.includes("joker") || t.includes("error") || t.includes("hacked")) {
    return JSON.stringify(
      { rank: "ERROR", suit: "HACKED", type: "joker1" },
      null,
      2
    );
  }
  if (t.includes("type") && t.includes("back")) {
    return JSON.stringify(EXAMPLES["Back"], null, 2);
  }

  if (rank && suit) {
    const isFace = ["jack", "queen", "king"].includes(rank);
    const type = isFace ? "face" : "number";
    const rankOut = rank === "ace" ? "ace" : rank;
    return JSON.stringify({ rank: rankOut, suit, type }, null, 2);
  }

  // Couldn't confidently snap → return cleaned text, user can edit
  return JSON.stringify(safeJsonGuess(text), null, 2);
}

function safeJsonGuess(text) {
  // Try to coerce into a basic object with best-effort defaults
  try {
    const j = JSON.parse(text);
    return j;
  } catch {
    // Extract tokens loosely
    const t = text.toLowerCase();
    let rank = (/\"(ace|[2-9]|10|jack|queen|king)\"/.exec(t) || [])[1] || "8";
    let suit =
      (/\"(clubs|spades|hearts|diamonds)\"/.exec(t) || [])[1] || "clubs";
    const isFace = ["jack", "queen", "king"].includes(rank);
    const type = isFace ? "face" : "number";
    return { rank, suit, type };
  }
}

async function processImageBase64(b64) {
  // Send to Vision backend
  let res;
  try {
    res = await fetch(VISION_FN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: b64 }),
    });
  } catch (e) {
    throw new Error("could not reach the OCR service (network or CORS)");
  }
  if (!res.ok) throw new Error("OCR service returned status " + res.status);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("OCR service sent an unexpected (non-JSON) response");
  }
  const snapped = trySnapToDeck(normalizeScanned(String(data.text || "")));

  // Put into editor
  ta.value = snapped;

  // Auto-render patch card (no click needed)
  try {
    const card = JSON.parse(snapped);
    if (String(card.type).toLowerCase() === "system_patch") {
      renderCard(snapped);
    }
  } catch {}
}

/* ========= UI WIRES ========= */
renderBtn.addEventListener("click", () => {
  try {
    const json = ta.value.trim();
    if (!json) return alert("Paste or type a card JSON first.");

    // Easter egg: type "credits" to see backer credits
    if (json.toLowerCase() === "credits") {
      drawCredits(CANVAS.getContext("2d"));
      return;
    }

    // If plinko mode is on, rebuild the board with the new card
    if (plinkoMode) {
      startPlinkoFromCurrentCard();
      return;
    }

    renderCard(json);
  } catch (e) {
    alert("Invalid JSON");
    console.error(e);
  }
});

/* Examples: cycle through the full standard deck - every number and face
   card in all four suits, plus a back. No jokers, patch, or credits.
   Shuffled so each click gives a fresh card until the set is exhausted. */
const EXAMPLE_DECK = (() => {
  const suits = ["clubs", "spades", "hearts", "diamonds"];
  const numbers = ["ace", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  const faces = ["jack", "queen", "king"];
  const deck = [];
  suits.forEach((suit) => {
    numbers.forEach((rank) => deck.push({ rank, suit, type: "number" }));
    faces.forEach((rank) => deck.push({ rank, suit, type: "face" }));
  });
  // include the card back several times so it turns up roughly 1 in 10
  for (let i = 0; i < 5; i++) deck.push(EXAMPLES["Back"]);
  return deck;
})();

let exampleQueue = [];
function nextExample() {
  if (exampleQueue.length === 0) {
    exampleQueue = EXAMPLE_DECK.slice();
    for (let i = exampleQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [exampleQueue[i], exampleQueue[j]] = [exampleQueue[j], exampleQueue[i]];
    }
  }
  return exampleQueue.pop();
}

examplesBtn.addEventListener("click", () => {
  ta.value = JSON.stringify(nextExample(), null, 2);
});

scanBtn.addEventListener("click", async () => {
  // Prevent mobile keyboard auto-opening at this moment
  ta.blur();
  await openCamera();
});

/* No initial render; editor starts empty per your request */
