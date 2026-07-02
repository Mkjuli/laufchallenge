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
  // Normalize colons and spaces.
  // Normalize colon misreadings: e.g. 0.43.29 -> 0:43:29 or 0;43;29 -> 0:43:29
  // Also clean up double single quotes or apostrophes in pace (e.g. 6'03'' -> 6'03")
  const cleanedText = rawText
    .replace(/\b(\d{1,2})[\.;](\d{2})[\.;](\d{2})\b/g, '$1:$2:$3')
    .replace(/\b(\d{1,2})[\.;](\d{2})\b/g, '$1:$2')
    .replace(/['`]{2}/g, '"');

  const normalizedText = cleanedText.toLowerCase();

  let distance: number | null = null;
  let duration: string | null = null;
  let pace: string | null = null;
  let date: string | null = null;
  let sourceApp = 'Unbekannt';

  // 1. Detect Source App
  const isAppleFitness = normalizedText.includes('fitness') || 
                         normalizedText.includes('ringe') || 
                         normalizedText.includes('trainingsdetails') || 
                         (normalizedText.includes('strecke') && normalizedText.includes('trainingszeit')) ||
                         normalizedText.includes('aktivitätskilokalorien');

  if (isAppleFitness) {
    sourceApp = 'Apple Fitness';
  } else if (normalizedText.includes('adidas') || normalizedText.includes('runtastic') || normalizedText.includes('adidas running')) {
    sourceApp = 'Adidas Running';
  } else if (normalizedText.includes('strava')) {
    sourceApp = 'Strava';
  } else if (normalizedText.includes('garmin') || normalizedText.includes('connect')) {
    sourceApp = 'Garmin';
  }

  // 1b. German Date parsing: e.g., "Mi. 1. Juli" or "1. Juli" or "01.07.26"
  const dateMatchMonth = normalizedText.match(/\b(?:mo|di|mi|do|fr|sa|so)?\.?\s*(\d{1,2})\.?\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember|jan|feb|mär|apr|mai|jun|jul|aug|sep|okt|nov|dez)\b/i);
  const dateMatchNumeric = normalizedText.match(/\b(\d{1,2})\.(\d{2})\.(\d{2,4})\b/);

  if (dateMatchMonth) {
    const day = parseInt(dateMatchMonth[1]);
    const monthStr = dateMatchMonth[2];
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
  } else if (dateMatchNumeric) {
    const day = parseInt(dateMatchNumeric[1]);
    const month = parseInt(dateMatchNumeric[2]);
    let yearStr = dateMatchNumeric[3];
    if (yearStr.length === 2) {
      yearStr = '20' + yearStr;
    }
    const year = parseInt(yearStr);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }

  // --- Apple Fitness Heuristic: Split into Upper and Lower Half ---
  // Distance and Duration are always in the upper half of Apple Fitness.
  // Cadence, Heart rate, Power, and Pace are in the lower half.
  // We restrict searching for Distance and Duration to the upper half to prevent layout confusion.
  let searchAreaForDistanceAndDuration = cleanedText;
  if (sourceApp === 'Apple Fitness') {
    const lines = cleanedText.split('\n');
    const midIndex = Math.ceil(lines.length * 0.55);
    searchAreaForDistanceAndDuration = lines.slice(0, midIndex).join('\n');
  }

  // Keywords lists for contextual analysis
  const distKeywords = ['distanz', 'strecke', 'entfernung', 'distance', 'laufstrecke'];
  const timeKeywords = ['trainingszeit', 'dauer', 'zeit', 'duration', 'time'];
  const paceKeywords = ['pace', 'tempo', 'ø-pace', 'ø pace', 'durchschnittliche pace', 'avg pace', 'average pace', 'tempo ø', 'tempoø'];

  // 2. Extract Distance (km)
  let bestDistance: number | null = null;
  let bestScore = -1;

  const decimalRegex = /\b(\d+[\.,]\d{1,3})\b/g;
  let decMatch;
  decimalRegex.lastIndex = 0;

  while ((decMatch = decimalRegex.exec(searchAreaForDistanceAndDuration)) !== null) {
    const numStr = decMatch[1];
    const val = parseFloat(numStr.replace(',', '.'));
    
    // Ignore unreasonable running distances
    if (val <= 0.1 || val > 150) continue;

    const index = decMatch.index;
    let score = 0;

    // Check surrounding text (50 characters before and after)
    const contextStart = Math.max(0, index - 50);
    const contextEnd = Math.min(searchAreaForDistanceAndDuration.length, index + numStr.length + 50);
    const contextText = searchAreaForDistanceAndDuration.slice(contextStart, contextEnd).toLowerCase();
    
    // Check immediate text following the number
    const immediateAfterStart = index + numStr.length;
    const immediateAfterEnd = Math.min(searchAreaForDistanceAndDuration.length, immediateAfterStart + 15);
    const immediateAfter = searchAreaForDistanceAndDuration.slice(immediateAfterStart, immediateAfterEnd).toLowerCase();

    // 1. Check unit "km" immediately following (excluding km/h speed units)
    if (/^\s*km\/h/i.test(immediateAfter) || /^\s*kmh/i.test(immediateAfter) || /^\s*km\/std/i.test(immediateAfter)) {
      score -= 250; // Heavily penalize speed values
    } else if (/^\s*km\b/.test(immediateAfter) || /^\s*kilometer\b/.test(immediateAfter)) {
      score += 150;
    } else if (contextText.includes('km') || contextText.includes('kilometer')) {
      if (contextText.includes('km/h') || contextText.includes('kmh') || contextText.includes('geschw') || contextText.includes('speed') || contextText.includes('geschwindigkeit')) {
        score -= 250;
      } else {
        score += 50;
      }
    }

    // 2. Check distance keywords in context
    distKeywords.forEach(keyword => {
      if (contextText.includes(keyword)) {
        score += 100;
      }
    });

    // 3. Prefer 2 decimal places (typical for run trackers, e.g. 7.18)
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

  if (bestDistance !== null && bestScore > 20) {
    distance = bestDistance;
  } else {
    // Fallback simple matching in the restricted area
    const distanceRegexes = [
      /(\d+[\.,]\d{1,2})\s*(?:km|kilometer|distanz|distance)\b/i,
      /(?:distanz|distance|strecke|entfernung|laufstrecke)\s*(\d+[\.,]\d{1,2})\b/i,
      /\b(\d+[\.,]\d{2})\b/
    ];
    for (const regex of distanceRegexes) {
      const match = searchAreaForDistanceAndDuration.match(regex);
      if (match && match[1]) {
        const parsedVal = parseFloat(match[1].replace(',', '.'));
        if (parsedVal > 0 && parsedVal < 150) {
          distance = parsedVal;
          break;
        }
      }
    }
  }

  // 3. Extract Duration (Time)
  const timeRegex = /\b(\d{1,2}):(\d{2}):(\d{2})\b/g; // hh:mm:ss
  const shortTimeRegex = /\b(\d{1,2}):(\d{2})\b/g;   // mm:ss
  
  const allTimes: { value: string; index: number; isThreeParts: boolean }[] = [];
  let match;
  timeRegex.lastIndex = 0;
  shortTimeRegex.lastIndex = 0;

  while ((match = timeRegex.exec(searchAreaForDistanceAndDuration)) !== null) {
    allTimes.push({ value: match[0], index: match.index, isThreeParts: true });
  }

  while ((match = shortTimeRegex.exec(searchAreaForDistanceAndDuration)) !== null) {
    const isPartOfLongTime = allTimes.some(t => 
      t.isThreeParts && 
      match!.index >= t.index && 
      (match!.index + match![0].length) <= (t.index + t.value.length)
    );
    if (!isPartOfLongTime) {
      allTimes.push({ value: match[0], index: match.index, isThreeParts: false });
    }
  }

  // Score duration candidates
  let bestDuration: string | null = null;
  let bestDurScore = -1;

  allTimes.forEach(t => {
    let score = 0;
    const index = t.index;
    
    // Check surrounding text
    const contextStart = Math.max(0, index - 50);
    const contextEnd = Math.min(searchAreaForDistanceAndDuration.length, index + t.value.length + 50);
    const contextText = searchAreaForDistanceAndDuration.slice(contextStart, contextEnd).toLowerCase();

    // 1. Duration keywords in context
    timeKeywords.forEach(keyword => {
      if (contextText.includes(keyword)) {
        score += 100;
      }
    });

    // 2. 3-part time is highly likely duration
    if (t.isThreeParts) {
      score += 40;
    }

    // 3. Penalize clock times (only 2-part times at the very beginning of the image)
    if (!t.isThreeParts && index < 35 && !contextText.includes('dauer') && !contextText.includes('trainingszeit')) {
      score -= 100;
    }
    // 3b. Penalize pause durations
    if (contextText.includes('pause') || contextText.includes('unterbrechung') || contextText.includes('pausenzeit')) {
      score -= 120;
    }
    // Penalize if it looks like start range
    if (contextText.includes(t.value + '–') || contextText.includes('–' + t.value) || contextText.includes(t.value + '-')) {
      score -= 60;
    }

    if (score > bestDurScore) {
      bestDurScore = score;
      bestDuration = t.value;
    }
  });

  if (bestDuration) {
    duration = bestDuration;
  } else if (allTimes.length > 0) {
    // Fallback: longest time
    const secondsValues = allTimes.map(c => ({ str: c.value, secs: durationToSeconds(c.value) }));
    secondsValues.sort((a, b) => b.secs - a.secs);
    duration = secondsValues[0].str;
  }

  // 4. Extract Pace (Pace can be anywhere in the text)
  const applePaceRegex = /(\d{1,2})['`‘](\d{2})"/g;
  const applePaceRegexSimple = /(\d{1,2})['`‘](\d{2})\b/g;
  
  let paceCandidates: { value: string; index: number }[] = [];
  let paceMatch;

  applePaceRegex.lastIndex = 0;
  while ((paceMatch = applePaceRegex.exec(cleanedText)) !== null) {
    paceCandidates.push({ value: `${paceMatch[1]}:${paceMatch[2]}`, index: paceMatch.index });
  }

  if (paceCandidates.length === 0) {
    applePaceRegexSimple.lastIndex = 0;
    while ((paceMatch = applePaceRegexSimple.exec(cleanedText)) !== null) {
      paceCandidates.push({ value: `${paceMatch[1]}:${paceMatch[2]}`, index: paceMatch.index });
    }
  }

  // Also check standard times followed by min/km or /km as pace candidates
  const standardPaceRegex = /\b(\d{1,2}):(\d{2})\s*(?:\/km|min\/km|pace|tempo)/gi;
  standardPaceRegex.lastIndex = 0;
  while ((paceMatch = standardPaceRegex.exec(cleanedText)) !== null) {
    paceCandidates.push({ value: `${paceMatch[1]}:${paceMatch[2]}`, index: paceMatch.index });
  }

  // Score pace candidates
  let bestPace: string | null = null;
  let bestPaceScore = -1;

  paceCandidates.forEach(p => {
    let score = 0;
    const index = p.index;
    const contextStart = Math.max(0, index - 50);
    const contextEnd = Math.min(cleanedText.length, index + 15 + 50);
    const contextText = cleanedText.slice(contextStart, contextEnd).toLowerCase();

    // 1. Pace keywords in context
    paceKeywords.forEach(keyword => {
      if (contextText.includes(keyword)) {
        score += 120;
      }
    });

    // 2. Unit suffix matching
    if (contextText.includes('/km') || contextText.includes('min/km') || contextText.includes('/ km') || contextText.includes('min / km')) {
      score += 150;
    }

    if (score > bestPaceScore) {
      bestPaceScore = score;
      bestPace = p.value;
    }
  });

  if (bestPace && bestPaceScore > 40) {
    pace = bestPace;
  }

  // 5. Confidence checks & reciprocal calculation fallbacks
  // We check which values are found and are highly confident.
  // If we are unconfident about one value, we re-calculate it from the other two!
  const isDistConfident = distance !== null && bestScore >= 60;
  const isDurConfident = duration !== null && bestDurScore >= 40;
  const isPaceConfident = pace !== null && bestPaceScore >= 40;

  if (isDistConfident && isDurConfident && !isPaceConfident) {
    // Distance and duration are reliable, pace is unconfident/missing. Compute it!
    const durSecs = durationToSeconds(duration!);
    if (durSecs > 0 && distance! > 0) {
      pace = secondsToPace(durSecs / distance!);
    }
  } else if (isDistConfident && isPaceConfident && !isDurConfident) {
    // Distance and pace are reliable, duration is unconfident/missing. Compute it!
    const paceSecs = paceToSeconds(pace!);
    if (paceSecs > 0 && distance! > 0) {
      duration = secondsToDuration(distance! * paceSecs);
    }
  } else if (isDurConfident && isPaceConfident && !isDistConfident) {
    // Duration and pace are reliable, distance is unconfident/missing. Compute it!
    const durSecs = durationToSeconds(duration!);
    const paceSecs = paceToSeconds(pace!);
    if (paceSecs > 0 && durSecs > 0) {
      distance = Math.round((durSecs / paceSecs) * 100) / 100;
    }
  } else {
    // Standard mathematical recovery if values are missing but others are present
    const hasDist = distance !== null && distance > 0;
    const hasDur = duration !== null && durationToSeconds(duration) > 0;
    const hasPace = pace !== null && paceToSeconds(pace) > 0;

    if (hasDist && hasDur && !hasPace) {
      const durSecs = durationToSeconds(duration!);
      pace = secondsToPace(durSecs / distance!);
    } else if (hasDist && !hasDur && hasPace) {
      const paceSecs = paceToSeconds(pace!);
      duration = secondsToDuration(distance! * paceSecs);
    } else if (!hasDist && hasDur && hasPace) {
      const durSecs = durationToSeconds(duration!);
      const paceSecs = paceToSeconds(pace!);
      distance = Math.round((durSecs / paceSecs) * 100) / 100;
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

/**
 * Calculates running challenge distance multiplier based on pace.
 * Baseline: 7:00 or slower = 1.0x
 * Max cap: 4:00 or faster = 1.6x
 * Increment: +0.05 for every 15 seconds faster than 7:00
 */
export function calculateMultiplier(paceStr: string): number {
  if (!paceStr || !paceStr.includes(':')) return 1.0;
  
  const paceSecs = paceToSeconds(paceStr);
  if (paceSecs <= 0) return 1.0;

  const baseline = 7 * 60; // 7:00 pace = 420 seconds
  const maxCap = 4 * 60;   // 4:00 pace = 240 seconds

  if (paceSecs >= baseline) return 1.0;
  if (paceSecs <= maxCap) return 1.6;

  const secondsFaster = baseline - paceSecs;
  // +0.05 for every 15 seconds faster
  const mult = 1.0 + (secondsFaster / 15) * 0.05;
  return Math.round(mult * 100) / 100;
}
