export interface Run {
  id: string;
  runnerName: string;
  date: string; // YYYY-MM-DD
  distance: number; // in km (e.g. 5.42)
  duration: string; // mm:ss or hh:mm:ss
  pace: string; // mm:ss
  sourceApp: string; // Apple Fitness, Adidas Running, Strava, Garmin, Manuell, etc.
  timestamp: number;
}

export interface RunnerStats {
  runnerName: string;
  totalRuns: number;
  totalDistance: number;
  totalDurationSeconds: number;
  averagePace: string; // mm:ss
}

export interface OcrResult {
  distance: number | null;
  duration: string | null;
  pace: string | null;
  sourceApp: string;
  rawText: string;
}
