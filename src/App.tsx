import React, { useState, useEffect, useRef } from 'react';
import { 
  Trophy, 
  Upload, 
  FileSpreadsheet, 
  Plus, 
  Trash2, 
  Activity, 
  Sparkles, 
  Info,
  Check,
  X,
  PlusCircle,
  Edit2,
  Database,
  Lock,
  ShieldCheck,
  FileUp
} from 'lucide-react';
import Tesseract from 'tesseract.js';
import confetti from 'canvas-confetti';
import * as XLSX from 'xlsx';

import type { Run, RunnerStats, OcrResult } from './types';
import { parseOcrText, durationToSeconds, secondsToDuration, secondsToPace } from './utils/ocrParser';
import { exportToExcel } from './utils/excelExporter';

// Formats date to YYYY-MM-DD
const getTodayString = () => new Date().toISOString().split('T')[0];



export default function App() {
  // State
  const [runs, setRuns] = useState<Run[]>([]);
  const [runners, setRunners] = useState<string[]>(['Julian', 'Cedde', 'Tim', 'Joni', 'Malte']);
  const [showNewRunnerInput, setShowNewRunnerInput] = useState(false);
  const [newRunnerName, setNewRunnerName] = useState('');

  // Manual Form State
  const [selectedRunner, setSelectedRunner] = useState('Julian');
  const [manualDate, setManualDate] = useState(getTodayString());
  const [manualDistance, setManualDistance] = useState('');
  const [manualDuration, setManualDuration] = useState('');
  const [manualPace, setManualPace] = useState('');
  const [manualSourceApp, setManualSourceApp] = useState('Manuell');
  const [editingRunId, setEditingRunId] = useState<string | null>(null);

  // OCR/Upload States
  const [dragging, setDragging] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [ocrImage, setOcrImage] = useState<string | null>(null);

  // OCR Form Confirm State
  const [confirmRunner, setConfirmRunner] = useState('Julian');
  const [confirmDate, setConfirmDate] = useState(getTodayString());
  const [confirmDistance, setConfirmDistance] = useState('');
  const [confirmDuration, setConfirmDuration] = useState('');
  const [confirmPace, setConfirmPace] = useState('');
  const [confirmSourceApp, setConfirmSourceApp] = useState('Apple Fitness');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    const targetRunners = ['Julian', 'Cedde', 'Tim', 'Joni', 'Malte'];
    const savedRuns = localStorage.getItem('running_group_runs');
    
    // Force reset runners list to the new defaults
    localStorage.setItem('running_group_runners', JSON.stringify(targetRunners));
    setRunners(targetRunners);

    if (savedRuns) {
      const parsedRuns = JSON.parse(savedRuns);
      // Clear out the historical mock runs if they are still in localStorage
      const hasMockRuns = parsedRuns.some((r: any) => r.id && r.id.startsWith('mock-'));
      if (hasMockRuns) {
        setRuns([]);
        localStorage.setItem('running_group_runs', JSON.stringify([]));
      } else {
        setRuns(parsedRuns);
      }
    } else {
      setRuns([]);
      localStorage.setItem('running_group_runs', JSON.stringify([]));
    }
  }, []);

  // Save to local storage whenever runs change
  const saveRunsToLocalStorage = (updatedRuns: Run[]) => {
    setRuns(updatedRuns);
    localStorage.setItem('running_group_runs', JSON.stringify(updatedRuns));
    
    // Dynamically compile runner names to keep lists synced
    const uniqueRunners = Array.from(new Set([...runners, ...updatedRuns.map(r => r.runnerName)]));
    setRunners(uniqueRunners);
    localStorage.setItem('running_group_runners', JSON.stringify(uniqueRunners));
  };

  // Sync runner lists when runners list updates
  const handleAddNewRunner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRunnerName.trim()) return;
    
    const formattedName = newRunnerName.trim();
    if (!runners.includes(formattedName)) {
      const updatedRunners = [...runners, formattedName];
      setRunners(updatedRunners);
      localStorage.setItem('running_group_runners', JSON.stringify(updatedRunners));
      
      setSelectedRunner(formattedName);
      setConfirmRunner(formattedName);
      
      // Celebrate
      confetti({ particleCount: 30, spread: 40, origin: { y: 0.8 } });
    }
    setNewRunnerName('');
    setShowNewRunnerInput(false);
  };

  // Process OCR results
  const handleOcrFile = (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('Bitte lade eine gültige Bilddatei hoch.');
      return;
    }

    // Set image preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setOcrImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    setOcrLoading(true);
    setOcrProgress(0);

    // Call Tesseract.js OCR
    Tesseract.recognize(
      file,
      'deu+eng',
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
          }
        }
      }
    )
      .then(({ data: { text } }) => {
        const parsed = parseOcrText(text);
        setOcrResult(parsed);

        // Pre-fill confirmation form
        setConfirmDistance(parsed.distance ? parsed.distance.toString() : '');
        setConfirmDuration(parsed.duration || '');
        setConfirmPace(parsed.pace || '');
        setConfirmSourceApp(parsed.sourceApp !== 'Unbekannt' ? parsed.sourceApp : 'Apple Fitness');
        setConfirmDate(parsed.date || getTodayString());
        
        // Auto-match runner name from context if possible
        if (runners.length > 0) {
          setConfirmRunner(runners[0]);
        }
      })
      .catch((err) => {
        console.error('OCR Fehler:', err);
        alert('Fehler bei der Texterkennung. Das Bild konnte nicht ausgelesen werden.');
      })
      .finally(() => {
        setOcrLoading(false);
      });
  };

  // File Upload Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleOcrFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleOcrFile(e.target.files[0]);
    }
  };

  // Auto-calculate pace in forms when duration and distance change
  const autoCalculatePace = (distStr: string, durStr: string, setPaceFn: (val: string) => void) => {
    const dist = parseFloat(distStr.replace(',', '.'));
    const secs = durationToSeconds(durStr);
    if (dist > 0 && secs > 0) {
      const paceSecs = secs / dist;
      setPaceFn(secondsToPace(paceSecs));
    }
  };

  // Add run handler (confirm OCR)
  const handleSaveOcrRun = (e: React.FormEvent) => {
    e.preventDefault();
    const distanceVal = parseFloat(confirmDistance.replace(',', '.'));
    if (isNaN(distanceVal) || distanceVal <= 0) {
      alert('Bitte eine gültige Distanz in km eingeben.');
      return;
    }
    if (!confirmDuration || !confirmPace) {
      alert('Bitte Dauer und Pace im Format mm:ss oder hh:mm:ss eingeben.');
      return;
    }

    const newRun: Run = {
      id: 'run-' + Date.now(),
      runnerName: confirmRunner,
      date: confirmDate,
      distance: distanceVal,
      duration: confirmDuration,
      pace: confirmPace,
      sourceApp: confirmSourceApp,
      timestamp: Date.parse(confirmDate)
    };

    saveRunsToLocalStorage([newRun, ...runs]);
    
    // Clear OCR state
    setOcrResult(null);
    setOcrImage(null);

    // Celebrate
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  };

  // Add run handler (manual form)
  const handleSaveManualRun = (e: React.FormEvent) => {
    e.preventDefault();
    const distanceVal = parseFloat(manualDistance.replace(',', '.'));
    if (isNaN(distanceVal) || distanceVal <= 0) {
      alert('Bitte eine gültige Distanz in km eingeben.');
      return;
    }
    if (!manualDuration || !manualPace) {
      alert('Bitte Dauer und Pace eingeben.');
      return;
    }

    if (editingRunId) {
      // Update existing run
      const updatedRuns = runs.map(run => {
        if (run.id === editingRunId) {
          return {
            ...run,
            runnerName: selectedRunner,
            date: manualDate,
            distance: distanceVal,
            duration: manualDuration,
            pace: manualPace,
            sourceApp: manualSourceApp,
            timestamp: Date.parse(manualDate)
          };
        }
        return run;
      });
      saveRunsToLocalStorage(updatedRuns);
      setEditingRunId(null);
    } else {
      // Create new run
      const newRun: Run = {
        id: 'run-' + Date.now(),
        runnerName: selectedRunner,
        date: manualDate,
        distance: distanceVal,
        duration: manualDuration,
        pace: manualPace,
        sourceApp: manualSourceApp,
        timestamp: Date.parse(manualDate)
      };
      saveRunsToLocalStorage([newRun, ...runs]);
    }

    // Reset Form
    setManualDistance('');
    setManualDuration('');
    setManualPace('');
    
    // Celebrate
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
  };

  const handleEditClick = (run: Run) => {
    setEditingRunId(run.id);
    setSelectedRunner(run.runnerName);
    setManualDate(run.date);
    setManualDistance(run.distance.toString());
    setManualDuration(run.duration);
    setManualPace(run.pace);
    setManualSourceApp(run.sourceApp);

    const formCard = document.getElementById('manual-form-card');
    if (formCard) {
      formCard.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCancelEdit = () => {
    setEditingRunId(null);
    setManualDistance('');
    setManualDuration('');
    setManualPace('');
  };

  // Delete run handler
  const handleDeleteRun = (id: string) => {
    if (window.confirm('Möchtest du diesen Lauf wirklich löschen?')) {
      const updatedRuns = runs.filter(run => run.id !== id);
      saveRunsToLocalStorage(updatedRuns);
    }
  };

  const handleAdminToggle = () => {
    if (isAdmin) {
      setIsAdmin(false);
      alert('Admin-Modus beenden.');
    } else {
      const pw = prompt('Bitte Admin-Passwort eingeben (Standard: laufchallenge):');
      if (pw === 'laufchallenge') {
        setIsAdmin(true);
        confetti({ particleCount: 30, spread: 40 });
      } else if (pw !== null) {
        alert('Falsches Passwort!');
      }
    }
  };

  const handleExcelImport = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        let headerRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (row && row.some(cell => typeof cell === 'string' && (cell.toLowerCase().includes('datum') || cell.toLowerCase().includes('läufer')))) {
            headerRowIndex = i;
            break;
          }
        }
        
        if (headerRowIndex === -1) {
          alert('Ungültiges Excel-Format. Die Spalten "Datum" und "Läufer" wurden nicht gefunden.');
          return;
        }
        
        const headers = rows[headerRowIndex].map(h => String(h || '').trim().toLowerCase());
        const dateIdx = headers.indexOf('datum');
        const runnerIdx = headers.indexOf('läufer');
        const distIdx = headers.indexOf('distanz') !== -1 ? headers.indexOf('distanz') : headers.findIndex(h => h.includes('km') || h.includes('strecke'));
        const durIdx = headers.indexOf('dauer') !== -1 ? headers.indexOf('dauer') : headers.findIndex(h => h.includes('zeit'));
        const paceIdx = headers.indexOf('pace') !== -1 ? headers.indexOf('pace') : headers.findIndex(h => h.includes('tempo'));
        const sourceIdx = headers.indexOf('quelle / app') !== -1 ? headers.indexOf('quelle / app') : headers.indexOf('quelle');
        
        if (dateIdx === -1 || runnerIdx === -1) {
          alert('Spalten für Datum oder Läufer konnten nicht identifiziert werden.');
          return;
        }
        
        const newRuns: Run[] = [];
        const newRunnersList = [...runners];
        
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;
          
          // Skip summary / total row
          const firstCell = String(row[0] || '').toLowerCase();
          if (firstCell.includes('gesamt') || firstCell.includes('schnitt') || firstCell.trim() === '') continue;
          
          // Parse date (Excel date serial number or string)
          let dateVal = row[dateIdx];
          if (typeof dateVal === 'number') {
            const dateObj = XLSX.SSF.parse_date_code(dateVal);
            dateVal = `${dateObj.y}-${dateObj.m.toString().padStart(2, '0')}-${dateObj.d.toString().padStart(2, '0')}`;
          } else if (typeof dateVal === 'string') {
            const parts = dateVal.trim().split('.');
            if (parts.length === 3) {
              dateVal = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
          
          const runnerVal = String(row[runnerIdx] || '').trim();
          if (!runnerVal || !dateVal) continue;
          
          // Parse distance
          let distVal = row[distIdx];
          if (typeof distVal === 'string') {
            distVal = parseFloat(distVal.replace(/[^\d\.,]/g, '').replace(',', '.'));
          }
          distVal = Number(distVal);
          if (isNaN(distVal) || distVal <= 0) continue;
          
          // Parse duration & pace
          const durVal = String(row[durIdx] || '').trim();
          let paceVal = String(row[paceIdx] || '').trim().replace(' min/km', '');
          
          if ((!paceVal || paceVal === 'undefined') && durVal) {
            const durSecs = durationToSeconds(durVal);
            if (durSecs > 0 && distVal > 0) {
              paceVal = secondsToPace(durSecs / distVal);
            }
          }
          
          const sourceAppVal = sourceIdx !== -1 ? String(row[sourceIdx] || 'Excel Import').trim() : 'Excel Import';
          
          newRuns.push({
            id: 'run-excel-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            runnerName: runnerVal,
            date: String(dateVal),
            distance: distVal,
            duration: durVal,
            pace: paceVal || '5:00',
            sourceApp: sourceAppVal,
            timestamp: Date.parse(String(dateVal))
          });
          
          if (!newRunnersList.includes(runnerVal)) {
            newRunnersList.push(runnerVal);
          }
        }
        
        if (newRuns.length === 0) {
          alert('Keine gültigen Läufe zum Importieren gefunden.');
          return;
        }
        
        const mergedRuns = [...newRuns, ...runs];
        saveRunsToLocalStorage(mergedRuns);
        
        // Sync runners list
        setRunners(newRunnersList);
        localStorage.setItem('running_group_runners', JSON.stringify(newRunnersList));
        
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        alert(`${newRuns.length} Läufe erfolgreich aus der Excel-Tabelle importiert!`);
      } catch (err) {
        console.error('Excel Import Fehler:', err);
        alert('Fehler beim Lesen der Excel-Datei. Stellen Sie sicher, dass es sich um eine gültige Datei handelt.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Calculations
  const totalGroupRuns = runs.length;
  
  const totalGroupDistance = runs.reduce((sum, r) => sum + r.distance, 0);
  
  const totalGroupDurationSecs = runs.reduce((sum, r) => sum + durationToSeconds(r.duration), 0);
  
  const averageGroupPace = totalGroupDistance > 0 
    ? secondsToPace(totalGroupDurationSecs / totalGroupDistance)
    : '0:00';

  // Calculate stats per runner for Leaderboard
  const statsPerRunner: RunnerStats[] = runners.map(name => {
    const runnerRuns = runs.filter(r => r.runnerName.toLowerCase() === name.toLowerCase());
    const totalDist = runnerRuns.reduce((sum, r) => sum + r.distance, 0);
    const totalSecs = runnerRuns.reduce((sum, r) => sum + durationToSeconds(r.duration), 0);
    const avgPace = totalDist > 0 ? secondsToPace(totalSecs / totalDist) : '0:00';
    
    return {
      runnerName: name,
      totalRuns: runnerRuns.length,
      totalDistance: Math.round(totalDist * 100) / 100,
      totalDurationSeconds: totalSecs,
      averagePace: avgPace
    };
  }).filter(r => r.totalRuns > 0); // Only show active runners in leaderboard

  // Sort Leaderboard by total distance descending
  const sortedLeaderboard = [...statsPerRunner].sort((a, b) => b.totalDistance - a.totalDistance);

  // Trigger Excel Export
  const handleExport = () => {
    exportToExcel(runs, statsPerRunner);
    confetti({ particleCount: 40, angle: 60, spread: 55, origin: { x: 0 } });
    confetti({ particleCount: 40, angle: 120, spread: 55, origin: { x: 1 } });
  };

  const getSourceClass = (source: string) => {
    switch (source) {
      case 'Apple Fitness': return 'source-pill source-apple';
      case 'Adidas Running': return 'source-pill source-adidas';
      case 'Strava': return 'source-pill source-strava';
      case 'Garmin': return 'source-pill source-garmin';
      default: return 'source-pill source-manual';
    }
  };

  return (
    <div className="container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-group">
          <Trophy className="logo-icon" size={36} />
          <div>
            <h1>Laufgruppe Dashboard</h1>
            <p className="subtitle">Verwalte die Läufe deiner Gruppe &amp; exportiere sie als Excel-Tabelle</p>
          </div>
        </div>
        
        <div className="header-actions" style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            className="btn btn-primary" 
            onClick={handleExport}
            disabled={runs.length === 0}
            style={{ 
              opacity: runs.length === 0 ? 0.5 : 1, 
              cursor: runs.length === 0 ? 'not-allowed' : 'pointer' 
            }}
          >
            <FileSpreadsheet size={18} />
            Excel Tabelle exportieren
          </button>

          <button 
            className="btn btn-secondary" 
            onClick={handleAdminToggle}
            style={{ 
              border: isAdmin ? '1px solid var(--accent-cyan)' : '1px solid var(--border-light)',
              color: isAdmin ? 'var(--accent-cyan)' : 'var(--text-primary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {isAdmin ? <ShieldCheck size={18} /> : <Lock size={18} />}
            {isAdmin ? 'Admin aktiv' : 'Admin-Bereich'}
          </button>
        </div>
      </header>

      {/* Info Alert Box */}
      <div className="alert-box">
        <Info className="alert-icon" size={20} />
        <div>
          <strong>Tipp zum Foto-Import:</strong> Mache einfach einen Screenshot vom Laufabschluss in deiner Fitness-App (z. B. Apple Fitness, Adidas Running, Strava) und ziehe das Bild unten in das Upload-Feld. Die App liest Distanz, Pace und Zeit automatisch aus!
        </div>
      </div>

      {/* Quick Stats Grid */}
      <section className="quick-stats">
        <div className="stat-box">
          <div className="stat-label">Gesamte Läufe</div>
          <div className="stat-value">{totalGroupRuns}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Gesamtstrecke</div>
          <div className="stat-value">{totalGroupDistance.toFixed(2)} km</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Gesamtdauer</div>
          <div className="stat-value">{secondsToDuration(totalGroupDurationSecs)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Gruppen-Durchschnittspace</div>
          <div className="stat-value">{averageGroupPace} min/km</div>
        </div>
      </section>

      {/* Main Grid */}
      <main className="dashboard-grid">
        {/* Left Side: Leaderboard & Runs Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Leaderboard Card */}
          <div className="card">
            <h2 className="card-title">
              <Trophy size={20} className="text-yellow-500" style={{ color: 'var(--accent-gold)' }} />
              Bestenliste (Leaderboard)
            </h2>
            
            {sortedLeaderboard.length === 0 ? (
              <div className="empty-state">
                <p>Noch keine Läufer in der Bestenliste. Füge einen Lauf hinzu!</p>
              </div>
            ) : (
              <div className="leaderboard-list">
                {sortedLeaderboard.map((runner, index) => (
                  <div key={runner.runnerName} className="leaderboard-item">
                    <div className="runner-profile">
                      <div className={`rank-badge rank-${index + 1}`}>
                        {index + 1}
                      </div>
                      <div>
                        <div className="runner-name">{runner.runnerName}</div>
                        <div className="runner-substats">
                          {runner.totalRuns} {runner.totalRuns === 1 ? 'Lauf' : 'Läufe'} • Gesamtzeit: {secondsToDuration(runner.totalDurationSeconds)}
                        </div>
                      </div>
                    </div>
                    <div className="runner-distance-block">
                      <div className="runner-distance">{runner.totalDistance.toFixed(2)} km</div>
                      <div className="runner-pace">Ø Pace: {runner.averagePace} min/km</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Log (Runs Table) */}
          <div className="card">
            <h2 className="card-title">
              <Activity size={20} style={{ color: 'var(--accent-cyan)' }} />
              Aktivitätsprotokoll
            </h2>
            
            {runs.length === 0 ? (
              <div className="empty-state">
                <p>Keine Läufe im Protokoll vorhanden. Starte mit einem Foto-Import oder manuellen Eintrag.</p>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Läufer</th>
                      <th>Distanz</th>
                      <th>Dauer</th>
                      <th>Pace</th>
                      <th>Quelle</th>
                      <th style={{ textAlign: 'right' }}>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id}>
                        <td>{new Date(run.date).toLocaleDateString('de-DE')}</td>
                        <td style={{ fontWeight: 600 }}>{run.runnerName}</td>
                        <td style={{ color: 'var(--accent-neon)', fontWeight: 700 }}>{run.distance.toFixed(2)} km</td>
                        <td>{run.duration}</td>
                        <td>{run.pace} min/km</td>
                        <td>
                          <span className={getSourceClass(run.sourceApp)}>
                            {run.sourceApp}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="action-cell">
                            <button 
                              className="btn-secondary" 
                              title="Lauf bearbeiten" 
                              onClick={() => handleEditClick(run)}
                              style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--accent-cyan)', transition: 'var(--transition)' }}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              className="btn-icon-danger" 
                              title="Lauf löschen" 
                              onClick={() => handleDeleteRun(run.id)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Photo Import & Manual Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* OCR Upload Card */}
          <div className="card">
            <h2 className="card-title">
              <Upload size={20} style={{ color: 'var(--accent-neon)' }} />
              Lauf per Foto importieren (OCR)
            </h2>

            {/* OCR Loading View */}
            {ocrLoading && (
              <div className="ocr-loading">
                <div className="spinner"></div>
                <div className="loading-text">Lese Text aus Bild... ({ocrProgress}%)</div>
              </div>
            )}

            {/* OCR Success Edit/Confirm View */}
            {!ocrLoading && ocrResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="source-pill source-garmin" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Sparkles size={12} /> Auto-Erkennung aktiv
                  </span>
                  <button 
                    className="btn-icon-danger" 
                    onClick={() => { setOcrResult(null); setOcrImage(null); }}
                    style={{ background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '50%' }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="ocr-preview-layout">
                  {ocrImage && (
                    <img src={ocrImage} alt="Lauf Screenshot" className="screenshot-preview" />
                  )}
                  
                  <form onSubmit={handleSaveOcrRun} className="form-grid">
                    {/* Runner Dropdown */}
                    <div className="form-group">
                      <label>Läufer</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <select 
                          value={confirmRunner} 
                          onChange={(e) => setConfirmRunner(e.target.value)}
                          style={{ flex: 1 }}
                        >
                          {runners.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button 
                          type="button" 
                          className="btn btn-secondary" 
                          style={{ padding: '0.5rem' }}
                          onClick={() => setShowNewRunnerInput(true)}
                          title="Neuen Läufer anlegen"
                        >
                          <PlusCircle size={20} />
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Datum des Laufs</label>
                      <input 
                        type="date" 
                        value={confirmDate} 
                        onChange={(e) => setConfirmDate(e.target.value)} 
                        required 
                      />
                    </div>

                    <div className="form-group">
                      <label>Distanz (km)</label>
                      <input 
                        type="text" 
                        placeholder="z.B. 10.25"
                        value={confirmDistance} 
                        onChange={(e) => {
                          setConfirmDistance(e.target.value);
                          autoCalculatePace(e.target.value, confirmDuration, setConfirmPace);
                        }} 
                        required 
                      />
                    </div>

                    <div className="form-group">
                      <label>Dauer (mm:ss oder hh:mm:ss)</label>
                      <input 
                        type="text" 
                        placeholder="z.B. 52:15"
                        value={confirmDuration} 
                        onChange={(e) => {
                          setConfirmDuration(e.target.value);
                          autoCalculatePace(confirmDistance, e.target.value, setConfirmPace);
                        }} 
                        required 
                      />
                    </div>

                    <div className="form-group">
                      <label>Pace (min/km)</label>
                      <input 
                        type="text" 
                        placeholder="z.B. 5:05"
                        value={confirmPace} 
                        onChange={(e) => setConfirmPace(e.target.value)} 
                        required 
                      />
                    </div>

                    <div className="form-group">
                      <label>Quelle (Erkannte App)</label>
                      <select 
                        value={confirmSourceApp} 
                        onChange={(e) => setConfirmSourceApp(e.target.value)}
                      >
                        <option value="Apple Fitness">Apple Fitness</option>
                        <option value="Adidas Running">Adidas Running</option>
                        <option value="Strava">Strava</option>
                        <option value="Garmin">Garmin</option>
                        <option value="Manuell">Manuell</option>
                      </select>
                    </div>

                    <div className="btn-group">
                      <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                        <Check size={16} /> Speichern
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        onClick={() => { setOcrResult(null); setOcrImage(null); }}
                      >
                        Abbrechen
                      </button>
                    </div>
                  </form>
                </div>

                <div>
                  <label>Erkannter Rohtext (Debug)</label>
                  <div className="raw-text-debug">{ocrResult.rawText}</div>
                </div>
              </div>
            )}

            {/* Upload Zone Drop Area */}
            {!ocrLoading && !ocrResult && (
              <div 
                className={`upload-zone ${dragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  accept="image/*"
                  onChange={handleFileInputChange}
                />
                <Upload className="upload-icon" size={40} />
                <div className="upload-text">
                  Zieh einen <strong>Screenshot hierher</strong> oder klicke zum Auswählen
                </div>
                <div className="upload-subtext">
                  Unterstützt Adidas Running, Apple Fitness, Strava &amp; Garmin Screenshots
                </div>
              </div>
            )}
          </div>

          {/* New Runner Input Overlay/Section */}
          {showNewRunnerInput && (
            <div className="card" style={{ border: '1px solid var(--accent-cyan)' }}>
              <h3 className="card-title">Neuen Läufer anlegen</h3>
              <form onSubmit={handleAddNewRunner} className="form-grid">
                <div className="form-group">
                  <label>Name des Läufers</label>
                  <input 
                    type="text" 
                    placeholder="z.B. Tom"
                    value={newRunnerName} 
                    onChange={(e) => setNewRunnerName(e.target.value)} 
                    required 
                    autoFocus
                  />
                </div>
                <div className="btn-group">
                  <button type="submit" className="btn btn-accent">
                    Erstellen
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setShowNewRunnerInput(false)}
                  >
                    Abbrechen
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Manual Input Card */}
          <div className="card" id="manual-form-card">
            <h2 className="card-title">
              {editingRunId ? (
                <>
                  <Edit2 size={20} style={{ color: 'var(--accent-cyan)' }} />
                  Lauf bearbeiten
                </>
              ) : (
                <>
                  <Plus size={20} style={{ color: 'var(--accent-cyan)' }} />
                  Lauf manuell eintragen
                </>
              )}
            </h2>

            <form onSubmit={handleSaveManualRun} className="form-grid">
              <div className="form-group">
                <label>Läufer</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select 
                    value={selectedRunner} 
                    onChange={(e) => setSelectedRunner(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    {runners.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ padding: '0.5rem' }}
                    onClick={() => setShowNewRunnerInput(true)}
                    title="Neuen Läufer anlegen"
                  >
                    <PlusCircle size={20} />
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Datum</label>
                <input 
                  type="date" 
                  value={manualDate} 
                  onChange={(e) => setManualDate(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Distanz (km)</label>
                <input 
                  type="text" 
                  placeholder="z.B. 8.5"
                  value={manualDistance} 
                  onChange={(e) => {
                    setManualDistance(e.target.value);
                    autoCalculatePace(e.target.value, manualDuration, setManualPace);
                  }} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Dauer (mm:ss oder hh:mm:ss)</label>
                <input 
                  type="text" 
                  placeholder="z.B. 45:15"
                  value={manualDuration} 
                  onChange={(e) => {
                    setManualDuration(e.target.value);
                    autoCalculatePace(manualDistance, e.target.value, setManualPace);
                  }} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Pace (min/km)</label>
                <input 
                  type="text" 
                  placeholder="z.B. 5:19"
                  value={manualPace} 
                  onChange={(e) => setManualPace(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Quelle (App / Tracker)</label>
                <select 
                  value={manualSourceApp} 
                  onChange={(e) => setManualSourceApp(e.target.value)}
                >
                  <option value="Manuell">Manuell</option>
                  <option value="Apple Fitness">Apple Fitness</option>
                  <option value="Adidas Running">Adidas Running</option>
                  <option value="Strava">Strava</option>
                  <option value="Garmin">Garmin</option>
                </select>
              </div>

              {editingRunId ? (
                <div className="btn-group" style={{ marginTop: '0.5rem', width: '100%' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    Änderungen speichern
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} style={{ flex: 1 }}>
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button type="submit" className="btn btn-secondary" style={{ marginTop: '0.5rem', width: '100%' }}>
                  Lauf speichern
                </button>
              )}
            </form>
          </div>

          {/* Admin Panel (Visible ONLY if isAdmin is true) */}
          {isAdmin && (
            <div className="card" style={{ border: '1px solid var(--accent-purple)' }}>
              <h2 className="card-title">
                <Lock size={20} style={{ color: 'var(--accent-purple)' }} />
                Admin Panel
              </h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* Excel Import Section */}
                <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-light)' }}>
                  <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileUp size={16} /> Excel-Tabelle importieren
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    Lade eine zuvor exportierte Excel-Datei hoch, um alle Läufe direkt in die App einzulesen.
                  </p>
                  
                  <input 
                    type="file" 
                    ref={excelInputRef} 
                    accept=".xlsx,.xls" 
                    style={{ display: 'none' }} 
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleExcelImport(e.target.files[0]);
                      }
                    }}
                  />
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ width: '100%' }}
                    onClick={() => excelInputRef.current?.click()}
                  >
                    Excel-Datei auswählen
                  </button>
                </div>

                {/* Backup & Restore Section */}
                <div>
                  <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Database size={16} /> Daten übertragen (Backup)
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    Da Ihre Daten lokal im Browser gespeichert werden, können Sie diese hier exportieren und auf einer anderen Domain (z.B. Ihrer Hauptdomain) importieren.
                  </p>
                  
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ width: '100%', marginBottom: '0.75rem' }}
                    onClick={() => {
                      const data = { runs, runners };
                      navigator.clipboard.writeText(JSON.stringify(data));
                      alert('Backup-Code wurde kopiert! Fügen Sie diesen Code auf Ihrer Hauptdomain ein.');
                    }}
                    disabled={runs.length === 0}
                  >
                    Backup-Code kopieren (Export)
                  </button>

                  <div className="form-group">
                    <label style={{ fontSize: '0.7rem' }}>Backup-Code einspielen (Import)</label>
                    <textarea 
                      placeholder="Füge den Code hier ein..."
                      id="backup-input"
                      style={{ 
                        width: '100%', 
                        height: '50px', 
                        background: 'rgba(0,0,0,0.25)', 
                        border: '1px solid var(--border-light)', 
                        borderRadius: '0.5rem',
                        color: 'var(--text-primary)',
                        padding: '0.5rem',
                        fontFamily: 'monospace',
                        fontSize: '0.7rem',
                        resize: 'none'
                      }}
                    />
                    <button 
                      type="button" 
                      className="btn btn-accent" 
                      style={{ marginTop: '0.5rem', width: '100%' }}
                      onClick={() => {
                        const textarea = document.getElementById('backup-input') as HTMLTextAreaElement;
                        if (!textarea || !textarea.value.trim()) {
                          alert('Bitte fügen Sie einen gültigen Backup-Code ein.');
                          return;
                        }
                        try {
                          const parsed = JSON.parse(textarea.value.trim());
                          if (parsed && Array.isArray(parsed.runs) && Array.isArray(parsed.runners)) {
                            if (window.confirm('Daten jetzt importieren? Vorhandene Läufe auf dieser Domain werden überschrieben.')) {
                              saveRunsToLocalStorage(parsed.runs);
                              setRunners(parsed.runners);
                              localStorage.setItem('running_group_runners', JSON.stringify(parsed.runners));
                              textarea.value = '';
                              confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                              alert('Daten erfolgreich übertragen!');
                            }
                          } else {
                            alert('Ungültiger Backup-Code. Bitte prüfen Sie den kopierten Text.');
                          }
                        } catch (e) {
                          alert('Fehler beim Einlesen. Bitte stellen Sie sicher, dass Sie den gesamten Code kopiert haben.');
                        }
                      }}
                    >
                      Daten einspielen
                    </button>
                  </div>
                </div>

                {/* Logout Button */}
                <button 
                  type="button" 
                  className="btn btn-danger" 
                  style={{ width: '100%', marginTop: '0.5rem' }}
                  onClick={() => setIsAdmin(false)}
                >
                  Admin-Modus beenden
                </button>
                
              </div>
            </div>
          )}
          
        </div>
      </main>
    </div>
  );
}
