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

/* ========= RENDERING ENGINE (unchanged logic that already works well) ========= */
const W = CANVAS.width; // 360
const H = CANVAS.height; // 528

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

function drawPooPipsCentered(ctx, layout, color) {
  if (!layout || !layout.length) return;
  const xs = layout.map(([x]) => x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const dx = W / 2 - mid;
  ctx.save();
  ctx.fillStyle = color;
  const pipSize = S(CARD_SCALE.pips) * 0.5;
  layout.forEach(([x, y]) => drawPooPip(ctx, x + dx, y, pipSize));
  ctx.restore();
}

/* ========= CREDITS ========= */
const DIGITAL_SUPPORTERS = [
  // Replace with actual backer names when known
  "Backer_01",
  "Backer_02",
  "Backer_03",
  "Backer_04",
  "Backer_05",
];

function drawCredits(ctx) {
  // Black background
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  const green = "#00cc55";
  const dim = "rgba(0,204,85,0.5)";

  // Header
  ctx.fillStyle = green;
  ctx.font = `${Math.round(S(16))}px ui-monospace`;
  ctx.fillText("// CREDITS", W / 2, S(40));

  // Digital Supporters
  ctx.fillStyle = dim;
  ctx.font = `${Math.round(S(10))}px ui-monospace`;
  ctx.fillText("digital_supporters: [", W / 2, S(72));

  ctx.fillStyle = green;
  ctx.font = `${Math.round(S(11))}px ui-monospace`;
  let y = S(96);
  DIGITAL_SUPPORTERS.forEach((name) => {
    ctx.fillText(`"${name}",`, W / 2, y);
    y += S(20);
  });

  ctx.fillStyle = dim;
  ctx.font = `${Math.round(S(10))}px ui-monospace`;
  ctx.fillText("]", W / 2, y + S(4));

  // Face card art credit
  y += S(40);
  ctx.fillStyle = dim;
  ctx.fillText("face_card_art: {", W / 2, y);
  y += S(20);
  ctx.fillStyle = green;
  ctx.font = `${Math.round(S(9))}px ui-monospace`;
  ctx.fillText('"Adrian Kennard (RevK)"', W / 2, y);
  y += S(16);
  ctx.fillText('"CC0 Public Domain"', W / 2, y);
  y += S(16);
  ctx.fillText('"me.uk/cards"', W / 2, y);
  y += S(20);
  ctx.fillStyle = dim;
  ctx.font = `${Math.round(S(10))}px ui-monospace`;
  ctx.fillText("}", W / 2, y);

  // Footer
  ctx.fillStyle = dim;
  ctx.font = `${Math.round(S(9))}px ui-monospace`;
  ctx.fillText("// Dan Berg 2026", W / 2, H - S(24));
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

function drawPatchActivation(ctx) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  const green = "#00cc55";
  const orange = "#ff8800";
  const dim = "rgba(0,204,85,0.4)";

  if (!patchActivated) {
    patchActivated = true;

    // Run glitch first, then show activation screen
    runGlitchEffect(ctx, () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";

      ctx.fillStyle = orange;
      ctx.font = `${Math.round(S(16))}px ui-monospace`;
      ctx.fillText("SYSTEM PATCHED!", W / 2, S(50));

      ctx.fillStyle = green;
      ctx.font = `${Math.round(S(10))}px ui-monospace`;
      let y = S(90);
      const lines = [
        "$ patch v1.1 applied",
        "",
        "> verifying 4fva9dc2b8e19a",
        "> checksum [ OK ]",
        "",
        "new toys unlocked:",
        "",
      ];
      lines.forEach((line) => {
        ctx.fillText(line, W / 2, y);
        y += S(16);
      });

      // Toy list
      ctx.fillStyle = orange;
      ctx.font = `${Math.round(S(11))}px ui-monospace`;
      const toys = [
        '+ "ascii" - text art mode',
        '+ "corrupt" - data decay',
        '+ "plinko" - pip pinball',
      ];
      toys.forEach((toy) => {
        ctx.fillText(toy, W / 2, y);
        y += S(20);
      });

      y += S(16);
      ctx.fillStyle = dim;
      ctx.font = `${Math.round(S(9))}px ui-monospace`;
      ctx.fillText("type a toy name and hit render", W / 2, y);

      // Show toy buttons
      showToyButtons();
    });
  } else {
    ctx.textAlign = "center";
    ctx.fillStyle = dim;
    ctx.font = `${Math.round(S(12))}px ui-monospace`;
    ctx.fillText("SYSTEM PATCH v1.1", W / 2, S(50));
    ctx.fillStyle = green;
    ctx.font = `${Math.round(S(10))}px ui-monospace`;
    ctx.fillText("patch already applied", W / 2, S(80));
    ctx.fillStyle = dim;
    ctx.font = `${Math.round(S(9))}px ui-monospace`;
    ctx.fillText("toys: ascii / corrupt / plinko", W / 2, S(104));
  }
}

