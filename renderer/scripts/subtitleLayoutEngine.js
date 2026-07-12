function prepareSubtitleLayout(text, options) {
  const target = options.target;
  const safeX = options.safeX;
  const safeBottom = options.safeBottom;
  const baseFontSize = options.baseFontSize;
  const minFontSize = options.minFontSize;
  const styleFontSize = options.styleFontSize;
  const safeTop = options.safeTop || 220;
  const maxLines = options.maxLines || 2;
  const normalized = String(text).replace(/\s+/g, " ").trim();
  const length = Array.from(normalized).length;
  let fontSize = styleFontSize || baseFontSize;

  if (!styleFontSize) {
    if (length > 42) fontSize = Math.min(fontSize, 66);
    if (length > 80) fontSize = Math.min(fontSize, 60);
    if (length > 130) fontSize = Math.min(fontSize, 54);
  }

  let maxChars = maxCharsForFont(fontSize, target, safeX);
  let lines = wrapSubtitleText(normalized, maxChars);

  while (lines.length > maxLines && fontSize > minFontSize) {
    fontSize -= 2;
    maxChars = maxCharsForFont(fontSize, target, safeX);
    lines = wrapSubtitleText(normalized, maxChars);
  }

  if (lines.length > maxLines + 1 && fontSize > minFontSize) {
    fontSize = minFontSize;
    maxChars = maxCharsForFont(fontSize, target, safeX);
    lines = wrapSubtitleText(normalized, maxChars);
  }

  const maxSafeHeight = target.height - safeBottom - safeTop;
  let lineSpacing = Math.round(fontSize * 0.22);
  while (subtitleBlockHeight(lines.length, fontSize, lineSpacing) > maxSafeHeight && fontSize > minFontSize) {
    fontSize -= 2;
    maxChars = maxCharsForFont(fontSize, target, safeX);
    lines = wrapSubtitleText(normalized, maxChars);
    lineSpacing = Math.round(fontSize * 0.2);
  }

  if (lines.length > maxLines) {
    lines = truncateWrappedLines(normalized, maxChars, maxLines);
  }

  return {
    wrappedText: lines.join("\n"),
    lines,
    fontSize,
    lineSpacing,
    maxChars,
  };
}

function truncateWrappedLines(text, maxChars, maxLines) {
  const lines = wrapSubtitleText(text, maxChars);
  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  const lastIndex = kept.length - 1;
  const suffix = "...";
  const limit = Math.max(1, maxChars - suffix.length);
  const lastLine = Array.from(kept[lastIndex]).slice(0, limit).join("").trimEnd();
  kept[lastIndex] = `${lastLine}${suffix}`;
  return kept;
}

function maxCharsForFont(fontSize, target, safeX) {
  const safeWidth = target.width - safeX * 2;
  return Math.max(14, Math.floor(safeWidth / (fontSize * 0.48)));
}

function wrapSubtitleText(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (Array.from(word).length > maxChars) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(...splitLongWord(word, maxChars));
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (Array.from(candidate).length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function splitLongWord(word, maxChars) {
  const chars = Array.from(word);
  const parts = [];

  for (let index = 0; index < chars.length; index += maxChars) {
    parts.push(chars.slice(index, index + maxChars).join(""));
  }

  return parts;
}

function subtitleBlockHeight(lineCount, fontSize, lineSpacing) {
  return lineCount * fontSize + Math.max(0, lineCount - 1) * lineSpacing;
}

module.exports = {
  prepareSubtitleLayout,
  wrapSubtitleText,
};
