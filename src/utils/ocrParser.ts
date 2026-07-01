import type { OcrResult } from '../types';

/**
 * Converts a duration string (hh:mm:ss or mm:ss) to seconds
 */
export function durationToSeconds(durationStr: string): number {
  const parts = durationStr.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  
  if (parts.length === 3) {
    // hh:mm:ss
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // mm:ss
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Converts seconds to a duration string (hh:mm:ss or mm:ss)
 */
export function secondsToDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Formats pace in seconds/km to a string (mm:ss)
 */
export function secondsToPace(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Parses pace string (mm:ss) to seconds/km
 */
export function paceToSeconds(paceStr: string): number {
  const parts = paceStr.split(':').map(Number);
  if (parts.length === 2 && !parts.some(isNaN)) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Smart parsing of raw OCR text to extract run parameters (Distance, Duration, Pace)
 */
export function parseOcrText(rawText: string): OcrResult {
  // Normalize colon misreadings: e.g. 0.43.29 -> 0:43:29 or 0;43;29 -> 0:43:29
  const cleanedText = rawText
    .replace(/\b(\d{1,2})[\.;](\d{2})[\.;](\d{2})\b/g, '$1:$2:$3')
    .replace(/\b(\d{1,2})[\.;](\d{2})\b/g, '$1:$2');

  const normalizedText = cleanedText.toLowerCase();

  let distance: number | null = null;
  let duration: string | null = null;
  let pace: string | null = null;
  let date: string | null = null;
  let sourceApp = 'Unbekannt';

  // 1. Detect Source App
  if (normalizedText.includes('fitness') || normalizedText.includes('aktivität') || normalizedText.includes('ringe') || normalizedText.includes('workout')) {
    sourceApp = 'Apple Fitness';
  } else if (normalizedText.includes('adidas') || normalizedText.includes('runtastic') || normalizedText.includes('adidas running')) {
    sourceApp = 'Adidas Running';
  } else if (normalizedText.includes('strava')) {
    sourceApp = 'Strava';
  } else if (normalizedText.includes('garmin') || normalizedText.includes('connect')) {
    sourceApp = 'Garmin';
  }

  // 1b. German Date parsing: e.g., "Mi. 1. Juli" or "1. Juli" or "01.07."
  const dateMatch = normalizedText.match(/\b(?:mo|di|mi|do|fr|sa|so)?\.?\s*(\d{1,2})\.?\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember|jan|feb|mär|apr|mai|jun|jul|aug|sep|okt|nov|dez)\b/i);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const monthStr = dateMatch[2];
    const monthMap: { [key: string]: number } = {
      januar: 1, jan: 1,
      februar: 2, feb: 2,
      märz: 3, mär: 3,
      april: 4, apr: 4,
      mai: 5,
      juni: 6, jun: 6,
      juli: 7, jul: 7,
      august: 8, aug: 8,
      september: 9, sep: 9,
      oktober: 10, okt: 10,
      november: 11, nov: 11,
      dezember: 12, dez: 12
    };
    const month = monthMap[monthStr];
    if (month && day >= 1 && day <= 31) {
      const year = new Date().getFullYear();
      date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }

  // 2. Extract Distance (km)
  // Find all decimal number candidates and score them based on surrounding context
  let bestDistance: number | null = null;
  let bestScore = -1;

  const decimalRegex = /\b(\d+[\.,]\d{1,2})\b/g;
  let decMatch;
  decimalRegex.lastIndex = 0;

  while ((decMatch = decimalRegex.exec(cleanedText)) !== null) {
    const numStr = decMatch[1];
    const val = parseFloat(numStr.replace(',', '.'));
    
    // Ignore unreasonable running distances
    if (val <= 0.1 || val > 150) continue;

    const index = decMatch.index;
    let score = 0;

    // Check surrounding text (50 characters before and after)
    const contextStart = Math.max(0, index - 50);
    const contextEnd = Math.min(cleanedText.length, index + numStr.length + 50);
    const contextText = cleanedText.slice(contextStart, contextEnd).toLowerCase();
    
    // Check immediate text following the number
    const immediateAfterStart = index + numStr.length;
    const immediateAfterEnd = Math.min(cleanedText.length, immediateAfterStart + 15);
    const immediateAfter = cleanedText.slice(immediateAfterStart, immediateAfterEnd).toLowerCase();

    // 1. Check unit "km" immediately following
    if (/^\s*km\b/.test(immediateAfter) || /^\s*kilometer\b/.test(immediateAfter)) {
      score += 150;
    } else if (contextText.includes('km') || contextText.includes('kilometer')) {
      score += 50;
    }

    // 2. Check labels like "strecke", "distanz", "distance", "laufstrecke" in the context
    if (contextText.includes('strecke') || contextText.includes('distanz') || contextText.includes('distance') || contextText.includes('laufstrecke')) {
      score += 100;
    }

    // 3. Prefer 2 decimal places (typical for run trackers, e.g. 5.42)
    if (numStr.includes('.') || numStr.includes(',')) {
      const decimals = numStr.split(/[\.,]/)[1];
      if (decimals.length === 2) {
        score += 20;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestDistance = val;
    }
  }

  // Fallback to original regexes if score-based matching did not yield a confident result
  if (bestDistance !== null && bestScore > 20) {
    distance = bestDistance;
  } else {
    // Original regex fallback
    const distanceRegexes = [
      /(\d+[\.,]\d{1,2})\s*(?:km|kilometer|distanz|distance)\b/i,
      /(?:distanz|distance|strecke|laufstrecke)\s*(\d+[\.,]\d{1,2})\b/i,
      /\b(\d+[\.,]\d{2})\b/
    ];
    for (const regex of distanceRegexes) {
      const match = cleanedText.match(regex);
      if (match && match[1]) {
        const parsedVal = parseFloat(match[1].replace(',', '.'));
        if (parsedVal > 0 && parsedVal < 150) {
          distance = parsedVal;
          break;
        }
      }
    }
  }

  // 3. Extract Times (Duration / Pace)
  // Search for times: "hh:mm:ss" or "mm:ss"
  const timeRegex = /\b(\d{1,2}):(\d{2}):(\d{2})\b/g; // hh:mm:ss
  const shortTimeRegex = /\b(\d{1,2}):(\d{2})\b/g;   // mm:ss
  
  const allTimes: { value: string; index: number; isThreeParts: boolean }[] = [];
  
  let match;
  // Reset regex indexes
  timeRegex.lastIndex = 0;
  shortTimeRegex.lastIndex = 0;

  while ((match = timeRegex.exec(cleanedText)) !== null) {
    allTimes.push({ value: match[0], index: match.index, isThreeParts: true });
  }

  // To avoid duplicate matching (since hh:mm:ss contains mm:ss inside), only match short times that aren't part of long times
  while ((match = shortTimeRegex.exec(cleanedText)) !== null) {
    const isPartOfLongTime = allTimes.some(t => 
      t.isThreeParts && 
      match!.index >= t.index && 
      (match!.index + match![0].length) <= (t.index + t.value.length)
    );
    if (!isPartOfLongTime) {
      allTimes.push({ value: match[0], index: match.index, isThreeParts: false });
    }
  }

  // Find duration candidate (the longest time string, or if we have multiple, the larger one)
  const candidates = allTimes.map(t => t.value);
  const threePart = allTimes.find(t => t.isThreeParts);
  
  if (threePart) {
    duration = threePart.value;
  } else if (candidates.length > 0) {
    const secondsValues = candidates.map(c => ({ str: c, secs: durationToSeconds(c) }));
    secondsValues.sort((a, b) => b.secs - a.secs); // Descending order of duration
    duration = secondsValues[0].str;
  }

  // 4. Calculate Pace purely based on Distance and Duration
  if (distance && duration) {
    const durSecs = durationToSeconds(duration);
    if (durSecs > 0 && distance > 0) {
      const paceSecs = durSecs / distance;
      pace = secondsToPace(paceSecs);
    }
  }

  return {
    distance,
    duration,
    pace,
    sourceApp,
    rawText,
    date
  };
}