/* ========= TOY BUTTONS (appear after patch) ========= */
let toyBtnsAdded = false;
function showToyButtons() {
  if (toyBtnsAdded) return;
  toyBtnsAdded = true;
  const container = document.querySelector(".row.center.gap") || document.querySelector(".row.center");
  if (!container) return;
  const toyNames = ["ascii", "corrupt", "plinko"];
  toyNames.forEach((name) => {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = name;
    btn.style.borderColor = "#00cc55";
    btn.style.color = "#00cc55";
    btn.addEventListener("click", () => {
      ta.value = name;
      runToy(name);
    });
    container.appendChild(btn);
  });
}

/* ========= TOYS ========= */
function runToy(name) {
  const ctx = CANVAS.getContext("2d");
  switch (name) {
    case "ascii":
      runAsciiMode(ctx);
      break;
    case "corrupt":
      runCorruptMode(ctx);
      break;
    case "plinko":
      runPlinkoMode(ctx);
      break;
    default:
      return false;
  }
  return true;
}

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

  // Card dimensions in characters
  const cols = 27;
  const rows = 35;

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

  // Calculate font size to fill the canvas
  const fontSize = Math.floor(Math.min(W / (cols * 0.62), H / (grid.length * 1.25)));
  const lineHeight = fontSize * 1.2;
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

/* --- PLINKO MODE (placeholder - full build next) --- */
function runPlinkoMode(ctx) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#00cc55";
  ctx.font = `${Math.round(S(14))}px ui-monospace`;
  ctx.fillText("PLINKO", W / 2, S(50));
  ctx.fillStyle = "rgba(0,204,85,0.5)";
  ctx.font = `${Math.round(S(10))}px ui-monospace`;
  ctx.fillText("coming soon...", W / 2, S(80));
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

  ctx.fillStyle = "#333";
  ctx.font = `${Math.round(S(22))}px ui-monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Invalid card", W / 2, H / 2);
}

function drawNumber(ctx, rank, suit) {
  const color = suitColor(suit);
  const cornerFont = `${Math.round(S(CARD_SCALE.corner))}px ui-monospace`;
  const suitSmall = `${Math.round(S(CARD_SCALE.cornerSuit))}px ui-monospace`;
  const pipFont = `${Math.round(S(CARD_SCALE.pips))}px ui-monospace`;
  const pad = S(CARD_SCALE.cornerPad);

  const rankText = String(rank)
    .toUpperCase()
    .replace(/^ACE$/, "A")
    .replace(/^A$/, "A");
  drawCornerPair(ctx, rankText, suit, color, pad, cornerFont, suitSmall);

  const key = String(rank).toLowerCase();
  const layout = LAYOUTS[key];
  if (isBrown(suit)) {
    drawPooPipsCentered(ctx, layout, color);
  } else {
    drawPipsCentered(ctx, layout, suit, color, pipFont);
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
      const b64 = snapshotToBase64();
      await processImageBase64(b64);
    } catch (e) {
      console.error(e);
      alert("Capture failed. Try again.");
    } finally {
      stopCameraOverlay();
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
  const res = await fetch(VISION_FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: b64 }),
  });
  const data = await res.json();
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

    // Toys (only if patch activated)
    if (patchActivated) {
      const cmd = json.toLowerCase();
      if (["ascii", "corrupt", "plinko"].includes(cmd)) {
        runToy(cmd);
        return;
      }
    }

    renderCard(json);
  } catch (e) {
    alert("Invalid JSON");
    console.error(e);
  }
});

examplesBtn.addEventListener("click", () => {
  const keys = Object.keys(EXAMPLES);
  const key = keys[Math.floor(Math.random() * keys.length)];
  const json = JSON.stringify(EXAMPLES[key], null, 2);
  ta.value = json;
});

scanBtn.addEventListener("click", async () => {
  // Prevent mobile keyboard auto-opening at this moment
  ta.blur();
  await openCamera();
});

/* No initial render; editor starts empty per your request */
